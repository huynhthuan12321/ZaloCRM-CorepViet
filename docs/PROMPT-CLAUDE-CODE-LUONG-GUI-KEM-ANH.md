# Prompt cho Claude Code: Luồng kịch bản (bám đuổi) gửi KÈM ẢNH từ Khối nội dung

> Dán khối "PROMPT" cho Claude Code chạy tại repo **ZaloCRM** (`D:\ZaloCRM-CorepViet`).
> Vấn đề: bước Luồng kịch bản lấy "từ khối" có ảnh, nhưng khi gửi chỉ ra CHỮ — ảnh bị rớt.
> Nguyên nhân: `SequenceDraftStep` không mang `imageUrl`, và worker chỉ gọi `sendMessage` (text).

---

## ===== PROMPT (copy từ đây) =====

Bạn là kỹ sư full-stack cấp cao trong repo **ZaloCRM** (Node/Fastify/Prisma + Vue 3; Zalo qua `zca-js`).
Nhiệm vụ: cho **Luồng kịch bản / Phiên chăm sóc (care-session)** gửi được **ẢNH kèm text** khi bước lấy từ
**Khối nội dung** (giống Broadcast đã làm được). Đọc code thật trước khi sửa, diff tối thiểu, KHÔNG phá dry-run.

### Bối cảnh đã xác minh (dùng lại, đừng viết lại)
- **Broadcast đã gửi ảnh được** — tham chiếu mẫu: `backend/src/modules/broadcast/broadcast-cron.ts`
  (`resolveJobContent` → tải ảnh → `zaloOps.sendImage`). Copy đúng pattern này.
- Gửi ảnh: `zaloOps.sendImage(accountId, threadId, threadType: 0|1, attachments: any[], io?, caption='')`
  trong `backend/src/shared/zalo-operations.ts`. **`attachments` là ĐƯỜNG DẪN FILE local**, không phải URL.
- Tải URL → file tạm: `downloadMediaToTemp(media: { url: string; filename?: string }, contentType: string)`
  trả `{ path, cleanup }` — `backend/src/modules/chat/chat-media-helpers.ts`.
- **Không đổi schema DB**: bước lưu trong JSON (`AutomationSequence.steps`, `CareSession.stepsSnapshot`) →
  thêm `imageUrl` vào step là **additive trong JSON, KHÔNG cần migration**.

### Việc 1 — Kiểu dữ liệu bước mang thêm `imageUrl`
File `backend/src/modules/automation/sequence-snapshot.ts`:
- `SequenceDraftStep` (khoảng dòng 12): thêm `imageUrl?: string | null`.
- Trong `parseSequenceSteps` (khoảng dòng 39–51): đọc `obj.imageUrl` (string hợp lệ → giữ, ngược lại null)
  và đưa vào step trả về. Giữ nguyên `blockId`.
- `normalizeSequenceSteps` (khoảng dòng 61): step mặc định fallback thêm `imageUrl: null`.

### Việc 2 — Worker gửi ẢNH khi bước có `imageUrl`
File `backend/src/modules/automation/process-care-session-step.ts`, mục **7. Execute** (khoảng dòng 186–206):
- Nhánh **dry-run** (`config.marketingDryRun`): giữ nguyên (chỉ log/simulate). Có thể ghi thêm `(kèm ảnh)`
  vào log nếu `step.imageUrl` để dễ theo dõi — tuỳ chọn.
- Nhánh **LIVE**: hiện tại `await zaloOps.sendMessage(session.nickId, uid, 0, { msg: text });`. Đổi thành:
  ```ts
  const step = steps[idx];
  if (step.imageUrl) {
    const media = await downloadMediaToTemp({ url: step.imageUrl }, 'image');
    try {
      await zaloOps.sendImage(session.nickId, uid, 0, [media.path], null, text); // text = caption
    } finally {
      await media.cleanup().catch(() => {});
    }
  } else {
    await zaloOps.sendMessage(session.nickId, uid, 0, { msg: text });
  }
  ```
  Dùng `'image'` (không `'image/jpeg'`) cho contentType để URL không đuôi vẫn ra path `.jpg` (khớp cách
  public send-image đã làm). Giữ nguyên phần `advanceStep(...)` sau khi gửi (finalize DB) — KHÔNG đổi.
  Nếu `zaloOps` ném `ZaloOpError` `RATE_LIMITED`/`NOT_CONNECTED`, để nguyên xử lý lỗi hiện có (đừng nuốt lỗi).

### Việc 3 — Frontend: "từ khối" copy cả ảnh + hiển thị
File `frontend/src/views/marketing/SequencesView.vue`:
- `StepRow` (khoảng dòng 143): thêm `imageUrl?: string | null`.
- `SendableBlock` (khoảng dòng 152): thêm `imageUrl?: string | null`.
- Load khối (khoảng dòng 171): map thêm `imageUrl: b.imageUrl ?? null`.
- `applyBlock(idx, blockId)` (khoảng dòng 177–183): khi chọn khối, ngoài `step.text` cũng gán
  `step.imageUrl = block?.imageUrl ?? null` (khi bỏ chọn `blockId` rỗng → `step.imageUrl = null`).
  Giữ quy tắc "chỉ điền text nếu bước đang trống"; với ảnh thì gán theo khối (ảnh không gõ tay).
- Hiển thị: trong ô soạn bước, nếu `step.imageUrl` → hiện **preview ảnh nhỏ** + nút "Bỏ ảnh"
  (`step.imageUrl = null`). Ở dòng tóm tắt bước (khoảng dòng 40–41) thêm icon 🖼️ khi có ảnh.
- Khi gửi form tạo/sửa luồng: bảo đảm `imageUrl` của mỗi bước được gửi trong payload steps (kiểm tra chỗ
  build payload — nếu đang map thủ công `{text, delayMinutes, blockId}` thì thêm `imageUrl`).

### Ràng buộc
- **KHÔNG đổi schema DB / KHÔNG tạo migration** (imageUrl đi trong JSON steps).
- Không phá nhánh dry-run, không phá Broadcast (đừng đụng broadcast-cron ngoài việc đọc tham chiếu).
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && npm run build` (vue-tsc + vite) = 0 lỗi.
- Thêm/đối chiếu test cho `parseSequenceSteps` (giữ imageUrl) nếu có sẵn `sequence-snapshot.test.ts`.
- **KHÔNG tự deploy.** Xong: liệt kê diff, kết quả tsc/build, và nhắc người dùng **commit từ máy Windows**
  (đọc file thật, tránh cắt cụt) rồi build lại VPS. Nêu rõ: **không cần `prisma migrate deploy`**.

### Lưu ý bàn giao
- Luồng/phiên **tạo trước bản vá** (stepsSnapshot cũ không có imageUrl) sẽ vẫn gửi text như cũ — chỉ
  luồng sửa/tạo lại sau vá mới có ảnh. Ghi chú điều này cho người dùng.
- Ảnh gửi qua limiter chống-block sẵn có (không bypass). Khung giờ 8h–21h cho bước theo lịch giữ nguyên.

## ===== HẾT PROMPT =====

---

## Ghi chú cho bạn (sau khi Claude Code làm xong)
1. Commit từ Windows:
   ```
   cd D:\ZaloCRM-CorepViet
   git add backend/src/modules/automation/sequence-snapshot.ts backend/src/modules/automation/process-care-session-step.ts frontend/src/views/marketing/SequencesView.vue
   git commit -m "feat(sequence): gui kem anh tu Khoi noi dung trong Luong kich ban"
   git push origin main
   ```
2. VPS: `git reset --hard origin/main` → `docker compose up -d --build app` (KHÔNG cần migrate).
3. Test: sửa Luồng "NÂNG CẤP 7 NGÀY" → mỗi bước chọn lại "từ khối" (để nạp imageUrl mới) → lưu →
   bấm "Gửi bước tiếp ngay" → khách nhận **ảnh + chữ**.
