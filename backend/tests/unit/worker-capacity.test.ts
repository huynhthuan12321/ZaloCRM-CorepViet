// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, expect, it } from 'vitest';
import { resolveWorkerCapacityConfig, workerFleetCapacity } from '../../src/modules/channels/worker-capacity.js';

describe('TT09 worker capacity', () => {
  it('uses the lower of configured workers and reserved-memory capacity', () => {
    const config = resolveWorkerCapacityConfig({
      MOCK_CHANNEL_MAX_WORKERS: '8',
      MOCK_CHANNEL_MEMORY_BUDGET_MB: '4096',
      MOCK_CHANNEL_MEMORY_RESERVE_MB: '1024',
      MOCK_CHANNEL_PER_WORKER_MB: '768',
    });
    expect(config.effectiveLimit).toBe(4);
    const fleet = workerFleetCapacity(3, [], config);
    expect(fleet.remainingSlots).toBe(1);
    expect(fleet.headroomBytes).toBe(768 * 1024 ** 2);
    expect(fleet.alerts).toContain('WORKER_METRICS_INCOMPLETE');
  });

  it('blocks admission and raises resource alerts at the limit', () => {
    const config = resolveWorkerCapacityConfig({
      MOCK_CHANNEL_MAX_WORKERS: '2',
      MOCK_CHANNEL_MEMORY_BUDGET_MB: '2048',
      MOCK_CHANNEL_MEMORY_RESERVE_MB: '512',
      MOCK_CHANNEL_PER_WORKER_MB: '512',
      MOCK_CHANNEL_MAX_CPU_PERCENT: '80',
    });
    const fleet = workerFleetCapacity(2, [
      { accountId: 'a', rssBytes: 600 * 1024 ** 2, cpuPercent: 10, heartbeatAgeMs: 1 },
      { accountId: 'b', rssBytes: 100, cpuPercent: 90, heartbeatAgeMs: 1 },
    ], config);
    expect(fleet.admissionAllowed).toBe(false);
    expect(fleet.alerts).toEqual(expect.arrayContaining([
      'WORKER_CAPACITY_REACHED',
      'WORKER_MEMORY_RESERVATION_EXCEEDED',
      'WORKER_CPU_HIGH',
    ]));
  });
});
