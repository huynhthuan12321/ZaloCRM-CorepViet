<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Tích hợp (mobile, CHỈ ĐỌC): tên, loại, bật/tắt, lần đồng bộ cuối, vài lần đồng bộ gần đây. Dữ liệu = GET /integrations (cùng endpoint desktop).
  Chủ ý CHỈ lấy các trường hiển thị an toàn: KHÔNG đọc/hiển thị `config` (khóa API, token bot, token trang...). Thêm/sửa/xóa/đồng bộ -> Dùng máy tính.
-->
<template>
  <section class="crm-ig">
    <MobileFeedback v-if="load.state.value === 'loading'" state="loading" title="Đang tải tích hợp" />
    <MobileFeedback v-else-if="load.state.value !== 'ready'" :state="load.state.value" :title="load.state.value === 'error' ? 'Không tải được danh sách tích hợp' : undefined" :retryable="load.state.value !== 'forbidden'" @retry="load.load" />
    <MobileFeedback v-else-if="items.length === 0" state="empty" title="Chưa có tích hợp" description="Thêm tích hợp trên máy tính." />
    <template v-else>
      <ul class="crm-ig__list" aria-label="Danh sách tích hợp">
        <li v-for="it in items" :key="it.id" class="crm-ig__card">
          <div class="crm-ig__top">
            <span class="crm-ig__name">{{ it.name || typeLabel(it.type) }}</span>
            <span class="crm-ig__on" :class="{ 'crm-ig__on--off': !it.enabled }">{{ it.enabled ? 'Bật' : 'Tắt' }}</span>
          </div>
          <span class="crm-ig__meta">{{ typeLabel(it.type) }}</span>
          <span class="crm-ig__meta">Đồng bộ lần cuối: {{ it.lastSyncAt ? formatInOrgTz(it.lastSyncAt) : 'Chưa có' }}</span>
          <span v-if="it.logs.length" class="crm-ig__meta">Gần đây: {{ it.logs.map((l) => `${logLabel(l.status)} (${l.recordCount})`).join(', ') }}</span>
        </li>
      </ul>
      <MobileDesktopNotice action="thêm, sửa, xóa hoặc đồng bộ tích hợp" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import { api } from '@/api/index';
import { formatInOrgTz } from '@/composables/use-org-timezone';
import { useReadonlyLoad } from '@/composables/mobile-settings/use-readonly-load';

interface SafeIntegration { id: string; type: string; name: string; enabled: boolean; lastSyncAt: string | null; logs: Array<{ status: string; recordCount: number }> }

const load = useReadonlyLoad<SafeIntegration[]>(async () => {
  const { data } = await api.get('/integrations');
  const list: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
  // Chọn từng trường an toàn — `config` (bí mật) bị bỏ ngay tại đây, không đi vào state.
  return list.map((x) => ({
    id: String(x.id),
    type: String(x.type ?? ''),
    name: typeof x.name === 'string' ? x.name : '',
    enabled: x.enabled === true,
    lastSyncAt: typeof x.lastSyncAt === 'string' ? x.lastSyncAt : null,
    logs: (Array.isArray(x.syncLogs) ? (x.syncLogs as Array<Record<string, unknown>>) : []).slice(0, 3).map((l) => ({ status: String(l.status ?? ''), recordCount: Number(l.recordCount ?? 0) })),
  }));
});
const items = computed(() => load.data.value ?? []);
const TYPES: Record<string, string> = { google_sheets: 'Google Sheets', telegram: 'Telegram Bot', facebook: 'Facebook', zapier: 'Zapier' };
const typeLabel = (t: string) => TYPES[t] ?? t;
const logLabel = (s: string) => (s === 'success' ? 'Thành công' : s === 'partial' ? 'Một phần' : 'Lỗi');
onMounted(() => { void load.load(); });
</script>

<style scoped>
.crm-ig { display: flex; flex-direction: column; gap: var(--m-space-4); color: var(--m-text); min-width: 0; }
.crm-ig__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-ig__card { display: flex; flex-direction: column; gap: 2px; padding: var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); min-width: 0; }
.crm-ig__top { display: flex; justify-content: space-between; align-items: center; gap: var(--m-space-2); }
.crm-ig__name { font-weight: 650; overflow-wrap: anywhere; }
.crm-ig__on { flex: none; padding: 1px 10px; border-radius: 999px; background: var(--m-surface-inset); color: var(--m-success); font-size: 12px; font-weight: 650; }
.crm-ig__on--off { color: var(--m-muted); }
.crm-ig__meta { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
</style>
