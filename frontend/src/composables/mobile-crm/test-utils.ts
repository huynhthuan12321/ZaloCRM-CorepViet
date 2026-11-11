import { vi } from 'vitest';

/** Tiện ích cho spec CRM/Cài đặt mobile (không phải spec). Node 26 che mất localStorage của jsdom -> dùng bản RAM. */
export function installMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
  } as Storage;
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return storage;
}

/** v-bottom-sheet thật teleport + cần Vuetify đầy đủ; stub giữ đúng hợp đồng model-value. */
export const StubBottomSheet = {
  props: ['modelValue', 'persistent', 'contentClass'],
  emits: ['update:modelValue', 'afterEnter'],
  template: '<div v-if="modelValue" class="stub-sheet"><slot /></div>',
};

/** v-theme-provider stub: chỉ render slot, ghi lại theme để spec khẳng định. */
export const StubThemeProvider = {
  props: ['theme', 'withBackground'],
  template: '<div class="stub-theme" :data-theme-name="theme"><slot /></div>',
};
