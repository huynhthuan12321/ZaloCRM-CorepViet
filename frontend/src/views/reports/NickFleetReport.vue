<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  NickFleetReport — Vận hành Nick Zalo (2026-06-17).
  Endpoint #2: GET /reports/nick-fleet?from&to. report-kit.css (global, scope .rpt-scope).
-->
<template>
  <div class="rpt">
    <!-- HEAD -->
    <div class="rpt-head">
      <div class="rpt-titles">
        <div class="ic"><v-icon icon="mdi-cellphone-link" size="24" /></div>
        <div>
          <div class="rpt-h1">Vận hành Nick Zalo</div>
          <div class="rpt-sub">
            Theo dõi trạng thái kết nối nick. Uptime, kết bạn, quota và tin bot chỉ hiển thị
            khi có nguồn dữ liệu được xác nhận.
          </div>
        </div>
      </div>
      <div class="rpt-actions">
        <button class="rk-btn ghost" :disabled="loading" @click="load">
          <v-icon icon="mdi-refresh" size="16" /> Làm mới
        </button>
      </div>
    </div>

    <!-- FILTERS -->
    <div class="rpt-filters">
      <div class="seg">
        <button
          v-for="r in ranges"
          :key="r.key"
          :class="{ on: range === r.key }" :aria-pressed="range === r.key"
          @click="range = r.key"
        >{{ r.label }}</button>
      </div>
    </div>

    <!-- LOADING -->
    <ReportContext v-if="data && !loading" :report="data" snapshots="Trạng thái nick và hạn mức hiện tại" />
    <div v-if="loading" class="rk-loading">
      <v-icon icon="mdi-loading" size="20" /> Đang tải dữ liệu…
    </div>

    <template v-else-if="data">
      <!-- KPI ROW 1 -->
      <div class="grid g-4" style="margin-bottom:14px">
        <div class="kpi">
          <div class="top"><span class="label">Tổng nick</span><span class="kic"><v-icon icon="mdi-cellphone-link" size="18" /></span></div>
          <div class="val">{{ n(k.total) }}</div>
        </div>
        <div class="kpi accent-ok">
          <div class="top"><span class="label">Online</span><span class="kic"><v-icon icon="mdi-cellphone-check" size="18" /></span></div>
          <div class="val">{{ n(k.online) }}<span class="u">/ {{ n(k.total) }}</span></div>
        </div>
        <div class="kpi accent-danger">
          <div class="top"><span class="label">Cần re-login</span><span class="kic"><v-icon icon="mdi-cellphone-remove" size="18" /></span></div>
          <div class="val">{{ n(k.needRelogin) }}</div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Tin bot hôm nay</span><span class="kic"><v-icon icon="mdi-robot-outline" size="18" /></span></div>
          <div class="val">{{ n(k.msgByBotToday) }}</div>
        </div>
      </div>

      <!-- KPI ROW 2 -->
      <div class="grid g-4" style="margin-bottom:18px">
        <div class="kpi accent-ok">
          <div class="top"><span class="label">Uptime đội TB</span><span class="kic"><v-icon icon="mdi-pulse" size="18" /></span></div>
          <div class="val">{{ n(k.uptimeTeamAvg) }}<span v-if="hasValue(k.uptimeTeamAvg)" class="u">%</span></div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Kết bạn TB</span><span class="kic"><v-icon icon="mdi-account-check-outline" size="18" /></span></div>
          <div class="val">{{ n(k.friendAcceptAvg) }}<span v-if="hasValue(k.friendAcceptAvg)" class="u">%</span></div>
        </div>
        <div class="kpi accent-warn">
          <div class="top"><span class="label">SDK dùng TB</span><span class="kic"><v-icon icon="mdi-gauge" size="18" /></span></div>
          <div class="val">{{ n(k.sdkUsedAvgPct) }}<span v-if="hasValue(k.sdkUsedAvgPct)" class="u">%</span></div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Tìm SĐT found</span><span class="kic"><v-icon icon="mdi-phone-find-outline" size="18" /></span></div>
          <div class="val">{{ n(k.phoneFoundPct) }}<span v-if="hasValue(k.phoneFoundPct)" class="u">%</span></div>
        </div>
      </div>

      <!-- ALERTS -->
      <div v-if="alerts.length" class="grid g-2" style="margin-bottom:18px">
        <div
          v-for="(a, i) in alerts"
          :key="i"
          class="alert"
          :class="{ danger: a.level === 'danger' }"
        >
          <v-icon icon="mdi-alert-outline" size="18" />
          <div>{{ a.text }}</div>
        </div>
      </div>

      <!-- MAIN TABLE -->
      <div class="card" style="margin-bottom:18px">
        <div class="card-h">
          <div class="t"><v-icon icon="mdi-table-account" size="18" /> Bảng nick</div>
          <div class="meta">{{ n(nicks.length) }} nick</div>
        </div>
        <div class="card-b" style="padding:0">
          <ReportTable label="Bảng số liệu Nick Zalo"><table class="tbl">
            <thead>
              <tr>
                <th>Nick</th>
                <th>Trạng thái</th>
                <th>Uptime 7d</th>
                <th class="num">Tin nay (KH / bot)</th>
                <th>Kết bạn</th>
                <th>SDK cap</th>
                <th class="num">Tìm SĐT</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!nicks.length">
                <td colspan="7"><div class="rk-empty">Chưa có nick nào trong khoảng thời gian này.</div></td>
              </tr>
              <tr v-for="nk in nicks" :key="nk.id">
                <td>
                  <div class="cellname">
                    <span class="av" :style="{ background: avColor(nk.name || nk.ownerName) }">{{ initials(nk.name) }}</span>
                    <div>
                      {{ nk.name || '—' }}
                      <div class="sub">Owner: {{ nk.ownerName || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="dot" :class="statusClass(nk.status)"></span>
                  <span class="pill" :class="statusClass(nk.status)">{{ statusLabel(nk.status) }}</span>
                </td>
                <td>
                  <div v-if="hasValue(nk.uptime7d)" style="display:flex;align-items:center;gap:8px">
                    <div class="bar" :class="barClass(nk.uptime7d)" style="width:64px">
                      <i :style="{ width: pct(nk.uptime7d) }"></i>
                    </div>
                    <span class="b">{{ n(nk.uptime7d) }}%</span>
                  </div>
                  <span v-else class="faint">Chưa có dữ liệu</span>
                </td>
                <td class="num">{{ n(nk.msgUser) }} / {{ n(nk.msgBot) }}</td>
                <td>
                  <span v-if="nk.friendSent != null" class="pill" :class="friendClass(nk.friendAcceptPct)">
                    {{ n(nk.friendSent) }} →
                    <template v-if="hasValue(nk.friendAcceptPct)">{{ n(nk.friendAcceptPct) }}%</template>
                    <span v-else class="faint">Chưa có dữ liệu</span>
                  </span>
                  <span v-else class="faint">Chưa có dữ liệu</span>
                </td>
                <td>
                  <div v-if="nk.sdkUsed != null && nk.sdkCap != null" style="display:flex;align-items:center;gap:8px">
                    <div class="bar" :class="sdkClass(nk.sdkUsed, nk.sdkCap)" style="width:64px">
                      <i :style="{ width: ratioPct(nk.sdkUsed, nk.sdkCap) }"></i>
                    </div>
                    <span class="b">{{ n(nk.sdkUsed) }}/{{ n(nk.sdkCap) }}</span>
                  </div>
                  <span v-else class="faint">Chưa có dữ liệu</span>
                </td>
                <td class="num">
                  <template v-if="hasValue(nk.phoneFoundPct)">{{ n(nk.phoneFoundPct) }}%</template>
                  <span v-else class="faint">Chưa có dữ liệu</span>
                </td>
              </tr>
            </tbody>
          </table></ReportTable>
        </div>
      </div>

      <!-- BOTTOM GRID -->
      <div class="grid g-2">
        <!-- HEATMAP -->
        <div class="card">
          <div class="card-h">
            <div class="t"><v-icon icon="mdi-calendar-check-outline" size="18" /> Uptime 7 ngày</div>
            <div class="meta">% online theo ngày</div>
          </div>
          <div class="card-b">
            <ReportTable v-if="uptimeHeat.length" label="Uptime nick theo 7 ngày"><div class="heat h7">
              <template v-for="row in uptimeHeat" :key="row.nickId">
                <div class="rl">{{ row.name }}</div>
                <div
                  v-for="(d, di) in days7(row.days)"
                  :key="di"
                  class="c"
                  :class="{ l4: d === true, unknown: d == null }"
                  :title="d == null ? 'Chưa có dữ liệu uptime' : undefined"
                ></div>
              </template>
            </div>
            </ReportTable>
            <div v-else class="rk-empty">Chưa có dữ liệu uptime.</div>
          </div>
        </div>

        <!-- SDK BY TYPE -->
        <div class="card">
          <div class="card-h">
            <div class="t"><v-icon icon="mdi-gauge" size="18" /> Dùng SDK theo loại</div>
            <div class="meta">% giới hạn ngày</div>
          </div>
          <div class="card-b">
            <div v-if="sdkByCategory.length" style="display:flex;flex-direction:column;gap:16px">
              <div v-for="(c, i) in sdkByCategory" :key="i">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
                  <span class="b">{{ c.category }}</span>
                  <span class="muted">{{ n(c.usedPct) }}<template v-if="hasValue(c.usedPct)">%</template></span>
                </div>
                <div class="bar" :class="barClass(c.usedPct)"><i :style="{ width: pct(c.usedPct) }"></i></div>
              </div>
            </div>
            <div v-else class="rk-empty">Chưa có dữ liệu SDK.</div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="rk-empty" role="alert">
      {{ loadError || 'Không tải được dữ liệu báo cáo.' }}
      <button class="rk-btn ghost" :disabled="loading" @click="load">Thử lại</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { REPORT_AVATAR_COLORS as AV_COLORS } from '@/utils/report-avatar';
import ReportTable from './ReportTable.vue'
import ReportContext from './ReportContext.vue'
import { api } from '@/api';
import { ref, onMounted, watch, computed } from 'vue';
import { vietnamDateRange } from '@/utils/report-period';

const data = ref<any>(null);
const loading = ref(true);
const range = ref('30d');
const loadError = ref('');
let loadSequence = 0;

const ranges = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
];

// Guarded accessors
const k = computed<any>(() => data.value?.kpis ?? {});
const alerts = computed<any[]>(() => data.value?.alerts ?? []);
const nicks = computed<any[]>(() => data.value?.nicks ?? []);
const uptimeHeat = computed<any[]>(() => data.value?.uptimeHeat ?? []);
const sdkByCategory = computed<any[]>(() => data.value?.sdkByCategory ?? []);

function rangeDates() {
  return vietnamDateRange(range.value === 'today' ? 1 : range.value === '7d' ? 7 : 30);
}

async function load() {
  const sequence = ++loadSequence;
  const { from, to } = rangeDates();
  loading.value = true;
  data.value = null;
  loadError.value = '';
  try {
    const res = await api.get('/reports/nick-fleet', { params: { from, to } });
    if (sequence !== loadSequence) return;
    if (res.data.from !== from || res.data.to !== to) throw new Error('Nick-fleet response period mismatch');
    data.value = res.data;
  } catch (e) {
    if (sequence === loadSequence) {
      loadError.value = 'Không tải được báo cáo Nick. Hãy thử lại.';
      console.error('[NickFleetReport] load failed', e);
    }
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

onMounted(load);
watch(range, load);

// ---- formatting helpers ----
function n(v: any): string {
  if (v == null) return 'Chưa có dữ liệu';
  const num = Number(v);
  if (!Number.isFinite(num)) return 'Chưa có dữ liệu';
  return num.toLocaleString('vi-VN');
}
function hasValue(v: any): boolean {
  return v != null && Number.isFinite(Number(v));
}
function clamp(v: any): number {
  const num = Number(v);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, num));
}
function pct(v: any): string {
  return clamp(v) + '%';
}
function ratioPct(used: any, cap: any): string {
  if (used == null || cap == null) return '0%';
  const u = Number(used) || 0;
  const c = Number(cap) || 0;
  if (c <= 0) return '0%';
  return clamp((u / c) * 100) + '%';
}
function days7(days: any): Array<boolean | null> {
  const arr = Array.isArray(days) ? days.slice(0, 7) : [];
  while (arr.length < 7) arr.push(null);
  return arr.map((d) => typeof d === 'boolean' ? d : null);
}

// ---- status / color classes ----
function statusClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('online') || s === 'ok') return 'ok';
  if (s.includes('idle') || s.includes('rảnh') || s.includes('ranh')) return 'idle';
  if (s.includes('warn')) return 'warn';
  return 'danger';
}
function statusLabel(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('online') || s === 'ok') return 'Online';
  if (s.includes('idle') || s.includes('rảnh') || s.includes('ranh')) return 'Rảnh';
  if (s.includes('warn')) return 'Cảnh báo';
  if (s.includes('disconnect') || s.includes('relogin') || s.includes('offline')) return 'Mất kết nối';
  return status || '—';
}
function barClass(v: any): string {
  const num = Number(v) || 0;
  if (num >= 90) return 'ok';
  if (num >= 70) return 'warn';
  return 'danger';
}
function sdkClass(used: any, cap: any): string {
  const u = Number(used) || 0;
  const c = Number(cap) || 0;
  const r = c > 0 ? (u / c) * 100 : 0;
  if (r >= 85) return 'danger';
  if (r >= 70) return 'warn';
  return '';
}
function friendClass(p: any): string {
  const num = Number(p) || 0;
  if (num >= 70) return 'ok';
  if (num >= 55) return 'warn';
  return '';
}

// ---- avatar ----
function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avColor(name: string): string {
  const s = name || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
</script>

<style scoped>
.c.unknown {
  background: repeating-linear-gradient(135deg, #f3f4f6, #f3f4f6 3px, #e1e4e8 3px, #e1e4e8 6px);
}
</style>
