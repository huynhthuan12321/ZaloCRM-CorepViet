# Prompt cho Claude Code: API gửi ẢNH qua Zalo (đóng luồng đơn hàng Lark → Zalo)

> Dán phần trong khối "PROMPT" cho Claude Code chạy tại repo **ZaloCRM** (`D:\ZaloCRM-CorepViet`).
> Mục tiêu: bổ sung endpoint gửi ảnh vào Public API để n8n gửi ảnh đơn hàng cho khách đã kết bạn Zalo —
> xoá thao tác cắt ảnh PDF thủ công.

---

## ===== PROMPT (copy từ đây) =====

Bạn là kỹ sư backend cấp cao làm việc trong repo **ZaloCRM** (Node.js + Fastify 5 + Prisma 7 +
PostgreSQL + Socket.IO; kết nối Zalo qua `zca-js`). Nhiệm vụ: thêm **API công khai gửi ẢNH qua Zalo**
để hệ tự động hoá bên ngoài (n8n) gửi ảnh đơn hàng cho khách **đã kết bạn**. Đọc code thật trước khi
sửa, giữ nguyên phong cách hiện có, diff tối thiểu.

### Bối cảnh code có sẵn (đã xác minh — dùng lại, đừng viết lại)
- Public API text hiện tại: `backend/src/modules/api/public-api-routes.ts` — endpoint
  `POST /api/public/messages/send` chỉ gửi **text** (`api.sendMessage(content, threadId, threadType)`).
  Xác thực bằng `X-Api-Key` (đã hash); `orgId` lấy từ `(request as any).orgId`.
- Hàm gửi ảnh nội bộ đã có: `zaloOps.sendImage(accountId, threadId, threadType, attachments, io?, caption='')`
  trong `backend/src/shared/zalo-operations.ts`. **Lưu ý:** `attachments` là **đường dẫn file local**,
  KHÔNG nhận URL (zca-js yêu cầu path).
- Tải URL → file tạm: `downloadMediaToTemp(media: { url: string; filename?: string }, contentType: string)`
  trả `{ path, cleanup }` trong `backend/src/modules/chat/chat-media-helpers.ts`.
- `zaloOps` đã tự đi qua **rate-limiter** (category `message`) → tôn trọng trần chống-block; KHÔNG gọi
  `zca-js` trực tiếp, luôn qua `zaloOps`.
- Model `Friend` (Prisma): `friendshipStatus` (`'accepted'` = đã kết bạn), `zaloUidInNick` (UID khách theo
  nick), `zaloAccountId`, `contactId`. `Contact` có `phone`. Dùng để tra UID khách theo SĐT.

### Việc 1 — Endpoint gửi ảnh
Thêm `POST /api/public/messages/send-image` vào `public-api-routes.ts`, cùng phong cách endpoint text.

**Request body (JSON):**
```
{
  "zaloAccountId": "…",           // BẮT BUỘC: nick gửi
  "threadId": "…",                // UID Zalo khách (nếu đã biết) — HOẶC dùng "phone"
  "phone": "0901234567",          // nếu không có threadId: tra UID khách theo SĐT (khách phải đã kết bạn)
  "imageUrl": "https://…",        // 1 ảnh; HOẶC "imageUrls": ["…","…"] cho đơn nhiều trang
  "caption": "Cảm ơn anh/chị…"    // tuỳ chọn, gửi kèm ảnh đầu
}
```

**Logic:**
1. Validate `zaloAccountId` thuộc `orgId`, `status==='connected'`, `archivedAt==null` (giống endpoint text:
   404 nếu không thấy nick, 409 nếu `archivedAt`, 422 nếu chưa kết nối).
2. Xác định `threadId`:
   - Nếu body có `threadId` → dùng thẳng.
   - Nếu chỉ có `phone` → chuẩn hoá số, tìm `Friend` `friendshipStatus='accepted'` của **đúng nick này**
     (`zaloAccountId`) khớp `Contact.phone` (join qua `contactId`). Lấy `zaloUidInNick`. Không thấy → 404
     `{ error: 'friend_not_found', hint: 'Khách chưa kết bạn với nick này' }`.
3. Gom danh sách ảnh: `imageUrls` (mảng) hoặc `[imageUrl]`. Với mỗi URL: `downloadMediaToTemp` → path,
   rồi `zaloOps.sendImage(zaloAccountId, threadId, 0, [path], io ?? null, captionChoAnhDau)`, cuối cùng
   `cleanup()` trong `finally`. Caption chỉ gắn ảnh đầu; các ảnh sau caption rỗng.
4. Trả `{ success: true, sent: <số ảnh>, threadId }`. Nếu 1 ảnh lỗi tải/gửi → trả 207/500 kèm chi tiết
   ảnh nào lỗi, KHÔNG nuốt lỗi âm thầm.
5. **Không áp khung giờ 8h–21h** cho endpoint này (đây là tin giao dịch khách đang chờ — khác broadcast).
   Nhưng **vẫn đi qua rate-limiter** của `zaloOps` (chống block). Nếu `zaloOps` ném `RATE_LIMITED` → trả
   429 `{ error: 'rate_limited' }`; `NOT_CONNECTED` → 422.

### Việc 2 — Tra khách theo SĐT (giúp n8n)
Thêm `GET /api/public/contacts/by-phone/:phone` (org scope): chuẩn hoá SĐT, trả contact + danh sách
`friends` `accepted` (mỗi phần tử: `zaloAccountId`, `accountName`, `zaloUid`) để n8n biết gửi bằng nick
nào tới UID nào. Không thấy → 404.

### Việc 3 — Test
Thêm `backend/tests/public-send-image.test.ts`: mock `zaloOps.sendImage` + `downloadMediaToTemp`; cover:
gửi bằng `threadId`; gửi bằng `phone` (resolve Friend); nick chưa kết nối → 422; phone không có Friend →
404; nhiều ảnh; ảnh lỗi tải → không nuốt lỗi. (Theo mẫu test trong `backend/tests/` — đối chiếu 1 file
public-api test có sẵn nếu có.)

### Ràng buộc
- Chỉ sửa `public-api-routes.ts` (+ import cần thiết) và thêm 1 file test. Không đụng module khác trừ khi
  bắt buộc; nếu buộc, giải thích.
- Không phá endpoint text hiện có. `npx tsc --noEmit` (trong `backend/`) phải exit 0.
- Không hardcode secret. Không gọi `zca-js` trực tiếp — chỉ qua `zaloOps`.
- Ghi log gọn (không log nội dung/PII). Dọn file tạm kể cả khi lỗi (`finally cleanup`).
- **Không tự deploy.** Sau khi xong: liệt kê diff, kết quả `tsc`, danh sách test, và ví dụ `curl` gọi
  endpoint (cả 2 kiểu: theo `threadId` và theo `phone`). Nhắc người dùng commit từ máy Windows rồi deploy.

Bắt đầu: mở `public-api-routes.ts` + `zalo-operations.ts` + `chat-media-helpers.ts` để xác nhận chữ ký
hàm, rồi mới sửa.

## ===== HẾT PROMPT =====

---

## Ghi chú cho bạn (sau khi Claude Code làm xong)

- Deploy: commit từ Windows → trên VPS `git reset --hard origin/main` → `docker compose up -d --build app`
  (không cần migrate — không đổi schema).
- Phần n8n (ghép vào workflow `TAO_DON_HANG_LARK` hiện có), thêm SAU node "Replace Google Slides
  Placeholders":
  1. **Slides → PNG:** gọi Slides API `GET https://slides.googleapis.com/v1/presentations/{presentationId}/pages/{pageObjectId}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE` → lấy `contentUrl` → tải PNG.
  2. **Public URL ảnh:** upload PNG lên Drive share "anyone with link" (hoặc lên MinIO/S3 ZaloCRM) → link tải trực tiếp được.
  3. **Gọi ZaloCRM:** `POST {ZALOCRM_URL}/api/public/messages/send-image` header `X-Api-Key`, body `{ zaloAccountId, phone: <SĐT khách trong đơn>, imageUrl: <link PNG>, caption }`.
  4. **Update Lark:** set `Trang_Thai_Gui_Zalo = "Đã gửi"`.
- Nên thêm node **xoá bản copy Google Slides** sau khi export để Drive không bị rác.
- Giữ nhánh PDF hiện tại để lưu chứng từ; nhánh PNG→Zalo chạy song song.
