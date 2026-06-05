<!--
  Broadcasts List View — Clone 1:1 pattern MucTieuListView (.mtl-*) → .mbl-*
  Đợt 1 2026-06-05. HS brand tokens, 10 cột, sticky thead, NO side panel.
-->
<template>
  <div class="mbl-page">
    <div class="container">
      <div class="crumb">
        <a href="#" @click.prevent="goto('/marketing')">Marketing</a>
        <span class="sep">/</span>
        <span class="current">Broadcasts</span>
      </div>

      <div class="topbar">
        <div class="left">
          <h1>📢 Broadcasts</h1>
          <p class="sub">Gửi tin nhắn hàng loạt cho tệp khách hàng theo nhiều cách</p>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" disabled title="Phase 2">📥 Nhập từ Excel</button>
          <button class="btn btn-primary" @click="goto('/marketing/broadcasts/tao-moi')">+ Tạo Broadcast mới</button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input class="search-input" v-model="searchText" placeholder="Tìm theo tên broadcast...">
        </div>
        <div class="chips">
          <span v-for="c in chips" :key="c.key" class="chip" :class="{ active: stateFilter === c.key }" @click="stateFilter = c.key">
            {{ c.label }} <span class="count">{{ chipCount(c.key) }}</span>
          </span>
        </div>
        <div class="filter-spacer"></div>
        <button class="btn btn-sm" @click="loadList">🔄 Cập nhật</button>
      </div>

      <div class="table-card">
        <table class="mb10">
          <thead>
            <tr>
              <th class="col-stt center">#</th>
              <th class="col-created">Ngày tạo</th>
              <th class="col-name">Broadcast</th>
              <th class="col-audience">Đối tượng</th>
              <th class="col-progress">Tiến độ</th>
              <th class="col-rate">Tỷ lệ thành công</th>
              <th class="col-reply right">Đã gửi</th>
              <th class="col-status">Trạng thái</th>
              <th class="col-schedule">Lịch gửi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && items.length === 0">
              <td colspan="9" class="empty-cell"><div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-desc">Đang tải…</div></div></td>
            </tr>
            <tr v-else-if="filtered.length === 0">
              <td colspan="9" class="empty-cell">
                <div class="empty-state">
                  <div class="empty-icon">📢</div>
                  <div class="empty-title">{{ searchText || stateFilter !== 'all' ? 'Không có broadcast khớp bộ lọc' : 'Chưa có broadcast nào' }}</div>
                  <div class="empty-desc">{{ searchText || stateFilter !== 'all' ? 'Thử bỏ filter' : 'Tạo broadcast đầu tiên để gửi tin hàng loạt' }}</div>
                  <button v-if="!searchText && stateFilter === 'all'" class="btn btn-primary" @click="goto('/marketing/broadcasts/tao-moi')">+ Tạo Broadcast đầu tiên</button>
                </div>
              </td>
            </tr>
            <tr v-for="(bc, idx) in filtered" :key="bc.id" @click="openDetail(bc.id)">
              <td class="center" style="color:var(--mbl-text-mute);">{{ idx + 1 }}</td>
              <td><div style="font-size:12px;">{{ fmtTime(bc.createdAt) }}</div><div style="font-size:10px;color:var(--mbl-text-3);">{{ fmtDate(bc.createdAt) }}</div></td>
              <td>
                <div class="row-name">{{ bc.name }}</div>
                <div class="row-sub">
                  <span class="aud-source-tag" :class="audClass(bc.segmentSpec.kind)">{{ audSourceLabel(bc.segmentSpec.kind) }}</span>
                </div>
              </td>
              <td><div style="font-size:12px;">{{ audDesc(bc) }}</div></td>
              <td>
                <div class="ph">
                  <div class="ph-head"><span class="ph-pct">{{ pct(bc.sentCount, bc.totalRecipients) }}%</span><span class="ph-frac">{{ bc.sentCount }}/{{ bc.totalRecipients }}</span></div>
                  <div class="ph-bar"><div class="ph-fill" :style="{ width: pct(bc.sentCount, bc.totalRecipients) + '%' }"></div></div>
                </div>
              </td>
              <td>
                <div class="ph" v-if="bc.sentCount > 0">
                  <div class="ph-head"><span class="ph-pct" style="color:var(--mbl-success);">{{ successPct(bc) }}%</span><span class="ph-frac">{{ bc.sentCount - bc.failedCount }}/{{ bc.sentCount }}</span></div>
                  <div class="ph-bar"><div class="ph-fill success" :style="{ width: successPct(bc) + '%' }"></div></div>
                </div>
                <span v-else style="color:var(--mbl-text-mute);font-size:11px;">—</span>
              </td>
              <td class="right">
                <div class="reply-num">{{ bc.sentCount }}</div>
                <div class="reply-sub" v-if="bc.failedCount > 0">{{ bc.failedCount }} lỗi</div>
              </td>
              <td><span class="status" :class="`s-${bc.state}`">{{ stateLabel(bc.state) }}</span></td>
              <td>
                <div class="sched-main">{{ scheduleLabel(bc) }}</div>
                <div class="sched-sub" v-if="bc.scheduledAt">{{ fmtTime(bc.scheduledAt) }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { listBroadcasts, type Broadcast, type BroadcastState } from '@/api/automation/broadcasts';

const router = useRouter();
const items = ref<Broadcast[]>([]);
const loading = ref(false);
const searchText = ref('');
const stateFilter = ref<'all' | BroadcastState>('all');

const chips: Array<{ key: 'all' | BroadcastState; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'running', label: '🟢 Đang chạy' },
  { key: 'paused', label: '⏸ Tạm dừng' },
  { key: 'completed', label: '✅ Hoàn tất' },
  { key: 'scheduled', label: '🟡 Hẹn lịch' },
  { key: 'draft', label: '📝 Nháp' },
];

const filtered = computed(() => {
  return items.value.filter((bc) => {
    if (stateFilter.value !== 'all' && bc.state !== stateFilter.value) return false;
    if (searchText.value) {
      const q = searchText.value.toLowerCase();
      if (!bc.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
});

function chipCount(key: 'all' | BroadcastState): number {
  if (key === 'all') return items.value.length;
  return items.value.filter((b) => b.state === key).length;
}

async function loadList() {
  loading.value = true;
  try { items.value = await listBroadcasts(); } finally { loading.value = false; }
}

function goto(path: string) { router.push(path); }
function openDetail(id: string) { router.push(`/marketing/broadcasts/${id}`); }
function fmtDate(s: string): string { const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function fmtTime(s: string): string { const d = new Date(s); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function pct(a: number, b: number): number { return b === 0 ? 0 : Math.round((a / b) * 100); }
function successPct(bc: Broadcast): number { return bc.sentCount === 0 ? 0 : Math.round(((bc.sentCount - bc.failedCount) / bc.sentCount) * 100); }
function stateLabel(s: BroadcastState): string { return ({ draft: '📝 Nháp', scheduled: '🟡 Hẹn lịch', running: '🟢 Đang chạy', paused: '⏸ Tạm dừng', completed: '✅ Hoàn tất', cancelled: '❌ Đã huỷ' } as any)[s] || s; }
function audClass(kind: string): string { return ({ manual: '', filter: 'filter', 'customer-list': 'file', tag: 'tag', 'preset-segment': 'preset' } as any)[kind] || ''; }
function audSourceLabel(kind: string): string { return ({ manual: '✋ Thủ công', filter: '🔧 Filter', 'customer-list': '📁 Tệp KH', tag: '🏷 Tag', 'preset-segment': '⚡ Pre-set' } as any)[kind] || kind; }
function audDesc(bc: Broadcast): string {
  const s = bc.segmentSpec as any;
  if (s.kind === 'customer-list') return `List #${(s.listId || '').slice(0, 8)}…`;
  if (s.kind === 'tag') return `${(s.tagIds || []).length} tag (${s.match || 'any'})`;
  if (s.kind === 'preset-segment') return s.presetKey;
  if (s.kind === 'manual') return `${(s.contactIds || []).length} KH`;
  return 'Filter tuỳ chỉnh';
}
function scheduleLabel(bc: Broadcast): string {
  if (bc.scheduleKind === 'now') return '⚡ Gửi ngay';
  if (bc.scheduleKind === 'scheduled') return '📅 Hẹn lịch';
  return '🔄 Định kỳ';
}

onMounted(() => { loadList(); });
</script>

<style scoped>
.mbl-page {
  --mbl-brand: #1786be;
  --mbl-brand-hover: #0f6fa0;
  --mbl-brand-soft: #e4f1f8;
  --mbl-ink: #141a24;
  --mbl-text-2: #475066;
  --mbl-text-3: #6b7488;
  --mbl-text-mute: #97a0b3;
  --mbl-line: #e7eaf0;
  --mbl-line-strong: #cdd4e0;
  --mbl-surface-2: #f7f9fc;
  --mbl-surface-3: #f1f4f9;
  --mbl-success: #12b76a;
  --mbl-success-soft: #e7f7ef;
  --mbl-warning-soft: #fdf3e2;
  --mbl-danger: #f04438;
  --mbl-danger-soft: #fdeceb;
  --mbl-purple: #6554c0;
  --mbl-purple-soft: #eae6ff;
  --mbl-shadow-1: 0 1px 2px rgba(20, 26, 36, 0.05);
  min-height: 100vh;
  background: var(--mbl-surface-2);
  padding: 24px;
  font-size: 13px;
  color: var(--mbl-ink);
}
.container { max-width: 1340px; margin: 0 auto; }
.crumb { font-size: 12px; color: var(--mbl-text-3); margin-bottom: 8px; }
.crumb a { color: var(--mbl-text-3); text-decoration: none; }
.crumb a:hover { color: var(--mbl-brand); }
.crumb .sep { margin: 0 6px; color: var(--mbl-text-mute); }
.crumb .current { color: var(--mbl-text-2); font-weight: 500; }
.topbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
.topbar .left { flex: 1; }
.topbar h1 { margin: 0 0 4px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.topbar .sub { margin: 0; font-size: 12px; color: var(--mbl-text-3); }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.btn { padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; border: 1px solid var(--mbl-line-strong); background: white; color: var(--mbl-ink); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.btn:hover { background: var(--mbl-surface-3); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--mbl-brand); color: white; border-color: var(--mbl-brand); }
.btn-primary:hover { background: var(--mbl-brand-hover); border-color: var(--mbl-brand-hover); }
.btn-ghost { background: transparent; border-color: var(--mbl-line); color: var(--mbl-text-2); }
.btn-sm { padding: 6px 10px; font-size: 12px; }
.filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--mbl-line); position: sticky; top: 0; z-index: 10; background: var(--mbl-surface-2); margin-bottom: 12px; }
.search-wrap { position: relative; width: 320px; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--mbl-text-3); font-size: 13px; }
.search-input { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid var(--mbl-line-strong); border-radius: 6px; font-size: 13px; background: white; }
.search-input:focus { outline: none; border-color: var(--mbl-brand); box-shadow: 0 0 0 3px rgba(23,134,190,0.15); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { padding: 6px 12px; border-radius: 14px; font-size: 12px; font-weight: 500; background: white; border: 1px solid var(--mbl-line); color: var(--mbl-text-2); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.chip:hover { background: var(--mbl-surface-3); }
.chip.active { background: var(--mbl-brand-soft); border-color: var(--mbl-brand); color: var(--mbl-brand); font-weight: 600; }
.chip .count { font-size: 11px; color: var(--mbl-text-3); background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 8px; }
.filter-spacer { flex: 1; }
.table-card { background: white; border: 1px solid var(--mbl-line); border-radius: 6px; box-shadow: var(--mbl-shadow-1); overflow: visible; }
.mb10 { width: 100%; border-collapse: collapse; font-size: 13px; }
.mb10 thead th { position: sticky; top: 0; z-index: 5; background: white; padding: 9px 9px; text-align: left; font-weight: 600; font-size: 12px; color: var(--mbl-text-3); text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid var(--mbl-line); white-space: nowrap; }
.mb10 tbody td { padding: 9px 9px; border-bottom: 1px solid var(--mbl-line); vertical-align: middle; }
.mb10 tbody tr { cursor: pointer; height: 56px; }
.mb10 tbody tr:hover { background: var(--mbl-surface-3); }
.row-name { font-weight: 600; color: var(--mbl-ink); margin-bottom: 2px; }
.row-sub { font-size: 11px; color: var(--mbl-text-3); }
.center { text-align: center; }
.right { text-align: right; }
.col-stt { width: 36px; }
.col-created { width: 96px; }
.col-name { width: 17%; }
.col-audience { width: 14%; }
.col-progress { width: 13%; }
.col-rate { width: 13%; }
.col-reply { width: 80px; }
.col-status { width: 110px; }
.col-schedule { width: 116px; }
.ph { display: flex; flex-direction: column; gap: 3px; }
.ph-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; }
.ph-pct { font-weight: 600; color: var(--mbl-ink); }
.ph-frac { font-size: 11px; color: var(--mbl-text-3); }
.ph-bar { height: 4px; background: var(--mbl-surface-3); border-radius: 2px; overflow: hidden; }
.ph-fill { height: 100%; background: var(--mbl-brand); border-radius: 2px; }
.ph-fill.success { background: var(--mbl-success); }
.reply-num { font-size: 14px; font-weight: 700; color: var(--mbl-ink); }
.reply-sub { font-size: 11px; color: var(--mbl-text-3); }
.sched-main { font-size: 12px; font-weight: 500; }
.sched-sub { font-size: 10px; color: var(--mbl-text-3); }
.status { padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; display: inline-block; }
.s-running { background: var(--mbl-success-soft); color: #157f3c; }
.s-scheduled { background: var(--mbl-warning-soft); color: #974f00; }
.s-paused { background: var(--mbl-surface-3); color: var(--mbl-text-2); }
.s-completed { background: var(--mbl-brand-soft); color: var(--mbl-brand); }
.s-draft { background: var(--mbl-surface-3); color: var(--mbl-text-3); }
.s-cancelled { background: var(--mbl-danger-soft); color: var(--mbl-danger); }
.aud-source-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: var(--mbl-surface-3); color: var(--mbl-text-2); border: 1px solid var(--mbl-line); }
.aud-source-tag.file { background: var(--mbl-brand-soft); color: var(--mbl-brand); }
.aud-source-tag.tag { background: var(--mbl-purple-soft); color: var(--mbl-purple); }
.aud-source-tag.preset { background: var(--mbl-warning-soft); color: #974f00; }
.aud-source-tag.filter { background: var(--mbl-success-soft); color: #157f3c; }
.empty-cell { padding: 0 !important; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; }
.empty-icon { font-size: 36px; }
.empty-title { font-size: 14px; font-weight: 600; }
.empty-desc { font-size: 13px; color: var(--mbl-text-3); text-align: center; margin-bottom: 8px; }
</style>
