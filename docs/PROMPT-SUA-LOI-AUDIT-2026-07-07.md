# Prompt: Sửa lỗi theo báo cáo audit ZaloCRM (2026-07-07)

> Dán khối "PROMPT" bên dưới cho AI agent có quyền đọc & sửa mã nguồn.
> Kèm theo file `AUDIT-ZALOCRM-2026-07-07.md` làm nguồn tham chiếu.
> Agent phải **giải thích trước, sửa sau**, diff tối thiểu, và tuân thủ ràng buộc cuối prompt.

---

## ===== PROMPT (copy từ đây) =====

Bạn là **kỹ sư phần mềm cấp cao** vá lỗi bảo mật & logic cho hệ automation nhắn tin Zalo (Node.js/TS +
Fastify + Prisma + Vue). Đầu vào: báo cáo `AUDIT-ZALOCRM-2026-07-07.md`. Nhiệm vụ: **sửa các lỗi theo
đúng thứ tự ưu tiên dưới đây**. Mỗi lỗi: (1) mở file đọc lại code thật để xác nhận vẫn còn lỗi, (2) nêu
root cause 1 câu, (3) đề xuất diff tối thiểu, (4) chờ xác nhận nếu thay đổi schema/hành vi, (5) sửa,
(6) nêu tiêu chí nghiệm thu.

### RÀNG BUỘC CHUNG
- **Không sửa lan man**: chỉ đụng đúng file/dòng liên quan lỗi. Không đổi format/style vùng khác.
- **Không phá tương thích**: giữ nguyên API contract; nếu buộc đổi, ghi rõ migration/ảnh hưởng.
- **Bảo toàn dữ liệu**: mọi migration Prisma phải additive; KHÔNG `--accept-data-loss`, KHÔNG `DROP COLUMN`.
- **Ưu tiên defense-in-depth**: vá cả điểm nhập (route) LẪN điểm dùng (cron/service).
- **Thêm test** cho mỗi lỗi logic sửa được (đặt trong `backend/tests/` hoặc cạnh module).
- Sau khi sửa: chạy `cd backend && npx tsc --noEmit` và `cd frontend && npm run build` (hoặc `vue-tsc`)
  để đảm bảo không vỡ type. Báo cáo kết quả.

---

### 🔴 P1 — B1+B2: Rò rỉ ContentBlock chéo tổ chức (SỬA ĐẦU TIÊN)

**Gốc lỗi:** id khối nội dung nhận từ client không được kiểm tra thuộc org, và nơi đọc khối
(`resolveJobContent`) không lọc `orgId`.

**Sửa 3 điểm:**
1. `backend/src/modules/broadcast/broadcast-routes.ts` (PATCH, ~dòng 211): trước khi gán
   `data.contentBlockIds`, validate ownership y như POST —
   `const n = await prisma.contentBlock.count({ where: { id: { in: blockIds }, orgId: user.orgId } });
   if (blockIds.length && n !== blockIds.length) return reply.status(400).send({ error: 'contentBlock_not_found' });`
2. `backend/src/modules/target/target-routes.ts` (`validateWelcome`, ~dòng 40-50 + PATCH ~216-242):
   **luôn** validate ownership `welcomeBlockIds` khi field có mặt trong body, KHÔNG return sớm chỉ vì
   `welcomeEnabled=false`. (Chặn khai thác 2 bước: ghi id bẩn khi tắt → bật sau.)
3. **Vá gốc (bắt buộc):** `backend/src/modules/broadcast/broadcast-cron.ts` `resolveJobContent()`
   (~dòng 191-193 và bản export dùng chung ở target-cron): thêm `orgId` vào `where` của
   `contentBlock.findMany`. Truyền `orgId` của job vào hàm (đổi signature: `resolveJobContent(job, count, orgId)`).
   Cập nhật cả 2 call-site (broadcast-cron `processRun`, target-cron `processWelcome`).

**Nghiệm thu:** PATCH broadcast/target với `contentBlockIds`/`welcomeBlockIds` chứa id của org khác →
trả 400. Dù có row bẩn tồn tại trong DB, cron KHÔNG bao giờ gửi nội dung ngoài org của job (findMany
lọc orgId trả rỗng → fallback messageText).

---

### 🔴 P2 — H1: API key public lưu plaintext

`backend/src/modules/api/public-api-routes.ts:14-24` + `webhook-settings-routes.ts:83`.
**Sửa:** lưu **SHA-256 hash** của key thay vì plaintext; khi xác thực, hash key nhận từ header rồi so khớp
hash. Khi tạo key mới: hiển thị key gốc **1 lần duy nhất** cho user, chỉ lưu hash.
- Thêm migration additive: cột `value_hash` (giữ `value_plain` tạm để migrate, sau đó dừng đọc plaintext).
- Viết script/đoạn migrate: với key hiện có, hash `value_plain` → ghi `value_hash`.
- Đổi truy vấn xác thực sang `where: { settingKey: 'public_api_key', valueHash: sha256(apiKey) }`.
**Nghiệm thu:** DB dump không còn lộ key dùng được; xác thực API cũ vẫn chạy sau migrate.

---

### 🟠 P3 — C1: Pre-check trần thiếu category `friend_lookup`

`backend/src/modules/target/target-cron.ts` (~dòng 85-87, `processJob`).
**Sửa:** khi `job.sourceType === 'customer_list'` (luồng gọi `findUser`), pre-check **cả**
`friend_lookup` VÀ `friend_action`; nếu một trong hai `!allowed` → bỏ tick (chưa tạo `FriendshipAttempt`).
Nguồn `group_scan` giữ nguyên (chỉ check `friend_action`).
**Nghiệm thu:** đặt trần `friend_lookup` thấp → chạy Mục tiêu nguồn Tệp KH → KHÔNG sinh
`TargetRunItem status='failed'` với `RATE_LIMITED`; contact được thử lại tick sau khi quota hồi.

---

### 🟠 P4 — C2: Gửi trùng tin (send-before-record)

`broadcast-cron.ts:128-168` (`processRun`) và `target-cron.ts` (`processWelcome`).
**Sửa (idempotency):** ghi row đánh dấu **TRƯỚC** khi gọi Zalo:
- Thêm `@@unique([runId, entryId])` cho `BroadcastRunItem` (migration additive) — xem P6.
- Đổi thứ tự: tạo `BroadcastRunItem` trạng thái `sending` (hoặc claim bằng `create` bắt lỗi P2002) →
  gọi Zalo → `update` sang `sent`/`failed`. Nếu `create` ném unique-violation → recipient đã được tick
  khác/đợt trước xử lý → skip, không gửi lại.
- Với `processWelcome`: dùng chính `welcomeStatus` — chuyển `waiting → sending` bằng `updateMany`
  có điều kiện (`where: { id, welcomeStatus: 'waiting' }, data: { welcomeStatus: 'sending' }`) và chỉ
  gửi nếu `count === 1` (optimistic lock) → tránh 2 tick cùng gửi 1 khách.
**Nghiệm thu:** mô phỏng throw sau khi `sendMessage` resolve → recipient KHÔNG bị gửi lần 2 ở tick sau.

---

### 🟠 P5 — D1: Rate-limiter fail-open cho luồng hàng loạt

`backend/src/modules/zalo/zalo-rate-limiter.ts:35-48`.
**Sửa:** thêm tham số/biến thể **fail-closed** cho automation. Ví dụ `checkLimits(accountId, category,
{ failClosed?: boolean })`: khi `failClosed` và có exception (Redis/Postgres lỗi) → trả
`{ allowed: false, reason: 'limiter_unavailable' }`. Gọi với `failClosed: true` từ broadcast-cron &
target-cron; giữ fail-open cho thao tác tương tác đơn lẻ của sale.
**Nghiệm thu:** ngắt Redis khi 1 broadcast job active → worker DỪNG gửi (không spam), chat tay của sale vẫn chạy.

---

### 🟡 P6 — E3/C4: Unique constraint chống gửi trùng ở tầng DB

`backend/prisma/schema.prisma` model `BroadcastRunItem`.
**Sửa:** thêm `@@unique([runId, entryId])` + migration additive. (Nền tảng cho P4 và chặn cả trường hợp
2 instance.) Ghi chú vận hành: không chạy >1 replica app trừ khi có distributed lock.

---

### 🟡 P7 — D4: Reset bộ đếm ngày theo giờ VN

`zalo-rate-limiter.ts:52,68,92,107`. Đổi key ngày từ UTC (`toISOString().split('T')[0]`) sang **UTC+7**
(tái dùng cách tính trong `broadcast-service.ts`). Nghiệm thu: counter reset lúc 00:00 VN, khớp khung 8h-21h.

---

### 🟡 P8 — C3: Dedup cron O(n) phình dần

`broadcast-cron.ts` + `target-cron.ts` (dedup `notIn: doneIds`). Chuyển sang cursor theo `rowIndex`/
`lastSeenAt`, HOẶC đánh dấu trực tiếp trên `CustomerListEntry`/`GroupMember`. (Sau P4/P6, có thể suy ra
tiến độ từ RunItem — cân nhắc thiết kế lại truy vấn "recipient kế tiếp" bằng LEFT JOIN thay vì `notIn`.)

---

### ⚪ P9 — A1 + D2: Nhất quán & cảnh báo vận hành

- A1: bọc `startBroadcastCron/startTargetCron` trong `if (config.nodeEnv !== 'test')` (app.ts:409-414).
- D2: log cảnh báo lúc start nếu `NODE_ENV=production` mà không kết nối được Redis.

---

### Việc CHƯA audit — kiểm tra thêm khi có thời gian (KHÔNG bắt buộc trong đợt này)
`downloadMediaToTemp` (timeout/cleanup/giới hạn kích thước), `webhook-service.ts` (auth/validate),
refresh-token rotation chi tiết, owner-scope `list-routes.ts`, `ListDetailView.vue` (vùng vừa sửa scroll),
index cho query cron nóng theo `status/nextRunAt` trên BroadcastJob/TargetJob. Nếu frontend hiển thị nội
dung tin bằng `v-html` → phải sanitize (kiểm tra BroadcastsView/ContentBlocksView).

---

### Đầu ra yêu cầu
Sau mỗi P#: nêu diff đã áp + tiêu chí nghiệm thu đã đạt. Cuối cùng: danh sách migration mới, danh sách
test đã thêm, kết quả `tsc`/`build`, và checklist deploy. **Không tự deploy** — chỉ chuẩn bị commit.

## ===== HẾT PROMPT =====

---

## Ghi chú cho người dùng (quy trình an toàn)

1. **Thứ tự triển khai:** làm P1→P2 trước (bảo mật, khai thác được ngay), deploy, rồi P3→P5, cuối cùng
   P6→P9 gộp 1 đợt.
2. **Sau mỗi nhóm sửa:** commit **từ máy Windows** (`git add -A && git commit && git push`), rồi deploy
   VPS theo `docs/TONG-QUAN-PHAN-MEM-ZALOCRM.md §5` (nhớ `prisma migrate deploy` cho P2/P6).
3. **P4/P6 đổi schema** → backup DB trước:
   `docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-truoc-fix-audit.sql`.
4. Ưu tiên **viết test cho C1/C2/computeNextRunAt** — đây là logic dễ tái phát lỗi, cần lưới tự động.
