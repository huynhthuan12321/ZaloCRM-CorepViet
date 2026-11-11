// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
const mock = vi.hoisted(() => ({
  post: vi.fn(), retry: vi.fn(), responseError: undefined as undefined | ((e: unknown) => Promise<unknown>),
  redirect: vi.fn(), toast: vi.fn(), handlers: {} as Record<string, (...args: unknown[]) => void>, connect: vi.fn(),
}));
vi.mock('axios', () => ({ default: {
  post: mock.post,
  create: () => Object.assign(mock.retry, { interceptors: { request: { use: vi.fn() }, response: { use: (_ok: unknown, bad: (e: unknown) => Promise<unknown>) => { mock.responseError = bad; } } } }),
} }));
vi.mock('@/router/index', () => ({ router: { currentRoute: { value: { path: '/', meta: {} } }, replace: mock.redirect } }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ error: mock.toast }) }));
vi.mock('socket.io-client', () => ({ io: () => ({ active: false, connect: mock.connect, on: (name: string, cb: (...args: unknown[]) => void) => { mock.handlers[name] = cb; } }) }));
const failure = (status?: number, data?: object) => status ? { response: { status, data }, config: { url: '/api/v1/auth/refresh' } } : { code: 'ERR_NETWORK' };
beforeEach(() => {
  // Node 26 exposes an unavailable native localStorage; keep this browser test isolated.
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(),
  });
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  localStorage.setItem('token', 'fake-access'); localStorage.setItem('refreshToken', 'fake-refresh');
  mock.retry.mockResolvedValue({ data: {} }); mock.handlers = {};
});
const request401 = () => mock.responseError!({ response: { status: 401 }, config: { url: '/profile', headers: {} } });

describe('shared refresh rejection policy', () => {
  it.each([['offline', failure()], ['timeout', { code: 'ETIMEDOUT' }], ['500', failure(500)], ['502', failure(502)], ['503', failure(503)], ['429', failure(429)], ['403 refresh is not profile', failure(403)], ['400 non-auth', failure(400, { error: 'Unrelated bad request' })]])('%s keeps both tokens', async (_name, error) => {
    mock.post.mockRejectedValue(error); await import('./index');
    await expect(request401()).rejects.toEqual(error);
    expect(localStorage.getItem('token')).toBe('fake-access'); expect(localStorage.getItem('refreshToken')).toBe('fake-refresh'); expect(mock.redirect).not.toHaveBeenCalled();
  });
  it.each([failure(401), failure(400, { code: 'refresh_invalid' }), failure(400, { error: 'Refresh token không hợp lệ' })])('explicit refresh rejection clears tokens', async error => {
    mock.post.mockRejectedValue(error); await import('./index'); await expect(request401()).rejects.toEqual(error);
    expect(localStorage.getItem('token')).toBeNull(); expect(localStorage.getItem('refreshToken')).toBeNull(); expect(mock.redirect).toHaveBeenCalled();
  });
  it('five concurrent 401 requests rotate refresh only once', async () => {
    mock.post.mockResolvedValue({ data: { token: 'new-access', refreshToken: 'new-refresh' } }); await import('./index');
    await Promise.all(Array.from({ length: 5 }, request401));
    expect(mock.post).toHaveBeenCalledTimes(1); expect(mock.retry).toHaveBeenCalledTimes(5);
    expect(localStorage.getItem('token')).toBe('new-access'); expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
  });
  it.each(['logout', 'another login'])('a pending refresh cannot resurrect or overwrite %s', async action => {
    let resolve!: (v: unknown) => void;
    mock.post.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { ensureFreshToken } = await import('./index'); const pending = ensureFreshToken();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    if (action === 'logout') localStorage.clear();
    else { localStorage.setItem('token', 'other-access'); localStorage.setItem('refreshToken', 'other-refresh'); }
    resolve({ data: { token: 'stale-access', refreshToken: 'stale-refresh' } }); await rejected;
    expect(localStorage.getItem('token')).toBe(action === 'logout' ? null : 'other-access');
    expect(localStorage.getItem('refreshToken')).toBe(action === 'logout' ? null : 'other-refresh');
  });
  it('a stale rejected refresh cannot clear another login', async () => {
    let reject!: (v: unknown) => void;
    mock.post.mockReturnValueOnce(new Promise((_resolve, r) => { reject = r; }));
    await import('./index'); const pending = request401();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    localStorage.setItem('token', 'other-access'); localStorage.setItem('refreshToken', 'other-refresh');
    reject(failure(401)); await rejected;
    expect(localStorage.getItem('token')).toBe('other-access'); expect(mock.redirect).not.toHaveBeenCalled();
  });
  it('socket refresh network failure retains session and reports disconnection', async () => {
    mock.post.mockRejectedValue(failure()); const { createAppSocket } = await import('./socket');
    const changed = vi.fn(); createAppSocket({ onStatusChange: changed }); mock.handlers.disconnect!('io server disconnect'); await flushPromises();
    expect(localStorage.getItem('token')).toBe('fake-access'); expect(localStorage.getItem('refreshToken')).toBe('fake-refresh'); expect(mock.redirect).not.toHaveBeenCalled();
    expect(mock.connect).not.toHaveBeenCalled(); expect(changed).toHaveBeenLastCalledWith('disconnected');
  });
  it('socket explicit rejected refresh clears session', async () => {
    mock.post.mockRejectedValue(failure(401)); const { createAppSocket } = await import('./socket');
    createAppSocket(); mock.handlers.disconnect!('io server disconnect'); await flushPromises();
    expect(localStorage.getItem('token')).toBeNull(); expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
