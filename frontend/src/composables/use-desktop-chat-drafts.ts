// SPDX-License-Identifier: AGPL-3.0-or-later
import { reactive, ref, type InjectionKey, type Ref } from 'vue';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';

/**
 * Nháp desktop theo hội thoại (F4, cùng chính sách D-7 với mobile): CHỈ nằm trong RAM, khóa theo conversationId,
 * không localStorage. Lưu NGUYÊN tài liệu Tiptap (JSON) để giữ định dạng + @mention + danh sách,
 * kèm ngữ cảnh trả lời/sửa của đúng hội thoại. Dọn khi đăng xuất / đổi user / đổi org
 * (PwaRuntime phát crm:mobile-session-reset cho cả desktop).
 */
export interface DesktopDraftContext<M = unknown> {
  replyingTo: M | null;
  editingMessage: M | null;
}

/** Cầu nối cha (DesktopChatView) -> rich-text-editor qua provide/inject; không có provider = editor y như cũ. */
export interface DesktopDraftBinding {
  /** Hội thoại đang hiển thị trong ô soạn. */
  conversationId: Ref<string | null>;
  revision?: Ref<number>;
  getDoc(conversationId: string): unknown | null;
  /** doc = null -> xóa nháp của đúng hội thoại đó. */
  setDoc(conversationId: string, doc: unknown | null): void;
}

export const DESKTOP_DRAFT_KEY: InjectionKey<DesktopDraftBinding> = Symbol('desktop-chat-draft');

const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)) as T);

export interface DesktopChatDrafts {
  getDoc(conversationId: string): unknown | null;
  setDoc(conversationId: string, doc: unknown | null): void;
  getContext<M = unknown>(conversationId: string): DesktopDraftContext<M>;
  setContext<M = unknown>(conversationId: string, ctx: DesktopDraftContext<M>): void;
  /** Xóa nháp + ngữ cảnh của riêng 1 hội thoại. */
  clear(conversationId: string): void;
  clearAll(): void;
  hasAnyDraft(): boolean;
  revision: Ref<number>;
}

export function createDesktopChatDrafts(): DesktopChatDrafts {
  const docs = reactive(new Map<string, unknown>());
  const revision = ref(0);
  const contexts = new Map<string, DesktopDraftContext>();
  return {
    revision,
    getDoc: (id) => (docs.has(id) ? clone(docs.get(id)) : null),
    setDoc(id, doc) {
      if (!id) return;
      if (doc == null) docs.delete(id);
      else docs.set(id, clone(doc));
    },
    getContext<M>(id: string) {
      const c = contexts.get(id);
      return { replyingTo: (c?.replyingTo ?? null) as M | null, editingMessage: (c?.editingMessage ?? null) as M | null };
    },
    setContext(id, ctx) {
      if (!id) return;
      if (!ctx.replyingTo && !ctx.editingMessage) contexts.delete(id);
      else contexts.set(id, { replyingTo: ctx.replyingTo ?? null, editingMessage: ctx.editingMessage ?? null });
    },
    clear(id) { docs.delete(id); contexts.delete(id); },
    clearAll() { docs.clear(); contexts.clear(); revision.value++; },
    hasAnyDraft: () => docs.size > 0,
  };
}

const shared = createDesktopChatDrafts();
let resetBound = false;

export function useDesktopChatDrafts(): DesktopChatDrafts {
  if (!resetBound && typeof window !== 'undefined') {
    resetBound = true;
    window.addEventListener(MOBILE_SESSION_RESET_EVENT, () => shared.clearAll());
  }
  return shared;
}

/** Chỉ dùng trong test. */
export function __resetDesktopChatDraftsForTest() { shared.clearAll(); }
