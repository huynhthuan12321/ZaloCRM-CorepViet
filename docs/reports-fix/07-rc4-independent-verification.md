# RC4 final — kiểm tra độc lập 7B

Ngày 03/11/2026, Asia/Saigon. **Remediation: FAIL. VPS: NOT_READY / BLOCKED.** Không sửa runtime/test/ops để làm PASS, không deploy, không tạo agent. Báo cáo này đánh giá exact final, không thay lịch sử A/B.

Readiness đạt lại ca DNS/stop/concurrency từng thất bại ở RC3, nhưng có regression cấu hình hostname chỉ tồn tại trong OS hosts: dependency vẫn hoạt động mà readiness trả503. Tenant-bound business writes của B7-RC3-02 đạt trong các nhánh đã exercise; kiểm callback bổ sung tìm thấy lỗi passive reason NULL có từ RC3. Full suite vẫn FAIL theo lịch sử, không được miễn gate.

Artifact B mới: [reports-rc4-7b-20261103-160305](../../artifacts/reports-rc4-7b-20261103-160305/). [Risk JSON](../../artifacts/reports-rc4-7b-20261103-160305/patch-risk-assessment.json), recommendation/workflow **revise**, validator exit0. Đây không phải approval merge hoặc phát hành.

## 1. Identity và preflight thực tế

| Đối tượng | Kết quả B |
|---|---|
| Root | `F:/ZaloCRM-CorepViet`, HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`; dirty có sẵn được giữ nguyên |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023`; sạch trước/sau; branch `release/reports-20261103-1023` |
| Final HEAD | `41d5c1e64ada75abbad969554de8a72287a883ee` |
| Final annotated tag | `reports-rc4-20261103-143825`; object `7b55d65b42662eaf69429cb0a98ae50f7c8f836f`, peel đúng final |
| RC3 | tag object `1b706547f088affcff761c28fc6bfe9b6cd91b3a`, peel `97c8640a892449c753443c66b9f5c8c81c329709` |
| RC4 đầu giữ nguyên | object `000ba69778d9528a8433e06ed00b679ed5c7263f`, peel `bbcd005bd4dc612d168a3792b27a65d89a4f6694` |
| Final image | `zalo-crm-rc:reports-rc4-20261103-143825-final` |
| Local image/index | `sha256:1b42f0d128cde3695c99976c7b141168a4cc605f82ebb26a31f124feb14d041a` |
| Platform manifest | `sha256:3895dd8c0b355c7c0e85dcf55acb8eaf64b951c9457a65e4cd119f249c9e7a51` |
| Config | `sha256:6d3cecc9f34c086b3f361531090e980dde61592c939da1e2f8aac4ae1878947c` |
| Diff RC3→final | B xuất từ Git độc lập, SHA256 `8251c944fe1375a3241fbabb3b8c487fb52d3e2fe4eeb68ae5ee98737927a8e8`, trùng patch A |

Git dùng safe.directory từng lệnh; clean gate dùng cấu hình Git chỉ trong process. Docker Client/Server29.8.2 hoạt động sau escalation; Git Bash explicit `C:/Program Files/Git/bin/bash.exe`. Sandbox chặn candidate/Docker ban đầu; escalation được chấp nhận. Không đổi global config. Inventory container/port/process giữ trong artifact; không ghi process command lines hoặc Config.Env.

Áp dụng AGENTS người dùng cung cấp; không có AGENTS tại candidate/ancestor đã kiểm. Đọc contract0, E-1/O-1, release7A, RC3 B, RC4 A và evidence/helper liên quan. Dùng skill `codex-security:assess-patch-risk`; output đặt ở đường dẫn B do người dùng yêu cầu. Không dùng helper A có chức năng patch source/audit ghi lại A. Chỉ copy các helper đã đọc vào B rồi chạy; helper B mới cũng nằm trong B.

## 2. Findings

### B7-RC4-01 — [P2] DNS-only readiness báo lỗi trên healthy OS-hosts alias

**Vị trí:** candidate `backend/src/shared/http/probe-host.ts:11–18`; consumers `shared/database/readiness.ts:20`, `shared/queue/redis-connection.ts:78`. Entry point `app.ts:/health/ready`.

**Trigger:** DATABASE_URL và REDIS_URL dùng hostname hợp lệ được OS resolve qua `/etc/hosts`, chẳng hạn Docker `--add-host`. Đây vẫn là hostname URL mà transport PG/ioredis hiện hành sử dụng được; patch không có validation hay contract loại bỏ cấu hình này. Resolver mới chỉ query A/AAAA bằng c-ares, ngoài special case localhost, nên bỏ qua OS hosts lookup.

**Expected:** khi chính PG SELECT1 và Redis PING thành công, readiness trả200; vẫn giữ deadline/cancellation và không ngắt worker.

**Actual:** trên exact final image, PG/Redis B cùng internal network: `dns.lookup` resolve cả hai alias; normal PG query=true, worker PING=true; control `buildReadyHealth` dùng hai transport đó trả200. Dedicated probes mới cùng trảfalse và health trả503 (`db=disconnected`, `redis=disconnected`), elapsed2ms. Không phải timeout, dependency outage hay secret/auth mismatch. 40 callers vẫn single-flight, nhưng cùng chia sẻ kết quả false-negative.

**Evidence:** [hosts-compat.mjs](../../artifacts/reports-rc4-7b-20261103-160305/hosts-compat.mjs), [hosts-compat.log](../../artifacts/reports-rc4-7b-20261103-160305/hosts-compat.log), exit1. Control là normal transport thật trên final image, không gọi đây là rerun toàn image RC3. RC3 source dùng normal Prisma PG và ioredis URL transport, không có resolver mới này.

**Impact:** môi trường có dependency hostname trong OS hosts có thể bị health gate đánh unhealthy dù business/worker connection hoạt động. Chưa chứng minh cấu hình VPS thực tế dùng alias này, không suy downtime production đã xảy ra. A đã ghi “hosts-file-only chưa test”; B nay có counterexample thực tế, nên không đủ cấp compatibility PASS cho remediation readiness.

**Đề nghị A:** sửa hostname policy/resolution để giữ cấu hình transport hợp lệ mà vẫn cancellable/bounded; thêm regression OS-hosts control cùng DNS/literal controls. Không quay lại timeout race bỏ mặc getaddrinfo hoặc dùng worker để probe.

### B7-RC4-02 — [P2, có từ RC3] callback không ghi passive reason từ NULL

**Vị trí:** `backend/src/modules/zalo/zalo-pool.ts:536`, cùng reset reason NULL khi connected ở dòng640. Đoạn predicate tương ứng đã có ở RC3, lưu `rc3-callback-source.txt`; không gán đây là regression mới của RC4.

**Trigger:** reconnect thành công → `disconnectReason=NULL` → SDK gọi onDisconnected bên ngoài ALS. Callback đã được RC4 bind về tenant X đúng, sau đó updateMany dùng `NOT {disconnectReason:'manual'}`.

**Expected:** own account chuyển disconnected và reason passive; giữ manual; không thay tenant Y.

**Actual:** app-role PG16/Prisma thật ghi `status='disconnected'` nhưng `disconnectReason=NULL`. Nullable SQL predicate loại hàng NULL nên passive update không áp dụng. Foreign account vẫn connected; business writes quan sát ở callback đều tenant X và không bypass. B chưa gọi NULL defect là tenant escape, chưa chứng minh manual value bị ghi đè.

**Evidence:** [extra-reconnect.log](../../artifacts/reports-rc4-7b-20261103-160305/extra-reconnect.log), diagnostic `callback-own-row`, assertion `outside ALS callback updates own status=false`; overall exit1, 28/29 checks đạt. Giữ các attempt1/2/3: attempt1 quan sát trace còn lẫn followup fire-and-forget; attempt2/3 cô lập rồi tái hiện NULL. B đổi collector để tiếp tục chạy mọi assertion, giữ nguyên expected và exit FAIL, không bỏ assertion hoặc tăng deadline.

**Impact/đề nghị:** metadata lý do/mốc mất kết nối và hiển thị thời gian mất kết nối không đúng sau reconnect thông thường. A cần sửa predicate nullable trong phạm vi được giao và bổ sung own NULL/passive/manual + foreign controls. Không coi failure có từ trước là harmless; cũng không dùng nó để phủ nhận phần tenant-bound đã kiểm đạt.

## 3. Readiness và reconnect review

**B7-RC3-01 cũ:** A `before-native.json` có8/42 timeout, max4002ms. Instrument log xác nhận cùng request chờ DB3401–4998ms trước redis:start; lookup Redis EAI_AGAIN còn nhiều giây. Điều này chứng minh chờ DB trước Redis/deadline không bao trùm; chưa đo mọi cơ chế pool/libuv nên không khẳng định DNS là nguyên nhân duy nhất. Numeric fetch warmup PASS không bác bỏ native FAIL.

Final khởi chạy hai dependency song song; HTTP fallback2000ms, dedicated PG/Redis deadline1500ms. PG một client single-flight, connect/query1000ms, socket destroy và end trong finally. Redis probe riêng, offline/retry tắt, disconnectTimeout0, không dùng worker. Resolver cancel pending A/AAAA trong finally/abort. Đây có cleanup thực, không chỉ Promise.race rồi bỏ mặc. HTTP wrapper vẫn race fallback; runtime probes là lớp chịu trách nhiệm cleanup. Dedicated PG chỉ chứng minh DB connect/query, không chứng minh pool Prisma nghiệp vụ không nghẽn.

B kiểm actual PG numeric/rejected/paused/recovered với40 caller cùng promise: 13/10/1009/14ms, tất cả settle; sau50ms chỉ PipeWrap, không timer/socket trong mẫu đo. DNS-hostname Docker và Redis stop/pause/recovery đạt bảng smoke dưới. Không coi finite sampling là chứng minh không leak vô hạn. Cấu hình TLS server thật, mạng IPv6 thật/dual-stack fallback, Unix socket URL và mọi URL parameter chưa đủ test; localhost được hardcode IPv4, c-ares chọn address đầu thắng, không có connection fallback đa address. Không tuyên bố các partition chưa exercise đã đạt.

**B7-RC3-02:** source tracing đi qua loginQR/reconnect/autoReconnect, app boot, zalo-routes:191/233, dashboard bulk:501, health cron:42/77, operations retry:83, attachListener và dynamic imports. `withAccountTenant` giữ normal context hiện có, foreign/missing account không vào SDK; internal missing/bypass caller chỉ bootstrap ID→org rồi scoped reread/withTenant không bypass. '*' không explicit bypass bị từ chối. Profile/status/credential writes có org predicate; status transaction xác minh account-org và scoped open-log/update. Callback ngoài ALS phục hồi org; identity-only lookup không được tính là business isolation proof.

Actual source/Prisma/app-role checks: X/Y, async concurrency, missing/foreign, manual/ghost/archived, UID mismatch, same-org active/archived UID, foreign archived UID, duplicate identity exclusion và exact ghost-memory IDs đạt trong regression69. B thêm foreign ACTIVE UID generic duplicate, wildcard reject, pending same-account overlap, Y tiến được trong lúc X pending, callback foreign-ID reject, own-tenant callback writes, stale epoch và account-org mismatch status log. NULL correctness fail nêu trên. SDK stub trả nonempty ownId, không dùng fixture undefined; provider/followup adapter giả được phân biệt với DB writes thật.

Một số child queries dựa RLS/context và relation IDs thay vì mọi query có explicit org predicate; không gọi “mọi query có org predicate”. Global UID unique giữ nguyên, foreign UID không được nhả. Global cleanupStaleGhosts/system sweeps còn bypass ngoài đường đã sửa; không chứng nhận repository-wide isolation. SDK pending không có boot-level timeout; startup await tuần tự có thể giữ org sau chờ, lỗi sweep có thể bỏ org sau. Check boot pending/error và overlap giữ nguyên ý nghĩa này, không coi startup0 session là reconnect proof.

## 4. Check B mới và PG16

| Check | B mới | Phạm vi |
|---|---:|---|
| Targeted38 files |358/358 PASS|report/tenant/job/health/RC1/ghost/manual; unit/mock/PGlite, không toàn bộ là PG16 integration |
| DB/job helper |51 PASS|actual queries/callbacks; scheduling/provider stub; missing tenant, X/Y, async, foreign read/write deny |
| Action children |15 PASS|actual notification/recipient/Message/conversation writes; SDK và anti-spam adapter stub |
| Reconnect regression |69 PASS|actual source/Prisma/app role; nonempty SDK adapter |
| Extra reconnect B |28 PASS/1 FAIL|callback NULL defect; không cộng với69 thành tỷ lệ coverage |
| Host compatibility B |FAIL|normal PG/Redis healthy, dedicated probes503 |
| PG40-caller matrix |4 phases PASS|numeric/rejected/paused/recovered, settle/resources |
| Backend build |exit0|TypeScript compile, không phải business test |
| P2 |16/16 PASS|disposable Git fixtures, không gọi deploy.sh |
| Bash syntax/diff check |exit0|bash -n và git diff --check RC3→final |

Helper/test được đọc trước chạy; local Node26.13.0, image Node22.23.4. DOTENV_CONFIG_PATH trỏ file không tồn tại, DATABASE_URL tổng hợp B, TENANT_GUARD_MODE=enforce, RLS_SET_CONFIG=true. Host tests/helper dùng network guard cho đúng PG loopback55683, chặn TCP/TLS/fetch/UDP khác. Không đọc .env/session thật, không provider/send/paid AI. Frontend không đổi RC3→final, không rerun frontend suite.

PG mới `b7-r4-pg-160305`, postgres16-alpine có sẵn, PostgreSQL16.15; tmpfs `/var/lib/postgresql/data`, không real-data mount; loopback55683 kiểm free trước tạo. DBb7,0 public tables trước ghi. Chỉ PG nối bridge bổ sung cho host Prisma; app/client/probe chỉ internal network, không publish app port.

`migrate deploy` thành công, không db push; tenant-rls.sql nguyên trạng trong transaction/ON_ERROR_STOP; owner chỉ migration/RLS/role/fixture setup. `b7_app` NOSUPERUSER/NOBYPASSRLS, sở hữu0 bảng. Catalog:129 migrations,0 unfinished/rolled-back;123 bảng;4 noninternal triggers;103 policies;102/102 bảng org_id ENABLE+FORCE RLS. Giữ ledger/FK/unique/constraint, không tắt guard/RLS. Các biến đổi/reset trong helper chỉ fixture tổng hợp B; không dùng bypass business write hoặc owner để chứng minh isolation. Before smoke, synthetic session_data đặt SQLNULL và count nonnull0.

## 5. Exact image, binding và smoke

Inspect live image + export OCI local xác minh index/manifest/config digests ở bảng identity; compressed layer digests và config diffIDs lưu `image-oci-identity.json`, không chỉ tin label. RepoDigests local khớp index, không chứng minh đã publish registry. Image RC3 và RC4 đầu giữ nguyên ID.

B inventory app-owned1619 file; payload hash1617 file trong dist/scripts/Prisma/static. **1407/1407** nonstatic hashes khớp local candidate output/source sau B compile, không missing/mismatch. **210 static hashes** khớp image RC3 B đã ghi trong lịch sử; frontend không đổi trong range này. Đúng13 scripts operational theo Dockerfile allowlist; không app-owned test/spec/fixture/.env/artifacts/TikTok connector. Third-party node_modules là phạm vi khác, không tuyên bố không có internal tests/fixtures dependency.

Clean-context gate PASS. B thử rebuild với tag riêng `zalo-crm-rc:reports-rc4-7b-160305`, --pull=false/--network=none; **FAIL** vì cache không đủ cho apk/npm stages và apk cần mạng. Không pull image, không rerun build có mạng; không có B image/tag hoàn chỉnh. Vì vậy binding mới gồm clean gate + payload/content + OCI/layer identity, cộng lịch sử A build log; **không có independent successful context rebuild/cold install/reproducibility proof**. A build log final có các digest trùng OCI hiện tại; phân biệt rõ evidence lịch sử này với B invocation thất bại.

Smoke chạy exact final image, JWT memory only, NODE_ENV=test/MARKETING_DRY_RUN=true/OPIK_ENABLED=false, không session/provider key. Mỗi pha fetch1→20→20→1 và native1→20→20→1:84 readiness requests; response<3000ms, client abort4000ms, timeoutFAIL.

| Pha B | Status | Requests | Max ready | Probe max |
|---|---:|---:|---:|---:|
| Healthy |200|84/84|35ms|11ms|
| Redis stopped |503|84/84|45ms|5ms|
| Stopped numeric app IP |503|84/84|36ms|5ms|
| Stop recovered |200|84/84|20ms|4ms|
| Redis paused |503|84/84|1517ms|1503ms|
| Pause recovered |200|84/84|27ms|5ms|

504 readiness requests đạt; 533 assertions/control theo helper không phải533 HTTP requests. Live200;10 report requests X/Y200,10 foreign-ID exclusion checks; unauth401; userX claim orgY403 deny; TikTokPOST404. Representative reports không chứng minh mọi field/route không leak.24 inspector samples,40 caller mỗi dependency/sample, cùng promise và settle; worker queue/offline0. Worker CLIENTID3 sau stop recovery và sau pause recovery, close count1 do stop, không tăng khi pause/probe; PING/PONG recovery. Resource mẫu pause có2 Timeout rồi về baseline sau recovery, không thấy tăng đơn điệu; không chạy BullMQ/provider workload thật.

Startup log trong phần exercise không có tenant-guard error; reconnect0 sessions, backfill6 fixture accounts/4 tạo/2 skip. Zero sessions không phải SDK test; SDK proof ở regression riêng. Warning thiếu encryption config là môi trường test không key, không được dùng chứng nhận production config.

## 6. Full suite: historical-log comparison

Không rerun full suite RC4. B parse log RC3 và RC2final lịch sử: RC3 **33 failed files/6 failed tests**,1119 pass; RC2final **35/8**,1111 pass. Mỗi bên29 suite import/setup headings. Không có RC3-only failure name trong hai log đó; không được suy RC4 full suite PASS hoặc shared failure harmless.

Common failures: org-branding2, profile-media1, profile last-online/error2 và ghost reconnect select1. Setup failures thuộc automation/EE/Facebook/Zalo-ads hoặc import `/src/...`; chi tiết tên/error ở `historical-suite-audit.json`. RC2-only gồm UID-cap timeout5000ms và Message guard expectation; target RC4 có check tập trung tương ứng đạt, không xoá timeout lịch sử.

Baseline-full.zip đối chiếu metadata1377/1377 path Git RC2, không extra/missing sau xử lý Git Unicode quoting. Content-normalization là evidence RC3 B cũ133 exact/1239 newline-only/5 sensitive skipped, không giả là B RC4 đọc lại secret/binary. Package/lock/test config/schema không đổi RC2→RC3; không có attestation mới cùng binary/node/dependency environment hoặc rerun baseline. `historical-suite-audit-quoted-path.json` giữ diagnostic parser đầu. Không cần rerun full để quyết định hai counterexample mới, và không miễn các gate full-suite còn lại.

## 7. Claims A, integrity và bàn giao

| Claim A | B đánh giá |
|---|---|
| Exact final commit/tag/image và diff |Xác nhận mới bằng Git/Docker/OCI |
| Readiness bounded cho DNS stop/pause/concurrency |Xác nhận mới trong các pha B; không mở rộng thành mọi URL/host policy |
| Host/TLS compatibility tổng quát |Chưa đủ; OS-hosts cụ thể bị B bác bỏ bằng phản chứng |
| Tenant-bound profile/status/credential/log và duplicate-owner |Xác nhận trong source và app-role branches đã exercise; không repository-wide |
| Callback correctness đầy đủ |Chưa đủ; B bổ sung fail NULL passive reason, có từ RC3 |
| 358/69 và child/job evidence |Rerun mới đạt; không biến số lượng thành coverage guarantee |
| Final image payload |Hash/inventory/OCI xác nhận; independent rebuild/cold-install chưa đạt |
| Full suite xanh/VPS ready |Không có claim hợp lệ; lịch sử FAIL và release gates còn nguyên |

Snapshot B trước/sau: **root1171/1171, candidate1037/1037**, changed/added/removed đều rỗng trong tập source/test/Prisma/scripts/frontend/build inputs đã ghi, gồm untracked có sẵn trong các cây được chọn. Không gán các số này cho mọi file trên ổ đĩa. HEAD hai repo giữ nguyên; candidate status clean sau checks. Root source dirty giữ nguyên; chỉ thêm artifact B và báo cáo này. Không reset/stash/stage/checkout/commit/tag/push/merge/deploy; P2 tự tạo Git commit trong fixture tạm đúng mục đích test, không thao tác lịch sử repo.

Cleanup: xóa đúng app/probe/Redis/PG `b7-r4-*-160305` và network `b7-r4-net-160305`; port55683 hết listener. Giữ hai container phiên khác `reports-1b-verify-20261101`, `sketchup-api-1`, candidate/tags/images A/RC3. Không prune. OCI archive B tạm1.16GB đã xoá sau parse, giữ hash receipt và OCI metadata; build cache từ attempt có thể còn. Không sửa artifact A/B lịch sử.

**Kết luận remediation: FAIL.** B7-RC3-01 hết timeout trong matrix đã kiểm nhưng chưa giữ hostname compatibility (B7-RC4-01); B7-RC3-02 tenant invariant đạt trong scope kiểm, callback correctness vẫn có B7-RC4-02. Đề nghị A sửa finding cụ thể và bàn giao final mới để B kiểm lại; B không tự sửa.

**Kết luận VPS: NOT_READY / BLOCKED.** RC-4 migration/schema drift, secure fallback giữ E-1/O-1, backup/restore thật, deployed revision, staging/monitoring/soak và production approval vẫn là gate riêng. Sau remediation PASS mới giao A xử lý các gate đó theo phạm vi riêng, không tự deploy.
