<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Route /appointments trên mobile (LOCK D-2). Agenda theo ngày (tuần theo múi giờ tổ chức), tạo/sửa trong AppointmentSheet
  toàn chiều cao, hoàn thành/hủy/vắng/xóa có xác nhận (ConfirmHost). Giữ API useAppointments cũ. Chiều cao do shell cấp
  (không 100vh). Nút tạo nổi nằm TRÊN tabbar và nút Hội thoại.
-->
<template>
  <div class="crm-agenda">
    <AgendaDayStrip
      :days="agenda.days.value"
      :selected="agenda.selectedDay.value"
      :today="agenda.today.value"
      :counts="agenda.countsByDay.value"
      @select="agenda.selectDay"
      @shift-week="agenda.shiftWeek"
      @today="agenda.goToday"
    />

    <div class="crm-agenda__bar">
      <h2 class="crm-agenda__day">{{ dayTitle }}</h2>
      <button type="button" class="crm-agenda__filter" :class="{ 'crm-agenda__filter--on': filterActive }" :aria-label="filterActive ? 'Lọc lịch hẹn, đang bật bộ lọc' : 'Lọc lịch hẹn'" @click="openFilter">
        <i class="mdi mdi-tune-variant" aria-hidden="true" /><span>Lọc</span>
      </button>
    </div>

    <div v-if="agenda.appointments.value.length && (agenda.state.value === 'error' || agenda.state.value === 'offline')" class="crm-agenda__banner" role="alert">
      <span>{{ agenda.state.value === 'offline' ? 'Đang mất kết nối, lịch có thể chưa mới.' : 'Không cập nhật được lịch hẹn.' }}</span>
      <button type="button" class="crm-agenda__link" @click="agenda.fetchWeek">Thử lại</button>
    </div>

    <MobileFeedback v-if="agenda.state.value === 'loading'" state="loading" title="Đang tải lịch hẹn" />
    <MobileFeedback
      v-else-if="!agenda.appointments.value.length && (agenda.state.value === 'error' || agenda.state.value === 'offline')"
      :state="agenda.state.value" retryable @retry="agenda.fetchWeek"
    />
    <MobileFeedback
      v-else-if="!agenda.dayItems.value.length"
      state="empty" title="Không có lịch hẹn trong ngày này"
      :description="agenda.hiddenByFilter.value > 0 ? `${agenda.hiddenByFilter.value} lịch hẹn trong tuần đang bị ẩn bởi bộ lọc.` : 'Bấm nút + để tạo lịch hẹn mới.'"
      :clearable="agenda.hiddenByFilter.value > 0" @clear-filters="resetFilters"
    />
    <ul v-else class="crm-agenda__list">
      <li v-for="a in agenda.dayItems.value" :key="a.id"><AppointmentCard :appointment="a" @open="openDetail" /></li>
    </ul>

    <button v-if="canCreate" type="button" class="crm-agenda__fab" :style="{ bottom: fabBottom }" aria-label="Tạo lịch hẹn" @click="openCreate">
      <i class="mdi mdi-plus" aria-hidden="true" />
    </button>

    <AppointmentActionsSheet
      v-model:open="detailOpen" :appointment="selected" :busy="agenda.saving.value || agenda.deleting.value"
      @edit="openEdit" @complete="onComplete" @cancel="onCancel" @no-show="onNoShow" @remove="onRemove"
      @open-chat="openChat" @open-contact="openContact"
    />
    <AppointmentSheet
      v-model:open="formOpen" :editing="!!editing" :initial="formInitial" :saving="agenda.saving.value" :error="formError"
      :timezone-label="timezoneLabel" :contact-name="formContactName" :users="agenda.userOptions.value"
      :contact-results="contactResults" :searching="searching" @search-contact="onSearchContact" @submit="onSubmit"
    />
    <AgendaFilterSheet
      v-model:open="filterOpen" :mode="agenda.statusMode.value" :assignee="agenda.assignee.value" :users="agenda.userOptions.value" @apply="applyFilter"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { useOrgTimezone } from '@/composables/use-org-timezone';
import { useToast } from '@/composables/use-toast';
import type { Appointment } from '@/composables/use-appointments';
import { useMobileAgenda } from '@/composables/mobile-crm/use-mobile-agenda';
import { useShellBottomInset } from '@/composables/mobile-crm/use-shell-bottom-inset';
import AgendaDayStrip from '@/components/mobile/crm/AgendaDayStrip.vue';
import AppointmentCard from '@/components/mobile/crm/AppointmentCard.vue';
import AppointmentActionsSheet from '@/components/mobile/crm/AppointmentActionsSheet.vue';
import AppointmentSheet from '@/components/mobile/crm/AppointmentSheet.vue';
import AgendaFilterSheet from '@/components/mobile/crm/AgendaFilterSheet.vue';
import { appointmentToDraft, dayLabel, suggestStart, type StatusMode } from '@/components/mobile/crm/agenda-model';
import type { AppointmentDraft } from '@/components/mobile/crm/types';

const router = useRouter();
const toast = useToast();
const agenda = useMobileAgenda();
const fabBottom = useShellBottomInset();
const { orgTimezoneLabel } = useOrgTimezone();
const timezoneLabel = computed(() => orgTimezoneLabel.value);

const canCreate = true; // Tạo lịch hẹn không có resource riêng ở desktop (route chỉ requiresAuth); server enforce.

const detailOpen = ref(false);
const formOpen = ref(false);
const filterOpen = ref(false);
const selectedId = ref<string | null>(null);
const editing = ref<Appointment | null>(null);
const formInitial = ref<Partial<AppointmentDraft>>({});
const formError = ref('');
const contactResults = ref<Array<{ id: string; name: string; phone: string | null }>>([]);
const searching = ref(false);
const formContactName = ref('');

const selected = computed(() => agenda.appointments.value.find(a => a.id === selectedId.value) ?? null);
const dayTitle = computed(() => {
  const n = agenda.dayItems.value.length;
  return `${dayLabel(agenda.selectedDay.value, agenda.today.value)}${n ? ` · ${n} lịch hẹn` : ''}`;
});
const filterActive = computed(() => agenda.statusMode.value !== 'open' || agenda.assignee.value !== 'me');

function openDetail(id: string) { selectedId.value = id; detailOpen.value = true; }
function openFilter() { filterOpen.value = true; void agenda.ensureUsers(); }
function applyFilter(v: { mode: StatusMode; assignee: string }) { agenda.statusMode.value = v.mode; agenda.assignee.value = v.assignee; }
function resetFilters() { applyFilter({ mode: 'all', assignee: 'all' }); }

function openCreate() {
  editing.value = null;
  formError.value = '';
  contactResults.value = [];
  formContactName.value = '';
  formInitial.value = {
    appointmentDate: suggestStart(agenda.selectedDay.value),
    assignedUserId: agenda.currentUserId.value,
  };
  formOpen.value = true;
  void agenda.ensureUsers();
}

function openEdit(a: Appointment) {
  editing.value = a;
  formError.value = '';
  formContactName.value = a.contact?.fullName ?? '';
  formInitial.value = appointmentToDraft(a);
  detailOpen.value = false;
  formOpen.value = true;
  void agenda.ensureUsers();
}

async function onSearchContact(q: string) {
  searching.value = true;
  try {
    const rows = await agenda.searchContacts(q);
    contactResults.value = rows.map(c => ({ id: c.id, name: c.crmName?.trim() || c.fullName?.trim() || 'Khách chưa đặt tên', phone: c.phone }));
  } finally {
    searching.value = false;
  }
}

async function onSubmit(draft: AppointmentDraft) {
  formError.value = '';
  const res = editing.value ? await agenda.update(editing.value.id, draft) : await agenda.create(draft);
  if (!res.ok) { formError.value = res.error; return; }
  toast.success(editing.value ? 'Đã cập nhật lịch hẹn' : 'Đã tạo lịch hẹn');
  formOpen.value = false;
  editing.value = null;
}

async function onComplete(a: Appointment) { if (await agenda.complete(a)) detailOpen.value = false; }
// ConfirmHost toàn cục ở dưới lớp MobileSheet: đóng sheet trước khi hỏi để không bị che/inert.
// Người dùng chọn Giữ lại hoặc API lỗi: trả lại đúng chi tiết đang xem, không mở sang lịch khác.
async function confirmDetailAction(a: Appointment, action: (item: Appointment) => Promise<boolean>) {
  detailOpen.value = false;
  await nextTick();
  const ok = await action(a);
  if (!ok && selectedId.value === a.id) detailOpen.value = true;
  return ok;
}
async function onCancel(a: Appointment) { await confirmDetailAction(a, agenda.cancel); }
async function onNoShow(a: Appointment) { await confirmDetailAction(a, agenda.noShow); }
async function onRemove(a: Appointment) { if (await confirmDetailAction(a, agenda.remove)) selectedId.value = null; }

function openChat(convId: string) { detailOpen.value = false; void router.push({ name: 'Chat', params: { convId } }); }
function openContact(contactId: string) { detailOpen.value = false; void router.push({ name: 'ContactProfile', params: { id: contactId } }); }

onMounted(() => { void agenda.fetchWeek(); });
</script>

<style scoped>
.crm-agenda { display: flex; flex-direction: column; min-height: 100%; }
.crm-agenda :deep(.crm-strip) { position: sticky; top: 0; z-index: 5; }
/* Màn thấp nằm ngang (SHORT_LANDSCAPE_MEDIA_QUERY): dải ngày cuộn cùng nội dung để dành chỗ cho danh sách. */
@media (max-height: 500px) and (orientation: landscape) {
  .crm-agenda :deep(.crm-strip) { position: static; }
}
.crm-agenda__bar { display: flex; align-items: center; gap: var(--m-space-2); padding: var(--m-space-3) var(--m-gutter) var(--m-space-1); }
.crm-agenda__day { flex: 1; min-width: 0; margin: 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-agenda__filter {
  flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-agenda__filter--on { border-color: var(--m-brand-strong); background: var(--m-brand-soft); color: var(--m-brand-strong); }
.crm-agenda__banner {
  display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); margin: var(--m-space-2) var(--m-gutter) 0; padding: var(--m-space-2) var(--m-space-3);
  border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-size: var(--m-font-meta); font-weight: 600;
}
.crm-agenda__link { min-height: var(--m-touch); padding: 0 var(--m-space-2); border: 0; background: none; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
.crm-agenda__list { list-style: none; margin: 0; padding: var(--m-space-2) var(--m-gutter) calc(56px + var(--m-space-8)); display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-agenda__fab {
  position: fixed; right: max(var(--m-gutter), var(--m-safe-right)); z-index: 25; display: inline-grid; place-items: center; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 50%;
  background: var(--m-brand-strong); color: var(--m-on-action); font-size: 28px; box-shadow: var(--m-shadow); cursor: pointer; touch-action: manipulation;
}
.crm-agenda__fab:active { transform: scale(0.97); }
.crm-agenda__filter:focus-visible, .crm-agenda__fab:focus-visible, .crm-agenda__link:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
