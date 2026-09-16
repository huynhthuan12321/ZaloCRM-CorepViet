// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { config } from '../../../config/index.js';
import { logger } from '../../../shared/utils/logger.js';
import { validateAiProviderBaseUrl } from '../ai-provider-url-policy.js';
import { isValidOpikHashSecret } from './ai-trace-sanitizer.js';
import type { SafeAiTraceEvent } from './ai-trace-contract.js';

type OpikClientLike = {
  trace?: (traceData: Record<string, unknown>) => unknown;
  createTrace?: (traceData: Record<string, unknown>) => unknown;
  flush?: (options?: Record<string, unknown>) => Promise<unknown> | unknown;
};

export type SafeOpikSpan = {
  name: string;
  startTime: number;
  endTime?: number;
};

let client: OpikClientLike | null = null;
let active = false;
let initStarted = false;
let pending = 0;

export function isOpikActive(): boolean {
  return active && client !== null;
}

export function getOpikPendingCountForTest(): number {
  return pending;
}

export function resetOpikExporterForTest(): void {
  client = null;
  active = false;
  initStarted = false;
  pending = 0;
}

export function setOpikClientForTest(nextClient: OpikClientLike | null, nextActive = true): void {
  client = nextClient;
  active = nextActive && nextClient !== null;
  initStarted = true;
}

export async function initOpikExporter(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  if (!config.opikEnabled) return;
  if (!config.opikUrlOverride || !config.opikApiKey || !isValidOpikHashSecret(config.opikHashSecret)) {
    logger.warn('[opik] disabled: missing URL/API key or invalid hash secret');
    return;
  }

  let opikUrl: string;
  try {
    opikUrl = await validateAiProviderBaseUrl(config.opikUrlOverride);
  } catch (err) {
    logger.warn('[opik] disabled: unsafe Opik URL', err instanceof Error ? err.name : 'error');
    return;
  }

  try {
    const sdk = await import('opik');
    const OpikCtor = (sdk as unknown as { Opik?: new (cfg: Record<string, unknown>) => OpikClientLike }).Opik;
    if (!OpikCtor) {
      logger.warn('[opik] disabled: SDK client export not found');
      return;
    }
    client = new OpikCtor({
      apiKey: config.opikApiKey,
      host: opikUrl,
      workspaceName: config.opikWorkspace || undefined,
      projectName: config.opikProjectName,
      batchDelay: config.opikBatchDelayMs,
      logLevel: config.opikLogLevel.toLowerCase(),
    });
    active = true;
  } catch (err) {
    active = false;
    client = null;
    logger.warn('[opik] disabled: SDK init failed', err instanceof Error ? err.name : 'error');
  }
}

export function publishTrace(event: SafeAiTraceEvent, spans: SafeOpikSpan[] = []): void {
  if (!isOpikActive()) return;
  if (pending >= config.opikMaxPending) {
    logger.warn('[opik] pending limit reached; dropping trace');
    return;
  }
  pending += 1;
  void Promise.resolve()
    .then(() => {
      const tracePayload = {
        id: event.trace_id,
        name: `crm.ai.${event.operation}`,
        projectName: config.opikProjectName,
        metadata: event,
      };
      const result = client?.trace?.(tracePayload) ?? client?.createTrace?.(tracePayload);
      const traceLike = result as { span?: (spanData: Record<string, unknown>) => { end?: () => unknown } | undefined; end?: () => unknown } | undefined;
      for (const span of spans) {
        if (!traceLike?.span || /[^a-z_]/.test(span.name)) continue;
        const created = traceLike.span({
          name: span.name,
          startTime: new Date(span.startTime),
          endTime: new Date(span.endTime ?? span.startTime),
          metadata: { duration_ms: Math.max(0, Math.trunc((span.endTime ?? span.startTime) - span.startTime)) },
        });
        created?.end?.();
      }
      traceLike?.end?.();
      return Promise.resolve(result);
    })
    .catch((err) => {
      logger.warn('[opik] publish failed', err instanceof Error ? err.name : 'error');
    })
    .finally(() => {
      pending = Math.max(0, pending - 1);
    });
}

export async function flushOpik(): Promise<void> {
  if (!isOpikActive()) return;
  const timeoutMs = Math.max(0, config.opikFlushTimeoutMs);
  await Promise.race([
    Promise.resolve(client?.flush?.({ silent: true })).catch((err) => {
      logger.warn('[opik] flush failed', err instanceof Error ? err.name : 'error');
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
