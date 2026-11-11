# Desktop → Mobile: khoảng trống và vị trí đề xuất

07/11/2026. Kiểm tra source tĩnh tại workspace hiện tại, không kiểm tra quyền hoặc API live. Bảng này phân biệt **đã thấy trong source** với chức năng đã chạy thật. V3 là thiết kế, không giải quyết parity bằng thay code.

| Khả năng / bằng chứng | V3 hiện có | Chỗ đề xuất khi code | Điều kiện / khoảng trống |
|---|---|---|---|
| Inbox search, account filter, load-more — ConversationList/MobileChatView | Search + chip/sheet | Toolbar và cuối danh sách | Nối pagination, giữ scroll/query; V3 chỉ có 5 fixture |
| Triage/tags, pin/context menu, group, cùng chăm, theo dõi, engagement — ConversationList | Chưa dựng đủ | Chip “Bộ lọc” + action sheet từng row | Gesture là lối tắt; phải có nút thao tác có nhãn, giữ privacy và cùng chăm |
| Bắt đầu chat / chọn nick — NickPickerPopup trong ConversationList | Chưa có form tạo hội thoại | Nút “Tin nhắn mới” trong inbox → picker nick | Giữ điều kiện số/capability/canInitiate; không tự chọn nick đầu |
| Chuyển nick chăm cùng khách — MessageThread header `onPickNick` | V3 giữ context; profile→thread map 1:1 | Chạm context nick → picker nick/conversation | Thử ca 1 khách nhiều conv trước code; preserve draft theo conv |
| Reply/edit/mentions/rich formatting/templates/blocks/sticker — MessageThread composer | Chỉ text/AI/attachment | Nút + → công cụ; reply preview trên composer; action menu bubble | Không bỏ reply IDs, style ranges, mentions hay policy gửi hiện hữu |
| Media image/video/file/album, reaction và reaction detail, jump-to-reply — MessageThread | Ảnh/file giả mở viewer placeholder | Viewer fullscreen + action sheet bubble + nút reply/reaction | Dùng renderer/parser cũ; video caption, private URL, album selection/download cần kiểm thử riêng |
| AI ask/apply, auto-reply toggle, summary và thiết lập — MessageThread/V2 ai-controls | Sheet gợi ý + nguồn mẫu, applyDraft | AI composer; thiết lập theo hội thoại ở header ⋯; cấu hình chung ở Thêm→Cài đặt | MobileChatView đang truyền AI null/false. Không đổi auto policy để khớp mock; nguồn thật phải xác minh |
| Privacy, nick archived và virtual conversation — MessageThread | Chưa có fixture riêng | Banner read-only/“Nội bộ” + field redaction + disable send | Không để nhãn “đã gửi Zalo” cho virtual; nick archived chỉ đọc |
| Friendship invite/accept/reject/remove/cancel — MessageThread | Chưa có | Hồ sơ→Quan hệ Zalo / header actions | Theo quyền; destructive confirm; source UI không chứng minh API hoạt động |
| Liên kết khách cha, trạng thái deal, nhãn Zalo/CRM, phân công/cùng chăm — MessageThread & Contact types | Status/tag/info đơn giản; sheet vị trí | Hồ sơ→Thông tin / Quan hệ / ⋯ | Giữ parent-child identity và policy quyền; không flatten contact cha/con |
| Hồ sơ nhiều field, nhiều số, consent, địa chỉ, điểm lead, aggregate tương tác — use-contacts/ContactDetailDialog | Bộ field chính + note/timeline mẫu | Accordion hồ sơ + form sửa fullscreen | Timeline mẫu không đủ thay activity log; sửa note hiện chỉ minh họa vị trí |
| Tạo/sửa/xóa/import/export/bulk contacts, pagination — useContacts & desktop view | Card/search/filter | Header “Thêm khách”; ⋯→tác vụ nâng cao; cuối list tải tiếp | Bulk chọn rõ, confirm xóa; import/export form riêng, không giả đã có trên V3 |
| Dashboard team/system, view-as, lead pool, follow sessions, reminders/scores/quota — DashboardView/action hub | Việc tôi + KPI nhỏ | Scope sheet cho quản lý; Thêm→Báo cáo; section thu gọn Tổng quan | Giữ PrivacySplit, không dùng tổng để lộ private; urgent owner không có trực tiếp trên DTO đã đọc |
| Agenda date/status/type/owner/source filters, week view — AppointmentsView | Agenda theo ngày, prev/next/today | Bộ lọc sheet; tuần chỉ chọn khi đủ diện tích | Không co calendar desktop vào phone; timezone lấy org setting khi code |
| Appointment update/cancel/no_show/delete, external Zalo reminder — use-appointments | Tạo mẫu + toggle hoàn thành | Chi tiết lịch full screen → trạng thái và ⋯ | V3 chưa dựng mọi trạng thái/validation lỗi. Giữ `conversationId`, `source`, `externalRef`; xác nhận thao tác phá hủy |
| CSV export — AppointmentsView có button chưa gắn action tại vị trí đã đọc | Không quảng bá | Agenda→⋯ sau khi xác minh | Phân biệt nút desktop có mặt với chức năng đã implement |
| Reports: overview/nick/sale/pipeline/engagement/audit/broadcast/automation/AI — router | Điểm vào Báo cáo | Thêm→Báo cáo → menu con responsive | Dùng report access guard thực tế; không phải mọi sale xem mọi báo cáo |
| Media/marketing/settings/users/roles/integrations — router/settings registry | Menu Thêm + ghi chú ẩn theo quyền | Thêm→nhóm được phép → child full width | Không tạo module Đơn hàng; placeholder desktop tiếp tục nhãn chưa khả dụng |
| NotificationBell, profile/logout/session | Menu mẫu; logout confirm không gọi auth | Header root hoặc Thêm→Thông báo/Tài khoản | Chưa dựng notification sheet trong vòng này; logout thật qua auth hiện hữu |
| Deep link/back/router lifecycle/socket/offline queue — MobileChatView/MobileLayout | Query link và nút back local; giữ nháp RAM | Route adapter + shared controller + viewport adapter | Source có enqueue/flush khi online; chưa audit độ bền/idempotency. V3 không hứa tự gửi và không thay logic này |
| Tin gửi pending/failed/unknown/delivered/seen | Text “Đã gửi”, “Đã nhận” trên fixture và “Chưa gửi thật” cho thao tác mẫu | SendState dưới bubble + retry có kiểm tra | Cần đủ fixture trạng thái gửi khi code; không tự retry UNKNOWN vì nguy cơ trùng |

## Những việc cần xác nhận trước implementation

1. TikTok: user yêu cầu thiết kế, source type còn capability nhưng có tài liệu removal trong repo. Chủ dự án xác nhận edition/kênh thực tế; không đọc hay gọi tài khoản TikTok thật trong lượt này.
2. Owner context trên dashboard/inbox: resolver nào là chuẩn khi một khách có nhiều người cùng chăm? Không gán owner theo last sender.
3. AI sources/timeline: lấy từ endpoint/adapter hiện hữu nào, quyền xem nguồn ra sao? Thiếu contract thì ẩn phần chưa có thay vì tự tạo dữ liệu.
4. Phạm vi mobile cho bulk/import/export và quản trị: hỗ trợ trực tiếp hay chuyển sang desktop có thông báo rõ? Bảng đề xuất chưa đồng nghĩa được phép bỏ parity.
5. PWA/keyboard/scroll anchor trên iPhone thật là gate sau thiết kế, không thể đóng bằng ảnh Chrome.
