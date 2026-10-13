// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const ACCOUNT = 'mock-personal-01';
const ACCOUNT_PATTERN = /^mock-personal-(?:0[1-9]|[12]\d|3[0-2])$/;
export function resolveAccount(env = process.env) {
  const account = env.POC_ACCOUNT ?? ACCOUNT;
  if (!ACCOUNT_PATTERN.test(account)) throw Error('POC_ACCOUNT_MUST_BE_MOCK_PERSONAL_01_TO_32');
  return account;
}
export function config(env = process.env) {
  if ((env.POC_MODE ?? 'mock') !== 'mock') throw Error('LIVE_MODE_NOT_IMPLEMENTED');
  const url = new URL(env.POC_URL ?? 'http://127.0.0.1:4317');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('LOOPBACK_ROOT_REQUIRED');
  const account = resolveAccount(env);
  return {
    account,
    origin: url.origin,
    profile: path.join(root, 'runtime', 'profiles', account),
    ledger: path.join(root, 'runtime', 'ledgers', `${account}.json`),
    lease: path.join(root, 'runtime', 'leases', account),
    headless: env.POC_HEADLESS === 'true',
  };
}
