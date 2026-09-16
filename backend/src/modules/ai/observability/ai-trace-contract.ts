// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { z } from 'zod';

export const AI_OPERATIONS = [
  'reply', 'summary', 'sentiment', 'auto_reply', 'followup',
  'virtual_chat', 'customer_summary', 'rag_answer',
  'appointment_parse', 'format_rich',
] as const;

export const AI_TRACE_STATUSES = [
  'generated', 'provider_failed', 'privacy_denied',
  'needs_review', 'policy_blocked', 'auto_sent',
  'send_failed', 'fallback', 'disabled',
] as const;

export const SAFE_AI_ERROR_TYPES = [
  'provider_timeout', 'provider_rate_limit', 'provider_auth',
  'provider_server', 'provider_circuit_open', 'provider_unknown', 'privacy_denied',
  'config_missing', 'quota_exhausted', 'internal',
] as const;

export const AI_CHANNELS = ['zalo', 'virtual', 'crm_note', 'knowledge', 'editor'] as const;

export type AiOperation = (typeof AI_OPERATIONS)[number];
export type AiTraceStatus = (typeof AI_TRACE_STATUSES)[number];
export type SafeAiErrorType = (typeof SAFE_AI_ERROR_TYPES)[number];
export type AiChannel = (typeof AI_CHANNELS)[number];

export type SafeAiTraceEvent = {
  schema_version: 1;
  trace_id: string;
  operation: AiOperation;
  organization_hash: string;
  conversation_hash?: string;
  contact_hash?: string;
  channel: AiChannel;
  provider?: string;
  model?: string;
  source_count?: number;
  latency_ms: number;
  status: AiTraceStatus;
  auto_sent?: boolean;
  error_type?: SafeAiErrorType;
};

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const safeLabelSchema = z.string()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'control characters are not allowed')
  .refine((value) => !value.includes('://'), 'URLs are not allowed');

export const safeAiTraceEventSchema = z.object({
  schema_version: z.literal(1),
  trace_id: z.string().uuid(),
  operation: z.enum(AI_OPERATIONS),
  organization_hash: hashSchema,
  conversation_hash: hashSchema.optional(),
  contact_hash: hashSchema.optional(),
  channel: z.enum(AI_CHANNELS),
  provider: safeLabelSchema.optional(),
  model: safeLabelSchema.optional(),
  source_count: z.number().int().nonnegative().optional(),
  latency_ms: z.number().int().nonnegative().finite(),
  status: z.enum(AI_TRACE_STATUSES),
  auto_sent: z.boolean().optional(),
  error_type: z.enum(SAFE_AI_ERROR_TYPES).optional(),
}).strict();
