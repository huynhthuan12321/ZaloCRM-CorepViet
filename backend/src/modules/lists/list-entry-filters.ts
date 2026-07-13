// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * list-entry-filters.ts — Bộ lọc where DÙNG CHUNG cho entries của Tệp khách hàng.
 *
 * Tách từ GET /customer-lists/:id/entries (2026-07-12, Phase 2 Marketing) để endpoint
 * Export CSV lọc y HỆT bảng chi tiết — export "dùng filter hiện tại" khớp đúng những
 * gì user đang xem. Pure function, không phụ thuộc prisma → test được độc lập.
 *
 * Giữ NGUYÊN hành vi cũ của GET entries: khi có `search`, `where.OR` của search ghi đè
 * OR của tab dup (quirk sẵn có) — không đổi để không phá bảng đang chạy.
 */

export type EntryStatusTab =
  | 'all'
  | 'valid'
  | 'invalid'
  | 'dup'
  | 'dup_in_list'
  | 'dup_cross_list'
  | 'dup_with_crm'
  | 'has_zalo'
  | 'no_zalo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildEntryWhere(listId: string, tab: EntryStatusTab = 'all', search = ''): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { customerListId: listId };

  // Tab filter — dup filter dùng dup_*_id fields (advisory: entries trùng vẫn enrich).
  if (tab === 'valid') {
    where.phoneValid = true;
  } else if (tab === 'invalid') {
    where.status = 'invalid';
  } else if (tab === 'dup') {
    where.OR = [
      { dupInListWithEntryId: { not: null } },
      { dupWithListId: { not: null } },
      { dupWithContactId: { not: null } },
    ];
  } else if (tab === 'dup_in_list') {
    where.dupInListWithEntryId = { not: null };
  } else if (tab === 'dup_cross_list') {
    where.dupWithListId = { not: null };
  } else if (tab === 'dup_with_crm') {
    where.dupWithContactId = { not: null };
  } else if (tab === 'has_zalo') {
    where.hasZalo = true;
  } else if (tab === 'no_zalo') {
    // "Đang chờ Quét" tab = đã check Friend (status='enriched') nhưng hasZalo=null.
    where.hasZalo = null;
    where.status = 'enriched';
  }
  // tab === 'all' → no filter

  const q = search.trim();
  if (q) {
    where.OR = [
      { phoneRaw: { contains: q, mode: 'insensitive' } },
      { phoneE164: { contains: q } },
      { phoneLocal: { contains: q } },
      { nameRaw: { contains: q, mode: 'insensitive' } },
      { zaloName: { contains: q, mode: 'insensitive' } },
      { zaloUid: { equals: q } },
    ];
  }

  return where;
}

/** Escape một ô CSV theo RFC 4180: bọc "..." nếu chứa dấu phẩy/nháy/xuống dòng. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
