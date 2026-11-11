// Mock F2 (Kho media) + F3 (Bạn bè / Nhóm / Marketing đọc) cho QA: dữ liệu GIẢ hoàn toàn. Hình dạng response lấy từ ACTUAL contract
// (frontend api/media.ts, composables/mobile-tools/mobile-tool-readers.ts, backend media-routes.ts: 403 PRIVACY_LOCKED, 409 NICK_ARCHIVED,
// 429 {error: limits.reason}, 400 NICK_NOT_CONNECTED, album/send trả {sent}).
// Đặt trên mock chat (installChatMocks) để /chat/:id, GET /conversations... chạy; route ở đây đăng ký SAU nên được ưu tiên; route lạ -> fallback.
// Không gọi backend / Zalo thật. serviceWorkers phải bị chặn ở test.use({ serviceWorkers: 'block' }).
import type { Page, Route } from '@playwright/test';
import zlib from 'node:zlib';
import { installChatMocks, type ChatMock, type ChatMockOptions } from './mock-chat';

export interface Req { method: string; path: string; query: Record<string, string>; body: unknown; t: number }
export interface Rule {
  /** regexp trên `${METHOD} ${path}` (path đã bỏ /api/v1, không có query) */
  match: RegExp;
  status?: number;
  abort?: boolean;
  /** trả body này (status mặc định 200 hoặc `status`) thay vì logic mặc định */
  body?: unknown;
  /** chờ promise này rồi mới trả lời (để dựng race có kiểm soát) */
  hold?: Promise<void>;
  delayMs?: number;
  /** số lần áp dụng (mặc định: vô hạn) */
  times?: number;
  /** gọi ngay khi request tới (trước hold) */
  onRequest?: (r: Req) => void | Promise<void>;
  /** gọi SAU khi đã trả lời xong */
  onDone?: (r: Req) => void | Promise<void>;
  /** lọc thêm theo query/body */
  when?: (r: Req) => boolean;
}

const svg = (n: number, label: string, hue: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},62%,58%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},58%,38%)"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="240" cy="90" r="42" fill="rgba(255,255,255,.35)"/><path d="M0 260 L110 150 L190 230 L250 180 L320 250 V320 H0Z" fill="rgba(0,0,0,.28)"/><text x="16" y="48" font-family="Arial" font-size="30" font-weight="700" fill="#fff">${label} ${n}</text></svg>`;

export interface MediaFixItem {
  id: string; kind: 'image' | 'video' | 'file'; name: string; visibility: 'private' | 'public'; ownerUserId: string | null; tagIds: string[]; usageCount: number;
  url: string | null; thumbnailUrl: string | null; sizeBytes: number | null; durationSec?: number | null; createdAt: string; ownerName?: string | null; sourceNickName?: string | null;
  folderId?: string | null;
}

export const FOLDERS = [
  { id: 'f-img-new', name: 'Sản phẩm mới', kind: 'image', visibility: 'public', ownerUserId: null },
  { id: 'f-img-promo', name: 'Khuyến mãi tháng 11 (riêng tư)', kind: 'image', visibility: 'private', ownerUserId: 'qa-user-admin' },
  { id: 'f-vid-guide', name: 'Video hướng dẫn', kind: 'video', visibility: 'public', ownerUserId: null },
  { id: 'f-file-price', name: 'Bảng giá', kind: 'file', visibility: 'public', ownerUserId: null },
];

export function buildMedia(counts = { images: 75, videos: 8, files: 7 }): MediaFixItem[] {
  const items: MediaFixItem[] = [];
  const ts = (i: number) => new Date(Date.parse('2026-11-09T09:00:00+07:00') - i * 3600_000).toISOString();
  for (let i = 1; i <= counts.images; i++) {
    const id = `qa-img-${String(i).padStart(3, '0')}`;
    items.push({
      id, kind: 'image', name: i === 4 ? 'Ảnh sản phẩm có tên rất dài để kiểm tra việc ngắt dòng trên màn hình hẹp 320 pixel.jpg' : `Ảnh sản phẩm ${String(i).padStart(3, '0')}.jpg`,
      visibility: i % 11 === 0 ? 'private' : 'public', ownerUserId: 'qa-user-admin', tagIds: [], usageCount: i % 5, url: `/qa-media/${id}.svg`, thumbnailUrl: `/qa-media/${id}.svg`,
      sizeBytes: 120_000 + i * 3_000, createdAt: ts(i), ownerName: 'QA Quản trị', sourceNickName: i % 2 ? 'Nick Giả 1' : null,
      folderId: i <= 12 ? 'f-img-new' : i <= 20 ? 'f-img-promo' : null,
    });
  }
  for (let i = 1; i <= counts.videos; i++) {
    const id = `qa-vid-${String(i).padStart(3, '0')}`;
    items.push({
      id, kind: 'video', name: `Video giới thiệu ${i}.mp4`, visibility: 'public', ownerUserId: 'qa-user-admin', tagIds: [], usageCount: 0, url: `/qa-media/${id}.mp4`, thumbnailUrl: `/qa-media/${id}.svg`,
      sizeBytes: 8_400_000 + i * 100_000, durationSec: 20 + i * 17, createdAt: ts(i), folderId: i <= 3 ? 'f-vid-guide' : null,
    });
  }
  for (let i = 1; i <= counts.files; i++) {
    const id = `qa-doc-${String(i).padStart(3, '0')}`;
    items.push({
      id, kind: 'file', name: i === 2 ? 'Bảng giá và chính sách bảo hành sản phẩm năm 2026 bản đầy đủ.pdf' : `Bảng giá ${i}.pdf`, visibility: 'public', ownerUserId: 'qa-user-admin', tagIds: [], usageCount: 1,
      url: `/qa-media/${id}.pdf`, thumbnailUrl: null, sizeBytes: 250_000 + i * 90_000, createdAt: ts(i), folderId: i <= 4 ? 'f-file-price' : null,
    });
  }
  return items;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const NICK_OPTS = [
  { id: 'qa-nick-1', displayName: 'Nick Giả 1', phone: '0900000101', avatarUrl: null, status: 'connected', privacyMode: 'sub', ownerUserId: null, archivedAt: null },
  { id: 'qa-nick-2', displayName: 'Nick Giả 2', phone: '0900000102', avatarUrl: null, status: 'connected', privacyMode: 'sub', ownerUserId: null, archivedAt: null },
];

export function buildFriends(nickId: string, n = 47) {
  const kinds = ['friend', 'friend', 'pending_friend', 'chatting_stranger', 'ghost'];
  return Array.from({ length: n }, (_, i) => ({
    id: `fr-${nickId}-${pad(i + 1, 3)}`, zaloAccountId: nickId, zaloAccount: { displayName: nickId === 'qa-nick-1' ? 'Nick Giả 1' : 'Nick Giả 2' },
    zaloDisplayName: `Bạn Zalo ${pad(i + 1)}`, aliasInNick: i % 7 === 0 ? `Anh Lan khách quen ${pad(i + 1)}` : null, zaloUidInNick: `uid${1000 + i}`,
    contact: i % 3 === 0 ? { crmName: `Nguyễn Văn Khách ${pad(i + 1)}`, fullName: `Nguyễn Văn Khách ${pad(i + 1)}`, leadScore: 40 + i } : null,
    relationshipKind: kinds[i % kinds.length], lastInteractionAt: new Date(Date.parse('2026-11-10T09:00:00+07:00') - i * 3600_000 * 5).toISOString(),
    becameFriendAt: i % 5 === 2 ? null : '2026-09-12T08:00:00.000Z', leadScore: i % 4 === 0 ? 55 + i : undefined, crmTagsPerNick: i % 6 === 0 ? ['VIP', 'Cần gọi lại'] : [],
  }));
}

/** PNG xác định (không phụ thuộc bộ dựng SVG của trình duyệt) để so điểm ảnh desktop; gradient dọc theo màu `hue`. */
const crcTable = (() => { const t: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
export function pngGradient(w: number, h: number, hue: number): Buffer {
  const hsl = (hh: number, ss: number, ll: number) => { const a = ss * Math.min(ll, 1 - ll); const f = (n: number) => { const k = (n + hh / 30) % 12; return Math.round(255 * (ll - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))))); }; return [f(0), f(8), f(4)]; };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; const [r, g, b] = hsl(hue, 0.6, 0.62 - (0.25 * y) / h); for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export interface F2F3Options extends ChatMockOptions {
  /** true = ảnh kho là PNG xác định (dùng cho so điểm ảnh desktop; SVG gradient gây nhiễu mép bo góc giữa hai lần chạy) */
  rasterImages?: boolean;
  /** user không có quyền nào ngoài cái mock-api cho -> dùng ChatMockOptions.user */
  media?: { images: number; videos: number; files: number };
  friends?: number;
}

export interface F2F3Mock {
  chat: ChatMock;
  media: MediaFixItem[];
  requests: Req[];
  rules: Rule[];
  /** số response album trả `sent` (null = đủ số ảnh gửi) */
  albumSent: { value: number | null | 'missing' };
  unhandled: string[];
  find: (method: string, pathRe: RegExp) => Req[];
  count: (method: string, pathRe: RegExp) => number;
  writes: () => Req[];
  mediaSends: () => Req[];
  addRule: (r: Rule) => Rule;
  clearRules: () => void;
}

export async function installF2F3Mocks(page: Page, opts: F2F3Options = {}): Promise<F2F3Mock> {
  const chat = await installChatMocks(page, opts);
  const media = buildMedia(opts.media);
  const requests: Req[] = [];
  const rules: Rule[] = [];
  const unhandled: string[] = [];
  const albumSent: F2F3Mock['albumSent'] = { value: null };
  const friendsByNick: Record<string, ReturnType<typeof buildFriends>> = {
    'qa-nick-1': buildFriends('qa-nick-1', opts.friends ?? 47), 'qa-nick-2': buildFriends('qa-nick-2', 9),
  };

  // Ảnh/video/tài liệu giả (cùng origin). Đăng ký riêng, không ghi vào requests API.
  await page.route('**/qa-media/**', async (route) => {
    const u = new URL(route.request().url());
    const file = u.pathname.split('/').pop() ?? '';
    const m = file.match(/^qa-(img|vid|doc)-(\d+)\.(svg|mp4|pdf)$/);
    if (!m) return route.fulfill({ status: 404, body: '' });
    const n = Number(m[2]);
    if (m[3] === 'svg' && opts.rasterImages) return route.fulfill({ status: 200, contentType: 'image/png', body: pngGradient(320, 320, (n * 37) % 360) });
    if (m[3] === 'svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(n, m[1] === 'vid' ? 'Video' : 'Ảnh', (n * 37) % 360) });
    if (m[3] === 'pdf') return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%QA fake\n' });
    return route.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
  });

  await page.route('**/api/v1/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method();
    const query = Object.fromEntries(url.searchParams);
    let body: unknown = null;
    const raw = req.postData();
    if (raw && (req.headers()['content-type'] ?? '').includes('json')) { try { body = JSON.parse(raw); } catch { body = raw; } }
    const rec: Req = { method, path: p, query, body, t: Date.now() };
    const noise = ['/profile', '/conversations/counts', '/setup/status'].includes(p) || p.includes('privacy') || p.startsWith('/dashboard') || p.includes('notification');
    if (!noise) requests.push(rec);
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    const key = `${method} ${p}`;

    const rule = rules.find(r => r.match.test(key) && (r.times === undefined || r.times > 0) && (!r.when || r.when(rec)));
    if (rule) {
      if (rule.times !== undefined) rule.times -= 1;
      await rule.onRequest?.(rec);
      if (rule.hold) await rule.hold;
      if (rule.delayMs) await new Promise(r => setTimeout(r, rule.delayMs));
      if (rule.abort) { await route.abort('internetdisconnected'); await rule.onDone?.(rec); return; }
      if (rule.status !== undefined || rule.body !== undefined) {
        await json(rule.body ?? { error: `qa-mock ${rule.status}` }, rule.status ?? 200);
        await rule.onDone?.(rec);
        return;
      }
      // rule chỉ để hold/ghi nhận: chạy logic mặc định rồi onDone
      const done = rule.onDone;
      if (done) setTimeout(() => { void done(rec); }, 0);
    }

    // ── Kho media (F2) ──
    if (method === 'GET' && p === '/media') {
      let list = media.filter(m => m.kind === (query.kind ?? 'image'));
      if (query.folderId) list = list.filter(m => m.folderId === query.folderId);
      if (query.q) list = list.filter(m => m.name.toLowerCase().includes(String(query.q).toLowerCase()));
      const skip = Number(query.skip ?? 0);
      const limit = Number(query.limit ?? 30);
      const items = list.slice(skip, skip + limit).map(({ folderId: _f, ...m }) => m);
      return json({ items, total: list.length });
    }
    if (method === 'GET' && p === '/media/folders') return json({ folders: FOLDERS });
    if (method === 'POST' && p === '/media/album/send') {
      const b = body as { assetIds: string[] };
      const a = albumSent.value;
      if (a === 'missing') return json({});
      return json({ sent: a === null ? b.assetIds.length : a });
    }
    if (method === 'POST' && /^\/media\/[^/]+\/send$/.test(p)) return json({ success: true });
    if (method === 'GET' && p.startsWith('/media/') && !p.startsWith('/media/folders')) return json({ items: [], total: 0 });

    // ── Nick ──
    if (method === 'GET' && p === '/privacy/status') return json({
      hasPin: false, lockedUntil: null, activeSessionCount: 0, activeSessions: [],
    });
    if (method === 'GET' && p === '/zalo-accounts') return json(NICK_OPTS);

    // ── Bạn bè (F3) ──
    const fr = p === '/friends-db/all-nicks' ? 'all' : (p.match(/^\/zalo-accounts\/([^/]+)\/friends-db$/)?.[1] ?? null);
    if (method === 'GET' && fr) {
      let list = fr === 'all' ? Object.values(friendsByNick).flat() : (friendsByNick[fr] ?? []);
      const counts: Record<string, number> = {};
      for (const f of list) counts[f.relationshipKind] = (counts[f.relationshipKind] ?? 0) + 1;
      if (query.kind && query.kind !== 'all') list = list.filter(f => f.relationshipKind === query.kind);
      if (query.search) list = list.filter(f => `${f.zaloDisplayName} ${f.aliasInNick ?? ''} ${f.contact?.crmName ?? ''}`.toLowerCase().includes(String(query.search).toLowerCase()));
      const page_ = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 20);
      return json({ friends: list.slice((page_ - 1) * limit, page_ * limit), total: list.length, counts });
    }

    // ── Nhóm (F3) ──
    let m = p.match(/^\/zalo-accounts\/([^/]+)\/groups$/);
    if (method === 'GET' && m) {
      const n = m[1] === 'qa-nick-1' ? 12 : 0;
      return json({ groups: Array.from({ length: n }, (_, i) => ({ id: `grp-${pad(i + 1)}`, name: i === 2 ? 'Nhóm khách hàng thân thiết khu vực phía Nam có tên dài hơn bình thường' : `Nhóm khách hàng ${pad(i + 1)}`, totalMember: 18 + i * 9 })) });
    }
    m = p.match(/^\/zalo-accounts\/([^/]+)\/groups\/([^/]+)\/members$/);
    if (method === 'GET' && m) {
      return json({ members: Array.from({ length: 26 }, (_, i) => ({ id: `mem-${pad(i + 1)}`, uid: `u${i}`, displayName: `Thành viên nhóm ${pad(i + 1)}`, isOwner: i === 0, isDeputy: i === 1 || i === 2 })) });
    }

    // ── Quét nhóm (F3) ──
    m = p.match(/^\/target-jobs\/group-scans\/([^/]+)$/);
    if (method === 'GET' && m) {
      return json({ scans: m[1] === 'qa-nick-1' ? [
        { id: 'scan-1', groupNames: ['Nhóm khách hàng 01', 'Nhóm khách hàng 02'], scannedGroups: 2, memberCount: 64, friendCount: 21, notFriendCount: 43, createdAt: '2026-11-08T03:00:00.000Z' },
        { id: 'scan-2', groupNames: [], scannedGroups: 1, memberCount: 120, friendCount: 5, notFriendCount: 115, createdAt: '2026-11-02T03:00:00.000Z' },
      ] : [] });
    }
    m = p.match(/^\/zalo-accounts\/([^/]+)\/group-scans\/([^/]+)\/members$/);
    if (method === 'GET' && m) {
      const total = m[2] === 'scan-1' ? 64 : 120;
      const page_ = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 30);
      const from = (page_ - 1) * limit;
      const n = Math.max(0, Math.min(limit, total - from));
      return json({ members: Array.from({ length: n }, (_, i) => ({ id: `sm-${m![2]}-${from + i}`, displayName: `Thành viên quét ${pad(from + i + 1, 3)}`, isFriend: (from + i) % 3 === 0, isAdmin: from + i === 0 })), total });
    }

    // ── Tệp khách hàng (F3) ──
    if (method === 'GET' && p === '/customer-lists') {
      const all = Array.from({ length: 4 }, (_, i) => ({ id: `list-${i + 1}`, name: ['Khách hội chợ tháng 10', 'Danh sách cũ 2025', 'Khách giới thiệu', 'Đối tác khu vực'][i], iconEmoji: i === 0 ? '🎯' : '', status: 'active', totalEntries: 120 + i * 15, hasZaloEntries: 80 + i * 4, invalidEntries: 3 + i, createdBy: { fullName: 'Trần Giả Lan' } }));
      const s = String(query.search ?? '').toLowerCase();
      const list = s ? all.filter(l => l.name.toLowerCase().includes(s)) : all;
      return json({ lists: list.map(l => ({ ...l, status: 'done', sourceType: 'paste', archivedAt: null,
        createdAt: '2026-11-09T02:00:00.000Z', startedAt: '2026-11-09T02:00:00.000Z', endedAt: '2026-11-09T02:00:00.000Z',
        validEntries: l.totalEntries - l.invalidEntries, dupInListEntries: 0, dupCrossListEntries: 0,
        dupWithContactEntries: 0, noZaloEntries: l.totalEntries - l.hasZaloEntries, pendingLookupEntries: 0,
      })), total: list.length });
    }
    m = p.match(/^\/customer-lists\/([^/]+)$/);
    if (method === 'GET' && m) return json({
      id: m[1], name: 'Khách hội chợ tháng 10', totalEntries: 120, hasZaloEntries: 80, sourceType: 'paste', status: 'done',
      createdAt: '2026-11-09T02:00:00.000Z', startedAt: '2026-11-09T02:00:00.000Z', endedAt: '2026-11-09T02:00:00.000Z',
      createdBy: { id: 'qa-user-admin', fullName: 'Trần Giả Lan', email: 'qa@example.test' }, archivedAt: null,
      validEntries: 117, invalidEntries: 3, dupInListEntries: 0, dupCrossListEntries: 0, dupWithContactEntries: 0,
      noZaloEntries: 37, pendingLookupEntries: 0,
    });
    m = p.match(/^\/customer-lists\/([^/]+)\/entries$/);
    if (method === 'GET' && m) {
      const total = 54;
      const page_ = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 30);
      const from = (page_ - 1) * limit;
      const n = Math.max(0, Math.min(limit, total - from));
      return json({ entries: Array.from({ length: n }, (_, i) => {
        const k = from + i;
        return { id: `en-${k}`, nameRaw: k % 4 === 0 ? '' : `Khách mẫu ${pad(k + 1, 3)}`, phoneLocal: `09000${pad(k + 100, 5)}`, phoneValid: k % 9 !== 8, hasZalo: k % 3 === 0 ? true : k % 3 === 1 ? false : null, zaloName: k % 3 === 0 ? `Zalo mẫu ${k + 1}` : '', invalidReason: k % 9 === 8 ? 'Số không đúng định dạng' : '' };
      }), total });
    }

    // ── Các chức năng Marketing còn lại (F3) ──
    if (method === 'GET' && p === '/target-jobs') {
      return json({ jobs: [
        { id: 'tj-1', name: 'Kết bạn khách hội chợ', sourceType: 'list', list: { name: 'Khách hội chợ tháng 10' }, nick: { displayName: 'Nick Giả 1' }, status: 'active', sentCount: 14, maxTotal: 60, noZaloCount: 5, failedCount: 1 },
        { id: 'tj-2', name: 'Kết bạn từ quét nhóm', sourceType: 'group_scan', nick: { displayName: 'Nick Giả 2' }, status: 'paused', sentCount: 0, maxTotal: 100, noZaloCount: 0, failedCount: 0 },
      ] });
    }
    if (method === 'GET' && p === '/broadcast-jobs') {
      return json({ jobs: [{ id: 'bj-1', name: 'Thông báo khuyến mãi tháng 11', scheduleType: 'weekly', status: 'active', nextRunAt: '2026-11-14T02:00:00.000Z', nick: { displayName: 'Nick Giả 1' }, latestRun: { sentCount: 40, failedCount: 2, skippedCount: 3 } }] });
    }
    if (method === 'GET' && p === '/automation/sequences') {
      return json({ sequences: [{ id: 'sq-1', name: 'Bám đuổi 7 ngày', description: 'Nhắc khách sau 1, 3 và 7 ngày', stepCount: 3, enabled: true }, { id: 'sq-2', name: 'Luồng cũ đã tắt', stepCount: 2, enabled: false }] });
    }
    if (method === 'GET' && p === '/content-blocks') {
      return json({ blocks: [{ id: 'cb-1', name: 'Giới thiệu sản phẩm', messageText: 'Chào anh/chị, bên em gửi anh/chị thông tin sản phẩm mới nhất kèm bảng giá ưu đãi tháng này ạ.', usageCount: 12, enabled: true }] });
    }
    if (method === 'GET' && p === '/automation/templates') {
      return json({ templates: [{ id: 'tp-1', name: 'Chào khách mới', content: '<p>Dạ em chào anh/chị ạ</p>', shortcut: 'chao' }] });
    }
    if (method === 'GET' && p === '/automation/care-sessions') {
      return json({
        sessions: [{ id: 'cs-1', contactId: 'ct-1', contactName: 'Khách Giả A', contactPhone: null, sequenceId: 'sq-1', sequenceName: 'Bám đuổi 7 ngày', nickName: 'Nick Giả 1', sourceType: 'manual', state: 'running', currentStepIdx: 1, totalSteps: 3, stepsSent: 1, lastSentAt: '2026-11-09T02:00:00.000Z', nextRunAt: '2026-11-11T02:00:00.000Z', pausedUntil: null, lastReplyAt: null, lastError: null, openedAt: '2026-11-08T02:00:00.000Z', closedAt: null, closedReason: null, dryRun: true }],
        summary: { total: 1, running: 1, paused: 0, completed: 0, stopped: 0 }, dryRun: true,
      });
    }

    if (method !== 'GET' && !noise) unhandled.push(key);
    return route.fallback();
  });

  const self: F2F3Mock = {
    chat, media, requests, rules, albumSent, unhandled,
    find: (method, re) => requests.filter(r => r.method === method && re.test(r.path)),
    count: (method, re) => requests.filter(r => r.method === method && re.test(r.path)).length,
    writes: () => requests.filter(r => r.method !== 'GET'),
    mediaSends: () => requests.filter(r => r.method === 'POST' && /^\/media\/(album\/send|[^/]+\/send)$/.test(r.path)),
    addRule: (r) => { rules.push(r); return r; },
    clearRules: () => { rules.length = 0; },
  };
  return self;
}

/** Promise + hàm giải phóng, để dựng race có kiểm soát. */
export function gate() {
  let release!: () => void;
  const p = new Promise<void>(r => { release = r; });
  return { p, release };
}
