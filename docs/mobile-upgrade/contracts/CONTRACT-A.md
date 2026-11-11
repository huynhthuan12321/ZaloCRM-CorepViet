# CONTRACT-A — Hợp đồng nâng cấp iPhone (freeze đợt A)

Ngày freeze: 07/11/2026 · Người viết: mobile-architect · Branch `mobile/base` · base commit `2608eb6`.
Trạng thái: **FROZEN chờ chủ dự án duyệt mục §12**. Đây là hợp đồng cho đợt B–E, không phải code đã chạy. Mọi số dòng là snapshot tại `2608eb6`; dịch dòng thì đối chiếu theo tên hàm.

Nguồn chuẩn (thứ tự ưu tiên khi mâu thuẫn): skill `corepviet-mobile-contract` → quyết định chủ dự án 07/11/2026 (5 điểm trong §0) → tài liệu này → `preview-v3/` (đã duyệt 07/11/2026) → tài liệu 03/04/05/07/08.

Đã đọc: `.interface-design/system.md`, `docs/mobile-upgrade/01`–`08`, `13`, `preview-v3/{README,COMPONENTS,PARITY-GAPS,REVIEW}.md`, `tokens.css`, `app.js`, `index.html` (tìm chuỗi). Không có `contracts/` trước lượt này.

---

## 0. Quyết định đã chốt (không bàn lại)

1. Bottom nav 5 mục: **Tổng quan · Khách hàng · Hội thoại (nút tròn nổi giữa, badge số khách chờ) · Lịch hẹn · Tài khoản**.
2. Tài khoản: hồ sơ, chọn giao diện Sáng/Tối/Theo máy, Thông tin cá nhân, Đổi mật khẩu, Thông báo, nhóm Công việc (Nick, Kho media, Báo cáo, Cài đặt tổ chức — lọc theo quyền), Đăng xuất.
3. Hai giao diện Sáng + Tối, token `--m-*` theo `preview-v3/tokens.css`; Vuetify có theme dark thật; `<meta name="color-scheme">` đổi động.
4. Composer: nút **+** mở sheet Ảnh · Chụp ảnh · Video · Tài liệu · Kho media; dùng nguyên `POST /conversations/:id/attachments`, không đổi backend.
5. AI gợi ý chỉ **"Áp vào nháp"**, không tự gửi.
6. **Duyệt bổ sung 07/11/2026 (sau đợt A)** — kết quả D-1…D-14 ở §12. Tóm tắt: bỏ hẳn TikTok (nhãn "Nick Zalo"); **giữ tự gửi lại khi có mạng trên mobile** kèm rào chắn §3.5; Sáng mặc định, Tối chỉ mobile; cuộn mới (C-4) chỉ bật ở mobile; nháp chỉ RAM; 1 video/lần; iOS 16.4+.

---

## 1. Hiện trạng code đã đối chiếu (bằng chứng cho contract)

| # | Phát hiện | Bằng chứng | Hệ quả cho contract |
|---|---|---|---|
| H1 | Toggle theme mobile trỏ tới theme `dark`/`light` không tồn tại | `layouts/MobileLayout.vue:54-63`; Vuetify chỉ có `hsLight`, `smax-light`, `legacy-dark` tại `plugins/vuetify.ts:22,51,70` | Thêm `hsDark` (LOCK B-2), bỏ toggle cũ |
| H2 | Key `localStorage.theme` bị desktop ghi `'hsLight'` → mobile đọc `!== 'light'` thành **dark** cho đa số user | `layouts/DefaultLayout.vue:266-267`, `MobileLayout.vue:54` | Theme mobile dùng **key mới** `crm.mobile.themePreference`; không đọc key `theme` |
| H3 | `index.html` khai báo cứng `color-scheme: light only`, `theme-color #0A192F` | `frontend/index.html:12-13` | Giữ làm mặc định trước JS; shell đổi động (§6) |
| H4 | Chiều cao cứng | `MobileChatView.vue:4` `calc(100vh - 120px)`; `MobileLayout.vue:31` padding 72px; `hs-crm-theme.css:278` `#app{height:100vh}` | Viewport API §5; con không trừ pixel |
| H5 | Nav so khớp `route.path` tuyệt đối, fallback `/chat`; không lọc quyền chat/contact | `components/BottomNav.vue:31-34`, `:23-29` | `resolveMobileTab()` theo route name §4.3 |
| H6 | Mobile chat ép AI null/false | `views/MobileChatView.vue:38-40` | AI sheet §3.2 + LOCK C-3 |
| H7 | **Mobile không đồng bộ URL**: chọn conv không push `/chat/:convId`, back chỉ set `selectedConvId=null` | `MobileChatView.vue:14,70-72` | Route contract §4.1 |
| H8 | `ChatView.vue` tạo **instance `useChat()` thứ hai** khi mobile; watcher route vẫn chạy `selectConversation` trên instance đó, có thể `window.location.reload()` (adopt nick scope) | `views/ChatView.vue:4,224-235,677-697`; `useChat()` tạo state theo mỗi lần gọi `composables/use-chat.ts:317` | LOCK C-1 (tách wrapper) |
| H9 | Hàng đợi offline **tự gửi lại** khi online, không gắn user/org | `MobileChatView.vue:102-104,110-112`; `composables/use-offline-queue.ts:5-10,12` | D-6 đã duyệt: **giữ tự gửi**, thêm rào chắn §3.5 |
| H10 | OfflineIndicator hứa "tin nhắn sẽ gửi khi có mạng" | `components/OfflineIndicator.vue:6` | Đổi câu chữ (B) |
| H11 | **Nháp không reset khi đổi hội thoại** (`inputText` chỉ xóa sau gửi) → nguy cơ gửi nhầm khách | `components/chat/MessageThread.vue:1104,2923`; không có watcher reset theo `conversation.id` | Nháp theo convId §3.2 + LOCK C-3 |
| H12 | Auto-scroll đáy vô điều kiện mỗi khi `messages.length` đổi; retry 100/400/1000ms | `MessageThread.vue:2961-2977` | LOCK C-4 |
| H13 | AI suggestion **tự áp vào ô soạn** khi về (không gửi) | `MessageThread.vue:2995-2999`, `applySuggestion` `:2929-2937` | Mobile dùng chế độ `manual` qua sheet |
| H14 | Upload ảnh/file nằm trong MessageThread, FormData field `files`, endpoint `/conversations/:id/attachments` | `MessageThread.vue:745-760,2424-2458` | Tách helper dùng chung (LOCK C-2) |
| H15 | Backend: ảnh jpeg/png/webp/gif ≤100MB; video mp4/quicktime/webm ≤500MB; tài liệu pdf/doc(x)/xls(x)/csv/ppt(x)/zip/gz/rar/tar; **multipart toàn cục cap 500MB** → tài liệu thực tế ≤500MB dù `FILE_MAX`=1GB; chỉ hội thoại Zalo; chặn nick archived (409), privacy main (403), rate limit (429), mime lạ (415) | `backend/src/modules/chat/chat-attachment-routes.ts:30-48,71-73,83,86-89,97-104,107-108,118-125`; `backend/src/app.ts:212` | Bảng accept/giới hạn §3.3 |
| H16 | Kho media gửi qua `sendMediaToConversation`/`sendAlbumToConversation` (api/media), **không** qua `/attachments`; có snapshot convId chống gửi nhầm | `components/chat/MediaTabPanel.vue:200,219-224,248-249,434` | Kho media dùng lại `MediaTabPanel` |
| H17 | Badge "khách chờ" có sẵn nguồn: `GET /conversations/counts` trả `{unread, unreplied, total, otherUnread}`, scope theo nick được xem; admin = toàn org (nặng) | `backend/src/modules/chat/chat-routes.ts:136-179`; desktop gọi `ChatView.vue:401-408` | Composable badge §4.4 |
| H18 | TikTok: không còn route/tab/kênh TikTok trong frontend; inbox chỉ `all/legacy/mock`; chỉ còn field hồ sơ `socialTiktok` và nguồn lead `tiktok-leadgen` | `ChatView.vue:245-249`; `use-contacts.ts:78,294`; `lib/source-badge.ts:18`; `docs/ops/TIKTOK-REMOVAL-2026-11-01.md` | Nhãn "Nick Zalo" (D-1) |
| H19 | Không có route `/account`; "Tài khoản của tôi" ở `/settings/personal/profile`; `/profile` là hồ sơ **nick Zalo**; Thông báo/Giao diện là trang "coming soon" | `router/index.ts:73-78,122-130` | Route `/account` mới (LOCK B-1) |
| H20 | Test hiện có khẳng định nav có tab "Báo cáo" thứ 5 cho quản lý | `views/reports/ReportMobile.dom.spec.ts:106-118` | Test phải cập nhật có chủ đích (LOCK B-4) |
| H21 | Vitest chỉ chạy `src/**/*.spec.ts`, file `*.dom.spec.ts` dùng jsdom | `frontend/vitest.config.ts:17-21` | Test mobile đặt trong `src/`, không phải `frontend/tests/mobile` |
| H22 | `ContactsView.vue` vẫn chạy `onMounted` desktop (fetchContacts/duplicates/stats) khi mobile | `views/ContactsView.vue:4,1514-1518` | LOCK D-1 |
| H23 | Dashboard/Appointments **chưa có nhánh mobile** | `router/index.ts:44-49,79-84`; grep `isMobile` chỉ có Chat/Contacts | LOCK D-2 |
| H24 | `auth.logout()` không xóa queue offline/nháp/cache chat | `stores/auth.ts:132-140`; cache module-level `use-chat.ts:242,248` | Shell dọn state mobile khi `auth.user` → null (§7) |

---

## 2. Danh sách component mobile

Quy ước: mọi SFC `<script setup lang="ts">`, scoped style dưới `.crm-mobile`, chỉ dùng token `--m-*`, touch ≥ 44px, input ≥ 16px. Presenter **không** gọi API/socket; chỉ route adapter (`MobileChatView`, `Mobile*View`) gọi composable.

### 2.1 Bảng tổng

| Component | Đường dẫn dự kiến | Đợt | Agent | Ghi chú |
|---|---|---|---|---|
| MobileLayout (shell, viết lại) | `frontend/src/layouts/MobileLayout.vue` | B | shell | Không dùng `v-app-bar`/`v-bottom-navigation` (layout Vuetify tự cộng padding, xung đột viewport API). Giữ nhánh Báo cáo `isReportsRoute` (`MobileLayout.vue:4-10`) |
| MobilePageHeader | `frontend/src/components/mobile/shell/MobilePageHeader.vue` | B | shell | Header root tab |
| MobileTabBar | `frontend/src/components/mobile/shell/MobileTabBar.vue` | B | shell | `BottomNav.vue` thành wrapper mỏng hoặc bị thay; quyết định trong PR B |
| MobileSheet | `frontend/src/components/mobile/shell/MobileSheet.vue` | B | shell | Bọc `VBottomSheet`/`VDialog`, `content-class="crm-mobile …"` |
| MobileFeedback | `frontend/src/components/mobile/shell/MobileFeedback.vue` | B | shell | loading/empty/error/offline/forbidden |
| MobileAccountView | `frontend/src/views/mobile/account/MobileAccountView.vue` | B | shell | Route `/account` |
| AccountMenuList | `frontend/src/components/mobile/account/AccountMenuList.vue` | B | shell | Lọc RBAC |
| ThemeModePicker | `frontend/src/components/mobile/account/ThemeModePicker.vue` | B | shell | Sáng/Tối/Theo máy |
| MobileInbox | `frontend/src/components/mobile/chat/MobileInbox.vue` | C | chat | |
| ConversationRow | `frontend/src/components/mobile/chat/ConversationRow.vue` | C | chat | Signature nick + người phụ trách |
| InboxFilterSheet | `frontend/src/components/mobile/chat/InboxFilterSheet.vue` | C | chat | Hai pha Áp dụng/Xóa |
| ThreadBackButton (slot cho MessageThread) | `frontend/src/components/mobile/chat/ThreadBackButton.vue` | C | chat | Không tạo header thứ hai (§3.1) |
| AttachmentSheet | `frontend/src/components/mobile/chat/AttachmentSheet.vue` | C | chat | 5 lựa chọn |
| MediaLibrarySheet | `frontend/src/components/mobile/chat/MediaLibrarySheet.vue` | C | chat | Bọc `MediaTabPanel` nguyên bản |
| AISuggestionSheet | `frontend/src/components/mobile/chat/AISuggestionSheet.vue` | C | chat | Chỉ Áp vào nháp |
| ConfirmReplaceDraft | dùng `ConfirmHost` hiện có (`App.vue:8`) | C | chat | Không tạo dialog mới |
| MobileContactList | `frontend/src/components/mobile/crm/MobileContactList.vue` | D | crm | |
| ContactCard | `frontend/src/components/mobile/crm/ContactCard.vue` | D | crm | |
| ContactFilterSheet | `frontend/src/components/mobile/crm/ContactFilterSheet.vue` | D | crm | |
| CustomerProfile | `frontend/src/components/mobile/crm/CustomerProfile.vue` | D | crm | |
| CustomerConversationPicker | `frontend/src/components/mobile/crm/CustomerConversationPicker.vue` | D | crm | 1 khách nhiều nick |
| MobileOverviewView | `frontend/src/views/mobile/crm/MobileOverviewView.vue` | D | crm | Dùng `useDashboardActionHub` |
| MobileAgendaView | `frontend/src/views/mobile/crm/MobileAgendaView.vue` | D | crm | Dùng `useAppointments` |
| AppointmentSheet | `frontend/src/components/mobile/crm/AppointmentSheet.vue` | D | crm | |
| MobileContactProfileView | `frontend/src/views/mobile/crm/MobileContactProfileView.vue` | D | crm | Route `/contacts/:id/profile` khi mobile |
| PwaUpdatePrompt | `frontend/src/pwa/PwaUpdatePrompt.vue` | E | pwa | Chỉ khi chủ dự án duyệt bật SW |

Hoãn có chủ đích: **MobileComposer riêng** và **MobileThreadFrame riêng** (preview COMPONENTS.md) — đợt C giữ `MessageThread` làm renderer + composer để không fork logic reply/edit/mention/format/reaction/privacy (lý do §3.1). Xem lại sau pilot.

### 2.2 Interface TypeScript — shell (B)

```ts
// frontend/src/components/mobile/shell/types.ts  (shell sở hữu)
import type { RouteLocationRaw } from 'vue-router';

export type MobileTabKey = 'overview' | 'contacts' | 'chat' | 'agenda' | 'account';

export interface MobileTabItem {
  key: MobileTabKey;
  label: string;            // 'Tổng quan' | 'Khách hàng' | 'Hội thoại' | 'Lịch hẹn' | 'Tài khoản'
  icon: string;             // mdi-* 
  to: RouteLocationRaw;
  prominent?: boolean;      // true chỉ cho 'chat' (nút tròn nổi giữa)
  badge?: number | null;    // null = không hiện; không hiện 0 khi lỗi tải
  badgeLabel?: string;      // aria: 'N khách đang chờ trả lời'
}

// MobileTabBar.vue
export interface MobileTabBarProps { items: MobileTabItem[]; activeKey: MobileTabKey | null }
export type MobileTabBarEmits = { navigate: [key: MobileTabKey] };

// MobilePageHeader.vue
export interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;                          // root tab = false
  actions?: Array<{ id: string; icon: string; label: string; disabled?: boolean }>; // tối đa 2
}
export type MobilePageHeaderEmits = { back: []; action: [id: string] };
// slot #trailing: dùng cho NotificationBell (component hiện có, không fork)

// MobileSheet.vue
export interface MobileSheetProps {
  open: boolean;              // v-model:open
  title: string;
  dirty?: boolean;            // true → hỏi trước khi đóng
  fullHeight?: boolean;
  persistent?: boolean;
}
export type MobileSheetEmits = { 'update:open': [open: boolean]; close: [] };
// slots: default (vùng cuộn), #footer (luôn thấy, trên safe-area-bottom)
// Focus vào sheet khi mở, Esc đóng, trả focus về trigger (Vuetify VDialog/VBottomSheet đã có focus trap — kiểm lại)

// MobileFeedback.vue
export type MobileFeedbackState = 'loading' | 'empty' | 'error' | 'offline' | 'forbidden';
export interface MobileFeedbackProps { state: MobileFeedbackState; title?: string; description?: string; retryable?: boolean; clearable?: boolean }
export type MobileFeedbackEmits = { retry: []; clearFilters: [] };

// AccountMenuList.vue
export interface AccountMenuItem {
  id: 'personal' | 'password' | 'notifications' | 'nick' | 'media' | 'reports' | 'org-settings';
  group: 'personal' | 'work';
  label: string;
  icon: string;
  to?: RouteLocationRaw;      // không có = mở sheet tại chỗ (password)
  visible: boolean;           // đã lọc RBAC/edition ở adapter
  unavailableNote?: string;   // vd 'Sắp có' cho trang coming soon
}
export interface AccountMenuListProps { items: AccountMenuItem[] }
export type AccountMenuListEmits = { select: [id: AccountMenuItem['id']] };

// ThemeModePicker.vue  (v-model)
import type { ThemePreference } from '@/stores/ui-theme';
export interface ThemeModePickerProps { modelValue: ThemePreference }
export type ThemeModePickerEmits = { 'update:modelValue': [value: ThemePreference] };
```

Bảng menu Tài khoản (adapter `MobileAccountView` tính `visible`):

| id | Nhãn | Đích | Điều kiện hiển thị (chỉ UI; server vẫn chặn) |
|---|---|---|---|
| personal | Thông tin cá nhân | `/settings/personal/profile` (`router/index.ts:125`) | đã đăng nhập |
| password | Đổi mật khẩu | sheet chứa `components/settings/ChangePasswordModal.vue` (dùng lại, `PersonalAccountPage.vue:106,116`) | đã đăng nhập |
| notifications | Thông báo | danh sách thông báo trong app (NotificationBell) — trang cài đặt `Settings.Notifications` đang "coming soon" (`router/index.ts:128`) | đã đăng nhập; xem D-8 |
| nick | Nick Zalo | `/settings/channels/zalo` (`router/index.ts:167`) | `auth.canAccess('zalo_account')` |
| media | Kho media | `/media` (`router/index.ts:62-66`) | `auth.canAccess('media')` |
| reports | Báo cáo | `/reports/tong-quan` | `canViewReports(auth.user)` (`utils/report-access.ts:2-6`) |
| org-settings | Cài đặt tổ chức | `/settings/org/profile` (`router/index.ts:133`) | `auth.canAccess('settings')` |

Đầu màn: avatar + `auth.user.fullName` + `orgName` + `permissionGroupName`. Cuối màn: **Đăng xuất** có xác nhận qua `ConfirmHost`, gọi `auth.logout()` rồi `router.replace('/login')` (giữ hành vi `MobileLayout.vue:66-69`).

### 2.3 Interface TypeScript — chat (C)

```ts
// frontend/src/components/mobile/chat/types.ts  (chat sở hữu)
import type { Conversation } from '@/composables/use-chat';

export interface ConversationContext {
  nickName: string;               // conversation.zaloAccount?.displayName ?? conversation.channelAccount?.displayName ?? 'Không rõ nick'
  channelLabel: string;           // 'Zalo' | 'Kênh thử nghiệm' — từ registry kênh đang bật, KHÔNG có TikTok
  ownerName: string | null;       // conversation.contact?.assignedUser?.fullName; null → hiện 'Chưa phân công'
  archivedNick: boolean;          // !!zaloAccount.archivedAt  (MessageThread.vue:1680)
  virtual: boolean;               // conversation.isVirtual   (MessageThread.vue:1637)
  privateNick: boolean;           // zaloAccount.privacyMode === 'main'
}
// Không suy owner từ người gửi tin cuối. Nhiều người cùng chăm: xem D-4.

export interface InboxFilters {
  unreplied: boolean;             // map isReplied === false
  mine: boolean;                  // map assignedUserId === auth.user.id (nếu API list hỗ trợ; nếu không → ẩn chip, không lọc client trang đầu)
  accountId: string | null;       // → useChat().accountFilter
}

// MobileInbox.vue
export interface MobileInboxProps {
  conversations: Conversation[];
  query: string;                  // v-model:query → useChat().searchQuery
  filters: InboxFilters;          // v-model:filters
  state: 'ready' | 'loading' | 'error' | 'offline';
  hasMore: boolean;
  loadingMore: boolean;
  accounts: Array<{ id: string; displayName: string }>;
}
export type MobileInboxEmits = {
  'update:query': [q: string];
  'update:filters': [f: InboxFilters];
  select: [convId: string];
  loadMore: [];
  retry: [];
  compose: [];                    // "Tin nhắn mới" → NewMessageDialog hiện có (chat/NewMessageDialog.vue)
};

// ConversationRow.vue
export interface ConversationRowProps { conversation: Conversation; context: ConversationContext; selected?: boolean }
export type ConversationRowEmits = { select: [convId: string]; openActions: [convId: string] };
// Hiển thị: tên (wrap), preview ≤2 dòng (đã redact theo privacy từ API), giờ, unread bằng số + chữ,
// 'Chưa trả lời' bằng chữ khi isReplied===false, dòng context "nick · người phụ trách".

// AttachmentSheet.vue
export type AttachmentKind = 'image' | 'camera' | 'video' | 'document' | 'library';
export interface AttachmentSheetProps {
  open: boolean;
  conversationId: string;         // snapshot khi mở; đổi conv khi đang mở → sheet tự đóng
  context: ConversationContext;   // dòng đầu: "Gửi tới <khách> qua <nick>"
  disabled: boolean;              // offline || archivedNick || virtual || !zalo conversation || sending
  disabledReason?: string;
}
export type AttachmentSheetEmits = {
  'update:open': [open: boolean];
  // files đã qua validateAttachment(); conversationId là snapshot lúc mở sheet
  pick: [payload: { kind: Exclude<AttachmentKind, 'library'>; files: File[]; conversationId: string }];
  openLibrary: [conversationId: string];
  rejected: [reasons: string[]];  // file sai định dạng/quá cỡ → toast tiếng Việt
};

// AISuggestionSheet.vue
export interface AISuggestionSheetProps {
  open: boolean;
  conversationId: string;
  suggestion: string;             // useChat().aiSuggestion
  sources: string[];              // useChat().aiSuggestionSources (nguồn thật; rỗng → ẩn mục nguồn)
  loading: boolean;
  error: string;
  needsReviewReason: string;      // useChat().aiNeedsReviewReason
  enabled: boolean;               // useChat().aiConfig.enabled && aiUsage.remaining > 0
  currentDraft: string;           // để quyết định có hỏi "Thay nháp?" không
}
export type AISuggestionSheetEmits = {
  'update:open': [open: boolean];
  ask: [];                        // → generateAiSuggestion()
  applyDraft: [payload: { conversationId: string; text: string; mode: 'replace' | 'append' }];
  // KHÔNG có emit 'send'. Đóng sheet không xóa nháp.
};

// ThreadBackButton.vue
export type ThreadBackButtonEmits = { back: [] };   // 44×44, aria-label 'Quay lại danh sách hội thoại'
```

### 2.4 Interface TypeScript — CRM (D)

```ts
// frontend/src/components/mobile/crm/types.ts  (crm sở hữu)
import type { Contact, ContactFilters } from '@/composables/use-contacts';
import type { Appointment } from '@/composables/use-appointments';
import type { UrgentItem, MeResponse } from '@/composables/use-dashboard-action-hub';

export interface MobileContactListProps {
  contacts: Contact[]; total: number; filters: ContactFilters;
  state: 'ready' | 'loading' | 'error' | 'offline'; loadingMore: boolean; hasMore: boolean;
  canCreate: boolean;             // auth.canAccess('contact','create') nếu grant tồn tại; nếu không có action này → hành vi hiện tại (FAB luôn hiện, MobileContactView.vue:69-77)
}
export type MobileContactListEmits = {
  'update:filters': [f: Partial<ContactFilters>]; openProfile: [contactId: string];
  create: []; loadMore: []; retry: [];
};

export interface ContactCardProps { contact: Contact; statusLabel: string; ownerName: string | null }
export type ContactCardEmits = { openProfile: [contactId: string] };

export interface CustomerProfileProps {
  contact: Contact | null;
  conversations: Array<{ convId: string; nickName: string; ownerName: string | null }>;
  state: 'ready' | 'loading' | 'missing' | 'forbidden' | 'offline';
  canEdit: boolean;
}
export type CustomerProfileEmits = {
  message: [contactId: string];   // adapter: 0 conv → openContactChat(router, contactId) (use-open-contact-chat.ts:33); ≥2 → picker
  schedule: [contactId: string]; edit: [contactId: string]; openActivity: [contactId: string];
};

export interface CustomerConversationPickerProps { open: boolean; contactId: string; options: CustomerProfileProps['conversations'] }
export type CustomerConversationPickerEmits = { 'update:open': [v: boolean]; select: [convId: string] };

export interface MobileOverviewProps {
  me: MeResponse | null; urgent: UrgentItem[];
  state: 'ready' | 'loading' | 'error' | 'offline';
  canSwitchScope: boolean;        // useDashboardActionHub().hasTeamSection
}
export type MobileOverviewEmits = {
  openConversation: [convId: string]; openInbox: [filter: 'unreplied' | 'all'];
  openAppointment: [id: string]; changeScope: []; retry: [];
};
// KPI theo PrivacySplit (use-dashboard-action-hub.ts:16-29) phải giữ tách public/private; không cộng gộp để lộ số private.

export interface AppointmentDraft {
  contactId: string; title: string; appointmentDate: string; durationMin: number;
  type: string; notes: string; assignedUserId: string | null; conversationId?: string | null;
}
export interface AppointmentSheetProps { open: boolean; initial: Partial<AppointmentDraft>; saving: boolean; error: string; timezoneLabel: string }
export type AppointmentSheetEmits = { 'update:open': [v: boolean]; submit: [draft: AppointmentDraft] };
// Giữ conversationId/source/externalRef khi sửa; thao tác phá hủy qua ConfirmHost.
```

---

## 3. Chat: ranh giới, AI, media

### 3.1 Một owner, không fork

- **Một instance `useChat()` cho mobile**, gọi tại `views/MobileChatView.vue` (route adapter). Chỉ instance này gọi `initSocket()`/`destroySocket()` (`use-chat.ts:936,1336`). Presenter nhận props/emit. Không component con nào gọi `useChat()` hay `createAppSocket()`.
- Instance thứ hai trong `ChatView.vue` khi mobile (H8) phải bị loại bằng **LOCK C-1**. Trước khi LOCK C-1 merge, chat agent không được thêm watcher route trùng với `ChatView.vue:677`.
- **Thread = `MessageThread` hiện có** (renderer, composer Tiptap, reply/edit/mention/style, reaction, context menu, privacy blur, nick switcher, auto-reply toggle, friendship — `MessageThread.vue:13-360`). Mobile không tạo header thứ hai: `MobileChatView.vue:23-30` (thanh back + tên) bị xóa; nút back chèn vào header của MessageThread qua slot `#header-leading` (LOCK C-3). Lý do: header MessageThread đã có toàn bộ action + signature nick; fork 4.257 dòng là rủi ro gửi nhầm/mất parity lớn hơn lợi ích.
- CSS mobile cho MessageThread viết từ scoped style của `MobileChatView` dạng `.crm-mobile :deep(...)` — được phép, không cần lock. Thay đổi **logic** MessageThread chỉ qua LOCK.
- Inbox: thay `ConversationList` (desktop ~1.900 dòng) bằng `MobileInbox` + `ConversationRow` dùng cùng state `useChat` (`conversations`, `searchQuery`, `accountFilter`, `fetchConversations`, `loadMoreConversations`). Inbox **giữ mounted** (ẩn bằng `v-show` + `inert`) khi mở thread để bảo toàn scroll/filter; `/chat` và `/chat/:convId` là cùng route record nên `ChatView` không remount.
- Filter inbox giữ **trong bộ nhớ** (module state của MobileChatView/composable chat), không đưa search vào URL (tránh tên khách trong lịch sử/URL). Mất khi reload là chấp nhận được.
- Gửi: `MobileChatView.handleSend` chụp `const convId = selectedConvId.value` đồng bộ ngay trong handler (emit của MessageThread là đồng bộ, `MessageThread.vue:2919-2921`), rồi gọi `sendMessageTo(convId, content, replyId, styles, mentions)` (`use-chat.ts:864`). Payload không đổi.

### 3.2 Nháp theo hội thoại + AI

```ts
// frontend/src/composables/mobile/use-mobile-chat-drafts.ts  (chat sở hữu, đợt C)
export interface MobileChatDrafts {
  get(convId: string): string;
  set(convId: string, text: string): void;
  clear(convId: string): void;
  clearAll(): void;                  // gọi khi logout / đổi user (watch auth.user?.id)
  hasDraft(convId: string): boolean;
}
export function useMobileChatDrafts(): MobileChatDrafts; // Map module-level, CHỈ RAM, không localStorage (D-7)
```

- MessageThread nhận `v-model:draft` ở chế độ mobile (LOCK C-3). `MobileChatView` bind `draft = drafts.get(selectedConvId)`. Đổi conv → MessageThread hiển thị nháp của conv mới, không mang chữ conv cũ (sửa H11 cho mobile).
- AI: nút ✨ của MessageThread emit `ask-ai` (`MessageThread.vue:610,1081`) → MobileChatView mở `AISuggestionSheet`, gọi `generateAiSuggestion()` (`use-chat.ts:728`). Mobile truyền `ai-apply-mode="manual"` để tắt watcher auto-apply (H13). `applyDraft` → nếu `currentDraft.trim()` khác rỗng và `mode==='replace'` thì hỏi "Thay nháp hiện tại?" qua ConfirmHost → `drafts.set(convId, text)`; **kiểm `payload.conversationId === selectedConvId`** trước khi áp, sai thì bỏ và báo.
- Gọi `fetchAiConfig()` khi mount mobile (desktop gọi ở `ChatView.vue:756`), hiển thị `aiUsage.remaining`. Không đổi chính sách auto-reply; toggle auto-reply vẫn là control trong header MessageThread.

### 3.3 Attachment sheet (dùng nguyên API)

| Lựa chọn | Input | accept / capture | multiple | Giới hạn client (khớp backend) | Đường gửi |
|---|---|---|---|---|---|
| Ảnh | `<input type=file>` | `accept="image/*"` | có | mime ∈ jpeg/png/webp/gif, ≤100MB/ảnh | `POST /conversations/:id/attachments` |
| Chụp ảnh | `<input type=file>` | `accept="image/*" capture="environment"` | không | như Ảnh | như trên |
| Video | `<input type=file>` | `accept="video/mp4,video/quicktime,video/webm"` | không (D-9) | ≤500MB | như trên |
| Tài liệu | `<input type=file>` | `.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip,.gz,.rar,.tar` | có | ≤**500MB** (cap multipart `app.ts:212`) | như trên |
| Kho media | — | — | — | — | `MediaLibrarySheet` bọc `MediaTabPanel` (props `conversationId, contact, ownerNickId, nickName`) → `api/media` hiện có |

- Upload qua helper chung **`frontend/src/composables/use-chat-attachments.ts`** (LOCK C-2, orchestrator tách từ `MessageThread.vue:2424-2458`, không đổi hành vi):

```ts
export const CHAT_ATTACHMENT_LIMITS: { imageMax: number; videoMax: number; fileMax: number; image: readonly string[]; video: readonly string[]; file: readonly string[] };
// Bản sao có chú thích nguồn backend/src/modules/chat/chat-attachment-routes.ts:30-48 + app.ts:212. Backend vẫn là nguồn chặn.
export function validateAttachment(file: File): { ok: true } | { ok: false; reason: string };
export function uploadChatAttachments(conversationId: string, files: File[], opts?: { caption?: string }): Promise<void>;
// FormData field 'files' (+ 'caption' tùy chọn), header multipart; ném lỗi kèm message backend (403 PRIVACY_LOCKED, 409 NICK_ARCHIVED, 413, 415, 429).
```
- Trước upload: `payload.conversationId === selectedConvId` bắt buộc; lệch → hủy + toast "Đã đổi khách, chưa gửi tệp". Sau upload thành công: `fetchMessages(convId)`.
- Disable sheet khi offline, nick archived, conversation ảo (`isVirtual`), hội thoại kênh không phải Zalo (`channelAccount` ≠ null, route bị `assertZaloConversation` chặn), hoặc đang gửi. Nút vẫn hiện + lý do bằng chữ.
- HEIC: iOS thường chuyển sang JPEG khi `accept="image/*"` nhưng **chưa kiểm trên máy thật**; nếu nhận `image/heic` → `validateAttachment` trả lỗi tiếng Việt, không gửi. Không thêm thư viện convert.

### 3.4 Scroll owner

LOCK C-4 trên `MessageThread.vue:2961-2977`: chỉ tự cuộn đáy khi (a) đang cách đáy ≤ 120px, (b) tin cuối là `senderType==='self'` do chính người dùng vừa gửi, hoặc (c) đổi conversation. Ngược lại tăng bộ đếm và hiện pill **"Tin mới ↓"** ở giữa phía trên composer. Bàn phím mở/resize **không** được coi là tin mới. Hiện chưa có tải lịch sử cũ (không tìm thấy pagination messages trong `use-chat.ts`/MessageThread) → yêu cầu giữ anchor khi prepend áp dụng khi tính năng này xuất hiện.

---

### 3.5 Hàng đợi offline — giữ tự gửi (D-6, duyệt 07/11/2026)

Chủ dự án chọn **giữ** tự gửi lại khi có mạng trên mobile. Hiện trạng `use-offline-queue.ts` lưu `localStorage['zalocrm-offline-queue']` toàn cục, không gắn user/org, nên đợt C bắt buộc thêm (owner: mobile-chat-dev, file `use-offline-queue.ts` theo OWNERSHIP):

1. Mỗi mục thêm `userId`, `orgId`; `flush` chỉ gửi mục khớp `auth.user` hiện tại; mục của user khác **không bao giờ** gửi, bị xóa khi logout/đổi user (§8).
2. Gửi theo `msg.conversationId` đã chụp lúc bấm (`sendMessageTo`), không dùng hội thoại đang mở; giữ đúng payload desktop. `replyMessageId`/`styles`/`mentions` hiện bị mất khi xếp hàng → hoặc lưu kèm, hoặc khi offline chỉ cho xếp hàng tin văn bản thuần và báo rõ (ghi parity).
3. Chống gửi trùng: một flush một lúc (đã có cờ `flushing`), xóa mục ngay sau khi API trả thành công, lỗi thì dừng và giữ thứ tự; không retry vòng lặp.
4. Mục quá hạn (đề xuất > 24 giờ) **không tự gửi**, chuyển sang trạng thái "Chưa gửi" với nút Gửi lại/Xóa tay.
5. UI: tin chờ hiện trong thread với nhãn "Đang chờ gửi" + nút Hủy; banner offline đổi câu chữ thành "Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng" (khớp hành vi thật, H10).
6. File đính kèm và gửi từ Kho media **không** xếp hàng offline — sheet bị khóa khi offline (§3.3).

## 4. Route, back, deep link, nav

### 4.1 Bảng route

| URL | Route name | Mobile render | Back (nút trong app) | Fallback khi không có lịch sử nội bộ | Ẩn tabbar |
|---|---|---|---|---|---|
| `/` | Dashboard | `MobileOverviewView` (D, qua LOCK D-2) | — | — | không |
| `/chat` | Chat | `MobileChatView` → inbox | — | — | không |
| `/chat/:convId` | Chat | `MobileChatView` → thread | `goBack()` | `router.replace({ name: 'Chat' })` | **có** |
| `/chat?conv=` / `?conversationId=` | Chat | chuẩn hóa sang `/chat/:convId` bằng watcher hiện có `ChatView.vue:701-715` (giữ, chỉ `router.replace`) | | | |
| `/chat?contactId=` | Chat | `openContactChat` hiện có `ChatView.vue:729-736` (giữ) | | | |
| `/chat?compose=` | Chat | mở NewMessageDialog điền sẵn SĐT (parity `ChatView.vue:717-722`) | | | |
| `/chat/:convId?draft=` | Chat | MessageThread tự tiêu thụ (`MessageThread.vue:2752-2766`) — ở mobile ghi vào `drafts` của conv đó | | | |
| `/contacts` | Contacts | `MobileContactView` | — | — | không |
| `/contacts/:id/profile` | ContactProfile | `MobileContactProfileView` (D, LOCK D-3) | `goBack()` | `{ name: 'Contacts' }` | **có** |
| `/customers/:id/activity` | CustomerActivityLog | view hiện có | `goBack()` | `/contacts/:id/profile` | **có** |
| `/appointments` | Appointments | `MobileAgendaView` (D, LOCK D-2) | — | — | không |
| `/account` | **Account (mới)** | `MobileAccountView` | — | — | không |
| `/account` trên desktop | Account | redirect `/settings/personal/profile` | | | |
| `/settings/**`, `/media`, `/reports/**` | hiện có | view hiện có trong MobileLayout | `goBack()` | `/account` | không (reports giữ header riêng) |

Tham số deep link chỉ là ID; không đưa nội dung khách/token vào URL.

### 4.2 Back API

```ts
// frontend/src/composables/use-mobile-back.ts  (shell sở hữu, đợt B)
import type { RouteLocationRaw } from 'vue-router';
export function useMobileBack(fallback: RouteLocationRaw): { canGoBackInApp: ComputedRef<boolean>; goBack(): Promise<void> };
// canGoBackInApp = typeof window.history.state?.back === 'string' (vue-router 4 ghi state.back cho điều hướng nội bộ)
// goBack(): canGoBackInApp ? router.back() : router.replace(fallback)
// Không bao giờ để back rời app/đóng PWA. Không hijack vuốt-back Safari.
```

`MobileChatView`:
- `select(convId)` → `router.push({ name: 'Chat', params: { convId } })` (cùng mẫu desktop `ChatView.vue:660-669`). Không set `selectedConvId` trực tiếp.
- `watch(() => route.params.convId, id => id ? selectConversation(id) : (selectedConvId.value = null), { immediate: true })` — deep link cold start tải đúng conv kể cả khi không có trong trang đầu (use-chat resolve detail, `use-chat.ts:440,773`).
- Không gọi `window.location.reload()` ở mobile. Adopt nick scope (desktop `ChatView.vue:681-692`) **không** áp dụng cho mobile trong C (D-5).

### 4.3 Nav

```ts
// frontend/src/composables/use-mobile-nav.ts  (shell sở hữu)
export function resolveMobileTab(route: { name?: string | symbol | null; path: string }): MobileTabKey | null; // hàm thuần, có unit test
export function useMobileNavItems(): ComputedRef<MobileTabItem[]>; // lọc quyền + gắn badge
```

| Route name / path | Tab |
|---|---|
| `Dashboard` | overview |
| `Contacts`, `ContactProfile`, `CustomerActivityLog`, `StuckLeads`, `Friends` | contacts |
| `Chat` (mọi param/query) | chat |
| `Appointments` | agenda |
| `Account`, `Settings*`, `Media`, `Profile`, `Reports*`, `/reports/**`, `/marketing/**`, `Groups`, `Analytics` | account |
| khác / NotFound | null (không tab nào active) |

Quyền hiển thị: `contacts` cần `auth.canAccess('contact')`; `chat` cần `auth.canAccess('conversation')` (meta `router/index.ts:54,60`). Thiếu quyền → ẩn mục, tabbar co lại; nếu ẩn `chat` thì không có nút nổi. Tổng quan, Lịch hẹn, Tài khoản luôn hiện. Tab "Báo cáo" cũ (`BottomNav.vue:29`) chuyển vào Tài khoản → Báo cáo (2 bước).

### 4.4 Badge số khách chờ

```ts
// frontend/src/composables/use-mobile-waiting-count.ts  (shell sở hữu)
export interface MobileWaitingCount {
  count: Readonly<Ref<number | null>>;   // null = chưa có/lỗi → không hiện badge
  refresh(): Promise<void>;              // single-flight
}
export function useMobileWaitingCount(): MobileWaitingCount; // singleton ref-count, cleanup onScopeDispose
```
- Nguồn: `GET /conversations/counts` → `unreplied` (H17). Không tạo socket. Làm mới khi: mount shell, đổi route, `visibilitychange` → visible, sự kiện `window` `'chat:inbound-message'` (đã có, `use-chat.ts:1082`, chỉ phát khi chat đang mở socket). Debounce 2s, tối thiểu 30s giữa 2 lần gọi không do người dùng (endpoint nặng với admin, chú thích `ChatView.vue:410-414`). Không polling nền khi tab ẩn.
- Hiện `99+` khi >99. aria-label "N khách đang chờ trả lời". Logout → `count = null`.

---

## 5. Viewport API

```ts
// frontend/src/composables/use-mobile-viewport.ts  (shell sở hữu, đợt B)
export const KEYBOARD_MIN_INSET = 120; // px — nhỏ hơn coi là thanh công cụ Safari co giãn, không phải bàn phím

export interface MobileViewportState {
  supported: Readonly<Ref<boolean>>;            // 'visualViewport' in window
  viewportHeight: Readonly<Ref<number>>;        // visualViewport.height ?? window.innerHeight (CSS px)
  viewportWidth: Readonly<Ref<number>>;
  offsetTop: Readonly<Ref<number>>;             // visualViewport.offsetTop ?? 0
  keyboardInset: Readonly<Ref<number>>;         // max(0, innerHeight - vv.height - vv.offsetTop)
  keyboardOpen: Readonly<Ref<boolean>>;         // keyboardInset >= KEYBOARD_MIN_INSET && document.activeElement là input/textarea/contenteditable
  orientation: Readonly<Ref<'portrait' | 'landscape'>>;
  cssVars: ComputedRef<{ '--m-app-height': string; '--m-keyboard-inset': string; '--m-vv-offset-top': string }>;
  // supported → '--m-app-height' = `${viewportHeight}px`; không → '100dvh'
}
export function useMobileViewport(): MobileViewportState;
```

- **Singleton ref-count**: listener gắn lần gọi đầu, gỡ khi consumer cuối dispose (`onScopeDispose`). Listener: `visualViewport` `resize` + `scroll`; `window` `resize` + `orientationchange`; `document` `focusin`/`focusout`. Gộp cập nhật bằng `requestAnimationFrame`, hủy rAF khi cleanup. An toàn khi `window` không có (test node) và jsdom.
- **Chỉ `MobileLayout` gọi** và bind `:style="cssVars"` lên root `.crm-mobile`. Con đọc qua inject (dưới), không tự gọi `useMobileViewport` để tính chiều cao.
- CSS shell: root `height: var(--m-app-height, 100dvh)`; khung flex column `[banner][header][main flex:1 min-height:0][tabbar]`. Cấm `100vh`/`calc(100vh - Npx)` trong mã mobile mới. `@supports not (height: 100dvh)` → `height: -webkit-fill-available` (iOS < 15.4; phụ thuộc D-10).
- Safe-area: header nhận `padding-top: var(--m-safe-top)`, tabbar nhận `padding-bottom: var(--m-safe-bottom)`; khi ẩn tabbar (thread) composer nhận safe-bottom; khi bàn phím mở **không** cộng safe-bottom. Trái/phải dùng `--m-safe-left/right` cho landscape. Không cộng hai lần.

```ts
// frontend/src/components/mobile/shell/shell-context.ts
export interface MobileChromeRequest { tabbar?: boolean; header?: boolean }
export interface MobileShellContext {
  viewport: MobileViewportState;
  tabbarVisible: Readonly<Ref<boolean>>;   // mặc định theo §4.1 và ẩn khi keyboardOpen
  headerVisible: Readonly<Ref<boolean>>;   // ẩn ở thread/profile (màn có header riêng)
  requestChrome(req: MobileChromeRequest): () => void; // trả hàm release; tự release khi scope caller dispose
}
export const MOBILE_SHELL_KEY: InjectionKey<MobileShellContext>;
export function useMobileShell(): MobileShellContext; // ngoài shell → throw Error rõ ràng (lỗi lập trình)
```

---

## 6. Theme API

```ts
// frontend/src/stores/ui-theme.ts  (Pinia setup store, shell sở hữu, đợt B)
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'crm.mobile.themePreference';   // KHÔNG dùng key 'theme' (H2)
export const VUETIFY_THEME_NAME = { light: 'hsLight', dark: 'hsDark' } as const;

export const useUiThemeStore: () => {
  preference: Ref<ThemePreference>;          // mặc định 'light' (D-2); giá trị lạ trong storage → 'light'
  systemPrefersDark: Readonly<Ref<boolean>>; // matchMedia('(prefers-color-scheme: dark)')
  resolved: ComputedRef<ResolvedTheme>;      // system → theo máy
  setPreference(p: ThemePreference): void;   // ghi localStorage (try/catch Safari private mode)
};
```

```ts
// frontend/src/composables/use-mobile-theme-effects.ts  (shell sở hữu) — gọi DUY NHẤT trong MobileLayout setup
export function useMobileThemeEffects(opts: { forceLight: Ref<boolean> }): { effective: ComputedRef<ResolvedTheme> };
// forceLight = isReportsRoute (giữ hành vi MobileLayout.vue:4, report-kit chỉ có bản sáng) — D-3
```

Side effect khi `effective` đổi (watch immediate) và cleanup:

| Tác động | Sáng | Tối | Khi MobileLayout unmount (sang desktop) |
|---|---|---|---|
| Vuetify global theme | `hsLight` | `hsDark` | `hsLight` (desktop luôn sáng, `DefaultLayout.vue:266`) |
| `document.documentElement` attr `data-theme` | `light` | `dark` | gỡ attr |
| Root `.crm-mobile` attr `data-theme` | `light` | `dark` | — |
| `<meta name="color-scheme">` | `light only` | `dark` | `light only` |
| `<meta name="theme-color">` | `#f7f9fc` | `#0f1720` | giá trị chụp lúc mount (index.html `#0A192F`) |

- Đổi theme Vuetify: dùng `theme.change(name)` nếu Vuetify 4.0.4 có API này, nếu không `theme.global.name.value = name` — **chưa xác minh typings, PR B phải kiểm**.
- Listener `matchMedia` gỡ trong `onScopeDispose`. Không sửa `index.html` ở B (meta mặc định giữ an toàn trước JS).
- Overlay Vuetify teleport ra ngoài `.crm-mobile` → `MobileSheet` truyền `content-class="crm-mobile"`; token tối khai báo cho cả `.crm-mobile[data-theme="dark"]` và `html[data-theme="dark"] .crm-mobile` để overlay cũng nhận.
- Ảnh/bubble privacy blur, chart, `hs-crm-theme.css` (nhiều `!important` màu sáng) có thể không đổi theo dark → QA bắt buộc chụp từng màn (§10).

Đề xuất `hsDark` (diff cho LOCK B-2, giá trị từ `tokens.css` dark):

```ts
'hsDark': {
  dark: true,
  colors: {
    primary: '#3fa9e0', 'primary-darken-1': '#6cc4f2', secondary: '#6cc4f2', accent: '#6cc4f2',
    background: '#0f1720', surface: '#18222d', 'surface-variant': '#1f2b38',
    success: '#5fd39b', warning: '#f2b866', error: '#ff8a80', info: '#3fa9e0',
    'nav-a': '#0f1720', 'nav-b': '#0a1118', 'nav-accent': '#6cc4f2',
    'on-surface': '#e7eef5', 'on-background': '#e7eef5', 'on-primary': '#0f1720',
  },
  variables: { 'border-color': '#2c3a48', 'border-opacity': 1, 'high-emphasis-opacity': 1, 'medium-emphasis-opacity': 0.78, 'theme-radius': '8px' },
},
```
`on-primary` tối (không trắng): chữ trắng trên `#3fa9e0` dưới 4.5:1. Không xóa `legacy-dark`/`smax-light` trong đợt này.

---

## 7. Token `--m-*`

File production: `frontend/src/assets/mobile-tokens.css` (shell sở hữu), **import từ `MobileLayout.vue`**, không import ở `main.ts`. Selector: `.crm-mobile` (sáng) và `.crm-mobile[data-theme="dark"], html[data-theme="dark"] .crm-mobile` (tối). Không selector toàn cục khác.

| Token | Sáng | Tối | Ghi chú |
|---|---|---|---|
| `color-scheme` (thuộc tính) | `light only` | `dark` | |
| `--m-brand` | `#1786be` | `#3fa9e0` | |
| `--m-brand-strong` | `#0b5880` | `#6cc4f2` | action |
| `--m-bg` | `#f7f9fc` | `#0f1720` | |
| `--m-surface` | `#fff` | `#18222d` | |
| `--m-surface-inset` | `#edf2f7` | `#1f2b38` | |
| `--m-text` | `#152838` | `#e7eef5` | theo system.md |
| `--m-muted` | `#526576` | `#a3b3c3` | |
| `--m-line` | `#d5dce5` | `#2c3a48` | |
| `--m-success` | `#157347` | `#5fd39b` | luôn kèm chữ |
| `--m-danger` | `#b42318` | `#ff8a80` | |
| `--m-warning` | `#8a4b08` | `#f2b866` | luôn kèm chữ |
| `--m-warning-soft` | `#fff3e3` | `#3a2b14` | |
| `--m-brand-soft` | `#e7f3fa` | `#15344a` | |
| `--m-focus` | `#0b5880` | `#6cc4f2` | |
| `--m-bubble-in` | `#fff` | `#1f2b38` | |
| `--m-bubble-out` | `#e2f1fa` | `#164260` | |
| `--m-shadow` | `0 6px 24px rgb(20 26 36 / .10)` | `0 6px 24px rgb(0 0 0 / .45)` | |
| `--m-tap-highlight` | `rgb(23 134 190 / .12)` | `rgb(108 196 242 / .16)` | |
| `--m-scrim` | `#15283866` | `#000a` | |
| **`--m-on-action`** (mới) | `#fff` | `#0f1720` | chữ trên `--m-brand-strong`; preview dùng trắng cố định → sai tương phản ở tối |
| `--m-space-1…6`, `--m-space-8` | 4/8/12/16/20/24, 32px | = | |
| `--m-radius-sm/md/lg` | 8/12/20px | = | |
| `--m-radius-card` / `--m-radius-sheet` | 16px / 24px | = | |
| `--m-font-family` | `-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif` | = | |
| `--m-font-body/meta/section/title` | 16/13/17/28px | = | input ≥16px |
| `--m-gutter` | 16px (≤359px: 12px) | = | |
| `--m-header` / `--m-tabbar` / `--m-touch` | 56/56/44px | = | |
| **`--m-fab-size`** (mới) | 56px | = | nút Hội thoại nổi giữa |
| `--m-safe-top/bottom/left/right` | `env(safe-area-inset-*, 0px)` | = | |
| `--m-z-header` / `--m-z-nav` / `--m-z-toast` | 20/30/130 | = | backdrop100/sheet110/dialog120 theo doc04 — map với z-index overlay Vuetify, không ép số thấp |
| **`--m-app-height`, `--m-keyboard-inset`, `--m-vv-offset-top`** (mới) | do `useMobileViewport` ghi | = | không khai báo cứng |

**Không đưa vào production**: `--m-device-*`, `--m-keyboard-bg/text/shadow/special` (chrome mô phỏng của preview).

---

## 8. Dọn state khi logout / đổi user

`MobileLayout` watch `auth.user?.id`: khi null hoặc đổi id → `drafts.clearAll()`, waiting count = null, filter inbox reset. Hàng đợi offline: xóa mục của user cũ (§3.5). Không sửa `stores/auth.ts`. Cache module-level `messagesCache`/`conversationsCache` của use-chat (`use-chat.ts:242,248`) không dọn khi logout — ghi nhận rủi ro, đề xuất LOCK riêng sau (không thuộc A–E nếu chưa duyệt).

---

## 9. LOCK REQUEST dự kiến (orchestrator thực hiện)

| ID | Đợt | File | Lý do | Diff đề xuất |
|---|---|---|---|---|
| B-1 | B | `frontend/src/router/index.ts` | Route `/account` | Thêm `{ path: '/account', name: 'Account', component: () => import('@/views/mobile/account/MobileAccountView.vue'), meta: { requiresAuth: true }, beforeEnter: () => useMobile().isMobile.value ? true : '/settings/personal/profile' }` trước NotFound; `ROUTE_TITLES.Account = 'Tài khoản'` |
| B-2 | B | `frontend/src/plugins/vuetify.ts` | Theme dark thật | Thêm `hsDark` (§6) vào `themes`, giữ `defaultTheme: 'hsLight'` |
| B-3 | B | `frontend/src/App.vue` | Không bắt buộc | Không đổi nếu MobileLayout tự gọi effects; chỉ mở nếu cần provide shell ở cấp App |
| B-4 | B | `frontend/src/views/reports/ReportMobile.dom.spec.ts` | Test khẳng định tab Báo cáo thứ 5 (H20) | Thay case `:106-118` bằng: nav luôn 5 mục cố định; Báo cáo ở Tài khoản hiện theo `canViewReports`, ẩn sau hạ quyền |
| B-5 | B | `frontend/src/layouts/DefaultLayout.vue` | Không đổi | Ghi nhận `:266-267` vẫn ép hsLight cho desktop; không chỉnh |
| C-1 | C | `frontend/src/views/ChatView.vue` | Loại instance useChat thứ hai và watcher route trên mobile (H8) | Phương án A (đề xuất): chuyển toàn bộ desktop sang `views/DesktopChatView.vue` không đổi logic; `ChatView.vue` chỉ `<MobileChatView v-if="isMobile"/><DesktopChatView v-else/>`. Phương án B: thêm `if (isMobile.value) return` đầu các watcher `:251,:451,:472,:515,:677` |
| C-2 | C | `frontend/src/components/chat/MessageThread.vue` + file mới `composables/use-chat-attachments.ts` | Một đường upload | Tách `handleImageFiles/handleFiles` (`:2424-2458`) sang helper §3.3; MessageThread gọi helper, giữ toast/emit như cũ |
| C-3 | C | `MessageThread.vue` | Chế độ mobile | Props tùy chọn: `mobile?: boolean`, `draft?: string` + emit `update:draft`, `aiApplyMode?: 'auto' \| 'manual'` (mặc định `auto`), slot `#header-leading`; emit `open-attachment-sheet` (nút + ở mobile thay hàng icon). Desktop không truyền → hành vi cũ |
| C-4 | C | `MessageThread.vue` | Scroll owner (H12) | Thay watcher `:2975-2978` bằng điều kiện near-bottom/self-send + pill "Tin mới ↓"; **chỉ bật khi prop `mobile`** (D-14), desktop giữ hành vi cũ — test khẳng định desktop không đổi |
| C-5 | C | `frontend/src/composables/use-chat.ts` | Không bắt buộc | Chỉ mở nếu cần export `conversationPath`/cờ zalo; hiện không cần |
| D-1 | D | `frontend/src/views/ContactsView.vue` | `onMounted` desktop chạy khi mobile (H22) | Tương tự C-1 (A: tách `DesktopContactsView.vue`; B: guard `if (isMobile.value) return` ở `:1514`) |
| D-2 | D | `views/DashboardView.vue`, `views/AppointmentsView.vue` | Chưa có nhánh mobile (H23) | Thêm `<MobileOverviewView v-if="isMobile"/>` / `<MobileAgendaView v-if="isMobile"/>` và guard onMounted desktop |
| D-3 | D | `views/ContactProfileView.vue` | Hồ sơ mobile | Nhánh `v-if="isMobile"` → `MobileContactProfileView` |
| E-1 | E | `frontend/src/main.ts` | Bật SW (nếu duyệt) | Bỏ comment `:22-27`, thay bằng `import('./pwa/register')` |
| E-2 | E | `frontend/vite.config.ts` | Plugin PWA | Thêm VitePWA với scope `/`, không cache `/api/**`, `/socket.io/**`, media private |
| E-3 | E | `frontend/package.json` | Chỉ nếu phải nâng/thêm `vite-plugin-pwa` hoặc `@playwright/test` | Cần chủ dự án duyệt dependency |
| E-4 | E | `frontend/index.html` | Meta mặc định | `theme-color` `#f7f9fc`, giữ `color-scheme: light only` mặc định; `apple-touch-icon` 180px. **pwa agent sở hữu** (không thuộc lock skill) nhưng orchestrator review |
| QA-1 | B–E | `frontend/vitest.config.ts` | Chỉ nếu muốn thư mục test ngoài `src/` | Không cần nếu dùng `src/__tests__/mobile/**` |

`assets/main.css`, `assets/hs-crm-theme.css`, `stores/auth.ts`, `stores/privacy.ts`, `api/index.ts`, `api/socket.ts`: **không có LOCK REQUEST** trong A–E. Agent phát hiện cần sửa → dừng, ghi LOCK REQUEST mới.

---

## 10. Rủi ro và test bắt buộc

### 10.1 Rủi ro

| Mức | Rủi ro | Nguồn | Giảm thiểu trong contract |
|---|---|---|---|
| Critical | Gửi nhầm khách do nháp không theo conv | H11 | Nháp keyed convId; chụp convId khi gửi; kiểm convId khi áp AI/upload |
| Critical | Tự gửi lại tin offline, trùng/nhầm user | H9 | D-6 giữ tự gửi → rào chắn §3.5 (gắn user, convId chụp sẵn, quá hạn không tự gửi, xóa khi logout) |
| High | Hai instance useChat / reload trang ở mobile | H8 | LOCK C-1 |
| High | Upload nhầm hội thoại khi đổi khách lúc sheet mở | §3.3 | Snapshot convId; sheet tự đóng khi đổi conv; MediaTabPanel đã snapshot |
| High | Quyền: menu hiện mục không được phép hoặc ẩn nhầm | §2.2, §4.3 | Lọc bằng `auth.canAccess`/`canViewReports`; router guard (`router/index.ts:345`) và server vẫn chặn |
| High | Composer bị bàn phím che / double scroll | H4 | Viewport API; một scroll owner |
| High | Theme tối lộ chữ vô hình (input trắng chữ trắng) do CSS global sáng | H1-H3, `hs-crm-theme.css` | meta color-scheme động; QA chụp từng màn tối |
| Medium | Badge gọi `/counts` quá dày (admin) | H17 | Debounce + min interval, không polling nền |
| Medium | Cache: state chat/nháp còn sau logout | H24 | §8; cache use-chat ghi nhận |
| Medium | HEIC/video lớn từ iPhone bị 415/413 | H15 | Validate client, thông báo tiếng Việt |
| Medium | Test reports hiện có fail do bỏ tab Báo cáo | H20 | LOCK B-4 có chủ đích |

### 10.2 Test bắt buộc (vitest, đặt trong `src/`)

| Đợt | Test | Loại |
|---|---|---|
| B | `resolveMobileTab`: `/chat/abc`→chat, `/contacts/1/profile`→contacts, `/reports/ai`→account, `/settings/org/profile`→account, NotFound→null | node |
| B | `useMobileNavItems`: user thiếu `conversation`/`contact` → ẩn mục; admin đủ 5; không còn tab Báo cáo | dom |
| B | Menu Tài khoản: `canViewReports` false → không có Báo cáo; thiếu `settings` → không có Cài đặt tổ chức; hạ quyền runtime → mục biến mất | dom |
| B | `useUiThemeStore`: mặc định light; giá trị lạ → light; `system` theo matchMedia mock; không đọc key `theme` | node/dom |
| B | `useMobileThemeEffects`: đổi meta color-scheme `light only`↔`dark`, `data-theme` trên html, Vuetify name `hsLight`/`hsDark`; unmount khôi phục; reports ép sáng | dom |
| B | `useMobileViewport`: không có visualViewport → `--m-app-height: 100dvh`; mock vv resize → keyboardInset; ref-count gỡ listener khi consumer cuối dispose | dom |
| B | `useMobileWaitingCount`: lỗi API → null (không 0); debounce; logout → null | dom |
| B | Không overflow ngang 320/375/390/393/430; 768 không bị `min-width:1100` ép trong shell mobile; desktop 1440 không đổi (ảnh trước/sau) | browser, ghi rõ Chromium |
| C | Gửi: mock api, gõ ở conv A, đổi sang B → ô soạn B rỗng; gửi ở B → POST đúng `/conversations/B/messages`, payload y hệt desktop | dom |
| C | AI: `applyDraft` không gọi POST messages; nháp có chữ → hỏi xác nhận; đóng sheet giữ nháp; conversationId lệch → bỏ | dom |
| C | Attachment: mỗi kind đúng `accept`/`capture`; file 600MB/HEIC bị từ chối không gọi API; đổi conv khi sheet mở → không upload; FormData field `files` | dom |
| C | Một socket: mount/unmount MobileChatView 3 lần → `createAppSocket` gọi đúng 3, `disconnect` 3; ChatView mobile không tạo instance thứ hai (sau C-1) | dom |
| C | Deep link `/chat/X` cold start → `selectConversation('X')` 1 lần; back không lịch sử → `/chat`; back có lịch sử → `router.back()` | dom |
| C | Offline (§3.5): enqueue gắn userId/orgId; online → flush gửi đúng `conversationId` đã chụp kể cả khi đang mở hội thoại khác; mục của user khác không gửi và bị xóa khi logout; mục > 24h không tự gửi; lỗi giữa chừng dừng, không gửi trùng | dom |
| C | Cuộn (C-4): `mobile` → không kéo đáy khi đang đọc cũ, hiện "Tin mới ↓"; không có prop `mobile` → hành vi desktop y cũ | dom |
| D | Contacts: không gọi API desktop khi mobile (sau D-1); pagination tải tiếp; filter hai pha | dom |
| D | Overview: PrivacySplit không cộng gộp; lỗi section hiện lỗi, không hiện 0 | dom |
| D | Lịch: tạo/sửa giữ `conversationId/source/externalRef`; giờ theo org timezone | dom |
| E | SW không cache `/api/**`, `/socket.io/**`; logout xóa cache phù hợp; update có nháp → hỏi trước khi reload | dom/manual |
| Mọi đợt | `cd frontend && npx vue-tsc -b` và `npx vitest run` pass hoặc ghi baseline lỗi sẵn | CI local |

Kiểm tay bắt buộc trước gate C/E: Safari iPhone thật + Home Screen PWA — bàn phím, xoay ngang, chọn ảnh/chụp/video, back/deep link, khóa máy rồi mở. Chưa có kết quả nào trong đợt A.

---

## 11. Định nghĩa xong mỗi PR

Theo skill §8. Thêm: PR B đính ảnh sáng/tối mỗi màn root; PR C đính bằng chứng mock gửi tin cùng payload desktop; mọi PR ghi rõ "chưa thử iPhone thật" nếu chưa thử.

---

## 12. Quyết định cần chủ dự án duyệt trước đợt B

### 12.1 Kết quả duyệt (chủ dự án, 07/11/2026)

| ID | Kết quả |
|---|---|
| D-1 | **Duyệt** — bỏ hẳn TikTok, nhãn "Nick Zalo" |
| D-2 | **Duyệt** — mặc định Sáng |
| D-3 | **Duyệt** — Tối chỉ áp cho mobile; desktop và Báo cáo giữ Sáng |
| D-4 | **Duyệt** — người phụ trách + "+N" khi có người cùng chăm |
| D-5 | **Duyệt** — mobile không reload |
| D-6 | **Khác đề xuất** — GIỮ tự gửi lại khi có mạng trên mobile; áp rào chắn §3.5 |
| D-7 | **Duyệt** — nháp chỉ RAM |
| D-8 | **Duyệt** — mở danh sách thông báo trong app |
| D-9 | **Duyệt** — 1 video/lần |
| D-10 | **Duyệt** — iOS 16.4+ |
| D-11 | **Duyệt** |
| D-12 | **Duyệt** — phương án A |
| D-13 | **Duyệt** — test trong `src/__tests__/mobile/**`. **Thêm `@playwright/test` ^1.65.0** (devDependency, duyệt 07/11/2026) — orchestrator đã cài + trình duyệt WebKit 27.2 / Chromium 158 (ngoài repo, `%LOCALAPPDATA%\ms-playwright`). E2E đặt ở `frontend/e2e/**` (QA sở hữu), không nằm trong `vitest` include |
| D-14 | **Chỉ mobile** — C-4 bật qua prop `mobile`, desktop giữ nguyên |

### 12.2 Bảng đề xuất gốc

| ID | Câu hỏi | Đề xuất của architect |
|---|---|---|
| D-1 | Mục "Nick Zalo/TikTok": code không còn kênh TikTok (H18), ghi nhớ dự án nói TikTok đã loại khỏi phạm vi | Nhãn **"Nick Zalo"**; nhãn kênh lấy từ registry kênh đang bật (hiện: Zalo, Kênh thử nghiệm chỉ dev/test). Bỏ fixture TikTok khỏi preview ở lần sửa preview sau |
| D-2 | Mặc định giao diện cho người dùng mới: Sáng hay Theo máy | **Sáng** (an toàn với CSS global sáng, user tự bật Tối) |
| D-3 | Tối có áp cho desktop và màn Báo cáo không | Pilot: **chỉ mobile shell**, Báo cáo giữ Sáng; desktop giữ `DefaultLayout.vue:266` |
| D-4 | "Người phụ trách" khi nhiều người cùng chăm | Hiện `contact.assignedUser`; có cùng chăm thì thêm "+N" (dữ liệu `cungChamCount` trong MessageThread), không suy từ người gửi cuối |
| D-5 | Mở hội thoại thuộc nick ngoài phạm vi xem trên mobile | Mobile **không reload**; mở thread bình thường (server đã kiểm quyền), không đổi work-scope |
| D-6 | Hàng đợi offline hiện tự gửi lại khi có mạng (H9) | **Tắt enqueue/flush tự động trên mobile**: offline thì khóa nút gửi, giữ nháp; tin đã nằm trong queue cũ hiển thị "Chưa gửi" với nút Gửi lại/Xóa thủ công; xóa queue khi logout/đổi user. Đây là thay đổi điều kiện gửi tin → cần duyệt rõ |
| D-7 | Nháp lưu đâu | Chỉ RAM theo convId; mất khi tải lại/đóng app; có cảnh báo `beforeunload` nếu còn nháp |
| D-8 | Mục "Thông báo" khi trang cài đặt đang "coming soon" | Mở danh sách thông báo trong app (NotificationBell); ghi "Cài đặt thông báo: sắp có" |
| D-9 | Video chọn 1 hay nhiều | 1 video/lần (tránh 500MB × n trong RAM trình duyệt) |
| D-10 | iOS tối thiểu | iOS **16.4+** (dvh, VisualViewport ổn định, Web Push nếu sau này cần); dưới đó chỉ fallback, không cam kết |
| D-11 | Badge đếm gì, phạm vi nào | `unreplied` theo phạm vi nick được xem; admin thấy toàn org (giữ đúng nghĩa server). Nếu muốn "của tôi" cần API khác → ngoài phạm vi |
| D-12 | Tách `ChatView`/`ContactsView` (LOCK C-1/D-1) phương án A hay B | **A** (tách file wrapper, không đổi logic) |
| D-13 | Test thư mục | Test mobile ở `frontend/src/__tests__/mobile/**` và cạnh file; không thêm Playwright trừ khi duyệt dependency |
| D-14 | Thay đổi chung cho desktop ở C-4 (scroll) | Chấp nhận áp cho cả desktop kèm ảnh trước/sau, hoặc chỉ bật khi `mobile` |
