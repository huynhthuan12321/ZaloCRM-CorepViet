# RC4 followup remediation — 7A

03/11/2026, Asia/Saigon. **COMPLETED_PENDING_INDEPENDENT_VERIFICATION** trong phạm vi local/disposable đã kiểm. Hai finding B7-RC4-01/B7-RC4-02 đã có RED→GREEN; đây là tự kiểm A, **không phải B PASS**. **VPS: NOT_READY / BLOCKED.** Không push/merge/deploy, không chạy deploy.sh, không provider/send/paid AI hoặc dữ liệu/session thật.

Artifact mới: [reports-rc4-followup-20261103-163013](../../artifacts/reports-rc4-followup-20261103-163013/). [Commands](../../artifacts/reports-rc4-followup-20261103-163013/commands.md). [Prompt 7B](../../artifacts/reports-rc4-followup-20261103-163013/next-independent-verification-prompt.md). [Risk assessment JSON](../../artifacts/reports-rc4-followup-20261103-163013/patch-risk-assessment.json): `hold_for_evidence`, validator exit0; chờ B và gate môi trường/phát hành, không cấp quyền merge.

## 1. Exact final để bàn giao

| Định danh | Giá trị |
|---|---|
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023` |
| Branch | `release/reports-20261103-1023` |
| Baseline RC4 final cũ | `41d5c1e64ada75abbad969554de8a72287a883ee` |
| Final mới | **`cf70b805eb88894fa2d68be1e44ac5c6bf73261c`** |
| Annotated tag mới | **`reports-rc4-followup-20261103-163013`** |
| Tag object | `227ae7af673f2fa129d53e618258034e5f060b44` |
| Final image mới | **`zalo-crm-rc:reports-rc4-followup-20261103-163013-final`** |
| Local image/index digest | `sha256:07f525e94a9607c748381d1129cbb9ba61e8328efc26a021b69df41f36eabb15` |
| Platform manifest | `sha256:ed261890f7b7a754945d6311135f017bebc1ea0ee3ff7023cadffde420b3a6c8` |
| Config digest | `sha256:24c273914dd5b25e3fb63b3bf47637e7e74e5a72d6a5e799b946a17ffa762b18` |
| Baseline→final patch SHA256 | `e6ab3512bedc02a45cadb13c9f448095afebb5f4fda66f4b6e3f80e436ae03ac` |

Lượt này có hai commit: `db61af5939b5e8d4b1e2a21f79fcca8a2f30b491` sửa hai finding; `cf70b805...` giữ thêm Redis URL family policy sau phản chứng mới. Image intermediate `reports-rc4-followup-20261103-163013` / index `3fe6ae4e...` được giữ, **không dùng thay final**. Annotated tag mới chỉ tạo sau các final checks.

Root vẫn HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, branch `fix/reports-kpi-3b`, dirty có sẵn. Candidate sạch trước sửa, sau mỗi commit và khi build final. Safe.directory từng lệnh/process-only, không đổi global Git config. Không active Git hook ở hooks path đã kiểm. Chỉ stage explicit paths đã review, không git add -A/reset/stash/checkout.

Tags/images cũ giữ nguyên: RC3 tag object `1b706547...`, commit `97c8640a...`, image `50e8dd55...`; RC4 đầu object `000ba697...`, commit `bbcd005...`, image `27574756...`; RC4 final cũ object `7b55d65b...`, commit `41d5c1e...`, image `1b42f0d1...`. Identity cuối ở `tag-identities-final.txt`, `images-final-after.txt`.

Đọc AGENTS được người dùng cung cấp, contract0/E-1/O-1/release, báo cáo RC3/RC4 A/B và helper liên quan. Không tạo agent; rà boundary/compatibility trước sửa và một vòng tự phản biện final diff. Skill `assess-patch-risk` dùng cho review diff/risk; không coi ordinary correctness finding là security exploit đã chứng minh. Các helper/tài liệu chỉ là evidence. Output đặt ở artifact/path người dùng yêu cầu; không ghi vào lịch sử A/B cũ.

## 2. B7-RC4-01 — OS-hosts readiness

**RED mới trên baseline exact image:** PG16/Redis A tổng hợp trên internal network, --add-host alias chỉ trong OS hosts. OS lookup và normal PG SELECT1/Redis PING đều thành công, nhưng dedicated probes false và readiness503. `red-hosts-compat.log`, exit1. Positive control giữ nguyên; không đổi kỳ vọng để làm xanh.

**Root cause:** c-ares resolve4/resolve6 bỏ qua OS hosts/NSS, special-case localhost còn ép IPv4 và chỉ lấy một địa chỉ. Chuyển toàn bộ việc lookup sang dns.lookup trong process ứng dụng sẽ khôi phục semantics nhưng lại để getaddrinfo không cancellable trong libuv pool — không dùng cách đó.

**Sửa:**

- `backend/src/shared/http/probe-host.ts:17`: lookup OS trong subprocess Node riêng bằng `process.execPath`, không shell, windowsHide; chỉ truyền hostname/result-order, không dependency URL/auth/provider env. Literal IPv4/IPv6 đi thẳng, không subprocess; localhost nhận OS address list, không hardcode IPv4.
- `probe-host.ts:23,39`: abort/deadline lookup1000ms kill child, promise chỉ settle sau child `close`; clear timer/listener và validate bounded output. Không chỉ race rồi bỏ mặc getaddrinfo. Với hai dependency single-flight, tối đa một lookup/probe đang chờ mỗi dependency trong một app process.
- `probe-host.ts:55`: static lookup callback cung cấp nhiều OS addresses cho Node TCP fallback; áp explicit family khi được chọn. Không resolve lần thứ hai trong app pool.
- `shared/database/readiness.ts:26`: dùng `Client.host` do parser PG thực sự chọn, gồm query `host=` và Unix socket branch; giữ URL/auth/SSL parser, original hostname cho TLS. PG socket connect nhận lookup list và auto family; socket URL không bị ép qua DNS.
- `shared/queue/redis-connection.ts:80–108`: disposable Connector nhận OS address list, original REDIS_URL/auth/database/TLS servername và parsed `options.family`. Worker connection/createConnection không đổi. Connector cleanup destroy đúng stream riêng.

Giữ dependency deadline1500ms, HTTP fallback2000ms, connect/query/command timeout1000ms, single-flight, offline queue/retry tắt cho probe. Giữ health/live, response/Messenger semantics; không sửa app.ts hay worker retry policy.

**Sibling phát hiện trong tự review:** ioredis parse được `?family=4|6`. Connector intermediate luôn family0 sẽ bỏ qua policy URL. Permanent regression mới RED trước sửa (`red-family-policy.log`), GREEN sau dùng parsed family (`green-family-policy.log`); final commit riêng, không di chuyển tag hoặc ghi đè image intermediate.

**GREEN exact final image:** normal transport và dedicated probes cùng healthy trên OS-hosts alias, readiness200 (`green-hosts-final.log`). PG URL host override `ignored.invalid?...host=b7-hosts-pg` cũng200 (`green-query-host-final.log`). App thật dùng hai hosts-only dependency aliases qua HTTP native/fetch có84/84 readiness200 (`hosts-http-final.json`), không chỉ test wrapper.

Actual Redis family controls: family4 normal/probe=true, family6 trên alias chỉ IPv4 normal/probe=false, lần lượt39/34ms; 40 caller cùng promise. Đây là kiểm giữ policy, **không phải kết nối thành công mạng IPv6 thật**.

Native Node22 helper so localhost addresses/order với OS, literal4/6, TCP fallback từ địa chỉ bị refuse,20 lượt abort subprocess thật và chờ cleanup; kết thúc chỉ PipeWrap, không Process/GetAddrInfo/Timeout handle (`transport-policy-final.log`). Unit tests còn kiểm không settle trước close, kill khi abort/timeout, reject/redact invalid/error result và không inherit auth.

Semantics `close` được đối chiếu tài liệu [Node child_process](https://nodejs.org/api/child_process.html#event-close); TCP address selection đối chiếu [Node net](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener), đồng thời kiểm library source PG/ioredis cài trong candidate. Không dựa tài liệu thay actual checks.

**Giới hạn:** đây là kiến trúc process riêng với overhead spawn; cần target cho phép spawn/kill Node child. Không tuyên bố resolver environment overrides, mọi NSS plugin hoặc mọi platform đều tương đương. Real TLS server, IPv6 network/dual-stack connectivity, Unix socket success và mọi URL variation chưa được exercise đầy đủ. Unit rediss test giữ servername/options và không đặt rejectUnauthorized=false, không thay thế real TLS proof. PG Unix branch được review, chưa được gọi PASS thực DB. Không cold-install dependency hoặc provider workload proof.

## 3. B7-RC4-02 — passive reason từ NULL

**RED mới:** helper qua actual pool/Prisma/app-role PG16 tái hiện callback ngoài ALS: status disconnected nhưng disconnectReason NULL, exit1 (`red-extra-reconnect.log`). Đây là lỗi đã có ở RC3, không gán thành regression RC4 mới.

**Sửa hẹp tại `modules/zalo/zalo-pool.ts:536`:** giữ id+orgId; thay NOT manual bằng `OR [disconnectReason=null, disconnectReason not manual]`. Vì SQL nullable NOT không chọn NULL, nhánh NULL phải tường minh. Không thêm bypass, không đổi reconnect eligibility, status-log service hoặc global UID semantics.

**GREEN:** actual app-role helper mở rộng39/39 assertion (`extra-reconnect.log`), gồm NULL/passive/manual/other reason, disconnectedAt, manual không retry SDK, foreign account không đổi, callback ngoài ALS, foreign callback ID reject, stale epoch, pending/overlap và account-org status-log validation. Permanent unit matrix4 cases giữ cùng behavior qua callback thật với mock nullable-WHERE semantics; có actual PG matrix đối chứng riêng.

Regression69 còn giữ nonempty ownId, own X/Y/concurrency, internal identity bootstrap, foreign/missing deny, manual/ghost/archived, UID mismatch, duplicate active/archived cùng/khác org, generic foreign duplicate và exact ghost-memory cleanup. Không dùng SDK stub undefined UID. Profile/status/credential/log/business writes quan sát không bypass; identity-only bootstrap không được tính là business isolation proof. Child queries có thể dựa RLS/context, không gọi mọi query đều có explicit org predicate hoặc repository-wide isolation.

SDK pending không có boot-level timeout; sequential startup sweep vẫn có thể chờ account/org trước. Lỗi sweep vẫn có thể bỏ org sau. Global sweeps ngoài đường remediation chưa được redesign; startup0 session không phải proof SDK reconnect.

## 4. Kiểm tra mới của A

| Check final | Kết quả | Phạm vi |
|---|---:|---|
| Targeted report/tenant/job/health/RC1/ghost/manual |373/373,40 file|Unit/mock/PGlite và source boundary; không gọi toàn bộ là DB16 |
| Actual DB/jobs |51 assertion|Queries/callbacks thật, scheduling/provider stub |
| Action child writes |15 assertion|Recipient/notification/Message/conversation thật; SDK/anti-spam stub |
| Reconnect original |69 assertion|Actual source/Prisma/app role, nonempty SDK adapter |
| Extra reconnect/matrix |39 assertion|Callback NULL/manual/foreign, pending/overlap/stale và policy controls |
| Backend build |exit0|TypeScript compile, không phải business test |
| P2 |16/16|Disposable Git fixtures, không chạy deploy.sh |
| Bash syntax / diff --check |exit0|Syntax/whitespace only |
| Final image clean build / payload |exit0|Cache-backed, không cold install |

Không cộng assertion chồng lắp thành tỷ lệ coverage. Local Node26.13.0, image Node22.23.4. DOTENV_CONFIG_PATH trỏ file không tồn tại, synthetic DB URL b7_app@127.0.0.1:55683/b7, enforce/RLS enabled; host helper/tests có network guard chỉ cho PG A. Không đọc .env/session/token/key thật. Frontend không đổi, không rerun frontend suite.

Giữ diagnostic: compile đầu FAIL do tên import TCP trùng createConnection worker và Connector constructor type; sửa patch mới, không giảm test. Offline build FAIL vì cache/network-none; network-enabled build theo Dockerfile gốc với --pull=false thành công, apk/npm/frontend stages cache HIT, backend generate/build chạy. Không gọi đây là cold install. Một hosts invocation trùng Redis stop lỗi CLI do empty IP, chưa chạy test; giữ `hosts-invocation-during-stop-failed.log`, chạy lại tuần tự final thành công. Risk validator đầu coi baseline RED rows là current defect; giữ log, phân loại lại expected baseline reproduction và final-head checks, recommendation vẫn hold_for_evidence.

## 5. PG16/RLS và image smoke

PG A mới `a4f-pg-163013`, PostgreSQL16.15, DBb7; xác minh0 public tables trước ghi. tmpfs, không real-data mount, loopback55683 đã kiểm free. `migrate deploy`, không db push; áp tenant-rls.sql nguyên trạng trong transaction/ON_ERROR_STOP. App role `b7_app` NOSUPERUSER/NOBYPASSRLS, sở hữu0 bảng. Catalog129 migrations/0 unfinished/rolled-back,123 bảng,4 noninternal triggers,103 policies,102/102 org tables ENABLE+FORCE RLS.

Owner chỉ migration/RLS/role/fixture setup/reset. Reset chỉ fake X/Y rows trong DB mới, giữ ledger/schema/trigger/FK/unique/constraint. Actual helper isolation bằng app role; không bypass write tính làm proof. Before smoke synthetic session_data SQLNULL, count nonnull0. JWT memory only, không provider key. App/client/inspector chỉ internal network, không app port; chỉ PG có bridge bổ sung cho loopback host Prisma.

Final image smoke dùng NODE_ENV=test/MARKETING_DRY_RUN=true/OPIK_ENABLED=false/guard+RLS. Mỗi pha native và fetch1→20→20→1; response<3000ms, abort4000ms; timeoutFAIL.

| Pha final | Readiness | Max response | Max inspector probe |
|---|---:|---:|---:|
| Healthy |84/84 HTTP200|74ms|40ms|
| Redis stopped |84/84 HTTP503|1031ms|1004ms|
| Stopped numeric app IP |84/84 HTTP503|1036ms|1003ms|
| Stop recovered |84/84 HTTP200|53ms|37ms|
| Redis paused |84/84 HTTP503|1523ms|1502ms|
| Pause recovered |84/84 HTTP200|61ms|37ms|

504 readiness requests và533 assertions/control theo helper là hai đại lượng khác nhau. Thêm hosts-only app HTTP84/84 readiness200 riêng. Live200;10 representative report requests X/Y200; foreign-ID exclusion controls, unauth401, userX claim orgY403 và TikTokPOST404. Không suy mọi report field/route không leak.

24 inspector samples,40 caller/dependency/sample đều share promise/settle; queue/offline0. Worker retries khi Redis stopped làm close count tăng tới6; **không ghi “chỉ close một lần”**. Sau stop recovery, CLIENTID4 và close count6 giữ nguyên qua pause/recovery, PING/PONG đạt; worker object giữ nguyên, code probe không disconnect worker. Socket/resource mẫu hồi về cùng finite range;20 native resolver abort checks không còn child handle. Không dùng finite samples để tuyên bố không leak vô hạn.

PG probe40-caller matrix: numeric10ms, rejected42ms, paused1047ms, recovered45ms; tất cả settle, sau50ms chỉ PipeWrap. Startup scan0 sessions và backfill6 fixture accounts ghi riêng. Redis EAI_AGAIN/retry/event-buffer fallback warnings trong fault injection được giữ, không tuyên bố mọi worker/business workload đã khỏe hoặc mọi Redis client được sửa.

## 6. Source binding và integrity

Final image build từ clean committed candidate, Dockerfile/.dockerignore nguyên trạng. OCI export độc lập kiểm index/platform/config và SHA256 actual compressed layer bytes; config diffIDs lưu trong `image-oci-identity.json`, content receipts trong `final-receipt.json`. RepoDigests local khớp index, không chứng minh registry publication.

App-owned1619 file;1407/1407 nonstatic payload hashes khớp candidate compile/source;210 static hashes khớp RC3 historical binding và clean cached frontend build;2 metadata hashes package.json/prisma.config.ts cũng khớp source. Đúng13 operational scripts, không app-owned tests/spec/fixtures/.env/artifacts/TikTok connector. Không đánh đồng dependency node_modules internal tests/fixtures với app payload hoặc gọi đây là dependency audit toàn diện.

Snapshot root1171/1171 không changed/added/removed trong các cây input đã ghi, gồm untracked có sẵn. Candidate1037→1039: đúng6 file đổi +2 test mới, không removed;4 runtime files và4 test files trong tổng diff8 paths. Dependency/schema/migration/ops/frontend không đổi. Root HEAD/branch giữ nguyên, candidate clean final. Những số này không phải snapshot mọi file trên ổ đĩa.

Cleanup đúng app/probe/hosts-app/Redis/PG A và internal network; port55683 hết listener. Giữ hai container phiên khác `reports-1b-verify-20261101`, `sketchup-api-1`, candidate, mọi tag/image RC3/RC4 và hai image lượt này. Không prune; build cache có thể còn. OCI archive A tạm đã xoá sau hash/parse, giữ receipt/metadata. Không sửa lịch sử A/B trước lượt này.

## 7. Historical full suite và bước tiếp

Không rerun full suite; chỉ **historical-log comparison**. RC3:33 failed files/6 failed tests; RC2final:35/8;29 import/setup headings mỗi bên. Tên/error/timeout giữ ở `historical-suite-audit.json`; baseline archive1377/1377 paths, không extra/missing. Không suy shared failure harmless hoặc cấp miễn gate; không gọi373 targeted là full suite PASS.

**Bước tiếp:** 7B kiểm độc lập exact final mới bằng prompt đính kèm, tự xác định assertion/coverage và đọc helper trước chạy. Nếu B tìm lỗi, A sửa finding cụ thể trong scope tiếp theo. Nếu B PASS, RC-4 drift/secure fallback vẫn cần lượt riêng.

**VPS vẫn NOT_READY/BLOCKED:** migration/schema drift RC-4, secure fallback giữ E-1/O-1, backup/restore thật, deployed revision, staging/monitoring/soak và production approval chưa được xử lý/chứng nhận trong lượt này. Không deploy.
