import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLoginHttpDiagnostic } from '../src/login-diagnostics.mjs';

test('diagnostics omit URL query, session tokens, arbitrary messages and headers', () => {
  const value = safeLoginHttpDiagnostic('https://www.tiktok.com/passport/web/check_qrcode/?token=private', 200,
    { status_code: 0, message: 'secret email', token: 'private', code: 123456,
      data: { error_code: 7, ticket: 'private', status: 'confirmed', code: 987654 } });
  assert.deepEqual(value, { path: '/passport/web/check_qrcode/', httpStatus: 200,
    codes: { status_code: 0, 'data.error_code': 7, 'data.status': 'confirmed' } });
  assert.equal(JSON.stringify(value).includes('private'), false);
  assert.equal(JSON.stringify(value).includes('secret'), false);
});
test('diagnostics reject unrelated hosts and paths containing private identifiers', () => {
  assert.equal(safeLoginHttpDiagnostic('https://example.com/passport/web/login/', 200, {}), null);
  assert.equal(safeLoginHttpDiagnostic('https://www.tiktok.com/api/messages/12345', 200, {}), null);
});
