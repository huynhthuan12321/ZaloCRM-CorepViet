# Kiểm tra mã nguồn Báo cáo

Đã có [kết quả xác minh chi tiết 4 điểm và 5 kiểm tra mô phỏng](12_REPORTS_FOUR_POINT_VERIFICATION.md). Tài liệu sau bổ sung dữ liệu nền AI đã có và lưu ý writer DailyMessageStat cũ.

Ngày 29/10/2026. Phạm vi: đọc router, menu, 8 view báo cáo, các API tương ứng, analytics và usage AI trong checkout hiện tại. Đây là kiểm tra tĩnh; chưa gọi database, đăng nhập production hoặc xác nhận số liệu thực tế. Không sửa logic ứng dụng.

## Cấu trúc hiện có

Không cần xây module Báo cáo từ đầu. Frontend dùng Vue/Vuetify, ReportsShell + RouterView và CSS chung `frontend/src/assets/report-kit.css`.

| Màn hình | Route | API chính, dưới /api/v1 |
|---|---|---|
| Tổng quan điều hành | /reports/tong-quan | /reports/overview |
| Vận hành Nick Zalo | /reports/nick | /reports/nick-fleet |
| Hiệu suất Sale & Team | /reports/sale | /reports/sales-performance và /reports/crm-usage |
| Pipeline & Lead Pool | /reports/pipeline | /reports/pipeline và /reports/lead-pool |
| Automation | /reports/automation | /reports/automation-summary |
| Broadcast | /reports/broadcast | /reports/broadcast |
| Engagement KH | /reports/engagement | /reports/engagement |
| Audit & Hệ thống | /reports/audit | /reports/audit |

Frontend: `frontend/src/router/index.ts:84`, `frontend/src/views/reports/ReportsShell.vue:21`. Backend được đăng ký tại `backend/src/app.ts:340`, `:355`, `:374`. Route cơ bản trong bảng có mặt trong source, không đồng nghĩa bản triển khai hiện tại đã bật đủ mọi tính năng.

Ứng dụng hiện tại có menu **Báo cáo trên thanh điều hướng chính**, trong `frontend/src/layouts/DefaultLayout.vue:31`, kiểm tra `canAccess('engagement_score')`. Menu Pipeline và Automation còn phụ thuộc `isExtension`, trong khi router cơ sở và ReportsShell đang khai báo cả hai. Comment nói 7 màn/EE-only đã không hoàn toàn khớp implementation 8 màn; cần đồng bộ khả năng hiển thị giữa menu, subnav và router.

Còn hai nhóm bổ sung: `/reports-co-ban` dùng ReportsView với tin nhắn/khách hàng/lịch hẹn/xuất Excel; `/analytics` dùng AnalyticsView và use-analytics với conversion funnel, team performance, response time, custom report và saved reports. Chức năng Excel của trang cũ chưa đồng nghĩa mọi tab mới có xuất báo cáo.

## Các điểm cần xử lý trước khi thiết kế lại

### 1. Phạm vi báo cáo trưởng nhóm — ưu tiên cao

`backend/src/modules/dashboard/report-analytics-routes.ts:23` cho qua khi contact scope có `visibleUserIds.size > 1`, nhưng các truy vấn báo cáo sau đó chủ yếu chỉ lọc `orgId`, không áp tập nhân viên/phòng ban được phép thấy. Ví dụ overview lấy toàn bộ user tổ chức ở dòng127; sales-performance lấy user tổ chức ở dòng301. Analytics cũng gate bằng contact scope rồi truyền orgId vào service (`analytics-routes.ts:29–63`, `reports/team-performance.ts:37`).

Điều này có thể khiến trưởng nhóm đủ điều kiện vào endpoint nhận báo cáo toàn tổ chức, trái mô tả dept-subtree trong comment. Đây là bằng chứng tĩnh cần xác minh bằng fixture có hai phòng ban; chưa thử tài khoản thật. Cần truyền report scope vào query/aggregate, không chỉ dùng scope để cho phép mở API.

Broadcast và automation-summary hiện chỉ owner/admin (`broadcast-report-routes.ts:40`, `automation-report-routes.ts:56`); member thường bị chặn ở report-analytics. Do đó không nên render báo cáo toàn team như chức năng mặc định của mọi nhân viên Sale.

### 2. Nhiều KPI chưa được tính thật

Trong `report-analytics-routes.ts` có các giá trị TODO trả cố định:

- Overview: chuỗi tin gửi/nhận toàn số0 (167–171); msgToday, msgByBot, biến động kỳ trước, tỷ lệ kết bạn và quota/uptime nick chưa được tính (160–194).
- Nick fleet: uptime, tin người/bot, kết bạn, SDK quota và một số chỉ số khác =0 (233–265).
- Sales: sent, avgResponseMin và phân bố thời gian phản hồi chưa tính (329–379).
- Pipeline: thời gian ở giai đoạn và contactedPct chưa tính (428–470).
- Audit: một phần cron health/queue còn TODO (893–968).

Không nên trình bày số0 này như kết quả vận hành đã đo. Đề xuất dữ liệu thiếu trả null + trạng thái chưa thu thập; chỉ dùng0 khi đã đo được bằng0. Analytics response-time đã có truy vấn DailyMessageStat riêng (`reports/response-time.ts:27`), có thể đánh giá tái sử dụng service sau khi thống nhất scope và định nghĩa chỉ số. Sự có mặt của query chưa chứng minh bảng thống kê đã có dữ liệu.

### 3. Khoảng thời gian và định nghĩa chỉ số chưa thống nhất

- `dateBounds` tại dòng45 của report-analytics dùng đầu ngày UTC. Frontend Overview tạo ngày theo múi giờ máy; báo cáo ngày Việt Nam có thể lệch 7 giờ so với kỳ người dùng hiểu.
- KPI “Lịch hẹn hôm nay” (`OverviewReport.vue:219`) gọi query chỉ có `appointmentDate >= todayStart`, không có giới hạn cuối hôm nay (`report-analytics-routes.ts:101`), nên có thể đếm cả lịch tương lai.
- Close rate overview đang tính khách tạo trong kỳ và hiện thuộc trạng thái chốt, không phải số chuyển sang chốt trong kỳ (95,112–114). TopSales.closed còn không giới hạn ngày (134). Funnel overview là snapshot hiện tại (119), trong khi msgSeries luôn 14 ngày gần nhất. Cần ghi rõ snapshot/cohort/event trước khi đồng nhất nhãn bộ lọc.
- Engagement frontend gọi API không truyền from/to (`EngagementReport.vue:35`); không nên giả định mọi tab có chung bộ lọc kỳ.

### 4. Báo cáo AI chưa có trang riêng

Chưa thấy tab/report API tổng hợp hiệu quả AI trong 8 màn trên. `/api/v1/ai/usage` đã có (`ai-routes.ts:187`), nhưng `getAiUsage` (`ai-service.ts:90`) chỉ đếm bản ghi aiSuggestion từ đầu ngày theo giờ server và trả usedToday/maxDaily/remaining/enabled. Đây chưa phải số tin AI tự gửi thành công, chi phí token, tỷ lệ chuyển nhân viên hay tỷ lệ chốt nhờ AI.

Không dùng `msgByBot` overview (đang TODO) làm số liệu hiệu quả AI. Cần định nghĩa sự kiện generated/reviewed/sent/send_failed/handoff và nguồn đo token/chi phí trước khi triển khai dashboard AI; có thể bắt đầu bằng usage đang có và ghi rõ là lượt gợi ý được ghi nhận.

### 5. Bố cục cần thích nghi iPhone và trạng thái tải

CSS report-kit có grid4→2 ở1100px nhưng chưa có breakpoint1 cột cho điện thoại (dòng36–38), subnav8 mục cuộn ngang; heatmap Sales có min-width560 (`SalesReport.vue:828`). Cần thiết kế bảng/heatmap có vùng cuộn riêng hoặc bản tóm tắt, selector danh mục dễ tìm và vùng chạm44px. Đây là nhận xét từ CSS, chưa đo render trên iPhone.

Overview `load()` giữ dữ liệu cũ khi request lỗi mà không có trạng thái lỗi rõ ràng (43–48), có thể làm bộ lọc mới hiển thị số liệu kỳ cũ. Nên có error/retry, nhãn kỳ dữ liệu thành công gần nhất và chống response cũ ghi đè khi đổi bộ lọc nhanh.

## Hướng áp dụng vào giao diện mới

1. Giữ 8 nhóm báo cáo đúng domain và API hiện có; trên mobile vào Thêm → Báo cáo (đề xuất mới), trang đầu là Tổng quan và selector danh mục. Không thay module hiện có bằng ba nhóm chung chung từ đề xuất sơ bộ.
2. Chuẩn hoá quyền + scope và kỳ Việt Nam; xử lý KPI giả0 và định nghĩa chốt/lịch hẹn trước.
3. Render Tổng quan, Sale & Team và Automation dựa trên response thật trong source, đánh dấu chỉ số chưa có nguồn. Bộ lọc nick/nhân viên cần bổ sung contract nếu endpoint chưa hỗ trợ, không chỉ vẽ dropdown.
4. Thêm Báo cáo AI sau khi chốt nguồn sự kiện. Từ trang thiết lập AI liên kết vào tab này khi đã có triển khai.

Không chạy test runtime trong lần này vì chỉ đọc mã và bổ sung tài liệu. Chưa sửa quyền, API, schema, view hoặc deploy.
