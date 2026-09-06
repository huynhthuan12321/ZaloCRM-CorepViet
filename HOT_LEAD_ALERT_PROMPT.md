# PROMPT TRIỂN KHAI — Đòn bẩy ④ (phần 2): Báo động mạnh "🔥 Khách sắp chốt" qua Telegram

> Dán nguyên file này cho AI coding agent (Claude Code) làm việc trên repo ZaloCRM-CorepViet, branch mới từ `main`.

---

## 1. Bối cảnh & mục tiêu

Hệ thống đã có Auto-tư vấn Mức A: khi khách nhắn câu NHẠY CẢM (hỏi giá / cọc / chốt đơn / thanh toán), AI **không tự trả lời** mà lưu nháp `AiSuggestion` (type `auto_reply_needs_review`) và emit socket `chat:ai-needs-review` — chỉ hiển thị TRONG app. Sale không mở CRM là lỡ khách đang nóng.

**Mục tiêu:** khi có tín hiệu chốt, bắn cảnh báo mạnh ra NGOÀI app qua Telegram để sale gọi/chốt ngay. Đây là phần còn thiếu của "Đòn bẩy ④ — Tín hiệu chốt cho người, đúng lúc".

## 2. Kiến trúc hiện có — PHẢI đọc trước khi code

| Thành phần | File | Ghi chú |
|---|---|---|
| Cửa nhạy cảm + needs-review | `backend/src/modules/ai/ai-auto-reply-service.ts` | Hàm `notifyNeedsReview()` (~dòng 360) là điểm hook Trigger A. Có `buildSensitiveRegex()` (regex per-org, fail-safe về default). Bất biến: service này KHÔNG BAO GIỜ throw ra ngoài. |
| Trí nhớ khách + giai đoạn | `backend/src/modules/ai/customer-summary-service.ts` | `updateCustomerSummaryInTenant()` cập nhật `Contact.metadata.customerSummary` (có `stage`). Điểm hook Trigger B: so sánh `previous.stage` với stage mới. |
| Gửi Telegram | `backend/src/modules/integrations/providers/telegram-bot.ts` | Đã có `sendTelegramNotification(orgId, {botToken, chatId})` gọi Bot API (hiện dùng cho daily summary). Tái sử dụng pattern fetch Bot API, KHÔNG cài thêm thư viện. Config Telegram per-org nằm ở model `Integration` (provider `telegram`). |
| Quyền + audit AI | `backend/src/modules/ai/ai-capabilities.ts` | Dùng `auditAiAction()`. Thêm capability mới `notify_external` (requireApproval: false) vào allowlist. |
| Cấu hình per-org | model `AppSetting` (orgId + settingKey unique) | Pattern tham khảo: `stage_followup_cron.ts` dùng key `stage_followup_config`. |
| Routes AI | `backend/src/modules/ai/ai-routes.ts` | Pattern `requireGrant('settings','edit')` cho PUT config. |
| Tenant | `withTenant()` / `runSystemQuery()` từ `shared/tenant/tenant-context.js` | Mọi query phải đúng tenant context. |

## 3. Yêu cầu chức năng

### 3.1. Service mới: `backend/src/modules/ai/hot-lead-alert-service.ts`

Export `maybeSendHotLeadAlert(input)` — fire-and-forget, **không bao giờ throw** (mọi lỗi → `logger.warn` + return).

**Trigger A — tín hiệu chốt trực tiếp:** gọi từ `notifyNeedsReview()` trong `ai-auto-reply-service.ts` khi `reason` là nhạy cảm (khách hỏi giá/cọc/thanh toán/địa chỉ giao). Truyền kèm câu khách nhắn.

**Trigger B — giai đoạn nhảy lên "sắp chốt":** gọi từ `customer-summary-service.ts` khi stage mới là `sap_chot` và stage cũ khác `sap_chot` và khác `da_chot`.

**Nội dung tin Telegram (plain text, tiếng Việt):**

```
🔥 KHÁCH SẮP CHỐT — GỌI NGAY
Khách: {tên khách} ({SĐT nếu có})
Nick sale: {displayName nick Zalo}
Giai đoạn: {label tiếng Việt}
Tín hiệu: {reason — vd "Khách hỏi cọc/thanh toán"}
Khách nhắn: "{trích tối đa 200 ký tự}"
Lúc: {giờ VN, Asia/Ho_Chi_Minh}
Mở hội thoại: {APP_URL}/chat?conversation={conversationId}
```

`APP_URL` đọc từ config env hiện có (tìm biến base URL frontend đang dùng trong `config/index.ts`; nếu không có thì thêm optional, fallback bỏ dòng link).

### 3.2. Cấu hình per-org — AppSetting key `hot_lead_alert_config`

```ts
type HotLeadAlertConfig = {
  enabled: boolean;              // mặc định false — chưa bật thì hành vi hệ thống Y HỆT cũ
  botToken?: string;             // để trống → dùng config Integration provider 'telegram' của org
  chatId?: string;               // để trống → như trên
  throttleMinutes: number;       // 5–1440, mặc định 30
  triggers: { sensitive: boolean; stageSapChot: boolean }; // mặc định cả 2 true
};
```

Parse fail-safe: JSON hỏng / thiếu trường → dùng default + `enabled:false`, log warn, không throw.

### 3.3. Throttle chống spam

- Mỗi `conversationId` tối đa 1 alert / `throttleMinutes`, tính chung cả 2 trigger.
- Dùng Redis nếu có (theo pattern throttle 5s/conv trong `ai-virtual-chat-service.ts`), fallback in-memory Map khi thiếu Redis. Key: `hotlead:{orgId}:{conversationId}`.

### 3.4. API — thêm vào `ai-routes.ts`

- `GET  /api/v1/ai/hot-lead-alert-config` — trả config (che botToken, chỉ trả 4 ký tự cuối).
- `PUT  /api/v1/ai/hot-lead-alert-config` — `requireGrant('settings','edit')`, validate range throttle.
- `POST /api/v1/ai/hot-lead-alert-test` — gửi 1 tin Telegram thử với dữ liệu mẫu, trả `{ok, error?}`.

### 3.5. Frontend — Settings

Thêm card **"Cảnh báo khách sắp chốt"** trong trang Settings cạnh khối AI Assistant (`frontend/src/views/settings/` — tìm page chứa cấu hình AI hiện tại):

- Toggle Bật/Tắt.
- 2 checkbox trigger: "Khách hỏi giá/cọc/thanh toán", "Giai đoạn chuyển Sắp chốt".
- Input botToken (password) + chatId, placeholder ghi rõ "Để trống = dùng cấu hình Telegram ở Tích hợp 3rd party".
- Input throttle phút.
- Nút **"Gửi thử"** gọi API test, hiện kết quả.
- Style theo component settings sẵn có, không tự chế design system mới.

### 3.6. Audit

Mỗi lần gửi (kể cả test): `auditAiAction(orgId, 'hot_lead_alert_sent', { conversationId, trigger, ok })`.

## 4. Ràng buộc kỹ thuật — BẮT BUỘC

1. **Không migration DB** — chỉ dùng `AppSetting` + model sẵn có.
2. Không phá bất biến `ai-auto-reply-service`: hook phải fire-and-forget (`void maybeSendHotLeadAlert(...).catch(...)` hoặc try/catch nuốt lỗi + log). Lỗi Telegram TUYỆT ĐỐI không được làm fail luồng needs-review/summary.
3. Header file mới: `// SPDX-License-Identifier: AGPL-3.0-or-later` + `// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension` + docblock tiếng Việt mô tả (theo style các file cùng module).
4. Không cài dependency mới. Gọi Telegram Bot API bằng `fetch` như `telegram-bot.ts`.
5. Không đụng module EE / automation-engine. Không sửa hành vi khi `enabled:false`.
6. TypeScript strict, không dùng `any` trần.
7. Cảnh báo gửi qua Telegram (không phải Zalo) nên **không phụ thuộc `MARKETING_DRY_RUN`** — ghi rõ comment điều này trong service.

## 5. Unit test (vitest, đặt cạnh test AI hiện có)

1. Parse config: JSON hỏng → default disabled; throttle ngoài range → clamp.
2. Throttle: 2 alert cùng conversation trong cửa sổ → chỉ gửi 1; khác conversation → gửi cả 2.
3. Trigger B: chỉ bắn khi stage chuyển TỪ khác → `sap_chot` (không bắn khi giữ nguyên `sap_chot`, không bắn khi `da_chot`).
4. Message builder: cắt 200 ký tự, escape nội dung, thiếu SĐT/APP_URL vẫn build được.
5. Telegram fail (mock fetch 500) → không throw, trả ok:false, có log.

Chạy: `npx vitest run <file test mới>` phải pass. KHÔNG cần sửa 49 file test fail baseline (Issue #2 — nợ cũ, ngoài phạm vi).

## 6. Tiêu chí nghiệm thu

- [ ] Bật config + khách nhắn "cho xin số tài khoản để cọc" → Telegram nhận 🔥 alert trong vài giây, sale bấm link mở đúng hội thoại.
- [ ] Stage khách chuyển sang Sắp chốt → alert (nếu trigger bật).
- [ ] Tắt config → không có gì thay đổi so với hiện tại.
- [ ] Spam 5 câu nhạy cảm liên tiếp → chỉ 1 alert trong cửa sổ throttle.
- [ ] Nút Gửi thử hoạt động, báo lỗi rõ khi botToken/chatId sai.
- [ ] `npx tsc --noEmit` (backend) không lỗi mới; test mới pass.
- [ ] Cập nhật `CHANGELOG.md` + 1 đoạn ngắn trong `PROJECT_IMPLEMENTATION_STATUS.md` (mục AI, đánh dấu Đòn bẩy ④ hoàn tất).

## 7. Thứ tự làm việc đề xuất

1. Đọc 4 file anchor ở mục 2 (đặc biệt `notifyNeedsReview` và `updateCustomerSummaryInTenant`).
2. Viết `hot-lead-alert-service.ts` + unit test → chạy test.
3. Hook 2 trigger (2 dòng gọi, mỗi file 1 chỗ, kèm comment "Đòn bẩy ④ phần 2").
4. API routes + capability `notify_external`.
5. UI Settings card + nút Gửi thử.
6. Build + tsc + vitest → cập nhật docs → commit theo convention repo (message tiếng Việt, prefix module).
