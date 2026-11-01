import { prisma } from '../../../shared/database/prisma-client.js';
import { reportModelWhere, type ReportScope } from '../../dashboard/report-scope.js';
import { pairCustomerResponses } from '../../dashboard/response-turns.js';
import { resolveReportPeriod } from '../../dashboard/report-period.js';

export interface DailyResponseTime { date:string; avgSeconds:number; count?:number; totalSeconds?:number; }
export interface UserResponseTime { userId:string; fullName:string; avgSeconds:number; count?:number; }
export interface ResponseTimeResult {
  daily:DailyResponseTime[];overall:number|null;byUser:UserResponseTime[];
  responseBuckets:{under5Min:number;from5To15Min:number;from15To30Min:number;from30To60Min:number;over60Min:number}|null;
  availability?:'available'|'unavailable';reason?:string;pending?:number;unattributed?:number;asOf?:string;
  /** Operational counters by nick scope; legacy aliases above refer to main only. */
  mainPending?:number;sharedPending?:number;mainUnattributed?:number;sharedUnattributed?:number;
}
const LIMIT=50000;
/** Last customer message -> first human response; no dependency on stale daily averages. */
export async function getResponseTimeAnalysis(orgId:string,from:string,to:string,scope:ReportScope):Promise<ResponseTimeResult>{
  const asOf=new Date();
  const { start, end } = resolveReportPeriod({ from, to }, { defaultDays: 1 });
  const rows=await prisma.message.findMany({
    where:{sentAt:{gte:start,lte:asOf},isLocal:false,isDeleted:false,conversation:{orgId,isVirtual:false,threadType:'user',zaloAccountId:scope.kind==='org'?undefined:{in:scope.readableAccountIds??scope.accountIds??[]}}},
    select:{id:true,conversationId:true,conversation:{select:{zaloAccountId:true}},sentAt:true,senderType:true,sentVia:true,repliedByUserId:true,isLocal:true,isDeleted:true,metadata:true},
    orderBy:[{sentAt:'asc'},{id:'asc'}],take:LIMIT+1,
  });
  if(rows.length>LIMIT)return {daily:[],overall:null,byUser:[],responseBuckets:null,availability:'unavailable',reason:'response_event_limit',asOf:asOf.toISOString()};
  const mainAccounts=new Set(scope.accountIds??[]);
  const sharedAccounts=new Set((scope.readableAccountIds??[]).filter(id=>!mainAccounts.has(id)));
  const events=rows.map(row=>{
    const metadata=row.metadata as Record<string,unknown>|null;
    const isTest=(value:unknown)=>value===true||value==='true';
    return {...row,dryRun:isTest(metadata?.dryRun)||isTest(metadata?.test)};
  });
  const main=pairCustomerResponses(events.filter(row=>scope.kind==='org'||mainAccounts.has(row.conversation.zaloAccountId??'')),start,end,asOf);
  const shared=pairCustomerResponses(events.filter(row=>scope.kind!=='org'&&sharedAccounts.has(row.conversation.zaloAccountId??'')),start,end,asOf);
  // Actor-credited people metrics still include legitimate replies on explicitly
  // readable shared nicks. Operational counters never expand the main scope.
  const pairs=[...main.pairs,...shared.pairs];
  const permittedPairs=pairs.filter(pair=>scope.kind==='org'||scope.userIds?.includes(pair.userId));
  const ids=[...new Set(permittedPairs.map(pair=>pair.userId))];
  const users=ids.length ? await prisma.user.findMany({where:{AND:[{id:{in:ids}},reportModelWhere(scope,'user')]},select:{id:true,fullName:true}}) : [];
  const names=new Map(users.map(user=>[user.id,user.fullName]));
  const knownPairs=permittedPairs.filter(pair=>names.has(pair.userId));
  const daily=new Map<string,{sum:number;count:number}>(),byUser=new Map<string,{sum:number;count:number}>();
  for(const pair of knownPairs){
    const day=new Date(pair.lastInboundAt.getTime()+7*3600000).toISOString().slice(0,10);
    for(const [map,key] of [[daily,day],[byUser,pair.userId]] as const){const bucket=map.get(key)??{sum:0,count:0};bucket.sum+=pair.seconds;bucket.count++;map.set(key,bucket);}
  }
  const responseBuckets=knownPairs.length?{
    under5Min:0,from5To15Min:0,from15To30Min:0,from30To60Min:0,over60Min:0,
  }:null;
  for(const pair of knownPairs){
    if(!responseBuckets)break;
    const minutes=pair.seconds/60;
    if(minutes<5)responseBuckets.under5Min++;
    else if(minutes<15)responseBuckets.from5To15Min++;
    else if(minutes<30)responseBuckets.from15To30Min++;
    else if(minutes<60)responseBuckets.from30To60Min++;
    else responseBuckets.over60Min++;
  }
  return {
    daily:[...daily.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,b])=>({date,avgSeconds:Math.round(b.sum/b.count),count:b.count,totalSeconds:b.sum})),
    overall:knownPairs.length?Math.round(knownPairs.reduce((n,p)=>n+p.seconds,0)/knownPairs.length):null,
    byUser:[...byUser.entries()].map(([userId,b])=>({userId,fullName:names.get(userId)??'',avgSeconds:Math.round(b.sum/b.count),count:b.count})).sort((a,b)=>a.avgSeconds-b.avgSeconds),
    responseBuckets,
    pending:main.pending,unattributed:main.unattributed,
    mainPending:main.pending,sharedPending:shared.pending,
    mainUnattributed:main.unattributed,sharedUnattributed:shared.unattributed,
    availability:'available',asOf:asOf.toISOString(),
  };
}
