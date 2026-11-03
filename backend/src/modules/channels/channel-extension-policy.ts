// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
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
 * Deny-by-default gate. Environment flags cannot manufacture a provider
 * capability, and automation/broadcast remain unavailable for mock channels.
 */
export function channelExtensionPolicy(
  capabilities: ChannelCapabilities,
): ChannelExtensionPolicy {
  return {
    manualText: capabilities.textSend,
    inboundImage: false,
    outboundImage: false,
    canInitiate: false,
    aiAutoSend: false,
    automation: false,
    broadcast: false,
  };
}
