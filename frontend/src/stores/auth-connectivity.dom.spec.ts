// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
const mock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn().mockResolvedValue({}), toast: vi.fn() }));
vi.mock('@/api/index', () => ({ api: { get: mock.get, post: mock.post } }));
vi.mock('@/composables/use-org-timezone', () => ({ refreshOrgTimezone: vi.fn() }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ error: mock.toast }) }));
import { useAuthStore } from './auth';
import { markAuthConnectionRestored } from '@/api/auth-connection';

let pinia: Pinia;
const profile = { id: 'fake-user', email: 'fake@example.test', fullName: 'Fake', role: 'admin', orgId: 'fake-org', org: { name: 'Fake', timezone: '+07:00' }, passwordChangedAt: '2026-01-01' };
const error = (status?: number) => status ? { response: { status } } : { code: 'ERR_NETWORK' };
beforeEach(() => {
  // Node 26 exposes an unavailable native localStorage; keep this browser test isolated.
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(),
  });
  localStorage.clear(); localStorage.setItem('token', 'fake-access'); localStorage.setItem('refreshToken', 'fake-refresh');
  pinia = createPinia(); setActivePinia(pinia); markAuthConnectionRestored(); vi.clearAllMocks();
  mock.post.mockResolvedValue({});
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => disposePinia(pinia));

describe('profile session availability for desktop and mobile', () => {
  it.each([['offline', error()], ['timeout', { code: 'ECONNABORTED' }], ['500', error(500)], ['502', error(502)], ['503', error(503)], ['429', error(429)]])('%s retains token and verified user', async (_name, failure) => {
    const auth = useAuthStore(); auth.user = { ...profile, orgName: 'Fake' };
    mock.get.mockRejectedValueOnce(failure); await auth.fetchProfile();
    expect(auth.token).toBe('fake-access'); expect(auth.user?.id).toBe('fake-user');
    expect(localStorage.getItem('refreshToken')).toBe('fake-refresh'); expect(auth.profileUnavailable).toBe(true);
    expect(mock.post).not.toHaveBeenCalled();
  });
  it.each([401, 403])('profile %s clears the session', async status => {
    const auth = useAuthStore(); mock.get.mockRejectedValueOnce(error(status)); await auth.fetchProfile();
    expect(auth.token).toBe(''); expect(auth.user).toBeNull(); expect(localStorage.getItem('token')).toBeNull(); expect(localStorage.getItem('refreshToken')).toBeNull();
  });
  it('a refresh 403 propagated by profile does not masquerade as direct profile rejection', async () => {
    const auth = useAuthStore(); auth.user = { ...profile, orgName: 'Fake' };
    mock.get.mockRejectedValueOnce({ response: { status: 403 }, config: { url: '/api/v1/auth/refresh' } });
    await auth.fetchProfile();
    expect(auth.token).toBe('fake-access'); expect(auth.user?.id).toBe('fake-user');
    expect(auth.profileUnavailable).toBe(true); expect(mock.post).not.toHaveBeenCalled();
  });
  it('a propagated refresh 400 token-invalid response clears profile session', async () => {
    const auth = useAuthStore();
    mock.get.mockRejectedValueOnce({ response: { status: 400, data: { code: 'refresh_invalid' } }, config: { url: '/api/v1/auth/refresh' } });
    await auth.fetchProfile();
    expect(auth.token).toBe(''); expect(localStorage.getItem('refreshToken')).toBeNull();
  });
  it('cold offline init keeps credentials without granting a user or RBAC', async () => {
    const auth = useAuthStore(); mock.get.mockRejectedValueOnce(error()); await auth.init();
    expect(auth.token).toBe('fake-access'); expect(auth.user).toBeNull(); expect(auth.isAuthenticated).toBe(false); expect(auth.canAccess('contact')).toBe(false);
  });
  it('online retries once, sharing a single-flight profile request', async () => {
    const auth = useAuthStore(); mock.get.mockRejectedValueOnce(error()); await auth.init();
    mock.get.mockResolvedValueOnce({ data: profile });
    window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'));
    await auth.init(); await flushPromises();
    expect(mock.get).toHaveBeenCalledTimes(2); expect(auth.user?.id).toBe('fake-user'); expect(auth.profileUnavailable).toBe(false);
  });
  it('explicit logout still revokes and clears credentials', () => {
    const auth = useAuthStore(); auth.logout();
    expect(mock.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'fake-refresh' });
    expect(auth.token).toBe(''); expect(auth.user).toBeNull(); expect(localStorage.getItem('token')).toBeNull(); expect(localStorage.getItem('refreshToken')).toBeNull();
  });
  it('ignores a stale profile response after explicit logout', async () => {
    const auth = useAuthStore(); let resolve!: (v: unknown) => void;
    mock.get.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const pending = auth.init(); auth.logout(); resolve({ data: profile }); await pending;
    expect(auth.user).toBeNull(); expect(auth.token).toBe('');
  });
});
