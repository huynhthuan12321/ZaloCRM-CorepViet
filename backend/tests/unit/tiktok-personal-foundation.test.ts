// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, expect, it, vi } from 'vitest';
import { resolveTikTokPersonalConfig, tiktokPersonalHealthSummary } from '../../src/config/tiktok-personal-config.js';
import { browserChannelCapabilities } from '../../src/modules/channels/channel-capabilities.js';
import { channelExtensionPolicy } from '../../src/modules/channels/channel-extension-policy.js';
import { buildReadyHealth } from '../../src/shared/http/health.js';
import { validateProductionConfig } from '../../src/config/validate-production-config.js';

const ALL = {
  CHANNELS_ENABLED: 'true', TIKTOK_PERSONAL_ENABLED: 'true',
  TIKTOK_PERSONAL_INBOUND_ENABLED: 'true', TIKTOK_PERSONAL_OUTBOUND_ENABLED: 'true', MOCK_CHANNEL_ENABLED: 'true',
  TIKTOK_MEDIA_ENABLED: 'true', TIKTOK_AI_AUTO_SEND_ENABLED: 'true',
};
describe('TikTok Personal foundation fail-closed', () => {
  it('defaults off and ignores Lead Gen credentials', () => {
    for (const env of [{}, { TIKTOK_ENABLED: 'true', TIKTOK_APP_SECRET: 'fake-marker-not-a-secret' }]) {
      const cfg = resolveTikTokPersonalConfig(env);
      expect(cfg.status).toBe('disabled');
      expect(Object.values(cfg.effective).every(value => value === false)).toBe(true);
      expect(cfg.warnings).toHaveLength(0);
    }
  });
  it.each(['1', 'yes', 'fake-secret-marker'])('rejects malformed boolean %s without logging its value', value => {
    const cfg = resolveTikTokPersonalConfig({ CHANNELS_ENABLED: value });
    expect(cfg.effective.enabled).toBe(false);
    expect(cfg.warnings.join()).toContain('CHANNELS_ENABLED');
    expect(cfg.warnings.join()).not.toContain(value);
  });
  it('master flag disables mock and live subflags', () => {
    const cfg = resolveTikTokPersonalConfig({ ...ALL, CHANNELS_ENABLED: 'false', NODE_ENV: 'test' });
    expect(Object.values(cfg.effective).every(value => value === false)).toBe(true);
    expect(cfg.status).toBe('disabled');
  });
  it.each(['production', '', 'staging'])('never enables mock in environment %s', NODE_ENV => {
    const cfg = resolveTikTokPersonalConfig({ ...ALL, NODE_ENV });
    expect(cfg.status).toBe('misconfigured'); expect(cfg.effective.mock).toBe(false);
    expect(browserChannelCapabilities('MOCK_BROWSER', cfg).textSend).toBe(false);
  });
  it.each(['test', 'development'])('fixture capabilities cannot grant live capabilities in %s', NODE_ENV => {
    const cfg = resolveTikTokPersonalConfig({ ...ALL, NODE_ENV });
    expect(cfg.status).toBe('unavailable');
    expect(cfg.effective.mock).toBe(true); expect(cfg.effective.outbound).toBe(false);
    expect(browserChannelCapabilities('MOCK_BROWSER', cfg).textSend).toBe(true);
    expect(browserChannelCapabilities('TIKTOK_WEB_SESSION', cfg)).toMatchObject({
      textRead: false,
      textSend: false,
      imageRead: false,
      imageSend: false,
      canInitiate: false,
      stableMessageId: false,
      reliableSendConfirmation: false,
      aiAutoSend: false,
      automation: false,
      broadcast: false,
    });
  });
  it('TT10 flags remain fail-closed without verified live capabilities', () => {
    const cfg = resolveTikTokPersonalConfig({ ...ALL, NODE_ENV: 'test' });
    expect(cfg.requested.media).toBe(true);
    expect(cfg.requested.aiAutoSend).toBe(true);
    expect(cfg.effective.media).toBe(false);
    expect(cfg.effective.aiAutoSend).toBe(false);
    expect(browserChannelCapabilities('MOCK_BROWSER', cfg)).toMatchObject({
      imageRead: false,
      imageSend: false,
      canInitiate: false,
      aiAutoSend: false,
      automation: false,
      broadcast: false,
    });
    expect(channelExtensionPolicy(browserChannelCapabilities('MOCK_BROWSER', cfg), cfg)).toEqual({
      manualText: true,
      inboundImage: false,
      outboundImage: false,
      canInitiate: false,
      aiAutoSend: false,
      automation: false,
      broadcast: false,
    });
  });
  it('reports fixture-only status when only local mock requested', () => {
    const cfg = resolveTikTokPersonalConfig({ NODE_ENV: 'test', CHANNELS_ENABLED: ' TRUE ', MOCK_CHANNEL_ENABLED: 'true' });
    expect(cfg.status).toBe('mock_only'); expect(cfg.effective.mock).toBe(true);
  });
  it.each(['disabled', 'mock_only', 'unavailable', 'misconfigured'] as const)('health %s remains informational', async status => {
    const tiktok = { status, inbound: false, outbound: false };
    const healthy = await buildReadyHealth({ checkDb: async () => {}, checkRedis: () => true, tiktok });
    expect(healthy.statusCode).toBe(200); expect(healthy.body.tiktok).toEqual(tiktok);
    const dbDown = await buildReadyHealth({ checkDb: async () => { throw Error('down'); }, checkRedis: () => true, tiktok });
    expect(dbDown.statusCode).toBe(503);
    const redisDown = await buildReadyHealth({ checkDb: async () => {}, checkRedis: () => false, tiktok });
    expect(redisDown.statusCode).toBe(503);
  });
  it('health does not expose requested flags, problems or env data', () => {
    const cfg = resolveTikTokPersonalConfig({ ...ALL, NODE_ENV: 'production' });
    expect(Object.keys(tiktokPersonalHealthSummary(cfg)).sort()).toEqual(['inbound', 'outbound', 'status']);
  });
  it('new config warnings cannot stop otherwise valid production', () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const exit = vi.fn((): never => { throw Error('unexpected exit'); });
    validateProductionConfig({ ...ALL, NODE_ENV: 'production', JWT_SECRET: 'test-jwt-marker', ENCRYPTION_KEY: 'a'.repeat(32), DATABASE_URL: 'postgresql://test:test@localhost/test', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) }, exit, log);
    expect(exit).not.toHaveBeenCalled(); expect(log.error).not.toHaveBeenCalled();
    expect(log.warn.mock.calls.flat().join()).toContain('TikTok Personal is DISABLED');
  });
});
