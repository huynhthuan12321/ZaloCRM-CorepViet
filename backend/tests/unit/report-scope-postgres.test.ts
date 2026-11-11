import {PGlite} from '@electric-sql/pglite';
import {Prisma} from '@prisma/client';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:{}}));
import {messageReportSql,contactReportSql,reportModelWhere,type ReportScope} from '../../src/modules/dashboard/report-scope.js';

// Explicit in-memory PostgreSQL engine: no URL, adapter, socket or real database.
let db:PGlite;
const scope:ReportScope={orgId:'org-a',viewerId:'leader-a',kind:'department',userIds:['leader-a','sale-a'],accountIds:['nick-a']};
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`CREATE TABLE conversations(id text,org_id text,zalo_account_id text);
 CREATE TABLE messages(id text,conversation_id text,sender_type text,replied_by_user_id text);
 CREATE TABLE contacts(id text,org_id text,assigned_user_id text,merged_into text);
 -- Canonical columns (contract 5.1) default to an ordinary, valid row.
 ALTER TABLE conversations ADD COLUMN is_virtual boolean NOT NULL DEFAULT false;
 ALTER TABLE messages ADD COLUMN is_local boolean NOT NULL DEFAULT false, ADD COLUMN is_deleted boolean NOT NULL DEFAULT false, ADD COLUMN metadata jsonb;
 INSERT INTO conversations VALUES ('a','org-a','nick-a'),('b','org-a','nick-b'),('x','org-b','nick-a');
 INSERT INTO messages VALUES ('in-a','a','contact',NULL),('out-a','a','self','sale-a'),('out-b-on-a','a','self','sale-b'),('shared-nick-b','b','self','sale-a'),('foreign','x','self','sale-a');
 INSERT INTO contacts VALUES ('main','org-a','sale-a',NULL),('shared-only','org-a','sale-b',NULL),('merged','org-a','sale-a','main'),('foreign','org-b','sale-a',NULL);
 INSERT INTO conversations VALUES ('v','org-a','nick-a',true),('n','org-a',NULL,false);
 INSERT INTO messages VALUES ('local','a','self','sale-a',true,false,NULL),('deleted','a','contact',NULL,false,true,NULL),
  ('dry-run','a','self','sale-a',false,false,'{"dryRun":true}'),('test','a','self','sale-a',false,false,'{"test":"true"}'),
  ('virtual','v','contact',NULL,false,false,NULL),('no-nick','n','contact',NULL,false,false,NULL),('ai-auto','a','self',NULL,false,false,'{"aiAuto":true}');`);
},20000);
afterAll(async()=>{await db?.close();});
describe('Scoped predicates executed by in-memory PostgreSQL',()=>{
 it('keeps customer inbound and own staff, excludes outside staff, shared nick and other org',async()=>{
  const q=Prisma.sql`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${messageReportSql(scope)} ORDER BY m.id`;
  const r=await db.query<{id:string}>(q.text,q.values);expect(r.rows.map(x=>x.id)).toEqual(['in-a','out-a']);
 });
 it('shared-only and merged customers are excluded from main KPIs',async()=>{
  const q=Prisma.sql`SELECT c.id FROM contacts c WHERE ${contactReportSql(scope,'c')}`;
  const r=await db.query<{id:string}>(q.text,q.values);expect(r.rows).toEqual([{id:'main'}]);
 });
 it('staff is credited on a shared nick without including outside staff or the nick in main totals',async()=>{
  const s={...scope,readableAccountIds:['nick-a','nick-b']};
  const q=Prisma.sql`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${messageReportSql(s,'people')} AND m.sender_type='self' ORDER BY m.id`;
  const r=await db.query<{id:string}>(q.text,q.values);expect(r.rows.map(x=>x.id)).toEqual(['out-a','shared-nick-b']);
  const main=Prisma.sql`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${messageReportSql(s)} ORDER BY m.id`;
  expect((await db.query<{id:string}>(main.text,main.values)).rows.map(x=>x.id)).toEqual(['in-a','out-a']);
 });
 it('org scope applies the canonical message filter but keeps legitimate AI/bot rows',async()=>{
  const org:ReportScope={orgId:'org-a',viewerId:'admin',kind:'org',userIds:null,accountIds:null};
  const q=Prisma.sql`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${messageReportSql(org)} ORDER BY m.id`;
  expect((await db.query<{id:string}>(q.text,q.values)).rows.map(x=>x.id)).toEqual(['ai-auto','in-a','out-a','out-b-on-a','shared-nick-b']);
 });
 it('department scopes drop local/deleted/dry-run/test/virtual rows too',async()=>{
  const main=Prisma.sql`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${messageReportSql(scope)} ORDER BY m.id`;
  expect((await db.query<{id:string}>(main.text,main.values)).rows.map(x=>x.id)).toEqual(['in-a','out-a']);
  const people=Prisma.sql`SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${messageReportSql({...scope,readableAccountIds:['nick-a','nick-b']},'people')} ORDER BY m.id`;
  expect((await db.query<{id:string}>(people.text,people.values)).rows.map(x=>x.id)).toEqual(['out-a','shared-nick-b']);
 });
 it('org scope excludes merged contacts in SQL and Prisma predicates',async()=>{
  const org:ReportScope={orgId:'org-a',viewerId:'admin',kind:'org',userIds:null,accountIds:null};
  const q=Prisma.sql`SELECT c.id FROM contacts c WHERE ${contactReportSql(org,'c')} ORDER BY c.id`;
  expect((await db.query<{id:string}>(q.text,q.values)).rows.map(x=>x.id)).toEqual(['main','shared-only']);
  expect(reportModelWhere(org,'contact')).toEqual({orgId:'org-a',mergedInto:null});
  expect(reportModelWhere(org,'contactEngagementDaily')).toEqual({orgId:'org-a',contact:{orgId:'org-a',mergedInto:null}});
  expect(reportModelWhere(org,'appointment')).toEqual({orgId:'org-a'});
 });
 it('empty scope stays empty instead of dropping the filter',async()=>{
  const q=Prisma.sql`SELECT c.id FROM contacts c WHERE ${contactReportSql({...scope,userIds:[]},'c')}`;
  expect((await db.query(q.text,q.values)).rows).toEqual([]);
 });
});
