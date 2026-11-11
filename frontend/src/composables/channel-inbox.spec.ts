// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from './use-chat';

const h = vi.hoisted(() => ({ user: { id: 'user-a' }, get: vi.fn(), post: vi.fn(), handlers: new Map<string, Function>(), emit: vi.fn(), disconnect: vi.fn() }));
vi.mock('@/api/index', () => ({ api: { get: h.get, post: h.post } }));
vi.mock('@/api/socket', () => ({ createAppSocket: () => ({ on: (name: string, fn: Function) => { h.handlers.set(name, fn); }, emit: h.emit, disconnect: h.disconnect }) }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: h.user }) }));
vi.mock('@/stores/privacy', () => ({ usePrivacyStore: () => ({ isUnlocked: false }) }));
vi.mock('@/composables/use-work-scope', () => ({ useWorkScope: () => ({ scopeAccountId: () => 'zalo-selected', lockToNick: () => {}, accountIds: ref([]) }) }));
vi.mock('@/composables/use-pending-mutations', () => ({ applyPendingTags: (rows: unknown) => rows, registerPendingTags: () => {} }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ push: () => {} }) }));
const channelRow = { id: 'channel-conv', threadType: 'user', contact: null, zaloAccount: null,
  channelAccount: { id: 'account-a', provider: 'MOCK_BROWSER', displayName: 'Test', status: 'CONNECTED' },
  lastMessageAt: null, unreadCount: 1, isReplied: false } as Conversation;
beforeEach(() => {
  vi.resetAllMocks(); vi.resetModules(); h.handlers.clear();
  h.user.id = 'user-a';
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), __zaloCRMConvCacheLog: [] });
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  h.get.mockResolvedValue({ data: { available: true, accounts: [{ id: 'account-a', displayName: 'Test', provider: 'MOCK_BROWSER' }], conversations: [], messages: [], counts: { total: 0, unread: 0 } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('shared inbox client routing and revocation', () => {
  it('uses the channel account namespace, omitting Zalo-only filters in the shared inbox', async () => {
    const { useChat } = await import('./use-chat'); const chat = useChat();
    chat.inboxChannel.value = 'mock'; chat.channelAccountFilter.value = 'account-a'; chat.channelUnreadOnly.value = true;
    chat.extraFilters.value = { tags: 'zalo-tag', folderId: 'zalo-folder' };
    await chat.fetchConversations({ bypassCache: true });
    expect(h.get).toHaveBeenCalledWith('/channel-inbox', { params: {
      channel: 'mock', channelAccountId: 'account-a', search: '', unread: 'true', page: 1, limit: 100,
    } });
  });
  it('never sends a channel row through the Zalo send endpoint', async () => {
    const { useChat } = await import('./use-chat'); const chat = useChat();
    chat.conversations.value = [channelRow]; chat.selectedConvId.value = channelRow.id;
    await chat.sendMessageTo(channelRow.id, 'must not send');
    expect(h.post).not.toHaveBeenCalled();
  });
  it('purges revoked channel content and discards an in-flight message response', async () => {
    const { useChat } = await import('./use-chat'); const chat = useChat(); chat.initSocket();
    await chat.refreshChannelAccounts();
    chat.conversations.value = [channelRow]; chat.selectedConvId.value = channelRow.id;
    let resolveHistory: (value: unknown) => void = () => {};
    h.get.mockImplementation((path: string) => path.includes('/messages')
      ? new Promise(resolve => { resolveHistory = resolve; })
      : Promise.resolve({ data: { available: true, accounts: [] } }));
    const reading = chat.fetchMessages(channelRow.id);
    h.handlers.get('channel:access-revoked')!({ accountId: 'account-a' });
    resolveHistory({ data: { messages: [{ id: 'late', content: 'revoked', sentAt: new Date().toISOString(), contentType: 'text', senderType: 'contact' }] } });
    await reading;
    expect(chat.selectedConvId.value).toBeNull(); expect(chat.messages.value).toEqual([]); expect(chat.conversations.value).toEqual([]);
    chat.destroySocket();
  });
  it('clears stale channel views when refresh no longer returns the account', async () => {
    const { useChat } = await import('./use-chat'); const chat = useChat(); chat.initSocket();
    await chat.refreshChannelAccounts(); chat.conversations.value = [channelRow]; chat.selectedConvId.value = channelRow.id;
    h.get.mockResolvedValueOnce({ data: { available: true, accounts: [] } });
    await chat.refreshChannelAccounts();
    expect(chat.conversations.value).toEqual([]); expect(chat.selectedConvId.value).toBeNull();
    expect(h.emit).toHaveBeenCalledWith('channel:unsubscribe', { accountId: 'account-a', purpose: 'read' });
    chat.destroySocket();
  });
  it('does not reuse another CRM user message cache after an account switch', async () => {
    const { useChat } = await import('./use-chat');
    const first = useChat(); first.conversations.value = [channelRow]; first.selectedConvId.value = channelRow.id;
    h.get.mockResolvedValueOnce({ data: { messages: [{ id: 'private-a', content: 'User A content', contentType: 'text', senderType: 'contact', sentAt: '2026-10-13T00:00:00Z' }] } });
    await first.fetchMessages(channelRow.id);
    expect(first.messages.value).toHaveLength(1);
    h.user.id = 'user-b';
    const second = useChat(); second.conversations.value = [channelRow]; second.selectedConvId.value = channelRow.id;
    h.get.mockRejectedValueOnce(new Error('Not found'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await second.fetchMessages(channelRow.id);
    expect(second.messages.value).toEqual([]);
    log.mockRestore();
  });
});
