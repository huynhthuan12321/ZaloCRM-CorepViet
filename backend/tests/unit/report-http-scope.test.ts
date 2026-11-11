import Fastify from 'fastify';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({current:null as any,db:Object.assign(Object.fromEntries(['user','department','departmentMember','zaloAccountAccess','contact','status','zaloAccount','appointment','leadRequest'].map(n=>[n,{findFirst:vi.fn(),findMany:vi.fn(),count:vi.fn(),groupBy:vi.fn()}])),{$queryRaw:vi.fn()})}));
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:m.db}));
vi.mock('../../src/modules/auth/auth-middleware.js',()=>({authMiddleware:async(req:any)=>{req.user={id:'leader-a',orgId:'org-a',role:'member'};}}));
import {reportAnalyticsRoutes} from '../../src/modules/dashboard/report-analytics-routes.js';
describe('Fastify report authorization and scoped query lifecycle',()=>{
 let app:ReturnType<typeof Fastify>;
 beforeEach(async()=>{
  vi.resetAllMocks();m.current={role:'member',permissionGroup:{archivedAt:null,grants:{engagement_score:{access:true,view_all:true}}},departmentMember:{deptRole:'leader',department:{path:'/a/'}}};
  m.db.$queryRaw.mockResolvedValue([]);
  for(const d of Object.values(m.db).filter((value:any)=>typeof value==='object')){d.findMany.mockResolvedValue([]);d.count.mockResolvedValue(0);d.groupBy.mockResolvedValue([]);}
  m.db.user.findFirst.mockImplementation(async()=>m.current);m.db.department.findMany.mockResolvedValue([{id:'dept-a'}]);m.db.departmentMember.findMany.mockResolvedValue([{userId:'sale-a'}]);
  app=Fastify();await app.register(reportAnalyticsRoutes);await app.ready();
 });
 afterEach(async()=>{await app.close();});
 it('returns an authorized overview and applies scoped contact queries',async()=>{const r=await app.inject({url:'/api/v1/reports/overview?from=2026-10-01&to=2026-10-29'});expect(r.statusCode).toBe(200);expect(m.db.contact.count.mock.calls[0][0].where.AND).toContainEqual({orgId:'org-a',assignedUserId:{in:['leader-a','sale-a']},mergedInto:null});});
 it('stops the handler with403 after access is revoked',async()=>{m.current.permissionGroup.grants.engagement_score.access=false;const r=await app.inject({url:'/api/v1/reports/overview'});expect(r.statusCode).toBe(403);expect(m.db.contact.count).not.toHaveBeenCalled();});
 it('rejects invalid date ranges before report aggregate queries',async()=>{const r=await app.inject({url:'/api/v1/reports/overview?from=2026-02-30&to=2026-03-01'});expect(r.statusCode).toBe(400);expect(r.json()).toMatchObject({code:'invalid_report_date_range'});expect(m.db.contact.count).not.toHaveBeenCalled();expect(m.db.$queryRaw).not.toHaveBeenCalled();});
 it('keeps system audit admin-only even with report.view_all',async()=>{const r=await app.inject({url:'/api/v1/reports/audit'});expect(r.statusCode).toBe(403);expect(m.db.contact.count).not.toHaveBeenCalled();});
});
