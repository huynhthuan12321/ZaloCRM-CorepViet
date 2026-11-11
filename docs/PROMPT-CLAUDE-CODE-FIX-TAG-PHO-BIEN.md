# Sửa widget "Tag phổ biến" trên Dashboard (đang hiện "Chưa gắn tag")

Vấn đề: widget "Tag phổ biến" luôn trống. Nguyên nhân: nó đếm tag từ `Contact.tags` (Json array) — nhưng
trường này TRỐNG hoàn toàn (0 bản ghi). Tag thật của tổ chức nằm ở **nhãn Zalo** (`Friend.zaloLabels`,
mảng object `[{id,name,color}]`, có 309 bản ghi) và tag per-nick (`Friend.crmTagsPerNick`, mảng string, 320).
Sửa: đếm "Tag phổ biến" từ `Friend.zaloLabels` (theo tên nhãn), thay cho `Contact.tags`.

Bối cảnh mã nguồn (đã kiểm tra):
- `backend/src/modules/dashboard/dashboard-action-hub-routes.ts` (~dòng 339-343): query hiện tại
  ```sql
  SELECT tag, COUNT(*)::bigint AS n
  FROM contacts c, jsonb_array_elements_text(c.tags) AS tag
  WHERE c.org_id = ${viewer.orgId} AND c.assigned_user_id = ${targetUserId}
  GROUP BY tag ORDER BY n DESC LIMIT 5
  ```
  Kết quả map thành `topTags: [{ tag, count }]` (dòng ~429).
- Model: `Friend` có `zaloLabels Json @default("[]")` (cột `zalo_labels`, mảng `[{id,name,color}]`),
  `zaloAccountId` (cột `zalo_account_id`). `ZaloAccount` có `ownerUserId` (cột `owner_user_id`).

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Trong `dashboard-action-hub-routes.ts`, thay query `topTagRows` bằng query đếm từ nhãn Zalo của các Friend
thuộc nick mà user này sở hữu (giữ nguyên biến `viewer.orgId` và `targetUserId`, và shape trả về
`{ tag, count }`):

```sql
SELECT label->>'name' AS tag, COUNT(*)::bigint AS n
FROM friends f
JOIN zalo_accounts za ON za.id = f.zalo_account_id
CROSS JOIN LATERAL jsonb_array_elements(f.zalo_labels) AS label
WHERE f.org_id = ${viewer.orgId}
  AND za.owner_user_id = ${targetUserId}
  AND label->>'name' IS NOT NULL AND label->>'name' <> ''
GROUP BY label->>'name'
ORDER BY n DESC
LIMIT 5
```

Yêu cầu:
- Giữ nguyên phần map: `topTags: topTagRows.map(t => ({ tag: t.tag, count: Number(t.n) }))`.
- Dùng `prisma.$queryRaw` với tham số hoá đúng chuẩn (như query cũ) để tránh SQL injection.
- Nếu `zalo_labels` rỗng thì `jsonb_array_elements` tự trả 0 dòng — không cần guard thêm.
- KHÔNG đổi các widget/khối khác trong endpoint (statusBreakdown, interactionToday...). Không đổi schema.

### Kiểm tra
- `cd backend && npx tsc --noEmit` = 0 lỗi; build = 0 lỗi; boot không trùng route.
- Xác nhận: `topTags` giờ trả về các nhãn Zalo phổ biến của nick user (vd "Khách Hàng", "Đối Tác"...) kèm
  số lượng, thay vì rỗng.
- Không tự đưa lên máy chủ. Xong báo diff.

## ===== HẾT YÊU CẦU =====

---

## Ghi chú (không cần làm bây giờ)
- Nếu sau này muốn gộp thêm tag per-nick (`crm_tags_per_nick`, mảng string) vào "Tag phổ biến", có thể UNION
  ALL một nhánh `jsonb_array_elements_text(f.crm_tags_per_nick)`. Trước mắt chỉ cần nhãn Zalo là đủ hiển thị.

## Đưa lên máy chủ sau khi xong (tôi tự làm) — KHÔNG migration
1. Windows: `git add backend/src/modules/dashboard/dashboard-action-hub-routes.ts` → `git commit -m "fix(dashboard): tag pho bien dem tu nhan Zalo"` → `git push origin main`
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 20`
