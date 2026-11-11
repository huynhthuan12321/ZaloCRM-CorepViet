// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Trạng thái KH trên mobile. Cùng endpoint/payload với StatusManagement (desktop): GET/POST /settings/statuses, PUT/DELETE /settings/statuses/:id,
 * POST /settings/statuses/reorder. Backend + RBAC (route /settings/crm/statuses cần resource 'settings') giữ nguyên.
 */
import { ref } from 'vue';
import { api } from '@/api';
import { useMobile } from '@/composables/use-mobile';
import { useToast } from '@/composables/use-toast';
import { apiErrorMessage, classifyLoadError, type SettingsLoadState } from './load-state';

export interface MobileStatus { id: string; name: string; order: number; color: string | null; isTerminal: boolean; isDefault: boolean }
export interface StatusForm { name: string; order: number; color: string; isTerminal: boolean; isDefault: boolean }
export const DEFAULT_STATUS_COLOR = '#9CA3AF';

export function emptyStatusForm(count: number): StatusForm {
  return { name: '', order: count + 1, color: DEFAULT_STATUS_COLOR, isTerminal: false, isDefault: false };
}
export function statusToForm(s: MobileStatus): StatusForm {
  return { name: s.name, order: s.order, color: s.color || DEFAULT_STATUS_COLOR, isTerminal: s.isTerminal, isDefault: s.isDefault };
}
export function isStatusFormDirty(a: StatusForm, b: StatusForm): boolean {
  return a.name !== b.name || a.order !== b.order || a.color !== b.color || a.isTerminal !== b.isTerminal || a.isDefault !== b.isDefault;
}
export function validateStatusForm(f: StatusForm): string {
  return f.name.trim() ? '' : 'Tên không được trống';
}
/**
 * Hoán đổi order với hàng liền kề (giống moveStatus desktop). null = không di chuyển được.
 * Nếu hai hàng trùng order (hoặc order không liên tục theo cặp này) thì hoán đổi sẽ vô nghĩa -> đánh số lại toàn bộ 1..n theo thứ tự mới
 * (vẫn là POST /settings/statuses/reorder {items:[{id,order}]}), để bấm lên/xuống luôn có tác dụng thật.
 */
export function reorderPayload(list: MobileStatus[], id: string, delta: -1 | 1): { items: Array<{ id: string; order: number }> } | null {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex(x => x.id === id);
  const t = sorted[i + delta];
  if (i < 0 || !t) return null;
  if (sorted[i].order === t.order) {
    const next = [...sorted];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    return { items: next.map((s, k) => ({ id: s.id, order: k + 1 })) };
  }
  return { items: [{ id, order: t.order }, { id: t.id, order: sorted[i].order }] };
}
/** Áp payload sắp xếp lên danh sách cục bộ (cập nhật tức thì khi làm mới danh sách thất bại, tránh hiển thị thứ tự cũ). */
export function applyReorder(list: MobileStatus[], payload: { items: Array<{ id: string; order: number }> }): MobileStatus[] {
  const m = new Map(payload.items.map((x) => [x.id, x.order]));
  return list.map((s) => (m.has(s.id) ? { ...s, order: m.get(s.id)! } : s)).sort((a, b) => a.order - b.order);
}
/** Nền chip = màu người dùng chọn ở 18% alpha; chữ dùng token văn bản (đọc được ở cả Sáng/Tối, không phụ thuộc màu chọn). */
export function chipBackground(hex: string | null): string {
  const m = hex?.match(/^#([0-9a-f]{6})$/i);
  if (!m) return 'rgba(120,130,150,0.18)';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.18)`;
}

export function useMobileStatuses() {
  const { isOnline } = useMobile();
  const toast = useToast();
  const items = ref<MobileStatus[]>([]);
  const state = ref<SettingsLoadState>('loading');
  const saving = ref(false);
  const formError = ref('');
  let seq = 0;

  async function load(silent = false): Promise<void> {
    const mine = ++seq;
    if (!silent) state.value = 'loading';
    try {
      const res = await api.get<{ statuses: MobileStatus[] }>('/settings/statuses');
      if (mine !== seq) return;
      items.value = [...(res.data.statuses || [])].sort((a, b) => a.order - b.order);
      state.value = 'ready';
    } catch (err) {
      if (mine !== seq) return;
      if (silent) toast.error('Không làm mới được danh sách');
      else state.value = classifyLoadError(err, isOnline.value);
    }
  }

  async function save(form: StatusForm, editingId: string | null): Promise<boolean> {
    const problem = validateStatusForm(form);
    if (problem) { formError.value = problem; return false; }
    saving.value = true;
    formError.value = '';
    try {
      if (editingId) await api.put(`/settings/statuses/${editingId}`, form);
      else await api.post('/settings/statuses', form);
      toast.success(editingId ? 'Đã cập nhật' : 'Đã tạo Trạng thái');
      await load(true);
      return true;
    } catch (err) {
      formError.value = apiErrorMessage(err, 'Lưu thất bại');
      return false;
    } finally { saving.value = false; }
  }

  async function remove(id: string): Promise<boolean> {
    saving.value = true;
    try {
      await api.delete(`/settings/statuses/${id}`);
      toast.success('Đã xóa');
      await load(true);
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Xóa thất bại'));
      return false;
    } finally { saving.value = false; }
  }

  async function move(id: string, delta: -1 | 1): Promise<void> {
    const payload = reorderPayload(items.value, id, delta);
    if (!payload || saving.value) return;
    saving.value = true;
    try {
      await api.post('/settings/statuses/reorder', payload);
      items.value = applyReorder(items.value, payload);
      await load(true);
    } catch {
      toast.error('Reorder thất bại');
    } finally { saving.value = false; }
  }

  return { items, state, saving, formError, load, save, remove, move };
}
