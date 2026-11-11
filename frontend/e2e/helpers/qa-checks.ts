// Hàm đo bố cục/độ tương phản chạy TRONG trang (Chromium/WebKit desktop mô phỏng). Không thay cho kiểm trên iPhone thật.
import type { Page } from '@playwright/test';

export interface ContrastIssue { sel: string; text: string; ratio: number; fg: string; bg: string }

/**
 * Tương phản chữ/nền hiệu dụng. Đi ngược cây để ghép nền (alpha) tới khi gặp nền đặc. Bỏ qua phần tử ẩn, trong subtree inert/aria-hidden.
 * Cũng kiểm input/textarea/select: màu chữ và nền của chính ô nhập (bắt "ô trắng chữ trắng" / "chữ tối nền tối").
 * `minRatio` mặc định 3 (ngưỡng "đọc được" cho chữ lớn/đậm; thấp hơn 3 = lỗi rõ ràng, không phải chuyện WCAG 4.5 tinh tế).
 */
export async function contrastIssues(page: Page, scope: string, minRatio = 3): Promise<ContrastIssue[]> {
  return page.evaluate(({ scope, minRatio }) => {
    const parse = (s: string): [number, number, number, number] | null => {
      const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const bgOf = (el: Element): number[] => {
      const layers: Array<[number, number, number, number]> = [];
      let e: Element | null = el;
      while (e) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
        e = e.parentElement;
      }
      let base: number[] = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]; }
      return base;
    };
    const out: Array<{ sel: string; text: string; ratio: number; fg: string; bg: string }> = [];
    const seen = new Set<Element>();
    const check = (el: Element, text: string) => {
      if (seen.has(el)) return; seen.add(el);
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return;
      if (el.closest('[inert],[aria-hidden="true"],[data-qa-ignore]')) return;
      if (r.bottom < 0 || r.top > innerHeight + 2000) return;
      const fg = parse(cs.color); if (!fg || fg[3] === 0) return; // chữ trong suốt = ẩn có chủ đích (vd số 0 của dải ngày)
      const bg = bgOf(el);
      const fgc = [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3])];
      const l1 = lum(fgc), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < minRatio) {
        const e = el as HTMLElement;
        out.push({ sel: `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')}`, text: text.slice(0, 24), ratio: Math.round(ratio * 100) / 100, fg: cs.color, bg: `rgb(${bg.map(Math.round).join(',')})` });
      }
    };
    for (const root of Array.from(document.querySelectorAll(scope))) {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent || '').join('').trim();
        if (own) check(el, own);
        if (el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select')) check(el, `[ô nhập] ${(el as HTMLInputElement).value || (el as HTMLInputElement).placeholder || ''}`);
      }
    }
    return out;
  }, { scope, minRatio });
}

/** Phần tử nội dung (có chữ/nút/ô nhập/ảnh) có mép nằm ngoài [safeL, w - safeR] trong phạm vi scope, trừ vùng cuộn ngang chủ ý. */
export async function safeOffenders(page: Page, scope: string, safeL: number, safeR: number): Promise<string[]> {
  return page.evaluate(({ scope, safeL, safeR }) => {
    const w = innerWidth; const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(scope))) {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const e = el as HTMLElement;
        if (e.closest('[inert],[aria-hidden="true"],[data-qa-ignore]')) continue;
        const own = Array.from(e.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim());
        const interactive = e.matches('button,input,textarea,select,a[href],img,svg,i.mdi');
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

export interface ScrollInfo { scrollable: boolean; lastBottom: number; tabbarTop: number | null; fabTop: number | null; docOverflowY: boolean; docOverflowX: boolean }

/** Cuộn vùng chính xuống đáy rồi đo: phần tử cuối cùng có nằm TRÊN tabbar và nút Hội thoại nổi không. Cũng đo cuộn dọc/ngang của document (100vh). */
export async function bottomClearance(page: Page, scrollSel = '.m-main__scroll'): Promise<ScrollInfo> {
  return page.evaluate((sel) => {
    const sc = document.querySelector(sel) as HTMLElement | null;
    if (sc) sc.scrollTop = sc.scrollHeight;
    let lastBottom = 0;
    if (sc) {
      for (const el of Array.from(sc.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed' || cs.position === 'sticky') continue;
        if (el.closest('[inert],[aria-hidden="true"]')) continue;
        const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim());
        if (!own && !el.matches('button,input,img,a[href]')) continue;
        lastBottom = Math.max(lastBottom, r.bottom);
      }
    }
    const tb = document.querySelector('.m-tabbar')?.getBoundingClientRect();
    const fab = document.querySelector('.m-tab__fab')?.getBoundingClientRect();
    const de = document.documentElement;
    return {
      scrollable: !!sc && sc.scrollHeight > sc.clientHeight + 1, lastBottom,
      tabbarTop: tb && tb.height > 0 ? tb.top : null, fabTop: fab && fab.height > 0 ? fab.top : null,
      docOverflowY: de.scrollHeight > innerHeight + 1, docOverflowX: de.scrollWidth > de.clientWidth,
    };
  }, scrollSel);
}
