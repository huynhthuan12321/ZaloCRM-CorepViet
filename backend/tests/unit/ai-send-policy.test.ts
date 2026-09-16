import { describe, expect, it } from 'vitest';
import { decideAutoReplySendPolicy, decideFollowupSendPolicy } from '../../src/modules/ai/ai-send-policy.js';

describe('ai-send-policy', () => {
  const sensitiveRe = /chot don|gia/i;

  it('allows normal sourced auto replies', () => {
    expect(decideAutoReplySendPolicy({
      customerText: 'minh can tu van san pham',
      draftText: 'Ben em co san pham phu hop theo tai lieu.',
      sources: ['doc-1'],
      sensitiveRe,
    })).toEqual({ action: 'allow' });
  });

  it('requires review for sensitive input or money-like output regardless of confidence', () => {
    expect(decideAutoReplySendPolicy({
      customerText: 'gia bao nhieu',
      draftText: 'Ben em se tu van them.',
      sources: ['doc-1'],
      sensitiveRe,
    }).action).toBe('needs_review');
    expect(decideAutoReplySendPolicy({
      customerText: 'tu van giup minh',
      draftText: 'Gia la 125.000 vnd.',
      sources: ['doc-1'],
      sensitiveRe,
    }).action).toBe('needs_review');
  });

  it('does not let fake confidence authorize a missing-source send', () => {
    const decision = decideAutoReplySendPolicy({
      customerText: 'tu van giup minh',
      draftText: 'Ben em co hang.',
      sources: [],
      sensitiveRe,
    });
    expect(decision).toEqual({ action: 'needs_review', reason: 'thiếu nguồn tài liệu' });
  });

  it('blocks transactional follow-up content before send', () => {
    expect(decideFollowupSendPolicy('Anh chi coc 500k giup em nhe').action).toBe('block');
    expect(decideFollowupSendPolicy('Em nhac lai de xem anh chi can them thong tin nao khong a?')).toEqual({ action: 'allow' });
  });
});
