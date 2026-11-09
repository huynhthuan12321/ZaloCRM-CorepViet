# RC3 — Kiểm chứng độc lập 7B

Ngày 03/11/2026, Asia/Saigon. Kỹ sư B thực hiện độc lập trên commit bất biến; không sửa source/test/ops hoặc artifact A, không deploy. Artifact mới: [reports-rc3-7b-20261103-133547](../../artifacts/reports-rc3-7b-20261103-133547/).

**Remediation RC3: FAIL.** RC-1 đạt; các sweep/action của RC-2 đạt trong phạm vi fixture, nhưng reconnect còn bypass nghiệp vụ ở callee; RC-3 không đạt deadline HTTP khi Redis stop và có request đồng thời. Có hai finding P2 dưới đây. Không có kết luận đã chứng minh khai thác chéo tenant.

**Khả năng phát hành VPS: NOT_READY / BLOCKED**, độc lập với kết luận remediation. RC-4 migration/schema drift, secure fallback giữ E-1/O-1 và không phục hồi TikTok, backup/restore rehearsal, revision đang chạy, staging, monitoring/soak và production approval vẫn mở. Không cập nhật trạng thái project thành READY.

## 1. Danh tính và preflight

| Đối tượng | Thực tế B đối chiếu |
|---|---|
| Repository gốc | `F:/ZaloCRM-CorepViet`, HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, branch `fix/reports-kpi-3b`; dirty sẵn có, không dùng làm candidate |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023`; branch `release/reports-20261103-1023`; sạch trước và sau |
| RC3 | annotated tag object `1b706547f088affcff761c28fc6bfe9b6cd91b3a`, trỏ commit `97c8640a892449c753443c66b9f5c8c81c329709` |
| RC2 | annotated tag object `3740d18742bfa5eddbab52f4a78e9388961bad14`, trỏ `b50295c0ec2c2d6d12cac411c3d08052a07ba41a`; không di chuyển trong B |
| Diff độc lập | RC2..RC3: 10 file, 199 insertions/60 deletions; SHA256 `6f69e8cfdbb8c19305e9e322dba530450621b600341b11a2d1c5f1e51a3d433f`; khớp remediation.patch A |
| Docker | Client/Server 29.8.2, Linux engine PostgreSQL 16 fixture hoạt động; lỗi permission đầu tiên là sandbox, escalation đã xác nhận công cụ hoạt động |
| Git Bash / Node local | Git Bash 5.3.15; Node `v26.13.0`. Image dùng `v22.23.4`; không coi build local là test Node 22 nghiệp vụ |

Không thấy AGENTS.md ở root/ancestor/candidate và các cây được tìm; áp dụng AGENTS người dùng cung cấp. Đọc contract, remediation E-1/O-1, release dossier/verification, bằng chứng A và source/helper liên quan. Dùng skill `codex-security:assess-patch-risk`; JSON đã qua validator cục bộ, recommendation `revise`. Thư mục artifact/báo cáo theo yêu cầu người dùng thay cho vị trí managed artifact mặc định của skill. Không tạo agent.

Git dùng `-c safe.directory=<đúng repository>` theo lệnh; build-worktree helper dùng cấu hình Git tạm qua môi trường của tiến trình, không sửa global Git config. Không checkout/reset/stash/stage/commit/tag/push/merge trong hai repository. P2 tự tạo rồi dọn Git fixture tạm theo test đã đọc, không commit repository dự án. Chỉ chạy `bash -n` cho deploy.sh; không thực thi deploy.sh.

Inventory ban đầu có hai container của phiên khác: `reports-1b-verify-20261101` (PG15, loopback 55471), `sketchup-api-1` (8765). Inventory process/port được đọc trước khi tạo tài nguyên; port 55693 trống. Hai container trên được giữ nguyên.

## 2. Findings

### B7-RC3-01 — P2: Redis stop + request đồng thời vẫn làm HTTP readiness timeout

**File/dòng:** [health.ts:30](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/shared/http/health.ts:30), [health.ts:34](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/shared/http/health.ts:34), [app.ts:405](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/app.ts:405). Probe liên quan: [redis-connection.ts:76](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/shared/queue/redis-connection.ts:76).

**Trigger:** app image A + PG16/Redis B trên internal network, guard enforce/RLS bật, không session/provider. Stop Redis; gửi một GET `/health/ready`, tiếp theo 20 request đồng thời. DB vẫn chạy. Dùng cả fetch và native HTTP, giữ deadline client 4.000 ms và ngưỡng assertion response dưới 3.000 ms.

**Expected:** mỗi request nhận HTTP 503 trong thời hạn; timeout là FAIL.

**Actual:** lượt smoke đầu 1/20 request timeout ở 4.003 ms. Repeat fetch 5/42 timeout; dùng IP app thay hostname vẫn 9/42 timeout. Native HTTP theo cùng thứ tự đơn→20→20→đơn: 9 request ở batch đầu 20 không nhận header trước 4.000–4.003 ms; socket/TCP kết nối trong khoảng 6–7 ms. Diagnostic Undici độc lập cũng ghi headers request đã gửi trong 4–8 ms, không nhận response trước abort. Các log gốc giữ nguyên.

**Ảnh hưởng:** không thể cam kết readiness có thời hạn khi Redis mất; poll/health client có thể treo tới timeout riêng. Đây là lỗi availability/release verification, không phải bằng chứng sai số JSON hay chỉ lỗi DNS phía client.

**Phạm vi nguyên nhân:** source chỉ bắt đầu timer Redis sau `await input.checkDb()`; không có deadline tổng cho handler/DB wait. Probe khi Redis stop còn tạo request DNS; có thể có tương tác với pool/DNS khi mở connection, nhưng B chưa instrument runtime để chứng minh toàn bộ chuỗi nguyên nhân. Không quy toàn bộ lỗi cho một dòng ioredis. Dữ kiện HTTP FAIL được tái hiện độc lập, không phụ thuộc giả thuyết này.

**Đối chứng:** healthy 20/20 readiness 200, max 51 ms; phục hồi sau stop 20/20 200, max 33 ms; pause 20/20 503, max 2.019 ms; phục hồi sau pause 20/20 200, max 41 ms. Repeat healthy/pause/recovery đều đạt 42/42. Native gửi ngay batch 20, không có request đơn đi trước, đạt 60/60; chính thứ tự đơn→burst tái hiện lỗi, nên không gộp hai stimulus thành cùng một phép kiểm.

**Bằng chứng:** artifact `smoke-stopped.json`, `http-stopped-repeat.json`, `http-stopped-numeric.json`, `http-native-after-single.json`, `http-fetch-diagnostics.json` cùng các script tương ứng. A chỉ kiểm failure HTTP tuần tự; kết quả A không đủ bao phủ ca này.

**Đề nghị A:** sửa deadline end-to-end và xử lý dependency/probe/pool sao cho request bị lỗi vẫn kết thúc có thời hạn; thêm regression đơn→burst với Redis stop, giữ assertion status/deadline. Không chỉ tăng timeout client hoặc thay FAIL thành PASS.

### B7-RC3-02 — P2: wrapper tenant chưa bảo toàn tenant ở business sinks của reconnect

**File/dòng:** [app.ts:614](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/app.ts:614) → [zalo-pool.ts:339](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/modules/zalo/zalo-pool.ts:339), [zalo-pool.ts:412](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/modules/zalo/zalo-pool.ts:412), [zalo-pool.ts:581](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/modules/zalo/zalo-pool.ts:581), [zalo-pool.ts:648](F:/ZaloCRM-candidates/reports-20261103-1023/backend/src/modules/zalo/zalo-pool.ts:648).

**Trigger:** org sweep đã chọn nick hợp lệ và gọi implementation reconnect thật, SDK login/profile trả kết quả tổng hợp qua stub. Source pool và các write profile/status/status-log thực sự được chạy; không gọi provider.

**Expected theo phạm vi RC-2:** query/update nghiệp vụ tiếp tục mang tenant đã enumerate, có predicate phù hợp; không coi lớp wrapper là bằng chứng đủ.

**Actual:** profile update ở dòng 412 và block updateAccountDB dòng 581 gọi `runSystemQuery`, thay context thành `orgId='*', bypassTenantGuard=true`. Các update account theo ID không có org predicate; updateMany nhả UID archived cũng không có org predicate. Status transition được bọc system context ở dòng 648. Trace app role B ghi rõ business `update/updateMany` trong bypass; vì vậy các write đó **không được tính là bằng chứng tenant isolation**, dù guard/RLS config vẫn bật.

Đây là bypass có sẵn trước RC3, không phải patch RC3 thêm API đặc quyền mới. Outer boot query có filter org và truyền ID từ kết quả tin cậy; B không chứng minh input từ org X ở boot có thể tự chọn ID org Y, không khẳng định đã có exploit chéo org. Finding là phần invariant nghiệp vụ được yêu cầu kiểm vẫn chưa đạt ở callee; câu “helper không bypass” chỉ đúng cho helper, không mở rộng được thành “toàn đường reconnect không bypass”.

**Ảnh hưởng:** guard/RLS không còn là đối chứng tenant ở các sink này; sự an toàn phụ thuộc vào input/caller và các query phụ thay vì biên đã yêu cầu. Không thể chốt RC-2 PASS toàn đường từ nonempty reconnect stub hiện có.

**Bằng chứng:** `independent-reconnect-callee.mjs/.log`: 23 assertion chức năng đạt, có SDK X/Y, await, listener callback registration, dynamic import, child writes, lỗi login→qr_pending; `businessBypassObserved` tách riêng. Không dùng owner hay write bypass để chứng minh tenant isolation.

**Đề nghị A:** phân biệt bootstrap identity lookup được phép với write nghiệp vụ, thu hẹp các business sinks về tenant/predicate đã xác minh; bổ sung app-role test đi xuyên profile/status/log với nonempty SDK stub. Giữ các guard manual/ghost/UID và không mở thêm bypass để làm test xanh.

## 3. Kết quả từng RC và các check mới của B

| Lớp | Kết quả B mới | Giới hạn |
|---|---|---|
| RC-1 auth mock | PASS | thành công gọi done rồi return; từ chối chỉ gửi 401, không done; 50 UID assertion còn nguyên |
| RC-1 Message assertion | PASS | đối chiếu E-1/O-1, guard inventory và regression tenant; không chỉ tin expected mới; schema default assertion giữ nguyên |
| RC-2 daily/overdue/backfill/action | PASS trong fixture đã exercise | không suy thành mọi job/provider trong app đã kiểm |
| RC-2 nonempty reconnect | FAIL invariant tenant ở callee; chức năng stub đạt | finding B7-RC3-02; không gọi provider thật |
| RC-3 | FAIL | finding B7-RC3-01; pause/recovery tốt không xoá stop/concurrency FAIL |
| Targeted report/tenant/job/health | 339/339, 35 file | đọc helper/test, network guard chặn kết nối ngoài PG B; đây gồm unit/mock/PGlite, không tự gọi là DB16 integration |
| DB/jobs B | 51 assertion | actual cron callbacks/query/update trên app role; provider/cron scheduling được stub |
| Action child writes B | 15 assertion | service appointment + system notification thật; recipient upsert, Message trigger/RLS và conversation update thật; chỉ SDK và Redis anti-spam stub |
| Reconnect callee B | 23 assertion chức năng | query/write thật, SDK/follow-up provider adapter stub; bypass trace không phải isolation proof |
| Regression P2 | 16/16 | disposable Git fixtures; không thực thi deploy.sh |
| Bash syntax / git diff --check | exit 0 | syntax không phải deploy rehearsal |
| Backend build | exit 0 | TypeScript compilation, không gọi là test nghiệp vụ |
| Frontend | không rerun toàn suite | RC2..RC3 không đổi frontend; image rebuild dùng cache build, không có frontend test mới |

Hai lần đầu helper DB B thất bại được giữ ở `independent-db-jobs-attempt1.log` / `attempt2.log`: linker harness gán nhầm import `node:crypto`, làm `createHmac` không phải hàm. Sửa **linker B trong artifact**, không sửa runtime/test candidate hoặc giảm assertion. Reset riêng trạng thái appointment fixture B bằng owner setup, không xóa ledger/tắt constraint; lần cuối 51 assertion đạt. Lượt child-action 15 và reconnect 23 là check bổ sung độc lập; không cộng thành chỉ tiêu 21/21 của A.

`forEachOrganization` chỉ enumerate `Organization.select.id`, không mở privilege mới. ALS thật giữ context qua await/concurrent sweeps và phục hồi sau callback. Daily reminder dùng `io.to('org:<id>')`; room được socket-auth join từ JWT đã verify, `org:join` cũ là no-op. B kiểm room/cập nhật reminderSent với dữ liệu X/Y, idempotent lần chạy kế; không chạy socket client thật.

Action guard chống overlap được exercise với promise stub đang chờ; sent tăng count, failed giữ count và ghi cooldown. Child check bổ sung đi vào service notification thật qua dynamic import, ghi Message và conversation dưới app role, foreign rows không thấy. Chưa coi các outcome/provider thực tế khác ngoài các nhánh đã nêu là đạt toàn bộ.

**Hành vi lỗi/overlap:** lỗi org trong helper propagate và kết thúc sweep, org sau không chạy; test B quan sát visited=1/2. Daily/overdue/backfill không có lock chống overlap giữa các lượt; action có lock trong một tiến trình. Daily idempotency chỉ chứng minh chạy tuần tự, không chứng minh exactly-once đa tiến trình. Backfill dựa partial unique constraint; race/error có thể kết thúc sweep. Đây là rủi ro vận hành được ghi rõ, không gọi “một org lỗi không ảnh hưởng org sau”.

**Await reconnect:** HTTP listen và shutdown handlers đã được thiết lập trước block reconnect; chờ reconnect không chặn HTTP startup listener. Nó đổi việc khởi tạo thành tuần tự theo account/org. Stub pending chứng minh org sau chưa được scan khi account trước chưa settle; rejected promise được catch theo account, lỗi selection/decrypt có thể thoát sweep. Pool còn catch nhiều lỗi nội bộ và persist qr_pending. Chưa có deadline boot-level cho SDK; không suy zero-session scan thành reconnect có session đạt. B dùng credential/session giả trong bộ nhớ, không đọc session thật.

## 4. PG16/RLS và cấu trúc database

Container B `b7-rc3-pg-133547`: image sẵn có `postgres:16-alpine`, PostgreSQL 16.15; tmpfs `/var/lib/postgresql/data`, không host-data mount, port `127.0.0.1:55693`, DB `b7`. Xác minh current_database/version và **0 public tables** trước ghi. Internal network có app/client/probe; riêng PG nối thêm bridge để công bố loopback cho Prisma local, app/client không có bridge/Internet.

`prisma migrate deploy` thành công; không `db push`. Áp nguyên tenant-rls.sql bằng owner chỉ cho setup, transaction ON_ERROR_STOP. Fixture tổng hợp X/Y, không session/provider key; owner chỉ migrate/role/fixture setup, không làm assertion isolation.

Catalog cuối: **129 migration, 0 unfinished/rolled-back; 123 bảng; 4 trigger không internal; 103 policy; 102/102 bảng có org_id ENABLE+FORCE RLS**. Role `b7_app`: NOSUPERUSER, NOBYPASSRLS, sở hữu **0 bảng**. Ledger/trigger/constraint giữ nguyên. Không gọi DB đã sửa cấu trúc là migration rehearsal.

B đã kiểm own X/Y work, foreign read/update/insert từ chối, thiếu tenant app guard và raw RLS read/write, async/concurrency, overdue thật, backfill thật/idempotent, daily/action/các child writes. Không rerun full canonical/6a3/28-table matrix; không dùng số lịch sử của A làm kết quả B. Reconnect business bypass là ngoại lệ đã nêu, không được gộp vào chứng minh RLS.

## 5. Full-suite baseline: chỉ đối chiếu lịch sử A

B **không rerun full suite** vì failure mới đã được quyết định bằng check tập trung/smoke; không tuyên bố full-suite PASS. Các kết quả sau là đối chiếu log lịch sử A:

- Candidate: **33 file FAIL, 6 test FAIL, 1119 PASS, 1 skip**, 165 file.
- Final baseline RC2: **35 file FAIL, 8 test FAIL, 1111 PASS, 1 skip**, 164 file.
- Parser B độc lập tìm **29 suite import/setup failures** ở mỗi bên, 6 và 8 test failure headings; failed file count không phải số heading.
- Hai baseline-only test đúng RC-1: Message guard expected false; UID cap timeout 5 giây. Candidate không còn timeout đó. Không có candidate-only failure name trong log cuối; `full-comparison.json` A khớp parser B.
- Các test fail chung gồm org branding (2), profile media (1), profile last-online/error (2), ghost reconnect select assertion (1). 29 import/setup failures là module automation/EE/Facebook/Zalo-ads thiếu hoặc đường `/src/...` không resolve. Error/heading chi tiết ở `evidence-audit.json`; shared không tự đồng nghĩa harmless hoặc miễn gate.

`baseline-full.zip` có đúng **1377/1377 đường dẫn** RC2, không extra/missing. So Git blobs: 133 file khớp byte, 1239 chỉ khác CRLF/LF, 5 đường nhạy cảm được bỏ qua content theo ràng buộc không đọc secret. Không có mismatch nội dung ở 1372 file được phép đọc. `baseline-rc2.zip` là export backend subtree 670 entry, không có layout repo đầy đủ; không dùng lần ENOENT đó làm baseline hợp lệ.

Package manifests/lock, Vitest config, schema/migrations không đổi RC2..RC3. A ghi cùng dependency junction, Node/config, DB migrated riêng cho candidate/final baseline; migration logs/tên DB và failure origins nhất quán. Vì export/junction/DB A đã được dọn và log không lưu toàn bộ attestation Node/dependency binary, B chỉ xác nhận phần có thể đối chiếu lịch sử, không chứng nhận đã tái chạy cùng môi trường hoặc độc lập xác minh mọi binary của A. Môi trường B local Node26/image Node22 được ghi riêng.

## 6. Image, source binding, payload và smoke

| Identity | Giá trị xác minh |
|---|---|
| A tag | `zalo-crm-rc:reports-rc3-20261103` |
| Docker local inspect .Id / index digest A | `sha256:50e8dd553ec4f37a19b6aad77ea17ee141cbdbb8c1903ca38be7997093aea743` |
| RepoDigests local A | `zalo-crm-rc@sha256:50e8dd553ec4f37a19b6aad77ea17ee141cbdbb8c1903ca38be7997093aea743`; không chứng minh đã publish registry |
| Platform manifest (build log) | `sha256:7e858739c5511d5ee0e33bda7ff613f46870dad689fe5a58f402570b8722e8e4` |
| Image config digest (build log) | `sha256:950c36d1c0368fdba1c91a649cfe9a57e5a723754b09b9c8bb0123e194427c89` |
| B rebuild tag tạm | `zalo-crm-rc:reports-rc3-7b-133547` |
| B index digest | `sha256:05db94ec457359c24bce477a509ab116311c761912bcc46629d67c62f56bbf5a` |

B chạy clean-worktree gate trước build, dùng context candidate sạch, Dockerfile nguyên trạng. Attempt `--network none --pull=false` không đủ cache cho bước apk và FAIL; giữ log. Attempt tiếp theo được phép mạng build package, `--pull=false`, tất cả layer cache HIT và thành công; không pull image mới. Đây là independent invocation/cache-backed rebuild, **không phải cold clean dependency install**. Giữ giới hạn này khi đánh giá reproducibility.

Rebuild B có cùng platform manifest, config digest, filesystem layers và **1609/1609 hash file ở dist/scripts/prisma/static** với A. Khác index digest được giải thích trực tiếp bằng attestation manifest khác trong hai build log, không viện cớ chung chung “digest có thể khác”. Backend dist/scripts/Prisma cũng khớp build/source local; frontend dist local có khác bundle hash nên không dùng nó làm binding, dùng rebuild context/layer và full static hashes thay thế. Không dựa label/hash đơn lẻ.

Image A: Node v22.23.4; static index/bundle có mặt; app-owned inventory **1611 file**, không có `.env*`, verification helper, tests/spec/fixtures, artifacts hoặc connector TikTok trong các tree app-owned. Không đánh đồng tên marketing leadgen/model TikTok còn chủ ý với connector. `node_modules` là third-party payload, không tuyên bố đã audit/xóa test/fixture nội bộ dependency.

Inventory đúng **13 operational scripts**: backfill-contact-inbound.mjs; backfill_profile_2026_05_29.ts; channels/backfill-message-org-id.ts; cleanup-ghost-nicks.ts; dedup-globalid-dryrun.mjs; migrate-conv-tab-indexes.mjs; seed-demo-data.ts; seed-demo-muctieu.ts; seed-project-blocks.mjs; split-mismerged-contacts.ts; tg-provisioner-login.mjs; update-block-greetings.mjs; wave_1_5_backfill.sql. Inventory/hashes giữ ở artifact, không chạy chúng.

Smoke chạy image A, app/client/probe chỉ trên Docker internal network, không publish app/client port. `NODE_ENV=test`, `MARKETING_DRY_RUN=true`, `OPIK_ENABLED=false`, guard enforce/RLS bật; không sửa runtime để tạo test mode. JWT sinh trong bộ nhớ, không ghi artifact. Fixture không chứa session/provider key. SDK test ngoài app dùng adapter giả, không liên lạc provider.

| Smoke mới B | HTTP kết quả |
|---|---|
| Healthy | live 200; readiness 20/20 200, max 51 ms |
| Redis stopped | 19 response 503 + **1 timeout FAIL** ở 4003 ms |
| Stop recovered | 20/20 readiness 200, max 33 ms |
| Redis paused | 20/20 readiness 503, max 2019 ms |
| Pause recovered | 20/20 readiness 200, max 41 ms |
| Route reports | overview/sales-performance/automation-summary/broadcast/ai: X và Y đều 200; response không chứa user ID tenant kia |
| Deny/control | thiếu auth 401; token user X khai org Y bị report gate 403; TikTok POST 404 |

Raw healthy smoke **43/44**, do harness kỳ vọng token chéo org phải 401 trong khi contract report gate trả deny 403. Giữ nguyên FAIL harness, không đổi file kết quả hoặc hạ assertion; đánh giá riêng actual 403 là deny đúng, không phải bypass. Các check report không chứng minh mọi field/route đều không leak; đây là representative smoke, bổ sung bởi DB assertions.

Probe module trực tiếp: 40 caller đồng thời chia sẻ cùng promise; worker object giữ nguyên, queue/offlineQueue quan sát 0, worker ready sau pause/recovery. Sáu sample pause có 3 lần promise chưa settle ở 2400 ms; sample sau dùng cùng promise và settle sau khoảng 1100 ms nữa. Ioredis `disconnectTimeout` mặc định 2000 ms làm `disconnect()` không phải hard abort ngay ở mốc 1500 ms. Quan sát chu kỳ xấp xỉ 3500 ms, socket/timer snapshot dao động rồi phục hồi, không thấy tăng đơn điệu trong finite sample; không dùng finite sample chứng minh không leak vô hạn trong mọi môi trường. Outer health 2 giây vẫn trả 503 cho pause, nhưng chưa giải quyết finding stop/concurrency. Không thấy probe disconnect worker; không chạy workload BullMQ/provider thật.

Startup/job log app không có tenant-guard errors RC-2 trong phần được exercise: overdue boot, backfill hai account, reconnect scan 0 saved sessions. Không dùng scan 0 đó chứng minh reconnect hoạt động; nonempty wrapper và actual pool SDK-stub check là bằng chứng khác, có giới hạn/bypass đã ghi.

## 7. Bằng chứng A được xác nhận hoặc chưa đủ

- Xác nhận danh tính tag/commit/image và diff A bằng Git/Docker thực; source-before/source-after A **985/985** và candidate-source A **986/986** khớp file hiện tại, remediation.patch hash khớp diff độc lập.
- Xác nhận mới 339 targeted, 16 P2, build/syntax/diff; không chỉ chép số trong checkpoint A.
- A `db-test.log` 21 assertion hợp lệ trong phạm vi helper đã đọc; helper đó không chạy actual daily/action/reconnect, không đủ thay thế các check child B mới. Không dùng 21 làm chỉ tiêu.
- A smoke tuần tự/recovery JSON phù hợp claim HTTP/status/timing của chính nó; không đủ suy concurrent stop đạt. B bác bỏ diễn giải mạnh rằng RC-3 đã bounded end-to-end trong mọi ca được yêu cầu.
- A startup 0 session là đúng log quan sát, chưa đủ chứng minh saved-session reconnect. B bổ sung fake adapter, phát hiện callee business bypass vẫn tồn tại.
- Full-suite comparison A đúng về tên failure và full final archive; vẫn FAIL và là evidence lịch sử, không miễn gate.
- Image payload/source binding được B bổ sung rebuild, layer/hash đối chiếu; không dựa duy nhất image ID do A báo cáo.

## 8. Integrity, cleanup và bàn giao

Snapshot B trước/sau: **root 996/996 tracked source/test/Prisma/scripts/build/ops inputs không đổi; candidate 1019/1019 không đổi**. So rộng thêm các cây nguồn trong snapshot A của root **985/985 không đổi**; check rộng này là đối chiếu snapshot lịch sử đã xác nhận, không giả là snapshot B mới ở đầu phiên cho mọi untracked path. HEAD/branch hai repo giữ nguyên; candidate sạch, diff --check exit0. Root dirty sẵn có được giữ nguyên; chỉ thêm artifact 7B và báo cáo này.

Đã xóa đúng container `b7-rc3-app-133547`, `b7-rc3-probe-133547`, `b7-rc3-redis-133547`, `b7-rc3-pg-133547`, network `b7-rc3-133547`, và tag/image B `reports-rc3-7b-133547`. Port 55693 hết listener. P2 tự dọn fixture tạm. Giữ candidate, branch, RC2/RC3 tags, image A (identity kiểm lại không đổi), các image nền sẵn có, artifact A và hai container phiên khác. Build cache có thể còn; không prune cache/image chung.

Các file chính của B: `integrity-comparison.json`, `summary.json`, `evidence-audit.json`, `baseline-normalized-audit.json`, `db-final-catalog.txt`, `independent-db-jobs.log`, `independent-action-children.log`, `independent-reconnect-callee.log`, `http-native-after-single.json`, `image-independent-hashes.txt`, `cleanup-after.txt`, `patch-risk-assessment.json` (validator exit0). Tất cả script B nằm trong artifact mới.

**Bàn giao lượt A:** sửa B7-RC3-01 và B7-RC3-02 theo phạm vi riêng, giữ test có đối chứng và yêu cầu B kiểm lại; không tự sửa trong lượt này. RC-4 và secure fallback cần lượt riêng sau đó. Dù lần kiểm remediation sau đạt PASS, việc phát hành VPS vẫn phải qua các gate đã nêu ở đầu báo cáo và có approval sản xuất.
