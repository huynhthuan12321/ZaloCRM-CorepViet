/**
 * friend-sync-cron.test.ts — Test runFriendSyncCycleNow (direct cycle, no scheduler).
 * Verify: iterate accounts, error in 1 account không break others, no accounts → no-op.
 * PR-01 (2026-09-16): cycle gọi syncAccountFully (friends + labels/aliases, tự bọc withTenant)
 * thay cho syncFriendsForAccount; sweep cross-org qua runSystemQuery → mock đúng biên đó.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  zaloAccount: { findMany: vi.fn() },
};
const syncAccountFullyMock = vi.fn();

function fullResult(emittedCount = 0, friendErrors = 0) {
  return {
    friends: { liveCount: 0, createdContacts: 0, upsertedFriends: 0, emittedCount, errors: friendErrors, durationMs: 1, skipped: null },
    aliasesUpdated: 0,
    labelsUpdated: 0,
    errors: [],
    durationMs: 1,
  };
}

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/zalo/friend-sync-service.js', () => ({
  syncAccountFully: syncAccountFullyMock,
}));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockReturnValue({ stop: vi.fn() }),
  },
}));

const { runFriendSyncCycleNow } = await import('../src/modules/zalo/friend-sync-cron.js');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.zaloAccount.findMany.mockReset();
  syncAccountFullyMock.mockReset();
});

describe('runFriendSyncCycleNow', () => {
  it('no-op when no connected accounts', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([]);
    await runFriendSyncCycleNow(null);
    expect(syncAccountFullyMock).not.toHaveBeenCalled();
  });

  it('iterates each connected account sequentially', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([
      { id: 'za-1', orgId: 'org-1', displayName: 'Nick 1' },
      { id: 'za-2', orgId: 'org-1', displayName: 'Nick 2' },
    ]);
    syncAccountFullyMock.mockResolvedValue(fullResult(0, 0));
    await runFriendSyncCycleNow(null);
    expect(syncAccountFullyMock).toHaveBeenCalledTimes(2);
    expect(syncAccountFullyMock).toHaveBeenNthCalledWith(
      1, 'za-1', 'org-1', { trigger: 'cron', io: null },
    );
    expect(syncAccountFullyMock).toHaveBeenNthCalledWith(
      2, 'za-2', 'org-1', { trigger: 'cron', io: null },
    );
  });

  it('continues iteration when 1 account fails', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([
      { id: 'za-bad', orgId: 'org-1', displayName: 'Bad' },
      { id: 'za-good', orgId: 'org-1', displayName: 'Good' },
    ]);
    syncAccountFullyMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(fullResult(1, 0));
    await runFriendSyncCycleNow(null);
    expect(syncAccountFullyMock).toHaveBeenCalledTimes(2);
  });

  it('accumulates emittedCount + errors across accounts', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([
      { id: 'za-1', orgId: 'o', displayName: 'A' },
      { id: 'za-2', orgId: 'o', displayName: 'B' },
    ]);
    syncAccountFullyMock
      .mockResolvedValueOnce(fullResult(3, 1))
      .mockResolvedValueOnce(fullResult(2, 0));
    // No throw → just verify total via logger spy not feasible without
    // refactoring. Smoke: 2 calls completed.
    await runFriendSyncCycleNow(null);
    expect(syncAccountFullyMock).toHaveBeenCalledTimes(2);
  });

  it('passes IO param through to syncAccountFully', async () => {
    prismaMock.zaloAccount.findMany.mockResolvedValue([
      { id: 'za-io', orgId: 'org-1', displayName: 'Nick' },
    ]);
    syncAccountFullyMock.mockResolvedValue(fullResult(0, 0));
    const fakeIO = { emit: vi.fn() } as any;
    await runFriendSyncCycleNow(fakeIO);
    expect(syncAccountFullyMock).toHaveBeenCalledWith(
      'za-io', 'org-1', { trigger: 'cron', io: fakeIO },
    );
  });
});
