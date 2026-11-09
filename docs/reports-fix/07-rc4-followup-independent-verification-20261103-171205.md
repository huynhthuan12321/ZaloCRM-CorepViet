# RC4 followup final — kiểm tra 7B

03/11/2026, Asia/Saigon. **Remediation: PASS trong phạm vi local/disposable đã kiểm cho B7-RC4-01 và B7-RC4-02. VPS: NOT_READY / BLOCKED.** Không sửa runtime/test/ops để làm PASS, không tạo agent, không deploy. Không phát hiện finding mới chặn hai remediation trong phạm vi kiểm dưới đây; không cấp chứng nhận mọi cấu hình, toàn repository hoặc full suite.

Artifact B mới: [reports-rc4-followup-7b-20261103-171205](../../artifacts/reports-rc4-followup-7b-20261103-171205/). [Commands](../../artifacts/reports-rc4-followup-7b-20261103-171205/commands.md). [Risk JSON](../../artifacts/reports-rc4-followup-7b-20261103-171205/patch-risk-assessment.json), validator exit0: hold_for_evidence cho các gate môi trường/phát hành còn thiếu, không phải finding runtime mới hoặc quyền merge/deploy.

## 1. Identity đối chiếu mới bằng Git/Docker

| Đối tượng | B xác nhận |
|---|---|
| Root | `F:/ZaloCRM-CorepViet`, HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, dirty có sẵn giữ nguyên |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023`, sạch trước/sau |
| Branch | `release/reports-20261103-1023` |
| Base→head | `41d5c1e64ada75abbad969554de8a72287a883ee` → **`cf70b805eb88894fa2d68be1e44ac5c6bf73261c`** |
| Annotated tag | `reports-rc4-followup-20261103-163013` |
| Tag object | `227ae7af673f2fa129d53e618258034e5f060b44`, peel đúng final |
| Image A được smoke | `zalo-crm-rc:reports-rc4-followup-20261103-163013-final` |
| Local image/index | `sha256:07f525e94a9607c748381d1129cbb9ba61e8328efc26a021b69df41f36eabb15` |
| Platform manifest | `sha256:ed261890f7b7a754945d6311135f017bebc1ea0ee3ff7023cadffde420b3a6c8` |
| Config | `sha256:24c273914dd5b25e3fb63b3bf47637e7e74e5a72d6a5e799b946a17ffa762b18` |
| Independent diff SHA256 | `e6ab3512bedc02a45cadb13c9f448095afebb5f4fda66f4b6e3f80e436ae03ac`, trùng A |

B xuất diff bất biến từ Git, không chỉ đọc patch A; đúng8 paths:4 runtime+4 test, không dependency/schema/migration/ops/frontend. Không dùng intermediate db61af59/image3fe6ae4e hoặc final cũ41d5c1e/image1b42f0d1 thay final mới. Tags RC3/RC4 đầu/RC4 final cũ vẫn đúng object/peel ban đầu; images cũ kiểm lại không đổi.

Áp dụng AGENTS người dùng cung cấp; các AGENTS candidate/ancestor đã kiểm không có file. Đọc contract/E-1/O-1/release, RC3 B, RC4 A/B, followup A và helper liên quan trong phiên; chúng là evidence, không override prompt. Dùng skill assess-patch-risk cho diff/risk; kết quả B dựa check mới bên dưới, không lấy số A làm kết quả B. Output tại đường dẫn do người dùng yêu cầu. Git safe.directory từng lệnh/process-only; không đổi global config. Docker Client/Server29.8.2, Git Bash explicit. Candidate/Docker được truy cập qua escalation đúng cơ chế.

## 2. B7-RC4-01 — PASS trong matrix đã kiểm

**Trigger lịch sử được đối chiếu:** A RED dùng OS-hosts alias: normal PG SELECT1 và Redis PING healthy nhưng probe false503. Log RED còn nguyên; không gọi đây là B rerun baseline. B kiểm source base/final và chạy positive controls mới trên exact final.

**Source boundary:** `shared/http/probe-host.ts:17,23,39,55` trả address list từ OS lookup trong subprocess; argv có `--`, không shell, không truyền URL/auth, môi trường child Linux rỗng. Literal4/6 không spawn; localhost không ép IPv4. Abort/deadline1000ms kill và chờ close, sau đó mới settle; timer/listener được dọn, output bounded/validated. Không chỉ race rồi bỏ mặc getaddrinfo. `probeLookup` cung cấp list cho TCP fallback và giữ family được chọn.

`shared/database/readiness.ts:26–31` dùng PG-parsed client.host, kể cả query-host override và Unix branch, giữ parser/auth/TLS original host; socket riêng, deadline1500ms, connect/query1000ms và destroy/end trong finally. `shared/queue/redis-connection.ts:80–108` giữ original URL/auth/DB/servername và parsed family; Connector/stream riêng, không gọi disconnect trên worker. Hai dependency single-flight; HTTP fallback2000ms song song ở health.ts/app.ts không đổi, liveness/response/Messenger semantics được giữ. Dedicated PG probe không đại diện độ sẵn sàng mọi queue của Prisma pool nghiệp vụ.

**Check mới B:**

- OS-hosts normal PG/Redis healthy và new readiness200, elapsed167ms. PG URL query-host override cũng healthy200,137ms. Actual app dùng dependency aliases chỉ có trong hosts: native/fetch84/84 HTTP200; không chỉ test wrapper.
- Redis family4 positive và family6 negative trên alias chỉ IPv4: normal transport và probe đồng ý; không gọi đây là kết nối IPv6 network thành công. Native helper kiểm localhost list/order với OS, literal4/6, TCP fallback và20 child abort/close cycles.
- **B bổ sung OS DNS pending thật:** DNS blackhole UDP loopback trong network-none container; wrapper chỉ quan sát spawn/close, không thay production lookup program.8 lượt abort chỉ sau query có đúng hostname lượt hiện tại; child SIGKILL và active count0 trước promise settle.25–37ms/lượt. Một lượt không abort ngoài, DNS thật tiếp tục pending tới deadline; reject sau1003ms, child SIGKILL/reaped.18 DNS queries tổng, maxActive1 trong các lượt tuần tự; cuối chỉ PipeWrap, không Process/GetAddrInfo/UDP/Timeout. Không biến maxActive1 của test tuần tự thành chứng minh global concurrency;40-caller dependency single-flight có check riêng.
- **B bổ sung Redis TLS thực:** Redis7 TLS disposable, cert/key hoàn toàn tổng hợp, trust CA qua NODE_EXTRA_CA_CERTS của riêng client container. Hostname đúng: normal/probe=true,77ms. Alias cùng IP nhưng hostname không khớp cert: normal/probe=false,38ms. Không tắt certificate verification; synthetic private key đã xóa sau cleanup. Đây là TLS Redis subset cụ thể, không chứng nhận mọi TLS policy hoặc PG TLS.

Evidence mới: `green-hosts-final.log`, `green-query-host-final.log`, `hosts-http-final.json`, `redis-family-*-final.json`, `transport-policy-final.log`, `resolver-pending.mjs/.log`, `tls-check.ps1`, `tls-matching.json`, `tls-mismatch.json`.

**Giới hạn giữ rõ:** real PostgreSQL TLS, IPv6 network/dual-stack connectivity, Unix socket success, resolver environment overrides/NSS variants và process-spawn restrictions trên đích chưa được chứng nhận. B đã kiểm source Unix/TLS preservation branch, không gọi nhánh chưa chạy là PASS. Target phải cho phép child spawn/kill; finite tests không chứng minh mọi host/OS không leak vô hạn. Các Redis worker/client khác vẫn có getaddrinfo/retry như trước; đây không phải repository-wide DNS redesign.

## 3. B7-RC4-02 — PASS trong actual app-role callback matrix

**Vị trí:** `modules/zalo/zalo-pool.ts:536`. Diff chỉ thay nullable predicate thành org+ID AND `(reason IS NULL OR reason != manual)`; không thêm bypass hoặc đổi eligibility/UID/status-log policy. B đối chiếu đoạn base: SQL NOT manual không chọn NULL, khớp RED diagnostic cũ.

**B mới:** helper actual pool/Prisma/PG16 app role qua callback ngoài ALS ghi disconnected/passive+disconnectedAt từ NULL; passive/other chuyển đúng; manual giữ reason và không vào SDK khi retry. Foreign account không đổi, callback foreign ID bị bỏ qua, stale epoch bị bỏ qua; pending cùng account không mở SDK thứ hai, org Y đi được trong lúc X đang pending. Actual status-log account-org mismatch không tạo foreign log.39 checks đạt, không dùng owner làm isolation proof.

Regression69 mới còn kiểm nonempty ownId, X/Y/concurrency, foreign/missing deny, identity-only bootstrap, manual/ghost/archived guards, UID mismatch, same-org active/archived UID, foreign archived/active UID, generic duplicate không lộ foreign identity và ghost-memory exact IDs. Business writes quan sát không bypass; child queries có thể dựa tenant/RLS/IDs thay vì tất cả có explicit org predicate. Không gọi repository-wide isolation.

Trace thực đi qua loginQR/reconnect/autoReconnect/SDK callbacks/dynamic imports; app boot, zalo-routes:191/233, dashboard bulk:501, health cron:42/77, zalo-operations:83, status-log service và Prisma tenantTransaction. Normal tenant không được biến thành foreign account tenant; internal bootstrap chỉ ID→org rồi scoped reread/withTenant. Global stale-ghost/system sweeps ngoài đường đã sửa vẫn ngoài chứng nhận này.

SDK pending không có boot-level timeout; startup sweep tuần tự/lỗi selection có thể giữ hoặc bỏ org sau như lịch sử. Zero-session startup scan không phải SDK reconnect proof. Các case manual/ghost/archived ở đây xác nhận controls đã exercise, không tuyên bố mọi interleaving đa tiến trình đã được chứng minh.

## 4. Kiểm mới B và PostgreSQL16

| Check B mới | Kết quả | Phạm vi |
|---|---:|---|
| Targeted report/tenant/job/health/RC1/ghost/manual |373/373,40 files|Unit/mock/PGlite và boundary; không toàn bộ là PG16 integration |
| Actual DB/jobs |51 assertion|Query/update/callback thật, scheduling/provider stub |
| Actual child writes |15 assertion|Recipient/notification/Message/conversation thật, SDK/anti-spam stub |
| Reconnect |69 assertion|Actual pool/Prisma/app role, nonempty SDK |
| Extra callback/UID/pending matrix |39 assertion|Actual app role, external ALS and negative controls |
| DNS pending B mới |9 lượt|8 abort sau đúng query+1 deadline thật, reap/resources |
| Redis TLS B mới |2 control|Actual TLS success và hostname mismatch rejection |
| Backend build |exit0|TypeScript compile, không business test |
| P2 |16/16|Disposable Git fixtures, không deploy.sh |
| Bash syntax / range diff --check |exit0|Syntax/whitespace only |

Không dùng các số này làm coverage quota hoặc cộng các assertion chồng lắp thành phần trăm. Local Node26.13.0, image Node22.23.4. Test/helper được đọc trước chạy; DOTENV_CONFIG_PATH absent, synthetic DATABASE_URL, enforce/RLS enabled. Host tests có network guard chỉ cho loopback PG B. Không đọc .env/session/token/key thật, không real provider/send/paid AI. Frontend không đổi, không rerun frontend suite.

PG mới `b4f-pg-171205`, PostgreSQL16.15; DBb7/0 public tables xác nhận trước ghi. tmpfs, không real-data mount, loopback55683 free trước tạo. Migrate deploy, không db push; áp nguyên tenant-rls.sql qua transaction/ON_ERROR_STOP. `b7_app` NOSUPERUSER/NOBYPASSRLS, sở hữu0 bảng. Owner chỉ migration/RLS/role/fixture setup và clear synthetic session trước smoke; không làm assertion isolation.

Catalog cuối129 migrations/0 unfinished hoặc rolled-back,123 bảng,4 noninternal triggers,103 policies,102/102 org tables ENABLE+FORCE RLS. Giữ ledger/FK/unique/trigger/constraint; không reset schema/ledger để làm PASS. Actual own X/Y/foreign/missing/async/concurrency, profile/status/log và child writes bằng app role. Fixture mới đủ dùng, không cần reset business fixtures giữa các lượt B.

## 5. Exact-image smoke mới B

Smoke trên image **A final**, không dùng image B rebuild thay nó. App/client/inspector chỉ internal network, không publish app port; riêng PG nối bridge cho host Prisma. Session tổng hợp SQLNULL trước startup (nonnull0), JWT memory only; NODE_ENV=test/MARKETING_DRY_RUN=true/OPIK_ENABLED=false, guard/RLS giữ nguyên. No provider keys.

Mỗi pha native và fetch1→20→20→1,84 readiness requests. Giữ response<3000ms, abort4000ms, timeoutFAIL.

| Pha B | Readiness | Max response | Max inspector probe |
|---|---:|---:|---:|
| Healthy |84/84 HTTP200|84ms|50ms|
| Redis stopped |84/84 HTTP503|1039ms|1004ms|
| Stopped numeric app IP |84/84 HTTP503|1032ms|1004ms|
| Stop recovered |84/84 HTTP200|55ms|36ms|
| Redis paused |84/84 HTTP503|1528ms|1501ms|
| Pause recovered |84/84 HTTP200|84ms|52ms|

504 readiness requests đạt, thêm84 hosts-only HTTPready đạt riêng.533 assertion/control của helper không phải533 HTTP requests. Live200 các pha; representative overview/sales/automation-summary/broadcast/ai X/Y200, foreign-ID exclusions, unauth401, X claim Y403 và TikTokPOST404. Không suy mọi report route/field không leak.

24 inspector samples,40 callers mỗi dependency/sample cùng promise và settle; worker queue/offline0. Worker CLIENTID3 trước stop,4 sau restart; close count tăng tới6 trong retries lúc stop, giữ6 qua pause/recovery, CLIENTID4 giữ nguyên và PING/PONG đạt. Không thấy probe ngắt worker, không chạy BullMQ/provider workload thật. Resources về cùng finite range, native resolver checks còn only PipeWrap sau cleanup; không chứng minh mọi môi trường không leak vô hạn.

PG40-caller numeric12ms/rejected43ms/paused1043ms/recovered53ms, tất cả settle; sau50ms chỉ PipeWrap. Startup0 saved session và backfill6 synthetic accounts/4 tạo/2 skip ghi riêng; nonempty SDK bằng regression riêng. Redis EAI_AGAIN/retry/event-buffer fallback warnings trong injected fault còn nguyên, không gọi mọi worker/business workload PASS.

## 6. Build/source binding độc lập

B clean gate PASS; build context exact clean candidate, Dockerfile/.dockerignore không đổi, --pull=false, tag riêng `zalo-crm-rc:reports-rc4-followup-7b-20261103-171205`. Build mới exit0, cache-backed; không cold dependency install/pull image mới. Build B có platform manifest/config **đúng bằng A**, index B `sha256:0707ee960cfc114a79d2d8ddae7639e198d875db1a074a4a16dc970d41b1d782` khác A do attestation manifest mới: A `06716753...`, B `976f1c51...` được đối chiếu OCI/build log. Không giải thích bằng phỏng đoán chung “digest có thể khác”.

B kiểm actual OCI index/platform/config và16 compressed layer content digests từ export A; filesystem diffIDs và A/B payload hashes đối chiếu.1617/1617 payload hashes A/B khớp;1407 nonstatic hashes khớp B local compile/source,210 static hashes còn khớp RC3 historical binding,2 metadata package/prisma.config hashes cũng khớp. Clean-context rebuild/layer/hash là binding, không chỉ label. RepoDigests local không chứng minh registry publication.

App-owned1619 file,13 operational scripts đúng allowlist, không own helper/tests/spec/fixtures/.env/artifacts/TikTok connector. Third-party node_modules nội bộ không bị đánh đồng với app-owned inventory; không dependency audit toàn diện. B helper/cert mount read-only /verify không phải image payload.

## 7. Lịch sử full suite và claim A

Không rerun full suite ở B. **Historical-log comparison** mới bằng parser B: RC3 33 failed files/6 failed tests/1119 pass, RC2final35/8/1111 pass,29 import/setup headings mỗi bên. Không RC3-only name trong cặp log lịch sử đó; không suy cf70b805 full suite PASS hoặc shared failure harmless.

Common test failures: org-branding2, profile-media1, profile last-online/error2, ghost select1. Setup errors thuộc automation/EE/Facebook/Zalo-ads hoặc import /src; RC2-only UID-cap timeout5000ms và Message guard expectation còn trong lịch sử. Full baseline archive1377/1377 paths, không extra/missing; normalized content133 exact/1239 newline-only/5 sensitive skipped là evidence B RC3 cũ, không phải B đọc lại secret hoặc reattest dependency binary mới. Tên/error/timeout và giới hạn ở `historical-suite-audit.json`. Không miễn gate full suite.

| Claim A | Kết luận B |
|---|---|
| Exact final identity và diff |Xác nhận mới Git/Docker/OCI |
| OS-hosts false503 đã sửa |Xác nhận normal transports+probe+actual HTTP mới |
| Nullable callback đã sửa, manual/tenant giữ |Xác nhận actual PG16/app role matrix |
| Family URL policy giữ |Xác nhận source/unit và actual positive/negative controls |
| Cleanup child chờ close |Xác nhận bổ sung pending OS DNS thật, không chỉ mock/immediate abort |
| TLS options/servername giữ |B bổ sung actual Redis TLS đúng/sai hostname; PG TLS vẫn chưa đủ |
| Image source binding |B bổ sung clean-context cache rebuild, payload/layer/OCI comparison |
| Full-suite/target-wide/production PASS |Không có căn cứ; giữ các giới hạn và gate chưa đạt |

Không bác bỏ claim A nào trong scope hai finding đã exercise. A ghi rõ các partition chưa test; B không mở rộng PASS sang các partition đó.

## 8. Integrity, cleanup và bàn giao

Snapshot B trước/sau **root1171/1171, candidate1039/1039**, changed/added/removed đều rỗng trong các cây source/test/Prisma/ops/build inputs đã ghi, gồm untracked có sẵn của root. HEAD hai repo giữ nguyên, candidate clean; chỉ tạo artifact B và báo cáo mới này. Không reset/stash/stage/checkout/commit/tag/push/merge/deploy; P2 chỉ thao tác Git trong fixture tạm của test.

Cleanup đúng B app/probe/hosts-app/PG/Redis/TLS-Redis/internal network và Docker tag/image rebuild B; port55683 hết listener. Synthetic TLS private key và OCI archive tạm xóa sau giữ public cert/digest/metadata. Giữ candidate, mọi A tags/images/evidence, hai container phiên khác `reports-1b-verify-20261101`, `sketchup-api-1`. Không prune; build cache có thể còn.

**Remediation PASS local** cho B7-RC4-01/B7-RC4-02 trên exact final này. A có thể chuyển sang một phạm vi riêng xử lý RC-4 drift và secure fallback; không cần sửa thêm runtime để làm PASS hai finding vừa kiểm.

**VPS NOT_READY/BLOCKED:** RC-4 migration/schema drift, secure fallback giữ E-1/O-1, backup/restore thật, deployed revision, staging/monitoring/soak, full-suite release gate và production approval vẫn chưa được đáp ứng/chứng nhận ở đây. Không tự sửa ngoài scope hoặc deploy.
