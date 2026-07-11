// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
/**
 * Community fallback routes for the Follow-up tab.
 *
 * The full automation engine lives in the optional extension bundle. These
 * routes keep the chat follow-up UI usable in Community builds by backing
 * manual watch / manual sequence attachment with the core CareSession table.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { assertContactVisible } from '../contacts/contact-scope.js';
import { logger } from '../../shared/utils/logger.js';

type UserCtx = { id: string; orgId: string; role: string };

function plusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function plusHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stepCountOf(sequence: { steps: unknown; sequenceSteps?: unknown[] }): number {
  const relational = Array.isArray(sequence.sequenceSteps) ? sequence.sequenceSteps.length : 0;
  return relational || asArray(sequence.steps).length;
}

function stateOf(session: { state: string; closedAt: Date | null; closedReason: string | null; pausedUntil: Date | null }): 'active' | 'paused' | 'completed' | 'stopped' {
  if (session.state === 'closed') {
    return session.closedReason === 'completed' || session.closedReason === 'source_done' ? 'completed' : 'stopped';
  }
  if (session.pausedUntil && session.pausedUntil.getTime() > Date.now()) return 'paused';
  return 'active';
}

async function requireVisibleContact(user: UserCtx, contactId: string, reply: FastifyReply): Promise<boolean> {
  const visible = await assertContactVisible({
    userId: user.id,
    orgId: user.orgId,
    legacyRole: user.role,
    contactId,
  });
  if (!visible) {
    reply.status(404).send({ error: 'Contact not found' });
    return false;
  }
  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true } });
  if (!contact) {
    reply.status(404).send({ error: 'Contact not found' });
    return false;
  }
  return true;
}

async function requireOrgNick(user: UserCtx, nickId: string, reply: FastifyReply) {
  const nick = await prisma.zaloAccount.findFirst({
    where: { id: nickId, orgId: user.orgId, archivedAt: null },
    select: { id: true, ownerUserId: true, displayName: true },
  });
  if (!nick) {
    reply.status(404).send({ error: 'Nick not found' });
    return null;
  }
  return nick;
}

export async function communityAutomationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/automation/sequences', async (request: FastifyRequest<{ Querystring: { enabled?: string } }>) => {
    const user = request.user as UserCtx;
    const enabled = request.query.enabled === 'true' ? true : undefined;
    const sequences = await prisma.automationSequence.findMany({
      where: { orgId: user.orgId, ...(enabled === undefined ? {} : { enabled }) },
      orderBy: { createdAt: 'desc' },
      include: { sequenceSteps: { select: { id: true }, orderBy: { stepOrder: 'asc' } } },
    });
    return {
      sequences: sequences.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        enabled: s.enabled,
        steps: asArray(s.steps),
        runtimeRules: s.runtimeRules ?? {},
        stepCount: stepCountOf(s),
      })),
    };
  });

  app.get('/api/v1/contacts/:contactId/automation-status', async (
    request: FastifyRequest<{ Params: { contactId: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const { contactId } = request.params;
    if (!(await requireVisibleContact(user, contactId, reply))) return reply;

    const sessions = await prisma.careSession.findMany({
      where: { orgId: user.orgId, contactId },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
    const sequenceIds = [...new Set(sessions.map((s) => s.sourceSequenceId).filter(Boolean) as string[])];
    const sequences = sequenceIds.length
      ? await prisma.automationSequence.findMany({
          where: { orgId: user.orgId, id: { in: sequenceIds } },
          include: { sequenceSteps: { select: { id: true }, orderBy: { stepOrder: 'asc' } } },
        })
      : [];
    const seqMap = new Map(sequences.map((s) => [s.id, s]));

    return {
      contactId,
      triggers: sessions
        .filter((s) => s.sourceType === 'sequence_manual' || s.sourceSequenceId)
        .map((s) => {
          const seq = s.sourceSequenceId ? seqMap.get(s.sourceSequenceId) : null;
          const totalSteps = seq ? stepCountOf(seq) : null;
          const state = stateOf(s);
          return {
            triggerId: s.id,
            triggerName: seq?.name ?? 'Theo dõi thủ công',
            sequenceId: s.sourceSequenceId,
            sequenceName: seq?.name ?? 'Luồng bám đuổi',
            enrollmentId: s.id,
            enrollSeq: s.enrollEpoch ?? 1,
            currentStep: state === 'completed' && totalSteps ? totalSteps : 0,
            totalSteps,
            latestEvent: s.closedReason ?? (s.lastReplyAt ? 'customer_reply' : 'manual_enroll'),
            latestAt: (s.closedAt ?? s.lastReplyAt ?? s.openedAt).toISOString(),
            enrolledAt: s.openedAt.toISOString(),
            lastSentAt: null,
            nextRunAt: null,
            pausedUntilMs: s.pausedUntil ? Math.max(0, s.pausedUntil.getTime() - Date.now()) : 0,
            pausedUntil: s.pausedUntil?.toISOString() ?? null,
            stopped: state === 'stopped',
            derivedState: state,
            etaCompleteAt: null,
            holdReason: state === 'paused' ? 'waiting_reply' : state,
            allowedHourRange: null,
          };
        }),
    };
  });

  app.get('/api/v1/automation/care-sessions/listen-status', async (
    request: FastifyRequest<{ Querystring: { contactId?: string; nickId?: string } }>,
  ) => {
    const user = request.user as UserCtx;
    const contactId = request.query.contactId ?? '';
    const nickId = request.query.nickId ?? '';
    if (!contactId || !nickId) return { listening: false, isManualWatch: false };

    const session = await prisma.careSession.findFirst({
      where: { orgId: user.orgId, contactId, nickId, state: 'active' },
      select: { id: true, sourceType: true },
      orderBy: { openedAt: 'desc' },
    });
    return {
      listening: !!session,
      isManualWatch: session?.sourceType === 'manual_listen',
    };
  });

  app.get('/api/v1/automation/care-sessions/listening-pairs', async (request: FastifyRequest) => {
    const user = request.user as UserCtx;
    const sessions = await prisma.careSession.findMany({
      where: { orgId: user.orgId, state: 'active' },
      select: { contactId: true, nickId: true },
      take: 5000,
    });
    return { pairs: sessions.map((s) => `${s.contactId}|${s.nickId}`) };
  });

  app.post('/api/v1/automation/care-sessions/listen', async (
    request: FastifyRequest<{ Body: { contactId?: string; nickId?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const contactId = request.body.contactId ?? '';
    const nickId = request.body.nickId ?? '';
    if (!contactId || !nickId) return reply.status(400).send({ error: 'contactId and nickId are required' });
    if (!(await requireVisibleContact(user, contactId, reply))) return reply;
    const nick = await requireOrgNick(user, nickId, reply);
    if (!nick) return reply;

    const existing = await prisma.careSession.findFirst({
      where: { orgId: user.orgId, contactId, nickId, state: 'active', sourceType: 'manual_listen' },
      select: { id: true },
    });
    if (existing) return { ok: true, id: existing.id };

    const created = await prisma.careSession.create({
      data: {
        orgId: user.orgId,
        contactId,
        nickId,
        ownerUserId: nick.ownerUserId,
        enrolledByUserId: user.id,
        sourceType: 'manual_listen',
        state: 'active',
        interestWindowUntil: plusDays(30),
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  });

  app.delete('/api/v1/automation/care-sessions/listen', async (
    request: FastifyRequest<{ Body: { contactId?: string; nickId?: string } }>,
  ) => {
    const user = request.user as UserCtx;
    const contactId = request.body.contactId ?? '';
    const nickId = request.body.nickId ?? '';
    if (!contactId || !nickId) return { ok: false, closed: 0 };
    const res = await prisma.careSession.updateMany({
      where: { orgId: user.orgId, contactId, nickId, state: 'active', sourceType: 'manual_listen' },
      data: { state: 'closed', closedReason: 'sale_resolved', closedAt: new Date() },
    });
    return { ok: true, closed: res.count };
  });

  app.post('/api/v1/chat/contacts/:contactId/manual-enroll', async (
    request: FastifyRequest<{ Params: { contactId: string }; Body: { sequenceId?: string; nickId?: string; reason?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const { contactId } = request.params;
    const sequenceId = request.body.sequenceId ?? '';
    const nickId = request.body.nickId ?? '';
    const reason = (request.body.reason ?? '').trim();
    if (!sequenceId || !nickId || !reason) {
      return reply.status(400).send({ error: 'sequenceId, nickId and reason are required' });
    }
    if (!(await requireVisibleContact(user, contactId, reply))) return reply;
    const nick = await requireOrgNick(user, nickId, reply);
    if (!nick) return reply;

    const sequence = await prisma.automationSequence.findFirst({
      where: { id: sequenceId, orgId: user.orgId, enabled: true },
      include: { sequenceSteps: { select: { id: true }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!sequence) return reply.status(404).send({ error: 'Sequence not found or disabled' });

    const previous = await prisma.careSession.count({
      where: { orgId: user.orgId, contactId, sourceSequenceId: sequenceId },
    });
    const created = await prisma.careSession.create({
      data: {
        orgId: user.orgId,
        contactId,
        nickId,
        ownerUserId: nick.ownerUserId,
        enrolledByUserId: user.id,
        sourceType: 'sequence_manual',
        sourceSequenceId: sequenceId,
        state: 'active',
        interestWindowUntil: plusDays(30),
        enrollEpoch: previous + 1,
        rulesSnapshot: sequence.runtimeRules ?? {},
        closeConditions: { reason },
      },
      select: { id: true },
    });

    await prisma.careSessionEvent.create({
      data: {
        sessionId: created.id,
        eventId: `manual-enroll:${created.id}`,
        eventType: 'opened',
        payload: { sequenceId, reason, byUserId: user.id },
      },
    }).catch((err) => logger.warn('[community-automation] create enroll event failed:', err));

    return { ok: true, enrollmentId: created.id, sequenceId, sequenceName: sequence.name, stepCount: stepCountOf(sequence) };
  });

  app.post('/api/v1/automation/triggers/:triggerId/contacts/:contactId/pause', async (
    request: FastifyRequest<{ Params: { triggerId: string; contactId: string }; Body: { hours?: number } }>,
  ) => {
    const user = request.user as UserCtx;
    const hours = Math.max(1, Math.min(168, Number(request.body.hours ?? 24) || 24));
    await prisma.careSession.updateMany({
      where: { id: request.params.triggerId, orgId: user.orgId, contactId: request.params.contactId, state: 'active' },
      data: { pausedUntil: plusHours(hours) },
    });
    return { ok: true };
  });

  app.post('/api/v1/automation/triggers/:triggerId/contacts/:contactId/resume', async (
    request: FastifyRequest<{ Params: { triggerId: string; contactId: string } }>,
  ) => {
    const user = request.user as UserCtx;
    await prisma.careSession.updateMany({
      where: { id: request.params.triggerId, orgId: user.orgId, contactId: request.params.contactId, state: 'active' },
      data: { pausedUntil: null },
    });
    return { ok: true };
  });

  app.post('/api/v1/automation/triggers/:triggerId/contacts/:contactId/stop', async (
    request: FastifyRequest<{ Params: { triggerId: string; contactId: string }; Body: { reason?: string } }>,
  ) => {
    const user = request.user as UserCtx;
    await prisma.careSession.updateMany({
      where: { id: request.params.triggerId, orgId: user.orgId, contactId: request.params.contactId },
      data: { state: 'closed', closedReason: request.body.reason || 'sale_resolved', closedAt: new Date() },
    });
    return { ok: true };
  });

  app.post('/api/v1/automation/triggers/:triggerId/contacts/:contactId/advance', async () => {
    return { ok: true, promoted: 0, deferred: true, deferReason: 'community_fallback' };
  });
}
