// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
type Env = Record<string, string | undefined>;
export type TikTokPersonalStatus = 'disabled' | 'mock_only' | 'unavailable' | 'misconfigured';
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
  /** Live transport is not implemented; env alone must never enable it. */
  effective: {
    enabled: false;
    inbound: false;
    outbound: false;
    media: false;
    aiAutoSend: false;
    automation: false;
    broadcast: false;
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
  let status: TikTokPersonalStatus = 'disabled';
  if (problems.length) status = 'misconfigured';
  else if (requested.channels && requested.personal) {
    status = 'unavailable';
    warnings.push('TikTok Personal live transport is not implemented; all live flags remain false');
  } else if (mock) status = 'mock_only';
  return {
    requested,
    effective: {
      enabled: false,
      inbound: false,
      outbound: false,
      media: false,
      aiAutoSend: false,
      automation: false,
      broadcast: false,
      mock: problems.length === 0 && mock,
    },
    status, problems, warnings,
  };
}
export function tiktokPersonalHealthSummary(cfg: TikTokPersonalConfig): {
  status: TikTokPersonalStatus; inbound: false; outbound: false;
} {
  return { status: cfg.status, inbound: false, outbound: false };
}
/** Startup snapshot; no side effects, credentials or network calls. */
export const tiktokPersonalConfig = resolveTikTokPersonalConfig();
