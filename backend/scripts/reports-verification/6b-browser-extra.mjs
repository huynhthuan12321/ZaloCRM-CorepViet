// 6B lần 3 — group G supplement: AI period/scope label per role vs API, and measured-zero KPI rendering.
// Same rules as 6b-browser.mjs: CDP mouse/keyboard input only; page JS only reads state.
// Usage: node 6b-browser-extra.mjs <artifactDir> <cdpPort>
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [OUT, PORT] = [process.argv[2], process.argv[3]];
const BASE = 'http://127.0.0.1:55532';
const PASSWORD = '6B3-local-fixture-only';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const waiting = new Map(); const listeners = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } else for (const l of listeners) l(m); };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

async function openPage() {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const responses = [];
  listeners.push((m) => { if (m.sessionId === sessionId && m.method === 'Network.responseReceived' && m.params.response.url.includes('/api/v1/')) responses.push({ url: m.params.response.url.replace(BASE, ''), status: m.params.response.status }); });
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable');
  const ev = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result.value; };
  const goto = async (path) => { await s('Page.navigate', { url: BASE + path }); await sleep(1800); };
  const click = async (js) => {
    const r = await ev(`(()=>{const e=${js};if(!e)return null;e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  };
  const type = async (text) => { for (const ch of text) { await s('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await s('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } };
  const enter = async () => { await s('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  const shot = async (name) => { const { data } = await s('Page.captureScreenshot', { format: 'png' }); await writeFile(resolve(OUT, 'shots', `${name}.png`), Buffer.from(data, 'base64')); return `shots/${name}.png`; };
  return { s, ev, goto, click, type, enter, shot, responses, targetId };
}
const out = { time: new Date().toISOString(), browser: version.Browser, results: {} };
for (const [label, uid] of [['admin', '6b-u-adm-x'], ['leader', '6b-u-lead-s'], ['deputy', '6b-u-dep-s1'], ['leader-m', '6b-u-lead-m']]) {
  const p = await openPage();
  await p.goto('/login');
  await p.click(`document.querySelector('input[type=text], input[type=email]')`); await p.type(`${uid}@example.invalid`);
  await p.click(`document.querySelector('input[type=password]')`); await p.type(PASSWORD); await p.enter(); await sleep(2500);
  const n1 = p.responses.length;
  await p.goto('/reports/ai'); await sleep(600);
  const req = p.responses.slice(n1).find(r => r.url.startsWith('/api/v1/reports/ai'));
  const token = await p.ev(`localStorage.getItem('token')`);
  const api = await (await fetch(BASE + req.url, { headers: { authorization: `Bearer ${token}` } })).json();
  const sub = await p.ev(`[...document.querySelectorAll('.rpt-scope .rpt-sub')].map(x=>x.innerText.replace(/\\s+/g,' ')).join(' | ')`);
  const sharedSection = await p.ev(`document.querySelector('.rpt-scope').innerText.includes('Nick được cấp thêm')`);
  const png = await p.shot(`extra-${label}-ai`);
  await p.goto('/reports/tong-quan'); await sleep(600);
  const kpis = await p.ev(`[...document.querySelectorAll('.rpt-scope .kpi')].map(k=>k.innerText.replace(/\\s+/g,' '))`);
  const png2 = await p.shot(`extra-${label}-overview`);
  const scopeWord = api.scope.kind === 'org' ? 'Tổ chức' : 'Phòng ban và phòng con';
  out.results[label] = { aiRequest: req.url, api: { from: api.from, to: api.to, scope: api.scope, shared: !!api.shared }, uiSub: sub, labelMatches: sub.includes(`${api.from} – ${api.to}`) && sub.includes(scopeWord), sharedSection, overviewKpis: kpis, pngs: [png, png2] };
  console.log(label, JSON.stringify(out.results[label]).slice(0, 600));
  await send('Target.closeTarget', { targetId: p.targetId });
}
await writeFile(resolve(OUT, 'browser-extra-results.json'), JSON.stringify(out, null, 1));
ws.close();
