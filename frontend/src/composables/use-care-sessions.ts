// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * use-care-sessions.ts — nạp danh sách Phiên chăm sóc / Bám đuổi thủ công (Phase 4.1).
 * Backend: GET /api/v1/automation/care-sessions (org-scoped, RBAC owner-scope).
 * CHỈ READ + thao tác pause/stop (đổi trạng thái DB) — KHÔNG gửi Zalo.
 */
import { ref } from 'vue';
import { api } from '@/api';
import type { CareSessionItem } from '@/composables/care-session-view-logic';

export interface CareSummary {
  total: number; running: number; paused: number; completed: number; stopped: number;
}

export function useCareSessions(defaultSourceType?: 'sequence_manual' | 'target_followup') {
  const sessions = ref<CareSessionItem[]>([]);
  const summary = ref<CareSummary>({ total: 0, running: 0, paused: 0, completed: 0, stopped: 0 });
  const dryRun = ref(true);
  const loading = ref(false);
  const error = ref('');

  async function load(opts: { state?: string; q?: string } = {}): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const params: Record<string, string> = {};
      if (opts.state && opts.state !== 'all') params.state = opts.state;
      if (opts.q?.trim()) params.q = opts.q.trim();
      if (defaultSourceType) params.sourceType = defaultSourceType;
      const res = await api.get('/automation/care-sessions', { params });
      sessions.value = res.data.sessions ?? [];
      summary.value = res.data.summary ?? { total: 0, running: 0, paused: 0, completed: 0, stopped: 0 };
      dryRun.value = res.data.dryRun !== false;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Không tải được danh sách phiên. Thử lại.';
    } finally {
      loading.value = false;
    }
  }

  // Tạm dừng: chỉ đổi pausedUntil (KHÔNG gửi gì). Dùng endpoint có sẵn theo (sessionId=triggerId, contactId).
  async function pause(item: CareSessionItem, hours = 24): Promise<void> {
    await api.post(`/automation/triggers/${item.id}/contacts/${item.contactId}/pause`, { hours });
  }
  // Dừng hẳn: đổi state='closed' (KHÔNG gửi gì).
  async function stop(item: CareSessionItem, reason = 'sale_resolved'): Promise<void> {
    await api.post(`/automation/triggers/${item.id}/contacts/${item.contactId}/stop`, { reason });
  }

  return { sessions, summary, dryRun, loading, error, load, pause, stop };
}
