# 05 — Đề xuất giao diện iPhone

Ngày: 29/10/2026. Đây là thiết kế đề xuất trên code local, chưa triển khai. Không đổi API/auth/quyền hay logic gửi tin. Các số KPI và tên trong wireframe là dữ liệu giả, không phải dữ liệu vận hành.

**Prototype tương tác độc lập:** [iphone-prototype.html](iphone-prototype.html). Bố cục 390×844, có các tab Tổng quan → Hội thoại → Khách hàng → Lịch hẹn → Thêm; mở thread, quay lại, xem hồ sơ, sheet AI giả và chèn draft/tin mô phỏng. Chỉ dùng HTML/CSS/JS với dữ liệu giả, không dependency/network/API và không import code ứng dụng. Đây là minh họa thiết kế, không chứng minh các luồng production đã hoạt động.

## Phương án chủ đạo

Giữ shell desktop và shell mobile riêng như `App.vue:26` hiện có, nhưng dùng chung composables/API và hợp đồng sự kiện. Chat, contacts và settings có presenter mobile riêng; các màn khác dùng adaptive component khi đủ đơn giản. Không fork toàn bộ business logic. Giữ route canonical hiện có để link ngoài, thông báo và desktop/mobile mở cùng tài nguyên.

Chat là điểm bắt đầu. Bottom tabs đề xuất: **Hội thoại · Khách hàng · Lịch hẹn · Tổng quan · Thêm** (lọc theo quyền). Không thêm Đơn hàng: chưa xác minh được route/module này trong router local. Ở thread, ẩn bottom tabs để dành diện tích composer; nút back trở về inbox giữ search/filter/scroll.

## 1. Inbox hội thoại — ưu tiên số 1

**Mục đích:** nhận diện tin cần xử lý và vào đúng hội thoại bằng một tay.

```text
┌─────────────────────────────────┐
│ Hội thoại              🔔   ⋯  │
│ [⌕ Tìm tên, nội dung…         ] │
│ [Tất cả] [Chưa đọc] [Chưa trả lời]│
│ Nick: Tất cả                 ▾ │
├─────────────────────────────────┤
│ (AN) Anh Nam            10:42 ② │
│      Cho tôi xin thông tin…     │
│      Sale A • Nick B            │
│ (HL) Chị Lan              09:12 │
│      Bạn: Em đã nhận được…      │
│ [ Đang tải thêm / Thử lại ]     │
├─────────────────────────────────┤
│ Chat  KH  Lịch  Tổng quan  Thêm │
└─────────────────────────────────┘
```

- **Components:** MobilePageHeader, SearchField, FilterChips, AccountPickerSheet, ConversationRow, ListState, MobileBottomNav.
- **States:** skeleton rows lúc tải đầu; empty có lý do theo filter; error giữ list cũ và Retry; reconnect banner khi socket mất; loading-more riêng không che list.
- **Interaction/navigation:** tap row → `/chat/:convId`; active filter có nhãn và clear; không yêu cầu swipe mới tìm được chức năng. Back giữ state/scroll; dùng route group để xác định tab.
- **Reuse:** `ConversationList.vue`, `use-chat.ts` (fetch/load-more/search/account filter, socket); quyền và account scope hiện có. Những filter chưa có backend contract không tự tạo bằng dữ liệu đoán.
- **Frontend change:** rút row presenter mobile, nối đúng route selection trong `MobileChatView.vue`, giữ logic fetch/socket dùng chung, tránh duplicate socket listeners.
- **Risk:** list realtime đổi thứ tự khi sale đang chọn; nhảy scroll khi refresh. Giữ anchor và chỉ báo có dữ liệu mới khi cần.

## 2. Thread chat — ưu tiên số 1 cùng inbox

**Mục đích:** đọc, trả lời và tham khảo AI/hồ sơ mà không rời ngữ cảnh.

```text
┌─────────────────────────────────┐
│ ‹  (AN) Anh Nam              ⋯ │
│       Nick B • Đang kết nối     │
├─────────────────────────────────┤
│          Hôm nay               │
│ [Cho tôi xin thông tin…]        │
│        [Em gửi anh tài liệu…]   │
│ [Ảnh/tệp • chạm để mở]         │
│                       [↓ 2 mới]│
├─────────────────────────────────┤
│ Trả lời: …                  × │
│ [+] [Nhập tin nhắn…       ] [↑]│
│                  home inset    │
└─────────────────────────────────┘
```

- **Components:** ThreadHeader, MessageList/MessageBubble, AttachmentPreview, Composer, ReplyPreview, SendState, MoreActionsSheet, AISuggestionSheet, CustomerSummarySheet.
- **States:** loading messages không xóa header; conversation unavailable/forbidden có back; sending khóa đúng nút; failed/unknown phân biệt, không gán sent giả; không mạng báo giới hạn rõ; empty mời bắt đầu chỉ nếu được quyền gửi.
- **Interaction:** tap tên mở hồ sơ; ⋯ mở actions được quyền; + mở attachment sheet; AI mở sheet và chọn áp dụng vào draft, không thay auto-send policy. Khi đọc lịch sử chỉ hiện “tin mới”; gửi từ chính người dùng thì cuộn đáy. Input focus do người dùng; khi bàn phím mở composer bám vùng nhìn thấy, header còn truy cập được.
- **Navigation:** canonical `/chat/:convId`, back về `/chat`, mở contact rồi back giữ draft. Refresh/deep link phải fetch đúng conv; không chỉ dựa selectedConvId trong RAM.
- **Reuse:** MessageThread renderer/media/privacy, `use-chat` send/reply/AI/socket, API client và permission checks. Lập bảng event parity với desktop trước đổi wrapper vì mobile hiện truyền aiSuggestion=null (`MobileChatView.vue:40`).
- **Frontend change:** tách view thread khỏi global shell chrome trên mobile; adapter props/events dùng chung; keyboard/scroll controller riêng có cleanup; chỉ một scroll owner. Không sửa send service/backend.
- **Risk:** MessageThread rất lớn, thay CSS chung dễ làm hỏng desktop. Thay component theo từng presenter nhỏ, namespace style mobile; regression rich text, mentions, privacy, attachments, reply và realtime.

### Hành vi AI chi tiết

Sheet có tiêu đề “Gợi ý trả lời”, văn bản draft, nguồn nếu contract có, loading/cancel/error/retry, nút “Đưa vào ô nhập”. Cho phép đóng mà không mất draft. Tóm tắt là màn/section riêng. Không đổi cờ full-auto trên mobile chỉ để làm giao diện đơn giản hơn; mọi quyền giữ nguyên.

## 3. Danh sách khách hàng

**Mục đích:** tìm khách và mở hồ sơ nhanh.

```text
│ Khách hàng                  ＋ │
│ [⌕ Tên hoặc số điện thoại    ] │
│ [Trạng thái ▾] [Bộ lọc • 2]    │
│ (AN) Anh Nam     [Quan tâm]    │
│      09•••••••• · Sale A       │
│      Liên hệ cuối: …           │
│ [Tải tiếp]                     │
```

- **Components:** CustomerCard, SearchField, FilterSheet, PagingState, CreateCustomerFullScreenForm.
- **States:** skeleton, no results có clear filters, error + Retry, pagination loading, no access. Đừng để empty thay thông báo lỗi mạng.
- **Interaction/navigation:** tap card → profile hiện có; tap + mở form đúng quyền; phone action chỉ khi được phép; filter apply/reset rõ. Không thêm order summary khi chưa có dữ liệu.
- **Reuse:** `MobileContactView.vue`, `use-contacts.ts:432` contacts/total/pagination/fetch/save; `ContactDetailDialog.vue` field/schema/event.
- **Change:** nối pagination/total hiện wrapper bỏ qua; detail fullscreen mobile; thay FAB bằng header action hoặc thêm inset chuẩn.
- **Risk:** chỉ xem trang đầu, field/permission khác desktop, validate không đồng nhất. Dùng chung form schema, không copy luật bắt buộc.

## 4. Hồ sơ khách hàng

**Mục đích:** xem đúng thông tin và cập nhật trạng thái chăm sóc.

```text
│ ‹ Khách hàng           Sửa    │
│ (AN) Anh Nam                  │
│ [Nhắn tin] [Lịch hẹn]         │
│ [Thông tin] [Hoạt động]        │
│ Trạng thái: Quan tâm          │
│ Sale phụ trách: …             │
│ Ghi chú / Tags / Lịch sử       │
```

- **Components:** ProfileHeader, QuickActions, SectionsAccordion, ActivityTimeline, EditForm.
- **States:** loading, missing/forbidden record, stale/offline read-only, save pending/error; dirty form có xác nhận thoát.
- **Actions/nav:** quick chat đi qua account/conversation mapping hiện có, không tự chọn nhầm nick; lịch hẹn dùng action contract hiện hành; back phục hồi list hoặc thread.
- **Reuse:** ContactDetailDialog, ContactProfileView và CustomerActivityLogView theo mức hoàn thiện thực tế; route profile còn skeleton không được trình bày là đã đủ.
- **Change:** mobile presenter theo section thay dialog 980px; preserve all permitted fields/actions.
- **Risk:** nhầm contact cha/con hoặc privacy; cần fixture nhiều nick chăm cùng khách và giới hạn scope.

## 5. Tổng quan

**Mục đích:** xem việc cần làm, không đọc báo cáo nhiều cột.

```text
│ Tổng quan                 🔔 │
│ Hôm nay • Phạm vi của tôi ▾   │
│ [Chưa trả lời] [Lịch hẹn]     │
│ [KH mới]       [KPI hiện có]  │
│ Cần xử lý                    │
│ • Anh Nam — chờ phản hồi      │
│ Lịch sắp tới                 │
│ Biểu đồ gọn (nếu có dữ liệu)  │
```

- **Components:** ScopePicker, KPICard, UrgentConversationRow, UpcomingAppointmentRow, CompactChart.
- **States:** skeleton từng section, metric thiếu khác 0, error section + Retry; phạm vi không được quyền không hiện.
- **Interaction/nav:** KPI → list đã lọc nếu route hỗ trợ; mở item tới chat/lịch canonical. Không tự thêm doanh thu/đơn hàng.
- **Reuse:** DashboardView API/computed/scope/KPI; tái bố trí card, giữ công thức và payload.
- **Change:** single column section, 2 KPI/cột; không dùng grid 3 cột nhỏ và nested scroll desktop.
- **Risk:** khác nghĩa scope giữa dashboard và list, drill-down bỏ filter; test cùng dữ liệu desktop.

## 6. Lịch hẹn

**Mục đích:** tìm việc hôm nay và đổi trạng thái hẹn.

```text
│ Lịch hẹn                  ＋ │
│ ‹  Hôm nay · 29/10/2026    › │
│ [Hôm nay] [Sắp tới] [Bộ lọc] │
│ 09:00 — Gọi khách giả lập A   │
│ [Chi tiết / đổi trạng thái]   │
```

- **Components:** DateStrip, AppointmentCard, FilterSheet, AppointmentForm.
- **States:** loading/empty/error/permission/save failure; trạng thái cập nhật giữ loading đúng item.
- **Actions/nav:** tap card fullscreen detail; tạo/sửa bằng form hiện có; đổi ngày không reset filter ngoài ý muốn.
- **Reuse:** AppointmentsView date/filter/status logic và các breakpoint đã có (`:776`, `:803`).
- **Change:** default agenda list trên phone, calendar là tùy chọn; drawer desktop thành sheet.
- **Risk:** lệch UTC/giờ Việt, form validation, hủy nhầm; regression không đổi API date semantics.

## 7. Thêm, cài đặt và nhân viên/quyền

**Mục đích:** truy cập tính năng ít dùng mà không chiếm tab chính.

```text
│ Thêm                         │
│ Tài khoản của tôi          › │
│ Báo cáo / Media / Marketing ›│
│ Cài đặt (theo quyền)       › │
│ Nhân viên / Quyền         › │
│ Giao diện / Đăng xuất        │
```

- **Components:** MenuSection, SettingsGroupList, SettingDetailPage, EmployeeCard, PermissionSummary.
- **States:** danh sách dựa grants, empty nếu không có mục; loading/forbidden/error ở child. Coming-soon ghi rõ, không giả nút hoạt động.
- **Actions/nav:** vào settings group → child full width; quay lại giữ group; nhân viên card → detail; ma trận nâng cao có hướng dẫn/scroll region rõ, không tự xóa cột quyền.
- **Reuse:** router meta/resource, settings menu registry, users/roles logic; giữ auth/logout/session.
- **Change:** mobile presenter thay grid 260px; tránh tạo menu registry mới lệch desktop; không đặt token/API key trên menu tóm tắt.
- **Risk:** ẩn nhầm quyền hoặc lộ menu/trường nhạy cảm; backend authorization vẫn quyết định cuối.

## 8. Thông báo và tìm kiếm/bộ lọc

**Mục đích:** đi tới tài nguyên và lọc bằng touch, có thể dismiss dễ dàng.

```text
│ Thông báo                  × │
│ • Tin mới …              ›   │
│ • Lịch hẹn …             ›   │
│ Đã hết thông báo              │
```

- **Components:** NotificationSheet, NotificationRow, FilterSheet với header/cancel/apply sticky trong sheet.
- **States:** empty khác lỗi tải, reconnect, quyền bị thu hồi khi mở; filter pending state chưa áp dụng khác filter đang dùng.
- **Actions/nav:** tap notification đóng overlay rồi mở canonical route; back đóng sheet trước đổi route. Search debounce như hiện có, cancel request/ignore stale result nếu contract hỗ trợ.
- **Reuse:** NotificationBell handleClick/store/API; từng view filter state hiện có.
- **Change:** sheet/fullscreen mobile thay popover gần cạnh màn hình; focus return và VoiceOver labels.
- **Risk:** overlay giữ scroll lock sau đóng hoặc menu z-index nuốt touch; test chuỗi mở/đóng nhiều overlay.

## 9. Login và trạng thái phiên

**Mục đích:** đăng nhập ổn định Safari/PWA và trở lại công việc.

```text
│ Cờ Rếp Việt                 │
│ Đăng nhập                   │
│ [Email/Số điện thoại       ] │
│ [Mật khẩu                ◉] │
│ [          Đăng nhập       ] │
│ Lỗi/Thông báo phiên          │
```

- **Components:** auth form hiện có, inline errors, session expired notice, input autocomplete thích hợp.
- **States:** idle/loading/error/network/session expired; submit disabled chỉ khi đang gửi, không xóa giá trị do lỗi mạng.
- **Actions/nav:** return-to path phải qua auth/router hiện hữu; không thay token persistence. Force-change-password/setup giữ flow tương đương desktop.
- **Reuse:** LoginView/AuthLayout/auth store/API refresh; `LoginView.vue:191` đã có layout cột cho mobile.
- **Change:** ưu tiên form, icon decoration giảm ở phone, scroll được khi keyboard mở, text field 16 CSS px theo design system sau test.
- **Risk:** không thể xem mock screenshot như bằng chứng login/session thật; test Safari và PWA riêng.

## Trạng thái overlay và tiêu chí nghiệm thu chung

- Bottom sheet cho bộ lọc/action ngắn; fullscreen cho form dài, hồ sơ và AI dài. Mỗi overlay có title, close/back, initial focus, focus return và keyboard escape nơi áp dụng.
- Không dựa hover/contextmenu cho chức năng duy nhất; giữ action menu có label. Swipe chỉ là lối tắt tùy chọn.
- Không thêm offline auto-send trong dự án UI này; hàng đợi offline đang có cần giữ chính sách được kiểm tra, không tự replay khi resume nếu chưa chứng minh chống trùng.
- Loading/empty/error/forbidden/offline phải có fixture riêng; check 320–430px và 768, desktop baseline. Thông số computed touch target, overflow, scroll anchor được đo; bàn phím/safe-area/standalone kiểm trên iPhone thật.
- Thành công: toàn bộ luồng nghiệp vụ được phép như desktop còn truy cập được, mở đúng deep link, composer không bị che, back giữ draft/list state, không có lặp listener/socket và CSS desktop không đổi ngoài phạm vi được duyệt.

## Kiểm tra prototype bổ sung

Đã xem prototype trong Chromium desktop viewport 430×960 và kiểm tra inbox → thread, AI mẫu → draft, back, các tab Tổng quan/Khách hàng/Lịch hẹn. Ảnh ở evidence/prototype-inbox.png và evidence/prototype-thread.png. Toàn bộ là dữ liệu và tương tác mô phỏng, không gọi API hoặc gửi tin thật. Chưa kiểm tra accessibility đầy đủ, keyboard hay iPhone thật; widget tím trong screenshot là browser extension. Màu chính prototype đã được đồng bộ với brand xanh trong tài liệu 04.

