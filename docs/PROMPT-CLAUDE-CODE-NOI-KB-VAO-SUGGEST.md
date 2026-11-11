# Prompt Claude Code: Nối Knowledge Base + hồ sơ khách + prompt công ty vào nút ✨ (Gợi ý AI)

> Repo `D:\ZaloCRM-CorepViet`. Mục tiêu: khi sale bấm ✨ (reply draft), AI soạn nháp
> BÁM dữ liệu gói/bảng giá/chính sách trong Knowledge Base + hồ sơ & nhu cầu khách,
> theo prompt công ty, và KHÔNG bịa giá/chính sách. Giai đoạn 1 — không đổi schema.

---

## ===== PROMPT (copy từ đây) =====

Hiện nút ✨ "Gợi ý AI" gọi `POST /api/v1/ai/suggest` → `generateAiOutput({type:'reply_draft'})`
trong `backend/src/modules/ai/ai-service.ts`. Luồng này CHỈ gửi ~40 tin nhắn + tên khách
với prompt generic (`buildReplyDraftPrompt`). Nó KHÔNG dùng Knowledge Base, KHÔNG dùng hồ
sơ/nhu cầu khách, KHÔNG dùng prompt công ty. Hãy nối 3 nguồn này vào — CHỈ cho nhánh
`reply_draft`, KHÔNG đụng `summary`/`sentiment`.

### Việc 1 — Tách hàm truy hồi chunk dùng chung (knowledge-service.ts)
File `backend/src/modules/ai/knowledge/knowledge-service.ts`:
- Thêm hàm export `retrieveRelevantChunks(args: { orgId: string; query: string; topK?: number }):
  Promise<Array<{ content: string; docId: string; docTitle: string; score: number }>>`.
  - Logic lấy từ phần đang có trong `ragAnswer`: `embedTexts(orgId,[query])` → load
    `knowledgeChunk.findMany({where:{orgId}})` → `cosineSim` → sort desc → slice topK.
  - Join tên tài liệu: load `knowledgeDoc` theo docId của các chunk được chọn để điền `docTitle`.
  - **Best-effort, KHÔNG được throw:** bọc toàn bộ trong try/catch, nếu KB rỗng / chưa cấu
    hình embedding / embed lỗi → `return []`. (Draft phải chạy được kể cả khi chưa có KB.)
- Refactor `ragAnswer` để gọi `retrieveRelevantChunks` (giữ nguyên hành vi + response cũ:
  answer/sources/chunksUsed). KHÔNG đổi endpoint `/ai/knowledge/ask`.

### Việc 2 — Nạp context vào generateAiOutput (ai-service.ts), CHỈ nhánh reply_draft
File `backend/src/modules/ai/ai-service.ts`, trong `generateAiOutput`:
1. **Hồ sơ + nhu cầu khách:** load thêm contact fields ngoài `fullName` — `phone, gender,
   birthYear, occupation, incomeRange, province, district, source, metadata` (đọc
   `metadata.productNeed` nếu có). Có thể mở rộng `loadConversation` select hoặc query contact riêng.
2. **Truy hồi gói liên quan:** chỉ khi `input.type === 'reply_draft'`:
   - Dựng `query` từ vài tin gần nhất của KHÁCH (senderType !== 'self'), lấy ~6 tin cuối,
     nối text lại (fallback: tin cuối cùng bất kỳ nếu không có tin khách).
   - `const kbChunks = await retrieveRelevantChunks({ orgId, query, topK: 10 })`.
   - Cắt mỗi chunk tối đa ~800 ký tự, tổng tối đa 10 chunk, để kiểm soát token.
3. **Prompt công ty:** đọc `currentConfig.aiAssistantPromptTemplate` (đã có trong aiConfig qua
   getAiConfig). Nếu null → bỏ qua block này (không chèn mặc định virtual-chat vì prompt đó
   ép output JSON, không hợp draft).
4. **Ghép userPrompt** (chỉ reply_draft) theo thứ tự, mỗi phần trong tag riêng:
   - `<company_guidance>` … aiAssistantPromptTemplate … `</company_guidance>` (nếu có)
   - `<customer_profile>` … JSON hồ sơ + productNeed … `</customer_profile>`
   - `<company_docs>` … với mỗi chunk: `[Tài liệu: {docTitle}]\n{content}` … `</company_docs>`
     (nếu kbChunks rỗng → ghi 1 dòng "Không có tài liệu công ty liên quan.")
   - `<conversation_context>` … như hiện tại … `</conversation_context>`
   - Escape ranh giới tag như `escapeXmlBoundary` đang làm.
5. **System prompt reply_draft:** mở rộng `buildReplyDraftPrompt` (hoặc thêm hàm mới) để thêm
   guardrail, giữ ngôn ngữ vi/en:
   - "Chỉ dùng giá / chính sách / tồn kho / bảo hành CÓ trong <company_docs>. Nếu thông tin
     được hỏi KHÔNG có trong tài liệu → nói rõ 'em kiểm tra lại và báo anh/chị sau', TUYỆT ĐỐI
     KHÔNG tự bịa số."
   - "Bám <company_guidance> về vai trò và giọng điệu. Cá nhân hoá theo <customer_profile>."
   - "Chỉ trả về bản nháp tin nhắn (plain text), không kèm giải thích."
6. **Response:** trả thêm `sources: string[]` = danh sách docTitle (unique) đã dùng, cạnh
   `{content, confidence}`. summary/sentiment giữ nguyên response cũ.
   Việc lưu `aiSuggestion` giữ nguyên.

### Việc 3 — (Tùy chọn, nhỏ) hiển thị nguồn ở FE
Nếu response `/ai/suggest` có `sources`, hiển thị 1 dòng "Nguồn: {sources.join(', ')}" dưới
bản nháp ở component đang render kết quả suggest (ví dụ `ai-suggestion-panel.vue` hoặc nơi
`AISuggestBar`/chat gọi suggest). Nếu không chắc chỗ render → BỎ QUA việc 3, chỉ làm BE.

### Ràng buộc
- KHÔNG đổi schema/migration. KHÔNG đổi `summary`/`sentiment`. KHÔNG đổi `/ai/knowledge/ask`.
- Draft phải chạy được khi: KB rỗng, chưa cấu hình embedding, embedding lỗi (kbChunks=[]).
- Giữ nguyên guard quota/privacy/capability ở route (không sửa `ai-routes.ts` phần đó).
- Kiểm soát token: cap chunk 800 ký tự, tối đa 10 chunk.

### Verify (bắt buộc)
- `cd backend && npx tsc --noEmit` = 0 lỗi.
- Chạy test sẵn có liên quan AI: `tests/security/ai-capabilities.test.ts`,
  `tests/unit/tag-apply-ai-regression.test.ts` — vẫn PASS.
- Boot không crash: build xong `node dist/app.js` vài giây KHÔNG có route trùng / unhandled.
- Nêu rõ diff từng file + xác nhận: (a) summary/sentiment không đổi behavior,
  (b) reply_draft khi KB rỗng vẫn trả content, (c) khi KB có docs thì `sources` không rỗng.
- KHÔNG tự deploy. Xong thì báo diff để tôi tự commit + deploy.

## ===== HẾT PROMPT =====

---

## Quy trình deploy sau khi Claude Code sửa xong (tôi tự làm)
1. Windows: `git add -A && git commit -m "feat(ai): noi KB + ho so KH + prompt cong ty vao nut goi y" && git push origin main`
2. VPS: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app`
3. Test: mở 1 hội thoại có khách hỏi về gói → bấm ✨ → nháp phải nhắc đúng thông tin gói + hiện nguồn.

## Ghi chú token/chi phí
Prompt sẽ dài hơn (KB + hồ sơ). Nếu thấy tốn: giảm topK 10→6, hoặc dùng model rẻ cho draft.
