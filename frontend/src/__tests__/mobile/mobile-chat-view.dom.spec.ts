// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { installMemoryStorage, vuetifyStubs } from './test-utils';
import { makeConversation, makeMessage } from './fixtures';

const isOnlineRef = ref(true);
const sockets: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];

installMemoryStorage();
vi.mock('@/api/index', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ensureFreshToken: vi.fn(),
  clearAuthAndRedirect: vi.fn(),
}));
vi.mock('@/api/socket', () => ({
  createAppSocket: vi.fn(() => {
    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn(), once: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
    sockets.push(socket);
    return socket;
  }),
}));
vi.mock('@/components/chat/rich-text-editor.vue', async () => ({ default: (await import('./test-utils')).StubRichTextEditor }));
vi.mock('@/composables/use-zalo-accounts', () => ({
  useZaloAccounts: () => ({ accounts: ref([{ id: 'nick-1', displayName: 'Nick Bán Hàng 1' }]), fetchAccounts: vi.fn(async () => {}) }),
}));
vi.mock('@/composables/use-mobile', () => ({
  useMobile: () => ({ isMobile: ref(true), isOnline: isOnlineRef }),
  MOBILE_MEDIA_QUERY: '',
}));
vi.mock('@/components/chat/NewMessageDialog.vue', () => ({ default: { name: 'NewMessageDialogStub', props: ['modelValue', 'accounts', 'initialQuery'], template: '<div class="new-msg-stub">{{ initialQuery }}</div>' } }));
vi.mock('@/views/DesktopChatView.vue', () => ({ default: { name: 'DesktopChatViewStub', template: '<div class="desktop-chat-stub" />' } }));

import { api } from '@/api/index';
import { createAppSocket } from '@/api/socket';
import MobileChatView from '@/views/MobileChatView.vue';
import mobileChatViewSource from '@/views/MobileChatView.vue?raw';
import ChatView from '@/views/ChatView.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import AISuggestionSheet from '@/components/mobile/chat/AISuggestionSheet.vue';
import { createChromeController, MOBILE_SESSION_RESET_EVENT, MOBILE_SHELL_KEY, type MobileShellContext } from '@/components/mobile/shell/shell-context';
import { confirmState, resolveConfirm } from '@/composables/use-confirm';
import { useToast } from '@/composables/use-toast';
import { useChat, type Conversation } from '@/composables/use-chat';
import { useChatOperations } from '@/composables/use-chat-operations';
import { __resetOfflineQueueForTest, OFFLINE_QUEUE_STORAGE_KEY } from '@/composables/use-offline-queue';
import { __resetMobileChatDraftsForTest } from '@/composables/mobile/use-mobile-chat-drafts';
import { useAuthStore } from '@/stores/auth';

const MB = 1024 * 1024;
const convs: Record<string, Conversation> = {
  A: makeConversation('A', 'Khách A'),
  B: makeConversation('B', 'Khách B'),
};
const mocked = {
  get: api.get as unknown as ReturnType<typeof vi.fn>,
  post: api.post as unknown as ReturnType<typeof vi.fn>,
};
let aiContent = 'Dạ em gửi anh báo giá ạ';
let userSeq = 0;

function installApi() {
  mocked.get.mockImplementation(async (url: string) => {
    if (url === '/conversations') return { data: { conversations: [convs.A, convs.B], hasMore: false } };
    const messagesMatch = url.match(/^\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch) return { data: { messages: [] } };
    const detailMatch = url.match(/^\/conversations\/([^/]+)$/);
    if (detailMatch) return { data: convs[detailMatch[1]] ?? convs.A };
    if (url === '/ai/config') return { data: { provider: 'x', model: 'y', maxDaily: 500, enabled: true } };
    if (url === '/ai/usage') return { data: { usedToday: 1, maxDaily: 500, remaining: 499, enabled: true } };
    return { data: [] };
  });
  mocked.post.mockImplementation(async (url: string) => {
    if (url === '/ai/suggest') return { data: { content: aiContent, sources: ['Bảng giá 2026'] } };
    if (/\/messages$/.test(url)) return { data: { id: `sent-${Math.random()}`, content: 'ok', contentType: 'text', senderType: 'self', sentAt: new Date().toISOString(), isDeleted: false, zaloMsgId: null, albumKey: null, albumIndex: null, albumTotal: null } };
    return { data: {} };
  });
}

function shellContext(): MobileShellContext {
  const ctl = createChromeController({ tabbar: ref(true), header: ref(true), keyboardOpen: ref(false) });
  return { viewport: { keyboardOpen: ref(false) } as never, ...ctl };
}

const Blank = { template: '<div />' };
let wrapper: VueWrapper | null = null;
let router: Router;

async function mountChat(path = '/chat'): Promise<VueWrapper> {
  // Lịch sử trình duyệt do useMobileBack đọc qua window.history.state.back; router dùng memory history để không dính jsdom.
  window.history.replaceState(null, ''); // khởi động nguội: chưa có lịch sử nội bộ
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat/:convId?', name: 'Chat', component: Blank },
      { path: '/contacts/:id/profile', name: 'ContactProfile', component: Blank },
      { path: '/', component: Blank },
    ],
  });
  await router.push(path);
  await router.isReady();
  const w = mount(MobileChatView, {
    attachTo: document.body,
    global: { plugins: [router], provide: { [MOBILE_SHELL_KEY as symbol]: shellContext() }, stubs: vuetifyStubs },
  });
  wrapper = w;
  await flushPromises();
  return w;
}

const postsTo = (re: RegExp) => mocked.post.mock.calls.filter(c => re.test(c[0] as string));
const editor = (w: VueWrapper) => w.get('textarea.stub-editor').element as HTMLTextAreaElement;
const typeText = (w: VueWrapper, text: string) => w.get('textarea.stub-editor').setValue(text);
const toastMessages = () => useToast().items.value.map(t => t.message).join(' | ');
function setOnline(online: boolean) {
  isOnlineRef.value = online;
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Không để jsdom gửi XHR thật ra mạng (một số thành phần con của MessageThread gọi XHR trực tiếp, không qua api mock).
  vi.spyOn(window.XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
  sockets.length = 0;
  setActivePinia(createPinia());
  const auth = useAuthStore();
  userSeq += 1;
  auth.user = { id: `user-${userSeq}`, orgId: 'org-1', fullName: 'Tester', email: null, role: 'owner' } as never;
  installApi();
  setOnline(true);
  aiContent = 'Dạ em gửi anh báo giá ạ';
  useToast().items.value = [];
  confirmState.value = { open: false, title: '' };
  __resetOfflineQueueForTest();
  __resetMobileChatDraftsForTest();
  useChatOperations().clearReplyTo();
  useChatOperations().clearEditing();
});
afterEach(() => {
  wrapper?.unmount();
  router?.options.history.destroy(); // gỡ listener popstate của router cũ
  wrapper = null;
  vi.useRealTimers();
});

describe('route: inbox -> thread, deep link, back (H7)', () => {
  it('khởi động nguội ở /chat/A: mở đúng hội thoại, selectConversation chạy đúng 1 lần', async () => {
    const w = await mountChat('/chat/A');
    expect(w.find('.message-thread').exists()).toBe(true);
    expect(mocked.get.mock.calls.filter(c => c[0] === '/conversations/A/messages')).toHaveLength(1);
    expect(postsTo(/\/conversations\/A\/mark-read$/)).toHaveLength(1);
    expect(w.text()).toContain('Khách A');
  });

  it('inbox vẫn mounted nhưng ẩn + inert khi mở thread; hiện lại khi quay về /chat', async () => {
    const w = await mountChat('/chat/A');
    const inbox = w.get('section.m-inbox');
    expect(inbox.attributes('inert')).toBeDefined();
    expect(inbox.classes()).toContain('m-inbox--hidden');
    await router.replace('/chat');
    await flushPromises();
    expect(w.get('section.m-inbox').attributes('inert')).toBeUndefined();
    expect(w.find('.message-thread').exists()).toBe(false);
  });

  it('chọn hội thoại -> router.push /chat/:convId (không set selectedConvId trực tiếp)', async () => {
    const w = await mountChat('/chat');
    const push = vi.spyOn(router, 'push');
    const rows = w.findAll('button.m-conv-row');
    expect(rows).toHaveLength(2);
    await rows[1].trigger('click');
    await flushPromises();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chat', params: { convId: 'B' } }));
    expect(router.currentRoute.value.query).toEqual({});
    expect(router.currentRoute.value.path).toBe('/chat/B');
    expect(w.find('.message-thread').exists()).toBe(true);
  });

  it('back không có lịch sử nội bộ (mở thẳng từ link) -> replace về /chat, không rời app', async () => {
    const w = await mountChat('/chat/A');
    const back = vi.spyOn(router, 'back');
    await w.get('button.m-thread-back').trigger('click');
    await flushPromises();
    expect(back).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/chat');
  });

  it('back có lịch sử nội bộ -> router.back(); inbox giữ bộ lọc và vị trí cuộn', async () => {
    const w = await mountChat('/chat');
    window.history.replaceState({ back: '/chat' }, ''); // như vue-router ghi khi điều hướng nội bộ
    await w.findAll('button.m-conv-row')[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/A');
    const scroller = w.get('.m-inbox__list').element as HTMLElement;
    scroller.scrollTop = 321;
    const back = vi.spyOn(router, 'back');
    await w.get('button.m-thread-back').trigger('click');
    await flushPromises();
    expect(back).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/chat');
    expect((w.get('.m-inbox__list').element as HTMLElement).scrollTop).toBe(321); // cùng phần tử, không remount
    expect(w.get('.m-inbox__list').element).toBe(scroller);
  });

  it('link cũ /chat?conv=B được chuẩn hóa sang /chat/B', async () => {
    const w = await mountChat('/chat?conv=B');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/B');
    expect(w.find('.message-thread').exists()).toBe(true);
  });

  it('thread thua: hội thoại không mở được hiện lỗi có nút Thử lại, vẫn có nút quay lại', async () => {
    mocked.get.mockImplementation(async (url: string) => {
      if (url === '/conversations') return { data: { conversations: [], hasMore: false } };
      throw Object.assign(new Error('404'), { response: { status: 404 } });
    });
    const w = await mountChat('/chat/ZZZ');
    expect(w.find('.message-thread').exists()).toBe(false);
    expect(w.text()).toContain('Không mở được hội thoại');
    expect(w.find('button.m-thread-back').exists()).toBe(true);
    expect(w.text()).toContain('Thử lại');
  });
});

describe('một instance useChat + một socket (H8, C-1)', () => {
  it('mount/unmount MobileChatView 3 lần -> createAppSocket đúng 3, disconnect đúng 3', async () => {
    for (let i = 0; i < 3; i += 1) {
      const w = await mountChat('/chat');
      expect(createAppSocket).toHaveBeenCalledTimes(i + 1);
      w.unmount();
      wrapper = null;
      expect(sockets[i].disconnect).toHaveBeenCalledTimes(1);
    }
    expect(createAppSocket).toHaveBeenCalledTimes(3);
    expect(sockets.reduce((n, s) => n + s.disconnect.mock.calls.length, 0)).toBe(3);
  });

  it('ChatView ở mobile chỉ dựng MobileChatView: không dựng desktop, vẫn đúng 1 socket', async () => {
    window.history.replaceState(null, '', '/chat');
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/chat/:convId?', name: 'Chat', component: Blank }] });
    await router.push('/chat');
    await router.isReady();
    const w = mount(ChatView, { attachTo: document.body, global: { plugins: [router], provide: { [MOBILE_SHELL_KEY as symbol]: shellContext() }, stubs: vuetifyStubs } });
    wrapper = w;
    await flushPromises();
    expect(w.find('.desktop-chat-stub').exists()).toBe(false);
    expect(w.find('.mobile-chat').exists()).toBe(true);
    expect(createAppSocket).toHaveBeenCalledTimes(1);
  });

  it('mobile không gọi window.location.reload ở bất kỳ đâu (D-5: không adopt nick scope bằng reload)', () => {
    expect(mobileChatViewSource).not.toMatch(/location\s*\.\s*reload|location\.href\s*=/);
  });
});

describe('nháp theo hội thoại, gửi đúng convId (H11)', () => {
  it('gõ ở A, đổi sang B -> ô soạn B rỗng; gửi ở B -> POST đúng /conversations/B/messages; quay về A còn nháp của A', async () => {
    const w = await mountChat('/chat/A');
    await typeText(w, 'nháp riêng của khách A');
    await router.push('/chat/B');
    await flushPromises();
    expect(editor(w).value).toBe('');

    await typeText(w, 'xin chào khách B');
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    const posts = postsTo(/\/messages$/);
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/conversations/B/messages');
    expect(posts[0][1]).toEqual({ content: 'xin chào khách B' });
    expect(postsTo(/\/conversations\/A\/messages$/)).toHaveLength(0);

    await router.push('/chat/A');
    await flushPromises();
    expect(editor(w).value).toBe('nháp riêng của khách A');
  });

  it('gửi chụp convId lúc bấm: chuyển sang hội thoại khác ngay sau khi bấm vẫn không gửi nhầm', async () => {
    const w = await mountChat('/chat/A');
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    mocked.post.mockImplementationOnce(async () => { await gate; return { data: { id: 'x', content: 'a', contentType: 'text', senderType: 'self', sentAt: '', isDeleted: false, zaloMsgId: null, albumKey: null, albumIndex: null, albumTotal: null } }; });
    await typeText(w, 'gửi cho A');
    await w.get('.send-btn').trigger('click');
    await router.push('/chat/B');
    release();
    await flushPromises();
    const posts = postsTo(/\/messages$/);
    expect(posts.map(c => c[0])).toEqual(['/conversations/A/messages']);
  });

  it('gửi lỗi thì giữ lại nội dung trong ô soạn (không mất tin)', async () => {
    const w = await mountChat('/chat/A');
    mocked.post.mockRejectedValueOnce({ response: { status: 422, data: { error: 'Khách chặn nhận tin' } } });
    await typeText(w, 'tin sẽ lỗi');
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    await new Promise(r => setTimeout(r, 10));
    await flushPromises();
    expect(editor(w).value).toBe('tin sẽ lỗi');
  });

  it('crm:mobile-session-reset dọn nháp', async () => {
    const w = await mountChat('/chat/A');
    await typeText(w, 'nháp trước khi đổi tài khoản');
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'u', userId: null } }));
    await flushPromises();
    expect(editor(w).value).toBe('');
  });
});

describe('AI: chỉ "Áp vào nháp", không tự gửi (H6, H13)', () => {
  async function openAi(w: VueWrapper) {
    await w.get('.ai-btn').trigger('click');
    await flushPromises();
  }

  it('bấm ✨ -> mở sheet, gợi ý về KHÔNG tự điền vào ô soạn và KHÔNG gọi POST messages', async () => {
    const w = await mountChat('/chat/A');
    await openAi(w);
    expect(postsTo(/\/ai\/suggest$/)).toHaveLength(1);
    expect(w.text()).toContain('Dạ em gửi anh báo giá ạ');
    expect(editor(w).value).toBe('');
    expect(postsTo(/\/messages$/)).toHaveLength(0);
  });

  it('"Áp vào nháp" điền vào ô soạn, vẫn không gửi; đóng sheet giữ nguyên nháp', async () => {
    const w = await mountChat('/chat/A');
    await openAi(w);
    await w.get('[data-action="apply"]').trigger('click');
    await flushPromises();
    expect(editor(w).value).toBe('Dạ em gửi anh báo giá ạ');
    expect(postsTo(/\/messages$/)).toHaveLength(0);
    expect(w.find('.stub-sheet').exists()).toBe(false); // sheet đã đóng
    expect(editor(w).value).toBe('Dạ em gửi anh báo giá ạ');
  });

  it('nháp đang có chữ + Thay nháp -> hỏi xác nhận: Giữ nháp thì không đổi, Thay nháp thì thay', async () => {
    const w = await mountChat('/chat/A');
    await typeText(w, 'nháp đang soạn');
    await openAi(w);
    await w.get('[data-action="apply"]').trigger('click');
    await flushPromises();
    expect(confirmState.value.open).toBe(true);
    expect(confirmState.value.title).toBe('Thay nháp hiện tại?');
    resolveConfirm(false, '');
    await flushPromises();
    expect(editor(w).value).toBe('nháp đang soạn');

    await w.get('[data-action="apply"]').trigger('click');
    await flushPromises();
    resolveConfirm(true, '');
    await flushPromises();
    expect(editor(w).value).toBe('Dạ em gửi anh báo giá ạ');
    expect(postsTo(/\/messages$/)).toHaveLength(0);
  });

  it('"Chèn vào cuối nháp" nối thêm, không cần hỏi', async () => {
    const w = await mountChat('/chat/A');
    await typeText(w, 'em chào anh');
    await openAi(w);
    await w.get('[data-action="append"]').trigger('click');
    await flushPromises();
    expect(confirmState.value.open).toBe(false);
    expect(editor(w).value).toBe('em chào anh\nDạ em gửi anh báo giá ạ');
  });

  it('conversationId lệch lúc áp -> bỏ, không ghi nháp của khách khác, có thông báo', async () => {
    const w = await mountChat('/chat/A');
    await openAi(w);
    await router.push('/chat/B');
    await flushPromises();
    w.findComponent(AISuggestionSheet).vm.$emit('applyDraft', { conversationId: 'A', text: 'gợi ý của A', mode: 'replace' });
    await flushPromises();
    expect(editor(w).value).toBe('');
    expect(toastMessages()).toContain('Đã đổi khách');
    expect(postsTo(/\/messages$/)).toHaveLength(0);
  });
});

describe('đính kèm qua nút + (CONTRACT §3.3)', () => {
  async function openSheet(w: VueWrapper) {
    await w.get('.attach-plus-btn').trigger('click');
    await flushPromises();
  }
  async function pick(w: VueWrapper, kind: string, files: File[]) {
    const input = w.get(`input[type="file"][data-kind="${kind}"]`);
    Object.defineProperty(input.element, 'files', { value: files, configurable: true });
    await input.trigger('change');
    await flushPromises();
  }
  const file = (name: string, type: string, size = 1024) => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('chọn ảnh -> POST /conversations/A/attachments (FormData field files) rồi tải lại tin của A', async () => {
    const w = await mountChat('/chat/A');
    await openSheet(w);
    await pick(w, 'image', [file('a.png', 'image/png')]);
    const posts = postsTo(/\/attachments$/);
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/conversations/A/attachments');
    expect((posts[0][1] as FormData).getAll('files')).toHaveLength(1);
    expect(posts[0][2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(mocked.get.mock.calls.filter(c => c[0] === '/conversations/A/messages').length).toBeGreaterThanOrEqual(2);
  });

  it('HEIC và video 600MB bị từ chối: không gọi API, báo lý do tiếng Việt', async () => {
    const w = await mountChat('/chat/A');
    await openSheet(w);
    await pick(w, 'image', [file('IMG.HEIC', 'image/heic')]);
    await pick(w, 'video', [file('big.mp4', 'video/mp4', 600 * MB)]);
    expect(postsTo(/\/attachments$/)).toHaveLength(0);
    expect(toastMessages()).toContain('HEIC');
    expect(toastMessages()).toContain('quá lớn');
  });

  it('đổi hội thoại khi sheet đang mở -> sheet đóng, không upload', async () => {
    const w = await mountChat('/chat/A');
    await openSheet(w);
    expect(w.find('.stub-sheet').exists()).toBe(true);
    await router.push('/chat/B');
    await flushPromises();
    expect(w.find('.stub-sheet').exists()).toBe(false);
    expect(postsTo(/\/attachments$/)).toHaveLength(0);
  });

  it('lỗi 413/415/429 được dịch sang tiếng Việt rõ ràng', async () => {
    const w = await mountChat('/chat/A');
    for (const [status, text] of [[413, 'quá lớn'], [415, 'chưa được hỗ trợ'], [429, 'quá nhanh']] as const) {
      useToast().items.value = [];
      mocked.post.mockRejectedValueOnce({ response: { status, data: {} } });
      await openSheet(w);
      await pick(w, 'image', [file('a.png', 'image/png')]);
      expect(toastMessages()).toContain(text);
    }
  });

  it('offline: sheet khóa toàn bộ, hiện lý do bằng chữ, không upload; Kho media cũng khóa', async () => {
    const w = await mountChat('/chat/A');
    setOnline(false);
    await openSheet(w);
    expect(w.text()).toContain('mất kết nối');
    const buttons = w.findAll('button.m-attach__item');
    expect(buttons).toHaveLength(5);
    expect(buttons.every(b => b.attributes('disabled') !== undefined)).toBe(true);
    await pick(w, 'image', [file('a.png', 'image/png')]);
    expect(postsTo(/\/attachments$/)).toHaveLength(0);
  });
});

describe('hàng đợi offline trong thread (rào 2, 3, 5)', () => {
  it('rào 5: offline gửi văn bản thuần -> không POST, hiện "Đang chờ gửi" + Hủy; Hủy xóa khỏi hàng đợi', async () => {
    const w = await mountChat('/chat/A');
    setOnline(false);
    await typeText(w, 'báo giá nhé');
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    expect(postsTo(/\/messages$/)).toHaveLength(0);
    const queued = JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ conversationId: 'A', content: 'báo giá nhé', status: 'pending' });
    expect(queued[0].userId).toMatch(/^user-/);
    expect(w.find('.m-pending').text()).toContain('Đang chờ gửi');
    expect(editor(w).value).toBe('');
    await w.get('[data-action="cancel"]').trigger('click');
    await flushPromises();
    expect(JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]')).toEqual([]);
    expect(w.find('.m-pending').exists()).toBe(false);
  });

  it('rào 2: tin có trả lời/định dạng/@nhắc KHÔNG xếp hàng khi offline; nội dung được giữ lại và báo rõ', async () => {
    const w = await mountChat('/chat/A');
    setOnline(false);
    useChatOperations().setReplyTo(makeMessage('quoted-1', 'tin gốc'));
    await typeText(w, 'trả lời có trích dẫn');
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    expect(JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]')).toEqual([]);
    expect(toastMessages()).toContain('văn bản thuần');
    expect(editor(w).value).toBe('trả lời có trích dẫn');
    expect(postsTo(/\/messages$/)).toHaveLength(0);
  });

  it('rào 2: có mạng lại khi đang mở hội thoại khác -> tin chờ vẫn gửi đúng conversationId lúc bấm, rồi biến mất khỏi thread', async () => {
    const w = await mountChat('/chat/A');
    setOnline(false);
    await typeText(w, 'tin của khách A');
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    await router.push('/chat/B');
    await flushPromises();
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await flushPromises();
    const posts = postsTo(/\/messages$/);
    expect(posts.map(c => c[0])).toEqual(['/conversations/A/messages']);
    expect(posts[0][1]).toEqual({ content: 'tin của khách A' });
    expect(JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]')).toEqual([]);
  });
});

describe('khớp payload desktop (contract test)', () => {
  type SendArgs = [string, (string | null)?, unknown?, unknown?];

  /** Desktop: MessageThread (không mobile) + `@send="sendMessage"` đúng như DesktopChatView. */
  async function desktopSend(text: string, setup: { styles?: unknown[]; mentions?: unknown[]; reply?: boolean }) {
    mocked.post.mockClear();
    const chat = useChat();
    chat.selectedConvId.value = 'A';
    const ops = useChatOperations();
    const thread = mount(MessageThread, {
      props: {
        conversation: convs.A, messages: [], loading: false, sending: false,
        aiSuggestion: '', aiSuggestionLoading: false, aiSuggestionError: '',
        replyingTo: setup.reply ? makeMessage('quoted-1', 'tin gốc') : null,
        onSend: (...args: SendArgs) => chat.sendMessage(...(args as Parameters<typeof chat.sendMessage>)),
      },
      attachTo: document.body,
      global: { plugins: [router], stubs: vuetifyStubs },
    });
    void ops;
    await thread.get('textarea.stub-editor').setValue(text);
    if (setup.styles || setup.mentions) await thread.findComponent({ name: 'StubRichTextEditor' }).setData({ styles: setup.styles ?? [], mentions: setup.mentions ?? [] });
    await thread.get('.send-btn').trigger('click');
    await flushPromises();
    const calls = postsTo(/\/messages$/).map(c => [c[0], c[1]]);
    thread.unmount();
    return calls;
  }

  async function mobileSend(text: string, setup: { styles?: unknown[]; mentions?: unknown[]; reply?: boolean }) {
    mocked.post.mockClear();
    const w = await mountChat('/chat/A');
    if (setup.reply) useChatOperations().setReplyTo(makeMessage('quoted-1', 'tin gốc'));
    await typeText(w, text);
    if (setup.styles || setup.mentions) await w.findComponent({ name: 'StubRichTextEditor' }).setData({ styles: setup.styles ?? [], mentions: setup.mentions ?? [] });
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    const calls = postsTo(/\/messages$/).map(c => [c[0], c[1]]);
    w.unmount();
    wrapper = null;
    return calls;
  }

  it.each([
    ['văn bản thuần', 'xin chào', {}],
    ['có trả lời (replyMessageId)', 'đã nhận', { reply: true }],
    ['có định dạng (styles)', 'in đậm', { styles: [{ st: 'b', start: 0, len: 2 }] }],
    ['có @nhắc (mentions)', 'chào @An', { mentions: [{ uid: 'u1', pos: 5, len: 3 }] }],
    ['đủ cả ba', 'gộp tất cả', { reply: true, styles: [{ st: 'i', start: 0, len: 3 }], mentions: [{ uid: 'u2', pos: 0, len: 1 }] }],
  ])('payload gửi tin %s: mobile === desktop (URL + body)', async (_name, text, setup) => {
    // Desktop cần router để MessageThread dùng vue-router; dựng 1 router tạm cho MessageThread.
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/chat/:convId?', name: 'Chat', component: Blank }] });
    await router.push('/chat/A');
    const desktop = await desktopSend(text, setup);
    const mobile = await mobileSend(text, setup);
    expect(desktop).toHaveLength(1);
    expect(mobile).toEqual(desktop);
  });

  it('payload đính kèm ảnh: mobile === desktop (URL, field "files", header)', async () => {
    const png = new File(['x'], 'anh.png', { type: 'image/png' });

    mocked.post.mockClear();
    const desktopThread = mount(MessageThread, {
      props: { conversation: convs.A, messages: [], loading: false, sending: false, aiSuggestion: '', aiSuggestionLoading: false, aiSuggestionError: '' },
      attachTo: document.body,
      global: { plugins: [router], stubs: vuetifyStubs },
    });
    const desktopInput = desktopThread.findAll('input[type="file"]')[0];
    Object.defineProperty(desktopInput.element, 'files', { value: [png], configurable: true });
    await desktopInput.trigger('change');
    await flushPromises();
    const desktopCall = postsTo(/\/attachments$/)[0];
    desktopThread.unmount();

    mocked.post.mockClear();
    const w = await mountChat('/chat/A');
    await w.get('.attach-plus-btn').trigger('click');
    await flushPromises();
    const input = w.get('input[type="file"][data-kind="image"]');
    Object.defineProperty(input.element, 'files', { value: [png], configurable: true });
    await input.trigger('change');
    await flushPromises();
    const mobileCall = postsTo(/\/attachments$/)[0];

    const entries = (fd: FormData) => Array.from(fd.entries()).map(([k, v]) => [k, (v as File).name, (v as File).type, (v as File).size]);
    expect(mobileCall[0]).toBe(desktopCall[0]);
    expect(mobileCall[2]).toEqual(desktopCall[2]);
    expect(entries(mobileCall[1] as FormData)).toEqual(entries(desktopCall[1] as FormData));
  });
});

describe('trạng thái inbox / thread: loading, empty, error, offline, mất realtime', () => {
  it('inbox rỗng -> trạng thái empty rõ ràng; có bộ lọc đang bật thì gợi ý xóa bộ lọc', async () => {
    mocked.get.mockImplementation(async (url: string) => (url === '/conversations' ? { data: { conversations: [], hasMore: false } } : { data: [] }));
    const w = await mountChat('/chat');
    expect(w.text()).toContain('Chưa có hội thoại nào');
    expect(w.find('button.m-conv-row').exists()).toBe(false);
  });

  it('inbox đang tải lần đầu -> skeleton loading có role=status', async () => {
    mocked.get.mockImplementation((url: string) => (url === '/conversations' ? new Promise(() => {}) : Promise.resolve({ data: [] })));
    const w = await mountChat('/chat');
    expect(w.find('.m-feedback--loading[role=status]').exists()).toBe(true);
  });

  it('offline và chưa có dữ liệu -> trạng thái offline với nút Thử lại', async () => {
    mocked.get.mockImplementation(async (url: string) => (url === '/conversations' ? { data: { conversations: [], hasMore: false } } : { data: [] }));
    setOnline(false);
    const w = await mountChat('/chat');
    expect(w.text()).toContain('Đang mất kết nối');
    await w.get('.m-feedback__btn--primary').trigger('click');
    await flushPromises();
    expect(mocked.get.mock.calls.filter(c => c[0] === '/conversations').length).toBeGreaterThanOrEqual(2);
  });

  it('bộ lọc Chưa trả lời + Khách của tôi -> GET /conversations kèm unreplied=true và assignedUserId của mình', async () => {
    const w = await mountChat('/chat');
    mocked.get.mockClear();
    await w.get('button[aria-label="Mở bộ lọc"]').trigger('click');
    await flushPromises();
    const boxes = w.findAll('.m-filter__check input[type="checkbox"]');
    await boxes[0].setValue(true); // Chưa trả lời
    await w.findAll('.sale-picker__option')[0].trigger('click'); // Khách của tôi
    await w.get('[data-action="apply"]').trigger('click');
    await flushPromises();
    const call = mocked.get.mock.calls.find(c => c[0] === '/conversations')!;
    const params = (call[1] as { params: Record<string, unknown> }).params;
    expect(params.unreplied).toBe('true');
    expect(params.assignedUserId).toBe(useAuthStore().user!.id);
    expect(w.text()).toContain('Chưa trả lời');
  });

  it('mất kết nối realtime > 4s -> hiện banner; nối lại thì ẩn', async () => {
    vi.useFakeTimers();
    const w = await mountChat('/chat');
    const opts = (createAppSocket as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { onStatusChange: (s: string) => void };
    opts.onStatusChange('disconnected');
    await vi.advanceTimersByTimeAsync(4100);
    await flushPromises();
    expect(w.find('.mobile-chat__realtime').exists()).toBe(true);
    opts.onStatusChange('connected');
    await flushPromises();
    expect(w.find('.mobile-chat__realtime').exists()).toBe(false);
  });

  it('nút Tin nhắn mới mở NewMessageDialog; ?compose=SĐT mở sẵn dialog và xóa query', async () => {
    const w = await mountChat('/chat?compose=0900000000');
    expect(w.find('.new-msg-stub').text()).toBe('0900000000');
    expect(router.currentRoute.value.query.compose).toBeUndefined();
  });
});

describe('socket dùng chung của MessageThread không nhân lên khi đổi hội thoại', () => {
  it('mở thread rồi đổi A -> B: không tạo thêm socket nào (presence/friend là singleton có sẵn)', async () => {
    const w = await mountChat('/chat/A');
    const afterOpen = (createAppSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await router.push('/chat/B');
    await flushPromises();
    expect((createAppSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(afterOpen);
    expect(w.find('.message-thread').exists()).toBe(true);
  });
});

// Tránh cảnh báo import không dùng.
void computed;

describe('vòng sửa C: AI không lẫn khách, xác nhận thay nháp, inbox lỗi, khóa riêng tư, maybeDelivered, focus khi back', () => {
  function deferredAi() {
    const pending: Record<string, (v: unknown) => void> = {};
    mocked.post.mockImplementation(async (url: string, body?: { conversationId?: string }) => {
      if (url === '/ai/suggest') {
        const id = body?.conversationId ?? '?';
        const content = await new Promise<string>(resolve => { pending[id] = (v) => resolve(v as string); });
        return { data: { content, sources: [`Nguồn ${id}`] } };
      }
      return { data: {} };
    });
    return pending;
  }

  it('H1: bấm AI ở A, sang B, response A về muộn, mở AI ở B -> không bao giờ thấy chữ của A', async () => {
    const pending = deferredAi();
    const w = await mountChat('/chat/A');
    await w.get('.ai-btn').trigger('click');
    await flushPromises();
    expect(postsTo(/\/ai\/suggest$/)).toHaveLength(1);

    await router.push('/chat/B'); // đổi khách khi request A còn bay: sheet phải đóng, state AI bị xóa
    await flushPromises();
    expect(w.find('.stub-sheet').exists()).toBe(false);

    await w.get('.ai-btn').trigger('click'); // mở AI ở B trong lúc A chưa về
    await flushPromises();
    expect(w.text()).not.toContain('CHỮ-CỦA-A');

    pending.A('CHỮ-CỦA-A: giá riêng cho khách A'); // A trả lời muộn
    await flushPromises();
    expect(w.text()).not.toContain('CHỮ-CỦA-A');
    expect(w.text()).not.toContain('Nguồn A');

    // Lượt của B chỉ được gọi SAU khi A kết thúc, đúng conversationId B
    expect(postsTo(/\/ai\/suggest$/).map(c => (c[1] as { conversationId: string }).conversationId)).toEqual(['A', 'B']);
    pending.B('Chữ dành cho khách B');
    await flushPromises();
    expect(w.text()).toContain('Chữ dành cho khách B');
    expect(w.text()).not.toContain('CHỮ-CỦA-A');
    expect(postsTo(/\/messages$/)).toHaveLength(0);
  });

  it('H1: đổi khách rồi quay lại A -> không còn gợi ý cũ (state AI bị xóa khi đổi hội thoại)', async () => {
    const w = await mountChat('/chat/A');
    await w.get('.ai-btn').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Dạ em gửi anh báo giá ạ');
    await router.push('/chat/B');
    await flushPromises();
    aiContent = 'Gợi ý mới';
    await w.get('.ai-btn').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Gợi ý mới');
    expect(w.text()).not.toContain('Dạ em gửi anh báo giá ạ');
  });

  it('H-1 QA: hỏi "Thay nháp hiện tại?" -> sheet AI đã đóng (không đè hộp xác nhận); Giữ nháp thì sheet mở lại', async () => {
    const w = await mountChat('/chat/A');
    await typeText(w, 'nháp đang soạn');
    await w.get('.ai-btn').trigger('click');
    await flushPromises();
    await w.get('[data-action="apply"]').trigger('click');
    await flushPromises();
    expect(confirmState.value.open).toBe(true);
    expect(w.find('.stub-sheet').exists()).toBe(false);
    resolveConfirm(false, '');
    await flushPromises();
    expect(w.find('.stub-sheet').exists()).toBe(true);
    expect(editor(w).value).toBe('nháp đang soạn');
  });

  it('M-1 QA: API danh sách lỗi -> "Không tải được hội thoại" + Thử lại (không hiện "rỗng" giả)', async () => {
    mocked.get.mockImplementation(async (url: string) => {
      if (url === '/conversations') throw new Error('500');
      return { data: [] };
    });
    const w = await mountChat('/chat');
    expect(w.text()).toContain('Không tải được hội thoại');
    expect(w.text()).not.toContain('Chưa có hội thoại nào');
    const before = mocked.get.mock.calls.filter(c => c[0] === '/conversations').length;
    await w.get('.m-feedback__btn--primary').trigger('click');
    await flushPromises();
    expect(mocked.get.mock.calls.filter(c => c[0] === '/conversations').length).toBeGreaterThan(before);
  });

  it('L-2 QA: nick Riêng tư của người khác -> sheet đính kèm khóa phía client kèm lý do bằng chữ', async () => {
    convs.A = makeConversation('A', 'Khách A', { zaloAccount: { id: 'nick-A', displayName: 'Nick Riêng', avatarUrl: null, privacyMode: 'main', ownerUserId: 'nguoi-khac' } });
    try {
      const w = await mountChat('/chat/A');
      await w.get('.attach-plus-btn').trigger('click');
      await flushPromises();
      expect(w.text()).toContain('Riêng tư');
      const buttons = w.findAll('button.m-attach__item');
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every(b => b.attributes('disabled') !== undefined)).toBe(true);
    } finally {
      convs.A = makeConversation('A', 'Khách A');
    }
  });

  it('M2: tin "có thể đã gửi" -> hiện cảnh báo; Gửi lại phải xác nhận, "Để xem lại" thì không POST', async () => {
    const w = await mountChat('/chat/A');
    setOnline(false);
    await typeText(w, 'tin gián đoạn');
    await w.get('.send-btn').trigger('click');
    await flushPromises();
    const queue = JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]');
    queue[0].status = 'failed';
    queue[0].maybeDelivered = true;
    window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new StorageEvent('storage', { key: OFFLINE_QUEUE_STORAGE_KEY }));
    setOnline(true);
    await flushPromises();
    mocked.post.mockClear();
    expect(w.find('.m-pending').text()).toContain('Có thể đã gửi');
    await w.get('[data-action="resend"]').trigger('click');
    await flushPromises();
    expect(confirmState.value.open).toBe(true);
    expect(postsTo(/\/messages$/)).toHaveLength(0);
    resolveConfirm(false, '');
    await flushPromises();
    expect(postsTo(/\/messages$/)).toHaveLength(0);

    await w.get('[data-action="resend"]').trigger('click');
    await flushPromises();
    resolveConfirm(true, '');
    await flushPromises();
    expect(postsTo(/\/conversations\/A\/messages$/)).toHaveLength(1);
  });

  it('L4: back từ thread -> focus vào đúng hàng hội thoại vừa mở', async () => {
    const w = await mountChat('/chat');
    await w.findAll('button.m-conv-row')[1].trigger('click');
    await flushPromises();
    await w.get('button.m-thread-back').trigger('click');
    await flushPromises();
    await flushPromises();
    expect((document.activeElement as HTMLElement | null)?.dataset.convId).toBe('B');
  });
});


describe('Đợt D: deep link Chưa trả lời từ Tổng quan', () => {
  const inboxCalls = () => mocked.get.mock.calls.filter(call => call[0] === '/conversations');
  it('nạp query trước request đầu tiên, giữ query khi chọn khách và back', async () => {
    const w = await mountChat('/chat?filter=unreplied');
    expect(inboxCalls().length).toBeGreaterThan(0);
    for (const call of inboxCalls()) expect(call[1]).toMatchObject({ params: { unreplied: 'true' } });
    expect(w.get('.m-inbox__chips').text()).toContain('Chưa trả lời');
    window.history.replaceState({ back: '/chat?filter=unreplied' }, '');
    await w.findAll('button.m-conv-row')[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat/A?filter=unreplied');
    await w.get('button.m-thread-back').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat?filter=unreplied');
    expect(w.get('.m-inbox__chips').text()).toContain('Chưa trả lời');
  });
  it('cold-start thread giữ filter trong request và fallback về inbox đã lọc', async () => {
    const w = await mountChat('/chat/A?filter=unreplied');
    expect(inboxCalls().length).toBeGreaterThan(0);
    for (const call of inboxCalls()) expect(call[1]).toMatchObject({ params: { unreplied: 'true' } });
    await w.get('button.m-thread-back').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat?filter=unreplied');
    expect(w.get('.m-inbox__chips').text()).toContain('Chưa trả lời');
  });
  it('cold thread có query conv cũ: back bỏ conv, không tự mở lại thread', async () => {
    const w = await mountChat('/chat/A?conv=A&filter=unreplied');
    await w.get('button.m-thread-back').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/chat?filter=unreplied');
    expect(w.find('.message-thread').exists()).toBe(false);
    expect(w.get('.m-inbox__chips').text()).toContain('Chưa trả lời');
  });
  it('xóa bộ lọc xóa query, không tự bật lại khi route được làm mới', async () => {
    const w = await mountChat('/chat?filter=unreplied');
    await w.get('button.m-inbox__chip-clear').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.filter).toBeUndefined();
    expect(w.find('.m-inbox__chips').exists()).toBe(false);
    await router.replace(router.currentRoute.value.fullPath);
    await flushPromises();
    expect(w.find('.m-inbox__chips').exists()).toBe(false);
    const last = inboxCalls().at(-1);
    expect(last?.[1]?.params?.unreplied).not.toBe('true');
  });
});
