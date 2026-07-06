# Broadcast tự động (Community extension) — Tài liệu triển khai & Roadmap

> Ngày: 06/07/2026 · Người thực hiện: Huỳnh Ngọc Thuận (với Claude)
> Nền tảng: ZCRM v3.4 Community (AGPL-3.0) — tự code lại tính năng EE trên bản mã nguồn mở.

---

## 1. Bối cảnh

Bản Community chỉ có 2 mục Marketing: **Quét nhóm** và **Tệp khách hàng** (broadcast thủ công).
Các tính năng EE (Mục tiêu, Phiên chăm sóc, Luồng kịch bản, Khối nội dung, Broadcast tự động, Bot Auto, Zalo Ads Lead Form) không có trong mã nguồn mở.

**Pháp lý:** code mới hoàn toàn trên nền AGPL-3.0 (không copy code EE) → hợp pháp.
Dùng nội bộ: không ràng buộc. Nếu phân phối/bán SaaS: phải công khai mã nguồn phần tự viết (AGPL §13) và không dùng thương hiệu "ZCRM".

---

## 2. Đã triển khai: Broadcast tự động

Gửi tin hàng loạt tới **Tệp khách hàng** theo lịch, gửi rải chống block.

### Tính năng

| Hạng mục | Chi tiết |
|---|---|
| Lịch gửi | 1 lần (chọn ngày giờ) · Hàng ngày (giờ VN) · Hàng tuần (chọn thứ + giờ) |
| Nội dung | Text + biến `{{ten}}` (tên khách), `{{sdt}}` (SĐT) + ảnh kèm (URL từ Kho media) |
| Chống block | Giãn cách ngẫu nhiên 30–90s/tin (chỉnh được) · trần tin/lần chạy (mặc định 50, max 500) · tôn trọng trần tin/ngày của nick (SdkLimit) — nick chạm trần thì tự chờ, không tính lỗi |
| Người nhận | Entry trong tệp có `hasZalo=true`. UID resolve đúng theo nick gửi (cùng nick quét → dùng UID sẵn; khác nick → `findUser` theo SĐT) |
| Vận hành | Pause / Resume / Chạy ngay / Xoá · log từng người nhận (gửi/lỗi/bỏ qua) · UI tự refresh 15s khi đang gửi |
| Worker | Cron 30s/tick, mỗi run gửi tối đa 1 tin/tick (≈2 tin/phút) · job `once` xong tự chuyển `done` · `daily/weekly` tự tính lần chạy kế tiếp |

### File đã thêm / sửa

**Backend (Fastify + Prisma):**

| File | Vai trò |
|---|---|
| `backend/src/modules/broadcast/broadcast-service.ts` | Helpers thuần: render biến, tính lịch chạy kế tiếp (UTC+7), random delay |
| `backend/src/modules/broadcast/broadcast-cron.ts` | Worker cron 30s: kích job đến hạn, gửi rải tin, ghi log |
| `backend/src/modules/broadcast/broadcast-routes.ts` | REST API `/api/v1/broadcast-jobs` (CRUD + run-now + log items) |
| `backend/prisma/schema.prisma` | Thêm 3 model: `BroadcastJob`, `BroadcastRun`, `BroadcastRunItem` |
| `backend/prisma/migrations/20260706000000_broadcast_jobs/migration.sql` | Migration additive (chỉ thêm bảng mới, an toàn dữ liệu) |
| `backend/src/app.ts` | Đăng ký routes + start cron (2 chỗ, có comment `Community extension`) |

**Frontend (Vue 3 + Vuetify):**

| File | Vai trò |
|---|---|
| `frontend/src/views/marketing/BroadcastsView.vue` | Trang quản lý broadcast: danh sách job, modal tạo, modal log gửi |
| `frontend/src/router/index.ts` | Route `/marketing/broadcasts` (name `CE.Broadcasts`) |
| `frontend/src/views/marketing/CommunityMarketingShell.vue` | Thêm menu "Broadcast tự động" |

### API endpoints

```
GET    /api/v1/broadcast-jobs                          — danh sách job (org scope)
POST   /api/v1/broadcast-jobs                          — tạo job
GET    /api/v1/broadcast-jobs/:id                      — chi tiết + 10 run gần nhất
PATCH  /api/v1/broadcast-jobs/:id                      — sửa / pause / resume
POST   /api/v1/broadcast-jobs/:id/run-now              — chạy ngay
DELETE /api/v1/broadcast-jobs/:id                      — xoá (cascade log)
GET    /api/v1/broadcast-jobs/:id/runs/:runId/items    — log từng người nhận
```

### Triển khai lên server

```bash
cd /path/to/ZaloCRM
docker compose up -d --build app
docker exec zalo-crm-app npx prisma migrate deploy
docker compose restart app
# Verify: thấy "[broadcast-cron] scheduled every 30s"
docker logs zalo-crm-app --tail 20 | grep broadcast
```

### Lưu ý vận hành

- Chưa chạy test build tự động — lần build đầu nếu lỗi TypeScript, xem log và sửa.
- Test với tệp nhỏ (5–10 số) trước khi gửi tệp lớn.
- Gửi tới người **chưa kết bạn** có thể rơi vào hộp "người lạ" hoặc thất bại → nên chạy kết bạn trước (xem Mục tiêu bên dưới).
- Ảnh kèm: URL phải là link server truy cập được (S3_PUBLIC_URL của MinIO/R2).
- Nội dung nên cá nhân hoá (dùng `{{ten}}`) và đổi mẫu thường xuyên để giảm rủi ro Zalo đánh spam.

---

## 3. Cần triển khai tiếp (roadmap tự code các tính năng EE còn lại)

Thứ tự đề xuất từ dễ → khó, tái dùng nền móng có sẵn:

### 3.1. Khối nội dung (Content Block) — ~2-3 ngày
- Model `ContentBlock` (text/ảnh/biến động), mở rộng từ `MessageTemplate` có sẵn.
- Mục đích: kho nội dung tái dùng cho Broadcast + Luồng kịch bản.
- Nâng cấp Broadcast: chọn block thay vì gõ tay + **xoay vòng nhiều mẫu** (spin content) chống spam.

### 3.2. Mục tiêu (auto kết bạn theo target) — ~1 tuần
- Mở rộng `FriendshipAttempt` + `campaign-service.ts` (dispatcher đã có sẵn).
- Nguồn target: Tệp khách hàng + kết quả **Quét nhóm** (GroupMember).
- Giới hạn lời mời/ngày/nick (category `friend_request` trong SdkLimit).
- Quan trọng: chạy TRƯỚC broadcast để tăng tỉ lệ gửi thành công.

### 3.3. Luồng kịch bản (Flow/Drip automation) — ~2-4 tuần, khó nhất
- Model `Flow` + `FlowStep` (trigger → chờ X ngày → gửi block → rẽ nhánh theo phản hồi/tag).
- Model `FlowEnrollment`: theo dõi từng khách đang ở bước nào.
- Engine cron mỗi phút (theo mẫu `broadcast-cron.ts` vừa viết).
- Trigger gợi ý: khách vào tệp, gắn tag, kết bạn thành công, khách nhắn tin.

### 3.4. Phiên chăm sóc (Care session) — ~1 tuần (sau Flow)
- Thực chất = gán Flow cho 1 tệp khách + dashboard tiến độ (đã chăm bước mấy, tỉ lệ phản hồi).

### 3.5. Bot Auto (trả lời tự động) — ~1-2 tuần
- Hook vào `zalo-listener-factory.ts` (listener tin nhắn đến đã có sẵn).
- Rule keyword → trả lời mẫu; nâng cao: nối module AI có sẵn (Anthropic/OpenAI/Gemini) trả lời theo ngữ cảnh.

### 3.6. Zalo Ads Lead Form — ~3-5 ngày
- Webhook endpoint nhận lead từ Zalo OA/Ads → tạo `CustomerListEntry` theo `#mã` chiến dịch.
- Lưu ý: repo đã có nền Multi-Source Lead Ads (FB/TikTok) trong `list-import-service.ts` → làm theo mẫu đó.

### Việc nhỏ nên làm sớm
- [x] Chạy build + test thực tế tính năng Broadcast trên server — 06/07/2026, gửi thật thành công tới số test 0363556463
- [x] Chọn ảnh từ Kho media trực tiếp trong modal (thay vì dán URL) — `BroadcastsView.vue` gọi `listMedia()`, grid chọn ảnh
- [x] Thêm RBAC: giới hạn quyền tạo broadcast theo nhóm quyền (hiện: mọi user đăng nhập) — POST/PATCH/DELETE/run-now chỉ owner/admin (`requireBroadcastAdmin` trong `broadcast-routes.ts`)
- [ ] Thống kê broadcast vào trang Báo cáo (tỉ lệ gửi thành công theo nick/tệp)
- [x] Cửa sổ giờ gửi (không gửi ngoài 8h–21h) — tránh phiền khách ban đêm — `isWithinSendWindow()` trong `broadcast-service.ts`, gate trong `processRun()`, đã test thật lúc 22:57 (ngoài giờ) → run tạo nhưng sentCount=0

---

## 4. Nền móng có sẵn trong repo (tham khảo khi code tiếp)

| Thành phần | File | Dùng cho |
|---|---|---|
| Gửi tin/ảnh qua zca-js (đã gate rate-limit) | `backend/src/shared/zalo-operations.ts` (`zaloOps`) | Mọi tính năng gửi tin |
| Trần tin/ngày/nick + burst | `backend/src/modules/zalo/sdk-limit-service.ts` + `zalo-rate-limiter.ts` | Chống block |
| Mẫu worker cron + tenant | `backend/src/modules/broadcast/broadcast-cron.ts`, `engagement/engagement-cron.ts` | Flow engine, Mục tiêu |
| Dispatcher kết bạn | `backend/src/modules/campaign/campaign-service.ts` | Mục tiêu |
| Tệp KH + enrichment UID | `backend/src/modules/lists/` | Nguồn đối tượng mọi automation |
| Listener tin nhắn đến | `backend/src/modules/zalo/zalo-listener-factory.ts` | Bot Auto, trigger Flow |
| AI providers | `backend/src/modules/ai/` | Bot Auto thông minh |
| Import lead đa nguồn | `backend/src/modules/lists/list-import-service.ts` | Zalo Ads Lead Form |
