# Phần B — Điều khiển trợ lý từ xa (API điều khiển + MCP)

Mục tiêu: tạm dừng / tiếp tục trợ lý tự động từ xa, kể cả khi không ngồi máy tính.
Gồm 2 phần: **B1 = API điều khiển trong ZaloCRM** (làm + test TRƯỚC); **B2 = MCP server** (ra lệnh qua Claude/Hermes).

Bối cảnh mã nguồn (đã kiểm tra):
- Công tắc tổng trợ lý: `AiConfig.aiAutoReplyGlobalEnabled` (per org). Tắt = mọi trả lời tự động dừng, kể cả
  tin đang chờ trong độ trễ. Còn có `aiAutoReplyScope`, `aiAutoReplyFullAuto`, `aiFollowupEnabled`.
- Public API: `backend/src/modules/api/public-api-routes.ts`. Đã có preHandler `apiKeyAuth`: đọc header
  `X-Api-Key` → `hashApiKey` → tra `appSetting(settingKey='public_api_key', valueHash)` → gán `request.orgId`.
  Mọi route public đã dùng `(request as any).orgId`. Dùng lại đúng cơ chế này.

---

## ===== PHẦN B1 — API ĐIỀU KHIỂN (làm trước, test được ngay) =====

Trong `public-api-routes.ts`, thêm 3 route (nằm dưới preHandler `apiKeyAuth` sẵn có, tự có `request.orgId`):

- `GET /api/public/ai/status` → đọc AiConfig của `orgId`, trả:
  `{ globalEnabled: boolean, scope: string, fullAuto: boolean, followupEnabled: boolean }`
  (map từ aiAutoReplyGlobalEnabled, aiAutoReplyScope, aiAutoReplyFullAuto, aiFollowupEnabled).
- `POST /api/public/ai/pause` → `prisma.aiConfig.update({ where:{orgId}, data:{ aiAutoReplyGlobalEnabled:false }})`;
  trả status mới (như GET).
- `POST /api/public/ai/resume` → set `aiAutoReplyGlobalEnabled:true`; trả status mới.

Yêu cầu:
- CHỈ đổi `aiAutoReplyGlobalEnabled`. scope/fullAuto/followup GIỮ NGUYÊN → resume xong hành vi về đúng như trước.
- Ghi `activityLog` (actorType 'api', action 'ai_paused' / 'ai_resumed', entityType 'ai_config').
- Nếu org chưa có AiConfig thì tạo qua `getAiConfig(orgId)` trước khi update. Trả lỗi rõ nếu có.
- KHÔNG đụng các route public khác.

Kiểm tra B1:
- `cd backend && npx tsc --noEmit` = 0 lỗi; build = 0 lỗi; boot không trùng route.
- Xác nhận: gọi `POST /api/public/ai/pause` kèm header `X-Api-Key` → `aiAutoReplyGlobalEnabled` về false;
  `POST /resume` → true; `GET /status` phản ánh đúng.

---

## ===== PHẦN B2 — MCP SERVER (làm sau khi B1 chạy) =====

Tạo dự án MCP server RIÊNG ở thư mục `D:\ZaloCRM-CorepViet\mcp-server\` (không trộn vào backend).

Cấu trúc tối thiểu:
- `package.json`, `tsconfig.json`, `src/index.ts`, `.env.example`, `Dockerfile`, `README.md`.
- Dùng gói chính thức `@modelcontextprotocol/sdk`. Transport: **stdio** (đơn giản, chạy được với Claude
  Desktop trên máy, và với Hermes trên VPS). (Bản HTTP-remote cho app Claude điện thoại làm bước riêng sau.)
- Biến môi trường (`.env`): `ZALOCRM_API_BASE` (vd https://zalocrm.corepviet.com), `ZALOCRM_API_KEY`.
- Đăng ký 3 tool (tên + mô tả tiếng Việt rõ để LLM gọi đúng):
  - `tat_tu_van` — "Tạm dừng trợ lý AI tự động (ngừng mọi tin tự gửi cho khách)".
    → `POST {ZALOCRM_API_BASE}/api/public/ai/pause`, header `X-Api-Key: {ZALOCRM_API_KEY}`.
  - `bat_tu_van` — "Bật lại trợ lý AI tự động".
    → `POST {ZALOCRM_API_BASE}/api/public/ai/resume`.
  - `xem_trang_thai` — "Xem trợ lý AI đang bật hay tắt và cấu hình phạm vi hiện tại".
    → `GET {ZALOCRM_API_BASE}/api/public/ai/status`.
- Mỗi tool: gọi API bằng fetch, đọc JSON, trả về CHUỖI tiếng Việt gọn cho người dùng, ví dụ:
  "✅ Đã tạm dừng trợ lý. Hiện tại: TẮT." / "▶️ Đã bật lại trợ lý. Hiện tại: BẬT (phạm vi: mọi khách)."
  Lỗi mạng/HTTP → trả chuỗi báo lỗi thân thiện, không throw.
- `ZALOCRM_API_KEY` chỉ đọc từ env, KHÔNG in ra log.
- `README.md`: ghi cách chạy local (`npm i && npm run build && node dist/index.js`) và biến env cần đặt.

Kiểm tra B2:
- `cd mcp-server && npm install && npm run build` = 0 lỗi.
- Chạy `node dist/index.js` — server MCP stdio khởi động không lỗi (nêu cách test 3 tool, hoặc mô tả cấu hình
  để cắm vào 1 MCP host).

### Ràng buộc chung
- KHÔNG đổi schema DB (B1 chỉ ghi field AiConfig sẵn có).
- MCP server độc lập, backend chính không phụ thuộc nó.
- Không tự đưa lên máy chủ. Xong nêu các tệp mới + cách chạy + xác nhận B1 test đạt.

## ===== HẾT YÊU CẦU =====

---

## Cài đặt & kết nối (tôi làm sau khi Claude Code xong)
1. **Deploy B1** lên VPS như thường (không migration) → có ngay kill switch qua API.
2. **Dùng ngay không cần MCP:** mở `zalocrm.corepviet.com` trên điện thoại → tắt công tắc tổng (đường tin cậy nhất).
3. **MCP:** cắm mcp-server vào một MCP host:
   - Claude Desktop (máy tính): thêm mcp-server vào cấu hình MCP → gõ "tắt tư vấn".
   - Hoặc Hermes trên VPS (nếu bạn dùng): nạp mcp-server → chat qua Telegram từ điện thoại.
   - (Muốn dùng trực tiếp app Claude điện thoại: cần bản MCP HTTP-remote + custom connector — bước riêng.)

## Thứ tự khuyến nghị
Làm **B1 trước → deploy → test kill switch qua API/điện thoại**. Ổn rồi mới làm **B2 (MCP server)**. Tách 2 lần
chạy trong Claude Code cho gọn và dễ kiểm.
