// Mock chat cho QA đợt C: dữ liệu GIẢ hoàn toàn (không SĐT/tin/token thật), dựng bằng page.route + page.routeWebSocket.
// Đăng ký SAU installMocks() nên được ưu tiên; route nào không thuộc chat -> route.fallback() về mock nền (installMocks).
import type { BrowserContext, Page, Route, WebSocketRoute } from '@playwright/test';
import { ADMIN, installMocks, type FakeUser, type MockState } from './mock-api';

export const T0 = Date.parse('2026-11-07T10:00:00+07:00');
export const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

export interface FakeConv {
  id: string;
  name: string;
  nick: string;
  nickId: string;
  owner: string | null;
  unread: number;
  replied: boolean;
  lastAt: string;
  preview: string;
  extra?: Partial<Record<string, unknown>>;
}

export const NICKS = [
  { id: 'qa-nick-1', name: 'Nick Giả 1' },
  { id: 'qa-nick-2', name: 'Nick Giả 2' },
];

/** 30 hội thoại giả. Chẵn = chưa trả lời (để bộ lọc "Chưa trả lời" vẫn còn >= 15 hàng, đủ để cuộn). */
export function buildConvs(): FakeConv[] {
  return Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    return {
      id: `qa-conv-${n}`,
      name: n === 1 ? 'Khách Giả A' : n === 2 ? 'Khách Giả B' : `Khách Giả ${n}`,
      nick: NICKS[i % 2].name,
      nickId: NICKS[i % 2].id,
      owner: i % 5 === 4 ? null : (i % 3 === 0 ? 'Trần Giả Lan' : 'Lê Giả Minh'),
      unread: i % 4 === 0 ? (i % 8) + 1 : 0,
      replied: i % 2 === 1,
      lastAt: iso(-i * 7),
      preview: i === 0 ? 'Cho mình hỏi giá sản phẩm mẫu nhé (dữ liệu giả)' : `Tin nhắn mẫu số ${n} (dữ liệu giả)`,
    };
  });
}

function convJson(c: FakeConv) {
  return {
    id: c.id,
    channel: 'zalo',
    channelAccount: null,
    threadType: 'user',
    contact: {
      id: `qa-k-${c.id}`, fullName: c.name, avatarUrl: null, phone: null,
      assignedUserId: c.owner ? 'qa-owner' : null,
      assignedUser: c.owner ? { id: 'qa-owner', fullName: c.owner } : null,
      contactAccess: [], _count: { contactAccess: c.owner ? 1 : 0 },
      totalInbound: 3, totalOutbound: 2, tags: [],
    },
    zaloAccount: { id: c.nickId, displayName: c.nick, avatarUrl: null, privacyMode: 'sub', ownerUserId: null, archivedAt: null },
    externalThreadId: `qa-ext-${c.id}`,
    friendship: null,
    lastMessageAt: c.lastAt,
    unreadCount: c.unread,
    isReplied: c.replied,
    isPinned: false,
    isVirtual: false,
    messages: [{ id: `${c.id}-last`, content: c.preview, contentType: 'text', senderType: c.replied ? 'self' : 'contact', sentAt: c.lastAt, isDeleted: false }],
    ...(c.extra ?? {}),
  };
}

export function fakeMessage(convId: string, n: number, over: Record<string, unknown> = {}) {
  const self = n % 3 === 0;
  return {
    id: `${convId}-m${String(n).padStart(3, '0')}`,
    content: self ? `Bên mình phản hồi tin số ${n} (dữ liệu giả)` : `Khách hỏi câu số ${n}: thông tin mẫu cho kiểm thử, không phải dữ liệu thật.`,
    contentType: 'text',
    senderType: self ? 'self' : 'contact',
    senderName: self ? 'QA Quản trị' : 'Khách Giả',
    senderUid: self ? 'qa-self' : 'qa-peer',
    sentAt: iso(-600 + n),
    isDeleted: false,
    zaloMsgId: `${convId}-z${n}`,
    zaloMsgIdNum: String(1_000_000 + n),
    albumKey: null, albumIndex: null, albumTotal: null,
    reactions: [], deliveredAt: null, seenAt: null,
    ...over,
  };
}

export interface RecordedRequest { method: string; path: string; query: Record<string, string>; body: unknown; contentType: string; rawText?: string }

export interface ChatMockOptions {
  user?: FakeUser;
  waiting?: number;
  /** số tin của conv-1 (mặc định 60, đủ dài để cuộn). Conv khác có 6 tin. */
  longThread?: number;
  /** ép POST /conversations/:id/attachments trả mã lỗi này */
  attachmentStatus?: { status: number; code?: string; error?: string } | null;
  /** độ trễ (ms) cho GET /conversations (test loading) */
  convDelayMs?: number;
  /** ép GET /conversations trả 500 (test error) */
  convFail?: boolean;
  convEmpty?: boolean;
  /** hội thoại thuộc nick Riêng tư của NGƯỜI KHÁC (server đã redact nội dung) */
  privateConvs?: string[];
  /** AI: nội dung gợi ý trả về */
  aiText?: string;
}

export interface ChatMock {
  base: MockState;
  convs: FakeConv[];
  requests: RecordedRequest[];
  options: ChatMockOptions;
  msgs: Map<string, ReturnType<typeof fakeMessage>[]>;
  /** số WebSocket đã mở / đã đóng */
  ws: { opened: number; closed: number; live: WebSocketRoute[]; /** true -> từ chối mọi kết nối WS mới (mô phỏng mất mạng realtime) */ refuse: boolean };
  /** Gửi một sự kiện Socket.IO tới mọi socket đang mở. */
  emit(event: string, data: unknown): void;
  /** Tin đến (khách nhắn) vào hội thoại convId: thêm vào store mock + phát chat:message. */
  inbound(convId: string, text?: string): ReturnType<typeof fakeMessage>;
  count(method: string, pathRe: RegExp): number;
  find(method: string, pathRe: RegExp): RecordedRequest[];
  consoleErrors: string[];
}

export async function installChatMocks(page: Page, opts: ChatMockOptions = {}): Promise<ChatMock> {
  const base = await installMocks(page, { user: opts.user ?? ADMIN, waiting: opts.waiting ?? 7 });
  const convs = buildConvs();
  const msgs = new Map<string, ReturnType<typeof fakeMessage>[]>();
  const long = opts.longThread ?? 60;
  for (const c of convs) {
    const n = c.id === 'qa-conv-1' ? long : 6;
    msgs.set(c.id, Array.from({ length: n }, (_, i) => fakeMessage(c.id, i + 1)));
  }
  for (const id of opts.privateConvs ?? []) {
    const c = convs.find(x => x.id === id)!;
    c.extra = { ...c.extra, zaloAccount: { id: c.nickId, displayName: c.nick, avatarUrl: null, privacyMode: 'main', ownerUserId: 'qa-other-owner', archivedAt: null } };
    c.preview = '';
    msgs.set(id, (msgs.get(id) ?? []).map(m => ({ ...m, content: '', redacted: true })));
  }
  const requests: RecordedRequest[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });

  const mock: ChatMock = {
    base, convs, requests, options: opts, msgs, consoleErrors,
    ws: { opened: 0, closed: 0, live: [], refuse: false },
    emit(event, data) {
      const frame = `42${JSON.stringify([event, data])}`;
      for (const w of this.ws.live) w.send(frame);
    },
    inbound(convId, text) {
      const list = msgs.get(convId)!;
      const m = fakeMessage(convId, list.length + 1, {
        senderType: 'contact', senderName: 'Khách Giả', content: text ?? `Tin mới đến lúc ${list.length + 1} (dữ liệu giả)`,
        sentAt: new Date(Date.now()).toISOString(), zaloMsgIdNum: String(2_000_000 + list.length),
      });
      list.push(m);
      const conv = convs.find(c => c.id === convId);
      this.emit('chat:message', { message: m, conversationId: convId, accountId: conv?.nickId });
      return m;
    },
    count(method, re) { return requests.filter(r => r.method === method && re.test(r.path)).length; },
    find(method, re) { return requests.filter(r => r.method === method && re.test(r.path)); },
  };

  // Socket.IO giả (giao thức Engine.IO v4 qua WebSocket): đủ để client coi là "connected" và nhận sự kiện.
  await page.routeWebSocket(/socket\.io/, (ws) => {
    if (mock.ws.refuse) { void ws.close(); return; }
    mock.ws.opened += 1;
    mock.ws.live.push(ws);
    ws.send('0{"sid":"qa-eio","upgrades":[],"pingInterval":25000,"pingTimeout":60000,"maxPayload":1000000}');
    ws.onMessage((m) => {
      const s = typeof m === 'string' ? m : m.toString();
      if (s.startsWith('40')) ws.send('40{"sid":"qa-sio"}');
      else if (s === '2') ws.send('3');
    });
    ws.onClose(() => { mock.ws.closed += 1; mock.ws.live = mock.ws.live.filter(x => x !== ws); });
  });

  await page.route('**/api/v1/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const ctype = req.headers()['content-type'] ?? '';
    const record = (body: unknown, rawText?: string) => requests.push({ method, path: p, query: Object.fromEntries(url.searchParams), body, contentType: ctype, rawText });

    // GET /conversations (danh sách)
    if (method === 'GET' && p === '/conversations') {
      record(null);
      if (opts.convDelayMs) await new Promise(r => setTimeout(r, opts.convDelayMs));
      if (opts.convFail) return json({ error: 'qa-mock' }, 500);
      if (opts.convEmpty) return json({ conversations: [], hasMore: false, total: 0 });
      let list = convs;
      const q = url.searchParams;
      if (q.get('unreplied') === 'true') list = list.filter(c => !c.replied);
      if (q.get('unread') === 'true') list = list.filter(c => c.unread > 0);
      if (q.get('accountId')) list = list.filter(c => c.nickId === q.get('accountId'));
      if (q.get('search')) list = list.filter(c => c.name.toLowerCase().includes(String(q.get('search')).toLowerCase()));
      return json({ conversations: list.map(convJson), hasMore: false, total: list.length });
    }
    const m = p.match(/^\/conversations\/([^/]+)(\/.*)?$/);
    if (m && m[1] !== 'counts' && m[1] !== 'sidebar-tags') {
      const id = m[1];
      const sub = m[2] ?? '';
      const conv = convs.find(c => c.id === id);
      if (method === 'GET' && sub === '') { record(null); return conv ? json(convJson(conv)) : json({ error: 'not found' }, 404); }
      if (method === 'GET' && sub === '/messages') {
        record(null);
        if (!conv) return json({ error: 'not found' }, 404);
        return json({ messages: msgs.get(id) ?? [] });
      }
      if (method === 'POST' && sub === '/mark-read') { record(null); return json({ success: true }); }
      if (method === 'POST' && sub === '/messages') {
        const body = req.postDataJSON();
        record(body);
        const list = msgs.get(id) ?? [];
        const sent = fakeMessage(id, list.length + 1, { senderType: 'self', senderName: 'QA Quản trị', content: body?.content ?? '', sentAt: new Date().toISOString(), zaloMsgIdNum: String(3_000_000 + list.length) });
        list.push(sent);
        return json(sent);
      }
      if (method === 'POST' && sub === '/attachments') {
        const buf = req.postDataBuffer();
        record(null, buf ? buf.toString('latin1').slice(0, 4000) : '');
        if (opts.attachmentStatus) {
          const { status, code, error } = opts.attachmentStatus;
          return json({ error: error ?? 'qa-mock', ...(code ? { code } : {}) }, status);
        }
        return json({ success: true, messages: [] });
      }
    }
    if (method === 'GET' && p === '/ai/config') { record(null); return json({ provider: 'gemini', model: 'qa-model', maxDaily: 50, enabled: true, hasAnthropicKey: false, hasGeminiKey: true }); }
    if (method === 'GET' && p === '/ai/usage') { record(null); return json({ usedToday: 1, maxDaily: 50, remaining: 49, enabled: true }); }
    if (method === 'POST' && p === '/ai/suggest') {
      record(req.postDataJSON());
      return json({ content: opts.aiText ?? 'Dạ em gửi anh/chị bảng giá mẫu (gợi ý giả của AI), anh/chị cần em tư vấn thêm không ạ?', sources: ['Tài liệu giả 1'] });
    }
    if (method === 'GET' && /^\/(zalo-accounts)$/.test(p)) {
      record(null);
      return json(NICKS.map(n => ({ id: n.id, displayName: n.name, avatarUrl: null, status: 'connected', privacyMode: 'sub', ownerUserId: null, archivedAt: null })));
    }
    return route.fallback();
  });

  return mock;
}

// ───────── Tiện ích đo/điều khiển dùng chung ─────────

export const APP = '.crm-mobile.m-shell';

/** Đặt giao diện (Sáng/Tối) trước khi tải trang. */
export async function setTheme(page: Page, theme: 'light' | 'dark', userId = ADMIN.id) {
  await page.addInitScript(([t, u]) => { localStorage.setItem(`crm.mobile.themePreference:${u}`, t); }, [theme, userId] as const);
}

/** Mô phỏng safe-area-bottom (chỉ mô phỏng; env() = 0 trên desktop). */
export async function simulateSafe(page: Page, bottom: number, top = 0) {
  await page.evaluate(([b, t]) => {
    const el = document.querySelector('.crm-mobile.m-shell') as HTMLElement | null;
    el?.style.setProperty('--m-safe-bottom', `${b}px`);
    el?.style.setProperty('--m-safe-top', `${t}px`);
  }, [bottom, top] as const);
}

export async function waitInbox(page: Page) {
  await page.locator(APP).waitFor({ state: 'attached', timeout: 15_000 });
  await page.locator('.m-conv-row').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(300);
}

export async function waitThread(page: Page) {
  await page.locator('.mobile-chat .message-thread.is-mobile').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('.mobile-chat .message-thread.is-mobile .msg-bubble-wrap').first().waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(500);
}

export const EDITOR = '.mobile-chat .is-mobile .input-editor [contenteditable="true"]';

/**
 * Bật/tắt mạng bằng context.setOffline; nếu trình duyệt không cập nhật navigator.onLine / không phát sự kiện thì bổ sung
 * thủ công và trả về true (để báo cáo ghi rõ đã phải mô phỏng thêm).
 */
export async function setNetwork(page: Page, context: BrowserContext, online: boolean): Promise<boolean> {
  await page.evaluate(() => {
    (window as unknown as { __qaNetEvents: string[] }).__qaNetEvents = [];
    window.addEventListener('online', () => (window as unknown as { __qaNetEvents: string[] }).__qaNetEvents.push('online'));
    window.addEventListener('offline', () => (window as unknown as { __qaNetEvents: string[] }).__qaNetEvents.push('offline'));
  });
  await context.setOffline(!online);
  await page.waitForTimeout(400);
  const ok = await page.evaluate((want) => {
    const events = (window as unknown as { __qaNetEvents: string[] }).__qaNetEvents;
    return navigator.onLine === want && events.includes(want ? 'online' : 'offline');
  }, online);
  if (ok) return false;
  await page.evaluate((want) => {
    Object.defineProperty(navigator, 'onLine', { get: () => want, configurable: true });
    window.dispatchEvent(new Event(want ? 'online' : 'offline'));
  }, online);
  await page.waitForTimeout(300);
  return true;
}

// PNG 1x1 hợp lệ (ảnh giả)
export const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Đợi phần tử ngừng chuyển động (bounding box không đổi qua 3 lần đo cách 150ms) - sheet trượt chậm hơn trên WebKit khi máy tải. */
export async function settle(page: Page, selector: string, timeoutMs = 6000) {
  const t0 = Date.now();
  let prev = '';
  let same = 0;
  while (Date.now() - t0 < timeoutMs) {
    const b = await page.locator(selector).first().boundingBox();
    const key = b ? `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.width.toFixed(1)},${b.height.toFixed(1)}` : 'none';
    same = key === prev ? same + 1 : 0;
    prev = key;
    if (same >= 3) return;
    await page.waitForTimeout(150);
  }
}

/** Đợi sheet trượt vào xong: đáy sheet vào trong viewport (tối đa 4s - nếu sheet thật sự tràn đáy thì để test báo lỗi) rồi chờ đứng yên. */
export async function settleSheet(page: Page) {
  const sel = '.m-sheet:visible';
  const vh = page.viewportSize()!.height;
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const b = await page.locator(sel).first().boundingBox();
    if (b && b.y + b.height <= vh + 1) break;
    await page.waitForTimeout(100);
  }
  await settle(page, sel);
}
