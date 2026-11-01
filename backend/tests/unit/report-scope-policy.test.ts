import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({user:{findFirst:vi.fn()},department:{findMany:vi.fn()},departmentMember:{findMany:vi.fn()},zaloAccount:{findMany:vi.fn()},zaloAccountAccess:{findMany:vi.fn()}}));
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:db}));
import {resolveReportScope,reportModelWhere,messageReportSql,contactReportSql,gateReportAccess} from '../../src/modules/dashboard/report-scope.js';
const leader=()=>({role:'member',permissionGroup:{archivedAt:null,grants:{engagement_score:{access:true,view_all:true}}},departmentMember:{deptRole:'leader',department:{path:'/a/'}}});
describe('Report policy: main KPIs exclude explicitly shared data',()=>{
 beforeEach(()=>{vi.resetAllMocks();db.user.findFirst.mockResolvedValue(leader());db.department.findMany.mockResolvedValue([{id:'a'}]);db.departmentMember.findMany.mockResolvedValue([{userId:'sale-a'}]);db.zaloAccount.findMany.mockResolvedValue([{id:'nick-a'}]);db.zaloAccountAccess.findMany.mockResolvedValue([]);});
 it('department scope does not use report view_all as an org bypass',async()=>{
  const s=(await resolveReportScope({id:'leader-a',orgId:'org-a'}))!;
  expect(s.kind).toBe('department');expect(s.userIds).toEqual(['leader-a','sale-a']);
  expect(db.zaloAccount.findMany.mock.calls[0][0].where.ownerUserId.in).toEqual(['leader-a','sale-a']);
  expect(s.accountIds).toEqual(['nick-a']);
 });
 it('singleton deputy retains access',async()=>{const l=leader();l.departmentMember.deptRole='deputy';db.user.findFirst.mockResolvedValue(l);db.departmentMember.findMany.mockResolvedValue([]);expect((await resolveReportScope({id:'solo',orgId:'org-a'}))?.userIds).toEqual(['solo']);});
 it('explicit nick grants affect readable accounts, never main fleet or staff scope',async()=>{
  db.zaloAccountAccess.findMany.mockResolvedValue([{zaloAccountId:'nick-b'}]);
  const s=(await resolveReportScope({id:'leader-a',orgId:'org-a'}))!;
  expect(s.accountIds).toEqual(['nick-a']);expect(s.readableAccountIds).toEqual(['nick-a','nick-b']);
  expect(s.userIds).toEqual(['leader-a','sale-a']);
  expect(messageReportSql(s,'people').values).toEqual(['org-a',['nick-a','nick-b'],['leader-a','sale-a']]);
 });
 it('revoked access fails closed on the next request',async()=>{expect(await resolveReportScope({id:'leader-a',orgId:'org-a'})).not.toBeNull();const l=leader();l.permissionGroup.grants.engagement_score.access=false;db.user.findFirst.mockResolvedValue(l);expect(await resolveReportScope({id:'leader-a',orgId:'org-a'})).toBeNull();});
 it('archived permission groups do not authorize',async()=>{db.user.findFirst.mockResolvedValue({...leader(),permissionGroup:{archivedAt:new Date(),grants:{engagement_score:{access:true}}}});expect(await resolveReportScope({id:'leader-a',orgId:'org-a'})).toBeNull();});
 it('missing/cross-org identity cannot be authorized',async()=>{db.user.findFirst.mockResolvedValue(null);expect(await resolveReportScope({id:'foreign',orgId:'org-b'})).toBeNull();expect(db.user.findFirst.mock.calls[0][0].where).toEqual({id:'foreign',orgId:'org-b',isActive:true});});
 it('explicitly shared customer does not enter main contact KPIs',async()=>{const s=(await resolveReportScope({id:'leader-a',orgId:'org-a'}))!;expect(reportModelWhere(s,'contact')).toEqual({orgId:'org-a',assignedUserId:{in:['leader-a','sale-a']},mergedInto:null});expect(contactReportSql(s).values).toContain('org-a');});
 it('message SQL keeps both nick and outbound author bounds, with inbound handled separately',async()=>{const s=(await resolveReportScope({id:'leader-a',orgId:'org-a'}))!;const sql=messageReportSql(s);expect(sql.text).toContain('c.zalo_account_id = ANY');expect(sql.text).toContain("m.sender_type = 'contact' OR m.replied_by_user_id = ANY");expect(sql.values).toEqual(['org-a',['nick-a'],['leader-a','sale-a']]);});
 it('leader is denied system audit even with ordinary report access',async()=>{const reply={status:vi.fn().mockReturnThis(),send:vi.fn()};expect(await gateReportAccess({user:{id:'leader-a',orgId:'org-a'},url:'/api/v1/reports/audit'} as any,reply as any)).toBe(false);expect(reply.status).toHaveBeenCalledWith(403);});
 it('admin-only authorization is an explicit route requirement, not dependent on URL spelling',async()=>{const reply={status:vi.fn().mockReturnThis(),send:vi.fn()};expect(await gateReportAccess({user:{id:'leader-a',orgId:'org-a'},url:'/an-alias'} as any,reply as any,true)).toBe(false);expect(reply.status).toHaveBeenCalledWith(403);});
 it('admin scope remains confined to the authenticated org',async()=>{db.user.findFirst.mockResolvedValue({role:'admin'});expect(await resolveReportScope({id:'admin',orgId:'org-a'})).toMatchObject({kind:'org',orgId:'org-a',userIds:null});});
});
