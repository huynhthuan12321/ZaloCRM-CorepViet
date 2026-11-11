# Broadcast — Lọc người nhận theo NHÃN (tag) đã gắn

Mục tiêu: khi chọn nguồn "Bạn bè đã kết bạn", cho phép **lọc theo nhãn Zalo đã gắn** (VD chỉ gửi cho khách
có nhãn "Khách quan tâm"), thay vì bắn hết toàn bộ bạn bè. Không tạo nguồn mới — thêm bộ lọc nhãn vào nguồn
`friends` sẵn có.

**Quy tắc lọc: AND** — chọn nhiều nhãn thì khách phải có ĐỦ TẤT CẢ nhãn đã chọn mới nhận tin.
**Không chọn nhãn nào → giữ nguyên hành vi cũ** (gửi hết bạn bè đã kết bạn). Tính năng này cộng thêm, KHÔNG
phá job cũ.

Bối cảnh mã nguồn (đã kiểm tra kỹ):

- Nhãn lưu ở `Friend.zaloLabels` (Json, mảng `[{id,name,color}]`, cột `zalo_labels`). Lọc theo **name**.
  Nhãn là **per-nick** (theo `zalo_account_id`). Chỉ xét bạn bè `friendship_status = 'accepted'`.
- Model job: `BroadcastJob` trong `backend/prisma/schema.prisma`. Hiện có `sourceType`, `customerListId`,
  `zaloAccountId`, `maxPerRun`... Cần THÊM 1 cột lưu nhãn đã chọn.
- `backend/src/modules/broadcast/broadcast-routes.ts`:
  - type `JobBody` (~dòng 28-29): `sourceType?: 'customer_list' | 'friends'`.
  - `POST /api/v1/broadcast-jobs` (~dòng 128-192): tạo job.
  - `POST /api/v1/broadcast-jobs/audience-count` (~dòng 315-362): dry-run đếm người nhận; nhánh `friends`
    (~dòng 336-341) đang đếm `prisma.friend.count({ where:{ zaloAccountId: nick.id, friendshipStatus:'accepted' }})`.
- `backend/src/modules/broadcast/broadcast-cron.ts`:
  - `materializeAudience(runId, job)` (~dòng 120-165): nhánh `friends` (~dòng 126-133) lấy
    `prisma.friend.findMany({ where:{ zaloAccountId, friendshipStatus:'accepted' }, orderBy:{ becameFriendAt:'asc' }, take: maxPerRun })`.
  - Job được `select` ở ~dòng 60 (cần bổ sung `friendLabels` vào select và vào type tham số `job`).
- `frontend/src/views/marketing/BroadcastsView.vue`: wizard 4 bước (1 file). Nút nguồn `friends`/`customer_list`
  (~dòng 101-102), hàm `setSource` (~dòng 363), `countAudience` gọi `POST /broadcast-jobs/audience-count`
  (~dòng 376-378), reset `form` (~dòng 417), state `form` (~dòng 328).

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

### 1) Schema + migration (thêm cột, KHÔNG phá dữ liệu)

Trong `schema.prisma`, model `BroadcastJob`, thêm:
```prisma
friendLabels String[] @default([]) @map("friend_labels")
```
Tạo migration tên `20260804090000_broadcast_friend_labels` (hoặc timestamp hiện tại) — chỉ `ADD COLUMN
friend_labels text[] NOT NULL DEFAULT '{}'`. KHÔNG sửa cột khác.

### 2) Backend — lưu + lọc theo nhãn (AND)

**a. type `JobBody`** (broadcast-routes.ts): thêm `friendLabels?: string[]`.

**b. `POST /broadcast-jobs`**: khi `sourceType === 'friends'`, chuẩn hoá nhãn:
`const friendLabels = Array.from(new Set((b.friendLabels ?? []).map(s => String(s).trim()).filter(Boolean)));`
Lưu vào `prisma.broadcastJob.create({ data: { ..., friendLabels } })`. Khi `sourceType === 'customer_list'`
thì `friendLabels: []`. (PATCH có thể bỏ qua ở bước này để giữ gọn.)

**c. Hàm lọc dùng chung** — thêm helper trả danh sách Friend đã kết bạn của nick, lọc AND theo nhãn:
```ts
// Trả friend đã kết bạn của nick; nếu có labels → chỉ giữ friend có ĐỦ TẤT CẢ nhãn (AND).
async function findFriendsByLabels(
  zaloAccountId: string, labels: string[], take: number
): Promise<Array<{ id: string; zaloUidInNick: string; zaloDisplayName: string | null }>> {
  if (!labels.length) {
    return prisma.friend.findMany({
      where: { zaloAccountId, friendshipStatus: 'accepted' },
      orderBy: { becameFriendAt: 'asc' }, take,
      select: { id: true, zaloUidInNick: true, zaloDisplayName: true },
    });
  }
  return prisma.$queryRaw<Array<{ id: string; zaloUidInNick: string; zaloDisplayName: string | null }>>(
    Prisma.sql`
      SELECT id, zalo_uid_in_nick AS "zaloUidInNick", zalo_display_name AS "zaloDisplayName"
      FROM friends
      WHERE zalo_account_id = ${zaloAccountId}
        AND friendship_status = 'accepted'
        AND (
          SELECT COUNT(DISTINCT e->>'name')
          FROM jsonb_array_elements(zalo_labels) e
          WHERE e->>'name' = ANY(ARRAY[${Prisma.join(labels)}]::text[])
        ) = ${labels.length}
      ORDER BY became_friend_at ASC NULLS LAST
      LIMIT ${take}
    `
  );
}
```
Đặt helper này ở nơi cả `broadcast-cron.ts` (materializeAudience) và `broadcast-routes.ts` (audience-count)
dùng được — gợi ý: export từ `broadcast-cron.ts` hoặc tạo `broadcast-audience.ts` rồi import 2 nơi. Nhớ
`import { Prisma } from '@prisma/client'`.

**d. `materializeAudience`** (broadcast-cron.ts): nhánh `friends` gọi
`findFriendsByLabels(job.zaloAccountId, job.friendLabels ?? [], job.maxPerRun)` thay cho `findMany` cũ.
Bổ sung `friendLabels: true` vào `select` job (~dòng 60) và thêm `friendLabels: string[]` vào type tham số `job`.

**e. `POST /broadcast-jobs/audience-count`**: nhận thêm `friendLabels?: string[]` trong Body. Nhánh `friends`:
dùng `findFriendsByLabels(nick.id, labels, LỚN)` rồi `total = rows.length` (hoặc viết `COUNT` tương đương với
cùng điều kiện AND). `willSend = Math.min(total, maxPerRun)`. `breakdown.friendsAccepted = total`. Khi labels
rỗng thì giữ đúng cách đếm cũ (nhanh hơn).

### 3) Backend — endpoint liệt kê nhãn để chọn (cho dropdown)

Thêm `GET /api/v1/broadcast-jobs/friend-labels?zaloAccountId=...` (org-scoped, kiểm tra nick thuộc org):
trả các nhãn đang gắn trên bạn bè ĐÃ kết bạn của nick + số lượng, để UI hiện "Khách quan tâm (45)":
```sql
SELECT e->>'name' AS name, COUNT(DISTINCT f.id)::bigint AS n
FROM friends f
CROSS JOIN LATERAL jsonb_array_elements(f.zalo_labels) e
WHERE f.zalo_account_id = ${zaloAccountId}
  AND f.friendship_status = 'accepted'
  AND e->>'name' IS NOT NULL AND e->>'name' <> ''
GROUP BY e->>'name'
ORDER BY n DESC
```
Trả `{ labels: [{ name, count }] }` (count = Number(n)). Tham số hoá `$queryRaw`.

### 4) Frontend (`BroadcastsView.vue`)

- Thêm state: `form.friendLabels: string[]` (mặc định `[]`); `availableLabels: Array<{name;count}>`.
- Khi `form.sourceType === 'friends'` và đã chọn `form.zaloAccountId`: gọi
  `GET /broadcast-jobs/friend-labels?zaloAccountId=...` để nạp `availableLabels`. Hiện một khối "Lọc theo nhãn"
  (multi-select bằng chip/checkbox) NGAY DƯỚI nút nguồn `friends`. Mỗi nhãn hiện `name (count)`. Bấm chọn/bỏ
  → cập nhật `form.friendLabels`. Ghi chú nhỏ: "Chọn nhiều nhãn = khách phải có đủ tất cả nhãn."
- Khi đổi nick hoặc đổi nguồn: reset `form.friendLabels = []` và nạp lại `availableLabels` (nhãn theo nick).
- `countAudience`: gửi kèm `friendLabels: form.sourceType === 'friends' ? form.friendLabels : undefined`.
- Payload tạo job (`POST /broadcast-jobs`): thêm `friendLabels: form.sourceType === 'friends' ? form.friendLabels : []`.
- `setSource` và `resetForm`: đảm bảo reset `friendLabels = []`.
- Nếu `availableLabels` rỗng: hiện dòng "Nick này chưa có nhãn nào trên bạn bè — sẽ gửi cho tất cả bạn bè."

### Ràng buộc
- Không chọn nhãn → hành vi y hệt hiện tại. KHÔNG đổi logic khung giờ 8–21h, quota, giãn cách chống block.
- `$queryRaw` phải tham số hoá (Prisma.sql / Prisma.join) — không nối chuỗi tay.
- KHÔNG đụng nguồn `customer_list` và các phần khác của wizard.

### Kiểm tra
- `cd backend && npx tsc --noEmit` = 0 lỗi; build 0 lỗi; boot không trùng route; migration tạo đúng 1 cột.
- `cd frontend && npm run build` = 0 lỗi.
- Xác nhận logic: chọn 1 nhãn → count giảm còn đúng số bạn bè có nhãn đó; chọn 2 nhãn → chỉ còn bạn bè có
  CẢ 2 nhãn (AND); bỏ hết nhãn → count = tổng bạn bè như cũ.
- Không tự đưa lên máy chủ. Xong báo diff + nêu tên file migration.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — CÓ MIGRATION
1. Windows: `git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modules/broadcast frontend/src/views/marketing/BroadcastsView.vue`
   → `git commit -m "feat(broadcast): loc nguoi nhan theo nhan Zalo (AND)"` → `git push origin main`
   (LƯU Ý: `git add` từng đường dẫn cụ thể — KHÔNG `git add -A`.)
2. Máy chủ:
   ```
   cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main
   docker compose run --rm app npx prisma migrate deploy
   docker compose up -d --build app
   docker logs zalo-crm-app --tail 20
   ```
   (Dockerfile KHÔNG tự migrate — phải chạy `migrate deploy` trước khi build lại app.)
