import { vi } from 'vitest';

/**
 * Tiện ích dùng chung cho spec mobile chat (không phải spec). Node 26 có localStorage dựng sẵn che mất của jsdom
 * (window.localStorage === undefined) nên thay bằng bản RAM, giống các spec shell.
 */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
  } as Storage;
}

export function installMemoryStorage(): Storage {
  const storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return storage;
}

/** Trình soạn thảo thay cho TipTap (jsdom không cần ProseMirror): v-model là chuỗi, getRichPayload trả {text, styles, mentions}. */
export const StubRichTextEditor = {
  name: 'StubRichTextEditor',
  props: ['modelValue', 'placeholder', 'showToolbar', 'interceptKeys', 'isGroup', 'accountId', 'groupId', 'members'],
  emits: ['update:modelValue', 'submit', 'typing', 'paste-image'],
  data() {
    return { styles: [] as unknown[], mentions: [] as unknown[] };
  },
  methods: {
    clear() { (this as unknown as { $emit: (e: string, v: string) => void }).$emit('update:modelValue', ''); },
    focus() { /* noop */ },
    insertText() { /* noop */ },
    applyRichPayload() { /* noop */ },
    getRichPayload() {
      const self = this as unknown as { modelValue: string; styles: unknown[]; mentions: unknown[] };
      return { text: self.modelValue, styles: self.styles, mentions: self.mentions };
    },
  },
  template: '<textarea class="stub-editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};

/** v-bottom-sheet thật teleport + cần Vuetify đầy đủ; stub giữ đúng hợp đồng model-value. */
export const StubBottomSheet = {
  props: ['modelValue', 'persistent', 'contentClass'],
  emits: ['update:modelValue', 'afterEnter'],
  template: '<div v-if="modelValue" class="stub-sheet"><slot /></div>',
};

/** Vuetify thật import CSS từ node_modules (vitest không xử lý) -> stub các thẻ v-* mà MessageThread/MobileChatView dùng. */
export const vuetifyStubs = {
  'v-dialog': true,
  'v-divider': true,
  'v-progress-linear': true,
  'v-icon': { template: '<i class="stub-icon"><slot /></i>' },
  'v-list': { template: '<div class="stub-list"><slot /></div>' },
  'v-list-item': { template: '<div class="stub-list-item"><slot /></div>' },
  'v-menu': { template: '<div class="stub-menu"><slot name="activator" :props="{}" /></div>' },
  'v-bottom-sheet': StubBottomSheet,
};
