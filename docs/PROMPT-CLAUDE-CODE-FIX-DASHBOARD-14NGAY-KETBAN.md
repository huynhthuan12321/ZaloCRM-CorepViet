# Sửa Dashboard: biểu đồ "Tin nhắn 14 ngày" (đang trống) + "Kết bạn thành công" (đang 0%)

Vấn đề: trên Dashboard, biểu đồ **"Tin nhắn 14 ngày"** trống trơn và chỉ số **"Kết bạn thành công"** luôn 0%.
Nguyên nhân KHÔNG phải mất dữ liệu — mà là code để **stub trả 0** (chưa nối query thật), có comment `TODO`.
Sửa: nối query thật cho 2 chỗ này. Có sẵn query mẫu đang chạy trong dự án để tái sử dụng.

Bối cảnh mã nguồn (đã kiểm tra kỹ):

- Endpoint Dashboard: `backend/src/modules/dashboard/report-analytics-routes.ts`,
  route `GET /api/v1/reports/overview`.
  - Biến sẵn có trong handler: `orgId`, `now` (Date hiện tại), `start` / `end` (mốc của khoảng ngày báo cáo,
    từ `dateBounds(from, to)`).
  - **msgSeries (STUB cần sửa)** — khoảng dòng 167-172:
    ```ts
    // msgSeries last 14d — TODO heavy message aggregation, return shape with zeros
    const msgSeries: Array<{ date: string; sent: number; received: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
      msgSeries.push({ date: d, sent: 0, received: 0 }); // TODO: deepen — real msg series
    }
    ```
  - **Kết bạn (STUB cần sửa)** — trong khối `kpis`, khoảng dòng 192-194:
    ```ts
    friendAcceptRate: 0, // TODO: deepen
    friendInviteSent: 0, // TODO: deepen
    friendInviteAccepted: 0, // TODO: deepen
    ```
  - (BONUS tuỳ chọn — cùng khối `kpis`, dòng 184: `msgToday: 0, // TODO`. Lấy free từ query 14 ngày, xem dưới.)

- Query mẫu ĐANG CHẠY để tái dùng: `backend/src/modules/dashboard/report-routes.ts` (route
  `/api/v1/reports/messages`, khoảng dòng 62-77) — đếm tin nhắn theo ngày:
  ```sql
  SELECT DATE(m.sent_at) AS date,
    COUNT(*) FILTER (WHERE m.sender_type = 'self')    AS sent,
    COUNT(*) FILTER (WHERE m.sender_type = 'contact') AS received
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.org_id = ${orgId} AND m.sent_at >= ${from}::date AND m.sent_at < (${to}::date + interval '1 day')
  GROUP BY DATE(m.sent_at)
  ```
  (`sender_type = 'self'` = mình gửi; `'contact'` = khách gửi.)

- Nguồn dữ liệu kết bạn: model `FriendshipAttempt` (bảng `friendship_attempts`):
  - `sentAt` (cột `sent_at`) — thời điểm lời mời được **gửi đi thành công** (null nếu chưa gửi).
  - `state` — khi khách chấp nhận, `friend-event-handler.ts` set `state = 'accepted'` và `decidedAt = now`.
  - Có `orgId`. Đây là bảng audit lời mời kết bạn per (nick × khách).

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Chỉ sửa file `report-analytics-routes.ts`, trong handler `GET /api/v1/reports/overview`. KHÔNG đổi schema,
KHÔNG đụng endpoint/route khác.

### 1) Biểu đồ "Tin nhắn 14 ngày" — nối dữ liệu thật (14 ngày gần nhất tính đến hôm nay)

Thay khối stub `msgSeries` (dòng 167-172) bằng: chạy MỘT truy vấn đếm tin theo ngày cho 14 ngày gần nhất,
rồi đổ vào mảng 14 ngày (ngày nào không có tin → 0), giữ nguyên shape `{ date, sent, received }`:

```ts
// msgSeries — 14 ngày gần nhất, đếm tin thật (self = mình gửi, contact = khách gửi)
const seriesFromStr = new Date(now.getTime() - 13 * 86400000).toISOString().split('T')[0];
const todayStr = now.toISOString().split('T')[0];
const msgRows = await prisma.$queryRaw<Array<{ date: Date; sent: bigint; received: bigint }>>`
  SELECT DATE(m.sent_at) AS date,
    COUNT(*) FILTER (WHERE m.sender_type = 'self')    AS sent,
    COUNT(*) FILTER (WHERE m.sender_type = 'contact') AS received
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.org_id = ${orgId}
    AND m.sent_at >= ${seriesFromStr}::date
    AND m.sent_at < (${todayStr}::date + interval '1 day')
  GROUP BY DATE(m.sent_at)
`;
const msgByDay = new Map(
  msgRows.map((r) => {
    const key = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date);
    return [key, { sent: Number(r.sent), received: Number(r.received) }];
  })
);
const msgSeries: Array<{ date: string; sent: number; received: number }> = [];
for (let i = 13; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
  const v = msgByDay.get(d);
  msgSeries.push({ date: d, sent: v?.sent ?? 0, received: v?.received ?? 0 });
}
```

### 2) "Kết bạn thành công" — nối dữ liệu thật (theo khoảng ngày báo cáo `start`/`end`)

Trước khối `return { ... }`, thêm:

```ts
// Kết bạn — trong khoảng báo cáo: lời mời đã gửi vs được chấp nhận
const [friendInviteSent, friendInviteAccepted] = await Promise.all([
  prisma.friendshipAttempt.count({ where: { orgId, sentAt: { gte: start, lt: end } } }),
  prisma.friendshipAttempt.count({ where: { orgId, state: 'accepted', decidedAt: { gte: start, lt: end } } }),
]);
const friendAcceptRate = friendInviteSent > 0
  ? Math.round((friendInviteAccepted / friendInviteSent) * 1000) / 10
  : 0;
```

Rồi trong khối `kpis`, thay 3 dòng stub bằng biến vừa tính:
```ts
friendAcceptRate,       // thay: 0, // TODO
friendInviteSent,       // thay: 0, // TODO
friendInviteAccepted,   // thay: 0, // TODO
```

### 3) (BONUS tuỳ chọn) "Tin nhắn hôm nay"

Nếu muốn lấp luôn `msgToday` (dòng 184, đang `0`): lấy free từ phần tử cuối `msgSeries` (hôm nay):
```ts
const todaySeries = msgSeries[msgSeries.length - 1];
const msgToday = todaySeries ? todaySeries.sent + todaySeries.received : 0;
```
rồi ở `kpis` đổi `msgToday: 0, // TODO` → `msgToday,`. (Để `msgByBot` nguyên `0` — cần tách tin do bot gửi,
làm sau.) Nếu không chắc thì BỎ QUA mục 3, chỉ làm 1 và 2.

### Ràng buộc
- Dùng `prisma.$queryRaw` tham số hoá (như query mẫu) — KHÔNG nối chuỗi thủ công (tránh SQL injection).
- KHÔNG đổi shape trả về của endpoint (FE đang đọc `msgSeries: [{date,sent,received}]` và
  `kpis.friendInviteSent/friendInviteAccepted/friendAcceptRate`).
- KHÔNG đổi các stub `TODO` khác trong file (uptime, sdk, riskNicks quota... để lần sau).
- KHÔNG đổi schema, KHÔNG cần migration.

### Kiểm tra
- `cd backend && npx tsc --noEmit` = 0 lỗi; build = 0 lỗi; boot không trùng route.
- Xác nhận logic: `msgSeries` giờ có ngày có số > 0 (nếu 14 ngày qua có nhắn tin); `friendInviteSent` và
  `friendInviteAccepted` phản ánh số thật trong khoảng ngày; `friendAcceptRate` = accepted/sent × 100 (làm
  tròn 1 số lẻ), = 0 khi chưa gửi lời mời nào.
- Không tự đưa lên máy chủ. Xong báo diff.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — KHÔNG migration
1. Windows: `git add backend/src/modules/dashboard/report-analytics-routes.ts`
   → `git commit -m "fix(dashboard): bieu do tin nhan 14 ngay + ty le ket ban tu du lieu that"`
   → `git push origin main`
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 20`

## Lưu ý đọc kết quả
- Nếu sau khi sửa mà biểu đồ vẫn thấp/0: kiểm tra hệ có đang bị pause (không gửi tin) và 14 ngày qua thực sự
  có tin nhắn hay không — lúc đó 0 là ĐÚNG (đúng dữ liệu), không phải lỗi code nữa.
- "Kết bạn thành công" chỉ có số khi bạn thực sự dùng tính năng gửi lời mời kết bạn qua CRM (bảng
  `friendship_attempts` có bản ghi). Nếu bạn kết bạn thủ công ngoài app thì bảng này trống → vẫn 0 (đúng).
