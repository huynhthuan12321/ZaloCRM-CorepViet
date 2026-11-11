// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * message-template-helpers.ts — Helper thuần cho Mẫu tin nhắn Community (Phase 3).
 *
 * Bản Community trước đây KHÔNG có route CRUD cho MessageTemplate (chỉ EE có
 * `/automation/templates`) → màn Mẫu tin nhắn + popup chèn `//` trong chat CHẾT.
 * message-template-routes.ts nối lại, map về model MessageTemplate/MessageTemplateFolder.
 *
 * Tách where-builder + DTO ra pure function để test org-scoping độc lập (không cần DB).
 */

export interface TemplateFilter {
  folderId?: string;
  visibility?: string;
  tags?: string; // 'tagA,tagB'
  category?: string;
  search?: string;
  includeArchived?: boolean;
}

/** Chuẩn hoá shortcut: bỏ '/' đầu, lowercase, bỏ khoảng trắng. '//baogia' → 'baogia'. */
export function normalizeShortcut(raw: unknown): string | null {
  const s = (typeof raw === 'string' ? raw : '').trim().replace(/^\/+/, '').replace(/\s+/g, '').toLowerCase();
  return s || null;
}

/**
 * Where cho GET templates. BẤT BIẾN BẢO MẬT: luôn scope orgId; chỉ thấy mẫu
 * public HOẶC của chính mình (createdById/ownerUserId = userId).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTemplateWhere(orgId: string, userId: string, filter: TemplateFilter = {}): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    orgId,
    OR: [{ visibility: 'public' }, { createdById: userId }, { ownerUserId: userId }],
  };
  if (!filter.includeArchived) where.archivedAt = null;
  if (filter.folderId) where.folderId = filter.folderId;
  if (filter.visibility) where.visibility = filter.visibility;
  if (filter.category) where.category = filter.category;
  if (filter.tags) {
    const tags = filter.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length) where.tagIds = { hasSome: tags };
  }
  const q = (filter.search ?? '').trim();
  if (q) {
    // AND để KHÔNG ghi đè OR scope quyền riêng tư ở trên.
    where.AND = [{
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
        { shortcut: { contains: q, mode: 'insensitive' } },
      ],
    }];
  }
  return where;
}

interface TemplateRow {
  id: string; name: string; shortcut: string | null; content: string;
  contentRich: unknown; category: string | null; folderId: string | null;
  visibility: string; tagIds: string[]; manualSendCount: number; usageCount: number;
  createdById: string | null; ownerUserId: string | null;
  createdAt: Date; updatedAt: Date;
}

/** DTO khớp interface MessageTemplate của frontend (use-message-templates.ts). */
export function templateDto(t: TemplateRow, userId: string) {
  return {
    id: t.id,
    name: t.name,
    shortcut: t.shortcut,
    content: t.content,
    contentRich: t.contentRich ?? null,
    category: t.category,
    folderId: t.folderId,
    visibility: t.visibility,
    tagIds: t.tagIds ?? [],
    isPersonal: t.visibility === 'private',
    isMine: t.createdById === userId || t.ownerUserId === userId,
    manualSendCount: t.manualSendCount ?? 0,
    usageCount: t.usageCount ?? 0,
    createdAt: t.createdAt?.toISOString(),
    updatedAt: t.updatedAt?.toISOString(),
  };
}

interface FolderRow {
  id: string; name: string; visibility: string; ownerUserId: string | null;
  _count?: { templates: number };
}

export function folderDto(f: FolderRow) {
  return {
    id: f.id,
    name: f.name,
    visibility: f.visibility,
    ownerUserId: f.ownerUserId,
    _count: { templates: f._count?.templates ?? 0 },
  };
}
