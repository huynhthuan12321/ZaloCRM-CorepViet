/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { mergeContacts } from './merge-service.js';
import { runContactIntelligence } from './contact-intelligence.js';
import { runAutomationRules } from '../automation/automation-service.js';
import { backfillContactAggregates, backfillFriendsFromHistory } from './contact-aggregate.js';
import { zaloPool } from '../zalo/zalo-pool.js';

type QueryParams = Record<string, string>;

/**
 * Pick only fields the user is allowed to write on a Contact.
 * Excludes system-managed aggregates (last*, total*, hasZalo,
 * zaloLookup*, importBatchId, consentRevokedAt) which are set by
 * background services, never the user.
 *
 * Uses `in` check so a key explicitly set to null updates to null,
 * but missing keys are left untouched (Prisma `undefined` semantic).
 */
function pickWritableContactFields(body: Record<string, any>): Record<string, any> {
  const d: Record<string, any> = {};

  // Identification
  if ('fullName' in body) d.fullName = body.fullName;
  if ('crmName' in body) d.crmName = body.crmName;
  if ('phone' in body) d.phone = body.phone;
  if ('phone2' in body) d.phone2 = body.phone2;
  if ('phone3' in body) d.phone3 = body.phone3;
  if ('phonesExtra' in body) d.phonesExtra = body.phonesExtra;
  if ('email' in body) d.email = body.email;
  if ('avatarUrl' in body) d.avatarUrl = body.avatarUrl;
  if ('zaloUid' in body) d.zaloUid = body.zaloUid;

  // CRM workflow
  if ('source' in body) d.source = body.source;
  if ('sourceDate' in body) d.sourceDate = body.sourceDate ? new Date(body.sourceDate) : null;
  if ('firstContactDate' in body) d.firstContactDate = body.firstContactDate ? new Date(body.firstContactDate) : null;
  if ('status' in body) d.status = body.status;
  if ('nextAppointment' in body) d.nextAppointment = body.nextAppointment ? new Date(body.nextAppointment) : null;
  if ('assignedUserId' in body) d.assignedUserId = body.assignedUserId;
  if ('notes' in body) d.notes = body.notes;
  if ('tags' in body) d.tags = body.tags;
  if ('metadata' in body) d.metadata = body.metadata;

  // Demographic / personal
  if ('gender' in body) d.gender = body.gender;
  if ('birthYear' in body) {
    d.birthYear = body.birthYear === null || body.birthYear === ''
      ? null
      : parseInt(String(body.birthYear), 10);
  }
  if ('birthDate' in body) d.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  if ('occupation' in body) d.occupation = body.occupation;
  if ('incomeRange' in body) d.incomeRange = body.incomeRange;
  if ('socialFacebook' in body) d.socialFacebook = body.socialFacebook;
  if ('socialTiktok' in body) d.socialTiktok = body.socialTiktok;
  if ('preferredLang' in body) d.preferredLang = body.preferredLang;

  // Address
  if ('province' in body) d.province = body.province;
  if ('district' in body) d.district = body.district;
  if ('ward' in body) d.ward = body.ward;
  if ('addressLine' in body) d.addressLine = body.addressLine;

  // Consent (revoke/restore is allowed; revokedAt is system-set)
  if ('consentStatus' in body) d.consentStatus = body.consentStatus;
  if ('consentSource' in body) d.consentSource = body.consentSource;

  return d;
}

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts — list with filters and pagination ───────────────
  app.get('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const {
        page = '1',
        limit = '50',
        search = '',
        source = '',
        status = '',
        assignedUserId = '',
      } = request.query as QueryParams;

      const where: any = { orgId: user.orgId, mergedInto: null };
      if (source) where.source = source;
      if (status) where.status = status;
      if (assignedUserId) where.assignedUserId = assignedUserId;
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { crmName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            _count: { select: { conversations: true, appointments: true } },
          },
          orderBy: { updatedAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.contact.count({ where }),
      ]);

      return { contacts, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[contacts] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  // ── GET /api/v1/contacts/pipeline — kanban grouped by generic status ──────
  app.get('/api/v1/contacts/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const orgId = user.orgId;

      const pipeline = await prisma.contact.groupBy({
        by: ['status'],
        where: { orgId, status: { not: null }, mergedInto: null },
        _count: true,
      });

      // Fetch contacts per status for kanban cards (limit 20 per column)
      const statuses = pipeline.map((g) => g.status ?? 'unknown');
      const contactsByStatus: Record<string, any[]> = {};

      await Promise.all(
        statuses.map(async (st) => {
          const where: any = { orgId, status: st ?? null, mergedInto: null };
          const contacts = await prisma.contact.findMany({
            where,
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              avatarUrl: true,
              status: true,
              nextAppointment: true,
              assignedUser: { select: { id: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 20,
          });
          contactsByStatus[st ?? 'unknown'] = contacts;
        }),
      );

      const result = pipeline.map((g) => ({
        status: g.status ?? 'unknown',
        count: g._count,
        contacts: contactsByStatus[g.status ?? 'unknown'] ?? [],
      }));

      return { pipeline: result };
    } catch (err) {
      logger.error('[contacts] Pipeline error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline' });
    }
  });

  // ── GET /api/v1/contacts/:id/account-activity ─────────────────────────────
  // Per-Zalo-account activity summary for a contact: last inbound/outbound
  // message + counters. Only accounts with at least one message are returned,
  // sorted by most recent activity desc.
  app.get('/api/v1/contacts/:id/account-activity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const conversations = await prisma.conversation.findMany({
        where: { contactId: id, threadType: 'user' },
        select: {
          id: true,
          zaloAccountId: true,
          zaloAccount: { select: { id: true, displayName: true, phone: true, avatarUrl: true } },
        },
      });

      const items = await Promise.all(
        conversations.map(async (conv) => {
          const [counts, lastIn, lastOut] = await Promise.all([
            prisma.message.groupBy({
              by: ['senderType'],
              where: { conversationId: conv.id, isDeleted: false },
              _count: true,
            }),
            prisma.message.findFirst({
              where: { conversationId: conv.id, senderType: 'contact', isDeleted: false },
              orderBy: { sentAt: 'desc' },
              select: { id: true, content: true, contentType: true, sentAt: true },
            }),
            prisma.message.findFirst({
              where: { conversationId: conv.id, senderType: 'self', isDeleted: false },
              orderBy: { sentAt: 'desc' },
              select: {
                id: true, content: true, contentType: true, sentAt: true,
                repliedByUserId: true,
                repliedBy: { select: { id: true, fullName: true } },
              },
            }),
          ]);

          if (!lastIn && !lastOut) return null;

          return {
            zaloAccountId: conv.zaloAccountId,
            zaloAccount: conv.zaloAccount,
            conversationId: conv.id,
            totalInbound: counts.find((c) => c.senderType === 'contact')?._count ?? 0,
            totalOutbound: counts.find((c) => c.senderType === 'self')?._count ?? 0,
            lastInbound: lastIn,
            lastOutbound: lastOut,
          };
        }),
      );

      const filtered = items.filter((x): x is NonNullable<typeof x> => x !== null);
      filtered.sort((a, b) => {
        const ta = Math.max(
          a.lastInbound?.sentAt.getTime() ?? 0,
          a.lastOutbound?.sentAt.getTime() ?? 0,
        );
        const tb = Math.max(
          b.lastInbound?.sentAt.getTime() ?? 0,
          b.lastOutbound?.sentAt.getTime() ?? 0,
        );
        return tb - ta;
      });

      return { items: filtered };
    } catch (err) {
      logger.error('[contacts] Account activity error:', err);
      return reply.status(500).send({ error: 'Failed to fetch account activity' });
    }
  });

  // ── GET /api/v1/contacts/:id — detail with appointments + conversation count
  app.get('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      return contact;
    } catch (err) {
      logger.error('[contacts] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  // ── POST /api/v1/contacts/:id/sync-zalo-profile ────────────────────────────
  // Pull profile (gender/birthDate/phone/avatar) from Zalo SDK via getUserInfo
  // và cập nhật Contact những field đang null. Tận dụng bất kỳ nick Zalo nào
  // đang connected trong org.
  app.post('/api/v1/contacts/:id/sync-zalo-profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const contact = await prisma.contact.findFirst({ where: { id, orgId: user.orgId } });
    if (!contact) return reply.status(404).send({ error: 'Contact not found' });
    if (!contact.zaloUid) return reply.status(400).send({ error: 'Contact missing zaloUid' });

    // Tìm nick Zalo đang connected để dùng API
    const accounts = await prisma.zaloAccount.findMany({
      where: { orgId: user.orgId, status: 'connected' },
      select: { id: true },
    });
    let profile: Record<string, unknown> | null = null;
    for (const acc of accounts) {
      const instance = zaloPool.getInstance(acc.id);
      if (!instance?.api?.getUserInfo) continue;
      try {
        const result = await instance.api.getUserInfo(contact.zaloUid);
        const profiles = result?.changed_profiles || {};
        profile = profiles[contact.zaloUid] || profiles[`${contact.zaloUid}_0`] || null;
        if (profile) break;
      } catch (err) {
        logger.warn(`[sync-profile] account ${acc.id} getUserInfo failed:`, err);
      }
    }
    if (!profile) return reply.status(404).send({ error: 'Profile not found on Zalo' });

    // Extract + map fields. Chỉ update nếu field hiện đang null/empty.
    const updates: Record<string, unknown> = {};
    const gender = profile.gender;
    if (contact.gender == null && gender != null) {
      updates.gender = Number(gender) === 1 ? 'female' : 'male';
    }
    const phoneNumber = String(profile.phoneNumber || '').trim();
    if (!contact.phone && phoneNumber) {
      updates.phone = phoneNumber;
    }
    const sdob = String(profile.sdob || '');
    const dobTs = Number(profile.dob || 0);
    if (!contact.birthDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(sdob) && !sdob.startsWith('0000')) {
        updates.birthDate = new Date(sdob + 'T00:00:00Z');
      } else if (dobTs && Number.isFinite(dobTs) && dobTs > 0) {
        const ms = dobTs > 10_000_000_000 ? dobTs : dobTs * 1000;
        updates.birthDate = new Date(ms);
      }
    }
    const avatar = String(profile.avatar || '');
    if (!contact.avatarUrl && avatar) updates.avatarUrl = avatar;
    const zaloName = String(profile.zaloName || profile.zalo_name || profile.displayName || '');
    if ((!contact.fullName || contact.fullName === 'Unknown') && zaloName) {
      updates.fullName = zaloName;
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, updated: false, profile, contact };
    }

    const updatedContact = await prisma.contact.update({
      where: { id },
      data: updates,
    });
    return { success: true, updated: true, updates: Object.keys(updates), contact: updatedContact };
  });

  // ── POST /api/v1/contacts — create new contact ────────────────────────────
  app.post('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;

      const contact = await prisma.contact.create({
        data: {
          orgId: user.orgId,
          ...pickWritableContactFields(body),
          tags: body.tags ?? [],
          metadata: body.metadata ?? {},
        },
      });

      const org = await prisma.organization.findUnique({
        where: { id: user.orgId },
        select: { id: true, name: true },
      });
      void runAutomationRules({
        trigger: 'contact_created',
        orgId: user.orgId,
        org,
        contact: {
          id: contact.id,
          fullName: contact.fullName,
          phone: contact.phone,
          status: contact.status,
          source: contact.source,
          assignedUserId: contact.assignedUserId,
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[contacts] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id — update CRM fields ─────────────────────────
  app.put('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const existing = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, status: true, fullName: true, phone: true, source: true, assignedUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      const updateData = pickWritableContactFields(body);

      const updated = await prisma.contact.update({
        where: { id },
        data: updateData,
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (existing.status !== updated.status) {
        const org = await prisma.organization.findUnique({
          where: { id: user.orgId },
          select: { id: true, name: true },
        });
        void runAutomationRules({
          trigger: 'status_changed',
          orgId: user.orgId,
          org,
          contact: {
            id: updated.id,
            fullName: updated.fullName,
            phone: updated.phone,
            status: updated.status,
            source: updated.source,
            assignedUserId: updated.assignedUserId,
          },
        });
      }

      return updated;
    } catch (err) {
      logger.error('[contacts] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id/tags — update tags only ─────────────────────
  app.put('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { tags } = request.body as { tags: string[] };

      if (!Array.isArray(tags)) return reply.status(400).send({ error: 'tags must be an array' });

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      const updated = await prisma.contact.update({ where: { id }, data: { tags } });
      return updated;
    } catch (err) {
      logger.error('[contacts] Update tags error:', err);
      return reply.status(500).send({ error: 'Failed to update tags' });
    }
  });

  // ── POST /api/v1/contacts/admin/backfill-aggregates — recompute lastInbound/Outbound + counters ──
  app.post('/api/v1/contacts/admin/backfill-aggregates', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (user.role !== 'owner' && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Owner/admin only' });
    }
    try {
      const messages = await backfillContactAggregates(user.orgId);
      const friends  = await backfillFriendsFromHistory(user.orgId);
      logger.info(`[contacts] Backfill done for org=${user.orgId}: msgs=${JSON.stringify(messages)} friends=${JSON.stringify(friends)}`);
      return { messages, friends };
    } catch (err) {
      logger.error('[contacts] Backfill error:', err);
      return reply.status(500).send({ error: 'Backfill failed' });
    }
  });

  // ── DELETE /api/v1/contacts/:id ───────────────────────────────────────────
  app.delete('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      await prisma.contact.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[contacts] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete contact' });
    }
  });

  // ── GET /api/v1/contacts/duplicates — list unresolved duplicate groups ────
  app.get('/api/v1/contacts/duplicates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { page = '1', limit = '20', resolved = 'false' } = request.query as QueryParams;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const where = { orgId: user.orgId, resolved: resolved === 'true' };

      const [groups, total] = await Promise.all([
        prisma.duplicateGroup.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.duplicateGroup.count({ where }),
      ]);

      // Expand contact data for each group
      const expanded = await Promise.all(
        groups.map(async (group) => {
          const contacts = await prisma.contact.findMany({
            where: { id: { in: group.contactIds } },
            select: {
              id: true, fullName: true, phone: true, email: true,
              zaloUid: true, avatarUrl: true, source: true, status: true,
              tags: true, createdAt: true, leadScore: true, lastActivity: true,
            },
          });
          return { ...group, contacts };
        }),
      );

      return { groups: expanded, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[contacts] Duplicates list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch duplicate groups' });
    }
  });

  // ── POST /api/v1/contacts/duplicates/:groupId/merge — merge a group ──────
  app.post('/api/v1/contacts/duplicates/:groupId/merge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { groupId } = request.params as { groupId: string };
      const { primaryContactId } = request.body as { primaryContactId: string };

      if (!primaryContactId) return reply.status(400).send({ error: 'primaryContactId is required' });

      const group = await prisma.duplicateGroup.findFirst({
        where: { id: groupId, orgId: user.orgId, resolved: false },
      });
      if (!group) return reply.status(404).send({ error: 'Duplicate group not found' });

      const secondaryIds = group.contactIds.filter((id) => id !== primaryContactId);
      if (secondaryIds.length === 0) return reply.status(400).send({ error: 'Primary must be in the group' });

      const merged = await mergeContacts(user.orgId, user.id, primaryContactId, secondaryIds);

      // Resolve the group
      await prisma.duplicateGroup.update({ where: { id: groupId }, data: { resolved: true } });

      return merged;
    } catch (err: any) {
      logger.error('[contacts] Merge error:', err);
      return reply.status(400).send({ error: err.message || 'Failed to merge contacts' });
    }
  });

  // ── POST /api/v1/contacts/intelligence/recompute — manual trigger ────────
  app.post('/api/v1/contacts/intelligence/recompute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Fire and forget — return 202 immediately
      runContactIntelligence().catch((err) => {
        logger.error('[contacts] Recompute error:', err);
      });
      return reply.status(202).send({ message: 'Intelligence recompute started' });
    } catch (err) {
      logger.error('[contacts] Recompute trigger error:', err);
      return reply.status(500).send({ error: 'Failed to start recompute' });
    }
  });
}
