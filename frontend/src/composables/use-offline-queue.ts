// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';
import { useToast } from '@/composables/use-toast';

/**
 * Hàng đợi tin offline của mobile (CONTRACT-A §3.5, D-6: GIỮ tự gửi khi có mạng, kèm 6 rào chắn).
 *
 * Rào 1  Mỗi mục gắn userId + orgId. flush chỉ gửi mục của user hiện tại; mục của user khác KHÔNG BAO GIỜ gửi và bị xóa
 *        khi logout/đổi user (sự kiện crm:mobile-session-reset) hoặc ngay lúc flush.
 * Rào 2  Gửi theo conversationId đã chụp lúc bấm (sendFn(conversationId, content)). Chỉ xếp hàng TIN VĂN BẢN THUẦN
 *        (xem canQueueOffline): trả lời/định dạng/@nhắc không xếp hàng vì sẽ mất ngữ cảnh khi gửi muộn. UI báo rõ cho người dùng.
 * Rào 3  Một flush một lúc (cờ + khóa liên-tab), đánh dấu 'sending' và ghi storage TRƯỚC khi gọi API, xóa mục ngay khi
 *        API thành công, lỗi thì dừng toàn bộ flush và chuyển mục sang 'failed' (chờ người dùng bấm Gửi lại); không retry vòng.
 * Rào 4  Mục > 24 giờ không tự gửi: hiện "Chưa gửi" + Gửi lại / Xóa thủ công, và chặn các mục sau của cùng hội thoại.
 * Rào 5  UI thread hiển thị "Đang chờ gửi" + Hủy (PendingQueueStrip); banner OfflineIndicator do shell.
 * Rào 6  Đính kèm / Kho media không xếp hàng (AttachmentSheet khóa khi offline) - không có API nào ở đây cho tệp.
 *
 * Dữ liệu cũ trong 'zalocrm-offline-queue' KHÔNG có userId/orgId: không biết của ai nên BỊ BỎ khi nạp (xem readStorage).
 */
export const OFFLINE_QUEUE_STORAGE_KEY = 'zalocrm-offline-queue';
const LEASE_KEY = 'zalocrm-offline-queue-lease';
const LOCK_NAME = 'zalocrm-offline-queue-flush';
/** Mục cũ hơn mức này không tự gửi (rào 4). */
export const OFFLINE_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LEASE_TTL_MS = 60_000;
/** Token riêng của tab này cho lease dự phòng (khi không có Web Locks). */
const LEASE_OWNER = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type PendingStatus = 'pending' | 'sending' | 'failed';

export interface PendingMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  userId: string;
  orgId: string;
  status: PendingStatus;
  /** Từng 'sending' rồi trang tắt giữa chừng: có thể tin đã tới server. UI cảnh báo, Gửi lại phải hỏi xác nhận. */
  maybeDelivered?: boolean;
}

/** Trạng thái hiển thị: waiting = sẽ tự gửi khi có mạng; sending = đang gửi; unsent = "Chưa gửi" (cần Gửi lại/Xóa thủ công). */
export type PendingDisplayState = 'waiting' | 'sending' | 'unsent';

export type OfflineSendFn = (conversationId: string, content: string) => Promise<void>;

function isStored(item: unknown): item is PendingMessage {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  return typeof o.id === 'string'
    && typeof o.conversationId === 'string'
    && typeof o.content === 'string'
    && typeof o.createdAt === 'string'
    && typeof o.userId === 'string' && o.userId !== ''
    && typeof o.orgId === 'string' && o.orgId !== ''
    && (o.status === 'pending' || o.status === 'sending' || o.status === 'failed');
}

function readStorage(): PendingMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    // Mục thiếu userId/orgId (dữ liệu cũ) bị bỏ: không thể chứng minh của ai (thiết bị dùng chung -> lộ nội dung/gửi nhầm danh nghĩa).
    // Mục đang 'sending' lúc trang bị tắt: không biết đã tới server chưa -> 'failed' để người dùng tự quyết, KHÔNG tự gửi lại.
    return parsed.filter(isStored).map(m => (m.status === 'sending' ? { ...m, status: 'failed' as const, maybeDelivered: true } : m));
  } catch {
    return [];
  }
}

// Storage hỏng (Safari private mode / đầy bộ nhớ): hàng đợi chỉ còn trong RAM, và KHÔNG nạp lại từ storage (sẽ ra rỗng).
let storageWorks = true;

function writeStorage(queue: PendingMessage[]) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    storageWorks = false;
  }
}

const store = ref<PendingMessage[]>(typeof localStorage === 'undefined' ? [] : readStorage());
if (typeof localStorage !== 'undefined') writeStorage(store.value); // ghi lại: dọn mục cũ không userId khỏi storage

function commit(next: PendingMessage[]) {
  store.value = next;
  writeStorage(next);
}

/** Đồng bộ lại từ storage (tab khác có thể đã gửi/xóa mục). 'sending' do tab khác giữ nguyên. */
function reloadFromStorage() {
  if (!storageWorks) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || '[]');
    store.value = Array.isArray(parsed) ? parsed.filter(isStored) : [];
  } catch {
    // giữ nguyên bản trong RAM
  }
}

/** Mọi thay đổi đều dựa trên bản MỚI NHẤT trong storage để không ghi đè việc tab khác vừa gửi/xóa. */
function mutate(fn: (queue: PendingMessage[]) => PendingMessage[]) {
  reloadFromStorage();
  commit(fn(store.value));
}

let flushing = false;
const inFlight = new Set<string>();

/** Xóa mục không thuộc keepUserId; trả về số mục đã xóa. */
function purgeExcept(keepUserId: string | null): number {
  reloadFromStorage();
  const removed = store.value.filter(m => keepUserId === null || m.userId !== keepUserId).length;
  if (removed > 0) commit(store.value.filter(m => keepUserId !== null && m.userId === keepUserId));
  return removed;
}

if (typeof window !== 'undefined') {
  // Rào 1: logout / đổi user -> xóa mục không thuộc user mới (logout: userId=null -> xóa hết).
  window.addEventListener(MOBILE_SESSION_RESET_EVENT, (e) => {
    const detail = (e as CustomEvent<{ userId?: string | null }>).detail;
    const removed = purgeExcept(detail?.userId ?? null);
    // Không im lặng mất tin: báo số lượng (không lộ nội dung).
    if (removed > 0) useToast().warning(`${removed} tin chờ gửi đã bị xóa do đăng xuất/đổi tài khoản`);
  });
  // Tab khác đổi hàng đợi -> nạp lại để không gửi trùng mục tab kia đã gửi.
  window.addEventListener('storage', (e) => {
    if (e.key === OFFLINE_QUEUE_STORAGE_KEY) reloadFromStorage();
  });
}

/** Chỉ tin văn bản thuần mới xếp hàng offline (rào 2). */
export function canQueueOffline(opts: {
  replyMessageId?: string | null;
  styles?: unknown[] | null;
  mentions?: unknown[] | null;
}): boolean {
  return !opts.replyMessageId
    && !(opts.styles && opts.styles.length > 0)
    && !(opts.mentions && opts.mentions.length > 0);
}

export function isStale(msg: Pick<PendingMessage, 'createdAt'>, now = Date.now()): boolean {
  const t = Date.parse(msg.createdAt);
  return !Number.isFinite(t) || now - t > OFFLINE_QUEUE_MAX_AGE_MS;
}

export function displayStateOf(msg: PendingMessage, now = Date.now()): PendingDisplayState {
  if (msg.status === 'sending') return 'sending';
  if (msg.status === 'failed' || isStale(msg, now)) return 'unsent';
  return 'waiting';
}

type LocksApi = { request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void) => Promise<unknown> };

/** Khóa liên-tab: chỉ một tab flush tại một thời điểm (Web Locks, dự phòng bằng "hợp đồng thuê" trong localStorage). */
async function withFlushLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? (navigator as unknown as { locks?: LocksApi }).locks : undefined;
  if (locks?.request) {
    await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
    return;
  }
  // Dự phòng: hợp đồng thuê có token ngẫu nhiên; ghi rồi đọc lại, chỉ flush nếu token trong storage vẫn là của mình.
  if (!readLease(Date.now())) return;
  try {
    await fn();
  } finally {
    const cur = parseLease(localStorage.getItem(LEASE_KEY));
    if (cur?.owner === LEASE_OWNER) localStorage.removeItem(LEASE_KEY);
  }
}

function parseLease(raw: string | null): { owner: string; at: number } | null {
  if (!raw) return null;
  const i = raw.lastIndexOf('|');
  if (i < 0) return null;
  const at = Number(raw.slice(i + 1));
  return Number.isFinite(at) ? { owner: raw.slice(0, i), at } : null;
}

/** Thử chiếm lease. Trả true khi đã ghi và đọc lại thấy đúng token của mình. */
function readLease(now: number): boolean {
  try {
    const held = parseLease(localStorage.getItem(LEASE_KEY));
    if (held && held.owner !== LEASE_OWNER && now - held.at < LEASE_TTL_MS) return false;
    localStorage.setItem(LEASE_KEY, `${LEASE_OWNER}|${now}`);
    return parseLease(localStorage.getItem(LEASE_KEY))?.owner === LEASE_OWNER;
  } catch {
    return false; // không chiếm được lease chắc chắn -> không flush (tránh gửi trùng)
  }
}

export function useOfflineQueue() {
  const auth = useAuthStore();

  /** Chỉ các mục của user đang đăng nhập (mục user khác không bao giờ lộ ra UI). */
  const pendingMessages = computed(() => {
    const uid = auth.user?.id;
    return uid ? store.value.filter(m => m.userId === uid) : [];
  });
  const pendingCount = computed(() => pendingMessages.value.length);

  function enqueue(conversationId: string, content: string): PendingMessage | null {
    const user = auth.user;
    if (!user?.id || !user.orgId) return null; // không biết là ai -> không xếp hàng
    const item: PendingMessage = {
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
      userId: user.id,
      orgId: user.orgId,
      status: 'pending',
    };
    mutate(queue => [...queue, item]);
    return item;
  }

  function cancel(id: string) {
    if (inFlight.has(id)) return; // đang gửi: không xóa giữa chừng
    mutate(queue => queue.filter(m => m.id !== id));
  }

  function mark(id: string, status: PendingStatus) {
    mutate(queue => queue.map(m => (m.id === id ? { ...m, status } : m)));
  }

  /** Gửi một mục: đánh dấu 'sending' + ghi storage TRƯỚC, xóa NGAY khi thành công, lỗi -> 'failed'. Trả true nếu đã gửi. */
  async function sendOne(msg: PendingMessage, sendFn: OfflineSendFn, me: { id: string; orgId: string }): Promise<boolean> {
    // Đổi/đăng xuất tài khoản giữa chừng: dừng, không gửi dưới danh nghĩa người khác.
    if (!sameUser(me)) return false;
    inFlight.add(msg.id);
    mark(msg.id, 'sending');
    // Mục đã bị tab khác gửi/xóa ngay trước khi ta 'chiếm' được -> không gửi (tránh trùng).
    if (!store.value.some(m => m.id === msg.id && m.status === 'sending')) {
      inFlight.delete(msg.id);
      return false;
    }
    try {
      // Dùng đúng conversationId/content đã chụp lúc bấm gửi, KHÔNG phụ thuộc hội thoại đang mở.
      await sendFn(msg.conversationId, msg.content);
      mutate(queue => queue.filter(m => m.id !== msg.id));
      return true;
    } catch {
      if (store.value.some(m => m.id === msg.id)) mark(msg.id, 'failed');
      return false;
    } finally {
      inFlight.delete(msg.id);
    }
  }

  function sameUser(me: { id: string; orgId: string }): boolean {
    const cur = currentUser();
    return !!cur && cur.id === me.id && cur.orgId === me.orgId;
  }

  function currentUser() {
    const u = auth.user;
    return u?.id && u.orgId ? { id: u.id, orgId: u.orgId } : null;
  }

  /** Tự gửi các mục đủ điều kiện, theo thứ tự. Lỗi đầu tiên dừng cả flush. */
  async function flush(sendFn: OfflineSendFn): Promise<void> {
    if (flushing) return;
    const me = currentUser();
    if (!me) return;
    flushing = true;
    try {
      await withFlushLock(async () => {
        reloadFromStorage();
        // Rào 1: dọn mục của user khác (kể cả khi lỡ sự kiện reset).
        purgeExcept(me.id);
        const blockedConvs = new Set<string>();
        for (const snapshot of [...store.value]) {
          if (!sameUser(me)) break; // tài khoản đã đổi giữa vòng lặp
          // Nạp lại trước mỗi mục: tab khác có thể đã gửi/xóa/đang gửi mục này.
          reloadFromStorage();
          const msg = store.value.find(m => m.id === snapshot.id);
          if (!msg) continue;
          if (msg.userId !== me.id || msg.orgId !== me.orgId) continue; // không bao giờ gửi mục của người khác
          if (msg.status !== 'pending' || isStale(msg)) {
            blockedConvs.add(msg.conversationId); // giữ thứ tự trong hội thoại: không để tin sau vượt tin "Chưa gửi"
            continue;
          }
          if (blockedConvs.has(msg.conversationId)) continue;
          const ok = await sendOne(msg, sendFn, me);
          if (!ok) break; // lỗi: dừng, giữ thứ tự, không retry vòng lặp
        }
      });
    } finally {
      flushing = false;
    }
  }

  /** "Gửi lại" thủ công cho mục Chưa gửi. Người dùng đã chủ động nên bỏ qua giới hạn 24h. */
  async function resend(id: string, sendFn: OfflineSendFn): Promise<boolean> {
    const me = currentUser();
    if (!me || flushing || inFlight.has(id)) return false;
    const msg = store.value.find(m => m.id === id);
    if (!msg || msg.userId !== me.id || msg.orgId !== me.orgId) return false;
    flushing = true;
    try {
      return await sendOne(msg, sendFn, me);
    } finally {
      flushing = false;
    }
  }

  return { pendingMessages, pendingCount, enqueue, cancel, flush, resend };
}

/** Chỉ dùng trong test: đưa module về trạng thái sạch. */
export function __resetOfflineQueueForTest() {
  flushing = false;
  inFlight.clear();
  store.value = [];
  storageWorks = true;
  try { localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY); localStorage.removeItem(LEASE_KEY); } catch { /* noop */ }
}
