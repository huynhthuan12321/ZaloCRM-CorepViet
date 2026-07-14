# PROMPT — Điều tra & sửa: "Mở chat Zalo" từ hồ sơ Khách hàng ra màn chat TRỐNG

> Copy toàn bộ phần dưới đây vào session Claude Code mới trên repo `D:\ZaloCRM-CorepViet`.

---

Điều tra và sửa bug: từ trang **Khách hàng** → mở dialog hồ sơ 1 khách (đã kết bạn, badge "Có Zalo") → bấm **"Mở chat Zalo"** → chuyển sang trang Chat nhưng **không mở hội thoại nào** — cột phải hiện "Chọn cuộc trò chuyện" (trống). Kỳ vọng: mở đúng hội thoại 1-1 với khách đó.

## 0. An toàn

- CHỈ sửa luồng điều hướng/đọc dữ liệu — KHÔNG gửi tin Zalo, KHÔNG đổi cờ dry-run, KHÔNG đụng worker/cron.
- Mọi query backend mới phải org-scoped (`orgId`) + đúng RBAC scope nick như các route chat hiện có.
- Làm trên branch riêng `fix/chat-contact-deeplink`, CHƯA merge main khi chưa được xác nhận.

## 1. Triệu chứng & repro

1. Trang Khách hàng (`/contacts` — list 1017 KH) → click 1 khách có Zalo, đã kết bạn (vd "Tô Châu Tổng Đài") → dialog `CustomerProfileDialog` mở.
2. Bấm nút footer **"💬 Mở chat Zalo"**.
3. App chuyển sang `/chat?contactId=<id>` → danh sách hội thoại bên trái vẫn load bình thường, nhưng KHÔNG hội thoại nào được chọn/mở; panel phải trống.
4. Lưu ý bối cảnh khi bug xảy ra: trang Chat có "Phạm vi xem" theo nick (scope đã lưu), tab lọc (Cá nhân/Nhóm/Chính/Ưu tiên), filter "Đang chat", và chỉ nạp ~57 hội thoại đầu — hội thoại của khách này nhiều khả năng KHÔNG nằm trong tập đã nạp.

## 2. Vị trí code đã xác định trước (đọc kỹ trước khi sửa)

- **Nguồn nút**: `frontend/src/components/contacts/CustomerProfileDialog.vue` — `goChat()` (~dòng 738): `router.push({ path: '/chat', query: { contactId: c.value.id } })`.
- **Nơi resolve**: `frontend/src/views/ChatView.vue` (~dòng 628-641): `watch([() => route.query.contactId, conversations])` → `convs.find(c => c.contact?.id === contactId && c.threadType === 'user')` → nếu match thì `router.replace /chat/:convId`. **Nếu KHÔNG match → không làm gì cả (bug: fail im lặng)**.
- Các call-site khác dùng cùng pattern — audit luôn để sửa 1 lần đủ:
  - `frontend/src/components/contacts/ContactDetailPanel.vue` (nút "Mở chat Zalo"/"Mở chat nội bộ").
  - `frontend/src/components/contacts/CustomerProfileDialog.vue`.
  - `frontend/src/views/marketing/ListDetailView.vue` — `openRowChat(entry)`.
  - `frontend/src/components/lists/LeadDetailPanel.vue` — `openZaloChat` (navigate kèm `?draft=`).
  - `frontend/src/components/appointments/AppointmentsListView.vue`.

## 3. Root cause — ĐÃ XÁC NHẬN 2026-07-14 (đối chiếu code + repro production)

**H3 là nguyên nhân chính (CONFIRMED)**: `GET /api/v1/conversations` (backend `chat-routes.ts` ~dòng 419) query bảng `Conversation` — row này CHỈ tồn tại khi đã có tin nhắn. Khách **đã kết bạn nhưng chưa từng nhắn tin** thì KHÔNG có Conversation row → không bao giờ xuất hiện trong list → watcher `convs.find(...)` trượt → màn trống, không toast.

Bằng chứng repro production: KH "Hà Phạm" (SĐT 84902006555, contactId `e3568945-c51c-4db0-b4be-d2e978f9b05a`), tab "Nick chăm" hiện **Đã KB** với nick "Huỳnh Thuận Cờ Rếp Việt" nhưng 0 tin nhắn → `https://zalocrm.corepviet.com/chat?contactId=e3568945-...` ra "Chọn cuộc trò chuyện" trống. List chat chỉ có 57 hội thoại (toàn khách đã nhắn).

**H1 là nguyên nhân phụ (vẫn phải sửa cùng lúc)**: kể cả khách ĐÃ có Conversation, nếu row nằm ngoài trang đầu (limit 50)/scope nick/filter hiện tại thì `find` trong tập đã nạp vẫn trượt → cùng triệu chứng trống. H2/H4 chỉ cần kiểm nhanh khi test, không phải hướng chính.

## 4. Hướng sửa (nguyên tắc: KHÔNG fail im lặng; TÁI DÙNG luồng "Tin nhắn mới" có sẵn)

**Hạ tầng có sẵn để tái dùng — đừng viết mới:** `frontend/src/components/chat/NewMessageDialog.vue` (mở từ nút "Tin nhắn mới" trong `ConversationList.vue` ~dòng 274/390) đã biết **lookup Zalo theo SĐT + TẠO hội thoại** ("Dialog tự lookup Zalo + tạo hội thoại" — comment ~dòng 432); `ConversationList` cũng đã có luồng điền sẵn SĐT vào dialog này (~dòng 346). Đây chính là nhánh xử lý cho khách chưa có conversation.

- **Backend**: thêm resolve tường minh — `GET /api/v1/conversations/resolve?contactId=xxx` (org-scoped, RBAC nick-scope, `requireGrant('conversation','access')` như route list): trả về một trong: `{ convId, nickId }` (đã có hội thoại — kể cả ngoài page/scope) HOẶC `{ friendship: { nickId, phone, zaloUid } }` (đã KB/có Zalo nhưng chưa có conversation) HOẶC `{ none: true }`. Kiểm tra trước trong `chat-routes.ts` xem có endpoint tương đương (`resolve`, `by-contact`, `find-or-create`) — tái dùng nếu có.
- **Frontend** (`ChatView.vue` watcher ~dòng 628 — thay `find` trong list bằng gọi resolve): 3 nhánh:
  a) có `convId` → replace `/chat/:convId`; nếu conv ngoài scope/trang hiện tại thì fetch bổ sung/chèn vào list (hoặc nới scope sang nick đó) rồi select.
  b) có `friendship` (ca Hà Phạm) → mở `NewMessageDialog` điền sẵn SĐT/UID + nick tương ứng — dialog tự tạo hội thoại như luồng "Tin nhắn mới" hiện có. KHÔNG gửi tin tự động — chỉ mở khung soạn.
  c) `none` → toast rõ lý do ("Khách chưa có Zalo/chưa kết bạn với nick nào trong phạm vi") — TUYỆT ĐỐI không im lặng.
- Sửa MỘT chỗ (composable/util dùng chung) để mọi call-site ở mục 2 cùng hưởng, không copy-paste logic vào từng nút.
- Giữ tương thích: query `?contactId` cũ vẫn hoạt động (bookmark/link từ nơi khác); luồng `?draft=` của Lead Pool không được regress.

## 5. Kiểm thử bắt buộc

- Unit test cho logic resolve thuần (chọn nick ưu tiên, 3 nhánh a/b/c) — tách file logic thuần theo pattern `broadcast-wizard-logic.ts`.
- Backend test route resolve: đúng org (org khác → 404), đúng RBAC scope, contact không Zalo.
- Runtime QA browser (dev server + DB local nếu máy dev không có DB — dựng Postgres docker + `prisma migrate deploy` + seed):
  1. KH có hội thoại NẰM TRONG trang đầu → mở đúng (regression).
  2. KH có hội thoại NGOÀI trang đầu/scope khác → mở đúng (ca bug chính).
  3. KH là bạn nhưng chưa từng nhắn → ra khung soạn tin mới, không trống.
  4. KH không có Zalo → nút "Mở chat nội bộ" vẫn hoạt động như cũ.
  5. Đi từ đủ các entry: Khách hàng dialog, ContactDetailPanel, Tệp KH row, Lead panel, Lịch hẹn.
- `backend tsc --noEmit` + `frontend vue-tsc + vite build` PASS; baseline test fail không tăng.

## 6. Báo cáo

- Ghi rõ: giả thuyết nào ĐÚNG (kèm bằng chứng log/DB), đã sửa gì, file nào, test nào cover.
- Nếu root cause là H3/H4 (dữ liệu) thì báo cáo trước khi sửa data — không tự "fix" dữ liệu production.
- Commit đề xuất: `fix(chat): resolve conversation by contactId khi mở chat từ hồ sơ KH (het fail im lặng)` — chờ xác nhận trước khi merge.
