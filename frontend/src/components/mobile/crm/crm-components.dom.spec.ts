// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import type { Contact } from '@/composables/use-contacts';
import type { MeResponse, UrgentItem } from '@/composables/use-dashboard-action-hub';
import { refreshOrgTimezone } from '@/composables/use-org-timezone';
import { StubBottomSheet, installMemoryStorage } from '@/composables/mobile-crm/test-utils';
import AppointmentSheet from './AppointmentSheet.vue';
import ContactCard from './ContactCard.vue';
import ContactFilterSheet from './ContactFilterSheet.vue';
import CustomerConversationPicker from './CustomerConversationPicker.vue';
import CustomerProfile from './CustomerProfile.vue';
import MobileContactList from './MobileContactList.vue';
import MobileOverview from './MobileOverview.vue';
import OverviewSystemPanel from './OverviewSystemPanel.vue';
import OverviewTeamPanel from './OverviewTeamPanel.vue';
import type { ContactProfileResponse } from '@/composables/use-contact-profile';

const sheet = { global: { stubs: { VBottomSheet: StubBottomSheet } } };

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'c1', fullName: 'Nguyễn Lan', phone: '0912345678', source: 'FB', status: 'interested', nextAppointment: null, notes: null, tags: ['vip'], leadScore: 40,
  lastActivity: null, mergedInto: null, assignedUserId: 'u1', assignedUser: { id: 'u1', fullName: 'Minh' }, nicksByKind: { friend: 2 },
  contactAccess: [{ role: 'collaborator', source: 's', createdAt: '', user: { id: 'u2', fullName: 'Hà', email: null } }], ...over,
});

beforeEach(() => { installMemoryStorage(); refreshOrgTimezone('+07:00'); });

describe('ContactCard — signature nick + người phụ trách', () => {
  it('hiện số nick, người phụ trách và +N cùng chăm (D-4); trích đoạn tin bị ẩn khi redacted', () => {
    const w = mount(ContactCard, { props: { contact: { ...contact({ lastInboundAt: '2026-11-09T01:00:00Z', lastInboundPreview: 'bí mật' }), redacted: true } as Contact, statusLabel: 'Quan tâm', ownerName: 'Minh', ownerExtra: 1, nickCount: 2 } });
    const text = w.text();
    expect(text).toContain('2 nick Zalo');
    expect(text).toContain('Phụ trách: Minh +1');
    expect(text).toContain('Quan tâm');
    expect(text).toContain('Nội dung riêng tư');
    expect(text).not.toContain('bí mật');
    expect(w.get('button').attributes('aria-label')).toContain('phụ trách Minh, cùng chăm thêm 1 người');
  });
  it('chưa phân công / chưa có nick nói rõ bằng chữ', () => {
    const w = mount(ContactCard, { props: { contact: contact({ assignedUser: null, assignedUserId: null }), statusLabel: '', ownerName: null } });
    expect(w.text()).toContain('Chưa phân công');
    expect(w.text()).toContain('Chưa có nick Zalo');
  });
  it('bấm thẻ phát openProfile(id)', async () => {
    const w = mount(ContactCard, { props: { contact: contact(), statusLabel: '', ownerName: 'Minh' } });
    await w.get('button').trigger('click');
    expect(w.emitted('openProfile')![0]).toEqual(['c1']);
  });
});

describe('MobileContactList — loading/empty/error/offline, tải tiếp, FAB', () => {
  const filters = { search: '', source: '', status: '', assignedUserId: '', threadType: 'user' } as never;
  const mk = (props: Record<string, unknown>) => mount(MobileContactList, { props: { contacts: [], total: 0, filters, state: 'ready', loadingMore: false, hasMore: false, canCreate: true, ...props } });

  it('loading -> skeleton có role status; empty có thông báo; error/offline có Thử lại', async () => {
    expect(mk({ state: 'loading' }).find('.m-feedback--loading').exists()).toBe(true);
    expect(mk({}).text()).toContain('Chưa có khách hàng');
    const err = mk({ state: 'error' });
    expect(err.find('.m-feedback--error').exists()).toBe(true);
    await err.get('.m-feedback__btn--primary').trigger('click');
    expect(err.emitted('retry')).toHaveLength(1);
    expect(mk({ state: 'offline' }).find('.m-feedback--offline').exists()).toBe(true);
  });
  it('rỗng do tìm/lọc -> "Không tìm thấy" + Xóa bộ lọc xóa cả tìm kiếm lẫn ba bộ lọc', async () => {
    const w = mk({ filters: { ...(filters as object), status: 'new' } });
    expect(w.text()).toContain('Không tìm thấy khách hàng');
    await w.get('.m-feedback__btn:not(.m-feedback__btn--primary)').trigger('click');
    expect(w.emitted('update:filters')![0]).toEqual([{ search: '', status: '', source: '', assignedUserId: '' }]);
  });
  it('có dữ liệu + lỗi cập nhật -> giữ danh sách và hiện banner thử lại (không mất dữ liệu)', async () => {
    const w = mk({ contacts: [contact()], total: 1, state: 'error' });
    expect(w.findAll('.crm-contact-card')).toHaveLength(1);
    expect(w.find('[role="alert"]').text()).toContain('Không cập nhật được');
  });
  it('tìm kiếm phát update:filters({search}); nút Lọc hiện số bộ lọc đang bật + aria', async () => {
    const w = mk({ filters: { ...(filters as object), status: 'new', source: 'FB' } });
    expect(w.get('.crm-list__filter-count').text()).toBe('2');
    expect(w.get('.crm-list__filter').attributes('aria-label')).toContain('2 bộ lọc');
    await w.get('input[type="search"]').setValue('lan');
    expect(w.emitted('update:filters')!.at(-1)).toEqual([{ search: 'lan' }]);
    await w.get('.crm-list__filter').trigger('click');
    expect(w.emitted('openFilter')).toHaveLength(1);
  });
  it('phân trang: còn trang -> nút "Tải thêm"; đang tải thì khóa; hết -> thông báo cuối', async () => {
    const more = mk({ contacts: [contact()], total: 50, hasMore: true });
    await more.get('.crm-list__more-btn').trigger('click');
    expect(more.emitted('loadMore')).toHaveLength(1);
    expect(mk({ contacts: [contact()], total: 50, hasMore: true, loadingMore: true }).get('.crm-list__more-btn').attributes('disabled')).toBeDefined();
    expect(mk({ contacts: [contact()], total: 1 }).text()).toContain('Đã hiển thị hết danh sách');
  });
  it('FAB tạo khách: ẩn theo quyền; nằm trên tabbar + nút Hội thoại nổi (không còn bottom:88px cố định)', async () => {
    expect(mk({ canCreate: false }).find('.crm-list__fab').exists()).toBe(false);
    const w = mk({});
    const style = w.get('.crm-list__fab').attributes('style') ?? '';
    expect(style).toContain('--m-tabbar');
    expect(style).toContain('--m-fab-lift');
    expect(style).not.toContain('88px');
    await w.get('.crm-list__fab').trigger('click');
    expect(w.emitted('create')).toHaveLength(1);
  });
});

describe('ContactFilterSheet — hai pha', () => {
  it('chọn nháp KHÔNG phát gì cho tới khi Áp dụng; Xóa lọc phát clear', async () => {
    const w = mount(ContactFilterSheet, { props: { open: true, value: { status: '', source: '', assignedUserId: '' }, users: [{ id: 'u1', fullName: 'Minh' }] }, ...sheet });
    const chips = w.findAll('[role="radio"]');
    await chips.find(c => c.text() === 'Mới')!.trigger('click');
    await w.get('select').setValue('u1');
    expect(w.emitted('apply')).toBeUndefined();
    await w.findAll('.crm-btn').find(b => b.text().startsWith('Áp dụng'))!.trigger('click');
    expect(w.emitted('apply')![0]).toEqual([{ status: 'new', source: '', assignedUserId: 'u1' }]);
    await w.findAll('.crm-btn').find(b => b.text() === 'Xóa lọc')!.trigger('click');
    expect(w.emitted('clear')).toHaveLength(1);
  });
  it('mở lại sheet: nháp = giá trị đang áp dụng; danh sách nguồn không có TikTok', async () => {
    const w = mount(ContactFilterSheet, { props: { open: false, value: { status: 'lost', source: 'GT', assignedUserId: '' } }, ...sheet });
    await w.setProps({ open: true });
    const on = w.findAll('.crm-chip--on').map(c => c.text());
    expect(on).toEqual(expect.arrayContaining(['Mất', 'Giới thiệu']));
    expect(w.text()).not.toMatch(/tiktok/i);
  });
  it('tải người phụ trách: loading và lỗi có thông báo + Thử lại', async () => {
    const w = mount(ContactFilterSheet, { props: { open: true, value: { status: '', source: '', assignedUserId: '' }, usersState: 'error' }, ...sheet });
    expect(w.find('[role="alert"]').exists()).toBe(true);
    await w.get('.crm-filter__link').trigger('click');
    expect(w.emitted('retryUsers')).toHaveLength(1);
  });
});

describe('MobileOverview — việc chờ trả lời đứng đầu, PrivacySplit không cộng gộp', () => {
  const urgentItem = (over: Partial<UrgentItem> = {}): UrgentItem => ({ conversationId: 'v1', contactName: 'Lan', unreadCount: 3, lastMessageAt: new Date().toISOString(), nickName: 'Nick A', messagePreview: 'Anh ơi', ...over });
  const me = (over: Partial<MeResponse> = {}): MeResponse => ({
    targetUserId: 'u', isViewingSelf: true,
    kpi: { unreplied: { public: 4, private: 2 }, todayAppointments: { public: 1, private: 0 }, dormantContacts: { public: 7, private: 3 }, totalContacts: 120, closedThisMonth: 5 },
    urgent: [], appointments: [], quotaNicks: [], ...over,
  });
  const mk = (props: Record<string, unknown>) => mount(MobileOverview, { props: { me: me(), urgent: [urgentItem()], state: 'ready', canSwitchScope: false, ...props } });

  it('thứ tự trên màn: Đang chờ trả lời -> Lịch hẹn cần làm -> Số liệu (không lưới KPI)', () => {
    const w = mk({});
    const heads = w.findAll('h2').map(h => h.text());
    expect(heads[0]).toBe('Đang chờ trả lời');
    expect(heads.indexOf('Lịch hẹn cần làm')).toBe(1);
    expect(heads.indexOf('Số liệu của bạn')).toBe(2);
    expect(w.find('.at-kpi-grid').exists()).toBe(false);
  });
  it('số chưa trả lời: công khai 4 và riêng tư 2 hiện TÁCH RỜI, không có tổng 6', () => {
    const w = mk({});
    const hero = w.get('.crm-ov__hero-count');
    expect(hero.find('.crm-pv__pub').text()).toBe('4');
    expect(hero.find('.crm-pv__priv').text()).toBe('2');
    expect(w.text()).not.toMatch(/\b6\b/);
    expect(hero.get('.crm-pv').attributes('aria-label')).toBe('Đang chờ trả lời: 4 công khai, 2 nick riêng tư');
  });
  it('thiếu kpi -> "—" chứ không phải 0', () => {
    const w = mk({ me: me({ kpi: undefined as never }) });
    expect(w.get('.crm-ov__hero-count').text()).toBe('—');
    expect(w.text()).not.toMatch(/Khách của tôi\s*0/);
  });
  it('hàng chờ: mở đúng hội thoại; nick luôn hiện; tin riêng tư bị ẩn', async () => {
    const w = mk({ urgent: [urgentItem(), urgentItem({ conversationId: 'v2', contactName: 'Hà', redacted: true, messagePreview: 'ẩn đi', isPrivateNick: true })] });
    expect(w.text()).toContain('Nick Nick A');
    expect(w.text()).toContain('Nội dung riêng tư');
    expect(w.text()).not.toContain('ẩn đi');
    await w.findAll('.crm-ov__wait-row')[1].trigger('click');
    expect(w.emitted('openConversation')![0]).toEqual(['v2']);
    await w.get('.crm-ov__cta').trigger('click');
    expect(w.emitted('openInbox')![0]).toEqual(['unreplied']);
  });
  it('không ai chờ -> thông điệp bình tĩnh; lịch hẹn: quá hạn kèm chữ "Quá hạn" + giờ tổ chức', async () => {
    const w = mk({
      urgent: [],
      me: me({ reminders: { overdue: [{ id: 'o1', title: 'Gọi', appointmentDate: '2026-11-08T00:00:00Z', appointmentTime: '08:00', location: null, contactName: 'Lan' }], today: [{ id: 't1', title: 'Xem nhà', appointmentDate: '2026-11-09T00:00:00Z', appointmentTime: null, location: 'Q1', contactName: 'Hà' }], tomorrow: [{ id: 'm', title: null, appointmentDate: '', appointmentTime: null, location: null }], birthdays: [] } }),
    });
    expect(w.text()).toContain('Không có khách nào đang chờ bạn trả lời');
    const rows = w.findAll('.crm-ov__appt');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Quá hạn');
    expect(rows[0].text()).toContain('08:00');
    await rows[1].trigger('click');
    expect(w.emitted('openAppointment')![0]).toEqual(['t1']);
    expect(w.text()).toContain('Ngày mai: 1 lịch hẹn');
  });
  it('loading / error / offline khi chưa có dữ liệu; có dữ liệu cũ + lỗi -> banner, giữ nội dung', async () => {
    expect(mk({ me: null, state: 'loading' }).find('.m-feedback--loading').exists()).toBe(true);
    const err = mk({ me: null, state: 'error' });
    expect(err.find('.m-feedback--error').exists()).toBe(true);
    await err.get('.m-feedback__btn--primary').trigger('click');
    expect(err.emitted('retry')).toHaveLength(1);
    expect(mk({ me: null, state: 'offline' }).find('.m-feedback--offline').exists()).toBe(true);
    const stale = mk({ state: 'offline' });
    expect(stale.find('.crm-ov__hero').exists()).toBe(true);
    expect(stale.find('.crm-ov__banner').text()).toContain('mất kết nối');
  });
  it('"Nhận khách" chỉ hiện khi có module; không bị cắt (nút nằm trong dòng riêng, rộng đủ)', () => {
    expect(mk({}).text()).not.toContain('Nhận khách');
    expect(mk({ showLeadPool: true }).text()).toContain('Nhận khách');
  });
});

describe('Quản lý team / hệ thống — lỗi section hiện LỖI, không hiện 0', () => {
  it('team null sau khi tải -> thông báo lỗi + Thử lại; đang tải -> skeleton', async () => {
    const w = mount(OverviewTeamPanel, { props: { team: null, loading: false } });
    expect(w.find('.m-feedback--error').exists()).toBe(true);
    expect(w.text()).not.toMatch(/Tồn đọng/);
    await w.get('.m-feedback__btn--primary').trigger('click');
    expect(w.emitted('retry')).toHaveLength(1);
    expect(mount(OverviewTeamPanel, { props: { team: null, loading: true } }).find('.m-feedback--loading').exists()).toBe(true);
  });
  it('team có dữ liệu: PrivacySplit tách; nút Xem phát viewUser', async () => {
    const team = {
      scope: { canViewAll: false, deptIds: [], userCount: 1 },
      teamKpi: { unreplied: { public: 5, private: 1 }, todayAppointments: { public: 0, private: 0 }, totalContacts: 90, closedThisWeek: 2 },
      topUser: null,
      perUser: [{ userId: 'u9', fullName: 'Trần B', email: '', avatarUrl: null, departmentName: 'PKD1', deptRole: null, hasPrivateNick: true, privateNickCount: 1, unreplied: { public: 3, private: 1 }, todayAppointments: { public: 1, private: 0 }, totalContacts: 30, closedThisWeek: 1 }],
    };
    const w = mount(OverviewTeamPanel, { props: { team, loading: false } });
    expect(w.findAll('.crm-pv__priv').length).toBeGreaterThan(0);
    await w.get('.crm-tm__view').trigger('click');
    expect(w.emitted('viewUser')![0]).toEqual(['u9']);
  });
  it('thiếu dữ liệu đếm: tiêu đề không hiện "0 nhân viên" / "0 nick"', () => {
    const team = { scope: { canViewAll: false, deptIds: [], userCount: 0 }, teamKpi: undefined, topUser: null, perUser: undefined } as never;
    expect(mount(OverviewTeamPanel, { props: { team, loading: false } }).text()).not.toMatch(/\(0 nhân viên\)/);
    const system = { orgKpi: undefined, deptRanking: [], funnel: [], recentAudit: [] } as never;
    expect(mount(OverviewSystemPanel, { props: { system, loading: false } }).text()).not.toMatch(/\(0 nick\)/);
  });
  it('system null -> lỗi', () => {
    expect(mount(OverviewSystemPanel, { props: { system: null, loading: false } }).find('.m-feedback--error').exists()).toBe(true);
  });
});

describe('CustomerProfile — thứ tự thông tin như desktop + nick/người phụ trách', () => {
  const profile = (): ContactProfileResponse => ({
    contact: { id: 'c1', displayName: 'Nguyễn Lan', fullName: 'Nguyễn Lan', crmName: null, email: 'lan@x.vn', addressLine: null, occupation: null, phone: '0912345678', phone2: null, phone3: null, gender: null, birthDate: null, birthYear: null, province: null, district: null, ward: null, leadScore: 40, statusId: null, statusName: 'Đang tư vấn', avatarUrl: null },
    friends: [{ id: 'f1', zaloUid: 'z', accountId: 'a1', accountName: 'Nick Bán hàng', displayName: 'Lan Zalo', aliasInNick: null, leadScore: 55, statusName: null, relationshipKind: 'friend', totalInbound: 4, totalOutbound: 6, lastInboundAt: null }],
    aggregateScore: 55, aggregateTags: ['vip', 'cần gọi'], primaryOwner: { userId: 'u1', userName: 'Minh' },
  });
  const convs = [{ convId: 'k1', nickName: 'Nick Bán hàng', ownerName: 'Minh' }];
  const mk = (props: Record<string, unknown>) => mount(CustomerProfile, { props: { contact: contact(), conversations: convs, state: 'ready', canEdit: true, profile: profile(), ...props } });

  it('thứ tự: Hero -> Thông tin chung -> Nick Zalo -> Tags tổng hợp (cùng DesktopContactProfileView)', () => {
    const w = mk({});
    expect(w.findAll('h3').map(h => h.text())).toEqual(['Thông tin chung', 'Nick Zalo (1)', 'Tags tổng hợp']);
    expect(w.get('h2').text()).toBe('Nguyễn Lan');
    expect(w.findAll('.crm-profile__tag').map(t => t.text())).toEqual(['vip', 'cần gọi']);
  });
  it('hiện người phụ trách chính (+N cùng chăm) và nick ngay dưới tên (signature); điểm = điểm cao nhất các nick', () => {
    const w = mk({});
    expect(w.get('.crm-profile__owner').text()).toContain('Phụ trách chính: Minh');
    expect(w.get('.crm-profile__owner').text()).toContain('+1 người cùng chăm');
    expect(w.get('.crm-profile__nickline').text()).toContain('Nick Nick Bán hàng');
    expect(w.get('.crm-profile__chip--score').text()).toBe('Điểm 55');
  });
  it('nút: Nhắn tin / Đặt lịch / Sửa / Nhật ký phát đúng sự kiện; Sửa ẩn khi không có quyền', async () => {
    const w = mk({});
    const btn = (t: string) => w.findAll('.crm-profile__act').find(b => b.text().includes(t))!;
    await btn('Nhắn tin').trigger('click');
    await btn('Đặt lịch').trigger('click');
    await btn('Sửa').trigger('click');
    await btn('Nhật ký').trigger('click');
    expect(w.emitted('message')![0]).toEqual(['c1']);
    expect(w.emitted('schedule')![0]).toEqual(['c1']);
    expect(w.emitted('edit')![0]).toEqual(['c1']);
    expect(w.emitted('openActivity')![0]).toEqual(['c1']);
    expect(mk({ canEdit: false }).findAll('.crm-profile__act').some(b => b.text().includes('Sửa'))).toBe(false);
  });
  it('profile chưa tải được: vẫn liệt kê nick từ hội thoại + ghi chú; không hiện điểm sai', () => {
    const w = mk({ profile: null, profileMissing: true });
    expect(w.text()).toContain('Chưa tải được chi tiết nick');
    expect(w.findAll('.crm-profile__nick')).toHaveLength(1);
  });
  it('loading / missing / forbidden / offline', async () => {
    expect(mk({ state: 'loading', contact: null }).find('.m-feedback--loading').exists()).toBe(true);
    expect(mk({ state: 'missing', contact: null }).text()).toContain('Khách không tồn tại hoặc đã xóa');
    expect(mk({ state: 'forbidden', contact: null }).find('.m-feedback--forbidden').exists()).toBe(true);
    const off = mk({ state: 'offline', contact: null });
    expect(off.find('.m-feedback--offline').exists()).toBe(true);
    await off.get('.m-feedback__btn--primary').trigger('click');
    expect(off.emitted('retry')).toHaveLength(1);
  });
});

describe('CustomerConversationPicker', () => {
  it('liệt kê nick + người phụ trách; chọn phát select và đóng sheet', async () => {
    const w = mount(CustomerConversationPicker, { props: { open: true, contactId: 'c1', options: [{ convId: 'k1', nickName: 'A', ownerName: 'Minh' }, { convId: 'k2', nickName: 'B', ownerName: null }] }, ...sheet });
    const rows = w.findAll('.crm-picker__row');
    expect(rows[0].text()).toContain('Nick A');
    expect(rows[0].text()).toContain('Phụ trách: Minh');
    expect(rows[1].text()).toContain('Chưa phân công');
    await rows[1].trigger('click');
    expect(w.emitted('select')![0]).toEqual(['k2']);
    expect(w.emitted('update:open')![0]).toEqual([false]);
  });
});

describe('AppointmentSheet', () => {
  const props = { open: true, initial: { contactId: 'c1', title: 'Hẹn Lan', appointmentDate: '2026-11-10T09:00' }, saving: false, error: '', timezoneLabel: 'UTC+07:00', contactName: 'Lan' };

  it('hiện múi giờ tổ chức; submit phát draft với ngày-giờ tổ chức', async () => {
    const w = mount(AppointmentSheet, { props, ...sheet });
    expect(w.text()).toContain('UTC+07:00');
    expect(w.text()).toContain('Lan');
    await w.get('#ap-time').setValue('10:30');
    await w.get('form').trigger('submit');
    expect(w.emitted('submit')![0][0]).toMatchObject({ contactId: 'c1', title: 'Hẹn Lan', appointmentDate: '2026-11-10T10:30', durationMin: 15 });
  });
  it('thiếu tiêu đề -> báo lỗi tại ô, không submit', async () => {
    const w = mount(AppointmentSheet, { props: { ...props, initial: { contactId: 'c1', appointmentDate: '2026-11-10T09:00' } }, ...sheet });
    await w.get('form').trigger('submit');
    expect(w.emitted('submit')).toBeUndefined();
    expect(w.text()).toContain('Nhập tiêu đề');
  });
  it('lỗi từ server hiện role=alert; nút khóa khi đang lưu', async () => {
    const w = mount(AppointmentSheet, { props: { ...props, error: 'Không lưu được', saving: true }, ...sheet });
    expect(w.get('[role="alert"]').text()).toBe('Không lưu được');
    expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined();
  });
  it('tạo từ agenda không có khách: tìm khách phát searchContact; chọn khách điền tiêu đề', async () => {
    const w = mount(AppointmentSheet, { props: { ...props, initial: { appointmentDate: '2026-11-10T09:00' }, contactName: '', contactResults: [{ id: 'c9', name: 'Trần B', phone: '0900000000' }] }, ...sheet });
    await w.get('input[type="search"]').setValue('tran');
    expect(w.emitted('searchContact')![0]).toEqual(['tran']);
    await w.get('.crm-appt__result').trigger('click');
    expect(w.get('#ap-title').element).toHaveProperty('value', 'Hẹn Trần B');
    await w.get('form').trigger('submit');
    expect(w.emitted('submit')![0][0]).toMatchObject({ contactId: 'c9' });
  });
});
