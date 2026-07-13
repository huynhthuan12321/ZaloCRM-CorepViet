/**
 * list-entry-filters.test.ts — Bộ lọc where + CSV escaping DÙNG CHUNG cho
 * GET entries và Export CSV (Phase 2 Marketing, 2026-07-12). Pure function nên
 * test trực tiếp, không cần prisma/DB.
 */
import { describe, it, expect } from 'vitest';
import { buildEntryWhere, csvCell } from '../src/modules/lists/list-entry-filters.js';

describe('buildEntryWhere — filter tab', () => {
  it('tab all → chỉ scope theo list', () => {
    expect(buildEntryWhere('L1')).toEqual({ customerListId: 'L1' });
  });

  it('luôn scope customerListId', () => {
    expect(buildEntryWhere('L9', 'valid').customerListId).toBe('L9');
  });

  it('valid → phoneValid true', () => {
    expect(buildEntryWhere('L1', 'valid')).toMatchObject({ phoneValid: true });
  });

  it('invalid → status invalid', () => {
    expect(buildEntryWhere('L1', 'invalid')).toMatchObject({ status: 'invalid' });
  });

  it('dup → OR 3 điều kiện trùng', () => {
    const w = buildEntryWhere('L1', 'dup');
    expect(w.OR).toEqual([
      { dupInListWithEntryId: { not: null } },
      { dupWithListId: { not: null } },
      { dupWithContactId: { not: null } },
    ]);
  });

  it('dup_in_list / dup_cross_list / dup_with_crm map đúng cột', () => {
    expect(buildEntryWhere('L1', 'dup_in_list')).toMatchObject({ dupInListWithEntryId: { not: null } });
    expect(buildEntryWhere('L1', 'dup_cross_list')).toMatchObject({ dupWithListId: { not: null } });
    expect(buildEntryWhere('L1', 'dup_with_crm')).toMatchObject({ dupWithContactId: { not: null } });
  });

  it('has_zalo → hasZalo true', () => {
    expect(buildEntryWhere('L1', 'has_zalo')).toMatchObject({ hasZalo: true });
  });

  it('no_zalo → hasZalo null + status enriched (đã check Friend, chờ quét)', () => {
    expect(buildEntryWhere('L1', 'no_zalo')).toMatchObject({ hasZalo: null, status: 'enriched' });
  });
});

describe('buildEntryWhere — search', () => {
  it('search build OR đa cột + trim khoảng trắng', () => {
    const w = buildEntryWhere('L1', 'all', '  0908  ');
    expect(w.OR).toEqual([
      { phoneRaw: { contains: '0908', mode: 'insensitive' } },
      { phoneE164: { contains: '0908' } },
      { phoneLocal: { contains: '0908' } },
      { nameRaw: { contains: '0908', mode: 'insensitive' } },
      { zaloName: { contains: '0908', mode: 'insensitive' } },
      { zaloUid: { equals: '0908' } },
    ]);
  });

  it('search rỗng/space → không thêm OR', () => {
    expect(buildEntryWhere('L1', 'all', '   ').OR).toBeUndefined();
  });

  it('giữ quirk cũ: search ghi đè OR của tab dup (không đổi hành vi GET entries)', () => {
    const w = buildEntryWhere('L1', 'dup', 'an');
    // OR cuối cùng là của search, không phải dup
    expect(w.OR?.[0]).toEqual({ phoneRaw: { contains: 'an', mode: 'insensitive' } });
  });
});

describe('csvCell — RFC 4180 escaping', () => {
  it('chuỗi thường giữ nguyên', () => {
    expect(csvCell('Nguyen Van An')).toBe('Nguyen Van An');
  });

  it('null/undefined → chuỗi rỗng', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('có dấu phẩy → bọc nháy', () => {
    expect(csvCell('An, Binh')).toBe('"An, Binh"');
  });

  it('có nháy kép → nhân đôi nháy + bọc', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('có xuống dòng → bọc nháy', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('số → chuỗi', () => {
    expect(csvCell(42)).toBe('42');
  });
});
