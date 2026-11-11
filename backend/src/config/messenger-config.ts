// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * messenger-config.ts — feature flags + cấu hình Meta cho Messenger Native (PR-00).
 *
 * Nguyên tắc:
 *   - Mặc định TẮT toàn bộ. Chỉ giá trị chính xác "true" (không phân biệt hoa thường) mới bật.
 *   - Cờ phân cấp: INBOUND/OUTBOUND chỉ hiệu lực khi MESSENGER_ENABLED; AI_AUTO_SEND chỉ
 *     hiệu lực khi OUTBOUND hiệu lực. Cờ per-Page (ChannelAccount) AND thêm ở tầng sau.
 *   - Thiếu cấu hình KHÔNG làm crash app (crash = Zalo sập theo). Messenger chuyển sang
 *     trạng thái `misconfigured` và mọi cờ hiệu lực = false (fail closed).
 *   - Không bao giờ đưa GIÁ TRỊ secret vào kết quả — chỉ tên biến.
 *
 * Nguồn duy nhất cho phiên bản Graph API: `FB_GRAPH_API_VERSION` (qua `graphApiVersion`).
 */
import { describeTokenKeyProblem } from '../modules/integrations/_shared/token-encryption.util.js';

type Env = Record<string, string | undefined>;

export const DEFAULT_GRAPH_API_VERSION = 'v21.0';
const GRAPH_VERSION_RE = /^v\d{1,2}\.\d$/;
const PUBLIC_APP_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type MessengerStatus = 'disabled' | 'ready' | 'misconfigured';

export interface MessengerConfig {
  /** Cờ thô đọc từ env (để hiển thị/diagnose). */
  requested: {
    enabled: boolean;
    inbound: boolean;
    outbound: boolean;
    aiAutoSend: boolean;
  };
  /** Cờ HIỆU LỰC — code nghiệp vụ chỉ được đọc nhóm này. */
  effective: {
    enabled: boolean;
    inbound: boolean;
    outbound: boolean;
    aiAutoSend: boolean;
  };
  status: MessengerStatus;
  /** Tên biến bị thiếu/sai (không có giá trị). Chỉ log nội bộ, không trả ra public. */
  problems: string[];
  /** Cảnh báo không chặn (vd giá trị cờ gõ sai). */
  warnings: string[];
  graphApiVersion: string;
  appId: string;
  webhookPublicKey: string;
}

function raw(env: Env, name: string): string {
  return (env[name] ?? '').trim();
}

function parseFlag(env: Env, name: string, warnings: string[]): boolean {
  const value = raw(env, name).toLowerCase();
  if (value === '' || value === 'false') return false;
  if (value === 'true') return true;
  warnings.push(`${name} has unrecognized value (expected true/false) — treated as false`);
  return false;
}

export function resolveMessengerConfig(env: Env = process.env): MessengerConfig {
  const warnings: string[] = [];
  const problems: string[] = [];

  const requested = {
    enabled: parseFlag(env, 'MESSENGER_ENABLED', warnings),
    inbound: parseFlag(env, 'MESSENGER_INBOUND_ENABLED', warnings),
    outbound: parseFlag(env, 'MESSENGER_OUTBOUND_ENABLED', warnings),
    aiAutoSend: parseFlag(env, 'MESSENGER_AI_AUTO_SEND_ENABLED', warnings),
  };

  if (!requested.enabled && (requested.inbound || requested.outbound || requested.aiAutoSend)) {
    warnings.push('MESSENGER_*_ENABLED sub-flags are ignored because MESSENGER_ENABLED is not true');
  }
  if (requested.aiAutoSend && !requested.outbound) {
    warnings.push('MESSENGER_AI_AUTO_SEND_ENABLED is ignored because MESSENGER_OUTBOUND_ENABLED is not true');
  }

  let graphApiVersion = raw(env, 'FB_GRAPH_API_VERSION') || DEFAULT_GRAPH_API_VERSION;
  if (!GRAPH_VERSION_RE.test(graphApiVersion)) {
    warnings.push(`FB_GRAPH_API_VERSION has invalid format (expected like ${DEFAULT_GRAPH_API_VERSION}) — using default`);
    graphApiVersion = DEFAULT_GRAPH_API_VERSION;
  }

  const appId = raw(env, 'FB_APP_ID');
  const webhookPublicKey = raw(env, 'FB_WEBHOOK_PUBLIC_KEY');

  if (requested.enabled) {
    if (!appId) problems.push('FB_APP_ID is not set');
    else if (!/^\d+$/.test(appId)) problems.push('FB_APP_ID must be numeric');
    if (!raw(env, 'FB_APP_SECRET')) problems.push('FB_APP_SECRET is not set');
    if (!raw(env, 'FB_WEBHOOK_VERIFY_TOKEN')) problems.push('FB_WEBHOOK_VERIFY_TOKEN is not set');
    else if (raw(env, 'FB_WEBHOOK_VERIFY_TOKEN').length < 16) problems.push('FB_WEBHOOK_VERIFY_TOKEN is too short (minimum 16 chars)');
    if (!webhookPublicKey) problems.push('FB_WEBHOOK_PUBLIC_KEY is not set');
    else if (!PUBLIC_APP_KEY_RE.test(webhookPublicKey)) problems.push('FB_WEBHOOK_PUBLIC_KEY must be 16-64 chars of [A-Za-z0-9_-]');
    const keyProblem = describeTokenKeyProblem('TOKEN_ENCRYPTION_KEY', env.TOKEN_ENCRYPTION_KEY);
    if (keyProblem) problems.push(keyProblem);
  }

  const status: MessengerStatus = !requested.enabled
    ? 'disabled'
    : problems.length > 0 ? 'misconfigured' : 'ready';
  const on = status === 'ready';

  return {
    requested,
    effective: {
      enabled: on,
      inbound: on && requested.inbound,
      outbound: on && requested.outbound,
      aiAutoSend: on && requested.outbound && requested.aiAutoSend,
    },
    status,
    problems,
    warnings,
    graphApiVersion,
    appId,
    webhookPublicKey,
  };
}

/** Khối health công khai — chỉ trạng thái, không tên biến, không giá trị. */
export function messengerHealthSummary(cfg: MessengerConfig): {
  status: MessengerStatus;
  inbound: boolean;
  outbound: boolean;
} {
  return { status: cfg.status, inbound: cfg.effective.inbound, outbound: cfg.effective.outbound };
}

/** Snapshot đọc một lần lúc khởi động (đổi cờ env = recreate container). */
export const messengerConfig: MessengerConfig = resolveMessengerConfig();
