import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { servePwaFixture, QA_TOKEN, QA_RT, QA_ROTATED_TOKEN } from './helpers/pwa-http-fixture';
import { pixelDiff } from './helpers/pixel-diff';
const ROOT = process.env.E_QA_ROOT!;
if (!ROOT) throw new Error('E_QA_ROOT is required: isolated TEMP build/profile/output folder');
// Count the allowlisted files in this build, rather than pinning the old E bundle size.
const STATIC_FILES = fs.readdirSync(path.join(ROOT, 'app-dist'), { recursive: true })
  .map(String).map(file => file.replaceAll('\\', '/'))
  .filter(file => /^(?:index\.html|assets\/.+\.(?:js|css|woff2?|ttf|otf)|pwa\/icons\/.+\.png)$/.test(file));
const PROFILE_ROOT = process.env.E_QA_PROFILE_ROOT ?? path.join(os.tmpdir(), 'crm-E-profiles'); fs.mkdirSync(PROFILE_ROOT, { recursive: true });
const OUT = path.join(process.env.E_QA_OUTPUT ?? path.join(ROOT, 'browser'), 'artifacts'); fs.mkdirSync(OUT, { recursive: true });
type Fixture = Awaited<ReturnType<typeof servePwaFixture>>;
const test = base.extend<{ h: { ctx: BrowserContext; page: Page; server: Fixture; shot(name: string): Promise<void> } }>({
  h: async ({ playwright, browserName }, use, info) => {
    const profile = path.join(PROFILE_ROOT, `${browserName}-${info.testId.replace(/[^a-z0-9]/gi, '').slice(-24)}`);
    const server = await servePwaFixture(path.join(ROOT, 'app-dist'));
    const ctx = await playwright[browserName].launchPersistentContext(profile, { headless:true, viewport:{ width:390,height:844 }, hasTouch:true, isMobile:true, locale:'vi-VN', timezoneId:'Asia/Ho_Chi_Minh' });
    await ctx.routeWebSocket(/socket\.io/, ws => ws.close()); // Fake backend socket only; no SW/network/static interception.
    const page = ctx.pages()[0] ?? await ctx.newPage(); page.setDefaultTimeout(20000);
    const consoleMessages: string[] = [];
    ctx.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on('dialog', dialog => dialog.accept());
    try { await use({ ctx, page, server, async shot(name) { await page.screenshot({ path:path.join(OUT, `${browserName}-${name}.png`),fullPage:true }); } }); }
    finally {
      if(info.status!=='passed') {
        await page.screenshot({path:path.join(OUT,`${browserName}-${info.testId.replace(/[^a-z0-9]/gi,'').slice(-24)}-failure.png`),fullPage:true}).catch(()=>{});
        const diagnostic=await page.evaluate(async()=>({url:location.href,online:navigator.onLine,controller:navigator.serviceWorker.controller?.scriptURL,registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,installing:r.installing?.state,waiting:r.waiting?.state,active:r.active?.state})),caches:await caches.keys(),editables:[...document.querySelectorAll('[contenteditable=true]')].map(e=>e.textContent),queue:localStorage.getItem('zalocrm-offline-queue')})).catch(error=>({error:String(error)}));
        fs.writeFileSync(path.join(OUT,`${browserName}-${info.testId.replace(/[^a-z0-9]/gi,'').slice(-24)}-failure.json`),JSON.stringify({title:info.title,diagnostic,consoleMessages,requests:server.state.calls},null,2));
      }
      await ctx.close(); await server.close();
    }
  },
});
async function loginSeed(page: Page, origin: string) {
  await page.goto(origin + '/login');
  await page.evaluate(([token, rt]) => { localStorage.setItem('token',token); localStorage.setItem('refreshToken',rt); }, [QA_TOKEN,QA_RT]);
}
async function warm(h: { page: Page; server: Fixture }, route='/chat/qa-conv-1') {
  await loginSeed(h.page,h.server.origin);
  // Warm setup waits for the first real install before forcing a second document navigation.
  await h.page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout:60000 });
  await h.page.goto(h.server.origin+route);
  await h.page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout:60000 });
  await expect.poll(() => h.page.evaluate(async () => {
    const names=await caches.keys(); let count=0;
    for(const name of names) if(name.startsWith('crm-pwa-shell-')) count+=(await(await caches.open(name)).keys()).length;
    return count;
  }),{timeout:60000}).toBe(STATIC_FILES.length);
  // SW precache may finish before the router/auth bootstrap. Inject failures only after the target is ready.
  if (route === '/account') await expect(h.page.locator('.m-account')).toBeVisible();
  else await expect(h.page.locator('.mobile-chat__thread [contenteditable=true]').first()).toBeVisible();
}
async function cacheKeys(page: Page) {
  return page.evaluate(async () => { const out:Record<string,string[]>={}; for(const name of await caches.keys())out[name]=(await(await caches.open(name)).keys()).map(r=>r.url); return out; });
}
async function update(h: { page: Page; server: Fixture }) {
  h.server.state.version='B';
  await h.page.evaluate(async () => { const reg=await navigator.serviceWorker.getRegistration(); await reg!.update(); });
  await expect.poll(() => h.page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting),{timeout:60000}).toBe(true);
  await expect(h.page.locator('.pwa-update')).toBeVisible();
}
const editor=(p:Page)=>p.locator('.mobile-chat__thread [contenteditable=true]').first();

test('built SW registers, exact build static precache entries, manifest and PNG dimensions',async({h},info)=>{
  await warm(h); await expect(editor(h.page)).toBeVisible();
  const registration=await h.page.evaluate(async()=>{ const r=(await navigator.serviceWorker.getRegistration())!;return{scope:r.scope,url:r.active?.scriptURL,updateViaCache:r.updateViaCache}; });
  expect(registration).toMatchObject({scope:h.server.origin+'/',url:h.server.origin+'/sw.js',updateViaCache:'none'});
  const keys=await cacheKeys(h.page);
  const urls=Object.values(keys).flat();
  expect(urls.map(url => new URL(url).pathname.slice(1)).sort()).toEqual([...STATIC_FILES].sort());
  expect(urls.every(u=>/^\/(?:index\.html|assets\/[^/]+\.(?:js|css|woff2?|ttf|otf)|pwa\/icons\/(?:icon-(?:180|192|512)|maskable-512)\.png)$/.test(new URL(u).pathname))).toBe(true);
  const manifest=await (await h.page.request.get(h.server.origin+'/manifest.json')).json();
  expect(manifest).toMatchObject({id:'/',scope:'/',start_url:'/',display:'standalone',name:'Cờ Rếp Việt CRM'});
  const iconFiles=[['icon-180.png',180],['icon-192.png',192],['icon-512.png',512],['maskable-512.png',512]] as const;
  for(const [file,size]of iconFiles){const bytes=fs.readFileSync(path.join(ROOT,'app-dist/pwa/icons',file));expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(size);expect(bytes.readUInt32BE(20)).toBe(size);}
  expect(await h.page.locator('link[rel=apple-touch-icon]').getAttribute('href')).toBe('/pwa/icons/icon-180.png');
  fs.writeFileSync(path.join(OUT,`${info.project.name}-cache-keys.json`),JSON.stringify(keys,null,2));await h.shot('installed');
});

test('API/socket/private media never cache; navigation 503 remains 503; unknown/file offline does not get shell',async({h})=>{
  await warm(h);
  await h.page.evaluate(async()=>{for(const url of ['/api/v1/profile','/socket.io/?EIO=4&transport=polling','/iphone-media/qa-private.png','/files/qa-private.pdf','/uploads/qa-private.mp4'])await fetch(url).catch(()=>{});});
  expect(Object.values(await cacheKeys(h.page)).flat().some(u=>/api\/|socket\.io|iphone-media|\/files\/|\/uploads\//.test(u))).toBe(false);
  h.server.state.navigationStatus=503;
  const response=await h.page.goto(h.server.origin+'/contacts'); expect(response?.status()).toBe(503);await expect(h.page.locator('body')).toContainText('QA maintenance response');
  h.server.state.navigationStatus=200;await h.page.goto(h.server.origin+'/account');
  await h.ctx.setOffline(true);
  const failure=await h.page.goto(h.server.origin+'/uploads/qa-never-cached.pdf').then(()=>false,()=>true);expect(failure).toBe(true);
});

for(const theme of ['light','dark'] as const)test(`actual waiting worker never reloads draft or pending; ${theme}`,async({h})=>{
  await warm(h);await expect(editor(h.page)).toBeVisible();
  await h.page.evaluate(t=>localStorage.setItem('crm.mobile.themePreference:qa-user-admin',t),theme);await h.page.reload();await expect(editor(h.page)).toBeVisible();
  await editor(h.page).fill('QA draft preserved');await h.page.evaluate(()=>{(window as any).__qaRamMarker='before-update';});
  await update(h);await expect(h.page.locator('.pwa-update button')).toBeDisabled();
  await h.page.waitForTimeout(500);expect(await h.page.evaluate(()=>(window as any).__qaRamMarker)).toBe('before-update');await expect(editor(h.page)).toHaveText('QA draft preserved');await h.shot(`draft-update-${theme}`);
  await editor(h.page).selectText(); // Select the editable on both Windows WebKit and Chromium.
  await editor(h.page).press('Backspace'); // Real keyboard deletion still drives the Tiptap transaction.
  await expect(editor(h.page)).toHaveText('');
  await expect(h.page.locator('.pwa-update button')).toBeEnabled();
  await h.ctx.setOffline(true);await editor(h.page).fill('QA offline pending');await h.page.locator('.mobile-chat__thread .send-btn').click();
  await expect(h.page.locator('.pwa-update button')).toBeDisabled();
  expect(await h.page.evaluate(()=>JSON.parse(localStorage.getItem('zalocrm-offline-queue')||'[]').length)).toBe(1);
  expect(await h.page.evaluate(()=>(window as any).__qaRamMarker)).toBe('before-update');await h.shot(`pending-update-${theme}`);
});

test('empty composer waits for explicit acceptance then reloads on the new worker',async({h})=>{
  await warm(h);await expect(editor(h.page)).toBeVisible();
  await h.page.evaluate(()=>{(window as any).__qaRamMarker='empty-before-update';});
  await update(h);await expect(h.page.locator('.pwa-update button')).toBeEnabled();
  expect(await h.page.evaluate(()=>(window as any).__qaRamMarker)).toBe('empty-before-update');
  await h.page.locator('.pwa-update button').click();
  await expect.poll(()=>h.page.evaluate(()=>(window as any).__qaRamMarker??null).catch(()=>'navigating'),{timeout:30000}).toBe(null);
  await expect(editor(h.page)).toBeVisible();await expect(h.page.locator('.pwa-update')).toHaveCount(0);
  expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_TOKEN);
  await h.shot('empty-update-accepted');
});
test('another tab accepts actual worker update; drafting tab never reloads',async({h})=>{
  await warm(h);await editor(h.page).fill('QA tab A draft');await h.page.evaluate(()=>{(window as any).__qaRamMarker='tab-A';});
  const peer=await h.ctx.newPage();await peer.goto(h.server.origin+'/account');
  h.server.state.version='B';await peer.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update();});
  await expect(peer.locator('.pwa-update button')).toBeEnabled({timeout:60000});
  await peer.evaluate(()=>{(window as any).__qaPeerMarker='old-controller';});await peer.locator('.pwa-update button').click();
  await expect.poll(()=>peer.evaluate(()=>(window as any).__qaPeerMarker??null).catch(()=> 'navigating'),{timeout:30000}).toBe(null);
  await expect(editor(h.page)).toHaveText('QA tab A draft');expect(await h.page.evaluate(()=>(window as any).__qaRamMarker)).toBe('tab-A');
  await expect(h.page.locator('.pwa-update button')).toBeDisabled();await h.shot('multitab-draft-preserved');
});

test('offline cold launch keeps tokens, blocks private data, and online recovery restores original deep link',async({h})=>{
  await warm(h);await h.ctx.setOffline(true);await h.page.goto(h.server.origin+'/chat/qa-conv-1');
  await expect(h.page.locator('.pwa-verification')).toBeVisible();await expect(h.page.locator('.pwa-verification')).toContainText('Phiên đăng nhập vẫn được giữ');
  expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_TOKEN);expect(await h.page.evaluate(()=>localStorage.getItem('refreshToken'))).toBe(QA_RT);
  expect(await h.page.locator('.m-conv-row').count()).toBe(0);await h.shot('offline-cold-token-kept');
  await h.ctx.setOffline(false);await h.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(h.page).toHaveURL(h.server.origin+'/chat/qa-conv-1');await expect(editor(h.page)).toBeVisible();await expect(h.page.locator('.pwa-verification')).toHaveCount(0);
});

test('persistent profile reopens offline after the browser process has closed',async({playwright,browserName})=>{
  const server=await servePwaFixture(path.join(ROOT,'app-dist'));
  const profile=path.join(PROFILE_ROOT,`${browserName}-cold-restart`);
  const options={headless:true,viewport:{width:390,height:844},hasTouch:true,isMobile:true,locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh'};
  let ctx=await playwright[browserName].launchPersistentContext(profile,options);
  try {
    await ctx.routeWebSocket(/socket\.io/,ws=>ws.close());
    let page=ctx.pages()[0]??await ctx.newPage();
    await warm({page,server});await expect(editor(page)).toBeVisible();
    await ctx.close(); // RAM and the browser process are gone; keep its on-disk profile only.
    ctx=await playwright[browserName].launchPersistentContext(profile,options);
    await ctx.setOffline(true);await ctx.routeWebSocket(/socket\.io/,ws=>ws.close());
    page=ctx.pages()[0]??await ctx.newPage();
    await page.goto(server.origin+'/chat/qa-conv-1');
    await expect(page.locator('.pwa-verification')).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_TOKEN);
    expect(await page.evaluate(()=>localStorage.getItem('refreshToken'))).toBe(QA_RT);
    expect(await page.locator('.m-conv-row').count()).toBe(0);
    await page.screenshot({path:path.join(OUT,`${browserName}-offline-process-restart.png`),fullPage:true});
    await ctx.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await expect(editor(page)).toBeVisible();await expect(page.locator('.pwa-verification')).toHaveCount(0);
  } finally {await ctx.close();await server.close();}
});
for(const rejection of [200,403,401] as const)test(`expired access + refresh status ${rejection} follows auth policy`,async({h})=>{
  await warm(h,'/account');h.server.state.rejectOldToken=true;h.server.state.refreshStatus=rejection;const before=h.server.state.refreshCount;
  await h.page.reload();await expect.poll(()=>h.server.state.refreshCount-before).toBe(1);
  if(rejection===200){await expect(h.page.locator('.m-account')).toBeVisible();expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_ROTATED_TOKEN);}
  if(rejection===403){await expect(h.page.locator('.pwa-verification')).toBeVisible();expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_TOKEN);expect(await h.page.evaluate(()=>localStorage.getItem('refreshToken'))).toBe(QA_RT);h.server.state.refreshStatus=200;await h.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(h.page.locator('.m-account')).toBeVisible();}
  if(rejection===401){await expect(h.page).toHaveURL(h.server.origin+'/login');expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(null);expect(await h.page.evaluate(()=>localStorage.getItem('refreshToken'))).toBe(null);}
});

test('profile503 cold verification keeps tokens and recovers when visible without granting offline access',async({h})=>{
  await warm(h,'/account');h.server.state.profileStatus=503;await h.page.reload();
  await expect(h.page.locator('.pwa-verification')).toBeVisible();await expect(h.page.locator('.pwa-verification')).toContainText('Chưa xác minh được phiên đăng nhập');
  expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_TOKEN);expect(await h.page.evaluate(()=>localStorage.getItem('refreshToken'))).toBe(QA_RT);
  // Wait for the original guard redirect before triggering the separate recovery event.
  await expect(h.page).toHaveURL(h.server.origin+'/login');
  h.server.state.profileStatus=200;await h.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(h.page.locator('.m-account')).toBeVisible();
});

test('logout cleans only CRM-owned runtime cache and IDB, preserves foreign app stores and public shell',async({h})=>{
  await warm(h,'/account');await h.page.evaluate(async()=>{
    for(const name of ['crm-user-qa','zalocrm-qa','foreign-app-cache',`workbox-runtime-${location.origin}/`]){const cache=await caches.open(name);await cache.put('/qa-private-key',new Response('fake-private'));}
    for(const name of ['crm-user-cache','foreign-user-db'])await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('qa');request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
    localStorage.setItem('zalocrm-offline-queue',JSON.stringify([{id:'qa-pending',conversationId:'qa-conv-1',content:'fake',createdAt:new Date().toISOString(),userId:'qa-user-admin',orgId:'qa-org',status:'failed'}]));
  });
  await h.page.locator('.m-account__logout').click();await h.page.getByRole('button',{name:'Đăng xuất',exact:true}).last().click();await expect(h.page).toHaveURL(h.server.origin+'/login');
  await expect.poll(()=>h.page.evaluate(()=>caches.keys())).toEqual(expect.arrayContaining(['foreign-app-cache']));
  await expect.poll(()=>h.page.evaluate(async()=>{const keys=await caches.keys();return keys.filter(k=>k.startsWith('crm-user-')||k.startsWith('zalocrm-')||k.startsWith('workbox-runtime-'));})).toEqual([]);
  // Opening after cleanup proves deletion even where indexedDB.databases() is unavailable (older Safari).
  const stores=await h.page.evaluate(async()=>{
    const probe=(name:string)=>new Promise<{created:boolean;stores:string[]}>((resolve,reject)=>{
      let created=false;const request=indexedDB.open(name);
      request.onupgradeneeded=()=>{created=true;};
      request.onsuccess=()=>{const result={created,stores:[...request.result.objectStoreNames]};request.result.close();resolve(result);};
      request.onerror=()=>reject(request.error);
    });
    return{owned:await probe('crm-user-cache'),foreign:await probe('foreign-user-db')};
  });
  expect(stores.owned.created).toBe(true);expect(stores.foreign).toEqual({created:false,stores:['qa']});
  expect(Object.keys(await cacheKeys(h.page)).some(k=>k.startsWith('crm-pwa-shell-'))).toBe(true);
  expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(null);expect(await h.page.evaluate(()=>JSON.parse(localStorage.getItem('zalocrm-offline-queue')||'[]'))).toEqual([]);
});

for(const mode of ['control','tombstone'] as const)test(`real ${mode} disables root worker without reloading or deleting foreign caches`,async({h})=>{
  await warm(h);await editor(h.page).fill('QA keep draft through disable');await h.page.evaluate(async()=>{(window as any).__qaRamMarker='keep-disable';await caches.open('foreign-app-cache');});
  if(mode==='control'){h.server.state.enabled=false;await h.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
  else{h.server.state.version='tombstone';await h.page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update();});}
  await expect.poll(()=>h.page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),{timeout:30000}).toBe(0);
  await expect.poll(()=>h.page.evaluate(async()=>(await caches.keys()).filter(k=>k.startsWith('crm-pwa-shell-'))),{timeout:30000}).toEqual([]);
  expect(await h.page.evaluate(()=>(window as any).__qaRamMarker)).toBe('keep-disable');await expect(editor(h.page)).toHaveText('QA keep draft through disable');expect(await h.page.evaluate(()=>localStorage.getItem('token'))).toBe(QA_TOKEN);
  expect(await h.page.evaluate(()=>caches.keys())).toContain('foreign-app-cache');await h.shot(`disabled-${mode}`);
});

test('desktop1440 exact0 pixels versus supplied baseline for six routes',async({browser,browserName},info)=>{
  const app=await servePwaFixture(path.join(ROOT,'app-dist'));const baseline=await servePwaFixture(path.join(ROOT,'base/frontend/dist'));
  const routes=[['overview','/'],['contacts','/contacts'],['profile','/contacts/qa-ct-1/profile'],['appointments','/appointments'],['settings-org','/settings/org/profile'],['settings-personal','/settings/personal/profile']];
  try{for(const[name,route]of routes){const shots:Buffer[]=[];
    for(const[label,server]of[['base',baseline],['after',app]] as const){const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh'});const p=await ctx.newPage();await p.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));await loginSeed(p,server.origin);await p.goto(server.origin+route);await p.waitForTimeout(2000);await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>!i.complete).map(i=>new Promise(r=>{i.onload=r;i.onerror=r;})));});const shot=await p.screenshot({animations:'disabled',caret:'hide'});shots.push(shot);fs.writeFileSync(path.join(OUT,`${browserName}-desktop-${name}-${label}.png`),shot);await ctx.close();}
    const diff=await pixelDiff(browser,shots[0],shots[1],0);const{diffPngBase64,...summary}=diff;fs.writeFileSync(path.join(OUT,`${browserName}-desktop-${name}.json`),JSON.stringify(summary,null,2));if(diffPngBase64)fs.writeFileSync(path.join(OUT,`${browserName}-desktop-${name}-diff.png`),Buffer.from(diffPngBase64,'base64'));expect.soft(diff.exactDiffPixels,`${browserName} ${name}: exact0`).toBe(0);}
  }finally{await app.close();await baseline.close();}
});
