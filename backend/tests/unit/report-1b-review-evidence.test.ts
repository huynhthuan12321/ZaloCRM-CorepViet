// F1/F2 regression oracles. Original reproduction is preserved in artifacts/reports-1b-f1-f2-2026-11-01/.
import {PGlite} from '@electric-sql/pglite';
import {Prisma} from '@prisma/client';
import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({message:{findMany:vi.fn()},user:{findMany:vi.fn()},$queryRaw:vi.fn()}));
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:mock}));
import {executeCustomReport} from '../../src/modules/analytics/reports/custom-report.js';
import {getResponseTimeAnalysis} from '../../src/modules/analytics/reports/response-time.js';
import {orgReportScope, type ReportScope} from '../../src/modules/dashboard/report-scope.js';
let db:PGlite;
const scope:ReportScope={orgId:'org-a',viewerId:'leader-a',kind:'department',userIds:['leader-a','sale-a'],accountIds:['nick-a'],readableAccountIds:['nick-a','nick-b']};
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`CREATE TABLE users(id text,full_name text);
 CREATE TABLE conversations(id text,org_id text,zalo_account_id text,is_virtual boolean NOT NULL DEFAULT false);
 CREATE TABLE messages(id text,conversation_id text,sender_type text,replied_by_user_id text,sent_at timestamptz,is_local boolean NOT NULL DEFAULT false,is_deleted boolean NOT NULL DEFAULT false,metadata jsonb);
 INSERT INTO users VALUES ('sale-a','Sale A');
 INSERT INTO conversations VALUES ('c-main','org-a','nick-a');
 INSERT INTO messages VALUES ('customer-inbound','c-main','contact',NULL,'2026-11-01T09:00:00+07:00');
 INSERT INTO conversations VALUES ('c-shared','org-a','nick-b'),('c-hidden','org-a','nick-c'),('c-foreign','org-b','nick-a');
 INSERT INTO users VALUES ('sale-b','Sale B');
 INSERT INTO messages VALUES ('shared-in','c-shared','contact',NULL,'2026-11-01T09:00:00+07:00'),('hidden-in','c-hidden','contact',NULL,'2026-11-01T09:00:00+07:00'),('foreign-in','c-foreign','contact',NULL,'2026-11-01T09:00:00+07:00'),('main-out','c-main','self','sale-a','2026-11-01T09:01:00+07:00'),('shared-out','c-shared','self','sale-a','2026-11-01T09:01:00+07:00'),('outside-out','c-shared','self','sale-b','2026-11-01T09:01:00+07:00'),('foreign-out','c-foreign','self','sale-a','2026-11-01T09:01:00+07:00');`);
},20000);
afterAll(async()=>{await db?.close();});
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T12:00:00+07:00'));
 mock.message.findMany.mockReset();mock.user.findMany.mockReset();mock.user.findMany.mockResolvedValue([]);
 mock.message.findMany.mockResolvedValue([]);
 mock.$queryRaw.mockImplementation(async(strings:TemplateStringsArray,...values:unknown[])=>{const q=Prisma.sql(strings,...values);return (await db.query(q.text,q.values)).rows;});
});
afterEach(()=>vi.useRealTimers());
describe('1B F1/F2 regression',()=>{
 it('aligns inbound unknown and named staff buckets across datasets without crediting outside staff',async()=>{
  const r=await executeCustomReport('org-a',{metrics:['messages_sent','messages_received'],groupBy:'user',dateRange:{from:'2026-11-01',to:'2026-11-01'}},scope);
  expect(r).toEqual({labels:['Sale A','Chưa xác định nhân viên'],datasets:[{metric:'messages_sent',data:[2,0]},{metric:'messages_received',data:[0,1]}]});
 });
 it('keeps empty scope empty and org totals inside the organization',async()=>{
  const config={metrics:['messages_received'],groupBy:'user' as const,dateRange:{from:'2026-11-01',to:'2026-11-01'}};
  expect((await executeCustomReport('org-a',config,{...scope,accountIds:[],readableAccountIds:[],userIds:[]})).labels).toEqual([]);
  expect((await executeCustomReport('org-a',config,orgReportScope('org-a'))).datasets[0].data).toEqual([3]);
 });
 it('keeps an unmeasured response mean null when user labels come from count metrics',async()=>{
  const r=await executeCustomReport('org-a',{metrics:['messages_received','avg_response_time'],groupBy:'user',dateRange:{from:'2026-11-01',to:'2026-11-01'}},scope);
  expect(r).toEqual({labels:['Chưa xác định nhân viên'],datasets:[{metric:'messages_received',data:[1]},{metric:'avg_response_time',data:[null]}]});
 });
 it('preserves inbound in an unknown employee bucket with the same main count as daily',async()=>{
  const config={metrics:['messages_received'],dateRange:{from:'2026-11-01',to:'2026-11-01'}};
  const daily=await executeCustomReport('org-a',{...config,groupBy:'day'},scope);
  const byUser=await executeCustomReport('org-a',{...config,groupBy:'user'},scope);
  expect(daily.datasets[0].data).toEqual([1]);
  expect(byUser.labels).toEqual(['Chưa xác định nhân viên']);expect(byUser.datasets[0].data).toEqual([1]);
 });
 it('separates shared-only waiting customers from main pending',async()=>{
  mock.message.findMany.mockResolvedValue([{id:'shared-inbound',conversationId:'c-shared',conversation:{zaloAccountId:'nick-b'},sentAt:new Date('2026-10-29T09:00:00+07:00'),senderType:'contact',sentVia:'user',repliedByUserId:null,isLocal:false,isDeleted:false,metadata:null}]);
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);
  expect(mock.message.findMany.mock.calls[0][0].where.conversation.zaloAccountId).toEqual({in:['nick-a','nick-b']});
  expect(result.byUser).toEqual([]);expect(result.overall).toBeNull();expect(result.pending).toBe(0);
  expect(result.sharedPending).toBe(1);expect(result.mainPending).toBe(0);
 });
 it('separates shared-only unknown native replies from main unattributed',async()=>{
  mock.message.findMany.mockResolvedValue([{id:'1',conversationId:'c-shared',conversation:{zaloAccountId:'nick-b'},sentAt:new Date('2026-10-29T09:00:00+07:00'),senderType:'contact',sentVia:'user',repliedByUserId:null,isLocal:false,isDeleted:false,metadata:null},{id:'2',conversationId:'c-shared',conversation:{zaloAccountId:'nick-b'},sentAt:new Date('2026-10-29T09:01:00+07:00'),senderType:'self',sentVia:'user_native',repliedByUserId:null,isLocal:false,isDeleted:false,metadata:null}]);
  const result=await getResponseTimeAnalysis('org-a','2026-10-29','2026-10-29',scope);
  expect(result.unattributed).toBe(0);expect(result.byUser).toEqual([]);expect(result.sharedUnattributed).toBe(1);expect(result.mainUnattributed).toBe(0);
 });
});
