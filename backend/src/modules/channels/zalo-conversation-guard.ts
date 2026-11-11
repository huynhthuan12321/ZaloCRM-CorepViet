// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/** Narrow only after inspecting persisted transport identity, never cast nullable IDs. */
export function isZaloConversation<T extends { zaloAccountId: string | null; zaloAccount?: unknown }>(
  value: T,
): value is T & { zaloAccountId: string; zaloAccount: NonNullable<T['zaloAccount']> } {
  return typeof value.zaloAccountId === 'string' && value.zaloAccountId.length > 0
    && (!('zaloAccount' in value) || value.zaloAccount != null);
}

export function assertZaloConversation<T extends { zaloAccountId: string | null; zaloAccount?: unknown }>(
  value: T,
): asserts value is T & { zaloAccountId: string; zaloAccount: NonNullable<T['zaloAccount']> } {
  if (!isZaloConversation(value)) {
    throw Object.assign(new Error('Operation only supported for Zalo conversations'), {
      statusCode: 409, code: 'ZALO_ONLY_OPERATION',
    });
  }
}
