// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Nhãn KH trên mobile (tab Nhãn bạn bè / Nhãn CRM). Cùng endpoint + payload với TagTaxonomyV2Page (desktop): GET /tags?scope&limit=500,
 * GET /tags/zalo-accounts (lọc theo nick), POST /tags {name,scope,source,color,emoji}, PATCH /tags/:id {name,color,emoji,priority}, DELETE /tags/:id (lưu trữ).
 * Backend POST /tags KHÔNG nhận zaloAccountId (đã đối chiếu tag-routes.ts) nên tạo nhãn bạn bè không cần chọn nick — đúng như desktop.
 * Chưa có trên mobile: gộp nhãn (/tags/merge) và đếm lại lượt dùng (recount) -> Dùng máy tính.
 */
import { ref, computed } from 'vue';
import { api } from '@/api';
import { useMobile } from '@/composables/use-mobile';
import { useToast } from '@/composables/use-toast';
import { apiErrorMessage, classifyLoadError, type SettingsLoadState } from './load-state';

export type TagScope = 'friend' | 'crm';
export interface MobileTag {
  id: string; name: string; slug: string; color: string; emoji: string | null; scope: TagScope; source: string;
  priority: number; usageCount: number; archivedAt: string | null; zaloAccountId?: string | null; zaloAccount: { displayName: string } | null;
}
export interface TagForm { name: string; color: string; emoji: string; priority: number; source: string }
export interface TagNick { id: string; displayName: string; phone?: string | null }
/** Nguồn theo scope — SAO từ SOURCE_META của TagTaxonomyV2Page (desktop). Tạo mới không cho chọn zalo_real (đồng bộ từ Zalo). */
export const SOURCES_BY_SCOPE: Record<TagScope, ReadonlyArray<string>> = {
  friend: ['zalo_real', 'manual_per_nick', 'auto_detect', 'auto_engagement'],
  crm: ['manual_crm', 'ai_suggest', 'segment_rule', 'status', 'import'],
};

export const SOURCE_LABEL: Record<string, string> = {
  zalo_real: 'Zalo Real', manual_per_nick: 'Thủ công theo nick', auto_detect: 'Tự nhận diện', auto_engagement: 'Tự động theo tương tác',
  manual_crm: 'Thủ công CRM', ai_suggest: 'AI gợi ý', segment_rule: 'Quy tắc phân khúc', status: 'Trạng thái', import: 'Nhập file',
};
/** 8 màu Zalo chính thức — GIỐNG desktop (Zalo App chỉ render đúng bộ này). */
export const ZALO_PALETTE: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: '#D91B1B', name: 'Đỏ' }, { hex: '#0068FF', name: 'Xanh dương' }, { hex: '#FF6905', name: 'Cam' }, { hex: '#4BC377', name: 'Xanh lá' },
  { hex: '#FAC000', name: 'Vàng' }, { hex: '#F31BC8', name: 'Hồng' }, { hex: '#6F3FCF', name: 'Tím' }, { hex: '#FF6B6B', name: 'Đỏ nhạt' },
];
export const DEFAULT_TAG_COLOR = '#90A4AE';

export function emptyTagForm(scope: TagScope = 'crm'): TagForm { return { name: '', color: DEFAULT_TAG_COLOR, emoji: '', priority: 99, source: defaultSourceFor(scope) }; }
export function tagToForm(t: MobileTag): TagForm { return { name: t.name, color: t.color, emoji: t.emoji ?? '', priority: t.priority, source: t.source }; }
export function isTagFormDirty(a: TagForm, b: TagForm): boolean {
  return a.name !== b.name || a.color !== b.color || a.emoji !== b.emoji || a.priority !== b.priority || a.source !== b.source;
}
/** Giống desktop: lọc scope, nguồn, nick (client-side), từ khóa theo tên/slug; sắp theo ưu tiên rồi lượt dùng. Desktop không ẩn nhãn đã lưu trữ khỏi tab nên ở đây cũng vậy chỉ khi archivedAt. */
export function filterTags(tags: MobileTag[], scope: TagScope, q: string, source: string | null = null, nickId: string | null = null): MobileTag[] {
  const needle = q.trim().toLowerCase();
  return tags
    .filter(t => t.scope === scope && !t.archivedAt && (!source || t.source === source) && (!nickId || t.zaloAccountId === nickId)
      && (!needle || t.name.toLowerCase().includes(needle) || t.slug.includes(needle)))
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : b.usageCount - a.usageCount));
}
export function defaultSourceFor(scope: TagScope): string { return scope === 'friend' ? 'manual_per_nick' : 'manual_crm'; }

export function useMobileTags() {
  const { isOnline } = useMobile();
  const toast = useToast();
  const tags = ref<MobileTag[]>([]);
  const state = ref<SettingsLoadState>('loading');
  const saving = ref(false);
  const formError = ref('');
  const scope = ref<TagScope>('crm');
  const query = ref('');
  const source = ref<string | null>(null);
  const nickId = ref<string | null>(null);
  const nicks = ref<TagNick[]>([]);
  let seq = 0;

  async function load(silent = false): Promise<void> {
    const mine = ++seq;
    if (!silent) state.value = 'loading';
    try {
      const [f, c, a] = await Promise.all([
        api.get('/tags', { params: { scope: 'friend', limit: 500 } }),
        api.get('/tags', { params: { scope: 'crm', limit: 500 } }),
        // Danh sách nick chỉ phục vụ bộ lọc: lỗi riêng phần này không làm hỏng cả trang (desktop gộp chung nhưng chỉ log).
        api.get('/tags/zalo-accounts').catch(() => null),
      ]);
      if (mine !== seq) return;
      tags.value = [...(f.data.tags ?? []), ...(c.data.tags ?? [])];
      nicks.value = a?.data?.accounts ?? nicks.value;
      state.value = 'ready';
    } catch (err) {
      if (mine !== seq) return;
      if (silent) toast.error('Không làm mới được danh sách');
      else state.value = classifyLoadError(err, isOnline.value);
    }
  }

  async function save(form: TagForm, editing: MobileTag | null): Promise<boolean> {
    if (!form.name.trim()) { formError.value = 'Tên nhãn không được trống'; return false; }
    saving.value = true;
    formError.value = '';
    try {
      if (editing) {
        const res = await api.patch(`/tags/${editing.id}`, { name: form.name, color: form.color, emoji: form.emoji || null, priority: form.priority });
        toast.success(res.data?.pushedZalo ? 'Đã lưu và đồng bộ ngược lên Zalo' : 'Đã lưu nhãn');
      } else {
        await api.post('/tags', { name: form.name, scope: scope.value, source: form.source, color: form.color, emoji: form.emoji || null });
        toast.success('Đã tạo nhãn');
      }
      await load(true);
      return true;
    } catch (err) {
      formError.value = apiErrorMessage(err, 'Lưu thất bại');
      return false;
    } finally { saving.value = false; }
  }

  /** Lưu trữ nhãn (DELETE /tags/:id) — desktop gọi "Archive"; liên kết khách giữ nguyên, chỉ ẩn khỏi gợi ý. Người gọi phải xác nhận trước. */
  async function archive(tag: MobileTag): Promise<boolean> {
    if (tag.source === 'zalo_real') { formError.value = 'Nhãn Zalo Real không thể lưu trữ'; return false; }
    saving.value = true;
    formError.value = '';
    try {
      await api.delete(`/tags/${tag.id}`);
      toast.success('Đã lưu trữ nhãn');
      await load(true);
      return true;
    } catch (err) {
      formError.value = apiErrorMessage(err, 'Lưu trữ thất bại');
      return false;
    } finally { saving.value = false; }
  }
  function setScope(s: TagScope) { scope.value = s; source.value = null; nickId.value = null; }

  const visible = computed(() => filterTags(tags.value, scope.value, query.value, source.value, nickId.value));
  const counts = computed(() => ({
    friend: tags.value.filter(t => t.scope === 'friend' && !t.archivedAt).length,
    crm: tags.value.filter(t => t.scope === 'crm' && !t.archivedAt).length,
  }));
  return { tags, state, saving, formError, scope, query, source, nickId, nicks, visible, counts, load, save, archive, setScope };
}
