# F2+F3 — Báo cáo sửa trước independent review

Phạm vi: chỉ file mobile mới/được giao. Không commit/push/deploy. Không sửa router, use-mobile-nav, MobileChatView (đề xuất ở `dev-fix-locks.md`).

## Kết quả kiểm tra thực tế
| Lệnh | Kết quả |
|---|---|
| `npx vue-tsc -b` | **1 lỗi, không phải của tôi**: `MobileChatView.vue(115)` TS1117 trùng `:customer-name` (file khóa của main, xem L-A). Mọi file tôi sửa sạch. |
| `npx vitest run` (toàn bộ) | 73 file: 72 pass, **1 fail**: `src/__tests__/mobile/mobile-chat-view.dom.spec.ts` ("Duplicate attribute", cùng nguyên nhân L-A). 790/790 test chạy được đều pass. |
| `npx vitest run src/components/mobile` (+ `src/composables/mobile-media`) | tất cả pass (media, tools, chat, account, shell). |
| eslint | Repo không có `eslint.config.*` nên không chạy được. Không bỏ qua hay làm yếu test nào. |

KHÔNG chạy: Playwright/viewport 320–430/768, Safari iPhone thật, Home Screen PWA, ảnh chụp. **Chưa được gọi là "đạt trên iPhone".**

## 1. F3: trang đích có dữ liệu thật (chỉ đọc)
`MobileToolPage` không còn là trang giới thiệu. Nó dựng presenter theo công cụ:
- **Bạn bè** (`MobileFriendsReader`): chọn nick hoặc "Tất cả nick" → `GET /zalo-accounts/:id/friends-db` / `GET /friends-db/all-nicks`; lọc loại quan hệ (kèm số đếm), tìm kiếm (debounce, phía server), "Tải thêm" phân trang 25/trang.
- **Nhóm** (`MobileGroupsReader`): chọn nick → `GET …/groups`, tìm ở client; chạm nhóm → sheet thành viên `GET …/groups/:g/members` (Trưởng/Phó nhóm).
- **Marketing** (`MobileMarketingReader`, chọn theo `route.path`; thanh chức năng chỉ gồm chức năng đang bật, link đúng path):
  - `/marketing/group-scan`: nick → các lần quét xong `GET /target-jobs/group-scans/:nick` → thành viên đã thu `GET …/group-scans/:scan/members` (phân trang).
  - `/marketing/lists` và `/marketing/lists/:id`: `GET /customer-lists` (phân trang + tìm server), chi tiết `GET /customer-lists/:id` + `…/entries` (phân trang + tìm server), có link quay lại danh sách.
  - `targets`, `broadcasts`, `sequences`, `content-blocks`, `message-templates`, `care-sessions`, `manual-followup`: danh sách chỉ đọc từ các GET desktop đang dùng (care-sessions dùng đúng `useCareSessions`).
- Trạng thái đủ: đang tải / rỗng (có chữ hướng dẫn) / lỗi + Thử lại / offline (tự tải lại khi có mạng) / không quyền / đang tải thêm / lỗi tải thêm. Không có POST/PATCH/PUT/DELETE (test khẳng định không có lệnh ghi), không mở socket, không tạo API mới.
- Vì sao không gọi thẳng `fetchFriendsDb` / `fetchGroups` / `fetchLists`: chúng nuốt lỗi nên không phân biệt rỗng / lỗi / offline / không quyền. Tôi dùng đúng endpoint + params và cách bóc dữ liệu giống desktop (và dùng lại `displayCustomerName`, `useCareSessions`, `relTime`). Danh sách nick: `GET /zalo-accounts` trực tiếp, vì `useZaloAccounts` mở socket QR khi mount.
- Back: header shell (`handleBack` của main) luôn về Tài khoản, cả khi vào trực tiếp lẫn từ route lồng nhau; chi tiết tệp có thêm link "Tất cả tệp khách hàng".
- Dùng token `--m-*` (Sáng/Tối), touch ≥44px (`--m-touch`), chữ input 16px.

**Chưa có / khác desktop:** không có chi tiết từng bạn bè/nhóm ngoài danh sách; không hiện SĐT trong danh sách bạn bè; Mục tiêu / Chiến dịch / Luồng chỉ hiện dòng tóm tắt (không xem từng bước hay lần chạy); các danh sách server không phân trang (nhóm, mục tiêu, broadcast, luồng, khối, mẫu) tải hết rồi lọc ở client. Bản mở rộng (`isExtension`) chưa có presenter vì route do EE đăng ký (L-B).

## 2. Marketing hiện đúng quyền + tính năng
`tools-model.ts`: Community → entry = `group-scan` nếu `isMarketingPathEnabled`, nếu tắt thì `getMarketingFallbackPath()` (cùng ưu tiên với router guard); **tất cả cờ tắt thì ẩn**. Mở rộng → chức năng đầu tiên có `canAccess` (customer_list / friend, như DefaultLayout) **và** còn bật. **Nhóm** giữ `requiresAuth` như route hiện có (route không có `meta.resource`, desktop không có tab riêng), không phát minh resource; dữ liệu do server lọc theo quyền nick. Bạn bè: `canAccess('friend')`. Có test: cờ tắt từng phần, tắt hết, thiếu quyền.

## 3. Thư viện media
- `reload()` reset `loadingMore` (race test: loadMore treo, đổi loại, không kẹt, kết quả cũ bị bỏ).
- Thư mục có `folderSeq`; về muộn sau unmount hoặc sau lần tải mới không ghi đè (test).
- Chọn khách nhận: phân trang 40/trang + "Tải thêm (x/y)", bỏ trùng, reset khi đổi từ khóa, lỗi tải thêm giữ danh sách và cho thử lại (test).

## 4. Gửi từ kho
- `send()` trả `sentIds` (typed). Lỗi giữa chừng thì mục đã gửi bị bỏ khỏi vùng chọn NGAY, thử lại không gửi trùng (test: thử lại chỉ gửi mục 2, 3).
- Lỗi không có phản hồi (quá giờ/mất mạng): `ambiguous` + chữ "chưa rõ đã tới khách chưa, kiểm tra hội thoại trước khi gửi lại"; không khuyến khích gửi lại ngay.
- Sau xác nhận kiểm tra lại props: đổi `convId` / `nickName`, `externalLock` hoặc `lockReason` xuất hiện thì HỦY kèm thông báo, không gửi ngầm; đổi object cùng convId vẫn gửi đúng snapshot đã xác nhận. Offline chặn cả sau xác nhận lẫn trong `send()`; `lockReason` của đích cũng chặn trong `send()`.

## 5. UX
- Tab loại tệp và chip thư mục: `min-height: var(--m-touch)` (44px); chip lọc mới cũng 44px.
- `MediaViewer` dựng bằng `v-dialog` fullscreen (`content-class="crm-mobile"`): bẫy focus, khóa cuộn/inert do Vuetify quản. Đã bỏ toàn bộ code tự khóa `body.style.overflow` (hết lỗi teardown mở khóa nhầm sheet bên dưới; có test). Esc / nút Đóng / vuốt xuống đóng viewer; phím mũi tên và nút Trước/Sau giữ nguyên. Màu viewer là biến cục bộ `--viewer-*` (đen cố định cả Sáng/Tối, không phải token `--m-*` mới); các màu cứng khác đã bỏ. Cần kiểm trên Safari: focus trap/inert của VDialog mới test bằng stub trong jsdom.
- Mọi SFC tôi tạo/sửa (media/*, MediaLibrarySheet, MobileMediaView, tools/*) để `<script>` trước `<template>`.

## 6. Tab Khối trong thread
`MediaLibrarySheet` có 2 tab "Ảnh, video, tệp" / "Khối" (bản mở rộng). Tab Khối nhúng NGUYÊN `AutomationBlocksPanel` với `conversationId/contact/ownerNickId/nickName` như `MediaTabPanel`. Thread đang khóa gửi thì pane Khối chỉ hiện lý do, không mount panel. Thư viện dùng `v-show` để đổi tab không mất chọn/lọc. Community: không hiện tab (stub render rỗng, desktop cũng rỗng). Test: `media-sheet-blocks.dom.spec.ts`.

## File đã tạo/sửa (đều trong phạm vi được giao)
Mới: `composables/mobile-tools/{use-mobile-read-list,use-mobile-nicks,mobile-tool-readers}.ts`, `components/mobile/tools/{ToolReadList,ToolNickPicker,ToolMembersSheet,MobileFriendsReader,MobileGroupsReader,MobileMarketingReader,MarketingGroupScan,MarketingLists,MarketingFeatureList}.vue`, `composables/mobile-media/mobile-media-composables.spec.ts`, `components/mobile/chat/media-sheet-blocks.dom.spec.ts`.
Sửa: `tools-model.ts`, `MobileToolPage.vue`, `tools.dom.spec.ts`, `use-mobile-media-{library,send,targets}.ts`, `media/{MobileMediaLibrary,MediaViewer,MediaTargetSheet,MediaGrid}.vue`, `chat/MediaLibrarySheet.vue`, `views/mobile/tools/MobileMediaView.vue`, `media-library.dom.spec.ts`.

## Trạng thái hoàn thành
- F3: presenter chỉ đọc đã có dữ liệu thật + test đơn vị/DOM (jsdom, API mock). **Chưa** kiểm viewport/thiết bị thật, chưa chạy Playwright; bản mở rộng chưa phủ (L-B). Sẵn sàng cho independent review, **chưa** đánh dấu "done".
- F2: các lỗi main nêu (mục 3–6) đã sửa và có test; còn thiếu kiểm Safari/WebKit cho viewer và focus trap.
