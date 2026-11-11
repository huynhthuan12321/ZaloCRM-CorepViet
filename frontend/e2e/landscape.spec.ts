// QA hotfix "iPhone xoay ngang bị chuyển sang desktop" (09/11/2026). Chạy trên bản build (vite preview, cổng 4174).
// Mức bằng chứng: Chromium / WebKit DESKTOP với hasTouch + isMobile mô phỏng. KHÔNG phải Safari iPhone thật.
// BASE_DIST (tùy chọn): dist của mobile/base (cổng 4175) -> chụp ảnh "trước" để so với bản hotfix.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { DESKTOP_COMPACT_MEDIA_QUERY, DESKTOP_MEDIA_QUERY, MOBILE_MEDIA_QUERY } from '../src/composables/use-mobile';
import { EDITOR, installChatMocks, setTheme, waitInbox, waitThread } from './helpers/mock-chat';

const SHOTS = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/hotfix-landscape-shots');
const SHELL = 'http://localhost:4174';
const BASE = 'http://localhost:4175';
const HIDE_SCROLLBAR = () => {
  const add = () => { const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none !important}'; (document.head || document.documentElement).appendChild(st); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
};

interface Env { w: number; h: number; touch: boolean }
async function newCtx(browser: Browser, e: Env): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: e.w, height: e.h }, hasTouch: e.touch, isMobile: e.touch, deviceScaleFactor: 2,
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'light',
  });
}
async function boot(page: Page, theme: 'light' | 'dark' = 'light') {
  const mock = await installChatMocks(page, {});
  await setTheme(page, theme);
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  await page.addInitScript(HIDE_SCROLLBAR);
  return mock;
}
const traits = (page: Page) => page.evaluate(({ m, d, c }) => ({
  mobile: matchMedia(m).matches, desktop: matchMedia(d).matches, compact: matchMedia(c).matches,
  coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches,
  hoverNone: matchMedia('(hover: none)').matches, hoverHover: matchMedia('(hover: hover)').matches,
  w: innerWidth, h: innerHeight,
}), { m: MOBILE_MEDIA_QUERY, d: DESKTOP_MEDIA_QUERY, c: DESKTOP_COMPACT_MEDIA_QUERY });

// ───────────────────────────── a. Ma trận điều kiện ─────────────────────────────
const MATRIX: Array<Env & { name: string; expectMobile: boolean }> = [
  { name: 'iPhone dọc 390x844 cảm ứng', w: 390, h: 844, touch: true, expectMobile: true },
  { name: 'iPhone ngang 844x390 cảm ứng', w: 844, h: 390, touch: true, expectMobile: true },
  { name: 'iPhone Pro Max ngang 932x430 cảm ứng', w: 932, h: 430, touch: true, expectMobile: true },
  { name: 'iPhone SE ngang 667x375 cảm ứng', w: 667, h: 375, touch: true, expectMobile: true },
  { name: 'iPad ngang 1024x768 cảm ứng', w: 1024, h: 768, touch: true, expectMobile: false },
  { name: 'iPad Pro 1366x1024 cảm ứng', w: 1366, h: 1024, touch: true, expectMobile: false },
  { name: 'Desktop 1440x900 chuột', w: 1440, h: 900, touch: false, expectMobile: false },
  { name: 'Cửa sổ thấp 900x400 chuột', w: 900, h: 400, touch: false, expectMobile: false },
];
test.describe('a. Ma trận MOBILE/DESKTOP media query + layout dựng ra', () => {
  for (const m of MATRIX) {
    test(m.name, async ({ browser, browserName }, info) => {
      const ctx = await newCtx(browser, m);
      const page = await ctx.newPage();
      await boot(page);
      await page.goto('/chat');
      await page.locator(m.expectMobile ? '.crm-mobile.m-shell' : '.smax-topnav').first().waitFor({ state: 'attached', timeout: 15_000 });
      const t = await traits(page);
      info.annotations.push({ type: 'traits', description: JSON.stringify(t) });
      expect(t.mobile !== t.desktop, `đúng một trong hai true: ${JSON.stringify(t)}`).toBe(true);
      if (m.touch) {
        // Ghi nhận engine có thật sự cho pointer:coarse/hover:none hay không; nếu không, kết luận cho engine đó là "không đo được"
        test.skip(!(t.coarse && t.hoverNone), `${browserName}: không mô phỏng được pointer:coarse+hover:none (coarse=${t.coarse}, hoverNone=${t.hoverNone}) -> ${JSON.stringify(t)}`);
      }
      expect(t.mobile, JSON.stringify(t)).toBe(m.expectMobile);
      expect(t.desktop, JSON.stringify(t)).toBe(!m.expectMobile);
      expect(await page.locator('.crm-mobile.m-shell').count() > 0, 'dựng .m-shell').toBe(m.expectMobile);
      expect(await page.locator('.smax-topnav').count() > 0, 'dựng DefaultLayout').toBe(!m.expectMobile);
      const minW = await page.evaluate(() => getComputedStyle(document.getElementById('app')!).minWidth);
      expect(minW === '1100px', `#app min-width=${minW}`).toBe(!m.expectMobile);
      await ctx.close();
    });
  }
});

// ───────────────────────────── b. Bố cục ngang ─────────────────────────────
const LAND = [{ w: 844, h: 390, name: '844x390', safeL: 47, safeR: 47, safeB: 21 }, { w: 932, h: 430, name: '932x430', safeL: 59, safeR: 59, safeB: 21 }] as const;

async function setSafe(page: Page, l: number, r: number, b: number) {
  await page.evaluate(([l, r, b]) => {
    const el = document.querySelector('.crm-mobile.m-shell') as HTMLElement | null;
    el?.style.setProperty('--m-safe-left', `${l}px`); el?.style.setProperty('--m-safe-right', `${r}px`); el?.style.setProperty('--m-safe-bottom', `${b}px`);
  }, [l, r, b] as const);
}

/** Phần tử "nội dung" (có chữ trực tiếp / nút / ô nhập / ảnh) nằm ngoài [safeL, w-safeR] trong phạm vi scope. */
async function safeOffenders(page: Page, scope: string, safeL: number, safeR: number) {
  return page.evaluate(({ scope, safeL, safeR }) => {
    const w = innerWidth; const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(scope))) {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const e = el as HTMLElement;
        if (e.closest('[inert],[aria-hidden="true"],.m-attach__input,[data-qa-ignore]')) continue;
        const own = Array.from(e.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim());
        const interactive = e.matches('button,input,textarea,select,a[href],[contenteditable="true"],img,svg,i.mdi');
        if (!own && !interactive) continue;
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        let p: Element | null = e.parentElement; let scroller = false;
        while (p && p !== root.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { scroller = true; break; } p = p.parentElement; }
        if (scroller) continue;
        if (r.left < safeL - 2.5 || r.right > w - safeR + 2.5) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/)[0]}[${(e.textContent || '').trim().slice(0, 18)}] ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    }
    return out;
  }, { scope, safeL, safeR });
}

async function layoutChecks(page: Page, label: string, scope: string, size: typeof LAND[number]) {
  const o = await page.evaluate(() => ({
    vw: innerWidth, htmlSW: document.documentElement.scrollWidth, htmlCW: document.documentElement.clientWidth,
    bodySW: document.body.scrollWidth, appMin: getComputedStyle(document.getElementById('app')!).minWidth,
    shellSW: document.querySelector('.m-shell')?.scrollWidth ?? 0, shellCW: document.querySelector('.m-shell')?.clientWidth ?? 0,
  }));
  expect.soft(o.htmlSW, `${label}: html scrollWidth ${JSON.stringify(o)}`).toBeLessThanOrEqual(o.htmlCW);
  expect.soft(o.bodySW, `${label}: body scrollWidth ${JSON.stringify(o)}`).toBeLessThanOrEqual(o.vw);
  expect.soft(o.shellSW, `${label}: shell scrollWidth ${JSON.stringify(o)}`).toBeLessThanOrEqual(o.shellCW);
  expect.soft(o.appMin === '1100px', `${label}: #app min-width=${o.appMin}`).toBe(false);
  expect.soft(await safeOffenders(page, scope, size.safeL, size.safeR), `${label}: nội dung dưới vùng tai thỏ (safe ${size.safeL}/${size.safeR})`).toEqual([]);
}

test.describe('b. Bố cục điện thoại ngang (cảm ứng)', () => {
  for (const size of LAND) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${size.name} ${theme}: inbox, thread, composer, Tài khoản`, async ({ browser, browserName }, info) => {
        const ctx = await newCtx(browser, { w: size.w, h: size.h, touch: true });
        const page = await ctx.newPage();
        await boot(page, theme);
        await page.goto('/chat');
        await waitInbox(page);
        const t = await traits(page);
        test.skip(!(t.coarse && t.hoverNone), `${browserName}: không có pointer:coarse+hover:none (${JSON.stringify(t)})`);
        expect(t.mobile, JSON.stringify(t)).toBe(true);
        await setSafe(page, size.safeL, size.safeR, size.safeB);
        fs.mkdirSync(SHOTS, { recursive: true });
        const shot = (n: string) => page.screenshot({ path: path.join(SHOTS, `${n}-${size.name}-${theme}-${browserName}-sau.png`), animations: 'disabled', caret: 'hide' });

        // Inbox: tabbar trong màn hình + không bị safe che
        await layoutChecks(page, 'inbox', '.m-inbox, .m-tabbar', size);
        const tb = await page.locator('.m-tabbar').boundingBox();
        expect(tb, 'tabbar tồn tại').not.toBeNull();
        expect.soft(tb!.y + tb!.height, 'đáy tabbar trong màn hình').toBeLessThanOrEqual(size.h + 1);
        expect.soft(tb!.y, 'tabbar không tràn lên quá nửa màn hình').toBeGreaterThan(size.h * 0.5);
        const listBox = await page.locator('.m-inbox__list').boundingBox();
        info.annotations.push({ type: 'inbox', description: `list=${JSON.stringify(listBox)} tabbar=${JSON.stringify(tb)}` });
        expect.soft(listBox!.height, 'danh sách inbox còn chỗ xem').toBeGreaterThan(size.h * 0.35);
        await shot('inbox');

        // Thread + composer có nháp
        await page.locator('.m-conv-row', { hasText: 'Khách Giả A' }).first().click();
        await waitThread(page);
        await setSafe(page, size.safeL, size.safeR, size.safeB);
        await page.locator(EDITOR).click();
        await page.keyboard.type('Nháp thử xoay ngang (dữ liệu giả)');
        await layoutChecks(page, 'thread', '.mobile-chat__thread', size);
        const comp = await page.locator('.is-mobile .input-area').boundingBox();
        const msgs = await page.locator('.is-mobile .messages').boundingBox();
        info.annotations.push({ type: 'thread', description: `composer=${JSON.stringify(comp)} messages=${JSON.stringify(msgs)} ratio=${(msgs!.height / size.h).toFixed(3)}` });
        expect.soft(comp!.y + comp!.height, 'đáy composer trong màn hình').toBeLessThanOrEqual(size.h + 1);
        expect.soft(comp!.y, 'composer trong màn hình').toBeGreaterThanOrEqual(0);
        expect.soft(msgs!.height / size.h, `vùng tin >= 45% chiều cao (cao ${msgs!.height}/${size.h})`).toBeGreaterThanOrEqual(0.45);
        const send = await page.locator('.is-mobile .send-btn').boundingBox();
        expect.soft(send!.x + send!.width, 'nút gửi trong vùng an toàn phải').toBeLessThanOrEqual(size.w - size.safeR + 1);
        expect.soft(Math.min(send!.width, send!.height), 'nút gửi >=44').toBeGreaterThanOrEqual(44);
        const fs16 = await page.locator(EDITOR).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        expect.soft(fs16, 'font ô soạn >=16').toBeGreaterThanOrEqual(16);
        await shot('thread-nhap');

        // Tài khoản
        await page.goto('/account');
        await page.locator('.crm-mobile.m-shell').waitFor({ state: 'attached' });
        await page.waitForTimeout(800);
        await setSafe(page, size.safeL, size.safeR, size.safeB);
        await layoutChecks(page, 'account', '.m-main, .m-tabbar', size);
        const tb2 = await page.locator('.m-tabbar').boundingBox();
        expect.soft(tb2!.y + tb2!.height, 'tabbar Tài khoản trong màn hình').toBeLessThanOrEqual(size.h + 1);
        await shot('taikhoan');
        await ctx.close();
      });
    }
  }
});

// ───────────────────────────── c. Xoay giữa chừng ─────────────────────────────
test.describe('c. Xoay khi đang dùng (không remount, giữ nháp/URL/cuộn)', () => {
  test('thread: 390x844 -> 844x390 -> 390x844', async ({ browser, browserName }, info) => {
    const ctx = await newCtx(browser, { w: 390, h: 844, touch: true });
    const page = await ctx.newPage();
    await boot(page);
    await page.goto('/chat/qa-conv-1');
    await waitThread(page);
    const t0 = await traits(page);
    test.skip(!(t0.coarse && t0.hoverNone), `${browserName}: không có pointer:coarse+hover:none`);
    await page.evaluate(() => {
      const w = window as unknown as { __qa: { desktopInserted: number; marks: Record<string, boolean> } };
      w.__qa = { desktopInserted: 0, marks: {} };
      (document.querySelector('.mobile-chat') as unknown as Record<string, boolean>).__qaMark = true;
      (document.querySelector('.is-mobile .messages') as unknown as Record<string, boolean>).__qaMark = true;
      (document.querySelector('.is-mobile .input-editor [contenteditable="true"]') as unknown as Record<string, boolean>).__qaMark = true;
      new MutationObserver(ms => { for (const m of ms) for (const n of Array.from(m.addedNodes)) if (n instanceof HTMLElement && (n.matches('.smax-app, .smax-topnav') || n.querySelector('.smax-topnav'))) w.__qa.desktopInserted++; }).observe(document.body, { childList: true, subtree: true });
    });
    await page.locator(EDITOR).click();
    await page.keyboard.type('Nháp giữ qua xoay (giả)');
    const msgs = page.locator('.is-mobile .messages');
    await msgs.evaluate(el => { el.scrollTop = 300; });
    await page.waitForTimeout(400);
    const before = await msgs.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
    expect(before.top).toBeGreaterThan(100);
    expect(before.max - before.top).toBeGreaterThan(100);

    const state = async () => page.evaluate(() => {
      const w = window as unknown as { __qa: { desktopInserted: number } };
      const m = (s: string) => (document.querySelector(s) as unknown as Record<string, boolean> | null)?.__qaMark === true;
      const el = document.querySelector('.is-mobile .messages') as HTMLElement;
      return {
        url: location.pathname, chatKept: m('.mobile-chat'), msgsKept: m('.is-mobile .messages'), editorKept: m('.is-mobile .input-editor [contenteditable="true"]'),
        draft: (document.querySelector('.is-mobile .input-editor [contenteditable="true"]') as HTMLElement | null)?.innerText.trim() ?? null,
        top: el.scrollTop, max: el.scrollHeight - el.clientHeight, desktopInserted: w.__qa.desktopInserted,
        mobileShell: !!document.querySelector('.crm-mobile.m-shell'), desktopShell: !!document.querySelector('.smax-topnav'), w: innerWidth, h: innerHeight,
      };
    });
    for (const [vw, vh] of [[844, 390], [390, 844]] as const) {
      await page.setViewportSize({ width: vw, height: vh });
      await page.waitForTimeout(900);
      const s = await state();
      info.annotations.push({ type: `sau-${vw}x${vh}`, description: JSON.stringify({ before, ...s }) });
      expect.soft(s, `${vw}x${vh}: ${JSON.stringify(s)}`).toMatchObject({ url: '/chat/qa-conv-1', chatKept: true, msgsKept: true, editorKept: true, draft: 'Nháp giữ qua xoay (giả)', desktopInserted: 0, mobileShell: true, desktopShell: false });
      expect.soft(s.top, `scrollTop không về 0 (${s.top})`).toBeGreaterThan(30);
      expect.soft(s.max - s.top, `scrollTop không nhảy về đáy (còn ${s.max - s.top}px)`).toBeGreaterThan(30);
    }
    await ctx.close();
  });

  test('inbox: bộ lọc + scrollTop giữ sau xoay', async ({ browser, browserName }, info) => {
    const ctx = await newCtx(browser, { w: 390, h: 844, touch: true });
    const page = await ctx.newPage();
    await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    const t0 = await traits(page);
    test.skip(!(t0.coarse && t0.hoverNone), `${browserName}: không có pointer:coarse+hover:none`);
    await page.getByRole('button', { name: 'Mở bộ lọc' }).click();
    await page.locator('.m-sheet:visible label', { hasText: 'Chưa trả lời' }).click();
    await page.locator('.m-sheet:visible [data-action="apply"]').click();
    await expect(page.locator('.m-inbox__chip', { hasText: 'Chưa trả lời' })).toBeVisible();
    await expect(page.locator('.m-conv-row__flag--wait')).toHaveCount(15, { timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const w = window as unknown as { __qaDesk: number };
      w.__qaDesk = 0;
      (document.querySelector('.m-inbox') as unknown as Record<string, boolean>).__qaMark = true;
      new MutationObserver(ms => { for (const m of ms) for (const n of Array.from(m.addedNodes)) if (n instanceof HTMLElement && (n.matches('.smax-topnav') || n.querySelector('.smax-topnav'))) w.__qaDesk++; }).observe(document.body, { childList: true, subtree: true });
    });
    const list = page.locator('.m-inbox__list');
    await list.evaluate(el => { el.scrollTop = 520; });
    await page.waitForTimeout(300);
    const before = await list.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
    expect(before.top).toBeGreaterThan(300);
    for (const [vw, vh] of [[844, 390], [390, 844]] as const) {
      await page.setViewportSize({ width: vw, height: vh });
      await page.waitForTimeout(900);
      const s = await page.evaluate(() => {
        const l = document.querySelector('.m-inbox__list') as HTMLElement;
        return {
          url: location.pathname, kept: (document.querySelector('.m-inbox') as unknown as Record<string, boolean> | null)?.__qaMark === true,
          chip: !!Array.from(document.querySelectorAll('.m-inbox__chip')).find(c => /Chưa trả lời/.test(c.textContent || '')),
          rows: document.querySelectorAll('.m-conv-row').length, top: l.scrollTop, max: l.scrollHeight - l.clientHeight,
          desk: (window as unknown as { __qaDesk: number }).__qaDesk, desktopShell: !!document.querySelector('.smax-topnav'),
        };
      });
      info.annotations.push({ type: `inbox-${vw}x${vh}`, description: JSON.stringify({ before, ...s }) });
      expect.soft(s, `${vw}x${vh}: ${JSON.stringify(s)}`).toMatchObject({ url: '/chat', kept: true, chip: true, rows: 15, desk: 0, desktopShell: false });
      expect.soft(s.top, `inbox scrollTop vẫn > 0 (${s.top}, trước ${before.top})`).toBeGreaterThan(100);
      // hàng đổi cao khi đổi bề ngang nên cho phép lệch; chỉ cấm về 0 hoặc nhảy hẳn xuống cuối
      expect.soft(s.max - s.top, 'không nhảy xuống cuối danh sách').toBeGreaterThan(20);
    }
    await ctx.close();
  });
});

// ───────────────────────────── 4. Ảnh trước/sau (cần BASE_DIST) ─────────────────────────────
test.describe('Ảnh 844x390 / 932x430 trước (base) và sau (hotfix)', () => {
  for (const size of LAND) {
    for (const theme of ['light', 'dark'] as const) {
      test(`trước/sau thread ${size.name} ${theme}`, async ({ browser, browserName }) => {
        test.skip(!process.env.BASE_DIST, 'Cần BASE_DIST');
        fs.mkdirSync(SHOTS, { recursive: true });
        for (const [label, origin] of [['truoc', BASE], ['sau', SHELL]] as const) {
          const ctx = await newCtx(browser, { w: size.w, h: size.h, touch: true });
          const page = await ctx.newPage();
          await boot(page, theme);
          await page.goto(`${origin}/chat/qa-conv-1`);
          await page.waitForTimeout(label === 'truoc' ? 3500 : 1500);
          if (label === 'sau') { await waitThread(page); await setSafe(page, size.safeL, size.safeR, size.safeB); await page.locator(EDITOR).click(); await page.keyboard.type('Nháp thử xoay ngang (dữ liệu giả)'); }
          await page.screenshot({ path: path.join(SHOTS, `thread-${size.name}-${theme}-${browserName}-${label}.png`), animations: 'disabled', caret: 'hide' });
          await ctx.close();
        }
      });
    }
  }
});
