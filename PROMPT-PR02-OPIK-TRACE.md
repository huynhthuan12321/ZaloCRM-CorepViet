# PROMPT — PR-02: Opik Trace-only

## Ngữ cảnh

PR-01 (AI Privacy & Policy Guard) đã merge. Kiến trúc hiện tại:

- **`ai-privacy-guard.ts`** — Branded `AiDataGrant` với `unique symbol`. `authorizeAiData()` kiểm tra privacyMode. Mọi AI path đều phải có grant.
- **`ai-generation-executor.ts`** — Trung tâm dispatch duy nhất cho tất cả LLM calls. Yêu cầu grant + validate URL trước khi gọi provider. Đây là choke point cho instrumentation.
- **`ai-send-policy.ts`** — `decideAutoReplySendPolicy()` và `decideFollowupSendPolicy()` — mandatory, không bypass.
- **`ai-provider-url-policy.ts`** — DNS resolve + private IP check + allowlist.

**Stack:** Node 20 prod (Dockerfile Alpine) / Node 24 dev local, ESM `"type": "module"`, Vitest 4.1.4, TypeScript strict, Prisma 7.5, PostgreSQL 16, Redis 7, BullMQ.

**AI reply queue:** Không có — auto-reply chạy in-process fire-and-forget.

**Graceful shutdown:** `app.ts` line 518-541, SIGTERM/SIGINT handler, 10s hard timeout, đóng BullMQ worker + Fastify.

---

## Scope invariants — OBSERVE, NOT CONTROL

Opik must not be a policy engine, queue, orchestrator, source of truth or Zalo dependency.

**Không thay đổi:** Prisma/schema/migrations, Frontend, Prompts, Knowledge content/title, Zalo listener, Provider payload/model/output, Auto-reply policy/behavior, Redis/BullMQ topology, Docker-compose, n8n/Lark, Promptfoo.

---

## Việc 1 — Dependency

1. Kiểm tra phiên bản `opik` mới nhất trên npm (tại thời điểm audit: 2.2.59). Pin exact version trong `package.json`.
2. Thêm explicit `zod` peer dependency (SDK yêu cầu `^3.25.55`). Pin exact compatible version.
3. Chạy `npm install` và review lockfile changes.
4. **Không** chạy `opik-ts configure`.
5. **Không** nâng Node.
6. Kiểm tra transitive dependencies — báo cáo nếu có security advisory.

---

## Việc 2 — Config

Thêm vào `backend/src/config/index.ts`:

```typescript
// Opik observability (PR-02)
opikEnabled: envValue('OPIK_ENABLED') === 'true',
opikUrlOverride: envValue('OPIK_URL_OVERRIDE') || '',
opikApiKey: envValue('OPIK_API_KEY') || '',
opikWorkspace: envValue('OPIK_WORKSPACE') || '',
opikProjectName: envValue('OPIK_PROJECT_NAME') || 'zalocrm',
opikEnvironment: envValue('OPIK_ENVIRONMENT') || '',
opikSampleRate: Math.max(0, Math.min(1, Number(envValue('OPIK_SAMPLE_RATE')) || 0)),
opikHashSecret: envValue('OPIK_HASH_SECRET') || '',
opikBatchDelayMs: Number(envValue('OPIK_BATCH_DELAY_MS')) || 300,
opikFlushTimeoutMs: Number(envValue('OPIK_FLUSH_TIMEOUT_MS')) || 500,
opikMaxPending: Number(envValue('OPIK_MAX_PENDING')) || 1000,
opikLogLevel: envValue('OPIK_LOG_LEVEL') || 'WARN',
```

Thêm vào `.env.example`:

```env
# ── Opik Observability (PR-02) ────────────────────────────────
# OPIK_ENABLED=false            # Master switch — false = zero SDK/network/timer
# OPIK_URL_OVERRIDE=            # Opik server URL (required when enabled)
# OPIK_API_KEY=                 # Opik API key (required when enabled)
# OPIK_WORKSPACE=               # Opik workspace name
# OPIK_PROJECT_NAME=zalocrm     # Project name in Opik dashboard
# OPIK_ENVIRONMENT=             # e.g. production, staging
# OPIK_SAMPLE_RATE=0            # 0.0–1.0, fraction of traces to export
# OPIK_HASH_SECRET=             # HMAC-SHA256 secret for ID pseudonymization (≥32 chars)
# OPIK_BATCH_DELAY_MS=300       # SDK batch delay
# OPIK_FLUSH_TIMEOUT_MS=500     # Max wait for shutdown flush
# OPIK_MAX_PENDING=1000         # Drop traces when queue exceeds this
# OPIK_LOG_LEVEL=WARN           # SDK log level
```

**Quy tắc:**
- `OPIK_ENABLED=false` → KHÔNG dynamic import opik, KHÔNG init client, KHÔNG timer/background, KHÔNG network, KHÔNG flush.
- `OPIK_ENABLED=true` nhưng URL hoặc hash secret thiếu/invalid → exporter disabled, local warning, CRM tiếp tục bình thường.
- `OPIK_SAMPLE_RATE=0` → zero events selected (nhưng SDK vẫn init nếu enabled).

---

## Việc 3 — Tạo 4 file observability

Tất cả đặt trong `backend/src/modules/ai/observability/`.

### 3a. `ai-trace-contract.ts` — Types/Enums/Schema

```typescript
export type AiOperation =
  | 'reply' | 'summary' | 'sentiment' | 'auto_reply' | 'followup'
  | 'virtual_chat' | 'customer_summary' | 'rag_answer'
  | 'appointment_parse' | 'format_rich';

export type AiTraceStatus =
  | 'generated' | 'provider_failed' | 'privacy_denied'
  | 'needs_review' | 'policy_blocked' | 'auto_sent'
  | 'send_failed' | 'fallback' | 'disabled';

export type SafeAiErrorType =
  | 'provider_timeout' | 'provider_rate_limit' | 'provider_auth'
  | 'provider_server' | 'provider_unknown' | 'privacy_denied'
  | 'config_missing' | 'quota_exhausted' | 'internal';

export type AiChannel = 'zalo' | 'virtual' | 'crm_note' | 'knowledge' | 'editor';

export type SafeAiTraceEvent = {
  schema_version: 1;
  trace_id: string;                  // Random UUID, không derive từ customer
  operation: AiOperation;
  organization_hash: string;         // HMAC
  conversation_hash?: string;        // HMAC
  contact_hash?: string;             // HMAC
  channel: AiChannel;
  provider?: string;                 // Length-limited, no URL/key
  model?: string;                    // Length-limited
  source_count?: number;             // Non-negative integer
  latency_ms: number;                // Non-negative finite integer
  status: AiTraceStatus;
  auto_sent?: boolean;
  error_type?: SafeAiErrorType;
};
```

**OMIT — không ghi, không fake "unknown":** `prompt_version`, `knowledge_version`, `intent`, `risk_level`, `confidence`, `input_tokens`, `output_tokens`, `estimated_cost`, `human_reviewed`, `human_edited`.

### 3b. `ai-trace-sanitizer.ts` — Allowlist + HMAC + Scanner

Chức năng:

1. **`hmacPseudonymize(secret, prefix, rawId)`** — `HMAC-SHA256(secret, prefix+":"+rawId)` trả hex. Domain prefixes: `"org:"`, `"conversation:"`, `"contact:"`. Dùng `node:crypto` createHmac.

2. **`buildSafeTraceEvent(raw, secret)`** — Construct MỚI allowlisted object từ raw internal event. **KHÔNG spread raw event.** Validate từng field theo type/enum/length. Unknown fields bị drop by construction.

3. **`scanForSecrets(serialized)`** — Scan chuỗi JSON serialized cho high-entropy patterns: Bearer tokens (`/Bearer\s+[A-Za-z0-9._~+\/=-]{20,}/`), API keys (`/sk-[A-Za-z0-9]{20,}/`, `/key-[A-Za-z0-9]{20,}/`), phone VN (`/0[0-9]{9,10}/`, `/\+84[0-9]{9,10}/`), Zalo UID patterns (`/[0-9]{10,18}/` ngoài context cho phép), email patterns. Trả boolean.

4. **Runtime schema validation** — Sau khi build safe event, serialize JSON rồi chạy scanner. Nếu scanner phát hiện → drop toàn bộ event, log warning. Nếu validation fail bất kỳ field → drop toàn bộ, không gửi partial.

**Provider/model validation:** Length ≤ 100 chars, không chứa control characters, không chứa URL scheme (`://`), không chứa key patterns.

### 3c. `opik-exporter.ts` — Lazy SDK adapter, bounded publish/flush

```typescript
let _client: OpikClient | null = null;
let _pending = 0;

export async function initOpikExporter(): Promise<void>
export function publishTrace(event: SafeAiTraceEvent): void  // fire-and-forget
export async function flushOpik(): Promise<void>              // bounded shutdown
export function isOpikActive(): boolean
```

Quy tắc:
- **Lazy init:** Chỉ `import('opik')` khi `initOpikExporter()` được gọi VÀ `config.opikEnabled === true` VÀ URL + hashSecret hợp lệ.
- **Bounded pending:** `_pending` counter. Nếu `_pending >= config.opikMaxPending` → drop event, log warning, return.
- **publishTrace:** Increment pending → gọi SDK trace → decrement pending. Wrap toàn bộ trong try-catch. **KHÔNG throw, KHÔNG await trong caller.**
- **flushOpik:** `Promise.race([client.flush(), timeout(config.opikFlushTimeoutMs)])`. Timeout trả về bình thường (không crash).
- **Error isolation:** Mọi SDK error (sync và async) phải bị catch. Không propagate ra business code.
- **Không CRM-side retry.** SDK tự có batching/retry nội bộ.
- **OPIK_ENABLED=false:** `initOpikExporter()` là no-op, `publishTrace()` return ngay, `flushOpik()` resolve ngay, `isOpikActive()` trả false.

### 3d. `ai-tracer.ts` — Neutral trace/span facade

Business code import facade này, **KHÔNG import opik types**.

```typescript
export function startAiTrace(input: {
  operation: AiOperation;
  orgId: string;
  conversationId?: string;
  contactId?: string;
  channel: AiChannel;
}): AiTraceContext

export function addSpan(ctx: AiTraceContext, name: string): AiSpanContext
export function endSpan(span: AiSpanContext): void

export function endAiTrace(ctx: AiTraceContext, result: {
  status: AiTraceStatus;
  provider?: string;
  model?: string;
  sourceCount?: number;
  autoSent?: boolean;
  errorType?: SafeAiErrorType;
}): void
```

- `startAiTrace` tạo random trace_id (UUID v4), ghi startTime.
- `endAiTrace` tính latency_ms, gọi `buildSafeTraceEvent()`, sample rate check (so sánh `Math.random()` với `config.opikSampleRate`), rồi `publishTrace()`.
- Sample rate check: dùng injectable RNG cho testability — default `Math.random`, test inject deterministic.
- Khi `!isOpikActive()`: tất cả methods là no-op (return dummy context, không tính toán).

---

## Việc 4 — Instrument lifecycle

### Trace hierarchy:

```
crm.ai.<operation>
├─ authorize_privacy
├─ load_context             [khi code thực sự load conversation/contact]
├─ retrieve_knowledge       [reply/rag only, khi retrieveRelevantChunks chạy]
├─ build_prompt             [khi thực sự build prompt string]
├─ llm_generation           [executeAiGeneration]
├─ policy_evaluation        [auto-reply/follow-up only]
└─ send_zalo               [auto-reply/follow-up only]
```

**KHÔNG tạo spans giả:** `classify_intent`, `retrieve_business_facts`, `human_review`, `customer_outcome`.

### 4a. `ai-generation-executor.ts`

Wrap `executeAiGeneration` — nhận optional `AiTraceContext`, add `llm_generation` span quanh provider dispatch, ghi provider+model+status.

Vì `executeAiGeneration` là choke point duy nhất, mọi generation tự động có span.

### 4b. `ai-service.ts`

Trong `generateAiOutput` (reply/summary/sentiment):
- `startAiTrace` ở đầu function
- Spans: `load_context`, `retrieve_knowledge` (nếu có), `build_prompt`, pass trace context xuống `executeAiGeneration`
- `endAiTrace` với status cuối cùng

Trong `aiFormatRichText`:
- Tương tự nhưng operation='format_rich', channel='editor'

### 4c. `ai-auto-reply-service.ts`

Trong `runAutoReply` (hoặc tương đương):
- `startAiTrace` operation='auto_reply', channel='zalo'
- Span `authorize_privacy` quanh `authorizeAiData`
- Span `policy_evaluation` quanh `decideAutoReplySendPolicy` (cả pre-delay và post-delay)
- Span `send_zalo` quanh Zalo send
- `endAiTrace` với status phản ánh kết quả: `privacy_denied`, `needs_review`, `policy_blocked`, `auto_sent`, `send_failed`, `provider_failed`

### 4d. `ai-followup-service.ts` + `ai-followup-cron.ts`

- `generateFollowupMessage`: `startAiTrace` operation='followup'
- `processCandidate` (cron): Span `policy_evaluation`, span `send_zalo`, status `policy_blocked`/`auto_sent`/`send_failed`

### 4e. `ai-virtual-chat-service.ts`

- operation='virtual_chat', channel='virtual'

### 4f. `customer-summary-service.ts`

- operation='customer_summary', channel='zalo'

### 4g. `knowledge-service.ts` (ragAnswer)

- operation='rag_answer', channel='knowledge'

### 4h. `app.ts` — Shutdown flush

Trong shutdown handler (line 522-539), thêm:

```typescript
import { flushOpik } from './modules/ai/observability/opik-exporter.js';
// ... trong shutdown function, TRƯỚC app.close():
await flushOpik().catch((e) => logger.warn('[shutdown] opik flush lỗi:', e));
```

`flushOpik` đã có `Promise.race` timeout nội bộ, nên không giữ shutdown quá bound.

---

## Việc 5 — Tests

Tạo file test trong `backend/tests/security/` và `backend/tests/unit/`:

### O01–O06: Sanitizer + disabled mode

File: `backend/tests/unit/ai-trace-sanitizer.test.ts`

- **O01:** `OPIK_ENABLED=false` → verify `isOpikActive()` returns false, `publishTrace` is no-op, zero `import('opik')` call.
- **O02:** Raw phone `0901234567` trong input → `scanForSecrets` returns true → event dropped.
- **O03:** Raw Zalo UID `1234567890123456` → dropped.
- **O04:** Raw conversation content field → buildSafeTraceEvent drops unknown fields.
- **O05:** `Bearer sk-abc123...` pattern → scanner detects → dropped.
- **O06:** Unknown field `{ customer_name: 'Nguyen Van A' }` → absent from output.

### O07–O09: HMAC pseudonymization

File: `backend/tests/unit/ai-trace-pseudonymize.test.ts`

- **O07:** Same entity + same secret → stable (deterministic) pseudonym.
- **O08:** Different IDs + same secret → different pseudonyms.
- **O09:** Same ID + different secrets → different pseudonyms.
- **Bonus:** Different prefixes ("org:" vs "conversation:") with same raw ID → different pseudonyms.

### O10–O14: Exporter error isolation

File: `backend/tests/unit/ai-opik-exporter.test.ts`

Mock `import('opik')` để không cần real SDK.

- **O10:** SDK/background timeout → CRM result unchanged.
- **O11:** DNS/network failure → CRM result unchanged.
- **O12:** Opik 500 → CRM result unchanged.
- **O13:** Malformed SDK response → CRM result unchanged.
- **O14:** Exporter throws synchronously → business callback still runs.

### O15–O18: Trace structure

File: `backend/tests/unit/ai-tracer.test.ts`

- **O15:** Successful generation → one root trace + real spans + correct status.
- **O16:** Provider failure → status='provider_failed', no raw error message in event.
- **O17:** Needs review → status='needs_review', auto_sent=false.
- **O18:** Auto-send → policy span precedes send span, status='auto_sent'.

### O19–O22: Regression / behavior identity

File: `backend/tests/security/ai-trace-regression.test.ts`

- **O19:** Manual AI output unchanged with tracing on vs off.
- **O20:** Auto-reply Zalo mock behavior identical on vs off.
- **O21:** Follow-up Zalo mock behavior identical on vs off.
- **O22:** AI disabled → no generation, optional safe 'disabled' status only.

### Bổ sung tests:

- **Sample rate:** `sampleRate=0` → zero events exported. `sampleRate=1` → all events exported. Injected RNG cho deterministic.
- **Invalid hash secret:** Empty/short secret → zero export, warning logged.
- **Unsafe Opik URL:** Private IP / localhost → zero init/network.
- **Max pending:** Exceed `OPIK_MAX_PENDING` → event dropped safely, counter accurate.
- **Flush:** Normal flush completes.
- **Flush timeout:** Slow flush returns within `OPIK_FLUSH_TIMEOUT_MS` bound.
- **Provider/model validation:** Length >100 or control chars → rejected.
- **Serialized payload canaries:** Verify serialized JSON of exported trace contains ZERO matches for: phone `0901234567`, UID `1234567890123456`, bearer token `Bearer sk-test`, customer text `"Tôi muốn mua hàng"`.
- **Disabled path import:** When `OPIK_ENABLED=false`, `import('opik')` must NOT execute (mock and assert zero calls).

---

## Checklist sau khi hoàn thành

```bash
# 1. TypeScript compile
npx tsc --noEmit

# 2. Chạy targeted PR-02 tests
npx vitest run tests/unit/ai-trace-sanitizer.test.ts
npx vitest run tests/unit/ai-trace-pseudonymize.test.ts
npx vitest run tests/unit/ai-opik-exporter.test.ts
npx vitest run tests/unit/ai-tracer.test.ts
npx vitest run tests/security/ai-trace-regression.test.ts

# 3. Chạy PR-01 tests (regression)
npx vitest run tests/security/ai-privacy-guard.test.ts
npx vitest run tests/security/ai-generation-executor.test.ts
npx vitest run tests/security/ai-static-boundary.test.ts
npx vitest run tests/security/ai-provider-url-policy.test.ts
npx vitest run tests/unit/ai-send-policy.test.ts

# 4. Build
npm run build

# 5. Verify OPIK_ENABLED=false produces zero network
grep -rn "import.*opik" backend/src/ --include="*.ts"
# Chỉ nên thấy dynamic import trong opik-exporter.ts, guarded by config check

# 6. Verify zero Prisma/migration changes
git diff --name-only | grep -i prisma  # phải rỗng

# 7. Verify zero frontend changes
git diff --name-only | grep -i frontend  # phải rỗng
```

## KHÔNG làm

- KHÔNG enable Opik trong production config
- KHÔNG commit/push/deploy nếu chưa được authorize riêng
- KHÔNG sửa Prisma schema, frontend, prompts, Knowledge content
- KHÔNG thay đổi auto-reply/follow-up/virtual-chat business logic
- KHÔNG thay đổi provider request/payload/model behavior
- KHÔNG sửa Docker-compose, Redis, BullMQ topology
- KHÔNG dùng undocumented SDK timeout option
- KHÔNG gửi input/output (prompt/response text) cho Opik
- KHÔNG gửi customer PII, Zalo UID, API keys, raw errors cho Opik

## Báo cáo sau khi xong

Report:
1. Exact opik + zod versions pinned
2. Files changed (list)
3. Tests count + all pass?
4. `npm run build` pass?
5. Runtime overhead estimate
6. Transitive dependency count + any security advisories
7. Residual risks
8. Kill switch: `OPIK_ENABLED=false` tested?
9. Revert procedure: `git revert <commit>`
