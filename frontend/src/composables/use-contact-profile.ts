// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * use-contact-profile.ts — Composable cho tab "Hồ sơ KH tổng hợp".
 *
 * Backend: GET /api/v1/contacts/:id/profile (contact-routes.ts) — org-scope +
 * RBAC như các route contact khác. Cache in-memory 60s/contact để tránh refetch
 * khi sale chuyển qua lại giữa các KH.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

// ─── Types: API contract (backend trả đúng shape này) ───────────────────

export interface ContactProfileResponse {
  contact: {
    id: string;
    displayName: string;
    fullName: string | null;
    crmName: string | null;
    /** 3 field này ẨN khỏi ChatContactPanel cột 4, chỉ hiển thị ở đây */
    email: string | null;
    addressLine: string | null;
    occupation: string | null;
    /** Multi-phone */
    phone: string | null;
    phone2: string | null;
    phone3: string | null;
    /** Profile demographics */
    gender: string | null;
    birthDate: string | null;
    birthYear: number | null;
    province: string | null;
    district: string | null;
    ward: string | null;
    /** Aggregated từ Friend rows */
    leadScore: number;
    statusId: string | null;
    statusName: string | null;
    avatarUrl: string | null;
  };
  /** Tất cả Friend rows (per-pair) của KH này */
  friends: Array<{
    id: string;
    zaloUid: string | null;
    accountId: string;
    accountName: string | null;
    displayName: string | null;
    aliasInNick: string | null;
    leadScore: number;
    statusName: string | null;
    relationshipKind: string;
    totalInbound: number;
    totalOutbound: number;
    lastInboundAt: string | null;
  }>;
  /** Score MAX across friends (Phase 6 architecture) */
  aggregateScore: number;
  /** Tags gộp từ Contact.tags + UNION(Friend.crmTagsPerNick) — dedupe */
  aggregateTags: string[];
  /** Sale có Friend leadScore cao nhất + lastInboundAt < 14d */
  primaryOwner: {
    userId: string;
    userName: string;
  } | null;
}

// ─── Cache nhẹ 60s/contact ──────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: ContactProfileResponse }>();

// ─── Composable ─────────────────────────────────────────────────────────

export function useContactProfile() {
  const profile = ref<ContactProfileResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchContactProfile(contactId: string): Promise<ContactProfileResponse | null> {
    const hit = cache.get(contactId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      profile.value = hit.data;
      error.value = null;
      return hit.data;
    }
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ContactProfileResponse>(`/contacts/${contactId}/profile`);
      profile.value = data;
      cache.set(contactId, { at: Date.now(), data });
      return data;
    } catch (err: any) {
      error.value = err?.response?.data?.error || err?.message || 'failed';
      return null;
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    profile.value = null;
    error.value = null;
  }

  return { profile, loading, error, fetchContactProfile, clear };
}
