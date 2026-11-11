import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {withTenant,getTenantContext} from '../../src/shared/tenant/tenant-context.js';
const state=vi.hoisted(()=>({contacts:[] as any[],logs:[] as any[],calls:[] as any[],schedules:[] as any[],stale:false,removed:false,moved:false,injectForeign:false}));
const NOW=Date.parse('2026-11-07T13:00:00Z'),DAY=86400000;
function ctx(model:string,args:any){const c=getTenantContext();state.calls.push({model,args,ctx:c});if(!c)throw Error('TEST missing tenant '+model);return c;}
function eligible(c:any,where:any){const r=where.lastInboundAt;return !!c.lastInboundAt&&(!r||((!r.gte||c.lastInboundAt>=r.gte)&&(!r.lt||c.lastInboundAt<r.lt)));}
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:{
 contact:{findMany:async(args:any)=>{const c=ctx('Contact.findMany',args);if(c.bypassTenantGuard)expect(Object.keys(args.select).sort()).toEqual(['id','orgId']);else expect(args.where.orgId).toBe(c.orgId);
  const found=state.contacts.filter(x=>(c.bypassTenantGuard||x.orgId===c.orgId)&&eligible(x,args.where));const out=found.map(x=>({...x}));
  if(state.injectForeign&&!c.bypassTenantGuard)out.push({...state.contacts.find(x=>x.orgId==='Y')});
  if(state.stale)state.contacts.find(x=>x.id==='c-X').lastInboundAt=new Date(NOW);
  if(state.removed)state.contacts=state.contacts.filter(x=>x.id!=='c-X');
  if(state.moved)state.contacts.find(x=>x.id==='c-X').orgId='Y';
  return out;
 },findFirst:async(args:any)=>{const c=ctx('Contact.findFirst',args);expect(c.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(c.orgId);return state.contacts.find(x=>x.id===args.where.id&&x.orgId===c.orgId&&eligible(x,args.where))??null;}},
 activityLog:{findFirst:async(args:any)=>{const c=ctx('ActivityLog.findFirst',args);expect(c.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(c.orgId);return state.logs.find(x=>x.orgId===c.orgId&&x.entityId===args.where.entityId&&x.createdAt>=args.where.createdAt.gte)??null;}},
}}));
vi.mock('../../src/modules/activity/activity-logger.js',()=>({logActivity:(args:any)=>{const c=ctx('ActivityLog.write',args);expect(c.bypassTenantGuard).not.toBe(true);expect(args.orgId).toBe(c.orgId);state.logs.push({...args,id:'log-'+state.logs.length,createdAt:new Date(NOW)});}}));
vi.mock('../../src/shared/utils/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn(),debug:vi.fn()}}));
vi.mock('node-cron',()=>({default:{schedule:(expression:string,callback:any,options:any)=>{state.schedules.push({expression,callback,options});return {stop(){},destroy(){}};}}}));
const {runSilentDetection,startInteractionCron}=await import('../../src/modules/contacts/interaction-cron.js');
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(NOW);state.contacts=['X','Y'].map(org=>({id:'c-'+org,orgId:org,fullName:'Synthetic '+org,lastInboundAt:new Date(NOW-30.5*DAY)}));state.logs=[];state.calls=[];state.schedules=[];state.stale=false;state.removed=false;state.moved=false;state.injectForeign=false;});
afterEach(()=>vi.restoreAllMocks());
describe('B interaction background authority',()=>{
 it('background global sweep uses metadata then normal scoped business/logs',async()=>{const r=await runSilentDetection();expect(r.logged).toBe(2);expect(state.logs.map(x=>x.orgId).sort()).toEqual(['X','Y']);});
 it('normal X sweep cannot enter Y',async()=>{await withTenant('X',()=>runSilentDetection());expect(state.logs.map(x=>x.orgId)).toEqual(['X']);expect(state.calls.some(x=>x.ctx?.bypassTenantGuard)).toBe(false);});
 it('normal actor survives hydration/dedup',async()=>{await withTenant('X',()=>runSilentDetection(),{userId:'u-X',role:'member'});expect(state.calls.find(x=>x.model==='ActivityLog.findFirst').ctx).toMatchObject({orgId:'X',userId:'u-X',role:'member',bypassTenantGuard:false});});
 it('invalid wildcard/empty normal contexts cannot become global discovery',async()=>{for(const org of ['*',''])try{await withTenant(org,()=>runSilentDetection());}catch{}expect(state.calls).toHaveLength(0);});
 it('fresh inbound after inventory prevents a stale milestone',async()=>{state.stale=true;const r=await runSilentDetection();expect(r.logged).toBe(1);expect(state.logs.map(x=>x.orgId)).toEqual(['Y']);});
 it('removed/reparented candidate is not hydrated under stale X',async()=>{state.removed=true;await runSilentDetection();expect(state.logs.map(x=>x.orgId)).toEqual(['Y']);});
 it('reparented candidate is skipped under stale inventory org',async()=>{state.moved=true;await runSilentDetection();expect(state.logs.map(x=>x.entityId)).toEqual(['c-Y']);});
 it('foreign metadata cannot widen normal caller even if inventory is wrong',async()=>{state.injectForeign=true;await withTenant('X',()=>runSilentDetection());expect(state.logs.map(x=>x.orgId)).toEqual(['X']);});
 it('completed milestone is deduplicated when rerun',async()=>{expect((await runSilentDetection()).logged).toBe(2);expect((await runSilentDetection()).logged).toBe(0);expect(state.logs).toHaveLength(2);});
 it('old log before the current inbound does not suppress a new milestone',async()=>{state.logs.push({orgId:'X',entityId:'c-X',createdAt:new Date(NOW-32*DAY)});expect((await runSilentDetection()).logged).toBe(2);});
 it('30-day exclusive and31-day inclusive bounds remain exact',async()=>{state.contacts=[{id:'at30',orgId:'X',lastInboundAt:new Date(NOW-30*DAY)},{id:'at31',orgId:'Y',lastInboundAt:new Date(NOW-31*DAY)},{id:'past31',orgId:'Y',lastInboundAt:new Date(NOW-31*DAY-1)}];await runSilentDetection();expect(state.logs.map(x=>x.entityId)).toEqual(['at31']);});
 it('daily expression binds explicit UTC and detached callback is scoped',async()=>{startInteractionCron();expect(state.schedules).toHaveLength(1);expect(state.schedules[0]).toMatchObject({expression:'0 19 * * *',options:{timezone:'UTC'}});await state.schedules[0].callback();expect(state.logs).toHaveLength(2);});
});
