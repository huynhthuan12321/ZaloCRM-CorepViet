import { describe, expect, it } from 'vitest';
import { REPORT_AVATAR_COLORS } from './report-avatar';

// WCAG relative luminance; do not assert specific palette hex values.
function whiteContrast(background: string): number {
  const rgb = background.match(/[\da-f]{2}/gi)!.map(hex => Number.parseInt(hex, 16) / 255);
  const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 1.05 / (linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722 + 0.05);
}
describe('normal-size report avatar initials', () => {
  it('uses the reference21:1 black/white contrast', () => expect(whiteContrast('#000000')).toBeCloseTo(21));
  it.each(REPORT_AVATAR_COLORS)('white initials meet4.5:1 on palette color %s', color => {
    expect(whiteContrast(color)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['#1786be', '#b0734f'])('old failing palette %s is a negative control', color => {
    expect(whiteContrast(color)).toBeLessThan(4.5);
  });
});
