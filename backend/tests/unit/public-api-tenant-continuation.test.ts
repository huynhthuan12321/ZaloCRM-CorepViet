import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTenantContext } from '../../src/shared/tenant/tenant-context.js';
import { hashApiKey } from '../../src/shared/crypto/api-key-hash.js';
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: { appSetting: { findFirst } } }));
import { apiKeyAuth } from '../../src/modules/api/public-api-auth.js';

afterEach(() => vi.resetAllMocks());
async function fixture() {
  const app = Fastify();
  app.addHook('preHandler', apiKeyAuth);
  app.addHook('preHandler', async () => {
    await new Promise(resolve => setImmediate(resolve));
    expect(getTenantContext()?.bypassTenantGuard).toBe(false);
  });
  app.get('/context', async request => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { requestOrg: (request as any).orgId, context: getTenantContext() };
  });
  return app;
}
describe('Public API credential lookup and tenant continuation', () => {
  it('isolates concurrent keys and limits system bypass to the hashed credential lookup', async () => {
    findFirst.mockImplementation(async (args: any) => {
      expect(getTenantContext()).toMatchObject({ orgId: '*', bypassTenantGuard: true });
      expect(args.select).toEqual({ orgId: true });
      expect(args.where.settingKey).toBe('public_api_key');
      const orgId = args.where.valueHash === hashApiKey('fixture-a') ? 'a' : 'b';
      await new Promise(resolve => setTimeout(resolve, orgId === 'a' ? 7 : 1));
      return { orgId };
    });
    const app = await fixture();
    try {
      const results = await Promise.all(['a', 'b', 'a', 'b'].map(orgId => app.inject({
        url: '/context', headers: { 'x-api-key': `fixture-${orgId}` },
      })));
      results.forEach((response, i) => {
        const orgId = i % 2 ? 'b' : 'a';
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ requestOrg: orgId, context: {
          orgId, userId: 'public-api', role: 'api', bypassTenantGuard: false,
        } });
      });
      expect(getTenantContext()).toBeUndefined();
    } finally { await app.close(); }
  });
  it.each([undefined, '', '   '])('rejects missing or blank key %s before database access', async key => {
    const app = await fixture();
    try {
      const res = await app.inject({ url: '/context', headers: key === undefined ? {} : { 'x-api-key': key } });
      expect(res.statusCode).toBe(401);
      expect(findFirst).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it.each([null, { orgId: '' }, { orgId: '*' }])('rejects unknown key or invalid tenant %j', async result => {
    findFirst.mockResolvedValue(result);
    const app = await fixture();
    try {
      expect((await app.inject({ url: '/context', headers: { 'x-api-key': 'invalid-fixture' } })).statusCode).toBe(401);
      expect(getTenantContext()).toBeUndefined();
    } finally { await app.close(); }
  });
  it('passes database failures to Fastify without entering a business tenant', async () => {
    findFirst.mockRejectedValue(new Error('fixture database unavailable'));
    const app = await fixture();
    try {
      expect((await app.inject({ url: '/context', headers: { 'x-api-key': 'fixture-a' } })).statusCode).toBe(500);
      expect(getTenantContext()).toBeUndefined();
    } finally { await app.close(); }
  });
});
