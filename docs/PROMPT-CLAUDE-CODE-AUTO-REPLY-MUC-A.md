# Prompt Claude Code: Auto-tư vấn Mức A (bán tự động có kiểm soát, per-khách)

> Repo `D:\ZaloCRM-CorepViet`. Mục tiêu: mỗi hội thoại có 1 công tắc "AI tự tư vấn".
> Khi BẬT: khách nhắn tin → AI tự trả các câu HỎI THÔNG TIN/FAQ (bám Knowledge Base);
> gặp phần NHẠY CẢM (giá, cọc, chốt đơn, thanh toán) hoặc AI không chắc → KHÔNG gửi,
> chỉ soạn nháp + gắn cờ cho sale duyệt. Khi TẮT: sale tự trả như hiện tại.
> Nút bật per-khách. Đây là ZALO THẬT (không phải virtual chat). Không phá luồng cũ.

Bối cảnh code (đã xác minh, dùng đúng các điểm này, đừng bịa API mới):
- Tin khách đến đi qua `backend/src/modules/zalo/zalo-listener-factory.ts` →
  `listener.on('message', ...)` (~dòng 618). Sau khi gọi `handleIncomingMessage(...)` trả `result`
  và `emitChatMessage(...)`. `message.isSelf` = true nếu là tin mình gửi.
- Bộ soạn nháp bám KB đã có: `generateAiOutput({ type:'reply_draft' })` trong
  `backend/src/modules/ai/ai-service.ts` → trả `{ content, confidence, sources }` (có sẵn quota + saveSuggestion).
- Khung fire-and-forget mẫu: `backend/src/modules/ai/ai-virtual-chat-service.ts` (throttle, withTenant,
  quota) — MODEL THEO FILE NÀY nhưng thêm gửi Zalo thật + cửa nhạy cảm.
- Đường GỬI + LƯU tin thật: TÁI DÙNG đúng service mà nút gửi tin tay của màn chat gọi (tìm trong
  `chat-routes.ts` / message send) HOẶC đường gửi mà `process-care-session-step.ts` dùng
  (`zaloOps.sendMessage`). KHÔNG tự viết đường gửi/lưu mới — để dedupe echo self-message +
  rate-limit + `MARKETING_DRY_RUN` đồng nhất với phần còn lại.
- Có sẵn: `MARKETING_DRY_RUN` (kill switch), `zalo-rate-limiter.ts`, `isWithinSendWindow` (8h-21h VN)
  trong `broadcast-service.ts`.

---

## ===== PROMPT (copy từ đây) =====

Triển khai "Auto-tư vấn Mức A". Làm theo đúng thứ tự, KHÔNG deploy.

### 1. Schema (migration additive, mặc định TẮT → zero thay đổi hành vi cũ)
`backend/prisma/schema.prisma`:
- Model `Conversation`: thêm `aiAutoReplyEnabled Boolean @default(false) @map("ai_auto_reply_enabled")`.
- Model `AiConfig`: thêm:
  - `aiAutoReplyGlobalEnabled Boolean @default(false) @map("ai_auto_reply_global_enabled")` (công tắc tổng org)
  - `aiAutoReplySensitivePattern String? @map("ai_auto_reply_sensitive_pattern")` (regex từ khoá nhạy cảm; null → dùng default trong code)
  - `aiAutoReplyStartHour Int @default(8) @map("ai_auto_reply_start_hour")`
  - `aiAutoReplyEndHour Int @default(21) @map("ai_auto_reply_end_hour")`
  - `aiAutoReplyMaxConsecutive Int @default(3) @map("ai_auto_reply_max_consecutive")`
  - `aiAutoReplyMinConfidence Float @default(0.55) @map("ai_auto_reply_min_confidence")`
- Tạo migration. KHÔNG đổi cột/bảng khác.

Default từ khoá nhạy cảm (hằng trong code, khi pattern null): các cụm (không dấu-tương-đương chấp nhận):
`chốt|chốt đơn|đặt hàng|lấy gói|mua gói|cọc|đặt cọc|chuyển khoản|ck|số tài khoản|stk|thanh toán|
giá|bao nhiêu tiền|bao nhiêu|giảm|khuyến mãi|ship|giao hàng|khi nào giao|cod|hoá đơn|xuất hoá đơn`.
(Ghi chú: theo Mức A, HỎI GIÁ cũng coi là nhạy cảm → AI soạn nháp cho sale duyệt, không tự báo giá.)

### 2. Service mới `backend/src/modules/ai/ai-auto-reply-service.ts`
Model theo `ai-virtual-chat-service.ts`. Export `triggerAutoReply(input: { accountId; conversationId;
incomingMessageId; orgId }, io): Promise<void>`. Bọc `withTenant(orgId, ...)`. Fire-and-forget, TUYỆT ĐỐI
không throw ra ngoài (mọi lỗi → log + return).

Các bước bên trong (dừng sớm nếu fail bất kỳ điều kiện):
1. **Throttle** per conversation (như virtual-chat, 5s).
2. **Load conversation** + guard: `aiAutoReplyEnabled === true`; `conversation.isVirtual === false`
   (Mức A cho Zalo thật). Load `aiConfig`: `enabled && aiAutoReplyGlobalEnabled`. Sai → return.
3. **Load tin đến** (`incomingMessageId`): phải `senderType !== 'self'` (là tin KHÁCH), `contentType==='text'`,
   độ dài ≥ 5, KHÔNG match `aiAssistantSkipNoisePattern`. Sai → return.
4. **Khung giờ**: giờ VN phải trong `[aiAutoReplyStartHour, aiAutoReplyEndHour)`. Ngoài giờ → return
   (không tự gửi ban đêm).
5. **Guard liên tiếp**: đếm số tin AI-auto đã gửi kể từ tin 'self' NGƯỜI THẬT gần nhất (không phải AI).
   Nếu ≥ `aiAutoReplyMaxConsecutive` → return (chống loop/spam; nhường người).
6. **Sinh nháp**: gọi `generateAiOutput({ orgId, conversationId, type:'reply_draft', messageId:incomingMessageId })`
   → `{ content, confidence, sources }`. (Đã tự lo quota; nếu quota hết nó throw → catch → return.)
7. **Cửa nhạy cảm (điểm cốt lõi Mức A)** — KHÔNG gửi nếu BẤT KỲ điều nào đúng:
   - Tin KHÁCH match regex nhạy cảm (pattern org hoặc default).
   - `content` nháp của AI match regex nhạy cảm (vd chứa số tiền/STK).
   - `confidence < aiAutoReplyMinConfidence`.
   - Nháp có vẻ báo giá/chính sách nhưng `sources` rỗng (không có nguồn KB).
   → Khi vào nhánh này: **KHÔNG gửi Zalo**. Thay vào đó lưu nháp như 1 AiSuggestion "pending review"
     và emit socket `chat:ai-needs-review` { conversationId, messageId, draft: content, reason,
     sources } để FE gắn cờ ở thanh ✨ ("Khách hỏi {reason} — cần duyệt"). Return.
   - `reason` gọn: 'giá/chốt đơn' | 'độ tin cậy thấp' | 'thiếu nguồn tài liệu'.
8. **Nhánh AN TOÀN → tự gửi**:
   a. Đợi **trễ ngẫu nhiên 10-40s** (giả lập người gõ). Có thể emit typing nếu SDK hỗ trợ (tùy chọn).
   b. **Re-check chống stale** sau khi chờ: reload hội thoại; nếu đã có tin 'self' NGƯỜI THẬT mới hơn
      tin đang xử lý, HOẶC khách đã gửi tin mới hơn `incomingMessageId` → ABORT (người đã xen vào /
      có trigger mới). Không gửi.
   c. **Gửi**: tái dùng đúng service gửi-tin-tay của màn chat (hoặc đường `zaloOps.sendMessage` của
      care-session), truyền `content`. PHẢI tôn trọng `MARKETING_DRY_RUN` (true → chỉ log, không gửi thật)
      và rate-limiter. Lưu tin với cờ nhận biết: metadata `{ aiAuto: true, sources }` (và/hoặc
      `sentVia:'ai_auto'`) để FE hiển thị "⚡ AI tự gửi". KHÔNG tự lưu Message trùng nếu service gửi đã lưu.
   d. **Audit**: activityLog action `ai_auto_reply_sent` (actorType 'bot'), entityType conversation.

### 3. Hook vào listener
`zalo-listener-factory.ts`, trong `listener.on('message', ...)`, SAU `emitChatMessage(...)`:
- Nếu `!message.isSelf` và `result?.conversation?.id` (tin khách, có hội thoại) →
  fire-and-forget: `import('../ai/ai-auto-reply-service.js').then(m => m.triggerAutoReply({ accountId,
  conversationId: result.conversation.id, incomingMessageId: result.message.id, orgId: <orgId từ result/acc> }, io))
  .catch(() => {})`.
- Dùng **dynamic import** (tránh circular). KHÔNG await (không block listener). Bọc try/catch.
- Lấy `orgId` từ `result` hoặc query zaloAccount như đoạn `accInfo` gần đó.

### 4. Routes
`backend/src/modules/...` (đặt cạnh chat hoặc ai routes):
- `PATCH /api/v1/conversations/:id/ai-auto-reply` body `{ enabled: boolean }` → set
  `Conversation.aiAutoReplyEnabled`. RBAC: chỉ owner/admin HOẶC sale có quyền truy cập nick của hội thoại
  đó (tái dùng pattern `assertConversationReadAccess` trong `ai-routes.ts`). Trả `{ ok:true, enabled }`.
- Mở rộng GET/PUT `/api/v1/ai/assistant-config` (trong `ai-routes.ts`) để đọc/ghi 6 field auto-reply mới
  (global toggle, sensitive pattern, start/end hour, maxConsecutive, minConfidence). Validate regex hợp lệ
  + hour 0-23 + maxConsecutive ≥1 + confidence 0..1.

### 5. Frontend
- **Nút toggle trên header chat** (chỗ cạnh tên/trạng thái khách, đúng vị trí hình): 1 `v-switch` nhỏ
  "AI tự tư vấn". Bind `conversation.aiAutoReplyEnabled`, gọi PATCH. Chỉ hiện khi hội thoại KHÔNG virtual.
  Cần thêm `aiAutoReplyEnabled` vào payload conversation trả về FE (list + detail) nếu chưa có.
- **Badge tin AI tự gửi**: ở message có `metadata.aiAuto` → hiện nhãn nhỏ "⚡ AI tự gửi".
- **Cờ cần duyệt**: nghe socket `chat:ai-needs-review` → ở thanh ✨ hiện dòng cảnh báo
  "Khách hỏi {reason} — cần bạn duyệt" + đổ sẵn `draft` vào ô như suggestion hiện tại.
- **Trang Cài đặt → Trợ lý AI**: thêm khối "Tự động tư vấn (Mức A)": công tắc tổng org, ô textarea từ khoá
  nhạy cảm (placeholder = default), khung giờ, max liên tiếp, ngưỡng tin cậy. Nếu không chắc chỗ render →
  ưu tiên làm toggle header + badge; phần settings có thể để sau (ghi rõ đã bỏ qua).

### Ràng buộc
- Migration additive, default TẮT → khi chưa ai bật, hành vi hệ thống Y HỆT hiện tại.
- Fire-and-forget không được throw vào listener; không block nhận tin.
- KHÔNG tự viết đường gửi/lưu Message mới — tái dùng service gửi hiện có (dedupe echo + rate-limit +
  DRY_RUN đồng nhất). Nếu `MARKETING_DRY_RUN=true` → KHÔNG gửi thật.
- KHÔNG đụng luồng summary/sentiment, virtual-chat, hay gửi tin tay.
- Giá/cọc/chốt đơn/thanh toán KHÔNG BAO GIỜ được AI tự gửi (đảm bảo qua cửa nhạy cảm).

### Verify (bắt buộc)
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && vue-tsc -b` (hoặc build) = 0 lỗi.
- Chạy `tests/security/ai-capabilities.test.ts`, `tests/unit/tag-apply-ai-regression.test.ts` — không hồi quy.
- Boot `node dist/app.js` vài giây: không route trùng, không unhandled, listener đăng ký bình thường.
- Nêu diff từng file + xác nhận 3 điểm:
  (a) khi `aiAutoReplyEnabled=false` (mặc định) → không có hành vi mới, listener chạy như cũ;
  (b) tin khách hỏi giá/cọc/chốt → KHÔNG gửi, chỉ emit `chat:ai-needs-review`;
  (c) tin khách hỏi thông tin thường + có nguồn KB + confidence đủ → gửi sau trễ ngẫu nhiên, tin có cờ aiAuto,
      và bị bỏ nếu người thật xen vào trong lúc chờ.
- KHÔNG deploy. Xong báo diff để tôi tự commit + deploy + test trên nick phụ.

## ===== HẾT PROMPT =====

---

## Sau khi Claude Code xong (tôi tự làm)
### Deploy
1. Windows: `git add -A && git commit -m "feat(ai): auto-tu van Muc A (per-khach, cua nhay cam)" && git push origin main`
2. VPS: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main`
   → chạy migration: `docker compose exec app npx prisma migrate deploy` (hoặc theo quy trình migrate của repo)
   → `docker compose up -d --build app` → `docker logs zalo-crm-app --tail 30` (không crash).

### Test AN TOÀN trước khi dùng thật
- Bật công tắc tổng org + bật toggle CHỈ trên 1 khách test (tự nhắn từ nick phụ của mình).
- Gửi thử: (1) "gói khởi nghiệp gồm gì?" → AI tự trả sau ~10-40s, tin có cờ ⚡.
  (2) "chốt gói này cọc nhiêu?" → KHÔNG gửi, thanh ✨ báo "cần duyệt".
  (3) Trong lúc chờ, mình gõ tay 1 câu → AI phải tự nhường (không gửi chồng).
- Theo dõi 2-3 ngày xem Zalo có cảnh báo nick không → ổn mới mở thêm khách.
- Giữ `MARKETING_DRY_RUN=false` (đang bật gửi thật). Muốn tập dượt không gửi thật → set `true`.
