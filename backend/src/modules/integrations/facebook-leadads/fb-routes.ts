/**
 * fb-routes.ts — Public webhook endpoint cho Facebook Lead Ads.
 *
 * Endpoints:
 *   GET  /api/v1/webhooks/fb-leadads — Meta subscription verify challenge
 *   POST /api/v1/webhooks/fb-leadads — webhook delivery (HMAC verify + outbox insert)
 *
 * KHÔNG dùng authMiddleware — public endpoint. Bảo mật qua HMAC SHA256 (Issue 1).
 *
 * Eng review:
 *   - Issue 1: raw body preserve qua addContentTypeParser
 *   - Issue 2: idempotency qua WebhookLog.externalLeadId unique
 *   - Issue 3: outbox pattern — return 200 ngay <50ms, không Graph API trong handler
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { parseFbWebhookPayload, verifyWebhook } from './fb-adapter.js';
import { recordIngestion } from '../_shared/webhook-log.service.js';
import { notifyWebhookPending } from '../_shared/outbox-worker.js';

export async function fbLeadAdsRoutes(app: FastifyInstance): Promise<void> {
  // ── Raw body parser cho HMAC verify (Issue 1) ────────────────────────────
  // Fastify default JSON parser ăn raw body trước handler thấy. Đăng ký parser
  // riêng cho POST /webhooks/fb-leadads để giữ Buffer raw.
  // KHÔNG dùng app.addContentTypeParser global vì ảnh hưởng routes khác.
  // Cách workaround: dùng config.rawBody trong handler.

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    // Chỉ apply cho route /webhooks/fb-leadads — check qua req.url
    if (req.url === '/api/v1/webhooks/fb-leadads' && req.method === 'POST') {
      // Lưu raw buffer + parse JSON luôn (cho handler dùng cả 2)
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        const parsed = JSON.parse((body as Buffer).toString('utf8'));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    } else {
      // Other routes: default JSON parse
      try {
        const parsed = JSON.parse((body as Buffer).toString('utf8'));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  });

  // ── GET — Meta subscription verify challenge ─────────────────────────────
  // Meta gọi: GET /api/v1/webhooks/fb-leadads?hub.mode=subscribe&hub.challenge=XXX&hub.verify_token=YYY
  // CRM check verify_token match → trả lại challenge plain text.
  app.get('/api/v1/webhooks/fb-leadads', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string>;
    if (q['hub.mode'] !== 'subscribe') return reply.status(400).send('Bad mode');

    const verifyToken = q['hub.verify_token'];
    const challenge = q['hub.challenge'];

    // Lookup verifyToken trong FacebookPageAccount
    const page = await prisma.facebookPageAccount.findFirst({
      where: { webhookVerifyToken: verifyToken, isActive: true },
      select: { id: true, pageId: true },
    });
    if (!page) {
      logger.warn(`[fb-routes] Subscription verify failed — unknown verify_token`);
      return reply.status(403).send('Forbidden');
    }
    logger.info(`[fb-routes] Subscription verified for page ${page.pageId}`);
    return reply.type('text/plain').send(challenge);
  });

  // ── POST — webhook delivery ──────────────────────────────────────────────
  app.post('/api/v1/webhooks/fb-leadads', async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;

    if (!rawBody) {
      logger.error('[fb-routes] rawBody missing — parser misconfig');
      return reply.status(500).send({ error: 'Internal parser error' });
    }

    // Verify HMAC (Issue 1). App secret từ env (Phase 1 single-app shared all orgs).
    const appSecret = process.env.FB_APP_SECRET;
    if (!appSecret) {
      logger.error('[fb-routes] FB_APP_SECRET env missing');
      return reply.status(500).send({ error: 'App not configured' });
    }
    if (!verifyWebhook(rawBody, signature, appSecret)) {
      logger.warn(`[fb-routes] HMAC verify FAILED — possible spoof. signature=${signature?.slice(0, 20)}...`);
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // Parse leads from payload
    let leads;
    try {
      leads = parseFbWebhookPayload(request.body);
    } catch (err) {
      logger.error('[fb-routes] Parse error:', err);
      return reply.status(400).send({ error: 'Invalid payload shape' });
    }

    if (leads.length === 0) {
      // Có thể là ping/test webhook không có lead — return 200
      return reply.status(200).send({ ok: true, message: 'No leads in payload' });
    }

    // For each lead: lookup orgId via pageId + insert WebhookLog (idempotent)
    let inserted = 0;
    let duplicates = 0;
    for (const lead of leads) {
      const page = await prisma.facebookPageAccount.findUnique({
        where: { pageId: lead.pageId },
        select: { orgId: true },
      });
      if (!page) {
        logger.warn(`[fb-routes] Lead from unknown page ${lead.pageId} — skipping`);
        continue;
      }
      const result = await recordIngestion({
        source: 'fb-leadads',
        externalLeadId: lead.leadgenId,
        rawBody: request.body,
        signature,
        orgId: page.orgId,
      });
      if (result.isFirst) inserted++;
      else duplicates++;
    }

    // Trigger worker via NOTIFY (Issue 13)
    if (inserted > 0) void notifyWebhookPending();

    const ms = Date.now() - start;
    logger.info(`[fb-routes] Webhook OK in ${ms}ms — ${inserted} new, ${duplicates} duplicates`);
    return reply.status(200).send({ ok: true, inserted, duplicates });
  });
}
