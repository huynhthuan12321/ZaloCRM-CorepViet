// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
const verificationHeading = /2-step verification|two-step verification|xác minh 2 bước/i;
const captchaText = /captcha|drag the slider|verify to continue/i;
const codeSelector = 'input[autocomplete="one-time-code"],input[name="code"],input[placeholder*="6-digit" i],input[placeholder*="6 digit" i],input[placeholder*="6 chữ số" i]';

export async function verificationForm(page) {
  if (new URL(page.url()).origin !== 'https://www.tiktok.com') return null;
  const text = await page.locator('body').innerText({ timeout: 5000 });
  if (!verificationHeading.test(text) || captchaText.test(text)) return null;
  const inputs = page.locator(codeSelector);
  const visible = [];
  for (let i = 0; i < await inputs.count(); i++) {
    if (await inputs.nth(i).isVisible()) visible.push(inputs.nth(i));
  }
  if (visible.length !== 1) return null;
  const buttons = page.getByRole('button', { name: /^(next|continue|verify|tiếp|tiếp tục|xác minh)$/i });
  const submits = [];
  for (let i = 0; i < await buttons.count(); i++) {
    if (await buttons.nth(i).isVisible()) submits.push(buttons.nth(i));
  }
  return submits.length === 1 ? { input: visible[0], submit: submits[0] } : null;
}

export async function submitVerificationCode(page, code) {
  if (!/^\d{6}$/.test(code)) throw Error('INVALID_VERIFICATION_CODE');
  try {
    const form = await verificationForm(page);
    if (!form) throw Error('VERIFICATION_FORM_UNAVAILABLE');
    await form.input.fill(code);
    if (!await form.submit.isEnabled()) throw Error('VERIFICATION_SUBMIT_UNAVAILABLE');
    await form.submit.click({ timeout: 10000 });
  } catch {
    // Never expose Playwright's call log, which can contain the filled code.
    throw Error('VERIFICATION_SUBMISSION_UNCONFIRMED');
  }
}
