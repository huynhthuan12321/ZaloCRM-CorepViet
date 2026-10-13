# TT11: kiểm tra lại đăng nhập, epoch 26

## Bằng chứng

- Ảnh người dùng chọn phương thức QR nhưng đang hiển thị lỗi giới hạn đăng nhập.
- Log trước sửa: quan sát cuối ở `/login/phone-or-email/email`, nhóm `attempt_limit`, kèm một `session_report_failed status=409`. Chưa có log phương thức action để chứng minh QR mới đã được worker nhận.
- Chọn radio QR chỉ đổi form frontend; phải bấm Tạo mã QR để gửi action mới. Không suy luận từ radio rằng worker đã mở QR.

## Lỗi đã sửa

- `claimTikTokLoginAction` trước sửa xóa pending action trước khi so epoch. Nếu request claim đọc epoch cũ và connect vừa queue epoch mới, request cũ có thể xóa nhầm action mới. Đây là lỗi được chứng minh bằng code và regression test; chưa chứng minh đây là nguyên nhân duy nhất của lần thử thực tế.
- Giữ action có epoch mới hơn claim; chỉ consume epoch bằng nhau, xóa action hết hạn hoặc cũ hơn claim. Test claim 25 không làm mất QR 26 đạt.
- Không coi câu chung `Try again later` là bằng chứng chắc chắn giới hạn số lần thử. Chỉ `Too many attempts` hoặc `Maximum ... attempts` nhận mã rate-limit. Các kết luận trước chỉ dựa nhóm regex cũ cần đọc lại theo giới hạn này.
- Log thêm method/epoch khi action được nhận và mở xong, cùng marker lấy từ danh sách cụm lỗi cố định. Không log identifier, password, OTP, cookie hay raw page body.

## Kiểm tra và deploy

- Commit runtime: `1bd02d0`.
- Backend: 27/27 test liên quan đạt, build đạt. Kiểm tra module JS trong app production: claim cũ không xóa QR mới đạt.
- Worker: 20/20 đạt cục bộ và trên image production.
- Deploy bằng lớp COPY trên image app `0b413ff` và worker `39cc069`, giữ toàn bộ phần còn lại. App chép đúng module JS đã build vào `/app/dist/modules/channels/tiktok-login-control.js`; worker chép browser/worker module. Dockerfile chuẩn vẫn build được source mới.
- App/worker đã recreate, health public HTTP 200. Worker khởi động và quan sát `qr_required` trên `/login/qrcode`.
- Rollback: image app `0b413ff`, worker `39cc069`; không schema/migration, không bật gửi, không xóa profile.
- Chưa xác nhận đăng nhập TikTok thật PASS. Đã yêu cầu chủ tài khoản bấm Tạo mã QR một lần để đối chiếu method/epoch mới, rồi mới kiểm tra quét.
