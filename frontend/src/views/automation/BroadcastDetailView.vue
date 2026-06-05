<!--
  Broadcast Detail View — Clone pattern MucTieuDetailView (.mtd-*) → .mbd-*
  Tabs top horizontal, state-machine actions, 6 stats card, 2 phase card.
  Đợt 1 2026-06-05.
-->
<template>
  <div class="mbd-page">
    <div class="container" v-if="bc">
      <div class="crumb">
        <a href="#" @click.prevent="goto('/marketing')">Marketing</a>
        <span class="sep">/</span>
        <a href="#" @click.prevent="goto('/marketing/broadcasts')">Broadcasts</a>
        <span class="sep">/</span>
        <span class="current">{{ bc.name }}</span>
      </div>
      <a class="back-link" @click.prevent="goto('/marketing/broadcasts')">← Broadcasts</a>

      <div class="topbar">
        <div class="left">
          <h1>📢 {{ bc.name }} <span class="status" :class="`s-${bc.state}`">{{ stateLabel(bc.state) }}</span></h1>
          <p class="sub">Tạo lúc {{ fmtFull(bc.createdAt) }} bởi <strong>{{ bc.createdBy?.fullName || '—' }}</strong> · {{ bc.totalRecipients }} KH</p>
        </div>
        <div class="actions">
          <button v-if="bc.state === 'draft'" class="btn btn-primary" @click="onStart">▶ Kích hoạt</button>
          <button v-if="bc.state === 'draft'" class="btn btn-danger" @click="onDelete">🗑 Xoá</button>
          <button v-if="bc.state === 'running'" class="btn" @click="onPause">⏸ Tạm dừng</button>
          <button v-if="bc.state === 'paused'" class="btn btn-primary" @click="onResume">▶ Tiếp tục</button>
          <button v-if="['running','paused','scheduled'].includes(bc.state)" class="btn btn-danger" @click="onCancel">🛑 Kết thúc</button>
          <button class="btn" @click="loadBc">🔄</button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">📊 Tổng quan</button>
        <button class="tab" :class="{ active: tab === 'recipients' }" @click="tab = 'recipients'">📋 Người nhận <span class="tab-count">{{ bc.totalRecipients }}</span></button>
        <button class="tab" :class="{ active: tab === 'history' }" @click="tab = 'history'">📜 Lịch sử gửi</button>
      </div>

      <!-- Tab Tổng quan -->
      <div v-if="tab === 'overview'">
        <div v-if="bc.state === 'running'" class="eta-bar">
          <span class="eta-icon">⏱</span>
          <span>Đang gửi <strong>{{ bc.sentCount }}/{{ bc.totalRecipients }}</strong>
            · ETA <strong>~{{ etaText }}</strong>
            · Lỗi <strong>{{ bc.failedCount }}</strong>
          </span>
        </div>

        <div class="stats-row">
          <div class="stat-card accent-blue">
            <div class="stat-label">Tổng KH</div>
            <div class="stat-value">{{ bc.totalRecipients }}</div>
            <div class="stat-hint">Sau dedup + skip</div>
          </div>
          <div class="stat-card accent-teal">
            <div class="stat-label">Đã gửi</div>
            <div class="stat-value">{{ bc.sentCount }}</div>
            <div class="stat-hint">{{ pct(bc.sentCount, bc.totalRecipients) }}% tiến độ</div>
          </div>
          <div class="stat-card accent-green">
            <div class="stat-label">Thành công</div>
            <div class="stat-value">{{ bc.sentCount - bc.failedCount }}</div>
            <div class="stat-hint">{{ successPct }}% delivery rate</div>
          </div>
          <div class="stat-card accent-red">
            <div class="stat-label">Lỗi</div>
            <div class="stat-value">{{ bc.failedCount }}</div>
            <div class="stat-hint">{{ failPct }}% — chặn / lỗi nick</div>
          </div>
          <div class="stat-card accent-orange">
            <div class="stat-label">Chờ gửi</div>
            <div class="stat-value">{{ Math.max(0, bc.totalRecipients - bc.sentCount) }}</div>
            <div class="stat-hint">Trong queue</div>
          </div>
          <div class="stat-card accent-purple">
            <div class="stat-label">Đã giao</div>
            <div class="stat-value">{{ bc.deliveredCount }}</div>
            <div class="stat-hint">Zalo confirmed</div>
          </div>
        </div>

        <div class="phase-row">
          <div class="phase-card">
            <h4>🎯 Đối tượng</h4>
            <div class="phase-sub">{{ audSourceDesc }}</div>
            <pre class="seg-preview">{{ JSON.stringify(bc.segmentSpec, null, 2) }}</pre>
          </div>
          <div class="phase-card">
            <h4>📝 Nội dung</h4>
            <div class="phase-sub">Block: <strong>{{ bc.block?.name || '—' }}</strong></div>
            <div class="sample-card">{{ contentPreview }}</div>
          </div>
        </div>
      </div>

      <!-- Tab Recipients (placeholder Đợt 2) -->
      <div v-if="tab === 'recipients'" class="section">
        <div class="section-head"><h3>Người nhận</h3></div>
        <div class="empty-state-tab">📋 Bảng người nhận chi tiết — Đợt 2 ship</div>
      </div>

      <!-- Tab History (placeholder Đợt 2) -->
      <div v-if="tab === 'history'" class="section">
        <div class="section-head"><h3>Lịch sử gửi</h3></div>
        <div class="empty-state-tab">📜 Log sự kiện worker — Đợt 2 ship</div>
      </div>
    </div>

    <div v-else class="loading">
      <div v-if="loadError" class="empty-state-tab">⚠ {{ loadError }}</div>
      <div v-else>⏳ Đang tải...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getBroadcast, startBroadcast, pauseBroadcast, resumeBroadcast, cancelBroadcast, deleteBroadcast, type Broadcast, type BroadcastState } from '@/api/automation/broadcasts';

const route = useRoute();
const router = useRouter();
const bc = ref<Broadcast | null>(null);
const tab = ref<'overview' | 'recipients' | 'history'>('overview');
const loadError = ref('');

async function loadBc() {
  loadError.value = '';
  try {
    const id = route.params.id as string;
    bc.value = await getBroadcast(id);
  } catch (err: any) {
    loadError.value = err?.response?.data?.error || 'Không tải được broadcast';
  }
}

function goto(p: string) { router.push(p); }
function stateLabel(s: BroadcastState): string { return ({ draft: '📝 Nháp', scheduled: '🟡 Hẹn lịch', running: '🟢 Đang chạy', paused: '⏸ Tạm dừng', completed: '✅ Hoàn tất', cancelled: '❌ Đã huỷ' } as any)[s] || s; }
function fmtFull(s: string): string { const d = new Date(s); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
function pct(a: number, b: number): number { return b === 0 ? 0 : Math.round((a / b) * 100); }

const successPct = computed(() => bc.value && bc.value.sentCount > 0 ? Math.round(((bc.value.sentCount - bc.value.failedCount) / bc.value.sentCount) * 100) : 0);
const failPct = computed(() => bc.value && bc.value.sentCount > 0 ? Math.round((bc.value.failedCount / bc.value.sentCount) * 100) : 0);

const etaText = computed(() => {
  if (!bc.value || bc.value.sentCount === 0 || !bc.value.startedAt) return '—';
  const remaining = bc.value.totalRecipients - bc.value.sentCount;
  if (remaining <= 0) return 'Hoàn tất';
  const elapsedMs = Date.now() - new Date(bc.value.startedAt).getTime();
  const msPerKH = elapsedMs / bc.value.sentCount;
  const remainingMs = remaining * msPerKH;
  const min = Math.round(remainingMs / 60000);
  return min < 60 ? `${min} phút` : `${Math.floor(min/60)}h${min%60}m`;
});

const audSourceDesc = computed(() => {
  if (!bc.value) return '';
  const s = bc.value.segmentSpec as any;
  const lookup: Record<string, string> = {
    manual: `✋ Thủ công · ${(s.contactIds || []).length} KH`,
    'customer-list': `📁 Tệp KH (#${(s.listId || '').slice(0, 8)}…)`,
    tag: `🏷 Tag CRM (${(s.tagIds || []).length} tag, match=${s.match || 'any'})`,
    'preset-segment': `⚡ Pre-set: ${s.presetKey}`,
    filter: '🔧 Filter tuỳ chỉnh',
  };
  return lookup[s.kind] || s.kind;
});

const contentPreview = computed(() => {
  if (!bc.value?.block) return '—';
  const c = bc.value.block.content as any;
  const tv = c?.textVariants;
  if (Array.isArray(tv) && tv.length > 0) return tv[0].slice(0, 200);
  return '—';
});

async function onStart() {
  if (!confirm('Bắt đầu gửi broadcast?')) return;
  try { await startBroadcast(bc.value!.id); await loadBc(); } catch (e: any) { alert(e?.response?.data?.error || 'Lỗi'); }
}
async function onPause() { if (!confirm('Tạm dừng?')) return; await pauseBroadcast(bc.value!.id); await loadBc(); }
async function onResume() { if (!confirm('Tiếp tục?')) return; await resumeBroadcast(bc.value!.id); await loadBc(); }
async function onCancel() { if (!confirm('Huỷ broadcast? KHÔNG thể undo.')) return; await cancelBroadcast(bc.value!.id); await loadBc(); }
async function onDelete() { if (!confirm('Xoá draft?')) return; await deleteBroadcast(bc.value!.id); router.push('/marketing/broadcasts'); }

onMounted(() => { loadBc(); });
</script>

<style scoped>
.mbd-page {
  --mbd-brand: #1786be;
  --mbd-brand-soft: #e4f1f8;
  --mbd-ink: #141a24;
  --mbd-text-2: #475066;
  --mbd-text-3: #6b7488;
  --mbd-text-mute: #97a0b3;
  --mbd-line: #e7eaf0;
  --mbd-line-strong: #cdd4e0;
  --mbd-surface: #ffffff;
  --mbd-surface-2: #f7f9fc;
  --mbd-surface-3: #f1f4f9;
  --mbd-success: #12b76a;
  --mbd-success-soft: #e7f7ef;
  --mbd-warning-soft: #fdf3e2;
  --mbd-danger: #f04438;
  --mbd-danger-soft: #fdeceb;
  --mbd-purple: #6554c0;
  --mbd-shadow-1: 0 1px 2px rgba(20, 26, 36, 0.05);
  min-height: 100vh;
  background: var(--mbd-surface-2);
  padding: 24px;
  font-size: 13px;
  color: var(--mbd-ink);
}
.container { max-width: 1340px; margin: 0 auto; }
.crumb { font-size: 12px; color: var(--mbd-text-3); margin-bottom: 4px; }
.crumb a { color: var(--mbd-text-3); text-decoration: none; }
.crumb .sep { margin: 0 6px; color: var(--mbd-text-mute); }
.crumb .current { color: var(--mbd-text-2); font-weight: 500; }
.back-link { font-size: 12px; color: var(--mbd-text-3); cursor: pointer; display: inline-block; margin-bottom: 8px; }
.back-link:hover { color: var(--mbd-brand); }

.topbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
.topbar .left { flex: 1; min-width: 0; }
.topbar h1 { margin: 0 0 4px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
.topbar .sub { margin: 0; font-size: 12px; color: var(--mbd-text-3); }
.actions { display: flex; gap: 8px; flex-shrink: 0; }

.btn { padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; border: 1px solid var(--mbd-line-strong); background: white; color: var(--mbd-ink); cursor: pointer; }
.btn:hover { background: var(--mbd-surface-3); }
.btn-primary { background: var(--mbd-brand); color: white; border-color: var(--mbd-brand); }
.btn-danger { background: var(--mbd-danger); color: white; border-color: var(--mbd-danger); }

.status { padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.s-running { background: var(--mbd-success-soft); color: #157f3c; }
.s-scheduled { background: var(--mbd-warning-soft); color: #974f00; }
.s-paused { background: var(--mbd-surface-3); color: var(--mbd-text-2); }
.s-completed { background: var(--mbd-brand-soft); color: var(--mbd-brand); }
.s-draft { background: var(--mbd-surface-3); color: var(--mbd-text-3); }
.s-cancelled { background: var(--mbd-danger-soft); color: var(--mbd-danger); }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--mbd-line); margin-top: 14px; margin-bottom: 18px; padding: 0 2px; }
.tab { padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; font-size: 13px; font-weight: 600; color: var(--mbd-text-3); cursor: pointer; }
.tab:hover { color: var(--mbd-text-2); }
.tab.active { color: var(--mbd-brand); border-bottom-color: var(--mbd-brand); }
.tab-count { margin-left: 4px; font-size: 11px; color: var(--mbd-text-3); font-weight: 400; }

.eta-bar { background: linear-gradient(90deg, #e4f1f8 0%, #f4f5f7 100%); border: 1px solid #bbddff; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
.eta-bar strong { color: var(--mbd-brand); }

.stats-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 16px; }
.stat-card { background: white; border: 1px solid var(--mbd-line); border-top: 3px solid var(--mbd-brand); border-radius: 6px; box-shadow: var(--mbd-shadow-1); padding: 12px 14px; }
.stat-card.accent-blue { border-top-color: var(--mbd-brand); }
.stat-card.accent-green { border-top-color: var(--mbd-success); }
.stat-card.accent-orange { border-top-color: #f5a524; }
.stat-card.accent-teal { border-top-color: #00b8d9; }
.stat-card.accent-purple { border-top-color: var(--mbd-purple); }
.stat-card.accent-red { border-top-color: var(--mbd-danger); }
.stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mbd-text-3); margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.stat-hint { font-size: 11px; color: var(--mbd-text-3); margin-top: 4px; }

.phase-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.phase-card { background: white; border: 1px solid var(--mbd-line); border-radius: 6px; box-shadow: var(--mbd-shadow-1); padding: 14px 16px; }
.phase-card h4 { margin: 0 0 10px 0; font-size: 13px; font-weight: 600; }
.phase-sub { font-size: 12px; color: var(--mbd-text-3); margin-bottom: 12px; }
.seg-preview { background: var(--mbd-surface-3); padding: 10px; border-radius: 4px; font-size: 11px; font-family: 'Monaco', monospace; overflow-x: auto; margin: 0; }
.sample-card { background: var(--mbd-surface-3); padding: 10px 12px; border-radius: 4px; font-size: 12px; line-height: 1.5; }

.section { background: white; border: 1px solid var(--mbd-line); border-radius: 6px; box-shadow: var(--mbd-shadow-1); overflow: hidden; }
.section-head { padding: 12px 16px; border-bottom: 1px solid var(--mbd-line); }
.section-head h3 { margin: 0; font-size: 14px; font-weight: 700; }
.empty-state-tab { padding: 60px 20px; text-align: center; color: var(--mbd-text-3); font-size: 14px; }
.loading { padding: 80px; text-align: center; color: var(--mbd-text-3); }
</style>
