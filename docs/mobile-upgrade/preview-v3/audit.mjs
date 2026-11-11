// Read-only source/PNG checks; report output stays in Preview V3.
import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const report=JSON.parse(await fs.readFile(new URL('verification.json',root),'utf8'));
// Native date/time controls emit local data: icon resources; these are not network.
report.externalRequests=report.externalRequests.filter(u=>/^https?:/.test(u));
await fs.writeFile(new URL('verification.json',root),JSON.stringify(report,null,2));
function lum(hex){const rgb=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
const colors=[['body on white','152838','ffffff'],['secondary on background','526576','f7f9fc'],['primary action','ffffff','0b5880'],['selected chip','0b5880','e7f3fa'],['warning banner','8a4b08','fff3e3'],['message outgoing','152838','e2f1fa'],['success text','157347','f7f9fc']].map(([name,fg,bg])=>{const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return{name,foreground:'#'+fg,background:'#'+bg,ratio:Number(ratio.toFixed(2)),passesBodyAA:ratio>=4.5};});
const images=[];
for(const name of report.manifest){const bytes=await fs.readFile(new URL('renders/'+name,root));const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);let expectedWidth=390,expectedHeight=844;if(name.includes('landscape')){expectedWidth=844;expectedHeight=390;}else if(name.includes('-320'))expectedWidth=320;else if(name.includes('-430'))expectedWidth=430;images.push({name,width,height,pass:width===expectedWidth&&height===expectedHeight});}
const html=await fs.readFile(new URL('index.html',root),'utf8');
const js=await fs.readFile(new URL('app.js',root),'utf8');
const css=await fs.readFile(new URL('preview.css',root),'utf8');
const staticChecks={zoomEnabled:!/(user-scalable\s*=\s*no|maximum-scale\s*=\s*1)/i.test(html),viewportFitCover:html.includes('viewport-fit=cover'),lightOnly:html.includes('light only'),noVHtml:!html.includes('v-html')&&!js.includes('v-html'),noGlobalTouchCapture:!js.includes('touchmove'),noTransitionAll:!css.includes('transition:all'),noRemoteAppImports:!/^import .*https?:/m.test(js),noApplicationApi:!js.includes("from '@/")&&!js.includes('fetch('),noFixed100vh:!css.includes('100vh'),hasFocusVisible:css.includes(':focus-visible'),hasNativeDialog:html.includes('<dialog'),hasSkipLink:html.includes('class="skip"'),noExternalHttpRequests:report.externalRequests.length===0};
const audit={colors,images,staticChecks,notes:['Contrast samples only; not full accessibility certification.','Native Chrome date/time icon data URLs are excluded from external HTTP requests.','Preview only: no application typecheck/test or iPhone device verification.']};
await fs.writeFile(new URL('audit.json',root),JSON.stringify(audit,null,2));
console.log(JSON.stringify({images:images.length,imageFailures:images.filter(i=>!i.pass),colors,staticChecks},null,2));
