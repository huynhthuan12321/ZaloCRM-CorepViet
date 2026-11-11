# Tính năng: Trợ lý tự nhắc lại khi khách im lặng (Phần A2)

Mục tiêu: khi khách im lặng một thời gian sau khi trợ lý đã tư vấn, tự gửi MỘT tin nhắc lại nhẹ nhàng (nội
dung do AI viết theo ngữ cảnh khách) để khơi gợi khách phản hồi tiếp. Mặc định TẮT, bật theo tổ chức.

Bối cảnh mã nguồn (đã kiểm tra):
- `backend/src/modules/ai/ai-auto-reply-service.ts`: trợ lý tự trả lời, lưu Message với `metadata.aiAuto=true`
  và `sentVia='ai_auto'`; có sẵn hàm gửi qua `zaloOps.sendMessage`, `isWithinAutoReplyWindow`, độ trễ giống người.
- `backend/src/modules/automation/stage-followup-cron.ts`: MẪU cấu trúc cron 15 phút + đọc config theo org +
  `withTenant` — hãy tham khảo cách viết này.
- `backend/src/modules/ai/ai-service.ts`: `generateText`, `getAiConfig`, `getProviderApiKey` để sinh nội dung.
- Cấu hình ở `AiConfig` (`ai_configs`); route GET/PUT `/api/v1/ai/assistant-config`; UI
  `frontend/src/views/settings/AiAssistantPage.vue`. Đăng ký cron ở nơi khởi động app (như `startStageFollowupCron`).

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Không tự đưa lên máy chủ.

### 1. Config mới (AiConfig) — migration additive
Thêm 4 cột (schema.prisma) + tạo migration:
- `aiFollowupEnabled Boolean @default(false) @map("ai_followup_enabled")`
- `aiFollowupSilenceHours Int @default(1) @map("ai_followup_silence_hours")` (hợp lệ 1-72)
- `aiFollowupMax Int @default(1) @map("ai_followup_max")` (số lần nhắc tối đa mỗi lượt im lặng, 1-3)
- `aiFollowupCooldownHours Int @default(24) @map("ai_followup_cooldown_hours")` (khoảng cách tối thiểu giữa 2 lượt nhắc/hội thoại)

### 2. Sinh nội dung nhắc lại
Hàm `generateFollowupMessage(orgId, conversationId): Promise<string>` (đặt ở ai-service hoặc file mới):
nạp ~20 tin gần nhất + `Contact.metadata.customerSummary` (trí nhớ) + prompt công ty (`aiAssistantPromptTemplate`).
System prompt riêng cho nhắc lại:
"Khách đã im lặng một thời gian sau khi được tư vấn. Viết MỘT tin ngắn, lịch sự, nhẹ nhàng để nhắc lại và
khơi gợi khách phản hồi tiếp. KHÔNG hối thúc, KHÔNG báo giá hay chốt đơn, KHÔNG lặp y nguyên tin trước. Bám
giai đoạn khách nếu có. Chỉ trả về nội dung tin nhắn plain text."
maxTokens ~250. Best-effort: lỗi/quota/rỗng → trả '' (caller sẽ không gửi).

### 3. Cron mới `backend/src/modules/ai/ai-followup-cron.ts` (model theo stage-followup-cron.ts)
Chạy mỗi 15 phút, có cờ `running` chống chồng tick. Chỉ xét org có `aiFollowupEnabled` + `enabled` +
`aiAutoReplyGlobalEnabled`. Bọc `withTenant(orgId, ...)`. Không throw ra ngoài.
Tìm hội thoại ứng viên (org-scope):
- Tin CUỐI của hội thoại là tin AI-auto (`metadata.aiAuto=true` HOẶC `sentVia='ai_auto'`), gửi cách đây ≥
  `aiFollowupSilenceHours` giờ.
- KHÔNG có tin khách (`senderType='contact'`) sau tin AI-auto đó (khách đang im).
- Số tin nhắc đã gửi (`metadata.aiFollowup=true`) KỂ TỪ tin khách cuối < `aiFollowupMax`.
- Lượt nhắc gần nhất (nếu có) cách đây ≥ `aiFollowupCooldownHours`.
- Trong khung giờ `isWithinAutoReplyWindow(now, aiAutoReplyStartHour, aiAutoReplyEndHour)`.
- Hội thoại thật 1-1: `threadType='user'` (BỎ QUA nhóm), `isVirtual=false`, `deletedAt=null`, nick không archived, có `externalThreadId`.
- Contact KHÔNG có care-session `state='active'` (tránh chồng với Giai đoạn 3 bám đuổi).
Giới hạn tối đa ~20 hội thoại/org/tick (chống dồn).
Với mỗi ứng viên:
- `generateFollowupMessage` → nếu rỗng thì bỏ qua.
- Độ trễ ngẫu nhiên 10-40s (như auto-reply) → re-check (khách vẫn chưa nhắn thêm, global vẫn bật) → gửi qua
  `zaloOps.sendMessage` (TÔN TRỌNG `MARKETING_DRY_RUN` + rate-limit) → lưu Message với
  `metadata = { aiAuto:true, aiFollowup:true }`, `sentVia='ai_auto'` → emit socket + audit (như auto-reply).
- Cập nhật `lastMessageAt`.

### 4. Route + Giao diện
- Mở rộng GET/PUT `/api/v1/ai/assistant-config` đọc/ghi 4 field follow-up (validate số trong khoảng hợp lệ).
- `AiAssistantPage.vue`: thêm khối **"Tự nhắc lại khi khách im lặng"**: công tắc bật + ô "Số giờ im lặng"
  (mặc định 1) + "Số lần nhắc tối đa" + "Cách nhau (giờ)". Dòng ghi chú: "Chỉ gửi tin nhắc nhẹ để khơi gợi
  khách, không báo giá/chốt đơn."

### Ràng buộc
- Migration additive, mặc định TẮT → khi chưa bật, hệ thống hành xử y như hiện tại.
- Giữ khung giờ, rate-limit, MARKETING_DRY_RUN, và công tắc tổng `aiAutoReplyGlobalEnabled` (kill switch).
- KHÔNG đụng luồng auto-reply chính, summary, hay stage-followup (Giai đoạn 3).
- Tin nhắc TUYỆT ĐỐI không báo giá/chốt đơn (prompt ép + là tin re-engage nhẹ).

### Kiểm tra (bắt buộc)
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && vue-tsc -b` = 0 lỗi; backend build = 0 lỗi.
- Boot `node dist/app.js` vài giây: không trùng route, không lỗi chưa bắt, cron đăng ký bình thường.
- Nêu diff từng tệp + xác nhận: (a) mặc định tắt → không có tin nhắc nào; (b) bật + khách im ≥ số giờ cấu hình
  sau tin AI-auto → gửi đúng 1 tin nhắc nhẹ, không báo giá; (c) khách nhắn lại → reset đếm, không nhắc quá max;
  (d) tắt công tắc tổng → không nhắc; (e) contact có care-session active → không nhắc (tránh chồng).
- Không tự đưa lên máy chủ. Xong báo diff để tôi tự đưa lên.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — CÓ migration
1. Windows: `git add` đích danh các tệp sửa (KHÔNG `-A`) → commit → push.
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose build app && docker compose run --rm app npx prisma migrate deploy && docker compose up -d app && docker logs zalo-crm-app --tail 30`
