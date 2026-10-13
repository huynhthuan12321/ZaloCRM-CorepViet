// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
type Env = Record<string, string | undefined>;

export interface WorkerCapacityConfig {
  maxWorkers: number;
  memoryBudgetBytes: number;
  memoryReserveBytes: number;
  perWorkerReserveBytes: number;
  maxCpuPercent: number;
  effectiveLimit: number;
}

function boundedInteger(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function resolveWorkerCapacityConfig(env: Env = process.env): WorkerCapacityConfig {
  const maxWorkers = boundedInteger(env, 'MOCK_CHANNEL_MAX_WORKERS', 2, 1, 32);
  const memoryBudgetMb = boundedInteger(env, 'MOCK_CHANNEL_MEMORY_BUDGET_MB', 2048, 512, 262_144);
  const memoryReserveMb = boundedInteger(env, 'MOCK_CHANNEL_MEMORY_RESERVE_MB', 512, 0, memoryBudgetMb - 1);
  const perWorkerReserveMb = boundedInteger(env, 'MOCK_CHANNEL_PER_WORKER_MB', 512, 128, 16_384);
  const maxCpuPercent = boundedInteger(env, 'MOCK_CHANNEL_MAX_CPU_PERCENT', 80, 1, 1000);
  const memoryLimit = Math.max(0, Math.floor((memoryBudgetMb - memoryReserveMb) / perWorkerReserveMb));
  return {
    maxWorkers,
    memoryBudgetBytes: memoryBudgetMb * 1024 ** 2,
    memoryReserveBytes: memoryReserveMb * 1024 ** 2,
    perWorkerReserveBytes: perWorkerReserveMb * 1024 ** 2,
    maxCpuPercent,
    effectiveLimit: Math.min(maxWorkers, memoryLimit),
  };
}

export interface WorkerResourceObservation {
  accountId: string;
  rssBytes: number;
  cpuPercent: number;
  heartbeatAgeMs: number;
}

export function workerFleetCapacity(
  activeWorkers: number,
  observations: WorkerResourceObservation[],
  config = resolveWorkerCapacityConfig(),
) {
  const totalObservedRssBytes = observations.reduce((total, row) => total + row.rssBytes, 0);
  const reservedForWorkersBytes = activeWorkers * config.perWorkerReserveBytes;
  const usableBytes = Math.max(0, config.memoryBudgetBytes - config.memoryReserveBytes);
  const headroomBytes = Math.max(0, usableBytes - reservedForWorkersBytes);
  const alerts: string[] = [];
  if (activeWorkers >= config.effectiveLimit) alerts.push('WORKER_CAPACITY_REACHED');
  if (observations.some(row => row.rssBytes > config.perWorkerReserveBytes)) alerts.push('WORKER_MEMORY_RESERVATION_EXCEEDED');
  if (observations.some(row => row.cpuPercent > config.maxCpuPercent)) alerts.push('WORKER_CPU_HIGH');
  if (observations.length < activeWorkers) alerts.push('WORKER_METRICS_INCOMPLETE');
  return {
    configuredMaxWorkers: config.maxWorkers,
    effectiveLimit: config.effectiveLimit,
    activeWorkers,
    remainingSlots: Math.max(0, config.effectiveLimit - activeWorkers),
    memoryBudgetBytes: config.memoryBudgetBytes,
    memoryReserveBytes: config.memoryReserveBytes,
    perWorkerReserveBytes: config.perWorkerReserveBytes,
    reservedForWorkersBytes,
    headroomBytes,
    totalObservedRssBytes,
    maxCpuPercent: config.maxCpuPercent,
    admissionAllowed: activeWorkers < config.effectiveLimit,
    alerts,
  };
}
