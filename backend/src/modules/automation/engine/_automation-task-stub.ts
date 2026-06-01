// ════════════════════════════════════════════════════════════════════════
// AutomationTask STUB — Luồng Mục Tiêu M0 (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// Model AutomationTask đã DROP trong migration 20260601182155_marketing_bullmq_rebuild.
// File này export 1 stub object để 8 file BE cũ vẫn build TypeScript pass.
// Code rewrite trong M2-M4 với BullMQ queues:
//   - friend-invite-worker (M2)
//   - sequence-step-worker (M3)
//   - internal-notify-worker (M4)
//
// HÀNH VI STUB:
//   - findMany / findUnique / count → return [] / null / 0 (no-op)
//   - create / createMany / update / updateMany / delete / deleteMany → log warning + return mock
//   - $queryRaw / $executeRaw involving automation_tasks → skip
//
// NƠI ÁP DỤNG (8 file):
//   - src/modules/automation/blocks/block-routes.ts
//   - src/modules/automation/broadcasts/broadcast-routes.ts
//   - src/modules/automation/broadcasts/fire-broadcast.ts
//   - src/modules/automation/engine/campaign-materializer.ts
//   - src/modules/automation/engine/nick-selector.ts
//   - src/modules/automation/engine/task-worker.ts
//   - src/modules/automation/friend-invite/nick-worker.ts (đụng pool-query) — KHÔNG dùng stub, code chạy thật trong M2a
//   - src/modules/automation/friend-invite/pool-query.ts — KHÔNG dùng stub, ổn
//   - src/modules/chat/chat-routes.ts
//
// PATTERN SỬ DỤNG:
//   Thay vì `prisma.automationTask.findMany(...)` ở những file cần stub:
//     import { automationTaskStub as _at } from '.../engine/_automation-task-stub.js';
//     await _at.findMany(...);
//
// HOẶC monkey-patch trong file đó (preferred — diff nhỏ):
//   const automationTask = (prisma as any).automationTask ?? automationTaskStub;
//   automationTask.findMany(...)
//
// Sau M2-M4, em remove file này + xóa các stub call.

import { logger } from '../../../shared/utils/logger.js';

const warn = (op: string) => {
  if (process.env.NODE_ENV !== 'test') {
    logger.warn(`[automation-task-stub] ${op} called — AutomationTask model dropped. Rewrite in M2-M4 BullMQ queue.`);
  }
};

export interface MockTask {
  id: string;
  orgId: string;
  campaignId: string;
  contactId: string;
  sequenceId: string | null;
  currentStepIdx: number | null;
  currentBlockId: string | null;
  blockSnapshot: unknown;
  scheduledAt: Date;
  assignedNickId: string | null;
  state: string;
  attemptCount: number;
  outcome: unknown;
  skipReason: string | null;
  errorMessage: string | null;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NO_OP_RESULT = { count: 0 };
const EMPTY_LIST: MockTask[] = [];

export const automationTaskStub = {
  // Read operations — return empty / null
  async findMany(_args?: unknown): Promise<MockTask[]> {
    warn('findMany');
    return EMPTY_LIST;
  },
  async findFirst(_args?: unknown): Promise<MockTask | null> {
    warn('findFirst');
    return null;
  },
  async findUnique(_args?: unknown): Promise<MockTask | null> {
    warn('findUnique');
    return null;
  },
  async count(_args?: unknown): Promise<number> {
    warn('count');
    return 0;
  },
  async groupBy(_args?: unknown): Promise<unknown[]> {
    warn('groupBy');
    return [];
  },
  async aggregate(_args?: unknown): Promise<{ _count: number; _sum: Record<string, number> }> {
    warn('aggregate');
    return { _count: 0, _sum: {} };
  },

  // Write operations — log + return mock
  async create(_args?: unknown): Promise<MockTask> {
    warn('create');
    return mockTask();
  },
  async createMany(_args?: unknown): Promise<{ count: number }> {
    warn('createMany');
    return NO_OP_RESULT;
  },
  async createManyAndReturn(_args?: unknown): Promise<MockTask[]> {
    warn('createManyAndReturn');
    return EMPTY_LIST;
  },
  async update(_args?: unknown): Promise<MockTask> {
    warn('update');
    return mockTask();
  },
  async updateMany(_args?: unknown): Promise<{ count: number }> {
    warn('updateMany');
    return NO_OP_RESULT;
  },
  async upsert(_args?: unknown): Promise<MockTask> {
    warn('upsert');
    return mockTask();
  },
  async delete(_args?: unknown): Promise<MockTask> {
    warn('delete');
    return mockTask();
  },
  async deleteMany(_args?: unknown): Promise<{ count: number }> {
    warn('deleteMany');
    return NO_OP_RESULT;
  },
};

function mockTask(): MockTask {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    orgId: '00000000-0000-0000-0000-000000000000',
    campaignId: '00000000-0000-0000-0000-000000000000',
    contactId: '00000000-0000-0000-0000-000000000000',
    sequenceId: null,
    currentStepIdx: null,
    currentBlockId: null,
    blockSnapshot: {},
    scheduledAt: new Date(),
    assignedNickId: null,
    state: 'queued',
    attemptCount: 0,
    outcome: null,
    skipReason: null,
    errorMessage: null,
    executedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Helper để các file legacy dùng pattern:
 *   const automationTask = getAutomationTaskClient(prisma);
 *   await automationTask.findMany(...);
 *
 * Sau M2-M4 khi rewrite với BullMQ, gỡ helper này.
 */
export function getAutomationTaskClient(_prisma: unknown): typeof automationTaskStub {
  return automationTaskStub;
}
