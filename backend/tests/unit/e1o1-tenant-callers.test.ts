import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTenantContext } from '../../src/shared/tenant/tenant-context.js';

const db = vi.hoisted(() => ({
  groupScan: { findUnique: vi.fn(), update: vi.fn() },
  telegramUserLink: { upsert: vi.fn(), findUnique: vi.fn() },
  appointmentActionLink: { findUnique: vi.fn() },
  appointment: { findFirst: vi.fn(), update: vi.fn() },
}));
const service = vi.hoisted(() => ({ signActionToken: vi.fn(), verifyActionToken: vi.fn(), removeAppointmentReminder: vi.fn() }));
const provider = vi.hoisted(() => ({ getGroupInfo: vi.fn() }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: db }));
vi.mock('../../src/shared/zalo-operations.js', () => ({ zaloOps: provider }));
vi.mock('../../src/shared/utils/logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/modules/contacts/appointment-zalo-service.js', () => service);
import { processGroupScan } from '../../src/modules/zalo/group-scan-worker.js';
import { generateLinkCode, redeemLinkCode, getLinkedUser } from '../../src/modules/integrations/providers/telegram-bridge/link.js';
import { appointmentPublicRoutes } from '../../src/modules/contacts/appointment-public-routes.js';

describe('E-1 tenant context compatibility (mock tests, no provider calls)', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('locates a trusted scan in system context then runs its work within its own org', async () => {
    db.groupScan.findUnique.mockImplementation(async ({ select }) => {
      expect(getTenantContext()).toMatchObject(select ? { bypassTenantGuard: true } : { orgId: 'org-x', bypassTenantGuard: false });
      return select ? { orgId: 'org-x' } : { orgId: 'org-x', zaloAccountId: 'nick-x', groupIds: [] };
    });
    db.groupScan.update.mockImplementation(async () => {
      expect(getTenantContext()).toMatchObject({ orgId: 'org-x', bypassTenantGuard: false });
      return {};
    });
    await processGroupScan('scan-x');
    expect(db.groupScan.findUnique).toHaveBeenCalledTimes(2);
    expect(db.groupScan.update).toHaveBeenCalledTimes(2);
    expect(provider.getGroupInfo).not.toHaveBeenCalled();
    expect(getTenantContext()).toBeUndefined();
  });

  it('missing scan performs no work and leaks no context', async () => {
    db.groupScan.findUnique.mockResolvedValue(null);
    await processGroupScan('missing');
    expect(db.groupScan.update).not.toHaveBeenCalled();
    expect(getTenantContext()).toBeUndefined();
  });

  it('one-time Telegram identity bootstrap remains explicit and scoped to that identity', async () => {
    db.telegramUserLink.upsert.mockImplementation(async (args) => {
      expect(getTenantContext()?.bypassTenantGuard).toBe(true);
      expect(args).toMatchObject({ where: { telegramUserId: 'fake-telegram' }, create: { orgId: 'org-x', userId: 'user-x' } });
      return {};
    });
    db.telegramUserLink.findUnique.mockImplementation(async (args) => {
      expect(getTenantContext()?.bypassTenantGuard).toBe(true);
      expect(args.where).toEqual({ telegramUserId: 'fake-telegram' });
      return { userId: 'user-x', orgId: 'org-x' };
    });
    const code = generateLinkCode('user-x', 'org-x');
    expect(await redeemLinkCode(code, 'fake-telegram')).toBe(true);
    expect(await redeemLinkCode(code, 'fake-telegram')).toBe(false);
    expect(await redeemLinkCode('invalid-code', 'fake-telegram')).toBe(false);
    expect(db.telegramUserLink.upsert).toHaveBeenCalledTimes(1);
    expect(await getLinkedUser('fake-telegram')).toEqual({ userId: 'user-x', orgId: 'org-x' });
    expect(getTenantContext()).toBeUndefined();
  });

  async function routes() {
    const handlers: Record<string, any> = {};
    await appointmentPublicRoutes({ get: (p: string, h: any) => { handlers[`GET ${p}`] = h; }, post: (p: string, h: any) => { handlers[`POST ${p}`] = h; } } as any);
    return handlers;
  }
  const reply = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn(), redirect: vi.fn() });

  it('short-link lookup uses a capability bootstrap and preserves expiry', async () => {
    const handlers = await routes();
    db.appointmentActionLink.findUnique.mockImplementation(async ({ where }) => {
      expect(getTenantContext()?.bypassTenantGuard).toBe(true);
      expect(where).toEqual({ code: 'fake-link' });
      return { appointmentId: 'appt-x', userId: 'user-x', orgId: 'org-x', expiresAt: new Date(Date.now() + 50000) };
    });
    service.signActionToken.mockReturnValue('synthetic-signed-token');
    const res = reply();
    await handlers['GET /a/:code']({ params: { code: 'fake-link' } }, res);
    expect(res.redirect).toHaveBeenCalledWith('/appointments/action?t=synthetic-signed-token', 302);
    db.appointmentActionLink.findUnique.mockResolvedValue({ expiresAt: new Date(0) });
    await handlers['GET /a/:code']({ params: { code: 'fake-link' } }, res);
    expect(res.redirect).toHaveBeenLastCalledWith('/appointments/action?t=expired', 302);
    expect(service.signActionToken).toHaveBeenCalledTimes(1);
  });

  it('verified appointment capability uses its tenant for reads, updates and reminder cleanup', async () => {
    const handlers = await routes();
    service.verifyActionToken.mockReturnValue({ a: 'appt-x', u: 'user-x', o: 'org-x' });
    db.appointment.findFirst.mockImplementation(async ({ where }) => {
      expect(getTenantContext()).toMatchObject({ orgId: 'org-x', bypassTenantGuard: false });
      expect(where).toEqual({ id: 'appt-x', orgId: 'org-x' });
      return { id: 'appt-x', status: 'pending' };
    });
    db.appointment.update.mockImplementation(async () => { expect(getTenantContext()?.orgId).toBe('org-x'); return {}; });
    service.removeAppointmentReminder.mockImplementation(async () => { expect(getTenantContext()?.orgId).toBe('org-x'); });
    expect(await handlers['GET /api/public/appointments/action']({ query: { t: 'valid' } }, reply())).toMatchObject({ id: 'appt-x' });
    expect(await handlers['POST /api/public/appointments/action']({ body: { token: 'valid', action: 'completed' } }, reply())).toEqual({ ok: true, status: 'completed' });
    expect(db.appointment.update).toHaveBeenCalledTimes(1);
    expect(getTenantContext()).toBeUndefined();
    service.verifyActionToken.mockReturnValue(null);
    const res = reply();
    await handlers['POST /api/public/appointments/action']({ body: { token: 'invalid', action: 'completed' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.appointment.update).toHaveBeenCalledTimes(1);
  });
});
