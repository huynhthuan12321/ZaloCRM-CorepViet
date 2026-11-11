<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  BroadcastDetailDrawer — chi tiết 1 Broadcast (Community). 4 tab:
  Tổng quan · Người nhận (filter/search/pagination) · Lịch sử chạy · Cài đặt.
  Chỉ đọc + pause/resume/retry — KHÔNG sửa audience snapshot của run đang chạy.
  Backend: GET /broadcast-jobs/:id (kèm runs) · GET .../runs/:runId/items · PATCH · retry-failed.
-->
<template>
  <div class="bd-overlay" @click.self="$emit('close')">
    <div class="bd-drawer">
      <div class="bd-head">
        <div>
          <b>{{ job?.name ?? 'Broadcast' }}</b>
          <span v-if="job" class="bd-badge" :class="'b-' + job.status">{{ statusLabel(job.status) }}</span>
        </div>
        <button class="btn-x" @click="$emit('close')"><v-icon size="18">mdi-close</v-icon></button>
      </div>

      <div class="bd-tabs">
        <button v-for="t in TABS" :key="t.key" class="bd-tab" :class="{ on: tab === t.key }" @click="setTab(t.key)">{{ t.label }}</button>
      </div>

      <div v-if="loading" class="bd-empty">Đang tải…</div>
      <div v-else-if="!job" class="bd-empty">Không tải được broadcast.</div>

      <!-- ===== Tab Tổng quan ===== -->
      <div v-else-if="tab === 'overview'" class="bd-body">
        <div class="bd-kpis">
          <div class="bd-kpi"><div class="v">{{ agg.total.toLocaleString('vi-VN') }}</div><div class="l">Tổng (snapshot)</div></div>
          <div class="bd-kpi ok"><div class="v">{{ agg.sent.toLocaleString('vi-VN') }}</div><div class="l">Đã gửi</div></div>
          <div class="bd-kpi err"><div class="v">{{ agg.failed.toLocaleString('vi-VN') }}</div><div class="l">Lỗi</div></div>
          <div class="bd-kpi skip"><div class="v">{{ agg.skipped.toLocaleString('vi-VN') }}</div><div class="l">Bỏ qua</div></div>
          <div class="bd-kpi"><div class="v">{{ agg.queued.toLocaleString('vi-VN') }}</div><div class="l">Chờ gửi</div></div>
        </div>
        <div v-if="agg.total > 0" class="bd-progress"><div class="bar" :style="{ width: progressPct + '%' }"></div></div>
        <div class="bd-info">
          <div><span>Nguồn</span><b v-if="job.sourceType === 'friends'">Bạn bè đã kết bạn của nick</b><b v-else>{{ job.list?.name ?? 'Tệp đã xoá' }}</b></div>
          <div><span>Nick gửi</span><b>{{ job.nick?.displayName ?? job.nick?.phone ?? '—' }} <em v-if="job.nick && job.nick.status !== 'connected'">(mất kết nối)</em></b></div>
          <div><span>Lịch</span><b>{{ scheduleLabel(job) }}</b></div>
          <div><span>Lần chạy tới</span><b>{{ fmtDate(job.nextRunAt) }}</b></div>
          <div><span>Tốc độ</span><b>{{ job.maxPerRun }} tin/lần · {{ job.delaySecMin }}-{{ job.delaySecMax }}s</b></div>
          <div><span>Tạo lúc</span><b>{{ fmtDate(job.createdAt) }}</b></div>
        </div>
      </div>

      <!-- ===== Tab Người nhận ===== -->
      <div v-else-if="tab === 'recipients'" class="bd-body">
        <div class="bd-toolbar">
          <select v-model="selectedRunId" class="f-input sm" @change="loadItems">
            <option v-for="r in job.runs" :key="r.id" :value="r.id">Run {{ fmtDate(r.startedAt) }} ({{ r.status }})</option>
            <option v-if="job.runs.length === 0" value="">Chưa có run</option>
          </select>
          <select v-model="statusFilter" class="f-input sm">
            <option value="">Mọi trạng thái</option>
            <option value="queued">Chờ gửi</option><option value="sent">Đã gửi</option>
            <option value="failed">Lỗi</option><option value="skipped">Bỏ qua</option>
          </select>
          <input v-model="search" class="f-input sm" placeholder="Tìm tên/SĐT…" />
        </div>
        <table class="bd-table">
          <thead><tr><th>#</th><th>Tên</th><th>SĐT</th><th>Trạng thái</th><th>Lý do / lỗi</th><th>Lúc</th></tr></thead>
          <tbody>
            <tr v-for="(it, i) in pagedItems" :key="it.id">
              <td class="num">{{ (page - 1) * PAGE_SIZE + i + 1 }}</td>
              <td>{{ it.name ?? '—' }}</td>
              <td class="num">{{ it.phone ?? '—' }}</td>
              <td><span class="run-badge" :class="'r-' + it.status">{{ itemStatusLabel(it.status) }}</span></td>
              <td class="err">{{ it.error ?? '' }}</td>
              <td class="num">{{ fmtDate(it.createdAt) }}</td>
            </tr>
            <tr v-if="filteredItems.length === 0"><td colspan="6" class="bd-empty">Không có người nhận nào.</td></tr>
          </tbody>
        </table>
        <div v-if="totalPages > 1" class="bd-pager">
          <button class="btn btn-ghost btn-sm" :disabled="page === 1" @click="page--">←</button>
          <span>Trang {{ page }}/{{ totalPages }} · {{ filteredItems.length }} dòng</span>
          <button class="btn btn-ghost btn-sm" :disabled="page === totalPages" @click="page++">→</button>
        </div>
      </div>

      <!-- ===== Tab Lịch sử chạy ===== -->
      <div v-else-if="tab === 'runs'" class="bd-body">
        <div v-if="job.runs.length === 0" class="bd-empty">Chưa có lần chạy nào.</div>
        <div v-for="r in job.runs" :key="r.id" class="bd-run-card">
          <div class="bd-run-top">
            <span class="run-badge" :class="'r-' + r.status">{{ runStatusLabel(r.status) }}</span>
            <span class="bd-run-time">{{ fmtDate(r.startedAt) }} → {{ r.endedAt ? fmtDate(r.endedAt) : 'đang chạy' }}</span>
          </div>
          <div class="bd-run-sum">
            <template v-if="r.queuedCount">📋 {{ r.sentCount + r.failedCount + r.skippedCount }}/{{ r.queuedCount }} · </template>
            ✅ {{ r.sentCount }} gửi · ❌ {{ r.failedCount }} lỗi · ⏭ {{ r.skippedCount }} bỏ qua
          </div>
          <div class="bd-run-act">
            <button class="btn-link" @click="viewRun(r.id)">Xem người nhận</button>
            <button v-if="r.status !== 'running' && r.failedCount > 0" class="btn-link" :disabled="retrying" @click="retry(r.id, r.failedCount)">
              Gửi lại {{ r.failedCount }} tin lỗi
            </button>
          </div>
        </div>
      </div>

      <!-- ===== Tab Cài đặt ===== -->
      <div v-else class="bd-body">
        <div class="bd-setting">
          <div class="bd-set-row">
            <div><b>Trạng thái gửi</b><div class="f-hint">Tạm dừng để worker ngừng lấy job; tiếp tục để chạy lại theo lịch.</div></div>
            <div>
              <button v-if="job.status === 'active'" class="btn btn-ghost btn-sm" @click="setStatus('paused')"><v-icon size="15">mdi-pause</v-icon> Tạm dừng</button>
              <button v-else-if="job.status === 'paused'" class="btn btn-primary btn-sm" :disabled="dryRun" @click="setStatus('active')">
                <v-icon size="15">mdi-play</v-icon> {{ dryRun ? 'Tiếp tục (khoá — dry-run)' : 'Tiếp tục' }}
              </button>
              <span v-else class="f-hint">Đã xong</span>
            </div>
          </div>
          <div class="bd-set-row">
            <div><b>Gửi lại tin lỗi (run gần nhất)</b><div class="f-hint">Tạo run mới CHỈ gồm item lỗi — không retry vô hạn, vẫn qua giãn cách + trần tin/ngày.</div></div>
            <button v-if="latestRun && latestRun.failedCount > 0 && latestRun.status !== 'running'" class="btn btn-ghost btn-sm" :disabled="retrying" @click="retry(latestRun.id, latestRun.failedCount)">
              <v-icon size="15">mdi-restart</v-icon> {{ retrying ? 'Đang tạo…' : `Gửi lại ${latestRun.failedCount}` }}
            </button>
            <span v-else class="f-hint">Không có tin lỗi</span>
          </div>
          <div class="f-note" style="margin-top:10px"><v-icon size="15">mdi-lock-outline</v-icon> Audience snapshot của run đang chạy KHÔNG được sửa — sửa tệp nguồn không đổi danh sách đang gửi.</div>
          <div v-if="dryRun" class="f-note" style="margin-top:6px"><v-icon size="15">mdi-shield-check-outline</v-icon> Dry-run đang bật — không gửi Zalo thật; nút kích hoạt thật bị khoá.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';

const props = defineProps<{ jobId: string; dryRun: boolean }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { push: toast } = useToast();
const { confirm } = useConfirm();

const PAGE_SIZE = 50;
const TABS = [
  { key: 'overview', label: 'Tổng quan' }, { key: 'recipients', label: 'Người nhận' },
  { key: 'runs', label: 'Lịch sử chạy' }, { key: 'settings', label: 'Cài đặt' },
];

interface RunRow { id: string; status: string; startedAt: string; endedAt: string | null; sentCount: number; failedCount: number; skippedCount: number; queuedCount: number }
interface JobDetail {
  id: string; name: string; status: string; sourceType: 'customer_list' | 'friends';
  scheduleType: 'once' | 'daily' | 'weekly'; scheduledAt: string | null; timeOfDay: string | null; daysOfWeek: number[];
  nextRunAt: string | null; createdAt: string; maxPerRun: number; delaySecMin: number; delaySecMax: number;
  list?: { id: string; name: string } | null; nick?: { id: string; displayName: string | null; phone: string | null; status: string } | null;
  runs: RunRow[];
}
interface ItemRow { id: string; name: string | null; phone: string | null; status: string; error: string | null; createdAt: string }

const job = ref<JobDetail | null>(null);
const loading = ref(true);
const tab = ref('overview');
const items = ref<ItemRow[]>([]);
const selectedRunId = ref('');
const statusFilter = ref('');
const search = ref('');
const page = ref(1);
const retrying = ref(false);

const latestRun = computed(() => job.value?.runs[0] ?? null);
const agg = computed(() => {
  const r = latestRun.value;
  return { total: r?.queuedCount ?? 0, sent: r?.sentCount ?? 0, failed: r?.failedCount ?? 0, skipped: r?.skippedCount ?? 0, queued: Math.max(0, (r?.queuedCount ?? 0) - (r?.sentCount ?? 0) - (r?.failedCount ?? 0) - (r?.skippedCount ?? 0)) };
});
const progressPct = computed(() => agg.value.total > 0 ? Math.round(((agg.value.sent + agg.value.failed + agg.value.skipped) / agg.value.total) * 100) : 0);

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase();
  return items.value.filter((it) => {
    if (statusFilter.value && it.status !== statusFilter.value) return false;
    if (q && !((it.name ?? '').toLowerCase().includes(q) || (it.phone ?? '').includes(q))) return false;
    return true;
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / PAGE_SIZE)));
const pagedItems = computed(() => filteredItems.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

async function loadJob(): Promise<void> {
  loading.value = true;
  try {
    const res = await api.get(`/broadcast-jobs/${props.jobId}`);
    // GET :id trả job kèm runs; đính list/nick từ danh sách (không có trong detail) — lấy tối thiểu.
    const j = res.data.job;
    job.value = { ...j, runs: j.runs ?? [] };
    selectedRunId.value = job.value?.runs[0]?.id ?? '';
  } catch { job.value = null; } finally { loading.value = false; }
}
async function loadItems(): Promise<void> {
  if (!selectedRunId.value) { items.value = []; return; }
  page.value = 1;
  try {
    const res = await api.get(`/broadcast-jobs/${props.jobId}/runs/${selectedRunId.value}/items`);
    items.value = res.data.items ?? [];
  } catch { items.value = []; }
}
async function setTab(k: string): Promise<void> {
  tab.value = k;
  if (k === 'recipients' && items.value.length === 0 && selectedRunId.value) await loadItems();
}
function viewRun(runId: string): void { selectedRunId.value = runId; tab.value = 'recipients'; void loadItems(); }

async function setStatus(status: 'active' | 'paused'): Promise<void> {
  if (status === 'active' && props.dryRun) return void toast('Dry-run đang bật — không kích hoạt gửi thật.', 'error');
  await api.patch(`/broadcast-jobs/${props.jobId}`, { status });
  await loadJob(); emit('changed');
}
async function retry(runId: string, failedCount: number): Promise<void> {
  if (!(await confirm({ title: 'Gửi lại tin lỗi?', message: `Tạo run mới gửi lại ${failedCount} tin lỗi (worker ~30s, vẫn qua giãn cách + trần tin/ngày).`, confirmText: 'Gửi lại' }))) return;
  retrying.value = true;
  try {
    await api.post(`/broadcast-jobs/${props.jobId}/runs/${runId}/retry-failed`);
    toast('Đã tạo run gửi lại tin lỗi', 'success');
    await loadJob(); emit('changed');
  } catch (err: any) {
    toast(`Lỗi: ${err?.response?.data?.error ?? 'không tạo được'}`, 'error');
  } finally { retrying.value = false; }
}

function statusLabel(s: string): string { return s === 'active' ? 'Đang hoạt động' : s === 'paused' ? 'Tạm dừng' : 'Đã xong'; }
function runStatusLabel(s: string): string { return s === 'running' ? 'Đang chạy' : s === 'done' ? 'Hoàn tất' : s === 'error' ? 'Lỗi' : s; }
function itemStatusLabel(s: string): string { return s === 'queued' ? 'Chờ gửi' : s === 'sending' ? 'Đang gửi' : s === 'sent' ? 'Đã gửi' : s === 'failed' ? 'Lỗi' : 'Bỏ qua'; }
function scheduleLabel(j: JobDetail): string {
  if (j.scheduleType === 'once') return `1 lần — ${fmtDate(j.scheduledAt)}`;
  if (j.scheduleType === 'daily') return `Hàng ngày ${j.timeOfDay}`;
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `Hàng tuần ${j.daysOfWeek.map((d) => names[d]).join(', ')} lúc ${j.timeOfDay}`;
}
function fmtDate(d: string | null): string { return d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

onMounted(loadJob);
</script>

<style scoped>
.bd-overlay { position: fixed; inset: 0; background: rgba(20, 20, 30, 0.45); display: flex; justify-content: flex-end; z-index: 1001; }
.bd-drawer { background: var(--surface, #fff); width: 640px; max-width: 100vw; height: 100%; display: flex; flex-direction: column; box-shadow: -4px 0 20px rgba(0,0,0,.15); }
.bd-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border, #e5e4e7); }
.bd-badge { font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; margin-left: 8px; }
.b-active { background: #e1f5e9; color: #1b7a3d; } .b-paused { background: #fdf3d7; color: #8a6d00; } .b-done { background: #ececf0; color: #555; }
.btn-x { background: none; border: none; cursor: pointer; padding: 2px; }
.bd-tabs { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--border, #e5e4e7); }
.bd-tab { border: none; background: none; padding: 10px 14px; font-size: 13px; cursor: pointer; color: #777; border-bottom: 2px solid transparent; }
.bd-tab.on { color: #0e445a; border-color: #0e445a; font-weight: 700; }
.bd-body { padding: 16px 18px; overflow: auto; flex: 1; }
.bd-empty { text-align: center; color: var(--text-secondary, #888); padding: 32px 0; }
.bd-kpis { display: flex; gap: 8px; flex-wrap: wrap; }
.bd-kpi { flex: 1; min-width: 84px; border: 1px solid var(--border, #e5e4e7); border-radius: 8px; padding: 10px; text-align: center; }
.bd-kpi .v { font-size: 20px; font-weight: 700; } .bd-kpi .l { font-size: 11.5px; color: #888; }
.bd-kpi.ok .v { color: #1b7a3d; } .bd-kpi.err .v { color: #a12318; } .bd-kpi.skip .v { color: #8a6d00; }
.bd-progress { height: 8px; background: #ececf0; border-radius: 99px; margin: 10px 0; overflow: hidden; }
.bd-progress .bar { height: 100%; background: #1b7a3d; }
.bd-info { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; font-size: 13px; }
.bd-info > div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #f0f0f2; padding-bottom: 5px; }
.bd-info span { color: #888; } .bd-info em { color: #a12318; font-style: normal; }
.bd-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.f-input { border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 6px 10px; font-size: 13px; background: var(--surface, #fff); color: inherit; }
.f-input.sm { flex: 1; min-width: 0; }
.bd-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.bd-table th, .bd-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border, #eee); }
.num { font-variant-numeric: tabular-nums; }
.err { color: #a12318; font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-badge { font-size: 11px; padding: 1px 7px; border-radius: 99px; font-weight: 600; }
.r-running { background: #dcedff; color: #135ba1; } .r-done, .r-sent { background: #e1f5e9; color: #1b7a3d; }
.r-error, .r-failed { background: #fde3e1; color: #a12318; } .r-skipped, .r-queued { background: #ececf0; color: #555; }
.bd-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 10px; font-size: 12.5px; color: #777; }
.bd-run-card { border: 1px solid var(--border, #e5e4e7); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.bd-run-top { display: flex; align-items: center; gap: 8px; }
.bd-run-time { font-size: 12px; color: #888; }
.bd-run-sum { font-size: 12.5px; margin: 6px 0; }
.bd-run-act { display: flex; gap: 12px; }
.btn-link { background: none; border: none; color: #135ba1; cursor: pointer; font-size: 12.5px; text-decoration: underline; padding: 0; }
.btn-link:disabled { color: #aaa; cursor: default; }
.bd-setting { display: flex; flex-direction: column; gap: 10px; }
.bd-set-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid var(--border, #e5e4e7); border-radius: 8px; padding: 10px 12px; }
.f-hint { font-size: 11.5px; color: #888; }
.f-note { font-size: 12.5px; color: #555; background: #f0f7f3; border: 1px solid #d3e8dd; border-radius: 8px; padding: 8px 10px; }
</style>
