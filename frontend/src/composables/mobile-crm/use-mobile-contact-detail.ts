// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Hồ sơ khách mobile: ghép `fetchContact` (GET /contacts/:id), `useContactProfile` (GET /contacts/:id/profile,
 * nick + điểm + tag) và hoạt động theo nick (GET /contacts/:id/account-activity — endpoint sẵn có, desktop
 * ContactDetailDialog đã dùng) để biết hội thoại nào thuộc nick nào. Không API mới.
 */
import { computed, ref, type Ref } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { useContacts, type AccountActivityItem, type Contact } from '@/composables/use-contacts';
import { useContactProfile } from '@/composables/use-contact-profile';
import { useMobile } from '@/composables/use-mobile';
import type { ConversationOption, CustomerProfileProps } from '@/components/mobile/crm/types';

export type ProfileState = CustomerProfileProps['state'];

export function conversationOptionsFrom(items: AccountActivityItem[], fallbackOwner: string | null): ConversationOption[] {
  const seen = new Set<string>();
  const out: ConversationOption[] = [];
  for (const it of items) {
    if (!it.conversationId || seen.has(it.conversationId)) continue;
    seen.add(it.conversationId);
    out.push({
      convId: it.conversationId,
      nickName: it.zaloAccount?.displayName?.trim() || 'Nick chưa đặt tên',
      ownerName: fallbackOwner, // Người gửi cuối không phải người phụ trách (CONTRACT-A D-4).
    });
  }
  return out;
}

export function useMobileContactDetail(contactId: Ref<string>) {
  const auth = useAuthStore();
  const { isOnline } = useMobile();
  const contacts = useContacts();
  const profileApi = useContactProfile();

  const contact = ref<Contact | null>(null);
  const activity = ref<AccountActivityItem[]>([]);
  const state = ref<ProfileState>('loading');
  let generation = 0;

  const ownerFallback = computed(() => profileApi.profile.value?.primaryOwner?.userName ?? contact.value?.assignedUser?.fullName ?? null);
  const conversations = computed(() => conversationOptionsFrom(activity.value, ownerFallback.value));

  async function loadActivity(id: string): Promise<AccountActivityItem[]> {
    try {
      const res = await api.get(`/contacts/${id}/account-activity`);
      return res.data?.items ?? [];
    } catch {
      return [];
    }
  }

  async function load(): Promise<void> {
    const id = contactId.value;
    const gen = ++generation;
    contact.value = null;
    activity.value = [];
    if (!id) { state.value = 'missing'; return; }
    if (!auth.canAccess('contact')) { state.value = 'forbidden'; return; }
    state.value = 'loading';
    const [c, , act] = await Promise.all([
      contacts.fetchContact(id),
      profileApi.fetchContactProfile(id),
      loadActivity(id),
    ]);
    if (gen !== generation) return;
    const readStatus = contacts.contactErrorStatus.value ?? profileApi.errorStatus.value;
    if (!c || readStatus === 403 || readStatus === 404) {
      contact.value = null;
      const status = readStatus;
      state.value = status === 403 ? 'forbidden' : status === 404 ? 'missing' : isOnline.value ? 'error' : 'offline';
      return;
    }
    contact.value = c;
    activity.value = act;
    state.value = 'ready';
  }

  function applyUpdated(next: Contact): void {
    contact.value = { ...contact.value, ...next };
  }

  return {
    contact, profile: profileApi.profile, conversations, state, load, applyUpdated,
    updateContact: contacts.updateContact, deleteContact: contacts.deleteContact, saving: contacts.saving, deleting: contacts.deleting,
  };
}
