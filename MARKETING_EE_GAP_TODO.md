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
| Khối nội dung | `/marketing/content-blocks` | **biến thể** + **AI tạo biến thể** + **rich-text** + **preview Zalo LIVE** + folder/tag + loại (send_message/request_friend) | **P3 CRUD thật**: biến thể + loại khối + tag + bật/tắt + tìm/lọc; còn thiếu AI/rich-text/preview LIVE/folder-UI | 🟢 |
| Luồng kịch bản | `/marketing/sequences` | bước = **Khối** ghép, giờ làm việc, luật chống spam, `/:id/stats`, bộ đếm | **P3**: bước ghép được Khối (send_message) + delay/sắp xếp; còn thiếu UI giờ làm việc/luật/stats | 🟢 |
| Phiên chăm sóc | `/marketing/care-sessions` | trang riêng: 4 thẻ, danh sách phiên, panel chi tiết, tab **Cài đặt lắng nghe** (sự kiện + 3 đích) | **placeholder an toàn** (route + nav OK, không 404); backend worker đã chạy, thiếu endpoint LIST + view thật | 🟡 |
| Bám đuổi thủ công | `/marketing/manual-followup` | trang riêng: thẻ tổng/đang chạy/xong/dừng, lọc, empty state | **placeholder an toàn** (route + nav OK, không 404); thiếu endpoint LIST + view thật | 🟡 |

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

### B2 — Khối nội dung EE  (quy mô: Lớn)  🟡→🟢 (Phase 3 CRUD thật)
- ☑ **P3 (2026-07-13) Biến thể**: 1 khối nhiều biến thể (JSON `variants` trên `content_blocks`), thêm/xoá trong modal. `variants[0]` đồng bộ vào `messageText`/`imageUrl` → worker gửi (broadcast-cron) đọc như cũ, KHÔNG phá dry-run.
  - ☑ DB: migration additive `20260713120000_content_blocks_phase3` (ADD COLUMN block_type/variants/tags/folder/enabled + index; không đụng dữ liệu cũ).
- ☑ **P3 Loại khối** (`send_message` / `request_friend` / `status_change`) — chọn khi tạo/sửa, lọc theo loại.
- ☑ **P3 Tag** tự do + **bật/tắt** (enabled) + **tìm/lọc** (q/type/enabled) — API `GET /content-blocks?q=&type=&enabled=&tag=`.
- ☑ **P3 CRUD thật + trạng thái UI**: loading / empty / error(+retry) / debounce search; validate biến `{{...}}` ở mọi biến thể (chặn cả FE lẫn BE).
- ☑ **P3 Broadcast wizard Step 2**: chỉ lấy khối `send_message` đang bật từ API thật (bỏ khối kết bạn/đã tắt).
- ☐ **AI tạo biến thể** (nút): gọi module `ai` backend sinh biến thể từ nội dung gốc. *(còn thiếu)*
- ☐ **Rich-text editor** (B/I/U, list, emoji) — tái dùng `rich-text-editor` sẵn có. *(còn thiếu — hiện textarea thuần)*
- ☐ **Preview Zalo (LIVE)** panel phải. *(còn thiếu)*
- ☐ **Folder**: đã có cột `folder` (BE) nhưng UI chưa dựng cây thư mục. *(còn thiếu UI)*
- ☐ Trình soạn chuyển từ modal → **trang toàn màn** (theo spec). *(còn modal)*

### B3 — Mục tiêu wizard 4 bước  (quy mô: Lớn)  🟡→✅
- ☐ Chuyển modal 1 trang → **wizard 4 bước** (Tệp+Nick+Skip → Lời chào+Chuỗi → Quy tắc an toàn → Xem trước+Bắt đầu).
- ☐ **Multi-nick** gửi mời (hiện 1 nick) + hiển thị hạn mức `KB n/300 · Tin n/300` từng nick, loại nick offline.
- ☐ Bước 1: quy tắc bỏ qua (đã chat 1-1 / đã là bạn / không Zalo).
- ☐ Bước 2: lời mời ≤200 ký tự; chuỗi **5 tin** (chào + nhắc chưa đồng ý + cảm ơn + bám đuổi từ chối), mỗi tin BẬT/TẮT + thời gian chờ; biến `{gender}{name}{sale}`; báo nội bộ 3 đích.
- ☐ Bước 3: threshold kết bạn nhiều nick; pause khi KH reply (cancel job + notify); reaction tích cực/tiêu cực → cộng/trừ điểm.
- ☐ Bước 4: hẹn lịch (khung 6h–22h VN).
- ☐ **Trang chi tiết Mục tiêu**: thẻ trạng thái, Phase 1/Phase 2, Top 5 nick, dashboard + log đầy đủ.
- ☐ Backend `target` module: mở rộng schema/route cho multi-nick + chuỗi 5 tin + quy tắc an toàn.

### B4 — Luồng kịch bản EE  (quy mô: Vừa)  🟡→🟢 (một phần Phase 3)
- ☑ **P3 (2026-07-13) Bước ghép Khối**: mỗi bước có thể chọn 1 Khối nội dung loại `send_message` đang bật từ API thật → điền `text` từ khối (vẫn sửa tay được), lưu kèm `blockId` để hiển thị nguồn. Backend `resolveStepBlocks` resolve text server-side (org-scoped); worker gửi vẫn đọc `text` → dry-run an toàn.
- ☐ Cấu hình **giờ làm việc** (08:00–22:00 VN) + giãn cách gửi. *(runtimeRules đã có ở BE, UI chưa phơi)*
- ☐ Luật chống spam: tránh trùng, giãn đều giữa nick, dừng nếu KH rep. *(worker đã thực thi; UI cấu hình chưa có)*
- ☐ Trang **thống kê** `/marketing/sequences/:id/stats` + bộ đếm Enroll/Hoàn thành/Lỗi/Đang chạy trên thẻ. *(còn thiếu)*

### B5 — Phiên chăm sóc + Bám đuổi thủ công (trang standalone)  (quy mô: Lớn)  ❌→🟡 (placeholder)
- ☑ **A4 (2026-07-13) Navigation hoàn chỉnh + placeholder an toàn.** Không còn route chết/404/menu thiếu:
  - ☑ `MarketingPlaceholderView.vue` (dùng chung, đọc nội dung từ route meta) — production-safe: **KHÔNG** gọi API gửi thật, nêu rõ "Đang triển khai · An toàn dry-run" + hướng dẫn xem dữ liệu ở Chat/Follow-up.
  - ☑ Route `/marketing/care-sessions` (`CE.CareSessions`) + `/marketing/manual-followup` (`CE.ManualFollowup`) → trỏ placeholder.
  - ☑ Thêm lại 2 nav (Phiên chăm sóc, Bám đuổi thủ công) vào `CommunityMarketingShell.vue` (gate `careSessions`/`manualFollowup`). Menu giờ đủ **9 mục**, đổi label "Broadcast tự động" → **"Gửi tin hàng loạt"**.
  - ☑ Alias tương thích link/bookmark cũ: `/marketing/templates` → `/message-templates`, `/marketing/blocks` → `/content-blocks` (redirect, không 404).
- ☐ **Backend**: endpoint LIST tổng care-sessions (4 thẻ: vừa trả lời/tạm dừng/đang chăm/đã đóng; lọc; tìm tên/SĐT). *(placeholder chờ endpoint này)*
- ☐ **Backend**: endpoint LIST manual-followup (thẻ tổng/đang chạy/xong/dừng/tỉ lệ phản hồi).
- ☐ **View** `CareSessionsView.vue` thật: danh sách phiên + panel chi tiết + tab **Cài đặt lắng nghe** (sự kiện + 3 đích báo: Owner/Quản lý/Nhóm Zalo) — thay placeholder.
- ☐ **View** `ManualFollowupView.vue` thật + empty state — thay placeholder.

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
- ☐ Menu Marketing hiện đủ **9 mục**: Quét nhóm · Tệp khách hàng · Mục tiêu · Phiên chăm sóc · Luồng kịch bản · Bám đuổi thủ công · Gửi tin hàng loạt · Khối nội dung · Mẫu tin nhắn.
- ☐ Click **từng mục** không 404 / không trang trắng / không crash. Phiên chăm sóc + Bám đuổi thủ công hiện **trang placeholder** ("Đang triển khai · An toàn dry-run"), không gọi API gửi thật.
- ☐ Không mất lại 3 mục community đang dùng (Quét nhóm · Tệp khách hàng · Mẫu tin nhắn).
- ☐ Link cũ `/marketing/templates` → chuyển hướng `/marketing/message-templates`; `/marketing/blocks` → `/marketing/content-blocks` (không 404).
- ☐ `/marketing/broadcasts`: wizard 4 bước (Đối tượng → Nội dung → Nick & lịch → Kiểm tra); nút "Chạy ngay" **khóa** (icon send-lock) khi dry-run; tạo job ra **nháp (paused)**.
- ☐ Log backend có `[dry-run]` khi tới giờ chạy job, **không** có tin Zalo gửi ra.
- ☐ Không có `P2022` / `does not exist`.
- ☐ Build: `frontend npm run build` PASS · `backend tsc --noEmit` PASS · `broadcast-wizard-logic.spec.ts` 14/14 PASS.

---

## 7. Phase 3 — Content Blocks + Sequences CRUD thật (2026-07-13)

### 7.1 Đã làm (CRUD THẬT, không mock)
- **Khối nội dung** (`content_blocks` mở rộng additive):
  - Backend `content-block-routes.ts`: GET (filter `q`/`type`/`enabled`/`tag`) · POST · PATCH (gồm bật/tắt) · DELETE — org-scoped, auth middleware, validate biến `{{...}}` + loại khối.
  - Helper thuần `content-block-helpers.ts` (test được): `normalizeBlockType`, `unknownVars`, `normalizeVariants`, `buildBlockContent` (đồng bộ `variants[0]` → `messageText`/`imageUrl`).
  - Frontend `ContentBlocksView.vue`: list/search(debounce)/filter/create/edit/delete/enable-disable · loading/empty/error(+retry) · form biến thể (thêm/xoá + ảnh mỗi biến thể) · tag · nhãn dry-run.
- **Luồng kịch bản**:
  - Backend `community-automation-routes.ts` + `resolveStepBlocks`: step có `blockId` → điền `text` từ Khối (org-scoped, server-side). Worker gửi vẫn đọc `text`.
  - `sequence-snapshot.ts`: `SequenceDraftStep.blockId` (giữ khi parse) — không phá snapshot/worker.
  - Frontend `SequencesView.vue`: mỗi bước chọn Khối `send_message` đang bật từ API thật; vẫn sửa tay + sắp xếp/xoá bước.
- **Broadcast wizard Step 2**: nạp khối từ `/content-blocks?type=send_message&enabled=true` (khối thật, không mock).

### 7.2 Còn thiếu (mock / chưa dựng)
- AI sinh biến thể; rich-text editor (đang textarea); preview Zalo LIVE; UI cây folder (cột `folder` đã có ở BE).
- Sequence: UI cấu hình giờ làm việc/luật chống spam (BE đã thực thi qua `runtimeRules`); trang `/:id/stats`.
- KHÔNG có phần nào của Phase 3 gọi Zalo API — toàn bộ là CRUD dữ liệu.

### 7.3 An toàn production (giữ nguyên)
- KHÔNG đổi `MARKETING_DRY_RUN` / `VITE_MARKETING_DRY_RUN`. KHÔNG enqueue/resume job gửi thật.
- Bật/tắt Khối & Luồng chỉ đổi cột `enabled` — KHÔNG kích hoạt gửi.
- Migration `20260713120000_content_blocks_phase3` **additive thuần** (ADD COLUMN có DEFAULT + CREATE INDEX) — an toàn `prisma migrate deploy` trên DB đang có dữ liệu; khối cũ nhận default `send_message`/`variants []`/`enabled true`.

### 7.4 Test đã chạy
- `backend npm run build` (tsc) **PASS**.
- `backend vitest tests/content-block-phase3.test.ts` **16/16 PASS** (block type/vars/variants/buildContent + parseSequenceSteps giữ blockId).
- `backend vitest broadcast-content-block-org-scope.test.ts` **PASS** (không regress resolveJobContent).
- `frontend npm run build` **PASS**. `broadcast-wizard-logic.spec.ts` **14/14 PASS**.

### 7.5 Checklist verify sau deploy VPS
- ☐ `docker compose run --rm --entrypoint "npx prisma migrate deploy" app` (chạy TỪ IMAGE MỚI, trước `up -d`) áp `20260713120000_content_blocks_phase3` OK; không `P2022`/`does not exist`.
- ☐ **Khối nội dung**: tạo khối có 2 biến thể + tag + loại `send_message` → hiện trong list; sửa; bật/tắt (khối tắt biến mờ + ẩn khỏi picker); tìm/lọc theo loại & trạng thái; xoá.
- ☐ Tạo khối loại `request_friend` / `status_change` → lưu OK, KHÔNG hiện trong picker Broadcast (chỉ `send_message` bật).
- ☐ **Luồng kịch bản**: tạo luồng, 1 bước chọn Khối `send_message` → text tự điền; sửa tay; thêm/sắp xếp/xoá bước; lưu; bật/tắt; xoá.
- ☐ **Broadcast wizard Step 2**: chọn chế độ "Khối nội dung (xoay vòng)" → danh sách là khối thật; tạo job vẫn ra **nháp (paused)** khi dry-run.
- ☐ Nhập biến `{{gender}}` (lạ) vào khối/bước → bị chặn (toast lỗi), không lưu.
- ☐ Log backend KHÔNG có tin Zalo gửi ra; nếu tới giờ job chạy chỉ thấy `[dry-run]`.

> Checklist QA web chi tiết (từng bước, có cột KQ): **`MARKETING_PHASE3_QA_CHECKLIST.md`**.

### 7.6 Trạng thái merge & deploy (cập nhật realtime)
- ☑ **Merge:** `feature/marketing-phase3-blocks-sequences` (commit `eb5fc85`) đã **fast-forward vào `main`** và **push `origin/main`** (2026-07-13). Working tree sạch; `.env` + `scratchpad/` KHÔNG bị track.
- ☐ **Deploy VPS:** CHỜ chạy (thứ tự: backup DB → `git reset --hard origin/main` → `docker compose build app` → `migrate deploy` từ image mới → `up -d app` → soi log). `.env` production giữ nguyên `MARKETING_DRY_RUN=true` + `VITE_MARKETING_DRY_RUN=true`.
- ☐ **QA web:** CHỜ deploy xong (theo `MARKETING_PHASE3_QA_CHECKLIST.md`).
- ⚠️ **Thứ tự migrate:** migrate PHẢI chạy từ **image mới** (`compose run --rm` hoặc sau `up -d` container mới) — KHÔNG dùng container cũ (prisma cũ chưa có migration file Phase 3).

### 7.7 Fix UI (2026-07-13) — route Mẫu tin nhắn & mojibake AddFlowModal
- ☑ **Mojibake AddFlowModal.vue:** file modal "Gắn thêm luồng bám đuổi" bị **double-encoded UTF-8→CP1252** (281 chuỗi hỏng: "BÃ¡m Ä‘uá»•i", "Chá»n luá»“ng"…) + có **BOM**. Đã khôi phục **per-line** (chỉ decode dòng mojibake, GIỮ nguyên 2 dòng đã đúng L54-55) → UTF-8 **không BOM**, 0 mojibake. Tổng dòng 525→525, chỉ đổi text (59 dòng), KHÔNG đụng logic (`manual-enroll`/`sequenceId`/`canNext`/`submitting` nguyên vẹn). Đây là file DUY NHẤT bị mojibake thật trong `frontend/src` (các file khác báo là chữ "ĐÃ/MÃ" hợp lệ — false positive).
- ✅ **Route "Mẫu tin nhắn": KHÔNG có bug code.** Audit `router/index.ts` + `CommunityMarketingShell.vue` + `marketingFeatureFlags.ts`:
  - `/marketing/message-templates` → `MessageTemplatesView` ✓ · `/marketing/content-blocks` → `ContentBlocksView` ✓
  - redirect `/marketing/templates` → `/message-templates` ✓ · `/marketing/blocks` → `/content-blocks` ✓
  - gate `messageTemplates` bật mặc định (opt-out) · `isActive` không xung đột prefix · không route trùng path/name · build sạch.
  - Các route/redirect này ĐÃ nằm trên `origin/main` (commit `eaacf63` + `d2c8219`). ⇒ Nếu production còn lỗi "click Mẫu tin nhắn không sang trang" thì **do bundle FE cũ chưa deploy lại** (Phase 3 deploy đang CHỜ) — **rebuild + redeploy frontend là hết**. Không cần sửa code route.
- ☐ **Verify sau deploy:** click "Mẫu tin nhắn" & "Khối nội dung" ra đúng 2 trang khác nhau; `/marketing/templates` redirect đúng; modal Gắn luồng hiển thị tiếng Việt có dấu chuẩn.
