// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc

export async function openQrLogin(page) {
  const candidates = [
    page.getByRole('button', { name: /qr code/i }).first(),
    page.getByText(/^use qr code$/i).first(),
    page.locator('a[href*="/login/qrcode"], [data-e2e*="qr" i]').first(),
  ];
  for (const candidate of candidates) {
    if (!await candidate.isVisible().catch(() => false)) continue;
    await candidate.click({ timeout: 10_000 });
    return true;
  }
  return false;
}
