// Mock hoàn toàn bằng page.route: dữ liệu GIẢ, không token/SĐT/tin nhắn thật.
import type { Page } from '@playwright/test';

export interface FakeUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  orgId: string;
  orgName: string;
  deptRole?: string | null;
  grants?: Record<string, Record<string, boolean>>;
  permissionGroupName?: string | null;
}

export const ADMIN: FakeUser = {
  id: 'qa-user-admin', email: 'qa-admin@example.invalid', fullName: 'QA Quản trị', role: 'admin',
  orgId: 'qa-org', orgName: 'Công ty QA Giả', permissionGroupName: 'Toàn quyền',
};
/** Thiếu cả conversation lẫn contact -> tabbar chỉ còn 3 mục, không có nút nổi. */
export const NO_CHAT_CONTACT: FakeUser = {
  id: 'qa-user-limited', email: 'qa-limited@example.invalid', fullName: 'QA Hạn chế', role: 'member', orgId: 'qa-org', orgName: 'Công ty QA Giả',
  grants: {}, permissionGroupName: 'Chỉ xem',
};
/** Có hội thoại + khách, không có nick/media/cài đặt, không phải leader -> không có Báo cáo. */
export const SALE: FakeUser = {
  id: 'qa-user-sale', email: 'qa-sale@example.invalid', fullName: 'QA Sale', role: 'member', orgId: 'qa-org', orgName: 'Công ty QA Giả',
  deptRole: 'member', grants: { conversation: { access: true }, contact: { access: true } }, permissionGroupName: 'Sale',
};
/** Leader có engagement_score -> thấy Báo cáo, không thấy Nick Zalo / Cài đặt tổ chức. */
export const LEADER: FakeUser = {
  id: 'qa-user-leader', email: 'qa-leader@example.invalid', fullName: 'QA Trưởng phòng', role: 'member', orgId: 'qa-org', orgName: 'Công ty QA Giả',
  deptRole: 'leader', grants: { conversation: { access: true }, contact: { access: true }, engagement_score: { access: true } }, permissionGroupName: 'Trưởng phòng',
};
export const OTHER_ADMIN: FakeUser = { ...ADMIN, id: 'qa-user-admin-2', email: 'qa-admin2@example.invalid', fullName: 'QA Quản trị 2' };

export interface MockState {
  user: FakeUser;
  /** số khách chờ; 'error' -> /conversations/counts trả 500 */
  waiting: number | 'error';
  unhandled: string[];
  countsCalls: number;
}

export async function installMocks(page: Page, init: Partial<Pick<MockState, 'user' | 'waiting'>> = {}): Promise<MockState> {
  const state: MockState = { user: init.user ?? ADMIN, waiting: init.waiting ?? 0, unhandled: [], countsCalls: 0 };

  await page.addInitScript(() => {
    if (!localStorage.getItem('token')) localStorage.setItem('token', 'qa-fake-token-not-real');
  });

  await page.routeWebSocket(/socket\.io/, ws => { void ws.close(); });
  await page.route('**/socket.io/**', r => r.abort());

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (p === '/profile') {
      const u = state.user;
      return json({
        id: u.id, email: u.email, phone: null, fullName: u.fullName, role: u.role, orgId: u.orgId, org: { name: u.orgName, timezone: '+07:00' },
        avatarUrl: null, passwordChangedAt: '2026-01-01T00:00:00.000Z', onboardingDismissedAt: '2026-01-01T00:00:00.000Z',
        grants: u.grants ?? {}, permissionGroup: u.permissionGroupName ? { name: u.permissionGroupName } : null,
        isFullAccess: u.role === 'admin', deptRole: u.deptRole ?? null, departmentId: null, canViewAll: false,
      });
    }
    if (p === '/conversations/counts') {
      state.countsCalls += 1;
      if (state.waiting === 'error') return json({ error: 'qa-mock' }, 500);
      return json({ unreplied: state.waiting, all: state.waiting });
    }
    if (p === '/setup/status') return json({ needsSetup: false });
    if (p.includes('privacy')) return json({ isUnlocked: false, hasPin: false, expiresAt: null });
    if (p.includes('notification')) return json({ items: [], notifications: [], unread: 0, unreadCount: 0, total: 0 });

    // Dữ liệu GIẢ tối thiểu để màn desktop/mobile cũ dựng được nội dung (so pixel có ý nghĩa). Không có dữ liệu khách thật.
    if (p === '/dashboard/action-hub/me') {
      return json({
        targetUserId: state.user.id, isViewingSelf: true,
        kpi: { unreplied: { public: 3, private: 1 }, todayAppointments: { public: 2, private: 0 }, dormantContacts: { public: 5, private: 0 }, totalContacts: 42, closedThisMonth: 4, followSessions: 2 },
        urgent: [{ conversationId: 'qa-conv-1', contactName: 'Khách Giả A', unreadCount: 2, lastMessageAt: '2026-11-07T09:00:00+07:00', nickName: 'Nick Giả 1', messagePreview: 'Tin nhắn mẫu (dữ liệu giả)', redacted: false, isPrivateNick: false }],
        appointments: [{ id: 'qa-apt-1', title: 'Hẹn giả', appointmentDate: '2026-11-07', appointmentTime: '14:00', location: null, contactName: 'Khách Giả A' }],
        quotaNicks: [],
      });
    }
    if (p === '/dashboard/action-hub/team') {
      return json({ scope: { canViewAll: true, deptIds: [], userCount: 1 }, teamKpi: { unreplied: { public: 0, private: 0 }, todayAppointments: { public: 0, private: 0 }, totalContacts: 0, closedThisWeek: 0 }, topUser: null, perUser: [] });
    }
    if (p === '/dashboard/action-hub/system') {
      return json({ orgKpi: { totalNicks: 0, nickHealth: { healthy: 0, overlimit: 0, banned: 0, offline: 0, private: 0 }, newLeadsThisMonth: 0, totalContacts: 0, auditCountToday: 0 }, deptRanking: [], funnel: [], recentAudit: [] });
    }
    if (p.startsWith('/dashboard/action-hub/picker/')) return json([]);
    if (p === '/contacts') {
      return json({
        contacts: [
          { id: 'qa-k-1', fullName: 'Khách Giả A', phone: null, source: 'zalo', status: 'new', _count: { conversations: 1, appointments: 0 } },
          { id: 'qa-k-2', fullName: 'Khách Giả B', phone: null, source: 'zalo', status: 'new', _count: { conversations: 1, appointments: 1 } },
        ],
        total: 2, page: 1, limit: 20,
      });
    }
    if (p === '/appointments') {
      return json({
        appointments: [{
          id: 'qa-apt-1', contactId: 'qa-k-1', contact: { id: 'qa-k-1', fullName: 'Khách Giả A', phone: null }, appointmentDate: '2026-11-07', appointmentTime: '14:00',
          title: 'Hẹn giả', durationMin: 30, location: null, type: 'meeting', status: 'scheduled', notes: null, createdAt: '2026-11-01T00:00:00Z',
          source: 'manual', externalRef: null, zaloMessageId: null, emoji: null, conversationId: null, statusChangedAt: null, statusChangedBy: null,
        }],
        total: 1,
      });
    }
    if (['/zalo-accounts', '/account-folders', '/filter-presets', '/conversations/sidebar-tags', '/settings/statuses', '/crm-tags', '/tags', '/automation/templates'].includes(p)) return json([]);

    state.unhandled.push(`${route.request().method()} ${p}`);
    // Rỗng nhưng đủ khóa phổ biến để view không văng khi .map()/.length.
    return json({
      success: true, data: [], items: [], total: 0, page: 1, pageSize: 20, contacts: [], conversations: [], appointments: [],
      accounts: [], zaloAccounts: [], users: [], tags: [], unreplied: 0, hasMore: false,
    });
  });
  return state;
}

export const SHELL = '.crm-mobile.m-shell';
export const TABBAR_LINKS = 'nav[aria-label="Điều hướng chính"] a.m-tab';

export async function waitShell(page: Page): Promise<void> {
  await page.locator(SHELL).waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(500); // để lazy chunk + transition lắng
}

export const VIEWPORTS = {
  'iphone-se-320': { width: 320, height: 568 },
  'iphone-375': { width: 375, height: 812 },
  'iphone-390': { width: 390, height: 844 },
  'iphone-430': { width: 430, height: 932 },
  'landscape-667': { width: 667, height: 375 },
} as const;
