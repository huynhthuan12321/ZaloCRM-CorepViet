<template>
  <div class="lists-view">
    <header class="at-page-header">
      <div>
        <h1 class="at-page-title">📂 Tệp khách hàng</h1>
        <p class="at-page-subtitle">
          Paste / Excel / Lead Ads (FB · TikTok · Google · Zalo) đổ về tệp tự động theo <b>#mã</b> trong tên chiến dịch.
          Tệp KH làm <b>audience source</b> cho Sequence / Broadcast / Campaign.
        </p>
      </div>
      <button class="at-btn at-btn--primary" @click="showCreate = true">
        <v-icon size="18">mdi-plus</v-icon>
        Tạo tệp mới
      </button>
    </header>

    <!-- Phase Multi-Source Lead Ads 2026-05-27 — Stats row -->
    <div class="stats-row">
      <button class="stat-card" :class="{ active: platformFilter === 'all' }" @click="onPlatformFilter('all')">
        <div class="stat-num">{{ stats.totalLists.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">Tổng tệp</div>
      </button>
      <button class="stat-card" :class="{ active: platformFilter === 'leadads' }" @click="onPlatformFilter('leadads')">
        <div class="stat-num">{{ stats.leadAdsLists.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">📣 Lead Ads</div>
      </button>
      <button class="stat-card" :class="{ active: platformFilter === 'paste' }" @click="onPlatformFilter('paste')">
        <div class="stat-num">{{ stats.pasteLists.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">📋 Paste / File</div>
      </button>
      <div class="stat-card stat-card-readonly">
        <div class="stat-num">{{ stats.totalEntries.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">SĐT trong các tệp</div>
      </div>
      <div class="stat-card stat-card-readonly">
        <div class="stat-num">{{ stats.totalHasZalo.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">SĐT có Zalo</div>
      </div>
    </div>

    <!-- Status tabs: Đang dùng / Lưu trữ -->
    <div class="status-tabs">
      <button
        class="status-tab"
        :class="{ active: listsStatus === 'active' }"
        @click="onSwitchStatus('active')"
      >
        <v-icon size="16">mdi-folder-account-outline</v-icon>
        Đang dùng
        <span class="count">{{ listsStatus === 'active' ? listsTotal : '' }}</span>
      </button>
      <button
        class="status-tab"
        :class="{ active: listsStatus === 'archived' }"
        @click="onSwitchStatus('archived')"
      >
        <v-icon size="16">mdi-archive-outline</v-icon>
        Lưu trữ
        <span class="count">{{ listsStatus === 'archived' ? listsTotal : '' }}</span>
      </button>
      <button
        class="status-tab"
        :class="{ active: listsStatus === 'all' }"
        @click="onSwitchStatus('all')"
      >
        <v-icon size="16">mdi-view-list</v-icon>
        Tất cả
      </button>
      <div class="spacer"></div>
      <div class="search">
        <v-icon size="14">mdi-magnify</v-icon>
        <input
          v-model="listsSearch"
          placeholder="Tìm tên tệp..."
          @input="debouncedFetch"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loadingLists && lists.length === 0" class="empty-state">
      <div class="empty-icon">📂</div>
      <h3 v-if="listsStatus === 'archived'">Chưa có tệp nào lưu trữ</h3>
      <h3 v-else>Chưa có tệp khách hàng nào</h3>
      <p v-if="listsStatus === 'active'">
        Bấm "Tạo tệp mới" để paste/upload danh sách SĐT đầu tiên.
      </p>
      <p v-else-if="listsStatus === 'archived'">
        Tệp lưu trữ sẽ xuất hiện ở đây sau khi anh bấm "Lưu trữ" trên 1 tệp đang dùng.
      </p>
    </div>

    <!-- Lists table -->
    <div v-else class="lists-table-wrap">
      <table class="lists-table">
        <thead>
          <tr>
            <th>Tên tệp</th>
            <th>Nguồn</th>
            <th>Mã đồng bộ</th>
            <th>Chia sẻ</th>
            <th>Ngày tạo</th>
            <th class="right">Tổng</th>
            <th class="right">Hợp lệ</th>
            <th class="right">Trùng</th>
            <th class="right">Có Zalo</th>
            <th>Tiến độ</th>
            <th>Trạng thái</th>
            <th class="right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="list in filteredLists"
            :key="list.id"
            class="row-clickable"
            @click="goToDetail(list.id)"
          >
            <td>
              <div class="list-name-cell">
                <span class="icon-em">{{ list.iconEmoji || '📂' }}</span>
                <div>
                  <div class="nm">{{ list.name }}</div>
                  <div class="sub">{{ list.totalEntries.toLocaleString('vi-VN') }} SĐT · {{ list.createdBy?.fullName ?? list.createdBy?.email ?? '—' }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="source-chip" :class="sourceClass(list.sourceType)">{{ sourceLabel(list.sourceType) }}</span>
            </td>
            <td>
              <span v-if="list.integrationKey === '__UNROUTED__'" class="key-chip unrouted" title="Lead chảy về tệp này vì không khớp #mã nào — anh nên đổi tên chiến dịch hoặc tạo tệp mới có mã đó.">
                🚨 UNROUTED
              </span>
              <span v-else-if="list.integrationKey" class="key-chip" :title="`Đặt tên chiến dịch FB/TikTok kèm #${list.integrationKey} để lead chảy về tệp này`">
                #{{ list.integrationKey }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <span v-if="list.shareableToPool" class="share-chip" title="Tệp này đã chia sẻ vào Lead Pool — sale có quyền có thể nhận lead">
                <v-icon size="11">mdi-account-multiple</v-icon> Pool
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="date">{{ formatDate(list.createdAt) }}</td>
            <td class="num-cell">{{ list.totalEntries.toLocaleString('vi-VN') }}</td>
            <td class="num-cell green">{{ list.validEntries.toLocaleString('vi-VN') }}</td>
            <td class="num-cell" :class="dupTotal(list) > 0 ? 'amber' : 'muted'">{{ dupTotal(list).toLocaleString('vi-VN') }}</td>
            <td class="num-cell" :class="list.hasZaloEntries > 0 ? 'blue' : 'muted'">
              <template v-if="list.status === 'processing' && list.pendingLookupEntries > 0">
                <span class="muted">— /{{ list.validEntries.toLocaleString('vi-VN') }}</span>
              </template>
              <template v-else>
                {{ list.hasZaloEntries.toLocaleString('vi-VN') }}
              </template>
            </td>
            <td class="progress-cell">
              <div class="progress-bar" :title="`Hợp lệ ${progressPct(list, 'valid')}% · Lỗi ${progressPct(list, 'invalid')}% · Trùng ${progressPct(list, 'dup')}%`">
                <i class="ok" :style="{ width: progressPct(list, 'valid') + '%' }"></i>
                <i class="warn" :style="{ width: progressPct(list, 'dup') + '%' }"></i>
                <i class="bad" :style="{ width: progressPct(list, 'invalid') + '%' }"></i>
              </div>
            </td>
            <td>
              <span v-if="list.status === 'processing'" class="status-chip processing">
                <v-icon size="12">mdi-progress-clock</v-icon> Đang quét
              </span>
              <span v-else-if="list.status === 'archived'" class="status-chip archived">
                <v-icon size="12">mdi-archive</v-icon> Lưu trữ
              </span>
              <span v-else class="status-chip done">
                <v-icon size="12">mdi-check-circle</v-icon> Hoàn tất
              </span>
            </td>
            <td class="row-actions" @click.stop>
              <button class="icon-btn" title="Tạo campaign từ tệp này">
                <v-icon size="14">mdi-send</v-icon>
              </button>
              <button class="icon-btn" title="Export CSV">
                <v-icon size="14">mdi-download</v-icon>
              </button>
              <v-menu :close-on-content-click="true">
                <template #activator="{ props: act }">
                  <button v-bind="act" class="icon-btn" title="More">
                    <v-icon size="14">mdi-dots-vertical</v-icon>
                  </button>
                </template>
                <v-list density="compact" min-width="180">
                  <v-list-item @click="onRescan(list.id)" prepend-icon="mdi-refresh">
                    <v-list-item-title>Quét lại Zalo</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-if="list.archivedAt"
                    @click="onUnarchive(list.id)"
                    prepend-icon="mdi-archive-arrow-up-outline"
                  >
                    <v-list-item-title>Đưa khỏi lưu trữ</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-else
                    @click="onArchive(list.id)"
                    prepend-icon="mdi-archive-outline"
                  >
                    <v-list-item-title>Lưu trữ</v-list-item-title>
                  </v-list-item>
                  <v-divider />
                  <v-list-item @click="onDelete(list.id)" prepend-icon="mdi-delete-outline" class="danger">
                    <v-list-item-title style="color: #B91C1C">Xoá tệp</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <CreateListModal v-model="showCreate" @created="onCreated" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCustomerLists, type CustomerListSummary, type ListStatusFilter } from '@/composables/use-customer-lists';
import { formatInOrgTz } from '@/composables/use-org-timezone';
import CreateListModal from '@/components/automation/lists/CreateListModal.vue';
import '@/components/automation/phase7/airtable.css';

// Phase Multi-Source Lead Ads 2026-05-27 — platform filter
type PlatformFilter = 'all' | 'leadads' | 'paste';
const platformFilter = ref<PlatformFilter>('all');

function onPlatformFilter(p: PlatformFilter) {
  platformFilter.value = p;
}

const router = useRouter();
const {
  lists,
  listsTotal,
  loadingLists,
  listsStatus,
  listsSearch,
  fetchLists,
  archiveList,
  unarchiveList,
  rescanZalo,
  deleteList,
} = useCustomerLists();

const showCreate = ref(false);

onMounted(() => fetchLists());

function onSwitchStatus(s: ListStatusFilter) {
  listsStatus.value = s;
  fetchLists();
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedFetch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchLists(), 300);
}

function goToDetail(id: string) {
  router.push(`/marketing/lists/${id}`);
}

function onCreated(payload: { id: string }) {
  // Navigate to detail of newly created list
  router.push(`/marketing/lists/${payload.id}`);
}

async function onArchive(id: string) {
  if (!confirm('Lưu trữ tệp này? Tệp sẽ ẩn khỏi danh sách "Đang dùng" nhưng dữ liệu vẫn còn.')) return;
  await archiveList(id);
}

async function onUnarchive(id: string) {
  await unarchiveList(id);
}

async function onRescan(id: string) {
  const result = await rescanZalo(id);
  if (result?.ok) {
    alert(`Đã bắt đầu quét lại ${result.pendingLookup} SĐT. Refresh sau vài phút.`);
  }
}

async function onDelete(id: string) {
  if (!confirm('Xoá vĩnh viễn tệp này? Contact đã được tạo từ tệp sẽ KHÔNG bị xoá theo.')) return;
  await deleteList(id);
}

// ───────── Helpers ─────────
function formatDate(iso: string): string {
  return formatInOrgTz(iso);
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'paste': return '📋 Paste';
    case 'csv': return '📄 CSV';
    case 'excel': return '📊 Excel';
    case 'leadads': return '📣 Lead Ads';
    case 'api': return '🔌 API';
    default: return s;
  }
}

// Phase Multi-Source Lead Ads 2026-05-27 — pill color theo source kind
function sourceClass(s: string): string {
  if (s === 'leadads' || s === 'api') return 'source-leadads';
  return 'source-import';
}

const filteredLists = computed(() => {
  if (platformFilter.value === 'all') return lists.value;
  if (platformFilter.value === 'leadads') {
    return lists.value.filter((l) => l.sourceType === 'leadads' || l.sourceType === 'api');
  }
  if (platformFilter.value === 'paste') {
    return lists.value.filter((l) => l.sourceType === 'paste' || l.sourceType === 'csv' || l.sourceType === 'excel');
  }
  return lists.value;
});

const stats = computed(() => {
  let leadAdsLists = 0, pasteLists = 0;
  let totalEntries = 0, totalHasZalo = 0;
  for (const l of lists.value) {
    if (l.sourceType === 'leadads' || l.sourceType === 'api') leadAdsLists++;
    else pasteLists++;
    totalEntries += l.totalEntries;
    totalHasZalo += l.hasZaloEntries;
  }
  return {
    totalLists: lists.value.length,
    leadAdsLists,
    pasteLists,
    totalEntries,
    totalHasZalo,
  };
});

function dupTotal(l: CustomerListSummary): number {
  return l.dupInListEntries + l.dupCrossListEntries + l.dupWithContactEntries;
}

function progressPct(l: CustomerListSummary, kind: 'valid' | 'invalid' | 'dup'): number {
  if (l.totalEntries === 0) return 0;
  if (kind === 'valid') {
    const validOnly = l.validEntries - dupTotal(l);
    return Math.max(0, (validOnly / l.totalEntries) * 100);
  }
  if (kind === 'invalid') return (l.invalidEntries / l.totalEntries) * 100;
  if (kind === 'dup') return (dupTotal(l) / l.totalEntries) * 100;
  return 0;
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const GRADIENTS: [string, string][] = [
  ['#6366F1', '#A855F7'],
  ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'],
  ['#EC4899', '#BE185D'],
  ['#3B82F6', '#1D4ED8'],
];
function hashIdx(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}
function avatarStyle(name: string): Record<string, string> {
  const [c1, c2] = GRADIENTS[hashIdx(name || '?', GRADIENTS.length)];
  return { background: `linear-gradient(135deg, ${c1}, ${c2})` };
}
void initials; void avatarStyle; // legacy helpers kept for ref after table refactor
</script>

<style scoped>
.lists-view {
  padding: 24px 28px 80px;
  max-width: 100%;
}

.status-tabs {
  display: flex; align-items: center; gap: 4px;
  background: #fff; border: 1px solid #E5E7EB; border-radius: 10px;
  padding: 6px; margin-bottom: 14px;
}
.status-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  font-size: 12.5px; font-weight: 500; color: #4B5563;
  font-family: inherit;
}
.status-tab:hover { background: #F4F5F8; color: #111827; }
.status-tab.active { background: #111827; color: #fff; }
.status-tab .count {
  background: rgba(0,0,0,.06); color: #4B5563;
  padding: 0 6px; border-radius: 99px;
  font-size: 10.5px; font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.status-tab.active .count {
  background: rgba(255,255,255,.18); color: #fff;
}
.spacer { flex: 1; }
.search {
  display: inline-flex; align-items: center; gap: 5px;
  background: #F4F5F8; border: 1px solid #EFF1F4;
  border-radius: 7px; padding: 0 9px;
  min-width: 220px; height: 32px;
}
.search input {
  border: none; background: transparent; outline: none;
  font-size: 12.5px; color: #111827;
  font-family: inherit; width: 100%;
}
.search input::placeholder { color: #9CA3AF; }

.empty-state {
  background: #fff; border: 1px solid #E5E7EB;
  border-radius: 12px; padding: 64px 24px;
  text-align: center; color: #6B7280;
}
.empty-state .empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3 { margin: 0 0 8px; color: #111827; font-size: 16px; }
.empty-state p { margin: 0; font-size: 13px; }

.lists-table-wrap {
  background: #fff; border: 1px solid #E5E7EB;
  border-radius: 10px; overflow: auto;
}
.lists-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.lists-table thead th {
  background: #F4F5F8;
  font-size: 10.5px; font-weight: 600; color: #6B7280;
  text-transform: uppercase; letter-spacing: .04em;
  padding: 10px 10px; text-align: left;
  border-bottom: 1px solid #E5E7EB; white-space: nowrap;
}
.lists-table thead th.right { text-align: right; }
.lists-table tbody td {
  padding: 11px 10px;
  border-bottom: 1px solid #EFF1F4;
  vertical-align: middle; color: #111827;
}
.lists-table tbody tr.row-clickable { cursor: pointer; transition: background .1s; }
.lists-table tbody tr.row-clickable:hover { background: #FAFBFC; }
.lists-table tbody tr:last-child td { border-bottom: none; }

.list-name-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.list-name-cell .icon-em { font-size: 18px; flex-shrink: 0; }
.list-name-cell .nm { font-weight: 600; color: #111827; font-size: 13px; }
.list-name-cell .sub { font-size: 11px; color: #6B7280; margin-top: 1px; }

.date { color: #4B5563; font-size: 12px; white-space: nowrap; }

.author-cell { display: inline-flex; align-items: center; gap: 6px; color: #4B5563; font-size: 12px; }
.author-cell .av {
  width: 22px; height: 22px; border-radius: 50%;
  color: #fff; font-size: 10px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.source-chip {
  display: inline-flex; align-items: center;
  font-size: 11px; color: #6B7280;
  background: #F4F5F8; padding: 2px 7px; border-radius: 5px;
}

.num-cell {
  font-family: "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums; text-align: right;
}
.num-cell.green { color: #047857; }
.num-cell.red { color: #B91C1C; }
.num-cell.amber { color: #B45309; }
.num-cell.blue { color: #1D4ED8; }
.num-cell.muted { color: #9CA3AF; font-weight: 400; }

.progress-cell { min-width: 120px; }
.progress-bar {
  display: flex; height: 6px; border-radius: 99px;
  overflow: hidden; background: #F4F5F8;
}
.progress-bar > i { display: block; height: 100%; }
.progress-bar .ok { background: #10B981; }
.progress-bar .warn { background: #F59E0B; }
.progress-bar .bad { background: #EF4444; }

.status-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 99px;
  font-size: 10.5px; font-weight: 600; white-space: nowrap;
}
.status-chip.done { background: #D1FAE5; color: #047857; }
.status-chip.processing { background: #FEF3C7; color: #B45309; }
.status-chip.archived { background: #E5E7EB; color: #4B5563; }

.row-actions { text-align: right; white-space: nowrap; }
.icon-btn {
  width: 26px; height: 26px; border-radius: 5px;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; margin-left: 2px;
  display: inline-flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: #F4F5F8; color: #111827; }

/* ───── Phase Multi-Source Lead Ads 2026-05-27 ───── */
.stats-row {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  margin-bottom: 12px;
}
.stat-card {
  background: #fff; border: 1px solid #E5E7EB; border-radius: 10px;
  padding: 12px 14px; text-align: left; cursor: pointer;
  font-family: inherit; transition: all 120ms;
}
.stat-card:hover { border-color: #C7D2FE; }
.stat-card.active { border-color: #4F46E5; background: #EEF2FF; }
.stat-card-readonly { cursor: default; }
.stat-card-readonly:hover { border-color: #E5E7EB; }
.stat-num {
  font-size: 22px; font-weight: 700; color: #111827;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.stat-label { font-size: 11px; color: #6B7280; margin-top: 4px; }

.source-chip.source-leadads {
  background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;
}
.source-chip.source-import {
  background: #DBEAFE; color: #1E40AF; border: 1px solid #93C5FD;
}
.key-chip {
  display: inline-flex; align-items: center; padding: 2px 8px;
  font-family: 'Courier New', monospace; font-weight: 600;
  font-size: 11px; background: #F3F4F6; color: #1F2937;
  border-radius: 4px; letter-spacing: .5px;
}
.key-chip.unrouted {
  background: #FEE2E2; color: #B91C1C;
}
.share-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; padding: 2px 7px; border-radius: 99px;
  background: #DCFCE7; color: #166534; font-weight: 500;
}
.muted { color: #9CA3AF; font-size: 12px; }
</style>
