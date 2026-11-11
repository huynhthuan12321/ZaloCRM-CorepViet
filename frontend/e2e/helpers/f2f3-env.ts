// Tiện ích dùng chung cho e2e/f2f3-*.spec.ts (QA F2 Kho media mobile + F3 Tài khoản › Khác).
// Dữ liệu GIẢ; không backend/Zalo thật; Service Worker bị chặn ở test.use(). KHÔNG ghi vào repo: ảnh/JSON/log ra ngoài (F2F3_OUT).
// Không ghi đè bằng chứng F1 (mock-f1 / f1-env chỉ được import để dùng lại hàm, không ghi vào OUT của F1).
import type { Browser, BrowserContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const OUT = process.env.F2F3_OUT ?? 'C:/Users/Public/f2f3-agent/evidence';
export const SHOTS = path.join(OUT, 'shots');
export const RES = path.join(OUT, 'results');
export const FIXED_NOW = '2026-11-10T10:00:00+07:00';

export interface Vp { name: string; w: number; h: number; touch: boolean; landscape?: boolean }
export const PHONES: Vp[] = [
  { name: '320x568', w: 320, h: 568, touch: true },
  { name: '375x812', w: 375, h: 812, touch: true },
  { name: '390x844', w: 390, h: 844, touch: true },
  { name: '430x932', w: 430, h: 932, touch: true },
  { name: '844x390', w: 844, h: 390, touch: true, landscape: true },
  { name: '932x430', w: 932, h: 430, touch: true, landscape: true },
];
export const TABLETS: Vp[] = [
  { name: '768x1024', w: 768, h: 1024, touch: true },
  { name: '1024x768', w: 1024, h: 768, touch: true },
];
export const DESKTOP: Vp = { name: '1440x900', w: 1440, h: 900, touch: false };
export const PHONE_390: Vp = PHONES[2];

export const APP = `http://localhost:${process.env.D_APP_PORT ?? 4198}`;
export const BASE = `http://localhost:${process.env.D_BASE_PORT ?? 4199}`;

export function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }); return d; }

export async function newCtx(browser: Browser, v: Vp, scheme: 'light' | 'dark' = 'light'): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: v.w, height: v.h }, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: v.touch ? 2 : 1,
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: scheme, serviceWorkers: 'block',
  });
}

/** Chờ ổn định (font + ảnh) để ảnh chụp lặp lại được. */
export async function settle(page: Page, ms = 600) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
  });
  await page.waitForTimeout(ms);
}

/** Đặt theme như người dùng đã chọn (khóa localStorage do mobile theme composable đọc; cùng cách mock-chat.setTheme). */
export async function applyOffline(page: Page, ctx: BrowserContext, offline: boolean) {
  // Chặn mạng thật + đồng bộ navigator.onLine/sự kiện (Playwright không luôn phát sự kiện online/offline trên mọi engine).
  await ctx.setOffline(offline);
  await page.evaluate((off) => {
    Object.defineProperty(navigator, 'onLine', { get: () => !off, configurable: true });
    window.dispatchEvent(new Event(off ? 'offline' : 'online'));
  }, offline);
  await page.waitForTimeout(250);
}

/** Đo mọi thứ liên quan "tràn trang". */
export async function overflowInfo(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('.m-main__scroll') as HTMLElement | null;
    const roots = Array.from(document.querySelectorAll('.m-media-page, .m-tool, .m-acc, .m-sheet, .m-viewer')) as HTMLElement[];
    const rootX = roots.map(r => ({ cls: r.className.toString().split(' ')[0], x: r.scrollWidth - r.clientWidth })).filter(r => r.x > 0);
    return {
      docX: de.scrollWidth - de.clientWidth, bodyX: document.body.scrollWidth - document.body.clientWidth,
      mainX: main ? main.scrollWidth - main.clientWidth : 0, rootX, vw: innerWidth, vh: innerHeight,
    };
  });
}

/** Phần tử nằm lọt ra ngoài mép phải/trái viewport (trừ hàng chip/tab cuộn ngang chủ ý và toast dùng chung). */
export async function offscreenElements(page: Page, scope = 'body') {
  return page.evaluate((scope) => {
    const out: string[] = [];
    const inScroller = (el: Element, root: Element) => {
      for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };
    for (const root of Array.from(document.querySelectorAll(scope))) {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.closest('[inert],[aria-hidden="true"],.v-overlay__scrim,.toast-container,[data-qa-hscroll]')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (r.right > innerWidth + 1 || r.left < -1) {
          if (inScroller(el, root)) continue;
          const e = el as HTMLElement;
          out.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')} L${Math.round(r.left)} R${Math.round(r.right)} vw${innerWidth}`);
        }
      }
    }
    return out.slice(0, 12);
  }, scope);
}

/** Điều khiển chạm có thể thao tác nhỏ hơn 44x44 CSS px (đo kích thước hộp bao). */
export async function smallTouchTargets(page: Page, min = 44, scope = 'body') {
  return page.evaluate(({ min, scope }) => {
    const sel = 'button, a[href], select, input:not([type=hidden]), textarea, [role=button], [role=checkbox], [role=tab], summary';
    const out: string[] = [];
    const els = Array.from(document.querySelectorAll(scope)).flatMap(r => Array.from(r.querySelectorAll(sel)));
    for (const el of els) {
      if (el.closest('[inert],[aria-hidden="true"],.v-overlay__scrim,.toast-container')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (el.matches('input[type=file]')) continue;
      // Ô nhập bọc trong <label> có vùng chạm là label: đo label thay vì input trần.
      const box = el.matches('input,select,textarea') && el.closest('label') ? el.closest('label')!.getBoundingClientRect() : r;
      if (box.width < min - 0.5 || box.height < min - 0.5) {
        const e = el as HTMLElement;
        const label = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
        out.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')} "${label}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return out;
  }, { min, scope });
}

/** Ô nhập có font < 16px (iOS tự zoom khi focus) + cỡ chữ nhỏ nhất của chữ đang hiện. */
export async function textSizes(page: Page, scope = 'body') {
  return page.evaluate((scope) => {
    const smallInputs: string[] = [];
    let minText = 99;
    let minTextSel = '';
    const roots = Array.from(document.querySelectorAll(scope));
    for (const el of roots.flatMap(r => Array.from(r.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]):not([type=range]):not([type=button]):not([type=submit]),select,textarea')))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('[inert],[aria-hidden="true"]')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) smallInputs.push(`${el.tagName.toLowerCase()} ${fs}px`);
    }
    for (const el of roots.flatMap(r => Array.from(r.querySelectorAll('*')))) {
      if (el.closest('[inert],[aria-hidden="true"],.v-overlay__scrim,.toast-container')) continue;
      const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent || '').join('').trim();
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs < minText) { minText = fs; minTextSel = `${el.tagName.toLowerCase()}.${(typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0]} "${own.slice(0, 20)}"`; }
    }
    return { smallInputs, minText, minTextSel };
  }, scope);
}

/** Khối nền sáng lớn khi Tối (trình xem luôn đen nên không bị tính). */
export async function lightBlocks(page: Page, minArea = 6000, scope = 'body') {
  return page.evaluate(({ minArea, scope }) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll(scope)).flatMap(r => Array.from(r.querySelectorAll('*')))) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height < minArea || r.bottom < 0 || r.top > innerHeight) continue;
      if (el.closest('[inert],[aria-hidden="true"],.toast-container') || el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const [rr, gg, bb, a] = m[1].split(',').map(s => parseFloat(s));
      if (a !== undefined && !Number.isNaN(a) && a < 0.9) continue;
      if ((0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255 > 0.85) {
        const e = el as HTMLElement;
        out.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  }, { minArea, scope });
}

/** Vùng đo: lớp phủ trên cùng (viewer > sheet) nếu đang mở, ngược lại cả trang. Phần nền sau lớp phủ không thuộc phạm vi ca đó. */
export async function measureScope(page: Page): Promise<string> {
  return page.evaluate(() => {
    const vis = (sel: string) => Array.from(document.querySelectorAll(sel)).some(e => (e as HTMLElement).getClientRects().length > 0);
    if (vis('.m-viewer')) return '.m-viewer';
    if (vis('.m-sheet')) return '.m-sheet';
    return 'body';
  });
}

/** Toast dùng chung (ToastContainer, có từ trước F2/F3): đo riêng để báo cáo, KHÔNG gộp vào kết quả của F2/F3. */
export async function toastMetrics(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const b of Array.from(document.querySelectorAll('.toast-container button'))) {
      const r = b.getBoundingClientRect();
      if (r.width && (r.width < 44 || r.height < 44)) out.push(`toast button ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const toastLight = Array.from(document.querySelectorAll('.toast-container .toast')).map(t => getComputedStyle(t).backgroundColor);
    return { small: out, backgrounds: toastLight };
  });
}

export async function markQaIgnores(page: Page) {
  await page.evaluate(() => { document.querySelectorAll('[disabled],.av-initials,.toast-container').forEach(e => e.setAttribute('data-qa-ignore', '')); });
}
