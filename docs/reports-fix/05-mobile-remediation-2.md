# Sửa sau tái kiểm tra5B — overlay resize và initials avatar

**02/11/2026 11:36 (+07), Asia/Ho_Chi_Minh — COMPLETED_PENDING_VERIFICATION.** F1/F2 đã sửa và tự kiểm tra local đạt bên dưới. **Chưa có PASS độc lập5B trên patch mới;6A/6B NOT_STARTED.** [Kết luận FAIL độc lập trước sửa](05-mobile-verification.md#tái-kiểm-tra-độc-lập-sau-remediation-f1f2--02112026) giữ nguyên, không đổi thành PASS bằng kết quả tự kiểm tra.

Đối tượng: working tree chưa commit ở HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`. Đã đọc prompt chung, contract/roadmap/checkpoint và đối chiếu findings với source. Giữ Vue/Vuetify, Fastify/Prisma; áp dụng các hướng dẫn Vue/mobile/interface đã dùng trong bước5. Không agent/worktree/reset/stash/commit/push/deploy; không thay policy hoặc công thức backend.

## Source và hành vi trước/sau đã xác minh

| Vấn đề | Trước | Sau và bằng chứng code hiện tại |
|---|---|---|
| F1 — overlay compact | Mở1024 rồi resize1100 làm activator bị ẩn nhưng overlay còn mở; CSS không điều khiển state | `frontend/src/composables/use-report-compact-navigation.ts:19` đóng/reset khi rời compact/route; `:25` trả focus sau leave; `:33` theo media query khớp CSS; `:37` tháo listener khi unmount. `frontend/src/layouts/DefaultLayout.vue:17` ràng buộc disabled và after-leave; `:174`/`:178` dùng ref nav riêng, giữ nguyên activator ref của Vuetify |
| F2 — initials11px | Palette riêng ở nhiều report có nền quá sáng với chữ trắng:3,88/4,05:1, còn màu khác cũng chưa đủ4,5:1 | `frontend/src/utils/report-avatar.ts:2` palette8 màu tối dùng chung. Imports tại Overview:9, Audit:9, Engagement:4, NickFleet:230, Pipeline:261, Sales:499. Giữ cách lấy initials/hash/index, không đổi dữ liệu hay thứ tự bảng; màu đại diện có thể khác trước |
| Overflow biểu đồ phát hiện trong regression | Overview30 ngày tràn nội dung318px tại768 và63px tại1024 dù page/header không tràn | `frontend/src/assets/report-kit.css:76` chart có horizontal scroll riêng. `OverviewReport.vue:257`, `SalesReport.vue:189` region có tên/tabindex0. Giữ đủ cột/ngày, không che bằng overflow hidden |

Đường dẫn các view ở trên thuộc `frontend/src/views/reports/`. Source path+dòng được đọc lại trong lượt này. Không sửa component Avatar dùng chung toàn app; bản sửa initials chỉ áp các palette của report.

**Phạm vi patch:**8 file source có trước thay đổi (DefaultLayout, report-kit.css và6 report views),2 runtime file mới (composable, palette),2 spec mới. [Manifest source cuối](../../artifacts/reports-mobile-5b-fix2-2026-11-02/source-integrity-final.json): **825/833 source/test có trước giữ nguyên hash**; backend source/tests không đổi.4 helper kiểm chứng mới `backend/scripts/reports-verification/5b-fix2-{setup,server,base-checks,automation-fixtures}.ts` chỉ thuộc harness, không được app bootstrap import. [Git status trước sửa](../../artifacts/reports-mobile-5b-fix2-2026-11-02/git-status-before.txt), [preimage](../../artifacts/reports-mobile-5b-fix2-2026-11-02/before/). Không nhận toàn bộ git diff với HEAD là patch của lượt này.

## Regression và kết quả cuối

- `frontend/src/composables/use-report-compact-navigation.dom.spec.ts`:7 ca cho1024/1099/1100, quay lại compact không tự mở, xuống mobile, rời report, không mở ở desktop, cleanup listener/remount và không cướp focus khi leave tới muộn. Kiểm tra focus callback chỉ chạy sau leave, không phải ngay nextTick.
- `frontend/src/utils/report-avatar.spec.ts`:11 ca, gồm8 màu đạt4,5:1, black/white reference21:1 và2 màu palette cũ làm đối chứng âm. Không assertion bắt buộc hex mới phải bằng một giá trị cụ thể.
- Chạy lại8 DOM report specs có trước cùng2 spec mới: **10/10 spec,69/69 tests PASS** lúc11:33:17. Không sửa assertion có sẵn. Đây là unit/DOM tests, không thay integration/browser.
- **vue-tsc + Vite build PASS** bản cuối sau chart scroll. Còn warning chunk>500kB, không nới threshold để che warning.

Lệnh ở `frontend/`:

```powershell
node node_modules/vitest/vitest.mjs run src/views/reports/ReportMobile.dom.spec.ts src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts src/composables/use-report-compact-navigation.dom.spec.ts src/utils/report-avatar.spec.ts
npm.cmd run build
```

[Test log cuối](../../artifacts/reports-mobile-5b-fix2-2026-11-02/frontend-tests-complete.log), [build log cuối](../../artifacts/reports-mobile-5b-fix2-2026-11-02/frontend-build-complete.log). Các log build/test trước đó giữ riêng, không cộng nhiều lượt thành tổng test mới.

## Browser mới trên bản build local

ChatGPT IAB/Chromium, CSS viewport lấy từ innerWidth/innerHeight; DPR≈1,33. Dùng tài khoản/record fixture giả, login UI với JWT thật, endpoint thật qua app role/RLS; không dùng ảnh AI hoặc mock metric. [Summary cuối](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/browser-summary-final.json).

| Hạng mục | Kết quả |
|---|---|
| Bố cục cuối | **40/40 PASS**:27 mobile (9 danh mục×320/390/430),5 Overview compact/desktop (768/1024/1099/1100/1440),8 danh mục còn lại1440. Page/app/content overflow0, header không có control ngoài viewport; mobile không enabled target dưới tolerance≈44px |
| Chữ report chính | **540/540 mẫu PASS**,13 nhóm:4 view mobile390 và9 view desktop1440. Nền solid/computed style, không phải chứng nhận WCAG toàn app |
| Initials avatar | **84/84 mẫu PASS**,16 nhóm viewport/view, minimum **5,83:1**, font11px. Browser có avatar tại Overview/Nick/Sale/Audit; Pipeline/Engagement không có dòng avatar trong fixture này, palette của chúng có unit coverage và import đã đối chiếu |
| VA/VL tại Overview | **7,72:1** ở390/1024/1440; những mẫu Overview đã đo đạt6,45–7,72:1. Không tạo dữ liệu thật để có VD; palette trước3,88:1 được giữ làm đối chứng unit |
| Menu và states | **15/15 quan sát/tình huống đạt**, có lặp F1 trên build cuối; không gọi đây là15 luồng end-to-end độc lập |

[Geometry cuối](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/geometry-final.json), [initials](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/avatar-contrast-final.json), [chữ chính](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/main-contrast-final.json), [tương tác](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/interactions-final.json).

Tương tác đã chạy: mở bằng Enter1024, ArrowDown vào Dashboard rồi resize1100 đóng overlay và **document.activeElement đúng nút Báo cáo**; quay lại1024 không tự mở; mở bằng chuột rồi lên1440; chuyển xuống mobile766 sạch overlay; Escape trong compact vẫn trả focus activator; chọn Dashboard/Back không giữ overlay. Chart30 ngày giữ đủ30 cột, tabindex0, focus đúng region, ArrowRight làm scrollLeft>0 mà scope overflow0.

Bổ sung tự kiểm tra các browser gap trong review:

- Overview refresh xóa KPI/context cũ khi loading; controlled503 hiện lỗi và retry, không hiện số liệu cũ; retry đi qua API thật và phục hồi dữ liệu.
- Trì hoãn request7 ngày2200ms rồi chọn Hôm nay. HTTP log xác nhận Hôm nay200 lúc04:27:08.092Z,7 ngày200 lúc04:27:10.003Z. Sau cả hai UI vẫn Hôm nay, context `2026-11-02 – 2026-11-02`. [HTTP](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/report-http.jsonl), [fault events](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/scenario-events.jsonl), [plans](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/plans.json).
- Automation Hôm nay trả số đo0 và tỷ lệ unavailable riêng;7 ngày có4 lời mời/1 đồng ý,3 bám đuổi/1 phản hồi, UI25%/33,3%.
- AI fixture org không có tin:6 KPI bằng0, có empty state; token/cost vẫn “Chưa có dữ liệu”. Không biến thiếu nguồn thành0.

Các ca race/error/0/null trên đây chỉ bao phủ các luồng được nêu, **không phải đã kiểm tra đủ mọi state của9 danh mục** và không phải kiểm tra độc lập mới. Route `/api/v1/notifications` vẫn **404 trong harness vì chưa đăng ký module**; không giả response200 để che giới hạn, không kết luận route ứng dụng thật hỏng. Cần review độc lập quyết định/hoàn thiện coverage5B còn bắt buộc; không mở gate6A từ self-check này.

## Bằng chứng chưa đạt được bảo tồn

Hai lần thử focus đầu đóng overlay nhưng activeElement còn BODY. Đã giữ `first-focus-attempt.json`, `second-focus-attempt.json` và ảnh tương ứng; không tính PASS. Sau khi chờ after-leave và giữ đúng Vuetify activator ref, phép kiểm tra cuối so sánh **identity element** thay vì chỉ tìm từ “Báo cáo” trong text của BODY.

Summary ban đầu có38/40 layout đạt vì chart30 ngày tràn scope; các số báo nhanh trước đó chỉ xét page overflow đã được đính chính. Giữ [geometry trước sửa chart](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/geometry-before-chart-scroll.json), [summary trước sửa chart](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/summary-before-chart-scroll.json). Summary/geometry có hậu tố `-final` mới là kết quả sau bản sửa cuối; không ghi đè38/40 thành40/40.

Ảnh UI mới đã xem: [bảng avatar1024](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/overview-avatar-table-complete-1024.png), [sau resize1100](../../artifacts/reports-mobile-5b-fix2-2026-11-02/browser/resize-final-build-1100.png). Không tính số ảnh thành test.

## DB, fixture, giới hạn và cleanup

Trước write: xác minh container `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, label `codex.task=reports-1b-local-verification`, exited, loopback127.0.0.1:55471, data tmpfs, không mount dữ liệu khác. Sau start đọc **`reports_1b_verify|postgres|0`** bảng public: [preflight](../../artifacts/reports-mobile-5b-fix2-2026-11-02/database-preflight.txt). Sau đó mới db push với config explicit, seed org/user/nick/message giả và Automation paused/closed. Base message00:30/00:31 VN đã xảy ra trước asOf. Không đọc .env hoặc dùng default DB URL; JWT secret/token chỉ trong memory.

Harness không import app bootstrap, không bật queue/cron/socket/provider hay gọi send/AI. `reports_verify_app` NOSUPERUSER/NOBYPASSRLS, FORCE RLS trên các bảng kiểm tra. **15/15 baseline DB/JWT/HTTP PASS**, **2/2 Automation/Broadcast PASS** trong lượt này. [Baseline](../../artifacts/reports-mobile-5b-fix2-2026-11-02/results.json), [Automation/Broadcast](../../artifacts/reports-mobile-5b-fix2-2026-11-02/automation-broadcast-db-results.json). **44/44 role checks là bằng chứng review trước, không chạy lại trong lượt sửa này**. Không chạy full backend unit suite vì backend runtime không đổi.

Lệnh ở `backend/`, chỉ sau xác minh DB disposable:

```powershell
node node_modules/prisma/build/index.js db push --config ../artifacts/reports-mobile-5b-fix2-2026-11-02/prisma-disposable.config.mjs
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fix2-setup.ts
$env:REPORT_VERIFY_BROWSER_SCENARIOS='1'
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fix2-server.ts
# Process khác sau khi harness ready:
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fix2-automation-fixtures.ts
```

DB push không phải replay migration; local không chứng minh staging/production/SLA. Chưa test Safari/iPhone/PWA/VoiceOver/font scaling/keyboard thật. Đã logout fixture, reset viewport, đóng tab; dừng đúng Node31732/35560 và container về exited lúc11:35:54, port30571 không còn listener. Vite không được khởi động trong lượt này. [Cleanup](../../artifacts/reports-mobile-5b-fix2-2026-11-02/cleanup.json). Không commit/deploy hoặc gửi Zalo/Telegram/AI trả phí.

`git diff --check` trên8 file runtime có trước đã sửa: **PASS**; chỉ có thông báo chuyển LF/CRLF của Git, không có whitespace error. [Snapshot SHA256 cuối gồm837 source/test](../../artifacts/reports-mobile-5b-fix2-2026-11-02/source-final.json) bao gồm cả4 file mới; không có secrets/.env.

**Bước tiếp: một lượt tái kiểm tra độc lập5B mới trên hash hiện tại**, gồm F1 resize/focus, F2 initials, chart scroll và các coverage còn thiếu. Verification5B trước sửa chỉ là lịch sử FAIL, hết hiệu lực để nghiệm thu patch mới;6A/6B tiếp tục NOT_STARTED đến khi đủ gate.
