# ZaloCRM (ZCRM) — Tài liệu tổng quan phần mềm

> Bản tổng hợp toàn bộ thông tin: mục đích, kiến trúc, tính năng, triển khai, và các
> tính năng tự phát triển thêm (vòng 1–7). Cập nhật: 07/07/2026.
> Nền tảng: **ZCRM v3.4 Community** (mã nguồn mở AGPL-3.0) + phần mở rộng riêng của CorepViet.

---

## 1. Phần mềm này là gì

**ZaloCRM** là hệ thống CRM quản lý tập trung **nhiều tài khoản Zalo cá nhân** trên một giao diện web,
dành cho đội sale / chăm sóc khách hàng bán hàng qua Zalo (đặc biệt phù hợp bất động sản, giáo dục,
dịch vụ). Nhiều nhân viên dùng nhiều "nick" Zalo cùng lúc, chat với khách, quản lý khách hàng theo
pipeline, tự động hoá kết bạn và gửi tin — tất cả trong một chỗ.

**Bản chất kỹ thuật:** kết nối Zalo qua thư viện mã nguồn mở `zca-js` (đăng nhập bằng QR như Zalo Web —
**API không chính thức**). Không dùng code độc quyền của Zalo/VNG.

**Giấy phép:** AGPL-3.0. Tự triển khai dùng nội bộ thoải mái; nếu phân phối lại hoặc bán dưới dạng SaaS
thì phải công khai mã nguồn và không dùng thương hiệu "ZCRM".

---

## 2. Kiến trúc & công nghệ

| Lớp | Công nghệ |
|---|---|
| Backend | Node.js + **Fastify 5**, **Prisma 7** ORM, **Socket.IO** (realtime), **BullMQ** + Redis (hàng đợi/worker), **node-cron** (job định kỳ) |
| Database | **PostgreSQL** (114 model Prisma, 115 migration) |
| Cache/Queue | **Redis** (ioredis) |
| Lưu trữ file | **MinIO / Amazon S3 / Cloudflare R2** (ảnh, video, file đính kèm) |
| Kết nối Zalo | **zca-js 2.1.2** (unofficial, đăng nhập QR) |
| Frontend | **Vue 3** + **Vuetify 4**, **Vite 8**, **Pinia**, Vue Router, Axios, Chart.js, PWA |
| Đóng gói | **Docker Compose** (app + db + redis + minio) |
| Bảo mật | JWT (access ngắn + refresh token rotation), RBAC, mã hoá session Zalo at-rest, audit log, CSP |

**Cổng mặc định:** app `http://IP:3080`; PostgreSQL/Redis/MinIO bind nội bộ.

**Cấu hình khuyến nghị (production):** VPS Ubuntu 22.04, 4 vCPU / 4 GB RAM / 40 GB SSD. Nên dùng VPS
Việt Nam để ping Zalo thấp.

---

## 3. Tính năng chính (bản Community gốc)

**Chat & Zalo:** quản lý nhiều nick (đăng nhập QR, tự kết nối lại), chat real-time (text/ảnh/video/
file/sticker), nhóm chat, reaction đa emoji, gửi card chuyển khoản/QR, template nhanh gõ `/`, mirror
media lên MinIO/S3/R2, cầu **Zalo ↔ Telegram 2 chiều**.

**CRM & khách hàng:** pipeline (Mới → Đã liên hệ → Quan tâm → Chuyển đổi → Mất), **lead scoring** tự
động + auto-tag (hot/warm/cold…), gộp khách trùng, ghi chú CRM, tag hệ thống & per-nick, danh bạ bạn bè.

**Lịch hẹn:** tạo, theo dõi, nhắc hẹn tự động hàng ngày, AI gợi ý lịch hẹn.

**Marketing (Community gốc):** Quét nhóm Zalo + thành viên, Tệp khách hàng (import/paste/CSV/Lead Ads).

**Quản trị & báo cáo:** RBAC phòng ban/đội nhóm (ma trận 17 chức năng × 7 hành động), audit log, dashboard
KPI, bộ báo cáo (tổng quan điều hành, vận hành nick, hiệu suất sale, tương tác khách, phân tích nâng cao),
xuất Excel, thông báo hệ thống qua Zalo.

**AI:** trợ lý gợi ý trả lời, tóm tắt, phân tích cảm xúc; đa provider (Anthropic/OpenAI/Gemini/Qwen/Kimi),
quản lý API key per-org.

**Khác:** Public REST API (X-API-Key), webhook, PWA mobile + push, proxy per-nick, chống block (trần
tin/ngày/nick), theme sáng/tối.

---

## 4. Phần tự phát triển thêm (CorepViet — vòng 1→7)

Bản Community gốc thiếu tầng "marketing automation" của bản Enterprise. Đội đã **tự code lại** trên nền
AGPL-3.0 (hợp pháp, không copy code EE). Trạng thái: **tất cả đã deploy production** (VPS 157.66.219.190,
`/opt/ZaloCRM-CorepViet`).

| Vòng | Tính năng | Mô tả |
|---|---|---|
| 1–2 | **Broadcast tự động** | Gửi tin hàng loạt theo lịch (1 lần / hàng ngày / hàng tuần). Gửi rải chống block, trần tin/lần, khung giờ 8h–21h, RBAC owner/admin, log từng người nhận, báo cáo thống kê |
| 3 | **Khối nội dung** (Content Block) | Kho mẫu tin (text + ảnh) tái dùng; Broadcast **xoay vòng** nhiều khối (spin content) chống spam |
| 4–5 | **Mục tiêu** (auto kết bạn) | Tự gửi lời mời kết bạn tới Tệp khách hàng **hoặc** thành viên nhóm đã quét (gửi thẳng bằng UID). Giãn cách + trần friend-action, log kết quả |
| 6 | **Tin chào sau kết bạn** | Khách chấp nhận kết bạn → tự gửi tin chào (gõ tay hoặc xoay vòng Khối nội dung). Hoàn thiện phễu: KB gửi → Đồng ý → Chào |
| 7 | **Broadcast nguồn "Bạn bè"** | Broadcast gửi tới **bạn bè đã kết bạn** của nick (vào thẳng hộp chat) thay vì tệp SĐT người lạ. Modal 2 tab nguồn + cảnh báo gửi người lạ |
| + | **UX Tệp khách hàng** | Trang chi tiết tệp: chọn số dòng/trang (50/100/200), chỉ báo khoảng đang xem, sửa vùng cuộn + độ rộng bảng |

**Model DB mới:** `BroadcastJob/Run/RunItem`, `ContentBlock`, `TargetJob/RunItem` + trường tin chào.
**Worker mới:** `broadcast-cron` + `target-cron` (tick mỗi 30s).

**Còn thiếu so với Enterprise (roadmap):** Phiên chăm sóc, Luồng kịch bản (drip), Bot Auto (trả lời tự
động), Zalo Ads Lead Form, Báo cáo Automation tổng hợp theo sale/nick, Gửi tin nhóm, và **Tạo tệp từ bộ
lọc CRM** (đề xuất ưu tiên — lọc khách theo đã-kết-bạn/tag/stage rồi lưu thành tệp).

---

## 5. Triển khai & vận hành

### Cài mới (1 lệnh)
```bash
curl -fsSL https://raw.githubusercontent.com/locphamnguyen/ZaloCRM/main/scripts/install.sh | bash
```
Xong mở `http://IP:3080/setup` tạo tổ chức + tài khoản chủ.

### Quy trình cập nhật (repo riêng CorepViet)
Do lỗi đồng bộ đã gặp, **luôn commit từ máy Windows** (không commit qua công cụ sandbox):

```powershell
# ① Windows (D:\ZaloCRM-CorepViet)
git add -A
git commit -m "..."
git push origin main
```
```bash
# ② VPS (/opt/ZaloCRM-CorepViet)
git fetch origin && git reset --hard origin/main
docker compose up -d --build app
docker exec zalo-crm-app npx prisma migrate deploy   # nếu có migration mới
docker compose restart app
```

### Checklist production
- Đặt secret thật trong `.env`: `JWT_SECRET`, `ENCRYPTION_KEY` (`openssl rand -hex 32`), `DB_PASSWORD`, `MINIO_ROOT_PASSWORD`
- Gắn domain + HTTPS, sửa `APP_URL` và `S3_PUBLIC_URL` (bắt buộc để ảnh/video hiển thị)
- Backup DB định kỳ: `docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup.sql`
- Tuỳ chọn: Cloudflare R2 thay MinIO, `TELEGRAM_BRIDGE_BOT_TOKEN` bật cầu Telegram

### Nguyên tắc chống block Zalo (quan trọng)
- Mỗi nick giữ dưới ~200 tin/ngày; cấu hình proxy riêng từng nick
- **Gửi tới bạn bè đã kết bạn** (nguồn friends) an toàn hơn gửi người lạ nhiều
- Chạy Mục tiêu kết bạn **trước** rồi mới Broadcast; nội dung cá nhân hoá (`{{ten}}`), đổi mẫu thường xuyên
- Chỉ gửi trong khung 8h–21h (worker tự chặn ngoài giờ)
- Ưu tiên dùng nick phụ; nick có thể bị Zalo hạn chế/khoá nếu spam

---

## 6. Rủi ro & lưu ý pháp lý

- Dùng **API Zalo không chính thức** (zca-js) — có thể vi phạm điều khoản Zalo, nick có nguy cơ bị khoá.
  Người dùng tự chịu trách nhiệm.
- Phần mềm cung cấp "as is", không bảo hành. Dùng cho mục đích tự động hoá cá nhân/nội bộ hợp pháp.
- Không phải sản phẩm của Zalo/VNG; "Zalo" là nhãn hiệu của VNG.

---

## 7. Tham chiếu nhanh

| Hạng mục | Giá trị |
|---|---|
| Repo gốc | github.com/locphamnguyen/ZaloCRM (AGPL-3.0) |
| Repo riêng | github.com/huynhthuan12321/ZaloCRM-CorepViet |
| Docs sử dụng | https://docs.locnguyendata.com/ |
| Server production | 157.66.219.190 · `/opt/ZaloCRM-CorepViet` (Docker Compose) |
| Cổng app | 3080 |
| Tài liệu chi tiết vòng 1–7 | `docs/BROADCAST-TU-DONG-VA-ROADMAP.md` |
| Hướng dẫn triển khai đầy đủ | `docs/HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md` |
