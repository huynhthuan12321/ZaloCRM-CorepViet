# LOCK REQUEST / APPLIED — F4 + F6, 10/11/2026

Main áp dụng shared-file `frontend/src/components/chat/MessageThread.vue`: thêm duy nhất prop `:conversation-draft="!mobile"` vào RichTextEditor chính. Lý do: opt-in riêng composer desktop; editor phụ ở dialog/kho khối dù nhận provide của DesktopChatView cũng không ghi đè nháp. Không đổi handleSend, payload, watcher AI, attachment hay shortcut.

Các file dùng chung liên quan: DesktopChatView cung cấp khóa conversation; rich-text-editor opt-in lưu tài liệu JSON trong RAM; use-contacts/use-contact-profile giữ status lỗi; use-appointments giữ thông báo lưu. Tất cả được giao rõ trong F4/F6; không đổi API/backend/auth/socket/dependency/CSS.

Sau reviewer: MessageThread thêm key theo conversation.id (desktop; key mobile cố định), chống watcher cũ ghi nháp sang B. rich-text-editor chốt mountedDraftId và nạp cả nháp null lúc mount. Session revision dọn editor/reply/edit đang mở. PwaRuntime chỉ thêm kiểm tra nháp desktop RAM vào guard update đã có, tránh update khi A còn nháp dù B trống. useDesktopChatDrafts dùng reactive Map để guard phản ứng; không thay cache/SW/auth.
