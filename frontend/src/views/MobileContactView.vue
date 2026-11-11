<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Route /contacts trên mobile (view adapter, CONTRACT-A §2.4). Chỉ nơi này gọi composable: danh sách thẻ, tìm kiếm,
  lọc bottom sheet hai pha, tải tiếp, tạo khách. Mở hồ sơ -> /contacts/:id/profile (màn riêng, có nút quay lại).
  KHÔNG mount desktop (ContactsView là wrapper) nên không có fetch desktop chạy trên mobile.
-->
<template>
  <div class="crm-mobile-contacts">
    <MobileContactList
      :contacts="contacts.items.value"
      :total="contacts.total.value"
      :filters="contacts.filters"
      :state="contacts.state.value"
      :loading-more="contacts.loadingMore.value"
      :has-more="contacts.hasMore.value"
      :can-create="canCreate"
      @update:filters="onUpdateFilters"
      @open-filter="openFilter"
      @open-profile="openProfile"
      @create="openCreate"
      @load-more="contacts.loadMore"
      @retry="contacts.reload"
    />

    <ContactFilterSheet
      v-model:open="filterOpen"
      :value="filterValue"
      :users="userOptions"
      :users-state="usersState"
      @apply="contacts.applyFilters"
      @clear="onClearFilters"
      @retry-users="loadUsers"
    />

    <ContactFormSheet v-model:open="formOpen" :contact="null" :saving="contacts.saving.value" :error="formError" @submit="onCreate" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useUsers } from '@/composables/use-users';
import { useMobileContacts } from '@/composables/mobile-crm/use-mobile-contacts';
import MobileContactList from '@/components/mobile/crm/MobileContactList.vue';
import ContactFilterSheet, { type ContactFilterValue } from '@/components/mobile/crm/ContactFilterSheet.vue';
import ContactFormSheet from '@/components/mobile/crm/ContactFormSheet.vue';
import { resolveCanCreateContact } from '@/components/mobile/crm/crm-model';
import { buildContactPayload, type ContactFormState } from '@/components/mobile/crm/contact-form-model';
import type { ContactFilters } from '@/composables/use-contacts';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const contacts = useMobileContacts();
const usersApi = useUsers();

const canCreate = computed(() => resolveCanCreateContact(auth.user));

const filterOpen = ref(false);
const formOpen = ref(false);
const formError = ref('');
const usersState = ref<'ready' | 'loading' | 'error'>('ready');
const usersLoaded = ref(false);

const filterValue = computed<ContactFilterValue>(() => ({
  status: contacts.filters.status ?? '',
  source: contacts.filters.source ?? '',
  assignedUserId: contacts.filters.assignedUserId ?? '',
}));

// Danh sách người phụ trách: /users như desktop; lỗi -> suy ra từ khách đã tải (cùng fallback desktop).
const userOptions = computed(() => {
  if (usersApi.users.value.length) return usersApi.users.value.map(u => ({ id: u.id, fullName: u.fullName }));
  const seen = new Map<string, { id: string; fullName: string }>();
  for (const c of contacts.items.value) {
    if (c.assignedUser?.id && !seen.has(c.assignedUser.id)) seen.set(c.assignedUser.id, { id: c.assignedUser.id, fullName: c.assignedUser.fullName || '—' });
  }
  return [...seen.values()];
});

async function loadUsers() {
  usersState.value = 'loading';
  await usersApi.fetchUsers();
  usersLoaded.value = !usersApi.error.value;
  usersState.value = usersApi.error.value && userOptions.value.length === 0 ? 'error' : 'ready';
}

function openFilter() {
  filterOpen.value = true;
  if (!usersLoaded.value && usersState.value !== 'loading') void loadUsers();
}

function onUpdateFilters(f: Partial<ContactFilters>) {
  if (f.search !== undefined && Object.keys(f).length === 1) {
    contacts.setSearch(f.search);
    return;
  }
  // "Xóa bộ lọc" từ trạng thái rỗng: xóa cả tìm kiếm lẫn ba bộ lọc.
  contacts.clearFilters();
}

function onClearFilters() { contacts.applyFilters({ status: '', source: '', assignedUserId: '' }); }

function openProfile(contactId: string) {
  void router.push({ name: 'ContactProfile', params: { id: contactId } });
}

function openCreate() {
  formError.value = '';
  formOpen.value = true;
}

async function onCreate(form: ContactFormState) {
  formError.value = '';
  const created = await contacts.createContact(buildContactPayload(form));
  if (!created) {
    formError.value = 'Không lưu được khách hàng. Kiểm tra kết nối rồi thử lại.';
    return;
  }
  formOpen.value = false;
  toast.success('Đã thêm khách hàng');
}

onMounted(() => { void contacts.reload(); });
</script>

<style scoped>
.crm-mobile-contacts { min-height: 100%; }
</style>
