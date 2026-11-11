# DEV F4 report — nháp desktop theo conversationId (RAM)

Worktree F:/ZaloCRM-wt/ext, branch mobile/ext, HEAD 68edf81. Không commit/push/deploy. MessageThread.vue KHÔNG sửa.

## Triển khai
- **Mới** `frontend/src/composables/use-desktop-chat-drafts.ts`: store RAM `Map<convId, doc>` + `Map<convId, {replyingTo, editingMessage}>`, lưu bản sao JSON (bất biến). Singleton `useDesktopChatDrafts()` nghe `crm:mobile-session-reset` (PwaRuntime global phát khi logout/đổi user/đổi org, kể cả desktop) -> `clearAll()`. Export `DESKTOP_DRAFT_KEY` (InjectionKey) cho cầu nối provide/inject.
- `rich-text-editor.vue`: `inject(DESKTOP_DRAFT_KEY, null)`. Không có provider (mobile, BlockEditor) = hành vi y cũ. Có provider: mỗi thay đổi (onUpdate, watch modelValue/setContent, applyRichPayload) lưu **JSON Tiptap nguyên bản** (mark, list, mention, zaloColor/zaloSize) theo conversationId hiện tại; rỗng/chỉ khoảng trắng = xóa nháp. Đổi conversationId -> nạp nháp mới hoặc ô trống bằng `setContent(..., {emitUpdate:false})` (không phát `typing`), rồi emit `update:modelValue` (chữ thuần) để `inputText` của MessageThread đồng bộ. Expose thêm `getDraftDocument()` / `setDraftDocument(doc|null)`. Payload gửi (`getRichPayload`, `handleSend`) không đổi.
- `DesktopChatView.vue`: `provide(DESKTOP_DRAFT_KEY, {conversationId: selectedConv.id, ...})`; watch id hội thoại: lưu ngữ cảnh reply/edit của hội thoại cũ, nạp của hội thoại mới (gán thẳng `replyingTo`/`editingMessage` của useChatOperations). Khóa dùng `selectedConv.id` (cùng prop `conversation` của MessageThread, tránh lệch với selectedConvId).
- Gửi ở B: `handleSend` -> `editorRef.clear()` -> onUpdate lưu null cho B; `cancel-reply-edit` xóa ngữ cảnh B. Nháp/ngữ cảnh A không đụng.
- AI gợi ý, đính kèm, phím tắt `/`, AI Format, mobile: không đổi (mobile không có provider; MobileChatView không đụng).

## Test (chỉ chạy file liên quan, không full suite/build)
- `src/composables/use-desktop-chat-drafts.dom.spec.ts` (6): độc lập A/B, null xóa, bản sao bất biến, giữ mark+mention+list, ngữ cảnh reply/edit, reset event.
- `src/components/chat/rich-text-editor.draft.dom.spec.ts` (4, Tiptap thật): A->B trống, B->A khôi phục text/styles/mentions/bulletList; clear ở B không xóa A; khôi phục không phát `typing`; không provider = cũ.
- Kết quả: 10/10 pass; chạy thêm `message-thread-mobile.dom.spec.ts` + `src/components/chat` = 32 pass. `vue-tsc -b`: không lỗi ở file đã sửa (lọc theo tên file).

## Lock cần (F4-LOCK): KHÔNG BẮT BUỘC
Không cần vá MessageThread.vue. Lưu ý (không thuộc F4, không sửa): MessageThread `onEdit` set `inputText = content` gốc; nháp edit đã lưu được phục hồi qua editor nên không bị đè. Tôi không tạo file F4-LOCK.md vì không có patch.

## Giới hạn / chưa kiểm
- Chưa chạy E2E/trình duyệt thật; chưa kiểm hành vi focus caret sau khi khôi phục.
- Gợi ý AI về trễ cho hội thoại cũ vẫn tự điền vào ô của hội thoại đang mở (hành vi có sẵn, không đổi) — nó sẽ được lưu vào nháp của hội thoại đang mở.
- `PwaRuntime.blocked` chỉ soi DOM composer đang hiển thị, không biết nháp A đang nằm RAM khi xem B (liên quan chặn cleanup storage; main cân nhắc dùng `useDesktopChatDrafts().hasAnyDraft()`).
- selectedConv chớp null rồi quay lại cùng id sẽ xóa/nạp lại ô (nội dung vẫn đúng nhờ nháp lưu từng thay đổi).

Main bổ sung opt-in composer duy nhất theo LOCK-APPLIED; reviewer cần soát delta này.
