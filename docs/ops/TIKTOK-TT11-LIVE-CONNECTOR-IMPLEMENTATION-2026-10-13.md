# TT11 — TikTok Personal live connector

Ngày thực hiện: 13/10/2026
Phạm vi: một tài khoản TikTok Personal, đăng nhập QR, tin nhắn chữ 1–1.

## Kết quả

Đã triển khai mã nguồn connector live dựa trên nền TT00–TT10:

- CRM có API quản trị để tạo một tài khoản pilot, tạo epoch kết nối, đọc trạng thái QR,
  bật/tắt gửi và ngắt phiên.
- Worker Playwright riêng dùng persistent profile, xác minh đúng username sau đăng nhập,
  đọc các hội thoại đã render, phát event có ID ổn định và xử lý một lệnh gửi mỗi lần.
- Ingress và outbox dùng HMAC theo tài khoản, kiểm epoch, chống trùng event/message và
  không tự gửi lại khi kết quả thao tác browser chưa rõ.
- Hộp thư chung có lựa chọn TikTok và panel quản trị QR/trạng thái.
- Docker worker nằm trong profile `tiktok-personal`, không tự chạy cùng CRM thông thường,
  không mở port và không nhận toàn bộ `.env` của ứng dụng.
- Media, bình luận, broadcast, automation và AI auto-send vẫn bị khóa.

## Cờ vận hành

Mặc định mọi cờ vẫn `false`. Trình tự nghiệm thu production:

1. Bật kênh + Personal + inbound; giữ outbound `false`.
2. Tạo tài khoản trong **Tin nhắn → TikTok**, bấm kết nối và ghi account ID/epoch vào
   biến worker.
3. Khởi động riêng Docker profile `tiktok-personal`, quét QR và xác minh username.
4. Nghiệm thu nhận tin mới và chống trùng.
5. Chỉ sau khi inbound đạt mới bật cờ outbound, restart app và bật gửi cho tài khoản
   trong UI; gửi một tin thử đã được cho phép.

Chi tiết lệnh vận hành nằm tại `workers/tiktok-personal/README.md`.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Backend TypeScript `tsc --noEmit` | PASS |
| Frontend TypeScript `vue-tsc --noEmit` | PASS |
| Frontend production bundle | PASS |
| 5 suite backend liên quan kênh, 43 test | PASS |
| Toàn bộ frontend, 69 test | PASS |
| Worker Node test, 4 test | PASS |
| `git diff --check` | PASS |

Bộ backend toàn repo chạy được 888 test PASS và 24 test SKIP, nhưng không xanh hoàn
toàn do 39 file test cũ tham chiếu module `_ee`/automation không có trong checkout,
các integration test thiếu database test, và 6 assertion cũ ngoài phạm vi connector.
Các suite trực tiếp bị ảnh hưởng bởi TT11 đều PASS.

Máy Windows phát triển không có lệnh Docker nên chưa chạy `docker compose config` và
chưa build image worker tại local. Hai kiểm tra này là cổng bắt buộc trên VPS trước
khi recreate app hoặc khởi động worker.

## Triển khai VPS

Đã triển khai commit `dbf0e9e44267db25bba883a4057038c4654589d7` lên VPS ngày
13/10/2026:

- `docker compose config --quiet`: PASS.
- App image `b53c7b3b5dd6`, 4,85 GB; container app healthy ở health nội bộ và domain.
- Worker image `285f33973f9c`, 1,85 GB; chỉ build sẵn, container chưa được tạo/chạy.
- Runtime health: TikTok `disabled`, inbound `false`, outbound `false`.
- Giữ image app `717a50f` để rollback. Build cache đã xóa.
- Dung lượng sau triển khai: 58/79 GB, còn 18 GB, 77%.

Chưa tạo `ChannelAccount`, chưa ghi worker secret/account/epoch, chưa mở QR và chưa
kết nối tài khoản TikTok trong lần deploy này.

### Sửa lỗi image worker khi kích hoạt

Lần start đầu phát hiện Chromium được cài trong cache của `root` nhưng runtime chạy
user `node`. Worker restart trước khi mở browser; tài khoản vẫn `QR_PENDING` và nhận/gửi
đều tắt. Dockerfile sau đó đặt `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` và cấp quyền
đọc/thực thi cho runtime user trước khi build lại. Không có thao tác nào được gửi tới
TikTok trong lần start lỗi.

## Giới hạn đã biết

- TikTok không cung cấp hợp đồng DOM ổn định cho luồng này; selector phải được kiểm lại
  khi giao diện TikTok thay đổi.
- Worker mở tối đa số hội thoại cấu hình trong mỗi vòng; việc mở hội thoại có thể thay
  đổi trạng thái đã đọc bên TikTok.
- QR runtime được giữ trong RAM của app. Restart app cần chờ worker báo trạng thái lại.
- Ngắt kết nối làm epoch cũ mất hiệu lực nhưng không tự xóa browser profile. Xóa volume
  profile là thao tác vận hành riêng.
- Chỉ tin nhắn chữ trong cửa sổ DOM đã render được hỗ trợ. Không coi dữ liệu cũ ngoài
  cửa sổ này là lịch sử đã đồng bộ đầy đủ.

## Rollback

1. Đặt bốn cờ `CHANNELS_ENABLED`, `TIKTOK_PERSONAL_ENABLED`,
   `TIKTOK_PERSONAL_INBOUND_ENABLED`, `TIKTOK_PERSONAL_OUTBOUND_ENABLED` về `false`.
2. Dừng worker: `docker compose --profile tiktok-personal stop tiktok-personal-worker`.
3. Recreate riêng app để áp dụng cờ. Schema TT00–TT10 là additive, không down-migrate.
4. Nếu cần rollback image app, dùng image/commit production trước TT11 và vẫn giữ các
   cờ TikTok tắt.
