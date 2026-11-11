// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { installMemoryStorage } from '@/__tests__/mobile/test-utils';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';
import { __resetMobileChatDraftsForTest, useDraftUnloadGuard, useMobileChatDrafts } from './use-mobile-chat-drafts';

beforeEach(() => {
  installMemoryStorage();
  __resetMobileChatDraftsForTest();
});
afterEach(() => vi.restoreAllMocks());

describe('useMobileChatDrafts (D-7: chỉ RAM, theo convId)', () => {
  it('nháp tách theo hội thoại: không mang chữ A sang B', () => {
    const d = useMobileChatDrafts();
    d.set('A', 'nháp của A');
    expect(d.get('A')).toBe('nháp của A');
    expect(d.get('B')).toBe('');
    d.set('B', 'nháp của B');
    expect(d.get('A')).toBe('nháp của A');
    expect(d.hasDraft('A')).toBe(true);
    d.clear('A');
    expect(d.hasDraft('A')).toBe(false);
    expect(d.get('B')).toBe('nháp của B');
  });

  it('chuỗi rỗng xóa nháp; hasDraft bỏ qua khoảng trắng', () => {
    const d = useMobileChatDrafts();
    d.set('A', '   ');
    expect(d.hasDraft('A')).toBe(false);
    d.set('A', '');
    expect(d.get('A')).toBe('');
  });

  it('KHÔNG ghi vào localStorage/sessionStorage', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    const d = useMobileChatDrafts();
    d.set('A', 'bí mật khách A');
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain('bí mật');
  });

  it('crm:mobile-session-reset (logout/đổi user) dọn sạch mọi nháp', () => {
    const d = useMobileChatDrafts();
    d.set('A', 'a');
    d.set('B', 'b');
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'u1', userId: null } }));
    expect(d.hasAnyDraft()).toBe(false);
    expect(d.get('A')).toBe('');
  });
});

describe('useDraftUnloadGuard (cảnh báo beforeunload khi còn nháp)', () => {
  it('còn nháp -> preventDefault; hết nháp -> không chặn; gỡ listener khi scope dispose', () => {
    const d = useMobileChatDrafts();
    const scope = effectScope();
    scope.run(() => useDraftUnloadGuard());

    const withDraft = new Event('beforeunload', { cancelable: true });
    d.set('A', 'chưa gửi');
    window.dispatchEvent(withDraft);
    expect(withDraft.defaultPrevented).toBe(true);

    d.clear('A');
    const noDraft = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(noDraft);
    expect(noDraft.defaultPrevented).toBe(false);

    scope.stop();
    d.set('A', 'lại có nháp');
    const afterStop = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterStop);
    expect(afterStop.defaultPrevented).toBe(false);
  });
});
