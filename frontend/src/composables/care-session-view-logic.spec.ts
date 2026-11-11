// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  stateLabel,
  stateTone,
  filterSessions,
  progressLabel,
  relTime,
  type CareSessionItem,
} from './care-session-view-logic';

function item(over: Partial<CareSessionItem> = {}): CareSessionItem {
  return {
    id: 's1', contactId: 'c1', contactName: 'Nguyễn Văn A', contactPhone: '0900000001',
    sequenceId: 'seq1', sequenceName: 'Chăm sau báo giá', nickName: 'Nick 1',
    sourceType: 'sequence_manual', state: 'running', currentStepIdx: 1, totalSteps: 5,
    stepsSent: 2, lastSentAt: null, nextRunAt: null, pausedUntil: null, lastReplyAt: null,
    lastError: null, openedAt: '2026-07-13T09:00:00Z', closedAt: null, closedReason: null, dryRun: true,
    ...over,
  };
}

describe('stateLabel / stateTone', () => {
  it('map đủ 4 trạng thái', () => {
    expect(stateLabel('running')).toBe('Đang chạy');
    expect(stateLabel('paused')).toBe('Tạm dừng');
    expect(stateLabel('completed')).toBe('Hoàn thành');
    expect(stateLabel('stopped')).toBe('Đã dừng');
    expect(stateTone('running')).toBe('run');
    expect(stateTone('stopped')).toBe('stop');
  });
});

describe('filterSessions', () => {
  const list = [
    item({ id: 'a', state: 'running', contactName: 'An', contactPhone: '0911' }),
    item({ id: 'b', state: 'paused', contactName: 'Bình', contactPhone: '0922' }),
    item({ id: 'c', state: 'completed', contactName: 'Cường', contactPhone: '0933' }),
  ];
  it('all → không lọc', () => {
    expect(filterSessions(list, { state: 'all' })).toHaveLength(3);
    expect(filterSessions(list, {})).toHaveLength(3);
  });
  it('lọc theo state', () => {
    expect(filterSessions(list, { state: 'paused' }).map((x) => x.id)).toEqual(['b']);
  });
  it('lọc theo tên (không phân biệt hoa thường)', () => {
    expect(filterSessions(list, { q: 'bìn' }).map((x) => x.id)).toEqual(['b']);
  });
  it('lọc theo SĐT', () => {
    expect(filterSessions(list, { q: '0933' }).map((x) => x.id)).toEqual(['c']);
  });
  it('kết hợp state + q', () => {
    expect(filterSessions(list, { state: 'running', q: 'an' }).map((x) => x.id)).toEqual(['a']);
    expect(filterSessions(list, { state: 'completed', q: 'an' })).toHaveLength(0);
  });
});

describe('progressLabel', () => {
  it('có tổng bước → "bước x/N", ưu tiên max(stepsSent, currentStepIdx)', () => {
    expect(progressLabel({ stepsSent: 2, currentStepIdx: 1, totalSteps: 5 })).toBe('bước 2/5');
    expect(progressLabel({ stepsSent: 0, currentStepIdx: 3, totalSteps: 5 })).toBe('bước 3/5');
  });
  it('clamp không vượt tổng', () => {
    expect(progressLabel({ stepsSent: 9, currentStepIdx: 9, totalSteps: 5 })).toBe('bước 5/5');
  });
  it('không có tổng → "x bước"', () => {
    expect(progressLabel({ stepsSent: 2, currentStepIdx: 0, totalSteps: 0 })).toBe('2 bước');
  });
});

describe('relTime', () => {
  const now = new Date('2026-07-13T10:00:00Z');
  it('null → rỗng', () => { expect(relTime(null, now)).toBe(''); });
  it('vừa xong (<1 phút)', () => { expect(relTime('2026-07-13T09:59:40Z', now)).toBe('vừa xong'); });
  it('phút trước', () => { expect(relTime('2026-07-13T09:30:00Z', now)).toBe('30 phút trước'); });
  it('giờ trước', () => { expect(relTime('2026-07-13T07:00:00Z', now)).toBe('3 giờ trước'); });
  it('ngày trước', () => { expect(relTime('2026-07-11T10:00:00Z', now)).toBe('2 ngày trước'); });
  it('tương lai → "nữa"', () => { expect(relTime('2026-07-13T10:30:00Z', now)).toBe('30 phút nữa'); });
});
