// Phase 7 Wave 1 — Lead score threshold trigger hook (chốt 2026-05-23).
//
// Trigger #14: 'lead_score_threshold' fire khi Contact.leadScore cross-up qua
// threshold cấu hình (vd 79→81 với threshold=80). KHÔNG fire cross-down — chỉ
// quan tâm "hot lead vừa đạt ngưỡng" để follow-up.
//
// Gọi từ lead-scoring.ts AFTER update DB với (orgId, contactId, oldScore, newScore).
// Hook query tất cả triggers eventType='lead_score_threshold' enabled trong org
// và emit 1 event cho mỗi trigger có threshold nằm trong (oldScore, newScore].
//
// Hot path — phải nhanh. Triggers cùng org thường < 10 rows, OK query mỗi lần.

import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { automationEventBus } from './event-bus.js';

export async function emitLeadScoreThresholdIfCrossed(
  orgId: string,
  contactId: string,
  oldScore: number,
  newScore: number,
): Promise<void> {
  if (newScore <= oldScore) return; // chỉ cross-up
  try {
    const triggers = await prisma.automationTrigger.findMany({
      where: { orgId, eventType: 'lead_score_threshold', enabled: true },
      select: { id: true, eventFilter: true, name: true },
    });

    for (const t of triggers) {
      const threshold = extractThreshold(t.eventFilter);
      if (oldScore < threshold && newScore >= threshold) {
        automationEventBus.emit({
          type: 'lead_score_threshold',
          orgId,
          occurredAt: new Date(),
          contactId,
          payload: {
            triggerId: t.id,
            threshold,
            oldScore,
            newScore,
          },
        });
        logger.info(`[lead-score-hook] fired trigger ${t.name} (contact=${contactId}, ${oldScore}→${newScore}, threshold=${threshold})`);
      }
    }
  } catch (err) {
    logger.error('[lead-score-hook] emit error:', err);
  }
}

function extractThreshold(eventFilter: unknown): number {
  const DEFAULT = 80;
  if (!eventFilter || typeof eventFilter !== 'object') return DEFAULT;
  const v = (eventFilter as Record<string, unknown>).threshold;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return DEFAULT;
  return Math.max(1, Math.min(100, v));
}
