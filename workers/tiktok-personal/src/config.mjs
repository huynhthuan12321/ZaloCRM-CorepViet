// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import path from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const username = /^[A-Za-z0-9_.]{2,64}$/;

function positiveInteger(value, fallback, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw Error('INVALID_NUMERIC_CONFIG');
  return parsed;
}

export function resolveConfig(env = process.env) {
  const accountId = env.CRM_CHANNEL_ACCOUNT_ID?.trim() ?? '';
  const epoch = env.CRM_CHANNEL_EPOCH?.trim() ?? '';
  const expectedUsername = (env.TIKTOK_EXPECTED_USERNAME ?? '').trim().replace(/^@/, '');
  const secret = env.TIKTOK_PERSONAL_WORKER_SECRET?.trim() ?? '';
  if (!uuid.test(accountId)) throw Error('CRM_CHANNEL_ACCOUNT_ID_INVALID');
  if (!/^[1-9]\d{0,19}$/.test(epoch)) throw Error('CRM_CHANNEL_EPOCH_INVALID');
  if (!username.test(expectedUsername)) throw Error('TIKTOK_EXPECTED_USERNAME_INVALID');
  if (secret.length < 32) throw Error('TIKTOK_PERSONAL_WORKER_SECRET_INVALID');
  const crmUrl = new URL(env.CRM_BRIDGE_URL ?? 'http://app:3000');
  if (!['http:', 'https:'].includes(crmUrl.protocol) || crmUrl.username || crmUrl.password) {
    throw Error('CRM_BRIDGE_URL_INVALID');
  }
  const dataRoot = path.resolve(env.TIKTOK_WORKER_DATA_DIR ?? '/data');
  return {
    accountId,
    epoch,
    expectedUsername,
    secret,
    crmOrigin: crmUrl.origin,
    profileDir: path.join(dataRoot, 'profiles', accountId),
    headless: env.TIKTOK_HEADLESS !== 'false',
    pollMs: positiveInteger(env.TIKTOK_POLL_MS, 5_000, 300_000),
    sessionReportMs: positiveInteger(env.TIKTOK_SESSION_REPORT_MS, 10_000, 300_000),
    maxThreadsPerCycle: positiveInteger(env.TIKTOK_MAX_THREADS_PER_CYCLE, 30, 100),
    messagesUrl: env.TIKTOK_MESSAGES_URL ?? 'https://www.tiktok.com/messages?lang=en',
  };
}
