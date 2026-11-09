import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import { hashApiKey } from '../../shared/crypto/api-key-hash.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';

export function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    void reply.status(401).send({ error: 'API key required' });
    return;
  }

  // Only the credential lookup crosses tenants, before the key's org is known.
  void runSystemQuery(() => prisma.appSetting.findFirst({
    where: { settingKey: 'public_api_key', valueHash: hashApiKey(apiKey) },
    select: { orgId: true },
  })).then(setting => {
    if (!setting?.orgId?.trim() || setting.orgId === '*') {
      void reply.status(401).send({ error: 'Invalid API key' });
      return;
    }
    (request as FastifyRequest & { orgId: string }).orgId = setting.orgId;
    // Fastify's continuation must be created inside the tenant scope, as in JWT auth.
    return withTenant(setting.orgId, async () => { done(); }, {
      userId: 'public-api', role: 'api',
    });
  }).catch(done);
}
