// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * content-block-phase3.test.ts — unit test logic THUẦN Phase 3 Khối nội dung:
 *   - normalizeBlockType (whitelist loại khối)
 *   - unknownVars (chặn biến {{lạ}})
 *   - normalizeVariants / buildBlockContent (đồng bộ variants[0] → messageText/imageUrl)
 * + parseSequenceSteps giữ blockId khi step ghép từ Khối nội dung (không phá worker gửi).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeBlockType,
  unknownVars,
  normalizeVariants,
  buildBlockContent,
} from '../src/modules/content-blocks/content-block-helpers.js';
import { parseSequenceSteps } from '../src/modules/automation/sequence-snapshot.js';

describe('normalizeBlockType', () => {
  it('accepts the three known types', () => {
    expect(normalizeBlockType('send_message')).toBe('send_message');
    expect(normalizeBlockType('request_friend')).toBe('request_friend');
    expect(normalizeBlockType('status_change')).toBe('status_change');
  });
  it('falls back to send_message for unknown/empty/non-string', () => {
    expect(normalizeBlockType('bogus')).toBe('send_message');
    expect(normalizeBlockType('')).toBe('send_message');
    expect(normalizeBlockType(undefined)).toBe('send_message');
    expect(normalizeBlockType(123)).toBe('send_message');
  });
});

describe('unknownVars', () => {
  it('returns empty for whitelisted vars', () => {
    expect(unknownVars('Chao {{ten}}, SDT {{sdt}} {{ten_khach}} {{phone}}')).toEqual([]);
  });
  it('flags unknown vars, deduped + lowercased', () => {
    expect(unknownVars('Hi {{Name}} {{name}} {{gender}}')).toEqual(['name', 'gender']);
  });
  it('handles no vars', () => {
    expect(unknownVars('plain text')).toEqual([]);
  });
});

describe('normalizeVariants', () => {
  it('coerces string entries and trims', () => {
    expect(normalizeVariants(['a', ' b '])).toEqual([
      { text: 'a', imageUrl: null },
      { text: 'b', imageUrl: null },
    ]);
  });
  it('coerces object entries and trims imageUrl', () => {
    expect(normalizeVariants([{ text: 'x', imageUrl: ' http://i/1.jpg ' }])).toEqual([
      { text: 'x', imageUrl: 'http://i/1.jpg' },
    ]);
  });
  it('drops empty entries', () => {
    expect(normalizeVariants(['', { text: '', imageUrl: '' }, 'keep'])).toEqual([
      { text: 'keep', imageUrl: null },
    ]);
  });
  it('falls back to messageText/imageUrl when variants empty (legacy payload)', () => {
    expect(normalizeVariants([], 'legacy', 'http://i/x.png')).toEqual([
      { text: 'legacy', imageUrl: 'http://i/x.png' },
    ]);
  });
  it('returns empty when nothing usable', () => {
    expect(normalizeVariants([], '', null)).toEqual([]);
  });
  it('caps at 20 variants', () => {
    const many = Array.from({ length: 30 }, (_, i) => `v${i}`);
    expect(normalizeVariants(many)).toHaveLength(20);
  });
});

describe('buildBlockContent', () => {
  it('syncs messageText/imageUrl from variants[0]', () => {
    const out = buildBlockContent([
      { text: 'first', imageUrl: 'http://i/1.jpg' },
      { text: 'second', imageUrl: null },
    ]);
    expect(out).not.toBeNull();
    expect(out!.messageText).toBe('first');
    expect(out!.imageUrl).toBe('http://i/1.jpg');
    expect(out!.variants).toHaveLength(2);
  });
  it('supports image-only variant (empty text)', () => {
    const out = buildBlockContent([{ text: '', imageUrl: 'http://i/x.png' }]);
    expect(out).not.toBeNull();
    expect(out!.messageText).toBe('');
    expect(out!.imageUrl).toBe('http://i/x.png');
  });
  it('returns null when no content at all', () => {
    expect(buildBlockContent([], '', null)).toBeNull();
  });
});

describe('parseSequenceSteps keeps blockId (Phase 3)', () => {
  it('carries blockId through when present, text still required', () => {
    const steps = parseSequenceSteps([
      { text: 'Buoc 1', delayMinutes: 0, blockId: 'blk-1' },
      { text: 'Buoc 2', delayMinutes: 60 },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0].blockId).toBe('blk-1');
    expect(steps[0].text).toBe('Buoc 1');
    expect(steps[1].blockId).toBeNull();
  });
  it('drops steps with empty text even if blockId set', () => {
    const steps = parseSequenceSteps([{ text: '   ', blockId: 'blk-x' }]);
    expect(steps).toHaveLength(0);
  });
});
