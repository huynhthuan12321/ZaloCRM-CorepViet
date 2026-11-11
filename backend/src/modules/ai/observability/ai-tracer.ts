// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { randomUUID } from 'node:crypto';
import { config } from '../../../config/index.js';
import { isOpikActive, publishTrace } from './opik-exporter.js';
import { buildSafeTraceEvent } from './ai-trace-sanitizer.js';
import type { AiChannel, AiOperation, AiTraceStatus, SafeAiErrorType } from './ai-trace-contract.js';

export type AiSpanContext = {
  name: string;
  startTime: number;
  endTime?: number;
};

export type AiTraceContext = {
  active: boolean;
  traceId: string;
  operation: AiOperation;
  orgId: string;
  conversationId?: string;
  contactId?: string;
  channel: AiChannel;
  startTime: number;
  spans: AiSpanContext[];
};

let rng = Math.random;

export function setAiTraceRandomForTest(next: () => number): void {
  rng = next;
}

export function resetAiTraceRandomForTest(): void {
  rng = Math.random;
}

export function startAiTrace(input: {
  operation: AiOperation;
  orgId: string;
  conversationId?: string;
  contactId?: string;
  channel: AiChannel;
}): AiTraceContext {
  const active = isOpikActive();
  return {
    active,
    traceId: active ? randomUUID() : '00000000-0000-4000-8000-000000000000',
    operation: input.operation,
    orgId: input.orgId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    channel: input.channel,
    startTime: Date.now(),
    spans: [],
  };
}

export function addSpan(ctx: AiTraceContext | undefined, name: string): AiSpanContext {
  const span = { name, startTime: Date.now() };
  if (ctx?.active) ctx.spans.push(span);
  return span;
}

export function endSpan(span: AiSpanContext | undefined): void {
  if (span) span.endTime = Date.now();
}

export function endAiTrace(ctx: AiTraceContext | undefined, result: {
  status: AiTraceStatus;
  provider?: string;
  model?: string;
  sourceCount?: number;
  autoSent?: boolean;
  errorType?: SafeAiErrorType;
}): void {
  if (!ctx?.active) return;
  if (config.opikSampleRate <= 0 || rng() >= config.opikSampleRate) return;
  const event = buildSafeTraceEvent({
    traceId: ctx.traceId,
    operation: ctx.operation,
    orgId: ctx.orgId,
    conversationId: ctx.conversationId,
    contactId: ctx.contactId,
    channel: ctx.channel,
    provider: result.provider,
    model: result.model,
    sourceCount: result.sourceCount,
    latencyMs: Date.now() - ctx.startTime,
    status: result.status,
    autoSent: result.autoSent,
    errorType: result.errorType,
  }, config.opikHashSecret);
  if (event) publishTrace(event, ctx.spans);
}
