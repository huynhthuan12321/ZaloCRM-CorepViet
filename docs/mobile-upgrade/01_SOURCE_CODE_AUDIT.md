# 01 — Khảo sát kiến trúc mã nguồn cho nâng cấp iPhone

Ngày khảo sát: 29/10/2026. Phạm vi: working tree CorepViet, không phải xác nhận image/commit production. Chỉ đọc code và viết tài liệu; không sửa ứng dụng, API, database, cấu hình triển khai hay dependency. Không tìm thấy AGENTS.md tại root/frontend/backend trong lần kiểm tra. Các số dòng dưới đây là snapshot lúc khảo sát, có thể dịch chuyển khi code thay đổi.

## 1. Kết luận kiến trúc

Ứng dụng **đã có hai layout và hai nhánh chat/khách hàng cho mobile**, không cần tạo CRM mới. Nên giữ một ứng dụng Vue, dùng mobile shell và desktop shell riêng, chia sẻ service/auth/realtime/composable và các renderer đã có. Tách controller khỏi view theo từng bước; không copy nguyên logic desktop sang mobile.

`frontend/src/App.vue:27` chọn MobileLayout hoặc DefaultLayout theo `useMobile`. `frontend/src/views/ChatView.vue:4` và `frontend/src/views/ContactsView.vue:4` đã chọn MobileChatView/MobileContactView. Tuy vậy, các view desktop vẫn chạy phần setup khi nhánh mobile được render; cần kiểm tra ownership của request/socket/watch khi refactor và khi thay breakpoint/xoay màn hình.

## 2. Công nghệ đã xác minh

Phiên bản trong cột lock là từ package-lock.json, không khẳng định runtime trên VPS. Semver trong package.json là khoảng cho phép, không phải phiên bản triển khai đã đo.

| Thành phần | Khai báo | Phiên bản lock / bằng chứng |
|---|---|---|
| Frontend | Vue `^3.5.30`, TypeScript `~5.9.3` | 3.5.31 / 5.9.3; `frontend/package-lock.json:10295`, `:9837` |
| UI | Vuetify `^4.0.4` | 4.0.4; `frontend/package-lock.json:10398`; khởi tạo `frontend/src/plugins/vuetify.ts:15` |
| Build | Vite `^8.0.1`, Vue plugin, vite-plugin-vuetify | Vite 8.0.2; `frontend/package-lock.json:10069`, `frontend/vite.config.ts:14` |
| Router | vue-router `^4.6.4` | 4.6.4; `frontend/package-lock.json:10360`; HTML history router |
| State | Pinia `^3.0.4` và Vue composables | 3.0.4; `frontend/package-lock.json:7825`, `frontend/src/main.ts:18` |
| HTTP | Axios `^1.18.1` | 1.18.1; `frontend/package-lock.json:4113`; base `/api/v1`, timeout 30s tại `frontend/src/api/index.ts:7` |
| Realtime | socket.io-client `^4.8.3` | 4.8.3; `frontend/package-lock.json:9157`; websocket + polling tại `frontend/src/api/socket.ts:52` |
| Rich chat editor | Tiptap Vue 3, StarterKit, Mention, Placeholder | @tiptap/vue-3 3.22.3; `frontend/package-lock.json:3255`; imports `frontend/src/components/chat/rich-text-editor.vue:185` |
| Charts / icons | chart.js, vue-chartjs, MDI, lucide-vue-next | Khai báo tại `frontend/package.json`; cần đo bundle thực tế trước tối ưu |
| Backend | Fastify `^5.8.4`, TypeScript `^6.0.2` | 5.8.4 / 6.0.2; `backend/package-lock.json:10951`, `:20758` |
| DB access | Prisma / @prisma/client `^7.5.0`, pg | client 7.5.0; `backend/package-lock.json:5830`; schema `backend/prisma/schema.prisma` |
| Backend realtime | socket.io `^4.8.3` | 4.8.3; `backend/package-lock.json:19751`, server `backend/src/app.ts:247` |
| Jobs/storage | BullMQ/ioredis; S3-compatible/local drivers | `backend/package.json`, `backend/src/shared/queue/`, `backend/src/shared/storage/` |
| PWA | vite-plugin-pwa có trong dependency | 1.2.0 tại `frontend/package-lock.json:10147`; **chưa bật plugin/registration** trong cấu hình đã đọc |

Styling không phải Tailwind: Vuetify utility classes, CSS scoped từng SFC và CSS global/token tự viết. Entry import `tokens.css`, `main.css`, `rbac-page.css`, `hs-crm-theme.css`, `report-kit.css` theo thứ tự tại `frontend/src/main.ts:11`. `frontend/src/style.css` tồn tại nhưng không được main.ts import; không dùng sự tồn tại file này để kết luận rule đang chạy.

## 3. Sơ đồ thư mục và trách nhiệm

```text
frontend/
  index.html                  HTML entry/meta
  vite.config.ts              aliases @ / @ee, dev proxy
  public/                     static/PWA artifacts cần đối chiếu build
  src/
    main.ts / App.vue         bootstrap + chọn layout
    router/index.ts           routes + auth/RBAC/feature guards
    plugins/vuetify.ts        UI theme/defaults
    layouts/                  DefaultLayout, MobileLayout, AuthLayout
    stores/                   auth, privacy, rbac
    api/                      Axios, socket factory, media, public branding
    composables/              chat, contacts, dashboard, appointments, AI, scope
    views/                    Chat/MobileChat, Contacts/MobileContact, Dashboard…
      settings/ rbac/ reports/ marketing/
    components/
      chat/                   list/thread/bubbles/editor/AI/media/contact panels
      contacts/               detail/profile/filter/merge dialogs
      dashboard/              KPI/charts
      appointments/ ui/       shared forms and UI primitives
    assets/                   tokens + themes + report/dashboard CSS + images
    _ee-stubs/                extension fallbacks
backend/
  src/app.ts                  Fastify/plugins/routes/socket/jobs entry
  src/modules/               auth/rbac/chat/contacts/AI/channels/marketing…
  src/shared/                tenant/auth socket/database/storage/queue
  prisma/                    schema + migrations
  tests/                     unit/integration/security fixtures
workers/tiktok-personal/      connector worker (ngoài phạm vi UI)
mcp-server/ skills/ scripts/   công cụ và vận hành, không sửa trong mobile UI
docker/ docker-compose*.yml    build/deploy hiện có, không thay ở audit
docs/                         đề xuất và runbooks
```

Danh mục trên phản ánh nhóm thư mục khảo sát, không tuyên bố đã đọc từng dòng mọi module backend. Audit chi tiết tập trung frontend/mobile/auth/realtime và điểm nối backend liên quan.

## 4. Entry, route và module hiện hữu

| Nhóm | File / vị trí | Ghi chú |
|---|---|---|
| Bootstrap | `frontend/src/main.ts:6`, `App.vue:5` | createApp → Pinia/router/Vuetify; ConfirmHost toàn cục |
| Login/setup | `frontend/src/router/index.ts:14` | AuthLayout; login, setup, đổi mật khẩu bắt buộc |
| Dashboard | `frontend/src/router/index.ts:44`, `views/DashboardView.vue:458` | Dashboard action hub/composable, CSS dashboard riêng |
| Hội thoại | `frontend/src/router/index.ts:50`, `views/ChatView.vue:4` | `/chat/:convId?`; mobile/desktop chung route |
| Khách hàng | `frontend/src/router/index.ts:56`, `views/ContactsView.vue:4` | Danh sách và mobile card; profile route `router/index.ts:195` |
| Lịch hẹn | `frontend/src/router/index.ts:78` | Có trang public action riêng, không ép login |
| Media | `frontend/src/router/index.ts:62` | Tái sử dụng quyền/media API |
| Reports | `frontend/src/router/index.ts:85` | ReportsShell và nhiều children, cả basic report legacy |
| Settings/RBAC | `frontend/src/router/index.ts:116` | Nhân viên, phòng ban, permission groups, AI, tích hợp |
| Marketing | `frontend/src/router/index.ts:218` | Community shell, feature flags và @ee injection |
| Đơn hàng | Chưa thấy route order và entity bán hàng Order trong phạm vi router/schema tìm kiếm | Không đưa tab Đơn hàng vào MVP mobile chỉ vì prompt ví dụ có mục này. ContactDealStage không đồng nghĩa module order |

## 5. Auth, phân quyền và realtime phải tái sử dụng

- `frontend/src/stores/auth.ts:38` xác định authenticated; `:56` canAccess theo grants. Router guard bắt đầu `frontend/src/router/index.ts:285`, kiểm resource tại `:336`. Mobile navigation phải dùng cùng policy; ẩn menu không thay backend enforcement.
- `frontend/src/api/index.ts:14` gắn bearer token từ localStorage; `:66` refresh qua endpoint hiện có; `:114` ensureFreshToken dùng single-flight chung và cross-tab coordination. Không tạo một HTTP client mobile có cơ chế refresh độc lập.
- `backend/src/modules/auth/auth-routes.ts:8` mô tả access token ngắn + refresh rotation; `auth-middleware.ts:20` jwtVerify, `:53` tenant context. Nâng UI không đổi xác thực.
- `frontend/src/api/socket.ts:52` factory đọc token động, recovery auth/reconnect, callback refetch khi mất kết nối. `backend/src/shared/realtime/socket-auth.ts:97` join org room từ token, không tin orgId do UI gửi. Mobile chỉ dùng factory và event contract hiện hữu.
- `frontend/src/composables/use-chat.ts:317` tạo state theo mỗi lần gọi, có shared cache ở `:242`; không mặc định đây là Pinia singleton. Chỉ một owner điều phối socket/fetch cho một chat session. Header, list và thread phải nhận state/controller thay vì tự khởi tạo useChat độc lập.

## 6. Coupling và nợ kỹ thuật có tác động mobile

| Phát hiện tĩnh | Bằng chứng | Tác động / hướng xử lý đề xuất |
|---|---|---|
| Mobile chat dùng lại thread rất lớn | MessageThread khoảng 4.257 dòng; ConversationList khoảng 1.901 dòng tại snapshot | Tái sử dụng renderer/logic nhưng tách presentation có contract trước; tránh fork hai bản thread |
| Parent view và mobile child có controller riêng | `ChatView.vue:241`, `MobileChatView.vue:61`; Contacts tương tự `ContactsView.vue:694`, `MobileContactView.vue:95` | Setup desktop còn tồn tại. Đo request/watch/socket khi mount và resize; tách wrapper/controller owner rõ ràng |
| Mobile thiếu wiring một số chức năng desktop | `MobileChatView.vue:38` AI props null/false; `ChatView.vue:754` desktop-only init và `:800` deep-link | Chưa bảo toàn parity AI/deep-link. Không gọi là chỉ thay CSS; lập bảng capability/events trước khi làm |
| Kích thước viewport tính cứng | `MobileChatView.vue:4` 100vh−120px; `MobileLayout.vue:29` padding-bottom72px | Rủi ro keyboard, browser chrome, double-scroll; cần viewport contract và thử iPhone thật |
| Breakpoint JS/CSS tương tác | `use-mobile.ts:5` <768; `hs-crm-theme.css:283` min-width1100 tại ≥768 | 768px kích hoạt desktop bề rộng tối thiểu1100; tablet/orientation cần quyết định riêng |
| Global style có thể ảnh hưởng cả hai shell | `hs-crm-theme.css:278` #app height100vh; `main.css:9` html/body; nhiều !important | Scope mobile token/wrapper; không thay global rule trước baseline desktop |
| Theme mobile dùng tên khác cấu hình | `MobileLayout.vue:53` dark/light, `plugins/vuetify.ts:20` hsLight/smax-light/legacy-dark | Cần đồng nhất contract theme; chưa kiểm chứng biểu hiện runtime |
| Nav active dùng khớp tuyệt đối | `BottomNav.vue:27` route.path equality | Deep-link có thể không phản ánh tab đúng ngoài default fallback; dùng route metadata/parent matching |
| Offline queue lưu nội dung local | `use-offline-queue.ts:12`, `:45`, `:55` | Không có user/org trong PendingMessage; cần xử lý đổi account/logout, retention, replay và unknown. Đây là đề xuất cần review, không thay logic gửi trong audit |
| PWA chưa được kích hoạt trong build config | `main.ts:22` registration comment, `vite.config.ts:14` chỉ Vue/Vuetify | Dependency không đủ chứng minh PWA hoạt động; xem báo cáo 06 |

Các mục trên là bằng chứng code và rủi ro suy ra, chưa phải kết quả Safari/device screenshot. Đặc biệt không đánh dấu lỗi keyboard hay theme là đã tái hiện trên iPhone khi chưa có runtime evidence.

## 7. Ranh giới tái sử dụng

**Giữ nguyên:** API contracts, backend nghiệp vụ, auth/RBAC, socket factory, permission store, format tin nhắn, renderer media, composable contact/dashboard/appointments, privacy và bộ token thương hiệu có thể chuyển thành semantic alias.

**Refactor có kiểm soát:** chat controller ownership, component presentation, dialogs kích thước desktop, navigation, viewport/scroll và mobile parity wiring. **Thiết kế mobile riêng:** shell, hierarchy, list/card/filter sheets, chat header/action placement; không tạo schema/backend thay thế.

Không có cơ sở đo LOC/coverage để đưa tỷ lệ tái sử dụng phần trăm. Có thể tái sử dụng phần lớn tầng data/auth/domain, còn mức tái sử dụng UI phải chốt sau prototype và regression matrix. Thay toàn bộ Vuetify không phải điều kiện cho mobile tốt.

## 8. Điều kiện trước implementation

1. Chốt baseline working tree/commit và desktop screenshots trước khi tạo worktree; không làm mất thay đổi AI/TikTok chưa commit.
2. Đóng băng route/event/props contract và owner shared files theo tài liệu 07.
3. Có fixture giả, role matrix, viewport matrix, tiêu chí deep-link/keyboard/foreground recovery.
4. Kiểm tra desktop và mobile đều dùng một session/socket/data policy; không sửa backend để che lỗi trình bày.
5. Người quản lý duyệt phạm vi mobile, navigation, offline-send policy và phương án PWA trước triển khai.

