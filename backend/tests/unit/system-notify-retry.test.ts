import { describe, expect, it } from 'vitest';
import { isRetryableSystemNotifyError } from '../../src/modules/system-notifications/system-notify-service.js';

describe('system notification retry classification', () => {
  it.each([
    new Error('fetch failed'),
    new Error('SocketError: other side closed'),
    Object.assign(new Error('request failed'), { code: 'ECONNRESET' }),
    new Error('session expired'),
  ])('retry lỗi kết nối/session tạm thời', (err) => {
    expect(isRetryableSystemNotifyError(err)).toBe(true);
  });

  it('không retry lỗi nghiệp vụ để tránh gửi trùng', () => {
    expect(isRetryableSystemNotifyError(new Error('User blocked this account'))).toBe(false);
  });
});
