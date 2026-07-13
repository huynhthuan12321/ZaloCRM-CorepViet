# Marketing — Gap & TODO (hướng EE đầy đủ)

> Ngày lập: 2026-07-13
> Mục tiêu chốt: **Bám EE đầy đủ (như HS Holding)** — bản này chạy full tính năng, không giới hạn ở scope Community 2-mục của tài liệu open-core.
> Nguồn đối chiếu: [MARKETING_REVIEW_INPUT.md](MARKETING_REVIEW_INPUT.md) (spec 6a/6b/6c docs.locnguyendata.com + ảnh HS Holding).
> Quy ước trạng thái: ✅ đủ · 🟡 chạy được nhưng nông (thiếu chiều sâu EE) · ❌ thiếu hẳn · ☐ chưa làm · ☑ đã làm.

---

## 0. Định vị (đã chốt)

- Tài liệu chính thức nói **Community chỉ có 2 mục Marketing** (Quét nhóm + Tệp khách hàng); phần còn lại là 🔶 EE.
- **Quyết định:** build theo **EE đầy đủ** — mọi module bật mặc định (mô hình feature-flag opt-out). Không cắt về 2 mục.

---

## 1. Bảng đối chiếu spec ↔ code hiện tại

| Module | Route | Spec (EE) | Hiện trạng code | TT |
|---|---|---|---|---|
| Tệp khách hàng | `/marketing/lists` (+`:id`) | thẻ tổng, lọc, bảng, popup Tạo tệp 4 nguồn, chi tiết | ListsView 566d + ListDetail 1940d | ✅ |
| Mẫu tin nhắn | `/marketing/message-templates` | folder + slug `/tắt` + tag dự án + biến + Riêng tư/Chung | đủ folder/shortcut/tag/visibility/biến | ✅ |
| Broadcast | `/marketing/broadcasts` | wizard 4 bước; detail **3 tab** + KPI đã nhận/đã xem; **4 nguồn** đối tượng | wizard 4 bước (dry-run safe); detail **4 tab**; **2 nguồn**; thiếu KPI nhận/xem | 🟡 |
| Mục tiêu | `/marketing/targets` | **wizard 4 bước**, multi-nick, lời mời ≤200, chuỗi 5 tin toggle+delay, quy tắc an toàn, báo nội bộ 3 đích, hẹn lịch 6–22h, trang chi tiết + log | **modal 1 trang**, **1 nick**, welcome + 1 luồng bám đuổi, chống block cơ bản, chỉ modal log | 🟡 |
| Khối nội dung | `/marketing/content-blocks` | **biến thể** + **AI tạo biến thể** + **rich-text** + **preview Zalo LIVE** + folder/tag + loại (send_message/request_friend) | CRUD đơn: tên + 1 text + 1 ảnh | 🟡 |
| Luồng kịch bản | `/marketing/sequences` | bước = **Khối** ghép, giờ làm việc, luật chống spam, `/:id/stats`, bộ đếm | CRUD luồng, bước = **text thuần** + delay preset | 🟡 |
| Phiên chăm sóc | `/marketing/care-sessions` | trang riêng: 4 thẻ, danh sách phiên, panel chi tiết, tab **Cài đặt lắng nghe** (sự kiện + 3 đích) | **không có route/view** (dữ liệu đang ở Chat/Follow-up) | ❌ |
| Bám đuổi thủ công | `/marketing/manual-followup` | trang riêng: thẻ tổng/đang chạy/xong/dừng, lọc, empty state | **không có route/view** | ❌ |

**Backend đã có (tái dùng được cho EE):**
- `automation/care-session-cron.ts`, `care-session-listener.ts`, `care-session-timeline.ts` — máy chạy bám đuổi.
- API `/automation/care-sessions/listen*`, `/chat/contacts/:id/manual-enroll`, `/automation/triggers/:triggerId/contacts/:contactId/{pause,resume,stop,advance}`, `/contacts/:id/followup-history`, `/contacts/:id/automation-status`.
- ⚠️ **Thiếu endpoint LIST tổng** care-sessions/manual-followup (hiện chỉ truy cập theo từng contact) → phải bổ sung khi làm trang standalone.
- `rich-text-editor` chunk đã tồn tại trong frontend (dùng lại cho Khối nội dung EE).

---

## 2. NHÓM A — Sửa lỗi/nhất quán  ✅ ĐÃ LÀM (working tree, chưa commit)

- ☑ **A1.** `marketingFeatureFlags.ts`: bỏ **BOM** đầu file; dry-run ưu tiên đọc `VITE_MARKETING_DRY_RUN` (biến Docker thực set) + giữ `VITE_MARKETING_DRY_RUN_ENABLED`/`VITE_MARKETING_BROADCAST_DRY_RUN` làm alias; bỏ care-sessions/manual-followup khỏi `getMarketingFallbackPath` (tránh redirect 404). Mô hình opt-out (bật hết, tắt qua `VITE_MARKETING_DISABLED_FEATURES`).
- ☑ **A2.** `CommunityMarketingShell.vue`: gỡ 2 nav chết **Phiên chăm sóc** + **Bám đuổi thủ công** (không có route/view). Menu còn 7 mục có trang thật.
- ☑ **A3. (2026-07-13) DRY-RUN BACKEND — kill-switch cấp server.** Trước đây dry-run CHỈ ở frontend (FE tạo job `status=paused`) → **KHÔNG** bảo vệ job `active` tạo thẳng qua API, nút Resume, `run-now`, hay job cũ còn sót trên VPS → những job này **GỬI ZALO THẬT**. Đã thêm `config.marketingDryRun` (env `MARKETING_DRY_RUN`, mặc định `false`) gate 5 call-site gửi thật:
  - `broadcast-cron.ts` (send text/ảnh) → ghi item `skipped:dry_run`, run vẫn drain.
  - `target-cron.ts` (kết bạn customer_list + group_scan + tin chào) → ghi `skipped:dry_run` / bỏ qua welcome. **Quan trọng:** bỏ qua `attemptFriendRequest*` vì hàm này vừa gửi lời mời THẬT vừa tạo `FriendshipAttempt` (đốt contact).
  - `care-session-cron.ts` (gửi bước luồng) → vẫn `advanceStep` (mock) để phiên không kẹt.
  - `docker-compose.yml`: thêm runtime env `MARKETING_DRY_RUN=${MARKETING_DRY_RUN:-false}` cho service `app` (khác `VITE_*` build-time).
- ☑ **Build/test:** backend `tsc --noEmit` **PASS** · frontend `npm run build` **PASS** · `broadcast-wizard-logic.spec.ts` **14/14 PASS**.
- ☐ **Commit** (chờ xác nhận): `fix(marketing): backend MARKETING_DRY_RUN kill-switch + dry-run env, gỡ 2 nav chết`

**Nợ kỹ thuật liên quan (chưa làm):**
- ☐ Dockerfile/`docker-compose.yml` còn truyền 3 ARG `VITE_MARKETING_ENTERPRISE_ENABLED` / `VITE_BROADCAST_ENABLED` / `VITE_SEQUENCE_ENABLED` — sau khi opt-out thì **code không đọc nữa** (dead-config, vô hại). Dọn khi đụng deploy plumbing; cân nhắc thay bằng `VITE_MARKETING_DISABLED_FEATURES`. **Lưu ý:** `VITE_MARKETING_DRY_RUN` (frontend, khóa nút UI) và `MARKETING_DRY_RUN` (backend, chặn cron gửi thật) là **2 biến khác nhau** — production phải set **CẢ HAI** = true.

---

## 3. NHÓM B — Nâng chiều sâu EE (chưa làm)

> Thứ tự đề xuất B1→B5 (giá trị/độ khó). Chưa chốt — chờ xác nhận.

### B1 — Broadcast hoàn thiện  (quy mô: Vừa)  🟡→✅
- ☐ Bước 1 Đối tượng: thêm nguồn **Nhãn CRM**, **Bộ lọc động** (hiện chỉ Bạn bè + Tệp KH). *(“Mẫu có sẵn” cân nhắc bỏ nếu không cần.)*
- ☐ Panel phải: cảnh báo **“Skip n KH (không Zalo / bị chặn / chưa kết bạn)”** dạng breakdown.
- ☐ Trang chi tiết: KPI **KH đã nhận (tick xám)** + **KH đã xem (tick xanh)**.
  - ☐ DB: thêm cột `receivedAt`/`seenAt` (hoặc trạng thái) trên `BroadcastRunItem` + migration.
  - ☐ Backend: cập nhật trạng thái nhận/xem (webhook/poll Zalo nếu có) + trả trong API.
- ☐ Chốt: detail **3 tab** theo spec hay giữ 4 tab (thêm “Cài đặt”)? — quyết khi làm.

### B2 — Khối nội dung EE  (quy mô: Lớn)  🟡→✅
- ☐ **Biến thể**: 1 khối có nhiều biến thể, xoay vòng chống trùng (Biến thể 1 mặc định + Thêm).
  - ☐ DB: model biến thể (bảng con hoặc JSON array) + migration.
- ☐ **AI tạo biến thể** (nút): gọi module `ai` backend sinh biến thể từ nội dung gốc.
- ☐ **Rich-text editor** (B/I/U, list, emoji) — tái dùng `rich-text-editor` sẵn có.
- ☐ **Preview Zalo (LIVE)** panel phải.
- ☐ **Folder + Tag** + **Loại khối** (`send_message` / `request_friend` / đổi trạng thái).
- ☐ Trình soạn chuyển từ modal → **trang toàn màn** (theo spec).

### B3 — Mục tiêu wizard 4 bước  (quy mô: Lớn)  🟡→✅
- ☐ Chuyển modal 1 trang → **wizard 4 bước** (Tệp+Nick+Skip → Lời chào+Chuỗi → Quy tắc an toàn → Xem trước+Bắt đầu).
- ☐ **Multi-nick** gửi mời (hiện 1 nick) + hiển thị hạn mức `KB n/300 · Tin n/300` từng nick, loại nick offline.
- ☐ Bước 1: quy tắc bỏ qua (đã chat 1-1 / đã là bạn / không Zalo).
- ☐ Bước 2: lời mời ≤200 ký tự; chuỗi **5 tin** (chào + nhắc chưa đồng ý + cảm ơn + bám đuổi từ chối), mỗi tin BẬT/TẮT + thời gian chờ; biến `{gender}{name}{sale}`; báo nội bộ 3 đích.
- ☐ Bước 3: threshold kết bạn nhiều nick; pause khi KH reply (cancel job + notify); reaction tích cực/tiêu cực → cộng/trừ điểm.
- ☐ Bước 4: hẹn lịch (khung 6h–22h VN).
- ☐ **Trang chi tiết Mục tiêu**: thẻ trạng thái, Phase 1/Phase 2, Top 5 nick, dashboard + log đầy đủ.
- ☐ Backend `target` module: mở rộng schema/route cho multi-nick + chuỗi 5 tin + quy tắc an toàn.

### B4 — Luồng kịch bản EE  (quy mô: Vừa)  🟡→✅
- ☐ Bước của luồng = **tham chiếu Khối** (hiện là text thuần) — ghép Khối + độ trễ.
- ☐ Cấu hình **giờ làm việc** (08:00–22:00 VN) + giãn cách gửi.
- ☐ Luật chống spam: tránh trùng, giãn đều giữa nick, dừng nếu KH rep.
- ☐ Trang **thống kê** `/marketing/sequences/:id/stats` + bộ đếm Enroll/Hoàn thành/Lỗi/Đang chạy trên thẻ.

### B5 — Phiên chăm sóc + Bám đuổi thủ công (trang standalone)  (quy mô: Lớn)  ❌→✅
- ☐ **Backend**: endpoint LIST tổng care-sessions (4 thẻ: vừa trả lời/tạm dừng/đang chăm/đã đóng; lọc; tìm tên/SĐT).
- ☐ **Backend**: endpoint LIST manual-followup (thẻ tổng/đang chạy/xong/dừng/tỉ lệ phản hồi).
- ☐ **View** `CareSessionsView.vue` + route `/marketing/care-sessions`: danh sách phiên + panel chi tiết + tab **Cài đặt lắng nghe** (sự kiện + 3 đích báo: Owner/Quản lý/Nhóm Zalo).
- ☐ **View** `ManualFollowupView.vue` + route `/marketing/manual-followup` + empty state.
- ☐ Thêm lại 2 nav vào `CommunityMarketingShell.vue` (đã gỡ ở A2).

---

## 4. Việc dọn dẹp / nợ khác (nền)

- ☐ Reconcile `marketingFeatureFlags.ts` opt-out vs Docker args (xem Nhóm A dead-config).
- ☐ Mẫu tin nhắn: xác nhận có cần gắn **Dự án chips** kiểu bất động sản (hard-code Emerald…) hay để tag tự do.
- ☐ Kiểm tra brand hard-code “Thiên Phúc” / dự án BĐS còn sót trong seed/mẫu (Phase 1 gỡ hard-code).
- ☐ (Nhắc từ session trước) đổi mật khẩu Neon DB test (lộ trong chat); cân nhắc reset các thay đổi lạc so với origin/main.

---

## 5. Quyết định đang chờ

1. Commit Nhóm A ngay (message ở mục 2) rồi bắt B1? hay gộp?
2. Thứ tự Nhóm B theo B1→B5 hay đổi ưu tiên?
3. Broadcast detail: giữ 4 tab hay về đúng 3 tab theo spec?

---

## 6. Triển khai VPS + xác minh (2026-07-13)

### 6.1 Nguyên nhân "production chỉ hiện 3 menu"
- Bản **đã commit** của `marketingFeatureFlags.ts` là **opt-in**: `targets/broadcasts/sequences/careSessions` = `marketingEnterpriseEnabled` (đọc `VITE_MARKETING_ENTERPRISE_ENABLED`). Build VPS **không** truyền cờ = true → EE menu bị ẩn, chỉ còn Quét nhóm + Tệp KH + Mẫu tin.
- Bản **working tree** (chưa commit) đã đổi sang **opt-out**: mọi module bật mặc định. Sau khi **commit + push + build lại**, menu hiện đủ 7 mục **không cần** set `VITE_*_ENABLED` nữa. `VITE_MARKETING_DRY_RUN` vẫn được đọc để khóa nút gửi thật.
- ⇒ Vấn đề gốc KHÔNG phải Docker build-args (chúng đã đúng), mà là code opt-in chưa được deploy. Chỉ cần đưa working tree lên main + build lại.

### 6.2 Rủi ro production & cách chặn
- ⚠️ **Nếu chỉ set `VITE_MARKETING_DRY_RUN=true` mà KHÔNG set `MARKETING_DRY_RUN=true`:** UI khóa nút, nhưng backend cron **vẫn gửi thật** với bất kỳ job `active` nào (tạo qua API, Resume, job cũ). → **Bắt buộc set CẢ HAI.**
- Sau khi có A3, `MARKETING_DRY_RUN=true` chặn triệt để 5 call-site gửi Zalo ở tầng backend.

### 6.3 Command deploy VPS (sau khi push main)
```bash
cd /opt/ZaloCRM-CorepViet
git fetch origin
git reset --hard origin/main

# Idempotent: chỉ thêm nếu chưa có (tránh trùng dòng khi chạy lại)
grep -q '^VITE_MARKETING_DRY_RUN='          .env || echo 'VITE_MARKETING_DRY_RUN=true'          >> .env
grep -q '^VITE_MARKETING_ENTERPRISE_ENABLED=' .env || echo 'VITE_MARKETING_ENTERPRISE_ENABLED=true' >> .env
grep -q '^VITE_BROADCAST_ENABLED='          .env || echo 'VITE_BROADCAST_ENABLED=true'           >> .env
grep -q '^VITE_SEQUENCE_ENABLED='           .env || echo 'VITE_SEQUENCE_ENABLED=true'            >> .env
grep -q '^MARKETING_DRY_RUN='               .env || echo 'MARKETING_DRY_RUN=true'                >> .env

docker compose build --no-cache app
docker compose up -d app
# Xác nhận không có lỗi migration/cột; dry-run backend đang chặn gửi thật
docker compose logs --tail=200 app | grep -E "P2022|BroadcastRun|CareSession|does not exist|ERROR|\[dry-run\]" || true
```
> Ghi chú: 3 cờ `VITE_*_ENABLED` giờ là dead-config (code opt-out không đọc) nhưng vẫn set để tương thích Dockerfile ARG hiện tại — vô hại. `VITE_MARKETING_DRY_RUN` (khóa UI) + `MARKETING_DRY_RUN` (chặn cron) là 2 cờ THẬT SỰ có tác dụng.

### 6.4 Checklist xác minh sau deploy
- ☐ Menu Marketing hiện đủ: Quét nhóm · Tệp khách hàng · Mục tiêu · Broadcast tự động · Khối nội dung · Mẫu tin nhắn · Luồng kịch bản. *(Phiên chăm sóc + Bám đuổi thủ công CHƯA có trang — nằm ở Nhóm B5.)*
- ☐ `/marketing/broadcasts`: wizard 4 bước (Đối tượng → Nội dung → Nick & lịch → Kiểm tra); nút "Chạy ngay" **khóa** (icon send-lock) khi dry-run; tạo job ra **nháp (paused)**.
- ☐ Log backend có `[dry-run]` khi tới giờ chạy job, **không** có tin Zalo gửi ra.
- ☐ Không có `P2022` / `does not exist`.
