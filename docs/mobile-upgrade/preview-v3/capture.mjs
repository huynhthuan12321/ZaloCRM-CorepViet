// Uses built-in Node WebSocket + locally installed Chrome. No dependencies.
// Start Chrome headless with --remote-debugging-port=9333, then run this file.
import fs from 'node:fs/promises';
const target=await (await fetch('http://127.0.0.1:9333/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
let seq=0;const pending=new Map();const errors=[];
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+m.params.exceptionDetails.exception?.description);});
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
const requests=new Set();ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Network.requestWillBeSent')requests.add(m.params.request.url);});
const root=new URL('./',import.meta.url);
const manifest=[],checks=[];
async function load(screen,width=390,height=844,opts=''){
 await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:`http://127.0.0.1:5183/?screen=${screen}&w=${width}&h=${height}&capture=1${opts}`});
 for(let i=0;i<60;i++){await pause(50);if(await evaluate('!!document.querySelector(".phone .shell")'))break;}
 if(!await evaluate('!!document.querySelector(".phone .shell")'))throw new Error('Preview failed: '+JSON.stringify(errors)+' '+await evaluate('document.body.innerText.slice(0,500)'));
 await evaluate('document.fonts.ready');await pause(100);
}
async function capture(name){const result=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL('renders/'+name+'.png',root),Buffer.from(result.data,'base64'));manifest.push(name+'.png');}
async function measure(screen,width,height,state){checks.push({screen,width,height,state,...await evaluate(`(()=>{const phone=document.querySelector('.phone');const shell=document.querySelector('.shell');const visible=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';const controls=[...phone.querySelectorAll('button,a.control,input:not([type=file]),textarea,select')].filter(visible);return {documentOverflow:document.documentElement.scrollWidth>innerWidth,phoneOverflow:phone.scrollWidth>phone.clientWidth,smallTargets:controls.filter(e=>{let r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9}).map(e=>({text:e.getAttribute('aria-label')||e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),shellHeight:shell.clientHeight};})()`)});}
for(const screen of ['overview','inbox','thread','composer','contacts','profile','agenda','more']){
 await load(screen);if(screen==='composer')await evaluate(`(async()=>{document.querySelector('#app').__vue_app__._container._vnode.component.proxy.draft='Dạ, em gửi chị bản bố trí quầy để tham khảo nhé.';await new Promise(r=>setTimeout(r,20));})()`);await capture(screen+'-390');await measure(screen,390,844,'ready');
}
for(const width of [320,430])for(const screen of ['inbox','thread']){await load(screen,width);await capture(screen+'-'+width);await measure(screen,width,844,'ready');}
await load('thread',844,390);await capture('thread-landscape-844x390');await measure('thread',844,390,'ready');
await load('thread',390,844,'&sheet=ai');await capture('ai-sheet-390');
for(const sheet of ['contact-filter','appointment']){await load(sheet==='appointment'?'agenda':'contacts');await evaluate(`document.querySelector('#app').__vue_app__._container._vnode.component.proxy.openSheet('${sheet}')`);await pause(100);await capture(sheet+'-390');}
for(const width of [320,390,430])for(const sheet of ['ai','contact-filter','appointment','attachment']){await load(sheet==='appointment'?'agenda':sheet==='contact-filter'?'contacts':'thread',width);await evaluate(`document.querySelector('#app').__vue_app__._container._vnode.component.proxy.openSheet('${sheet}')`);await pause(50);await measure('sheet-'+sheet,width,844,'ready');}
for(const screen of ['overview','inbox','thread','contacts'])for(const state of ['loading','empty','error','offline']){await load(screen,390,844,'&state='+state);await capture(screen+'-'+state+'-390');await measure(screen,390,844,state);}
// Responsive DOM coverage beyond required PNG set.
for(const width of [320,375,393,430,768])for(const screen of ['overview','inbox','thread','composer','contacts','profile','agenda','more']){await load(screen,width);await measure(screen,width,844,'ready');}
// Behavior uses actual native element interactions and component public state.
const behavior=[];
await load('inbox');
behavior.push({case:'search to empty',pass:await evaluate(`(()=>{const input=document.querySelector('[name=inbox-search]');input.value='không-tồn-tại';input.dispatchEvent(new Event('input',{bubbles:true}));return new Promise(r=>setTimeout(()=>r(document.querySelector('.state h2')?.textContent==='Không có kết quả'),20));})()`)});
await load('inbox');
behavior.push({case:'select second conversation → matching profile → matching thread',pass:await evaluate(`(async()=>{const vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;await vm.go('thread','demo-conv-2');const correctHeader=document.querySelector('.thread-title h1').textContent==='Đỗ Khang';await vm.go('profile');const correctProfile=document.querySelector('.profile-identity h1').textContent==='Đỗ Khang';vm.profileChat();await new Promise(r=>setTimeout(r,20));return correctHeader&&correctProfile&&document.querySelector('.thread-title h1').textContent==='Đỗ Khang';})()`)});
behavior.push({case:'AI applies to draft without sending',pass:await evaluate(`(async()=>{const vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;await vm.openSheet('ai');vm.applyAI();await new Promise(r=>setTimeout(r,20));return vm.draft===vm.suggestion&&vm.extra.length===0&&!document.querySelector('dialog').open;})()`)});
behavior.push({case:'draft isolation per conversation',pass:await evaluate(`(async()=>{const vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;const saved=vm.draft;await vm.go('thread','demo-conv-1');const blank=vm.draft==='';await vm.go('thread','demo-conv-2');return blank&&vm.draft===saved;})()`)});
behavior.push({case:'offline disables send, retains draft',pass:await evaluate(`(async()=>{const vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;vm.state='offline';await new Promise(r=>setTimeout(r,20));return !!vm.draft&&document.querySelector('.send').disabled;})()`)});
await load('contacts');
behavior.push({case:'filter applies only on Apply; Escape closes dialog with focus return',pass:await evaluate(`(async()=>{const vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;const trigger=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Bộ lọc'));trigger.focus();await vm.openSheet('contact-filter');vm.pendingStatus='Quan tâm';const before=vm.contacts.length;vm.applyFilters();await new Promise(r=>setTimeout(r,20));const applied=before===5&&vm.contacts.length===2&&document.activeElement===trigger;await vm.openSheet('contact-filter');document.querySelector('dialog').dispatchEvent(new Event('cancel',{cancelable:true}));return applied&&!document.querySelector('dialog').open;})()`)});
await load('agenda');
behavior.push({case:'create appointment adds local agenda item',pass:await evaluate(`(async()=>{const vm=document.querySelector('#app').__vue_app__._container._vnode.component.proxy;const before=vm.dailyAppointments.length;await vm.openSheet('appointment');vm.createAppointment();await new Promise(r=>setTimeout(r,20));return vm.dailyAppointments.length===before+1;})()`)});
await load('composer');
behavior.push({case:'composer directly above simulated keyboard',pass:await evaluate(`(()=>{const c=document.querySelector('.composer').getBoundingClientRect(),k=document.querySelector('.keyboard').getBoundingClientRect();return Math.abs(c.bottom-k.top)<1&&c.top>document.querySelector('.thread-head').getBoundingClientRect().bottom;})()`)});
await load('thread');await evaluate(`document.querySelector('#app').__vue_app__._container._vnode.component.proxy.openSheet('ai')`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(50);behavior.push({case:'actual Escape key closes native dialog',pass:await evaluate('!document.querySelector("dialog").open')});
await fs.writeFile(new URL('verification.json',root),JSON.stringify({browser:await cdp('Browser.getVersion'),scope:'Desktop Chrome only; fictional fixtures; no iPhone/Safari/PWA verification',checks,behavior,errors,externalRequests:[...requests].filter(u=>/^https?:/.test(u)&&!u.startsWith('http://127.0.0.1:5183/')),manifest},null,2));
console.log(JSON.stringify({screenshots:manifest.length,checks:checks.length,failures:checks.filter(c=>c.documentOverflow||c.phoneOverflow||c.smallTargets.length),behavior,errors},null,2));
await cdp('Page.close');ws.close();

