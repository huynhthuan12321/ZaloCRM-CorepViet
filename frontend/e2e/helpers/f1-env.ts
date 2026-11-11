// Tiện ích dùng chung cho e2e/f1-settings*.spec.ts. Dữ liệu GIẢ; không backend/Zalo thật; Service Worker bị chặn ở test.use().
import type { Browser, BrowserContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { setTheme } from './mock-chat';
import { installF1Mocks, OWNER, type F1Mock } from './mock-f1';
import type { FakeUser } from './mock-api';

export const OUT = process.env.F1_OUT ?? path.resolve(import.meta.dirname, '../../../docs/mobile-upgrade/qa/F1-settings');
export const SHOTS = path.join(OUT, 'shots');
export const RES = path.join(OUT, 'results');
export const FIXED_NOW = '2026-11-10T10:00:00+07:00';

export interface Vp { name: string; w: number; h: number; touch: boolean; landscape?: boolean }
export const PHONES: Vp[] = [
  { name: '320x568', w: 320, h: 568, touch: true },
  { name: '375x812', w: 375, h: 812, touch: true },
  { name: '390x844', w: 390, h: 844, touch: true },
  { name: '393x852', w: 393, h: 852, touch: true },
  { name: '402x874', w: 402, h: 874, touch: true },
  { name: '430x932', w: 430, h: 932, touch: true },
  { name: '844x390', w: 844, h: 390, touch: true, landscape: true },
  { name: '932x430', w: 932, h: 430, touch: true, landscape: true },
];
export const TABLETS: Vp[] = [
  { name: '768x1024', w: 768, h: 1024, touch: true },
  { name: '1024x768', w: 1024, h: 768, touch: true },
];
export const DESKTOP: Vp = { name: '1440x900', w: 1440, h: 900, touch: false };

export const APP = `http://localhost:${process.env.D_APP_PORT ?? 4188}`;
export const BASE = `http://localhost:${process.env.D_BASE_PORT ?? 4189}`;

export function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }); return d; }

export async function newCtx(browser: Browser, v: Vp, scheme: 'light' | 'dark' = 'light'): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: v.w, height: v.h }, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: v.touch ? 2 : 1,
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: scheme, serviceWorkers: 'block',
  });
}

export interface Booted { ctx: BrowserContext; page: Page; mock: F1Mock; errors: string[] }
/** Mở context + trang với mock F1; theme áp cho người dùng `user`. Không điều hướng. */
export async function boot(browser: Browser, v: Vp, opts: { theme?: 'light' | 'dark'; user?: FakeUser; origin?: string } = {}): Promise<Booted> {
  const user = opts.user ?? OWNER;
  const ctx = await newCtx(browser, v, opts.theme ?? 'light');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 240)));
  const mock = await installF1Mocks(page, { user });
  await setTheme(page, opts.theme ?? 'light', user.id);
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  return { ctx, page, mock, errors };
}

export async function go(page: Page, url: string, ready: string, origin = APP) {
  await page.goto(`${origin}${url}`);
  await page.locator(ready).first().waitFor({ timeout: 20_000 });
}

/** Chờ ổn định (font + ảnh) để ảnh chụp lặp lại được. */
export async function settle(page: Page, ms = 700) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
  });
  await page.waitForTimeout(ms);
}

/** Đo mọi thứ liên quan "tràn trang" + vùng cuộn của shell. */
export async function overflowInfo(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('.m-main__scroll') as HTMLElement | null;
    const settings = document.querySelector('.crm-settings') as HTMLElement | null;
    return {
      docX: de.scrollWidth - de.clientWidth, bodyX: document.body.scrollWidth - document.body.clientWidth,
      mainX: main ? main.scrollWidth - main.clientWidth : 0, settingsX: settings ? settings.scrollWidth - settings.clientWidth : 0,
      vw: innerWidth, vh: innerHeight,
    };
  });
}

/** Khối nền sáng lớn trong scope khi Tối (bỏ mô phỏng đăng nhập chủ ý sáng của Hồ sơ tổ chức). */
export async function lightBlocks(page: Page, scopes: string[], minArea = 6000) {
  return page.evaluate(({ scopes, minArea }) => {
    const out: string[] = [];
    for (const scope of scopes) {
      for (const root of Array.from(document.querySelectorAll(scope))) {
        for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
          const r = el.getBoundingClientRect();
          if (r.width * r.height < minArea || r.bottom < 0 || r.top > innerHeight) continue;
          if (el.closest('[inert],[aria-hidden="true"],.org-preview-light,.org-preview-col')) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
          if (!m) continue;
          const [rr, gg, bb, a] = m[1].split(',').map(s => parseFloat(s));
          if (a !== undefined && a < 0.9) continue;
          if ((0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255 > 0.85) {
            const e = el as HTMLElement;
            out.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
      }
    }
    return out;
  }, { scopes, minArea });
}

/** Mọi nút/ô nhập của overlay phải nằm trong viewport (footer không bị che/trôi khỏi màn hình). */
export async function overlayInViewport(page: Page, scope: string) {
  return page.evaluate((scope) => {
    const root = Array.from(document.querySelectorAll(scope)).find(e => (e as HTMLElement).getClientRects().length > 0) as HTMLElement | undefined;
    if (!root) return { found: false, rect: null as null | { top: number; bottom: number; left: number; right: number }, footerBottom: null as number | null, vh: innerHeight, vw: innerWidth };
    const r = root.getBoundingClientRect();
    const foot = root.querySelector('.m-sheet__footer, .cuwz-footer, .panel-foot') as HTMLElement | null;
    return { found: true, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, footerBottom: foot ? foot.getBoundingClientRect().bottom : null, vh: innerHeight, vw: innerWidth };
  }, scope);
}

/**
 * Đánh dấu data-qa-ignore cho phần tử mà công cụ đo tương phản KHÔNG đo đúng được (không phải bỏ lỗi thật):
 *  - [disabled]: nút đang vô hiệu (WCAG miễn trừ);
 *  - .av-initials: chữ trắng trên nền gradient/ảnh của Avatar (nền là background-image nên đo ngược cây không thấy) -> kiểm bằng mắt qua ảnh chụp;
 *  - .org-preview-col: mô phỏng trang đăng nhập có nền ảnh/gradient, chủ ý luôn Sáng -> kiểm riêng bằng test "preview giữ sáng".
 */
export async function markQaIgnores(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[disabled],.av-initials,.org-preview-col').forEach(e => e.setAttribute('data-qa-ignore', ''));
  });
}

/** Ô Vuetify: chiều cao vùng chạm là .v-field (không phải <input> bên trong). Trả về các ô <44. */
export async function shortVuetifyFields(page: Page, scope: string) {
  return page.evaluate((scope) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(scope))) {
      for (const f of Array.from(root.querySelectorAll('.v-field'))) {
        const r = f.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || f.closest('.org-preview-col,[inert],[aria-hidden="true"]')) continue;
        if (r.height < 43.5) out.push(`v-field ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  }, scope);
}

/** Giữ tên helper của QA; mọi luồng hiện đều tải lạnh để không che lỗi lazy CSS. */
export async function goWarm(page: Page, url: string, ready: string, origin = APP) {
  await go(page, url, ready, origin);
}
