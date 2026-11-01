import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({message:{findMany:vi.fn()},user:{findMany:vi.fn()}}));
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:db}));
import {getResponseTimeAnalysis} from '../../src/modules/analytics/reports/response-time.js';
import type {ReportScope} from '../../src/modules/dashboard/report-scope.js';
const scope:ReportScope={orgId:'org-a',viewerId:'leader',kind:'department',userIds:['sale-a'],accountIds:['nick-a']};
const row=(id:string,time:string,type='contact',actor:string|null=null,account='nick-a',conversationId='c')=>({id,conversationId,conversation:{zaloAccountId:account},sentAt:new Date(`2026-10-29T${time}:00+07:00`),senderType:type,sentVia:'user',repliedByUserId:actor,isLocal:false,isDeleted:false,metadata:null});
describe('Response-time service uses the approved last-inbound rule',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T12:00:00+07:00'));db.message.findMany.mockReset();db.user.findMany.mockReset();db.user.findMany.mockResolvedValue([{id:'sale-a',fullName:'Sale A'}]);});
 afterEach(()=>vi.useRealTimers());
 it('returns60seconds via the actual report service and restricts query to main accounts',async()=>{
  db.message.findMany.mockResolvedValue([row('1','09:00'),row('2','09:04'),row('3','09:05','self','sale-a')]);
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);
  expect(result.overall).toBe(60);expect(result.daily).toEqual([{date:'2026-10-29',avgSeconds:60,count:1,totalSeconds:60}]);
  expect(result.responseBuckets).toEqual({under5Min:1,from5To15Min:0,from15To30Min:0,from30To60Min:0,over60Min:0});
  expect(db.message.findMany.mock.calls[0][0].where.conversation).toEqual({orgId:'org-a',isVirtual:false,threadType:'user',zaloAccountId:{in:['nick-a']}});
 });
 it('an outside actor closes the turn but is not credited into the department',async()=>{
  db.message.findMany.mockResolvedValue([row('1','09:00'),row('2','09:02','self','sale-b'),row('3','09:04','self','sale-a')]);
  const r=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);expect(r.overall).toBeNull();expect(r.byUser).toEqual([]);expect(db.user.findMany).not.toHaveBeenCalled();
 });
 it('does not present a truncated event sample as a full response mean',async()=>{
  db.message.findMany.mockResolvedValue(new Array(50001).fill(row('1','09:00')));
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);
  expect(result).toMatchObject({overall:null,availability:'unavailable',reason:'response_event_limit'});
  expect(result.mainPending).toBeUndefined();expect(result.sharedPending).toBeUndefined();
 });
 it('zero-second response stays numeric0 rather than being converted to missing',async()=>{
  db.message.findMany.mockResolvedValue([row('1','09:00'),row('2','09:00','self','sale-a')]);
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);
  expect(result.overall).toBe(0);
  expect(result.responseBuckets?.under5Min).toBe(1);
 });
 it('excludes test messages from response-time pairs',async()=>{
  db.message.findMany.mockResolvedValue([
   row('1','09:00'),
   {...row('2','09:01','self','sale-a'),metadata:{test:'true'}},
  ]);
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);
  expect(result.overall).toBeNull();
  expect(result.responseBuckets).toBeNull();
 });
 it('counts overlapping main/readable nicks once and separates both operational counters',async()=>{
  db.message.findMany.mockResolvedValue([
   row('main-wait','09:00','contact',null,'nick-a','main-wait'),
   row('shared-wait','09:00','contact',null,'nick-b','shared-wait'),
   row('main-in','09:00','contact',null,'nick-a','main-unknown'),row('main-reply','09:01','self',null,'nick-a','main-unknown'),
   row('shared-in','09:00','contact',null,'nick-b','shared-unknown'),row('shared-reply','09:01','self',null,'nick-b','shared-unknown'),
  ]);
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',{...scope,readableAccountIds:['nick-a','nick-b','nick-a']});
  expect(result).toMatchObject({pending:1,unattributed:1,mainPending:1,sharedPending:1,mainUnattributed:1,sharedUnattributed:1,overall:null});
 });
 it('still credits own staff on shared nicks and does not reopen an outside staff reply',async()=>{
  db.message.findMany.mockResolvedValue([
   row('own-in','09:00','contact',null,'nick-b','own'),row('own-reply','09:01','self','sale-a','nick-b','own'),
   row('outside-in','09:00','contact',null,'nick-b','outside'),row('outside-reply','09:02','self','sale-b','nick-b','outside'),row('later','09:04','self','sale-a','nick-b','outside'),
  ]);
  const r=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',{...scope,readableAccountIds:['nick-a','nick-b']});
  expect(r).toMatchObject({overall:60,byUser:[{userId:'sale-a',fullName:'Sale A',avgSeconds:60,count:1}],mainPending:0,sharedPending:0});
 });
 it('uses org-wide counters as main for admins without creating a shared section',async()=>{
  db.message.findMany.mockResolvedValue([row('a','09:00','contact',null,'nick-a','a'),row('b','09:00','contact',null,'nick-b','b')]);
  const r=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',{orgId:'org-a',viewerId:'admin',kind:'org',userIds:null,accountIds:null});
  expect(db.message.findMany.mock.calls[0][0].where.conversation).toMatchObject({orgId:'org-a',zaloAccountId:{not:null}});
  expect(r).toMatchObject({pending:2,mainPending:2,sharedPending:0,mainUnattributed:0,sharedUnattributed:0});
 });
 it('does not classify an ungranted nick as shared or main, including after a grant is revoked',async()=>{
  db.message.findMany.mockResolvedValue([row('hidden','09:00','contact',null,'nick-b')]);
  const r=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',{...scope,readableAccountIds:['nick-a']});
  expect(db.message.findMany.mock.calls[0][0].where.conversation.zaloAccountId).toEqual({in:['nick-a']});
  expect(r).toMatchObject({pending:0,mainPending:0,sharedPending:0,sharedUnattributed:0});
 });
});
