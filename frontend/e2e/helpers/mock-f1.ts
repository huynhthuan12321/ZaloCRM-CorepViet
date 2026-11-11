// Mock F1 (Cài đặt mobile) cho QA: dữ liệu GIẢ hoàn toàn, hình dạng response lấy từ mã nguồn frontend (store/composable gọi API) và
// backend route đã đối chiếu (tag-routes: POST /tags không nhận zaloAccountId; DELETE /tags/:id chỉ đặt archivedAt).
// Đăng ký SAU installMocks() (Playwright ưu tiên route đăng ký sau). Route lạ -> route.fallback() về mock nền (state.unhandled).
// KHÔNG gọi backend / Zalo thật. serviceWorkers phải bị chặn ở test.use({ serviceWorkers: 'block' }).
import type { Page, Route } from '@playwright/test';
import { ADMIN, installMocks, type FakeUser, type MockState } from './mock-api';

export const OWNER: FakeUser = { ...ADMIN, id: 'qa-user-owner', email: 'qa-owner@example.invalid', fullName: 'QA Chủ Tổ Chức', role: 'owner', permissionGroupName: 'Chủ sở hữu' };
/** admin KHÔNG phải owner: toàn quyền canAccess nhưng Hồ sơ tổ chức chỉ đọc. */
export const ADMIN_F1: FakeUser = { ...ADMIN };
/** member được cấp settings nhưng không phải admin -> không có Nhân viên (resource user). */
export const SETTINGS_MEMBER: FakeUser = {
  id: 'qa-user-setm', email: 'qa-setm@example.invalid', fullName: 'QA Cài Đặt', role: 'member', orgId: 'qa-org', orgName: 'Công ty QA Giả',
  deptRole: 'member', grants: { settings: { access: true }, conversation: { access: true }, contact: { access: true } }, permissionGroupName: 'Cài đặt',
};

export interface Req { method: string; path: string; query: Record<string, string>; body: unknown; contentType: string; raw: string }
export interface Rule {
  /** 'GET /tags' hoặc regexp trên `${METHOD} ${path}?${search}` */
  match: string | RegExp;
  status?: number;
  abort?: boolean;
  delayMs?: number;
  /** số lần áp dụng (mặc định: vô hạn) */
  times?: number;
  body?: unknown;
}

export interface Dept { id: string; name: string; parentId: string | null; path: string; depth: number; displayOrder: number; archivedAt: null; memberCount: number; leaderUserId: string | null; deputyUserId: string | null; children: Dept[] }

const png1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const FAKE_PNG = Buffer.from(png1.split(',')[1], 'base64');

const iso = (d: string) => new Date(d).toISOString();

export function buildState() {
  const depts: Dept[] = [
    { id: 'd-kd', name: 'Kinh doanh', parentId: null, path: '/kd', depth: 0, displayOrder: 1, archivedAt: null, memberCount: 5, leaderUserId: 'u-2', deputyUserId: null, children: [
      { id: 'd-kd-1', name: 'Nhóm bán lẻ', parentId: 'd-kd', path: '/kd/1', depth: 1, displayOrder: 1, archivedAt: null, memberCount: 3, leaderUserId: null, deputyUserId: null, children: [] },
    ] },
    { id: 'd-cs', name: 'Chăm sóc khách hàng', parentId: null, path: '/cs', depth: 0, displayOrder: 2, archivedAt: null, memberCount: 2, leaderUserId: null, deputyUserId: null, children: [] },
  ];
  const resources = ['conversation', 'contact', 'zalo_account', 'settings', 'user', 'department', 'permission_group', 'audit_log', 'webhook'];
  const resourceActions: Record<string, string[]> = {
    conversation: ['access', 'view_all'], contact: ['access', 'create', 'edit', 'delete'], zalo_account: ['access', 'create', 'edit', 'delete'],
    settings: ['access', 'edit'], user: ['access', 'create', 'edit', 'delete'], department: ['access', 'create', 'edit', 'delete'],
    permission_group: ['access', 'create', 'edit', 'delete'], audit_log: ['access'], webhook: ['access', 'create', 'edit', 'delete'],
  };
  const groups = [
    { id: 'g-all', name: 'Toàn quyền', parentId: null, isSystem: true, displayOrder: 1, memberCount: 2, grants: Object.fromEntries(resources.map(r => [r, Object.fromEntries(resourceActions[r].map(a => [a, true]))])), children: [] },
    { id: 'g-sale', name: 'Sale', parentId: null, isSystem: false, displayOrder: 2, memberCount: 4, grants: { conversation: { access: true }, contact: { access: true, create: true, edit: true } }, children: [
      { id: 'g-sale-lead', name: 'Sale trưởng nhóm', parentId: 'g-sale', isSystem: false, displayOrder: 1, memberCount: 1, grants: { conversation: { access: true, view_all: true }, contact: { access: true } }, children: [] },
    ] },
    { id: 'g-view', name: 'Chỉ xem', parentId: null, isSystem: false, displayOrder: 3, memberCount: 1, grants: {}, children: [] },
  ];
  const NOW = Date.parse('2026-11-10T10:00:00+07:00');
  const mk = (n: number, name: string, over: Record<string, unknown> = {}) => ({
    id: `u-${n}`, email: `nv${n}@example.invalid`, phone: `090000000${n}`, avatarUrl: null, fullName: name, role: 'member',
    permissionGroupId: 'g-sale', permissionGroup: { id: 'g-sale', name: 'Sale', isSystem: false },
    departmentMember: { departmentId: 'd-kd', deptRole: 'member', department: { id: 'd-kd', name: 'Kinh doanh', path: '/kd' } },
    internalContactMethod: null, internalContactPhone: null, internalContactZaloAccountId: null, internalContactNick: null, recipientStatus: null, recipientError: null,
    passwordChangedAt: iso('2026-10-01'), lastLoginAt: new Date(NOW - 3600_000).toISOString(), isActive: true, maxPrivacyNicks: 2, ...over,
  });
  const users = [
    mk(1, 'Nguyễn Văn Giả', { role: 'admin', permissionGroupId: 'g-all', permissionGroup: { id: 'g-all', name: 'Toàn quyền', isSystem: true } }),
    mk(2, 'Trần Thị Mẫu', { departmentMember: { departmentId: 'd-kd', deptRole: 'leader', department: { id: 'd-kd', name: 'Kinh doanh', path: '/kd' } } }),
    mk(3, 'Lê Văn Thử An'),
    mk(4, 'Phạm Thị Anh', { lastLoginAt: iso('2026-10-01') }),
    mk(5, 'Hoàng Đức Chưa Kích Hoạt', { passwordChangedAt: null, lastLoginAt: null }),
    mk(6, 'Vũ Minh Đã Nghỉ', { isActive: false }),
    mk(7, 'Đặng Thu Một Cái Tên Rất Dài Để Kiểm Tra Việc Ngắt Dòng Trên Màn Hình 320', { departmentMember: null, permissionGroup: null, permissionGroupId: null }),
    mk(8, 'Bùi Quang Anh Tuấn', { departmentMember: { departmentId: 'd-cs', deptRole: 'member', department: { id: 'd-cs', name: 'Chăm sóc khách hàng', path: '/cs' } } }),
  ];
  const statuses = [
    { id: 's1', name: 'Mới', order: 10, color: '#3B82F6', isTerminal: false, isDefault: true },
    { id: 's2', name: 'Đang tư vấn', order: 20, color: '#F59E0B', isTerminal: false, isDefault: false },
    { id: 's3', name: 'Chốt đơn', order: 30, color: '#10B981', isTerminal: true, isDefault: false },
    { id: 's4', name: 'Mất khách', order: 40, color: null, isTerminal: true, isDefault: false },
  ];
  const tag = (id: string, name: string, scope: string, source: string, priority: number, extra: Record<string, unknown> = {}) => ({
    id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), color: '#0068FF', emoji: null, scope, source, priority, usageCount: 3, archivedAt: null, zaloAccountId: null, zaloAccount: null, ...extra,
  });
  const tags = [
    tag('t1', 'Khách VIP', 'crm', 'manual_crm', 1, { emoji: '⭐' }),
    tag('t2', 'Cần gọi lại', 'crm', 'manual_crm', 2, { color: '#D91B1B' }),
    tag('t3', 'AI gợi ý quan tâm', 'crm', 'ai_suggest', 3),
    tag('t4', 'Bạn Zalo đồng bộ', 'friend', 'zalo_real', 1, { zaloAccountId: 'n1', zaloAccount: { displayName: 'Nick Giả 1' } }),
    tag('t5', 'Thủ công nick 2', 'friend', 'manual_per_nick', 2, { zaloAccountId: 'n2', zaloAccount: { displayName: 'Nick Giả 2' } }),
    tag('t6', 'Tự nhận diện', 'friend', 'auto_detect', 3, { zaloAccountId: 'n1', zaloAccount: { displayName: 'Nick Giả 1' } }),
  ];
  return {
    depts, groups, meta: { resources, actions: ['access', 'create', 'edit', 'delete', 'view_all'], resourceActions }, users, statuses, tags,
    nicks: [{ id: 'n1', displayName: 'Nick Giả 1', phone: '0900000101' }, { id: 'n2', displayName: 'Nick Giả 2', phone: null }],
    org: { name: 'Công ty QA Giả', timezone: '+07:00', logoUrl: '', slogan: 'Khẩu hiệu giả', copyright: '© 2026 QA Giả', emailDomain: 'example.invalid' },
    notifications: [
      { id: 'unreplied', type: 'warning', title: '3 khách chưa trả lời', detail: 'Dữ liệu giả', priority: 'high' },
      { id: 'apt-1', type: 'info', title: 'Lịch hẹn 14:00', detail: 'Khách Giả A', priority: 'normal' },
      { id: 'zalo-1', type: 'error', title: 'Nick Giả 1 mất kết nối', detail: 'Đăng nhập lại', priority: 'high' },
    ],
    internal: { status: 'not_setup' as string, method: null as string | null },
    audit: Array.from({ length: 120 }, (_, i) => ({
      id: `a${i}`, action: ['user.handoff', 'user.reset_password', 'user.deactivate'][i % 3], createdAt: new Date(NOW - i * 3600_000).toISOString(),
      actor: { id: 'u-1', name: 'Nguyễn Văn Giả' }, target: { id: `u-${(i % 8) + 1}`, name: `Nhân viên ${(i % 8) + 1}` }, details: {},
    })),
    integrations: [
      { id: 'i1', type: 'sheets', name: 'Bảng tính giả', enabled: true, lastSyncAt: '2026-11-09T08:00:00.000Z', config: { apiKey: 'SECRET-KHONG-DUOC-HIEN-THI', token: 'TOKEN-BI-MAT' }, syncLogs: [{ status: 'success', recordCount: 12 }, { status: 'error', recordCount: 0 }] },
      { id: 'i2', type: 'webhook', name: '', enabled: false, lastSyncAt: null, config: { secret: 'SECRET-2' }, syncLogs: [] },
    ],
    scoring: {
      config: { orgId: 'qa-org', weights: { engagement: 30, intent: 30, fit: 20, velocity: 20 }, decay: { day3to7: -1, day7to14: -2, day14to30: -3, day30to60: -5 }, autoPromote: true, stuckDetectionEnabled: false, explainabilityEnabled: true },
      rules: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, signalKey: `signal_key_${i}`, dimension: ['engagement', 'intent', 'fit', 'velocity'][i % 4], ruleType: 'keyword', delta: i % 2 ? -2 : 5, capPerDay: i === 0 ? 3 : null, capTotal: null, keywords: [], label: i < 4 ? `Quy tắc giả số ${i + 1}` : '', applicableStages: [], enabled: i !== 3 })),
    },
  };
}
export type F1Data = ReturnType<typeof buildState>;

export interface F1Mock {
  base: MockState;
  data: F1Data;
  requests: Req[];
  rules: Rule[];
  unhandled: string[];
  /** các request GHI (không phải GET) */
  writes: () => Req[];
  find: (method: string, pathRe: RegExp) => Req[];
  fail: (rule: Rule) => void;
  clearRules: () => void;
}

export async function installF1Mocks(page: Page, opts: { user?: FakeUser } = {}): Promise<F1Mock> {
  const user = opts.user ?? OWNER;
  const base = await installMocks(page, { user });
  const data = buildState();
  const requests: Req[] = [];
  const rules: Rule[] = [];
  let uidSeq = 100;

  await page.route('**/api/v1/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method();
    const query = Object.fromEntries(url.searchParams);
    const raw = req.postData() ?? '';
    let body: unknown = null;
    const contentType = req.headers()['content-type'] ?? '';
    if (raw && contentType.includes('json')) { try { body = JSON.parse(raw); } catch { body = raw; } } else if (raw) body = raw.length > 400 ? `${raw.slice(0, 200)}…[${raw.length}]` : raw;
    const key = `${method} ${p}${url.search}`;
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

    // Chỉ ghi nhận các endpoint F1 (tránh nhiễu từ shell). Route nền (profile, counts...) vẫn đi qua fallback.
    const rule = rules.find(r => (typeof r.match === 'string' ? key === r.match || `${method} ${p}` === r.match : r.match.test(key)) && (r.times === undefined || r.times > 0));
    const isBase = ['/profile', '/conversations/counts', '/setup/status'].includes(p) || p.includes('privacy') || p.startsWith('/dashboard') || p === '/contacts' || p === '/appointments';
    if (!isBase) requests.push({ method, path: p, query, body, contentType, raw: raw.slice(0, 2000) });
    if (rule) {
      if (rule.times !== undefined) rule.times -= 1;
      if (rule.delayMs) await new Promise(r => setTimeout(r, rule.delayMs));
      if (rule.abort) return route.abort('internetdisconnected');
      if (rule.status && rule.status >= 400) return json(rule.body ?? { error: `qa-mock ${rule.status}` }, rule.status);
    }

    if (p === '/profile') {
      const u = user;
      const owner = u.role === 'owner';
      return json({
        id: u.id, email: u.email, phone: '0900000999', fullName: u.fullName, role: u.role, orgId: u.orgId, org: { name: u.orgName, timezone: '+07:00' },
        avatarUrl: null, passwordChangedAt: '2026-01-01T00:00:00.000Z', onboardingDismissedAt: '2026-01-01T00:00:00.000Z',
        grants: u.grants ?? {}, permissionGroup: u.permissionGroupName ? { name: u.permissionGroupName } : null,
        isFullAccess: owner || u.role === 'admin', deptRole: u.deptRole ?? null, departmentId: null, canViewAll: false,
      });
    }

    // ── Tài khoản ──
    if (p === '/me/profile' && method === 'PATCH') {
      const b = body as { fullName?: string; avatarUrl?: null };
      return json({ id: user.id, fullName: b.fullName ?? user.fullName, avatarUrl: b.avatarUrl ?? null });
    }
    if (p === '/me/avatar' && method === 'POST') return json({ avatarUrl: png1 });
    if (p === '/me/change-password') return json({ success: true });
    if (p === '/notifications') return json({ notifications: data.notifications });

    // ── Thông báo của tôi (wizard gốc) ──
    if (p === '/me/internal-contact' && method === 'GET') {
      return json({
        method: data.internal.method, internalContactZaloAccountId: null, internalContactPhone: data.internal.method === 'personal_phone' ? '0900000888' : null, internalContactNick: null,
        setupAt: null, confirmedAt: data.internal.status === 'ready' ? '2026-11-09T09:00:00.000Z' : null,
        ownedNicks: [{ id: 'n1', displayName: 'Nick Giả 1', phone: '0900000101', status: 'connected', friendCount: 12 }, { id: 'n2', displayName: 'Nick Giả 2 offline', phone: null, status: 'disconnected', friendCount: 0 }],
        systemSender: { displayName: 'Nick Hệ Thống CRM' },
        recipient: data.internal.method ? { status: data.internal.status, threadIdInSenderView: 'fake-uid-1', error: null } : null,
      });
    }
    if (p === '/me/internal-contact' && method === 'PATCH') {
      const b = body as { method: string };
      data.internal = { status: 'pending_friend_request', method: b.method };
      return json({ recipient: { status: 'pending_friend_request', threadIdInSenderView: null, error: null } });
    }
    if (p === '/me/internal-contact/check-handshake') { data.internal.status = 'pending_user_confirm'; return json({ recipient: { status: 'pending_user_confirm', error: null } }); }
    if (p === '/me/internal-contact/confirm') { data.internal.status = 'ready'; return json({ ok: true }); }
    if (p === '/me/internal-contact/resend-friend-request' || p === '/me/internal-contact/resend-verify-code') return json({ ok: true });
    if (p === '/me/internal-contact' && method === 'DELETE') { data.internal = { status: 'not_setup', method: null }; return json({ ok: true }); }

    // ── Tổ chức ──
    if (p === '/organization' && method === 'GET') return json(data.org);
    if (p === '/organization' && method === 'PUT') { data.org = { ...data.org, ...(body as object) }; return json(data.org); }
    if (p === '/media') return json({ items: [], media: [], total: 0 });

    // ── RBAC ──
    if (p === '/departments' && method === 'GET') return json({ tree: data.depts });
    if (p === '/permission-groups' && method === 'GET') return json({ tree: data.groups });
    if (p === '/permission-groups/meta') return json(data.meta);
    if (p === '/rbac/users') {
      const q = (query.q ?? '').toLowerCase();
      const users = data.users.filter(u => (!q || [u.fullName, u.phone, u.email].some(v => (v ?? '').toLowerCase().includes(q)))
        && (!query.departmentId || u.departmentMember?.departmentId === query.departmentId)
        && (!query.permissionGroupId || u.permissionGroupId === query.permissionGroupId));
      return json({ users });
    }
    if (p === '/zalo-accounts') return json({ accounts: [] });
    if (/^\/users\/[^/]+$/.test(p) && method === 'PUT') {
      const id = p.split('/')[2]; const u = data.users.find(x => x.id === id);
      if (u) Object.assign(u, body as object);
      return json({ ok: true, user: u });
    }
    if (/^\/departments\/[^/]+\/members/.test(p)) return json({ ok: true });
    if (/^\/rbac\/users\/[^/]+\/permission-group$/.test(p)) return json({ ok: true });
    if (p === '/users/bulk-assign') return json({ affected: ((body as { userIds: string[] }).userIds ?? []).length });
    if (p === '/users/check-zalo-by-phone') {
      return json({ found: true, preview: { uid: 'fake-uid-777', displayName: 'Người Mới Giả', zaloName: 'Giả Zalo', avatar: '', gender: 0, dob: 0, sdob: '01/01/1990', globalId: 'g' }, relation: 'none', warnings: [], error: null });
    }
    if (p === '/users/create-with-zalo') {
      const b = body as { fullName: string; phone: string };
      const id = `u-${uidSeq++}`;
      data.users.push({ ...data.users[2], id, fullName: b.fullName, phone: b.phone, email: null } as never);
      return json({ user: { id, fullName: b.fullName, phone: b.phone }, tempPassword: 'qa-temp-123', zalo: { messageSent: true, deliveryChannel: 'inbox', autoAccepted: false, fallbackSentToAdmin: false, error: null } }, 201);
    }

    // ── Trạng thái ──
    if (p === '/settings/statuses' && method === 'GET') return json({ statuses: data.statuses });
    if (p === '/settings/statuses' && method === 'POST') { const b = body as Record<string, unknown>; data.statuses.push({ id: `s${uidSeq++}`, ...(b as object) } as never); return json({ ok: true }, 201); }
    if (p === '/settings/statuses/reorder') {
      const items = (body as { items?: Array<{ id: string; order: number }> }).items ?? (Array.isArray(body) ? (body as Array<{ id: string; order: number }>) : []);
      for (const it of items) { const s = data.statuses.find(x => x.id === it.id); if (s) s.order = it.order; }
      return json({ ok: true });
    }
    if (/^\/settings\/statuses\/[^/]+$/.test(p) && method === 'PUT') { const s = data.statuses.find(x => x.id === p.split('/')[3]); if (s) Object.assign(s, body as object); return json({ ok: true }); }
    if (/^\/settings\/statuses\/[^/]+$/.test(p) && method === 'DELETE') { data.statuses = data.statuses.filter(x => x.id !== p.split('/')[3]); return json({ ok: true }); }

    // ── Nhãn ──
    if (p === '/tags/zalo-accounts') return json({ accounts: data.nicks });
    if (p === '/tags' && method === 'GET') return json({ tags: data.tags.filter(t => t.scope === query.scope) });
    if (p === '/tags' && method === 'POST') {
      const b = body as Record<string, unknown>;
      data.tags.push({ id: `t${uidSeq++}`, slug: String(b.name).toLowerCase(), usageCount: 0, archivedAt: null, zaloAccountId: null, zaloAccount: null, priority: 99, ...(b as object) } as never);
      return json({ tag: { id: 'new' } }, 201);
    }
    if (/^\/tags\/[^/]+$/.test(p) && method === 'PATCH') { const t = data.tags.find(x => x.id === p.split('/')[2]); if (t) Object.assign(t, body as object); return json({ tag: t, pushedZalo: t?.source === 'zalo_real' }); }
    if (/^\/tags\/[^/]+$/.test(p) && method === 'DELETE') { const t = data.tags.find(x => x.id === p.split('/')[2]); if (t) t.archivedAt = '2026-11-10T00:00:00.000Z'; return json({ ok: true }); }

    // ── Chấm điểm, tích hợp, audit ──
    if (p === '/scoring/config') return json(data.scoring.config);
    if (p === '/scoring/rules') return json(data.scoring.rules);
    if (p === '/integrations') return json(data.integrations);
    if (p === '/audit-logs') {
      const off = Number(query.offset ?? 0); const lim = Number(query.limit ?? 50);
      const all = data.audit.filter(a => !query.action || a.action === query.action);
      return json({ logs: all.slice(off, off + lim), total: all.length });
    }

    return route.fallback();
  });

  const mock: F1Mock = {
    base, data, requests, rules, unhandled: base.unhandled,
    writes: () => requests.filter(r => r.method !== 'GET'),
    find: (method, pathRe) => requests.filter(r => r.method === method && pathRe.test(r.path)),
    fail: (r) => { rules.push(r); },
    clearRules: () => { rules.length = 0; },
  };
  return mock;
}

/** Chặn mọi lỗi runtime không mong đợi từ trang (pageerror). */
export function collectPageErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  return errs;
}

export const F1_ROUTES: Array<{ key: string; url: string; user?: FakeUser; ready: string }> = [
  { key: 'menu', url: '/settings', ready: '.crm-sm' },
  { key: 'account', url: '/settings/personal/profile', ready: '.crm-ap' },
  { key: 'feed', url: '/settings/personal/notifications', ready: '.crm-np' },
  { key: 'internal-contact', url: '/settings/channels/zalo?tab=internal-contact', ready: '.crm-ic__card' },
  { key: 'org', url: '/settings/org/profile', ready: '.org-settings-layout' },
  { key: 'employees', url: '/settings/rbac/users', ready: '.crm-el__item' },
  { key: 'statuses', url: '/settings/crm/statuses', ready: '.crm-sp__card' },
  { key: 'tags', url: '/settings/crm/tags-v2', ready: '.crm-tp__card' },
  { key: 'permission-groups', url: '/settings/rbac/permission-groups', ready: '.crm-pg__detail' },
  { key: 'departments', url: '/settings/rbac/departments', ready: '.crm-dp__item' },
  { key: 'scoring', url: '/settings/crm/scoring', ready: '.crm-sc__card' },
  { key: 'integrations', url: '/settings/channels/integrations', ready: '.crm-ig__card' },
  { key: 'audit', url: '/settings/org/audit', ready: '.crm-au__item' },
];
