# Sửa cột "Im lặng" ở báo cáo Engagement (widget "KH đang nguội cần cứu")

Vấn đề: cột "Im lặng" luôn hiển thị 0 ngày cho mọi khách. Nguyên nhân: `silentDays` đang tính theo
`Contact.stuckSinceAggregate`, mà trường này đang null cho tất cả (pipeline phát hiện kẹt chưa được cấu
hình). Sửa: tính "im lặng" theo `Contact.lastInboundAt` (số ngày kể từ khách nhắn cuối) — luôn có dữ liệu.

Bối cảnh mã nguồn (đã kiểm tra):
- `backend/src/modules/dashboard/report-analytics-routes.ts` — endpoint báo cáo Engagement. Đoạn `cooling`
  (khoảng dòng 813-827) tạo danh sách "KH đang nguội cần cứu":
  - Query: `prisma.contact.findMany({ where:{orgId, mergedInto:null, engagementPattern:{in:['cooling','cold']}},
    orderBy:{ stuckSinceAggregate:'asc' }, take:5, select:{ id, fullName, leadScore, stuckSinceAggregate,
    assignedUser } })`
  - Map: `silentDays: c.stuckSinceAggregate ? floor((now - stuckSinceAggregate)/86400000) : 0`
- `Contact` có trường `lastInboundAt` (đã dùng ở aggregate-contact) và `lastActivity`.

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Trong `report-analytics-routes.ts`, ở đoạn tạo danh sách `cooling` ("KH đang nguội cần cứu"):

1. Đổi `select` của query `coolingContacts`: BỎ `stuckSinceAggregate`, THÊM `lastInboundAt: true` và
   `lastActivity: true` (giữ id, fullName, leadScore, assignedUser).
2. Đổi `orderBy` từ `{ stuckSinceAggregate: 'asc' }` → `{ lastInboundAt: { sort: 'asc', nulls: 'last' } }`
   (khách im lâu nhất lên đầu).
3. Đổi cách tính `silentDays` trong `.map(...)`:
   - Dùng mốc = `c.lastInboundAt ?? c.lastActivity` (ưu tiên tin khách nhắn cuối; nếu null thì dùng lastActivity).
   - `silentDays = mốc ? Math.max(0, Math.floor((now.getTime() - new Date(mốc).getTime()) / 86400000)) : 0`.
   - `Math.max(0, ...)` để tránh số âm nếu có dữ liệu ngày tương lai (dữ liệu test).

KHÔNG đổi widget "kẹt" (stuck) khác (nó lọc `stuckSinceAggregate not null` — để nguyên, đó là khái niệm riêng).
KHÔNG đổi schema. Giữ nguyên phần còn lại của endpoint.

### Kiểm tra
- `cd backend && npx tsc --noEmit` = 0 lỗi; build = 0 lỗi; boot không trùng route.
- Xác nhận: danh sách "cần cứu" giờ hiện `silentDays` = số ngày kể từ khách nhắn cuối (khác 0 với khách đã im
  vài ngày), sắp theo im-lâu-nhất trước; khách chưa từng nhắn → 0.
- Không tự đưa lên máy chủ. Xong báo diff.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — KHÔNG migration
1. Windows: `git add backend/src/modules/dashboard/report-analytics-routes.ts` → `git commit -m "fix(report): tinh im lang theo lastInboundAt"` → `git push origin main`
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 20`
