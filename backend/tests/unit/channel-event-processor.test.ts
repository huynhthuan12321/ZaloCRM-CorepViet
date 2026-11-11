// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  locate: vi.fn(),
  lock: vi.fn(),
  account: vi.fn(),
  eventUpdate: vi.fn(),
  conversationFind: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFind: vi.fn(),
  messageCreate: vi.fn(),
  contactUpdate: vi.fn(),
  contact: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { channelEvent: { findUnique: h.locate, findMany: vi.fn() } },
  tenantTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    $queryRaw: h.lock,
    channelAccount: { findFirst: h.account },
    channelEvent: { update: h.eventUpdate },
    conversation: {
      findUnique: h.conversationFind,
      create: h.conversationCreate,
      update: h.conversationUpdate,
    },
    message: { findUnique: h.messageFind, create: h.messageCreate },
    contact: { update: h.contactUpdate },
  }),
}));
vi.mock('../../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
  withTenant: (_orgId: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../src/modules/channels/contact-identity.service.js', () => ({
  resolveChannelContact: h.contact,
}));
vi.mock('../../src/modules/channels/channel-socket.js', () => ({
  emitAuthorizedChannelEvent: h.emit,
}));

import { parseChannelObservation, processChannelEvent } from '../../src/modules/channels/channel-event-processor.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const payload = {
  version: 1,
  eventKey: 'mock:thread-1:message-1',
  accountId,
  epoch: '3',
  kind: 'message.observed',
  observedAt: '2026-10-13T01:01:00.000Z',
  thread: { id: 'thread-1', displayName: 'Khách thử' },
  sender: { externalUserId: 'customer-1', displayName: 'Khách thử' },
  message: {
    id: 'message-1',
    direction: 'inbound',
    text: 'Tin inbound TT05',
    sentAt: '2026-10-13T01:00:00.000Z',
  },
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  h.locate.mockResolvedValue({ id: 'event-1', orgId: 'org-1' });
  h.lock.mockResolvedValue([{
    id: 'event-1',
    org_id: 'org-1',
    channel_account_id: accountId,
    payload,
    status: 'PENDING',
  }]);
  h.account.mockResolvedValue({
    id: accountId,
    enabled: true,
    inboundEnabled: true,
    status: 'CONNECTED',
    session: { epoch: 3n },
  });
  h.contact.mockResolvedValue({ id: 'contact-1' });
  h.conversationFind.mockResolvedValue(null);
  h.conversationCreate.mockResolvedValue({ id: 'conversation-1', contactId: 'contact-1' });
  h.messageFind.mockResolvedValue(null);
  h.messageCreate.mockResolvedValue({ id: 'message-db-1' });
  h.eventUpdate.mockResolvedValue({});
  h.conversationUpdate.mockResolvedValue({});
  h.contactUpdate.mockResolvedValue({});
  h.emit.mockResolvedValue(undefined);
});

describe('channel event processor', () => {
  it('validates the normalized envelope without accepting hidden fields', () => {
    expect(parseChannelObservation(payload).message.id).toBe('message-1');
    expect(() => parseChannelObservation({ ...payload, cookie: 'secret' })).toThrow();
    expect(() => parseChannelObservation({ ...payload, epoch: '-1' })).toThrow();
  });

  it('persists one inbound text, updates unread/contact state and emits after commit', async () => {
    const io = {} as never;
    await expect(processChannelEvent('event-1', io)).resolves.toMatchObject({
      state: 'processed',
      accountId,
      conversationId: 'conversation-1',
      messageId: 'message-db-1',
    });
    expect(h.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orgId: 'org-1',
        externalMessageId: 'message-1',
        senderType: 'contact',
        content: 'Tin inbound TT05',
      }),
    }));
    expect(h.conversationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ unreadCount: { increment: 1 }, isReplied: false }),
    }));
    expect(h.contactUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalInbound: { increment: 1 } }),
    }));
    expect(h.emit).toHaveBeenCalledWith(expect.objectContaining({
      event: 'channel:message',
      purpose: 'read',
      accountId,
    }));
  });

  it('deduplicates by platform message ID without incrementing unread twice', async () => {
    h.conversationFind.mockResolvedValue({ id: 'conversation-1', contactId: 'contact-1' });
    h.messageFind.mockResolvedValue({ id: 'message-db-1' });
    await expect(processChannelEvent('event-1')).resolves.toMatchObject({ state: 'duplicate' });
    expect(h.messageCreate).not.toHaveBeenCalled();
    expect(h.conversationUpdate).not.toHaveBeenCalled();
    expect(h.contactUpdate).not.toHaveBeenCalled();
  });

  it('rejects a stale worker epoch before creating identity or message data', async () => {
    h.account.mockResolvedValue({
      id: accountId,
      enabled: true,
      inboundEnabled: true,
      status: 'CONNECTED',
      session: { epoch: 4n },
    });
    await expect(processChannelEvent('event-1')).resolves.toEqual({ state: 'ignored' });
    expect(h.contact).not.toHaveBeenCalled();
    expect(h.messageCreate).not.toHaveBeenCalled();
    expect(h.eventUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IGNORED_STALE_EPOCH' }),
    }));
  });
});
