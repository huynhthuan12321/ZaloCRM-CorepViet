// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { createHmac } from 'node:crypto';
import { logger } from '../../../shared/utils/logger.js';
import {
  AI_CHANNELS,
  AI_OPERATIONS,
  AI_TRACE_STATUSES,
  SAFE_AI_ERROR_TYPES,
  safeAiTraceEventSchema,
  type AiChannel,
  type AiOperation,
  type AiTraceStatus,
  type SafeAiErrorType,
  type SafeAiTraceEvent,
} from './ai-trace-contract.js';

type HmacPrefix = 'org' | 'conversation' | 'contact';

export type RawAiTraceEvent = {
  traceId: string;
  operation: AiOperation;
  orgId: string;
  conversationId?: string;
  contactId?: string;
  channel: AiChannel;
  provider?: string;
  model?: string;
  sourceCount?: number;
  latencyMs: number;
  status: AiTraceStatus;
  autoSent?: boolean;
  errorType?: SafeAiErrorType;
};

const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i;
const SECRET_KEY_RE = /\b(?:sk|key)-[A-Za-z0-9]{20,}\b/i;
const VN_PHONE_RE = /(?:\b0[0-9]{9,10}\b|\+84[0-9]{9,10}\b)/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LONG_NUMERIC_RE = /\b[0-9]{10,18}\b/;

function enumIncludes<T extends readonly string[]>(values: T, candidate: unknown): candidate is T[number] {
  return typeof candidate === 'string' && values.includes(candidate);
}

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 100) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  if (trimmed.includes('://')) return undefined;
  if (scanForSecrets(trimmed)) return undefined;
  return trimmed;
}

function cleanNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : undefined;
}

export function isValidOpikHashSecret(secret: string): boolean {
  return typeof secret === 'string' && secret.length >= 32;
}

export function hmacPseudonymize(secret: string, prefix: HmacPrefix, rawId: string): string {
  return createHmac('sha256', secret).update(`${prefix}:${rawId}`).digest('hex');
}

export function scanForSecrets(serialized: string): boolean {
  return (
    BEARER_RE.test(serialized) ||
    SECRET_KEY_RE.test(serialized) ||
    VN_PHONE_RE.test(serialized) ||
    EMAIL_RE.test(serialized) ||
    LONG_NUMERIC_RE.test(serialized)
  );
}

export function buildSafeTraceEvent(raw: RawAiTraceEvent, secret: string): SafeAiTraceEvent | null {
  if (!isValidOpikHashSecret(secret)) {
    logger.warn('[ai-trace] invalid OPIK_HASH_SECRET; dropping trace');
    return null;
  }
  if (!enumIncludes(AI_OPERATIONS, raw.operation) || !enumIncludes(AI_CHANNELS, raw.channel) || !enumIncludes(AI_TRACE_STATUSES, raw.status)) {
    logger.warn('[ai-trace] invalid enum field; dropping trace');
    return null;
  }
  if (!raw.orgId || scanForSecrets(raw.orgId)) {
    logger.warn('[ai-trace] invalid org id; dropping trace');
    return null;
  }
  if (raw.conversationId && scanForSecrets(raw.conversationId)) {
    logger.warn('[ai-trace] unsafe conversation id; dropping trace');
    return null;
  }
  if (raw.contactId && scanForSecrets(raw.contactId)) {
    logger.warn('[ai-trace] unsafe contact id; dropping trace');
    return null;
  }
  const latency = cleanNonNegativeInteger(raw.latencyMs);
  if (latency == null) {
    logger.warn('[ai-trace] invalid latency; dropping trace');
    return null;
  }
  const event: SafeAiTraceEvent = {
    schema_version: 1,
    trace_id: raw.traceId,
    operation: raw.operation,
    organization_hash: hmacPseudonymize(secret, 'org', raw.orgId),
    ...(raw.conversationId ? { conversation_hash: hmacPseudonymize(secret, 'conversation', raw.conversationId) } : {}),
    ...(raw.contactId ? { contact_hash: hmacPseudonymize(secret, 'contact', raw.contactId) } : {}),
    channel: raw.channel,
    ...(cleanLabel(raw.provider) ? { provider: cleanLabel(raw.provider) } : {}),
    ...(cleanLabel(raw.model) ? { model: cleanLabel(raw.model) } : {}),
    ...(cleanNonNegativeInteger(raw.sourceCount) != null ? { source_count: cleanNonNegativeInteger(raw.sourceCount)! } : {}),
    latency_ms: latency,
    status: raw.status,
    ...(typeof raw.autoSent === 'boolean' ? { auto_sent: raw.autoSent } : {}),
    ...(enumIncludes(SAFE_AI_ERROR_TYPES, raw.errorType) ? { error_type: raw.errorType } : {}),
  };

  const parsed = safeAiTraceEventSchema.safeParse(event);
  if (!parsed.success) {
    logger.warn('[ai-trace] schema validation failed; dropping trace');
    return null;
  }
  if (scanForSecrets(JSON.stringify(parsed.data))) {
    logger.warn('[ai-trace] secret scanner matched safe payload; dropping trace');
    return null;
  }
  return parsed.data;
}
