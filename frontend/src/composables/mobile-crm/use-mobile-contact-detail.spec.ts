// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AccountActivityItem } from '@/composables/use-contacts';

vi.mock('@/api/index', () => ({ api: { get: vi.fn(), post: vi.fn() }, clearAuthAndRedirect: vi.fn(), ensureFreshToken: vi.fn() }));
vi.mock('@/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { conversationOptionsFrom } from './use-mobile-contact-detail';

const item: AccountActivityItem = {
  zaloAccountId: 'nick-1', conversationId: 'conv-1',
  zaloAccount: { id: 'nick-1', displayName: 'Nick test', phone: null, avatarUrl: null },
  totalInbound: 1, totalOutbound: 1, lastInbound: null,
  lastOutbound: { id: 'msg-1', content: 'Tin giả', contentType: 'text', sentAt: '2026-11-09T03:00:00Z',
    repliedByUserId: 'sender-B', repliedBy: { id: 'sender-B', fullName: 'Người gửi B' } },
};
describe('người phụ trách trong picker hội thoại mobile', () => {
  it('giữ người phụ trách A khi người gửi tin cuối là B', () => {
    expect(conversationOptionsFrom([item], 'Phụ trách A')[0].ownerName).toBe('Phụ trách A');
  });
  it('không suy ra người phụ trách từ tin cuối khi chưa phân công', () => {
    expect(conversationOptionsFrom([item], null)[0].ownerName).toBeNull();
  });
});
