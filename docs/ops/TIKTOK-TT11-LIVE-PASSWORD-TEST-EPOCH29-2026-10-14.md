# TT11: kiểm tra đăng nhập thật, epoch 29

## Kết quả

Đăng nhập thật chưa đạt. Chủ tài khoản nhập thông tin trực tiếp trong CRM; không cấp mật khẩu/OTP/cookie trong chat. Không thử mật khẩu giả và không thay đổi username cấu hình `setupxebanhcorep`.

## Bằng chứng ngày 14/10/2026 (giờ Việt Nam)

- Epoch 27: 06:30:26 worker nhận action password; 06:30:33 mở và submit form xong. Trang `/login/phone-or-email/email` có marker cố định `maximum number of attempts`, state error, reason attempt_limit.
- Epoch 28: 06:30:38 nhận action password; 06:30:43 mở/submit form xong.
- Epoch 29, lần chủ tài khoản báo đã bấm theo yêu cầu: 06:31:48 nhận action password; 06:31:53 mở/submit form xong.
- DB sau lần thử: `setupxebanhcorep|ERROR|inbound=false|outbound=false|epoch=29|verified_at=NULL`.
- Đối chiếu DOM panel CRM đang hiển thị epoch 29 và thông báo `TikTok đang giới hạn số lần đăng nhập`. Không đọc giá trị các input mật khẩu hoặc mã xác minh.
- Log quan sát chống trùng không in lại thông báo không đổi giữa các lần thử. Không coi việc thiếu log quan sát mới là kết quả đăng nhập thành công.

## Kết luận và giới hạn

- Yêu cầu đã đi từ CRM đến worker và tới form TikTok, khác với lỗi mất action đã sửa trước đó.
- Chưa tới 2FA; chưa kiểm chứng form xác minh trên TikTok thật. Chưa có session đã xác minh hoặc đồng bộ tin live.
- Chưa có bằng chứng xác định giới hạn áp dụng theo IP, thiết bị, phiên hay tài khoản. Website hoạt động trên máy chủ tài khoản không chứng minh môi trường VPS được TikTok chấp nhận.
- Chưa có thời gian hết giới hạn do TikTok cung cấp. Không tự lặp đăng nhập, đổi IP/fingerprint hoặc xử lý CAPTCHA để vượt giới hạn. Giữ phiên web của chủ tài khoản đang hoạt động.
- Nếu cần hỗ trợ, chủ tài khoản báo lỗi cho TikTok theo https://support.tiktok.com/en/using-tiktok/report-a-problem/report-a-problem . Không tự gửi báo cáo thay chủ tài khoản.

Không sửa code, không deploy/migrate thêm trong lần kiểm tra này. Không bật outbound.
