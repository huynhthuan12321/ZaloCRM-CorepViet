// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
type Env = Record<string, string | undefined>;
export type TikTokPersonalStatus =
  | 'disabled'
  | 'mock_only'
  | 'read_only'
  | 'available'
  | 'unavailable'
  | 'misconfigured';
export interface TikTokPersonalConfig {
  requested: {
    channels: boolean;
    personal: boolean;
    inbound: boolean;
    outbound: boolean;
    media: boolean;
    aiAutoSend: boolean;
    mock: boolean;
  };
  effective: {
    enabled: boolean;
    inbound: boolean;
    outbound: boolean;
    media: boolean;
    aiAutoSend: boolean;
    automation: boolean;
    broadcast: boolean;
    mock: boolean;
  };
  status: TikTokPersonalStatus;
  problems: string[];
  warnings: string[];
}
function flag(env: Env, key: string, warnings: string[]): boolean {
  const value = (env[key] ?? '').trim().toLowerCase();
  if (value === 'true') return true;
  if (value !== '' && value !== 'false') warnings.push(`${key} expects true/false; treated as false`);
  return false;
}
export function resolveTikTokPersonalConfig(env: Env = process.env): TikTokPersonalConfig {
  const warnings: string[] = [], problems: string[] = [];
  const requested = {
    channels: flag(env, 'CHANNELS_ENABLED', warnings),
    personal: flag(env, 'TIKTOK_PERSONAL_ENABLED', warnings),
    inbound: flag(env, 'TIKTOK_PERSONAL_INBOUND_ENABLED', warnings),
    outbound: flag(env, 'TIKTOK_PERSONAL_OUTBOUND_ENABLED', warnings),
    media: flag(env, 'TIKTOK_MEDIA_ENABLED', warnings),
    aiAutoSend: flag(env, 'TIKTOK_AI_AUTO_SEND_ENABLED', warnings),
    mock: flag(env, 'MOCK_CHANNEL_ENABLED', warnings),
  };
  if (!requested.channels && Object.entries(requested).some(([key, value]) => key !== 'channels' && value)) {
    warnings.push('CHANNELS_ENABLED is not true; channel sub-flags are ignored');
  }
  if (!requested.personal && (requested.inbound || requested.outbound || requested.media || requested.aiAutoSend)) {
    warnings.push('TIKTOK_PERSONAL_ENABLED is not true; personal feature flags are ignored');
  }
  if (requested.aiAutoSend && !requested.outbound) {
    warnings.push('TIKTOK_PERSONAL_OUTBOUND_ENABLED is not true; AI auto-send remains disabled');
  }
  const local = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  if (requested.mock && !local) problems.push('MOCK_CHANNEL_ENABLED requires explicit NODE_ENV=development or test');
  const mock = requested.channels && requested.mock && local;
  const workerSecret = env.TIKTOK_PERSONAL_WORKER_SECRET?.trim() ?? '';
  if (requested.channels && requested.personal && workerSecret.length < 32) {
    problems.push('TIKTOK_PERSONAL_WORKER_SECRET must contain at least 32 characters');
  }
  const enabled = requested.channels && requested.personal && workerSecret.length >= 32 && problems.length === 0;
  const inbound = enabled && requested.inbound;
  const outbound = enabled && requested.outbound;
  let status: TikTokPersonalStatus = 'disabled';
  if (problems.length) status = 'misconfigured';
  else if (enabled && outbound) status = 'available';
  else if (enabled && inbound) status = 'read_only';
  else if (enabled) status = 'unavailable';
  else if (mock) status = 'mock_only';
  return {
    requested,
    effective: {
      enabled,
      inbound,
      outbound,
      media: false,
      aiAutoSend: false,
      automation: false,
      broadcast: false,
      // A malformed live setup must not break the explicitly local fixture.
      // `mock` is already false outside development/test.
      mock,
    },
    status, problems, warnings,
  };
}
export function tiktokPersonalHealthSummary(cfg: TikTokPersonalConfig): {
  status: TikTokPersonalStatus; inbound: boolean; outbound: boolean;
} {
  return { status: cfg.status, inbound: cfg.effective.inbound, outbound: cfg.effective.outbound };
}
/** Startup snapshot; no side effects, credentials or network calls. */
export const tiktokPersonalConfig = resolveTikTokPersonalConfig();
