/**
 * outbox-worker.ts — Background worker poll WebhookLog pending.
 *
 * Eng review Issue 13: LISTEN/NOTIFY Postgres + 30s safety poll.
 *   - Webhook handler sau INSERT → NOTIFY 'webhook_pending'
 *   - Worker LISTEN → process immediately (sub-second latency)
 *   - 30s timer poll bắt pending row bị missed (NOTIFY chỉ deliver tới live connection)
 *
 * Worker chỉ chạy 1 instance (Phase 1 single-server). Phase 2+ multi-instance:
 *   FOR UPDATE SKIP LOCKED trong pickPending() đã chặn double-pickup.
 *
 * Process per webhook log:
 *   1. Dispatch theo source → adapter.processLog(log)
 *   2. adapter call Graph API → parse → NormalizedLead
 *   3. resolveListFromCampaign() → listId
 *   4. Insert CustomerListEntry
 *   5. markProcessed() hoặc markFailedWithRetry()
 */
import pg from 'pg';
import { config } from '../../../config/index.js';
import { logger } from '../../../shared/utils/logger.js';
import { pickPending } from './webhook-log.service.js';

type LogProcessor = (log: { id: string; externalLeadId: string; rawBody: unknown; attempts: number }) => Promise<void>;

const processors = new Map<string, LogProcessor>();

/** Adapter đăng ký processor khi module load. */
export function registerLogProcessor(source: string, processor: LogProcessor): void {
  processors.set(source, processor);
  logger.info(`[outbox] Registered processor for ${source}`);
}

let listenClient: pg.Client | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let processingLock = false;

/** Worker entry — gọi 1 lần lúc server boot. */
export async function startOutboxWorker(): Promise<void> {
  // 1. Connect dedicated client cho LISTEN (Prisma connection pool không support LISTEN)
  try {
    listenClient = new pg.Client({ connectionString: config.databaseUrl });
    await listenClient.connect();
    await listenClient.query('LISTEN webhook_pending');
    listenClient.on('notification', (msg) => {
      logger.debug(`[outbox] NOTIFY received: ${msg.payload}`);
      void processNextBatch();
    });
    listenClient.on('error', (err) => {
      logger.error('[outbox] LISTEN client error:', err);
    });
    logger.info('[outbox] LISTEN webhook_pending active');
  } catch (err) {
    logger.error('[outbox] Failed to setup LISTEN, fallback to poll-only:', err);
  }

  // 2. Safety poll 30s — catch rows bị missed bởi NOTIFY (vd worker boot sau khi INSERT)
  pollTimer = setInterval(() => {
    void processNextBatch();
  }, 30 * 1000);

  // 3. Initial run on boot
  void processNextBatch();
}

export async function stopOutboxWorker(): Promise<void> {
  if (pollTimer) clearInterval(pollTimer);
  if (listenClient) await listenClient.end().catch(() => {});
  listenClient = null;
  pollTimer = null;
}

async function processNextBatch(): Promise<void> {
  if (processingLock) return; // 1 batch concurrent — prevent re-entry
  processingLock = true;
  try {
    const pending = await pickPending(10);
    if (pending.length === 0) return;
    logger.info(`[outbox] Processing ${pending.length} pending webhook(s)`);
    for (const log of pending) {
      const processor = processors.get(log.source);
      if (!processor) {
        logger.error(`[outbox] No processor for source=${log.source} (logId=${log.id})`);
        // Mark failed permanently — admin manual replay sau khi register processor
        const { markFailedWithRetry } = await import('./webhook-log.service.js');
        await markFailedWithRetry(log.id, `No processor registered for source ${log.source}`, 99); // 99 → skip retry
        continue;
      }
      try {
        await processor(log);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[outbox] Processor ${log.source} failed for ${log.id}: ${msg}`);
        const { markFailedWithRetry } = await import('./webhook-log.service.js');
        await markFailedWithRetry(log.id, msg, log.attempts);
      }
    }
    // Có thể còn pending sau batch — schedule next run
    if (pending.length === 10) {
      setImmediate(() => void processNextBatch());
    }
  } finally {
    processingLock = false;
  }
}

/** Helper cho webhook handler: gọi NOTIFY sau khi INSERT WebhookLog. */
export async function notifyWebhookPending(): Promise<void> {
  if (!listenClient) return; // No-op if not in LISTEN mode (poll will catch)
  try {
    await listenClient.query("NOTIFY webhook_pending, 'new'");
  } catch (err) {
    logger.debug('[outbox] NOTIFY failed (will be caught by poll):', err);
  }
}
