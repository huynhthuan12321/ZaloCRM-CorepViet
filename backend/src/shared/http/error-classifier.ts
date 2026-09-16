// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { Prisma } from '@prisma/client';
import { AiPrivacyDeniedError } from '../../modules/ai/ai-privacy-guard.js';
import { AiProviderUrlPolicyError } from '../../modules/ai/ai-provider-url-policy.js';
import { AiCircuitOpenError } from '../../modules/ai/ai-circuit-breaker.js';
import { AiRateLimitedError } from '../../modules/ai/ai-rate-limiter.js';
import { ZaloOpError } from '../zalo-operations.js';

export type ClassifiedError = {
  statusCode: number;
  clientMessage: string;
  logLevel: 'warn' | 'error';
  includeStack: boolean;
};

function hasFastifyValidation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : '';
}

export function classifyError(error: Error & { statusCode?: number; code?: unknown }): ClassifiedError {
  if (error instanceof AiPrivacyDeniedError || error instanceof AiProviderUrlPolicyError) {
    return { statusCode: 403, clientMessage: error.message, logLevel: 'warn', includeStack: false };
  }
  if (error instanceof AiRateLimitedError) {
    return { statusCode: 429, clientMessage: error.message, logLevel: 'warn', includeStack: false };
  }
  if (error instanceof AiCircuitOpenError) {
    return { statusCode: 503, clientMessage: 'AI provider temporarily unavailable', logLevel: 'warn', includeStack: false };
  }
  if (error instanceof ZaloOpError) {
    const statusCode = error.code === 'RATE_LIMITED' ? 429 : error.code === 'NOT_CONNECTED' ? 503 : error.statusCode;
    return { statusCode, clientMessage: error.message, logLevel: statusCode >= 500 ? 'error' : 'warn', includeStack: statusCode >= 500 };
  }
  if (hasFastifyValidation(error)) {
    return { statusCode: 400, clientMessage: error.message || 'Bad Request', logLevel: 'warn', includeStack: false };
  }
  if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(errorName(error))) {
    return { statusCode: 401, clientMessage: 'Unauthorized', logLevel: 'warn', includeStack: false };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError) {
    return { statusCode: 500, clientMessage: 'Internal Server Error', logLevel: 'error', includeStack: true };
  }

  const statusCode = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode >= 500) {
    return { statusCode, clientMessage: 'Internal Server Error', logLevel: 'error', includeStack: true };
  }
  return { statusCode, clientMessage: error.message || 'Request failed', logLevel: 'warn', includeStack: false };
}
