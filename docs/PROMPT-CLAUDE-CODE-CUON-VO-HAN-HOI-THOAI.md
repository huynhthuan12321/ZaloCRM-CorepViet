# Tính năng: Cuộn vô hạn danh sách hội thoại (tải thêm 100 khi cuộn xuống)

Mục tiêu: danh sách hội thoại ở màn Chat hiện chỉ tải 100 hội thoại mới nhất. Cho phép cuộn xuống cuối để
tự tải tiếp 100 hội thoại cũ hơn (nối vào cuối danh sách), đến khi hết. Không đổi cấu trúc DB.

Bối cảnh mã nguồn (đã kiểm tra):
- Backend: `backend/src/modules/chat/chat-routes.ts`, endpoint `GET /api/v1/conversations` (khoảng dòng 422)
  ĐÃ nhận `page` (mặc định '1') và `limit` (mặc định '50'), có nhiều filter, sắp theo tin nhắn mới nhất.
- Frontend: `frontend/src/composables/use-chat.ts` — hàm `fetchConversations` (khoảng dòng 396) đang gửi
  cố định `limit: 100` (không gửi page), rồi GHI ĐÈ toàn bộ danh sách. Danh sách render ở
  `frontend/src/components/chat/ConversationList.vue`. Có cache `conversationsCache` theo params.

---

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Thêm cuộn vô hạn cho danh sách hội thoại. Không tự đưa lên máy chủ. Không đổi cấu trúc DB.

### 1. Backend — bảo đảm phân trang đúng
Trong `GET /api/v1/conversations` (`chat-routes.ts`):
- Xác nhận endpoint áp `skip = (page - 1) * limit` với ĐÚNG thứ tự sắp xếp đang dùng (tin nhắn mới nhất
  trước). Nếu chưa áp skip theo page thì bổ sung.
- Trả về đủ thông tin để frontend biết còn dữ liệu không: thêm `hasMore: boolean` (hoặc `total: number`)
  vào phần trả về. `hasMore` = (số bản ghi trả về ở trang này === limit). Giữ nguyên toàn bộ filter + shape
  hiện có, chỉ THÊM trường này.
- Giữ nguyên org-scope + quyền như hiện tại.

### 2. Frontend — trạng thái phân trang (use-chat.ts)
- Thêm ref: `convPage` (số trang, mặc định 1), `convHasMore` (mặc định true), `convLoadingMore` (mặc định false).
- `fetchConversations` (tải lần đầu / đổi filter / refresh): đặt `convPage = 1`, gửi thêm `page: 1`, GHI ĐÈ
  danh sách như hiện tại, cập nhật `convHasMore` từ kết quả. Giữ nguyên cache cho trang 1.
- Thêm hàm mới `loadMoreConversations()`:
  - Bỏ qua nếu `convLoadingMore === true` hoặc `convHasMore === false`.
  - Đặt `convLoadingMore = true`, tăng `convPage + 1`, gọi API cùng filter hiện tại + `page` mới + `limit: 100`,
    KHÔNG dùng cache (bypass).
  - NỐI kết quả vào CUỐI `conversations` (append), KHỬ TRÙNG theo `id` (bỏ bản ghi id đã có trong danh sách).
  - Cập nhật `convHasMore` = (số bản ghi trang này === 100). Đặt `convLoadingMore = false`.
  - Lỗi API → nuốt lỗi, đặt `convLoadingMore = false`, giữ nguyên danh sách hiện có.
- Cập nhật realtime qua socket giữ nguyên: vẫn cập nhật item theo id tại chỗ. Việc append trang cũ không
  đụng cơ chế socket; khử trùng theo id đảm bảo không double.
- Export `loadMoreConversations`, `convHasMore`, `convLoadingMore`.

### 3. Frontend — kích hoạt khi cuộn (ConversationList.vue)
- Ở cuối danh sách hội thoại, thêm một phần tử "điểm neo" (sentinel). Dùng IntersectionObserver: khi
  sentinel lọt vào khung nhìn (người dùng cuộn tới cuối) → gọi `loadMoreConversations()`. (Nếu khó dùng
  IntersectionObserver thì fallback: bắt sự kiện scroll của khung danh sách, khi gần đáy (còn < 200px) thì gọi.)
- Hiển thị:
  - Khi `convLoadingMore` → dòng "Đang tải thêm…" ở cuối.
  - Khi `convHasMore === false` → dòng mờ "Đã tải hết hội thoại".
- Tránh gọi lặp: chỉ gọi khi không đang tải và còn dữ liệu (đã guard trong loadMoreConversations).

### Ràng buộc
- Không đổi cấu trúc DB, không migration.
- Không đổi hành vi filter/search/tab hiện có: khi đổi filter/search/tab → coi như tải lại từ trang 1
  (reset convPage=1, convHasMore=true).
- Khử trùng theo id khi append để hội thoại không hiện 2 lần khi danh sách xê dịch do có tin mới.
- Giữ nguyên mọi chức năng khác của danh sách (chọn hội thoại, xoá, badge, cột 3...).

### Kiểm tra (bắt buộc)
- `cd backend && npx tsc --noEmit` không lỗi; `cd frontend && vue-tsc -b` (hoặc build) không lỗi.
- Chạy `node dist/app.js` vài giây: không trùng route, không lỗi chưa bắt.
- Nêu phần thay đổi từng tệp và xác nhận: (a) tải lần đầu vẫn ra 100 hội thoại mới nhất như cũ;
  (b) cuộn tới cuối tự tải thêm 100 hội thoại cũ hơn, nối vào cuối, không trùng; (c) hết dữ liệu thì hiện
  "Đã tải hết" và không gọi API nữa; (d) đổi filter/tab thì danh sách reset về trang 1.
- Không tự đưa lên máy chủ. Xong thì báo phần thay đổi để tôi tự đưa lên.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — không có bước migration
1. Windows: `git add -A && git commit -m "feat(chat): cuon vo han danh sach hoi thoai" && git push origin main`
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 30`
3. Kiểm thử: mở màn Chat, cuộn danh sách hội thoại xuống cuối → phải tự tải thêm 100 hội thoại cũ hơn.
