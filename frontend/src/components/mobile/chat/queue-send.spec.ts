import { describe, expect, it, vi } from 'vitest';
import { createQueueSender } from './queue-send';

describe('createQueueSender (sendFromQueue)', () => {
  it('hội thoại Zalo: gọi send đúng (conversationId, content) và thành công', async () => {
    const send = vi.fn(async () => {});
    const run = createQueueSender({ findConversation: () => ({ channelAccount: null }), send });
    await expect(run('c1', 'xin chào')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith('c1', 'xin chào');
  });

  it('hội thoại kênh (channelAccount): ném lỗi, KHÔNG gọi send -> flush không coi là đã gửi', async () => {
    const send = vi.fn(async () => {});
    const run = createQueueSender({ findConversation: () => ({ channelAccount: { id: 'ch1' } }), send });
    await expect(run('c1', 'x')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('send lỗi thì lỗi được truyền lên', async () => {
    const run = createQueueSender({ findConversation: () => undefined, send: async () => { throw new Error('mạng'); } });
    await expect(run('c1', 'x')).rejects.toThrow('mạng');
  });
});
