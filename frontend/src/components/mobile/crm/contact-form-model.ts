// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Mô hình form khách hàng cho mobile. PUT /contacts/:id của desktop gửi TOÀN BỘ trường (ContactDetailDialog.onSave),
 * nên mobile phải khởi tạo mọi trường từ khách hiện có và gửi lại nguyên vẹn các trường không hiển thị trên form mobile
 * (giới tính, nhãn, đồng ý nhận tin...) để một lần sửa trên điện thoại không xóa dữ liệu.
 */
import type { Contact } from '@/composables/use-contacts';
import { orgDayKey, orgWallClockToUtc } from '@/composables/use-org-timezone';

export interface ContactFormState {
  fullName: string; crmName: string; phone: string; phone2: string; phone3: string; email: string;
  source: string; status: string; nextAppointmentDate: string; firstContactDate: string; notes: string; tags: string[];
  gender: string; birthYear: number | null; birthDate: string; occupation: string; incomeRange: string;
  socialFacebook: string; socialTiktok: string; preferredLang: string;
  province: string; district: string; ward: string; addressLine: string;
  consentStatus: string; consentSource: string;
}

/** Ngày hiển thị theo MÚI GIỜ TỔ CHỨC (không UTC, không giờ máy) để lưu lại không làm lệch ngày. */
const isoDay = (iso?: string | null): string => (iso ? orgDayKey(iso) : '');

export function emptyContactForm(): ContactFormState {
  return {
    fullName: '', crmName: '', phone: '', phone2: '', phone3: '', email: '', source: '', status: '',
    nextAppointmentDate: '', firstContactDate: '', notes: '', tags: [],
    gender: '', birthYear: null, birthDate: '', occupation: '', incomeRange: '',
    socialFacebook: '', socialTiktok: '', preferredLang: 'vi',
    province: '', district: '', ward: '', addressLine: '', consentStatus: 'implicit', consentSource: '',
  };
}

export function contactToForm(c: Contact | null): ContactFormState {
  if (!c) return emptyContactForm();
  return {
    fullName: c.fullName ?? '', crmName: c.crmName ?? '', phone: c.phone ?? '', phone2: c.phone2 ?? '', phone3: c.phone3 ?? '',
    email: c.email ?? '', source: c.source ?? '', status: c.status ?? '',
    nextAppointmentDate: isoDay(c.nextAppointment), firstContactDate: isoDay(c.firstContactDate),
    notes: c.notes ?? '', tags: c.tags ?? [],
    gender: c.gender ?? '', birthYear: c.birthYear ?? null, birthDate: isoDay(c.birthDate),
    occupation: c.occupation ?? '', incomeRange: c.incomeRange ?? '',
    socialFacebook: c.socialFacebook ?? '', socialTiktok: c.socialTiktok ?? '', preferredLang: c.preferredLang ?? 'vi',
    province: c.province ?? '', district: c.district ?? '', ward: c.ward ?? '', addressLine: c.addressLine ?? '',
    consentStatus: c.consentStatus ?? 'implicit', consentSource: c.consentSource ?? '',
  };
}

/** Ngày mới chọn -> 00:00 theo múi giờ tổ chức (cùng hệ quy chiếu với isoDay), dạng ISO UTC. */
const dayToIso = (day: string): string | null => (day ? (orgWallClockToUtc(day, '00:00') ?? new Date(`${day}T00:00:00`)).toISOString() : null);

/**
 * Trường ngày KHÔNG đổi so với khách gốc -> gửi lại nguyên chuỗi ISO gốc (không qua chuyển đổi nên không thể lệch ngày).
 * Ngày đổi -> chuyển theo múi giờ tổ chức. (Desktop ContactDetailDialog dùng toISOString UTC + giờ máy nên lùi 1 ngày ở UTC+7 — không sửa ở đây.)
 */
function dateField(day: string, original: Contact | null, key: 'nextAppointment' | 'firstContactDate' | 'birthDate'): string | null {
  const orig = original?.[key] ?? null;
  if (orig && day === isoDay(orig)) return orig;
  if (!orig && !day) return null;
  return dayToIso(day);
}

/** Cùng ánh xạ trường với ContactDetailDialog.onSave (desktop); ngày xử lý riêng như trên. */
export function buildContactPayload(f: ContactFormState, original: Contact | null = null): Partial<Contact> & Record<string, unknown> {
  return {
    fullName: f.fullName || null, crmName: f.crmName || null,
    phone: f.phone || null, phone2: f.phone2 || null, phone3: f.phone3 || null,
    email: f.email || null, source: f.source || null, status: f.status || null,
    nextAppointment: dateField(f.nextAppointmentDate, original, 'nextAppointment'),
    firstContactDate: dateField(f.firstContactDate, original, 'firstContactDate'),
    notes: f.notes || null, tags: f.tags,
    gender: f.gender || null, birthYear: f.birthYear ?? null, birthDate: dateField(f.birthDate, original, 'birthDate'),
    occupation: f.occupation || null, incomeRange: f.incomeRange || null,
    socialFacebook: f.socialFacebook || null, socialTiktok: f.socialTiktok || null, preferredLang: f.preferredLang || 'vi',
    province: f.province || null, district: f.district || null, ward: f.ward || null, addressLine: f.addressLine || null,
    consentStatus: f.consentStatus || 'implicit', consentSource: f.consentSource || null,
  };
}

/** Quy tắc hợp lệ giống desktop (`required` cho fullName). */
export function validateContactForm(f: ContactFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!f.fullName.trim()) errors.fullName = 'Bắt buộc';
  return errors;
}

export function isContactFormDirty(a: ContactFormState, b: ContactFormState): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
