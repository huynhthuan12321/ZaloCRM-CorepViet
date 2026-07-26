<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!--
    ContactProfileView — trang "Hồ sơ KH tổng hợp" (/contacts/:id/profile).

    Dữ liệu: GET /api/v1/contacts/:id/profile (org-scope + RBAC ở backend).
    aggregateScore = MAX(Friend.leadScore) theo architecture Phase 6 chốt 2026-05-16.
    aggregateTags = UNION(Contact.tags, Friend.crmTagsPerNick) đã dedupe.
    Timeline KHÔNG nằm trong contract → không render ở đây.
  -->
  <div class="cp-view">
    <header class="cp-header">
      <button class="back-btn" @click="$router.back()">← Quay lại</button>
      <h1>🧑 Hồ sơ KH tổng hợp</h1>
      <div class="cp-actions">
        <span class="cp-id" :title="contactId">ID: {{ contactId.slice(0, 8) }}…</span>
      </div>
    </header>

    <div v-if="loading" class="cp-loading">⏳ Đang tải hồ sơ tổng hợp…</div>

    <div v-else-if="error" class="cp-error">⚠️ {{ error }}</div>

    <div v-else-if="profile" class="cp-content">
      <!-- Header card -->
      <section class="cp-card cp-hero">
        <img v-if="profile.contact.avatarUrl" class="cp-avatar" :src="profile.contact.avatarUrl" :alt="profile.contact.displayName" />
        <div v-else class="cp-avatar cp-avatar-fallback">{{ initial }}</div>
        <div class="cp-hero-main">
          <div class="cp-hero-name">{{ profile.contact.displayName || profile.contact.fullName || '—' }}</div>
          <div class="cp-hero-meta">
            <span class="cp-chip-score" title="MAX điểm trên các nick (Phase 6)">💯 {{ profile.aggregateScore }}</span>
            <span v-if="profile.contact.statusName" class="cp-chip-status">{{ profile.contact.statusName }}</span>
            <span class="cp-hero-owner">Phụ trách chính: <strong>{{ profile.primaryOwner?.userName || '— chưa có —' }}</strong></span>
          </div>
        </div>
      </section>

      <!-- Thông tin chung -->
      <section class="cp-card">
        <h2>📋 Thông tin chung</h2>
        <div class="cp-info-grid">
          <div v-for="row in generalRows" :key="row.label" class="cp-info-row">
            <span class="cp-label">{{ row.label }}</span>
            <span class="cp-value">{{ row.value }}</span>
          </div>
          <p v-if="!generalRows.length" class="cp-empty">Chưa có thông tin chi tiết.</p>
        </div>
      </section>

      <!-- Nick Zalo -->
      <section class="cp-card">
        <h2>📱 Nick Zalo ({{ profile.friends.length }})</h2>
        <div v-if="profile.friends.length" class="cp-table-wrap">
          <table class="cp-table">
            <thead>
              <tr>
                <th>Nick</th><th>Tài khoản</th><th class="num">Điểm</th><th>Trạng thái</th>
                <th>Quan hệ</th><th class="num">In / Out</th><th>Tương tác cuối</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in profile.friends" :key="f.id">
                <td>
                  <div class="cp-nick">{{ f.displayName || f.aliasInNick || '—' }}</div>
                  <div v-if="f.aliasInNick && f.displayName && f.aliasInNick !== f.displayName" class="cp-nick-sub">({{ f.aliasInNick }})</div>
                </td>
                <td>{{ f.accountName || '—' }}</td>
                <td class="num"><span class="cp-score-cell">{{ f.leadScore }}</span></td>
                <td>{{ f.statusName || '—' }}</td>
                <td>{{ f.relationshipKind || '—' }}</td>
                <td class="num">{{ f.totalInbound }} / {{ f.totalOutbound }}</td>
                <td>{{ formatVn(f.lastInboundAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="cp-empty">Chưa có nick Zalo nào.</p>
      </section>

      <!-- Tags tổng hợp -->
      <section class="cp-card">
        <h2>🏷️ Tags tổng hợp</h2>
        <div v-if="profile.aggregateTags.length" class="cp-tags">
          <span v-for="t in profile.aggregateTags" :key="t" class="cp-tag">{{ t }}</span>
        </div>
        <p v-else class="cp-empty">Chưa có tag.</p>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useContactProfile } from '@/composables/use-contact-profile';

const route = useRoute();
const contactId = computed(() => String(route.params.id || ''));
const { profile, loading, error, fetchContactProfile } = useContactProfile();

onMounted(() => {
  if (contactId.value) fetchContactProfile(contactId.value);
});

const initial = computed(() => {
  const n = profile.value?.contact.displayName || profile.value?.contact.fullName || '?';
  return n.trim().charAt(0).toUpperCase() || '?';
});

/** Ghép địa giới thành 1 dòng, bỏ phần null. */
const regionLine = computed(() => {
  const c = profile.value?.contact;
  return [c?.ward, c?.district, c?.province].filter(Boolean).join(', ');
});

/** Chỉ hiện dòng có dữ liệu — field null bị bỏ hẳn (theo yêu cầu). */
const generalRows = computed<Array<{ label: string; value: string }>>(() => {
  const c = profile.value?.contact;
  if (!c) return [];
  const birthday = c.birthDate ? formatVnDate(c.birthDate) : (c.birthYear ? String(c.birthYear) : '');
  const raw: Array<[string, string | null | undefined]> = [
    ['Tên đầy đủ:', c.fullName],
    ['Tên CRM:', c.crmName],
    ['Email:', c.email],
    ['Điện thoại:', c.phone],
    ['Điện thoại 2:', c.phone2],
    ['Điện thoại 3:', c.phone3],
    ['Nghề nghiệp:', c.occupation],
    ['Địa chỉ:', c.addressLine],
    ['Khu vực:', regionLine.value],
    ['Giới tính:', c.gender],
    ['Ngày sinh:', birthday],
  ];
  return raw
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([label, v]) => ({ label, value: (v as string).trim() }));
});

function formatVnDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatVn(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
</script>

<style scoped>
.cp-view {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, "Segoe UI", "Inter", system-ui, sans-serif;
}

.cp-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.cp-header h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  flex: 1;
  color: #111827;
}
.back-btn {
  background: white;
  border: 1px solid #E5E7EB;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  font-family: inherit;
}
.back-btn:hover {
  border-color: #6366F1;
  color: #4338CA;
}

.cp-id {
  font-size: 11px;
  color: #9CA3AF;
  font-family: ui-monospace, monospace;
}

.cp-loading,
.cp-error {
  background: white;
  border-radius: 12px;
  padding: 48px;
  text-align: center;
  color: #6B7280;
}
.cp-error {
  color: #DC2626;
}

.cp-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cp-card {
  background: white;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.cp-card h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px;
  color: #111827;
}

.cp-info-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cp-info-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}
.cp-label {
  font-weight: 600;
  color: #6B7280;
}
.cp-value {
  color: #111827;
}
.cp-value.score {
  display: inline-block;
  font-size: 16px;
  font-weight: 700;
  color: #10B981;
  background: #ECFDF5;
  padding: 2px 12px;
  border-radius: 8px;
  width: fit-content;
}

/* ── Header card ── */
.cp-hero {
  display: flex;
  align-items: center;
  gap: 16px;
}
.cp-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.cp-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  color: white;
  font-size: 22px;
  font-weight: 700;
}
.cp-hero-main { min-width: 0; }
.cp-hero-name {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}
.cp-hero-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 12.5px;
  color: #6B7280;
}
.cp-chip-score {
  background: #ECFDF5;
  color: #047857;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 8px;
}
.cp-chip-status {
  background: #EEF2FF;
  color: #4338CA;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 8px;
}

/* ── Bảng nick Zalo ── */
.cp-table-wrap { overflow-x: auto; }
.cp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.cp-table th,
.cp-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #F3F4F6;
  white-space: nowrap;
}
.cp-table th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #6B7280;
  background: #F9FAFB;
}
.cp-table th.num,
.cp-table td.num { text-align: right; }
.cp-table tbody tr:hover { background: #FAFAFB; }
.cp-nick { font-weight: 600; color: #111827; }
.cp-nick-sub { font-size: 11px; color: #9CA3AF; }
.cp-score-cell {
  font-weight: 700;
  color: #047857;
}

/* ── Tags ── */
.cp-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-tag {
  background: #F3F4F6;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
}

.cp-empty {
  font-size: 13px;
  color: #9CA3AF;
  margin: 4px 0 0;
}
</style>
