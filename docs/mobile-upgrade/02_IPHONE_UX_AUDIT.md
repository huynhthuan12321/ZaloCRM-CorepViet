# 02 — Audit UX iPhone từ mã nguồn

Ngày: 29/10/2026. Phạm vi: working tree hiện có, không sửa ứng dụng, không deploy, không cài dependency. Đường dẫn dưới đây tính từ repository; số dòng là vị trí quan sát tại thời điểm audit.

## Mức độ xác minh

Các phát hiện code dưới đây là **quan sát code** hoặc **rủi ro UX suy ra từ code**. Orchestrator đã chạy frontend Vite cục bộ trên loopback 5179 và kiểm tra **trang login duy nhất** bằng Chromium desktop tại các viewport được liệt kê bên dưới, không đăng nhập và không chạy backend. Chưa kiểm tra Safari/iPhone/WebKit, bàn phím hoặc màn hình cần auth. WebKit desktop cũng không thay thế Safari/PWA trên thiết bị thật.

### Bằng chứng trình duyệt cục bộ — chỉ login

- Số đo: [evidence/login-viewport-measurements.json](evidence/login-viewport-measurements.json). Ảnh: [320px](evidence/login-320.png), [390px](evidence/login-390.png), [768px](evidence/login-768.png), [1440px](evidence/login-1440.png).
- Ở các viewport phone đo được nút Đăng nhập cao 44 CSS px, input thật font 16px; nút icon hiện mật khẩu cao 22px (rộng 44px), cần tăng vùng nhấn theo thiết kế. Bỏ các phần tử hidden/extension khỏi đánh giá form.
- Tại 768px, số đo bổ sung và screenshot của orchestrator cho thấy `#app` rộng 1100px trong body 768px với overflow bị ẩn, login lệch về phải. Đây là **lỗi layout đã quan sát ở Chromium local**, không chỉ suy luận. Cần truy nguồn rule min-width/global CSS và sửa có regression desktop; không suy diễn biểu hiện Safari giống hệt.
- Widget tím nổi trong ảnh do browser extension chèn, không phải lỗi app.
- Không có bằng chứng submit/login thật, refresh token, quyền, dữ liệu chat, socket hay AI từ lần kiểm tra này.

## Kiểm kê màn hình và đường đi

| Nhóm | Route/component thực tế | Hiện trạng mobile và phạm vi khảo sát |
|---|---|---|
| Đăng nhập, setup, đổi mật khẩu | `frontend/src/router/index.ts:15`, `:21`, `:28`; `LoginView.vue`, `SetupView.vue`, `ForcePasswordChangeView.vue` | AuthLayout riêng; Login có breakpoint 900/480 tại `LoginView.vue:191`, `:198`; chưa thử keyboard/zoom |
| Tổng quan | `/`, `DashboardView.vue`; router `:45` | Dùng view chung, nhiều card/biểu đồ; CSS scroll và grid cần audit hẹp |
| Hội thoại/list/thread | `/chat/:convId?`, router `:51`; `ChatView.vue:4` → `MobileChatView.vue` | Có view mobile riêng, không phải chưa có mobile; tính năng chưa tương đương desktop |
| Khách hàng | `/contacts`, router `:57`; `ContactsView.vue:4` → `MobileContactView.vue` | Card mobile; detail vẫn dùng dialog chung |
| Hồ sơ/lịch sử KH | `/contacts/:id/profile`, `/customers/:id/activity`, router `:188`, `:196` | View hồ sơ được comment là skeleton; không coi hoàn thiện nghiệp vụ chỉ vì có route |
| Lịch hẹn | `/appointments`, router `:79`; `AppointmentsView.vue` | Có breakpoint 900/600 (`:776`, `:803`); cần thử sidebar/date range trên màn hẹp |
| Thông báo | `components/NotificationBell.vue` | Popover trong shell, không có route notifications đầy đủ được xác nhận; route settings notifications là coming-soon |
| Nhân viên/quyền/phòng ban | `/settings/rbac/users`, `/permission-groups`, `/departments`, router `:139` | Bảng/ma trận desktop rộng; không được tự giản lược quyền để vừa màn hình |
| Cài đặt | `/settings/*`, `views/settings/SettingsLayout.vue` | Sidebar 260px cố định; nhiều trang coming-soon khác với chức năng thật |
| AI | `/settings/crm/ai-assistant`, router `:162`; chat dùng composable AI | AI cấu hình khác AI trợ lý trong hội thoại; mobile chat hiện không nối đủ props/handlers |
| Bạn bè/nhóm/media | `/friends`, `/groups`, `/media`, router `:253`, `:212`, `:63` | Có route; chưa kiểm tra trực quan tất cả list/dialog |
| Marketing | `/marketing/*`, router `:221` | Có gate edition/feature; gồm lists, broadcasts, blocks, templates, sequences, targets, care-sessions, manual-followup; không suy diễn EE có đủ |
| Báo cáo | `/reports/*`, `/reports-co-ban`, `/analytics`, router `:85`, `:107`, `:109` | Nhiều tab và bảng; cần bố cục drill-down trên mobile |
| Đơn hàng | Không tìm thấy route Order trong route registry local đã đọc | Không tạo tab Đơn hàng hay chỉ số đơn hàng trong đề xuất khi chưa xác minh module thực tế |

## Phát hiện cụ thể

| ID / ưu tiên | Bằng chứng | Tác động và đề xuất |
|---|---|---|
| UX01 / P0 | `MobileChatView.vue:4` dùng `height: calc(100vh - 120px)`; `MobileLayout.vue:32` thêm padding-bottom 72px; `BottomNav.vue:4` fixed + inset | Nhiều nơi tự trừ chiều cao, không có một chủ sở hữu viewport/keyboard. Nguy cơ composer bị che, dư khoảng trắng hoặc double scroll. Dùng shell mobile có vùng scroll duy nhất, chiều cao dynamic và kiểm chứng VisualViewport khi cần |
| UX02 / P0 | `MobileChatView.vue:40`–`:42` truyền AI suggestion null, loading=false/error=null; không nối toggle-contact-panel; desktop được render ở nhánh khác `ChatView.vue:4` | Mobile không nhận cùng hợp đồng AI/hồ sơ khách như desktop. Cần bảng parity từng event/prop trước refactor; tái sử dụng logic dùng chung, chỉ đổi presenter |
| UX03 / P0 | Route có `:convId?` (`router/index.ts:51`), `MobileChatView.vue:58`–`:118` không đọc route/router và `goBack` chỉ set selectedConvId=null | Mobile không thể hiện đồng bộ URL/deep link/back như desktop trong wrapper. Kiểm thử mở link thông báo `/chat/id`, refresh, browser back và khôi phục list; dùng route làm nguồn chọn hội thoại |
| UX04 / P1 | `MessageThread.vue:2974` watch message count luôn `scrollToBottom`; hàm `:2961` có 3 lần retry sau ảnh | Khi đọc lịch sử, tin mới hoặc load ảnh có thể kéo người dùng xuống đáy. Chỉ autoscroll khi đang gần đáy hoặc chính người dùng gửi; giữ anchor khi nạp cũ, hiện nút “tin mới” |
| UX05 / P1 | `MessageThread.vue:2987` chủ động tránh autofocus ở mobile | Đây là quyết định tốt cần giữ. Không tự focus composer khi mở thread; chỉ focus khi người dùng chọn nhập/reply. Bàn phím thật chưa kiểm chứng |
| UX06 / P1 | `BottomNav.vue:18` bốn tab cố định; `:26` activeTab so route.path bằng tuyệt đối | `/chat/id` fallback Chat là hợp lý tình cờ, nhưng mọi route ngoài bốn mục cũng bị đánh dấu Chat; không có Thêm để tìm cài đặt/media/marketing. Match route group, bổ sung More và lọc theo cùng grants |
| UX07 / P1 | `MobileContactView.vue:105` lấy contacts/loading/filters/fetchContacts, không lấy total/pagination; composable trả total/pagination (`use-contacts.ts:432`) | Không có tải tiếp/phân trang trong template mobile nên có thể chỉ xem được trang đầu. Nối paging/cursor hiện có, hiển thị tổng/đang tải/lỗi; không sửa API |
| UX08 / P1 | `MobileContactView.vue:72` FAB fixed bottom 88px; `:81` detail dialog chung; `ContactDetailDialog.vue:4` max-width 980, persistent/scrollable | FAB chưa cộng inset; detail nhiều mục không có contract mobile full-screen. Đổi presenter mobile, giữ save/delete/permission; thử dismiss/back và dirty form |
| UX09 / P1 | `SettingsLayout.vue:164` grid `260px 1fr`, `:165` height calc(100vh - 56px), không thấy media query trong file | Rủi ro cao nội dung settings bị bóp còn vài chục pixel trên 320/375. Mobile root thành danh sách nhóm, child page full-screen; desktop sidebar giữ nguyên |
| UX10 / P1 | `main.css:13` overflow:hidden; `DashboardView.vue:658` lại có height dựa desktop topnav; `atlas-v2-dashboard.css:54` grid 6→3 cột ở 1280, `:168` grid 3→2 cột | Dashboard có thể phải cuộn nhiều vùng; ba KPI/cột vẫn dày trên 320px. Mobile 2 KPI/cột rồi 1 cột khi text lớn; mỗi page sở hữu scroll dưới shell |
| UX11 / P1 | `UsersRbacView.vue:711`–`:715`, `:798` các cột min-width 200/180/140/130 | Ma trận quyền không phù hợp ép vào chiều ngang. Employee cards + detail; trang ma trận nâng cao giữ scroll khu vực có nhãn, có thể ưu tiên desktop nhưng không ẩn thao tác được cấp |
| UX12 / P2 | `NotificationBell.vue:7` popover max-width 380, `:20` max-height 400 | Max-width không tự chứng minh overflow nhưng cần kiểm collision ở 320, font lớn và keyboard. Mobile dùng sheet/full-screen list và giữ handleClick/deep link |
| UX13 / P2 | `MobileLayout.vue:19`, `:22` icon button small; nhiều chip x-small trong mobile contacts `:58` | Chưa đo hitbox computed; không kết luận icon 20px = hitbox 20px. Cần đo vùng nhấn tối thiểu thiết kế 44 CSS px, focus/label VoiceOver và spacing |
| UX14 / P2 | `use-mobile.ts:6` breakpoint 768, `:15` window.innerWidth; `App.vue:26` đổi component layout theo breakpoint | Resize/xoay qua 768 có thể remount layout/slot, mất scroll/draft nếu state cục bộ. Test 767↔768 và rotate; giữ state nghiệp vụ khỏi layout |

### Những phần đã có nên giữ

- MobileLayout và hai view mobile đã tồn tại; không xây lại từ đầu.
- BottomNav đã có `env(safe-area-inset-bottom)`; cần thống nhất tổng chiều cao thay vì thêm inset lặp.
- MessageThread dùng `min-height:0`/flex và tránh autofocus mobile; giữ các fix desktop hiện hữu.
- Appointments đã có breakpoint mobile; không mặc định mọi bảng đều cần rewrite.
- Contacts desktop `min-width:1280` (`ContactsView.vue:1846`) không đồng nghĩa iPhone đang render bảng đó: nhánh mobile đã tách ở dòng 4. Rà soát phải theo nhánh render thực tế.

## Ma trận kiểm thử bắt buộc trước nghiệm thu

| Viewport CSS | Trạng thái kiểm trong tài liệu này | Mục tiêu |
|---|---|---|
| 320 | Login đã đo trên Chromium; phần còn lại chưa chạy | Smallest width, chips/filter, menu, text 200%, dialog |
| 375 | Login đã đo trên Chromium; phần còn lại chưa chạy | List→chat→back, keyboard, composer |
| 390 | Login đã đo/chụp Chromium; phần còn lại chưa chạy | Media/AI/reply, safe area |
| 393 | Login đã đo trên Chromium; phần còn lại chưa chạy | Thiết bị gần 390, kiểm rounding/viewport |
| 402 | Login đã đo trên Chromium; phần còn lại chưa chạy | Same flow, font lớn |
| 430 | Login đã đo trên Chromium; phần còn lại chưa chạy | List/detail, sheet, rotate |
| 768 | Login đã đo/chụp Chromium, có lỗi width; phần còn lại chưa chạy | Ranh chuyển layout, giữ draft và selected route |
| Desktop 1440 hiện hành | Login đã đo/chụp Chromium; phần còn lại chưa chạy | Baseline screenshot, bảng và header không đổi |

Cho mỗi viewport: login giả lập, dashboard, inbox, thread có ảnh dài/tên dài/100+ tin, contact list/detail, appointments, notifications, settings, roles, AI. Kiểm không có page-level horizontal overflow, không đè CTA, một vùng scroll chính, đúng active nav, đúng quyền, đủ loading/empty/error. Mọi ảnh dùng dữ liệu giả/ẩn danh; không dùng dữ liệu khách thật.

Safari/iPhone thật cần kiểm riêng: bàn phím mở/đóng, thanh URL thu gọn, PWA standalone, safe-area portrait/landscape, file picker/camera, bàn phím tiếng Việt, swipe back, foreground sau khóa màn hình và VoiceOver. Không thể mô phỏng đầy đủ chỉ bằng CSS viewport.

## Tiêu chí hoàn thành audit runtime

Ghi browser/engine/version, OS, viewport, orientation, route, fixture, thao tác và ảnh expected/actual. Mỗi issue liên kết component/commit. Tách `static finding`, `browser verified`, `device verified`, `not tested`; không gộp chúng thành một chữ PASS.
