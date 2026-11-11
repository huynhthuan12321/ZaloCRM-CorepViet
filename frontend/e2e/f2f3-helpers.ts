// Hàm dùng chung cho f2f3-functional.spec.ts (boot trang với mock F2/F3, thao tác chạm/cử chỉ, đọc thông báo).
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { ADMIN, SALE, type FakeUser } from './helpers/mock-api';
import { setTheme } from './helpers/mock-chat';
import { installF2F3Mocks, type F2F3Mock, type F2F3Options } from './helpers/mock-f2f3';
import { APP, FIXED_NOW, newCtx, settle, type Vp } from './helpers/f2f3-env';

export { ADMIN, SALE };
export interface Booted { ctx: BrowserContext; page: Page; mock: F2F3Mock; errors: string[] }

export async function boot(browser: Browser, vp: Vp, opts: F2F3Options & { theme?: 'light' | 'dark'; nick?: string } = {}): Promise<Booted> {
  const ctx = await newCtx(browser, vp, opts.theme ?? 'light');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 240)));
  const user: FakeUser = opts.user ?? ADMIN;
  const mock = await installF2F3Mocks(page, { ...opts, user });
  await setTheme(page, opts.theme ?? 'light', user.id);
  if (opts.nick) await page.addInitScript((n) => localStorage.setItem('selected-zalo-account', n), opts.nick);
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  return { ctx, page, mock, errors };
}

export async function open(page: Page, url: string, ready: string) {
  await page.goto(`${APP}${url}`);
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 20_000 });
}

/** Mở /media và chờ lưới có ô. */
export async function openMedia(page: Page) {
  await open(page, '/media', '.m-mg__cell');
}

export const CELLS = '.m-mg__cell';
export const PICKS = '.m-mg__pick';
export const SEND = '.m-ml__btn[data-action="send"]';
export const cell = (page: Page, name: string) => page.locator(`${CELLS}[aria-label="Xem ${name}"]`);
export const pick = (page: Page, name: string) => page.locator(`${PICKS}[aria-label="Chọn ${name}"]`);
export const imgName = (n: number) => (n === 4 ? 'Ảnh sản phẩm có tên rất dài để kiểm tra việc ngắt dòng trên màn hình hẹp 320 pixel.jpg' : `Ảnh sản phẩm ${String(n).padStart(3, '0')}.jpg`);
export const imgId = (n: number) => `qa-img-${String(n).padStart(3, '0')}`;

/** Chọn khách ở trang /media qua MediaTargetSheet. */
export async function chooseTarget(page: Page, customerName: string) {
  await page.getByRole('button', { name: /^(Chọn khách|Đổi)$/ }).first().click();
  const row = page.locator('.m-mts__row', { hasText: customerName }).first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  await row.click();
  await page.locator('.m-mts__row').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
}

export function confirmDialog(page: Page) {
  return page.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: /Gửi cho/ }).first();
}

/** Mô phỏng vuốt bằng TouchEvent tổng hợp (không phải cử chỉ thật của iOS) — chạy được cả Chromium và WebKit desktop. */
export async function swipe(page: Page, selector: string, dx: number, dy: number) {
  await page.evaluate(({ selector, dx, dy }) => {
    const el = document.querySelector(selector) as HTMLElement;
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const mk = (type: string, x: number, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      const pt = { clientX: x, clientY: y, identifier: 1, target: el };
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [pt] });
      Object.defineProperty(ev, 'changedTouches', { value: [pt] });
      return ev;
    };
    el.dispatchEvent(mk('touchstart', x0, y0));
    el.dispatchEvent(mk('touchmove', x0 + dx / 2, y0 + dy / 2));
    el.dispatchEvent(mk('touchmove', x0 + dx, y0 + dy));
    el.dispatchEvent(mk('touchend', x0 + dx, y0 + dy));
  }, { selector, dx, dy });
}

/** Router của app (để đổi hội thoại giống bấm thông báo/back phần cứng). */
export async function routerPush(page: Page, to: string) {
  await page.evaluate((to) => {
    const app = (document.querySelector('#app') as unknown as { __vue_app__?: { config: { globalProperties: { $router: { push: (t: string) => Promise<unknown> } } } } }).__vue_app__;
    return app!.config.globalProperties.$router.push(to);
  }, to);
}

export async function toastTexts(page: Page): Promise<string[]> {
  return page.locator('[role="status"], [role="alert"], .toast, .m-toast').allInnerTexts();
}

export async function bodyText(page: Page) {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

export { settle };
