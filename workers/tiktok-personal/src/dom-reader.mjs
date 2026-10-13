// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
export function normalizeUsernameFromHref(href) {
  try {
    const url = new URL(href, 'https://www.tiktok.com');
    if (!['www.tiktok.com', 'tiktok.com'].includes(url.hostname)) return null;
    return url.pathname.match(/^\/@([^/]+)\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function readThreadDocument(document, expectedUsername) {
  // page.evaluate passes the username as its single argument. Node fixtures
  // pass an explicit document. Support both without serializing a closure.
  if (typeof document === 'string') {
    expectedUsername = document;
    document = globalThis.document;
  }
  // Playwright serializes this function into the page. Keep its helpers inside
  // the function so it does not depend on the Node.js module scope.
  const usernameFromHref = (href) => {
    try {
      const url = new URL(href, 'https://www.tiktok.com');
      if (!['www.tiktok.com', 'tiktok.com'].includes(url.hostname)) return null;
      return url.pathname.match(/^\/@([^/]+)\/?$/)?.[1] ?? null;
    } catch {
      return null;
    }
  };
  const root = document.getElementById('main-content-messages');
  const list = root?.querySelector('[data-e2e="dm-new-message-list"]');
  if (!root || !list) return { status: 'not_ready', thread: null, messages: [] };
  const peerLink = Array.from(root.querySelectorAll('a[href]'))
    .map(element => ({
      username: usernameFromHref(element.getAttribute('href')),
      label: element.textContent?.trim() || undefined,
    }))
    .find(value => value.username && value.username.toLowerCase() !== expectedUsername.toLowerCase());
  const selected = document.querySelector(
    '[data-e2e="dm-new-conversation-item"][aria-selected="true"],'
    + '[data-e2e="dm-new-conversation-item"][data-selected="true"]',
  );
  const wrapper = selected?.closest('[data-conversation-id]');
  const threadId = wrapper?.getAttribute('data-conversation-id')
    ?? root.getAttribute('data-conversation-id')
    ?? null;
  if (!threadId) return { status: 'not_ready', thread: null, messages: [] };
  const messages = [];
  const seen = new Set();
  for (const row of list.querySelectorAll('[data-e2e="dm-new-chat-item"]')) {
    const marker = row.querySelector('[id^="more-action-icon-msg-"]');
    const externalMessageId = marker?.id.match(/^more-action-icon-msg-(\d+)$/)?.[1] ?? null;
    if (!externalMessageId || seen.has(externalMessageId)) continue;
    seen.add(externalMessageId);
    const senders = new Set(Array.from(row.querySelectorAll('a[href]'))
      .map(element => usernameFromHref(element.getAttribute('href')))
      .filter(Boolean));
    const sender = senders.size === 1 ? [...senders][0] : null;
    const textNode = row.querySelector('[data-e2e="dm-new-message-text"]');
    const text = textNode?.textContent?.trim() ?? '';
    const unsupported = /^\[?This message type isn.t supported\./i.test(text);
    if (!sender || !text || unsupported) continue;
    messages.push({
      externalMessageId,
      direction: sender.toLowerCase() === expectedUsername.toLowerCase() ? 'self' : 'inbound',
      text,
    });
  }
  return {
    status: 'observed',
    thread: {
      id: threadId,
      peerUsername: peerLink?.username ?? null,
      displayName: peerLink?.label ?? peerLink?.username ?? undefined,
    },
    messages,
  };
}
