// Mock CRM cho QA đợt D: dữ liệu GIẢ hoàn toàn (không SĐT/tin/token thật). Chồng lên mock chat (installChatMocks),
// ghi lại MỌI request /api/v1 (page.on('request')) để đếm gọi API desktop và so payload.
import type { Page, Route } from '@playwright/test';
import { ADMIN, type FakeUser } from './mock-api';
import { installChatMocks, iso, type ChatMock, type ChatMockOptions } from './mock-chat';

export interface Call { method: string; path: string; query: Record<string, string>; body: unknown }

export interface CrmMockOptions extends ChatMockOptions {
  user?: FakeUser;
  contactTotal?: number;
  /** GET /contacts trả 500 */
  contactsFail?: boolean;
  /** GET /contacts chậm (ms) */
  contactsDelayMs?: number;
  /** GET /appointments trả 500 */
  apptFail?: boolean;
  /** action-hub/me trả 500 */
  hubFail?: boolean;
  /** hàng chờ ở Tổng quan */
  urgentCount?: number;
}

export interface CrmMock {
  chat: ChatMock;
  calls: Call[];
  count(method: string, re: RegExp): number;
  find(method: string, re: RegExp): Call[];
  /** các đường dẫn API mà không mock nào xử lý riêng (để soi) */
  unhandled(): string[];
}

export const CONTACT_ONE_CONV = 'qa-ct-1'; // 1 hội thoại: qa-conv-1
export const CONTACT_TWO_CONV = 'qa-ct-2'; // 2 hội thoại: qa-conv-2, qa-conv-3
export const CONTACT_NO_CONV = 'qa-ct-3';

const USERS = [
  { id: 'qa-owner', fullName: 'Lê Giả Minh', email: 'minh@example.invalid', role: 'member', isActive: true },
  { id: 'qa-owner-2', fullName: 'Trần Giả Lan', email: 'lan@example.invalid', role: 'member', isActive: true },
];

function contactJson(n: number) {
  const id = `qa-ct-${n}`;
  const owner = n % 3 === 0 ? null : USERS[n % 2];
  return {
    id, fullName: n === 1 ? 'Khách Giả A' : n === 2 ? 'Khách Giả B' : `Khách Giả CRM ${n}`, crmName: null,
    phone: n % 4 === 0 ? null : `0900000${String(n).padStart(3, '0')}`, email: null, avatarUrl: null,
    source: n % 2 ? 'GT' : 'FB', status: n % 5 === 0 ? 'contacted' : 'new', tags: n % 7 === 0 ? ['VIP giả'] : [],
    leadScore: 10 + n, lastActivity: iso(-n * 30), mergedInto: null, nextAppointment: null, notes: n === 1 ? 'Ghi chú mẫu (dữ liệu giả)' : null,
    _count: { conversations: n === 1 ? 1 : n === 2 ? 2 : 0, appointments: 0 },
    nicksByKind: { friend: n === 2 ? 2 : 1 },
    assignedUserId: owner?.id ?? null, assignedUser: owner ? { id: owner.id, fullName: owner.fullName } : null,
    contactAccess: owner ? [{ role: 'primary', source: 'manual', createdAt: iso(-1000), user: { id: owner.id, fullName: owner.fullName, email: null } }] : [],
    createdAt: iso(-100000), updatedAt: iso(-10),
  };
}

function profileJson(n: number) {
  const c = contactJson(n);
  const nicks = n === 2 ? ['qa-nick-1', 'qa-nick-2'] : ['qa-nick-1'];
  return {
    contact: {
      id: c.id, displayName: c.fullName, fullName: c.fullName, crmName: null, email: null, addressLine: null, occupation: null,
      phone: c.phone, phone2: null, phone3: null, gender: null, birthDate: null, birthYear: null, province: null, district: null, ward: null,
      leadScore: c.leadScore, statusId: null, statusName: 'Mới', avatarUrl: null,
    },
    friends: nicks.map((a, i) => ({
      id: `qa-fr-${n}-${i}`, zaloUid: null, accountId: a, accountName: i ? 'Nick Giả 2' : 'Nick Giả 1', displayName: c.fullName, aliasInNick: null,
      leadScore: c.leadScore, statusName: 'Mới', relationshipKind: 'friend', totalInbound: 3, totalOutbound: 2, lastInboundAt: iso(-30),
    })),
    aggregateScore: c.leadScore, aggregateTags: c.tags,
    primaryOwner: c.assignedUser ? { userId: c.assignedUser.id, userName: c.assignedUser.fullName } : null,
  };
}

function activityJson(n: number) {
  const convs = n === 1 ? ['qa-conv-1'] : n === 2 ? ['qa-conv-2', 'qa-conv-3'] : [];
  return convs.map((cid, i) => ({
    zaloAccountId: i ? 'qa-nick-2' : 'qa-nick-1',
    zaloAccount: { id: i ? 'qa-nick-2' : 'qa-nick-1', displayName: i ? 'Nick Giả 2' : 'Nick Giả 1', phone: null, avatarUrl: null },
    conversationId: cid, totalInbound: 3, totalOutbound: 2,
    lastInbound: { id: `${cid}-in`, content: 'Tin mẫu (giả)', contentType: 'text', sentAt: iso(-20) },
    lastOutbound: { id: `${cid}-out`, content: 'Phản hồi mẫu (giả)', contentType: 'text', sentAt: iso(-10), repliedByUserId: 'qa-owner', repliedBy: { id: 'qa-owner', fullName: 'Lê Giả Minh' } },
  }));
}

/** Lịch hẹn trong tuần 02-08/11/2026 (giờ cố định của test là 07/11/2026 10:00 +07). Có 1 lịch nguồn Zalo. */
export function buildAppointments() {
  const mk = (id: string, date: string, time: string, title: string, over: Record<string, unknown> = {}) => ({
    id, contactId: 'qa-ct-1', contact: { id: 'qa-ct-1', fullName: 'Khách Giả A', phone: null }, appointmentDate: date, appointmentTime: time,
    title, durationMin: 30, location: null, type: 'meeting', status: 'scheduled', notes: null, createdAt: '2026-11-01T00:00:00Z',
    source: 'manual', externalRef: null, zaloMessageId: null, emoji: null, conversationId: null, statusChangedAt: null, statusChangedBy: null,
    assignedUserId: 'qa-user-admin', assignedUser: { id: 'qa-user-admin', fullName: 'QA Quản trị' }, ...over,
  });
  return [
    mk('qa-apt-1', '2026-11-07', '14:00', 'Hẹn gọi lại giả'),
    mk('qa-apt-zalo', '2026-11-07', '16:30', 'Hẹn từ tin Zalo giả', { source: 'zalo', externalRef: 'qa-ext-ref-1', zaloMessageId: 'qa-zmsg-1', conversationId: 'qa-conv-1' }),
    mk('qa-apt-3', '2026-11-05', '09:00', 'Hẹn đã qua giả', { status: 'completed' }),
    mk('qa-apt-4', '2026-11-08', '10:00', 'Hẹn Chủ nhật giả', { type: 'call' }),
  ];
}

export async function installCrmMocks(page: Page, opts: CrmMockOptions = {}): Promise<CrmMock> {
  const chat = await installChatMocks(page, { ...opts, user: opts.user ?? ADMIN });
  const calls: Call[] = [];
  const unhandled: string[] = [];
  const total = opts.contactTotal ?? 45;
  const appts = buildAppointments();

  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/v1/')) return;
    let body: unknown = null;
    try { body = r.postDataJSON(); } catch { body = null; }
    calls.push({ method: r.method(), path: u.pathname.replace(/^\/api\/v1/, ''), query: Object.fromEntries(u.searchParams), body });
  });

  await page.route('**/api/v1/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method();
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

    if (method === 'GET' && p === '/contacts') {
      if (opts.contactsDelayMs) await new Promise(r => setTimeout(r, opts.contactsDelayMs));
      if (opts.contactsFail) return json({ error: 'qa-mock' }, 500);
      const q = url.searchParams;
      let list = Array.from({ length: total }, (_, i) => contactJson(i + 1));
      const search = (q.get('search') ?? '').toLowerCase();
      if (search) list = list.filter(c => (c.fullName ?? '').toLowerCase().includes(search) || (c.phone ?? '').includes(search));
      if (q.get('status')) list = list.filter(c => c.status === q.get('status'));
      if (q.get('source')) list = list.filter(c => c.source === q.get('source'));
      if (q.get('assignedUserId')) list = list.filter(c => c.assignedUserId === q.get('assignedUserId'));
      const page_ = Number(q.get('page') ?? 1);
      const limit = Number(q.get('limit') ?? 20);
      return json({ contacts: list.slice((page_ - 1) * limit, page_ * limit), total: list.length, page: page_, limit });
    }
    if (method === 'GET' && p === '/contacts/stats') return json({ total: 0, byStatus: {}, bySource: {} });
    if (method === 'GET' && p === '/contacts/duplicates') return json({ groups: [], total: 0 });
    const cm = p.match(/^\/contacts\/qa-ct-(\d+)(\/profile|\/account-activity)?$/);
    if (cm && method === 'GET') {
      const n = Number(cm[1]);
      if (n < 1 || n > total) return json({ error: 'not found' }, 404);
      if (cm[2] === '/profile') return json(profileJson(n));
      if (cm[2] === '/account-activity') return json({ items: activityJson(n) });
      return json(contactJson(n));
    }
    if (method === 'GET' && p === '/users') return json({ users: USERS });
    if (method === 'GET' && p === '/dashboard/action-hub/picker/users') return json({
      users: USERS.map(user => ({ ...user, isSelf: false, departmentName: 'Phòng QA giả' })), canViewAll: true,
    });
    if (method === 'GET' && p === '/dashboard/action-hub/picker/depts') return json({ depts: [] });
    if (method === 'GET' && p === '/organization') return json({ id: 'qa-org', name: 'Công ty QA Giả', timezone: '+07:00', logoUrl: '', slogan: 'Khẩu hiệu giả', copyright: '', emailDomain: 'example.invalid' });
    if (method === 'GET' && p === '/appointments') {
      if (opts.apptFail) return json({ error: 'qa-mock' }, 500);
      return json({ appointments: appts, total: appts.length, counts: {} });
    }
    if (method === 'POST' && p === '/appointments') {
      const created = { ...appts[0], id: 'qa-apt-new', ...(req.postDataJSON() ?? {}) };
      appts.push(created);
      return json(created, 201);
    }
    const appointmentMatch = p.match(/^\/appointments\/([^/]+)(\/status)?$/);
    if (appointmentMatch && ['PUT', 'PATCH'].includes(method)) {
      const index = appts.findIndex(appointment => appointment.id === appointmentMatch[1]);
      if (index < 0) return json({ error: 'not found' }, 404);
      appts[index] = { ...appts[index], ...(req.postDataJSON() ?? {}) };
      return json(appts[index]);
    }
    if (method === 'GET' && p === '/dashboard/action-hub/me') {
      if (opts.hubFail) return json({ error: 'qa-mock' }, 500);
      const n = opts.urgentCount ?? 3;
      return json({
        targetUserId: chat.base.user.id, isViewingSelf: true,
        kpi: { unreplied: { public: 3, private: 1 }, todayAppointments: { public: 2, private: 0 }, dormantContacts: { public: 5, private: 0 }, totalContacts: 42, closedThisMonth: 4, followSessions: 2 },
        urgent: Array.from({ length: n }, (_, i) => ({
          conversationId: `qa-conv-${i + 1}`, contactName: `Khách Giả ${String.fromCharCode(65 + i)}`, unreadCount: i + 1, lastMessageAt: iso(-15 * (i + 1)),
          nickName: `Nick Giả ${(i % 2) + 1}`, messagePreview: 'Tin nhắn mẫu (dữ liệu giả)', redacted: i === 2, isPrivateNick: i === 2,
        })),
        appointments: [
          { id: 'qa-apt-1', title: 'Hẹn gọi lại giả', appointmentDate: '2026-11-07', appointmentTime: '14:00', location: null, contactName: 'Khách Giả A' },
          { id: 'qa-apt-zalo', title: 'Hẹn từ tin Zalo giả', appointmentDate: '2026-11-07', appointmentTime: '16:30', location: null, contactName: 'Khách Giả A' },
        ],
        quotaNicks: [],
      });
    }
    if (method === 'POST' && p === '/conversations/resolve') return json({ convId: 'qa-conv-1' });
    if (!['/profile', '/conversations/counts'].includes(p) && !route.request().url().includes('socket.io')) unhandled.push(`${method} ${p}`);
    return route.fallback();
  });

  return {
    chat, calls,
    count: (m, re) => calls.filter(c => c.method === m && re.test(c.path)).length,
    find: (m, re) => calls.filter(c => c.method === m && re.test(c.path)),
    unhandled: () => [...new Set(unhandled)],
  };
}
