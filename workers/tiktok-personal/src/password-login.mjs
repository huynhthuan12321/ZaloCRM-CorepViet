// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc

const phonePattern = /^\+?[\d\s().-]{7,24}$/;

export function passwordLoginKind(identifier) {
  return phonePattern.test(identifier.trim()) ? 'phone' : 'email_or_username';
}

async function clickVisible(candidates) {
  for (const candidate of candidates) {
    if (!await candidate.isVisible().catch(() => false)) continue;
    await candidate.click({ timeout: 10_000 });
    return true;
  }
  return false;
}

export async function openPasswordLogin(page, credentials) {
  await page.goto('https://www.tiktok.com/login?lang=en', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const opened = await clickVisible([
    page.getByText(/^use phone \/ email \/ username$/i).first(),
    page.getByRole('link', { name: /use phone.*email.*username/i }).first(),
  ]);
  if (!opened) throw Error('TIKTOK_PASSWORD_LOGIN_CHOICE_UNAVAILABLE');

  const kind = passwordLoginKind(credentials.identifier);
  if (kind === 'phone') {
    const passwordMode = await clickVisible([
      page.getByText(/^log in with password$/i).first(),
      page.getByRole('button', { name: /^log in with password$/i }).first(),
    ]);
    if (!passwordMode) throw Error('TIKTOK_PHONE_PASSWORD_MODE_UNAVAILABLE');
    await page.locator('input[name="mobile"]').first().fill(credentials.identifier);
  } else {
    const emailMode = await clickVisible([
      page.getByText(/^log in with email or username$/i).first(),
      page.getByRole('link', { name: /^log in with email or username$/i }).first(),
    ]);
    if (!emailMode) throw Error('TIKTOK_EMAIL_LOGIN_MODE_UNAVAILABLE');
    await page.locator('input[name="username"]').first().fill(credentials.identifier);
  }

  await page.locator('input[type="password"]').first().fill(credentials.password);
  await page.locator('[data-e2e="login-button"], button[type="submit"]').first().click({
    timeout: 10_000,
  });
}
