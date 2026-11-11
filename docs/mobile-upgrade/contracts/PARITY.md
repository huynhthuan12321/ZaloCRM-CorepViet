# PARITY — Desktop ↔ Mobile (freeze đợt A)

Ngày 07/11/2026 · base `2608eb6` · đầu vào: `preview-v3/PARITY-GAPS.md` + đối chiếu code. Kèm `CONTRACT-A.md`.

Trạng thái: **Có** = mobile hiện đã làm được trong code · **Thiếu** = chưa có, sẽ làm ở đợt ghi bên cạnh · **Hoãn** = cố ý chưa làm, có lý do · **Desktop-only** = mobile mở được view desktop nhưng chưa tối ưu.
"Hiện tại" là code tại `2608eb6`, đọc tĩnh — chưa chạy runtime/iPhone.

## 1. Hội thoại — inbox

| Thao tác desktop | Bằng chứng desktop | Mobile hiện tại | Mục tiêu / đợt | Ghi chú |
|---|---|---|---|---|
| Danh sách hội thoại, tải tiếp | `ChatView.vue` + `ConversationList.vue` | Có (dùng lại ConversationList, `MobileChatView.vue:7-17`) | Thay bằng MobileInbox + ConversationRow — C | Giữ pagination `loadMoreConversations` |
| Tìm kiếm | `useChat().searchQuery` | Có (`MobileChatView.vue:13,127-130`) | Giữ — C | Debounce 300ms như cũ |
| Lọc theo nick | `accountFilter` | Có (`MobileChatView.vue:65-68`) | Sheet lọc hai pha — C | |
| Chip Chưa trả lời / Chưa đọc | `conversationCounts` `ChatView.vue:428-440` | Thiếu | C | Dựa `isReplied`, `unreadCount` |
| Chip "Của tôi" | — | Thiếu | C nếu API list hỗ trợ lọc `assignedUserId`; nếu không → **Hoãn** | Không lọc client trên trang đầu (sai số) |
| Tab Ưu tiên/Cá nhân/Nhóm, thư mục, triage tags, filter sidebar | `ConversationFilterBar`, `ConversationFilterSidebar`, `inboxFilters` | Thiếu | **Hoãn** sau pilot C (đưa vào sheet lọc) | Tab "Ưu tiên" ảnh hưởng đếm `/counts`; cần chốt hành vi mobile |
| Rail kênh (Tất cả/Zalo/Thử nghiệm) | `ChatView.vue:245-249` | Thiếu | **Hoãn**; mobile chỉ inbox Zalo (`inboxChannel='legacy'` mặc định `use-chat.ts:323`) | Kênh thử nghiệm chỉ dev/test |
| Ghim, menu chuột phải hội thoại, cùng chăm, theo dõi | `conversation-context-menu.vue`, ConversationList | Một phần (ConversationList có, cử chỉ chuột không dùng được trên cảm ứng) | Nút ⋯ trên row → action sheet — **Hoãn** sau C | Phải có nút có nhãn, không chỉ gesture |
| Tin nhắn mới / chọn nick | `NewMessageDialog.vue`, `/chat?compose=` | Một phần (trong ConversationList) | Nút "Tin nhắn mới" → NewMessageDialog — C | Không tự chọn nick đầu |
| Signature nick + người phụ trách trên row | system.md | Thiếu | C | Owner = `contact.assignedUser` (D-4) |
| Badge số chưa trả lời trên nav | — | Thiếu | B | `/conversations/counts.unreplied` |

## 2. Hội thoại — thread

| Thao tác | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt | Ghi chú |
|---|---|---|---|---|
| Deep link `/chat/:convId` | `ChatView.vue:660-697,795-799` | **Thiếu** (mobile không đọc/ghi param, H7) | C | Back fallback `/chat` |
| Link cũ `?conv=`, `?contactId=`, `?draft=` | `ChatView.vue:701-736`, `MessageThread.vue:2752-2766` | Một phần (watcher ChatView chạy cả mobile nhưng trên instance khác) | C (sau LOCK C-1) | |
| Gửi text, rich format, mention, reply, sửa | `MessageThread.vue:2905-2926` | Có gửi/format/mention (MessageThread); **reply/sửa/xóa/thu hồi/forward/reaction không được MobileChatView xử lý emit** (`MobileChatView.vue:41-42` chỉ nối `send`, `refresh-thread`) | C — nối đủ emit như ChatView | Không đổi payload |
| Nháp theo hội thoại | F4: JSON Tiptap/reply/edit theo convId, RAM; xem §15 | Mobile C/D-7: RAM theo convId | C + F4 | D-7; không lưu sau reload |
| Header: nick switcher, nhãn Zalo, cùng chăm, kết bạn/hủy/mời, ⋯ ghi chú/gắn KH cha | `MessageThread.vue:30-350` | Có (MessageThread render), bị header mobile thứ hai chồng lên (`MobileChatView.vue:23-30`) | C — bỏ header trùng, back qua slot | |
| Privacy blur, nick riêng tư, PIN | `MessageThread.vue:470-482`, `stores/privacy` | Có (MessageThread) | Giữ — C | Upload privacy main chỉ chính chủ (server 403) |
| Nick đã xóa (chỉ đọc), hội thoại ảo (nội bộ) | `MessageThread.vue:354-375,1637,1680` | Có | Giữ + khóa sheet đính kèm — C | |
| Trạng thái gửi/đã nhận/đã xem | message-bubble | Có (renderer chung) | Giữ — C | Không tự retry UNKNOWN |
| Cuộn: không kéo đáy khi đang đọc cũ, "Tin mới ↓" | — (desktop luôn kéo đáy `MessageThread.vue:2975`) | Thiếu | C (LOCK C-4, chỉ mobile — D-14) | |
| Tải lịch sử cũ giữ anchor | không có trong code | Không áp dụng | — | Chưa có tính năng ở cả desktop |
| Xem ảnh/album/video/file, lightbox | MessageThread | Có | Kiểm full screen + safe-area — C | |
| Lưu ảnh vào Kho | `MessageThread.vue:2585-2700` | Có (context menu) | Kiểm thao tác chạm dài/⋯ — C | |
| Typing indicator, realtime | `use-chat` socket | Có | Giữ, một socket — C | |
| Trạng thái mất kết nối realtime | `realtimeOffline` `use-chat.ts:420` | Thiếu (mobile không đọc) | Banner — C | |

## 3. AI

| Thao tác | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt | Ghi chú |
|---|---|---|---|---|
| Gợi ý AI (ask) + nguồn | `use-chat.ts:728-743`; ChatView truyền `aiSuggestion*` `ChatView.vue:127-130` | **Thiếu** (ép null, `MobileChatView.vue:38-40`) | C — AISuggestionSheet | |
| Áp vào nháp | Desktop tự áp khi về (`MessageThread.vue:2995`) | Thiếu | C — chỉ "Áp vào nháp", hỏi khi thay | Không bao giờ tự gửi |
| Cảnh báo cần duyệt (`aiNeedsReviewReason`) | `use-chat.ts:401` | Thiếu | C | |
| Bật/tắt AI tự trả lời theo hội thoại | `MessageThread.vue:226-240,1653` | Có (nằm trong header MessageThread) | Giữ — C | Không đổi chính sách |
| Tóm tắt, cảm xúc | `generateAiSummary/Sentiment` `use-chat.ts:745,759`; ChatContactPanel | Thiếu | **Hoãn** sau C | Nằm ở cột hồ sơ desktop |
| Hạn mức AI / cấu hình | `aiUsage`, `fetchAiConfig` | Thiếu | C hiện "còn N lượt"; cấu hình ở Tài khoản → Cài đặt tổ chức (Desktop-only) | |

## 4. Media / tệp

| Thao tác | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt | Ghi chú |
|---|---|---|---|---|
| Gửi ảnh (nhiều) | `MessageThread.vue:745-752,2424-2440` | Có (nút trong toolbar MessageThread) | Sheet "Ảnh" — C | |
| Chụp ảnh | — | Thiếu | C `capture="environment"` | iPhone thật |
| Gửi video | qua input file chung | Một phần | Sheet "Video" ≤500MB — C | |
| Gửi tài liệu | `MessageThread.vue:753-759,2442-2458` | Có | Sheet "Tài liệu" ≤500MB — C | Cap multipart `app.ts:212` |
| Kéo-thả file | `MessageThread.vue` drop | Không áp dụng cảm ứng | — | |
| Kho media (chọn, review, gửi album) | `MediaTabPanel.vue` qua cột 4 `open-media-tab` | **Thiếu** (mobile không có cột 4; emit không được xử lý) | C — MediaLibrarySheet bọc MediaTabPanel | Giữ snapshot convId |
| Trang Kho phương tiện | `/media` | F2: lưới ảnh/video/tài liệu, thư mục, tìm, xem lớn/vuốt, tải thêm, chọn đích gửi | Candidate `mobile/ext`, xem §14 | API gốc; không quản lý/xóa/sửa trên mobile |
| Sticker, emoji, ghi âm, mẫu tin `/` | `StickerPicker`, `EmojiPicker`, `voice-recorder`, `quick-template-popup` | Có trong MessageThread (chưa kiểm cảm ứng) | Kiểm ở C; nếu vỡ layout → gom vào sheet + | |

## 5. Quyền / privacy / phiên

| Mục | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt |
|---|---|---|---|
| Lọc tab nav theo quyền | `auth.canAccess` `stores/auth.ts:56` | Thiếu (chỉ Báo cáo lọc, `BottomNav.vue:29`) | B |
| Menu Tài khoản theo quyền | router meta resource | Thiếu | B |
| Router guard trang | `router/index.ts:338-350` | Có (chung) | Giữ |
| Server enforce | backend | Có | Không đổi |
| Báo cáo theo `canViewReports` | `utils/report-access.ts` | Có (tab thứ 5) | Chuyển vào Tài khoản — B (test B-4) |
| Privacy unlock PIN sau F5 | `App.vue:37-41` | Có | Giữ |
| Logout | `MobileLayout.vue:66-69` | Có (nút trên app bar) | Chuyển vào Tài khoản, có xác nhận — B |
| Dọn nháp/badge/queue khi logout | — | Thiếu | B/C (CONTRACT-A §8, D-6) |
| Offline: tự gửi lại an toàn (D-6 giữ tự gửi) | — | Thiếu rào chắn (queue không gắn user, mất reply/styles/mentions, `MobileChatView.vue:110-112`) | C theo CONTRACT-A §3.5 |
| Câu chữ OfflineIndicator | `OfflineIndicator.vue:6` | Mơ hồ — giữ ý "tự gửi", nói rõ "tin đang chờ" | B |

## 6. Khách hàng

| Thao tác | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt | Ghi chú |
|---|---|---|---|---|
| Danh sách + tìm + lọc trạng thái | `MobileContactView.vue:6-31` | Có (chỉ trang đầu) | D: card, filter sheet, tải tiếp | `useContacts().pagination` |
| Lọc nâng cao (nguồn, người phụ trách, điểm, ngày, đa nick…) | `ContactFilters` `use-contacts.ts:272-290` | Thiếu | D: nguồn + người phụ trách + trạng thái; còn lại **Hoãn** | |
| Xem/sửa hồ sơ | `ContactDetailDialog` | Có (dialog desktop trong mobile) | D: CustomerProfile full screen, sửa bằng form full screen dùng lại validation | |
| Tạo khách | `MobileContactView.vue:69-77` FAB | Có | D: giữ, đặt trên tabbar không đè nút nổi | FAB `bottom:88px` cố định phải bỏ |
| Xóa khách | ContactDetailDialog `@deleted` | Có | D: giữ + xác nhận | |
| Hồ sơ tổng hợp `/contacts/:id/profile` | `ContactProfileView.vue` (skeleton) | Desktop-only | D (LOCK D-3) | Không bịa field chưa có |
| Nhật ký hoạt động | `/customers/:id/activity` | Desktop-only | Mở từ hồ sơ — D | |
| Nhắn tin từ hồ sơ (1 khách nhiều nick) | `openContactChat` | Thiếu | D: CustomerConversationPicker | |
| Gộp trùng, import/export, bulk | ContactsView desktop | Thiếu | **Hoãn** — thao tác hàng loạt cần màn rộng; hiện thông báo "Dùng máy tính" | Cần chủ dự án xác nhận (PARITY-GAPS mục 4) |
| Kết bạn Zalo, khách cha, nhãn Zalo | MessageThread header, LinkParentDialog | Có qua thread | Hồ sơ → **Hoãn** (vào qua thread) | |

## 7. Lịch hẹn

| Thao tác | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt |
|---|---|---|---|
| Xem lịch | `AppointmentsView.vue` (desktop, không có nhánh mobile) | Desktop-only | D: agenda theo ngày |
| Tạo/sửa | `useAppointments().createAppointment/updateAppointment` | Desktop-only | D: AppointmentSheet |
| Hoàn thành/hủy/vắng/xóa | `markComplete/cancelAppointment/markNoShow/deleteAppointment` | Desktop-only | D (xóa có xác nhận) |
| Lọc trạng thái/loại/người phụ trách/nguồn | AppointmentsView | Desktop-only | D: trạng thái + người phụ trách; còn lại **Hoãn** |
| Xem tuần/tháng | AppointmentsView | Desktop-only | **Hoãn** (không ép lịch desktop vào 320px) |
| Xuất CSV | nút chưa gắn hành động (PARITY-GAPS) | — | **Hoãn** đến khi desktop có thật |
| Trang công khai `/appointments/action` | `router/index.ts:36-43` | Có (AuthLayout) | Giữ |

## 8. Tổng quan

| Thao tác | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt |
|---|---|---|---|
| Việc của tôi: khách chờ, lịch hôm nay, KPI | `useDashboardActionHub().fetchMe` `use-dashboard-action-hub.ts:216` | Desktop-only (DashboardView không có nhánh mobile) | D: hàng chờ đầu trang, KPI nhỏ |
| PrivacySplit public/private | `use-dashboard-action-hub.ts:16-29` | — | D: giữ tách |
| Xem như người khác / phòng ban (quản lý) | `viewAsUserId`, `selectedDeptIds`, `hasTeamSection` | Desktop-only | D: scope sheet cho quản lý |
| Tab Team / System | `fetchTeam/fetchSystem` | Desktop-only | **Hoãn** → Tài khoản → Báo cáo |
| Lead pool, phiên theo dõi, quota nick | DashboardView | Desktop-only | **Hoãn** sau D |

## 9. Tài khoản

| Mục | Bằng chứng | Mobile hiện tại | Mục tiêu / đợt |
|---|---|---|---|
| Hồ sơ đầu màn (tên, avatar, tổ chức, nhóm quyền) | `auth.user` | Thiếu | B |
| Giao diện Sáng/Tối/Theo máy | `MobileLayout.vue:21-23` toggle theme không tồn tại | **Lỗi** | B |
| Thông tin cá nhân (đổi tên/avatar) | `/settings/personal/profile` | F1: form mobile, ảnh/tên qua API gốc | Candidate `mobile/ext`; xem §13 |
| Đổi mật khẩu | `ChangePasswordModal.vue` | Desktop-only | B: sheet dùng lại modal |
| Thông báo | NotificationBell trên app bar | Có (app bar) | B: vào Tài khoản + giữ chuông ở header root (D-8) |
| Nick Zalo | `/settings/channels/zalo` | Desktop-only | B: liên kết theo `zalo_account` |
| Kho media | `/media` | Desktop-only | B: liên kết theo `media` |
| Báo cáo | `/reports/**` (đã có mobile 5A/5B) | Có | B: chuyển từ tab sang menu |
| Cài đặt tổ chức | `/settings/org/profile` | F1: một cột, Sáng/Tối, owner sửa như cũ | Candidate `mobile/ext`; xem §13 |
| Marketing, nhóm, bạn bè, quét nhóm | `/marketing/**`, `/groups`, `/friends` | F3: nhóm Khác theo quyền/cờ; trang đọc dữ liệu trong shell mobile | Candidate Community `mobile/ext`, xem §14; thao tác nặng dùng máy tính |
| Đăng xuất | `MobileLayout.vue:24-26` | Có | B: cuối màn Tài khoản, có xác nhận |

## 10. PWA (đợt E)

| Mục | Bằng chứng | Hiện tại | Mục tiêu |
|---|---|---|---|
| Manifest | `public/manifest.json` | Có, icon khai báo sai kích thước, màu `#0A192F` | E |
| Service worker | `main.ts:22-27` comment | Tắt | E nếu duyệt |
| Cache an toàn (không cache API/media private) | — | Không có | E |
| Update khi có nháp | — | Không có | E |
| Web Push | backend chỉ FCM native | Không có | **Hoãn** (tách dự án) |


## 11. Cập nhật đợt D — chủ dự án duyệt 09/11/2026

| Hạng mục | Trạng thái đợt D | Đợt xử lý / giới hạn |
|---|---|---|
| Tổng quan → Chưa trả lời | Có: `/chat?filter=unreplied`; MobileChatView nạp vào RAM trước request đầu, truyền `unreplied=true` tới API hiện có; mở thread và back giữ lọc, bỏ lọc xóa query | D, bổ sung đã duyệt 09/11. Không đổi use-chat/API/backend/desktop |
| Giao diện Tối của trang cài đặt cấp 2 | F1: các trang thường dùng và quản trị trong §13 | Trang ngoài F1 giữ đảo Sáng; preview đăng nhập tổ chức chủ ý Sáng có nhãn |
| Hồ sơ khách phân biệt lỗi 403 và 404 | **Hoãn — F, không làm trong D** | `fetchContact()` hiện trả null cho cả hai; UI mobile chưa phân biệt riêng không có quyền/không tồn tại. Không đổi API/composable dùng chung để vượt phạm vi D |
| Lịch hẹn thông báo trùng giờ cụ thể | **Hoãn — F, không làm trong D** | Sheet giữ dữ liệu nhập và thông báo lưu thất bại chung. Thông báo conflict cụ thể cần giữ status/thông tin lỗi từ nguồn hiện có, làm riêng ở F |


## 12. F5 — lọc hội thoại theo nhân viên (10/11/2026)

Candidate `mobile/f5-sale-filter` từ `mobile/base @ 269d8a3`, chưa merge, chờ chủ dự án duyệt. Desktop popover Sale và mobile sheet có tìm kiếm nhân viên đang hoạt động trong phạm vi RBAC. Sale thường giữ Khách của tôi. API/backend giữ nguyên; bộ lọc assignedUserId, badge Đang xem và URL giữ khi back/reload.

QA: vue-tsc 0 lỗi; Vitest 64 file/708 test; build PASS; Chromium + WebKit F5 10/10. Desktop 1440 đóng Sale exact 0, mở Sale ngoài vùng popover và bóng exact 0 trên cả hai engine. API scope PASS, fixture TEST đã dọn hết. Giới hạn Chưa giao của backend giữ nguyên. Bằng chứng: `../qa/F5-sale-filter/README.md`.


## 13. F1 — cài đặt cấp 2 (đã duyệt làm mốc 10/11/2026)

`mobile/ext`, worktree `F:/ZaloCRM-wt/ext`, base/merge-base `bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`. Đã commit `50db984` theo duyệt của chủ dự án, chưa merge/push/deploy. Đây là mốc so sánh cho F2/F3.

| Trang/thao tác | Candidate F1 | Giới hạn |
|---|---|---|
| Tài khoản của tôi | Form sửa tên có dirty guard, tải/xóa avatar; đổi mật khẩu dùng modal hiện có | Email/SĐT/vai trò chỉ xem như desktop |
| Thông báo của tôi | Đọc cấu hình nhận hiện có tại URL cũ, lỗi/403/offline riêng; lối sang feed | Giữ khóa thiết lập thủ công từ base (ZaloAccountsView VALID_TABS); sửa nơi nhận nhờ quản trị dùng máy tính/Thông báo hệ thống |
| Hồ sơ tổ chức | Controller/API gốc; một cột/Sáng/Tối, dirty guard, khóa rời khi đang lưu | Chỉ owner sửa; preview đăng nhập chủ ý Sáng có nhãn |
| Nhân viên | Thẻ + sheet chi tiết; controller/wizard tạo, bàn giao, gán phòng/nhóm, vô hiệu gốc; tìm/lọc/rỗng/thử lại | RBAC/payload gốc; API quyết định phạm vi |
| Trạng thái KH | Tạo/sửa/xóa/đổi thứ tự, xác nhận, lỗi giữ form | API gốc, không migration |
| Nhãn KH | Scope/nguồn/nick, tạo/sửa/lưu trữ, màu/emoji; Zalo Real không lưu trữ | Gộp/đếm lại nhãn: dùng máy tính |
| Phân quyền, phòng ban, Audit, Lead scoring, tích hợp | Đọc được, chọn nhóm/lọc/phân trang; Sáng/Tối | Sửa quản trị nặng: dùng máy tính. Không render config/secret tích hợp |

Các trang F1 có Sáng/Tối; trang ngoài danh sách giữ policy hiện có. Backend/auth/router và payload gửi tin giữ nguyên. F2/F3 đang phát triển ở lượt gộp sau mốc F1; F4/F6 chưa bắt đầu.
Bằng chứng cuối tại `../qa/F1-settings/QA-F1.md`; LOCK và review cùng thư mục. QA kỹ thuật PASS: vue-tsc0, Vitest758, buildPASS, E2E212/212, desktop1440 exact0. Chưa iPhone thật/VoiceOver. Chủ dự án xác nhận Claude đã soát và duyệt F1 làm mốc, commit `50db984`; vẫn chưa duyệt merge mobile/base.


## 14. F2 + F3 — lượt gộp sau mốc F1 (10/11/2026, đang kiểm)

`mobile/ext`, mốc so sánh `50db984ade40460be2ff21d043f62f5d4a15520d`; mobile/base giữ `bcd220d`.
Dev → reviewer độc lập MỚI → QA; chỉ kết quả cuối trong `../qa/QA-F2-F3.md` quyết định gate.
F2/F3 chưa commit/merge/push/deploy. Không chuyển sang F4 ở lượt này.

| Mục F2/F3 | Candidate đã review | Giới hạn / hành vi giữ nguyên |
|---|---|---|
| Kho `/media` | Lưới Ảnh/Video/Tài liệu theo folder/API gốc, tìm kiếm, IntersectionObserver + nút tải thêm; Sáng/Tối | Chỉ xem + chọn/gửi, quản lý kho dùng máy tính |
| Xem lớn | VDialog fullscreen, vuốt ngang/xuống + nút tương đương, trả focus; không bắt cử chỉ trên video controls | Chưa Safari/iPhone thật hoặc VoiceOver |
| Chọn gửi 1/nhiều | Gọi đúng `sendMediaToConversation`/`sendAlbumToConversation` của luồng MediaTabPanel; snapshot convId, khách+nick + confirm; chặn gửi sau unmount, đổi đích/khóa/offline | Không outbox/replay; HTTP và payload/API giữ nguyên |
| Kết quả gửi từng phần | Loại các mục xác nhận đã gửi; album chỉ báo count thiếu → bỏ tập chưa xác định khỏi lựa chọn + trạng thái bền yêu cầu kiểm tra hội thoại | API không cho biết id ảnh album đã đi; không đoán/retry tự động |
| Kho trong thread | Đích cố định theo hội thoại mở, tên khách+nick+phụ trách, đổi khách đóng sheet; giữ pane Khối EE | EE/Khối thật chưa kiểm vì `_ee` vắng trong worktree Community |
| Nhóm Khác | Marketing, Nhóm, Bạn bè dùng `canAccess`/edition/cờ desktop hiện có; Back về Account | Nhóm route chỉ requiresAuth; không tự tạo quyền mới; server giữ scope nick |
| Trang F3 Community | Đọc bạn bè/nick/quan hệ, nhóm/thành viên, tệp KH/entries, lần quét/thành viên, mục tiêu/broadcast/luồng/khối/mẫu/phiên; tìm/phân trang theo API đang hỗ trợ | Không quét/gửi hàng loạt/sửa nặng, không socket mới/API mới; scan-members API không có search nên không hiện ô tìm giả |
| F3 Enterprise | Chưa chứng nhận; route EE ngoài repo chưa qua wrapper mobile | Không ghi PASS EE; cần tích hợp/kiểm ở repo EE |
| Trạng thái care-sessions lỗi | Dùng composable gốc | Composable làm mất HTTP status nên 403 hiện lỗi chung; không sửa API/auth trong đợt UI |

Source review độc lập mới: PASS Community; QA browser đang chạy. Không coi suy luận DOM không đổi là kết quả pixel; xem QA-F2-F3 để lấy số đo cuối.

QA cập nhật sau sửa contrast/focus/gutter WebKit: vue-tsc0, Vitest852/852, buildPASS; chức năng111 PASS/1 skip chỉ CDP-WebKit; ma trận672/672 PASS đủ6 kích thước, Sáng/Tối và hai engine. **Gate desktop/tablet exact0 CHƯA ĐẠT**: suite chính54 PASS/8 FAIL; Chromium1440 có5 ca lệch3–56px, Chromium768 có2 ca lệch10/13px, WebKit1440 chat-media lệch3984px do trạng thái focus. Tablet1024 cả2 engine9/9 exact0. Không nới ngưỡng, không ghi PASS toàn bộ F2/F3. QA độc lập bàn giao do quota, main chạy lượt cuối; reviewer bổ sung delta QA chưa chạy được. Chi tiết/giới hạn tại `../qa/QA-F2-F3.md`.

C?p nh?t ch?t 10/11/2026: reviewer ??c l?p M?I h?u QA PASS Community source,180 test PASS;114 c?p ?nh ??i ch?ng/th?t gi? ng??ng0 ?? ph?n lo?i7 ca Chromium l? nhi?u, WebKit chat-media0 sau blur/ch? focus. S? FAIL exact0 l?ch s? v?n gi?, kh?ng n?i ng??ng/kh?ng s?a CSS trong l??t ch?ng minh. B?ng8 ca v? gi?i h?n t?i `../qa/QA-F2-F3.md`; review m?i `../qa/F2-F3/REVIEW-POST-QA.md`. ?? hai ?i?u ki?n commit F2/F3 do ch? d? ?n giao; ch?a merge/push/deploy, ch?a F4.


## 15. F4 + F6 — candidate sau68edf81 (10/11/2026)

`mobile/ext`, worktree `F:/ZaloCRM-wt/ext`; base/merge-base vẫn `bcd220d`. Dev → reviewer độc lập mới → QA. Chưa merge mobile/base, không push/deploy.

| Mục | Candidate | Giới hạn |
|---|---|---|
| F4 desktop H11 | Nháp JSON Tiptap/reply/edit theo conversationId trong RAM; A→B không mang chữ, quay A còn nháp; gửi B chỉ xóa B; reload mất | Không đổi handleSend/payload/AI/đính kèm/shortcut; mobile D-7 giữ cơ chế cũ |
| Session/update khi còn nháp | Reset user/org/logout dọn store + editor; guard PWA tính cả nháp desktop của hội thoại đang ẩn | Không sửa SW/cache/auth |
| F6 hồ sơ403/404 | Desktop/mobile hiển thị đúng câu theo status; lỗi500/network không gán thành đã xóa; chống kết quả cũ ghi đè khách mới | Backend giấu tồn tại bằng404 tại contact-routes.ts:484/:2649, frontend không suy đoán403 |
| F6 trùng lịch | Hiển thị message server; chỉ mã appointment_conflict mới cho câu trùng giờ khi thiếu message; giữ form | POST409 đủ thông tin; PUT appointment-routes.ts:316→337 chưa có guard trùng, cần hotfix backend riêng |

Source review độc lập PASS không Critical/High/Medium; review harness PASS-WITH-NOTES (LOW), không thay chứng nhận runtime. Vue-tsc0, Vitest77 file/877 PASS, buildPASS; Chromium+WebKit26/26 hành vi, gồm desktop F4, mobile draft smoke và mobile/desktop F6 Sáng/Tối. Số đo ảnh/đối chứng cuối xem `../qa/QA-F4-F6.md`; không nới ngưỡng0, không sửa CSS để chụp. Chưa Safari/iPhone thật, Home Screen PWA, VoiceOver, DB thật hoặc EE.

QA chốt F4/F6: reviewer source PASS, QA độc lập PASS với ngoại lệ nhiễu baseline có bằng chứng. Chat-empty không đạt exact0 mọi lượt; không nới threshold, không mask/sửa CSS. Hồ sơ/lịch hẹn0 toàn ảnh; vùng ngoài composer khi đổi nháp WebKit0, Chromium chỉ raster trùng control. Xem bảng3 C/3 R và báo cáo audit trong QA-F4-F6; không tuyên bố suite pixel toàn xanh. Candidate được commit theo lệnh, chưa duyệt merge.


## 16. F5 — quyết định phát hành 11/11/2026

Chủ dự án chọn (a): sale thường desktop/mobile chỉ xem Khách của tôi, không có
Tất cả sale/Chưa giao sale/chọn nhân viên. Frontend ép ID chính mình trước request
đầu, khi khôi phục lưu cũ/preset/reset/URL và khi quyền đổi; dọn giá trị localStorage
cũ. Admin/quản lý giữ phạm vi chọn đã lưu và danh bạ RBAC. Sidebar expanded mở
picker tìm nhân viên trong popover, giữ chiều cao Sale để không dịch các mục khác.
Kết quả QA phát hành hiện hành, bảng exact0 và giới hạn: `../RELEASE-MOBILE.md` §14–15.
Không đổi backend/API/payload; thanh kênh, nút báo cáo AI, timeout30giây vẫn tách riêng.
