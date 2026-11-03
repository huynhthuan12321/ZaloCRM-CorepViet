# Bước 7A — Hồ sơ phát hành module Báo cáo

Bắt đầu **02/11/2026, 22:54 (+07)**, Asia/Ho_Chi_Minh. Trạng thái hồ sơ: **COMPLETED_PENDING_VERIFICATION**; trạng thái phát hành: **BLOCKED / NOT_READY**. HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`; candidate là **working tree chưa commit**, không có release tag, image digest hoặc commit mới. **7B NOT_STARTED.** Chưa chạy package/image, migration, deploy, backup hoặc rollback thật.

Artifact riêng: [reports-release-7a-20261102-225424](../../artifacts/reports-release-7a-20261102-225424/). Đây là hồ sơ để review; **candidate chưa đủ điều kiện phát hành** do các preflight bên dưới. Không đồng nhất việc hoàn tất hồ sơ7A với production READY.

## 1. Phạm vi, nguồn và tính toàn vẹn

Đã đọc prompt người dùng đính kèm, quy tắc chung, contract0, các audit11/12, remediation E-1/O-1, báo cáo B5/B6 mới nhất, roadmap và README. Không tìm thấy AGENTS.md trong repo/ancestor ổF; áp dụng chỉ dẫn AGENTS người dùng cung cấp. Đã dùng vue-best-practices để đối chiếu trách nhiệm view/layout/composable và đường truyền dữ liệu; không refactor hoặc sửa Vue/runtime. Không dùng agent/worktree, dependency mới, stage/reset/stash, commit/push/merge/deploy; không mở .env/bí mật hoặc dùng production/provider/send/AI trả phí.

`b-evidence-reuse.json` đối chiếu snapshot B20:52: **975/975 source/test/Prisma khớp**, không thêm hoặc mất file thuộc bốn cây đã snapshot. `evidence-index.json` kiểm16 phép đối chiếu số đếm/log đã lưu, **16/16 đạt**. Đây là kiểm nhất quán bằng chứng, **không phải16 test ứng dụng mới**. Package/node_modules/image của B không có snapshot dependency đầy đủ, nên hash source khớp không chứng minh image sạch hoặc install lại sẽ giống nhau.

Không thay đổi trạng thái5B/6B: vẫn **PASS local trên whole working tree đã kiểm**. Giữ mọi FAIL/diagnostic cũ và các điều kiện giới hạn; không chỉnh artifact B. Source local đang có thay đổi AI/channel/TikTok không thuộc candidate báo cáo. Chưa biết revision thực tế đang chạy trên đích phát hành; HEAD ở đây chỉ là mốc so diff, **không được coi là production base hoặc baseline test phù hợp**.

## 2. Candidate, ownership và dependency

Manifest review: [candidate-manifest.json](../../artifacts/reports-release-7a-20261102-225424/candidate-manifest.json), mỗi entry có path, purpose, category, git status, SHA256 hiện tại và direct local import dependencies. [candidate-hunks.json](../../artifacts/reports-release-7a-20261102-225424/candidate-hunks.json) ghi khoảng dòng cũ/mới và quyết định theo hunk. Parser import là tĩnh, không thay compiler hoặc chứng minh toàn bộ dependency/runtime graph.

`diffs/candidate-review-with-mixed-context.diff` chỉ là **diff tracked để đọc**, giữ cả context đan xen. Nó không chứa nội dung new/untracked đầy đủ và **không phải patch có thể apply/package/deploy**. Những file mới phải đi cùng manifest/source đã review, không chỉ diff này. SHA256 của file mixed là hash toàn file đã được B kiểm, không phải hash của riêng hunk định đưa vào candidate.

| Nhóm | File/đường gọi và quyết định |
|---|---|
| Scope, kỳ, KPI và canonical | `backend/src/modules/dashboard/report-scope.ts:18–106`, `report-period.ts`; `report-analytics-routes.ts`; `response-turns.ts:8–25`; baseline `report-routes.ts:35–192` và `excel-sheet-builders.ts`. Scope backend áp cả raw SQL/aggregate/export, không chỉ menu |
| Analytics/custom/saved | `backend/src/modules/analytics/analytics-routes.ts:33–85` → `analytics-service.ts:6–16` → `reports/{conversion-funnel,team-performance,response-time,custom-report}.ts`; `saved-report-routes.ts:35–131`. Baseline dependency phải được giữ dù không có delta vsHEAD |
| Báo cáo AI | `ai-report-routes.ts:12` → `ai-report-service.ts:47`; frontend types/`AiReport.vue`, `AiReportSection.vue`, `ReportTable.vue`. Độc lập với thay đổi **AI send policy** ngoài phạm vi; không đưa thay đổi send policy vào candidate chỉ vì cùng chữ AI |
| Auth/Prisma/ALS | `auth-middleware.ts`, `auth-routes.ts:34–38 và :97`, `prisma-client.ts:128–157`, `tenant-context.ts:90–115`, `org-scoped-models.ts:15–64`. Cần để login/profile, query aggregate và102model chạy đúng tenant; không được cắt như thay đổi ngoài report |
| E-1/O-1 | `backend/prisma/rls/tenant-rls.sql:639` thêm28policy; `automation-report-routes.ts:56–59`, `broadcast-report-routes.ts:45` dùng DB role hiện tại. Dữ liệu TikTok còn trong schema cũng được bảo vệ; điều này không khôi phục connector |
| Caller sau mở rộng guard | `group-scan-worker.ts:39–51` locate org rồi scoped reread; `appointment-public-routes.ts:24/:44/:73` capability/HMAC → tenant; `integrations/providers/telegram-bridge/link.ts:38/:52` identity bootstrap. Đây là dependency của guard dùng chung, không phải mở scope connector/send |
| UI/mobile | `ReportsView.vue:64/:73/:158–203`; các view `views/reports`; `ReportsShell.vue`; `ReportContext.vue`, `ReportDetail.vue`; layout/BottomNav, report-access/avatar helpers, report-kit.css. `use-mobile.ts:9–33`, compact composable:23–46 và airtable.css:540/:558 giữ F3/F4 |
| Router/registration | Frontend router:91–102/:380 là report gate/AI. **Backend app.ts mixed**: chỉ hunk `@@ -341,0 +339,2 @@` đăng ký aiReportRoutes thuộc report;4hunk xoá TikTok ở current32/48/292/408 nằm ngoài candidate này |
| Test và review docs | Report/tenant/auth/AI/mobile/caller regression; contract/checkpoint/B5/B6/E1O1 và hồ sơ7A. Là bằng chứng review/test, không copy vào production payload |

Không reset hoặc tự tách `app.ts`. B đã build/test toàn file có cả các hunk ngoài phạm vi; candidate tách report chưa được dựng độc lập. Chỉ có manifest/hunk selection không đủ suy ra candidate sẽ build hoặc vẫn PASS6B. Trước khi tạo release artifact, phải chốt baseline được phép dùng, bao gồm quyết định xử lý việc TikTok đã bị xoá trong workspace; **không được phục hồi connector như tác dụng phụ của việc chọn base**.

Manifest đánh dấu ngoài scope: AI send/auto-reply policy, chat settings, channel/mock connector, phần xoá TikTok và các test/ops tương ứng. Các thay đổi đó được giữ nguyên trong workspace, không stage hoặc đưa vào candidate. Không đưa `.env*`, fixture, token, browser profile, node_modules local, artifacts hoặc `backend/scripts/reports-verification/**` vào production payload.

## 3. Hành vi người dùng và contract phát hành

| Nội dung | Hành vi cần giữ và release note |
|---|---|
| Quyền | Owner/admin hiện tại xem trong org. Trưởng/phó phòng có report access xem subtree, kể cả leader một mình; member/người thiếu grant giữ deny trong rollout nền. CEO/Marketing/HC–NS/self-report mở rộng chưa được tự bật. Automation/Broadcast/Audit vẫn owner/admin, menu không thay backend authorization |
| Thu hồi quyền | Cùng JWT chưa hết hạn: downgrade/inactive/grant bị thu hồi phải có hiệu lực ở report request kế tiếp theo đường đã kiểm; không lấy role claim cũ quyết định Automation/Broadcast |
| Main/shared/privacy | Chia sẻ contact/nick không cấp quyền xem cả org. Main KPI theo scope chính; shared tách riêng, không gộp thành thành tích phòng. Actor attribution theo nhân viên có bằng chứng, giữ bucket chưa xác định |
| Kỳ | Ngày Asia/Ho_Chi_Minh; from/to inclusive ở API và truy vấn timestamp nửa mở theo helper.7/30ngày và kỳ trước đúng độ dài, không suy ngày từ timezone máy. SQL DATE được xử lý riêng; Engagement daily/heatmap có giới hạn nguồn đã ghi |
| Snapshot/cohort/event | `/reports-co-ban`: “Trạng thái hiện tại — không giới hạn theo kỳ” tách “Khách mới trong kỳ”, kỳ chỉ gắn response tải thành công. Các KPI snapshot khác cũng phải giữ nhãn; không tạo asOf giả |
| Canonical | **Số trên Excel/custom/saved/report có thể giảm** do loại contact merged và tin local/deleted/dry-run/test/virtual theo định nghĩa đã nghiệm thu. Không sửa số hoặc gắn lại dữ liệu test để khớp bản cũ; đối soát cùng predicate/scope/kỳ |
| Thời gian phản hồi | Tin cuối của lượt chờ từ khách → phản hồi người đầu tiên; AI/bot không đóng lượt. Pending/unattributed và main/shared tách theo contract; không đổi thành tin đầu của khách |
| Null/0/error/stale |0 đo được khác null/unavailable. Error/loading không để kỳ mới mang số cũ. Giữ retry/guard response muộn và nhãn khi ô ngày chưa gửi. Không thay unavailable bằng0 hoặc chi phí/token giả |
| AI | Báo cáo aggregate tin AI đã ghi nhận gửi, phân loại khi có bằng chứng và nháp đã tạo cần duyệt; không coi suggestion là model call/cost, audit best-effort không chứng minh nguồn đầy đủ. Không đổi policy gửi AI hoặc quota usage |
| Mobile/accessibility | F1/F3 menu/overlay/focus, F4 breakpoint CSS lẻ, contrast và drill-down phải giữ. Chưa nghiệm thu Safari/iPhone/PWA thật |

Endpoint phát hành gồm12GET nhóm report (`overview`, `nick-fleet`, `sales-performance`, `pipeline`, `lead-pool`, `automation`, **`automation-summary`**, `broadcast`, `engagement`, `audit`, `ai`, `crm-usage`), basic `messages/contacts/appointments/export`, analytics `conversion-funnel/team-performance/response-time/custom`, saved-report CRUD/run. Giữ `/ai/usage` đúng nghĩa riêng, không đổi thành số model call. Route đăng ký tại `app.ts:337–340/:354–355/:373–376`; frontend main.ts:14 import report-kit.css. Null consumer/type phải được build thành một cặp backend/frontend tương thích.

## 4. Build/test/package và bằng chứng còn hiệu lực

**Không chạy mới DB/browser/full suite/build trong7A**, vì không sửa runtime và source B vẫn khớp. Các số sau được tái sử dụng có điều kiện từ B, không gọi là kết quả mới7A. `evidence-index.json` có path/hash/layer của từng nguồn. Xem lệnh đã thực hiện trong [commands B](../../artifacts/reports-5b6b-e1o1-20261102-205238/commands.md); ký hiệu P trong đó là prefix helper, không phải một lệnh copy chạy nguyên văn.

| Lớp | Bằng chứng B đã đối chiếu |
|---|---|
| Unit/mock/PGlite và DOM | Backend306/306,30spec; frontend161/161,20spec. Không thay DB/JWT/browser |
| Integration owner riêng | Refresh10/10, DB thứ4; không dùng table owner PASS chứng minh RLS |
| DB/app role, Prisma và JWT/HTTP | Canonical710/710 (contract60/60),6a3API129/129, Engagement/funnel/team/saved189/189, singleton/JWT revocation18/18, RLS90/90+14/14, E1/O1 boundaries524/524, inventory104/104 |
| Browser |40layout,82avatar/789mẫu chữ, F3 CSS1099.248px/innerWidth1099 hai lần, F4 CSS767.669px;9route mới API200,27loading/error/retry, snapshot9/9, drill-down3/3, role UI và AI4scope. Giữ generic33/36, guard cũ13/14 và stimulus/login/selector lỗi ở artifact B, không biến thành mọi runner đều xanh |
| Build local | Backend `npm.cmd run build` → tsc; frontend `npm.cmd run build` → vue-tsc -b + vite: PASS trong B. Cảnh báo chunk>500kB giữ nguyên; không có bằng chứng package/image hoặc clean install |

Backend package.json: build=`tsc`, test=`vitest run`, start=`node dist/app.js`; `db:migrate` là **prisma migrate dev**, không phải lệnh production. Frontend build=`vue-tsc -b && vite build`; test=`vitest run`. Package/schema/migration paths không có delta vsHEAD trong lượt rà này; không suy schema đích đang chạy giống HEAD.

Image hiện có: `docker/Dockerfile:2/:21/:37` Node22-alpine, frontend `npm ci --legacy-peer-deps`, backend:31 dùng **npm install**, :33 generatePrisma với URL build giả rồi tsc. :49–56 ghép backenddist + static frontend, Prisma và scripts vào một image, CMD:65 là node dist/app.js. LocalNode hiện24.21.0; DockerNode22 và lock/install/native modules chưa được dựng đối chứng. Không tự cài thêm dependency để làm hồ sơ xanh.

**P2 packaging BLOCKED:** `docker/Dockerfile:55` copy toàn bộ backend/scripts; `.dockerignore` không loại reports-verification. Theo source, các fixture/helper này sẽ có trong `/app/scripts/reports-verification` khi build từ workspace hiện tại. Đây là kết luận tĩnh, không phải đã inspect image mới. Cần một lượt sửa/chuẩn bị packaging riêng hoặc build context allowlist có thể tái lập, giữ các ops script cần thiết nhưng loại helper/test/local data. Không sửa Dockerfile hoặc tạo image trong7A. Sau đó inspect final image manifest và chạy smoke trên đúng digest; không coi backend/frontend build local là hoàn tất packaging.

## 5. Preflight còn thiếu và điều kiện dừng

| ID/trạng thái | Kiểm tra, môi trường và dữ liệu | Đạt khi / dừng khi | Bằng chứng phải lưu |
|---|---|---|---|
| P1 **BLOCKED** candidate isolation | Chốt release base thực tế bằng metadata được phép; tạo candidate immutable từ manifest/hunk đã review, giữ new files và dependency, loại đúng ngoài scope. Không sửa checkout hiện tại hoặc tự worktree/commit trong7A | Có base/candidate digest, ownership rõ, candidate độc lập build và kiểm5B/6B phần bị ảnh hưởng. Dừng nếu phải mang hunk ngoài scope/khôi phục TikTok hoặc dependency thiếu | Base/candidate manifest, patch/new-file hashes, approval scope, build/test tương ứng |
| P2 **BLOCKED** package hygiene | Sửa/chuẩn bị packaging ở lượt được phép, Node22 Linux/native modules và dependency install theo cơ chế đã review | Final image không có .env/token/fixture/profile/verification helpers; backend/frontend pair và dependency tree tái lập. Dừng nếu source scope hoặc content image khác manifest | Image digest/SBOM hoặc file list hiện có, build log, dependency versions, script allowlist; không cài telemetry/tool mới chỉ để đủ mục |
| P3 **BLOCKED** full suite/baseline | Hai bản current/baseline được chứng minh chỉ khác patch cần so, cùng Node/lock/env/test config, DB disposable riêng, app-role report tests và owner fixture tests tách. Xác minh/mô phỏng send/provider/cron/queue/socket trước chạy | Không regression thuộc candidate; mọi FAIL được định danh, so cùng điều kiện và đánh giá rủi ro. Dừng nếu baseline chỉ là HEAD không tương đương, side effect chưa cô lập, hoặc có lỗi mới chưa hiểu | Source/env fingerprints không secret, lệnh/exit/test names/stack/log cho cả2. Không skip/xoá/nới assertion |
| P4 **NOT_VERIFIED** upgrade DB/RLS | PostgreSQL16 theo Compose, DB disposable khôi phục từ fixture migration-state an toàn tương đương đích; rehearsal migration history và SQLRLS tách riêng |0unfinished migration, schema phù hợp102org tables,103forced/policy (hoặc inventory mới được review), app role non-owner/non-super/non-bypass; real cross-org/deny/freshJWT/aggregate/Excel PASS. Dừng khi missing table, lock/error, role không an toàn hoặc scope lệch | Empty/target proof, schema/migration/catalog before-after, SQL/app-role results, timings/rollback rehearsal |
| P5 **NOT_VERIFIED** restore/secure rollback | Dump fixture có lịch sử migration +policy/role/grants, restore vào container unique network-none; backup đích chỉ sau quyền riêng, không đọc production ở7A | Hash/gzip/restore thật và kiểm dữ liệu/policy/grants/app-role access đều đạt; có cặp image fallback giữ E1/O1. Dừng nếu chỉ có file backup chưa restore, thiếu role/policy, hoặc fallback mở lại lỗ hổng | Dump metadata/hash không data secret, restore log/RTO, image references, compatibility/smoke |
| P6 **NOT_VERIFIED** full bootstrap/staging | Môi trường staging chuyên biệt; fixture2org/2phòng/subtree/singleton/main/shared/merged/0/null; định rõ cách cô lập provider/queue/cron/socket bằng cơ chế sẵn có trước bootstrap | Login, worker/capability caller cần thiết, RLS/config và UI/API đúng trên full image. Dừng nếu phải dùng credentials/gửi thật để kiểm, gặp caller ngoài context, hoặc harness-only404 bị hiểu nhầm production | Runtime-role/config attestations đã che secret, network/side-effect proof, smoke và access logs |
| P7 **NOT_VERIFIED** device/load/monitoring | iPhone/Safari/PWA và workload giả đại diện; xác định nguồn proxy/access log hiện có, đo baseline latency cùng môi trường | Có coverage thiết bị theo yêu cầu rollout, p95/budget được đo và chốt trước production; không tự đặt số ms giả hoặc lấy fixture nhỏ làm SLO | Device/build references, workload/query plan/latencies, ngưỡng được duyệt, nguồn counters403/5xx |

Lịch sử **A39file/9test FAIL** và **B trước35file/9test FAIL** còn nguyên nhưng không phải full-suite baseline mới trên E-1/O-1. Không có đủ baseline/safety để chạy full suite trong phạm vi7A hiện tại; P3 BLOCKED. Không khẳng định mọi lỗi có từ trước. Targeted PASS không giải quyết P3.

Chưa chạy migration replay. B dùng db push rồi SQLRLS; vì vậy P4 không được đánh PASS chỉ từ103policy đã kiểm ở schema mới. 19bảng khôngorg_id chưa được audit toàn bộ relation/endpoint. Các lỗ hổng local E1/O1 đã qua B, nhưng deploy/config/app-role và toàn bộ caller sau guard vẫn cần rehearsal.

## 6. Database/config và thứ tự rollout dự kiến

**Phần này chỉ là kế hoạch, không được thực thi trong7A.** Không có schema migration/backfill mới do candidate báo cáo vsHEAD; có thay SQLRLS28policy và inventory guard30model. Không backfill DailyMessageStat, không dựng số liệu lịch sử giả. Phải đối chiếu migration history đích trước quyết định cần `prisma migrate deploy`; không dùng db push hoặc migrate dev làm upgrade production.

Config đã tồn tại ở `backend/src/config/index.ts:182–185/:222`: **TENANT_GUARD_MODE mặc định off**, **RLS_SET_CONFIG mặc định false**. Không thêm biến mới, không khẳng định server thật đã cấu hình như B. Mức bảo vệ đã kiểm sử dụng enforce/true và app role NOSUPERUSER/NOBYPASSRLS/non-owner. Chỉ apply policy mà quên tenant binding có thể làm request hợp lệ bị từ chối; bật guard102model ảnh hưởng ngoài report. Không đổi default hoặc biến thật trong lượt này.

Thứ tự cần rehearsal trước khi đưa vào runbook vận hành đã duyệt:

1. Hoàn tất P1–P3, xác định candidate/image digest và role/config đích; xác minh môi trường theo hostname/database/instance identity, không lấy DATABASE_URL mặc định làm chứng minh an toàn. Lập danh sách writer/worker và app connection cũ; không hứa bật policy chỉ ảnh hưởng nhóm pilot.
2. Backup+restore rehearsal P5; ghi migration ledger/schema/policy/grants và active app versions. Chốt khoảng bảo trì/cách chặn traffic và dừng writer bằng cơ chế vận hành đã có. Chưa có cơ chế hoặc fallback an toàn thì dừng.
3. Trong môi trường thử đã cô lập, migration owner xử lý **chỉ các migration đã đối chiếu cần thiết**. Sau đó apply tenant-rls.sql bằng owner với transaction/ON_ERROR_STOP và lock/statement timeout đã rehearsal. SQLRLS là bước riêng; ops deploy script không tự làm bước này. Ví dụ tham chiếu: `psql "$VERIFIED_OWNER_URL" -v ON_ERROR_STOP=1 -1 -f backend/prisma/rls/tenant-rls.sql`; URL chỉ cấp qua cơ chế secret đã duyệt, không echo/log. Đây là template chưa chạy, không phải đích thật.
4. Đưa backend/frontend cùng candidate vào môi trường quarantined, tenant binding true/guard enforce và app role đã xác minh; không dùng owner cho app để né RLS. Chưa mở traffic hoặc worker/provider nếu chưa chứng minh cô lập. Catalog+real app-role tests và smoke phải đạt trước mở.
5. Xác minh session/token mới/cũ, static asset cache và toàn bộ role matrix; rồi mới cho nhóm kiểm tra nhỏ qua routing/access vận hành hiện có. Không tạo feature flag mới. Policy DB là thay đổi dùng chung, **pilot ít người không cô lập ảnh hưởng DB cho các connection khác**; không để old app thiếu tenant context tiếp tục chạy cùng policy nếu chưa chứng minh tương thích.
6. Sau soak/observability có bằng chứng và quyền triển khai cụ thể, mới xem xét production. Mỗi môi trường lặp lại proof target/backup/role/catalog/smoke theo image digest, không dùng kết quả disposable thay nghiệm thu production.

Cơ chế sẵn có `scripts/ops/deploy.sh:94–129/:276–305` cần clean commit SHA, tag image và chờ health200 tối đa180giây; không có bước migration/RLS. Hiện dirty/uncommitted nên **không gọi script, không dùng ALLOW_DIRTY/ALLOW_SAME_SHA để lách**. `scripts/zalocrm-deploy.sh:129–154` có backup và migrate nhưng cũng tạo/đổi .env, build/start toàn hệ thống; không tự trộn hai orchestrator hoặc chạy dry-run của chúng ở7A. Sau này chọn một luồng đã rehearsal, tách owner SQLRLS bằng kế hoạch được duyệt.

`/health/ready` tại `backend/src/shared/http/health.ts:20–43` chỉ xác minh DB/Redis;200 không xác nhận RLS/report/quyền/canonical. Không mở traffic chỉ dựa health200.

## 7. Smoke test và oracle sau rollout được phép

Chuẩn bị fixture tổng hợp có2org X/Y, phòng S/M và phòng con S1, leader singleton, deputy có/không grant, member, nick riêng/shared, contact assigned/collaborator/merged và timestamp sát biên VN. Không chép chat/PII production. Seed bằng owner chỉ sau proof disposable/test; request kiểm bằng app role và login/JWT thật. Full bootstrap chỉ được chạy khi P6 có cơ chế mô phỏng/tắt side effect đã xác minh; không dùng một biến giả được tự nghĩ ra làm bằng chứng đã tắt send.

| Ca | Oracle và đạt khi |
|---|---|
| Owner/admin X/Y | Mọi nhóm report đúng org. Gửi thêm orgId/userId/account ngoài scope không mở rộng response/detail/aggregate/Excel. Không dùng menu ẩn chứng minh deny API |
| Trưởng/phó S và subtree | Chỉ sale/contact/nick thuộc scope hợp lệ; S1 thuộc subtree, M/orgY không xuất hiện. Khách được share không mở main scope; shared section tách. Singleton có quyền domain thấy đúng bản thân |
| Member/deputy thiếu grant | Menu/route UI deny và direct HTTP/saved-run deny. Nếu legacy bản đích có cấp khác phải đối chiếu contract, không tự mở self-report hoặc view_all org |
| Owner/admin hiện tại | Automation-summary/Broadcast/Audit hợp lệ. Hạ role DB hoặc inactive trong fixture rồi dùng **cùng JWT chưa hết hạn**, request tiếp bị deny; leader/deputy có grant vẫn không được Automation/Broadcast. Sai token/identity/org bị deny trước dữ liệu |
| Revocation/object ownership | Bỏ report grant rồi custom/saved-run cùng token bị deny. Saved config không lấy scope người tạo; GET/PUT/DELETE object người khác/org khác không được truy cập |
| Canonical tin/contact | Đếm tay hoặc SQL độc lập; canary merged/local/deleted/dry-run/test/virtual không vào KPI/export/custom/saved. AI ghi nhận hợp lệ vẫn được tính trong domain đúng; không credited thành tin người. Tin khách thiếu actor không biến mất khi group theo nhân viên; bucket attribution/main/shared đúng |
| Thời gian | Khách09:00/09:04, AI09:04:30, người09:05 cho sample60giây; pending/unattributed riêng. Sự kiện ngay trước/sau00:00 VN chỉ vào một kỳ; thử UTC server, 7/30ngày, kỳ trước, leap day/invalid/reversed/future appointment. DATE không dịch hai lần |
| Snapshot/basic | Snapshot8 và new6 trên fixture đối chứng; nhãn kỳ chỉ ở khách mới. Đổi ô chưa gửi không đổi nhãn response; loading/error xoá số cũ; retry phục hồi; response cũ không ghi đè. Không thêm timestamp asOf giả |
| Zero/null/error | Kỳ rỗng vẫn có0 khi nguồn đã đo; denominator0 hoặc thiếu nguồn là null/unavailable/reason. Request503 hiện lỗi, không hiển thị0 giả hoặc số kỳ cũ như số mới |
|12report endpoint và9tab UI | Response period/scope khớp nhãn; Automation đúng automation-summary; CRM Usage ước tính/truncation và Audit nguồn log đúng nghĩa; Engagement daily/heatmap/snapshot, coverage unavailable rõ. Không dùng current status để giả lịch sử event |
| Basic/export/analytics/saved | Mỗi sheet Excel khớp JSON/SQL cùng kỳ, không đưa ngoài scope; lỗi export hiện thông báo. Custom/funnel/team/response-time và saved CRUD/run dùng cùng canonical/scope, không gửi nội dung chat/PII thừa |
| AI | Main/shared tách, tổng classified+unknown đúng total, nháp đúng nghĩa đã tạo cần duyệt; cost/token không đủ nguồn không hiện0. Nhãn kỳ/scope khớp response. Không gọi model/send thật hoặc đổi policy để sinh fixture |
| Browser/mobile |9danh mục ở320/390/430/1440 và768/1024/1099/1100; F3 CSS1099,x thực với innerWidth1099; F4 CSS767,x thực. Đóng menu/resize khi còn ở report và trigger hiển thị phải trả focus đúng, Tab kế sang Cài đặt; Escape trả về Điều hướng. Rời report/unmount không giữ overlay hoặc kéo focus về trigger cũ. Contrast thường≥4.5:1, touch targets theo tiêu chí đã kiểm; drill-down trả focus opener |

Fixture/example8/6 và sample60giây là oracle của dữ liệu giả, không hard-code vào sản phẩm. Khi đổi fixture phải tính oracle độc lập mới, không lấy số test cũ làm mục tiêu pass. Lưu URL không auth, status, kỳ/scope, expected/actual, SQL oracle, image digest, ảnh và timestamp; không ghi cookie/JWT/key/body chat. Mock DOM, Fastify inject, SQL/RLS và browser là các lớp riêng.

Trên môi trường thật sau này chỉ dùng record kiểm tra đã được cho phép/đã ẩn danh và read-only probes phù hợp, không seed fixture hoặc downgrade user vận hành. Động tác thay role/grant của smoke chỉ áp dụng fixture trong test/staging chuyên biệt.

## 8. Theo dõi và điều kiện dừng

Nguồn có sẵn: `backend/src/shared/utils/logger.ts:29–43` ghi stdout/stderr theo giờ VN; error handler `app.ts:439` ghi lỗi; `/health/live` và `/health/ready`. Fastify khởi tạo `logger:false` ở app.ts:158; chưa có bằng chứng per-route403/latency counter hoặc dashboardp95 ở môi trường đích. Vì vậy không hứa hệ thống đã có metric này; trước mở production phải xác minh access log proxy/monitoring **đang có**, hoặc quy trình probe/sampling nội bộ có thể lưu số đếm. Không thêm telemetry ngoài/Opik exporter để đáp ứng checklist và không log thông tin xác thực.

| Tín hiệu | Ngưỡng/hành động và căn cứ |
|---|---|
| Cross-org/private leak hoặc stale-role được phép | **Một trường hợp xác nhận là dừng mở rộng traffic ngay**, giữ evidence hạn chế PII. Đây là invariant quyền, không phải error budget theo phần trăm |
| Sai canonical/scope/period/Excel | Một sai lệch đối chứng ngoài rounding đã chốt: dừng, so cùng fixture/predicate/asOf. Không sửa dashboard hoặc làm tròn để che sai |
|403 | Những403 expected trong matrix là PASS.403 ở owner/admin/scope hợp lệ hoặc request vừa được phép trước đó không do revocation: dừng giai đoạn smoke. Với traffic thật phải có baseline số lượng/mẫu đã loại deny hợp lệ trước đặt ngưỡng tỷ lệ |
|5xx/guard errors | Smoke fixture yêu cầu0unexpected5xx/tenant-context errors;503 cố ý của test harness không tính sự cố production. Lỗi thực mới sau policy/guard phải triage trước tiếp tục; không chuyển app sang owner/off để che |
| Readiness | Script hiện có chờ tối đa**180giây**; không đạt thì dừng deploy stage, không tự rollback bản không an toàn. Ready200 vẫn cần smoke chức năng/quyền |
| Độ trễ/lock/query volume | Đo baseline và candidate trên cùngPG16/image/workload, gồm aggregate/export và plan/cardinality. Chưa có SLOms hoặc mức tăng p95 đã chốt; P7 giữ NOT_VERIFIED, không suy số từ B fixture nhỏ. Phải chốt trước production; không tự bịa ngưỡng |
| Unavailable/coverage | Những reason đã có do thiếu writer/zero denominator là expected. Reason mới, truncation/coverage giảm hoặc0 thay null là cần điều tra; so inventory/source và thời điểm trước/sau, không tự gán ngưỡng phần trăm khi chưa có baseline |

Mỗi giai đoạn có người chịu trách nhiệm vận hành được chỉ định trước, thời gian quan sát và đường lưu log đã duyệt. Chưa có tên owner, đích môi trường và thời lượng soak được phép trong phiên này; ghi vào quyết định vận hành trước rollout, không suy từ người tạo checkpoint hoặc tự gửi thông báo cho ai.

## 9. Backup, restore và rollback giữ biên bảo mật

**Chưa thực hiện backup/restore/rollback và chưa có fallback image đã xác minh. P5 còn NOT_VERIFIED; rollback executable còn BLOCKED.** Không có OLD_SHA/secure image thực tế để điền; không dùng HEAD hoặc tag latest làm bản đã kiểm chứng.

Trước mỗi bước ghi DB/policy đã được cho phép, cần backup database (schema, data, migration ledger, policy), ownership/role/grants metadata và những file/media/config references cần phục hồi cặp app. Secret lưu qua cơ chế bảo mật hiện có, không đính vào artifact release. Giữ backend/frontend image digest, source manifest và config key names/trạng thái đã che value để biết chính xác bản đang chạy.

Nguồn hiện có: `scripts/ops/backup-offsite.sh:218–240` dump→gzip validation→checksum/remote check; `backup-media.sh` cho media; `scripts/ops/verify-restore.sh:143–218` container tách `--network none`, restore dump và migration/count checks. Không chạy chúng hoặc chạm backup thật trong7A. Restore helper có cleanup container theo tên, nên sau này phải cấp tên unique đúng prefix và xác minh ownership trước chạy, không dùng mặc định đụng phiên khác. POSTGRES_IMAGE mặc định của restore là16, phù hợp Compose nhưng vẫn phải pin phiên bản đã rehearsal.

Một file dump không rỗng/hash đúng chưa chứng minh backup phục hồi được. Restore rehearsal phải:

1. Kiểm hash/gzip, restore vào DB test đã xác minh rỗng/isolated, đúng majorversion; không restore lên đích vận hành để thử.
2. Kiểm migration ledger completed, schema/types/index và fixture totals; pg_dump thông thường không chứng minh đã giữ đầy đủ global roles. Đối chiếu riêng role ownership/grants và ENABLE/FORCE/USING/WITH CHECK.
3. Chạy app role thật đọc own, deny foreign/no-context/write; exact JWT downgrade/revocation và report/Excel smoke trên DB restore. Ghi RTO/RPO thực đo và điểm dữ liệu được chấp nhận; chưa có RTO/RPO cam kết trong lượt này.

Phân biệt phương án:

| Loại quay lại | Điều kiện và thứ tự |
|---|---|
| Code/image | `scripts/ops/deploy.sh rollback <APPROVED_SECURE_SHA>` chỉ checkout/retag image cũ, không rebuild hoặc hoàn tác DB; source:155–165/:273–279. Template này **không chạy được an toàn khi chưa có secureSHA/image**. Chỉ dùng cặp frontend/backend đã kiểm tương thích schema/policy/config, đã có image tag/digest và smoke. Script rollback không áp dirty-worktree gate nên tuyệt đối không gọi trên checkout chia sẻ đang dirty này |
| Frontend riêng | Image hiện tại đóng chung backend+static; không giả có nút rollback frontend độc lập. Muốn dùng frontend cũ phải có image cặp đã build/test, giữ null/type/route/report semantics; nếu không có thì dừng, không copy static ngẫu nhiên vào container |
| Policy/schema/data | Rollback code **không undo SQLRLS hoặc migration/data**. Candidate này không có down migration/backfill đã nghiệm thu. Không DROP policy, tắt FORCE/RLS, mở bypass hoặc dùng app owner/superuser làm fallback. Mọi phục hồi DB sau ghi cần quyền riêng, đối chiếu consistency và data-loss window; không tự xoá dữ liệu |
| E1/O1 regression khi rollback | Backend trước fix có thể tin roleJWT cũ và đọc/ghi tenant ngoài policy; giữSQL mới một mình cũng không bảo đảm quyền admin report trong cùng org. Không chọn nó làm fallback. Cần image fallback vẫn giữ resolver hiện tại/tenant binding/guard/caller context và policy compatible; nếu chưa có, cô lập traffic/writer theo kế hoạch bảo trì được duyệt rồi ưu tiên sửa tiến, không đánh đổi isolation lấy uptime |

Sau rollback được phép: login/JWT/scope/period/null/canonical/Excel/AI smoke lại trên đúng image và DB, so policy/role/config còn hiệu lực; không chỉ nhìn health200 hoặc `git checkout` thành công. Giữ log sự cố và source/image trước/sau. Không tự chạy restore vì rollback app thất bại.

## 10. Lệnh/check mới7A, thay đổi và bàn giao7B

Lượt7A chỉ chạy đọc git/source và generator/checker trong artifact:

```text
git -c safe.directory=F:/ZaloCRM-CorepViet rev-parse HEAD
git -c safe.directory=F:/ZaloCRM-CorepViet status --short --untracked-files=all
git -c safe.directory=F:/ZaloCRM-CorepViet diff --unified=0 HEAD -- <file đã chọn>
node artifacts/reports-release-7a-20261102-225424/build-manifest.mjs
node artifacts/reports-release-7a-20261102-225424/verify-evidence.mjs
```

Không chạy deploy script kể cả dry-run, vì script có thể fetch/read config/đụng checkout; không chạy migrate/dbpush/seed/testDB/package/install. Không có fixture mới, không khởi tạo process/container/listener cần cleanup. Không gọi kiểm nhất quán JSON hoặc hash là application regression, không làm7B trong cùng lượt.

Artifact gồm git status đầu/cuối, HEAD, preimage2README, source-before/final hash và proof không đổi; manifest/hunk/direct-import graph;16consistency checks; log lệnh mới; tracked review diff có mixed context; diff chính xác của tài liệu7A so preimage. `build-manifest.mjs` và `verify-evidence.mjs` chỉ là công cụ tạo hồ sơ, đặt trong artifact, không đăng ký runtime hoặc production payload.

Trước/sau: trước chưa có checkpoint7A/candidate manifest; sau có hồ sơ có điều kiện và các preflight/P1–P7, giữ runtime/test source nguyên vẹn. File tạo/sửa: **docs/reports-fix/07-release.md, docs/reports-fix/README.md, README.md** và artifact riêng. Không sửa báo cáo B hoặc artifact cũ. Giữ lịch sử6A và các FAIL trước; E1/O1 vẫn local verified, chưa apply môi trường thật.

Đầu vào cần phiên **7B độc lập** review, không tự triển khai:

1. Manifest/hunk ownership: chỉ1hunk AI registration trong app.ts, không trộn TikTok/send policy và không cắt mất dependency. Candidate review chưa phải release artifact; việc chốt base/isolation còn BLOCKED phải hiện rõ.
2. Source975 binding với B và16consistency checks; các log diagnostic/race/guard cũ không bị xoá hoặc sửa. Đừng gọi bộ test cũ mới chạy lại hoặc đếm mọi runner thành PASS.
3. Kiểm phát hiện packaging Dockerfile:55 bằng source; kiểm phần Node22/PG16/install, helper exclusion và yêu cầu image digest/smoke. Không chấp nhận build whole tree thay candidate build.
4. Xác minh P3 chưa có full-suite baseline mới; current/baseline phải tương đương và an toàn. Không lấy35file/9test cũ để kết luận mọi lỗi hiện tại đã có trước.
5. Runbook phải tách schema migration/SQLRLS/role/config, rehearsal PG16 và full bootstrap trước traffic; guard/GUC defaults chưa được bật thật. Nhóm pilot không cô lập thay đổi policyDB toàn cục.
6. Smoke có đầy đủ role/domain/main/shared/canonical/dateVN/AI/basic/analytics/saved/Engagement và null/error/stale; readiness không thay quyền/đối soát.
7. Backup thật chưa restore; fallback secure image chưa có. Không chấp nhận rollback bằng git, tắt RLS/guard, owner app hoặc bản cũ mở lại O1. Monitoring nguồn403/p95/soak chưa được giả định có sẵn.
8. Ghi `07-release-verification.md` READY/NOT_READY/BLOCKED theo tiêu chí hồ sơ, kèm các điều kiện còn chặn triển khai. READY của7B chỉ là hồ sơ đủ để xin duyệt bước tiếp, không phải đã phát hành hoặc cho phép production. Nếu có finding cần sửa runtime/packaging, mở lượt A riêng sau quyết định phạm vi; không tự sửa trong7B.

Tiêu chí hoàn tất7A: hồ sơ đủ các mục, candidate có hash/ownership và giới hạn rõ, bằng chứng B còn khớp, preflight/rollout/backup/rollback/smoke/monitoring có điều kiện và không có hoạt động ngoài scope. **7A COMPLETED_PENDING_VERIFICATION chỉ áp dụng hồ sơ**, chờ7B kiểm độc lập. Tiêu chí phát hành **chưa đạt**: P1/P2/P3 và secure fallback còn BLOCKED; P4–P7 chưa nghiệm thu. **7B vẫn NOT_STARTED**. Kết quả kiểm cuối lượt được lưu trong `final-integrity.json`, `final-doc-checks.json`, `final-scope-proof.json` và `commands.md` của artifact7A; không phải nghiệm thu B hoặc test ứng dụng mới.

Tự kiểm hồ sơ **02/11/2026,23:21 (+07)**: source **975/975** khớp cả đầu7A và snapshot B, HEAD không đổi; **16/16** đối chiếu bằng chứng đã lưu và **19/19** kiểm tài liệu/manifest đạt, không có status change ngoài3tài liệu +artifact7A. Manifest có **163 entry review/context/excluded**, không phải163file production payload. Có5hunk app.ts, chỉ1hunk report được chọn để review và4hunk TikTok được loại. Log và diff chính xác đã lưu; sau thêm mốc này chạy lại generator/checker để hash manifest khớp tài liệu cuối. Không chạy test ứng dụng mới hoặc7B.
