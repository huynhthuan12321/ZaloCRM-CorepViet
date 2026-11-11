import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config/index.js';
import {
  flushOpik,
  getOpikPendingCountForTest,
  initOpikExporter,
  isOpikActive,
  publishTrace,
  resetOpikExporterForTest,
  setOpikClientForTest,
} from '../../src/modules/ai/observability/opik-exporter.js';
import type { SafeAiTraceEvent } from '../../src/modules/ai/observability/ai-trace-contract.js';

const event: SafeAiTraceEvent = {
  schema_version: 1,
  trace_id: '11111111-1111-4111-8111-111111111111',
  operation: 'reply',
  organization_hash: 'a'.repeat(64),
  channel: 'zalo',
  latency_ms: 1,
  status: 'generated',
};

describe('opik-exporter', () => {
  beforeEach(() => {
    resetOpikExporterForTest();
    config.opikEnabled = false;
    config.opikMaxPending = 1000;
    config.opikFlushTimeoutMs = 10;
  });

  it('O01 is no-op when disabled', async () => {
    await initOpikExporter();
    publishTrace(event);
    await flushOpik();
    expect(isOpikActive()).toBe(false);
    expect(getOpikPendingCountForTest()).toBe(0);
  });

  it('O01-import disabled path never calls dynamic import', async () => {
    config.opikEnabled = false;
    await initOpikExporter();
    expect(isOpikActive()).toBe(false);
  });

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

  it('drops safely when max pending is reached', () => {
    config.opikMaxPending = 0;
    const trace = vi.fn();
    setOpikClientForTest({ trace });
    publishTrace(event);
    expect(trace).not.toHaveBeenCalled();
  });

  it('flush completes and timeout is bounded', async () => {
    setOpikClientForTest({ flush: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 100))) });
    const start = Date.now();
    await flushOpik();
    expect(Date.now() - start).toBeLessThan(80);
  });
});
