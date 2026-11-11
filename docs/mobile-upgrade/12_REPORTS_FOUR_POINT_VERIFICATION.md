# Kết quả kiểm tra 4 điểm Báo cáo

Ngày 29/10/2026. Kiểm tra checkout hiện tại; không sửa logic, không gọi AI, không gửi tin, không kết nối database/production. Đọc source thực tế và chạy route handler với Prisma/contact scope được mock.

## Kết luận

| Điểm | Kết quả | Ưu tiên |
|---|---|---|
| KPI trả0 cố định | Xác nhận có trường chưa tính, không phải toàn bộ báo cáo là giả | Cao |
| Phạm vi trưởng nhóm | Tái hiện handler trả dòng nhân viên ngoài subtree trong cùng org | Cao nhất |
| Ngày và định nghĩa chỉ số | Tái hiện lệch ngày VN và lịch tương lai vào “hôm nay”; xác nhận trộn snapshot/kỳ | Cao |
| Báo cáo AI | Chưa có màn/API tổng hợp riêng; đã có một phần dữ liệu gửi/duyệt/audit để khai thác | Trung bình |

## 1. KPI cố định

Trong `backend/src/modules/dashboard/report-analytics-routes.ts`:

- Overview: `msgToday`, `msgByBot`, biến động kỳ trước và toàn bộ sent/received của chuỗi14 ngày là0 cố định (167–194). Chuỗi14 ngày còn không đi theo khoảng ngày từ bộ lọc.
- Nick fleet: uptime7d, msgUser/msgBot, SDK và tỷ lệ kết bạn còn0/TODO (233–265).
- Sale: sent, avgResponseMin, responseBuckets và sent theo phòng còn0 (329–379); byDept khởi tạo sent0 nhưng không cộng dữ liệu gửi.
- Pipeline: avgDays và một số tỷ lệ chưa tính (428–470). Audit có cron/queue placeholder (893–968).

Fixture có12 khách vẫn nhận msgToday0, msgByBot0,14 dòng sent/received0; test này xác nhận output hiện tại, không kiểm chứng lượng tin thật trong database. Các count khách, trạng thái nick, lịch hẹn… vẫn có query thật. Broadcast và automation-summary có nguồn run/event riêng; không kết luận mọi báo cáo đều dùng placeholder.

Đề xuất: trường chưa thu thập dùng null + cờ available/reason, UI hiện “Chưa có dữ liệu”; không đồng nhất thiếu dữ liệu với0. Không tái sử dụng DailyMessageStat một cách mặc định: `zalo-dashboard-routes.ts:217` còn ghi chú writer cũ đã ngừng; tìm kiếm checkout không thấy lời gọi dailyMessageStat.create/update/upsert. Cần xác minh pipeline thống kê trước khi dùng service analytics cũ.

## 2. Phạm vi trưởng nhóm

`getContactScope` thực sự trả visibleUserIds theo phòng/cây con và accessibleContactIds (`contacts/contact-scope.ts:89–129`). Nhưng `gateReportAccess` chỉ kiểm tra size>1 rồi bỏ scope; handler sales-performance lấy mọi user active của org (`report-analytics-routes.ts:301`).

Fixture: leader-a chỉ được xem leader-a/sale-a; tổ chức còn sale-b thuộc phòng khác. Handler nhận cả sale-b trong response. Member chỉ thấy chính mình bị403 đúng ở test đối chứng. Query vẫn lọc orgId nên đây là vượt phạm vi phòng trong cùng tổ chức, chưa có bằng chứng vượt tổ chức.

Prisma extensions trong `shared/database/prisma-client.ts:111–155` kiểm tra tenant và gắn app.current_org; không tự thêm filter department/user vào query. Test mock không chạy JWT, RLS hay quyền menu thực tế, nên chưa khẳng định tài khoản production nào đang khai thác được. Tuy vậy, thiếu giới hạn ở route/query đã được tái hiện. Analytics routes cũng truyền orgId mà không truyền subtree sau khi gate (`analytics-routes.ts:29–63`, `reports/team-performance.ts:37`).

Một trường hợp phụ: leader có subtree chỉ gồm chính mình sẽ bị403 vì gate dựa số người>1, không trực tiếp kiểm tra deptRole. Cần quyết định policy này trước khi sửa.

Đề xuất: chuẩn hoá report scope và áp vào từng count/groupBy/raw SQL; kiểm tra hai phòng, phòng con, owner/admin và member. Không khắc phục bằng cách chỉ ẩn tab.

## 3. Ngày và định nghĩa chỉ số

### Lệch múi giờ — tái hiện

Chọn ngày01/10 Việt Nam, backend bắt đầu `2026-10-01T00:00Z` =07:00 VN. Tin lúc01:00 VN ngày01/10 bị loại; khung cuối còn nhận sang sáng hôm sau. Với kỳ01–29/10, dateBounds thực tế là01/10 00:00Z đến30/10 00:00Z. Ngày Việt Nam cần01/10 00:00+07 đến30/10 00:00+07, tương đương30/09 17:00Z đến29/10 17:00Z.

### Lịch hẹn hôm nay — tái hiện

Query chỉ có gte đầu ngày, không có lt cuối ngày (`report-analytics-routes.ts:101`). Đặt giờ hiện tại29/10, fixture lịch10/11 vẫn làm apptToday=1. Đây là lỗi bộ lọc ngày độc lập với việc UTC hay VN.

### Tỷ lệ chốt — xác nhận từ query

Overview đếm khách tạo trong kỳ và hiện mang trạng thái chốt; TopSales.closed và Sales.closed đếm trạng thái hiện tại không giới hạn ngày (95,134,318). Không truy theo thời điểm chuyển sang chốt. Vì vậy chưa thể gọi tất cả các giá trị này là “số chốt trong kỳ”. Snapshot vẫn có thể hữu ích nếu nhãn nêu đúng định nghĩa.

Đề xuất: một helper kỳ Asia/Ho_Chi_Minh, validate from/to và inclusive end thống nhất; tách snapshot/cohort/conversion event; dùng lịch sử đổi trạng thái nếu báo cáo cần số chốt trong kỳ. Không âm thầm đổi công thức khi chỉ đổi UI.

## 4. Báo cáo AI — bổ sung kết luận ban đầu

`GET /api/v1/ai/usage` → `getAiUsage` (`ai-service.ts:90`) đếm aiSuggestion từ đầu ngày theo giờ server, trả usedToday/maxDaily/remaining/enabled. Không nhận kỳ, không thống kê chi phí/token hay gửi thành công. AiSuggestion còn có nhiều type, gồm auto_reply_needs_review; không nên gọi usedToday là số tin AI đã gửi hoặc số lần gọi model chính xác.

**Đã có dữ liệu nền**, không cần bắt đầu từ0:

- Tin auto-reply: Message.sentVia='ai_auto', metadata.aiAuto, sources và dryRun (`ai-auto-reply-service.ts:296–317`).
- ActivityLog action='ai_auto_reply_sent' cùng conversation/messageId; tác vụ ghi audit này best-effort nên có thể thiếu dòng nếu ghi lỗi (340–352).
- AI followup cũng dùng sentVia='ai_auto' nhưng action='ai_followup_sent' (`ai-followup-cron.ts:310,346`); nếu gộp sentVia cần nói rõ bao gồm cả followup.
- Bản nháp cần duyệt: AiSuggestion.type='auto_reply_needs_review' (`ai-auto-reply-service.ts:443`).
- Schema có AiSuggestion.accepted và AiSuggestionApplied.acceptedFields/rejectedFields (`schema.prisma:1911–1954`), nhưng AiSuggestionApplied phục vụ áp dụng trường CRM; không mặc định coi là duyệt gửi tin nhắn.
- Có observability/Opik riêng dưới modules/ai/observability; không thấy token/cost trong trace contract hiện tại, chưa xác minh dịch vụ ngoài có dữ liệu bổ sung.

Dashboard AI bước đầu có thể tổng hợp tin đánh dấu ai_auto, hội thoại có AI gửi, bản nháp chờ duyệt và phân biệt auto reply/followup. Cần loại dry-run/isLocal, kiểm soát scope, chống đếm trùng/audit thiếu và xác minh dấu gửi có nghĩa là gì. Chi phí cần model/provider/token usage; chuyển nhân viên và conversion cần định nghĩa sự kiện rõ, chưa suy ra từ dữ liệu hiện tại.

## Bằng chứng chạy kiểm tra

File `backend/tests/unit/reports-review-evidence.test.ts`: **5/5 test đạt**, Vitest4.1.4, thời gian chạy264ms ở lần hoàn tất. Chạy từ backend:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts
```

Đây là characterization test tái hiện hành vi hiện tại: pass nghĩa là tái hiện thành công, không nghĩa lỗi đã sửa. Không gọi DB/network. Lần chạy sandbox đầu không thực thi test do EPERM đổi tên cache tạm; chạy lại ngoài sandbox đã hoàn tất. Không có test hiện hữu chuyên biệt cho bốn vấn đề được tìm thấy qua tìm kiếm trong backend/tests; có test custom-report SQL injection nhưng không thay thế kiểm tra scope/ngày/KPI.

Thứ tự xử lý đề xuất: scope phòng ban → kỳ/ngày và định nghĩa KPI → thay placeholder → báo cáo AI → render báo cáo mobile. Chưa sửa runtime hoặc deploy.
