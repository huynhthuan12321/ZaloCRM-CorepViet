// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { logger } from '../shared/utils/logger.js';
import { describeTokenKeyProblem } from '../modules/integrations/_shared/token-encryption.util.js';
import { resolveMessengerConfig } from './messenger-config.js';

type Env = Record<string, string | undefined>;
type LogLike = Pick<typeof logger, 'warn' | 'error'>;

const PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'dev-secret-change-me',
  'dev-key-change-me-16b',
]);

const TOKEN_KEY_ROTATION_RE = /^TOKEN_ENCRYPTION_KEY_V([2-9]|[1-9]\d+)$/;

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isPlaceholder(value: string | undefined): boolean {
  return !!value && PLACEHOLDERS.has(value.trim().toLowerCase());
}

/** Lỗi chặn khởi động ở production. Thông báo chỉ chứa TÊN biến, không bao giờ chứa giá trị. */
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

  // Token key: ĐÃ đặt nhưng sai định dạng = chắc chắn cấu hình hỏng → fatal.
  // Chưa đặt = chỉ cảnh báo (tính năng dùng token tự fail closed khi gọi).
  if (!isMissing(env.TOKEN_ENCRYPTION_KEY)) {
    const problem = describeTokenKeyProblem('TOKEN_ENCRYPTION_KEY', env.TOKEN_ENCRYPTION_KEY);
    if (problem) errors.push(problem);
  }
  for (const name of Object.keys(env).filter((key) => TOKEN_KEY_ROTATION_RE.test(key)).sort()) {
    if (isMissing(env[name])) continue;
    const problem = describeTokenKeyProblem(name, env[name]);
    if (problem) errors.push(problem);
  }
  return errors;
}

/** Cảnh báo không chặn khởi động — Zalo vẫn chạy, tính năng liên quan tự tắt. */
function collectProductionConfigWarnings(env: Env): string[] {
  const warnings: string[] = [];
  if (isMissing(env.TOKEN_ENCRYPTION_KEY)) {
    warnings.push('TOKEN_ENCRYPTION_KEY is not set (encrypted integration secrets/AI keys cannot be read)');
  }
  const messenger = resolveMessengerConfig(env);
  warnings.push(...messenger.warnings);
  if (messenger.status === 'misconfigured') {
    warnings.push(`Messenger is DISABLED (misconfigured): ${messenger.problems.join(', ')}`);
  }
  return warnings;
}

export function validateProductionConfig(
  env: Env = process.env,
  exit: (code: number) => never = process.exit,
  log: LogLike = logger,
): void {
  const errors = collectProductionConfigErrors(env);
  const warnings = collectProductionConfigWarnings(env);
  if ((env.NODE_ENV ?? '').trim() === 'production') {
    if (errors.length > 0) {
      log.error('FATAL: Production config validation failed:');
      for (const error of errors) log.error(`  - ${error}`);
      exit(1);
      return;
    }
    for (const warning of warnings) log.warn(`Config warning: ${warning}`);
    return;
  }
  const all = [...errors, ...warnings];
  if (all.length > 0) {
    log.warn(`Production config validation warnings: ${all.join('; ')}`);
  }
}
