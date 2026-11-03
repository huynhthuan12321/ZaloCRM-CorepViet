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
    expect(MOBILE_MEDIA_QUERY).toBe('not all and (min-width: 768px)')
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
