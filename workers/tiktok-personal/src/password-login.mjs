// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc

const phonePattern = /^\+?[\d\s().-]{7,24}$/;

export function passwordLoginKind(identifier) {
  return phonePattern.test(identifier.trim()) ? 'phone' : 'email_or_username';
}

async function pause(page, milliseconds) {
  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(milliseconds);
    return;
  }
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function clickVisible(page, candidates, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const candidate of candidates) {
      if (!await candidate.isVisible().catch(() => false)) continue;
      await candidate.click({ timeout: 10_000 });
      return true;
    }
    if (Date.now() < deadline) await pause(page, 250);
  } while (Date.now() < deadline);
  return false;
}

export async function openPasswordLogin(page, credentials) {
  await page.goto('https://www.tiktok.com/login?lang=en', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const opened = await clickVisible(page, [
    page.getByText(/^use phone \/ email \/ username$/i).first(),
    page.getByRole('link', { name: /use phone.*email.*username/i }).first(),
  ]);
  if (!opened) throw Error('TIKTOK_PASSWORD_LOGIN_CHOICE_UNAVAILABLE');

  const kind = passwordLoginKind(credentials.identifier);
  if (kind === 'phone') {
    const passwordMode = await clickVisible(page, [
      page.getByText(/^log in with password$/i).first(),
      page.getByRole('button', { name: /^log in with password$/i }).first(),
    ]);
    if (!passwordMode) throw Error('TIKTOK_PHONE_PASSWORD_MODE_UNAVAILABLE');
    const identifierInput = page.locator('input[name="mobile"]').first();
    await identifierInput.waitFor?.({ state: 'visible', timeout: 15_000 });
    await identifierInput.fill(credentials.identifier);
  } else {
    const emailMode = await clickVisible(page, [
      page.getByText(/^log in with email or username$/i).first(),
      page.getByRole('link', { name: /^log in with email or username$/i }).first(),
    ]);
    if (!emailMode) throw Error('TIKTOK_EMAIL_LOGIN_MODE_UNAVAILABLE');
    const identifierInput = page.locator('input[name="username"]').first();
    await identifierInput.waitFor?.({ state: 'visible', timeout: 15_000 });
    await identifierInput.fill(credentials.identifier);
  }

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor?.({ state: 'visible', timeout: 15_000 });
  await passwordInput.fill(credentials.password);
  const submit = page.locator('[data-e2e="login-button"], button[type="submit"]').first();
  await submit.waitFor?.({ state: 'visible', timeout: 15_000 });
  await submit.click({ timeout: 10_000 });
  await pause(page, 1_500);
}
