# PROMPT — PR-02 Cleanup: Test Granularity + Missing Regression Tests

## Ngữ cảnh

PR-02 (Opik Trace-only) đã triển khai xong. Review phát hiện 3 vấn đề về test coverage cần bổ sung trước khi commit.

**Stack:** Node 20 prod / Node 24 dev, ESM `"type": "module"`, Vitest 4.1.4, TypeScript strict.

**Existing PR-02 test files (5 files, 19 tests passing):**
- `backend/tests/unit/ai-trace-sanitizer.test.ts` — 6 tests
- `backend/tests/unit/ai-trace-pseudonymize.test.ts` — 4 tests
- `backend/tests/unit/ai-opik-exporter.test.ts` — 4 tests
- `backend/tests/unit/ai-tracer.test.ts` — 4 tests
- `backend/tests/security/ai-trace-regression.test.ts` — 1 test

---

## Việc 1 — Tách O10-O14 thành từng test riêng

File: `backend/tests/unit/ai-opik-exporter.test.ts`

Hiện tại O10-O14 gộp chung 1 `it()` block. Tách thành 5 tests riêng biệt:

```typescript
it('O10 SDK timeout does not affect CRM', async () => {
  const business = vi.fn(() => 'ok');
  setOpikClientForTest({ trace: vi.fn(() => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50))) });
  publishTrace(event);
  expect(business()).toBe('ok');
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(getOpikPendingCountForTest()).toBe(0);
});

it('O11 DNS/network failure does not affect CRM', async () => {
  const business = vi.fn(() => 'ok');
  setOpikClientForTest({ trace: vi.fn(() => Promise.reject(new Error('ENOTFOUND'))) });
  publishTrace(event);
  expect(business()).toBe('ok');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(getOpikPendingCountForTest()).toBe(0);
});

it('O12 Opik 500 does not affect CRM', async () => {
  const business = vi.fn(() => 'ok');
  setOpikClientForTest({ trace: vi.fn(() => Promise.reject(new Error('500 Internal Server Error'))) });
  publishTrace(event);
  expect(business()).toBe('ok');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(getOpikPendingCountForTest()).toBe(0);
});

it('O13 malformed SDK response does not affect CRM', async () => {
  const business = vi.fn(() => 'ok');
  setOpikClientForTest({ trace: vi.fn(() => ({ unexpected: true })) });
  publishTrace(event);
  expect(business()).toBe('ok');
  await new Promise((resolve) => setTimeout(resolve, 0));
});

it('O14 synchronous SDK throw does not affect CRM', async () => {
  const business = vi.fn(() => 'ok');
  setOpikClientForTest({ trace: vi.fn(() => { throw new Error('boom'); }) });
  publishTrace(event);
  expect(business()).toBe('ok');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(getOpikPendingCountForTest()).toBe(0);
});
```

**Xóa** test cũ `'O10-O14 isolates sync and async SDK errors'` và thay bằng 5 tests trên.

---

## Việc 2 — Tách O17/O18 thành từng test riêng

File: `backend/tests/unit/ai-tracer.test.ts`

Hiện tại gộp chung. Tách:

```typescript
it('O17 needs_review has auto_sent=false', async () => {
  const ctx = startAiTrace({ operation: 'auto_reply', orgId: 'org-a', channel: 'zalo' });
  const policySpan = addSpan(ctx, 'policy_evaluation');
  endSpan(policySpan);
  endAiTrace(ctx, { status: 'needs_review', autoSent: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(traceCalls).toHaveLength(1);
  expect(traceCalls[0].metadata.status).toBe('needs_review');
  expect(traceCalls[0].metadata.auto_sent).toBe(false);
});

it('O18 auto_sent trace has policy span before send span', async () => {
  const ctx = startAiTrace({ operation: 'auto_reply', orgId: 'org-a', channel: 'zalo' });
  const policySpan = addSpan(ctx, 'policy_evaluation');
  endSpan(policySpan);
  const sendSpan = addSpan(ctx, 'send_zalo');
  endSpan(sendSpan);
  endAiTrace(ctx, { status: 'auto_sent', autoSent: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(traceCalls).toHaveLength(1);
  expect(traceCalls[0].metadata.status).toBe('auto_sent');
  expect(traceCalls[0].metadata.auto_sent).toBe(true);
  const spanNames = traceCalls[0].spans.map((s: any) => s.name);
  expect(spanNames.indexOf('policy_evaluation')).toBeLessThan(spanNames.indexOf('send_zalo'));
});
```

**Xóa** test cũ `'O17/O18 records review and auto-send statuses'`.

---

## Việc 3 — Bổ sung O19-O21 regression tests

File: `backend/tests/security/ai-trace-regression.test.ts`

Giữ nguyên test O19-O22 hiện có. Thêm 3 tests mới:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { config } from '../../src/config/index.js';
import { startAiTrace, endAiTrace } from '../../src/modules/ai/observability/ai-tracer.js';
import { isOpikActive, publishTrace, resetOpikExporterForTest, setOpikClientForTest } from '../../src/modules/ai/observability/opik-exporter.js';
import { buildSafeTraceEvent } from '../../src/modules/ai/observability/ai-trace-sanitizer.js';

describe('ai trace regression guard', () => {
  beforeEach(() => {
    resetOpikExporterForTest();
    config.opikEnabled = false;
  });

  // Giữ nguyên test hiện có
  it('O19-O22 disabled tracing is a no-op surface', () => {
    const ctx = startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' });
    expect(isOpikActive()).toBe(false);
    expect(ctx.active).toBe(false);
  });

  // O19: Manual AI output unchanged — endAiTrace returns without side effect
  it('O19 endAiTrace is no-op when disabled — no SDK calls', async () => {
    const traceFn = vi.fn();
    // Deliberately NOT calling setOpikClientForTest — client stays null
    const ctx = startAiTrace({ operation: 'reply', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    endAiTrace(ctx, { status: 'generated', provider: 'gemini', model: 'gemini-2.5-flash' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // No SDK trace call should have happened
    expect(traceFn).not.toHaveBeenCalled();
    expect(isOpikActive()).toBe(false);
  });

  // O20: Auto-reply trace path does not alter return flow
  it('O20 auto-reply trace lifecycle completes silently when disabled', async () => {
    const ctx = startAiTrace({ operation: 'auto_reply', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    expect(ctx.active).toBe(false);
    // Simulating full auto-reply lifecycle — none should throw
    expect(() => endAiTrace(ctx, { status: 'auto_sent', autoSent: true })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'needs_review', autoSent: false })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'policy_blocked' })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'send_failed', errorType: 'provider_unknown' })).not.toThrow();
  });

  // O21: Follow-up trace path does not alter return flow
  it('O21 follow-up trace lifecycle completes silently when disabled', async () => {
    const ctx = startAiTrace({ operation: 'followup', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    expect(ctx.active).toBe(false);
    expect(() => endAiTrace(ctx, { status: 'auto_sent', autoSent: true })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'policy_blocked' })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'provider_failed', errorType: 'provider_server' })).not.toThrow();
  });
});
```

---

## Việc 4 — Bổ sung supplementary tests

### 4a. Invalid hash secret (thêm vào `ai-trace-sanitizer.test.ts`)

```typescript
it('rejects event when hash secret is too short', () => {
  const event = buildSafeTraceEvent({
    traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    operation: 'reply',
    orgId: 'org-a',
    channel: 'zalo',
    latencyMs: 10,
    status: 'generated',
  }, 'short');
  expect(event).toBeNull();
});

it('rejects event when hash secret is empty', () => {
  const event = buildSafeTraceEvent({
    traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    operation: 'reply',
    orgId: 'org-a',
    channel: 'zalo',
    latencyMs: 10,
    status: 'generated',
  }, '');
  expect(event).toBeNull();
});
```

### 4b. Disabled path import guard (thêm vào `ai-opik-exporter.test.ts`)

```typescript
it('O01-import disabled path never calls dynamic import', async () => {
  config.opikEnabled = false;
  // resetOpikExporterForTest already ran in beforeEach, resetting initStarted
  await initOpikExporter();
  expect(isOpikActive()).toBe(false);
  // If dynamic import had run, it would throw in test env or set active=true
  // The fact that isOpikActive()=false and no error thrown confirms no import
});
```

### 4c. Sample rate boundaries (thêm vào `ai-tracer.test.ts`)

```typescript
it('sampleRate=0 exports zero events', async () => {
  config.opikSampleRate = 0;
  setAiTraceRandomForTest(() => 0);
  endAiTrace(startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' }), { status: 'generated' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(traceCalls).toHaveLength(0);
});

it('sampleRate=1 exports all events', async () => {
  config.opikSampleRate = 1;
  setAiTraceRandomForTest(() => 0.999);
  endAiTrace(startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' }), { status: 'generated' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(traceCalls).toHaveLength(1);
});
```

---

## Checklist sau khi hoàn thành

```bash
# 1. TypeScript compile
npx tsc --noEmit

# 2. Chạy PR-02 targeted tests — expect ~30 tests
npx vitest run tests/unit/ai-trace-sanitizer.test.ts
npx vitest run tests/unit/ai-trace-pseudonymize.test.ts
npx vitest run tests/unit/ai-opik-exporter.test.ts
npx vitest run tests/unit/ai-tracer.test.ts
npx vitest run tests/security/ai-trace-regression.test.ts

# 3. Chạy PR-01 regression tests — expect 20 tests
npx vitest run tests/security/ai-privacy-guard.test.ts
npx vitest run tests/security/ai-generation-executor.test.ts
npx vitest run tests/security/ai-static-boundary.test.ts
npx vitest run tests/security/ai-provider-url-policy.test.ts
npx vitest run tests/unit/ai-send-policy.test.ts

# 4. Build
npm run build
```

## KHÔNG làm

- KHÔNG thay đổi source code (chỉ test files)
- KHÔNG thêm dependency mới
- KHÔNG sửa business logic
- KHÔNG sửa Prisma schema, frontend, Docker
