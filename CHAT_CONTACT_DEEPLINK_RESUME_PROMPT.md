# PROMPT RESUME — Chạy tiếp fix "mở chat từ hồ sơ KH ra trống" (session trước đứt vì 402 hết credit)

> Copy toàn bộ phần dưới đây vào session Claude Code mới trên repo `D:\ZaloCRM-CorepViet`.

---

Tiếp tục hoàn thành fix **chat-contact-deeplink** đang làm dở. Session trước chết giữa chừng vì lỗi API 402 (hết balance) — **mọi edit đã áp vào working tree, CHƯA commit**. Nhiệm vụ: kiểm kê chính xác cái gì đã xong, làm nốt phần còn lại, chạy build gate + test, báo cáo. KHÔNG làm lại từ đầu, KHÔNG revert/reset/checkout đè bất kỳ file nào đang sửa dở.

## 0. Bối cảnh & thiết kế ĐÃ CHỐT (không mở lại thảo luận)

Bug: từ hồ sơ Khách hàng bấm "Mở chat Zalo" → `/chat?contactId=...` → màn trống, vì `ChatView.vue` (~dòng 628-641) resolve bằng `find` trong list conversations đã nạp ở client (phân trang limit 50 + nick-scope) — khách chưa từng nhắn KHÔNG có Conversation row nên không bao giờ match, fail im lặng. Chi tiết root cause: `CHAT_CONTACT_DEEPLINK_FIX_PROMPT.md` (đọc tham khảo).

Thiết kế đã chốt với user:
1. **Backend là nguồn chân lý**: `POST /api/v1/conversations/resolve` body `{ contactId }` (POST vì nhánh friend-chưa-conv PHẢI ghi DB), preHandler `requireGrant('conversation','access')`, org-scoped + `getZaloScope`. Org khác → 404.
2. Ca **đã-KB-chưa-nhắn** → tự tạo Conversation RỖNG rồi trả convId luôn (KHÔNG gửi tin Zalo) — qua hàm service **`ensureUserConversation`** trích từ route `POST /friends/:id/ensure-conversation` (contact-routes.ts ~1846-1861, single source of truth; route cũ phải dùng lại hàm này, hành vi không đổi).
3. KH nhiều nick kết bạn → **ưu tiên nick đã có Conversation mới nhất** (lastMessageAt desc); không nick nào có conv → Friend row tương tác gần nhất (lastInteractionAt). Logic thuần trong `backend/src/modules/chat/contact-conversation-resolver.ts` (`resolveContactConversationPlan` → `{kind:'conversation',convId} | {kind:'friend',friendId,nickId} | {kind:'none'}`), dùng `findExistingUserConversation` (globalId-aware) chống xé hội thoại.
4. Backend gộp nhánh: cả "đã có conv" lẫn "KB-chưa-nhắn" đều trả `{ convId }` → FE chỉ việc `/chat/:convId` (watcher convId sẵn có ChatView ~600-619 tự adopt nick ngoài scope + reload → sửa luôn ca phân trang H1). Chỉ nhánh `none` → toast rõ lý do ("Khách chưa có Zalo / chưa kết bạn với nick nào trong phạm vi xem") — TUYỆT ĐỐI không im lặng.
5. **FE composable dùng chung** `frontend/src/composables/use-open-contact-chat.ts` — export `openContactChat(router, contactId, opts?)` — mọi call-site gọi qua đây.

## 1. Trạng thái lúc đứt (kiểm kê lại bằng `git status` + `git diff` trước khi tin)

Task list session trước: 3 done, 1 đang dở, 1 chưa:
- ☑ Backend: service `ensureUserConversation` (trích từ contact-routes).
- ☑ Backend: resolver thuần `contact-conversation-resolver.ts` + spec.
- ☑ Backend: route `POST /api/v1/conversations/resolve`.
- ◐ **Frontend: composable + 5 call-sites — DANG DỞ.** Đã thấy áp xong: `ListDetailView.vue` (openRowChat: có contactId → openContactChat; chỉ có SĐT → giữ `?compose=phone`), `LeadDetailPanel.vue` (tương tự, giữ nhánh `?compose=`). CHƯA rõ đã sửa: `CustomerProfileDialog.vue` (goChat ~dòng 738 — nút gốc gây bug), `ContactDetailPanel.vue`, `AppointmentsListView.vue`, và **watcher `?contactId` trong `ChatView.vue` ~628-641** (phải chuyển từ `find` client-side sang gọi resolve; giữ tương thích link cũ `?contactId=`). Composable `use-open-contact-chat.ts` chắc đã tạo (2 file kia import nó) — verify tồn tại + đúng contract.
- ☐ Build gate: `backend tsc --noEmit` + `frontend vue-tsc + vite build` + tests.

## 2. Việc cần làm (theo thứ tự)

1. `git status` / `git diff --stat` trên branch `fix/chat-contact-deeplink` (nếu đang ở branch khác mà working tree có thay đổi này thì tạo/chuyển branch đó, KHÔNG stash mất). Đối chiếu từng mục ở §1 với diff thật — ghi lại cái gì có/thiếu.
2. Hoàn thành phần FE còn thiếu: 3 call-site còn lại + watcher ChatView (query `?contactId` cũ → gọi `openContactChat`/resolve, không còn silent-fail; KHÔNG regress luồng `?compose=phone` và `?draft=` của Lead Pool).
3. Test: verify spec resolver đã có chạy pass; bổ sung nếu thiếu — unit resolver (3 nhánh + luật ưu tiên + tie-break), route test (org khác 404, contact không Zalo → none, friend-chưa-conv → tạo conv + created:true, idempotent gọi 2 lần không tạo 2 conv), regression test route `ensure-conversation` cũ vẫn pass.
4. Build gate: `backend npx tsc --noEmit` · backend tests liên quan · `frontend vue-tsc` + `vite build` + FE spec. Baseline fail không tăng.
5. Báo cáo: bảng từng hạng mục đã xong/file nào; test nào pass; ca QA runtime còn nợ (ca Hà Phạm `contactId=e3568945-c51c-4db0-b4be-d2e978f9b05a` chỉ test được sau deploy — ghi rõ vào báo cáo). Đề xuất commit: `fix(chat): resolve conversation by contactId khi mở chat từ hồ sơ KH (hết fail im lặng)` — **commit trên branch, CHƯA merge main khi chưa được xác nhận.**

## 3. An toàn (giữ nguyên như session trước)

- CHỈ luồng điều hướng/đọc + tạo Conversation metadata rỗng. KHÔNG gửi tin Zalo, KHÔNG đổi cờ dry-run, KHÔNG đụng worker/cron.
- Query mới org-scoped + RBAC nick-scope. Không commit `.env`/log/dump.
- Không revert file nào trong working tree; nếu phát hiện edit dở dang gây lỗi compile thì sửa tiếp cho hoàn chỉnh, không xoá.
