// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The composable keeps module-level state, so every case imports a fresh module.
let listeners: Set<(event: MediaQueryListEvent) => void>
let mobileMatches = false
let queries: string[]

function stubViewport(innerWidth: number, matches: boolean) {
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true })
  mobileMatches = matches
}

beforeEach(() => {
  vi.resetModules()
  listeners = new Set()
  queries = []
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    queries.push(query)
    return {
      get matches() { return mobileMatches },
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    }
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useMobile layout breakpoint', () => {
  it('CSS width 767.669px (innerWidth rounds to 768) selects the mobile layout', async () => {
    stubViewport(768, true)
    const { useMobile, MOBILE_MEDIA_QUERY } = await import('./use-mobile')
    expect(useMobile().isMobile.value).toBe(true)
    expect(queries).toEqual([MOBILE_MEDIA_QUERY])
    expect(MOBILE_MEDIA_QUERY).toBe('not all and (min-width: 768px), (max-width: 1023.98px) and (max-height: 500px) and (pointer: coarse) and (hover: none)')
  })

  it('follows the media query, not innerWidth, in both directions', async () => {
    stubViewport(767, false)
    const { useMobile } = await import('./use-mobile')
    const { isMobile } = useMobile()
    expect(isMobile.value).toBe(false)
    stubViewport(768, true)
    for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent)
    expect(isMobile.value).toBe(true)
    stubViewport(768, false)
    for (const listener of listeners) listener({ matches: false } as MediaQueryListEvent)
    expect(isMobile.value).toBe(false)
  })

  it('integer widths keep the existing 768px split', async () => {
    stubViewport(767, true)
    expect((await import('./use-mobile')).useMobile().isMobile.value).toBe(true)
    vi.resetModules()
    stubViewport(768, false)
    expect((await import('./use-mobile')).useMobile().isMobile.value).toBe(false)
  })

  it('falls back to innerWidth when matchMedia is unavailable', async () => {
    vi.stubGlobal('matchMedia', undefined)
    stubViewport(500, false)
    expect((await import('./use-mobile')).useMobile().isMobile.value).toBe(true)
  })
})

// ── Hotfix 09/11/2026: điện thoại xoay ngang ──────────────────────────────────────────────────────
describe('isMobileViewport — bảng thiết bị', () => {
  const cases: Array<[string, number, number, 'coarse' | 'fine' | 'none', boolean, boolean]> = [
    ['iPhone dọc 390x844', 390, 844, 'coarse', false, true],
    ['iPhone ngang 844x390', 844, 390, 'coarse', false, true],
    ['iPhone Pro Max ngang 932x430', 932, 430, 'coarse', false, true],
    ['iPhone SE ngang 667x375', 667, 375, 'coarse', false, true],
    ['iPad ngang 1024x768', 1024, 768, 'coarse', false, false],
    ['iPad Pro ngang 1366x1024', 1366, 1024, 'coarse', false, false],
    ['iPad mini ngang 1133x744', 1133, 744, 'coarse', false, false],
    ['iPad dọc 768x1024', 768, 1024, 'coarse', false, false],
    ['Desktop 1440x900 chuột', 1440, 900, 'fine', true, false],
    ['Cửa sổ thấp 900x400 chuột', 900, 400, 'fine', true, false],
    ['Laptop cảm ứng 1280x450 có hover', 1280, 450, 'coarse', true, false],
    ['Cửa sổ hẹp 600x900 chuột', 600, 900, 'fine', true, true],
    ['iPhone 16 Pro Max ngang 956x440', 956, 440, 'coarse', false, true],
    ['Android phone ngang 915x412', 915, 412, 'coarse', false, true],
    ['Tablet Android ngang mở bàn phím 1280x450', 1280, 450, 'coarse', false, false],
    ['Tablet Android ngang mở bàn phím 1024x400', 1024, 400, 'coarse', false, false],
  ]
  it.each(cases)('%s', async (_name, width, height, pointer, hover, expected) => {
    const { isMobileViewport } = await import('./use-mobile')
    expect(isMobileViewport({ width, height, pointer, hover })).toBe(expected)
  })
})

describe('CSS dùng NGUYÊN VĂN điều kiện của use-mobile.ts (một nguồn duy nhất)', () => {
  const read = (rel: string): string =>
    (globalThis as any).process.getBuiltinModule('node:fs').readFileSync(new URL(rel, import.meta.url), 'utf8')
  const files = [
    '../assets/hs-crm-theme.css', '../assets/airtable.css', '../assets/report-kit.css',
    '../layouts/DefaultLayout.vue', '../views/DesktopAppointmentsView.vue', '../assets/mobile-tokens.css',
  ]
  const queries = (f: string) =>
    [...read(f).matchAll(/@media\s+([^{]*?)\s*\{/g)].map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim())

  it('mọi @media có mốc 768/500px là hằng số của use-mobile.ts (có thể OR thêm điều kiện riêng của màn)', async () => {
    const { MOBILE_MEDIA_QUERY, DESKTOP_COMPACT_MEDIA_QUERY, SHORT_LANDSCAPE_MEDIA_QUERY } = await import('./use-mobile')
    const exact = new Set([MOBILE_MEDIA_QUERY, DESKTOP_COMPACT_MEDIA_QUERY, SHORT_LANDSCAPE_MEDIA_QUERY])
    const counts: Record<string, number> = {}
    for (const f of files) {
      for (const q of queries(f)) {
        if (!/768px|max-height: 500px/.test(q)) continue
        counts[f] = (counts[f] ?? 0) + 1
        const ok = exact.has(q) || q.endsWith(`, ${MOBILE_MEDIA_QUERY}`)
        expect(ok, `${f}: @media ${q}`).toBe(true)
      }
    }
    expect(counts).toEqual({
      '../assets/hs-crm-theme.css': 1, '../assets/airtable.css': 2, '../assets/report-kit.css': 1,
      '../layouts/DefaultLayout.vue': 1, '../views/DesktopAppointmentsView.vue': 1, '../assets/mobile-tokens.css': 1,
    })
  })

  it('#app min-width 1100px theo cascade: mặc định desktop, MOBILE_MEDIA_QUERY gỡ ra (không khe hở)', async () => {
    const { MOBILE_MEDIA_QUERY } = await import('./use-mobile')
    const css = read('../assets/hs-crm-theme.css')
    expect(css).toMatch(/^ {2}#app \{ min-width: 1100px; \}\r?$/m)
    expect(css).toContain(`@media ${MOBILE_MEDIA_QUERY} { #app { min-width: 0; } }`)
    expect(css.indexOf('#app { min-width: 1100px; }')).toBeLessThan(css.indexOf('#app { min-width: 0; }'))
  })

  it('DESKTOP_MEDIA_QUERY là phần bù của MOBILE_MEDIA_QUERY (cấu trúc)', async () => {
    const { DESKTOP_MEDIA_QUERY } = await import('./use-mobile')
    expect(DESKTOP_MEDIA_QUERY.split(', ')).toEqual([
      '(min-width: 768px) and (min-width: 1024px)',
      '(min-width: 768px) and (min-height: 500.02px)',
      '(min-width: 768px) and (pointer: fine)',
      '(min-width: 768px) and (pointer: none)',
      '(min-width: 768px) and (hover: hover)',
    ])
  })
})

describe('Thanh tab: nút tròn không đè nhãn "Hội thoại" (dọc và ngang thấp)', () => {
  // Đường dẫn theo cwd của vitest (thư mục frontend/) — tránh URL không phải file: trong môi trường jsdom.
  const readTokens = (): string => {
    const proc = (globalThis as any).process
    return proc.getBuiltinModule('node:fs').readFileSync(`${proc.cwd()}/src/assets/mobile-tokens.css`, 'utf8')
  }
  const px = (src: string, name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(src)?.[1])
  // Nội dung tab: icon/chỗ giữ 26px + gap 2px + nhãn ~12-14px ≈ 40px, căn giữa trong thanh.
  const labelTop = (tabbar: number) => (tabbar - 40) / 2 + 26
  it('dọc: fab - lift <= đỉnh nhãn', () => {
    const tokens = readTokens()
    expect(px(tokens, '--m-fab-size') - px(tokens, '--m-fab-lift')).toBeLessThanOrEqual(labelTop(px(tokens, '--m-tabbar')))
  })
  it('ngang thấp (SHORT_LANDSCAPE): fab - lift <= đỉnh nhãn, nút vẫn >= 44px', () => {
    const tokens = readTokens()
    const block = tokens.slice(tokens.lastIndexOf('@media (max-height: 500px) and (orientation: landscape)'))
    const fab = px(block, '--m-fab-size')
    expect(fab).toBeGreaterThanOrEqual(44)
    expect(fab - px(block, '--m-fab-lift')).toBeLessThanOrEqual(labelTop(px(block, '--m-tabbar')))
  })
})
