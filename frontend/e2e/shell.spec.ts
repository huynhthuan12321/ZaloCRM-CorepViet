// QA G1 đợt B — khung mobile (CONTRACT-A §4, §5, §6). Chạy trên bản build qua `vite preview`, mock API bằng page.route.
// Mức bằng chứng: Chromium / WebKit DESKTOP (Playwright). KHÔNG phải Safari iPhone; env(safe-area-inset-*) = 0.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, LEADER, NO_CHAT_CONTACT, OTHER_ADMIN, SALE, SHELL, TABBAR_LINKS, VIEWPORTS, installMocks, waitShell } from './helpers/mock-api';

const TAB_ORDER = [
  { label: 'Tổng quan', path: '/' },
  { label: 'Khách hàng', path: '/contacts' },
  { label: 'Hội thoại', path: '/chat' },
  { label: 'Lịch hẹn', path: '/appointments' },
  { label: 'Tài khoản', path: '/account' },
];

const ROUTES_FOR_OVERFLOW = ['/', '/contacts', '/chat', '/appointments', '/account', '/reports/tong-quan'];

interface ThemeSnapshot {
  htmlTheme: string | null;
  shellTheme: string | null;
  colorScheme: string | null;
  themeColor: string | null;
  vuetify: string | null;
}

async function themeSnapshot(page: Page): Promise<ThemeSnapshot> {
  return page.evaluate(() => {
    const app = document.querySelector('.v-application');
    const m = app ? /v-theme--([\w-]+)/.exec(app.className) : null;
    return {
      htmlTheme: document.documentElement.getAttribute('data-theme'),
      shellTheme: document.querySelector('.m-shell')?.getAttribute('data-theme') ?? null,
      colorScheme: document.head.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? null,
      themeColor: document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      vuetify: m ? m[1] : null,
    };
  });
}

async function pickTheme(page: Page, label: 'Sáng' | 'Tối' | 'Theo máy') {
  await page.locator('label.m-theme__option', { hasText: label }).click();
}

async function tabLabels(page: Page): Promise<string[]> {
  return page.locator(TABBAR_LINKS).evaluateAll(els => els.map(e => (e.querySelector('.m-tab__label')?.textContent ?? '').trim()));
}

// ---------------------------------------------------------------------------------------------
test.describe('Mobile shell — overflow ngang theo viewport', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const route of ROUTES_FOR_OVERFLOW) {
      test(`${name} ${vp.width}x${vp.height} ${route}: scrollWidth <= clientWidth`, async ({ page }) => {
        await installMocks(page, { waiting: 5 });
        await page.setViewportSize(vp);
        await page.goto(route);
        await waitShell(page);
        const measure = () => page.evaluate(() => {
          const pair = (el: Element | null) => (el ? { sw: el.scrollWidth, cw: el.clientWidth, ow: (el as HTMLElement).offsetWidth } : null);
          const d = document.documentElement;
          const clipped = Array.from(document.querySelectorAll('.m-shell *'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.right > window.innerWidth + 1;
            })
            .slice(0, 6)
            .map(el => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ').slice(0, 2).join('.')} right=${Math.round(el.getBoundingClientRect().right)}`);
          const scEl = document.querySelector('.m-main__scroll');
          const offenders = scEl ? Array.from(scEl.querySelectorAll('*')).filter(el => el.getBoundingClientRect().right > scEl.getBoundingClientRect().left + scEl.clientWidth + 0.5).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ').slice(0, 3).join('.')} w=${Math.round(el.getBoundingClientRect().width)}`) : [];
          return { doc: pair(d), body: pair(document.body), shell: pair(document.querySelector('.m-shell')), scroll: pair(scEl), clipped, offenders, scrollH: scEl ? { sh: scEl.scrollHeight, ch: scEl.clientHeight } : null, innerWidth: window.innerWidth };
        });
        const over = (x: Awaited<ReturnType<typeof measure>>) => (['doc', 'body', 'shell', 'scroll'] as const).filter(k => x[k] && x[k]!.sw > Math.max(x[k]!.cw, k === 'scroll' ? x[k]!.ow : 0));
        // Riêng .m-main__scroll: sw trong (cw, ow] chỉ là artefact thanh cuộn cổ điển 10px của WebKit/Chromium desktop (iOS dùng thanh cuộn nổi) -> không tính lỗi, ghi annotation. Đo lại tối đa 5 lần cách 700ms để loại nhiễu layout lúc chạy song song (lazy chunk, thanh cuộn desktop WebKit).
        let m = await measure();
        const firstOver = over(m);
        for (let i = 0; i < 5 && over(m).length; i++) {
          await page.waitForTimeout(700);
          m = await measure();
        }
        if (firstOver.length && !over(m).length) test.info().annotations.push({ type: 'transient-overflow-first-measure', description: firstOver.join(',') });
        for (const key of over(m)) {
          const p = m[key]!;
          expect.soft(p.sw, `${key} scrollWidth ${p.sw} > clientWidth ${p.cw}; offenders=${m.offenders.join(' | ')}; scrollH=${JSON.stringify(m.scrollH)}`).toBeLessThanOrEqual(p.cw);
        }
        if (m.scroll && m.scroll.sw > m.scroll.cw) test.info().annotations.push({ type: 'scrollbar-artifact', description: `scroll sw=${m.scroll.sw} cw=${m.scroll.cw} ow=${m.scroll.ow}; offenders=${m.offenders.join(' | ')}; scrollH=${JSON.stringify(m.scrollH)}` });
        if (m.clipped.length) test.info().annotations.push({ type: 'clipped-right-edge', description: m.clipped.join(' | ') });
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
test.describe('Tabbar — thứ tự, route, badge, quyền', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS['iphone-390']);
  });

  test('5 mục đúng thứ tự, Hội thoại ở giữa và nổi, href đúng route', async ({ page }) => {
    await installMocks(page);
    await page.goto('/account');
    await waitShell(page);
    expect(await tabLabels(page)).toEqual(TAB_ORDER.map(t => t.label));
    const hrefs = await page.locator(TABBAR_LINKS).evaluateAll(els => els.map(e => new URL((e as HTMLAnchorElement).href).pathname));
    expect(hrefs).toEqual(TAB_ORDER.map(t => t.path));
    const prominentIndex = await page.locator(TABBAR_LINKS).evaluateAll(els => els.findIndex(e => e.classList.contains('m-tab--prominent')));
    expect(prominentIndex).toBe(2);
    // Hội thoại nằm giữa theo hình học (tâm nút ~ tâm màn hình).
    const box = await page.locator(TABBAR_LINKS).nth(2).boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - 390 / 2)).toBeLessThan(3);
  });

  test('bấm từng mục chuyển đúng route', async ({ page }) => {
    await installMocks(page);
    await page.goto('/account');
    await waitShell(page);
    for (const tab of TAB_ORDER) {
      await page.locator(TABBAR_LINKS).filter({ hasText: tab.label }).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/$' : tab.path + '$'}`));
    }
  });

  const CURRENT: Array<[string, string]> = [
    ['/', 'Tổng quan'],
    ['/contacts', 'Khách hàng'],
    ['/chat', 'Hội thoại'],
    ['/appointments', 'Lịch hẹn'],
    ['/account', 'Tài khoản'],
    ['/reports/tong-quan', 'Tài khoản'],
    ['/settings/personal/profile', 'Tài khoản'],
  ];
  for (const [route, label] of CURRENT) {
    test(`aria-current: ${route} -> ${label}`, async ({ page }) => {
      await installMocks(page);
      await page.goto(route);
      await waitShell(page);
      const current = await page.locator(`${TABBAR_LINKS}[aria-current="page"]`).evaluateAll(els => els.map(e => (e.querySelector('.m-tab__label')?.textContent ?? '').trim()));
      expect(current).toEqual([label]);
    });
  }

  test('thread /chat/:convId: tabbar ẩn theo §4.1', async ({ page }) => {
    await installMocks(page);
    await page.goto('/chat/qa-conv-1');
    await waitShell(page);
    await expect(page.locator('nav[aria-label="Điều hướng chính"]')).toHaveCount(0);
  });

  test('badge: hiện số, aria-label, 99+', async ({ page }) => {
    const state = await installMocks(page, { waiting: 7 });
    await page.goto('/account');
    await waitShell(page);
    const badge = page.locator('.m-tab__badge');
    await expect(badge).toHaveText('7', { timeout: 12_000 });
    await expect(page.locator(TABBAR_LINKS).nth(2)).toHaveAttribute('aria-label', 'Hội thoại, 7 khách đang chờ trả lời');
    expect(state.countsCalls).toBeGreaterThan(0);
    state.waiting = 150;
    await page.reload();
    await waitShell(page);
    await expect(page.locator('.m-tab__badge')).toHaveText('99+', { timeout: 12_000 });
  });

  test('badge: ẩn khi 0', async ({ page }) => {
    const state = await installMocks(page, { waiting: 0 });
    await page.goto('/account');
    await waitShell(page);
    await expect.poll(() => state.countsCalls, { timeout: 12_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await expect(page.locator('.m-tab__badge')).toHaveCount(0);
  });

  test('badge: ẩn khi API lỗi (không đổi lỗi thành 0 hay số)', async ({ page }) => {
    const state = await installMocks(page, { waiting: 'error' });
    await page.goto('/account');
    await waitShell(page);
    await expect.poll(() => state.countsCalls, { timeout: 12_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await expect(page.locator('.m-tab__badge')).toHaveCount(0);
    await expect(page.locator(TABBAR_LINKS).nth(2)).toHaveAttribute('aria-label', 'Hội thoại');
  });

  test('quyền: thiếu conversation + contact -> chỉ 3 mục, không nút nổi', async ({ page }) => {
    await installMocks(page, { user: NO_CHAT_CONTACT });
    await page.goto('/account');
    await waitShell(page);
    expect(await tabLabels(page)).toEqual(['Tổng quan', 'Lịch hẹn', 'Tài khoản']);
    await expect(page.locator('.m-tab--prominent')).toHaveCount(0);
    // tabbar co lại: ba mục chia đều chiều ngang
    const widths = await page.locator(TABBAR_LINKS).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
  });

  test('quyền: có conversation + contact (sale) -> đủ 5 mục, không có tab Báo cáo', async ({ page }) => {
    await installMocks(page, { user: SALE });
    await page.goto('/account');
    await waitShell(page);
    expect(await tabLabels(page)).toEqual(TAB_ORDER.map(t => t.label));
    expect(await tabLabels(page)).not.toContain('Báo cáo');
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('Menu Tài khoản — RBAC, không TikTok', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS['iphone-390']);
  });

  async function menuText(page: Page): Promise<string> {
    await page.goto('/account');
    await waitShell(page);
    await page.locator('.m-account').waitFor();
    return (await page.locator('.m-account').innerText()).replace(/\s+/g, ' ');
  }

  test('admin: thấy đủ mục việc, không chữ TikTok, có Đăng xuất', async ({ page }) => {
    await installMocks(page, { user: ADMIN });
    const text = await menuText(page);
    for (const t of ['Thông tin cá nhân', 'Đổi mật khẩu', 'Thông báo', 'Nick Zalo', 'Kho media', 'Báo cáo', 'Cài đặt tổ chức', 'Đăng xuất']) expect(text).toContain(t);
    expect(text).not.toMatch(/tiktok/i);
    expect((await page.locator('body').innerText())).not.toMatch(/tiktok/i);
  });

  test('sale: ẩn Nick Zalo / Kho media / Báo cáo / Cài đặt tổ chức', async ({ page }) => {
    await installMocks(page, { user: SALE });
    const text = await menuText(page);
    for (const t of ['Thông tin cá nhân', 'Đổi mật khẩu', 'Thông báo', 'Đăng xuất']) expect(text).toContain(t);
    for (const t of ['Nick Zalo', 'Kho media', 'Báo cáo', 'Cài đặt tổ chức']) expect(text).not.toContain(t);
    expect(text).not.toMatch(/tiktok/i);
  });

  test('leader có engagement_score: thấy Báo cáo, ẩn Nick Zalo / Cài đặt tổ chức', async ({ page }) => {
    await installMocks(page, { user: LEADER });
    const text = await menuText(page);
    expect(text).toContain('Báo cáo');
    expect(text).not.toContain('Nick Zalo');
    expect(text).not.toContain('Cài đặt tổ chức');
  });

  test('menu: "Báo cáo" dẫn tới /reports/tong-quan', async ({ page }) => {
    await installMocks(page, { user: ADMIN });
    await menuText(page);
    await page.locator('.m-account').getByText('Báo cáo', { exact: true }).click();
    await expect(page).toHaveURL(/\/reports\/tong-quan$/);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('Giao diện Sáng / Tối / Theo máy', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS['iphone-390']);
  });

  test('mặc định Sáng (máy ở chế độ sáng): data-theme, color-scheme, theme-color, Vuetify', async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/account');
    await waitShell(page);
    expect(await themeSnapshot(page)).toEqual({ htmlTheme: 'light', shellTheme: 'light', colorScheme: 'light only', themeColor: '#f7f9fc', vuetify: 'hsLight' });
  });

  test('Sáng khi máy đang ở chế độ tối: vẫn Sáng, color-scheme "light only"', async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/account');
    await waitShell(page);
    const s = await themeSnapshot(page);
    expect(s.shellTheme).toBe('light');
    expect(s.colorScheme).toBe('light only');
    expect(s.vuetify).toBe('hsLight');
  });

  test('chọn Tối: mọi tác động đổi theo, chọn lại Sáng thì khôi phục', async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/account');
    await waitShell(page);
    await pickTheme(page, 'Tối');
    await expect.poll(() => themeSnapshot(page)).toEqual({ htmlTheme: 'dark', shellTheme: 'dark', colorScheme: 'dark', themeColor: '#0f1720', vuetify: 'hsDark' });
    // Nền thật sự tối (không chỉ đổi attr): màu nền shell khác nền sáng.
    const bg = await page.locator(SHELL).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(15, 23, 32)');
    await pickTheme(page, 'Sáng');
    await expect.poll(() => themeSnapshot(page)).toEqual({ htmlTheme: 'light', shellTheme: 'light', colorScheme: 'light only', themeColor: '#f7f9fc', vuetify: 'hsLight' });
  });

  test('Theo máy: theo prefers-color-scheme và đổi trực tiếp khi máy đổi', async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/account');
    await waitShell(page);
    await pickTheme(page, 'Theo máy');
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
    expect((await themeSnapshot(page)).colorScheme).toBe('dark');
    expect((await themeSnapshot(page)).vuetify).toBe('hsDark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('light');
    expect((await themeSnapshot(page)).colorScheme).toBe('light only');
    expect((await themeSnapshot(page)).vuetify).toBe('hsLight');
  });

  test('reload giữ lựa chọn theo user; user khác không thừa hưởng; không ghi key "theme"', async ({ page }) => {
    const state = await installMocks(page, { user: ADMIN });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/account');
    await waitShell(page);
    await pickTheme(page, 'Tối');
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
    await page.reload();
    await waitShell(page);
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
    const stored = await page.evaluate(() => ({ a: localStorage.getItem('crm.mobile.themePreference:qa-user-admin'), root: localStorage.getItem('crm.mobile.themePreference'), legacy: localStorage.getItem('theme') }));
    expect(stored.a).toBe('dark');
    expect(stored.legacy).toBeNull();
    // Đổi sang user khác trên cùng thiết bị.
    state.user = OTHER_ADMIN;
    await page.evaluate(() => { localStorage.removeItem('token'); localStorage.setItem('token', 'qa-fake-token-not-real'); });
    await page.reload();
    await waitShell(page);
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('light');
    expect((await themeSnapshot(page)).vuetify).toBe('hsLight');
    // Quay lại user đầu: vẫn Tối.
    state.user = ADMIN;
    await page.reload();
    await waitShell(page);
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
  });

  test('Báo cáo luôn Sáng dù đang chọn Tối; quay về Tài khoản lại Tối', async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/account');
    await waitShell(page);
    await pickTheme(page, 'Tối');
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
    await page.locator('.m-account').getByText('Báo cáo', { exact: true }).click();
    await expect(page).toHaveURL(/\/reports\/tong-quan$/);
    await expect.poll(() => themeSnapshot(page)).toMatchObject({ htmlTheme: 'light', shellTheme: 'light', colorScheme: 'light only', vuetify: 'hsLight' });
    await page.locator(TABBAR_LINKS).filter({ hasText: 'Tài khoản' }).click();
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
  });

  test('mobile -> desktop (resize): dọn data-theme, color-scheme về "light only", Vuetify hsLight', async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/account');
    await waitShell(page);
    await pickTheme(page, 'Tối');
    await expect.poll(async () => (await themeSnapshot(page)).shellTheme).toBe('dark');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(SHELL)).toHaveCount(0);
    const s = await themeSnapshot(page);
    expect(s.htmlTheme).toBeNull();
    expect(s.colorScheme).toBe('light only');
    expect(s.vuetify).toBe('hsLight');
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('Touch target ≥ 44px và safe-area (mô phỏng)', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`${name}: phần tử tương tác của shell + màn Tài khoản >= 44x44`, async ({ page }) => {
      await installMocks(page, { waiting: 3 });
      await page.setViewportSize(vp);
      await page.goto('/account');
      await waitShell(page);
      const small = await page.evaluate(() => {
        const sels = ['nav.m-tabbar a.m-tab', 'header.m-header button', '.m-account a', '.m-account button', '.m-account label.m-theme__option', '.m-account [role="button"]'];
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll(sels.join(',')))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.width < 43.5 || r.height < 43.5) {
            out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return out;
      });
      expect(small, `Phần tử nhỏ hơn 44px: ${small.join('; ')}`).toEqual([]);
    });
  }

  test('mô phỏng safe-area (top 47 / bottom 34): header & tabbar nhường vùng, không che nội dung', async ({ page }) => {
    // LƯU Ý: chỉ đè biến --m-safe-* bằng tay. env(safe-area-inset-*) thật = 0 trên desktop; KHÔNG thay cho kiểm trên iPhone thật.
    await installMocks(page);
    await page.setViewportSize(VIEWPORTS['iphone-390']);
    await page.goto('/account');
    await waitShell(page);
    const before = await page.evaluate(() => ({
      header: document.querySelector('header.m-header')!.getBoundingClientRect().height,
      tabbar: document.querySelector('nav.m-tabbar')!.getBoundingClientRect().height,
    }));
    await page.evaluate(() => {
      const el = document.querySelector('.m-shell') as HTMLElement;
      el.style.setProperty('--m-safe-top', '47px');
      el.style.setProperty('--m-safe-bottom', '34px');
    });
    const after = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('nav.m-tabbar a.m-tab')).map(e => e.getBoundingClientRect());
      const title = document.querySelector('header.m-header h1')!.getBoundingClientRect();
      const nav = document.querySelector('nav.m-tabbar')!.getBoundingClientRect();
      return {
        header: document.querySelector('header.m-header')!.getBoundingClientRect().height,
        tabbar: nav.height,
        titleTop: title.top,
        maxTabBottom: Math.max(...tabs.map(t => t.bottom)),
        navBottom: nav.bottom,
        innerHeight: window.innerHeight,
      };
    });
    expect(after.header - before.header).toBeGreaterThanOrEqual(46);
    expect(after.tabbar - before.tabbar).toBeGreaterThanOrEqual(33);
    expect(after.titleTop).toBeGreaterThanOrEqual(47);
    expect(after.maxTabBottom).toBeLessThanOrEqual(after.innerHeight - 34 + 0.5);
    expect(Math.round(after.navBottom)).toBe(after.innerHeight);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('Desktop / compact: không dựng shell mobile', () => {
  for (const vp of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    test(`${vp.width}x${vp.height}: không có .m-shell / tabbar mobile`, async ({ page }) => {
      await installMocks(page);
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.locator('#app > *').first().waitFor({ state: 'attached' });
      await page.waitForTimeout(1200);
      await expect(page.locator(SHELL)).toHaveCount(0);
      await expect(page.locator('nav.m-tabbar')).toHaveCount(0);
      const s = await themeSnapshot(page);
      expect(s.htmlTheme).toBeNull();
      expect(s.vuetify === null || s.vuetify === 'hsLight').toBe(true);
    });

    test(`${vp.width}x${vp.height}: /account chuyển về /settings/personal/profile`, async ({ page }) => {
      await installMocks(page);
      await page.setViewportSize(vp);
      await page.goto('/account');
      await expect(page).toHaveURL(/\/settings\/personal\/profile$/, { timeout: 15_000 });
      await expect(page.locator(SHELL)).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------------------------
test.describe('Banner offline', () => {
  test('câu chữ mới, nằm trong luồng (không đè header), biến mất khi có mạng', async ({ page }) => {
    await installMocks(page);
    await page.setViewportSize(VIEWPORTS['iphone-390']);
    await page.goto('/account');
    await waitShell(page);
    await expect(page.locator('.m-offline')).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    const banner = page.locator('.m-offline');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText('Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng');
    const geo = await page.evaluate(() => ({
      banner: document.querySelector('.m-offline')!.getBoundingClientRect().bottom,
      header: document.querySelector('header.m-header')!.getBoundingClientRect().top,
      docW: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    }));
    expect(geo.banner).toBeLessThanOrEqual(geo.header + 1);
    expect(geo.docW[0]).toBeLessThanOrEqual(geo.docW[1]);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await expect(page.locator('.m-offline')).toHaveCount(0);
  });
});
