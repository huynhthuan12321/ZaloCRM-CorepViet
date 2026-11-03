import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantContext, requireTenantContext } from '../../src/shared/tenant/tenant-context.js';
const mocks = vi.hoisted(() => ({
  organization: { findMany: vi.fn(async () => [{id:'X'},{id:'Y'}]) },
  appointment: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  zaloAccount: { findMany: vi.fn() },
  zaloAccountStatusLog: { findFirst: vi.fn(), create: vi.fn() },
  schedules: [] as Array<() => Promise<void>>,
  errors: vi.fn(),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: mocks }));
vi.mock('node-cron', () => ({ default: { schedule: (_: string, callback: () => Promise<void>) => { mocks.schedules.push(callback); } } }));
vi.mock('../../src/shared/utils/logger.js', () => ({ logger: { info: vi.fn(), error: mocks.errors } }));
import { forEachOrganization } from '../../src/shared/tenant/for-each-organization.js';
import { startAppointmentReminder } from '../../src/modules/contacts/appointment-reminder.js';
import { backfillStatusLog } from '../../src/modules/zalo/status-log-backfill.js';

beforeEach(() => {
  vi.clearAllMocks(); mocks.schedules.length=0;
  mocks.organization.findMany.mockResolvedValue([{id:'X'},{id:'Y'}]);
  mocks.appointment.findMany.mockImplementation(async (args: any) => {
    expect(args.where.orgId).toBe(requireTenantContext().orgId);
    return [];
  });
  mocks.appointment.updateMany.mockImplementation(async (args: any) => {
    expect(args.where.orgId).toBe(requireTenantContext().orgId);
    return {count:1};
  });
});
describe('RC2 jobs use explicit tenant context', () => {
  it('preserves X/Y context across awaits and concurrent sweeps without bypass', async () => {
    const seen: string[]=[];
    await Promise.all([1,2].map(() => forEachOrganization(async id => {
      await new Promise(resolve => setTimeout(resolve, id==='X'?2:0));
      expect(requireTenantContext()).toMatchObject({orgId:id,bypassTenantGuard:false});
      seen.push(id);
    })));
    expect(seen.sort()).toEqual(['X','X','Y','Y']);
    expect(getTenantContext()).toBeUndefined();
    expect(() => requireTenantContext()).toThrow();
  });
  it('propagates a failed organization rather than reporting successful sweep', async () => {
    await expect(forEachOrganization(async () => {throw new Error('job failed');})).rejects.toThrow('job failed');
    expect(getTenantContext()).toBeUndefined();
  });
  it('runs overdue, daily reminder and action selection for each org without starting real timers or providers', async () => {
    startAppointmentReminder({to:vi.fn()} as any);
    await vi.waitFor(() => expect(mocks.appointment.updateMany).toHaveBeenCalledTimes(2));
    for(const callback of mocks.schedules) await callback();
    expect(mocks.appointment.updateMany).toHaveBeenCalledTimes(4);
    expect(mocks.appointment.findMany).toHaveBeenCalledTimes(4);
    expect(mocks.errors).not.toHaveBeenCalled();
  });
  it('backfills only accounts and logs belonging to current org', async () => {
    mocks.zaloAccount.findMany.mockImplementation(async (args:any) => {
      const orgId=requireTenantContext().orgId;
      expect(args.where).toEqual({orgId});
      return [{id:orgId+'-nick',orgId,status:'connected',createdAt:new Date(),lastConnectedAt:null}];
    });
    mocks.zaloAccountStatusLog.findFirst.mockImplementation(async (args:any) => {
      expect(args.where.orgId).toBe(requireTenantContext().orgId); return null;
    });
    mocks.zaloAccountStatusLog.create.mockImplementation(async (args:any) => {
      expect(args.data.orgId).toBe(requireTenantContext().orgId); return {};
    });
    expect(await backfillStatusLog()).toEqual({totalAccounts:2,backfilled:2,skipped:0});
  });
});
