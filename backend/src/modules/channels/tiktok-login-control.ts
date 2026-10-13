// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc

export type TikTokLoginMethod = 'qr' | 'password';

export type TikTokLoginAction =
  | { method: 'qr'; expiresAt: string }
  | { method: 'verify'; code: string; expiresAt: string }
  | { method: 'password'; identifier: string; password: string; expiresAt: string };

interface PendingTikTokLoginAction {
  epoch: string;
  action: TikTokLoginAction;
  expiresAtMs: number;
}

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const pending = new Map<string, PendingTikTokLoginAction>();

export function queueTikTokLoginAction(
  accountId: string,
  epoch: string,
  input: { method: 'qr' } | { method: 'password'; identifier: string; password: string } | { method: 'verify'; code: string },
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
): void {
  const expiresAtMs = now + ttlMs;
  const expiresAt = new Date(expiresAtMs).toISOString();
  pending.set(accountId, {
    epoch,
    expiresAtMs,
    action: { ...input, expiresAt },
  });
}

export function claimTikTokLoginAction(
  accountId: string,
  epoch: string,
  now = Date.now(),
): TikTokLoginAction | null {
  const current = pending.get(accountId);
  if (!current) return null;
  if (current.expiresAtMs <= now || BigInt(current.epoch) < BigInt(epoch)) {
    pending.delete(accountId);
    return null;
  }
  // A claim can read the DB epoch just before connect queues a newer action.
  // Never consume that newer action on behalf of the older in-flight claim.
  if (current.epoch !== epoch) return null;
  pending.delete(accountId);
  return current.action;
}

export function clearTikTokLoginAction(accountId: string): void {
  pending.delete(accountId);
}

export function resetTikTokLoginActionsForTests(): void {
  pending.clear();
}
