import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:{user:{findFirst:vi.fn()},department:{findMany:vi.fn()},departmentMember:{findMany:vi.fn()},zaloAccount:{findMany:vi.fn()},zaloAccountAccess:{findMany:vi.fn()},savedReport:{findFirst:vi.fn()}},team:vi.fn()}));
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:m.db}));
vi.mock('../../src/modules/auth/auth-middleware.js',()=>({authMiddleware:vi.fn()}));
vi.mock('../../src/modules/rbac/owner-scope.js',()=>({getOwnerScope:vi.fn(),applyOwnerScope:vi.fn()}));
vi.mock('../../src/modules/analytics/analytics-service.js',()=>({getTeamPerformance:m.team,getConversionFunnel:vi.fn(),getResponseTimeAnalysis:vi.fn(),executeCustomReport:vi.fn()}));
import {savedReportRoutes} from '../../src/modules/analytics/saved-report-routes.js';
describe('Saved report execution uses the current viewer scope',()=>{
 let run:any,reply:any;
 beforeEach(async()=>{
  vi.resetAllMocks();m.db.user.findFirst.mockResolvedValue({role:'member',permissionGroup:{archivedAt:null,grants:{engagement_score:{access:true}}},departmentMember:{deptRole:'leader',department:{path:'/a/'}}});
  m.db.department.findMany.mockResolvedValue([{id:'a'}]);m.db.departmentMember.findMany.mockResolvedValue([{userId:'sale-a'}]);m.db.zaloAccount.findMany.mockResolvedValue([{id:'nick-a'}]);m.db.zaloAccountAccess.findMany.mockResolvedValue([]);
  reply={status:vi.fn().mockReturnThis(),send:vi.fn()};
  await savedReportRoutes({addHook:vi.fn(),get:vi.fn(),put:vi.fn(),delete:vi.fn(),post:(path:string,handler:any)=>{if(path.endsWith('/:id/run'))run=handler;}} as any);
 });
 const req=()=>({user:{id:'leader-a',orgId:'org-a'},params:{id:'report-a'},url:'/api/v1/saved-reports/report-a/run'});
 it('requires config ownership/subtree visibility, not only report id+org',async()=>{m.db.savedReport.findFirst.mockResolvedValue(null);await run(req(),reply);expect(m.db.savedReport.findFirst.mock.calls[0][0].where).toEqual({id:'report-a',orgId:'org-a',createdBy:{in:['leader-a','sale-a']}});expect(reply.status).toHaveBeenCalledWith(404);expect(m.team).not.toHaveBeenCalled();});
 it('passes the viewer scope into the aggregate service',async()=>{m.db.savedReport.findFirst.mockResolvedValue({type:'team_performance',config:{dateRange:{from:'2026-10-01',to:'2026-10-29'}}});m.team.mockResolvedValue({users:[]});await run(req(),reply);expect(m.team.mock.calls[0][3]).toMatchObject({kind:'department',userIds:['leader-a','sale-a'],orgId:'org-a'});});
 it('revoked report access stops execution before config lookup',async()=>{m.db.user.findFirst.mockResolvedValue({role:'member',permissionGroup:{archivedAt:null,grants:{}},departmentMember:{deptRole:'leader',department:{path:'/a/'}}});await run(req(),reply);expect(reply.status).toHaveBeenCalledWith(403);expect(m.db.savedReport.findFirst).not.toHaveBeenCalled();expect(m.team).not.toHaveBeenCalled();});
});
