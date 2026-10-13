// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  conversation: vi.fn(),
  access: vi.fn(),
  existingCommand: vi.fn(),
  existingMessage: vi.fn(),
  createCommand: vi.fn(),
  createMessage: vi.fn(),
  updateConversation: vi.fn(),
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: { conversation: { findFirst: h.conversation } },
  tenantTransaction: async (fn: Function) => fn({
    outboundCommand: { findUnique: h.existingCommand, create: h.createCommand },
    message: { findUnique: h.existingMessage, create: h.createMessage },
    conversation: { update: h.updateConversation },
  }),
}));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: '00000000-0000-4000-8000-000000000011', orgId: 'org-a' };
  },
}));
vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => {} }));
vi.mock('../../src/modules/channels/channel-scope.js', () => ({ hasChannelAccess: h.access }));
vi.mock('../../src/modules/channels/outbound-command-service.js', () => ({
  claimOutboundCommand: vi.fn(),
  resolveOutboundCommand: vi.fn(),
}));

import { channelOutboundRoutes } from '../../src/modules/channels/outbound-command-routes.js';

const account = {
  id: '00000000-0000-4000-8000-000000000081',
  provider: 'MOCK_BROWSER',
  enabled: true,
  outboundEnabled: true,
  status: 'CONNECTED',
  session: { epoch: 2n },
};
const conversation = { id: '00000000-0000-4000-8000-000000000091', channelAccount: account };
const payload = {
  text: 'TT06 outbound',
  idempotencyKey: '00000000-0000-4000-8000-000000000301',
};
let app: FastifyInstance;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CHANNELS_ENABLED', 'true');
  vi.stubEnv('MOCK_CHANNEL_ENABLED', 'true');
  h.conversation.mockResolvedValue(conversation);
  h.access.mockResolvedValue(true);
  h.existingCommand.mockResolvedValue(null);
  h.createCommand.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000401' });
  h.createMessage.mockResolvedValue({ id: 'message-a', content: payload.text, channelSendState: 'PENDING' });
  h.updateConversation.mockResolvedValue({});
  app = Fastify();
  await app.register(channelOutboundRoutes);
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

describe('TT06 channel outbox route', () => {
  it('writes a pending command and message before returning', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/channel-inbox/${conversation.id}/messages`,
      payload,
    });
    expect(response.statusCode).toBe(202);
    expect(h.createCommand).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', idempotencyKey: payload.idempotencyKey }),
    }));
    expect(h.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ channelSendState: 'PENDING', content: payload.text }),
    }));
  });

  it('fails closed when chat permission is missing', async () => {
    h.access.mockResolvedValue(false);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/channel-inbox/${conversation.id}/messages`,
      payload,
    });
    expect(response.statusCode).toBe(404);
    expect(h.createCommand).not.toHaveBeenCalled();
  });

  it('returns the existing message for the same key and rejects a changed payload', async () => {
    h.existingCommand.mockResolvedValue({
      id: 'command-existing',
      text: payload.text,
      conversationId: conversation.id,
    });
    h.existingMessage.mockResolvedValue({ id: 'message-existing', channelSendState: 'PENDING' });
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/channel-inbox/${conversation.id}/messages`,
      payload,
    });
    expect(retry.statusCode).toBe(200);
    expect(h.createCommand).not.toHaveBeenCalled();

    h.existingCommand.mockResolvedValue({
      id: 'command-existing',
      text: 'different',
      conversationId: conversation.id,
    });
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/channel-inbox/${conversation.id}/messages`,
      payload,
    });
    expect(conflict.statusCode).toBe(409);
  });
});
