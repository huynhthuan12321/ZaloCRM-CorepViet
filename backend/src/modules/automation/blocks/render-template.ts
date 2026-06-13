// Module dùng chung: render biến template trong nội dung Khối.
// 2026-06-07 — tách từ engine/action-handlers/send-message.ts để CẢ engine handler
// LẪN endpoint chat "gửi Khối vào hội thoại" dùng CHUNG một logic render, không lệch.
//
// Chuẩn anh chốt 2026-05-28:
//   {gender} — "Anh"/"Chị"/"Anh Chị" lấy từ Contact.gender (fallback "Anh Chị")
//   {name}   — last word của Contact.fullName (VN convention)
//   {sale}   — last word của user.fullName (chủ nick được assigned)

import { prisma } from '../../../shared/database/prisma-client.js';

/**
 * Render template variables {gender}/{name}/{sale}.
 * @param raw            chuỗi gốc (có thể chứa {gender}/{name}/{sale})
 * @param contactId      Contact để lấy fullName + gender
 * @param assignedNickId ZaloAccount.id — chủ nick → {sale}
 */
export async function renderTemplate(
  raw: string,
  contactId: string,
  assignedNickId: string,
): Promise<string> {
  if (!raw.includes('{')) return raw;

  const [contact, ownerUser] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { fullName: true, gender: true },
    }),
    prisma.user.findFirst({
      where: { zaloAccounts: { some: { id: assignedNickId } } },
      select: { fullName: true },
    }),
  ]);

  const genderStr =
    contact?.gender === 'female' ? 'Chị' : contact?.gender === 'male' ? 'Anh' : 'Anh Chị';
  const name = (contact?.fullName ?? '').trim().split(/\s+/).pop() ?? 'Anh Chị';
  const sale = (ownerUser?.fullName ?? 'em').trim().split(/\s+/).pop() ?? 'em';

  return raw
    .replaceAll('{gender}', genderStr)
    .replaceAll('{name}', name)
    .replaceAll('{sale}', sale);
}

/**
 * Như renderTemplate nhưng TRẢ THÊM các giá trị biến đã resolve — để shiftStylesForRender (D6)
 * dịch offset format theo độ dài giá trị thật. values rỗng nếu raw không chứa biến.
 */
export async function renderTemplateDetailed(
  raw: string,
  contactId: string,
  assignedNickId: string,
): Promise<{ rendered: string; values: { gender: string; name: string; sale: string } }> {
  if (!raw.includes('{')) {
    return { rendered: raw, values: { gender: '', name: '', sale: '' } };
  }
  const [contact, ownerUser] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { fullName: true, gender: true } }),
    prisma.user.findFirst({ where: { zaloAccounts: { some: { id: assignedNickId } } }, select: { fullName: true } }),
  ]);
  const gender = contact?.gender === 'female' ? 'Chị' : contact?.gender === 'male' ? 'Anh' : 'Anh Chị';
  const name = (contact?.fullName ?? '').trim().split(/\s+/).pop() ?? 'Anh Chị';
  const sale = (ownerUser?.fullName ?? 'em').trim().split(/\s+/).pop() ?? 'em';
  const rendered = raw.replaceAll('{gender}', gender).replaceAll('{name}', name).replaceAll('{sale}', sale);
  return { rendered, values: { gender, name, sale } };
}

type Style = { st: string; start: number; len: number };

/**
 * GĐ Block-media (2026-06-13 D6): giữ ĐỊNH DẠNG (đậm/màu) khi text có biến {name}/{gender}/{sale}.
 *
 * Vấn đề: style {start,len} là offset ký tự trên text GỐC. Sau khi renderTemplate thay biến
 * (vd "{name}"→"Thành"), độ dài đổi → offset cũ lệch. Trước đây code BỎ HẾT style khi có '{'
 * (an toàn nhưng MẤT format).
 *
 * Cách AN TOÀN (KHÔNG đếm offset mù — bài học off-by-one tiếng Việt [[reference_ai_phrase_based_pattern]]):
 * tái chạy replace TỪNG token theo thứ tự, dịch start/len của style theo độ lệch độ dài THẬT của
 * biến tại vị trí token. Quy tắc dịch chuẩn:
 *   - token NẰM TRƯỚC style (token.end ≤ style.start): dịch CẢ start (start += delta).
 *   - token NẰM TRONG style (token nằm gọn trong [start, start+len)): MỞ RỘNG len (len += delta).
 *   - token CẮT NGANG ranh giới style: KHÔNG an toàn → trả null (caller fallback bỏ style).
 *   - token NẰM SAU style: không ảnh hưởng.
 * delta = (độ dài giá trị thật) − (độ dài token). Giá trị thật suy ngược từ rawText vs renderedText
 * KHÔNG đáng tin (trùng lặp), nên ta nhận map gender/name/sale value VÀO hàm.
 *
 * @returns styles đã dịch, HOẶC null nếu không an toàn (caller bỏ style — giữ hành vi cũ).
 */
export function shiftStylesForRender(
  rawText: string,
  styles: Style[],
  values: { gender: string; name: string; sale: string },
): Style[] | null {
  if (!styles.length) return styles;
  if (!rawText.includes('{')) return styles; // không có biến → offset giữ nguyên

  const tokenRe = /\{(gender|name|sale)\}/g;
  const tokens: Array<{ start: number; end: number; delta: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(rawText)) !== null) {
    const key = m[1] as 'gender' | 'name' | 'sale';
    const valueLen = [...values[key]].length;
    const tokenLen = m[0].length;
    tokens.push({ start: m.index, end: m.index + tokenLen, delta: valueLen - tokenLen });
  }
  if (tokens.length === 0) return styles;

  const out: Style[] = [];
  for (const s of styles) {
    let start = s.start;
    let len = s.len;
    const sEnd = s.start + s.len;
    for (const t of tokens) {
      if (t.end <= s.start) {
        start += t.delta;            // token đứng trước → dời cả vùng
      } else if (t.start >= s.start && t.end <= sEnd) {
        len += t.delta;              // token nằm gọn trong vùng → giãn/co len
      } else if (t.start < sEnd && t.end > s.start) {
        return null;                 // cắt ngang ranh giới → không an toàn
      }
      // token sau vùng (t.start ≥ sEnd) → bỏ qua
    }
    if (start < 0 || len <= 0) return null; // phòng lệch âm bất thường
    out.push({ st: s.st, start, len });
  }
  return out;
}
