// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { TxClient } from '../../shared/database/prisma-client.js';

export interface ChannelIdentityInput {
  orgId: string;
  channelAccountId: string;
  externalUserId: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Resolve only inside one channel account. Names and avatars are presentation
 * data and never merge a TikTok/mock identity with an existing Zalo contact.
 */
export async function resolveChannelContact(tx: TxClient, input: ChannelIdentityInput) {
  const existing = await tx.contactIdentity.findUnique({
    where: {
      channelAccountId_externalUserId: {
        channelAccountId: input.channelAccountId,
        externalUserId: input.externalUserId,
      },
    },
    include: { contact: true },
  });
  if (existing) return existing.contact;

  const contact = await tx.contact.create({
    data: {
      orgId: input.orgId,
      fullName: input.displayName?.trim() || null,
      avatarUrl: input.avatarUrl?.trim() || null,
      source: 'TT',
      metadata: { channel: 'mock_browser', externalUserId: input.externalUserId },
      lastActivity: new Date(),
    },
  });
  await tx.contactIdentity.create({
    data: {
      orgId: input.orgId,
      channelAccountId: input.channelAccountId,
      contactId: contact.id,
      externalUserId: input.externalUserId,
    },
  });
  return contact;
}
