// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, reactive } from 'vue';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';
import type { InboxFilters } from '@/components/mobile/chat/types';

/**
 * Bộ lọc inbox mobile: state trong RAM; route adapter đồng bộ trạng thái Chưa trả lời
 * và ID sale vào query URL để back/reload, không đưa tên khách/nhân viên vào URL.
 * Các tham số map sang query /conversations mà backend đã hỗ trợ: unread, unreplied, assignedUserId (+ accountId qua workScope).
 */
const state = reactive<InboxFilters>({ unread: false, unreplied: false, mine: false, accountId: null, assignedUserId: null });
let resetBound = false;

export const EMPTY_INBOX_FILTERS: Readonly<InboxFilters> = Object.freeze({ unread: false, unreplied: false, mine: false, accountId: null, assignedUserId: null });

function bindReset() {
  if (resetBound || typeof window === 'undefined') return;
  resetBound = true;
  window.addEventListener(MOBILE_SESSION_RESET_EVENT, () => Object.assign(state, EMPTY_INBOX_FILTERS));
}

/** Tham số query thêm vào GET /conversations (gán vào useChat().extraFilters). */
export function buildInboxQueryParams(filters: InboxFilters, currentUserId: string | null): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.unread) params.unread = 'true';
  if (filters.unreplied) params.unreplied = 'true';
  if (filters.mine && currentUserId) params.assignedUserId = currentUserId;
  if (filters.assignedUserId && filters.assignedUserId !== 'all') params.assignedUserId = filters.assignedUserId;
  return params;
}

export function countActiveFilters(filters: InboxFilters): number {
  return Number(filters.unread) + Number(filters.unreplied) + Number(filters.mine || !!filters.assignedUserId) + Number(!!filters.accountId);
}

export function useMobileInboxFilters() {
  bindReset();
  const activeCount = computed(() => countActiveFilters(state));
  function apply(next: InboxFilters) { Object.assign(state, { assignedUserId: null }, next); }
  function clear() { Object.assign(state, EMPTY_INBOX_FILTERS); }
  return { filters: state, activeCount, apply, clear };
}
