import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config/index.js';
import { endAiTrace, addSpan, endSpan, resetAiTraceRandomForTest, setAiTraceRandomForTest, startAiTrace } from '../../src/modules/ai/observability/ai-tracer.js';
import { resetOpikExporterForTest, setOpikClientForTest } from '../../src/modules/ai/observability/opik-exporter.js';

describe('ai-tracer', () => {
  const traceCalls: any[] = [];

  beforeEach(() => {
    traceCalls.length = 0;
    resetOpikExporterForTest();
    resetAiTraceRandomForTest();
    config.opikHashSecret = 'x'.repeat(32);
    config.opikSampleRate = 1;
    setOpikClientForTest({
      trace: vi.fn((payload) => {
        const spans: any[] = [];
        traceCalls.push({ ...payload, spans });
        return { span: vi.fn((span) => { spans.push(span); return { end: vi.fn() }; }), end: vi.fn() };
      }),
    });
  });

  it('O15 emits one safe root trace for successful generation', async () => {
    const ctx = startAiTrace({ operation: 'reply', orgId: 'org-a', conversationId: 'conv-a', channel: 'zalo' });
    const span = addSpan(ctx, 'llm_generation');
    endSpan(span);
    endAiTrace(ctx, { status: 'generated', provider: 'gemini', model: 'gemini-2.5-flash', sourceCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(traceCalls).toHaveLength(1);
    expect(traceCalls[0].name).toBe('crm.ai.reply');
    expect(traceCalls[0].metadata.status).toBe('generated');
    expect(traceCalls[0].metadata.source_count).toBe(1);
    expect(traceCalls[0].spans.map((span: any) => span.name)).toEqual(['llm_generation']);
  });

  it('O16 emits provider_failed without raw error text', async () => {
    const ctx = startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' });
    endAiTrace(ctx, { status: 'provider_failed', errorType: 'provider_server' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(traceCalls[0].metadata.status).toBe('provider_failed');
    expect(JSON.stringify(traceCalls[0])).not.toContain('stack');
  });

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

  it('sample rate uses injected RNG', async () => {
    setAiTraceRandomForTest(() => 0.9);
    config.opikSampleRate = 0.5;
    endAiTrace(startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' }), { status: 'generated' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(traceCalls).toHaveLength(0);

    setAiTraceRandomForTest(() => 0.1);
    endAiTrace(startAiTrace({ operation: 'reply', orgId: 'org-a', channel: 'zalo' }), { status: 'generated' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(traceCalls).toHaveLength(1);
  });

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
});
