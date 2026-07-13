// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * care-session-list.test.ts — logic THUẦN cho trang Phiên chăm sóc / Bám đuổi thủ công
 * (Phase 4.1). Kiểm chứng suy trạng thái, map DTO (kèm cờ dry-run), tổng hợp thẻ đếm,
 * và map filter state → Prisma where. Pure function nên test trực tiếp, không cần DB.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveSessionState,
  careSessionToListItem,
  summarizeSessions,
  stateFilterToWhere,
  type CareSessionRow,
} from '../src/modules/automation/care-session-list-helpers.js';

const NOW = new Date('2026-07-13T10:00:00Z');
const PAST = new Date('2026-07-13T09:00:00Z');
const FUTURE = new Date('2026-07-13T12:00:00Z');

describe('deriveSessionState', () => {
  it('active + không pause → running', () => {
    expect(deriveSessionState({ state: 'active', closedReason: null, pausedUntil: null, now: NOW })).toBe('running');
  });
  it('active + pausedUntil còn hiệu lực → paused', () => {
    expect(deriveSessionState({ state: 'active', closedReason: null, pausedUntil: FUTURE, now: NOW })).toBe('paused');
  });
  it('active + pausedUntil đã qua → running', () => {
    expect(deriveSessionState({ state: 'active', closedReason: null, pausedUntil: PAST, now: NOW })).toBe('running');
  });
  it('closed + completed/source_done → completed', () => {
    expect(deriveSessionState({ state: 'closed', closedReason: 'completed', pausedUntil: null, now: NOW })).toBe('completed');
    expect(deriveSessionState({ state: 'closed', closedReason: 'source_done', pausedUntil: null, now: NOW })).toBe('completed');
  });
  it('closed + lý do khác → stopped', () => {
    expect(deriveSessionState({ state: 'closed', closedReason: 'sale_resolved', pausedUntil: null, now: NOW })).toBe('stopped');
    expect(deriveSessionState({ state: 'closed', closedReason: 'step_failed', pausedUntil: null, now: NOW })).toBe('stopped');
    expect(deriveSessionState({ state: 'closed', closedReason: null, pausedUntil: null, now: NOW })).toBe('stopped');
  });
});

function baseRow(over: Partial<CareSessionRow> = {}): CareSessionRow {
  return {
    id: 's1', contactId: 'c1', nickId: 'n1', sourceType: 'sequence_manual', sourceSequenceId: 'seq1',
    state: 'active', closedReason: null, pausedUntil: null, lastReplyAt: null,
    currentStepIdx: 1, stepsSnapshot: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
    nextRunAt: FUTURE, lastSentAt: PAST, lastError: null, openedAt: PAST, closedAt: null,
    ...over,
  };
}
const ctx = {
  contactName: 'Nguyễn Văn A', contactPhone: '0900000001', sequenceName: 'Chăm sau báo giá',
  nickName: 'Nick Sale 1', stepsSent: 1, dryRun: true, now: NOW,
};

describe('careSessionToListItem', () => {
  it('map đủ field + totalSteps từ snapshot', () => {
    const item = careSessionToListItem(baseRow(), ctx);
    expect(item).toMatchObject({
      id: 's1', contactName: 'Nguyễn Văn A', contactPhone: '0900000001',
      sequenceName: 'Chăm sau báo giá', nickName: 'Nick Sale 1',
      state: 'running', currentStepIdx: 1, totalSteps: 3, stepsSent: 1,
    });
    expect(item.openedAt).toBe(PAST.toISOString());
  });
  it('running + dryRun=true → item.dryRun=true, nextRunAt hiện', () => {
    const item = careSessionToListItem(baseRow(), ctx);
    expect(item.dryRun).toBe(true);
    expect(item.nextRunAt).toBe(FUTURE.toISOString());
  });
  it('phiên đã đóng → dryRun=false + nextRunAt ẩn (null)', () => {
    const item = careSessionToListItem(
      baseRow({ state: 'closed', closedReason: 'completed', closedAt: NOW }), ctx,
    );
    expect(item.state).toBe('completed');
    expect(item.dryRun).toBe(false);
    expect(item.nextRunAt).toBeNull();
    expect(item.closedAt).toBe(NOW.toISOString());
  });
  it('dryRun=false (production tắt guard) → item.dryRun=false dù đang chạy', () => {
    const item = careSessionToListItem(baseRow(), { ...ctx, dryRun: false });
    expect(item.state).toBe('running');
    expect(item.dryRun).toBe(false);
  });
  it('snapshot rỗng → totalSteps=0', () => {
    expect(careSessionToListItem(baseRow({ stepsSnapshot: null }), ctx).totalSteps).toBe(0);
  });
});

describe('summarizeSessions', () => {
  it('đếm đúng theo trạng thái', () => {
    const s = summarizeSessions([
      { state: 'running' }, { state: 'running' }, { state: 'paused' },
      { state: 'completed' }, { state: 'stopped' }, { state: 'stopped' },
    ]);
    expect(s).toEqual({ total: 6, running: 2, paused: 1, completed: 1, stopped: 2 });
  });
  it('rỗng → tất cả 0', () => {
    expect(summarizeSessions([])).toEqual({ total: 0, running: 0, paused: 0, completed: 0, stopped: 0 });
  });
});

describe('stateFilterToWhere', () => {
  it('running → active + chưa pause', () => {
    expect(stateFilterToWhere('running', NOW)).toEqual({
      state: 'active', OR: [{ pausedUntil: null }, { pausedUntil: { lte: NOW } }],
    });
  });
  it('paused → active + pausedUntil tương lai', () => {
    expect(stateFilterToWhere('paused', NOW)).toEqual({ state: 'active', pausedUntil: { gt: NOW } });
  });
  it('completed → closed + reason completed/source_done', () => {
    expect(stateFilterToWhere('completed', NOW)).toEqual({
      state: 'closed', closedReason: { in: ['completed', 'source_done'] },
    });
  });
  it('stopped → closed + NOT completed/source_done', () => {
    expect(stateFilterToWhere('stopped', NOW)).toEqual({
      state: 'closed', NOT: { closedReason: { in: ['completed', 'source_done'] } },
    });
  });
  it('undefined / all → null (không filter)', () => {
    expect(stateFilterToWhere(undefined, NOW)).toBeNull();
    expect(stateFilterToWhere('all', NOW)).toBeNull();
  });
});
