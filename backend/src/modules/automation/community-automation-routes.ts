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
import { normalizeSequenceSteps } from './sequence-snapshot.js';
import { buildFollowupHistory } from './care-session-timeline.js';

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

// normalizeSequenceSteps chuyển sang ./sequence-snapshot.ts (2026-07-12) — dùng chung
// với care-session-cron (worker gửi bước) + care-session-listener (enroll bám đuổi).

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  return String(row.text ?? row.content ?? row.messageText ?? row.message ?? '');
}

function stepText(step: unknown): string {
  const text = textFromUnknown(step).trim();
  return text || '(buoc nay chua co noi dung)';
}

function sequenceDto(sequence: {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: unknown;
  runtimeRules: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  sequenceSteps?: unknown[];
}) {
  const steps = asArray(sequence.steps);
  return {
    id: sequence.id,
    name: sequence.name,
    description: sequence.description,
    enabled: sequence.enabled,
    steps,
    runtimeRules: sequence.runtimeRules ?? {},
    stepCount: stepCountOf(sequence),
    createdAt: sequence.createdAt?.toISOString(),
    updatedAt: sequence.updatedAt?.toISOString(),
  };
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
      sequences: sequences.map(sequenceDto),
    };
  });

  app.post('/api/v1/automation/sequences', async (
    request: FastifyRequest<{ Body: { name?: string; description?: string; enabled?: boolean; steps?: unknown; messageText?: string; runtimeRules?: unknown } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const name = (request.body.name ?? '').trim();
    if (!name) return reply.status(400).send({ error: 'name is required' });
    const steps = normalizeSequenceSteps(request.body.steps, request.body.messageText ?? '');
    const created = await prisma.automationSequence.create({
      data: {
        orgId: user.orgId,
        name,
        description: (request.body.description ?? '').trim() || null,
        enabled: request.body.enabled !== false,
        createdById: user.id,
        steps,
        runtimeRules: request.body.runtimeRules && typeof request.body.runtimeRules === 'object'
          ? request.body.runtimeRules as object
          : { allowedHourRange: [8, 21], sendGap: { value: 30, unit: 'minute' } },
      },
      include: { sequenceSteps: { select: { id: true }, orderBy: { stepOrder: 'asc' } } },
    });
    return { sequence: sequenceDto(created) };
  });

  app.patch('/api/v1/automation/sequences/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; description?: string | null; enabled?: boolean; steps?: unknown; messageText?: string; runtimeRules?: unknown } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const existing = await prisma.automationSequence.findFirst({ where: { id: request.params.id, orgId: user.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Sequence not found' });

    const data: Record<string, unknown> = {};
    if (typeof request.body.name === 'string') {
      const name = request.body.name.trim();
      if (!name) return reply.status(400).send({ error: 'name is required' });
      data.name = name;
    }
    if ('description' in request.body) data.description = (request.body.description ?? '').trim() || null;
    if (typeof request.body.enabled === 'boolean') data.enabled = request.body.enabled;
    if ('steps' in request.body || typeof request.body.messageText === 'string') {
      data.steps = normalizeSequenceSteps(request.body.steps, request.body.messageText ?? '');
    }
    if (request.body.runtimeRules && typeof request.body.runtimeRules === 'object') data.runtimeRules = request.body.runtimeRules as object;

    const updated = await prisma.automationSequence.update({
      where: { id: request.params.id },
      data,
      include: { sequenceSteps: { select: { id: true }, orderBy: { stepOrder: 'asc' } } },
    });
    return { sequence: sequenceDto(updated) };
  });

  app.delete('/api/v1/automation/sequences/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const existing = await prisma.automationSequence.findFirst({ where: { id: request.params.id, orgId: user.orgId }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Sequence not found' });
    const activeSessions = await prisma.careSession.count({ where: { orgId: user.orgId, sourceSequenceId: request.params.id, state: 'active' } });
    if (activeSessions > 0) {
      await prisma.automationSequence.update({ where: { id: request.params.id }, data: { enabled: false } });
      return { ok: true, disabled: true, reason: 'sequence_has_active_sessions' };
    }
    await prisma.automationSequence.delete({ where: { id: request.params.id } });
    return { ok: true };
  });

  app.post('/api/v1/automation/sequences/:id/preview', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { contactIds?: string[]; nickId?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const sequence = await prisma.automationSequence.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      include: { sequenceSteps: { select: { id: true }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!sequence) return reply.status(404).send({ error: 'Sequence not found' });

    const contactIds = asArray(request.body.contactIds).map(String).slice(0, 2);
    const contacts = contactIds.length
      ? await prisma.contact.findMany({
          where: { orgId: user.orgId, id: { in: contactIds } },
          select: { id: true, fullName: true, crmName: true, zaloUsername: true, phone: true },
        })
      : [];
    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    const now = Date.now();
    const steps = normalizeSequenceSteps(sequence.steps);

    return {
      sequence: {
        id: sequence.id,
        name: sequence.name,
        totalSteps: steps.length,
        windowLabel: '08:00-21:00',
        gapLabel: 'theo thoi gian tung buoc',
      },
      contacts: contactIds
        .filter((id) => contactMap.has(id))
        .map((id) => {
          const contact = contactMap.get(id)!;
          let offsetMinutes = 0;
          const previewSteps = steps.map((step, idx) => {
            offsetMinutes += idx === 0 ? 0 : step.delayMinutes;
            return {
              stepIdx: idx,
              delayMinutes: step.delayMinutes,
              sendAt: new Date(now + offsetMinutes * 60 * 1000).toISOString(),
              blockName: null,
              bubbles: [{ type: 'text', text: stepText(step), styles: step.styles }],
            };
          });
          return {
            contactId: id,
            name: contact.crmName ?? contact.fullName ?? contact.zaloUsername ?? contact.phone ?? 'Khach hang',
            steps: previewSteps,
            etaCompleteAt: previewSteps.at(-1)?.sendAt ?? null,
          };
        }),
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
          // Ưu tiên stepsSnapshot của phiên (worker gửi theo snapshot) — fallback định nghĩa live.
          const snapshotSteps = asArray(s.stepsSnapshot);
          const totalSteps = snapshotSteps.length || (seq ? stepCountOf(seq) : null);
          const state = stateOf(s);
          return {
            triggerId: s.id,
            triggerName: seq?.name ?? 'Theo dõi thủ công',
            sequenceId: s.sourceSequenceId,
            sequenceName: seq?.name ?? 'Luồng bám đuổi',
            enrollmentId: s.id,
            enrollSeq: s.enrollEpoch ?? 1,
            currentStep: state === 'completed' && totalSteps ? totalSteps : (s.currentStepIdx ?? 0),
            totalSteps,
            latestEvent: s.closedReason
              ?? (s.lastReplyAt ? 'customer_reply' : s.lastSentAt ? 'step_sent' : 'manual_enroll'),
            latestAt: (s.closedAt ?? s.lastReplyAt ?? s.lastSentAt ?? s.openedAt).toISOString(),
            enrolledAt: s.openedAt.toISOString(),
            lastSentAt: s.lastSentAt?.toISOString() ?? null,
            nextRunAt: state === 'active' ? s.nextRunAt?.toISOString() ?? null : null,
            pausedUntilMs: s.pausedUntil ? Math.max(0, s.pausedUntil.getTime() - Date.now()) : 0,
            pausedUntil: s.pausedUntil?.toISOString() ?? null,
            stopped: state === 'stopped',
            derivedState: state,
            etaCompleteAt: null,
            holdReason: state === 'paused' ? 'waiting_reply' : state,
            allowedHourRange: null,
            lastError: s.lastError ?? null,
          };
        }),
    };
  });

  // GET /contacts/:contactId/followup-history — timeline Phiên chăm sóc (Phase 4).
  // Trước 2026-07-12 endpoint này EE-only → FollowUpHistoryDialog chết 404 ở Community.
  // triggerId = CareSession.id (khớp automation-status ở trên trả về triggerId: s.id).
  app.get('/api/v1/contacts/:contactId/followup-history', async (
    request: FastifyRequest<{ Params: { contactId: string }; Querystring: { triggerId?: string; sequenceId?: string } }>,
    reply: FastifyReply,
  ) => {
    const user = request.user as UserCtx;
    const { contactId } = request.params;
    if (!(await requireVisibleContact(user, contactId, reply))) return reply;

    const { triggerId, sequenceId } = request.query;
    // Neo phiên theo triggerId (=CareSession.id). Fallback: phiên mới nhất của
    // contact (+ theo sequenceId nếu có) để không vỡ khi thiếu triggerId.
    const session = triggerId
      ? await prisma.careSession.findFirst({
          where: { id: triggerId, orgId: user.orgId, contactId },
          select: { id: true },
        })
      : await prisma.careSession.findFirst({
          where: { orgId: user.orgId, contactId, ...(sequenceId ? { sourceSequenceId: sequenceId } : {}) },
          orderBy: { openedAt: 'desc' },
          select: { id: true },
        });

    if (!session) return { flow: { stepsSent: 0 }, timeline: [] };

    const events = await prisma.careSessionEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { eventType: true, payload: true, createdAt: true },
    });
    return buildFollowupHistory(events);
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
    // Snapshot steps LÚC ENROLL (Phase 3 fix): sửa luồng sau đó KHÔNG đổi nội dung
    // phiên đang chạy. nextRunAt = now → care-session-cron gửi bước 1 trong khung giờ.
    const stepsSnapshot = normalizeSequenceSteps(sequence.steps);
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
        stepsSnapshot,
        currentStepIdx: 0,
        nextRunAt: new Date(),
        closeConditions: { reason },
      },
      select: { id: true },
    });
    await prisma.automationSequence.update({
      where: { id: sequenceId },
      data: { enrolledCount: { increment: 1 } },
    }).catch((err) => logger.warn('[community-automation] bump enrolledCount failed:', err));

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
      data: { state: 'closed', closedReason: request.body.reason || 'sale_resolved', closedAt: new Date(), nextRunAt: null },
    });
    return { ok: true };
  });

  // "Gửi bước tiếp theo ngay" — kéo nextRunAt về hiện tại + bỏ pause; care-session-cron
  // gửi ở tick kế (vẫn tôn trọng khung giờ + rate limit, KHÔNG bypass luật an toàn).
  app.post('/api/v1/automation/triggers/:triggerId/contacts/:contactId/advance', async (
    request: FastifyRequest<{ Params: { triggerId: string; contactId: string } }>,
  ) => {
    const user = request.user as UserCtx;
    const res = await prisma.careSession.updateMany({
      where: {
        id: request.params.triggerId,
        orgId: user.orgId,
        contactId: request.params.contactId,
        state: 'active',
        nextRunAt: { not: null },
      },
      data: { nextRunAt: new Date(), pausedUntil: null },
    });
    return { ok: true, promoted: res.count };
  });
}
