// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
export interface TikTokConnectionRuntime {
  state: 'qr_required' | 'authenticated' | 'challenge' | 'expired' | 'error';
  epoch: string;
  qrDataUrl?: string;
  identityUsername?: string;
  observedAt: string;
  errorCode?: string;
}

const states = new Map<string, TikTokConnectionRuntime>();

export function recordTikTokConnectionState(
  accountId: string,
  state: TikTokConnectionRuntime,
): void {
  states.set(accountId, state);
}

export function tiktokConnectionState(accountId: string): Readonly<TikTokConnectionRuntime> | null {
  return states.get(accountId) ?? null;
}

export function clearTikTokConnectionState(accountId: string): void {
  states.delete(accountId);
}

export function resetTikTokConnectionStatesForTests(): void {
  states.clear();
}
