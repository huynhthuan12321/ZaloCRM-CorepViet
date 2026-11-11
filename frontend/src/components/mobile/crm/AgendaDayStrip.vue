<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Dải 7 ngày của tuần (theo giờ tổ chức) + chuyển tuần + "Hôm nay". Số lịch hẹn mỗi ngày bằng chữ, không chỉ chấm màu. -->
<template>
  <div class="crm-strip">
    <div class="crm-strip__nav">
      <button type="button" class="crm-strip__btn" aria-label="Tuần trước" @click="emit('shiftWeek', -1)"><i class="mdi mdi-chevron-left" aria-hidden="true" /></button>
      <p class="crm-strip__title">{{ title }}</p>
      <button type="button" class="crm-strip__today" @click="emit('today')">Hôm nay</button>
      <button type="button" class="crm-strip__btn" aria-label="Tuần sau" @click="emit('shiftWeek', 1)"><i class="mdi mdi-chevron-right" aria-hidden="true" /></button>
    </div>
    <div class="crm-strip__days" role="tablist" aria-label="Chọn ngày">
      <button
        v-for="d in days" :key="d" type="button" role="tab" class="crm-strip__day"
        :class="{ 'crm-strip__day--on': d === selected, 'crm-strip__day--today': d === today }"
        :aria-selected="d === selected" :aria-label="ariaFor(d)" @click="emit('select', d)"
      >
        <span class="crm-strip__dow">{{ weekdayShort(d) }}</span>
        <span class="crm-strip__num">{{ dayNumber(d) }}</span>
        <span class="crm-strip__count" :class="{ 'crm-strip__count--zero': !counts[d] }">{{ counts[d] || 0 }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { dayLabel, dayNumber, weekdayShort, type DayKey } from './agenda-model';

const props = defineProps<{ days: DayKey[]; selected: DayKey; today: DayKey; counts: Record<DayKey, number> }>();
const emit = defineEmits<{ select: [d: DayKey]; shiftWeek: [delta: -1 | 1]; today: [] }>();

const title = computed(() => {
  const [y, m] = props.selected.split('-');
  return `Tháng ${Number(m)}/${y}`;
});
function ariaFor(d: DayKey): string {
  const n = props.counts[d] || 0;
  return `${dayLabel(d, props.today)}, ${n ? `${n} lịch hẹn` : 'không có lịch hẹn'}`;
}
</script>

<style scoped>
.crm-strip { padding: var(--m-space-2) var(--m-gutter) var(--m-space-3); background: var(--m-surface); border-bottom: 1px solid var(--m-line); }
.crm-strip__nav { display: flex; align-items: center; gap: var(--m-space-2); }
.crm-strip__title { flex: 1; margin: 0; min-width: 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-strip__btn, .crm-strip__today {
  min-width: var(--m-touch); min-height: var(--m-touch); border: 0; border-radius: var(--m-radius-md); background: transparent; color: var(--m-brand-strong);
  font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-strip__btn { font-size: 24px; }
.crm-strip__today { padding: 0 var(--m-space-3); background: var(--m-brand-soft); }
/* 320px không đủ chỗ cho bảy target 44px: chỉ dải ngày cuộn ngang, không làm tràn trang. */
.crm-strip__days { display: grid; grid-template-columns: repeat(7, minmax(var(--m-touch), 1fr)); gap: 4px; max-width: 100%; overflow-x: auto; }
.crm-strip__day {
  display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 64px; padding: 6px 0; border: 1px solid transparent; border-radius: var(--m-radius-md);
  background: transparent; color: var(--m-text); font: inherit; cursor: pointer; touch-action: manipulation;
}
.crm-strip__day--today .crm-strip__num { color: var(--m-brand-strong); }
.crm-strip__day--on { background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-strip__day--on .crm-strip__num, .crm-strip__day--on .crm-strip__dow { color: var(--m-on-action); }
.crm-strip__dow { font-size: 12px; color: var(--m-muted); }
.crm-strip__num { font-size: var(--m-font-section); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.crm-strip__count { min-width: 20px; padding: 0 5px; border-radius: 999px; background: var(--m-brand-soft); color: var(--m-brand-strong); font-size: 12px; font-weight: 700; line-height: 18px; font-variant-numeric: tabular-nums; }
.crm-strip__count--zero { background: transparent; color: transparent; font-weight: 500; } /* ngày trống: giữ chỗ nhưng không hiện số 0 (aria-label đã nói "không có lịch hẹn") */
.crm-strip__day--on .crm-strip__count { background: var(--m-on-action); color: var(--m-brand-strong); }
.crm-strip__day--on .crm-strip__count--zero { background: transparent; color: transparent; }
.crm-strip__day:focus-visible, .crm-strip__btn:focus-visible, .crm-strip__today:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 1px; }
</style>
