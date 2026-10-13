// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { emitAuthorizedChannelEvent } from './channel-socket.js';

export type WorkerResult =
  | { kind: 'confirmed'; externalMessageId: string }
  | { kind: 'rejected'; errorCode: string }
  | { kind: 'unknown'; errorCode: string };

export async function claimOutboundCommand(accountId: string, epoch: bigint) {
  const account = await runSystemQuery(() => prisma.channelAccount.findFirst({
    where: {
      id: accountId,
      provider: 'MOCK_BROWSER',
      enabled: true,
      outboundEnabled: true,
      status: 'CONNECTED',
      session: { epoch },
    },
    select: { id: true, orgId: true },
  }));
  if (!account) return null;

  return withTenant(account.orgId, () => tenantTransaction(async tx => {
    const claimed = await tx.$queryRaw<Array<{
      id: string; conversation_id: string; text: string; external_thread_id: string;
    }>>(Prisma.sql`
      WITH candidate AS (
        SELECT oc.id
        FROM outbound_commands oc
        JOIN channel_accounts ca ON ca.id = oc.channel_account_id AND ca.org_id = oc.org_id
        JOIN browser_session_refs bs ON bs.channel_account_id = ca.id AND bs.org_id = ca.org_id
        WHERE oc.channel_account_id = ${accountId}
          AND oc.org_id = ${account.orgId}
          AND oc.status = 'PENDING'
          AND ca.provider = 'MOCK_BROWSER'
          AND ca.enabled = true
          AND ca.outbound_enabled = true
          AND ca.status = 'CONNECTED'
          AND bs.epoch = ${epoch}
        ORDER BY oc.created_at ASC
        FOR UPDATE OF oc SKIP LOCKED
        LIMIT 1
      )
      UPDATE outbound_commands oc
      SET status = 'PROCESSING', epoch = ${epoch}, submitted_at = NOW(), updated_at = NOW()
      FROM candidate, conversations c
      WHERE oc.id = candidate.id
        AND c.id = oc.conversation_id
        AND c.org_id = oc.org_id
        AND c.channel_account_id = oc.channel_account_id
      RETURNING oc.id, oc.conversation_id, oc.text, c.external_thread_id
    `);
    const row = claimed[0];
    if (!row) return null;
    await tx.message.updateMany({
      where: { conversationId: row.conversation_id, clientEchoId: row.id },
      data: { channelSendState: 'PROCESSING' },
    });
    return {
      commandId: row.id,
      accountId,
      epoch: epoch.toString(),
      threadId: row.external_thread_id,
      text: row.text,
    };
  }));
}

export async function resolveOutboundCommand(args: {
  accountId: string; commandId: string; epoch: bigint; result: WorkerResult; io?: Server;
}) {
  const located = await runSystemQuery(() => prisma.outboundCommand.findFirst({
    where: { id: args.commandId, channelAccountId: args.accountId },
    select: { orgId: true },
  }));
  if (!located) return { state: 'not_found' as const };

  const resolved = await withTenant(located.orgId, () => tenantTransaction(async tx => {
    const rows = await tx.$queryRaw<Array<{
      id: string; status: string; epoch: bigint | null; conversation_id: string;
      external_message_id: string | null;
    }>>(Prisma.sql`
      SELECT id, status, epoch, conversation_id, external_message_id
      FROM outbound_commands
      WHERE id = ${args.commandId}
        AND channel_account_id = ${args.accountId}
        AND org_id = ${located.orgId}
      FOR UPDATE
    `);
    const command = rows[0];
    if (!command) return { state: 'not_found' as const };
    const finalStatus = args.result.kind === 'confirmed' ? 'CONFIRMED'
      : args.result.kind === 'rejected' ? 'FAILED' : 'UNKNOWN';
    if (['CONFIRMED', 'FAILED', 'UNKNOWN'].includes(command.status)) {
      const same = command.status === finalStatus
        && (args.result.kind !== 'confirmed' || command.external_message_id === args.result.externalMessageId);
      return { state: same ? 'duplicate' as const : 'conflict' as const };
    }
    if (command.status !== 'PROCESSING' || command.epoch !== args.epoch) {
      return { state: 'stale' as const };
    }
    const externalMessageId = args.result.kind === 'confirmed' ? args.result.externalMessageId : null;
    const errorCode = args.result.kind === 'confirmed' ? null : args.result.errorCode;
    await tx.outboundCommand.update({
      where: { id: command.id },
      data: { status: finalStatus, externalMessageId, resolvedAt: new Date() },
    });
    const message = await tx.message.findUnique({
      where: {
        conversationId_clientEchoId: {
          conversationId: command.conversation_id,
          clientEchoId: command.id,
        },
      },
      select: { id: true },
    });
    if (!message) throw new Error('OUTBOUND_MESSAGE_MISSING');
    await tx.message.update({
      where: { id: message.id },
      data: {
        channelSendState: finalStatus,
        externalMessageId,
        observedAt: args.result.kind === 'confirmed' ? new Date() : undefined,
        metadata: errorCode ? { channel: 'mock_browser', errorCode } : { channel: 'mock_browser' },
      },
    });
    return {
      state: 'resolved' as const,
      orgId: located.orgId,
      conversationId: command.conversation_id,
      messageId: message.id,
    };
  }));
  if (args.io && resolved.state === 'resolved') {
    await emitAuthorizedChannelEvent({
      io: args.io,
      orgId: resolved.orgId,
      accountId: args.accountId,
      purpose: 'read',
      event: 'channel:message',
      payload: { conversationId: resolved.conversationId, messageId: resolved.messageId },
    });
  }
  return resolved;
}

export async function reapStaleOutboundCommands(olderThan = new Date(Date.now() - 60_000), io?: Server) {
  const stale = await runSystemQuery(() => prisma.outboundCommand.findMany({
    where: {
      status: 'PROCESSING',
      submittedAt: { lt: olderThan },
      account: { provider: 'MOCK_BROWSER' },
    },
    select: { id: true, orgId: true, channelAccountId: true, conversationId: true },
    take: 100,
  }));
  let count = 0;
  for (const command of stale) {
    const changed = await withTenant(command.orgId, () => tenantTransaction(async tx => {
      const update = await tx.outboundCommand.updateMany({
        where: { id: command.id, status: 'PROCESSING', submittedAt: { lt: olderThan } },
        data: { status: 'UNKNOWN', resolvedAt: new Date() },
      });
      if (!update.count) return false;
      await tx.message.updateMany({
        where: { conversationId: command.conversationId, clientEchoId: command.id },
        data: {
          channelSendState: 'UNKNOWN',
          metadata: { channel: 'mock_browser', errorCode: 'WORKER_RESULT_TIMEOUT' },
        },
      });
      return true;
    }));
    if (!changed) continue;
    count++;
    if (io) await emitAuthorizedChannelEvent({
      io,
      orgId: command.orgId,
      accountId: command.channelAccountId,
      purpose: 'read',
      event: 'channel:message',
      payload: { conversationId: command.conversationId },
    });
  }
  return count;
}
