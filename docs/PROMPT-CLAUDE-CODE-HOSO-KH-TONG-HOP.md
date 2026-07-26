# Prompt Claude Code: Implement "Hồ sơ KH tổng hợp" đầy đủ (bỏ skeleton)

> Repo `D:\ZaloCRM-CorepViet`. Trang `/contacts/:id/profile` hiện là SKELETON: composable
> `use-contact-profile.ts` trả MOCK, backend `GET /api/v1/contacts/:id/profile` CHƯA có nên
> view đứng ở "Đang tải hồ sơ tổng hợp...". Nhiệm vụ: làm backend route thật + bỏ mock +
> render view đầy đủ. Contract đã định nghĩa sẵn — bám đúng, không tự đổi shape.

Bối cảnh code (đã xác minh):
- Contract API: `frontend/src/composables/use-contact-profile.ts` → interface `ContactProfileResponse`
  (contact{...}, friends[], aggregateScore, aggregateTags, primaryOwner). Backend PHẢI trả đúng shape này.
- View: `frontend/src/views/ContactProfileView.vue` — hiện chỉ render 3 dòng + khối skeleton.
- Model (backend/prisma/schema.prisma):
  - `Contact` (dòng 513): id, fullName, crmName, email, phone, phone2, phone3, avatarUrl, source,
    status, statusId, leadScore, tags(Json), notes, province, district, ward, gender/birthYear/
    birthDate/occupation/addressLine (nếu field nào KHÔNG tồn tại trong schema → trả null, ĐỪNG bịa cột),
    mergedInto, parentContactId, assignedUserId.
  - `Friend` (dòng 1949): contactId, zaloAccountId, zaloUidInNick, aliasInNick, zaloDisplayName,
    relationshipKind, totalInbound, totalOutbound, lastInboundAt, crmTagsPerNick(Json), statusId,
    statusRef(Status), leadScore.
- RBAC + org-scope: TÁI DÙNG đúng pattern đang có trong `contact-routes.ts` (org filter + quyền xem contact).

---

## ===== PROMPT (copy từ đây) =====

Implement trang "Hồ sơ KH tổng hợp" đầy đủ (đang là skeleton). KHÔNG deploy. KHÔNG đổi schema.

### 1. Backend — `GET /api/v1/contacts/:id/profile` (backend/src/modules/contacts/contact-routes.ts)
- Thêm route trả JSON đúng interface `ContactProfileResponse` (xem use-contact-profile.ts). authMiddleware +
  org-scope + RBAC như các route khác trong file.
- Load Contact theo `{ id, orgId }`. Không thấy → 404. Nếu `mergedInto != null` → resolve sang contact
  canonical (dùng id đó cho phần còn lại).
- `contact{}`: map từ Contact — displayName = crmName || fullName || 'KH'; các field email/addressLine/
  occupation/phone/phone2/phone3/gender/birthDate/birthYear/province/district/ward map trực tiếp (field
  không có trong schema → null); leadScore/statusId; statusName từ Status (join theo statusId); avatarUrl.
- `friends[]`: load MỌI Friend `{ contactId, orgId }`, mỗi row map:
  - id; zaloUid = `zaloUidInNick`; accountId = `zaloAccountId`;
  - accountName = ZaloAccount.displayName (join zaloAccountId → ZaloAccount);
  - displayName = `zaloDisplayName`; aliasInNick; leadScore;
  - statusName = statusRef.name (đã include statusRef); relationshipKind; totalInbound; totalOutbound;
  - lastInboundAt (ISO string | null).
  Sort theo leadScore desc rồi lastInboundAt desc.
- `aggregateScore`: MAX(friends.leadScore) (không có friend → Contact.leadScore || 0). (Phase 6 architecture.)
- `aggregateTags`: UNION Contact.tags (Json string[]) + tất cả Friend.crmTagsPerNick, **dedupe** (Set),
  bỏ rỗng/không phải string.
- `primaryOwner`: chọn Friend có leadScore cao nhất mà `lastInboundAt` trong vòng 14 ngày → lấy
  ZaloAccount.ownerUserId của Friend đó → join User → `{ userId, userName: User.fullName }`. Không có friend
  nào thỏa → fallback Contact.assignedUserId (nếu có) → nếu vẫn không có → null.
- Tối ưu query: 1 findFirst Contact (+ statusRef), 1 findMany Friend (include statusRef + zaloAccount
  select {displayName, ownerUserId}), 1 findMany User cho tên owner. KHÔNG N+1.

### 2. Frontend — bỏ mock (frontend/src/composables/use-contact-profile.ts)
- Uncomment `import { api }` + `api.get(\`/contacts/${contactId}/profile\`)` → gán `profile.value = data`.
- XÓA hàm `mockProfileResponse` và mọi tham chiếu. Giữ nguyên interface `ContactProfileResponse`.
- Thêm cache nhẹ 60s/contact (Map in-memory) để tránh refetch khi chuyển qua lại — tùy chọn, nếu nhanh.

### 3. Frontend — render đầy đủ (frontend/src/views/ContactProfileView.vue)
Thay khối "skeleton note" bằng nội dung thật (giữ style hiện có, thêm class mới nếu cần):
- **Header card**: displayName + aggregateScore (badge) + primaryOwner.userName ('— chưa có —' nếu null).
- **Card "Thông tin chung"**: email, địa chỉ (addressLine), nghề nghiệp, phone/phone2/phone3 (bỏ dòng
  null), gender, birthDate/birthYear, province/district/ward. Field null → hiện '—' hoặc ẩn dòng.
- **Card "Nick Zalo (N)"**: bảng friends[] — cột Nick (displayName/aliasInNick), Tài khoản (accountName),
  Điểm (leadScore), Trạng thái (statusName), Quan hệ (relationshipKind), In/Out (totalInbound/Outbound),
  Tương tác cuối (lastInboundAt format VN). Rỗng → "Chưa có nick Zalo nào".
- **Card "Tags tổng hợp"**: aggregateTags dạng chip. Rỗng → "Chưa có tag".
- Bỏ badge "SKELETON" ở header + xóa đoạn ghi chú skeleton.

### Ràng buộc
- KHÔNG đổi schema/migration. Chỉ đọc dữ liệu (route GET, không ghi).
- Bám đúng interface `ContactProfileResponse` — FE và BE khớp field từng cái.
- Org-scope tuyệt đối + RBAC như route contact khác (không leak cross-tenant / cross-quyền).
- Timeline KHÔNG nằm trong contract → KHÔNG cần làm.

### Verify (bắt buộc)
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && vue-tsc -b` (hoặc build) = 0 lỗi.
- Boot `node dist/app.js` vài giây: không route trùng (`FST_ERR_DUPLICATED_ROUTE`), không unhandled.
- Nêu diff từng file + xác nhận: (a) route trả đúng shape ContactProfileResponse;
  (b) org-scope + RBAC áp dụng; (c) view render info + friends + tags + score, hết "Đang tải..." vô hạn;
  (d) contact không có friend vẫn trả 200 (friends=[], aggregateScore=Contact.leadScore).
- KHÔNG deploy. Xong báo diff để tôi tự commit + deploy.

## ===== HẾT PROMPT =====

---

## Deploy sau khi xong (tôi tự làm) — KHÔNG có migration
1. Windows: `git add -A && git commit -m "feat(contacts): implement Ho so KH tong hop (bo skeleton)" && git push origin main`
2. VPS: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 30`
3. Mở 1 khách trong tab Khách hàng → trang "Hồ sơ KH tổng hợp" → phải ra thông tin thật (không còn "Đang tải...").
