import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationForm, submitVerificationCode } from '../src/verification-login.mjs';

function pageFixture(text, failFill = false) {
  const calls = [];
  const input = { isVisible: async () => true, fill: async value => {
    if (failFill) throw Error(`fill(${value}) failed`);
    calls.push('filled');
  } };
  const button = { isVisible: async () => true, isEnabled: async () => true, click: async () => calls.push('submitted') };
  const list = item => ({ count: async () => 1, nth: () => item });
  return { calls, url: () => 'https://www.tiktok.com/login', locator: selector => selector === 'body'
    ? { innerText: async () => text } : list(input), getByRole: () => list(button) };
}

test('submits user-provided code once on a recognized 2FA form without navigating', async () => {
  const page = pageFixture('2-step verification. Enter a 6-digit code.');
  await submitVerificationCode(page, '123456');
  assert.deepEqual(page.calls, ['filled', 'submitted']);
});
test('never submits a verification code to a different origin', async () => {
  const page = pageFixture('2-step verification');
  page.url = () => 'https://example.com/login';
  assert.equal(await verificationForm(page), null);
  await assert.rejects(submitVerificationCode(page, '123456'), /VERIFICATION_SUBMISSION_UNCONFIRMED/);
  assert.deepEqual(page.calls, []);
});
test('does not submit a code to a CAPTCHA or an ordinary login form', async () => {
  for (const text of ['2-step verification. Drag the slider', 'Log in to TikTok']) {
    const page = pageFixture(text);
    assert.equal(await verificationForm(page), null);
    await assert.rejects(submitVerificationCode(page, '123456'), /VERIFICATION_SUBMISSION_UNCONFIRMED/);
    assert.deepEqual(page.calls, []);
  }
});
test('sanitizes browser failures that contain the verification code', async () => {
  await assert.rejects(submitVerificationCode(pageFixture('Xác minh 2 bước', true), '123456'),
    error => error.message === 'VERIFICATION_SUBMISSION_UNCONFIRMED' && !error.message.includes('123456'));
});
