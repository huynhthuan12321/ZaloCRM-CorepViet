<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div>
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h4">Báo cáo</h1>
      <v-spacer />
      <v-text-field
        v-model="dateFrom"
        label="Từ ngày"
        type="date"
        density="compact"
        variant="outlined"
        style="max-width: 180px;"
        class="mr-2"
        hide-details
      />
      <v-text-field
        v-model="dateTo"
        label="Đến ngày"
        type="date"
        density="compact"
        variant="outlined"
        style="max-width: 180px;"
        class="mr-2"
        hide-details
      />
      <v-btn color="primary" prepend-icon="mdi-refresh" :loading="loading" @click="fetchReport">Xem</v-btn>
      <v-btn color="success" prepend-icon="mdi-file-excel" class="ml-2" :loading="exporting" @click="exportExcel">Xuất Excel</v-btn>
    </div>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="messages">Tin nhắn</v-tab>
      <v-tab value="contacts">Khách hàng</v-tab>
      <v-tab value="appointments">Lịch hẹn</v-tab>
    </v-tabs>

    <!-- Period of the rows actually shown, taken from the response; never the unsubmitted inputs. -->
    <p v-if="tab !== 'contacts' && loadedPeriod && !loading && !loadError" class="text-body-2 mb-2 report-period">
      Kỳ dữ liệu: {{ loadedPeriod.from }} – {{ loadedPeriod.to }} · Giờ Việt Nam
      <span v-if="periodChanged" class="text-warning"> · Khoảng ngày đã đổi, bấm "Xem" để tải kỳ mới.</span>
    </p>
    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4" role="alert">
      {{ loadError }}
      <template #append>
        <v-btn variant="text" :disabled="loading" @click="fetchReport">Thử lại</v-btn>
      </template>
    </v-alert>
    <v-alert v-if="exportError" type="warning" variant="tonal" class="mb-4" role="alert" closable @click:close="exportError = ''">
      {{ exportError }}
    </v-alert>

    <v-window v-model="tab">
      <v-window-item value="messages">
        <v-data-table
          :headers="msgHeaders"
          :items="msgData"
          :loading="loading"
          :no-data-text="noDataText"
        />
      </v-window-item>
      <v-window-item value="contacts">
        <section aria-labelledby="basic-report-contact-status-title" class="mb-6">
          <h2 id="basic-report-contact-status-title" class="text-h6 mb-2">Trạng thái hiện tại — không giới hạn theo kỳ</h2>
          <v-data-table
            :headers="contactHeaders"
            :items="contactStatusData"
            :loading="loading"
            :no-data-text="snapshotNoDataText"
          />
        </section>
        <section aria-labelledby="basic-report-contact-new-title">
          <h2 id="basic-report-contact-new-title" class="text-h6 mb-2">Khách mới trong kỳ</h2>
          <p v-if="loadedPeriod && !loading && !loadError" class="text-body-2 mb-2 report-period">
            Kỳ dữ liệu: {{ loadedPeriod.from }} – {{ loadedPeriod.to }} · Giờ Việt Nam
            <span v-if="periodChanged" class="text-warning"> · Khoảng ngày đã đổi, bấm "Xem" để tải kỳ mới.</span>
          </p>
          <v-data-table
            :headers="contactHeaders"
            :items="contactData"
            :loading="loading"
            :no-data-text="noDataText"
          />
        </section>
      </v-window-item>
      <v-window-item value="appointments">
        <v-data-table
          :headers="aptHeaders"
          :items="aptData"
          :loading="loading"
          :no-data-text="noDataText"
        />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { vietnamDateRange } from '@/utils/report-period';

type Tab = 'messages' | 'contacts' | 'appointments';
type Row = { label: string; count: number };

// Default: the last 30 Vietnam days including today.
const initial = vietnamDateRange(30);
const dateFrom = ref(initial.from);
const dateTo = ref(initial.to);
const tab = ref<Tab>('messages');
const loading = ref(false);
const exporting = ref(false);
const loadError = ref('');
const exportError = ref('');
const loadedPeriod = ref<{ from: string; to: string } | null>(null);

const msgData = ref<{ date: string; sent: number; received: number }[]>([]);
const contactStatusData = ref<Row[]>([]);
const contactData = ref<Row[]>([]);
const aptData = ref<Row[]>([]);

const msgHeaders = [
  { title: 'Ngày', key: 'date' },
  { title: 'Đã gửi', key: 'sent' },
  { title: 'Đã nhận', key: 'received' },
];

const contactHeaders = [
  { title: 'Phân loại', key: 'label' },
  { title: 'Số lượng', key: 'count' },
];

const aptHeaders = [
  { title: 'Phân loại', key: 'label' },
  { title: 'Số lượng', key: 'count' },
];

const periodChanged = computed(() => !!loadedPeriod.value && (loadedPeriod.value.from !== dateFrom.value || loadedPeriod.value.to !== dateTo.value));
// An empty table after a failed request is an error, not "no data".
const noDataText = computed(() => (loading.value ? 'Đang tải dữ liệu…' : loadError.value ? 'Chưa tải được dữ liệu' : 'Không có dữ liệu trong kỳ'));
const snapshotNoDataText = computed(() => (loading.value || loadError.value ? noDataText.value : 'Không có dữ liệu trạng thái hiện tại'));

function errorMessage(err: unknown, action: 'load' | 'export'): string {
  const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
  if (status?.status === 400 && status.data?.code === 'invalid_report_date_range') return 'Khoảng ngày không hợp lệ. Hãy chọn lại "Từ ngày" và "Đến ngày".';
  return action === 'load' ? 'Không tải được dữ liệu báo cáo. Hãy thử lại.' : 'Không xuất được file Excel. Hãy thử lại.';
}

function clearTab(which: Tab) {
  if (which === 'messages') msgData.value = [];
  else if (which === 'contacts') {
    contactStatusData.value = [];
    contactData.value = [];
  }
  else aptData.value = [];
}

let requestId = 0;
async function fetchReport() {
  const currentRequestId = ++requestId;
  const which = tab.value;
  const params = { from: dateFrom.value, to: dateTo.value };
  loading.value = true;
  loadError.value = '';
  loadedPeriod.value = null;
  // Never show the previous period/tab as the current result while loading.
  clearTab(which);
  try {
    const res = await api.get(`/reports/${which}`, { params });
    if (currentRequestId !== requestId) return;
    const raw = res.data ?? {};
    if (which === 'messages') {
      msgData.value = Array.isArray(raw.data) ? raw.data : [];
    } else if (which === 'contacts') {
      // Keep the current snapshot separate from period rows and their pagination.
      const statusRows: Row[] = [];
      for (const s of (Array.isArray(raw.byStatus) ? raw.byStatus : [])) {
        statusRows.push({ label: `Trạng thái: ${s.status}`, count: Number(s.count ?? 0) });
      }
      const rows: Row[] = [];
      for (const d of (Array.isArray(raw.newPerDay) ? raw.newPerDay : [])) {
        rows.push({ label: `Mới ${d.date}`, count: Number(d.count ?? 0) });
      }
      contactStatusData.value = statusRows;
      contactData.value = rows;
    } else {
      const rows: Row[] = [];
      for (const s of (Array.isArray(raw.byStatus) ? raw.byStatus : [])) {
        rows.push({ label: `Trạng thái: ${s.status}`, count: Number(s.count ?? 0) });
      }
      for (const t of (Array.isArray(raw.byType) ? raw.byType : [])) {
        rows.push({ label: `Loại: ${t.type ?? '—'}`, count: Number(t.count ?? 0) });
      }
      aptData.value = rows;
    }
    loadedPeriod.value = { from: raw.from ?? params.from, to: raw.to ?? params.to };
  } catch (err) {
    if (currentRequestId !== requestId) return;
    clearTab(which);
    loadError.value = errorMessage(err, 'load');
    console.error('Report fetch error:', err);
  } finally {
    if (currentRequestId === requestId) loading.value = false;
  }
}

async function exportExcel() {
  exporting.value = true;
  exportError.value = '';
  // The file name carries the exact period sent to the API.
  const params = { type: tab.value, from: dateFrom.value, to: dateTo.value };
  try {
    const res = await api.get('/reports/export', { params, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${params.type}-${params.from}-${params.to}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    exportError.value = errorMessage(err, 'export');
    console.error('Export error:', err);
  } finally {
    exporting.value = false;
  }
}

// Auto-fetch when tab changes
watch(tab, () => fetchReport());

// Initial load
fetchReport();
</script>
