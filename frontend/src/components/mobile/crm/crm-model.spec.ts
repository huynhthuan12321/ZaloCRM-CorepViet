import { describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));

import type { Contact } from '@/composables/use-contacts';
import {
  MOBILE_SOURCE_OPTIONS, contactNickCount, contactOwner, contactRedacted, contactStatusLabel, countActiveFilters,
  emptyFilterPatch, profileGeneralRows, reminderTime, resolveCanCreateContact, resolveContactAction, splitAriaLabel, splitParts,
} from './crm-model';
import { buildContactPayload, contactToForm, validateContactForm } from './contact-form-model';
import { refreshOrgTimezone } from '@/composables/use-org-timezone';

const base = (over: Partial<Contact> = {}): Contact => ({ id: 'c1', fullName: 'Khách A', phone: null, source: null, status: null, nextAppointment: null, notes: null, tags: [], leadScore: 0, lastActivity: null, mergedInto: null, ...over });

describe('người phụ trách + "+N cùng chăm" (D-4)', () => {
  it('đếm người cùng chăm, loại trừ người phụ trách chính khỏi +N', () => {
    const c = base({
      assignedUserId: 'u1', assignedUser: { id: 'u1', fullName: 'Lan' },
      contactAccess: [
        { role: 'primary', source: 'x', createdAt: '', user: { id: 'u1', fullName: 'Lan', email: null } },
        { role: 'collaborator', source: 'x', createdAt: '', user: { id: 'u1', fullName: 'Lan', email: null } },
        { role: 'collaborator', source: 'x', createdAt: '', user: { id: 'u2', fullName: 'Minh', email: null } },
        { role: 'collaborator', source: 'x', createdAt: '', user: { id: 'u3', fullName: 'Hà', email: null } },
      ],
    });
    expect(contactOwner(c)).toEqual({ name: 'Lan', extra: 2 });
  });
  it('chưa phân công -> name null, extra 0', () => {
    expect(contactOwner(base())).toEqual({ name: null, extra: 0 });
  });
  it('số nick = tổng nicksByKind; không có -> 0 (không bịa tên nick)', () => {
    expect(contactNickCount(base({ nicksByKind: { friend: 2, ghost: 1 } }))).toBe(3);
    expect(contactNickCount(base())).toBe(0);
  });
});

describe('trạng thái / lọc', () => {
  it('nhãn trạng thái ưu tiên displayStatus -> statusRef -> bảng cố định', () => {
    expect(contactStatusLabel(base({ displayStatus: { id: 's', name: 'Đang tư vấn', order: 1, color: null, isTerminal: false } }))).toBe('Đang tư vấn');
    expect(contactStatusLabel(base({ status: 'interested' }))).toBe('Quan tâm');
    expect(contactStatusLabel(base())).toBe('');
  });
  it('bộ lọc mobile: chỉ ba trường; đếm đúng; reset về rỗng', () => {
    expect(countActiveFilters({ status: 'new', source: '', assignedUserId: 'u1' })).toBe(2);
    expect(emptyFilterPatch()).toEqual({ status: '', source: '', assignedUserId: '' });
  });
  it('nguồn không còn TikTok (D-1)', () => {
    expect(MOBILE_SOURCE_OPTIONS.map(o => o.value)).not.toContain('TT');
    expect(MOBILE_SOURCE_OPTIONS.length).toBeGreaterThan(0);
  });
  it('redacted từ server -> ẩn trích đoạn', () => {
    expect(contactRedacted({ ...base(), redacted: true } as Contact)).toBe(true);
    expect(contactRedacted(base())).toBe(false);
  });
});

describe('quyền thao tác khách (ẩn UI theo grant, server vẫn enforce)', () => {
  it('admin/owner luôn được; chưa đăng nhập không', () => {
    expect(resolveCanCreateContact({ role: 'admin' })).toBe(true);
    expect(resolveCanCreateContact(null)).toBe(false);
  });
  it('có grant contact.create=false -> ẩn; không định nghĩa action -> hành vi cũ (hiện)', () => {
    expect(resolveCanCreateContact({ role: 'member', grants: { contact: { access: true, create: false } } })).toBe(false);
    expect(resolveCanCreateContact({ role: 'member', grants: { contact: { access: true, create: true } } })).toBe(true);
    expect(resolveCanCreateContact({ role: 'member', grants: { contact: { access: true } } })).toBe(true);
    expect(resolveContactAction({ role: 'member', grants: { contact: { delete: false } } }, 'delete')).toBe(false);
  });
});

describe('PrivacySplit không cộng gộp', () => {
  it('splitParts giữ public và private riêng', () => {
    expect(splitParts({ public: 3, private: 2 })).toEqual({ pub: 3, priv: 2 });
    expect(splitParts(undefined)).toBeNull();
  });
  it('aria không lộ tổng; thiếu dữ liệu -> "chưa có số liệu" thay vì 0', () => {
    expect(splitAriaLabel('Chưa rep', { public: 3, private: 2 })).toBe('Chưa rep: 3 công khai, 2 nick riêng tư');
    expect(splitAriaLabel('Chưa rep', { public: 3, private: 0 })).toBe('Chưa rep: 3');
    expect(splitAriaLabel('Chưa rep', null)).toBe('Chưa rep: chưa có số liệu');
  });
});

describe('hồ sơ khách: Thông tin chung cùng thứ tự desktop', () => {
  it('thứ tự nhãn + bỏ trường rỗng + nhãn giới tính tiếng Việt', () => {
    const rows = profileGeneralRows(base({
      fullName: 'Nguyễn A', crmName: 'A CRM', email: 'a@x.vn', phone: '0912345678', phone2: '0987654321', occupation: 'Kế toán',
      addressLine: '1 Lê Lợi', ward: 'P1', district: 'Q1', province: 'HCM', gender: 'female', birthYear: 1990,
    }));
    expect(rows.map(r => r.label)).toEqual([
      'Tên đầy đủ', 'Tên CRM', 'Email', 'Điện thoại', 'Điện thoại 2', 'Nghề nghiệp', 'Địa chỉ', 'Khu vực', 'Giới tính', 'Ngày sinh',
    ]);
    expect(rows.find(r => r.label === 'Khu vực')!.value).toBe('P1, Q1, HCM');
    expect(rows.find(r => r.label === 'Giới tính')!.value).toBe('Nữ');
    expect(profileGeneralRows(null)).toEqual([]);
  });
});

describe('form khách: sửa trên mobile không xóa dữ liệu ngoài form', () => {
  it('payload giữ nguyên giới tính, nhãn, đồng ý nhận tin... của khách hiện có', () => {
    const c = base({ gender: 'male', tags: ['vip'], consentStatus: 'granted', consentSource: 'landing', incomeRange: '20_50m', birthYear: 1985, socialFacebook: 'fb.com/a' });
    const form = contactToForm(c);
    form.phone = '0900000000'; // chỉ sửa SĐT
    const payload = buildContactPayload(form);
    expect(payload).toMatchObject({ phone: '0900000000', gender: 'male', tags: ['vip'], consentStatus: 'granted', consentSource: 'landing', incomeRange: '20_50m', birthYear: 1985, socialFacebook: 'fb.com/a' });
  });
  it('tên bắt buộc như desktop', () => {
    expect(validateContactForm({ ...contactToForm(null), fullName: '  ' })).toEqual({ fullName: 'Bắt buộc' });
    expect(validateContactForm({ ...contactToForm(null), fullName: 'A' })).toEqual({});
  });
});

describe('giờ nhắc hẹn', () => {
  it('ưu tiên appointmentTime; chuẩn hóa HH:mm', () => {
    expect(reminderTime('2026-11-10T00:00:00.000Z', '9:05')).toBe('09:05');
    expect(reminderTime('2026-11-10T00:00:00.000Z', '14:30')).toBe('14:30');
  });
});

describe('ngày trong form khách không lệch khi lưu (UTC+7)', () => {
  const iso = '2026-11-09T17:00:00.000Z'; // 00:00 ngày 10/11 theo UTC+7
  it('không đổi ngày -> gửi lại NGUYÊN chuỗi ISO gốc; hiển thị đúng ngày tổ chức', () => {
    refreshOrgTimezone('+07:00');
    const c = base({ nextAppointment: iso, firstContactDate: iso, birthDate: iso });
    const form = contactToForm(c);
    expect(form.nextAppointmentDate).toBe('2026-11-10');
    const p = buildContactPayload(form, c);
    expect(p.nextAppointment).toBe(iso);
    expect(p.firstContactDate).toBe(iso);
    expect(p.birthDate).toBe(iso);
  });
  it('đổi ngày -> 00:00 theo múi giờ tổ chức; xóa ngày -> null; khách mới không có gốc', () => {
    refreshOrgTimezone('+07:00');
    const c = base({ nextAppointment: iso });
    const form = { ...contactToForm(c), nextAppointmentDate: '2026-11-12', birthDate: '2026-01-05' };
    const p = buildContactPayload(form, c);
    expect(p.nextAppointment).toBe('2026-11-11T17:00:00.000Z');
    expect(p.birthDate).toBe('2026-01-04T17:00:00.000Z');
    expect(buildContactPayload({ ...contactToForm(c), nextAppointmentDate: '' }, c).nextAppointment).toBeNull();
    expect(buildContactPayload(contactToForm(null)).nextAppointment).toBeNull();
  });
});
