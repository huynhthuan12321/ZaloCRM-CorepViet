// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * broadcast-wizard-logic.ts — Logic THUẦN cho Broadcast Wizard (Phase 6 Marketing).
 * Tách khỏi BroadcastsView.vue để test độc lập (repo ưu tiên test logic thuần).
 * Biến broadcast render bởi backend (broadcast-service.renderMessage): {{ten}} {{sdt}}
 * {{ten_khach}} {{phone}} — biến khác gửi nguyên văn → cảnh báo + chặn qua bước.
 */

export const BC_VAR_WHITELIST = ['ten', 'sdt', 'ten_khach', 'phone'];

export interface WizardForm {
  name: string;
  sourceType: 'customer_list' | 'friends';
  customerListId: string;
  zaloAccountId: string;
  messageText: string;
  contentMode: 'text' | 'blocks';
  contentBlockIds: string[];
  scheduleType: 'once' | 'daily' | 'weekly';
  scheduledAtLocal: string;
  timeOfDay: string;
  daysOfWeek: number[];
  maxPerRun: number;
  delaySecMin: number;
  delaySecMax: number;
}

/** Biến {{...}} KHÔNG thuộc whitelist backend render → sẽ gửi nguyên văn. */
export function findUnknownVars(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((v) => !BC_VAR_WHITELIST.includes(v)))];
}

/** Preview theo 1 khách mẫu ("Nguyễn Văn An"). */
export function renderBroadcastPreview(text: string): string {
  const repl: Record<string, string> = { ten: 'An', ten_khach: 'Nguyễn Văn An', sdt: '0901234567', phone: '0901234567' };
  return text.replace(/\{\{\s*(ten_khach|ten|sdt|phone)\s*\}\}/gi, (_m, k) => repl[k.toLowerCase()] ?? _m);
}

export interface StepContext {
  friendCount: number | null;
  audienceWillSend: number | null; // null = chưa đếm; phải > 0 để qua bước 1
}

/** Validate 1 bước wizard. Bước 1 buộc đã đếm audience (willSend > 0). */
export function validateWizardStep(step: number, form: WizardForm, ctx: StepContext): boolean {
  if (step === 1) {
    if (!form.name.trim() || !form.zaloAccountId) return false;
    if (form.sourceType === 'customer_list' && !form.customerListId) return false;
    if (form.sourceType === 'friends' && !ctx.friendCount) return false;
    return ctx.audienceWillSend != null && ctx.audienceWillSend > 0;
  }
  if (step === 2) {
    if (form.contentMode === 'text') return !!form.messageText.trim() && findUnknownVars(form.messageText).length === 0;
    return form.contentBlockIds.length > 0;
  }
  if (step === 3) {
    if (!form.zaloAccountId) return false;
    if (form.scheduleType === 'once' && !form.scheduledAtLocal) return false;
    if (form.scheduleType === 'weekly' && form.daysOfWeek.length === 0) return false;
    return form.delaySecMax >= form.delaySecMin;
  }
  return true; // bước 4 (kiểm tra) gate bằng checkbox + audience ở view
}

/**
 * Payload POST /broadcast-jobs. dryRun=true → status='paused' (NHÁP — cron bỏ qua,
 * KHÔNG gửi Zalo thật). dryRun=false → status undefined (backend default 'active').
 */
export function buildBroadcastPayload(form: WizardForm, dryRun: boolean) {
  return {
    name: form.name,
    sourceType: form.sourceType,
    zaloAccountId: form.zaloAccountId,
    customerListId: form.sourceType === 'customer_list' ? form.customerListId : undefined,
    messageText: form.contentMode === 'text' ? form.messageText : '',
    contentBlockIds: form.contentMode === 'blocks' ? form.contentBlockIds : [],
    scheduleType: form.scheduleType,
    scheduledAt: form.scheduleType === 'once' && form.scheduledAtLocal ? new Date(form.scheduledAtLocal).toISOString() : null,
    timeOfDay: form.scheduleType !== 'once' ? form.timeOfDay : null,
    daysOfWeek: form.scheduleType === 'weekly' ? form.daysOfWeek : [],
    maxPerRun: form.maxPerRun,
    delaySecMin: form.delaySecMin,
    delaySecMax: form.delaySecMax,
    status: dryRun ? ('paused' as const) : undefined,
  };
}
