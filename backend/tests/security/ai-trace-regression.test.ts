import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config/index.js';
import { endAiTrace, startAiTrace } from '../../src/modules/ai/observability/ai-tracer.js';
import { isOpikActive, resetOpikExporterForTest } from '../../src/modules/ai/observability/opik-exporter.js';

describe('ai trace regression guard', () => {
  beforeEach(() => {
    resetOpikExporterForTest();
    config.opikEnabled = false;
  });

  it('O19-O22 disabled tracing is a no-op surface', () => {
    const ctx = startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' });
    expect(isOpikActive()).toBe(false);
    expect(ctx.active).toBe(false);
  });

  it('O19 endAiTrace is no-op when disabled - no SDK calls', async () => {
    const traceFn = vi.fn();
    const ctx = startAiTrace({ operation: 'reply', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    endAiTrace(ctx, { status: 'generated', provider: 'gemini', model: 'gemini-2.5-flash' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(traceFn).not.toHaveBeenCalled();
    expect(isOpikActive()).toBe(false);
  });

  it('O20 auto-reply trace lifecycle completes silently when disabled', async () => {
    const ctx = startAiTrace({ operation: 'auto_reply', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    expect(ctx.active).toBe(false);
    expect(() => endAiTrace(ctx, { status: 'auto_sent', autoSent: true })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'needs_review', autoSent: false })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'policy_blocked' })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'send_failed', errorType: 'provider_unknown' })).not.toThrow();
  });

  it('O21 follow-up trace lifecycle completes silently when disabled', async () => {
    const ctx = startAiTrace({ operation: 'followup', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    expect(ctx.active).toBe(false);
    expect(() => endAiTrace(ctx, { status: 'auto_sent', autoSent: true })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'policy_blocked' })).not.toThrow();
    expect(() => endAiTrace(ctx, { status: 'provider_failed', errorType: 'provider_server' })).not.toThrow();
  });
});
