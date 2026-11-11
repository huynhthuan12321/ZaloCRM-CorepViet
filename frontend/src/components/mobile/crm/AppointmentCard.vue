<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Thẻ lịch hẹn trong agenda: giờ (theo giờ tổ chức) là điểm nhấn; trạng thái luôn kèm CHỮ (không chỉ màu); hiện người phụ trách. -->
<template>
  <button type="button" class="crm-appt-card" :class="`crm-appt-card--${tone}`" :aria-label="ariaLabel" @click="emit('open', appointment.id)">
    <span class="crm-appt-card__time">
      <strong>{{ time }}</strong>
      <small>{{ durationText }}</small>
    </span>
    <span class="crm-appt-card__body">
      <span class="crm-appt-card__title">{{ appointment.title || typeText }}</span>
      <span class="crm-appt-card__who">{{ contactText }}</span>
      <span class="crm-appt-card__meta">
        <span class="crm-appt-card__status" :class="`crm-appt-card__status--${tone}`">{{ statusText }}</span>
        <span>{{ typeText }}</span>
        <span v-if="appointment.source === 'zalo'">Tạo từ Zalo</span>
      </span>
      <span class="crm-appt-card__owner"><i class="mdi mdi-account-outline" aria-hidden="true" />Phụ trách: {{ ownerText }}</span>
    </span>
    <i class="mdi mdi-chevron-right crm-appt-card__chev" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Appointment } from '@/composables/use-appointments';
import { statusLabel as apptStatusLabel } from '@/composables/use-appointments';
import { appointmentOwnerName, typeLabel, type AppointmentEx } from '@/composables/appointment-helpers';
import { displayPhone } from '@/composables/use-phone-format';
import { appointmentTimeText } from './agenda-model';

const props = defineProps<{ appointment: Appointment }>();
const emit = defineEmits<{ open: [id: string] }>();

const time = computed(() => appointmentTimeText(props.appointment));
const durationText = computed(() => {
  const m = props.appointment.durationMin ?? 15;
  if (m >= 1440) return `${Math.round(m / 1440)} ngày`;
  return m >= 60 && m % 60 === 0 ? `${m / 60} giờ` : `${m} phút`;
});
const statusText = computed(() => apptStatusLabel(props.appointment.status));
const typeText = computed(() => typeLabel(props.appointment.type));
const ownerText = computed(() => appointmentOwnerName(props.appointment as AppointmentEx));
const contactText = computed(() => {
  const c = props.appointment.contact;
  if (!c) return 'Khách chưa rõ';
  const phone = displayPhone(c.phone);
  return phone ? `${c.fullName || 'Khách chưa đặt tên'} · ${phone}` : (c.fullName || 'Khách chưa đặt tên');
});
const tone = computed(() => {
  switch (props.appointment.status) {
    case 'overdue': return 'warn';
    case 'completed': return 'done';
    case 'cancelled': case 'no_show': return 'off';
    default: return 'open';
  }
});
const ariaLabel = computed(() => `${time.value}, ${props.appointment.title || typeText.value}, ${contactText.value}, ${statusText.value}, phụ trách ${ownerText.value}`);
</script>

<style scoped>
.crm-appt-card {
  display: flex; align-items: flex-start; gap: var(--m-space-3); width: 100%; min-height: 76px; padding: var(--m-space-3) var(--m-space-3) var(--m-space-3) var(--m-space-3);
  border: 1px solid var(--m-line); border-left: 4px solid var(--m-brand); border-radius: var(--m-radius-card); background: var(--m-surface); color: var(--m-text);
  font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: var(--m-tap-highlight);
}
.crm-appt-card--warn { border-left-color: var(--m-warning); }
.crm-appt-card--done { border-left-color: var(--m-success); }
.crm-appt-card--off { border-left-color: var(--m-line); }
.crm-appt-card:active { background: var(--m-surface-inset); }
.crm-appt-card:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-appt-card__time { flex: none; width: 56px; display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
.crm-appt-card__time strong { font-size: var(--m-font-section); font-weight: 700; line-height: 1.3; }
.crm-appt-card__time small { font-size: 12px; color: var(--m-muted); }
.crm-appt-card__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-appt-card__title { font-weight: 650; overflow-wrap: anywhere; }
.crm-appt-card__who { font-size: var(--m-font-meta); color: var(--m-text); overflow-wrap: anywhere; }
.crm-appt-card__meta { display: flex; flex-wrap: wrap; gap: 2px var(--m-space-2); font-size: 12px; color: var(--m-muted); }
.crm-appt-card__status { padding: 0 8px; border-radius: 999px; font-weight: 650; background: var(--m-brand-soft); color: var(--m-brand-strong); }
.crm-appt-card__status--warn { background: var(--m-warning-soft); color: var(--m-warning); }
.crm-appt-card__status--done { background: var(--m-brand-soft); color: var(--m-success); }
.crm-appt-card__status--off { background: var(--m-surface-inset); color: var(--m-muted); }
.crm-appt-card__owner { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--m-muted); overflow-wrap: anywhere; }
.crm-appt-card__chev { flex: none; align-self: center; font-size: 22px; color: var(--m-muted); }
</style>
