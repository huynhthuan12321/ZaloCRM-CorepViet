// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ref, nextTick } from 'vue';
import { installMemoryStorage } from '@/__tests__/mobile/test-utils';
import { SALE_FILTER_STORAGE_PREFIX, useSaleFilterUrl } from './use-sale-filter-url';

installMemoryStorage();
const SELF = '11111111-1111-4111-a111-111111111111';
const OTHER = '22222222-2222-4222-a222-222222222222';
const KEY = `${SALE_FILTER_STORAGE_PREFIX}org:${SELF}`;
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers.length = 0; localStorage.clear(); });
async function setup(allowed: boolean, url = '/chat') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/chat', component: { render: () => null } }] });
  await router.push(url);
  const selection = ref<string | null>(null), canChoose = ref(allowed), user = ref(SELF);
  wrappers.push(mount({ setup() { useSaleFilterUrl(selection, canChoose, user, ref('org')); return () => null; } }, { global: { plugins: [router] } }));
  return { selection, canChoose, router, user };
}
describe('sale filter restoration and scope', () => {
  for (const stale of ['all', 'unassigned', OTHER]) {
    it(`forces legacy ${stale} to self before first query and cleans storage`, async () => {
      localStorage.setItem('saleAssigneeId', stale);
      const { selection } = await setup(false, `/chat?assignedUserId=${stale}`);
      expect(selection.value).toBe(SELF);
      expect(localStorage.getItem('saleAssigneeId')).toBeNull();
      expect(JSON.parse(localStorage.getItem(KEY)!)).toBe(SELF);
    });
    it(`forces scoped ${stale} to self and guards subsequent preset/clear`, async () => {
      localStorage.setItem(KEY, JSON.stringify(stale));
      const { selection } = await setup(false);
      expect(selection.value).toBe(SELF);
      selection.value = stale;
      expect(selection.value).toBe(SELF);
      selection.value = null;
      expect(selection.value).toBe(SELF);
      await nextTick();
      expect(JSON.parse(localStorage.getItem(KEY)!)).toBe(SELF);
    });
    for (const role of ['admin', 'manager']) it(`${role} keeps saved ${stale}`, async () => {
      localStorage.setItem(KEY, JSON.stringify(stale));
      const { selection, router } = await setup(true);
      expect(selection.value).toBe(stale);
      await flushPromises();
      expect(router.currentRoute.value.query.assignedUserId).toBe(stale);
    });
  }
  it('URL takes priority, browser back can clear, and permission removal is synchronous', async () => {
    localStorage.setItem(KEY, JSON.stringify('all'));
    const { selection, router, canChoose } = await setup(true, `/chat?assignedUserId=${OTHER}`);
    expect(selection.value).toBe(OTHER);
    await router.replace('/chat');
    expect(selection.value).toBeNull();
    selection.value = 'all';
    canChoose.value = false;
    expect(selection.value).toBe(SELF);
    await flushPromises();
    expect(router.currentRoute.value.query.assignedUserId).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toBe(SELF);
  });
  it('does not restore another account or organization selection', async () => {
    localStorage.setItem(`${SALE_FILTER_STORAGE_PREFIX}other-org:${SELF}`, JSON.stringify(OTHER));
    const { selection } = await setup(true);
    expect(selection.value).toBeNull();
  });
});
