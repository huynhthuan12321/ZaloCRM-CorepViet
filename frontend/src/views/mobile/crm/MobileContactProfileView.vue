<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Route /contacts/:id/profile trên mobile (LOCK D-3). Shell dựng header "Hồ sơ khách hàng" + nút quay lại (goBack, fallback /contacts)
  và ẩn tabbar (màn chi tiết). View adapter: gọi composable, mở đúng hội thoại, đặt lịch, sửa, xóa có xác nhận.
-->
<template>
  <div class="crm-mobile-profile">
    <CustomerProfile
      :contact="detail.contact.value"
      :conversations="detail.conversations.value"
      :state="detail.state.value"
      :can-edit="canEdit"
      :profile="detail.profile.value"
      :profile-missing="detail.state.value === 'ready' && !detail.profile.value"
      @message="onMessage"
      @schedule="openSchedule"
      @edit="openEdit"
      @open-activity="openActivity"
      @retry="detail.load"
    />

    <div v-if="detail.state.value === 'ready' && canDelete" class="crm-mobile-profile__danger">
      <button type="button" class="crm-mobile-profile__delete" :disabled="detail.deleting.value" @click="onDelete">
        <i class="mdi mdi-trash-can-outline" aria-hidden="true" />Xóa khách hàng
      </button>
    </div>

    <CustomerConversationPicker v-model:open="pickerOpen" :contact-id="contactId" :options="detail.conversations.value" @select="openConversation" />
    <ContactFormSheet v-model:open="editOpen" :contact="detail.contact.value" :saving="detail.saving.value" :error="editError" @submit="onSaveEdit" />
    <AppointmentSheet
      v-model:open="scheduleOpen"
      :initial="scheduleInitial"
      :saving="agenda.saving.value"
      :error="scheduleError"
      :timezone-label="timezoneLabel"
      :contact-name="scheduleContactName"
      :users="agenda.userOptions.value"
      @submit="onSubmitSchedule"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import { openContactChat } from '@/composables/use-open-contact-chat';
import { orgDayKey, useOrgTimezone } from '@/composables/use-org-timezone';
import { useMobileContactDetail } from '@/composables/mobile-crm/use-mobile-contact-detail';
import { useMobileAgenda } from '@/composables/mobile-crm/use-mobile-agenda';
import CustomerProfile from '@/components/mobile/crm/CustomerProfile.vue';
import CustomerConversationPicker from '@/components/mobile/crm/CustomerConversationPicker.vue';
import ContactFormSheet from '@/components/mobile/crm/ContactFormSheet.vue';
import AppointmentSheet from '@/components/mobile/crm/AppointmentSheet.vue';
import { suggestStart } from '@/components/mobile/crm/agenda-model';
import { buildContactPayload, type ContactFormState } from '@/components/mobile/crm/contact-form-model';
import { contactName, resolveContactAction } from '@/components/mobile/crm/crm-model';
import type { AppointmentDraft } from '@/components/mobile/crm/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const { confirm } = useConfirm();
const { orgTimezoneLabel } = useOrgTimezone();

const contactId = computed(() => String(route.params.id || ''));
const detail = useMobileContactDetail(contactId);
const agenda = useMobileAgenda();

// Quyền ẩn/hiện nút như desktop (grant contact.<action>); server vẫn enforce.
const canEdit = computed(() => resolveContactAction(auth.user, 'update'));
const canDelete = computed(() => resolveContactAction(auth.user, 'delete'));

const pickerOpen = ref(false);
const editOpen = ref(false);
const editError = ref('');
const scheduleOpen = ref(false);
const scheduleError = ref('');
const timezoneLabel = computed(() => orgTimezoneLabel.value);
const scheduleContactName = computed(() => (detail.contact.value ? contactName(detail.contact.value) : ''));
const scheduleInitial = ref<Partial<AppointmentDraft>>({});

async function onMessage(id: string) {
  const options = detail.conversations.value;
  if (options.length >= 2) { pickerOpen.value = true; return; }
  if (options.length === 1) { openConversation(options[0].convId); return; }
  await openContactChat(router, id); // 0 hội thoại: server resolve/tạo, hoặc toast lý do.
}
function openConversation(convId: string) {
  void router.push({ name: 'Chat', params: { convId } });
}
function openActivity(id: string) {
  void router.push({ name: 'CustomerActivityLog', params: { id } });
}
function openEdit() {
  editError.value = '';
  editOpen.value = true;
}
function openSchedule() {
  scheduleError.value = '';
  scheduleInitial.value = {
    contactId: contactId.value,
    title: detail.contact.value ? `Hẹn ${contactName(detail.contact.value)}` : '',
    appointmentDate: suggestStart(orgDayKey(new Date())),
    assignedUserId: auth.user?.id ?? null,
  };
  scheduleOpen.value = true;
  void agenda.ensureUsers();
}

async function onSaveEdit(form: ContactFormState) {
  editError.value = '';
  const updated = await detail.updateContact(contactId.value, buildContactPayload(form, detail.contact.value));
  if (!updated) {
    editError.value = 'Không lưu được thay đổi. Kiểm tra kết nối rồi thử lại.';
    return;
  }
  detail.applyUpdated(updated);
  editOpen.value = false;
  toast.success('Đã lưu hồ sơ khách');
}

async function onSubmitSchedule(draft: AppointmentDraft) {
  scheduleError.value = '';
  const res = await agenda.create(draft, { refresh: false });
  if (!res.ok) { scheduleError.value = res.error; return; }
  scheduleOpen.value = false;
  toast.success('Đã tạo lịch hẹn');
}

async function onDelete() {
  const c = detail.contact.value;
  if (!c) return;
  const ok = await confirm({
    title: 'Xóa khách hàng này?',
    message: `${contactName(c)} và dữ liệu liên quan sẽ bị xóa. Không thể hoàn tác.`,
    confirmText: 'Xóa khách hàng',
    cancelText: 'Giữ lại',
    tone: 'danger',
  });
  if (!ok) return;
  const done = await detail.deleteContact(c.id);
  if (!done) { toast.error('Không xóa được khách hàng'); return; }
  toast.success('Đã xóa khách hàng');
  await router.replace({ name: 'Contacts' });
}

watch(contactId, () => { void detail.load(); });
onMounted(() => { void detail.load(); });
</script>

<style scoped>
.crm-mobile-profile { min-height: 100%; }
.crm-mobile-profile__danger { padding: 0 var(--m-gutter) var(--m-space-8); }
.crm-mobile-profile__delete {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 48px;
  border: 1px solid var(--m-danger); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-danger);
  font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-mobile-profile__delete:disabled { opacity: 0.6; cursor: default; }
.crm-mobile-profile__delete:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
