// Hàm đo bố cục chạy TRONG trang (Chromium/WebKit desktop). Không thay cho kiểm trên iPhone thật.
import type { Page } from '@playwright/test';

export interface TargetIssue { sel: string; w: number; h: number }
export interface OffenderIssue { sel: string; left: number; right: number }
export interface AuditResult {
  vw: number;
  vh: number;
  scroll: Record<string, { sw: number; cw: number }>;
  offenders: OffenderIssue[];
  smallTargets: TargetIssue[];
  smallInputs: Array<{ sel: string; fontSize: number }>;
}

/** Đo trong phạm vi `scope` (selector). Chỉ xét phần tử đang hiển thị. */
export async function audit(page: Page, scope: string, targetScopes: string[] = [scope]): Promise<AuditResult> {
  return page.evaluate(({ scope, targetScopes }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const describe = (el: Element) => {
      const e = el as HTMLElement;
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const label = e.getAttribute('aria-label') || e.getAttribute('title') || (e.textContent || '').trim().slice(0, 24);
      return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}${label ? `[${label}]` : ''}`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      // phần tử nằm trong subtree inert/aria-hidden (inbox khi mở thread) không phải đối tượng tương tác
      if (el.closest('[inert],[aria-hidden="true"]')) return false;
      return true;
    };
    const scroll: AuditResult['scroll'] = {};
    for (const [k, el] of Object.entries({
      html: document.documentElement, body: document.body,
      shell: document.querySelector('.m-shell'), main: document.querySelector('.m-main__scroll'),
      chat: document.querySelector('.mobile-chat'), inbox: document.querySelector('.m-inbox'),
      thread: document.querySelector('.message-thread.is-mobile'), messages: document.querySelector('.is-mobile .messages'),
      composer: document.querySelector('.is-mobile .input-area'), sheet: document.querySelector('.m-sheet'),
    })) {
      if (el) scroll[k] = { sw: (el as HTMLElement).scrollWidth, cw: (el as HTMLElement).clientWidth };
    }

    const offenders: OffenderIssue[] = [];
    const roots = Array.from(document.querySelectorAll(scope));
    for (const root of roots) {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (!visible(el)) continue;
        if (el.closest('.m-attach__input,[data-qa-ignore]')) continue;
        const r = el.getBoundingClientRect();
        // A CSS-only, non-interactive decoration may extend beyond its clipping box
        // without extending the rendered page. Do not hide clipped text/controls this way.
        if (getComputedStyle(el).pointerEvents === 'none' && !el.textContent?.trim()
          && !el.matches('img,svg,canvas,video,input,button,a') && !el.querySelector('img,svg,canvas,video,input,button,a')) {
          let left = r.left; let right = r.right;
          for (let clip = el.parentElement; clip; clip = clip.parentElement) {
            if (['hidden', 'clip'].includes(getComputedStyle(clip).overflowX)) {
              const box = clip.getBoundingClientRect(); left = Math.max(left, box.left); right = Math.min(right, box.right);
            }
          }
          if (left >= -3 && right <= vw + 1) continue;
        }
        if (r.right <= vw + 1 && r.left >= -3) continue; // -3: nút quay lại chủ ý lấn 2px để tâm chạm sát mép, vẫn ≥44px
        // nằm trong vùng cuộn ngang chủ ý (toolbar) thì bỏ qua
        let p: Element | null = el.parentElement;
        let inScroller = false;
        while (p && p !== root.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll') { inScroller = true; break; }
          p = p.parentElement;
        }
        if (inScroller) continue;
        offenders.push({ sel: describe(el), left: Math.round(r.left), right: Math.round(r.right) });
      }
    }

    const smallTargets: TargetIssue[] = [];
    const seen = new Set<Element>();
    for (const ts of targetScopes) {
      for (const root of Array.from(document.querySelectorAll(ts))) {
        for (const el of Array.from(root.querySelectorAll('button, a[href], [role="button"], [role="tab"], select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), label.m-filter__check'))) {
          if (seen.has(el) || !visible(el)) continue;
          seen.add(el);
          // input nằm trong <label> (ô tìm kiếm): vùng chạm là cả label
          // VTextField delegates mousedown from the whole .v-field to its input
          // (VTextField.js:onControlMousedown). G3 explicitly verifies an outside-input click focuses it.
          const delegated = el.tagName === 'INPUT' && el.closest('.v-text-field') ? el.closest('.v-field') : null;
          const r = (el.tagName === 'INPUT' && el.closest('label') ? el.closest('label')! : delegated ?? el).getBoundingClientRect();
          if (r.width < 43.5 || r.height < 43.5) smallTargets.push({ sel: describe(el), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
        }
      }
    }

    const smallInputs: AuditResult['smallInputs'] = [];
    for (const el of Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select, [contenteditable="true"]'))) {
      if (!visible(el) || !el.closest(scope) && !targetScopes.some(s => el.closest(s))) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) smallInputs.push({ sel: describe(el), fontSize: fs });
    }
    return { vw, vh, scroll, offenders, smallTargets, smallInputs };
  }, { scope, targetScopes });
}

/** Màu nền hiệu dụng (đi ngược lên cha tới khi gặp màu không trong suốt). Trả về [r,g,b]. */
export async function effectiveBackground(page: Page, selector: string): Promise<number[] | null> {
  return page.evaluate((sel) => {
    // chọn phần tử ĐANG HIỂN THỊ đầu tiên (sheet cũ đã đóng có thể còn trong DOM với display:none)
    let el = (Array.from(document.querySelectorAll(sel)) as HTMLElement[]).find(e => e.getClientRects().length > 0) ?? null;
    while (el) {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const [r, g, b, a] = m[1].split(',').map(s => parseFloat(s));
        if (a === undefined || a > 0.95) return [r, g, b];
      }
      el = el.parentElement;
    }
    return null;
  }, selector);
}

export const luminance = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Tìm khối nền sáng (>0.85) lớn (>= minArea px²) trong scope — dùng cho giao diện Tối. */
export async function findLightBlocks(page: Page, scope: string, minArea = 6000): Promise<Array<{ sel: string; area: number; bg: string }>> {
  return page.evaluate(({ scope, minArea }) => {
    const out: Array<{ sel: string; area: number; bg: string }> = [];
    for (const root of Array.from(document.querySelectorAll(scope))) {
      const all = [root, ...Array.from(root.querySelectorAll('*'))];
      for (const el of all) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area < minArea || r.bottom < 0 || r.top > innerHeight) continue;
        if (el.closest('[inert],[aria-hidden="true"]')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) continue;
        const [rr, gg, bb, a] = m[1].split(',').map(s => parseFloat(s));
        if (a !== undefined && a < 0.9) continue;
        const lum = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
        if (lum > 0.85) {
          const e = el as HTMLElement;
          out.push({ sel: `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).slice(0, 2).join('.')}`, area: Math.round(area), bg: cs.backgroundColor });
        }
      }
    }
    return out;
  }, { scope, minArea });
}
