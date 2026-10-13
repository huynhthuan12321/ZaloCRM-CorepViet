// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { TikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import type { ChannelCapabilities } from './channel-types.js';

export interface ChannelExtensionPolicy {
  manualText: boolean;
  inboundImage: boolean;
  outboundImage: boolean;
  canInitiate: false;
  aiAutoSend: false;
  automation: false;
  broadcast: false;
}

/**
 * TT10 deny-by-default gate. Environment flags cannot manufacture a provider
 * capability, and automation/broadcast remain unavailable for Personal.
 */
export function channelExtensionPolicy(
  capabilities: ChannelCapabilities,
  cfg: TikTokPersonalConfig,
): ChannelExtensionPolicy {
  return {
    manualText: capabilities.textSend,
    inboundImage: cfg.effective.media && capabilities.imageRead,
    outboundImage: cfg.effective.media && capabilities.imageSend,
    canInitiate: false,
    aiAutoSend: false,
    automation: false,
    broadcast: false,
  };
}
