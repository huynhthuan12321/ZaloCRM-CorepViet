// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { config } from '../../config/index.js';
import type { AiDataGrant } from './ai-privacy-guard.js';

type RateWindow = {
  count: number;
  windowStart: number;
};

const windows = new Map<string, RateWindow>();
let now = () => Date.now();

export class AiRateLimitedError extends Error {
  code = 'AI_RATE_LIMITED';
  statusCode = 429;

  constructor(public readonly orgId: string) {
    super('AI rate limit exceeded for organization');
    this.name = 'AiRateLimitedError';
  }
}

export function checkAiRateLimit(grant: AiDataGrant): void {
  if (grant.purpose === 'eval') return;
  const current = now();
  const existing = windows.get(grant.orgId);
  const window = !existing || current - existing.windowStart >= config.aiRateLimitWindowMs
    ? { count: 0, windowStart: current }
    : existing;

  if (window.count >= config.aiRateLimitPerOrg) {
    windows.set(grant.orgId, window);
    throw new AiRateLimitedError(grant.orgId);
  }
  window.count += 1;
  windows.set(grant.orgId, window);
}

export function getAiRateLimitState(orgId: string): Readonly<RateWindow> | null {
  const window = windows.get(orgId);
  return window ? { ...window } : null;
}

export function resetAiRateLimiter(): void {
  windows.clear();
  now = () => Date.now();
}

export function setAiRateLimiterClock(clock: () => number): void {
  now = clock;
}
