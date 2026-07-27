import { describe, expect, it } from 'vitest';
import {
  mergeCustomerSummaryMetadata,
  normalizeCustomerSummary,
  shouldRefreshCustomerSummary,
  type CustomerSummary,
} from '../../src/modules/ai/customer-summary-service.js';

const previous: CustomerSummary = {
  summary: 'Khách quan tâm gói bán thử.',
  needs: { goiQuanTam: 'Gói bán thử', nganSach: '10 triệu' },
  stage: 'dang_tim_hieu',
  concerns: ['Chưa rõ chi phí vận chuyển'],
  nextStep: 'Gửi bảng giá đã duyệt.',
  updatedAt: '2026-07-27T01:00:00.000Z',
  msgCountAtUpdate: 10,
};

describe('customer summary normalization and refresh policy', () => {
  it('skips a recent summary until at least five new messages arrive', () => {
    const now = new Date('2026-07-27T01:20:00.000Z');
    expect(shouldRefreshCustomerSummary(previous, 14, now)).toBe(false);
    expect(shouldRefreshCustomerSummary(previous, 15, now)).toBe(true);
  });

  it('refreshes after 30 minutes even without five new messages', () => {
    expect(shouldRefreshCustomerSummary(previous, 10, new Date('2026-07-27T01:30:01.000Z'))).toBe(true);
  });

  it('keeps old meaningful values, clamps limits, and rejects an invalid stage', () => {
    const result = normalizeCustomerSummary({
      summary: 'x'.repeat(700),
      needs: { goiQuanTam: 'chưa xác định', khuVuc: 'Đà Nẵng' },
      stage: 'invalid',
      concerns: ['1', '2', '3', '4', '5', '6'],
      nextStep: '',
    }, previous, 18, '2026-07-27T02:00:00.000Z');

    expect(result.summary).toHaveLength(600);
    expect(result.needs.goiQuanTam).toBe('Gói bán thử');
    expect(result.needs.khuVuc).toBe('Đà Nẵng');
    expect(result.stage).toBe('chua_ro');
    expect(result.concerns).toEqual(['1', '2', '3', '4', '5']);
    expect(result.nextStep).toBe('Gửi bảng giá đã duyệt.');
    expect(result.msgCountAtUpdate).toBe(18);
  });

  it('preserves productNeed and unrelated metadata branches', () => {
    const metadata = { productNeed: { type: 'Bột bánh' }, sourceDetail: 'Facebook' };
    const merged = mergeCustomerSummaryMetadata(metadata, previous);

    expect(merged.productNeed).toEqual({ type: 'Bột bánh' });
    expect(merged.sourceDetail).toBe('Facebook');
    expect(merged.customerSummary).toEqual(previous);
  });
});
