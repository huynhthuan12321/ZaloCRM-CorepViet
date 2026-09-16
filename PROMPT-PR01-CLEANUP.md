# PROMPT — PR-01 Cleanup: Dead Code + Missing Tests

## Ngữ cảnh

PR-01 (AI Privacy & Policy Guard) đã triển khai xong kiến trúc bảo mật. Review phát hiện 3 vấn đề cần xử lý trước khi commit.

**Stack:** Node 20 prod / Node 24 dev, ESM `"type": "module"`, Vitest, TypeScript strict.

---

## Việc 1 — Xóa dead code trong `ai-auto-reply-service.ts`

### 1a. Xóa `evaluateNeedsReview()` (khoảng line 362-380)

Hàm này đã bị thay thế bởi `decideAutoReplySendPolicy()` trong `ai-send-policy.ts`. Grep xác nhận KHÔNG file nào gọi `evaluateNeedsReview` ngoài chính file này.

**Hành động:** Xóa hoàn toàn hàm `evaluateNeedsReview` và type export liên quan (nếu có). Xóa khỏi export nếu export.

### 1b. Xóa `MONEY_LIKE_RE` trùng lặp (khoảng line 360)

```typescript
const MONEY_LIKE_RE = /(\d[\d.,]{2,})\s*(đ|vnđ|vnd|k|nghìn|nghin|tr|triệu|trieu|củ|%)|\b\d{8,}\b/i;
```

Regex này đã có bản chính trong `ai-send-policy.ts`. Sau khi xóa `evaluateNeedsReview`, không còn ai dùng biến này.

**Hành động:** Xóa dòng `const MONEY_LIKE_RE`.

### 1c. Xóa import `NeedsReviewReason` nếu có

Nếu `ai-auto-reply-service.ts` import `NeedsReviewReason` từ đâu, hoặc tự define type này, xóa luôn nếu không còn dùng.

**Kiểm tra:** Sau khi xóa, chạy `npx tsc --noEmit` để đảm bảo không broken reference.

---

## Việc 2 — Thêm comment cho `confidence: 1` trong `ai-followup-service.ts`

File `ai-followup-service.ts`, khoảng line 98-105, có:

```typescript
await prisma.aiSuggestion.create({
  data: {
    orgId,
    conversationId,
    type: 'followup',
    content: content || '[empty]',
    confidence: 1,
  },
});
```

**Hành động:** Thêm comment phía trên `confidence: 1`:

```typescript
    // Non-authoritative — for daily quota tracking only, not a safety input.
    confidence: 1,
```

---

## Việc 3 — Bổ sung tests cho `ai-privacy-guard.ts`

Tạo file `backend/tests/security/ai-privacy-guard.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock canSeeConversationContent
vi.mock('../../src/modules/privacy/redact.js', () => ({
  canSeeConversationContent: vi.fn(),
}));

import { authorizeAiData, assertAiDataGrant, AiPrivacyDeniedError } from '../../src/modules/ai/ai-privacy-guard.js';
import { prisma } from '../../src/shared/database/prisma-client.js';
import { canSeeConversationContent } from '../../src/modules/privacy/redact.js';

const mockFindFirst = vi.mocked(prisma.conversation.findFirst);
const mockCanSee = vi.mocked(canSeeConversationContent);

describe('ai-privacy-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // P01: branded grant carries the symbol — cannot be faked with a plain object
  it('P01 — returns a frozen branded grant for valid non-conversation scope', async () => {
    const grant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
    });
    expect(grant.orgId).toBe('org-1');
    expect(grant.scope).toBe('knowledge');
    expect(Object.isFrozen(grant)).toBe(true);
    // The branded symbol key exists (cannot check symbol directly, but assertAiDataGrant should pass)
    expect(() => assertAiDataGrant(grant, 'org-1')).not.toThrow();
  });

  // P02: assertAiDataGrant rejects plain objects pretending to be grants
  it('P02 — assertAiDataGrant rejects a plain-object fake', () => {
    const fake = Object.freeze({ orgId: 'org-1', scope: 'knowledge', purpose: 'rag_answer', actorMode: 'background' });
    expect(() => assertAiDataGrant(fake as any, 'org-1')).toThrow(AiPrivacyDeniedError);
  });

  // P03: assertAiDataGrant rejects orgId mismatch
  it('P03 — assertAiDataGrant rejects org mismatch', async () => {
    const grant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
    });
    expect(() => assertAiDataGrant(grant, 'org-OTHER')).toThrow(AiPrivacyDeniedError);
  });

  // P04: background actor denied on privacyMode=main conversation
  it('P04 — background actor denied for privacyMode=main', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      zaloAccount: { privacyMode: 'main', ownerUserId: 'owner-1' },
    } as any);

    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'auto_reply',
      actor: { mode: 'background' },
      conversationId: 'conv-1',
    })).rejects.toThrow(/private main-nick/i);
  });

  // P05: background actor allowed on privacyMode=sub conversation
  it('P05 — background actor allowed for privacyMode=sub', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      zaloAccount: { privacyMode: 'sub', ownerUserId: null },
    } as any);

    const grant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'auto_reply',
      actor: { mode: 'background' },
      conversationId: 'conv-1',
    });
    expect(grant.scope).toBe('conversation');
    expect(grant.conversationId).toBe('conv-1');
  });

  // P06: user actor denied when canSeeConversationContent returns false
  it('P06 — user actor denied when privacy locked', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'conv-1',
      zaloAccount: { privacyMode: 'main', ownerUserId: 'owner-1' },
    } as any);
    mockCanSee.mockReturnValue(false);

    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'virtual_chat',
      actor: { mode: 'user', privacyContext: { viewerUserId: 'user-2', orgId: 'org-1', privacyUnlocked: false } },
      conversationId: 'conv-1',
    })).rejects.toThrow(/locked/i);
  });

  // P07: conversation scope requires conversationId
  it('P07 — conversation scope without conversationId throws', async () => {
    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'conversation',
      purpose: 'reply',
      actor: { mode: 'background' },
    })).rejects.toThrow(/conversationId/i);
  });

  // P08: non-conversation scope rejects conversationId
  it('P08 — non-conversation scope with conversationId throws', async () => {
    await expect(authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
      conversationId: 'conv-1',
    })).rejects.toThrow(/only valid for conversation/i);
  });
});
```

---

## Việc 4 — Bổ sung tests cho `ai-generation-executor.ts`

Tạo file `backend/tests/security/ai-generation-executor.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock provider-registry
vi.mock('../../src/modules/ai/provider-registry.js', () => ({
  getProviderConfig: vi.fn(() => ({ baseUrl: 'https://api.example.com' })),
  getProviderBaseUrl: vi.fn(async () => 'https://api.example.com'),
}));

// Mock URL policy
vi.mock('../../src/modules/ai/ai-provider-url-policy.js', () => ({
  validateAiProviderBaseUrl: vi.fn(async (url: string) => {
    if (url.includes('private')) throw new Error('AI provider host resolves to a private address');
    return new URL(url).origin;
  }),
}));

// Mock all providers
vi.mock('../../src/modules/ai/providers/anthropic.js', () => ({
  generateWithAnthropic: vi.fn(async () => 'mock-response'),
}));
vi.mock('../../src/modules/ai/providers/gemini.js', () => ({
  generateWithGemini: vi.fn(async () => 'mock-response'),
}));
vi.mock('../../src/modules/ai/providers/openai-compat.js', () => ({
  generateWithOpenaiCompat: vi.fn(async () => 'mock-response'),
}));

// Mock privacy guard — need real assertAiDataGrant + authorizeAiData
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { conversation: { findFirst: vi.fn() } },
}));
vi.mock('../../src/modules/privacy/redact.js', () => ({
  canSeeConversationContent: vi.fn(() => true),
}));

import { executeAiGeneration } from '../../src/modules/ai/ai-generation-executor.js';
import { authorizeAiData, type AiDataGrant } from '../../src/modules/ai/ai-privacy-guard.js';
import { validateAiProviderBaseUrl } from '../../src/modules/ai/ai-provider-url-policy.js';

const mockValidateUrl = vi.mocked(validateAiProviderBaseUrl);

describe('ai-generation-executor', () => {
  let validGrant: AiDataGrant;

  beforeEach(async () => {
    vi.clearAllMocks();
    validGrant = await authorizeAiData({
      orgId: 'org-1',
      scope: 'knowledge',
      purpose: 'rag_answer',
      actor: { mode: 'background' },
    });
  });

  // P09: rejects a plain object without the branded symbol
  it('P09 — rejects fake grant (no branded symbol)', async () => {
    const fake = { orgId: 'org-1', scope: 'knowledge', purpose: 'rag_answer', actorMode: 'background' };
    await expect(executeAiGeneration({
      grant: fake as any,
      orgId: 'org-1',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      system: 'test',
      prompt: 'hello',
    })).rejects.toThrow(/grant/i);
  });

  // P10: rejects org mismatch between grant and input
  it('P10 — rejects grant/org mismatch', async () => {
    await expect(executeAiGeneration({
      grant: validGrant,
      orgId: 'org-OTHER',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      system: 'test',
      prompt: 'hello',
    })).rejects.toThrow(/grant/i);
  });

  // P11: URL validation runs before provider dispatch
  it('P11 — validates URL before calling provider', async () => {
    mockValidateUrl.mockRejectedValueOnce(new Error('AI provider host resolves to a private address'));
    await expect(executeAiGeneration({
      grant: validGrant,
      orgId: 'org-1',
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
      system: 'test',
      prompt: 'hello',
    })).rejects.toThrow(/private/i);
  });
});
```

---

## Checklist sau khi hoàn thành

```bash
# 1. TypeScript compile
npx tsc --noEmit

# 2. Chạy test mới
npx vitest run tests/security/ai-privacy-guard.test.ts
npx vitest run tests/security/ai-generation-executor.test.ts

# 3. Chạy toàn bộ test suite
npx vitest run

# 4. Grep confirm dead code đã xóa
grep -rn "evaluateNeedsReview" backend/src/  # phải trả 0 kết quả

# 5. Build
npm run build
```

## KHÔNG làm

- KHÔNG thay đổi logic business của bất kỳ file nào ngoài xóa dead code
- KHÔNG sửa Prisma schema, frontend, Docker, hay prompt template
- KHÔNG thêm dependency mới
