// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * M53 2026-05-30 — Type + validator cho extracted entities AI Trợ Lý
 * trả về trong Virtual Chat. Mapping qua Contact fields.
 *
 * KHÔNG dùng zod vì backend chưa có dep — dùng manual type guard.
 */

export type Gender = 'M' | 'F' | null;
export type IncomeRange = '0-10' | '10-20' | '20-50' | '50+' | null;
export type ProductPurpose = 'dung_thu' | 'dung_thuong_xuyen' | 'mua_si' | 'lam_dai_ly' | 'qua_tang' | 'ban_thu';
export type DecisionTimeline = 'hom_nay' | 'tuan_nay' | 'thang_nay' | 'chua_ro';
export type LeadSource = 'facebook' | 'zalo' | 'gioi_thieu' | 'hotline' | 'website' | 'khac';

export interface ExtractedProductNeed {
  type?: string;
  budgetMin?: number; // triệu VND
  budgetMax?: number;
  purpose?: ProductPurpose;
  decisionTimeline?: DecisionTimeline;
  area?: string;
  quantity?: string;
  deliveryAddress?: string;
}

export interface ExtractedEntities {
  fullName?: string;
  gender?: Gender;
  birthYear?: number;
  occupation?: string;
  incomeRange?: IncomeRange;
  province?: string;
  district?: string;
  ward?: string;
  productNeed?: ExtractedProductNeed;
  leadSource?: LeadSource;
  tags?: string[];
  confidenceScore: number;
  missingFields: string[];
}

const ENUM_PRODUCT_PURPOSE = new Set(['dung_thu', 'dung_thuong_xuyen', 'mua_si', 'lam_dai_ly', 'qua_tang', 'ban_thu']);
const ENUM_DECISION_TIMELINE = new Set(['hom_nay', 'tuan_nay', 'thang_nay', 'chua_ro']);
const ENUM_LEAD_SOURCE = new Set(['facebook', 'zalo', 'gioi_thieu', 'hotline', 'website', 'khac']);
const ENUM_INCOME = new Set(['0-10', '10-20', '20-50', '50+']);

/**
 * Manual safeParse — fail open: drop invalid field but keep valid ones.
 * Trả null nếu input KHÔNG phải object hoặc thiếu confidenceScore/missingFields.
 */
export function safeParseEntities(input: unknown): { success: true; data: ExtractedEntities } | { success: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { success: false, error: 'Not an object' };
  }
  const obj = input as Record<string, unknown>;
  const out: ExtractedEntities = {
    confidenceScore: typeof obj.confidenceScore === 'number'
      ? Math.max(0, Math.min(1, obj.confidenceScore))
      : 0,
    missingFields: Array.isArray(obj.missingFields)
      ? obj.missingFields.filter((s) => typeof s === 'string').slice(0, 20) as string[]
      : [],
  };

  if (typeof obj.fullName === 'string' && obj.fullName.length <= 200) out.fullName = obj.fullName;
  if (obj.gender === 'M' || obj.gender === 'F') out.gender = obj.gender;
  if (typeof obj.birthYear === 'number' && obj.birthYear >= 1940 && obj.birthYear <= 2015) {
    out.birthYear = Math.floor(obj.birthYear);
  }
  if (typeof obj.occupation === 'string' && obj.occupation.length <= 200) out.occupation = obj.occupation;
  if (typeof obj.incomeRange === 'string' && ENUM_INCOME.has(obj.incomeRange)) {
    out.incomeRange = obj.incomeRange as IncomeRange;
  }
  if (typeof obj.province === 'string') out.province = obj.province.slice(0, 100);
  if (typeof obj.district === 'string') out.district = obj.district.slice(0, 100);
  if (typeof obj.ward === 'string') out.ward = obj.ward.slice(0, 100);
  if (typeof obj.leadSource === 'string' && ENUM_LEAD_SOURCE.has(obj.leadSource)) {
    out.leadSource = obj.leadSource as LeadSource;
  }
  if (Array.isArray(obj.tags)) {
    out.tags = obj.tags
      .filter((t) => typeof t === 'string')
      .slice(0, 10)
      .map((t) => (t as string).slice(0, 50));
  }
  // Đọc cả khóa cũ để các gợi ý AI đã lưu trước khi đổi ngành vẫn mở được.
  const rawProductNeed = obj.productNeed ?? obj.propertyNeed;
  if (rawProductNeed && typeof rawProductNeed === 'object') {
    const pn = rawProductNeed as Record<string, unknown>;
    const need: ExtractedProductNeed = {};
    if (typeof pn.type === 'string' && pn.type.trim()) need.type = pn.type.trim().slice(0, 200);
    if (typeof pn.budgetMin === 'number' && pn.budgetMin >= 0 && pn.budgetMin < 1_000_000) need.budgetMin = pn.budgetMin;
    if (typeof pn.budgetMax === 'number' && pn.budgetMax >= 0 && pn.budgetMax < 1_000_000) need.budgetMax = pn.budgetMax;
    if (typeof pn.purpose === 'string' && ENUM_PRODUCT_PURPOSE.has(pn.purpose)) need.purpose = pn.purpose as ProductPurpose;
    if (typeof pn.decisionTimeline === 'string' && ENUM_DECISION_TIMELINE.has(pn.decisionTimeline)) {
      need.decisionTimeline = pn.decisionTimeline as DecisionTimeline;
    }
    if (typeof pn.area === 'string') need.area = pn.area.slice(0, 200);
    if (typeof pn.quantity === 'string') need.quantity = pn.quantity.slice(0, 100);
    if (typeof pn.deliveryAddress === 'string') need.deliveryAddress = pn.deliveryAddress.slice(0, 300);
    if (Object.keys(need).length > 0) out.productNeed = need;
  }

  return { success: true, data: out };
}
