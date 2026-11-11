// 6B lần 3 — group G: independent browser run. Own headless Chrome + temp profile, CDP only.
// Interaction = Input.dispatchMouseEvent / Input.dispatchKeyEvent at element centres. Page JS is used only to
// read state (rects, text, focus); no handler is invoked and innerWidth is never overridden.
// Usage: node 6b-browser.mjs <artifactDir> <cdpPort>
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const [OUT, PORT] = [process.argv[2], process.argv[3]];
const BASE = 'http://127.0.0.1:55572';
const PASSWORD = process.env.REPORTS_FIXTURE_PASSWORD;
const HTTP_DIR = resolve(OUT, '..');
const SHOTS = resolve(OUT, 'shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const T = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const D = addDays(T, -1);

// ---- minimal CDP client (flattened sessions) ----
const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const waiting = new Map(); const listeners = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } else for (const l of listeners) l(m); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

async function openPage(label) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const responses = [];
  listeners.push((m) => { if (m.sessionId === sessionId && m.method === 'Network.responseReceived' && m.params.response.url.includes('/api/v1/')) responses.push({ t: Date.now(), url: m.params.response.url.replace(BASE, ''), status: m.params.response.status }); });
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable'); await s('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1.33,mobile:false});
  await s('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: resolve(OUT, 'browser-downloads'), eventsEnabled: true, browserContextId }).catch(() => send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: resolve(OUT, 'browser-downloads'), browserContextId }));
  const ev = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(`eval failed: ${expr.slice(0, 80)} ${r.exceptionDetails.text}`); return r.result.value; };
  const goto = async (path) => { await s('Page.navigate', { url: BASE + path }); await sleep(2600); };
  const rectOf = async (js) => ev(`(()=>{const e=${js};if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height}})()`);
  const click = async (js) => { await sleep(350);
    const r = await rectOf(js); if (!r || !r.w) throw new Error(`not clickable: ${js}`);
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  };
  const KEYS = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], Tab: [9, 'Tab'], Backspace: [8, 'Backspace'], ArrowRight: [39, 'ArrowRight'], ArrowLeft: [37, 'ArrowLeft'] };
  const key = async (name, modifiers = 0) => {
    const [code, k, text] = KEYS[name];
    await s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, modifiers, ...(text ? { text } : {}) });
    await s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, modifiers });
  };
  const type = async (text) => { for (const ch of text) { await s('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch }); await s('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } };
  const shot = async (name) => { const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const file = resolve(SHOTS, `${name}.png`); await writeFile(file, Buffer.from(data, 'base64')); return `shots/${name}.png`; };
  const login = async (userId) => {
    await goto('/login');
    await click(`document.querySelector('input[type=text], input[type=email]')`); await type(`${userId}@example.invalid`);
    await click(`document.querySelector('input[type=password]')`); await type(PASSWORD);
    await key('Enter'); await sleep(2500);
    return ev('location.pathname');
  };
  return { label, s, ev, goto, click, key, type, shot, login, responses, targetId };
}
const scenario = async (plan) => writeFile(resolve(HTTP_DIR, 'scenario.json'), JSON.stringify(plan));
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.trim()===${JSON.stringify(text)})`;
const out = { time: new Date().toISOString(), T, D, browser: version.Browser, scenarios: {} };
const res = (name, data) => { out.scenarios[name] = data; console.log(name, JSON.stringify(data).slice(0, 400)); };

// ================= Admin =================
const admin = await openPage('admin');
res('admin login', { landed: await admin.login('6b-u-adm-x') });
out.viewport = await admin.ev(`({innerWidth, innerHeight, devicePixelRatio, outerWidth, ua: navigator.userAgent})`);
await admin.goto('/reports/tong-quan');
const cats = await admin.ev(`[...document.querySelectorAll('.rpt-subnav a')].map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')}))`);
const admin9 = [];
for (const c of cats) {
  const before = admin.responses.length;
  await admin.click(`[...document.querySelectorAll('.rpt-subnav a')].find(a=>a.getAttribute('href')===${JSON.stringify(c.href)})`);
  await sleep(2200);
  const api = admin.responses.slice(before).filter(r => r.url.startsWith('/api/v1/reports/') || r.url.startsWith('/api/v1/analytics'));
  admin9.push({ ...c, path: await admin.ev('location.pathname'), api: api.map(r => `${r.url.split('?')[0]}:${r.status}`), alert: await admin.ev(`document.querySelector('.rpt-scope [role=alert]')?.innerText||null`), context: await admin.ev(`document.querySelector('.rpt-context')?.innerText?.replace(/\\s+/g,' ')||null`), png: await admin.shot(`admin-${c.href.split('/').pop()}`) });
}
res('admin 9 categories', { count: cats.length, allApi200: admin9.every(x => x.api.length > 0 && x.api.every(a => a.endsWith(':200'))), noAlert: admin9.every(x => !x.alert), items: admin9 });

// Period label vs response (Overview). Select 7 ngày first (default is 30 ngày).
await admin.goto('/reports/tong-quan');
let n0 = admin.responses.length;
await admin.click(byText('.rpt-filters button', '7 ngày')); await sleep(2600);
const last7 = admin.responses.slice(n0).filter(r => r.url.startsWith('/api/v1/reports/overview')).at(-1);
const ctx7 = await admin.ev(`document.querySelector('.rpt-context')?.innerText?.replace(/\\s+/g,' ')`);
const q7 = new URLSearchParams(last7?.url.split('?')[1]);
res('period label matches response', { request: last7, context: ctx7, pass: !!ctx7?.includes(`${q7.get('from')} – ${q7.get('to')}`) && q7.get('from') === addDays(T, -6) && q7.get('to') === T, png: await admin.shot('overview-7d-context') });

// Late stale response: 7 ngày selected → 30 ngày (delayed 2500ms) → Hôm nay. Two runs.
const race = [];
for (const run of [1, 2]) {
  await admin.click(byText('.rpt-filters button', '7 ngày')); await sleep(1500);
  await scenario({ id: `race-${run}-${Date.now() % 100000}`, path: '/api/v1/reports/overview', delayMs: 2500, matchQuery: `from=${addDays(T, -29)}` });
  n0 = admin.responses.length;
  await admin.click(byText('.rpt-filters button', '30 ngày')); await sleep(250);
  await admin.click(byText('.rpt-filters button', 'Hôm nay')); await sleep(3800);
  const seqResp = admin.responses.slice(n0).filter(r => r.url.startsWith('/api/v1/reports/overview')).map(r => ({ t: r.t, from: new URLSearchParams(r.url.split('?')[1]).get('from'), status: r.status }));
  const ctx = await admin.ev(`document.querySelector('.rpt-context')?.innerText?.replace(/\\s+/g,' ')`);
  const active = await admin.ev(`[...document.querySelectorAll('.rpt-filters button')].filter(b=>b.classList.contains('active')||b.getAttribute('aria-pressed')==='true').map(b=>b.textContent.trim())`);
  race.push({ run, responses: seqResp, lateIs30d: seqResp.at(-1)?.from === addDays(T, -29), context: ctx, uiShowsToday: !!ctx?.includes(`${T} – ${T}`), active, kpis: await admin.ev(`document.querySelectorAll('.rpt-scope .kpi').length`), png: await admin.shot(`overview-race-run${run}`) });
}
await scenario({});
res('stale late response', { pass: race.every(r => r.lateIs30d && r.uiShowsToday), race });

// Loading state with controlled delay.
await admin.click(byText('.rpt-filters button', '7 ngày')); await sleep(1500);
await scenario({ id: `loading-${Date.now() % 100000}`, path: '/api/v1/reports/overview', delayMs: 2500, matchQuery: `from=${T}` });
await admin.click(byText('.rpt-filters button', 'Hôm nay')); await sleep(700);
const during = { loading: await admin.ev(`!!document.querySelector('.rpt-scope .rpt-loading, .rpt-scope .rk-loading')`), kpis: await admin.ev(`document.querySelectorAll('.rpt-scope .kpi').length`), context: await admin.ev(`!!document.querySelector('.rpt-context')`), png: await admin.shot('overview-loading') };
await sleep(3000);
res('loading', { during, after: { kpis: await admin.ev(`document.querySelectorAll('.rpt-scope .kpi').length`), context: await admin.ev(`!!document.querySelector('.rpt-context')`) }, pass: during.loading && during.kpis === 0 });
await scenario({});

// Error/retry with a controlled 503.
await scenario({ id: `error-${Date.now() % 100000}`, path: '/api/v1/reports/overview', fail: true });
await admin.click(byText('.rpt-filters button', '7 ngày')); await sleep(2600);
const errBefore = { alert: await admin.ev(`document.querySelector('.rpt-scope [role=alert]')?.innerText?.trim()||null`), kpis: await admin.ev(`document.querySelectorAll('.rpt-scope .kpi').length`), context: await admin.ev(`!!document.querySelector('.rpt-context')`), png: await admin.shot('overview-error') };
await scenario({});
n0 = admin.responses.length;
await admin.click(byText('.rpt-scope button', 'Thử lại')); await sleep(2000);
res('error/retry', { before: errBefore, retryRequests: admin.responses.slice(n0).map(r => `${r.url.split('?')[0]}:${r.status}`), after: { alert: await admin.ev(`!!document.querySelector('.rpt-scope [role=alert]')`), kpis: await admin.ev(`document.querySelectorAll('.rpt-scope .kpi').length`), context: await admin.ev(`!!document.querySelector('.rpt-context')`), png: await admin.shot('overview-after-retry') } });

// 0 / null / unavailable rendering.
const countText = (t) => admin.ev(`(document.querySelector('.rpt-scope').innerText.match(/${t}/g)||[]).length`);
await admin.goto('/reports/tong-quan'); await sleep(500);
const ovNull = await countText('Chưa có dữ liệu');
await admin.goto('/reports/ai'); await sleep(500);
const aiNull = await admin.ev(`(document.querySelector('.rpt-scope').innerText.match(/Chưa có dữ liệu|chưa đủ nguồn|Chưa khả dụng|chưa khả dụng/g)||[]).length`);
const aiCtx = await admin.ev(`document.querySelector('.rpt-context')?.innerText?.replace(/\\s+/g,' ')`);
await admin.goto('/reports/pipeline'); await sleep(500);
const plNull = await admin.ev(`(document.querySelector('.rpt-scope').innerText.match(/Chưa có dữ liệu|chưa đủ nguồn|Chưa khả dụng|chưa khả dụng/g)||[]).length`);
res('null/unavailable admin', { overviewNullLabels: ovNull, aiNullLabels: aiNull, pipelineNullLabels: plNull, aiContext: aiCtx, aiScopeOrg: !!aiCtx?.includes('Toàn tổ chức'), png: await admin.shot('pipeline-null') });

// Sale drill-down ×3 with focus return.
await admin.goto('/reports/sale'); await sleep(800);
const opener = `[...document.querySelectorAll('button[aria-label^="Chi tiết"]')][0]`;
const openerName = await admin.ev(`${opener}?.getAttribute('aria-label')`);
const drill = [];
for (const run of [1, 2, 3]) {
  await admin.click(opener); await sleep(900);
  const open = { overlays: await admin.ev(`document.querySelectorAll('.v-overlay--active').length`), focus: await admin.ev(`document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim()`), dialog: await admin.ev(`document.querySelector('.v-overlay--active [role=dialog], .v-overlay--active .v-card')?.innerText?.slice(0,120)||null`) };
  if (run === 1) await admin.shot('sale-detail-open');
  let closeBy;
  if (run === 1) { closeBy = 'Escape'; await admin.key('Escape'); }
  if (run === 2) {
    closeBy = 'Tab→Quay lại báo cáo+Enter';
    for (let i = 0; i < 12; i++) { const f = await admin.ev(`document.activeElement?.textContent?.trim()||''`); if (f.includes('Quay lại báo cáo')) break; await admin.key('Tab'); }
    await admin.key('Enter');
  }
  if (run === 3) { closeBy = 'mouse Đóng chi tiết'; await admin.click(`document.querySelector('.v-overlay--active button[aria-label="Đóng chi tiết"]')`); }
  await sleep(900);
  drill.push({ run, closeBy, open, after: { overlays: await admin.ev(`document.querySelectorAll('.v-overlay--active').length`), focusIsOpener: await admin.ev(`document.activeElement===${opener}`), focus: await admin.ev(`document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName`) } });
}
res('sale drill-down x3', { opener: openerName, pass: drill.every(d => d.open.overlays > 0 && d.after.overlays === 0 && d.after.focusIsOpener), drill, png: await admin.shot('sale-after-drill') });

// /reports-co-ban: real keyboard date entry (en-US mm/dd/yyyy), tabs, table vs API, Excel download.
await admin.goto('/reports-co-ban'); await sleep(800);
const mmddyyyy = (d) => `${d.slice(5, 7)}${d.slice(8, 10)}${d.slice(0, 4)}`;
for (const [idx, val] of [[0, D], [1, D]]) {
  await admin.click(`document.querySelectorAll('input[type=date]')[${idx}]`);
  await admin.key('ArrowLeft'); await admin.key('ArrowLeft');
  await admin.type(mmddyyyy(val));
}
const dateValues = await admin.ev(`[...document.querySelectorAll('input[type=date]')].map(i=>i.value)`);
n0 = admin.responses.length;
await admin.click(byText('button', 'Xem')); await sleep(1500);
const msgReq = admin.responses.slice(n0).find(r => r.url.startsWith('/api/v1/reports/messages'));
const msgApi = await (await fetch(BASE + msgReq.url, { headers: { authorization: `Bearer ${await admin.ev(`localStorage.getItem('token')||localStorage.getItem('accessToken')||''`)}` } })).json().catch(() => null);
const msgTable = await admin.ev(`[...document.querySelectorAll('.v-window-item--active tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.innerText.trim()))`);
const basicShot1 = await admin.shot('reports-co-ban-messages');
n0 = admin.responses.length;
await admin.click(byText('.v-tab', 'Khách hàng')); await sleep(1500);
const ctTable = await admin.ev(`[...document.querySelectorAll('.v-window-item--active tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.innerText.trim()))`);
const ctReq = admin.responses.slice(n0).find(r => r.url.startsWith('/api/v1/reports/contacts'));
const basicShot2 = await admin.shot('reports-co-ban-contacts');
await admin.click(byText('.v-tab', 'Lịch hẹn')); await sleep(1500);
const apTable = await admin.ev(`[...document.querySelectorAll('.v-window-item--active tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.innerText.trim()))`);
n0 = admin.responses.length;
await admin.click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Xuất Excel'))`); await sleep(2500);
const expReq = admin.responses.slice(n0).find(r => r.url.startsWith('/api/v1/reports/export'));
let download = null;
try {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(resolve(OUT, 'browser-downloads'));
  if (files.length) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await readFile(resolve(OUT, 'browser-downloads', files[0]))); const rows = []; wb.worksheets[0].eachRow((r, i) => rows.push(r.values.slice(1))); download = { files, sheet: wb.worksheets[0].name, rows }; }
} catch (e) { download = { error: String(e) }; }
res('reports-co-ban admin', { dateValues, msgRequest: msgReq, msgApi, msgTable, ctRequest: ctReq, ctTable, apTable, exportRequest: expReq, download, pngs: [basicShot1, basicShot2, await admin.shot('reports-co-ban-appointments')] });
// Fault on basic page: does it show an error state?
await scenario({ id: `basic-error-${Date.now() % 100000}`, path: '/api/v1/reports/appointments', fail: true });
n0 = admin.responses.length;
await admin.click(byText('button', 'Xem')); await sleep(1500);
res('reports-co-ban error state', { requests: admin.responses.slice(n0).map(r => `${r.url.split('?')[0]}:${r.status}`), visibleAlert: await admin.ev(`!!document.querySelector('[role=alert], .v-alert')`), tableRowsStillShown: await admin.ev(`document.querySelectorAll('.v-window-item--active tbody tr').length`), tableText: await admin.ev(`document.querySelector('.v-window-item--active tbody')?.innerText?.slice(0,200)`), png: await admin.shot('reports-co-ban-fault') });
await scenario({});

// ================= Other roles =================
const roleRoutes = ['/reports/tong-quan', '/reports/sale', '/reports/ai', '/reports/audit', '/reports/broadcast', '/reports/automation', '/reports-co-ban'];
for (const [label, uid] of [['leader', '6b-u-lead-s'], ['deputy', '6b-u-dep-s1'], ['member', '6b-u-sale-s1a'], ['deputy-no-grant', '6b-u-dep-m-nogrant'], ['admin-org-y', '6b-u-adm-y']]) {
  const p = await openPage(label);
  const landed = await p.login(uid);
  await p.goto('/');
  const hasTrigger = await p.ev(`!!document.querySelector('[data-report-nav-trigger]')`);
  let menu = null;
  if (hasTrigger) { await p.click(`document.querySelector('[data-report-nav-trigger]')`); await sleep(900); menu = await p.ev(`[...document.querySelectorAll('.v-overlay--active .v-list-item, .v-overlay--active a')].map(x=>x.textContent.trim()).filter(Boolean)`); await p.key('Escape'); await sleep(300); }
  const routes = {};
  for (const r of roleRoutes) {
    const n1 = p.responses.length;
    await p.goto(r);
    routes[r] = { final: await p.ev('location.pathname'), api: p.responses.slice(n1).filter(x => x.url.startsWith('/api/v1/reports/')).map(x => `${x.url.split('?')[0]}:${x.status}`) };
  }
  await p.goto('/reports/ai'); await sleep(400);
  const aiCtx = await p.ev(`document.querySelector('.rpt-context')?.innerText?.replace(/\\s+/g,' ')||null`);
  const png = await p.shot(`${label}-ai-or-redirect`);
  await p.goto('/reports-co-ban'); await sleep(600);
  const basicRows = await p.ev(`[...document.querySelectorAll('.v-window-item--active tbody tr')].map(tr=>tr.innerText.replace(/\\s+/g,' ')).slice(0,40)`);
  const png2 = await p.shot(`${label}-reports-co-ban`);
  res(`role ${label}`, { landed, hasReportTrigger: hasTrigger, menu, routes, aiContext: aiCtx, basicRows, pngs: [png, png2] });
  await send('Target.closeTarget', { targetId: p.targetId });
}
await writeFile(resolve(OUT, 'browser-results.json'), JSON.stringify(out, null, 1));
ws.close();
