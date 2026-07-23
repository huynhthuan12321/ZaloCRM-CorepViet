# Prompt cho Claude Code: xây trang "Báo cáo Automation" (/reports/automation)

> Dán khối "PROMPT" cho Claude Code chạy tại repo **ZaloCRM** (`D:\ZaloCRM-CorepViet`).
> Hiện `/reports/automation` ra TRANG TRẮNG vì menu `ReportsShell.vue` đã có tab "Automation"
> nhưng router THIẾU route + component. Cần xây thật báo cáo tổng hợp theo Sale/nick.

---

## ===== PROMPT (copy từ đây) =====

Bạn là kỹ sư full-stack cấp cao trong repo **ZaloCRM** (Node/Fastify/Prisma + Vue 3). Xây trang
**"Báo cáo Automation"** tại `/reports/automation` — bảng tổng hợp hiệu quả automation **theo Sale / theo
nick Zalo**, có bộ lọc thời gian (Hôm nay / Hôm qua / 7 ngày / Tuần này / Tháng này). Đọc code thật,
diff tối thiểu, **tuyệt đối org-scoped** (đây là báo cáo — rò rỉ chéo org là lỗi nghiêm trọng).

### Bối cảnh
- Menu đã có tab: `frontend/src/views/reports/ReportsShell.vue` → `{ to: '/reports/automation', label: 'Automation' }`.
- Router THIẾU route con `automation` → phải THÊM. Xem các report khác trong `frontend/src/router/index.ts`
  (tong-quan, nick, sale, broadcast...) + `meta: { resource: 'engagement_score' }` để làm y hệt.
- **Mẫu tham chiếu:** đọc `frontend/src/views/reports/BroadcastReport.vue` + endpoint của nó
  (`backend/src/modules/broadcast/broadcast-report-routes.ts`) — copy đúng pattern (fetch theo range,
  render bảng, org-scope, batch lookup nick/sale).
- Dữ liệu đã có sẵn (KHÔNG cần schema mới) — đọc schema.prisma để lấy đúng tên cột:
  - **Phễu kết bạn (Mục tiêu):** `FriendshipAttempt` — nhóm theo `zaloAccountId` (nick) + owner/sale, đếm
    theo `state` (sent / accepted / rejected / no_zalo / error).
  - **Bám đuổi (Phiên chăm sóc):** `care_session_events` (eventType `step_sent`) — số tin bám đuổi đã gửi;
    và `customer_reply` → số phản hồi. Nhóm theo nick (`nick_id`) + owner (`owner_user_id`).
  - **Broadcast:** `BroadcastRun` — sentCount / failedCount / skippedCount, nhóm theo nick của job.
  - **Reconnect:** `ZaloAccountStatusLog` — số lần nick reconnect trong range.
  - **Đủ trần (rate-limit):** đọc từ rate-limiter/`SdkLimit` nếu khả thi; nếu khó lấy chính xác → BỎ cột
    này (đừng bịa số).
- **Nick → Sale:** `ZaloAccount.ownerUserId` → `User.fullName`.

### Việc 1 — Backend: endpoint tổng hợp
Thêm `GET /api/v1/reports/automation?from=&to=` (org-scoped, gate `requireGrant('engagement_score','access')`
hoặc theo mẫu report khác). Trả:
```
{
  from, to,
  kpis: { kbGui, dongY, tuChoi, noZalo, bdGui, phanHoi, tongNick, nickOnline },
  bySale: [ { userId, saleName, kbGui, dongY, tuChoi, noZalo, bdGui, phanHoi, tiLeDongYPct, tiLePhanHoiPct } ],
  byNick: [ { zaloAccountId, nickName, saleName, kbGui, dongY, tuChoi, noZalo, bdGui, phanHoi, reconnect } ]
}
```
- Aggregate bằng `groupBy`/`count` Prisma theo range (`createdAt`/`sentAt`/`queuedAt` tuỳ bảng — đọc schema).
- Batch lookup nick + sale qua `Promise.all` + `Map` (KHÔNG N+1) — như BroadcastReport.
- **Mọi query PHẢI có `orgId` trong `where`** (org từ `request.user.orgId`).

### Việc 2 — Frontend: route + trang
- `frontend/src/router/index.ts`: thêm route con `{ path: 'automation', name: 'Reports.Automation',
  component: () => import('@/views/reports/AutomationReport.vue'), meta: { resource: 'engagement_score' } }`
  (đặt cạnh route `broadcast`).
- Tạo `frontend/src/views/reports/AutomationReport.vue` theo style `BroadcastReport.vue`:
  - Thanh chọn khoảng thời gian (Hôm nay / Hôm qua / 7 ngày / Tuần này / Tháng này) → gọi endpoint.
  - Dải KPI card (KB gửi · % Đồng ý · Bám đuổi gửi · % Phản hồi · Nick online/tổng...).
  - Bảng **theo Sale** + bảng **theo Nick** (cột: KB gửi, Đồng ý, Từ chối, No-Zalo, BĐ gửi, Phản hồi,
    tỉ lệ %, reconnect). Số 0 hiển thị bình thường, không crash khi rỗng.

### MVP & trung thực
- Chỉ hiển thị cột nào có DỮ LIỆU THẬT. Cột nào không lấy được chính xác (vd cảm xúc, chào-bị-chặn,
  khách-chặn nếu chưa track) → **BỎ hẳn**, đừng để cột 0 gây hiểu nhầm. Ghi chú trong PR những cột đã bỏ.
- Không cần đẹp như EE — đúng số + đọc được là đạt.

### Ràng buộc
- **Org-scoped tuyệt đối** (mọi query có orgId). RBAC theo mẫu report khác.
- KHÔNG đổi schema / KHÔNG migration.
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && npm run build` = 0 lỗi.
- **KHÔNG tự deploy.** Xong: liệt kê diff, cột đã làm / đã bỏ (kèm lý do dữ liệu), kết quả tsc/build,
  nhắc commit từ Windows + build VPS (không migrate).

## ===== HẾT PROMPT =====

---

## Ghi chú cho bạn
- Đây là feature lớn nhất còn lại (~2–3 ngày). Có thể bảo Claude Code làm MVP trước (phễu kết bạn + bám
  đuổi + broadcast theo sale/nick), rồi bổ sung reconnect/đủ-trần sau.
- Commit: `git add backend/... frontend/...` → push → VPS `git reset --hard origin/main` →
  `docker compose up -d --build app` (không migrate).
- Test: mở `/reports/automation` → không còn trắng, ra bảng có số. Đổi khoảng thời gian → số đổi theo.
