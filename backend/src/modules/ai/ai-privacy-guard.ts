// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { prisma } from '../../shared/database/prisma-client.js';
import { canSeeConversationContent, type PrivacyContext } from '../privacy/redact.js';
import { config } from '../../config/index.js';

const AI_DATA_GRANT_BRAND: unique symbol = Symbol('AiDataGrant');

export type AiDataScope = 'conversation' | 'crm_note' | 'operator_text' | 'knowledge';
export type AiEvalDataSource = 'technical' | 'security' | 'approved_golden' | 'synthetic';
export type AiDataPurpose =
  | 'reply'
  | 'summary'
  | 'sentiment'
  | 'auto_reply'
  | 'followup'
  | 'virtual_chat'
  | 'customer_summary'
  | 'rag_answer'
  | 'appointment_parse'
  | 'format_rich'
  | 'eval';

export type AiDataActor =
  | { mode: 'background' }
  | { mode: 'user'; privacyContext: PrivacyContext };

export type AiDataGrant = Readonly<{
  [AI_DATA_GRANT_BRAND]: true;
  orgId: string;
  scope: AiDataScope;
  purpose: AiDataPurpose;
  actorMode: AiDataActor['mode'];
  conversationId?: string;
  evalDataSource?: AiEvalDataSource;
}>;

export class AiPrivacyDeniedError extends Error {
  code = 'AI_PRIVACY_DENIED';

  constructor(message = 'AI data access denied') {
    super(message);
    this.name = 'AiPrivacyDeniedError';
  }
}

export function assertAiDataGrant(grant: AiDataGrant, orgId: string): void {
  if (!grant || grant[AI_DATA_GRANT_BRAND] !== true || grant.orgId !== orgId) {
    throw new AiPrivacyDeniedError('Invalid AI data grant');
  }
}

export async function authorizeAiData(input: {
  orgId: string;
  scope: AiDataScope;
  purpose: AiDataPurpose;
  actor: AiDataActor;
  conversationId?: string;
  evalDataSource?: AiEvalDataSource;
}): Promise<AiDataGrant> {
  if (!input.orgId || !input.scope || !input.purpose) throw new AiPrivacyDeniedError();

  if (input.purpose === 'eval') {
    if (config.nodeEnv === 'production' || config.isProduction) {
      throw new AiPrivacyDeniedError('Evaluation AI access is denied in production');
    }
    if (!config.promptfooEvalEnabled) throw new AiPrivacyDeniedError('Promptfoo evaluation is disabled');
    if (!config.promptfooEvalOrgId) throw new AiPrivacyDeniedError('Promptfoo evaluation organization is not configured');
    if (input.orgId !== config.promptfooEvalOrgId) throw new AiPrivacyDeniedError('Promptfoo evaluation organization mismatch');
    if (input.actor.mode !== 'background') throw new AiPrivacyDeniedError('Promptfoo evaluation requires a background actor');
    if (!input.evalDataSource) throw new AiPrivacyDeniedError('Promptfoo evaluation data source is required');
    if (input.scope === 'conversation' || input.conversationId) {
      throw new AiPrivacyDeniedError('Promptfoo evaluation cannot access conversation data');
    }
    return Object.freeze({
      [AI_DATA_GRANT_BRAND]: true as const,
      orgId: input.orgId,
      scope: input.scope,
      purpose: input.purpose,
      actorMode: input.actor.mode,
      evalDataSource: input.evalDataSource,
    });
  }

  if (input.scope === 'conversation') {
    if (!input.conversationId) throw new AiPrivacyDeniedError('conversationId is required for AI conversation access');
    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId, orgId: input.orgId },
      select: {
        id: true,
        zaloAccount: { select: { privacyMode: true, ownerUserId: true } },
      },
    });
    if (!conversation) throw new AiPrivacyDeniedError('Conversation not found');
    if (conversation.zaloAccount.privacyMode === 'main' && input.actor.mode === 'background') {
      throw new AiPrivacyDeniedError('Background AI cannot access private main-nick conversation content');
    }
    if (input.actor.mode === 'user' && !canSeeConversationContent(conversation as any, input.actor.privacyContext)) {
      throw new AiPrivacyDeniedError('Private conversation is locked for this user');
    }
    return Object.freeze({
      [AI_DATA_GRANT_BRAND]: true as const,
      orgId: input.orgId,
      scope: input.scope,
      purpose: input.purpose,
      actorMode: input.actor.mode,
      conversationId: input.conversationId,
    });
  }

  if (input.conversationId) throw new AiPrivacyDeniedError('conversationId is only valid for conversation scope');
  return Object.freeze({
    [AI_DATA_GRANT_BRAND]: true as const,
    orgId: input.orgId,
    scope: input.scope,
    purpose: input.purpose,
    actorMode: input.actor.mode,
  });
}
