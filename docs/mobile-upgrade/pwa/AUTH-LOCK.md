# LOCK E-auth — bản sửa dùng chung desktop/mobile

Chủ dự án duyệt ngày 10/11/2026. Commit riêng: `fix(auth): mat mang khong dang xuat`, không phụ thuộc module PWA, có thể cherry-pick riêng sau khi duyệt phát hành. Chưa đưa vào production.

Phạm vi: stores/auth.ts, api/index.ts, chỉ khối catch refresh ở api/socket.ts; hai helper api/auth-session-policy.ts, api/auth-connection.ts và hai file test. Không đổi nơi lưu token, RBAC, API contract, payload login/logout, event/socket protocol hoặc cách connect/reconnect.

| Ca | Phiên |
|---|---|
| Profile offline, timeout, 500, 502, 503, 429 | Giữ token và user đã xác minh; báo mất kết nối |
| Cold start offline | Giữ token nhưng không giả lập user/grants hoặc quyền offline |
| Profile 401/403 | Xóa phiên như server từ chối |
| Refresh 401 hoặc 400 có code/message token invalid | Xóa phiên |
| Refresh lỗi mạng/timeout/5xx/429 hoặc 400 không phải token invalid, 403 refresh | Giữ phiên; không biến lỗi refresh tạm thời thành 401 gốc |
| Socket refresh lỗi mạng | Giữ token, trạng thái disconnected; không đổi cơ chế kết nối |
| Nhiều request 401 đồng thời | Giữ single-flight refresh hiện có, chỉ rotate một lần |
| Logout chủ động | Vẫn revoke refresh family và xóa token/user |

Store retry profile khi online hoặc app hiện lại nếu đang mất kết nối, có single-flight profile để tránh nhân request. Bỏ qua response của phiên cũ sau logout/đổi token, gồm cả refresh success/rejection đến muộn; snapshot refresh token không cho hồi sinh hoặc xóa phiên mới. Refresh 403 được phân loại theo nguồn refresh, không nhầm thành profile 403. Không cache profile vào storage.

Ảnh hưởng DESKTOP có chủ đích: trước đây lỗi mạng khi fetchProfile/refresh có thể đẩy về login; nay giữ phiên và hiện toast tiếng Việt. Không đổi layout mặc định. Full PWA offline panel/update là thay đổi riêng chưa commit chung với bản sửa này.

Kiểm thử riêng: Vitest 31/31 PASS (2 file), vue-tsc -b PASS. Các API/socket dùng mock hoàn toàn; không database hoặc khách thật.
