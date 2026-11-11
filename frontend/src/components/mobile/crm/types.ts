// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Hợp đồng kiểu CRM mobile (CONTRACT-A §2.4). crm sở hữu. Presenter chỉ nhận props / emit sự kiện có kiểu,
 * KHÔNG gọi API; view adapter (MobileContactView, views/mobile/crm/*) mới gọi composable.
 */
import type { Contact, ContactFilters } from '@/composables/use-contacts';
import type { UrgentItem, MeResponse } from '@/composables/use-dashboard-action-hub';

export type ListState = 'ready' | 'loading' | 'error' | 'offline';

export interface MobileContactListProps {
  contacts: Contact[];
  total: number;
  filters: ContactFilters;
  state: ListState;
  loadingMore: boolean;
  hasMore: boolean;
  canCreate: boolean;
}
export type MobileContactListEmits = {
  'update:filters': [f: Partial<ContactFilters>];
  openProfile: [contactId: string];
  create: [];
  loadMore: [];
  retry: [];
};

export interface ContactCardProps {
  contact: Contact;
  statusLabel: string;
  ownerName: string | null;
  /** Số người cùng chăm ngoài người phụ trách chính (D-4: hiện "+N"). */
  ownerExtra?: number;
  /** Số nick Zalo đang chăm khách (không bịa tên nick: list API chỉ có số lượng). */
  nickCount?: number;
}
export type ContactCardEmits = { openProfile: [contactId: string] };

export interface ConversationOption {
  convId: string;
  nickName: string;
  ownerName: string | null;
}

export interface CustomerProfileProps {
  contact: Contact | null;
  conversations: ConversationOption[];
  state: 'ready' | 'loading' | 'missing' | 'forbidden' | 'offline' | 'error';
  canEdit: boolean;
}
export type CustomerProfileEmits = {
  message: [contactId: string];
  schedule: [contactId: string];
  edit: [contactId: string];
  openActivity: [contactId: string];
};

export interface CustomerConversationPickerProps {
  open: boolean;
  contactId: string;
  options: CustomerProfileProps['conversations'];
}
export type CustomerConversationPickerEmits = { 'update:open': [v: boolean]; select: [convId: string] };

export interface MobileOverviewProps {
  me: MeResponse | null;
  urgent: UrgentItem[];
  state: ListState;
  canSwitchScope: boolean;
}
export type MobileOverviewEmits = {
  openConversation: [convId: string];
  openInbox: [filter: 'unreplied' | 'all'];
  openAppointment: [id: string];
  changeScope: [];
  retry: [];
};

export interface AppointmentDraft {
  contactId: string;
  title: string;
  /** "YYYY-MM-DDTHH:mm" theo wall-clock múi giờ tổ chức (không phải giờ máy). */
  appointmentDate: string;
  durationMin: number;
  type: string;
  notes: string;
  assignedUserId: string | null;
  conversationId?: string | null;
}
export interface AppointmentSheetProps {
  open: boolean;
  initial: Partial<AppointmentDraft>;
  saving: boolean;
  error: string;
  timezoneLabel: string;
}
export type AppointmentSheetEmits = { 'update:open': [v: boolean]; submit: [draft: AppointmentDraft] };
