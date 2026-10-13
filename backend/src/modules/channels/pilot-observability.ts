// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
export interface PilotHeartbeat {
  accountId: string;
  epoch: string;
  sessionState: 'authenticated' | 'qr_required' | 'challenge' | 'expired' | 'error';
  rssBytes: number;
  heapUsedBytes: number;
  cpuPercent: number;
  eventLoopP95Ms: number;
  profileBytes: number;
  ledgerBytes: number;
  ledgerMessages: number;
  ledgerCommands: number;
  observedAt: string;
}

export interface PilotReconciliation {
  checkedAt: string;
  workerMessageCount: number;
  crmMessageCount: number;
  missingInCrm: number;
  missingInWorker: number;
  workerCommandCount: number;
  crmCommandCount: number;
  commandMismatch: number;
}

interface PilotState {
  heartbeat?: PilotHeartbeat;
  reconciliation?: PilotReconciliation;
}

const states = new Map<string, PilotState>();

export function recordPilotHeartbeat(heartbeat: PilotHeartbeat): void {
  const previous = states.get(heartbeat.accountId) ?? {};
  states.set(heartbeat.accountId, { ...previous, heartbeat });
}

export function recordPilotReconciliation(accountId: string, reconciliation: PilotReconciliation): void {
  const previous = states.get(accountId) ?? {};
  states.set(accountId, { ...previous, reconciliation });
}

export function pilotRuntimeState(accountId: string): Readonly<PilotState> {
  return states.get(accountId) ?? {};
}

export function pilotRuntimeStates(accountIds: string[]): ReadonlyMap<string, Readonly<PilotState>> {
  return new Map(accountIds.map(accountId => [accountId, pilotRuntimeState(accountId)]));
}

export function clearPilotRuntimeState(accountId: string): void {
  states.delete(accountId);
}

export function resetPilotRuntimeForTests(): void {
  states.clear();
}
