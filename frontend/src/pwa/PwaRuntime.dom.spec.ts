// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, type Ref } from 'vue';
import { useMobileChatDrafts } from '@/composables/mobile/use-mobile-chat-drafts';

const state = vi.hoisted(() => ({ pending: null as unknown as Ref<number>, guard: (() => false) as () => boolean }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test-token', user: { id: 'fake-user', orgId: 'fake-org' }, profileUnavailable: false, init: vi.fn() }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: { path: '/chat/fake' } }, replace: vi.fn() }) }));
vi.mock('@/composables/use-offline-queue', () => ({ useOfflineQueue: () => ({ pendingCount: state.pending }) }));
vi.mock('./session-cleanup', () => ({ clearUserBrowserStorage: vi.fn().mockResolvedValue(true) }));
vi.mock('./register', async () => {
  const { shallowRef } = await import('vue');
  return { pwaWaiting: shallowRef(true), pwaUpdating: shallowRef(false), pwaDisabled: shallowRef(false), acceptPwaUpdate: vi.fn(), setPwaReloadGuard: (guard: () => boolean) => { state.guard = guard; } };
});
import PwaRuntime from './PwaRuntime.vue';

let editor: HTMLDivElement;
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  state.pending = ref(0); useMobileChatDrafts().clearAll();
  editor = document.createElement('div'); editor.setAttribute('contenteditable', 'true');
  editor.innerHTML = '<p>Nháp đang soạn</p>'; document.body.append(editor);
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; editor.remove(); useMobileChatDrafts().clearAll(); vi.restoreAllMocks(); });
const disabled = () => (wrapper!.get('.pwa-update button').element as HTMLButtonElement).disabled;
async function open(): Promise<void> { wrapper = mount(PwaRuntime, { attachTo: document.body }); await flushPromises(); }

describe('PWA update guard follows actual editor DOM transactions', () => {
  it('unblocks after an editor is programmatically cleared without firing input', async () => {
    await open(); expect(disabled()).toBe(true); expect(state.guard()).toBe(false);
    editor.textContent = ''; // Tiptap clear transaction need not emit another DOM input event.
    await flushPromises();
    expect(disabled()).toBe(false); expect(state.guard()).toBe(true);
  });
  it('handles capture-phase input before Tiptap replaces the draft with an empty paragraph', async () => {
    const drafts = useMobileChatDrafts(); drafts.set('fake-conv', 'Nháp đang soạn');
    await open(); expect(disabled()).toBe(true);
    editor.dispatchEvent(new Event('input', { bubbles: true })); // Capture sees the OLD content.
    drafts.clear('fake-conv');
    const emptyParagraph = document.createElement('p'); emptyParagraph.append(document.createElement('br'));
    editor.replaceChildren(emptyParagraph); // Actual DOM transaction happens after the input handler.
    await flushPromises();
    expect(disabled()).toBe(false); expect(state.guard()).toBe(true);
  });
  it('keeps the update blocked by pending outbox even after the DOM draft is cleared', async () => {
    state.pending.value = 1;
    await open(); editor.textContent = ''; await flushPromises();
    expect(disabled()).toBe(true); expect(state.guard()).toBe(false);
    state.pending.value = 0; await flushPromises();
    expect(disabled()).toBe(false); expect(state.guard()).toBe(true);
  });
  it('rechecks the DOM synchronously before observer delivery when an update is requested', async () => {
    await open(); expect(state.guard()).toBe(false);
    editor.textContent = '';
    expect(state.guard()).toBe(true); // No await: observer has not delivered its batch yet.
    editor.textContent = 'New draft before controllerchange';
    expect(state.guard()).toBe(false);
  });
  it('tracks characterData edits without replacing the editor child nodes', async () => {
    await open(); expect(disabled()).toBe(true);
    const textNode = editor.querySelector('p')!.firstChild as Text;
    textNode.data = '';
    await flushPromises();
    expect(disabled()).toBe(false);
  });
  it('rechecks removed editors and disconnects its observer on unmount', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    await open(); expect(disabled()).toBe(true);
    editor.remove(); await flushPromises(); expect(disabled()).toBe(false);
    wrapper!.unmount(); wrapper = undefined;
    expect(disconnect).toHaveBeenCalled(); expect(state.guard()).toBe(false);
  });
});
