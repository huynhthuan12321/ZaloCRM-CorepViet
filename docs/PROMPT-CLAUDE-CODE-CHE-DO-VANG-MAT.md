# Tính năng: Chế độ trợ lý tự động theo phạm vi (chế độ vắng mặt) + trả lời trọn

Mục tiêu: cho phép bật trợ lý tự động phản hồi khách theo PHẠM VI ở cấp tổ chức, thay vì phải bật từng hội
thoại. Khi chủ shop đi vắng, bật một công tắc là trợ lý lo toàn bộ khách mới (hoặc mọi khách). Đồng thời cho
phép trợ lý trả lời trọn vẹn cả phần giá/đơn hàng (chế độ trọn) — nội dung đã chuẩn bị trong kho kiến thức,
chủ shop giám sát trên điện thoại và thu hồi nếu có tin sai.

Bối cảnh mã nguồn (đã kiểm tra):
- Dịch vụ trả lời tự động: `backend/src/modules/ai/ai-auto-reply-service.ts`. Điều kiện hiện tại: yêu cầu
  `Conversation.aiAutoReplyEnabled = true` (bật từng hội thoại) + `AiConfig.aiAutoReplyGlobalEnabled` (công
  tắc tổng). Bước 7 có "cửa nhạy cảm" đẩy phần giá/đơn hàng sang chờ người duyệt.
- Cấu hình lưu ở `AiConfig` (bảng `ai_configs`); giao diện `frontend/src/views/settings/AiAssistantPage.vue`.
- Route cấu hình: GET/PUT `/api/v1/ai/assistant-config` trong `backend/src/modules/ai/ai-routes.ts`.

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Không tự đưa lên máy chủ.

### 1. Cấu hình mới (AiConfig) — migration additive
Thêm 2 cột vào model AiConfig (`schema.prisma`) + tạo migration:
- `aiAutoReplyScope String @default("manual") @map("ai_auto_reply_scope")` — giá trị 'manual' | 'new_customers' | 'all'
- `aiAutoReplyFullAuto Boolean @default(false) @map("ai_auto_reply_full_auto")`

### 2. ai-auto-reply-service.ts — áp phạm vi + chế độ trọn
- **Điều kiện hội thoại** (chỗ đang `if (conv.aiAutoReplyEnabled !== true) return`): đọc `aiCfg.aiAutoReplyScope`,
  thay bằng:
  - Nếu `conv.aiAutoReplyEnabled === true` → tiếp (bật thủ công luôn ưu tiên).
  - Ngược lại nếu scope === 'all' → tiếp.
  - Ngược lại nếu scope === 'new_customers' → chỉ tiếp khi hội thoại CHƯA có tin 'self' của NGƯỜI THẬT
    (tin AI-auto — metadata.aiAuto/sentVia='ai_auto' — KHÔNG tính là người thật). Tức khách mới, chưa nhân
    viên nào tự trả lời.
  - Ngược lại (manual) → return.
- **Cửa nhạy cảm** (bước 7): nếu `aiCfg.aiAutoReplyFullAuto === true` → BỎ QUA việc đẩy sang chờ duyệt, cho
  gửi luôn (kể cả phần giá/đơn hàng). Vẫn giữ: nếu nháp rỗng thì không gửi. Lời nhắc hệ thống "không bịa giá,
  chưa chắc thì nói em kiểm tra lại" giữ nguyên để hạn chế sai số.
  Nếu `aiAutoReplyFullAuto === false` → giữ nguyên hành vi cửa nhạy cảm như hiện tại.
- **Giữ nguyên tất cả guard an toàn**: khung giờ (start/end hour), rate-limit, độ trễ giống người, chống gửi
  trùng, `MARKETING_DRY_RUN`, guard số tin liên tiếp, và công tắc tổng `aiAutoReplyGlobalEnabled` (đây là
  kill switch — tắt là dừng tất).

### 3. Route cấu hình (ai-routes.ts)
Mở rộng GET/PUT `/api/v1/ai/assistant-config` để đọc/ghi `aiAutoReplyScope` (validate thuộc 3 giá trị hợp lệ)
+ `aiAutoReplyFullAuto` (boolean). Giữ nguyên các field cũ.

### 4. Giao diện (AiAssistantPage.vue) — khối "Tự động tư vấn (Mức A)"
- Thêm dropdown **"Trợ lý tự động phản hồi cho"**: [Chỉ khách tôi bật thủ công / Khách mới / Mọi khách]
  → ghi `aiAutoReplyScope`.
- Thêm công tắc **"Chế độ trọn (trả lời cả giá & đơn hàng)"** → ghi `aiAutoReplyFullAuto`, kèm dòng cảnh báo
  nhỏ: "Khi bật, trợ lý gửi luôn cả phần giá/đơn hàng. Hãy giám sát và thu hồi nếu có tin sai."
- (Tùy chọn) nút nhanh **"🚪 Chế độ vắng mặt"**: bấm → đặt scope='new_customers' + bật công tắc tổng; bấm lại
  → về scope='manual'. Nếu khó làm gọn thì bỏ nút này, chỉ cần dropdown + toggle là đủ.

### Ràng buộc
- Migration additive, mặc định 'manual' + fullAuto=false → khi chưa ai cấu hình, hành vi hệ thống Y HỆT hiện tại.
- Giữ mọi guard an toàn hiện có. Công tắc tổng vẫn là nút dừng khẩn.
- Không đụng luồng summary/sentiment/virtual-chat/trí nhớ.

### Kiểm tra (bắt buộc)
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && vue-tsc -b` = 0 lỗi.
- Boot `node dist/app.js` vài giây: không trùng route, không lỗi chưa bắt.
- Nêu diff từng tệp + xác nhận: (a) mặc định manual → hành vi như cũ; (b) scope='new_customers' → khách mới
  được trợ lý tự lo dù chưa bật tay, còn khách đã có người trả lời thì không đụng; (c) fullAuto=true → phần
  giá/đơn hàng cũng được gửi (không còn chờ duyệt); (d) tắt công tắc tổng → dừng tất.
- Không tự đưa lên máy chủ. Xong báo diff để tôi tự đưa lên.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — CÓ migration
1. Windows: `git add` đích danh các tệp sửa (KHÔNG `-A`) → commit → push.
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose build app && docker compose run --rm app npx prisma migrate deploy && docker compose up -d app && docker logs zalo-crm-app --tail 30`
