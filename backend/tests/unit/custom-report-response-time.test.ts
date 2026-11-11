import {beforeEach,describe,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({response:vi.fn(),queryRaw:vi.fn()}));
vi.mock('../../src/shared/database/prisma-client.js',()=>({prisma:{$queryRaw:h.queryRaw}}));
vi.mock('../../src/modules/analytics/reports/response-time.js',()=>({getResponseTimeAnalysis:h.response}));
import {executeCustomReport} from '../../src/modules/analytics/reports/custom-report.js';
import {orgReportScope} from '../../src/modules/dashboard/report-scope.js';
describe('Custom report response-time aggregation',()=>{
 beforeEach(()=>{h.response.mockReset();h.queryRaw.mockReset();});
 it('weights weekly means by actual turns and preserves the SQL week label',async()=>{
  h.response.mockResolvedValue({availability:'available',byUser:[],daily:[{date:'2026-10-26',avgSeconds:60,count:1,totalSeconds:60},{date:'2026-10-27',avgSeconds:600,count:9,totalSeconds:5400}]});
  const r=await executeCustomReport('org-a',{metrics:['avg_response_time'],groupBy:'week',dateRange:{from:'2026-10-01',to:'2026-10-31'}},orgReportScope('org-a'));
  expect(r).toEqual({labels:['2026-W44'],datasets:[{metric:'avg_response_time',data:[546]}]});
 });
 it('keeps the existing SQL calendar-year/ISO-week convention at a year boundary',async()=>{
  h.response.mockResolvedValue({availability:'available',byUser:[],daily:[{date:'2026-01-01',avgSeconds:60,count:1,totalSeconds:60}]});
  const r=await executeCustomReport('org-a',{metrics:['avg_response_time'],groupBy:'week',dateRange:{from:'2025-12-29',to:'2026-01-04'}},orgReportScope('org-a'));
  expect(r.labels).toEqual(['2025-W01']);
 });
 it('does not turn an unavailable truncated result into numeric0',async()=>{
  h.response.mockResolvedValue({availability:'unavailable',reason:'response_event_limit',daily:[],byUser:[],overall:null});
  await expect(executeCustomReport('org-a',{metrics:['avg_response_time'],groupBy:'day',dateRange:{from:'2026-10-01',to:'2026-10-31'}},orgReportScope('org-a'))).rejects.toThrow('response_event_limit');
 });
 it('marks conversion counts unavailable instead of treating updatedAt as a conversion event',async()=>{
  const result=await executeCustomReport('org-a',{metrics:['contacts_converted'],groupBy:'day',dateRange:{from:'2026-10-01',to:'2026-10-01'}},orgReportScope('org-a'));
  expect(result).toEqual({labels:[],datasets:[{
   metric:'contacts_converted',data:[],availability:'unavailable',reason:'conversion_event_history_unavailable',
  }]});
  expect(h.queryRaw).not.toHaveBeenCalled();
 });
 it('keeps unavailable conversion buckets aligned with measured datasets',async()=>{
  h.queryRaw.mockResolvedValue([{label:'2026-10-01',cnt:2n}]);
  const result=await executeCustomReport('org-a',{metrics:['contacts_converted','messages_sent'],groupBy:'day',dateRange:{from:'2026-10-01',to:'2026-10-01'}},orgReportScope('org-a'));
  expect(result).toEqual({labels:['2026-10-01'],datasets:[
   {metric:'contacts_converted',data:[null],availability:'unavailable',reason:'conversion_event_history_unavailable'},
   {metric:'messages_sent',data:[2]},
  ]});
 });
});
