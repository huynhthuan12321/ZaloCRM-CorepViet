import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: {} }));
import { authMiddleware } from '../../src/modules/auth/auth-middleware.js';
import { getTenantContext } from '../../src/shared/tenant/tenant-context.js';

describe('JWT tenant context across Fastify continuation', () => {
  it('keeps concurrent tenants isolated across hooks, awaits and the route', async () => {
    const app = Fastify();
    await app.register(jwt, { secret: 'local-unit-fixture-key-not-a-real-secret' });
    app.get('/context', { preHandler: [authMiddleware, async request => {
      await new Promise(resolve => setImmediate(resolve));
      expect(getTenantContext()?.orgId).toBe(request.user.orgId);
    }] }, async request => {
      await new Promise(resolve => setTimeout(resolve, request.user.orgId === 'a' ? 10 : 1));
      return { tenant: getTenantContext()?.orgId, user: getTenantContext()?.userId };
    });
    try {
      const results = await Promise.all(['a', 'b', 'a', 'b'].map(orgId => app.inject({
        url: '/context', headers: { authorization: `Bearer ${app.jwt.sign({ id: `u-${orgId}`, orgId, role: 'member', typ: 'access' })}` },
      })));
      results.forEach((response, index) => {
        const orgId = index % 2 === 0 ? 'a' : 'b';
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ tenant: orgId, user: `u-${orgId}` });
      });
      expect(getTenantContext()).toBeUndefined();
      expect((await app.inject('/context')).statusCode).toBe(401);
    } finally { await app.close(); }
  });
});
