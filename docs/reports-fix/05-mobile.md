# Bước 5A — Giao diện Báo cáo mobile

**Cập nhật02/11/2026 11:36 (+07): sửa sau tái kiểm tra5B, COMPLETED_PENDING_VERIFICATION.** Đóng overlay khi rời breakpoint/route, trả focus sau leave, palette avatar report đủ tương phản; sửa thêm chart30 ngày tràn scope compact phát hiện trong regression. [Checkpoint lần2](05-mobile-remediation-2.md):69/69 tests, type/build PASS,40/40 geometry,84/84 initials,540/540 mẫu chữ chính và15/15 quan sát tương tác đạt tự kiểm tra. Cần tái kiểm tra độc lập5B trên patch mới; giữ nguyên FAIL/lịch sử và các lần thử chưa đạt,6A/6B NOT_STARTED. Các mốc phía dưới là lịch sử.

**Cập nhật02/11/2026 08:51 (+07): đã sửa F1/F2 của5B, COMPLETED_PENDING_VERIFICATION.** Chỉ2 file runtime frontend thay đổi sau review; tự kiểm tra mới51/51 frontend, build/type-check,34/34 geometry,469/469 mẫu contrast,11/11 tình huống nav PASS. [Checkpoint sửa và bằng chứng](05-mobile-remediation.md). Verification5B FAIL08:24 thuộc snapshot trước sửa, hết hiệu lực để nghiệm thu patch hiện tại; giữ nguyên lịch sử, cần chạy lại5B. Chưa đủ gate6A. Phần bên dưới giữ kết quả5A ban đầu.

Cập nhật **02/11/2026 07:02 (+07), Asia/Ho_Chi_Minh**. Trạng thái: **COMPLETED_PENDING_VERIFICATION**. Gate đầu vào: [4B PASS local](04-ai-report-verification.md). **5B NOT_STARTED; chưa đủ gate sang bước 6.**

HEAD đối chiếu: `eb1be0bce8f60858436b98370f3c517edcb041b7`. Kiểm tra working tree chưa commit, gồm nhiều patch AI/TikTok/report/RLS có trước. Không tạo commit/worktree, không giao agent, không push/deploy. Không sửa backend runtime, schema, công thức, send policy hay cấu hình AI.

## Phạm vi và hành vi trước/sau

| Khu vực | Trước 5A | Sau 5A |
|---|---|---|
| Đường vào mobile | Bottom nav 4 mục, không có mục Thêm | Giữ 4 mục; thêm Báo cáo làm mục thứ 5 cho viewer được phép |
| Danh mục | Desktop menu/subnav và edition gate không thống nhất | Catalog dùng chung cho menu, selector và guard; admin 9 danh mục, leader/deputy có grant 6 danh mục |
| Mobile shell | App có min-width 1100px; chiều cao desktop không phù hợp header/footer mobile | Override riêng route Báo cáo; một vùng cuộn nội dung, header/footer có khoảng chừa; selector native 48px |
| Ngày và phạm vi | Chưa có context trình bày chung cho 8 view | Kỳ lấy từ response, giờ VN, asOf của API và nhãn snapshot; thiếu timestamp ghi rõ chưa cung cấp |
| Bảng/heatmap | Một số vùng ép nội dung rộng hơn màn hình | Cuộn ngang riêng, giữ table semantics, region có tên/tabindex/hướng dẫn bàn phím |
| Chi tiết Sale | Chưa có drill-down từ dòng Sale | Mở dữ liệu dòng đã tải; không gọi API thêm; null hiển thị chưa có dữ liệu; đóng trả focus đúng nút |
| Trạng thái | Logic loading/error/null của các bước trước | Giữ logic, bổ sung bố cục/focus và kiểm tra lại retry, unavailable, dữ liệu rỗng |

Áp dụng `interface-design`, `mobile-ux-optimizer`, `vue-best-practices`; đối chiếu `.interface-design/system.md` và `docs/mobile-upgrade/04_MOBILE_DESIGN_SYSTEM.md`. Giữ màu xanh, tiếng Việt, Vue/Vuetify và dependency hiện có. Không đưa filter nick/nhân viên vào UI vì chưa chứng minh contract API tương ứng. Không bật export đang disabled.

## File và bằng chứng source đã đọc trong phiên này

Các dòng dưới đây là source working tree ngày 02/11/2026, không phải số dòng của HEAD cũ.

| File:dòng | Bằng chứng |
|---|---|
| `frontend/src/utils/report-access.ts:2` | Policy viewer; owner/admin hoặc leader/deputy có `engagement_score.access` |
| `frontend/src/utils/report-access.ts:12` | 8 danh mục cũ + AI; Automation/Broadcast/Audit admin-only |
| `frontend/src/utils/report-access.ts:24` | Danh mục hiển thị dùng chung; AI/settings access không tự cấp quyền báo cáo |
| `frontend/src/router/index.ts:91` | Parent guard báo cáo; child guard admin-only tại dòng 98, 100, 102 |
| `frontend/src/layouts/DefaultLayout.vue:32` | Menu desktop dùng policy/catalog chung; bỏ edition gate sai cho core report |
| `frontend/src/layouts/MobileLayout.vue:4` | Layout/light theme chỉ áp riêng route report; header/back/logout và chừa footer |
| `frontend/src/components/BottomNav.vue:29` | Mục Báo cáo theo quyền; nested route vẫn active đúng mục |
| `frontend/src/views/reports/ReportsShell.vue:10` | Catalog phản ứng theo auth; selector theo route, không giữ state chọn độc lập |
| `frontend/src/views/reports/ReportsShell.vue:16` | Đổi danh mục đưa vùng nội dung về đầu; không dùng cuộn cấp trang |
| `frontend/src/views/reports/ReportContext.vue:18` | Timestamp API, định dạng Asia/Ho_Chi_Minh; không lấy giờ client giả thành asOf server |
| `frontend/src/views/reports/ReportTable.vue:10` | Region keyboard-focusable, tên và hint riêng |
| `frontend/src/views/reports/ReportDetail.vue:8` | Trả focus khi đóng; focus nút đóng khi dialog mở xong tại dòng 13 |
| `frontend/src/views/reports/SalesReport.vue:129` | Nút chi tiết dòng; payload đã được scope bởi API; handler tại dòng 590 |
| `frontend/src/views/reports/SalesReport.vue:494` | Dialog dùng dòng đã tải và phần tử mở để trả focus |
| `frontend/src/views/reports/NickFleetReport.vue:183` | Heatmap 7 ngày có vùng cuộn riêng sau phát hiện overflow 320px |
| `frontend/src/views/reports/EngagementReport.vue:261` | Heatmap 28 ngày có vùng cuộn riêng |
| `frontend/src/views/reports/SalesReport.vue:338` | Heatmap CRM có vùng cuộn riêng |
| `frontend/src/views/reports/AiReportSection.vue:34` | Bảng AI giữ semantics trong vùng cuộn; main/shared vẫn do AiReport điều khiển |
| `frontend/src/assets/report-kit.css:122` | Bỏ app min-width riêng report, dvh và flex scroll owner |
| `frontend/src/assets/report-kit.css:138` | Focus ring; từ dòng 148 là header/footer/safe-area mobile |
| `frontend/src/assets/report-kit.css:176` | Grid responsive, KPI đầu ưu tiên; từ dòng 190 là bảng/heatmap, từ 210 reduced motion |

Context được gắn vào đủ 8 view: Overview:186, NickFleet:41, Sales:44, Pipeline:41, Automation:36, Broadcast:36, Engagement:192, Audit:202 (`frontend/src/views/reports/`). AI giữ context hiện có tại `AiReport.vue:63`; file này không đổi hash trong 5A. Backend tiếp tục chặn trực tiếp: `backend/src/modules/automation/automation-report-routes.ts:55`/`:57`, `backend/src/modules/broadcast/broadcast-report-routes.ts:41`/`:43`, `backend/src/modules/dashboard/report-analytics-routes.ts:964`/`:966`.

Đã sửa **18 file frontend có sẵn**, thêm **3 component + 1 DOM spec**. Hai spec có sẵn được cập nhật: `AiReport.dom.spec.ts` dùng router thật khi mount shell; `SalesReport.dom.spec.ts` thêm kiểm tra mở/đóng và đổi kỳ khi đang mở detail. Các assertion nghiệp vụ trước đó được giữ. Spec mới `ReportMobile.dom.spec.ts:20` kiểm tra ma trận role; `:58` selector/router; `:79` context; `:92` table; `:106` bottom nav.

Danh sách đầy đủ + SHA256 trước/sau: [source-comparison.json](../../artifacts/reports-mobile-5a-2026-11-02/source-comparison.json). Baseline có **830 file**, trong đó **483 backend source/test không đổi hash**. Preimage 17 file liên quan được giữ trong [before/](../../artifacts/reports-mobile-5a-2026-11-02/before/), gồm cả AiReport.vue không bị sửa; hai spec có sẵn có hash baseline trong snapshot. Không lấy toàn bộ diff so với HEAD làm patch 5A vì có thay đổi cũ.

Helper mới chỉ dành cho kiểm tra: `backend/scripts/reports-verification/5a-{setup,server,base-checks,ai-fixtures,automation-fixtures,metrics,overview-oracle,capabilities}.ts`. Không import app bootstrap/provider hoặc bật đường gửi thật. Tài liệu mới: checkpoint này, [renders/README.md](renders/README.md); cập nhật root README và chỉ mục roadmap. Không tạo checkpoint 5B.

## Môi trường và fixture

Trước ghi DB đã xác minh container disposable `reports-1b-verify-20261101`, ID `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, label `codex.task=reports-1b-local-verification`, loopback `127.0.0.1:55471`, PostgreSQL `reports_1b_verify`, tmpfs `/var/lib/postgresql/data`, ban đầu exited và 0 bảng public. Không đọc `.env` hoặc lấy DATABASE_URL sẵn có làm bằng chứng an toàn.

Tạo schema bằng **Prisma db push** với [config disposable tường minh](../../artifacts/reports-mobile-5a-2026-11-02/prisma-disposable.config.mjs), sau đó áp RLS nguồn hiện tại. Đây **không phải replay migration**. App role `reports_verify_app` không superuser/bypass RLS và không sở hữu bảng; tables liên quan enable+force RLS. Xem [db-setup.json](../../artifacts/reports-mobile-5a-2026-11-02/db-setup.json).

Base fixture dùng org `verify-org-a/b`; AI dùng org riêng `verify-ai-org-a/b`. Dữ liệu đều giả, ngày fixture 01/11/2026. Ngày VN lúc kiểm tra là 02/11/2026. AI leader kỳ 30 ngày có main 7 tin/2 nháp, shared 1 tin/1 nháp; kỳ ngày fixture main 5 tin. Admin base-org không có AI fixture nên ảnh AI admin là empty/0 thật. Automation có 4 lời mời, 1 đồng ý (25%); 3 bám đuổi, 1 phản hồi (33,3%). Job paused/session closed; không chạy worker/queue/cron/socket/provider.

Harness Fastify chỉ bind `127.0.0.1:30571`, route thật/auth JWT thật/Prisma thật; browser dùng frontend build. Fault GET opt-in bằng file local, không có endpoint điều khiển lỗi ngoài mạng. Token chỉ trong bộ nhớ, không lưu vào báo cáo/ảnh. [Cleanup](../../artifacts/reports-mobile-5a-2026-11-02/cleanup.json): đã logout/đóng tab/reset viewport; dừng đúng PID 14848; container về exited; không đụng container khác.

## Lệnh và kết quả thực tế

Các lệnh Node dưới đây dùng dependency đã có, không cài mới. Chạy từ `frontend/`:

```powershell
node node_modules/vitest/vitest.mjs run src/views/reports/ReportMobile.dom.spec.ts src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts
npm.cmd run build
```

Kết quả cuối sau sửa focus: **8 spec, 51/51 PASS**, 06:56:45 (+07); build exit0, có vue-tsc và Vite. [Test log](../../artifacts/reports-mobile-5a-2026-11-02/frontend-tests-focus.log), [build log](../../artifacts/reports-mobile-5a-2026-11-02/frontend-build-focus.log). Vite còn cảnh báo chunk >500kB; chưa làm tối ưu bundle trong bước này. DOM mock không thay thế kiểm tra DB/RLS/browser.

Chạy từ `backend/`, trên DB/harness đã xác minh ở trên:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-setup.ts
$env:REPORT_VERIFY_BROWSER_SCENARIOS='1'
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-server.ts
# Các lệnh bên dưới chạy khi harness đã listen, không chạy nối sau lệnh server blocking.
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-ai-fixtures.ts seed
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-ai-fixtures.ts check
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-automation-fixtures.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-metrics.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-overview-oracle.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5a-capabilities.ts
```

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| Baseline HTTP/JWT/RLS chạy lúc server khởi động | 15/15 PASS, không nhân số lần restart thành test mới | [results.json](../../artifacts/reports-mobile-5a-2026-11-02/results.json) |
| AI DB/JWT/HTTP | 14/14 PASS | [db-jwt-http-results.json](../../artifacts/reports-mobile-5a-2026-11-02/db-jwt-http-results.json) |
| Automation/Broadcast đối soát DB | 2/2 PASS | [automation-broadcast-db-results.json](../../artifacts/reports-mobile-5a-2026-11-02/automation-broadcast-db-results.json) |
| Helper metrics kế thừa | **11/12 PASS, 1 FAIL**, giữ nguyên kết quả | [metrics-results.json](../../artifacts/reports-mobile-5a-2026-11-02/metrics-results.json) |
| Oracle riêng cho sai khác ngày Overview | 4/4 PASS | [overview-oracle-results.json](../../artifacts/reports-mobile-5a-2026-11-02/overview-oracle-results.json) |
| Ma trận API trực tiếp: 3 role × 11 endpoint của 9 danh mục | 33/33 PASS, login JWT thật | [capabilities-results.json](../../artifacts/reports-mobile-5a-2026-11-02/capabilities-results.json) |

**Giải thích FAIL của helper cũ:** ca đầu hard-code `msgToday=8/2` trong khi base fixture nằm ngày 01/11 và ngày VN hiện tại là 02/11. SQL đếm ngày hiện tại cho cả hai org đều 0; SQL ngày fixture lần lượt 8/2. API Overview giữ KPI “hôm nay” =0 ngay cả khi chọn kỳ lịch sử, đúng nghĩa snapshot hiện có. Oracle đọc DB độc lập kiểm tra 4 tổ hợp org/kỳ; không sửa runtime hoặc sửa artifact 11/12 thành PASS. Đây là giới hạn của helper kế thừa cần xử lý khi chuẩn hóa harness bước 6; không tuyên bố toàn bộ backend checks lượt này PASS. Các nhóm có chồng lặp, không cộng chúng thành tổng test duy nhất.

## Kiểm tra browser và ảnh render

Provider **ChatGPT IAB**, không phải Safari/iPhone thật. Viewport đo bằng `innerWidth/innerHeight`: **320×844, 390×844, 430×844**, desktop **1440×900**, tablet **1024×844**. Provider có tỷ lệ pixel 1,33; override đầu vào đã điều chỉnh theo kích thước CSS đo được. Không ghi kích thước override vật lý thành CSS viewport.

- **27/27** bố cục admin (9 danh mục ×3 chiều rộng): page/content overflow=0, không control dưới 44px sau làm tròn sai số hình học (minimum đo 43,9967px); đáy shell khớp mép trên footer. Bảng/heatmap cuộn riêng.
- **4/4** bố cục desktop cho Overview/Sale/Automation/AI; **1/1** tablet; **3/3** AI leader có dữ liệu ở 3 chiều rộng: không tràn ngang.
- **10/10 tình huống tương tác cuối đạt**: keyboard cuộn bảng/focus; mở detail tự focus; quay lại trả focus; đổi kỳ khớp ngày response; loading xóa dữ liệu cũ; lỗi có retry; retry lấy lại 25%/33,3%; leader thấy 6 danh mục; leader bị chặn URL Audit; member không có entry và bị chặn URL AI.
- Có **12 quan sát tương tác**, trong đó 2 FAIL focus ban đầu được giữ, sau đó sửa và kiểm tra lại 2 ca tương ứng PASS. Không gọi 12/12 PASS. [interactions.json](../../artifacts/reports-mobile-5a-2026-11-02/interactions.json), [layout-final.json](../../artifacts/reports-mobile-5a-2026-11-02/layout-final.json).
- Lần đo đầu phát hiện Nick heatmap 320px làm content rộng 494px; đã thêm scroll wrapper, đo lại đủ 27 bố cục. [Bằng chứng trước sửa](../../artifacts/reports-mobile-5a-2026-11-02/layout-before-heatmap-fix.json) còn nguyên.

Ảnh thật từ browser local có fixture: **24 PNG**, gồm 12 ảnh 4 view ×3 mobile, 4 desktop, 3 AI leader và 5 ảnh trạng thái/detail (có ảnh lịch sử trước sửa focus). Không tính số ảnh thành số tests. [Danh mục ảnh, trạng thái và viewport](renders/README.md), [manifest gốc](../../artifacts/reports-mobile-5a-2026-11-02/render-manifest.json). Đã mở xem trực tiếp ảnh Overview390, Automation390, AIleader390 và Sale-detail-final390.

Trong quá trình làm có lỗi build ban đầu: Pipeline context tham chiếu nhầm biến `data` thay `pipe`; wrapper làm lệch v-else Engagement; DOM harness cũ thiếu router/dummy nested shell. Đã sửa và chạy lại; giữ các log `build-initial.log`, `frontend-build.log`, `frontend-tests.log`. Đổi static wildcard trong helper 5A để phục vụ filename asset mới sau rebuild; không sửa helper 4B. Không sửa characterization/backend evidence tests trong lượt này.

`git diff --check` toàn checkout vẫn báo blank line EOF của README đã có trước; không dọn patch khác. Các warning LF/CRLF không phải lỗi build. [Log](../../artifacts/reports-mobile-5a-2026-11-02/git-diff-check.log).

## Tiêu chí và giới hạn

**Đạt trong phạm vi 5A local:** đủ 9 domain, selector/menu/router cùng capability; nav mobile có đường vào; responsive 320/390/430 và desktop; context kỳ/snapshot; null khác 0; bảng/heatmap riêng; drill-down từ dữ liệu đã scope; focus/retry; ảnh local thật; frontend tests/type/build.

**Chưa nghiệm thu:** Safari/WebKit, iPhone vật lý, notch/safe-area thực tế, bàn phím ảo, installed PWA, VoiceOver, contrast toàn ứng dụng, zoom chữ/phóng to hệ điều hành, đo tải/query-plan/migration/staging/production. Safe-area mới có CSS và kiểm tra khi inset=0. Không suy PASS iOS/PWA từ IAB. Không chạy lại toàn bộ backend unit suite vì không đổi backend source/test; checks DB ở trên chỉ bổ sung xác nhận integration local, không thay nghiệm thu bước 6.

4B là bằng chứng của snapshot trước 5A. 5A đã đổi shared navigation/AI table UI nên phần UI liên quan phải kiểm tra mới trong 5B; không tái sử dụng PASS4B để bỏ qua. Các giới hạn dữ liệu pending lifecycle/token/cost/handoff/conversion, Lead Pool return rate và coverage Engagement của các checkpoint trước vẫn còn.

**Bước tiếp: 5B — kiểm tra độc lập, không tự sửa implementation.** Đọc checkpoint/manifest/hash và tái kiểm tra các viewport, quyền API trực tiếp, focus, filter/race/retry/detail, contrast và phần chưa test trên thiết bị thật. Bước 6 chưa bắt đầu từ kết quả 5A này.
