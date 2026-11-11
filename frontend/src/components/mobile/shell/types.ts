// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { RouteLocationRaw } from 'vue-router';

/** Hợp đồng kiểu của shell mobile (CONTRACT-A §2.2). Shell sở hữu; chat/crm chỉ import. */
export type MobileTabKey = 'overview' | 'contacts' | 'chat' | 'agenda' | 'account';

export interface MobileTabItem {
  key: MobileTabKey;
  label: string; // 'Tổng quan' | 'Khách hàng' | 'Hội thoại' | 'Lịch hẹn' | 'Tài khoản'
  icon: string; // mdi-*
  to: RouteLocationRaw;
  prominent?: boolean; // true chỉ cho 'chat' (nút tròn nổi giữa)
  badge?: number | null; // null = không hiện; không hiện 0 khi lỗi tải
  badgeLabel?: string; // aria: 'N khách đang chờ trả lời'
}

export interface MobileTabBarProps {
  items: MobileTabItem[];
  activeKey: MobileTabKey | null;
}
export type MobileTabBarEmits = { navigate: [key: MobileTabKey] };

export interface MobileHeaderAction {
  id: string;
  icon: string;
  label: string;
  disabled?: boolean;
}

export interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean; // root tab = false
  actions?: MobileHeaderAction[]; // tối đa 2
}
export type MobilePageHeaderEmits = { back: []; action: [id: string] };

export interface MobileSheetProps {
  open: boolean; // v-model:open
  title: string;
  dirty?: boolean; // true -> hỏi trước khi đóng
  fullHeight?: boolean;
  persistent?: boolean;
}
export type MobileSheetEmits = { 'update:open': [open: boolean]; close: [] };

export type MobileFeedbackState = 'loading' | 'empty' | 'error' | 'offline' | 'forbidden';
export interface MobileFeedbackProps {
  state: MobileFeedbackState;
  title?: string;
  description?: string;
  retryable?: boolean;
  clearable?: boolean;
}
export type MobileFeedbackEmits = { retry: []; clearFilters: [] };
