# Component contract đề xuất — Preview V3

07/11/2026. Chỉ là đặc tả cho đợt code sau khi duyệt. `app.js` dùng Vue browser runtime và component template giống V2; không phải SFC để chép vào production. Không import composable ứng dụng trong preview.

## Ranh giới và ownership

Root/route adapter giữ selected conversation, query/filter, draft theo conversation ID và back target. Presenter nhận props, emit ý định. Một owner `useChat()` quản lý fetch/socket/send; không tạo socket từ từng row/sheet. `MobileLayout` tương lai chịu viewport/safe-area; composer không tự trừ chiều cao shell lần nữa.

| Component tương lai | Props chính | Emits | Trạng thái | Ánh xạ source hiện có |
|---|---|---|---|---|
| MobileViewportShell | availableHeight, safeInsets, showTabbar | — | portrait, landscape, keyboard | `MobileLayout.vue`, `use-mobile.ts`; cần viewport adapter mới dùng VisualViewport và cleanup |
| MobilePageHeader | title, subtitle, backTarget, actions | back, action | root, detail, unavailable | Layout/header hiện hữu; một header cho mỗi màn |
| MobileTabBar | items, activeGroup, grants | navigate | selected, focus, permission hidden | `BottomNav.vue`, router metadata và auth/RBAC hiện hữu |
| MobileOverview | me, urgent, reminders, sectionStates, scope | openConversation(id), openInbox(filters), openAppointment(id), changeScope | loading/empty/error/offline theo section | **Source thật dùng `useDashboardActionHub()` từ `use-dashboard-action-hub.ts`**, không mặc định `use-dashboard` cũ là controller của DashboardView |
| MobileInbox | conversations, query, filters, counts, hasMore, loadingMore, state | update:query, update:filters, select(id), loadMore, retry | initial skeleton, empty results, error, offline, pagination | `use-chat`: conversations, searchQuery, accountFilter, fetchConversations, loadMoreConversations; ConversationList và filter slot/triage hiện hữu |
| ConversationRow | conversation, accountContext, ownerContext, privacy | select(id), openActions(id) | unread/replied, group, redacted, virtual, channel capability | `ConversationList.vue`; lấy `contact.fullName`, `lastMessageAt`, `unreadCount`, `isReplied`, `zaloAccount.displayName` hoặc `channelAccount.displayName` |
| MobileThreadHeader | contact, account, owner, capabilities | back, openProfile(contactId,convId), openActions | live, archived/read-only, forbidden | `selectedConv`, header MessageThread; owner resolver phải kiểm tra cùng chăm/assignment, không suy ra từ người gửi tin cuối |
| MobileThreadFrame | conversation, messages, loading, newMessageCount, connectionState | loadOlder(anchor), reachBottom, openMedia, retry | skeleton, empty, load error, offline | `use-chat` fetchMessages/selectConversation; giữ renderer MessageThread và event parity |
| MobileMessageBubble | message, direction, privacy, media, sendState | reply, edit, reaction, openMedia, jumpToReply, openActions | PENDING/PROCESSING/CONFIRMED/FAILED/UNKNOWN, delivered/seen, redacted/deleted | Message renderer hiện hữu; `channelSendState`, `deliveredAt`, `seenAt`; **không tự gán “đã gửi” khi chỉ có client echo** |
| MobileComposer | modelValue, accountContext, sending, canSend, offline, replyTarget | update:modelValue, send, pickAttachment, askAI, cancelReply | idle, draft, sending, failed, unknown, keyboard, offline/read-only | `use-chat` sendMessage; MessageThread formatting/mention/reply hiện có; preview không gửi thật |
| AttachmentSheet / MediaViewer | allowedTypes, capabilities, media, privacy | pick, close, open, download | loading, failed, unavailable, selected | Picker/media parser hiện hữu; input file chuẩn; không đưa tài nguyên private vào cache công khai |
| AISuggestionSheet | suggestion, sources, loading, error, canApply | ask, cancel, retry, applyDraft(text), close | ready/loading/error, unavailable source | AI props/events của MessageThread và `use-chat`; nguồn trong preview là **bịa**, contract nguồn thật phải xác minh, không gọi API mới để hợp thức hóa mock |
| MobileContactList | contacts, total, pagination, filters, state | search, applyFilters, openProfile, create, loadMore, retry | loading/empty/error/offline, loading-more | `useContacts()` từ `use-contacts`: contacts/loading/filters/total/pagination/fetchContacts; không chỉ hiện trang đầu |
| ContactCard | contact, displayStatus, assignedUser, privacy | openProfile(id) | default, redacted, unassigned | `fullName`, `phone`, `status/displayStatus`, `tags`, `notes`, `assignedUser`, `lastActivity` |
| CustomerProfile | contact, conversations, notes, timeline, grants | message(convId), schedule(contactId), edit, editNote | loading, missing/forbidden, offline, saving/error | `use-contacts`, ContactDetailDialog, ContactProfileView, CustomerActivityLogView; timeline cần lấy đúng nguồn hiện có, không dựng từ vài field aggregate |
| CustomerConversationPicker | contactId, accountConversations, scope | select(convId), cancel | 0/1/many conversations, unavailable account | Quan hệ contact/conversation hiện hữu; một khách nhiều nick phải chọn nick rõ ràng. V3 fixture có mapping 1:1 để kiểm tra đường đi |
| MobileAgenda | appointments, selectedDay, timezone, filters, state | selectDay, create, openDetail, changeStatus | today/other day, empty, load error, updating item | `useAppointments()` fetchAppointments/fetchToday/fetchUpcoming và logic AppointmentsView |
| AppointmentSheet | initialValue, contacts, types, owner, timezone, saving, errors | submit(payload), close | editing, validation, saving, save failure, unsaved | `createAppointment`, `updateAppointment`; fields: contactId, title, appointmentDate, durationMin, type, notes, assignedUserId; `appointmentTime` chỉ display theo helper hiện tại |
| MobileMoreMenu | menuRegistry, grants, featureFlags, currentUser | navigate, requestLogout | loading, permitted, empty/forbidden | router/settings registry + report access; không hardcode role để thay server authorization |
| MobileFeedback | state, title, description, retryable | retry, clearFilters | loading/empty/error/offline/forbidden | OfflineIndicator/toast; offline không hứa replay tự động |
| MobileSheet | open, title, returnFocus, dirty | update:open, confirm, cancel | open/closing, long-scroll, keyboard | Vuetify primitive phù hợp khi code; preview dùng native `<dialog>` để có focus trap/Escape, close button và focus return |

## Luồng và dữ liệu cần giữ khi code

- Canonical route `/chat/:convId?`; direct link tải đúng conv. Back từ thread về inbox giữ query/filter/scroll, fallback inbox khi không có lịch sử nội bộ hợp lệ.
- `contactId` không thay cho `convId`. Đổi nick phải resolve conversation tương ứng; không thay mỗi nhãn header. Hồ sơ nhiều nick mở picker trước khi nhắn.
- AI `applyDraft` không emit `send`. Nếu nháp có nội dung, hỏi thay nháp; đóng sheet không xóa nháp. Preview giữ nháp trong RAM theo conv, không ghi localStorage.
- Một scroll owner cho thread; giữ anchor khi tải cũ, chỉ cuộn đáy khi gần đáy hoặc người dùng gửi/chạm “Tin mới ↓”. Preview minh họa nút và hành vi cuộn; chưa mô phỏng prepend/socket/image-load.
- Composer nằm trong flex column trên vùng keyboard; `visualViewport` listener phải được cleanup trong adapter thật. Bàn phím trong PNG là **mô phỏng**, không phải chứng cứ iOS.
- Privacy/RBAC/channel capability áp trước render field/action. Fixture TikTok không xác nhận kênh còn được bật trong bản triển khai hiện tại.

## Field không được suy diễn

Dashboard `UrgentItem` có `nickName` nhưng không có owner trực tiếp trong interface đã đọc. Cần resolver từ phạm vi/conv detail hoặc backend contract hiện hữu; không hiển thị owner giả làm dữ liệu thật. Counter KPI theo `PrivacySplit` phải giữ chính sách che số. `sources` của AI và timeline hoàn chỉnh cần xác minh adapter; V3 chỉ thiết kế chỗ hiển thị.

Phần ghi chú “Sửa”, thao tác hồ sơ nâng cao và menu Thêm trong prototype chỉ mở thông báo/sheet điểm đặt; chưa dựng form đầy đủ. Xem PARITY-GAPS.md trước khi triển khai.
