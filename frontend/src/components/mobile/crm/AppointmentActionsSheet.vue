<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Chi tiết lịch hẹn + thao tác (hoàn thành / sửa / hủy / vắng / xóa). Hủy, vắng, xóa chỉ PHÁT SỰ KIỆN; view adapter xác nhận qua ConfirmHost. -->
<template>
  <MobileSheet :open="open" title="Chi tiết lịch hẹn" @update:open="emit('update:open', $event)">
    <div v-if="appointment" class="crm-ad">
      <h3 class="crm-ad__title">{{ appointment.title || typeText }}</h3>
      <dl class="crm-ad__dl">
        <div><dt>Thời gian</dt><dd>{{ whenText }}</dd></div>
        <div><dt>Khách hàng</dt><dd>{{ contactText }}</dd></div>
        <div><dt>Loại · Trạng thái</dt><dd>{{ typeText }} · <strong>{{ statusText }}</strong></dd></div>
        <div><dt>Người phụ trách</dt><dd>{{ ownerText }}</dd></div>
        <div v-if="appointment.location"><dt>Địa điểm</dt><dd>{{ appointment.location }}</dd></div>
        <div v-if="appointment.notes"><dt>Ghi chú</dt><dd class="crm-ad__notes">{{ appointment.notes }}</dd></div>
        <div v-if="appointment.source === 'zalo'"><dt>Nguồn</dt><dd>Tạo từ tin nhắn Zalo</dd></div>
      </dl>

      <div class="crm-ad__actions">
        <button v-if="appointment.conversationId" type="button" class="crm-ad__btn" @click="emit('openChat', appointment.conversationId!)">
          <i class="mdi mdi-message-text-outline" aria-hidden="true" />Mở hội thoại
        </button>
        <button type="button" class="crm-ad__btn" @click="emit('openContact', appointment.contactId)">
          <i class="mdi mdi-account-outline" aria-hidden="true" />Hồ sơ khách
        </button>
        <button v-if="canComplete" type="button" class="crm-ad__btn crm-ad__btn--primary" :disabled="busy" @click="emit('complete', appointment)">
          <i class="mdi mdi-check-circle-outline" aria-hidden="true" />Hoàn thành
        </button>
        <button type="button" class="crm-ad__btn" :disabled="busy" @click="emit('edit', appointment)">
          <i class="mdi mdi-pencil-outline" aria-hidden="true" />Sửa
        </button>
        <button v-if="canComplete" type="button" class="crm-ad__btn" :disabled="busy" @click="emit('noShow', appointment)">
          <i class="mdi mdi-account-off-outline" aria-hidden="true" />Khách vắng
        </button>
        <button v-if="canComplete" type="button" class="crm-ad__btn crm-ad__btn--danger" :disabled="busy" @click="emit('cancel', appointment)">
          <i class="mdi mdi-calendar-remove-outline" aria-hidden="true" />Hủy lịch
        </button>
        <button type="button" class="crm-ad__btn crm-ad__btn--danger" :disabled="busy" @click="emit('remove', appointment)">
          <i class="mdi mdi-trash-can-outline" aria-hidden="true" />Xóa
        </button>
      </div>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import type { Appointment } from '@/composables/use-appointments';
import { statusLabel } from '@/composables/use-appointments';
import { appointmentOwnerName, typeLabel, type AppointmentEx } from '@/composables/appointment-helpers';
import { displayPhone } from '@/composables/use-phone-format';
import { appointmentDayKey, appointmentTimeText, dayLabel } from './agenda-model';
import { orgDayKey } from '@/composables/use-org-timezone';

const props = defineProps<{ open: boolean; appointment: Appointment | null; busy?: boolean }>();
const emit = defineEmits<{
  'update:open': [v: boolean];
  edit: [a: Appointment];
  complete: [a: Appointment];
  cancel: [a: Appointment];
  noShow: [a: Appointment];
  remove: [a: Appointment];
  openChat: [convId: string];
  openContact: [contactId: string];
}>();

const typeText = computed(() => (props.appointment ? typeLabel(props.appointment.type) : ''));
const statusText = computed(() => (props.appointment ? statusLabel(props.appointment.status) : ''));
const ownerText = computed(() => (props.appointment ? appointmentOwnerName(props.appointment as AppointmentEx) : ''));
const canComplete = computed(() => !!props.appointment && ['scheduled', 'overdue'].includes(props.appointment.status));
const whenText = computed(() => {
  const a = props.appointment;
  if (!a) return '';
  const m = a.durationMin ?? 15;
  return `${appointmentTimeText(a)} · ${dayLabel(appointmentDayKey(a), orgDayKey(new Date()))} · ${m >= 60 && m % 60 === 0 ? `${m / 60} giờ` : `${m} phút`}`;
});
const contactText = computed(() => {
  const c = props.appointment?.contact;
  if (!c) return 'Khách chưa rõ';
  const phone = displayPhone(c.phone);
  return phone ? `${c.fullName || 'Khách chưa đặt tên'} · ${phone}` : (c.fullName || 'Khách chưa đặt tên');
});
</script>

<style scoped>
.crm-ad { padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-4); }
.crm-ad__title { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 700; overflow-wrap: anywhere; }
.crm-ad__dl { margin: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-ad__dl > div { display: flex; flex-direction: column; gap: 2px; }
.crm-ad__dl dt { font-size: 12px; font-weight: 650; color: var(--m-muted); }
.crm-ad__dl dd { margin: 0; overflow-wrap: anywhere; }
.crm-ad__notes { white-space: pre-wrap; }
.crm-ad__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--m-space-2); }
.crm-ad__btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-ad__btn--primary { grid-column: 1 / -1; border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-ad__btn--danger { color: var(--m-danger); border-color: var(--m-danger); }
.crm-ad__btn:disabled { opacity: 0.6; cursor: default; }
.crm-ad__btn:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
