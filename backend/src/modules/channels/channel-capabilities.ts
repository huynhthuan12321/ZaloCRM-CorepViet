// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { TikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import type { BrowserChannelProvider, ChannelCapabilities } from './channel-types.js';
const NONE: ChannelCapabilities = Object.freeze({
  textRead: false, textSend: false, imageRead: false, imageSend: false, canInitiate: false,
  stableMessageId: false, nativeSelfSync: false, history: 'none',
  reliableSendConfirmation: false, aiAutoSend: false, automation: false, broadcast: false,
});
/** Capabilities describe the local fixture, never evidence for a live account. */
const MOCK: ChannelCapabilities = Object.freeze({
  textRead: true, textSend: true, imageRead: false, imageSend: false, canInitiate: false,
  stableMessageId: true, nativeSelfSync: true, history: 'partial',
  reliableSendConfirmation: true, aiAutoSend: false, automation: false, broadcast: false,
});
export function browserChannelCapabilities(provider: BrowserChannelProvider, cfg: TikTokPersonalConfig): ChannelCapabilities {
  return provider === 'MOCK_BROWSER' && cfg.effective.mock ? MOCK : NONE;
}
