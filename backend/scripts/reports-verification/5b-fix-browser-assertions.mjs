// Replay assertions against fresh CUA DOM observations. This does not drive a
// browser or replace collecting new observations after a source change.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('../artifacts/reports-mobile-5b-fix-2026-11-02');
const oldRoot = resolve('../artifacts/reports-mobile-5b-2026-11-02/browser');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const layouts = await json(resolve(root, 'browser/geometry.json'));
const contrast = await json(resolve(root, 'browser/contrast.json'));
const interactions = await json(resolve(root, 'browser/interactions.json'));
const oldLayouts = await json(resolve(oldRoot, 'desktop-layouts.json'));
const oldContrast = await json(resolve(oldRoot, 'contrast.json'));
const results = [];
function test(name, run) {
  try { run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
}
function descendants(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(descendants)];
}
const oldGeometry = descendants(oldLayouts).filter(x => 'pageOverflow' in x);
for (const width of [768, 1024]) test(`Negative control: old header fails at ${width}`, () => {
  assert(oldGeometry.some(x => x.width === width && x.pageOverflow > 0 && x.topNavOutside.length > 0));
});
test('Negative control: old desktop contrast fails', () => {
  assert(descendants(oldContrast).some(x => x.pass === false && x.ratio < x.threshold));
});
test('Layout coverage includes all 9 categories at 320/390/430 and four AI desktop widths', () => {
  for (const width of [320, 390, 430]) {
    assert.equal(new Set(layouts.filter(x => x.width === width).map(x => x.category)).size, 9);
  }
  for (const width of [768, 1024, 1100, 1440]) {
    assert(layouts.some(x => x.width === width && x.category === '/reports/ai'));
  }
  assert.equal(layouts.length, 34);
});
test('Contrast coverage retains desktop empty/active/period and four mobile report groups', () => {
  assert.equal(contrast.length, 11);
  for (const width of [768, 1024, 1100, 1440]) {
    const ai = contrast.find(x => x.viewport === width && x.category === 'AI');
    assert(ai);
    assert(ai.samples.some(x => String(x.class).includes('rk-empty')));
    assert(ai.samples.some(x => String(x.class).includes('router-link-active')));
  }
  assert.equal(contrast.filter(x => x.viewport === 390).length, 4);
});
test('Interaction coverage includes admin and restricted leader', () => {
  assert.equal(interactions.length, 11);
  assert(interactions.some(x => x.name.startsWith('Leader compact')));
  assert(interactions.some(x => x.name.startsWith('Escape')));
});
for (const layout of layouts) test(`Layout ${layout.width} ${layout.category}`, () => {
  assert.equal(layout.pageOverflow, 0);
  assert.equal(layout.contentOverflow, 0);
  assert.equal(layout.topNavOutside.length, 0);
  assert.equal(layout.error, null);
  if (layout.width < 768) assert.equal(layout.smallTargets.length, 0);
});
for (const group of contrast) test(`Contrast ${group.viewport} ${group.category}`, () => {
  assert(group.samples.length > 0);
  for (const sample of group.samples) {
    assert(sample.pass, `${sample.text}: ${sample.ratio} < ${sample.threshold}`);
    assert(sample.ratio + 0.005 >= sample.threshold);
  }
});
for (const scenario of interactions) test(scenario.name, () => assert.equal(scenario.pass, true));
const summary = { at: new Date().toISOString(), source: 'Fresh real-browser DOM observations; stored evidence replay only',
  total: results.length, passed: results.filter(x => x.status === 'PASS').length,
  failed: results.filter(x => x.status === 'FAIL').length,
  contrastSamples: contrast.reduce((n, x) => n + x.samples.length, 0), results };
await writeFile(resolve(root, 'browser-regression-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
process.exitCode = summary.failed ? 1 : 0;
