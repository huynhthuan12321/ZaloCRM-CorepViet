import { describe, expect, it, vi } from 'vitest';
import { buildSafeTraceEvent, scanForSecrets } from '../../src/modules/ai/observability/ai-trace-sanitizer.js';

const secret = 'x'.repeat(32);

describe('ai-trace-sanitizer', () => {
  it('O02 detects VN phone numbers', () => {
    expect(scanForSecrets(JSON.stringify({ input: '0901234567' }))).toBe(true);
  });

  it('O03 detects raw Zalo-like numeric IDs', () => {
    expect(scanForSecrets(JSON.stringify({ zaloUid: '1234567890123456' }))).toBe(true);
  });

  it('O04/O06 drops unknown raw content fields by construction', () => {
    const event = buildSafeTraceEvent({
      traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operation: 'reply',
      orgId: 'org-a',
      channel: 'zalo',
      latencyMs: 10,
      status: 'generated',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      sourceCount: 2,
      conversation_text: 'Toi muon mua hang',
      customer_name: 'Nguyen Van A',
    } as any, secret);
    expect(event).not.toBeNull();
    expect(JSON.stringify(event)).not.toContain('conversation_text');
    expect(JSON.stringify(event)).not.toContain('customer_name');
  });

  it('O05 detects bearer and API-key patterns', () => {
    expect(scanForSecrets('Bearer sk-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(scanForSecrets('key-abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });

  it('rejects unsafe provider/model labels', () => {
    expect(buildSafeTraceEvent({
      traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operation: 'reply',
      orgId: 'org-a',
      channel: 'zalo',
      latencyMs: 10,
      status: 'generated',
      provider: 'https://api.example.com',
      model: 'm',
    }, secret)).not.toHaveProperty('provider');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(buildSafeTraceEvent({
      traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operation: 'reply',
      orgId: 'org-a',
      channel: 'zalo',
      latencyMs: 10,
      status: 'generated',
      provider: 'gemini',
      model: 'x'.repeat(101),
    }, secret)).not.toHaveProperty('model');
    warn.mockRestore();
  });

  it('serialized safe payload contains no canary PII/secrets', () => {
    const event = buildSafeTraceEvent({
      traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operation: 'auto_reply',
      orgId: 'org-a',
      conversationId: 'conv-a',
      contactId: 'contact-a',
      channel: 'zalo',
      latencyMs: 10,
      status: 'auto_sent',
      provider: 'openai',
      model: 'gpt-4o',
      prompt: 'Toi muon mua hang 0901234567 1234567890123456 Bearer sk-testabcdefghijklmnopqrstuvwxyz',
    } as any, secret);
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('0901234567');
    expect(serialized).not.toContain('1234567890123456');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('Toi muon mua hang');
  });

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
});
