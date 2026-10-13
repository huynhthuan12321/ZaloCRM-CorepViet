// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/** New-channel contract only; Zalo DTO/transport remains unchanged in TT-04A. */
export type BrowserChannelProvider = 'MOCK_BROWSER' | 'TIKTOK_WEB_SESSION';
export interface ChannelCapabilities {
  readonly textRead: boolean;
  readonly textSend: boolean;
  readonly imageRead: boolean;
  readonly imageSend: boolean;
  readonly canInitiate: false;
  readonly stableMessageId: boolean;
  readonly nativeSelfSync: boolean;
  readonly history: 'none' | 'partial' | 'verified';
  readonly reliableSendConfirmation: boolean;
  readonly aiAutoSend: false;
  readonly automation: false;
  readonly broadcast: false;
}
export interface ChannelObservation {
  eventId: string;
  accountId: string;
  epoch: number;
  threadId: string;
  externalMessageId?: string;
  externalClientId?: string;
  externalUserId?: string;
  direction: 'inbound' | 'self';
  platformSentAt?: string;
  observedAt: string;
  text: string;
}
export type ChannelSendOutcome =
  | { kind: 'confirmed'; externalMessageId: string; evidence: string }
  | { kind: 'rejected'; errorCode: string }
  | { kind: 'unknown'; errorCode: string };
export interface ChannelSendCommand {
  commandId: string;
  accountId: string;
  epoch: number;
  threadId: string;
  text: string;
}
/** Interface only: no runtime adapter, queue, registration or live endpoints. */
export interface BrowserChannelAdapter {
  readonly provider: BrowserChannelProvider;
  readonly capabilities: ChannelCapabilities;
  send(command: ChannelSendCommand): Promise<ChannelSendOutcome>;
}
