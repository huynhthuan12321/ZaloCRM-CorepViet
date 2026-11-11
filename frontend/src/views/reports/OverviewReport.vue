<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
import ReportTable from './ReportTable.vue'
import ReportContext from './ReportContext.vue'
import { api } from '@/api'
import { ref, onMounted, computed, watch } from 'vue'
import { vietnamDateRange } from '@/utils/report-period'
import { REPORT_AVATAR_COLORS as AV_COLORS } from '@/utils/report-avatar'

type Range = 'today' | '7d' | '30d'

const data = ref<any>(null)
const loading = ref(true)
const loadError = ref('')
const range = ref<Range>('30d')
let loadSequence = 0;

const rangeBtns: { key: Range; label: string }[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
]

function rangeDates(r: Range): { from: string; to: string } {
  return vietnamDateRange(r === 'today' ? 1 : r === '7d' ? 7 : 30)
}

async function load() {
  const sequence = ++loadSequence
  const { from, to } = rangeDates(range.value)
  loading.value = true
  data.value = null
  loadError.value = ''
  try {
    const response = await api.get('/reports/overview', { params: { from, to } })
    if (sequence !== loadSequence) return
    if (response.data.from !== from || response.data.to !== to) {
      throw new Error('Overview response period does not match the selected period')
    }
    data.value = response.data
  } catch (error) {
    if (sequence === loadSequence) {
      loadError.value = 'Không tải được dữ liệu báo cáo. Hãy thử lại.'
      console.error('[OverviewReport] load failed', error)
    }
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

onMounted(load)
watch(range, load)

// ---- helpers --------------------------------------------------------------
function n(v: any): string {
  if (v == null) return 'Chưa có dữ liệu'
  const num = Number(v)
  return Number.isFinite(num) ? num.toLocaleString('vi-VN') : 'Chưa có dữ liệu'
}

function pct(v: any): string {
  if (v == null) return 'Chưa có dữ liệu'
  const num = Number(v)
  if (!Number.isFinite(num)) return 'Chưa có dữ liệu'
  // show one decimal, vi-VN uses comma
  return num.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avColor(name?: string): string {
  const s = name || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}

// ---- derived data ---------------------------------------------------------
const kpis = computed<any>(() => data.value?.kpis ?? {})

const msgSeries = computed<any[]>(() => data.value?.msgSeries ?? [])
const msgMax = computed<number>(() => {
  let m = 0
  for (const r of msgSeries.value) {
    m = Math.max(m, Number(r?.sent) || 0, Number(r?.received) || 0)
  }
  return m || 1
})
function barH(v: any): string {
  const num = Number(v) || 0
  return `${Math.max(0, Math.min(100, (num / msgMax.value) * 100))}%`
}
function shortDate(d?: string): string {
  if (!d) return ''
  // accept YYYY-MM-DD or ISO; output DD/MM
  const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}`
  return String(d)
}

const funnel = computed<any[]>(() => data.value?.funnel ?? [])
const funnelMax = computed<number>(() => {
  let m = 0
  for (const f of funnel.value) m = Math.max(m, Number(f?.count) || 0)
  return m || 1
})
function funnelW(v: any): string {
  const num = Number(v) || 0
  return `${Math.max(0, Math.min(100, (num / funnelMax.value) * 100))}%`
}
function isLastFunnel(i: number): boolean {
  return funnel.value.length > 0 && i === funnel.value.length - 1
}

const topSales = computed<any[]>(() => data.value?.topSales ?? [])
const riskNicks = computed<any[]>(() => data.value?.riskNicks ?? [])

function riskDot(risk?: string): string {
  if (risk === 'disconnect') return 'danger'
  if (risk === 'quota' || risk === 'stranger') return 'warn'
  if (risk === 'ok') return 'ok'
  return 'idle'
}
function statusPill(risk?: string): string {
  if (risk === 'disconnect') return 'danger'
  if (risk === 'quota' || risk === 'stranger') return 'warn'
  if (risk === 'ok') return 'ok'
  return ''
}
function quotaBarClass(risk?: string): string {
  if (risk === 'disconnect') return 'bar danger'
  if (risk === 'quota' || risk === 'stranger') return 'bar warn'
  if (risk === 'ok') return 'bar ok'
  return 'bar'
}
function quotaW(v: any): string {
  const num = Number(v)
  if (!Number.isFinite(num)) return '0%'
  return `${Math.max(0, Math.min(100, num))}%`
}
</script>

<template>
  <div class="rpt">
    <!-- HEAD -->
    <div class="rpt-head">
      <div class="rpt-titles">
        <div class="ic"><v-icon icon="mdi-view-dashboard-outline" size="24" /></div>
        <div>
          <div class="rpt-h1">Tổng quan điều hành</div>
          <div class="rpt-sub">
            Tổng hợp nick, khách hàng, hoạt động tin nhắn và lịch hẹn theo dữ liệu đang ghi nhận.
          </div>
        </div>
      </div>
      <div class="rpt-actions">
        <button class="rk-btn ghost" @click="load">
          <v-icon icon="mdi-refresh" size="16" /> Làm mới
        </button>
        <button class="rk-btn" disabled>
          <v-icon icon="mdi-file-excel-outline" size="16" /> Xuất Excel
        </button>
      </div>
    </div>

    <!-- FILTERS -->
    <div class="rpt-filters">
      <div class="seg">
        <button
          v-for="b in rangeBtns"
          :key="b.key"
          :class="{ on: range === b.key }" :aria-pressed="range === b.key"
          @click="range = b.key"
        >{{ b.label }}</button>
      </div>
    </div>

    <!-- LOADING -->
    <ReportContext v-if="data && !loading" :report="data" snapshots="Tổng khách, trạng thái khách, nick và lead đang chờ" />
    <div v-if="loading && !data" class="rpt-loading rk-loading">
      <v-icon icon="mdi-loading" size="20" /> Đang tải dữ liệu…
    </div>

    <template v-else-if="data">
      <!-- KPI ROW 1 -->
      <div class="grid g-4" style="margin-bottom:14px">
        <div class="kpi">
          <div class="top"><span class="label">Tổng khách hàng</span><span class="kic"><v-icon icon="mdi-account-multiple-outline" size="18" /></span></div>
          <div class="val">{{ n(kpis.totalContacts) }}</div>
          <div class="delta up"><v-icon icon="mdi-trending-up" size="13" /> +{{ n(kpis.newContacts) }} trong kỳ</div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">KH mới</span><span class="kic"><v-icon icon="mdi-account-plus-outline" size="18" /></span></div>
          <div class="val">{{ n(kpis.newContacts) }}</div>
          <div class="delta" :class="(Number(kpis.newContactsDelta) || 0) >= 0 ? 'up' : 'down'">
            <v-icon :icon="(Number(kpis.newContactsDelta) || 0) >= 0 ? 'mdi-trending-up' : 'mdi-trending-down'" size="13" />
            {{ (Number(kpis.newContactsDelta) || 0) >= 0 ? '+' : '' }}{{ n(kpis.newContactsDelta) }} vs kỳ trước
          </div>
        </div>
        <div class="kpi accent-ok">
          <div class="top"><span class="label">Nick online</span><span class="kic"><v-icon icon="mdi-cellphone-check" size="18" /></span></div>
          <div class="val">{{ n(kpis.nicksOnline) }}<span class="u">/ {{ n(kpis.nicksTotal) }}</span></div>
          <div class="delta flat"><v-icon icon="mdi-circle-medium" size="13" /> {{ n(kpis.nicksNeedRelogin) }} cần re-login</div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Tin nhắn hôm nay</span><span class="kic"><v-icon icon="mdi-message-text-outline" size="18" /></span></div>
          <div class="val">{{ n(kpis.msgToday) }}</div>
          <div class="delta up"><v-icon icon="mdi-robot-outline" size="13" /> {{ n(kpis.msgByBot) }} tin automation gửi</div>
        </div>
      </div>

      <!-- KPI ROW 2 -->
      <div class="grid g-4" style="margin-bottom:18px">
        <div class="kpi">
          <div class="top"><span class="label">Lịch hẹn hôm nay</span><span class="kic"><v-icon icon="mdi-calendar-clock" size="18" /></span></div>
          <div class="val">{{ n(kpis.apptToday) }}</div>
          <div class="delta flat"><v-icon icon="mdi-check" size="13" /> {{ n(kpis.apptDone) }} hoàn thành trong kỳ</div>
        </div>
        <div class="kpi accent-warn">
          <div class="top"><span class="label">Lead pool đang chờ</span><span class="kic"><v-icon icon="mdi-gift-outline" size="18" /></span></div>
          <div class="val">{{ n(kpis.leadPoolWaiting) }}</div>
          <div class="delta down"><v-icon icon="mdi-trending-down" size="13" /> {{ n(kpis.leadPoolAutoReturnSoon) }} sắp auto-trả</div>
        </div>
        <div class="kpi accent-ok">
          <div class="top"><span class="label">Tỉ lệ chốt</span><span class="kic"><v-icon icon="mdi-flag-checkered" size="18" /></span></div>
          <div class="val">{{ pct(kpis.closeRate) }}<span v-if="kpis.closeRate != null" class="u">%</span></div>
          <div class="delta flat">
            <v-icon icon="mdi-minus" size="13" />
            <template v-if="kpis.closeRateDelta != null">
              {{ kpis.closeRateDelta >= 0 ? '+' : '' }}{{ pct(kpis.closeRateDelta) }}đ vs kỳ trước
            </template>
            <template v-else>Chưa xác định được trạng thái thắng</template>
          </div>
        </div>
        <div class="kpi">
          <div class="top"><span class="label">Kết bạn thành công</span><span class="kic"><v-icon icon="mdi-account-check-outline" size="18" /></span></div>
          <div class="val">{{ pct(kpis.friendAcceptRate) }}<span v-if="kpis.friendAcceptRate != null" class="u">%</span></div>
          <div class="delta flat"><v-icon icon="mdi-circle-medium" size="13" /> {{ n(kpis.friendInviteAccepted) }}/{{ n(kpis.friendInviteSent) }} lời mời</div>
        </div>
      </div>

      <!-- CHARTS ROW -->
      <div class="grid g-3" style="margin-bottom:14px">
        <div class="card col-2">
          <div class="card-h">
            <div class="t"><v-icon icon="mdi-chart-bar" size="18" /> Tin nhắn trong kỳ</div>
            <div class="meta">Khách gửi / Mình gửi</div>
          </div>
          <div class="card-b">
            <div v-if="msgSeries.length" class="chart" role="region" tabindex="0" aria-label="Tin nhắn theo ngày Việt Nam; cuộn ngang để xem thêm ngày">
              <div v-for="(row, i) in msgSeries" :key="i" class="col">
                <div class="stack">
                  <i :style="{ height: barH(row?.received) }"></i>
                  <i class="b" :style="{ height: barH(row?.sent) }"></i>
                </div>
                <div class="x">{{ shortDate(row?.date) }}</div>
              </div>
            </div>
            <div v-else class="rk-empty">Chưa có dữ liệu tin nhắn</div>
          </div>
        </div>

        <div class="card">
          <div class="card-h">
            <div class="t"><v-icon icon="mdi-filter-outline" size="18" /> Khách hàng theo trạng thái</div>
            <div class="meta">Snapshot hiện tại</div>
          </div>
          <div class="card-b">
            <div v-if="funnel.length" class="funnel">
              <div v-for="(f, i) in funnel" :key="i" class="stp">
                <div class="nm" style="width:78px">{{ f?.status }}</div>
                <div class="track">
                  <i
                    :style="isLastFunnel(i)
                      ? { width: funnelW(f?.count), background: 'linear-gradient(90deg,#12b76a,#5fd99a)' }
                      : { width: funnelW(f?.count) }"
                  ></i>
                  <div class="vv">{{ n(f?.count) }}</div>
                </div>
              </div>
            </div>
            <div v-else class="rk-empty">Chưa có dữ liệu phễu</div>
          </div>
        </div>
      </div>

      <!-- TABLES ROW -->
      <div class="grid g-2">
        <div class="card">
          <div class="card-h">
            <div class="t"><v-icon icon="mdi-account-multiple-outline" size="18" /> Sale có khách mới</div>
            <span class="meta">Top 5 · theo khách mới trong kỳ</span>
          </div>
          <div class="card-b" style="padding:0">
            <ReportTable v-if="topSales.length" label="Bảng số liệu Tổng quan"><table class="tbl">
              <thead><tr><th>Sale</th><th class="num">KH mới</th><th class="num">Tin gửi</th><th class="num">Chốt</th></tr></thead>
              <tbody>
                <tr v-for="(s, i) in topSales" :key="s?.userId ?? i">
                  <td>
                    <div class="cellname">
                      <span class="av" :style="{ background: avColor(s?.name) }">{{ initials(s?.name) }}</span>
                      <div>{{ s?.name || '—' }}<div class="sub">{{ s?.deptName || '—' }}</div></div>
                    </div>
                  </td>
                  <td class="num">{{ n(s?.newContacts) }}</td>
                  <td class="num">{{ n(s?.sent) }}</td>
                  <td class="num"><span class="pill">{{ n(s?.closed) }}</span></td>
                </tr>
              </tbody>
            </table></ReportTable>
            <div v-else class="rk-empty">Chưa có dữ liệu sale</div>
          </div>
        </div>

        <div class="card">
          <div class="card-h">
            <div class="t"><v-icon icon="mdi-alert-outline" size="18" style="color:var(--rk-warn)" /> Nick cần chú ý</div>
            <span class="meta">Top 5</span>
          </div>
          <div class="card-b" style="padding:0">
            <ReportTable v-if="riskNicks.length" label="Bảng số liệu Tổng quan"><table class="tbl">
              <thead><tr><th>Nick</th><th>Trạng thái</th><th class="num">Quota</th><th class="num">Uptime 7d</th></tr></thead>
              <tbody>
                <tr v-for="(nk, i) in riskNicks" :key="nk?.id ?? i">
                  <td>
                    <div class="cellname">
                      <span class="dot" :class="riskDot(nk?.risk)"></span>
                      <div>{{ nk?.name || '—' }}<div class="sub">Owner: {{ nk?.ownerName || '—' }}</div></div>
                    </div>
                  </td>
                  <td><span class="pill" :class="statusPill(nk?.risk)">{{ nk?.status || '—' }}</span></td>
                  <td class="num">
                    <template v-if="nk?.quotaPct != null">
                      <div :class="quotaBarClass(nk?.risk)" style="width:60px"><i :style="{ width: quotaW(nk?.quotaPct) }"></i></div>
                    </template>
                    <template v-else>—</template>
                  </td>
                  <td class="num">
                    <template v-if="nk?.uptime7d != null">{{ pct(nk.uptime7d) }}%</template>
                    <span v-else>Chưa có dữ liệu</span>
                  </td>
                </tr>
              </tbody>
            </table></ReportTable>
            <div v-else class="rk-empty">Không có nick cần chú ý</div>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="rk-empty" role="alert">
      {{ loadError || 'Không có dữ liệu báo cáo.' }}
      <button class="rk-btn ghost" :disabled="loading" @click="load">Thử lại</button>
    </div>
  </div>
</template>
