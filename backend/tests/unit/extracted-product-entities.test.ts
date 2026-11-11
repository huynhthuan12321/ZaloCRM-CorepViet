import { describe, expect, it } from 'vitest';
import { safeParseEntities } from '../../src/modules/ai/schemas/extracted-entities.js';

describe('safeParseEntities productNeed', () => {
  it('keeps Cờ Rếp Việt product details and delivery intent', () => {
    const result = safeParseEntities({
      fullName: 'Anh Nam',
      productNeed: {
        type: 'Bột bánh crêpe truyền thống',
        quantity: '10 túi',
        purpose: 'mua_si',
        decisionTimeline: 'tuan_nay',
        deliveryAddress: 'Quận 7, TP.HCM',
      },
      confidenceScore: 0.91,
      missingFields: ['budgetMin'],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.productNeed).toEqual({
      type: 'Bột bánh crêpe truyền thống',
      quantity: '10 túi',
      purpose: 'mua_si',
      decisionTimeline: 'tuan_nay',
      deliveryAddress: 'Quận 7, TP.HCM',
    });
  });

  it('reads the legacy need key but returns the new productNeed shape', () => {
    const result = safeParseEntities({
      propertyNeed: { type: 'Bột bánh', quantity: '2 thùng' },
      confidenceScore: 0.7,
      missingFields: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.productNeed).toEqual({ type: 'Bột bánh', quantity: '2 thùng' });
  });

  it('drops unsupported purpose and timeline values', () => {
    const result = safeParseEntities({
      productNeed: { type: 'Bột bánh', purpose: 'dau_tu', decisionTimeline: '6_thang' },
      confidenceScore: 0.8,
      missingFields: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.productNeed).toEqual({ type: 'Bột bánh' });
  });
});
