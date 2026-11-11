/**
 * marketing-facade-service.test.ts — Facade đọc canonical Marketing (Phase 1, ADR-001).
 * Kiểm chứng BẤT BIẾN BẢO MẬT: mọi hàm facade lọc where.orgId tường minh và không
 * bao giờ query xuyên org. Mock prisma theo pattern chuẩn repo (không cần DB thật).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  customerList: { findMany: vi.fn(), count: vi.fn() },
  messageTemplate: { findMany: vi.fn(), count: vi.fn() },
  contentBlock: { findMany: vi.fn(), count: vi.fn() },
  automationSequence: { findMany: vi.fn(), count: vi.fn() },
  targetJob: { findMany: vi.fn(), count: vi.fn() },
  careSession: { findMany: vi.fn(), count: vi.fn() },
  broadcastJob: { findMany: vi.fn(), count: vi.fn() },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));

const svc = await import('../src/modules/marketing/marketing-facade-service.js');

const ORG = 'org-A';

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(prismaMock)) {
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(0);
  }
});

/** Lấy where của lần gọi findMany đầu tiên trên model. */
function whereOf(model: { findMany: ReturnType<typeof vi.fn> }): Record<string, unknown> {
  return model.findMany.mock.calls[0][0].where;
}

describe('marketing facade — org isolation', () => {
  it('listMarketingLists lọc theo orgId', async () => {
    await svc.listMarketingLists(ORG);
    expect(prismaMock.customerList.findMany).toHaveBeenCalledTimes(1);
    expect(whereOf(prismaMock.customerList).orgId).toBe(ORG);
  });

  it('listMarketingTemplates lọc theo orgId (và bỏ archived)', async () => {
    await svc.listMarketingTemplates(ORG);
    const where = whereOf(prismaMock.messageTemplate);
    expect(where.orgId).toBe(ORG);
    expect(where.archivedAt).toBeNull();
  });

  it('listMarketingBlocks lọc theo orgId', async () => {
    await svc.listMarketingBlocks(ORG);
    expect(whereOf(prismaMock.contentBlock).orgId).toBe(ORG);
  });

  it('listMarketingSequences lọc theo orgId', async () => {
    await svc.listMarketingSequences(ORG);
    expect(whereOf(prismaMock.automationSequence).orgId).toBe(ORG);
  });

  it('listMarketingGoals lọc theo orgId', async () => {
    await svc.listMarketingGoals(ORG);
    expect(whereOf(prismaMock.targetJob).orgId).toBe(ORG);
  });

  it('listMarketingCareSessions lọc theo orgId', async () => {
    await svc.listMarketingCareSessions(ORG);
    expect(whereOf(prismaMock.careSession).orgId).toBe(ORG);
  });

  it('listMarketingBroadcasts lọc theo orgId', async () => {
    await svc.listMarketingBroadcasts(ORG);
    expect(whereOf(prismaMock.broadcastJob).orgId).toBe(ORG);
  });

  it('getMarketingSummary đếm mọi domain đều kèm orgId', async () => {
    await svc.getMarketingSummary(ORG);
    const countedModels = [
      prismaMock.customerList, prismaMock.messageTemplate, prismaMock.contentBlock,
      prismaMock.automationSequence, prismaMock.targetJob, prismaMock.careSession,
      prismaMock.broadcastJob,
    ];
    for (const model of countedModels) {
      expect(model.count).toHaveBeenCalledTimes(1);
      expect(model.count.mock.calls[0][0].where.orgId).toBe(ORG);
    }
  });
});

describe('marketing facade — DTO & project tags', () => {
  it('getMarketingProjectTags trả distinct + sort, bỏ rỗng, lọc orgId', async () => {
    prismaMock.messageTemplate.findMany.mockResolvedValue([
      { tagIds: ['Beta', 'Alpha', ' '] },
      { tagIds: ['Alpha', 'Gamma', ''] },
    ]);
    const tags = await svc.getMarketingProjectTags(ORG);
    expect(whereOf(prismaMock.messageTemplate).orgId).toBe(ORG);
    expect(tags).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('listMarketingLists map counts + cờ archived đúng', async () => {
    prismaMock.customerList.findMany.mockResolvedValue([
      {
        id: 'l1', name: 'Tệp 1', iconEmoji: '📣', sourceType: 'paste', status: 'done',
        totalEntries: 10, validEntries: 8, invalidEntries: 2, hasZaloEntries: 5,
        noZaloEntries: 3, pendingLookupEntries: 0, archivedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    const [row] = await svc.listMarketingLists(ORG);
    expect(row.counts).toEqual({ total: 10, valid: 8, invalid: 2, hasZalo: 5, noZalo: 3, pendingLookup: 0 });
    expect(row.archived).toBe(true);
  });

  it('listMarketingGoals suy ra hasFollowup từ followupSequenceId', async () => {
    prismaMock.targetJob.findMany.mockResolvedValue([
      { id: 'g1', name: 'MT', sourceType: 'customer_list', status: 'active', sentCount: 1, noZaloCount: 0, failedCount: 0, welcomedCount: 0, followupSequenceId: 'seq-1', followupEnrolledCount: 2, lastSentAt: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'g2', name: 'MT2', sourceType: 'group_scan', status: 'done', sentCount: 0, noZaloCount: 0, failedCount: 0, welcomedCount: 0, followupSequenceId: null, followupEnrolledCount: 0, lastSentAt: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const goals = await svc.listMarketingGoals(ORG);
    expect(goals[0].hasFollowup).toBe(true);
    expect(goals[1].hasFollowup).toBe(false);
  });
});
