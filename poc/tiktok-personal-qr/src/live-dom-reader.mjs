// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/** Pure DOM observer. No navigation, clicking, cookies, network or hidden state.
 * IDs/selectors were observed on the selected TikTok Web thread 13/10/2026.
 * A caller must explicitly choose a thread; this function never chooses one.
 */
export function readSelectedThread(document, { expectedUsername, expectedPeerUsername, includeText = false } = {}) {
  if (!/^[A-Za-z0-9_.]+$/.test(expectedUsername ?? '')) throw Error('EXPECTED_ACCOUNT_REQUIRED');
  const usernameFromLink = href => {
    try { const url = new URL(href, 'https://www.tiktok.com'); return ['www.tiktok.com', 'tiktok.com'].includes(url.hostname) ? url.pathname.match(/^\/@([^/]+)$/)?.[1] ?? null : null; }
    catch { return null; }
  };
  const ownProfile = Array.from(document.querySelectorAll('a[href]')).some(a => !a.closest('#main-content-messages') && usernameFromLink(a.getAttribute('href')) === expectedUsername);
  if (!ownProfile) throw Error('ACCOUNT_NOT_OBSERVED');
  const root = document.getElementById('main-content-messages');
  const list = root?.querySelector('[data-e2e="dm-new-message-list"]');
  if (!list) return { status: 'no_selected_thread', messages: [], issues: [], scope: 'rendered_dom_only' };
  const peerUsername = usernameFromLink(root.querySelector('a[href]')?.getAttribute('href'));
  if (expectedPeerUsername && peerUsername !== expectedPeerUsername) throw Error('SELECTED_THREAD_MISMATCH');
  const issues = [], messages = [], seen = new Set();
  for (const row of list.querySelectorAll('[data-e2e="dm-new-chat-item"]')) {
    const markers = row.querySelectorAll('[id^="more-action-icon-msg-"]');
    const id = markers.length === 1 ? markers[0].id.match(/^more-action-icon-msg-(\d+)$/)?.[1] : null;
    if (!id) { issues.push('MESSAGE_ID_MISSING_OR_AMBIGUOUS'); continue; }
    if (seen.has(id)) { issues.push('DUPLICATE_MESSAGE_ID'); continue; }
    seen.add(id);
    const senders = new Set(Array.from(row.querySelectorAll('a[href]')).map(a => usernameFromLink(a.getAttribute('href'))).filter(Boolean));
    const sender = senders.size === 1 ? [...senders][0] : null;
    const textNodes = row.querySelectorAll('[data-e2e="dm-new-message-text"]');
    const text = textNodes.length === 1 ? textNodes[0].textContent : null;
    const normalizedText = (text ?? '').trim().replace(/\s+/g, ' ');
    const unsupported = /^\[?This message type isn.t supported\. Download TikTok app to view this message\.\]?$/.test(normalizedText);
    if (!sender) issues.push('SENDER_UNKNOWN_OR_AMBIGUOUS');
    if (textNodes.length !== 1 || unsupported) issues.push('TEXT_UNSUPPORTED_OR_AMBIGUOUS');
    messages.push({ externalMessageId: id,
      direction: !sender ? 'unknown' : sender === expectedUsername ? 'self' : 'inbound',
      contentType: textNodes.length === 1 && !unsupported ? 'text' : 'unsupported',
      text: includeText && textNodes.length === 1 && !unsupported ? text : null,
    });
  }
  return { status: issues.length ? 'partial' : 'observed', accountUsername: expectedUsername, peerUsername, messages, issues, scope: 'rendered_dom_only' };
}
