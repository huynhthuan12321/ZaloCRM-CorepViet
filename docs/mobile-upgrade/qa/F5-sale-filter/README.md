# F5 — Sale phụ trách (10/11/2026)

Nhánh: `mobile/f5-sale-filter`, từ `mobile/base @ 269d8a3`. Chờ chủ dự án duyệt trước khi merge. Không thay đổi API/backend.

Desktop và mobile dùng picker tìm kiếm nhân viên. Danh sách là giao của `GET /users` (đang hoạt động, cùng tổ chức do server giới hạn) và `GET /dashboard/action-hub/picker/users` (phạm vi RBAC). Không fallback danh bạ toàn tổ chức khi picker lỗi. Sale thường giữ “Khách của tôi”, không tải danh sách nhân viên. Quyền chọn dùng auth store: admin/owner, trưởng/phó phòng hoặc contact.view_all.

Chọn nhân viên gửi `assignedUserId=<userId>` tới `/conversations`. URL chỉ lưu ID/lựa chọn; mở thread, back và reload giữ lọc. Badge “Đang xem” có nút bỏ lọc. Mobile chọn nháp rồi Áp dụng.

| Kiểm tra | Kết quả |
| --- | --- |
| Merge-base với mobile/base | 269d8a333d165c6fe6646d89f5720dfa31ab8f80 |
| npm ci | Exit 0, lockfile không đổi |
| vue-tsc -b | 0 lỗi |
| Toàn bộ Vitest frontend | 64 file, 708/708 PASS |
| Production build | PASS |
| E2E F5 Chromium + WebKit thật | 10/10 PASS |
| Admin API lọc A / B | Mỗi người đúng 1 hội thoại, assignedUserId khớp |
| Sale API lọc chính mình | 1 hội thoại |
| Sale gửi ID ngoài phạm vi nick | HTTP 200, 0 hội thoại |
| Dọn fixture tạm trong DB TEST | Đã dọn, còn 0 bản ghi |
| Desktop 1440×900 đóng Sale, cả hai engine | Exact 0 pixel khác |
| Desktop 1440×900 mở Sale, ngoài popover + bóng, cả hai engine | Exact 0 pixel khác |

Ảnh baseline build từ đúng commit `269d8a3`; hai bản dùng cùng dữ liệu giả và giờ cố định. Ảnh và kết quả riêng ở `chromium/` và `webkit/`. Chụp scale CSS để tọa độ vùng Sale đúng cả WebKit DPR 2. Giữ nguyên clipping header sidebar khi popover Sale mở để không thay đổi bóng badge riêng tư.

Harness F5 chặn service worker để API mock luôn được page.route xử lý; hành vi PWA được kiểm riêng ở đợt E. Fixture API thật chỉ tạo sau khi kiểm development, host DB TEST được cho phép và health backend TEST; luôn dọn trong finally. Script chạy fixture nằm ngoài repository; kết quả đã bỏ token/credential ở `api-results.json`.

Chạy lại sau khi build baseline từ đúng commit:

```powershell
cd frontend
npm ci
node node_modules/vue-tsc/bin/vue-tsc.js -b
node node_modules/vitest/vitest.mjs run --silent
node node_modules/vite/bin/vite.js build
$env:BASE_DIST='C:/Users/Public/zalocrm-f5-base269/frontend/dist'
node node_modules/@playwright/test/cli.js test e2e/f5-sale-filter.spec.ts --project=chromium --project=webkit --workers=1
```

## Giới hạn backend có sẵn

“Chưa giao” tiếp tục gửi `assignedUserId=unassigned` theo hợp đồng frontend cũ. Backend so trực tiếp chuỗi này với assignedUserId, chưa ánh xạ null. API thật trả 0 dù fixture có 1 khách chưa giao. Giữ nguyên backend theo phạm vi yêu cầu.

Kiểm server xác nhận phạm vi nick hiện có chặn dữ liệu ngoài quyền; không khẳng định có cơ chế chặn mọi ID nhân viên độc lập với quyền nick. Chưa merge, push hoặc deploy.
