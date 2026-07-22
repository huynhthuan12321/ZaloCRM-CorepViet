<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  AutomationReport — Hiệu quả automation theo Sale / theo nick Zalo (Community).
  Endpoint: GET /reports/automation?from&to. report-kit.css (global, scope .rpt-scope).
-->
<template>
  <div class="rpt">
    <!-- HEAD -->
    <div class="rpt-head">
      <div class="rpt-titles">
        <div class="ic"><v-icon icon="mdi-cog-sync-outline" size="24" /></div>
        <div>
          <div class="rpt-h1">Báo cáo Automation</div>
          <div class="rpt-sub">
            Phễu kết bạn (Mục tiêu) và bám đuổi (Phiên chăm sóc) theo từng Sale và từng nick Zalo —
            theo dõi tỉ lệ đồng ý kết bạn, tỉ lệ phản hồi và số lần nick phải reconnect.
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
        <button v-for="r in ranges" :key="r.key" :class="{ on: range === r.key }" @click="range = r.key">{{ r.label }}</button>
      </div>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="rk-loading">
      <v-icon icon="mdi-loading" size="20" /> Đang tải dữ liệu…
    </div>

    <template v-else-if="data">
      <!-- KPI ROW -->
      <div class="grid g-4" style="margin-bottom:18px">
        <div class="kpi">
          <div class="top"><span class="label">Lời mời KB đã gửi</span><span class="kic"><v-icon icon="mdi-account-plus-outline" size="18" /></span></div>
          <div class="val">{{ n(k.kbGui) }}<span class="u">· {{ n(k.dongY) }} đồng ý</span></div>
        </div>
        <div class="kpi accent-ok">
          <div class="top"><span class="label">Tỉ lệ đồng ý</span><span class="kic"><v-icon icon="mdi-check-decagram-outline" size="18" /></span></div>
          <div class="val">{{ n(k.tiLeDongYPct) }}<span class="u">%</span></div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Bám đuổi đã gửi</span><span class="kic"><v-icon icon="mdi-message-fast-outline" size="18" /></span></div>
          <div class="val">{{ n(k.bdGui) }}<span class="u">· {{ n(k.phanHoi) }} phản hồi</span></div>
        </div>
        <div class="kpi accent-ok">
          <div class="top"><span class="label">Tỉ lệ phản hồi</span><span class="kic"><v-icon icon="mdi-reply-outline" size="18" /></span></div>
          <div class="val">{{ n(k.tiLePhanHoiPct) }}<span class="u">%</span></div>
        </div>
      </div>
      <div class="grid g-4" style="margin-bottom:18px">
        <div class="kpi accent-danger">
          <div class="top"><span class="label">Từ chối KB</span><span class="kic"><v-icon icon="mdi-account-cancel-outline" size="18" /></span></div>
          <div class="val">{{ n(k.tuChoi) }}</div>
        </div>
        <div class="kpi accent-danger">
          <div class="top"><span class="label">SĐT không Zalo</span><span class="kic"><v-icon icon="mdi-phone-off-outline" size="18" /></span></div>
          <div class="val">{{ n(k.noZalo) }}</div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Nick online</span><span class="kic"><v-icon icon="mdi-cellphone-link" size="18" /></span></div>
          <div class="val">{{ n(k.nickOnline) }}<span class="u">/ {{ n(k.tongNick) }} nick</span></div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Sale có hoạt động</span><span class="kic"><v-icon icon="mdi-account-tie-outline" size="18" /></span></div>
          <div class="val">{{ n(bySale.length) }}</div>
        </div>
      </div>

      <!-- BY SALE -->
      <div class="card" style="margin-bottom:18px">
        <div class="card-h">
          <div class="t"><v-icon icon="mdi-account-tie-outline" size="18" /> Theo Sale</div>
          <div class="meta">{{ n(bySale.length) }} sale</div>
        </div>
        <div class="card-b" style="padding:0">
          <table class="tbl">
            <thead>
              <tr>
                <th>Sale</th>
                <th class="num">KB gửi</th><th class="num">Đồng ý</th><th class="num">% ĐY</th>
                <th class="num">Từ chối</th><th class="num">No-Zalo</th>
                <th class="num">BĐ gửi</th><th class="num">Phản hồi</th><th class="num">% PH</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!bySale.length"><td colspan="9"><div class="rk-empty">Chưa có dữ liệu trong khoảng thời gian này.</div></td></tr>
              <tr v-for="row in bySale" :key="row.userId">
                <td>{{ row.saleName }}</td>
                <td class="num">{{ n(row.kbGui) }}</td>
                <td class="num">{{ n(row.dongY) }}</td>
                <td class="num"><span class="pill" :class="rateClass(row.tiLeDongYPct)">{{ n(row.tiLeDongYPct) }}%</span></td>
                <td class="num">{{ n(row.tuChoi) }}</td>
                <td class="num">{{ n(row.noZalo) }}</td>
                <td class="num">{{ n(row.bdGui) }}</td>
                <td class="num">{{ n(row.phanHoi) }}</td>
                <td class="num"><span class="pill" :class="rateClass(row.tiLePhanHoiPct)">{{ n(row.tiLePhanHoiPct) }}%</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- BY NICK -->
      <div class="card">
        <div class="card-h">
          <div class="t"><v-icon icon="mdi-cellphone-link" size="18" /> Theo nick Zalo</div>
          <div class="meta">{{ n(byNick.length) }} nick</div>
        </div>
        <div class="card-b" style="padding:0">
          <table class="tbl">
            <thead>
              <tr>
                <th>Nick</th><th>Sale</th>
                <th class="num">KB gửi</th><th class="num">Đồng ý</th><th class="num">% ĐY</th>
                <th class="num">Từ chối</th><th class="num">No-Zalo</th>
                <th class="num">BĐ gửi</th><th class="num">Phản hồi</th><th class="num">% PH</th>
                <th class="num">Reconnect</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!byNick.length"><td colspan="11"><div class="rk-empty">Chưa có dữ liệu trong khoảng thời gian này.</div></td></tr>
              <tr v-for="row in byNick" :key="row.zaloAccountId">
                <td>{{ row.nickName }}</td>
                <td>{{ saleNameOf(row.ownerUserId) }}</td>
                <td class="num">{{ n(row.kbGui) }}</td>
                <td class="num">{{ n(row.dongY) }}</td>
                <td class="num"><span class="pill" :class="rateClass(row.tiLeDongYPct)">{{ n(row.tiLeDongYPct) }}%</span></td>
                <td class="num">{{ n(row.tuChoi) }}</td>
                <td class="num">{{ n(row.noZalo) }}</td>
                <td class="num">{{ n(row.bdGui) }}</td>
                <td class="num">{{ n(row.phanHoi) }}</td>
                <td class="num"><span class="pill" :class="rateClass(row.tiLePhanHoiPct)">{{ n(row.tiLePhanHoiPct) }}%</span></td>
                <td class="num">{{ n(row.reconnect) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else class="rk-empty">Không tải được dữ liệu báo cáo.</div>
  </div>
</template>

<script setup lang="ts">
import { api } from '@/api';
import { ref, onMounted, watch, computed } from 'vue';

const data = ref<any>(null);
const loading = ref(true);
const range = ref('7d');

const ranges = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'yesterday', label: 'Hôm qua' },
  { key: '7d', label: '7 ngày' },
  { key: 'thisWeek', label: 'Tuần này' },
  { key: 'thisMonth', label: 'Tháng này' },
];

const k = computed<any>(() => data.value?.kpis ?? {});
const bySale = computed<any[]>(() => data.value?.bySale ?? []);
const byNick = computed<any[]>(() => data.value?.byNick ?? []);

// Map userId → tên sale (từ bySale) để bảng theo nick hiện tên chủ nick không cần query thêm.
const saleName = computed<Map<string, string>>(() => new Map(bySale.value.map((s) => [s.userId, s.saleName])));
function saleNameOf(userId: string | null): string {
  if (!userId) return '—';
  return saleName.value.get(userId) ?? '—';
}

function pad(d: Date) {
  return d.toISOString().slice(0, 10);
}
function rangeDates() {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  if (range.value === 'today') {
    // from = to = hôm nay
  } else if (range.value === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else if (range.value === '7d') {
    from.setDate(from.getDate() - 6);
  } else if (range.value === 'thisWeek') {
    // Tuần này: từ Thứ 2 (ISO) đến hôm nay.
    const dow = (now.getDay() + 6) % 7; // 0 = Thứ 2
    from.setDate(from.getDate() - dow);
  } else if (range.value === 'thisMonth') {
    from.setDate(1);
  }
  return { from: pad(from), to: pad(to) };
}

async function load() {
  loading.value = true;
  try {
    const { from, to } = rangeDates();
    const res = await api.get('/reports/automation-summary', { params: { from, to } });
    data.value = res.data;
  } catch (e) {
    data.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(range, load);

function n(v: any): string {
  const num = Number(v);
  if (v == null || Number.isNaN(num)) return '0';
  return num.toLocaleString('vi-VN');
}
function rateClass(v: any): string {
  const num = Number(v) || 0;
  if (num >= 60) return 'ok';
  if (num >= 30) return 'warn';
  return 'danger';
}
</script>
