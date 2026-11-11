// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { installMemoryStorage } from '@/__tests__/mobile/test-utils';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';

vi.mock('@/api/index', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

type QueueModule = typeof import('./use-offline-queue');
type AuthModule = typeof import('@/stores/auth');

let storage: Storage;
let Q: QueueModule;
let authStore: ReturnType<AuthModule['useAuthStore']>;

async function loadFresh(): Promise<void> {
  vi.resetModules();
  setActivePinia(createPinia());
  Q = await import('./use-offline-queue');
  const { useAuthStore } = await import('@/stores/auth');
  authStore = useAuthStore();
}
function login(id: string, orgId = 'org-1') {
  authStore.user = { id, orgId, fullName: id, email: null, role: 'member' } as never;
}
function stored(): Array<Record<string, unknown>> {
  return JSON.parse(storage.getItem(Q.OFFLINE_QUEUE_STORAGE_KEY) || '[]');
}

beforeEach(async () => {
  storage = installMemoryStorage();
  vi.useRealTimers();
  await loadFresh();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('rào 1: gắn user, không gửi chéo user, xóa khi đổi user', () => {
  it('rào 1: enqueue ghi userId + orgId + status pending', () => {
    login('user-A', 'org-9');
    const q = Q.useOfflineQueue();
    const item = q.enqueue('conv-1', 'xin chào');
    expect(item).toMatchObject({ userId: 'user-A', orgId: 'org-9', conversationId: 'conv-1', status: 'pending' });
    expect(stored()[0]).toMatchObject({ userId: 'user-A', orgId: 'org-9' });
  });

  it('rào 1: chưa đăng nhập thì không xếp hàng (không biết là ai)', () => {
    const q = Q.useOfflineQueue();
    expect(q.enqueue('conv-1', 'x')).toBeNull();
    expect(stored()).toEqual([]);
  });

  it('rào 1: user B không bao giờ gửi tin của user A', async () => {
    login('user-A');
    Q.useOfflineQueue().enqueue('conv-A', 'tin riêng của A');
    login('user-B'); // đổi user mà không kịp nhận sự kiện reset
    const send = vi.fn(async () => {});
    const q = Q.useOfflineQueue();
    expect(q.pendingMessages.value).toHaveLength(0); // B không thấy tin của A
    await q.flush(send);
    expect(send).not.toHaveBeenCalled();
    expect(stored()).toEqual([]); // và mục của A bị xóa
  });

  it('rào 1: cùng userId nhưng khác orgId cũng không gửi', async () => {
    login('user-A', 'org-1');
    Q.useOfflineQueue().enqueue('conv-A', 'x');
    login('user-A', 'org-2');
    const send = vi.fn(async () => {});
    await Q.useOfflineQueue().flush(send);
    expect(send).not.toHaveBeenCalled();
  });

  it('rào 1: sự kiện crm:mobile-session-reset xóa mục của user cũ (logout xóa hết; đổi user giữ mục của user mới)', () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'a1');
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'user-A', userId: null } }));
    expect(stored()).toEqual([]);

    login('user-A');
    q.enqueue('c1', 'a2');
    login('user-B');
    q.enqueue('c2', 'b1');
    window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'user-A', userId: 'user-B' } }));
    expect(stored().map(m => m.content)).toEqual(['b1']);
  });

  it('rào 1: dữ liệu cũ trong zalocrm-offline-queue (không userId) bị bỏ, không bao giờ tự gửi', async () => {
    storage.setItem('zalocrm-offline-queue', JSON.stringify([
      { id: 'offline-old-1', conversationId: 'conv-old', content: 'tin từ phiên bản cũ', createdAt: new Date().toISOString() },
    ]));
    await loadFresh(); // nạp lại module: đọc storage như lần mở app đầu tiên sau khi nâng cấp
    login('user-A');
    const send = vi.fn(async () => {});
    const q = Q.useOfflineQueue();
    expect(q.pendingMessages.value).toHaveLength(0);
    await q.flush(send);
    expect(send).not.toHaveBeenCalled();
    expect(stored()).toEqual([]); // đã dọn khỏi storage
  });
});

describe('rào 2: gửi đúng conversationId lúc bấm; chỉ xếp hàng văn bản thuần', () => {
  it('rào 2: gửi đúng conversationId lúc bấm khi đang mở hội thoại khác lúc online lại', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    const openConversation = { id: 'conv-A' }; // lúc bấm gửi đang mở A
    q.enqueue(openConversation.id, 'báo giá cho khách A');
    openConversation.id = 'conv-B'; // online lại khi đã chuyển sang B
    const send = vi.fn(async (_conv: string, _content: string) => {});
    await q.flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('conv-A', 'báo giá cho khách A');
    expect(send).not.toHaveBeenCalledWith('conv-B', expect.anything());
  });

  it('rào 2: chọn "chỉ xếp hàng văn bản thuần" - trả lời / định dạng / @nhắc không được xếp hàng', () => {
    expect(Q.canQueueOffline({})).toBe(true);
    expect(Q.canQueueOffline({ replyMessageId: null, styles: [], mentions: [] })).toBe(true);
    expect(Q.canQueueOffline({ replyMessageId: 'msg-1' })).toBe(false);
    expect(Q.canQueueOffline({ styles: [{ st: 'b', start: 0, len: 2 }] })).toBe(false);
    expect(Q.canQueueOffline({ mentions: [{ uid: 'u', pos: 0, len: 3 }] })).toBe(false);
  });
});

describe('rào 3: một flush một lúc, xóa ngay khi thành công, lỗi thì dừng, không gửi trùng', () => {
  it('rào 3: hai flush đồng thời chỉ gửi mỗi mục đúng một lần', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'm1');
    q.enqueue('c1', 'm2');
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const send = vi.fn(async () => { await gate; });
    const first = q.flush(send);
    const second = q.flush(send); // bị bỏ qua vì đang flush
    release();
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(stored()).toEqual([]);
  });

  it('rào 3: mục được xóa NGAY sau khi API thành công (trước khi gửi mục kế tiếp)', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'm1');
    q.enqueue('c1', 'm2');
    const snapshots: string[][] = [];
    const send = vi.fn(async () => { snapshots.push(stored().map(m => `${m.content}:${m.status}`)); });
    await q.flush(send);
    expect(snapshots[0]).toEqual(['m1:sending', 'm2:pending']); // đã ghi 'sending' trước khi gọi API
    expect(snapshots[1]).toEqual(['m2:sending']); // m1 đã bị xóa
  });

  it('rào 3: lỗi giữa chừng thì dừng, giữ thứ tự, không gửi các mục sau; mục lỗi chuyển "failed"', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'm1');
    q.enqueue('c2', 'm2');
    q.enqueue('c3', 'm3');
    const send = vi.fn(async (conv: string) => { if (conv === 'c2') throw new Error('mạng lỗi'); });
    await q.flush(send);
    expect(send.mock.calls.map(c => c[0])).toEqual(['c1', 'c2']); // m3 không được thử
    expect(stored().map(m => `${m.content}:${m.status}`)).toEqual(['m2:failed', 'm3:pending']);
  });

  it('rào 3: không retry vòng lặp - flush lần sau không tự gửi lại mục failed; Gửi lại thủ công chỉ gửi một lần', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'm1');
    const failing = vi.fn(async () => { throw new Error('x'); });
    await q.flush(failing);
    expect(failing).toHaveBeenCalledTimes(1);
    await q.flush(failing); // online thêm lần nữa
    expect(failing).toHaveBeenCalledTimes(1); // KHÔNG tự thử lại (có thể đã tới server)

    const id = q.pendingMessages.value[0].id;
    const ok = vi.fn(async () => {});
    expect(await q.resend(id, ok)).toBe(true);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual([]);
  });

  it('rào 3: mục đang "sending" lúc trang bị tắt được nạp lại thành failed, không tự gửi lại', async () => {
    login('user-A');
    Q.useOfflineQueue().enqueue('c1', 'm1');
    const raw = stored().map(m => ({ ...m, status: 'sending' }));
    storage.setItem(Q.OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(raw));
    await loadFresh();
    login('user-A');
    const send = vi.fn(async () => {});
    const q = Q.useOfflineQueue();
    expect(q.pendingMessages.value[0].status).toBe('failed');
    await q.flush(send);
    expect(send).not.toHaveBeenCalled();
  });

  it('rào 3: tab khác đã gửi/xóa mục thì tab này không gửi lại (nạp lại storage trước mỗi mục)', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'm1');
    q.enqueue('c1', 'm2');
    const send = vi.fn(async (_c: string, content: string) => {
      if (content === 'm1') storage.setItem(Q.OFFLINE_QUEUE_STORAGE_KEY, '[]'); // tab khác dọn sạch trong lúc gửi m1
    });
    await q.flush(send);
    expect(send.mock.calls.map(c => c[1])).toEqual(['m1']);
  });
});

describe('rào 4: mục quá 24 giờ không tự gửi', () => {
  it('rào 4: > 24h hiện "Chưa gửi", không tự gửi, chặn các tin sau cùng hội thoại; hội thoại khác vẫn gửi', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'cũ c1');
    vi.setSystemTime(new Date('2026-11-01T23:00:00.000Z'));
    q.enqueue('c1', 'mới c1'); // cùng hội thoại, đến sau mục quá hạn
    q.enqueue('c2', 'mới c2');
    vi.setSystemTime(new Date('2026-11-02T01:30:00.000Z')); // mục đầu đã 25.5 giờ, các mục còn lại chưa tới 24h
    const send = vi.fn(async () => {});
    await q.flush(send);
    expect(send.mock.calls).toEqual([['c2', 'mới c2']]); // c1 bị chặn để không đảo thứ tự
    const [oldItem] = q.pendingMessages.value;
    expect(Q.displayStateOf(oldItem)).toBe('unsent');
    expect(Q.isStale(oldItem)).toBe(true);
  });

  it('rào 4: Gửi lại thủ công mục quá hạn gửi được; Xóa thủ công bỏ được', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    login('user-A');
    const q = Q.useOfflineQueue();
    const a = q.enqueue('c1', 'cũ 1')!;
    const b = q.enqueue('c1', 'cũ 2')!;
    vi.setSystemTime(new Date('2026-11-03T00:00:00.000Z'));
    const send = vi.fn(async () => {});
    expect(await q.resend(a.id, send)).toBe(true);
    expect(send).toHaveBeenCalledWith('c1', 'cũ 1');
    q.cancel(b.id);
    expect(stored()).toEqual([]);
  });
});

describe('vòng sửa C: đổi user giữa chừng, maybeDelivered, toast xóa, lease liên-tab', () => {
  it('M1: đổi user giữa hai mục -> flush dừng, mục sau không gửi dưới danh nghĩa người mới', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'm1');
    q.enqueue('c2', 'm2');
    const send = vi.fn(async (_c: string, content: string) => {
      if (content === 'm1') login('user-B'); // đổi tài khoản trong lúc đang gửi mục 1
    });
    await q.flush(send);
    expect(send.mock.calls.map(c => c[1])).toEqual(['m1']);
  });

  it('M1: resend sau khi đã đổi user -> không gọi sendFn', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    const item = q.enqueue('c1', 'x')!;
    login('user-B');
    const send = vi.fn(async () => {});
    expect(await q.resend(item.id, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('M2: mục đang sending lúc trang tắt -> failed + maybeDelivered; mục failed do lỗi thường thì không có cờ', async () => {
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'x');
    storage.setItem(Q.OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(stored().map(m => ({ ...m, status: 'sending' }))));
    await loadFresh();
    login('user-A');
    const [item] = Q.useOfflineQueue().pendingMessages.value;
    expect(item).toMatchObject({ status: 'failed', maybeDelivered: true });

    storage.clear();
    await loadFresh();
    login('user-A');
    const q2 = Q.useOfflineQueue();
    q2.enqueue('c1', 'y');
    await q2.flush(async () => { throw new Error('mạng'); });
    expect(q2.pendingMessages.value[0].status).toBe('failed');
    expect(q2.pendingMessages.value[0].maybeDelivered).toBeUndefined();
  });

  it('M3: reset do đăng xuất xóa N mục -> toast có số lượng; N=0 thì không toast', async () => {
    // Module nạp lại nhiều lần trong test nên có nhiều listener cũ trên window: chỉ gọi listener của bản mới nạp.
    const handlers: Array<(e: Event) => void> = [];
    const spy = vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, fn: EventListener) => {
      if (type === MOBILE_SESSION_RESET_EVENT) handlers.push(fn as (e: Event) => void);
    }) as never);
    await loadFresh();
    spy.mockRestore();
    const { useToast } = await import('@/composables/use-toast');
    useToast().items.value = [];
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'a');
    q.enqueue('c1', 'b');
    const fire = () => handlers.forEach(h => h(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId: 'user-A', userId: null } })));
    fire();
    expect(stored()).toEqual([]);
    expect(useToast().items.value.map(t => t.message).join('|')).toContain('2 tin chờ gửi đã bị xóa do đăng xuất/đổi tài khoản');
    useToast().items.value = [];
    fire();
    expect(useToast().items.value).toHaveLength(0);
  });

  it('M4: không có Web Locks -> lease có token; tab khác đang giữ lease còn hạn thì không flush', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'x');
    storage.setItem('zalocrm-offline-queue-lease', `tab-khac|${Date.now()}`);
    const send = vi.fn(async () => {});
    await q.flush(send);
    expect(send).not.toHaveBeenCalled();
    storage.setItem('zalocrm-offline-queue-lease', `tab-khac|${Date.now() - 120_000}`); // hết hạn
    await q.flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getItem('zalocrm-offline-queue-lease')).toBeNull(); // trả lease đúng token của mình
  });

  it('M4: ghi rồi đọc lại thấy token khác (tab khác ghi đè đúng lúc) -> không flush', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    login('user-A');
    const q = Q.useOfflineQueue();
    q.enqueue('c1', 'x');
    const realSet = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((k: string, v: string) => {
      realSet(k, k === 'zalocrm-offline-queue-lease' ? `tab-khac|${Date.now()}` : v);
    });
    const send = vi.fn(async () => {});
    await q.flush(send);
    expect(send).not.toHaveBeenCalled();
  });
});
