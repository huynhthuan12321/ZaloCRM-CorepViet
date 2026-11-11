// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import MobileTabBar from './MobileTabBar.vue';
import type { MobileTabItem } from './types';
import vue from './MobileTabBar.vue?raw';

const ITEMS: MobileTabItem[] = [
  { key: 'overview', label: 'Tổng quan', icon: 'mdi-view-dashboard-outline', to: '/' },
  { key: 'contacts', label: 'Khách hàng', icon: 'mdi-account-group-outline', to: '/contacts' },
  { key: 'chat', label: 'Hội thoại', icon: 'mdi-message-text', to: '/chat', prominent: true, badge: 7, badgeLabel: '7 khách đang chờ trả lời' },
  { key: 'agenda', label: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', to: '/appointments' },
  { key: 'account', label: 'Tài khoản', icon: 'mdi-account-circle-outline', to: '/account' },
];

function router() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });
}

// vitest chặn css (?raw trả rỗng) và không có @types/node -> đọc bằng built-in của Node.
const readText = (rel: string): string =>
  (globalThis as any).process.getBuiltinModule('node:fs').readFileSync(new URL(rel, import.meta.url), 'utf8');
const tokens = readText('../../../assets/mobile-tokens.css');

describe('MobileTabBar', () => {
  it('5 mục có nhãn chữ, nav có tên truy cập, mục đang chọn có aria-current=page', () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS, activeKey: 'contacts' }, global: { plugins: [router()] } });
    expect(w.get('nav').attributes('aria-label')).toBe('Điều hướng chính');
    const labels = w.findAll('.m-tab__label').map(l => l.text());
    expect(labels).toEqual(['Tổng quan', 'Khách hàng', 'Hội thoại', 'Lịch hẹn', 'Tài khoản']);
    const current = w.findAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].text()).toContain('Khách hàng');
  });

  it('không mục nào active khi activeKey = null (vd NotFound)', () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS, activeKey: null }, global: { plugins: [router()] } });
    expect(w.findAll('[aria-current]')).toHaveLength(0);
  });

  it('chỉ Hội thoại là nút nổi; badge hiện số + nhãn đọc được; >99 -> 99+', async () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS, activeKey: 'chat' }, global: { plugins: [router()] } });
    expect(w.findAll('.m-tab--prominent')).toHaveLength(1);
    const chat = w.get('.m-tab--prominent');
    expect(chat.attributes('aria-label')).toBe('Hội thoại, 7 khách đang chờ trả lời');
    expect(chat.get('.m-tab__badge').text()).toBe('7');
    await w.setProps({ items: ITEMS.map(i => (i.key === 'chat' ? { ...i, badge: 250 } : i)) });
    expect(w.get('.m-tab__badge').text()).toBe('99+');
  });

  it('badge null hoặc 0 -> không render badge, aria-label chỉ là nhãn', async () => {
    const w = mount(MobileTabBar, {
      props: { items: ITEMS.map(i => (i.key === 'chat' ? { ...i, badge: null, badgeLabel: undefined } : i)), activeKey: null },
      global: { plugins: [router()] },
    });
    expect(w.find('.m-tab__badge').exists()).toBe(false);
    expect(w.get('.m-tab--prominent').attributes('aria-label')).toBe('Hội thoại');
    await w.setProps({ items: ITEMS.map(i => (i.key === 'chat' ? { ...i, badge: 0 } : i)) });
    expect(w.find('.m-tab__badge').exists()).toBe(false);
  });

  it('thiếu quyền -> tabbar co lại theo số mục (không chừa ô trống)', () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS.filter(i => i.key !== 'chat'), activeKey: null }, global: { plugins: [router()] } });
    expect(w.findAll('.m-tab')).toHaveLength(4);
    expect(w.find('.m-tab--prominent').exists()).toBe(false);
    expect(w.get('ul').attributes('style')).toContain('repeat(4');
  });

  it('thiếu cả contact và conversation -> 3 mục chia đều, không nút nổi, lưới đúng 3 cột bằng nhau', () => {
    const w = mount(MobileTabBar, {
      props: { items: ITEMS.filter(i => i.key !== 'chat' && i.key !== 'contacts'), activeKey: 'agenda' },
      global: { plugins: [router()] },
    });
    expect(w.findAll('.m-tab')).toHaveLength(3);
    expect(w.find('.m-tab--prominent').exists()).toBe(false);
    expect(w.find('.m-tab__fab').exists()).toBe(false);
    expect(w.get('ul').attributes('style')).toContain('repeat(3, minmax(0, 1fr))');
  });

  it('click phát navigate(key) và chặn điều hướng mặc định; Ctrl-click để trình duyệt xử lý', async () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS, activeKey: null }, global: { plugins: [router()] } });
    await w.findAll('a.m-tab')[4].trigger('click');
    expect(w.emitted('navigate')).toEqual([['account']]);
    await w.findAll('a.m-tab')[0].trigger('click', { ctrlKey: true });
    expect(w.emitted('navigate')).toHaveLength(1);
  });

  it('mỗi mục là liên kết thật với href từ router', () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS, activeKey: null }, global: { plugins: [router()] } });
    expect(w.findAll('a.m-tab').map(a => a.attributes('href'))).toEqual(['/', '/contacts', '/chat', '/appointments', '/account']);
  });

  it('mount được khi không có router (không cảnh báo inject, href = #)', () => {
    const w = mount(MobileTabBar, { props: { items: ITEMS.slice(0, 2), activeKey: null } });
    expect(w.findAll('a.m-tab').map(a => a.attributes('href'))).toEqual(['#', '#']);
  });

  describe('CSS (tinh chỉnh thanh tab Đợt C)', () => {
    const rule = (src: string, sel: string) => {
      const start = src.indexOf(`
${sel} {`);
      if (start < 0) return '';
      return src.slice(start, src.indexOf('}', start));
    };

    it('nút giữa 60px, 56px ở <=359px; nhô 22px; thanh 64px', () => {
      expect(tokens).toMatch(/--m-fab-size:\s*60px/);
      expect(tokens).toMatch(/--m-fab-lift:\s*22px/);
      expect(tokens).toMatch(/--m-tabbar:\s*64px/);
      expect(tokens).toMatch(/@media \(max-width: 359px\)[^@]*--m-fab-size:\s*56px/);
      const fab = rule(vue, '.m-tab__fab');
      expect(fab).toContain('top: calc(-1 * var(--m-fab-lift))');
      expect(fab).toContain('width: var(--m-fab-size)');
      expect(fab).toContain('height: var(--m-fab-size)');
    });

    it('nền nút giữa đơn sắc --m-brand, không gradient; không hardcode màu hex', () => {
      expect(rule(vue, '.m-tab__fab')).toContain('background: var(--m-brand);');
      expect(vue).not.toMatch(/gradient/);
      expect(vue.split('</template>')[1] ?? vue).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });

    it('safe-bottom chỉ cộng một lần (nav), danh sách cao đúng --m-tabbar', () => {
      expect(rule(vue, '.m-tabbar')).toContain('padding: 0 var(--m-safe-right) var(--m-safe-bottom)');
      expect(rule(vue, '.m-tabbar__list')).toContain('height: var(--m-tabbar)');
      expect((vue.match(/--m-safe-bottom/g) ?? []).length).toBe(1);
    });

    it('reduced-motion tắt transition; transition 150-200ms', () => {
      const rm = vue.slice(vue.indexOf('prefers-reduced-motion'));
      expect(rm).toMatch(/\.m-tab::after/);
      expect(rm).toContain('transition: none');
      for (const m of vue.matchAll(/transition:[^;]*?(0?\.\d+)s/g)) {
        const ms = parseFloat(m[1]) * 1000;
        expect(ms).toBeGreaterThanOrEqual(150);
        expect(ms).toBeLessThanOrEqual(200);
      }
    });

    it('tab thường active có chỉ báo phụ ngoài màu (vạch trên + nền pill)', () => {
      expect(rule(vue, '.m-tab--active')).toContain('background: var(--m-brand-soft)');
      expect(rule(vue, '.m-tab--active::after')).toContain('opacity: 1');
      expect(rule(vue, '.m-tab::after')).toContain('height: 3px');
    });
  });
});
