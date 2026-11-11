# PWA đợt E — rollback / kill-switch

Phạm vi: nhánh mobile/pwa, base 3ae82c4. Chưa phát hành hoặc thay VPS. Các bước server dưới đây là runbook chờ người vận hành duyệt, không phải bằng chứng đã chạy trên production.

## Thiết kế an toàn

- Worker root `/sw.js`, scope `/`; đăng ký `updateViaCache: none`, kiểu prompt. Không push.
- Chỉ precache index.html tĩnh, JS/CSS/font dưới assets và đúng bốn icon PWA. index là shell giống nhau cho mọi người, không chứa profile/token/API data. Navigation response không bao giờ ghi cache.
- API, socket, ảnh/video/tài liệu khách và URL khác không có strategy cache. Navigation fallback chỉ cho allowlist route SPA; 503 maintenance/401/403 được trả nguyên, không thay bằng shell.
- Mọi entry precache được kiểm path và MIME lúc install; JSON/HTML giả JS làm install fail thay vì lưu nhầm dữ liệu.
- Giữ cache shell của build trước để tab còn nháp vẫn tải chunk cũ. Worker mới không skipWaiting tự động; controllerchange do tab khác cũng không tự reload. Cập nhật chỉ khi người dùng bấm và không có nháp/tin chờ; kiểm lại guard ngay lúc controllerchange để giữ chữ vừa gõ trong lúc activate.
- Cache cũ chỉ có static shell, không profile. Không tạo IndexedDB mới. Khi logout/đổi user, dọn cache người dùng thuộc namespace CRM (crm-user-, zalocrm- và legacy Workbox đúng root scope) và IndexedDB CRM được browser liệt kê; không xóa kho của app khác trên cùng origin, giữ static shell không có dữ liệu người dùng. Browser không có indexedDB.databases() chỉ dọn các tên legacy biết trước (workbox-expiration, crm-user-cache, zalocrm-user-cache); không có DB mới cần dọn trong đợt này. DB đang bị tab khác giữ được báo để đóng tab và thử lại.
- Không cache quyền/user/profile để cấp truy cập offline. Cold start có token nhưng không xác minh được hiện panel tiếng Việt, giữ token và chờ mạng. Auto retry profile online/visible do auth single-flight đảm nhiệm, không gọi gửi tin từ PWA.

## Kill-switch từ server (không cần build)

1. Giữ origin và scope cũ, backup file worker đang phục vụ.
2. Đổi nội dung **`/pwa/control.json`** thành `{"enabled":false,"version":1}`.
3. Phục vụ **nội dung `frontend/public/pwa/kill-sw.js` tại chính URL `/sw.js`**. Không chỉ đổi tên file hoặc bỏ file SW (404 không gỡ worker đang cài).
4. Với `/sw.js` và `/pwa/control.json`, đặt HTTP `Cache-Control: no-store, max-age=0`. Nếu có CDN, purge chính hai URL. Tránh cache JSON control hoặc trả SPA index thay cho worker.
5. Giữ tombstone `/sw.js` ít nhất qua vòng người dùng mở lại app, kể cả khi app image đã rollback. Không xóa file tombstone ngay sau cutover.

`control.json` không có trong precache. Runtime kiểm khi mở app, online/foreground và mỗi phút khi đang foreground; worker cũng kiểm khi navigation. Khi nhận enabled=false: unregister worker root, xóa các CacheStorage thuộc CRM, giữ kho của app khác trên cùng origin và thông báo các cửa sổ; không reload, không xóa token hoặc nháp RAM. Tombstone install skipWaiting, activate xóa cache CRM và unregister, không có fetch handler và không navigate client. Nếu đang offline không thể nhận lệnh từ server: kill có hiệu lực sau khi client liên lạc lại, không hứa thu hồi worker tức thời trên thiết bị mất mạng.

Cần bảo đảm URL `/sw.js` không được proxy tới origin khác, trả JavaScript MIME đúng và cùng HTTPS origin. Root scope không cần mở rộng Service-Worker-Allowed vì worker đã nằm ở `/sw.js`.

## Rollback app image

Tắt PWA bằng kill-switch trước hoặc đồng thời theo quy trình image rollback hiện hành. Giữ control=false/tombstone độc lập với image cũ để worker cached không che sự thay đổi. Install chỉ chạy tối đa sáu fetch song song, tránh vượt giới hạn in-flight của Quick Tunnel. Không phục hồi DB, tắt RLS/guard, sửa khách hoặc xóa outbox để xử lý lỗi SW. App shell cache không thay cho backup dữ liệu.

Sau khi server đang chạy lại an toàn: kiểm HTTPS /login, health; trong DevTools/Application xác nhận registrations root đã mất và CacheStorage CRM trống; mở lại Home Screen trên iPhone, xác nhận không trắng trang/không reload mất nháp. Chỉ bật lại control=true và worker build mới sau kiểm thử lại.

## Kiểm tay trên thiết bị

- Chạy bản build qua HTTPS (localhost trên máy QA là secure-context exception, không chứng minh Safari/iPhone thật).
- Cài Home Screen, mở standalone; chưa login thấy màn đăng nhập; có phiên nhưng offline thấy thông báo rõ, token vẫn giữ, không thấy quyền/data lấy từ cache.
- Có update: gõ nháp ở khách A, tạo tin Đang chờ gửi, xác nhận Cập nhật bị khóa; gửi/hủy theo nghiệp vụ rồi mới cập nhật. Tab khác accept update không reload tab còn nháp.
- Đổi control=false: sau foreground/online, registrations/cache được dọn, không reload mất nội dung đang soạn. Bật tombstone kiểm trên một browser profile có worker cũ.
- Đăng xuất/đổi user: queue/nháp theo contract được dọn; cache API giả và IndexedDB legacy bị xóa; shell public được giữ để màn đăng nhập vẫn mở được offline.

Bộ mã này không tự thêm dependency, không mở tunnel/VPS, không tạo chứng chỉ, không triển khai Web Push. Hướng thử HTTPS theo quyết định chủ dự án do orchestrator ghi riêng.
