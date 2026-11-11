// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

/**
 * Hàm gửi cho hàng đợi offline (flush/Gửi lại). Chỉ tin văn bản của hội thoại Zalo mới được xếp hàng (CONTRACT-A §3.5);
 * nếu hội thoại hiện là kênh thử nghiệm (channelAccount) thì NÉM LỖI để mục chuyển 'failed' thay vì bị coi là đã gửi.
 * Payload gọi xuống y desktop: send(conversationId, content) = sendMessageTo(conversationId, content).
 */
export function createQueueSender(opts: {
  findConversation: (conversationId: string) => { channelAccount?: unknown } | null | undefined;
  send: (conversationId: string, content: string) => Promise<unknown>;
}): (conversationId: string, content: string) => Promise<void> {
  return async (conversationId, content) => {
    const conv = opts.findConversation(conversationId);
    if (conv?.channelAccount) throw new Error('Hội thoại kênh thử nghiệm chưa gửi được từ hàng đợi');
    await opts.send(conversationId, content);
  };
}
