// Tổng hợp kết quả JSON của f1-settings-matrix / f1-settings-desktop thành bảng Markdown (docs/.../results/SUMMARY.md).
// Chạy: node e2e/helpers/f1-summarize.cjs
const fs = require('fs');
const path = require('path');
const RES = path.resolve(__dirname, '../../../docs/mobile-upgrade/qa/F1-settings/results');
const files = fs.readdirSync(RES).filter(f => f.endsWith('.json'));
const matrix = []; const desktop = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
  if (f.startsWith('matrix-')) matrix.push(j); else if (f.startsWith('desktop-')) desktop.push(j);
}
let md = '# Kết quả tổng hợp tự động (f1-summarize)\n\n';
md += `## Ma trận bố cục — ${matrix.length} ô (viewport x theme x engine)\n\n`;
md += '| Engine | Viewport | Theme | Số vấn đề | pageerror |\n|---|---|---|---|---|\n';
matrix.sort((a, b) => (a.browserName + a.vp + a.theme).localeCompare(b.browserName + b.vp + b.theme));
for (const m of matrix) md += `| ${m.browserName} | ${m.vp} | ${m.theme} | ${m.issues.length} | ${m.pageErrors.length} |\n`;
const byKey = {};
for (const m of matrix) for (const i of m.issues) {
  const k = `${i.route} / ${i.kind}`;
  (byKey[k] ||= { cells: new Set(), sample: i.detail }).cells.add(`${m.browserName}:${m.vp}:${m.theme}`);
}
md += '\n## Vấn đề gộp theo (route / loại)\n\n| Route / loại | Số ô bị | Ví dụ |\n|---|---|---|\n';
for (const [k, v] of Object.entries(byKey).sort((a, b) => b[1].cells.size - a[1].cells.size)) md += `| ${k} | ${v.cells.size} | \`${v.sample.replace(/\|/g, '/').slice(0, 220)}\` |\n`;
md += `\n## Desktop / iPad so với base — ${desktop.length} ảnh\n\n| Engine | Viewport | Route | exactDiffPixels | maxChannelDelta | sizeMatch | control |\n|---|---|---|---|---|---|---|\n`;
desktop.sort((a, b) => (a.vp + a.key + a.browserName).localeCompare(b.vp + b.key + b.browserName));
for (const d of desktop) md += `| ${d.browserName} | ${d.vp} | ${d.key} | ${d.exactDiffPixels} | ${d.maxChannelDelta} | ${d.sizeMatch} | ${d.control ? 'có' : ''} |\n`;
fs.writeFileSync(path.join(RES, 'SUMMARY.md'), md);
console.log(md.slice(0, 6000));
