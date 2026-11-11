<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Nhật ký quản trị (mobile, CHỈ ĐỌC): lọc theo hành động + phân trang, dạng thẻ. Cùng endpoint desktop GET /audit-logs (limit/offset/action).
  Có phân loại lỗi (mất mạng/403/lỗi), không giả làm "chưa có thao tác". Bộ lọc là nhóm nút có aria-pressed; phân trang có nhãn đọc được.
-->
<template>
  <section class="crm-au">
    <div class="crm-au__chips" role="group" aria-label="Lọc hành động">
      <button v-for="o in FILTERS" :key="o.value" type="button" class="crm-au__chip" :aria-pressed="action === o.value" @click="setAction(o.value)">{{ o.label }}</button>
    </div>
    <p class="crm-au__count" role="status">{{ total }} bản ghi</p>

    <MobileFeedback v-if="state === 'loading'" state="loading" title="Đang tải nhật ký" />
    <MobileFeedback v-else-if="state !== 'ready'" :state="state" :title="state === 'error' ? 'Không tải được nhật ký' : undefined" :retryable="state !== 'forbidden'" @retry="load" />
    <MobileFeedback v-else-if="logs.length === 0" state="empty" title="Chưa có thao tác nào được ghi lại" :clearable="action !== ''" @clear-filters="setAction('')" />
    <ul v-else class="crm-au__list" aria-label="Nhật ký quản trị">
      <li v-for="l in logs" :key="l.id" class="crm-au__item">
        <span class="crm-au__act">{{ ACTION_LABELS[l.action] || l.action }}</span>
        <span class="crm-au__line"><b>{{ l.actor?.name || '(hệ thống)' }}</b><template v-if="l.target?.name"> → {{ l.target.name }}</template></span>
        <span v-if="detail(l)" class="crm-au__line">{{ detail(l) }}</span>
        <time class="crm-au__time" :datetime="l.createdAt">{{ fmtTime(l.createdAt) }}</time>
      </li>
    </ul>

    <nav v-if="state === 'ready' && total > limit" class="crm-au__pager" aria-label="Phân trang nhật ký">
      <button type="button" class="crm-au__btn" :disabled="offset === 0" @click="go(-1)">← Trước</button>
      <span class="crm-au__info" aria-live="polite">{{ offset + 1 }}–{{ Math.min(offset + limit, total) }} / {{ total }}</span>
      <button type="button" class="crm-au__btn" :disabled="offset + limit >= total" @click="go(1)">Sau →</button>
    </nav>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { api } from '@/api/index';
import { useMobile } from '@/composables/use-mobile';
import { classifyLoadError, type SettingsLoadState } from '@/composables/mobile-settings/load-state';

interface AuditLog { id: string; action: string; createdAt: string; actor: { id: string; name: string } | null; target: { id: string; name: string } | null; details: Record<string, any> }
const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'user.handoff', label: 'Bàn giao' },
  { value: 'user.reset_password', label: 'Đặt lại mật khẩu' },
  { value: 'user.deactivate', label: 'Vô hiệu hóa' },
];
const ACTION_LABELS: Record<string, string> = { 'user.handoff': 'Bàn giao khách hàng', 'user.reset_password': 'Đặt lại mật khẩu', 'user.deactivate': 'Vô hiệu hóa' };

const { isOnline } = useMobile();
const logs = ref<AuditLog[]>([]);
const total = ref(0);
const limit = 50;
const offset = ref(0);
const action = ref('');
const state = ref<SettingsLoadState>('loading');
let seq = 0;

async function load() {
  const mine = ++seq;
  state.value = 'loading';
  try {
    const params: Record<string, string> = { limit: String(limit), offset: String(offset.value) };
    if (action.value) params.action = action.value;
    const { data } = await api.get('/audit-logs', { params });
    if (mine !== seq) return;
    logs.value = data.logs || [];
    total.value = data.total || 0;
    state.value = 'ready';
  } catch (err) {
    if (mine === seq) state.value = classifyLoadError(err, isOnline.value);
  }
}
function setAction(v: string) { action.value = v; offset.value = 0; void load(); }
function go(dir: 1 | -1) { offset.value = Math.max(0, offset.value + dir * limit); void load(); }
function detail(l: AuditLog): string {
  const d = l.details || {};
  return l.action === 'user.handoff' ? `Sang ${d.toName || '?'}: ${d.contacts ?? 0} khách, ${d.nicks ?? 0} nick, ${d.appointments ?? 0} lịch hẹn` : '';
}
function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
onMounted(() => { void load(); });
onScopeDispose(() => { seq++; });
</script>

<style scoped>
.crm-au { display: flex; flex-direction: column; gap: var(--m-space-3); color: var(--m-text); min-width: 0; }
.crm-au__chips { display: flex; gap: var(--m-space-2); overflow-x: auto; margin: 0 calc(var(--m-gutter) * -1); padding: 0 var(--m-gutter) var(--m-space-1); scrollbar-width: none; }
.crm-au__chip { flex: none; min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: 999px; background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; }
.crm-au__chip[aria-pressed='true'] { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-au__count { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-au__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-au__item { display: flex; flex-direction: column; gap: 2px; padding: var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); min-width: 0; }
.crm-au__act { font-weight: 650; }
.crm-au__line { font-size: var(--m-font-meta); overflow-wrap: anywhere; }
.crm-au__time { font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-au__pager { display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); }
.crm-au__btn { min-height: var(--m-touch); min-width: 96px; padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-au__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.crm-au__info { font-size: var(--m-font-meta); color: var(--m-muted); text-align: center; }
.crm-au__chip:focus-visible, .crm-au__btn:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
