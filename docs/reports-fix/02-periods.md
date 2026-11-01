# Bước 2A — Chuẩn hóa kỳ báo cáo theo giờ Việt Nam

**Trạng thái:** triển khai A hoàn tất; 2B PASS sau remediation — xem [biên bản kiểm tra](02-periods-verification.md). Đây là kết quả kiểm tra local, không phải nghiệm thu production.

## Thay đổi

- Thêm helper backend dùng `Asia/Ho_Chi_Minh` để lấy ngày hiện tại, xác thực `YYYY-MM-DD`, yêu cầu `from <= to`, giới hạn kỳ tối đa 366 ngày và tạo danh sách ngày của kỳ. Kỳ mặc định là 30 ngày; riêng automation summary giữ mặc định 7 ngày.
- Dùng khoảng timestamp nửa mở `[start, end)` theo nửa đêm giờ Việt Nam; kỳ trước có cùng độ dài và không chồng lấn. Tách bounds cho timestamp và ngày lưu theo date-only để tránh dịch ngày hai lần.
- Áp dụng kỳ dùng chung cho report dashboard/export, Analytics/custom/saved reports, automation summary và broadcast. Query date/range không hợp lệ trả HTTP 400 với mã `invalid_report_date_range`.
- Nhóm timestamp theo ngày Việt Nam; giữ nguyên ngữ nghĩa date-only cho lịch hẹn và ngày thống kê. Engagement daily/heatmap tiếp tục dùng bucket UTC sẵn có và trả metadata UTC thay vì gắn nhãn sai là giờ Việt Nam.
- Thêm helper ngày phía frontend để tính ngày nhất quán theo giờ Việt Nam trên mọi timezone máy; nối date range/query cho Overview, Nick Fleet, Sales, Pipeline, Automation, Broadcast, Audit và Analytics.
- Message series của Overview lấy dữ liệu theo kỳ chọn và điền 0 cho ngày không có bản ghi. Các KPI/placeholder khác thuộc phạm vi bước tiếp theo, chưa được tuyên bố hoàn tất ở đây.

## Kiểm tra local

- Backend: 12 file test liên quan — **71 tests passed** (period helper, report evidence, HTTP scope, saved/custom reports, response-time, và kiểm tra lại bước 1B).
- Frontend: `src/utils/report-period.spec.ts` — **2 tests passed**.
- Backend TypeScript build — **PASS** (`npm.cmd run build`).
- Frontend production build — **PASS**.
- `git diff --check` trên phần patch Báo cáo — **PASS**.

## Giới hạn và bước tiếp theo

- 2B đã kiểm tra boundary/timezone, một route API message với PGlite fixture, DATE-only bounds, validation, cohort/unavailable conversion và Engagement UI. Phạm vi cùng giới hạn chi tiết nằm trong [biên bản 2B](02-periods-verification.md).
- Chưa chạy DB/RLS/browser acceptance, migration hay production verification; không deploy.
- Bước tiếp theo được phép là 3A; bước 3 chưa được triển khai trong lượt xác minh này.
