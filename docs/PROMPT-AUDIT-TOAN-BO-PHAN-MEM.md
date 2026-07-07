# Prompt: Audit toàn bộ ZaloCRM ở góc độ chuyên gia lập trình

> Cách dùng: dán toàn bộ nội dung trong khối "PROMPT" bên dưới cho AI agent có quyền đọc mã nguồn
> (Claude Code / Cursor / agent nội bộ). Agent phải **đọc code thật**, không suy đoán từ tên hàm/biến.
> Có thể chạy từng nhóm (§A→§H) để tránh quá tải, hoặc chạy toàn bộ nếu công cụ đủ ngữ cảnh.

---

## ===== PROMPT (copy từ đây) =====

Bạn là **kỹ sư phần mềm cấp cao (staff engineer)** chuyên Node.js/TypeScript, Prisma/PostgreSQL,
Vue 3 và hệ thống automation nhắn tin. Nhiệm vụ: **audit toàn bộ mã nguồn ZaloCRM** tại repo này,
kiểm tra tính đúng đắn/logic từng phần, phát hiện lỗi, và đề xuất hướng khắc phục cụ thể.

### Bối cảnh hệ thống (đọc để hiểu, rồi tự kiểm chứng trong code)
- CRM quản lý nhiều nick Zalo cá nhân, kết nối qua thư viện **không chính thức** `zca-js` (đăng nhập QR).
- Backend: Fastify 5 + Prisma 7 + PostgreSQL + Redis + Socket.IO + BullMQ + node-cron. Đa tổ chức
  (multi-tenant) qua `withTenant`/`runSystemQuery` + RLS/tenant-guard.
- Frontend: Vue 3 + Vuetify 4 + Vite + Pinia.
- Chống block Zalo: rate-limiter per-nick per-category (`SdkLimit`, `zalo-rate-limiter.ts`), khung giờ gửi.
- Phần tự phát triển (cần soi kỹ nhất): module `broadcast/`, `target/`, `content-blocks/` và các worker
  `broadcast-cron.ts`, `target-cron.ts`. Các model: `BroadcastJob/Run/RunItem`, `TargetJob/RunItem`,
  `ContentBlock`, `Friend`, `FriendshipAttempt`, `CustomerList/Entry`, `GroupScan/GroupMember`, `SdkLimit`.

### Nguyên tắc bắt buộc
1. **Đọc file thật trước khi kết luận.** Trích dẫn `đường-dẫn:dòng` cho MỌI phát hiện.
2. Không đề xuất sửa nếu chưa chỉ ra được lỗi cụ thể + cách tái hiện/hậu quả.
3. Phân biệt rõ: **Lỗi chắc chắn** (bug) vs **Rủi ro/nghi vấn** (cần xác minh thêm) vs **Cải thiện** (nit).
4. Không tự ý sửa hàng loạt — chỉ **đề xuất** patch tối thiểu, có giải thích.
5. Chú ý đặc thù: đây là automation nhắn tin — lỗi logic có thể gây **spam khách / khoá nick / lộ dữ liệu
   chéo tổ chức**, nên ưu tiên các rủi ro này.

### Phạm vi & checklist theo nhóm

**§A. Kiến trúc & luồng khởi động**
- `backend/src/app.ts`: mọi route có `register` đúng không? Mọi cron/worker có `start` đúng không, có
  chạy trùng/thiếu điều kiện `nodeEnv !== 'test'`? Có route/worker "chết" (khai báo nhưng không đăng ký)?
- Thứ tự khởi tạo (Prisma, Redis, Socket.IO, zaloPool) có phụ thuộc vòng không?

**§B. Đa tenant & phân quyền (RẤT quan trọng — rò rỉ dữ liệu chéo org)**
- Mọi truy vấn Prisma trong route có scope `orgId` của user? Có query nào thiếu `where.orgId`?
- Worker/cron chạy `runSystemQuery` (cross-org) rồi có bọc `withTenant(orgId)` cho phần org-scoped không?
- RBAC: các action rủi ro (Broadcast, Mục tiêu, xoá) có gate `requireBroadcastAdmin/requireTargetAdmin`?
  Owner-scope (sale chỉ thấy dữ liệu mình) áp đúng ở list Tệp KH / báo cáo không?

**§C. Worker/cron & concurrency (dễ sinh bug nhất)**
- `broadcast-cron.ts` + `target-cron.ts`: cờ `running` chống chồng tick có đúng? Nếu 1 tick treo (gửi
  ảnh chậm) thì sao?
- Có tránh gửi trùng 1 người nhận trong cùng run không? (`BroadcastRunItem`/`TargetRunItem` dedup theo
  entryId — kiểm tra query `notIn` có scale với tệp lớn, có race 2 tick cùng lấy 1 entry?)
- Giãn cách `randomDelayMs` + `lastSentAt` có đảm bảo không vượt trần? Cập nhật `lastSentAt` có atomic
  trong `$transaction` không?
- `computeNextRunAt` (giờ VN UTC+7): kiểm chứng biên — 23h59, đổi ngày, weekly qua tuần, once quá khứ,
  DST (VN không có nhưng logic có giả định sai?).
- Tin chào (`processWelcome`): join `TargetRunItem.welcomeStatus='waiting'` × `FriendshipAttempt
  .state='accepted'` — có bỏ sót khách chấp nhận muộn? Có gửi chào trùng 2 lần? `contactId` null thì sao?
- Trần nick chạm (`RATE_LIMITED`/`NOT_CONNECTED`): có "đốt" contact thành lỗi vĩnh viễn không (unique
  `FriendshipAttempt`)? Pre-check `checkLimits` có đúng category?

**§D. Rate-limit / chống block Zalo**
- `zalo-rate-limiter.ts`: đếm daily/burst theo Redis vs in-memory có nhất quán khi nhiều instance?
  Fail-open (lỗi → cho qua) có nguy hiểm khi Redis sập (spam vượt trần)?
- Category mapping (`message`, `friend_action`, `friend_lookup`, `contact_sync`) gán đúng cho từng thao
  tác trong `zalo-operations.ts` không?
- Reset ngày theo múi giờ nào? Có lệch với khung giờ gửi 8h–21h VN?

**§E. Database / Prisma / migration**
- Schema: field vừa đổi `nullable` (vd `BroadcastJob.customerListId`) — MỌI nơi đọc đã guard null chưa?
  (grep toàn repo).
- Migration additive an toàn không (chỉ thêm, không mất dữ liệu)? Có migration nào `db push
  --accept-data-loss` nguy hiểm?
- Index đủ cho query nóng (worker quét `status/nextRunAt`, dedup `jobId+entryId`)? N+1 query ở route list?
- `$transaction` bao đúng phạm vi (counter + item tạo cùng lúc) chưa? Có cập nhật counter ngoài transaction?

**§F. Tích hợp Zalo (zca-js)**
- Xử lý lỗi `findUser` (số không có Zalo) vs lỗi mạng/nick — có phân biệt để không đánh nhầm `no_zalo`?
- UID là **per-nick**: mọi chỗ gửi tin có resolve UID đúng theo nick gửi không (không dùng UID của nick khác)?
- Session hết hạn / reconnect: có retry đúng, có mã hoá session at-rest (`session-crypto.ts`)?
- Download media để forward (`downloadMediaToTemp`): có cleanup temp, timeout, giới hạn kích thước?

**§G. Frontend (Vue 3)**
- Component có biến/hàm nào tham chiếu nhưng chưa khai báo (sẽ lỗi runtime/build)? `computed`/import đủ?
- Gọi API: xử lý lỗi, loading, phân trang (`entryLimit/entryPage`) đúng? Có memory leak (`setInterval`
  không clear trong `onUnmounted`)?
- SFC hợp lệ: đúng 1 `<script>`, 1 `<style>`, không thẻ đóng thừa (từng gặp lỗi "Invalid end tag").
- Trạng thái nguồn Broadcast (friends vs customer_list) hiển thị + validate khớp backend không?

**§H. Bảo mật & vận hành**
- Secret trong `.env` không hardcode/không lộ trong log? JWT verify + refresh rotation đúng?
- Public API (X-API-Key), webhook: có auth + rate-limit + validate input (chống injection)?
- Input người dùng (nội dung tin, biến `{{ten}}`) có sanitize? Upload file có kiểm loại/kích thước (ClamAV)?
- Log có rò PII/nội dung tin khách không?

### Định dạng báo cáo (bắt buộc)
Với mỗi phát hiện, xuất 1 dòng bảng:

| # | Mức | Nhóm | Vị trí (file:dòng) | Mô tả lỗi + hậu quả | Cách tái hiện | Hướng khắc phục |
|---|-----|------|--------------------|---------------------|---------------|-----------------|

- **Mức:** 🔴 Nghiêm trọng (mất dữ liệu / rò rỉ chéo org / spam-khoá nick) · 🟠 Cao (sai logic, ảnh hưởng
  người dùng) · 🟡 Trung bình · ⚪ Nit/cải thiện.
- Cuối báo cáo: **Top 5 việc cần sửa ngay** (ưu tiên theo rủi ro × công sức) + đánh giá tổng thể sức khoẻ
  codebase (1–10) kèm lý do.
- Nếu một phần **đã đúng**, ghi rõ "Đã kiểm tra, không thấy lỗi" — đừng bịa lỗi cho đủ.

Bắt đầu từ §A, đi tuần tự tới §H. Trước mỗi nhóm, liệt kê các file bạn đã mở để kiểm tra.

## ===== HẾT PROMPT =====

---

## Ghi chú thêm cho người dùng

- **Chạy từng nhóm** (§A, §B, …) trong các phiên riêng nếu agent bị giới hạn ngữ cảnh — chất lượng cao hơn
  chạy tất cả một lần.
- Sau khi có báo cáo, **xử lý theo mức**: 🔴 sửa ngay, 🟠 lên kế hoạch, 🟡/⚪ gom vào đợt refactor.
- Với mỗi patch đề xuất: yêu cầu agent **giải thích trước, sửa sau**, và **commit từ máy Windows** (tránh
  lỗi đồng bộ đã gặp), rồi deploy lại theo `docs/TONG-QUAN-PHAN-MEM-ZALOCRM.md §5`.
- Nên bổ sung **test tự động** cho phần logic thời gian (`computeNextRunAt`) và rate-limit — đây là chỗ
  dễ sai và khó phát hiện bằng mắt.
