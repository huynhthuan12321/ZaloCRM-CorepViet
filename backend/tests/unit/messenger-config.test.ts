import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPH_API_VERSION,
  messengerHealthSummary,
  resolveMessengerConfig,
} from '../../src/config/messenger-config.js';

// Giá trị TEST giả — không phải secret thật.
const COMPLETE = {
  MESSENGER_ENABLED: 'true',
  FB_APP_ID: '123456789012345',
  FB_APP_SECRET: 'test-app-secret-not-real',
  FB_WEBHOOK_VERIFY_TOKEN: 'test-verify-token-not-real',
  FB_WEBHOOK_PUBLIC_KEY: 'pk_test_0123456789abcd',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('messenger-config', () => {
  it('MC-01 everything is off by default (empty env)', () => {
    const cfg = resolveMessengerConfig({});
    expect(cfg.status).toBe('disabled');
    expect(cfg.effective).toEqual({ enabled: false, inbound: false, outbound: false, aiAutoSend: false });
    expect(cfg.problems).toEqual([]);
    expect(cfg.warnings).toEqual([]);
    expect(cfg.graphApiVersion).toBe(DEFAULT_GRAPH_API_VERSION);
  });

  it('MC-02 current production env shape (FB vars empty, flag empty) stays disabled with no warnings', () => {
    const cfg = resolveMessengerConfig({
      FB_GRAPH_API_VERSION: 'v21.0', FB_APP_ID: '', FB_APP_SECRET: '', FB_WEBHOOK_VERIFY_TOKEN: '',
      MESSENGER_ENABLED: '', TOKEN_ENCRYPTION_KEY: 'b'.repeat(64),
    });
    expect(cfg.status).toBe('disabled');
    expect(cfg.warnings).toEqual([]);
  });

  it('MC-03 sub-flags are ignored while master flag is off', () => {
    const cfg = resolveMessengerConfig({
      MESSENGER_INBOUND_ENABLED: 'true', MESSENGER_OUTBOUND_ENABLED: 'true', MESSENGER_AI_AUTO_SEND_ENABLED: 'true',
    });
    expect(cfg.effective).toEqual({ enabled: false, inbound: false, outbound: false, aiAutoSend: false });
    expect(cfg.warnings.join(' ')).toMatch(/MESSENGER_ENABLED is not true/);
  });

  it('MC-04 enabled + complete config = ready, but inbound/outbound still need their own flags', () => {
    const cfg = resolveMessengerConfig(COMPLETE);
    expect(cfg.status).toBe('ready');
    expect(cfg.effective).toEqual({ enabled: true, inbound: false, outbound: false, aiAutoSend: false });
  });

  it('MC-05 AI auto-send requires outbound', () => {
    const noOutbound = resolveMessengerConfig({ ...COMPLETE, MESSENGER_AI_AUTO_SEND_ENABLED: 'true' });
    expect(noOutbound.effective.aiAutoSend).toBe(false);
    expect(noOutbound.warnings.join(' ')).toMatch(/OUTBOUND/);
    const all = resolveMessengerConfig({
      ...COMPLETE, MESSENGER_INBOUND_ENABLED: 'TRUE', MESSENGER_OUTBOUND_ENABLED: 'true', MESSENGER_AI_AUTO_SEND_ENABLED: 'true',
    });
    expect(all.effective).toEqual({ enabled: true, inbound: true, outbound: true, aiAutoSend: true });
  });

  it('MC-06 unrecognized flag values are treated as false with a warning', () => {
    const cfg = resolveMessengerConfig({ ...COMPLETE, MESSENGER_ENABLED: '1' });
    expect(cfg.status).toBe('disabled');
    expect(cfg.warnings.join(' ')).toMatch(/MESSENGER_ENABLED has unrecognized value/);
  });

  it.each([
    ['FB_APP_ID', /FB_APP_ID is not set/],
    ['FB_APP_SECRET', /FB_APP_SECRET is not set/],
    ['FB_WEBHOOK_VERIFY_TOKEN', /FB_WEBHOOK_VERIFY_TOKEN is not set/],
    ['FB_WEBHOOK_PUBLIC_KEY', /FB_WEBHOOK_PUBLIC_KEY is not set/],
    ['TOKEN_ENCRYPTION_KEY', /TOKEN_ENCRYPTION_KEY is not set/],
  ])('MC-07 missing %s → misconfigured, every effective flag false (fail closed)', (name, pattern) => {
    const env: Record<string, string> = { ...COMPLETE, MESSENGER_INBOUND_ENABLED: 'true', MESSENGER_OUTBOUND_ENABLED: 'true' };
    delete env[name];
    const cfg = resolveMessengerConfig(env);
    expect(cfg.status).toBe('misconfigured');
    expect(cfg.problems.join(' ')).toMatch(pattern);
    expect(cfg.effective).toEqual({ enabled: false, inbound: false, outbound: false, aiAutoSend: false });
  });

  it('MC-08 malformed values are reported without echoing secret values', () => {
    const cfg = resolveMessengerConfig({
      ...COMPLETE,
      FB_APP_ID: 'abc',
      FB_WEBHOOK_VERIFY_TOKEN: 'short-secret',
      FB_WEBHOOK_PUBLIC_KEY: 'bad key/with space',
      TOKEN_ENCRYPTION_KEY: 'g'.repeat(64),
    });
    expect(cfg.status).toBe('misconfigured');
    const text = cfg.problems.join(' ');
    expect(text).toMatch(/FB_APP_ID must be numeric/);
    expect(text).toMatch(/FB_WEBHOOK_VERIFY_TOKEN is too short/);
    expect(text).toMatch(/FB_WEBHOOK_PUBLIC_KEY must be/);
    expect(text).toMatch(/TOKEN_ENCRYPTION_KEY must contain only hex/);
    expect(text).not.toContain('short-secret');
    expect(text).not.toContain(COMPLETE.FB_APP_SECRET);
    expect(text).not.toContain('g'.repeat(64));
  });

  it('MC-09 graph API version: single source, validated, default on bad format', () => {
    expect(resolveMessengerConfig({ FB_GRAPH_API_VERSION: 'v23.0' }).graphApiVersion).toBe('v23.0');
    const bad = resolveMessengerConfig({ FB_GRAPH_API_VERSION: '21' });
    expect(bad.graphApiVersion).toBe(DEFAULT_GRAPH_API_VERSION);
    expect(bad.warnings.join(' ')).toMatch(/FB_GRAPH_API_VERSION/);
  });

  it('MC-10 public health summary exposes only status + booleans', () => {
    const summary = messengerHealthSummary(resolveMessengerConfig({ ...COMPLETE, FB_APP_SECRET: '' }));
    expect(summary).toEqual({ status: 'misconfigured', inbound: false, outbound: false });
    expect(JSON.stringify(summary)).not.toMatch(/FB_|TOKEN|secret/i);
  });
});
