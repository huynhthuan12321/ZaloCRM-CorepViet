// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defineComponent, effectScope, h, provide, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createChromeController, MOBILE_SHELL_KEY, useMobileShell, type MobileShellContext } from './shell-context';

function controller(opts: { tabbar?: boolean; header?: boolean; keyboard?: boolean } = {}) {
  const tabbar = ref(opts.tabbar ?? true);
  const header = ref(opts.header ?? true);
  const keyboardOpen = ref(opts.keyboard ?? false);
  const ctl = createChromeController({ tabbar, header, keyboardOpen });
  return { ...ctl, tabbar, header, keyboardOpen };
}

describe('createChromeController', () => {
  it('mặc định theo route; bàn phím mở luôn ẩn tabbar nhưng không đụng header', () => {
    const c = controller();
    expect(c.tabbarVisible.value).toBe(true);
    expect(c.headerVisible.value).toBe(true);
    c.keyboardOpen.value = true;
    expect(c.tabbarVisible.value).toBe(false);
    expect(c.headerVisible.value).toBe(true);
  });

  it('route chi tiết ẩn tabbar/header theo mặc định', () => {
    const c = controller({ tabbar: false, header: false });
    expect(c.tabbarVisible.value).toBe(false);
    expect(c.headerVisible.value).toBe(false);
  });

  it('requestChrome đè mặc định và release trả lại', () => {
    const c = controller();
    const release = c.requestChrome({ header: false });
    expect(c.headerVisible.value).toBe(false);
    expect(c.tabbarVisible.value).toBe(true);
    release();
    expect(c.headerVisible.value).toBe(true);
    release(); // gọi lại an toàn
    expect(c.headerVisible.value).toBe(true);
  });

  it('request mới nhất thắng; release request cũ không phá request mới', () => {
    const c = controller();
    const r1 = c.requestChrome({ tabbar: false });
    const r2 = c.requestChrome({ tabbar: true });
    expect(c.tabbarVisible.value).toBe(true);
    r1();
    expect(c.tabbarVisible.value).toBe(true);
    r2();
    expect(c.tabbarVisible.value).toBe(true);
    const r3 = c.requestChrome({ tabbar: false });
    expect(c.tabbarVisible.value).toBe(false);
    r3();
  });

  it('tự release khi scope của caller dispose', () => {
    const c = controller();
    const scope = effectScope();
    scope.run(() => c.requestChrome({ header: false, tabbar: false }));
    expect(c.headerVisible.value).toBe(false);
    expect(c.tabbarVisible.value).toBe(false);
    scope.stop();
    expect(c.headerVisible.value).toBe(true);
    expect(c.tabbarVisible.value).toBe(true);
  });
});

describe('useMobileShell', () => {
  it('ngoài MobileLayout -> ném lỗi lập trình rõ ràng', () => {
    const Orphan = defineComponent({ setup() { useMobileShell(); return () => h('div'); } });
    expect(() => mount(Orphan)).toThrow(/MobileLayout/);
  });

  it('trong shell -> nhận đúng ngữ cảnh đã provide', () => {
    const ctx = { viewport: {}, ...controller() } as unknown as MobileShellContext;
    let got: MobileShellContext | null = null;
    const Child = defineComponent({ setup() { got = useMobileShell(); return () => h('div'); } });
    const Parent = defineComponent({ setup() { provide(MOBILE_SHELL_KEY, ctx); return () => h(Child); } });
    mount(Parent);
    expect(got).toBe(ctx);
  });
});
