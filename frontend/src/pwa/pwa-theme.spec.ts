import { describe, expect, it } from 'vitest';
import prompt from './PwaUpdatePrompt.vue?raw';
import runtime from './PwaRuntime.vue?raw';
// Vitest intentionally stubs CSS imports; read the real palette only in this Node test.
const fsModule = 'node:fs';
const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync(path: URL, encoding: string): string };
const tokens = readFileSync(new URL('../assets/mobile-tokens.css', import.meta.url), 'utf-8');

function color(theme: 'light' | 'dark', name: string): string {
  const split = tokens.indexOf('.crm-mobile[data-theme="dark"]');
  const css = theme === 'dark' ? tokens.slice(split) : tokens.slice(0, split);
  const value = new RegExp(`--m-${name}: *(#[a-fA-F0-9]+)`).exec(css)?.[1];
  if (!value) throw new Error(`Missing ${name} in ${theme}`);
  return value;
}
function luminance(hex: string): number {
  const rgb = hex.slice(1); const full = rgb.length === 3 ? [...rgb].map(x => x + x).join('') : rgb;
  const channels = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(a: string, b: string): number {
  const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
describe('PWA light/dark UI tokens', () => {
  it('places update/offline/session surfaces in the existing mobile theme namespace', () => {
    expect(prompt).toContain('class="crm-mobile pwa-update"');
    expect(runtime).toContain('class="crm-mobile pwa-notice"');
    expect(runtime).toContain('class="crm-mobile pwa-verification"');
    for (const source of [prompt, runtime]) {
      expect(source).toContain('var(--m-surface, #fff)');
      expect(source).toContain('var(--m-text, #152838)');
      expect(source).toContain('var(--m-brand-strong, #0b5880)');
      expect(source).toContain('var(--m-on-action, #fff)');
      expect(source).toContain('min-height: 44px');
      expect(source).not.toContain('background: #1786be');
    }
  });
  it.each(['light', 'dark'] as const)('normal text and enabled actions meet 4.5:1 in %s', theme => {
    expect(contrast(color(theme, 'brand-strong'), color(theme, 'on-action'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color(theme, 'surface'), color(theme, 'text'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color(theme, 'bg'), color(theme, 'text'))).toBeGreaterThanOrEqual(4.5);
  });
});
