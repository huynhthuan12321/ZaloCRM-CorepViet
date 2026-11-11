// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useInboxSales } from './use-inbox-sales';
import { api } from '@/api';
import { installMemoryStorage } from '@/__tests__/mobile/test-utils';

installMemoryStorage();

vi.mock('@/api', () => ({ api: { get: vi.fn() } }));
vi.mock('@/api/index', () => ({ api: { get: vi.fn() } }));
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers.length = 0; vi.clearAllMocks(); });

function setup(role: string, deptRole = 'member') {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: 'self', orgId: 'org', orgName: 'Test', email: null, fullName: 'Self', role, deptRole };
  let sales!: ReturnType<typeof useInboxSales>;
  wrappers.push(mount({ setup() { sales = useInboxSales(); return () => null; } }));
  return { sales, auth };
}

describe('inbox sale scope', () => {
  it('sale thường không tải danh bạ', async () => {
    const { sales } = setup('member');
    await flushPromises();
    expect(sales.canChooseSale.value).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('quản lý chỉ nhận giao của org users đang active và picker RBAC', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => ({ data: { users: url === '/users'
      ? [{ id: 'allowed', fullName: 'A', isActive: true }, { id: 'outside', fullName: 'B', isActive: true }, { id: 'inactive', fullName: 'C', isActive: false }]
      : [{ id: 'allowed' }, { id: 'inactive' }] } }) as never);
    const { sales, auth } = setup('member', 'leader');
    await flushPromises();
    expect(sales.users.value).toEqual([{ id: 'allowed', fullName: 'A' }]);
    auth.user = { ...auth.user!, deptRole: 'member' };
    await flushPromises();
    expect(sales.users.value).toEqual([]);
    expect(sales.canChooseSale.value).toBe(false);
  });

  it('lỗi picker phải đóng phạm vi, không fallback toàn bộ org', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('403'));
    const { sales } = setup('admin');
    await flushPromises();
    expect(sales.users.value).toEqual([]);
    expect(sales.error.value).not.toBe('');
  });
});
