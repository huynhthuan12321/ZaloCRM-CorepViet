// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[a-zA-Z0-9\-_.]{1,128}$/;

export function sanitizeRequestId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && SAFE_REQUEST_ID.test(value)) return value;
  return randomUUID();
}
