<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- "Quản lý hệ thống" trên mobile (chỉ hiện khi hasSystemSection). Bảng phòng KD / phễu -> danh sách. Lỗi section hiện LỖI, không hiện 0. -->
<template>
  <MobileFeedback v-if="loading && !system" state="loading" title="Đang tải số liệu hệ thống" />
  <MobileFeedback v-else-if="!system" state="error" title="Không tải được số liệu hệ thống" description="Bạn có thể không có quyền xem hoặc kết nối đang lỗi." retryable @retry="emit('retry')" />

  <div v-else class="crm-sy">
    <p v-if="system.recentAudit?.length" class="crm-sy__audit">
      <i class="mdi mdi-clipboard-text-outline" aria-hidden="true" />
      Audit gần nhất: <strong>{{ system.recentAudit[0].actorName }}</strong> — {{ system.recentAudit[0].action }} · {{ agoText(system.recentAudit[0].createdAt) }}
    </p>

    <section class="crm-sy__card" aria-labelledby="crm-sy-org">
      <h2 id="crm-sy-org" class="crm-sy__h">Toàn tổ chức</h2>
      <dl class="crm-sy__dl">
        <div><dt>Lead mới tháng này</dt><dd>{{ system.orgKpi?.newLeadsThisMonth ?? '—' }}</dd></div>
        <div><dt>Tổng khách hàng</dt><dd>{{ system.orgKpi ? system.orgKpi.totalContacts.toLocaleString('vi-VN') : '—' }}</dd></div>
        <div><dt>Phiên theo dõi</dt><dd>{{ system.orgKpi?.followSessions ?? '—' }}</dd></div>
        <div><dt>Thao tác audit hôm nay</dt><dd>{{ system.orgKpi?.auditCountToday ?? '—' }}</dd></div>
      </dl>
    </section>

    <section class="crm-sy__card" aria-labelledby="crm-sy-nick">
      <h2 id="crm-sy-nick" class="crm-sy__h">Sức khỏe nick<template v-if="system.orgKpi?.totalNicks != null"> ({{ system.orgKpi.totalNicks }} nick)</template></h2>
      <dl v-if="system.orgKpi?.nickHealth" class="crm-sy__dl">
        <div><dt>Khỏe</dt><dd>{{ system.orgKpi.nickHealth.healthy }}</dd></div>
        <div><dt>Nghỉ / offline</dt><dd>{{ system.orgKpi.nickHealth.offline }}</dd></div>
        <div><dt>Lỗi / bị khóa</dt><dd>{{ system.orgKpi.nickHealth.banned }}</dd></div>
        <div><dt>Quá giới hạn</dt><dd>{{ system.orgKpi.nickHealth.overlimit }}</dd></div>
        <div><dt>Nick riêng tư</dt><dd>{{ system.orgKpi.nickHealth.private }}</dd></div>
      </dl>
    </section>

    <section class="crm-sy__card" aria-labelledby="crm-sy-dept">
      <h2 id="crm-sy-dept" class="crm-sy__h">Hiệu suất phòng kinh doanh (tháng này)</h2>
      <ul v-if="system.deptRanking?.length" class="crm-sy__list">
        <li v-for="d in system.deptRanking" :key="d.departmentId">
          <strong class="crm-sy__name">{{ d.departmentName }}</strong>
          <span class="crm-sy__sub">{{ d.memberCount }} nhân viên · Lead mới {{ d.newLeadsThisMonth }} · Chốt {{ d.closedThisMonth }}</span>
        </li>
      </ul>
      <p v-else class="crm-sy__empty">Chưa có dữ liệu phòng ban.</p>
    </section>

    <section class="crm-sy__card" aria-labelledby="crm-sy-funnel">
      <h2 id="crm-sy-funnel" class="crm-sy__h">Phễu khách hàng</h2>
      <ul v-if="funnel.length" class="crm-sy__funnel">
        <li v-for="f in funnel" :key="f.status">
          <span class="crm-sy__f-top"><span>{{ f.label }}</span><strong>{{ f.count.toLocaleString('vi-VN') }}</strong></span>
          <span class="crm-sy__bar" aria-hidden="true"><span class="crm-sy__bar-fill" :style="{ width: `${f.pct}%` }" /></span>
        </li>
      </ul>
      <p v-else class="crm-sy__empty">Chưa có dữ liệu phễu.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import type { SystemResponse } from '@/composables/use-dashboard-action-hub';
import { agoText, urgentStatusLabel } from './crm-model';

const props = defineProps<{ system: SystemResponse | null; loading: boolean }>();
const emit = defineEmits<{ retry: [] }>();

const funnel = computed(() => {
  const rows = (props.system?.funnel ?? []).filter(x => x.status && x.count > 0);
  const max = Math.max(1, ...rows.map(x => x.count));
  return rows.slice(0, 8).map(x => ({ status: x.status as string, label: urgentStatusLabel(x.status) || 'Khác', count: x.count, pct: Math.round((x.count / max) * 100) }));
});
</script>

<style scoped>
.crm-sy { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); }
.crm-sy__audit { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-brand-soft); color: var(--m-brand-strong); font-size: var(--m-font-meta); overflow-wrap: anywhere; }
.crm-sy__card { border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); padding: var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-3); }
.crm-sy__h { margin: 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-sy__dl { margin: 0; display: flex; flex-direction: column; }
.crm-sy__dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--m-space-3); padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); }
.crm-sy__dl dt { color: var(--m-muted); font-size: var(--m-font-meta); }
.crm-sy__dl dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.crm-sy__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-sy__list li { display: flex; flex-direction: column; gap: 2px; padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); }
.crm-sy__name { overflow-wrap: anywhere; }
.crm-sy__sub, .crm-sy__empty { font-size: var(--m-font-meta); color: var(--m-muted); margin: 0; }
.crm-sy__funnel { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-3); }
.crm-sy__f-top { display: flex; justify-content: space-between; gap: var(--m-space-2); font-size: var(--m-font-meta); }
.crm-sy__f-top strong { font-variant-numeric: tabular-nums; }
.crm-sy__bar { display: block; height: 8px; margin-top: 4px; border-radius: 999px; background: var(--m-surface-inset); overflow: hidden; }
.crm-sy__bar-fill { display: block; height: 100%; background: var(--m-brand); }
</style>
