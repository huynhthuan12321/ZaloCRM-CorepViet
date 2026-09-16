// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { config } from '../../config/index.js';
import { AiPrivacyDeniedError } from './ai-privacy-guard.js';
import { AiProviderUrlPolicyError } from './ai-provider-url-policy.js';

type CircuitStateName = 'closed' | 'open' | 'half_open';

type CircuitState = {
  state: CircuitStateName;
  failureCount: number;
  openedAt: number;
  halfOpenInFlight: number;
};

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const circuits = new Map<string, CircuitState>();
let now = () => Date.now();

export class AiCircuitOpenError extends Error {
  code = 'AI_PROVIDER_CIRCUIT_OPEN';
  errorType = 'provider_circuit_open';
  statusCode = 503;

  constructor(public readonly provider: string) {
    super(`AI provider circuit is open: ${provider}`);
    this.name = 'AiCircuitOpenError';
  }
}

function newState(): CircuitState {
  return { state: 'closed', failureCount: 0, openedAt: 0, halfOpenInFlight: 0 };
}

function stateFor(provider: string): CircuitState {
  const key = provider.toLowerCase();
  let state = circuits.get(key);
  if (!state) {
    state = newState();
    circuits.set(key, state);
  }
  return state;
}

function numericStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = (error as { status?: unknown; statusCode?: unknown }).statusCode
    ?? (error as { status?: unknown; statusCode?: unknown }).status;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function stringCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  return String((error as { code?: unknown }).code ?? '');
}

function nameOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  return String((error as { name?: unknown }).name ?? '');
}

export function isProviderTransientError(error: unknown): boolean {
  if (error instanceof AiPrivacyDeniedError || error instanceof AiProviderUrlPolicyError) return false;
  const status = numericStatus(error);
  if (status === 429 || (status !== null && status >= 500)) return true;
  if (status !== null && status >= 400) return false;
  if (TRANSIENT_CODES.has(stringCode(error))) return true;
  const name = nameOf(error);
  return name.includes('TimeoutError') || name.includes('AbortError');
}

export function checkAiCircuitBreaker(provider: string): void {
  const state = stateFor(provider);
  if (state.state === 'closed') return;
  if (state.state === 'open') {
    if (now() - state.openedAt < config.aiCircuitCooldownMs) {
      throw new AiCircuitOpenError(provider);
    }
    state.state = 'half_open';
    state.halfOpenInFlight = 0;
  }
  if (state.halfOpenInFlight >= config.aiCircuitHalfOpenMax) {
    throw new AiCircuitOpenError(provider);
  }
  state.halfOpenInFlight += 1;
}

export function recordAiCircuitSuccess(provider: string): void {
  const state = stateFor(provider);
  state.state = 'closed';
  state.failureCount = 0;
  state.openedAt = 0;
  state.halfOpenInFlight = 0;
}

export function recordAiCircuitFailure(provider: string, error: unknown): void {
  if (!isProviderTransientError(error)) return;
  const state = stateFor(provider);
  if (state.state === 'half_open') {
    state.state = 'open';
    state.openedAt = now();
    state.failureCount = config.aiCircuitFailureThreshold;
    state.halfOpenInFlight = 0;
    return;
  }
  state.failureCount += 1;
  if (state.failureCount >= config.aiCircuitFailureThreshold) {
    state.state = 'open';
    state.openedAt = now();
    state.halfOpenInFlight = 0;
  }
}

export function getAiCircuitState(provider: string): Readonly<CircuitState> {
  return { ...stateFor(provider) };
}

export function resetAiCircuitBreakers(): void {
  circuits.clear();
  now = () => Date.now();
}

export function setAiCircuitBreakerClock(clock: () => number): void {
  now = clock;
}
