# TikTok TT11: xác minh 2 bước và inbox Business Suite

## Bằng chứng và phạm vi

- Chủ tài khoản yêu cầu sửa đăng nhập, tiếp tục dùng `setupxebanhcorep`.
- Ảnh người dùng có màn hình xác minh 2 bước. Worker trước sửa chỉ hỗ trợ QR/password và dừng ở challenge.
- Kiểm tra DOM bằng trình duyệt Codex: liên kết chính chủ `a[data-e2e="nav-profile"]` trỏ tới `/@setupxebanhcorep?lang=en`; Business Suite chứa iframe có src `/messages?allow_label=true&lang=en&scene=business`.
- Mở trang inbox được iframe nhúng: quan sát được `#main-content-messages`, `dm-new-conversation-list` và 29 `dm-new-conversation-item`; phần tử có cha `data-conversation-id`. Không sao chép cookie, OTP hoặc nội dung inbox vào báo cáo.

## Thay đổi

- Endpoint quản trị `POST /api/v1/channel-accounts/tiktok/:id/verify` nhận epoch và mã 6 chữ số. Kiểm quyền tài khoản/tổ chức, epoch, trạng thái CHALLENGE, form xác minh đang được worker quan sát và độ mới tối đa 60 giây.
- Action verify dùng hàng đợi RAM một lần, TTL 60 giây; giữ nguyên epoch/profile. Không ghi DB hoặc log mã. Worker xóa mã khỏi action sau thao tác và che lỗi Playwright có thể chứa giá trị input.
- Form CRM chỉ xuất hiện khi worker nhận diện được form xác minh 2 bước và một input/nút phù hợp. Không tự gửi lại mã, không bấm gửi mã lại, không xử lý CAPTCHA. Selector form là giả định có kiểm tra fail-closed; chưa quan sát trực tiếp form 2FA trên worker thật.
- Inbox có thể ở trang chính hoặc iframe cùng origin, đường dẫn `/messages`, scene `business`. Đọc/gửi dùng cùng scope; outbound vẫn tắt.
- Xác minh danh tính dùng liên kết nav-profile chính chủ; không dùng link của người trò chuyện. Nếu inbox không có nav-profile, kiểm tra qua trang For You rồi trở lại inbox. Thiếu danh tính thì dừng đồng bộ.
- Sửa tham số bộ đọc DOM: Playwright chỉ truyền một tham số username; bộ đọc hiện hỗ trợ chế độ này và chế độ fixture truyền document.
- Hiển thị mã lỗi giới hạn đăng nhập riêng với lỗi thông tin tài khoản.

## Kiểm tra

- Worker: 19/19 đạt, gồm submit mã một lần, từ chối CAPTCHA/form thường/trang khác origin, che lỗi chứa mã và tham số bộ đọc DOM.
- Backend: 26/26 test liên quan đạt, build đạt.
- Frontend: 69/69 đạt, build đạt.
- Image worker production: 19/19 test đạt; smoke test Chromium trên HTML giả lập đạt cho submit xác minh và bộ đọc DOM được serialize trong iframe. Không phải bằng chứng đăng nhập TikTok thật.
- DOM thực tế xác nhận iframe và selector inbox; không chứng minh phiên worker đã đăng nhập được hoặc tin đã đồng bộ vào CRM.

## Triển khai và rollback

- Không schema/migration, không đổi tài khoản, không bật outbound/media/comments/AI/broadcast.
- Image app trước sửa: `zalocrm-corepviet-app:pre-2fa-20261014`; worker trước sửa: `zalocrm-corepviet-tiktok-personal-worker:99beae1`.
- Rollback: tag hai image trên thành latest của từng service, rồi `docker compose --profile tiktok-personal up -d --no-deps app tiktok-personal-worker`. Giữ profile volume.
- Trước build đã dọn hai image app cũ không được container dùng (`717a50f`, `1b910e3`), giữ app hiện hành và rollback gần nhất; ổ đĩa còn 14 GB.
- Trong build đã dọn thêm worker cũ `1b910e3`, `ce779d2`/`pre-loginfix-20261013`, giữ worker rollback `99beae1`. Không xóa volume hay container dịch vụ khác.
- Nghiệm thu live cần chủ tài khoản thực hiện login/2FA trực tiếp trên CRM khi TikTok cho phép. Nếu vẫn rate-limit hoặc form chưa được nhận diện, không coi là PASS và không tự thử lại liên tục.
