// Shared SegmentSpec resolver — Broadcasts Đợt 1 (2026-06-05).
//
// THAY THẾ 3 bản duplicate của resolveSegmentContactIds:
//   - broadcast-routes.ts:39-88
//   - fire-broadcast.ts:128-185
//   - campaign-materializer.ts:58-97
//
// Trả về Set<contactId> đã dedup, scope theo orgId. Mọi kind không hỗ trợ → empty set.
//
// Kinds supported:
//   manual         → { kind: 'manual', contactIds: string[] }
//   filter         → { kind: 'filter', criteria: object }            sanitized via segment-sanitizer
//   customer-list  → { kind: 'customer-list', listId: string }       reads CustomerListEntry hasZalo=true
//   tag            → { kind: 'tag', tagIds: string[], match: 'any'|'all' }   Tag CRM v2 (M57)
//   preset-segment → { kind: 'preset-segment', presetKey: string }   8 pre-set segment registry
//
// AdditionalFilters cho mọi kind (applied as post-filter):
//   hasZalo: boolean | null  → mặc định true cho Broadcasts
//   excludeBlocked: boolean  → loại KH đã chặn nick (default true)

import { sanitizeContactCriteria, sanitizeManualContactIds } from './segment-sanitizer.js';
import { resolvePresetSegment, isValidPresetKey } from './broadcasts-preset-segments.js';

// Prisma client kiểu — tránh import PrismaClient trực tiếp vì Prisma Accelerate
// extends client. Dùng `any` cho param prisma — caller pass shared `prisma` instance.
type PrismaClientLike = any;

// Soft-cap defensive — không cho phép broadcast vô hạn KH
const MAX_RECIPIENTS = 50_000;

export interface SegmentResolveResult {
  /** contactIds đã dedup, scoped orgId, áp filter hasZalo + excludeBlocked */
  contactIds: string[];
  /** Số KH match raw trước khi skip */
  totalResolved: number;
  /** Số KH bị skip vì không Zalo / bị chặn / lỗi */
  skipped: {
    noZalo: number;
    blocked: number;
    total: number;
  };
  /** Nếu có rejected fields trong filter → log warn ở caller */
  rejected?: string[];
  /** Kind đã chạy — debug */
  kind: string;
}

interface SegmentSpec {
  kind?: string;
  contactIds?: unknown;
  listId?: unknown;
  criteria?: unknown;
  tagIds?: unknown;
  match?: unknown;
  presetKey?: unknown;
  hasZalo?: unknown;
  excludeBlocked?: unknown;
}

/**
 * Resolve segmentSpec → contactIds. Mọi query đều scope orgId.
 * KHÔNG throw — luôn trả về result kể cả khi kind không support.
 */
export async function resolveSegmentToContactIds(
  prisma: PrismaClientLike,
  orgId: string,
  spec: unknown,
): Promise<SegmentResolveResult> {
  const empty = (kind: string): SegmentResolveResult => ({
    contactIds: [],
    totalResolved: 0,
    skipped: { noZalo: 0, blocked: 0, total: 0 },
    kind,
  });

  if (!spec || typeof spec !== 'object') {
    return empty('invalid');
  }

  const s = spec as SegmentSpec;
  const kind = typeof s.kind === 'string' ? s.kind : 'unknown';

  // Defaults: chỉ gửi cho KH có Zalo, loại KH đã chặn.
  // hasZalo === null (explicit) → skip post-filter (dùng cho campaign-materializer).
  const hasZaloRaw = (s as any).hasZalo;
  const skipHasZaloFilter = hasZaloRaw === null;
  const hasZaloFilter = skipHasZaloFilter ? false : (typeof hasZaloRaw === 'boolean' ? hasZaloRaw : true);
  const excludeBlocked = typeof s.excludeBlocked === 'boolean' ? s.excludeBlocked : true;

  let rawIds: string[] = [];
  let rejected: string[] | undefined;

  // === manual ===
  if (kind === 'manual') {
    const safe = sanitizeManualContactIds(s.contactIds);
    if (safe.length === 0) return empty('manual');
    const rows = await prisma.contact.findMany({
      where: { id: { in: safe }, orgId },
      select: { id: true },
      take: MAX_RECIPIENTS,
    });
    rawIds = rows.map((r: { id: string }) => r.id);
  }

  // === filter ===
  else if (kind === 'filter') {
    const result = sanitizeContactCriteria(orgId, s.criteria);
    if (!result.ok || !result.where) return { ...empty('filter'), rejected: result.rejected };
    rejected = result.rejected;
    const rows = await prisma.contact.findMany({
      where: result.where as any,
      select: { id: true },
      take: MAX_RECIPIENTS,
    });
    rawIds = rows.map((r: { id: string }) => r.id);
  }

  // === customer-list ===
  else if (kind === 'customer-list') {
    if (typeof s.listId !== 'string') return empty('customer-list');
    // Verify list belongs to org first (tenant isolation)
    const list = await prisma.customerList.findFirst({
      where: { id: s.listId, orgId },
      select: { id: true },
    });
    if (!list) return empty('customer-list');

    const entries: Array<{ phoneE164: string | null; contactId: string | null }> = await prisma.customerListEntry.findMany({
      where: {
        customerListId: s.listId,
        status: { in: ['enriched', 'validated'] },
        phoneValid: true,
      },
      select: { phoneE164: true, contactId: true },
      take: MAX_RECIPIENTS,
    });

    const linkedIds: string[] = entries
      .map((e) => e.contactId)
      .filter((id): id is string => typeof id === 'string');

    const phones84: string[] = entries
      .filter((e) => !e.contactId && e.phoneE164)
      .map((e) => (e.phoneE164 as string).replace(/^\+/, ''));

    const all = new Set<string>(linkedIds);
    if (phones84.length > 0) {
      const phoneRows = await prisma.contact.findMany({
        where: { orgId, phoneNormalized: { in: phones84 } },
        select: { id: true },
        take: MAX_RECIPIENTS,
      });
      phoneRows.forEach((r: { id: string }) => all.add(r.id));
    }
    rawIds = Array.from(all);
  }

  // === tag (Tag CRM v2 M57) ===
  else if (kind === 'tag') {
    if (!Array.isArray(s.tagIds) || s.tagIds.length === 0) return empty('tag');
    const tagIds = s.tagIds
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 100)
      .slice(0, 50); // max 50 tag mỗi broadcast
    if (tagIds.length === 0) return empty('tag');

    const match = s.match === 'all' ? 'all' : 'any'; // default OR

    if (match === 'any') {
      // OR — bất kỳ tag nào match
      const rows = await prisma.contactTag.findMany({
        where: {
          tagId: { in: tagIds },
          removedAt: null,
          contact: { orgId },
        },
        select: { contactId: true },
        take: MAX_RECIPIENTS,
      });
      rawIds = Array.from(new Set(rows.map((r: { contactId: string }) => r.contactId))) as string[];
    } else {
      // AND — phải có TẤT CẢ tag — query 1 lần per tag rồi intersect
      const sets: Set<string>[] = await Promise.all(
        tagIds.map(async (tagId: string) => {
          const rows = await prisma.contactTag.findMany({
            where: { tagId, removedAt: null, contact: { orgId } },
            select: { contactId: true },
            take: MAX_RECIPIENTS,
          });
          return new Set<string>(rows.map((r: { contactId: string }) => r.contactId));
        }),
      );
      if (sets.length === 0) return empty('tag');
      const intersection = sets.reduce((acc, set) => {
        const next = new Set<string>();
        acc.forEach((id) => set.has(id) && next.add(id));
        return next;
      });
      rawIds = Array.from(intersection);
    }
  }

  // === preset-segment ===
  else if (kind === 'preset-segment') {
    if (typeof s.presetKey !== 'string' || !isValidPresetKey(s.presetKey)) {
      return empty('preset-segment');
    }
    rawIds = await resolvePresetSegment(prisma, orgId, s.presetKey, MAX_RECIPIENTS);
  } else {
    return empty(kind);
  }

  // Post-filter: hasZalo + blocked
  if (rawIds.length === 0) {
    return { contactIds: [], totalResolved: 0, skipped: { noZalo: 0, blocked: 0, total: 0 }, kind, rejected };
  }

  const totalResolved = rawIds.length;
  let noZaloCount = 0;
  let blockedCount = 0;
  let finalIds = rawIds;

  if (hasZaloFilter && !skipHasZaloFilter) {
    const withZalo = await prisma.contact.findMany({
      where: { id: { in: rawIds }, orgId, hasZalo: true },
      select: { id: true },
      take: MAX_RECIPIENTS,
    });
    const zaloIds = new Set<string>(withZalo.map((c: { id: string }) => c.id));
    noZaloCount = totalResolved - zaloIds.size;
    finalIds = rawIds.filter((id: string) => zaloIds.has(id));
  }

  if (excludeBlocked && finalIds.length > 0) {
    // Lookup Friend rows where friendshipStatus = 'blocked' for these contacts
    const blockedFriends = await prisma.friend.findMany({
      where: {
        contactId: { in: finalIds },
        orgId,
        friendshipStatus: 'blocked',
      },
      select: { contactId: true },
      take: MAX_RECIPIENTS,
    });
    const blockedSet = new Set<string>(
      blockedFriends
        .map((f: { contactId: string | null }) => f.contactId)
        .filter((id: string | null): id is string => typeof id === 'string'),
    );
    blockedCount = blockedSet.size;
    finalIds = finalIds.filter((id: string) => !blockedSet.has(id));
  }

  return {
    contactIds: finalIds,
    totalResolved,
    skipped: {
      noZalo: noZaloCount,
      blocked: blockedCount,
      total: totalResolved - finalIds.length,
    },
    kind,
    rejected,
  };
}
