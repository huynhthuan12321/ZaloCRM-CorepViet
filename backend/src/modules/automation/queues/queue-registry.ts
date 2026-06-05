// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M1 — Queue Registry (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// 3 queue chính của Marketing BullMQ Rebuild (Section 16 design doc):
//   1. friend-invite — sendFriendRequest (M2a/M2b)
//   2. sequence-step — runSequenceStep (M3, merge welcome + bám đuổi)
//   3. internal-notify — 6 job types (M4: no-zalo, send-error, friend-accept,
//                       friend-reject, customer-reply KHẨN, friend-accept-late)
//
// Job opts default:
//   - removeOnComplete: keep 1000 jobs 24h
//   - removeOnFail: keep 7 ngày để audit
//   - attempts: 3 (1 + 2 retry), backoff exponential 10s base (T4A retry policy)
//   - jobId DETERMINISTIC pattern `${triggerId}-${contactId}-${stepIdx}` (DASH)
//
// Init thực sự (Queue instance) sẽ làm trong M2a — file này chỉ export
// const names + getter để các file khác refer chung.

import { Queue, type QueueOptions } from 'bullmq';
import { getBullMQRedis } from './redis-connection.js';
import { logger } from '../../../shared/utils/logger.js';

// ════════════════════════════════════════════════════════════════════════
// Queue names — source of truth, tránh string drift cross files
// ════════════════════════════════════════════════════════════════════════
export const QUEUE_NAMES = {
  FRIEND_INVITE: 'friend-invite',
  SEQUENCE_STEP: 'sequence-step',
  INTERNAL_NOTIFY: 'internal-notify',
  // Broadcasts Đợt 1 (2026-06-05) — worker E2E gửi tin hàng loạt
  BROADCAST_FIRE: 'broadcast-fire',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ════════════════════════════════════════════════════════════════════════
// Default job options áp dụng cho mọi job
// ════════════════════════════════════════════════════════════════════════
export const DEFAULT_JOB_OPTIONS = {
  // Cleanup completed jobs sau 24h hoặc 1000 jobs (LRU)
  removeOnComplete: { age: 86400, count: 1000 },
  // Giữ failed jobs 7 ngày để audit qua Bull Board
  removeOnFail: { age: 604800 },
  // T4A retry policy (section 28 design doc)
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 10_000, // 10s → 20s → 40s
  },
} satisfies QueueOptions['defaultJobOptions'];

// ════════════════════════════════════════════════════════════════════════
// Queue instance singletons — lazy init khi gọi getter lần đầu
// ════════════════════════════════════════════════════════════════════════
const queueInstances = new Map<QueueName, Queue>();

function createQueue(name: QueueName): Queue {
  const queue = new Queue(name, {
    connection: getBullMQRedis(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queue.on('error', (err) => {
    logger.error(`[queue:${name}] error: ${err.message}`);
  });
  logger.info(`[queue:${name}] initialized`);
  return queue;
}

export function getQueue(name: QueueName): Queue {
  let instance = queueInstances.get(name);
  if (!instance) {
    instance = createQueue(name);
    queueInstances.set(name, instance);
  }
  return instance;
}

// Convenience getters
export const getFriendInviteQueue = () => getQueue(QUEUE_NAMES.FRIEND_INVITE);
export const getSequenceStepQueue = () => getQueue(QUEUE_NAMES.SEQUENCE_STEP);
export const getInternalNotifyQueue = () => getQueue(QUEUE_NAMES.INTERNAL_NOTIFY);
export const getBroadcastFireQueue = () => getQueue(QUEUE_NAMES.BROADCAST_FIRE);

// Broadcasts jobId — `bc-${broadcastId}` cho job tổng + `bc-${broadcastId}-${contactId}` cho từng job nhỏ
export function buildBroadcastJobId(broadcastId: string): string {
  return `bc-${broadcastId}`;
}
export function buildBroadcastTickJobId(broadcastId: string, tickIdx: number): string {
  return `bc-${broadcastId}-tick-${tickIdx}`;
}

/**
 * Build deterministic jobId — verify POC spike 2026-06-01:
 * BullMQ v5 CẤM `:` trong custom jobId ("Custom Id cannot contain :").
 * Dùng DASH `-` thay thế.
 */
export function buildSequenceStepJobId(
  triggerId: string,
  contactId: string,
  stepIdx: number,
): string {
  return `${triggerId}-${contactId}-${stepIdx}`;
}

export function buildFriendInviteJobId(
  triggerId: string,
  entryId: string,
): string {
  return `fr-${triggerId}-${entryId}`;
}

/**
 * Graceful shutdown — close tất cả queue instances. Gọi trong app shutdown hook.
 */
export async function closeAllQueues(): Promise<void> {
  for (const [name, queue] of queueInstances) {
    logger.info(`[queue:${name}] closing...`);
    await queue.close();
  }
  queueInstances.clear();
}

// ════════════════════════════════════════════════════════════════════════
// Stats helper — Bull Board + Stats Dashboard M10 query
// ════════════════════════════════════════════════════════════════════════
export interface QueueStats {
  name: QueueName;
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
}

export async function getQueueStats(name: QueueName): Promise<QueueStats> {
  const queue = getQueue(name);
  const counts = await queue.getJobCounts(
    'active',
    'waiting',
    'delayed',
    'completed',
    'failed',
  );
  const paused = await queue.isPaused();
  return {
    name,
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    paused,
  };
}

export async function getAllQueueStats(): Promise<QueueStats[]> {
  return Promise.all(
    Object.values(QUEUE_NAMES).map((name) => getQueueStats(name)),
  );
}
