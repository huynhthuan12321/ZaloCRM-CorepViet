// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { useReportCompactNavigation } from './use-report-compact-navigation';

describe('report compact navigation lifecycle', () => {
  let matches = true;
  let listeners: Set<(event: MediaQueryListEvent) => void>;
  beforeEach(() => {
    matches = true;
    listeners = new Set();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return matches; },
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    })));
  });
  async function resize(width: number) {
    await setViewport(Math.floor(width), width >= 768 && width <= 1099);
  }
  // A fractional CSS width (e.g. 1099.248px) leaves the media query and the
  // rounded innerWidth disagreeing, so tests must be able to set them apart.
  async function setViewport(innerWidth: number, compactMatches: boolean) {
    Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
    matches = compactMatches;
    for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    await nextTick();
  }
  function setup(path = '/reports/tong-quan') {
    const routePath = ref(path);
    // jsdom has no layout: model the desktop Reports button as rendered unless a test hides it.
    const target = document.createElement('button');
    document.body.append(target);
    let rendered = true;
    target.getClientRects = () => (rendered ? [{}] : []) as unknown as DOMRectList;
    const focusReports = vi.spyOn(target, 'focus');
    const wrapper = mount(defineComponent({
      setup: () => useReportCompactNavigation(routePath, () => target),
      template: '<button @click="primaryMenu = true">Open</button><div v-if="primaryMenu" role="menu">Primary links</div>',
    }));
    return { wrapper, routePath, focusReports, target, hideTarget: () => { rendered = false; } };
  }
  it('opens at1024, stays open at1099, closes at1100 and focuses visible Reports', async () => {
    const { wrapper, focusReports } = setup();
    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    await resize(1099);
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    await resize(1100);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(focusReports).not.toHaveBeenCalled();
    wrapper.vm.onPrimaryMenuAfterLeave();
    wrapper.vm.onPrimaryMenuAfterLeave();
    expect(focusReports).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('fractional 1099.248px: media leaves compact while innerWidth is 1099, still focuses Reports once', async () => {
    const { wrapper, focusReports } = setup();
    await wrapper.get('button').trigger('click');
    await setViewport(1099, false);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(focusReports).not.toHaveBeenCalled();
    wrapper.vm.onPrimaryMenuAfterLeave();
    wrapper.vm.onPrimaryMenuAfterLeave();
    expect(focusReports).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('media still compact with innerWidth 1100 keeps the overlay and does not move focus', async () => {
    const { wrapper, focusReports } = setup();
    await wrapper.get('button').trigger('click');
    await setViewport(1100, true);
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    wrapper.vm.onPrimaryMenuAfterLeave();
    expect(focusReports).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('1440 desktop leave also focuses Reports once', async () => {
    const { wrapper, focusReports } = setup();
    await wrapper.get('button').trigger('click');
    await resize(1440);
    wrapper.vm.onPrimaryMenuAfterLeave();
    wrapper.vm.onPrimaryMenuAfterLeave();
    expect(focusReports).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('does not focus a Reports button that is hidden or detached when the leave ends', async () => {
    const hidden = setup();
    await hidden.wrapper.get('button').trigger('click');
    await setViewport(1099, false);
    hidden.hideTarget();
    hidden.wrapper.vm.onPrimaryMenuAfterLeave();
    expect(hidden.focusReports).not.toHaveBeenCalled();
    hidden.wrapper.unmount();
    const detached = setup();
    await detached.wrapper.get('button').trigger('click');
    await setViewport(1099, false);
    detached.target.remove();
    detached.wrapper.vm.onPrimaryMenuAfterLeave();
    expect(detached.focusReports).not.toHaveBeenCalled();
    detached.wrapper.unmount();
  });
  it('a leave that ends after leaving reports or after unmount does not focus', async () => {
    const routed = setup();
    await routed.wrapper.get('button').trigger('click');
    await setViewport(1099, false);
    routed.routePath.value = '/chat';
    await nextTick();
    routed.wrapper.vm.onPrimaryMenuAfterLeave();
    expect(routed.focusReports).not.toHaveBeenCalled();
    routed.wrapper.unmount();
    const unmounted = setup();
    await unmounted.wrapper.get('button').trigger('click');
    await setViewport(1099, false);
    const lateLeave = unmounted.wrapper.vm.onPrimaryMenuAfterLeave;
    unmounted.wrapper.unmount();
    lateLeave();
    expect(unmounted.focusReports).not.toHaveBeenCalled();
  });
  it('returning to compact does not resurrect the old overlay', async () => {
    const { wrapper } = setup();
    await wrapper.get('button').trigger('click');
    await resize(1100);
    await resize(1024);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('closes below768 without trying to focus an unmounted desktop Reports button', async () => {
    const { wrapper, focusReports } = setup();
    await wrapper.get('button').trigger('click');
    await resize(767);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(focusReports).not.toHaveBeenCalled();
    // App swaps DefaultLayout for MobileLayout below768; a late leave must stay inert.
    const lateLeave = wrapper.vm.onPrimaryMenuAfterLeave;
    wrapper.unmount();
    lateLeave();
    expect(focusReports).not.toHaveBeenCalled();
  });
  it('leaving reports closes the menu and prevents opening on other routes', async () => {
    const { wrapper, routePath } = setup();
    await wrapper.get('button').trigger('click');
    routePath.value = '/chat';
    await nextTick();
    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('cannot open while the compact activator is hidden on desktop', async () => {
    await resize(1440);
    const { wrapper } = setup();
    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('removes the media listener on unmount and supports a fresh layout instance', async () => {
    const first = setup();
    expect(listeners.size).toBe(1);
    first.wrapper.unmount();
    expect(listeners.size).toBe(0);
    await resize(1100);
    const second = setup();
    await second.wrapper.get('button').trigger('click');
    expect(second.wrapper.find('[role="menu"]').exists()).toBe(false);
    second.wrapper.unmount();
    expect(listeners.size).toBe(0);
  });
  it('a delayed leave event does not steal focus after returning to compact', async () => {
    const { wrapper, focusReports } = setup();
    await wrapper.get('button').trigger('click');
    await resize(1100);
    await resize(1024);
    wrapper.vm.onPrimaryMenuAfterLeave();
    expect(focusReports).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
