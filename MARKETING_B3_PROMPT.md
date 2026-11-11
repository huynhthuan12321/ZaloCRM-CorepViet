# PROMPT TRIỂN KHAI B3 — Mục tiêu wizard 4 bước + drawer chi tiết (EE)

> Copy toàn bộ phần dưới đây vào session Claude Code mới trên repo `D:\ZaloCRM-CorepViet`.

---

Triển khai hạng mục **B3 — "Mục tiêu" wizard 4 bước + drawer chi tiết** cho module Marketing của ZaloCRM-CorepViet, theo spec EE đã chốt. KHÔNG gửi Zalo thật ở bất kỳ bước nào.

## 0. Đọc trước khi code (bắt buộc, theo thứ tự)

1. `MARKETING_REVIEW_INPUT.md` — **Lượt 6** là spec chi tiết nhất (transcribe 6 ảnh HS Holding CRM); mục 3 là kết quả đối chiếu + quyết định đã chốt. Quy ước: khi spec chữ lệch ảnh thì **theo ảnh**.
2. `MARKETING_EE_GAP_TODO.md` — mục B3 (checklist gap) + mục 0 (định vị: build EE đầy đủ, feature-flag opt-out) + nhóm A3 (cơ chế dry-run 2 tầng).
3. `MARKETING_ADR_001_facade_strategy.md` — chiến lược schema: legacy là contract ghi, facade `/api/v1/marketing/*` chỉ đọc, migration phải additive.
4. Code hiện trạng: `frontend/src/views/marketing/TargetsView.vue` (modal 1 trang sẽ thay bằng wizard), `backend/src/modules/target/target-routes.ts`, `backend/src/modules/target/target-cron.ts`, model `TargetJob`/`TargetRunItem` trong `backend/prisma/schema.prisma` (~dòng 4279), `backend/src/modules/automation/care-session-listener.ts` + `care-session-cron.ts` (Phase 2 bám đuổi), pattern tách logic thuần: `frontend/src/utils/broadcast-wizard-logic.ts` + `.spec.ts`, `backend/tests/broadcast-wizard.test.ts`.

## 1. Phạm vi — Wizard 4 bước (thay modal 1 trang trong `TargetsView.vue`)

Thanh tiến trình: `1 Tệp + Nick + Skip → 2 Lời chào + Chuỗi → 3 Quy tắc gửi an toàn → 4 Xem trước + Bắt đầu`. Mỗi bước validate xong mới cho "Tiếp →"; có "Quay lại" và "Huỷ".

### Bước 1 — Tệp + Nick + Quy tắc bỏ qua
- **Tên Mục tiêu** (bắt buộc).
- **Tệp khách hàng** (bắt buộc, chọn 1): dropdown tệp, cạnh ô hiện badge số SĐT (vd `30 SĐT`). Giữ nguồn `group_scan` hiện có (chọn nick trước rồi chọn scan) — wizard hỗ trợ cả 2 nguồn như code cũ.
- **Nick gửi mời — CHỌN NHIỀU** (bắt buộc ≥1): card mỗi nick hiện `Online/Offline · KB n/300 · Tin n/300` (hạn mức còn lại trong ngày — lấy từ SdkLimit/zaloRateLimiter, category friend_action + message). Nick offline vẫn hiện nhưng disable + tự loại khỏi selection. Đây là thay đổi lớn: model hiện tại chỉ có 1 `zaloAccountId`.
- **Quy tắc bỏ qua** (3 checkbox, mặc định BẬT): (a) bỏ KH đã có chat 1-1 trước; (b) bỏ KH đã là bạn — kèm dropdown phạm vi, chỉ cần 1 option "Bạn với nick trong danh sách"; (c) bỏ KH không có Zalo.
- Header bước ghi "Bắt buộc · ~30 giây".

### Bước 2 — Lời chào + Chuỗi tin (5 tin)
- **Lời mời kết bạn** (bắt buộc, badge "Bắt buộc"): textarea ≤200 ký tự + counter `n/200` (map vào `requestMsg` hiện có).
- **Tin 1 — Tin chào mừng** (badge "Hộp người lạ", toggle BẬT/TẮT + "chờ sau khi mời" số + đơn vị giây/phút/giờ): gửi qua stranger inbox **ngay sau khi gửi lời mời, KHÔNG chờ đồng ý** ("Spam HẾT luồng"). ⚠️ KHÁC cơ chế welcome hiện tại (`welcomeMsg` gửi khi ACCEPTED) — đây là tin mới.
- **Tin 2 — Cảm ơn khi khách đồng ý kết bạn** (badge "Sau khi đồng ý", toggle + delay): tương đương `welcomeEnabled/welcomeMsg/welcomeBlockIds` hiện có — tái dùng, đổi nhãn.
- **Tin 3 — Nhắc khi chưa đồng ý** (toggle + delay): gửi qua stranger inbox nếu sau N giờ chưa accept.
- **Tin 4 — Bám đuổi khi bị từ chối** (toggle + delay).
- Cả 5 tin hỗ trợ biến `{gender}` `{name}` `{sale}` (nút chèn biến; validate chặn biến lạ như broadcast wizard).
- **Báo nội bộ khi sự kiện xảy ra** (khối trong mỗi tin): 3 đích — "Sale phụ trách nick" (checkbox hoạt động thật, nhãn "Hoạt động"), "Quản lý của Sale" + "Nhóm Zalo báo cáo" (**disable + badge "Đang phát triển"** — KHÔNG implement backend cho 2 đích này, chính bản HS Holding cũng chưa xong).

### Bước 3 — Quy tắc gửi an toàn
- **Bỏ qua KH đã kết bạn nhiều nick**: input số threshold, `0 = không filter` (badge), hint "chỉ đếm nick trong phạm vi phòng/dept (RBAC)".
- **Bám đuổi (sau lời chào kết bạn)**: (a) "Delay sau lời mời → bước 1 bám đuổi": số + đơn vị, mặc định **1 giờ**, hint "KH KHÔNG cần accept vẫn nhận đủ chuỗi qua stranger inbox"; (b) "Pause khi KH tương tác": số + đơn vị, mặc định **1 ngày**, hint "KH reply tiếp → reset; reply giữa chuỗi → cancel job pending + notify KHẨN sale". Cơ chế pause/cancel đã có trong care-session-listener — nối vào, không viết lại.
- **Phản ứng nâng cao — 2 rule CỐ ĐỊNH, hiển thị READ-ONLY** (dropdown disabled): tích cực (tim/like/hoa) → "KHÔNG dừng chuỗi (chỉ +5 điểm CRM)"; tiêu cực (giận/dislike/tim vỡ) → "Pause 48h + -5 điểm + notify sale". Backend: constants, không cho config.
- Footer: "Bước 3/4 · Quy tắc này áp dụng riêng cho Mục tiêu này."

### Bước 4 — Xem trước + Bắt đầu
- Bảng "Quy tắc gửi an toàn (đã cấu hình ở Bước 3)" hiện giá trị thật: Giờ hoạt động `06:00–22:00` (16 giờ/ngày) · Khoảng cách giữa các lần gửi (từ delaySecMin/Max) · Bỏ qua KH gần đây cross-nick `30 ngày` · Threshold nhiều nick · Delay sau kết bạn · Tạm dừng khi reply.
- **Preview tin** render biến bằng KH mẫu (vd "Anh Nguyễn Văn A") — tái dùng pattern `renderBroadcastPreview`.
- **Thời điểm bắt đầu** (bắt buộc): radio "Bắt đầu ngay" / "Hẹn lịch" (datetime picker, chỉ cho chọn trong khung 6h–22h giờ VN — validate cả FE lẫn BE).
- Nút **"Bắt đầu chạy Mục tiêu"**: khi `VITE_MARKETING_DRY_RUN=true` → tạo job `status='paused'` (nháp) + banner "Dry-run · không gửi thật" giống broadcast wizard; khi hẹn lịch → job `scheduled` chờ tới giờ. Footer: "Sau khi bắt đầu vẫn có thể tạm dừng/sửa bất cứ lúc nào."

## 2. Phạm vi — Drawer chi tiết (bấm 1 dòng trong list)

Drawer bên phải (pattern `BroadcastDetailDrawer.vue`):
- Header: tên + badge trạng thái + "tạo {ngày} · {người tạo}" + menu ⋯.
- 4 thẻ: **TRONG TỆP / ĐÃ XỬ LÝ / CÓ ZALO / KHÔNG ZALO** (đúng nhãn "ĐÃ XỬ LÝ" theo ảnh, không phải "Đã gửi").
- **PHASE 1 · MỜI KẾT BẠN**: "Tiến độ Phase 1 n/m" + breakdown: Đã gửi lời mời / Đồng ý kết bạn / Từ chối / Đang chờ phản hồi (nguồn: `TargetRunItem` + `FriendshipAttempt.state`).
- **PHASE 2 · CHUỖI BÁM ĐUỔI (WELCOME → FOLLOW-UP)**: "n KH đã nhận tin đầu" + breakdown: Đã gửi tin Welcome / Đang chạy bước tiếp / Hoàn tất chuỗi / Dừng (reply/block) (nguồn: `CareSession` sourceType='target_followup' + events).
- **TOP 3 NICK THEO TỈ LỆ ACCEPT** (đúng Top 3 theo ảnh): bảng Nick / Gửi / Accept / % + progress bar.
- Nút **"Mở trang chi tiết đầy đủ →"** (route `/marketing/targets/:id`, dashboard + nhật ký log — nếu quá lớn thì để lại nút disabled "Đang phát triển" và ghi vào docs, ưu tiên drawer xong trước).
- List Mục tiêu nâng theo ảnh 1: thẻ tổng (đang bật x/y, khách đã vào, hoàn thành, % phản hồi), lọc đủ trạng thái (Tất cả/Đang chạy/Tạm dừng/Hoàn tất/Hẹn lịch/Nháp/Đã xóa) — thêm trạng thái `scheduled` + soft-delete nếu chưa có.

## 3. Backend

- **Schema (migration ADDITIVE thuần — ADD COLUMN có DEFAULT / CREATE INDEX / bảng con mới, KHÔNG đổi/xoá cột cũ):** mở rộng `TargetJob` cho: multi-nick (`zaloAccountIds String[] @default([])` — job cũ fallback `zaloAccountId`; cron phân phối round-robin/ưu tiên nick còn quota), chuỗi tin (đề xuất JSON `messageChain` gồm 4 tin: enabled/text/delayValue/delayUnit — hoặc cột riêng nếu gọn hơn), skip rules (3 boolean), threshold, pauseOnReplyHours, `startAt DateTime?` + status `scheduled`, notify config (chỉ đích sale). Job cũ trên production phải chạy tiếp không lỗi (default = hành vi cũ).
- **Defaults tập trung** trong `backend/src/config/index.ts` (không hard-code UI): khoảng cách gửi 60s, cross-nick skip 30 ngày, delay sau lời mời 60 phút, pause khi reply 24h, reaction tiêu cực pause 48h, điểm ±5, khung giờ 06:00–22:00 VN, cap 300 KB + 300 tin/nick/ngày.
- **Routes** (`target-routes.ts`, giữ prefix legacy `/api/v1/target-jobs` theo ADR-001): mở rộng POST/PATCH nhận field mới (validate: ≤200 ký tự lời mời, ≥1 nick, biến whitelist, hẹn lịch trong 6h–22h); thêm `GET /api/v1/target-jobs/:id/stats` (org-scoped + owner-scope RBAC) trả 4 thẻ + Phase 1/2 breakdown + top nick — logic tính tách file thuần `target-stats-helpers.ts` để unit-test.
- **Cron** (`target-cron.ts`): multi-nick dispatch + gửi Tin 1/Tin 3/Tin 4 theo lịch chuỗi. MỌI call-site gửi thật phải nằm sau gate `config.marketingDryRun` như A3 (dry-run ghi `skipped:dry_run`, KHÔNG gọi `attemptFriendRequest*`). Job `scheduled` chỉ chạy khi tới `startAt` và trong khung giờ.

## 4. Ràng buộc an toàn (tuyệt đối)

1. KHÔNG tắt/đổi `MARKETING_DRY_RUN` + `VITE_MARKETING_DRY_RUN`; không resume job active; không gửi Zalo thật khi test.
2. Migration additive thuần, an toàn `prisma migrate deploy` trên DB đang có dữ liệu.
3. Org-scoping mọi query (`orgId` tường minh) + owner-scope RBAC như route care-sessions.
4. Backward compat: job TargetJob cũ (1 nick, welcomeMsg, followupSequenceId) chạy tiếp đúng hành vi cũ.
5. Không commit `.env`, log, dump.

## 5. Kiểm thử + Definition of Done

- Logic thuần FE tách `frontend/src/utils/target-wizard-logic.ts` + `.spec.ts` (validate từng bước, build payload, dry-run → paused, render preview) — pattern broadcast-wizard.
- Backend: unit test helpers stats + route test (validate 200-char, multi-nick, org-isolation 404, scheduled ngoài khung giờ → 400) — pattern `broadcast-wizard.test.ts`.
- `backend tsc --noEmit` PASS · `frontend vue-tsc + vite build` PASS · baseline test fail KHÔNG tăng.
- UI đủ loading/empty/error/toast; không nút chết.
- Cập nhật `MARKETING_EE_GAP_TODO.md` (B3 ☑ từng dòng) + tạo `MARKETING_B3_IMPLEMENTATION.md` (đã làm/chưa làm/test/rủi ro — theo format `MARKETING_BROADCAST_WIZARD_IMPLEMENTATION.md`).
- Commit: `feat(marketing): target wizard 4 steps + detail drawer (dry-run safe)` — làm trên branch `feature/marketing-b3-target-wizard`, CHƯA merge main khi chưa được xác nhận.

## 6. Gợi ý chia đợt (nếu 1 session không đủ)

- **B3a**: schema + config defaults + routes mở rộng + stats endpoint + tests backend.
- **B3b**: wizard 4 bước FE + logic thuần + tests FE.
- **B3c**: drawer chi tiết + list nâng cấp (thẻ tổng/lọc/scheduled/soft-delete).
Mỗi đợt build pass rồi mới sang đợt sau; ghi trạng thái vào `MARKETING_B3_IMPLEMENTATION.md` sau mỗi đợt.
