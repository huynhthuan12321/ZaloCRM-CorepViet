// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc

async function pause(page, milliseconds) {
  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(milliseconds);
    return;
  }
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function openQrLogin(page, options = {}) {
  // Observing an existing QR must not click its wrapper/refresh controls.
  if (typeof page.url === 'function'
    && new URL(page.url()).pathname.replace(/\/$/, '') === '/login/qrcode') return false;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollMs = options.pollMs ?? 250;
  const candidates = [
    page.getByRole('button', { name: /^use qr code$/i }).first(),
    page.getByText(/^use qr code$/i).first(),
    page.locator('a[href*="/login/qrcode"]').first(),
  ];
  const deadline = Date.now() + timeoutMs;
  do {
    for (const candidate of candidates) {
      if (!await candidate.isVisible().catch(() => false)) continue;
      await candidate.click({ timeout: 10_000 });
      return true;
    }
    if (Date.now() < deadline) await pause(page, pollMs);
  } while (Date.now() < deadline);
  return false;
}
