// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { logger } from '../shared/utils/logger.js';

type Env = Record<string, string | undefined>;
type LogLike = Pick<typeof logger, 'warn' | 'error'>;

const PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'dev-secret-change-me',
  'dev-key-change-me-16b',
]);

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isPlaceholder(value: string | undefined): boolean {
  return !!value && PLACEHOLDERS.has(value.trim().toLowerCase());
}

function collectProductionConfigErrors(env: Env): string[] {
  const errors: string[] = [];
  if (isMissing(env.JWT_SECRET)) errors.push('JWT_SECRET is not set');
  if (isPlaceholder(env.JWT_SECRET)) errors.push('JWT_SECRET is a placeholder value');
  if (isMissing(env.ENCRYPTION_KEY)) errors.push('ENCRYPTION_KEY is not set');
  if (isPlaceholder(env.ENCRYPTION_KEY)) errors.push('ENCRYPTION_KEY is a placeholder value');
  if ((env.ENCRYPTION_KEY ?? '').trim().length > 0 && (env.ENCRYPTION_KEY ?? '').trim().length < 32) {
    errors.push('ENCRYPTION_KEY is too short (minimum 32 hex chars)');
  }
  if (isMissing(env.DATABASE_URL)) errors.push('DATABASE_URL is not set');
  return errors;
}

export function validateProductionConfig(
  env: Env = process.env,
  exit: (code: number) => never = process.exit,
  log: LogLike = logger,
): void {
  const errors = collectProductionConfigErrors(env);
  if ((env.NODE_ENV ?? '').trim() === 'production') {
    if (errors.length === 0) return;
    log.error('FATAL: Production config validation failed:');
    for (const error of errors) log.error(`  - ${error}`);
    exit(1);
  }
  if (errors.length > 0) {
    log.warn(`Production config validation warnings: ${errors.join('; ')}`);
  }
}
