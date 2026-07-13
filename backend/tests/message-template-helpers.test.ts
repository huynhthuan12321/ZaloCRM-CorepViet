/**
 * message-template-helpers.test.ts — Mẫu tin nhắn Community (Phase 3 Marketing).
 * Kiểm chứng org-scoping + quyền riêng tư trong where, DTO khớp frontend, và
 * chuẩn hoá shortcut. Pure function nên test trực tiếp.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTemplateWhere,
  templateDto,
  folderDto,
  normalizeShortcut,
} from '../src/modules/marketing/message-template-helpers.js';

const ORG = 'org-1';
const USER = 'user-1';

describe('buildTemplateWhere — org & privacy scope', () => {
  it('luôn scope orgId + chỉ public hoặc của mình', () => {
    const w = buildTemplateWhere(ORG, USER);
    expect(w.orgId).toBe(ORG);
    expect(w.OR).toEqual([
      { visibility: 'public' },
      { createdById: USER },
      { ownerUserId: USER },
    ]);
    expect(w.archivedAt).toBeNull();
  });

  it('includeArchived=true bỏ điều kiện archivedAt', () => {
    expect(buildTemplateWhere(ORG, USER, { includeArchived: true }).archivedAt).toBeUndefined();
  });

  it('filter folderId/category', () => {
    const w = buildTemplateWhere(ORG, USER, { folderId: 'f1', category: 'FAQ' });
    expect(w.folderId).toBe('f1');
    expect(w.category).toBe('FAQ');
  });

  it('tags → hasSome, bỏ phần tử rỗng', () => {
    const w = buildTemplateWhere(ORG, USER, { tags: 'A, ,B' });
    expect(w.tagIds).toEqual({ hasSome: ['A', 'B'] });
  });

  it('search dùng AND để KHÔNG ghi đè OR quyền riêng tư', () => {
    const w = buildTemplateWhere(ORG, USER, { search: '  chao ' });
    expect(w.OR).toHaveLength(3); // OR scope giữ nguyên
    expect(w.AND[0].OR[0]).toEqual({ name: { contains: 'chao', mode: 'insensitive' } });
  });

  it('search rỗng → không thêm AND', () => {
    expect(buildTemplateWhere(ORG, USER, { search: '   ' }).AND).toBeUndefined();
  });
});

describe('normalizeShortcut', () => {
  it('bỏ // đầu, lowercase, bỏ space', () => {
    expect(normalizeShortcut('//BaoGia')).toBe('baogia');
    expect(normalizeShortcut('/ chao ban ')).toBe('chaoban');
  });
  it('rỗng → null', () => {
    expect(normalizeShortcut('')).toBeNull();
    expect(normalizeShortcut('///')).toBeNull();
    expect(normalizeShortcut(undefined)).toBeNull();
  });
});

describe('templateDto', () => {
  const base = {
    id: 't1', name: 'Chào', shortcut: 'chao', content: 'Dạ em chào', contentRich: null,
    category: null, folderId: null, visibility: 'public', tagIds: ['A'],
    manualSendCount: 2, usageCount: 5, createdById: 'other', ownerUserId: null,
    createdAt: new Date('2026-07-12T00:00:00Z'), updatedAt: new Date('2026-07-12T01:00:00Z'),
  };

  it('map đúng field + isPersonal theo visibility', () => {
    const dto = templateDto(base, USER);
    expect(dto.isPersonal).toBe(false);
    expect(dto.isMine).toBe(false);
    expect(dto.tags ?? dto.tagIds).toBeDefined();
    expect(dto.tagIds).toEqual(['A']);
    expect(dto.createdAt).toBe('2026-07-12T00:00:00.000Z');
  });

  it('isMine=true khi createdById khớp; isPersonal=true khi private', () => {
    const dto = templateDto({ ...base, visibility: 'private', createdById: USER }, USER);
    expect(dto.isMine).toBe(true);
    expect(dto.isPersonal).toBe(true);
  });
});

describe('folderDto', () => {
  it('default _count.templates = 0 khi thiếu', () => {
    expect(folderDto({ id: 'f1', name: 'Chung', visibility: 'public', ownerUserId: null })._count).toEqual({ templates: 0 });
  });
  it('giữ _count khi có', () => {
    expect(folderDto({ id: 'f1', name: 'Chung', visibility: 'public', ownerUserId: null, _count: { templates: 3 } })._count.templates).toBe(3);
  });
});
