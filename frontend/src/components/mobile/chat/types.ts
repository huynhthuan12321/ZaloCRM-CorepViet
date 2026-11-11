// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { Conversation } from '@/composables/use-chat';

/** Hợp đồng kiểu của chat mobile (CONTRACT-A §2.3). Chat sở hữu; presenter KHÔNG gọi API/socket. */

export interface ConversationContext {
  /** Nick Zalo gửi/nhận: conversation.zaloAccount?.displayName ?? channelAccount?.displayName ?? 'Không rõ nick'. */
  nickName: string;
  /** 'Zalo' | 'Kênh thử nghiệm'. KHÔNG có TikTok (D-1). */
  channelLabel: string;
  /** contact.assignedUser?.fullName (hoặc suy từ contactAccess primary); null -> hiện 'Chưa phân công'. */
  ownerName: string | null;
  /** Số người CÙNG chăm ngoài người phụ trách (D-4: hiện '+N'). 0 = không hiện. */
  ownerExtra: number;
  archivedNick: boolean;
  virtual: boolean;
  privateNick: boolean;
  /** Hội thoại Zalo thật (không phải kênh khác) - route attachments chỉ nhận Zalo. */
  isZalo: boolean;
}

export interface InboxFilters {
  unread: boolean;
  unreplied: boolean;
  /** Của tôi: assignedUserId = user hiện tại (backend /conversations đã hỗ trợ). */
  mine: boolean;
  assignedUserId?: string | null;
  accountId: string | null;
}

export type InboxViewState = 'ready' | 'loading' | 'error' | 'offline';

export interface InboxAccountOption {
  id: string;
  displayName: string;
}

export interface MobileInboxProps {
  conversations: Conversation[];
  query: string;
  filters: InboxFilters;
  state: InboxViewState;
  hasMore: boolean;
  loadingMore: boolean;
  accounts: InboxAccountOption[];
  selectedId?: string | null;
  canChooseSale?: boolean;
  saleUsers?: import('@/composables/use-inbox-sales').InboxSaleOption[];
  salesLoading?: boolean;
  salesError?: string;
  currentUserName?: string;
}
export type MobileInboxEmits = {
  'update:query': [q: string];
  'update:filters': [f: InboxFilters];
  select: [convId: string];
  loadMore: [];
  retry: [];
  compose: [];
};

export interface ConversationRowProps {
  conversation: Conversation;
  context: ConversationContext;
  /** Nội dung tin cuối bị che (nick riêng tư, chưa mở khóa). */
  blurPreview?: boolean;
  selected?: boolean;
}
export type ConversationRowEmits = { select: [convId: string] };

export type AttachmentKind = 'image' | 'camera' | 'video' | 'document' | 'library';

export interface AttachmentSheetProps {
  open: boolean;
  /** Snapshot lúc mở sheet: sheet tự đóng nếu hội thoại đang mở khác giá trị này. */
  conversationId: string;
  currentConversationId: string | null;
  customerName: string;
  context: ConversationContext;
  /** offline || archivedNick || virtual || !zalo || sending. */
  disabled: boolean;
  disabledReason?: string;
}
export type AttachmentSheetEmits = {
  'update:open': [open: boolean];
  pick: [payload: { kind: Exclude<AttachmentKind, 'library'>; files: File[]; conversationId: string }];
  openLibrary: [conversationId: string];
  rejected: [reasons: string[]];
};

export interface AISuggestionSheetProps {
  open: boolean;
  conversationId: string;
  suggestion: string;
  sources: string[];
  loading: boolean;
  error: string;
  needsReviewReason: string;
  enabled: boolean;
  remaining?: number | null;
  currentDraft: string;
}
export type AISuggestionSheetEmits = {
  'update:open': [open: boolean];
  ask: [];
  applyDraft: [payload: { conversationId: string; text: string; mode: 'replace' | 'append' }];
};

export type ThreadBackButtonEmits = { back: [] };
