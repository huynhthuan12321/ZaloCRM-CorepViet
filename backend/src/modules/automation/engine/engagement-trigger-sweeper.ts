// Phase 7 Wave 1 — Engagement trigger sweeper (chốt 2026-05-23).
//
// Cron sweeper unlock 2 event types data-driven (no natural emit point):
//   - 'seen_no_reply' (#12): tin sale có seenAt set + KH chưa rep sau N giờ.
//                            eventFilter.waitHours (default 24, min 1, max 168).
//   - 'silent_x_days' (#13): Contact.lastInboundAt cũ hơn X ngày — re-warm.
//                            eventFilter.silenceDays (default 30, min 1, max 365).
//
// Cron tick mỗi 30 phút. Mỗi tick chỉ emit cho conversations/contacts vừa cross
// threshold trong window (30 phút cho seen_no_reply, 6h cho silent_x_days) →
// thực tế không cần dedup phức tạp.
//
// Per-nick rate limit + working hours guard apply ở action handler, KHÔNG ở
// sweeper — sweeper chỉ emit event, materializer + action quyết định send.

import cron from 'node-cron';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { automationEventBus } from './event-bus.js';

const TZ = 'Asia/Ho_Chi_Minh';
const SWEEP_CRON = '*/30 * * * *'; // every 30 min
const SEEN_WINDOW_MINUTES = 30; // sweep tick window for seen_no_reply
const SILENT_WINDOW_HOURS = 6; // sweep tick window for silent_x_days

let job: ReturnType<typeof cron.schedule> | null = null;
let isStarted = false;

export function startEngagementSweeper(): void {
  if (isStarted) {
    logger.warn('[engagement-sweeper] already started');
    return;
  }
  isStarted = true;

  job = cron.schedule(SWEEP_CRON, () => {
    void sweepTick();
  }, { timezone: TZ });

  logger.info(`[engagement-sweeper] started — cron='${SWEEP_CRON}' (seen_no_reply + silent_x_days)`);
}

export function stopEngagementSweeper(): void {
  if (job) { job.stop(); job = null; }
  isStarted = false;
}

async function sweepTick(): Promise<void> {
  try {
    await Promise.all([sweepSeenNoReply(), sweepSilentXDays()]);
  } catch (err) {
    logger.error('[engagement-sweeper] tick error:', err);
  }
}

// ── #12 seen_no_reply ──────────────────────────────────────────────────────

async function sweepSeenNoReply(): Promise<void> {
  const triggers = await prisma.automationTrigger.findMany({
    where: { eventType: 'seen_no_reply', enabled: true },
    select: { id: true, orgId: true, eventFilter: true, name: true },
  });

  if (triggers.length === 0) return;

  for (const t of triggers) {
    try {
      const waitHours = extractPositiveInt(t.eventFilter, 'waitHours', 24, 1, 168);
      const upperBound = new Date(Date.now() - waitHours * 60 * 60 * 1000);
      const lowerBound = new Date(upperBound.getTime() - SEEN_WINDOW_MINUTES * 60 * 1000);

      // Find messages: outgoing, seen during window, contact has not replied since seenAt.
      // JOIN conversation → get contactId. Filter org via Conversation.orgId.
      const rows = await prisma.$queryRaw<Array<{
        message_id: string;
        contact_id: string;
        conversation_id: string;
        seen_at: Date;
      }>>`
        SELECT m.id AS message_id, c.contact_id, c.id AS conversation_id, m.seen_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.sender_type = 'self'
          AND m.seen_at IS NOT NULL
          AND m.seen_at >= ${lowerBound}
          AND m.seen_at < ${upperBound}
          AND c.contact_id IS NOT NULL
          AND c.org_id = ${t.orgId}
          AND NOT EXISTS (
            SELECT 1 FROM messages m2
            WHERE m2.conversation_id = m.conversation_id
              AND m2.sender_type = 'contact'
              AND m2.sent_at > m.seen_at
          )
      `;

      if (rows.length === 0) continue;

      // Dedup by contactId (1 contact = 1 event per tick per trigger)
      const seenContacts = new Set<string>();
      for (const r of rows) {
        if (seenContacts.has(r.contact_id)) continue;
        seenContacts.add(r.contact_id);

        automationEventBus.emit({
          type: 'seen_no_reply',
          orgId: t.orgId,
          occurredAt: new Date(),
          contactId: r.contact_id,
          payload: {
            triggerId: t.id,
            waitHours,
            messageId: r.message_id,
            conversationId: r.conversation_id,
            seenAt: r.seen_at,
          },
        });
      }

      logger.info(`[engagement-sweeper] seen_no_reply trigger ${t.name} fired ${seenContacts.size} event(s) (waitHours=${waitHours})`);
    } catch (err) {
      logger.error(`[engagement-sweeper] seen_no_reply trigger ${t.id} error:`, err);
    }
  }
}

// ── #13 silent_x_days ──────────────────────────────────────────────────────

async function sweepSilentXDays(): Promise<void> {
  const triggers = await prisma.automationTrigger.findMany({
    where: { eventType: 'silent_x_days', enabled: true },
    select: { id: true, orgId: true, eventFilter: true, name: true },
  });

  if (triggers.length === 0) return;

  for (const t of triggers) {
    try {
      const silenceDays = extractPositiveInt(t.eventFilter, 'silenceDays', 30, 1, 365);
      const upperBound = new Date(Date.now() - silenceDays * 24 * 60 * 60 * 1000);
      const lowerBound = new Date(upperBound.getTime() - SILENT_WINDOW_HOURS * 60 * 60 * 1000);

      // Contacts với lastInboundAt vừa cross threshold trong window (lowerBound, upperBound]
      // Index sẵn: @@index([orgId, lastInboundAt])
      const contacts = await prisma.contact.findMany({
        where: {
          orgId: t.orgId,
          mergedInto: null,
          lastInboundAt: { gt: lowerBound, lte: upperBound },
        },
        select: { id: true, lastInboundAt: true },
      });

      if (contacts.length === 0) continue;

      for (const c of contacts) {
        automationEventBus.emit({
          type: 'silent_x_days',
          orgId: t.orgId,
          occurredAt: new Date(),
          contactId: c.id,
          payload: {
            triggerId: t.id,
            silenceDays,
            lastInboundAt: c.lastInboundAt,
          },
        });
      }

      logger.info(`[engagement-sweeper] silent_x_days trigger ${t.name} fired ${contacts.length} event(s) (silenceDays=${silenceDays})`);
    } catch (err) {
      logger.error(`[engagement-sweeper] silent_x_days trigger ${t.id} error:`, err);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractPositiveInt(
  eventFilter: unknown,
  key: string,
  defaultVal: number,
  min: number,
  max: number,
): number {
  if (!eventFilter || typeof eventFilter !== 'object') return defaultVal;
  const v = (eventFilter as Record<string, unknown>)[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return defaultVal;
  return Math.max(min, Math.min(max, v));
}

// ── Test helper — manual fire once ─────────────────────────────────────────
export async function fireEngagementSweepNowForTesting(): Promise<void> {
  await sweepTick();
}
