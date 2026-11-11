# Reviewer-1: F4 (nháp desktop) + F6 (lỗi 403/404, lịch trùng) — HEAD 68edf81 + working tree
Chế độ đọc-only; không sửa/commit. Đã chạy 5 spec nhắm đích: 29/29 pass (rich-text-editor.draft, use-desktop-chat-drafts, use-contact-errors, crm-request-errors, use-mobile-agenda). Chưa chạy vue-tsc/full suite/E2E.

## Findings
### M1 (Medium) F6 — trạng thái lỗi cũ rò sang lần tải sau, hồ sơ mobile hiện "không tồn tại" dù tải được
`composables/use-contacts.ts` ~373-381: `contactErrorStatus` chỉ reset ở ĐẦU fetchContact, không có generation, và là ref theo instance.
`use-mobile-contact-detail.ts:70` đọc `contacts.contactErrorStatus.value ?? profileApi.errorStatus.value` SAU await.
Repro: mở khách A (request chậm, sắp 404) → đổi nhanh sang khách B (load #2 reset status=null, đang bay) → request A về 404 ghi status=404 → B thành công `c` có dữ liệu nhưng `readStatus===404` → `state='missing'`, contact=null. Điều kiện `!c || readStatus===403||404` chính là chỗ nhận nhầm. (Gen-guard `gen!==generation` chỉ chặn load cũ, không chặn việc request cũ ghi vào ref dùng chung.) Gợi ý: để fetchContact trả/ghi status theo lần gọi (hoặc chỉ tin status khi `!c`), hoặc gen-guard trong fetchContact. Không có test cho nhánh 403/404 của use-mobile-contact-detail → nên thêm.

### L1 (Low) F4 — race hẹp: watcher modelValue ghi nháp dưới id MỚI với nội dung CŨ
`rich-text-editor.vue:~519` `persistDraft()` trong watch(props.modelValue) đọc `draftBinding.conversationId` hiện tại. Nếu cùng một tick: inputText bị đổi từ ngoài (applySuggestion/`?draft=` query/onEdit) VÀ selectedConv đổi A→B, watcher modelValue (setContent) có thể chạy trước watcher conversationId → nội dung của A bị lưu làm nháp của B, rồi restoreDraft(B) nạp lại chính nó. Chưa có repro thật (thứ tự flush giữa watcher cha/con cần QA). Khuyến nghị: QA tay "AI gợi ý/`?draft=` + đổi hội thoại ngay"; giải pháp: chốt `lastRestoredId` và bỏ persist khi id !== id của nội dung đã nạp.

### L2 (Low) F4 — session-reset chỉ dọn Map, không dọn editor/reply đang mở
`use-desktop-chat-drafts.ts` clearAll() không đụng ô soạn đang hiển thị, replyingTo/editingMessage (module singleton ở use-chat-operations.ts:10-11). Nếu đổi user/org mà DesktopChatView không unmount, chữ đang gõ vẫn còn và lần gõ kế sẽ lưu lại vào RAM. Thực tế logout thường unmount/điều hướng → rủi ro thấp; cần QA "đổi user/org không reload".

### L3 (Low/ghi chú) F4 — gửi thất bại mất nháp
handleSend (MessageThread.vue:2938-2960) đồng bộ clear editor → persistDraft xóa nháp trước khi biết gửi thành công. Hành vi này đã có trước F4 (ô vốn bị xóa); F4 không tệ hơn, nhưng nháp RAM không là "lưới an toàn" khi gửi lỗi. Không chặn.

### L4 (Low) F6 — hồ sơ khách desktop vs 404 profile
use-mobile-contact-detail: profile 404/403 với contact đã tải được giờ ẩn cả hồ sơ (trước đây vẫn hiện contact). Chấp nhận nếu coi profile là bắt buộc; ghi vào QA.

## PASS (giới hạn theo đọc source + test nhắm đích)
- A→B→A: setDraftDocument dùng JSON Tiptap (không so chuỗi) nên cùng plain text khác mark vẫn khôi phục đúng; emit update:modelValue cùng text → watcher modelValue so sánh bằng nhau, bỏ qua, không setContent đè mark. Tiptap 3.22.3 → `setContent(doc,{emitUpdate:false})` đúng chữ ký (không bị nhầm boolean của v2).
- Đổi hội thoại khi watcher đang xếp hàng: nháp lưu theo từng onUpdate nên không mất; chỉ L1 là ngoại lệ hẹp.
- conv null/remount: watch(editor,{once}) nạp nháp khi editor tạo trễ; null → ô trống. Test có.
- B gửi chỉ xóa B: clear() chạy đồng bộ với id hiện tại; test "xóa ô ở B" có. Reply/edit context lưu theo conv trong watch(draftConvId) (DesktopChatView.vue:~281).
- Opt-in: `:conversation-draft="!mobile"` (MessageThread.vue:669) + `inject(...)` chỉ dùng khi prop true; SystemNotificationsPage và editor khác không bị ghi đè (test line 125). Mobile (`mobile`=true) không opt-in → không đổi. Diff MessageThread đúng 1 dòng, khớp LOCK-APPLIED.md.
- Payload gửi không đổi (getRichPayload/handleSend không sửa); drafts không đi vào payload; typing không phát khi restore.
- Session reset: lắng nghe crm:mobile-session-reset (PwaRuntime phát từ App.vue cho cả desktop) → clearAll Map. Không localStorage.
- F6: requestStatus chỉ lấy response.status số; 403/404 phân biệt, lỗi mạng/500 → câu "Không tải được…" (không đoán). Mobile CustomerProfile thêm state 'error'. use-contact-profile có generation: response muộn không ghi đè lỗi/dữ liệu mới (test có); cache hit hủy request bay.
- Lịch hẹn: chỉ `error==='appointment_conflict'` mới dùng câu trùng giờ; có `message` thì dùng nguyên văn, code-only dùng fallback; 500/generic → APPOINTMENT_SAVE_ERROR (đã bỏ câu "có thể trùng giờ" đoán mò). AppointmentEditor desktop vẫn ưu tiên server message; generic hiển thị raw `error` như cũ (tiếng Anh, có sẵn trước F6).

## Ghi chú backend (KHÔNG sửa trong F4/F6 — cần hotfix riêng, tài liệu hóa)
1. Phạm vi contact trả 404 cho cả người không có quyền (contact-routes.ts ~484/~2649) → UI 403 gần như không bao giờ xuất hiện từ endpoint này; "404 = không tồn tại hoặc đã xóa" có thể là sai với người thiếu quyền. Câu 404 hiện tại ("không tồn tại hoặc đã xóa") không nhắc quyền; cân nhắc để nguyên cho đến khi BE quyết định 403.
2. PUT /appointments/:id thiếu conflict guard (appointment-routes.ts ~316+) → sửa lịch có thể tạo trùng giờ mà không có 409; nhánh code-only PUT 409 hiện là phòng thủ/test mock, chưa có BE thật tạo ra.

## QA còn cần (chưa kiểm)
E2E trình duyệt thật: A→B→A có bold/@mention/list; gõ nhanh rồi đổi; AI gợi ý + đổi conv; `?draft=` deep link; reply/edit qua lại; gửi ở B không xóa A; đổi user/org không reload; mobile không đổi (inbox+thread); hồ sơ mobile 403/404/500/offline + đổi khách nhanh (M1); tạo lịch trùng thật (POST 409) vs PUT. vue-tsc -b và full vitest chưa chạy bởi reviewer.
