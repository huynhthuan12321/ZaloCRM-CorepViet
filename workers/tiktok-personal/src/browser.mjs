// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readThreadDocument } from './dom-reader.mjs';
import { openQrLogin } from './qr-login.mjs';

const conversationItem = '[data-e2e="dm-new-conversation-item"]';

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locators = page.locator(selector);
    const count = await locators.count();
    for (let index = 0; index < count; index++) {
      const locator = locators.nth(index);
      if (await locator.isVisible().catch(() => false)) return locator;
    }
  }
  return null;
}

async function qrDataUrl(page) {
  const candidates = [
    '[data-e2e*="qr" i] canvas',
    '[data-e2e*="qr" i] img',
    '[class*="qr" i] canvas',
    '[class*="qr" i] img',
  ];
  for (const selector of candidates) {
    const locator = await firstVisible(page, [selector]);
    if (!locator) continue;
    const box = await locator.boundingBox();
    if (!box || box.width < 120 || box.height < 120) continue;
    const png = await locator.screenshot({ type: 'png' });
    return `data:image/png;base64,${png.toString('base64')}`;
  }
  return undefined;
}

export async function launchTikTokBrowser(config) {
  await mkdir(config.profileDir, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: config.headless,
    acceptDownloads: false,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1000 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(config.messagesUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  async function observeSession() {
    const challenge = await page.getByText(/captcha|verify to continue|security verification/i)
      .first().isVisible().catch(() => false);
    if (challenge) return { state: 'challenge', observedAt: new Date().toISOString() };
    const authenticated = await page.locator(
      '[data-e2e="dm-new-conversation-list"],#main-content-messages',
    ).first().isVisible().catch(() => false);
    if (authenticated) {
      const identityUsername = await page.locator('a[href^="/@"]').evaluateAll((links, expected) => {
        const usernames = links.map(link => {
          try {
            return new URL(link.getAttribute('href'), location.origin).pathname.match(/^\/@([^/]+)\/?$/)?.[1];
          } catch { return undefined; }
        }).filter(Boolean);
        return usernames.find(username => username.toLowerCase() === expected.toLowerCase()) ?? null;
      }, config.expectedUsername).catch(() => null);
      if (!identityUsername) {
        return {
          state: 'error',
          errorCode: 'IDENTITY_NOT_OBSERVED',
          observedAt: new Date().toISOString(),
        };
      }
      return { state: 'authenticated', identityUsername, observedAt: new Date().toISOString() };
    }
    if (await openQrLogin(page).catch(() => false)) {
      await page.waitForURL(/\/login\/qrcode(?:\?|$)/, {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      }).catch(() => undefined);
      await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => undefined);
    }
    const qr = await qrDataUrl(page);
    return {
      state: qr ? 'qr_required' : 'expired',
      ...(qr ? { qrDataUrl: qr } : {}),
      observedAt: new Date().toISOString(),
    };
  }

  async function listThreads(limit) {
    await page.locator('[data-e2e="dm-new-conversation-list"]').waitFor({ timeout: 20_000 });
    return page.locator(conversationItem).evaluateAll((items, max) => items.slice(0, max).map(item => {
      const wrapper = item.closest('[data-conversation-id]');
      return {
        id: wrapper?.getAttribute('data-conversation-id') ?? item.getAttribute('data-conversation-id'),
      };
    }).filter(item => item.id), limit);
  }

  async function openThread(threadId) {
    const items = page.locator(conversationItem);
    const index = await items.evaluateAll((nodes, wanted) => nodes.findIndex(node =>
      (node.closest('[data-conversation-id]')?.getAttribute('data-conversation-id')
        ?? node.getAttribute('data-conversation-id')) === wanted), threadId);
    if (index < 0) throw new Error('TIKTOK_THREAD_NOT_FOUND');
    await items.nth(index).click({ timeout: 15_000 });
    await page.locator('[data-e2e="dm-new-message-list"]').waitFor({ timeout: 15_000 });
    return page.evaluate(readThreadDocument, config.expectedUsername);
  }

  async function send(command) {
    const snapshot = await openThread(command.threadId);
    const before = new Set(snapshot.messages.map(message => message.externalMessageId));
    const editor = await firstVisible(page, [
      '[data-e2e="dm-new-message-input"]',
      'textarea',
      'div[contenteditable="true"]',
    ]);
    if (!editor) {
      return { kind: 'rejected', errorCode: 'MESSAGE_EDITOR_UNAVAILABLE' };
    }
    await editor.fill(command.text);
    await editor.press('Enter');
    try {
      await page.waitForFunction(({ text, ids }) => {
        const known = new Set(ids);
        return Array.from(document.querySelectorAll('[data-e2e="dm-new-chat-item"]')).some(row => {
          const marker = row.querySelector('[id^="more-action-icon-msg-"]');
          const id = marker?.id.match(/^more-action-icon-msg-(\d+)$/)?.[1];
          const value = row.querySelector('[data-e2e="dm-new-message-text"]')?.textContent?.trim();
          return id && !known.has(id) && value === text;
        });
      }, { text: command.text, ids: [...before] }, { timeout: 10_000 });
      const after = await page.evaluate(readThreadDocument, config.expectedUsername);
      const matches = after.messages.filter(message =>
        !before.has(message.externalMessageId)
        && message.direction === 'self'
        && message.text === command.text);
      if (matches.length === 1) {
        return { kind: 'confirmed', externalMessageId: matches[0].externalMessageId };
      }
    } catch {
      // The click may already have sent. Never retry an uncertain browser send.
    }
    return { kind: 'unknown', errorCode: 'TIKTOK_SEND_CONFIRMATION_UNCERTAIN' };
  }

  return {
    page,
    context,
    observeSession,
    listThreads,
    openThread,
    send,
    close: () => context.close(),
  };
}
