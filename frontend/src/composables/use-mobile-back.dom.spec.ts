// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { useMobileBack } from './use-mobile-back';

function setup() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/account', component: { template: '<div />' } },
      { path: '/media', component: { template: '<div />' } },
    ],
  });
  let api!: ReturnType<typeof useMobileBack>;
  const Host = defineComponent({
    setup() {
      api = useMobileBack('/account');
      return () => h('div');
    },
  });
  return { router, mountIt: () => mount(Host, { global: { plugins: [router] } }), getApi: () => api };
}

describe('useMobileBack', () => {
  it('có lịch sử nội bộ (history.state.back là chuỗi) -> router.back()', async () => {
    window.history.replaceState(null, '', '/');
    const ctx = setup();
    await ctx.router.push('/');
    await ctx.router.isReady();
    await ctx.router.push('/media');
    ctx.mountIt();
    expect(ctx.getApi().canGoBackInApp.value).toBe(true);
    await ctx.getApi().goBack();
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 30)); // popstate bất đồng bộ trong jsdom
    expect(ctx.router.currentRoute.value.path).toBe('/');
  });

  it('không có lịch sử nội bộ (vào thẳng) -> replace(fallback), không rời app', async () => {
    window.history.replaceState(null, '', '/media');
    const ctx = setup();
    await ctx.router.push('/media'); // lần điều hướng đầu = vào thẳng: state.back là null
    await ctx.router.isReady();
    ctx.mountIt();
    expect(ctx.getApi().canGoBackInApp.value).toBe(false);
    await ctx.getApi().goBack();
    expect(ctx.router.currentRoute.value.path).toBe('/account');
  });
});
