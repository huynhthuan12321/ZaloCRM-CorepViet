import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  humanRows: vi.fn(),
  acceptedFriend: vi.fn(),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    $queryRaw: db.humanRows,
    friend: { findFirst: db.acceptedFriend },
  },
}));

import {
  isConversationEligibleForAutoReply,
  normalizeAutoReplyScope,
} from '../../src/modules/ai/ai-auto-reply-eligibility.js';

describe('AI auto-reply eligibility cho khách chủ động nhắn chưa kết bạn', () => {
  beforeEach(() => {
    db.humanRows.mockReset();
    db.acceptedFriend.mockReset();
  });

  it('giữ nguyên manual mặc định khi công tắc khách lạ tắt', async () => {
    const eligible = await isConversationEligibleForAutoReply('c1', false, 'manual', false, 'a1', 'u1');
    expect(eligible).toBe(false);
    expect(db.acceptedFriend).not.toHaveBeenCalled();
  });

  it('nhận khách chưa kết bạn khi công tắc khách lạ bật, kể cả scope manual', async () => {
    db.acceptedFriend.mockResolvedValue(null);
    const eligible = await isConversationEligibleForAutoReply('c1', false, 'manual', true, 'a1', 'u1');
    expect(eligible).toBe(true);
    expect(db.acceptedFriend).toHaveBeenCalledWith({
      where: { zaloAccountId: 'a1', zaloUidInNick: 'u1', friendshipStatus: 'accepted' },
      select: { id: true },
    });
  });

  it('không dùng công tắc khách lạ để nhận người đã kết bạn', async () => {
    db.acceptedFriend.mockResolvedValue({ id: 'friend-1' });
    const eligible = await isConversationEligibleForAutoReply('c1', false, 'manual', true, 'a1', 'u1');
    expect(eligible).toBe(false);
  });

  it('new_customers vẫn nhận khách chưa từng có người thật trả lời', async () => {
    db.humanRows.mockResolvedValue([{ hasHumanReply: false }]);
    const eligible = await isConversationEligibleForAutoReply('c1', false, 'new_customers', false, 'a1', 'u1');
    expect(eligible).toBe(true);
    expect(db.acceptedFriend).not.toHaveBeenCalled();
  });

  it('khách lạ vẫn được nhận khi new_customers thấy lịch sử sale', async () => {
    db.humanRows.mockResolvedValue([{ hasHumanReply: true }]);
    db.acceptedFriend.mockResolvedValue(null);
    const eligible = await isConversationEligibleForAutoReply('c1', false, 'new_customers', true, 'a1', 'u1');
    expect(eligible).toBe(true);
  });

  it('manual enable và scope all luôn ưu tiên, không cần query Friend', async () => {
    await expect(isConversationEligibleForAutoReply('c1', true, 'manual', false, 'a1', 'u1')).resolves.toBe(true);
    await expect(isConversationEligibleForAutoReply('c1', false, 'all', false, 'a1', 'u1')).resolves.toBe(true);
    expect(db.acceptedFriend).not.toHaveBeenCalled();
  });

  it('scope lạ được chuẩn hóa về manual', () => {
    expect(normalizeAutoReplyScope('invalid')).toBe('manual');
  });
});
