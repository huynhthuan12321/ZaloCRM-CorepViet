/**
 * care-session-timeline.test.ts — Map CareSessionEvent → timeline (Phase 4 Marketing).
 * Kiểm chứng shape khớp FollowUpHistoryDialog: step_sent→'step', step_simulated→'step',
 * reply→'reply', còn lại giữ kind, và stepsSent/stepsSimulated/stepsProcessed đếm đúng.
 * Pure function nên test trực tiếp.
 */
import { describe, it, expect } from 'vitest';
import { careEventToTimelineItem, buildFollowupHistory } from '../src/modules/automation/care-session-timeline.js';

const AT = new Date('2026-07-12T03:00:00Z');

describe('careEventToTimelineItem', () => {
  it('step_sent → kind step + stepIdx/content/status mặc định', () => {
    const it = careEventToTimelineItem({ eventType: 'step_sent', payload: { stepIdx: 2, text: 'Xin chào', totalSteps: 3 }, createdAt: AT });
    expect(it).toMatchObject({ kind: 'step', stepIdx: 2, content: 'Xin chào', contentType: 'text', status: 'sent' });
    expect(it.attachments).toEqual([]);
    expect(it.at).toBe('2026-07-12T03:00:00.000Z');
  });

  it('step_sent thiếu field → null an toàn', () => {
    const it = careEventToTimelineItem({ eventType: 'step_sent', payload: null, createdAt: AT });
    expect(it.stepIdx).toBeNull();
    expect(it.content).toBeNull();
  });

  it('reply → kind reply', () => {
    const it = careEventToTimelineItem({ eventType: 'reply', payload: { messageId: 'm1' }, createdAt: AT });
    expect(it.kind).toBe('reply');
    expect(it.text).toBeNull();
  });

  it('closed → giữ kind + text = reason', () => {
    const it = careEventToTimelineItem({ eventType: 'closed', payload: { reason: 'completed' }, createdAt: AT });
    expect(it.kind).toBe('closed');
    expect(it.text).toBe('completed');
  });

  it('reaction_pos → giữ kind + emoji', () => {
    const it = careEventToTimelineItem({ eventType: 'reaction_pos', payload: { emoji: '❤️' }, createdAt: AT });
    expect(it.kind).toBe('reaction_pos');
    expect(it.emoji).toBe('❤️');
  });

  it('step_simulated → kind step + status simulated + deliveryMode dry_run', () => {
    const it = careEventToTimelineItem({
      eventType: 'step_simulated',
      payload: { stepIdx: 0, text: '[dry-run] Hello', trigger: 'scheduled', deliveryMode: 'dry_run' },
      createdAt: AT,
    });
    expect(it.kind).toBe('step');
    expect(it.status).toBe('simulated');
    expect(it.deliveryMode).toBe('dry_run');
    expect(it.trigger).toBe('scheduled');
    expect(it.content).toBe('[dry-run] Hello');
  });

  it('step_simulated thiếu payload → status simulated, deliveryMode dry_run mặc định', () => {
    const it = careEventToTimelineItem({ eventType: 'step_simulated', payload: null, createdAt: AT });
    expect(it.status).toBe('simulated');
    expect(it.deliveryMode).toBe('dry_run');
    expect(it.stepIdx).toBeNull();
  });
});

describe('buildFollowupHistory', () => {
  it('stepsSent đếm đúng số step_sent, timeline giữ thứ tự', () => {
    const events = [
      { eventType: 'opened', payload: {}, createdAt: new Date('2026-07-12T01:00:00Z') },
      { eventType: 'step_sent', payload: { stepIdx: 0, text: 'A' }, createdAt: new Date('2026-07-12T02:00:00Z') },
      { eventType: 'reply', payload: {}, createdAt: new Date('2026-07-12T02:30:00Z') },
      { eventType: 'step_sent', payload: { stepIdx: 1, text: 'B' }, createdAt: new Date('2026-07-12T03:00:00Z') },
      { eventType: 'closed', payload: { reason: 'completed' }, createdAt: new Date('2026-07-12T04:00:00Z') },
    ];
    const res = buildFollowupHistory(events);
    expect(res.flow.stepsSent).toBe(2);
    expect(res.flow.stepsSimulated).toBe(0);
    expect(res.flow.stepsProcessed).toBe(2);
    expect(res.timeline).toHaveLength(5);
    expect(res.timeline.map((t) => t.kind)).toEqual(['opened', 'step', 'reply', 'step', 'closed']);
  });

  it('rỗng → stepsSent 0, stepsSimulated 0, stepsProcessed 0', () => {
    const res = buildFollowupHistory([]);
    expect(res).toEqual({ flow: { stepsSent: 0, stepsSimulated: 0, stepsProcessed: 0 }, timeline: [] });
  });

  it('dry-run: step_simulated đếm riêng, stepsProcessed = sent + simulated', () => {
    const events = [
      { eventType: 'opened', payload: {}, createdAt: new Date('2026-07-12T01:00:00Z') },
      { eventType: 'step_simulated', payload: { stepIdx: 0, text: '[dry-run] A' }, createdAt: new Date('2026-07-12T02:00:00Z') },
      { eventType: 'step_simulated', payload: { stepIdx: 1, text: '[dry-run] B' }, createdAt: new Date('2026-07-12T03:00:00Z') },
    ];
    const res = buildFollowupHistory(events);
    expect(res.flow.stepsSent).toBe(0);
    expect(res.flow.stepsSimulated).toBe(2);
    expect(res.flow.stepsProcessed).toBe(2);
    expect(res.timeline).toHaveLength(3);
    expect(res.timeline[1].status).toBe('simulated');
    expect(res.timeline[2].status).toBe('simulated');
  });
});
