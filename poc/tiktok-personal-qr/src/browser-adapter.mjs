// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
export async function launchMockBrowser({ origin, profile, headless = true }) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('LOOPBACK_ONLY');
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(profile, { headless, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort('blockedbyclient'));
  const page = context.pages()[0] ?? await context.newPage();
  try { await page.goto(url.origin); } catch (error) { await context.close(); throw error; }
  return { page, close: () => context.close(), snapshot: () => page.evaluate(() => ({ authenticated: document.body.dataset.authenticated === 'true', accountId: document.body.dataset.account || null, needsVerification: document.body.dataset.verification === 'true' })),
    messages: async () => {
      await page.click('#refresh-messages');
      await page.waitForFunction(() => document.getElementById('messages').dataset.loading === 'false');
      if (await page.locator('#messages').getAttribute('data-error')) throw Error('MESSAGE_READ_FAILED');
      return page.locator('#messages article').evaluateAll(rows => rows.map(row => ({
        id: row.dataset.id, accountId: row.dataset.account, threadId: row.dataset.thread,
        direction: row.dataset.direction, sentAt: row.dataset.sentAt, commandId: row.dataset.command || null,
        source: row.dataset.source, text: row.querySelector('p').textContent,
      })));
    },
    send: async ({ commandId, text, fault }) => {
      await page.fill('#command-id', commandId); await page.fill('#send-text', text);
      await page.selectOption('#send-fault', fault);
      await page.click('#send');
      await page.waitForFunction(id => document.getElementById('send-result').dataset.command === id, commandId, { timeout: 5000 });
      return JSON.parse(await page.locator('#send-result').textContent());
    },
  };
}
