// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { installMemoryStorage, vuetifyStubs } from './test-utils';
import { makeConversation, makeMessage } from './fixtures';

installMemoryStorage();
vi.mock('@/api/index', () => ({
  api: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(), delete: vi.fn() },
  clearAuthAndRedirect: vi.fn(),
}));
vi.mock('@/components/chat/rich-text-editor.vue', async () => ({ default: (await import('./test-utils')).StubRichTextEditor }));

import { api } from '@/api/index';
import MessageThread from '@/components/chat/MessageThread.vue';
import type { Conversation, Message } from '@/composables/use-chat';

const CLIENT_HEIGHT = 400;
const PX_PER_MESSAGE = 100;

function mountThread(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  return mount(MessageThread, {
    props: {
      conversation: makeConversation('A', 'Khách A'),
      messages: [] as Message[],
      loading: false,
      sending: false,
      aiSuggestion: '',
      aiSuggestionLoading: false,
      aiSuggestionError: '',
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [router], stubs: vuetifyStubs },
  });
}

/** jsdom không có layout: giả lập scrollHeight theo số tin đang render, scrollTop ghi được. */
function fakeScroller(w: VueWrapper): HTMLElement {
  const el = w.get('.messages').element as HTMLElement;
  let top = 0;
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => el.querySelectorAll('[data-msg-id]').length * PX_PER_MESSAGE });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
  return el;
}
async function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
  await flushPromises();
}
function msgs(n: number, prefix = 'm'): Message[] {
  return Array.from({ length: n }, (_, i) => makeMessage(`${prefix}${i + 1}`, `tin ${i + 1}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('MessageThread - chế độ mobile (C-3)', () => {
  it('desktop (không truyền mobile): không có nút +, vẫn có icon Gửi ảnh/Gửi file và input file ẩn', () => {
    const w = mountThread();
    expect(w.find('.attach-plus-btn').exists()).toBe(false);
    expect(w.findAll('.icon-tool').some(b => b.attributes('title') === 'Gửi ảnh')).toBe(true);
    expect(w.findAll('input[type="file"]').length).toBe(2);
    expect(w.classes()).not.toContain('is-mobile');
    w.unmount();
  });

  it('mobile: nút + phát open-attachment-sheet và thay hàng icon ảnh/file/kho', async () => {
    const w = mountThread({ mobile: true });
    const plus = w.get('.attach-plus-btn');
    expect(plus.attributes('aria-label')).toBeTruthy();
    expect(w.findAll('.icon-tool').some(b => b.attributes('title') === 'Gửi ảnh')).toBe(false);
    await plus.trigger('click');
    expect(w.emitted('open-attachment-sheet')).toHaveLength(1);
    expect(w.classes()).toContain('is-mobile');
    w.unmount();
  });

  it('slot header-leading và messages-tail chỉ render khi cha truyền', () => {
    const w = mount(MessageThread, {
      props: { conversation: makeConversation('A', 'A'), messages: [], loading: false, sending: false, aiSuggestion: '', aiSuggestionLoading: false, aiSuggestionError: '', mobile: true },
      slots: { 'header-leading': '<button class="lead">back</button>', 'messages-tail': '<p class="tail">chờ gửi</p>', 'header-below': '<p class="below">ctx</p>' },
      global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] })], stubs: vuetifyStubs },
    });
    expect(w.find('header .lead').exists()).toBe(true);
    expect(w.find('.messages .tail').exists()).toBe(true);
    expect(w.find('.below').exists()).toBe(true);
    w.unmount();
  });

  it('nháp do cha điều khiển: đổi hội thoại A->B không mang chữ của A sang B; mọi thay đổi báo lên kèm id hội thoại', async () => {
    const w = mountThread({ mobile: true, draft: 'nháp của A' });
    const editor = () => w.get('textarea.stub-editor');
    expect((editor().element as HTMLTextAreaElement).value).toBe('nháp của A');

    await editor().setValue('A gõ tiếp');
    const calls = w.emitted('update:draft') as Array<[string, string | null]>;
    expect(calls.at(-1)).toEqual(['A gõ tiếp', 'A']);

    // Cha chuyển sang hội thoại B với nháp rỗng.
    await w.setProps({ conversation: makeConversation('B', 'Khách B'), draft: '' });
    await flushPromises();
    expect((editor().element as HTMLTextAreaElement).value).toBe('');
    expect((w.emitted('update:draft') as Array<[string, string | null]>).at(-1)).toEqual(['', 'B']);
    w.unmount();
  });

  it('aiApplyMode="manual": gợi ý AI về KHÔNG tự điền vào ô soạn; mặc định (auto) vẫn tự điền như desktop cũ', async () => {
    const manual = mountThread({ mobile: true, draft: '', aiApplyMode: 'manual' });
    await manual.setProps({ aiSuggestion: 'Câu gợi ý từ AI' });
    await flushPromises();
    expect((manual.get('textarea.stub-editor').element as HTMLTextAreaElement).value).toBe('');
    expect(manual.emitted('send')).toBeUndefined();
    manual.unmount();

    const auto = mountThread();
    await auto.setProps({ aiSuggestion: 'Câu gợi ý từ AI' });
    await flushPromises();
    expect((auto.get('textarea.stub-editor').element as HTMLTextAreaElement).value).toBe('Câu gợi ý từ AI');
    expect(auto.emitted('send')).toBeUndefined(); // desktop cũ cũng không tự gửi
    auto.unmount();
  });
});

describe('MessageThread - cuộn (C-4): mobile khác desktop, desktop giữ nguyên', () => {
  it('desktop: tin mới luôn kéo xuống đáy kể cả khi đang đọc tin cũ, không có nút "Tin mới"', async () => {
    const w = mountThread({ messages: msgs(5) });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 0); // đang đọc tin cũ
    await w.setProps({ messages: msgs(6) });
    await flushPromises();
    expect(el.scrollTop).toBe(6 * PX_PER_MESSAGE);
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    w.unmount();
  });

  it('mobile: đang đọc tin cũ (>120px từ đáy) -> KHÔNG kéo xuống, hiện "Tin mới (N)", bấm thì xuống đáy', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10) });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 0); // 10*100 - 400 - 0 = 600px từ đáy: đang đọc tin cũ
    await w.setProps({ messages: msgs(11) });
    await flushPromises();
    expect(el.scrollTop).toBe(0);
    expect(w.get('.new-msg-pill').text()).toContain('Tin mới (1)');
    await w.setProps({ messages: msgs(12) });
    await flushPromises();
    expect(w.get('.new-msg-pill').text()).toContain('Tin mới (2)');
    expect(el.scrollTop).toBe(0);

    await w.get('.new-msg-pill').trigger('click');
    await flushPromises();
    expect(el.scrollTop).toBe(12 * PX_PER_MESSAGE);
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    w.unmount();
  });

  it('mobile: đang ở gần đáy (<=120px) -> tự kéo xuống như bình thường, không hiện pill', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10) });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 10 * PX_PER_MESSAGE - CLIENT_HEIGHT - 100); // cách đáy 100px
    await w.setProps({ messages: msgs(11) });
    await flushPromises();
    expect(el.scrollTop).toBe(11 * PX_PER_MESSAGE);
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    w.unmount();
  });

  it('mobile: tin của chính mình vừa gửi thì kéo xuống dù đang đọc tin cũ', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10), draft: '' });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 0);
    await w.get('textarea.stub-editor').setValue('trả lời khách');
    await w.get('.send-btn').trigger('click'); // người dùng bấm gửi
    expect(w.emitted('send')).toHaveLength(1);
    await w.setProps({ messages: [...msgs(10), makeMessage('mine-1', 'trả lời khách', 'self')] });
    await flushPromises();
    expect(el.scrollTop).toBe(11 * PX_PER_MESSAGE);
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    w.unmount();
  });

  it('mobile: tin "self" đến từ nơi khác (không do mình vừa bấm gửi) vẫn chỉ hiện pill khi đang đọc cũ', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10) });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 0);
    await w.setProps({ messages: [...msgs(10), makeMessage('echo-1', 'gửi từ điện thoại khác', 'self')] });
    await flushPromises();
    expect(el.scrollTop).toBe(0);
    expect(w.get('.new-msg-pill').text()).toContain('Tin mới (1)');
    w.unmount();
  });

  it('mobile: bàn phím/resize không phải tin mới - thu nhỏ khung khi đang ở đáy không tạo pill, tin tới vẫn kéo đáy', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10) });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 10 * PX_PER_MESSAGE - CLIENT_HEIGHT); // đúng đáy
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 150 }); // bàn phím mở: khung co lại, KHÔNG có sự kiện scroll
    await flushPromises();
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    await w.setProps({ messages: msgs(11) });
    await flushPromises();
    expect(el.scrollTop).toBe(11 * PX_PER_MESSAGE);
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    w.unmount();
  });

  it('mobile: tải lịch sử cũ (prepend) giữ anchor, không kéo xuống và không đếm là tin mới', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10, 'new') });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 300);
    const older = msgs(3, 'old');
    await w.setProps({ messages: [...older, ...msgs(10, 'new')] });
    await flushPromises();
    expect(el.scrollTop).toBe(300 + 3 * PX_PER_MESSAGE); // vị trí đang đọc được giữ nguyên tương đối
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    w.unmount();
  });

  it('mobile: đổi hội thoại -> xuống đáy hội thoại mới và xóa bộ đếm tin mới của khách cũ', async () => {
    const w = mountThread({ mobile: true, messages: msgs(10) });
    const el = fakeScroller(w);
    await flushPromises();
    await scrollTo(el, 0);
    await w.setProps({ messages: msgs(11) });
    await flushPromises();
    expect(w.find('.new-msg-pill').exists()).toBe(true);

    await w.setProps({ conversation: makeConversation('B', 'Khách B'), messages: msgs(7, 'b') });
    await flushPromises();
    expect(w.find('.new-msg-pill').exists()).toBe(false);
    expect(el.scrollTop).toBe(7 * PX_PER_MESSAGE);
    w.unmount();
  });
});

describe('MessageThread - tải tệp dùng helper chung (C-2), desktop giữ nguyên request', () => {
  it('chọn ảnh ở desktop -> POST /conversations/:id/attachments, FormData field "files", header multipart, rồi emit refresh-thread', async () => {
    const w = mountThread();
    const imageInput = w.findAll('input[type="file"]')[0];
    const file = new File(['x'], 'anh.png', { type: 'image/png' });
    Object.defineProperty(imageInput.element, 'files', { value: [file], configurable: true });
    await imageInput.trigger('change');
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/conversations/A/attachments');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).getAll('files')).toHaveLength(1);
    expect(((body as FormData).getAll('files')[0] as File).name).toBe('anh.png');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(w.emitted('refresh-thread')).toHaveLength(1);
    w.unmount();
  });
});

// Tránh cảnh báo biến không dùng khi chỉnh spec.
void (null as unknown as Conversation);
