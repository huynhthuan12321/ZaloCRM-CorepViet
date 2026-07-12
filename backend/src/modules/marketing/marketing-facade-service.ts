// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * marketing-facade-service.ts — Lớp đọc canonical cho module Marketing (Phase 1).
 *
 * Quyết định kiến trúc: xem MARKETING_ADR_001_facade_strategy.md.
 * KHÔNG tạo bảng `Marketing*` mới — facade map về các model legacy đang chạy:
 *   lists → CustomerList · templates → MessageTemplate · blocks → ContentBlock ·
 *   sequences → AutomationSequence · goals → TargetJob · care-sessions → CareSession ·
 *   broadcasts → BroadcastJob.
 *
 * BẤT BIẾN BẢO MẬT: MỌI hàm nhận `orgId` và lọc `where: { orgId }` tường minh
 * (defense-in-depth cùng tenant-guard ở prisma-client). Không bao giờ query
 * xuyên org. Test org-isolation ở tests/marketing-facade-service.test.ts.
 *
 * Read-only — contract ghi (create/update/delete) vẫn ở route legacy.
 */
import { prisma } from '../../shared/database/prisma-client.js';

const LIST_LIMIT = 200;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export interface MarketingSummary {
  lists: number;
  templates: number;
  blocks: number;
  sequences: number;
  goals: number;
  careSessions: number;
  broadcasts: number;
}

/** Đếm tổng theo domain cho org — dùng cho trang tổng quan Marketing. */
export async function getMarketingSummary(orgId: string): Promise<MarketingSummary> {
  const [lists, templates, blocks, sequences, goals, careSessions, broadcasts] = await Promise.all([
    prisma.customerList.count({ where: { orgId, archivedAt: null } }),
    prisma.messageTemplate.count({ where: { orgId, archivedAt: null } }),
    prisma.contentBlock.count({ where: { orgId } }),
    prisma.automationSequence.count({ where: { orgId } }),
    prisma.targetJob.count({ where: { orgId } }),
    prisma.careSession.count({ where: { orgId, state: 'active' } }),
    prisma.broadcastJob.count({ where: { orgId } }),
  ]);
  return { lists, templates, blocks, sequences, goals, careSessions, broadcasts };
}

export async function listMarketingLists(orgId: string) {
  const rows = await prisma.customerList.findMany({
    where: { orgId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: LIST_LIMIT,
    select: {
      id: true, name: true, iconEmoji: true, sourceType: true, status: true,
      totalEntries: true, validEntries: true, invalidEntries: true,
      hasZaloEntries: true, noZaloEntries: true, pendingLookupEntries: true,
      archivedAt: true, createdAt: true, updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.iconEmoji,
    source: r.sourceType,
    status: r.status,
    counts: {
      total: r.totalEntries,
      valid: r.validEntries,
      invalid: r.invalidEntries,
      hasZalo: r.hasZaloEntries,
      noZalo: r.noZaloEntries,
      pendingLookup: r.pendingLookupEntries,
    },
    archived: r.archivedAt !== null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}

export async function listMarketingTemplates(orgId: string) {
  const rows = await prisma.messageTemplate.findMany({
    where: { orgId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true, name: true, shortcut: true, visibility: true, category: true,
      tagIds: true, folderId: true, usageCount: true, lastUsedAt: true, createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortcut: r.shortcut,
    visibility: r.visibility,
    category: r.category,
    tags: r.tagIds,
    folderId: r.folderId,
    usageCount: r.usageCount,
    lastUsedAt: iso(r.lastUsedAt),
    createdAt: iso(r.createdAt),
  }));
}

export async function listMarketingBlocks(orgId: string) {
  const rows = await prisma.contentBlock.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: { id: true, name: true, messageText: true, imageUrl: true, usageCount: true, createdAt: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    messageText: r.messageText,
    imageUrl: r.imageUrl,
    usageCount: r.usageCount,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}

export async function listMarketingSequences(orgId: string) {
  const rows = await prisma.automationSequence.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true, name: true, description: true, enabled: true, channel: true,
      enrolledCount: true, completedCount: true, failedCount: true,
      createdAt: true, updatedAt: true,
      sequenceSteps: { select: { id: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    channel: r.channel,
    stepCount: r.sequenceSteps.length,
    stats: { enrolled: r.enrolledCount, completed: r.completedCount, failed: r.failedCount },
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}

/** "Mục tiêu" (goals) map về TargetJob — chiến dịch kết bạn + bám đuổi. */
export async function listMarketingGoals(orgId: string) {
  const rows = await prisma.targetJob.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true, name: true, sourceType: true, status: true,
      sentCount: true, noZaloCount: true, failedCount: true,
      welcomedCount: true, followupSequenceId: true, followupEnrolledCount: true,
      lastSentAt: true, createdAt: true, updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    source: r.sourceType,
    status: r.status,
    stats: {
      sent: r.sentCount,
      noZalo: r.noZaloCount,
      failed: r.failedCount,
      welcomed: r.welcomedCount,
      followupEnrolled: r.followupEnrolledCount,
    },
    hasFollowup: r.followupSequenceId !== null,
    lastSentAt: iso(r.lastSentAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}

export async function listMarketingCareSessions(orgId: string) {
  const rows = await prisma.careSession.findMany({
    where: { orgId },
    orderBy: { openedAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true, contactId: true, nickId: true, ownerUserId: true, sourceType: true,
      state: true, closedReason: true, currentStepIdx: true, nextRunAt: true,
      lastSentAt: true, lastReplyAt: true, pausedUntil: true, lastError: true, openedAt: true, closedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    nickId: r.nickId,
    ownerUserId: r.ownerUserId,
    source: r.sourceType,
    state: r.state,
    closedReason: r.closedReason,
    currentStepIdx: r.currentStepIdx,
    nextRunAt: iso(r.nextRunAt),
    lastSentAt: iso(r.lastSentAt),
    lastReplyAt: iso(r.lastReplyAt),
    pausedUntil: iso(r.pausedUntil),
    lastError: r.lastError,
    openedAt: iso(r.openedAt),
    closedAt: iso(r.closedAt),
  }));
}

export async function listMarketingBroadcasts(orgId: string) {
  const rows = await prisma.broadcastJob.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true, name: true, sourceType: true, status: true, scheduleType: true,
      customerListId: true, zaloAccountId: true, maxPerRun: true,
      nextRunAt: true, lastRunAt: true, createdAt: true, updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    source: r.sourceType,
    status: r.status,
    scheduleType: r.scheduleType,
    customerListId: r.customerListId,
    zaloAccountId: r.zaloAccountId,
    maxPerRun: r.maxPerRun,
    nextRunAt: iso(r.nextRunAt),
    lastRunAt: iso(r.lastRunAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}

/**
 * Tag dự án của org — distinct `tagIds` đang dùng trên MessageTemplate.
 * Thay cho mảng PROJECT_TAGS hard-code (branding bất động sản) ở UI.
 * Org mới chưa có template → trả []; UI cho nhập free-form.
 */
export async function getMarketingProjectTags(orgId: string): Promise<string[]> {
  const rows = await prisma.messageTemplate.findMany({
    where: { orgId, archivedAt: null },
    select: { tagIds: true },
    take: 2000,
  });
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of r.tagIds) {
      const tag = (t ?? '').trim();
      if (tag) set.add(tag);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}
