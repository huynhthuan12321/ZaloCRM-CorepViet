// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, provide, ref } from 'vue';
import RichTextEditor from './rich-text-editor.vue';
import { createDesktopChatDrafts, DESKTOP_DRAFT_KEY } from '@/composables/use-desktop-chat-drafts';

vi.mock('@/api/index', () => ({ api: { post: vi.fn(), get: vi.fn() } }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }) }));
vi.mock('@/composables/use-groups', () => ({ useGroups: () => ({ fetchMembers: vi.fn(), members: ref([]) }) }));

const vuetifyStubs = { 'v-btn': true, 'v-menu': true, 'v-divider': true, 'v-spacer': true, 'v-avatar': true, 'v-img': true, 'v-progress-circular': true };

function setup() {
  const store = createDesktopChatDrafts();
  const conversationId = ref<string | null>('A');
  const text = ref('');
  const Host = defineComponent({
    emits: ['typing'],
    setup(_, { emit }) {
      provide(DESKTOP_DRAFT_KEY, { conversationId, getDoc: store.getDoc, setDoc: store.setDoc, revision: store.revision });
      return () => h(RichTextEditor, { key: conversationId.value ?? 'empty', modelValue: text.value,
        conversationDraft: true, 'onUpdate:modelValue': (v: string) => { text.value = v; }, onTyping: () => emit('typing') });
    },
  });
  const wrapper = mount(Host, { global: { stubs: vuetifyStubs } });
  const current = () => wrapper.findComponent(RichTextEditor).vm as any;
  const vm = {
    getRichPayload: () => current().getRichPayload(),
    getDraftDocument: () => current().getDraftDocument(),
    setDraftDocument: (doc: unknown) => current().setDraftDocument(doc),
    clear: () => current().clear(),
    insertText: (v: string) => current().insertText(v),
  };
  return { wrapper, vm, store, conversationId, text };
}

const richDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Chào ', marks: [{ type: 'bold' }] },
      { type: 'mention', attrs: { id: 'u1', label: 'An' } },
    ] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'giá', marks: [{ type: 'zaloColor', attrs: { color: 'db342e' } }] },
    ] }] }] },
  ],
};

afterEach(() => vi.clearAllMocks());

describe('rich-text-editor nháp theo hội thoại (F4)', () => {
  it('A -> B trống; B -> A khôi phục nguyên định dạng, mention, list', async () => {
    const { wrapper, vm, conversationId } = setup();
    await flushPromises();
    vm.setDraftDocument(richDoc);
    // mô phỏng người dùng sửa nhẹ để kích onUpdate lưu theo hội thoại A
    vm.insertText('!');
    await flushPromises();
    const aText = vm.getRichPayload().text;
    const aPayload = vm.getRichPayload();
    expect(aPayload.mentions).toHaveLength(1);

    conversationId.value = 'B';
    await flushPromises();
    expect(vm.getRichPayload().text).toBe('');

    conversationId.value = 'A';
    await flushPromises();
    const restored = vm.getRichPayload();
    expect(restored.text).toBe(aText);
    expect(restored.mentions).toEqual(aPayload.mentions);
    expect(restored.styles).toEqual(aPayload.styles);
    expect(JSON.stringify(vm.getDraftDocument())).toContain('"mention"');
    expect(JSON.stringify(vm.getDraftDocument())).toContain('bulletList');
    wrapper.unmount();
  });

  it('xóa ô (sau khi gửi) ở B chỉ xóa nháp B, nháp A còn nguyên', async () => {
    const { wrapper, vm, store, conversationId } = setup();
    await flushPromises();
    vm.insertText('nhap A');
    await flushPromises();
    expect(store.getDoc('A')).not.toBeNull();

    conversationId.value = 'B';
    await flushPromises();
    vm.insertText('nhap B');
    await flushPromises();
    expect(store.getDoc('B')).not.toBeNull();

    vm.clear(); // handleSend gọi editorRef.clear()
    await flushPromises();
    expect(store.getDoc('B')).toBeNull();
    expect(store.getDoc('A')).not.toBeNull();

    conversationId.value = 'A';
    await flushPromises();
    expect(vm.getRichPayload().text).toBe('nhap A');
    wrapper.unmount();
  });

  it('khôi phục không phát typing và không đổi payload gửi (chỉ text/styles/mentions cũ)', async () => {
    const { wrapper, vm, conversationId } = setup();
    await flushPromises();
    vm.insertText('x');
    await flushPromises();
    wrapper.emitted('typing');
    const typingBefore = (wrapper.emitted('typing') ?? []).length;
    conversationId.value = 'B';
    await flushPromises();
    conversationId.value = 'A';
    await flushPromises();
    expect((wrapper.emitted('typing') ?? []).length).toBe(typingBefore);
    expect(Object.keys(vm.getRichPayload()).sort()).toEqual(['mentions', 'styles', 'text']);
    wrapper.unmount();
  });

  it('không có provider (mobile/BlockEditor): hành vi cũ, không lưu gì', async () => {
    const wrapper = mount(RichTextEditor, { props: { modelValue: '' }, global: { stubs: vuetifyStubs } });
    await flushPromises();
    (wrapper.vm as any).insertText('abc');
    await flushPromises();
    expect((wrapper.vm as any).getRichPayload().text).toBe('abc');
    wrapper.unmount();
  });
});

it('secondary rich editor below desktop view cannot overwrite conversation draft without opt-in', async () => {
  const store = createDesktopChatDrafts();
  const id = ref<string | null>('A');
  const wrapper = mount(RichTextEditor, { props: { modelValue: '' }, global: {
    stubs: vuetifyStubs,
    provide: { [DESKTOP_DRAFT_KEY as symbol]: { conversationId: id, getDoc: store.getDoc, setDoc: store.setDoc } },
  } });
  await flushPromises();
  (wrapper.vm as any).insertText('secondary editor');
  await flushPromises();
  expect(store.getDoc('A')).toBeNull();
  wrapper.unmount();
});

it('queued external text + conversation switch cannot save A as B; session reset clears mounted editor', async () => {
  const { wrapper, vm, store, conversationId, text } = setup();
  await flushPromises();
  vm.insertText('original A'); await flushPromises();
  text.value = 'external A queued';
  conversationId.value = 'B';
  await flushPromises();
  expect(vm.getRichPayload().text).toBe('');
  expect(store.getDoc('B')).toBeNull();
  conversationId.value = 'A'; await flushPromises();
  expect(vm.getRichPayload().text).toBe('original A');
  store.clearAll(); await flushPromises();
  expect(vm.getRichPayload().text).toBe('');
  expect(store.getDoc('A')).toBeNull();
  wrapper.unmount();
});
