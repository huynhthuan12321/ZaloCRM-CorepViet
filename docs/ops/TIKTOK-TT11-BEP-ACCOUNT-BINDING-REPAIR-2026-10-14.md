# TT11: sửa binding worker, chuyển sang @bepbanhcorep

## Nguyên nhân của phiên 48

- CRM/DB còn account `485757de-7b67-486f-bf49-40a53a488ee8`, username `setupxebanhcorep`, epoch 48, QR_PENDING.
- Worker chạy với account `1a0304e9-a452-4f14-8554-282ea01d8e35`, username `bepbanhcorep`. Account ID này không có trong DB.
- Cả control claim và session report liên tục HTTP 404. Đây là lỗi binding nội bộ; chưa thể quy lỗi lần này cho TikTok hoặc mật khẩu.
- Chủ tài khoản đã chọn rõ chuyển kết nối sang `@bepbanhcorep`.

## Thực hiện

- Xác nhận account cũ có 0 conversation, channel event, contact identity và outbound command; không có lịch sử cần giữ dưới account đó. Không mở rộng nhiều tài khoản.
- Backup row account/session và cấu hình vào `/root/.zalocrm-ops/`, quyền thư mục 700 và file 600. Không đưa .env hoặc dữ liệu đăng nhập vào Git/chat.
- Lưu profile cũ `485757de-...` bằng rename thành thư mục archive dưới volume `/data/profiles`; không xóa cookie hoặc profile cũ. Profile UUID `1a0304e9-...` cũng được giữ nguyên, không dùng để giả định đã đăng nhập.
- Trong transaction có kiểm tra lại identity và lịch sử rỗng, đổi account hiện có thành `bepbanhcorep`, displayName `@bepbanhcorep`; tăng epoch lên 49, đổi opaque profileRef, clear verifiedAt/expiresAt. Giữ org/owner và account ID; inbound/outbound false.
- Chỉ sửa hai key binding `.env`: `TIKTOK_PERSONAL_ACCOUNT_ID=485757de-7b67-486f-bf49-40a53a488ee8`, `TIKTOK_PERSONAL_USERNAME=bepbanhcorep`. Secret và các cờ khác giữ nguyên.
- Recreate app/worker bằng đúng image ID đang chạy qua override tạm, tránh vô tình thay code trong checkout/image latest đang có thay đổi khác. Không build code, không migrate/schema.
- Giữ nguyên các file backup frontend đang modified/untracked của công việc khác.

## Kiểm chứng

- DB chỉ có một account TikTok: `bepbanhcorep|QR_PENDING|enabled=true|inbound=false|outbound=false|epoch=49|verified_at=NULL`.
- Worker khởi động đúng ID `485757de-...`, username `bepbanhcorep`; quan sát `qr_required` ở `/login/qrcode`.
- Không còn 404 trong log sau restart. updated_at trong DB tiếp tục được cập nhật bởi session report.
- Health public HTTP 200; restart count app/worker bằng 0.
- Đã yêu cầu chủ tài khoản tải lại CRM và thử một lần với đúng @bepbanhcorep. Chưa nghiệm thu login/2FA TikTok thật hoặc đồng bộ inbox.

## Rollback

- Chỉ đổi lại username/displayName khi vẫn chưa có dữ liệu phát sinh cho @bepbanhcorep. Nếu có lịch sử mới, giữ dữ liệu riêng và thiết kế chuyển account thay vì relabel.
- Luôn tăng epoch khi rollback, không phục hồi epoch cũ từ snapshot.
- Đặt binding worker trở lại ID `485757de-...` và username `setupxebanhcorep`, phục hồi profile setup từ thư mục archive sau khi lưu profile bep riêng; recreate bằng cùng image. Không phục hồi nguyên .env backup có ID worker không tồn tại.
