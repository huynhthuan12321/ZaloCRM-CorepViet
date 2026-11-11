# 06 — PWA readiness cho iPhone

Ngày khảo sát: 29/10/2026. Phạm vi: mã nguồn working tree, cấu hình tĩnh và tài liệu chính thức; không đăng nhập production, không thay code ứng dụng, không cài dependency. Không có bằng chứng thử Safari/PWA trên iPhone thật trong báo cáo này. Các vị trí dòng áp dụng cho bản đang đọc, có thể dịch chuyển khi các thay đổi chưa commit được chỉnh tiếp.

## Kết luận

Ứng dụng đã có metadata để mở từ Home Screen và có nền tảng mobile/realtime. **Chưa đủ bằng chứng gọi là PWA vận hành hoàn chỉnh:** đăng ký Service Worker hiện bị comment, Vite không bật plugin PWA, chưa tìm thấy web push subscription phía frontend, chưa có chiến lược cache/offline được triển khai trong các nguồn đã khảo sát. Backend push native đã có không chứng minh push trên iPhone PWA hoạt động.

Thiếu Service Worker không đồng nghĩa không thể thêm website lên Home Screen. WebKit mô tả Safari 26 cho phép mọi website được thêm lên Home Screen mở dạng web app mặc định, tùy lựa chọn “Open as Web App” của người dùng. Manifest vẫn có giá trị cho nhận diện và hành vi ứng dụng. Vì vậy cần tách **cài được icon**, **mở standalone**, **offline** và **push** thành bốn ca nghiệm thu riêng. [WebKit — Safari 26](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)

## Ma trận bằng chứng

| Hạng mục | Có gì trong nguồn | Trạng thái/việc cần làm |
|---|---|---|
| HTTPS | `docker/Caddyfile:1` dùng APP_DOMAIN và reverse_proxy | Có cấu hình triển khai hỗ trợ reverse proxy; domain, certificate, redirect HTTP→HTTPS, mixed content và WebSocket thật **chưa kiểm tra**. Không lấy config làm bằng chứng TLS production |
| Manifest | `frontend/public/manifest.json:2–12`, liên kết tại `frontend/index.html:7` | Có name, short_name, start_url `/`, display standalone, theme/background, portrait-primary; chưa có `id` và `scope` khai báo tường minh. Đề xuất bổ sung khi duyệt implementation và kiểm tra URL tài nguyên thực tế |
| Icon | Manifest dùng cùng `/brand/zalocrm-logo.png` cho sizes 192 và 512; `frontend/index.html:8` dùng apple-touch-icon | Đọc PNG header xác nhận tệp thật **1024×1024**. Đây là mismatch metadata, chưa phải bằng chứng icon không hiển thị. Tạo asset xuất đúng 180/192/512 và maskable có vùng an toàn; không thay icon production trong audit |
| Standalone | Manifest display standalone; `frontend/index.html:14–15` có apple-mobile-web-app-capable và status bar black-translucent | Có metadata; chưa kiểm tra cài, cold start, task switcher, status bar và màn hình ngang trên thiết bị |
| SW registration | `frontend/src/main.ts:22–27` comment toàn bộ registerSW; `frontend/vite.config.ts:15–18` chỉ Vue và Vuetify | **Chưa bật trong source hiện tại.** Comment nói chờ tương thích Vite 8 nhưng chưa xác minh nguyên nhân/version compatibility hôm nay; không xem comment là blocker kỹ thuật đã chứng minh |
| Cache/update | Không tìm thấy worker hay cache strategy trong `frontend/src`, `frontend/public`; Vite config không tạo worker | Chưa có bằng chứng precache, fallback offline, update prompt và cleanup cache. Worker cũ trên máy người dùng có còn hay không phải kiểm tra runtime riêng |
| Auth persistence | `frontend/src/stores/auth.ts:35,70–74,142–145` lưu token/refreshToken localStorage và fetchProfile khi init | Có cơ chế lưu phiên trong cùng storage context; không bảo đảm chia sẻ phiên Safari tab và Home Screen, cũng không bảo đảm không bị OS/người dùng xóa storage |
| Refresh | `frontend/src/api/index.ts:66–127` có refresh và phối hợp nhiều request/tab; `frontend/src/api/socket.ts:76–117` xử lý refresh/reconnect | Tái sử dụng; phải thử background dài, hết access token, nhiều tab và mạng trở lại trên thiết bị. Không đổi cơ chế auth trong dự án giao diện khi chưa được duyệt |
| Offline cold start | `frontend/src/stores/auth.ts:127–128` gọi logout trong catch của fetchProfile | **Rủi ro High từ nguồn:** lỗi mạng/5xx khi lấy profile có thể xóa token như phiên không hợp lệ. Cần phân biệt transient network với 401/403 trong một thay đổi auth được review riêng; chưa tái hiện runtime |
| Foreground recovery | `frontend/src/composables/use-chat.ts:950–955,972–973,1298–1303` nghe visible/online, nối lại socket và refetch khi reconnect | Đã có nền phục hồi, chưa chứng minh bắt đủ tin sau khóa màn hình/OS kill. Kiểm tra selected conversation và unread count, không chỉ socket.connected |
| Notification bell | `frontend/src/layouts/MobileLayout.vue:18` | Thông báo trong app, không tương đương background OS push |
| Push backend | `backend/src/modules/push/push-service.ts:4–17,104–120`, `backend/prisma/schema.prisma:1158–1173` | Native Firebase delivery và Device fcmToken với platform ios/android; **chưa phải luồng web PushSubscription** |
| Push frontend | Không tìm thấy PushManager, requestPermission hay đăng ký worker đang hoạt động trong `frontend/src` | Chưa đủ chuỗi subscribe→backend→push→notification click; cần frontend và thay đổi backend cho web push nếu chọn hướng này |
| Deep links | Router HTML5 history tại `frontend/src/router/index.ts:268`; SPA fallback `backend/src/app.ts:429–435`; chat có route theo conversation | Có nền URL; cần test cold launch `/chat/:convId`, chưa login, mất quyền và tài khoản khác. Không ghi nội dung khách/token vào URL |
| Safe area | `frontend/index.html:9` viewport-fit=cover; `BottomNav.vue:4` chừa inset-bottom | Có một phần. `MobileLayout.vue:29` chừa cố định 72px, chưa phản ánh mọi inset/keyboard; top/left/right và landscape cần kiểm tra |
| Keyboard/scroll | `ChatView.vue:843,994` dùng calc(100vh - topnav); `assets/main.css:12–13` khóa overflow cấp trang | Rủi ro composer bị che hoặc vùng chat tính sai khi bàn phím/thanh Safari thay đổi; không tìm thấy VisualViewport handling trong phần đã đọc. Cần giải pháp có fallback thay vì giả định 100dvh tự giải quyết mọi keyboard |
| Offline indicator | `frontend/src/components/OfflineIndicator.vue:4–6` nói “tin nhắn sẽ gửi khi có mạng”; `use-mobile.ts:16–17` dựa navigator.onLine | Chưa thấy durable outbox cho gửi chat để bảo đảm lời hứa này. Cần đổi thông điệp hoặc xây queue có trạng thái theo phạm vi được duyệt; không tự gửi lại nội dung chưa được xác nhận |

## Giới hạn Safari/iOS cần phản ánh trong thiết kế

- Chuỗi Web Push tiêu chuẩn cho Home Screen web app trên iOS/iPadOS 16.4+ có Push API/Notifications API/Service Worker; yêu cầu xin quyền xuất phát từ thao tác của người dùng. Không tự hiện permission lúc trang vừa load. WebKit cũng mô tả badge theo quyền thông báo. Đây là capability nền tảng, không phải xác nhận tính năng hiện có trong CRM. [WebKit — Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- Apple có hướng dẫn Web Push và công nghệ mới như Declarative Web Push. Đợt đầu nên chốt một implementation và phiên bản iOS tối thiểu, không pha luồng FCM native với subscription web hoặc mặc định công nghệ mới chạy trên mọi thiết bị. [Apple — Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Apple — Declarative Web Push](https://developer.apple.com/videos/play/wwdc2025/235/)
- Không coi WebSocket foreground là bảo đảm nhận thông báo khi app ở nền. Thiết kế phục hồi phải refetch từ backend sau resume; các công việc nghiệp vụ/AI/lịch gửi tiếp tục ở server, không phụ thuộc tab PWA còn chạy.
- `viewport-fit=cover` đòi hỏi UI tôn trọng safe-area cả bốn cạnh. Insets bổ sung cho khoảng cách bố cục, không thay thế toàn bộ spacing. [WebKit — Safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- Hướng dẫn cài đặt phải phù hợp OS thật. Không khẳng định chỉ Safari mới có Add to Home Screen; WebKit đã ghi hỗ trợ tùy trình duyệt từ iOS 16.4. Nội bộ có thể chuẩn hóa Safari làm đường hướng dẫn và vẫn dùng feature detection cho capability.

## Thiết kế bổ sung đề xuất, chưa triển khai

### 1. App shell và offline an toàn

Cache asset build có hash; navigation fallback có version và thông báo không có mạng. API chứa khách hàng, ảnh/tệp riêng tư, dữ liệu quyền và các thao tác gửi không cache mặc định. Quyết định lưu draft local phải có TTL, scope user/org và xóa khi logout, không dùng chung dữ liệu giữa tài khoản. Nếu chưa có outbox, giữ draft và yêu cầu gửi lại có xác nhận; tuyệt đối không báo “đã gửi” khi mới ghi local.

Khi có SW update, hiện “Có bản cập nhật” và cho cập nhật sau khi giữ draft an toàn. Không force reload lúc đang gõ, upload hay gửi. Lập runbook gỡ worker/cache cũ và rollback shell version; rollback backend không tự xóa worker đang kiểm soát client.

### 2. Push nếu được phê duyệt

Frontend: nút bật thông báo sau giải thích, feature detection, subscription và xử lý deny/revoke; worker hiển thị notification và mở URL allowlist. Backend: endpoint đăng ký/hủy subscription theo danh tính hiện có, lưu endpoint + keys có bảo vệ và quyền sở hữu, lựa chọn VAPID/provider, dọn subscription hết hạn, phân quyền nhận theo nick và privacy mode. Push body mặc định hạn chế nội dung nhạy cảm. Khi bấm thông báo vẫn phải xác thực và kiểm tra quyền; ID trong payload không cấp quyền truy cập.

Không cần xây lại backend để làm shell, safe-area, icons hoặc layout. **Web push, thay đổi auth/offline send semantics là hạng mục riêng cần review backend/API trước khi thực hiện.**

### 3. Keyboard và resume

Một chủ sở hữu scroll cho từng màn; chat giữ list và composer trong shell mobile riêng, chừa safe-area, ẩn bottom nav khi vào chat nếu proposal được duyệt. Đo layout viewport/visual viewport thay vì chồng fixed offsets tùy tiện. Giữ vị trí đọc, không kéo xuống cuối khi đang xem tin cũ; chỉ tự scroll theo chính sách tin mới và thao tác người dùng. Resume refetch có cursor/dedup theo ID hiện có, xử lý token hết hạn qua lớp chung.

## Ma trận nghiệm thu bắt buộc trước pilot

Tất cả dòng dưới đây **CHƯA KIỂM TRA trên iPhone thật**; không đánh dấu pass dựa trên static audit hoặc desktop WebKit.

| Ca | Điều kiện đạt |
|---|---|
| Cài từ Safari | Domain HTTPS hợp lệ, icon đúng, tên đúng, mở standalone; ghi model/iOS/version |
| Cold start và deep link | Mở `/`, chat cụ thể và URL public đúng quyền; refresh không 404; không lộ dữ liệu khi chưa login |
| Safe area | Không che nút/header/composer khi portrait/landscape; 320–430px và iPad/desktop không tràn |
| Bàn phím | Focus input, chuyển emoji, chọn file, xoay máy không che composer và không double scroll |
| Offline cold/warm | Có trạng thái rõ; lỗi mạng không bị hiểu thành token invalid; không gửi âm thầm hai lần khi mạng trở lại |
| Resume | Khóa máy 1/15/60 phút, đổi app, OS kill; lấy bù tin, unread và trạng thái gửi đúng |
| Session | Hết access token, refresh revoked, hai tab, logout trên máy dùng chung; quyền và dữ liệu cache được xử lý đúng |
| Push tùy chọn | Allow/deny/revoke, app nền, click cold/warm, hết quyền nick và mất subscription; không giả định deliver chắc chắn |
| Update/rollback | Bản mới không làm mất draft; không trộn chunk build cũ/mới; worker cũ có đường phục hồi |
| Desktop regression | Route/layout/API/auth/socket cũ vẫn đạt bộ smoke đã chốt |

## Thứ tự và quyết định cần chốt

1. Chốt iOS tối thiểu, các máy thử và tiêu chí “PWA pilot”: cài/standalone trước; offline read/push có thể tách đợt.
2. Hoàn thiện mobile shell, chat/keyboard/safe-area và icons; không đụng giao thức auth/socket.
3. Xác minh công cụ PWA với Vite hiện tại bằng build thử cô lập, sau phê duyệt mới bật SW và chiến lược cache/update.
4. Tách review sửa offline auth và web push thành PR riêng, có kiểm tra quyền/PII và restore/rollback.
5. Chỉ báo đạt sau ghi bằng chứng URL môi trường test, commit, thiết bị/iOS, steps, screenshot/video đã ẩn dữ liệu và actual/expected.

Không đưa ra tỷ lệ “PWA ready” vì chưa có runtime/device evidence; metadata có sẵn không tương đương nghiệm thu.
