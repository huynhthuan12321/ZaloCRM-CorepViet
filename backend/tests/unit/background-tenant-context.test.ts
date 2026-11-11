import {describe,it,expect,vi,beforeEach} from 'vitest';
import {withTenant,getTenantContext} from '../../src/shared/tenant/tenant-context.js';
const state=vi.hoisted(()=>({calls:[] as any[],failNextIdentity:false,owners:{} as Record<string,string|null>,flipAfterIdentity:false,missingFriend:false,failFriendInventory:false}));
function context(model:string,args:any){
 const ctx=getTenantContext();state.calls.push({model,ctx:ctx?{orgId:ctx.orgId,bypass:!!ctx.bypassTenantGuard,userId:ctx.userId,role:ctx.role}:null,args});
 if(!ctx)throw Error('TEST missing tenant context '+model);
 return ctx;
}
const friends=[{id:'friend-X',orgId:'X',contactId:'contact-X',zaloAccountId:'nick-X',statusRef:{name:'new'},scoreUpdatedAt:new Date()}, {id:'friend-Y',orgId:'Y',contactId:'contact-Y',zaloAccountId:'nick-Y',statusRef:{name:'new'},scoreUpdatedAt:new Date()}];
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:{
 zaloAccount:{findUnique:async(args:any)=>{
  const ctx=context('ZaloAccount.findUnique',args);await Promise.resolve();
  if(state.failNextIdentity){state.failNextIdentity=false;throw Error('TEST transient identity DB failure');}
  const orgId=Object.hasOwn(state.owners,args.where.id)?state.owners[args.where.id]:(args.where.id.includes('-Y')?'Y':'X');if(!orgId||(!ctx.bypassTenantGuard&&ctx.orgId!==orgId))return null;
  if(state.flipAfterIdentity){state.flipAfterIdentity=false;state.owners[args.where.id]='Y';}
  return {id:args.where.id,orgId};
 },findFirst:async(args:any)=>{
  const ctx=context('ZaloAccount.findFirst',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(ctx.orgId);await Promise.resolve();
  if(state.failNextIdentity){state.failNextIdentity=false;throw Error('TEST transient identity DB failure');}
  const orgId=Object.hasOwn(state.owners,args.where.id)?state.owners[args.where.id]:(args.where.id.includes('-Y')?'Y':'X');
  return orgId===ctx.orgId?{id:args.where.id,orgId}:null;
 }},
 organization:{findMany:async(args:any)=>{const ctx=getTenantContext();state.calls.push({model:'Organization.findMany',ctx:ctx?{orgId:ctx.orgId,bypass:!!ctx.bypassTenantGuard}:null,args});expect(Object.keys(args.select)).toEqual(['id']);const ids=['X','Y'];return ids.filter(id=>!args.where?.id||args.where.id===id).map(id=>({id}));}},
 stuckThreshold:{findMany:async(args:any)=>{const ctx=context('StuckThreshold.findMany',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(ctx.orgId);return [{stage:'Ready',thresholdDays:1}];}},
 status:{findMany:async(args:any)=>{const ctx=context('Status.findMany',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(ctx.orgId);return [{id:'status-'+ctx.orgId,name:'Ready'}];}},
 activityLog:{findFirst:async(args:any)=>{const ctx=context('ActivityLog.findFirst',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.entityId).toContain(ctx.orgId);return null;}},
 appointment:{count:async(args:any)=>{const ctx=context('Appointment.count',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.contactId).toContain(ctx.orgId);return 0;}},
 sdkLimit:{findMany:async(args:any)=>{
  const ctx=context('SdkLimit.findMany',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(ctx.orgId).toBe(args.where.orgId);await Promise.resolve();
  return [{zaloAccountId:null,dailyLimit:ctx.orgId==='X'?11:17,burstLimit:2,burstWindowMs:1000}];
 }},
 friend:{
  findMany:async(args:any)=>{
   const ctx=context('Friend.findMany',args);if(state.failFriendInventory){state.failFriendInventory=false;throw Error('TEST inventory transient');}
   if(ctx.bypassTenantGuard){expect(Object.keys(args.select).sort()).toEqual(['id','orgId']);return friends.map(({id,orgId})=>({id,orgId}));}
   if(!Object.hasOwn(args.where,'scoreUpdatedAt')){expect(args.where.orgId).toBe(ctx.orgId);return friends.filter(f=>f.orgId===ctx.orgId).map(f=>({...f,statusId:'status-'+ctx.orgId,stuckSince:null,stageEnteredAt:new Date(Date.now()-20*86400000),createdAt:new Date(Date.now()-20*86400000)}));}
   return friends.filter(f=>f.orgId===ctx.orgId);
  },
  findFirst:async(args:any)=>{const ctx=context('Friend.findFirst',args);if(state.missingFriend&&args.where.id==='friend-X')return null;expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(ctx.orgId);return friends.find(f=>f.id===args.where.id&&f.orgId===ctx.orgId)??null;},
  findUnique:async(args:any)=>{const ctx=context('Friend.findUnique',args);expect(ctx.bypassTenantGuard).not.toBe(true);const f=friends.find(f=>f.id===args.where.id&&f.orgId===ctx.orgId);return f?{...f,leadScore:0,lastInboundAt:new Date(),scoreBreakdown:{},autoTags:['active']}:null;},
  update:async(args:any)=>{const ctx=context('Friend.update',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.id).toContain(ctx.orgId);return {};},
  count:async(args:any)=>{context('Friend.count',args);return 0;},
 },
 conversation:{findFirst:async(args:any)=>{const ctx=context('Conversation.findFirst',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.where.orgId).toBe(ctx.orgId);return {id:'conv-'+ctx.orgId};}},
 message:{findMany:async(args:any)=>{const ctx=context('Message.findMany',args);expect(ctx.bypassTenantGuard).not.toBe(true);return [{content:'Synthetic plain inbound',sentAt:new Date()}];}},
}}));
vi.mock('../../src/shared/utils/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn(),debug:vi.fn()}}));
vi.mock('../../src/modules/scoring/aggregate-contact.js',()=>({updateContactAggregateBatch:async(ids:string[])=>{const ctx=context('Aggregate.update',{ids});expect(ctx.bypassTenantGuard).not.toBe(true);expect(ids.every(id=>id.includes(ctx.orgId))).toBe(true);return {updated:ids.length};}}));
vi.mock('../../src/modules/activity/activity-logger.js',()=>({logActivity:(args:any)=>{const ctx=context('Activity.log',args);expect(ctx.bypassTenantGuard).not.toBe(true);expect(args.orgId).toBe(ctx.orgId);}}));
vi.mock('../../src/modules/scoring/score-engine.js',()=>({applySignalsToFriend:vi.fn(async()=>{})}));
vi.mock('../../src/modules/scoring/signal-detector.js',()=>({detectSignalsFromMessage:vi.fn(async()=>[])}));
const {getEffectiveLimit}=await import('../../src/modules/zalo/sdk-limit-service.js');
const {runStuckDetectionForOrg,runStuckDetectionAllOrgs}=await import('../../src/modules/scoring/stuck-detection.js');
const {runAutoTagsForOrg,runAutoTagsAllOrgs}=await import('../../src/modules/scoring/auto-tag.js');
const {runBackfillTick}=await import('../../src/modules/scoring/backfill-cron.js');

beforeEach(()=>{state.calls=[];state.failNextIdentity=false;state.owners={};state.flipAfterIdentity=false;state.missingFriend=false;state.failFriendInventory=false;});

describe('B SDK limit authority and async context',()=>{
 it('background cold lookup reads configured limit within derived tenant',async()=>{
  expect((await getEffectiveLimit('nick-X-cold','message')).daily).toBe(11);
 });
 it('warm foreign cache never supplies Y limit to normal caller X',async()=>{
  expect((await withTenant('Y',()=>getEffectiveLimit('nick-Y-warm','message'))).daily).toBe(17);
  const result=await withTenant('X',()=>getEffectiveLimit('nick-Y-warm','message'));
  expect(result.daily).not.toBe(17);
 });
 it('transient identity error does not poison valid nick for five minutes',async()=>{
  state.failNextIdentity=true;await withTenant('X',()=>getEffectiveLimit('nick-X-retry','message'));
  expect((await withTenant('X',()=>getEffectiveLimit('nick-X-retry','message'))).daily).toBe(11);
 });
 it('parallel X/Y reads retain each tenant across awaits',async()=>{
  const [x,y]=await Promise.all([withTenant('X',()=>getEffectiveLimit('nick-X-parallel','message')),withTenant('Y',()=>getEffectiveLimit('nick-Y-parallel','message'))]);
  expect(x.daily).toBe(11);expect(y.daily).toBe(17);
 });
});
describe('B scoring backfill discovery and business separation',()=>{
 it('background tick uses metadata discovery then scoped business reads',async()=>{
  state.calls=[];const result=await runBackfillTick();expect(result.processed).toBe(2);expect(result.remaining).toBe(0);
  expect(state.calls.filter(x=>x.model==='Conversation.findFirst').map(x=>x.ctx.orgId).sort()).toEqual(['X','Y']);
 });
 it('normal tenant caller never processes another tenant',async()=>{
  state.calls=[];const result=await withTenant('X',()=>runBackfillTick());expect(result.processed).toBe(1);
  expect(state.calls.filter(x=>x.model==='Conversation.findFirst').every(x=>x.ctx.orgId==='X')).toBe(true);
 });
});

describe('B expanded cache authority controls',()=>{
 it('removed nick never gets a warm configured limit',async()=>{
  const nick='nick-X-removed';expect((await withTenant('X',()=>getEffectiveLimit(nick,'message'))).daily).toBe(11);state.owners[nick]=null;
  expect((await withTenant('X',()=>getEffectiveLimit(nick,'message'))).daily).toBe(200);
 });
 it('reparented nick cannot use stale X authority; background resolves Y afresh',async()=>{
  const nick='nick-X-reparent';expect((await withTenant('X',()=>getEffectiveLimit(nick,'message'))).daily).toBe(11);state.owners[nick]='Y';
  expect((await withTenant('X',()=>getEffectiveLimit(nick,'message'))).daily).toBe(200);expect((await getEffectiveLimit(nick,'message')).daily).toBe(17);
 });
 it('ownership changed between discovery and scoped reread yields fallback',async()=>{
  const nick='nick-X-stale-inventory';state.flipAfterIdentity=true;expect((await getEffectiveLimit(nick,'message')).daily).toBe(200);
  expect(state.calls.filter(x=>x.model==='SdkLimit.findMany')).toHaveLength(0);
 });
 it('missing nick performs no limit business read',async()=>{
  state.owners['nick-X-missing']=null;expect((await getEffectiveLimit('nick-X-missing','message')).daily).toBe(200);expect(state.calls.filter(x=>x.model==='SdkLimit.findMany')).toHaveLength(0);
 });
 it('invalid normal wildcard context is never promoted to system SDK scope',async()=>{
  expect((await withTenant('*',()=>getEffectiveLimit('nick-X-invalid-star','message'),{role:'member',userId:'u-X'})).daily).toBe(200);
  expect(state.calls.some(x=>x.ctx?.bypass)).toBe(false);
 });
 it('normal actor metadata survives scoped limit read',async()=>{
  await withTenant('X',()=>getEffectiveLimit('nick-X-actor','message'),{role:'member',userId:'u-X'});
  expect(state.calls.find(x=>x.model==='SdkLimit.findMany').ctx).toMatchObject({orgId:'X',bypass:false,userId:'u-X',role:'member'});
 });
 it('removed inventory friend is skipped before business work',async()=>{
  state.missingFriend=true;const result=await runBackfillTick();expect(result.processed).toBe(1);expect(state.calls.filter(x=>x.model==='Conversation.findFirst').map(x=>x.ctx.orgId)).toEqual(['Y']);
 });
 it('failed inventory releases inFlight for a subsequent tick',async()=>{
  state.failFriendInventory=true;expect((await runBackfillTick()).remaining).toBe(-1);expect((await runBackfillTick()).processed).toBe(2);
 });
 it('invalid normal wildcard context cannot run all-org backfill',async()=>{
  const result=await withTenant('*',()=>runBackfillTick(),{userId:'u-X',role:'member'});expect(result.processed).toBe(0);expect(state.calls.some(x=>x.ctx?.bypass)).toBe(false);
 });
});

describe('B daily scheduler scope boundaries',()=>{
 it('background stuck sweep runs nonempty per-org mutations under each tenant',async()=>{
  const results=await runStuckDetectionAllOrgs();expect(results.map(x=>x.orgId).sort()).toEqual(['X','Y']);expect(results.reduce((n,x)=>n+x.newlyStuck,0)).toBe(2);
  expect(state.calls.filter(x=>x.model==='Friend.update').map(x=>x.ctx.orgId).sort()).toEqual(['X','Y']);
 });
 it('background auto-tag sweep keeps nonempty business reads scoped',async()=>{
  const results=await runAutoTagsAllOrgs();expect(results.map(x=>x.orgId).sort()).toEqual(['X','Y']);expect(results.reduce((n,x)=>n+x.scanned,0)).toBe(2);
  expect(state.calls.filter(x=>x.model==='ActivityLog.findFirst').map(x=>x.ctx.orgId).sort()).toEqual(['X','Y']);
 });
 it('normal X all-org entry points never query Y business rows',async()=>{
  const [stuck,tags]=await withTenant('X',async()=>[await runStuckDetectionAllOrgs(),await runAutoTagsAllOrgs()]);expect(stuck.map(x=>x.orgId)).toEqual(['X']);expect(tags.map(x=>x.orgId)).toEqual(['X']);
  expect(state.calls.some(x=>x.args?.where?.orgId==='Y')).toBe(false);expect(state.calls.some(x=>x.ctx?.bypass)).toBe(false);
 });
 it('normal X cannot directly enter per-org Y helpers',async()=>{
  for(const fn of [runStuckDetectionForOrg,runAutoTagsForOrg])try{await withTenant('X',()=>fn('Y'));}catch{}
  expect(state.calls.some(x=>x.args?.where?.orgId==='Y')).toBe(false);expect(state.calls.some(x=>x.ctx?.bypass)).toBe(false);
 });
 it('invalid normal wildcard context never becomes daily global inventory',async()=>{
  for(const fn of [runStuckDetectionAllOrgs,runAutoTagsAllOrgs])try{await withTenant('*',fn,{userId:'u-X',role:'member'});}catch{}
  expect(state.calls.some(x=>x.ctx?.bypass)).toBe(false);expect(state.calls.filter(x=>x.model!=='Organization.findMany')).toHaveLength(0);
 });
 it('empty normal context does not bootstrap any of the four helpers',async()=>{
  await withTenant('',()=>getEffectiveLimit('nick-X-empty','message'));await withTenant('',()=>runBackfillTick());
  for(const fn of [runStuckDetectionAllOrgs,runAutoTagsAllOrgs])try{await withTenant('',fn);}catch{}
  expect(state.calls.some(x=>x.ctx?.bypass)).toBe(false);expect(state.calls.filter(x=>x.model!=='Organization.findMany')).toHaveLength(0);
 });
});
