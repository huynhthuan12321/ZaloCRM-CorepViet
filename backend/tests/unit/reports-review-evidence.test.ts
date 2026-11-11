// Characterization evidence for the 2026-10-29 report review.
// The scope case is now a regression; remaining REPRO cases preserve unresolved date/KPI evidence.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  queryRaw: vi.fn(),
  responseTime: vi.fn(),
  prisma: Object.fromEntries(['status','contact','contactEngagementDaily','zaloAccount','appointment','leadRequest','leadPoolDistribution','user','department','departmentMember','zaloAccountAccess','activityLog','automationEventLog','zaloAccountStatusLog'].map(name=>[name,{
    findFirst:vi.fn(),findMany:vi.fn(),count:vi.fn(),groupBy:vi.fn(),aggregate:vi.fn(),
  }])),
}));
Object.assign(mocks.prisma, { $queryRaw: mocks.queryRaw });
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:mocks.prisma}));
vi.mock('../../src/modules/contacts/contact-scope.js',()=>({getContactScope:mocks.scope}));
vi.mock('../../src/modules/auth/auth-middleware.js',()=>({authMiddleware:vi.fn()}));
vi.mock('../../src/shared/utils/logger.js',()=>({logger:{error:vi.fn()}}));
vi.mock('../../src/modules/analytics/reports/response-time.js',()=>({getResponseTimeAnalysis:mocks.responseTime}));
import { reportAnalyticsRoutes } from '../../src/modules/dashboard/report-analytics-routes.js';

describe('Report review: isolated current-behavior evidence (no database)',()=>{
  let handlers:Record<string,any>;
  let reply:any;
  beforeEach(async()=>{
    vi.resetAllMocks();
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T03:00:00Z'));
    mocks.queryRaw.mockResolvedValue([]);
    mocks.responseTime.mockResolvedValue({
      availability:'available',overall:null,byUser:[],responseBuckets:null,
    });
    for(const model of Object.values(mocks.prisma).filter((value:any)=>typeof value==='object')){
      model.findMany.mockResolvedValue([]);model.count.mockResolvedValue(0);model.groupBy.mockResolvedValue([]);
      model.aggregate.mockResolvedValue({_sum:{inboundMsgCount:0,outboundMsgCount:0,reactionCount:0,voiceMsgCount:0,callCount:0}});
    }
    mocks.scope.mockResolvedValue({isOrgAdmin:false,visibleUserIds:new Set(['leader-a','sale-a']),accessibleContactIds:['contact-a']});
    mocks.prisma.user.findFirst.mockResolvedValue({role:'admin'});
    handlers={};reply={status:vi.fn().mockReturnThis(),send:vi.fn()};
    await reportAnalyticsRoutes({addHook:vi.fn(),get:(path:string,handler:any)=>handlers[path]=handler} as any);
  });
  afterEach(()=>vi.useRealTimers());
  const request=(role='member')=>({user:{id:'leader-a',orgId:'org-a',role},query:{from:'2026-10-01',to:'2026-10-29'}});

  it('REGRESSION: team leader cannot receive another department user from the same org',async()=>{
    mocks.prisma.user.findFirst.mockResolvedValue({role:'member',permissionGroup:{archivedAt:null,grants:{engagement_score:{access:true,view_all:true}}},departmentMember:{deptRole:'leader',department:{path:'/a/'}}});
    mocks.prisma.department.findMany.mockResolvedValue([{id:'dept-a'}]);
    mocks.prisma.departmentMember.findMany.mockResolvedValue([{userId:'sale-a'}]);
    mocks.prisma.user.findMany.mockImplementation(async({where}:any)=>{
      const rows=[{id:'sale-a',fullName:'Sale A'},{id:'sale-b',fullName:'Sale B — outside permitted subtree'}];
      const scoped=where.AND.find((part:any)=>part.id?.in)?.id.in;
      return rows.filter(u=>!scoped || scoped.includes(u.id));
    });
    const result=await handlers['/api/v1/reports/sales-performance'](request(),reply);
    expect(result.sales.map((s:any)=>s.userId)).toEqual(['sale-a']);
    expect(mocks.prisma.user.findMany.mock.calls[0][0].where.AND).toContainEqual({orgId:'org-a',id:{in:['leader-a','sale-a']}});
  });
  it('ordinary member is blocked when visible scope contains only self',async()=>{
    mocks.prisma.user.findFirst.mockResolvedValue({role:'member',permissionGroup:{archivedAt:null,grants:{engagement_score:{access:true}}},departmentMember:{deptRole:'member',department:{path:'/a/'}}});
    await handlers['/api/v1/reports/overview'](request(),reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mocks.prisma.contact.count).not.toHaveBeenCalled();
  });
  it('REGRESSION: message series and today totals use measured, filtered data',async()=>{
    mocks.prisma.status.findMany.mockResolvedValue([{id:'status-won',name:'Chốt',isTerminal:true}]);
    mocks.prisma.contact.count.mockResolvedValue(12);
    mocks.queryRaw.mockImplementation((strings:TemplateStringsArray)=>{
      const sql=strings.join('');
      if(sql.includes('GROUP BY m.replied_by_user_id'))return [{userId:'sale-a',sent:2n}];
      return [
        { date: '2026-10-01', sent: 2n, received: 1n, automation: 0n },
        { date: '2026-10-29', sent: 3n, received: 0n, automation: 1n },
      ];
    });
    const result=await handlers['/api/v1/reports/overview'](request('admin'),reply);
    expect(result.kpis.totalContacts).toBe(12);
    expect(result.kpis.msgToday).toBe(3);expect(result.kpis.msgByBot).toBe(1);
    expect(result.kpis.newContactsDelta).toBe(0);
    expect(result.kpis.friendAcceptRate).toBeNull();
    expect(result.availability.friendAcceptRate).toEqual({status:'unavailable',reason:'friend_acceptance_source_unavailable'});
    expect(result.kpis.closeRate).toBeNull();
    expect(result.availability.wonStatus).toEqual({status:'unavailable',reason:'won_status_mapping_unavailable'});
    expect(result.msgSeries).toHaveLength(29);
    expect(result.msgSeries[0]).toEqual({ date: '2026-10-01', sent: 2, received: 1 });
    expect(result.msgSeries[1]).toEqual({ date: '2026-10-02', sent: 0, received: 0 });
    expect(result.msgSeries.at(-1)).toEqual({ date: '2026-10-29', sent: 3, received: 0 });
  });
  it('groups Sale metrics in batches and does not invent response-time or won status data',async()=>{
    mocks.prisma.status.findMany.mockResolvedValue([{id:'status-won',name:'Chốt',isTerminal:true}]);
    mocks.prisma.user.findMany.mockResolvedValue([
      {id:'sale-a',fullName:'Sale A',departmentMember:{department:{name:'Team A'}}},
      {id:'sale-b',fullName:'Sale B',departmentMember:{department:{name:'Team A'}}},
    ]);
    mocks.prisma.contact.groupBy
      .mockResolvedValueOnce([{assignedUserId:'sale-a',_count:2},{assignedUserId:'sale-b',_count:1}])
      .mockResolvedValueOnce([{assignedUserId:'sale-a',_count:1}]);
    mocks.prisma.appointment.groupBy.mockResolvedValue([
      {assignedUserId:'sale-a',status:'completed',_count:1},
      {assignedUserId:'sale-b',status:'no_show',_count:1},
    ]);
    mocks.prisma.leadRequest.groupBy.mockResolvedValue([{requestedByUserId:'sale-a',_count:3}]);
    mocks.queryRaw.mockResolvedValue([
      {userId:'sale-a',sent:5n},
      {userId:null,sent:2n},
    ]);
    mocks.responseTime.mockResolvedValue({
      availability:'available',overall:120,byUser:[{userId:'sale-a',fullName:'Sale A',avgSeconds:90}],
      responseBuckets:{under5Min:1,from5To15Min:0,from15To30Min:0,from30To60Min:0,over60Min:0},
    });
    const result=await handlers['/api/v1/reports/sales-performance'](request('admin'),reply);
    expect(result.sales).toMatchObject([
      {userId:'sale-a',contacts:2,sent:5,avgResponseMin:1.5,apptDone:1,closed:null,leadPoolUsed:3,score:null},
      {userId:'sale-b',contacts:1,sent:0,avgResponseMin:null,apptNoShow:1,closed:null,score:null},
    ]);
    expect(result).toMatchObject({
      sentUnattributed:2,
      kpis:{avgSentPerSale:2.5,avgResponseMin:2,avgCloseRate:null},
      responseBuckets:[
        {label:'<5p',count:1},
        {label:'5-15p',count:0},
        {label:'15-30p',count:0},
        {label:'30-60p',count:0},
        {label:'>1h',count:0},
      ],
      byDept:[{deptName:'Team A',contacts:3,sent:5,closed:null,closeRate:null}],
    });
    expect(result.availability.closed).toEqual({status:'unavailable',reason:'won_status_mapping_unavailable'});
    expect(result.availability.avgCloseRate).toEqual({status:'unavailable',reason:'won_status_mapping_unavailable'});
    expect(mocks.prisma.contact.count).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.count).not.toHaveBeenCalled();
    expect(mocks.prisma.leadRequest.count).not.toHaveBeenCalled();
    expect(mocks.prisma.status.findMany).not.toHaveBeenCalled();
  });
  it('does not infer pipeline wins from a status label',async()=>{
    mocks.prisma.status.findMany.mockResolvedValue([{id:'status-won',name:'Chốt',isTerminal:true}]);
    mocks.prisma.contact.groupBy.mockResolvedValue([
      {statusId:'status-won',source:'web',_count:2},
    ]);
    const result=await handlers['/api/v1/reports/pipeline'](request('admin'),reply);
    expect(result.kpis.closeRate).toBeNull();
    expect(result.bySource).toMatchObject([{source:'web',leads:2,closed:null,closeRate:null}]);
    expect(result.availability.closeRate).toEqual({status:'unavailable',reason:'won_status_mapping_unavailable'});
    expect(result.availability.closedBySource).toEqual({status:'unavailable',reason:'won_status_mapping_unavailable'});
    expect(result.availability.dropPct).toEqual({status:'unavailable',reason:'status_change_history_unavailable'});
    expect(result.kpis.returnRate).toBeNull();
    expect(result.availability.returnRate).toEqual({status:'unavailable',reason:'lead_return_denominator_unavailable'});
  });
  it('batches Lead Pool user counts instead of querying once per user',async()=>{
    mocks.prisma.user.findMany.mockResolvedValue([{id:'sale-a',fullName:'Sale A'}]);
    mocks.prisma.leadPoolDistribution.groupBy.mockResolvedValue([{assignedToUserId:'sale-a',_count:4}]);
    mocks.prisma.leadRequest.groupBy
      .mockResolvedValueOnce([
        {requestedByUserId:'sale-a',releaseReason:null,_count:3},
        {requestedByUserId:'sale-a',releaseReason:'auto_return',_count:2},
      ])
      .mockResolvedValueOnce([{requestedByUserId:'sale-a',_count:1}]);
    const result=await handlers['/api/v1/reports/lead-pool'](request('admin'),reply);
    expect(result.byUser).toEqual([{userId:'sale-a',name:'Sale A',received:4,holding:3,returned:2,overdue:1}]);
    expect(mocks.prisma.leadRequest.count).toHaveBeenCalledTimes(1);
    expect(result.kpis.returnRate).toBeNull();
    expect(result.availability.returnRate).toEqual({status:'unavailable',reason:'lead_return_denominator_unavailable'});
  });
  it('does not report Engagement zero when daily aggregate coverage cannot be verified',async()=>{
    mocks.prisma.contactEngagementDaily.count.mockResolvedValue(0);
    mocks.prisma.contactEngagementDaily.aggregate.mockResolvedValue({
      _sum:{inboundMsgCount:4,outboundMsgCount:6,reactionCount:0,voiceMsgCount:0,callCount:0},
    });
    const result=await handlers['/api/v1/reports/engagement'](request('admin'),reply);
    expect(result.kpis.customerInitiatedPct).toBeNull();
    expect(result.availability.customerInitiatedPct).toEqual({
      status:'unavailable',reason:'engagement_daily_denominator_zero',
    });
    expect(result.kpis.avgInteractionsPerDay).toBeNull();
    expect(result.availability.avgInteractionsPerDay).toEqual({
      status:'unavailable',reason:'engagement_daily_coverage_unverified',
    });
    expect(result.interactionTypes).toMatchObject({inbound:4,outbound:6});
  });
  it('keeps a measured zero customer-initiated rate when the denominator exists',async()=>{
    mocks.prisma.contactEngagementDaily.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    const result=await handlers['/api/v1/reports/engagement'](request('admin'),reply);
    expect(result.kpis.customerInitiatedPct).toBe(0);
    expect(result.availability.customerInitiatedPct).toEqual({status:'available'});
    expect(result.kpis.avgInteractionsPerDay).toBeNull();
  });
  it('keeps activeSalesToday independent of the selected historical period',async()=>{
    mocks.prisma.user.findMany.mockResolvedValue([{id:'sale-a',fullName:'Sale A'}]);
    mocks.prisma.activityLog.groupBy.mockResolvedValue([{userId:'sale-a'}]);
    const result=await handlers['/api/v1/reports/crm-usage'](request('admin'),reply);
    expect(result.kpis.activeSalesToday).toBe(1);
    expect(result.kpis.totalActions).toBe(0);
    expect(mocks.prisma.activityLog.groupBy).toHaveBeenCalledWith({
      by:['userId'],where:{AND:[{orgId:'org-a',actorType:'user',userId:{in:['sale-a']},createdAt:{gte:new Date('2026-10-28T17:00:00Z'),lt:new Date('2026-10-29T03:00:00Z')}},{orgId:'org-a'}]},
    });
  });
  it('caps audit snapshots and feed at asOf instead of counting future events',async()=>{
    const result=await handlers['/api/v1/reports/audit'](request('admin'),reply);
    expect(result.systemHealth.errorRate24h).toBeNull();
    for(const model of ['activityLog','automationEventLog','zaloAccountStatusLog']){
      for(const [args] of mocks.prisma[model].count.mock.calls){
        const window=args.where.AND[0].createdAt??args.where.AND[0].startedAt;
        expect(window.lt).toEqual(new Date('2026-10-29T03:00:00Z'));
      }
    }
    expect(mocks.prisma.activityLog.findMany.mock.calls[0][0].where.AND[0].createdAt.lt).toEqual(new Date('2026-10-29T03:00:00Z'));
  });
  it('keeps CRM outcome efficiency unavailable without a won-status mapping',async()=>{
    mocks.prisma.activityLog.findMany.mockResolvedValue([]);
    const result=await handlers['/api/v1/reports/crm-usage'](request('admin'),reply);
    expect(result.availability.outcomes).toEqual({status:'unavailable',reason:'won_status_mapping_unavailable'});
    expect(result.bySale).toEqual([]);
  });
  it('REGRESSION: appointment date field excludes future dates from the Vietnam today snapshot',async()=>{
    mocks.prisma.appointment.count.mockImplementation(async({where}:any)=>{
      where=Object.assign({},...where.AND);
      if(where.status)return 0;
      const future=new Date('2026-11-10T02:00:00Z');
      return future>=where.appointmentDate.gte && (!where.appointmentDate.lt || future<where.appointmentDate.lt)?1:0;
    });
    const result=await handlers['/api/v1/reports/overview'](request('admin'),reply);
    expect(result.kpis.apptToday).toBe(0);
    const bounds=mocks.prisma.appointment.count.mock.calls[0][0].where.AND[0].appointmentDate;
    expect(bounds.gte.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(bounds.lt.toISOString()).toBe('2026-10-30T00:00:00.000Z');
  });
  it('REGRESSION: timestamp filters include the full Vietnam day and exclude the next day',async()=>{
    await handlers['/api/v1/reports/overview'](request('admin'),reply);
    const window=mocks.prisma.contact.count.mock.calls[1][0].where.AND[0].createdAt;
    expect(window.gte.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(new Date('2026-10-01T01:00:00+07:00')>=window.gte).toBe(true);
    expect(new Date('2026-10-30T00:00:00+07:00')<window.lt).toBe(false);
    expect(window.lt.toISOString()).toBe('2026-10-29T17:00:00.000Z');
  });
});
