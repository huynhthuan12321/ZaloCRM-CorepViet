# Reviewer-2 (delta): F4 nháp desktop + F6 lỗi 403/404 — HEAD 68edf81 + working tree
Chế độ đọc-only, không sửa/commit/delegate. Đã đọc LOCK-APPLIED.md, reviewer-1.md, skill corepviet-mobile-contract + vue-best-practices.
Đã chạy lại 5 spec nhắm đích (rich-text-editor.draft, use-desktop-chat-drafts, use-contact-errors, crm-request-errors, use-mobile-agenda): 5 file / 31 test PASS. Chưa chạy vue-tsc, full suite, E2E, trình duyệt thật (theo yêu cầu).

## Kết luận: PASS — không còn Critical/High/Medium. Có 4 ghi chú Low/QA.

## Xác minh các fix của reviewer-1
- **M1 (trạng thái 404 cũ rò sang khách B) — ĐÃ FIX.** `use-contacts.ts:373-382`: `fetchContact` có `contactReadGeneration`; chỉ lần gọi mới nhất được ghi `contactErrorStatus`, và mỗi lần gọi reset về null. `use-mobile-contact-detail.ts:56-76`: `load()` reset contact/activity ngay đầu, gen-guard sau await, rồi mới đọc status. 404 muộn của A không ghi được (test `use-contact-errors.dom.spec.ts:45` "late404 of A cannot contaminate successful mobile B"). `use-contact-profile.ts` có generation riêng, `clear()` tăng generation (test dòng 31).
- **L1 (queued modelValue sang hội thoại khác) — ĐÃ FIX.** `MessageThread.vue:667-669` `:key="mobile ? 'mobile-composer' : conversation.id"` → mỗi hội thoại desktop một editor; watcher cũ bị hủy theo component. `rich-text-editor.vue` chốt `mountedDraftId` lúc setup; `persistDraft()` bỏ qua nếu `id !== binding.conversationId` hiện tại. `watch(editor,{once})` luôn `restoreDraft(mountedDraftId)` kể cả nháp null (setContent '' ) nên modelValue cũ của A không lọt sang B. Test dòng 144 phủ "external model + switch cùng tick".
  - Lưu ý Tiptap vue-3 `useEditor` tạo editor trong `onMounted` (editor ban đầu undefined) → `watch(editor,{once})` không bị bỏ lỡ.
- **L2 (session reset) — ĐÃ FIX.** `revision` ref; `clearAll()` tăng revision; editor đang mở `setDraftDocument(null)`; DesktopChatView `watch(desktopDrafts.revision)` xóa replyingTo/editingMessage. Test phủ.
- **Guard PWA/unload:** `use-desktop-chat-drafts.ts` dùng `reactive(Map)` nên `hasAnyDraft()` (`docs.size`) reactive trong `computed` của `PwaRuntime.vue:38`. Update SW giờ bị chặn khi A còn nháp dù B trống; DOM check có sẵn vẫn giữ. `DesktopChatView.vue:~277` `useDraftUnloadGuard(desktopDrafts)` dùng đúng kiểu `Pick<…,'hasAnyDraft'>`, gỡ listener theo scope.

## Không đổi (đã đối chiếu diff)
- Rich format/mention/payload gửi: `getRichPayload`, `handleSend`, `applyRichPayload` logic không sửa; chỉ thêm `persistDraft()` ở cuối và expose thêm 2 hàm. Draft nằm riêng, không đi vào payload; restore dùng `emitUpdate:false` nên không phát `typing`.
- Mobile: key cố định `'mobile-composer'`, `conversation-draft=false` → binding null, không persist/restore. Editor phụ (dialog/kho khối/SystemNotifications) không opt-in → không ghi đè (test dòng 130).
- Attachment/shortcut/AI watcher/handleSend: diff MessageThread chỉ 2 dòng (key + prop), khớp LOCK-APPLIED.md.
- `?draft=` deep link: `consumeDraftFromQuery` (MessageThread.vue:2786-2800) áp sau `nextTick` + 250ms → chạy SAU khi editor mới mount/restore, nên không bị restore-null ghi đè.

## Ghi chú Low
- **L-a (Low, cosmetic)** `use-contacts.ts:1` import `requestStatus` chèn TRƯỚC header SPDX/Copyright; nên đặt sau header cho đúng quy ước file.
- **L-b (Low, hành vi mới)** Desktop giờ hiện hộp thoại `beforeunload` khi đóng/F5 và còn nháp RAM. Chấp nhận được, nhưng cần ghi vào release note/QA. Guard chỉ sống khi DesktopChatView mounted; rời sang route khác (SPA) rồi F5 thì nháp mất không cảnh báo (PwaRuntime chỉ chặn update SW, không chặn reload tay).
- **L-c (Low, carry L4)** profile 404/403 với contact đã tải ngay vẫn ẩn hồ sơ (`use-mobile-contact-detail.ts:70-75`); chấp nhận nếu profile là bắt buộc; ghi QA. Nhiều `fetchContact` đồng thời trên cùng instance composable sẽ dùng chung một `contactErrorStatus` (hiện chỉ mobile detail dùng một lần/instance → không có repro).
- **L-d (Low/ghi chú, đã có từ trước)** gửi thất bại vẫn xóa ô và nháp (L3 reviewer-1) — không tệ hơn trước F4.
- Backend không đổi: các ghi chú BE của reviewer-1 (404 thay 403 do phạm vi quyền; PUT /appointments thiếu conflict guard) vẫn là hotfix riêng.

## Giới hạn QA (chưa kiểm — cần QA đầy đủ sau reviewer)
- Remount editor mỗi lần đổi hội thoại: kiểm tay mất focus/caret, undo history, popup @mention/mẫu "/" đang mở khi đổi hội thoại, nhấp nháy ô soạn, và hiệu năng đổi nhanh nhiều hội thoại.
- A→B→A có bold/@mention/list; gõ nhanh rồi đổi; AI gợi ý + đổi hội thoại; `?draft=` deep link; reply/edit qua lại; gửi ở B không xóa A; đổi user/org không reload (reset); mobile inbox+thread không đổi (iPhone/WebKit thật chưa kiểm).
- Hồ sơ mobile 403/404/500/offline + đổi khách nhanh; tạo lịch trùng thật (POST 409) vs PUT.
- `vue-tsc -b`, full vitest, build chưa chạy.
