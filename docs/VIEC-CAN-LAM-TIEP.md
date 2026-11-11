# Việc cần làm tiếp (chưa triển khai) — ZaloCRM

> Ghi ngày 22/07/2026. Danh sách việc còn dang dở để quay lại làm sau.
> Quy tắc vàng: **luôn commit từ máy Windows** (đọc file thật trên D:\), KHÔNG commit qua sandbox
> (hay bị cắt cụt file). Sau commit → VPS: `git reset --hard origin/main` → `docker compose up -d --build app`.

---

## 🔴 1. GẤP — Build đang GÃY: thiếu file care-session chưa commit

**Tình trạng:** commit `6f37784` (toast lý do + log deferReason) đã push, NHƯNG file lõi
`process-care-session-step.ts` **chưa từng được git track** → VPS build từ git bị lỗi
`TS2307 Cannot find module './process-care-session-step.js'`. Vì build fail nên **production vẫn chạy
image CŨ** (gửi tin thật vẫn OK, nhưng tính năng toast/log chưa lên).

**Cần làm — trên Windows:**
```
cd D:\ZaloCRM-CorepViet
git add backend/src/modules/automation/process-care-session-step.ts backend/src/modules/automation/care-session-timeline.ts frontend/src/components/chat/FollowUpCard.vue frontend/src/components/chat/FollowUpHistoryDialog.vue backend/tests/process-care-session-step.test.ts backend/tests/care-session-cron.test.ts backend/tests/care-session-timeline.test.ts
git status
git commit -m "fix: commit process-care-session-step.ts (chua tung track) + care-session/follow-up files"
git push origin main
```
`git status` phải KHÔNG còn dòng `??` cho `process-care-session-step.ts`.

**Rồi trên VPS:**
```
cd /opt/ZaloCRM-CorepViet
git fetch origin && git reset --hard origin/main
docker compose up -d --build app
```
Build phải qua `up 5/5` (hết lỗi TS2307). Không cần migrate.

---

## ⬜ 2. Luồng kịch bản gửi KÈM ẢNH — prompt đã sẵn, chưa chạy

**Vấn đề:** bước Luồng kịch bản lấy "từ khối" có ảnh nhưng chỉ gửi CHỮ (worker chỉ `sendMessage`,
`SequenceDraftStep` không mang `imageUrl`). Broadcast thì gửi ảnh được.

**Prompt đã viết sẵn:** `docs/PROMPT-CLAUDE-CODE-LUONG-GUI-KEM-ANH.md` → dán cho Claude Code chạy.
Không cần migration. Xong commit từ Windows + build VPS. (Làm SAU khi mục 1 đã xong.)

---

## ⬜ 3. Trang /reports/automation TRẮNG — tab chết

**Vấn đề:** `ReportsShell.vue` có tab "Automation" trỏ `/reports/automation` nhưng **router không có route
đó** (trang chưa làm — vốn là tính năng EE). → click ra trang trắng.

**2 lựa chọn:**
- (a) Sửa nhanh: xoá dòng tab `Automation` (`{ to: '/reports/automation', ... }`) trong
  `frontend/src/views/reports/ReportsShell.vue` → hết trắng trang.
- (b) Xây thật "Báo cáo Automation" tổng hợp theo Sale/nick (phễu kết bạn, bám đuổi, phản hồi, chặn,
  reconnect...). Dữ liệu đã có sẵn (BroadcastRun, TargetJob/RunItem, FriendshipAttempt, care-session, SdkLimit).
  ~2–3 ngày. → cần viết prompt Claude Code (CHƯA viết).

---

## ⬜ 4. Khối nội dung gửi VIDEO — mới tư vấn, chưa có prompt

**Kết luận:** hiện khối chỉ gửi text + ảnh, KHÔNG gửi video. Kỹ thuật làm được (`zaloOps.sendVideo` có sẵn,
chat đã gửi video, container có ffmpeg). Cần: thêm field video vào ContentBlock + media picker video +
đường gửi dùng `sendVideo` + thumbnail. ~1,5–2 ngày. → **prompt CHƯA viết.**
Lưu ý: video hàng loạt dễ bị coi spam — nên dùng cho chăm sóc 1-1, không rải đại trà.

---

## ❓ 5. Tag "+ Thêm tag" trong chat không thêm được — CHƯA kết luận

**Hiện tượng:** popup "+ Thêm tag" báo "Chưa có tag thủ công nào" dù trong Cài đặt có 24 tag.
**Đầu mối đã tìm:** `frontend/src/components/chat/TagCrmBar.vue` — popup chỉ load tag
`scope=friend, source=manual_per_nick` (dòng 194). Nhưng 24 tag hiện có đều là nguồn **"Zalo Real"**,
KHÔNG phải `manual_per_nick` → nên popup rỗng, chỉ cho gõ tạo tag mới.
**Chưa xác định:** đây là thiết kế cố ý (popup chỉ để thêm tag thủ công per-nick, tag Zalo Real gắn ở
chỗ khác) hay là bug. → cần điều tra tiếp `TagCrmBar.vue` + luồng gắn tag để kết luận + đề xuất sửa.

---

## ✅ Đã xong & đang chạy production (tham khảo)
- Broadcast tự động (+ nguồn Bạn bè đã kết bạn), Khối nội dung (spin content), Mục tiêu (auto kết bạn),
  Tin chào sau kết bạn.
- Public API gửi ảnh (`/messages/send-image`) + tra khách theo SĐT (`/contacts/by-phone`) — cho n8n đơn hàng.
- Vá bảo mật audit P1–P9 (rò rỉ chéo org, hash API key, chống gửi trùng, rate-limit fail-closed...).
- Fix hiển thị API key, fix scroll/nhớ số dòng trang Tệp KH, fix gửi ảnh Google (không đuôi).
- Bật gửi thật: `MARKETING_DRY_RUN=false` (đã xác nhận).
- Tài liệu tích hợp Lark: `D:\lark-base-corepviet\docs\PHUONG-AN-TONG-THE-ZALOCRM-LARK.md` + workflow
  n8n gửi ảnh đơn: `D:\lark-base-corepviet\n8n\`.
