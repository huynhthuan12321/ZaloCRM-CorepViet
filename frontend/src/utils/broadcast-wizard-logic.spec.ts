// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  findUnknownVars, renderBroadcastPreview, validateWizardStep, buildBroadcastPayload,
  type WizardForm,
} from './broadcast-wizard-logic';

function form(over: Partial<WizardForm> = {}): WizardForm {
  return {
    name: 'BC', sourceType: 'customer_list', customerListId: 'L1', zaloAccountId: 'N1',
    messageText: 'Chào {{ten}}', contentMode: 'text', contentBlockIds: [],
    scheduleType: 'once', scheduledAtLocal: '2026-07-20T08:00', timeOfDay: '08:00', daysOfWeek: [],
    maxPerRun: 50, delaySecMin: 30, delaySecMax: 90, ...over,
  };
}

describe('findUnknownVars — chặn token chưa render', () => {
  it('biến whitelist {{ten}} {{sdt}} → không cảnh báo', () => {
    expect(findUnknownVars('Chào {{ten}} sđt {{sdt}}')).toEqual([]);
  });
  it('biến lạ {{sale}} {{brand}} → cảnh báo', () => {
    expect(findUnknownVars('Từ {{sale}} của {{brand}}').sort()).toEqual(['brand', 'sale']);
  });
});

describe('renderBroadcastPreview — theo KH mẫu', () => {
  it('thay {{ten}}/{{sdt}}', () => {
    expect(renderBroadcastPreview('Chào {{ten}}, sđt {{sdt}}')).toBe('Chào An, sđt 0901234567');
  });
  it('giữ nguyên biến lạ', () => {
    expect(renderBroadcastPreview('Hi {{sale}}')).toBe('Hi {{sale}}');
  });
});

describe('validateWizardStep', () => {
  const ctxOk = { friendCount: 5, audienceWillSend: 50 };

  it('bước 1: cần tên + nick + tệp + đã đếm audience willSend>0', () => {
    expect(validateWizardStep(1, form(), ctxOk)).toBe(true);
    expect(validateWizardStep(1, form({ name: '' }), ctxOk)).toBe(false);
    expect(validateWizardStep(1, form({ customerListId: '' }), ctxOk)).toBe(false);
    // chưa đếm audience → chặn
    expect(validateWizardStep(1, form(), { friendCount: 5, audienceWillSend: null })).toBe(false);
    // đếm ra 0 người nhận → chặn
    expect(validateWizardStep(1, form(), { friendCount: 5, audienceWillSend: 0 })).toBe(false);
  });

  it('bước 1 friends: cần friendCount>0', () => {
    expect(validateWizardStep(1, form({ sourceType: 'friends' }), { friendCount: 0, audienceWillSend: 10 })).toBe(false);
    expect(validateWizardStep(1, form({ sourceType: 'friends' }), { friendCount: 3, audienceWillSend: 10 })).toBe(true);
  });

  it('bước 2: text có biến lạ → chặn; blocks cần ≥1', () => {
    expect(validateWizardStep(2, form({ messageText: 'ok {{ten}}' }), ctxOk)).toBe(true);
    expect(validateWizardStep(2, form({ messageText: 'hi {{sale}}' }), ctxOk)).toBe(false);
    expect(validateWizardStep(2, form({ messageText: '' }), ctxOk)).toBe(false);
    expect(validateWizardStep(2, form({ contentMode: 'blocks', contentBlockIds: [] }), ctxOk)).toBe(false);
    expect(validateWizardStep(2, form({ contentMode: 'blocks', contentBlockIds: ['b1'] }), ctxOk)).toBe(true);
  });

  it('bước 3: once cần ngày; weekly cần dow; delayMax>=min', () => {
    expect(validateWizardStep(3, form(), ctxOk)).toBe(true);
    expect(validateWizardStep(3, form({ scheduleType: 'once', scheduledAtLocal: '' }), ctxOk)).toBe(false);
    expect(validateWizardStep(3, form({ scheduleType: 'weekly', daysOfWeek: [] }), ctxOk)).toBe(false);
    expect(validateWizardStep(3, form({ delaySecMin: 90, delaySecMax: 30 }), ctxOk)).toBe(false);
  });

  it('bước 4: luôn true (gate bằng checkbox ở view)', () => {
    expect(validateWizardStep(4, form(), ctxOk)).toBe(true);
  });
});

describe('buildBroadcastPayload — dry-run gate', () => {
  it('dryRun=true → status=paused (NHÁP, không gửi thật)', () => {
    expect(buildBroadcastPayload(form(), true).status).toBe('paused');
  });
  it('dryRun=false → status undefined (backend default active)', () => {
    expect(buildBroadcastPayload(form(), false).status).toBeUndefined();
  });
  it('customer_list gửi customerListId; friends thì undefined', () => {
    expect(buildBroadcastPayload(form({ sourceType: 'customer_list' }), true).customerListId).toBe('L1');
    expect(buildBroadcastPayload(form({ sourceType: 'friends' }), true).customerListId).toBeUndefined();
  });
  it('blocks mode → messageText rỗng + contentBlockIds', () => {
    const p = buildBroadcastPayload(form({ contentMode: 'blocks', contentBlockIds: ['b1', 'b2'] }), true);
    expect(p.messageText).toBe('');
    expect(p.contentBlockIds).toEqual(['b1', 'b2']);
  });
  it('once → scheduledAt ISO, timeOfDay null; daily → ngược lại', () => {
    const once = buildBroadcastPayload(form({ scheduleType: 'once' }), false);
    expect(once.scheduledAt).toBeTruthy();
    expect(once.timeOfDay).toBeNull();
    const daily = buildBroadcastPayload(form({ scheduleType: 'daily' }), false);
    expect(daily.scheduledAt).toBeNull();
    expect(daily.timeOfDay).toBe('08:00');
  });
});
