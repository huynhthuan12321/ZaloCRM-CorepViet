# Prompt cho Claude Code: fix bug LƯU kịch bản không giữ ảnh (imageUrl)

> Dán khối "PROMPT" cho Claude Code chạy tại repo **ZaloCRM** (`D:\ZaloCRM-CorepViet`).
> Bug: lưu Luồng kịch bản qua UI → `automation_sequences.steps` KHÔNG có `imageUrl` (đã kiểm chứng
> bằng SQL: `jsonb_path_query_array(steps,'$[*].imageUrl')` trả `[]`). Ảnh của bước bị mất khi lưu.

---

## ===== PROMPT (copy từ đây) =====

Bạn là kỹ sư backend cấp cao trong repo **ZaloCRM**. Fix bug: khi lưu Luồng kịch bản, **ảnh (`imageUrl`)
của bước lấy từ Khối nội dung KHÔNG được lưu** vào DB. Đọc code thật, diff tối thiểu.

### Gốc rễ đã xác minh (ĐỪNG điều tra lại, sửa thẳng)
File `backend/src/modules/automation/community-automation-routes.ts`, hàm **`resolveStepBlocks`** (~dòng 47–59)
chỉ resolve TEXT từ khối, bỏ qua ảnh:
```ts
const blocks = await prisma.contentBlock.findMany({
  where: { id: { in: blockIds }, orgId },
  select: { id: true, messageText: true },          // ← THIẾU imageUrl
});
const map = new Map(blocks.map((b) => [b.id, b.messageText]));   // ← map chỉ có text
return steps.map((s) => {
  if (!s.blockId) return s;
  const blockText = map.get(s.blockId);
  if (blockText === undefined) return { ...s, blockId: null };
  return { ...s, text: blockText };                 // ← chỉ set text, THIẾU imageUrl
});
```
Bằng chứng: sau khi lưu, `SELECT jsonb_path_query_array(steps,'$[*].imageUrl') FROM automation_sequences`
trả `[]`. Đã lấp tạm bằng SQL đọc `content_blocks.image_url` theo `blockId` — đây chính là logic hàm này thiếu.

### Việc cần làm — sửa `resolveStepBlocks` để đóng băng CẢ imageUrl từ khối
Thiết kế "resolve lúc lưu": bước có `blockId` thì freeze text **và** imageUrl từ khối. Sửa:
```ts
const blocks = await prisma.contentBlock.findMany({
  where: { id: { in: blockIds }, orgId },
  select: { id: true, messageText: true, imageUrl: true },   // + imageUrl
});
const map = new Map(blocks.map((b) => [b.id, b]));            // map cả object
return steps.map((s) => {
  if (!s.blockId) return s;
  const block = map.get(s.blockId);
  if (!block) return { ...s, blockId: null };                // block bị xoá → bỏ blockId, giữ text sẵn
  return { ...s, text: block.messageText, imageUrl: block.imageUrl ?? null };  // freeze cả 2
});
```
Cách này **không phụ thuộc frontend có gửi imageUrl hay không** — backend tự lấy từ khối theo blockId (robust,
giống SQL đã lấp). Giữ nguyên hành vi cũ cho bước gõ tay (không có blockId → `return s`).

### Kiểm tra chéo (bắt buộc — đừng chỉ tin tsc)
- Xác nhận `normalizeSequenceSteps`/`parseSequenceSteps` (`sequence-snapshot.ts`) GIỮ `imageUrl` khi parse
  (nếu chưa, thêm — nhưng với fix trên thì backend tự set nên không bắt buộc).
- `SequenceDraftStep` phải có `imageUrl?: string | null` (đã thêm ở lần trước — xác nhận còn).
- `cd backend && npx tsc --noEmit` = 0 lỗi.

### Ràng buộc
- KHÔNG đổi schema DB / KHÔNG migration (imageUrl nằm trong JSON steps).
- KHÔNG đụng broadcast, không phá dry-run, không đụng gửi (process-care-session-step đã gửi ảnh đúng rồi).
- **KHÔNG tự deploy.** Xong: nêu diff + kết quả tsc, và nhắc người dùng commit từ Windows + build VPS
  (không cần migrate). Ghi rõ: sau vá, **tạo/sửa kịch bản mới qua UI sẽ tự lưu imageUrl** (khỏi chạy SQL).

### Test sau deploy (ghi cho người dùng)
Tạo 1 luồng mới, thêm 1 bước chọn "từ khối" (khối có ảnh), Lưu. Chạy:
`docker exec -i zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT name, jsonb_path_query_array(steps,'\$[*].imageUrl') FROM automation_sequences ORDER BY updated_at DESC LIMIT 1;"`
→ phải thấy URL ảnh (không còn `[]`).

## ===== HẾT PROMPT =====

---

## Ghi chú cho bạn
- Fix này chỉ đụng **1 hàm backend** (`resolveStepBlocks`) → an toàn, nhanh.
- Sau khi deploy: **các luồng cũ** đã được SQL lấp ảnh rồi (không cần làm lại). **Luồng mới** tạo qua UI
  sẽ tự lưu ảnh.
- Commit: `git add backend/src/modules/automation/community-automation-routes.ts` (+ sequence-snapshot.ts
  nếu có sửa) → commit → push → VPS `git reset --hard origin/main` → `docker compose up -d --build app`.
