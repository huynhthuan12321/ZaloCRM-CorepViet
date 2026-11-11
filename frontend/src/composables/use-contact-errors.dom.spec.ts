// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/api/index', () => ({ api }));
vi.mock('@/api', () => ({ api }));
import { useContactProfile } from './use-contact-profile';
import { useMobileContactDetail } from './mobile-crm/use-mobile-contact-detail';
import { useAuthStore } from '@/stores/auth';
import { installMemoryStorage } from './mobile-crm/test-utils';

beforeEach(() => {
  installMemoryStorage();
  api.get.mockReset();
  setActivePinia(createPinia());
  vi.spyOn(useAuthStore(), 'canAccess').mockReturnValue(true);
});
describe('F6 profile errors', () => {
  it.each([[403, 'Bạn không có quyền xem khách này', 'forbidden'], [404, 'Khách không tồn tại hoặc đã xóa', 'missing'], [500, 'Không tải được hồ sơ khách. Vui lòng thử lại.', 'error']])('status %s desktop and mobile', async (status, text, state) => {
    api.get.mockRejectedValue({ response: { status } });
    const desktop = useContactProfile();
    expect(await desktop.fetchContactProfile(`desktop-${status}`)).toBeNull();
    expect(desktop.error.value).toBe(text);
    expect(desktop.errorStatus.value).toBe(status);
    const mobile = useMobileContactDetail(ref(`mobile-${status}`));
    await mobile.load();
    expect(mobile.state.value).toBe(state);
    expect(mobile.contact.value).toBeNull();
  });
  it('late request cannot overwrite next profile error or expose old data', async () => {
    let resolve!: (v: unknown) => void;
    api.get.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const p = useContactProfile();
    const old = p.fetchContactProfile('slow-profile');
    api.get.mockRejectedValueOnce({ response: { status: 403 } });
    await p.fetchContactProfile('denied-profile');
    resolve({ data: { contact: { id: 'slow-profile' } } });
    await old;
    expect(p.profile.value).toBeNull();
    expect(p.errorStatus.value).toBe(403);
  });
});

it('late404 of A cannot contaminate successful mobile B', async () => {
  let rejectA!: (reason: unknown) => void;
  api.get.mockImplementation((url: string) => {
    if (url === '/contacts/slow-A') return new Promise((_, reject) => { rejectA = reject; });
    if (url.endsWith('/profile')) return Promise.resolve({ data: { contact: { id: 'B' } } });
    if (url.endsWith('/account-activity')) return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: { id: 'B' } });
  });
  const id = ref('slow-A');
  const mobile = useMobileContactDetail(id);
  const a = mobile.load();
  id.value = 'B';
  const b = mobile.load();
  rejectA({ response: { status: 404 } });
  await Promise.all([a, b]);
  expect(mobile.state.value).toBe('ready');
  expect(mobile.contact.value?.id).toBe('B');
});
