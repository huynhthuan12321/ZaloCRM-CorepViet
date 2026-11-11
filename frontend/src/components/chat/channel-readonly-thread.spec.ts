// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ChannelReadonlyThread from './channel-readonly-thread.vue';
import type { Conversation, Message } from '@/composables/use-chat';

const conversation = (textSend: boolean) => ({
  id: 'conv-a',
  channelAccount: { id: 'account-a', displayName: 'Mock', provider: 'MOCK_BROWSER', status: 'CONNECTED' },
  capabilities: { textRead: true, textSend, aiAutoSend: false },
  threadType: 'user',
  contact: null,
  zaloAccount: null,
  lastMessageAt: null,
  unreadCount: 0,
  isReplied: false,
}) as Conversation;

describe('TT06 channel composer', () => {
  it('stays hidden when the server capability is false', () => {
    const wrapper = mount(ChannelReadonlyThread, {
      props: { conversation: conversation(false), messages: [], loading: false },
    });
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).toContain('Chỉ xem tin nhắn');
  });

  it('shows explicit delivery states without claiming delivered/read', () => {
    const messages = [
      {
        id: 'message-a',
        content: 'hello',
        contentType: 'text',
        senderType: 'self',
        senderName: null,
        sentAt: '2026-10-13T00:00:00Z',
        isDeleted: false,
        zaloMsgId: null,
        albumKey: null,
        albumIndex: null,
        albumTotal: null,
        channelSendState: 'CONFIRMED',
      },
    ] as Message[];
    const wrapper = mount(ChannelReadonlyThread, {
      props: { conversation: conversation(true), messages, loading: false, send: vi.fn() },
    });
    expect(wrapper.text()).toContain('Đã xác nhận bởi fixture');
    expect(wrapper.text()).toContain('không phải khách đã nhận hoặc đã xem');
  });

  it('reuses the same UUID after an HTTP failure', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const wrapper = mount(ChannelReadonlyThread, {
      props: { conversation: conversation(true), messages: [], loading: false, send },
    });
    await wrapper.find('textarea').setValue('retry me');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][2]).toBe(send.mock.calls[1][2]);
  });

  it('provides a visible composer label and disables refresh while loading', () => {
    const wrapper = mount(ChannelReadonlyThread, {
      props: { conversation: conversation(true), messages: [], loading: true, send: vi.fn() },
    });
    expect(wrapper.get('label[for="channel-message-text"]').text()).toContain('Nội dung tin nhắn');
    expect(wrapper.get('#channel-message-text').attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('button.refresh-messages').attributes()).toHaveProperty('disabled');
    expect(wrapper.get('section').attributes('aria-busy')).toBe('true');
  });
});
