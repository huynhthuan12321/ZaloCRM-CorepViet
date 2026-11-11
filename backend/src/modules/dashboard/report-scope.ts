import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';

/** Initial rollout: org admins and department managers. Shared access never expands main KPIs. */
export interface ReportScope {
  orgId: string;
  viewerId: string;
  kind: 'org' | 'department';
  userIds: string[] | null;
  accountIds: string[] | null;
  /** Main plus explicit read grants: separate shared operations or identified in-scope actor metrics. */
  readableAccountIds?: string[] | null;
}
const scopes = new WeakMap<object, ReportScope>();
export function orgReportScope(orgId:string):ReportScope{return {orgId,viewerId:'',kind:'org',userIds:null,accountIds:null};}

export async function resolveReportScope(user: {id:string;orgId:string}, adminOnly=false): Promise<ReportScope | null> {
  // Read current membership/grants for every request, including revocation of admin/access.
  const current = await prisma.user.findFirst({
    where: {id:user.id,orgId:user.orgId,isActive:true},
    select:{role:true,permissionGroup:{select:{archivedAt:true,grants:true}},departmentMember:{select:{deptRole:true,department:{select:{path:true}}}}},
  });
  if(!current)return null;
  if(current.role==='owner'||current.role==='admin')return {orgId:user.orgId,viewerId:user.id,kind:'org',userIds:null,accountIds:null};
  if(adminOnly)return null;
  const group=current.permissionGroup;
  const grants=group && !group.archivedAt ? group.grants as Record<string,Record<string,unknown>> : {};
  if(grants?.engagement_score?.access!==true)return null;
  const membership=current.departmentMember;
  if(!membership || !['leader','deputy'].includes(membership.deptRole))return null;
  const departments=await prisma.department.findMany({where:{orgId:user.orgId,path:{startsWith:membership.department.path}},select:{id:true}});
  const members=await prisma.departmentMember.findMany({where:{departmentId:{in:departments.map(d=>d.id)},user:{orgId:user.orgId}},select:{userId:true}});
  const userIds=[...new Set([user.id,...members.map(m=>m.userId)])];
  const accounts=await prisma.zaloAccount.findMany({where:{orgId:user.orgId,ownerUserId:{in:userIds},OR:[{archivedAt:null},{archivedAt:{not:null},zaloUid:{not:null}}]},select:{id:true}});
  const grantsToAccounts=await prisma.zaloAccountAccess.findMany({where:{userId:user.id,zaloAccount:{orgId:user.orgId,OR:[{archivedAt:null},{archivedAt:{not:null},zaloUid:{not:null}}]}},select:{zaloAccountId:true}});
  const accountIds=accounts.map(a=>a.id);
  return {orgId:user.orgId,viewerId:user.id,kind:'department',userIds,accountIds,readableAccountIds:[...new Set([...accountIds,...grantsToAccounts.map(g=>g.zaloAccountId)])]};
}

export async function gateReportAccess(request:FastifyRequest,reply:FastifyReply,adminOnly=false):Promise<boolean>{
  const scope=scopes.get(request)??await resolveReportScope(request.user);
  if(!scope){reply.status(403).send({error:'Bạn không có quyền xem báo cáo này trong đợt triển khai hiện tại.',code:'reports_forbidden'});return false;}
  // System audit and legacy automation health remain org-admin-only in this rollout.
  const pathname=request.url?.split('?')[0].replace(/\/+$/,'');
  if(scope.kind!=='org' && (adminOnly || ['/api/v1/reports/audit','/api/v1/reports/automation'].includes(pathname))){
    reply.status(403).send({error:'Báo cáo hệ thống chỉ dành cho quản trị viên.',code:'reports_admin_only'});return false;
  }
  scopes.set(request,scope);return true;
}
export function reportScope(request:FastifyRequest):ReportScope{
  const scope=scopes.get(request);if(!scope)throw new Error('Report scope was not authorized');return scope;
}

export function reportModelWhere(scope:ReportScope,model:string):Record<string,unknown>{
  const org={orgId:scope.orgId};
  if(scope.kind==='org'){
    // Contract 5.1: merged contacts never enter canonical counts, whatever the scope.
    if(model==='contact')return {...org,mergedInto:null};
    if(model==='contactEngagementDaily')return {...org,contact:{orgId:scope.orgId,mergedInto:null}};
    return org;
  }
  const users={in:scope.userIds??[]};
  switch(model){
    case 'user':return {...org,id:users};
    case 'contact':return {...org,assignedUserId:users,mergedInto:null};
    case 'zaloAccount':return {...org,id:{in:scope.accountIds??[]}};
    case 'appointment':return {...org,assignedUserId:users};
    case 'leadRequest':return {...org,requestedByUserId:users};
    case 'leadPoolDistribution':return {...org,assignedToUserId:users};
    case 'contactEngagementDaily':return {...org,contact:{orgId:scope.orgId,assignedUserId:users,mergedInto:null}};
    case 'activityLog':return {...org,actorType:'user',userId:users};
    case 'zaloAccountStatusLog':return {...org,accountId:{in:scope.accountIds??[]}};
    case 'status':return org;
    default:throw new Error(`Unsupported model in scoped report: ${model}`);
  }
}

// Aliases below are server constants, never request/config values.
export function contactReportSql(scope:ReportScope,alias:'c'|''=''){
  const prefix=alias ? Prisma.raw(`${alias}.`) : Prisma.empty;
  return scope.kind==='org' ? Prisma.sql`${prefix}org_id = ${scope.orgId} AND ${prefix}merged_into IS NULL` : Prisma.sql`${prefix}org_id = ${scope.orgId} AND ${prefix}assigned_user_id = ANY(${scope.userIds}::text[]) AND ${prefix}merged_into IS NULL`;
}
/** Contract 5.1 operational message: real Zalo conversation, no local/deleted/dry-run/test rows. */
export function canonicalMessageSql(){
  return Prisma.sql`c.zalo_account_id IS NOT NULL AND c.is_virtual = false
    AND m.is_local = false AND m.is_deleted = false
    AND COALESCE(m.metadata->>'dryRun', 'false') <> 'true' AND COALESCE(m.metadata->>'test', 'false') <> 'true'`;
}
export function messageReportSql(scope:ReportScope,mode:'main'|'people'='main'){
  // Customer inbound has no CRM author. Keep the staff restriction on outbound;
  // never drop it for another department's employees, even on a readable nick.
  if(scope.kind==='org')return Prisma.sql`c.org_id = ${scope.orgId} AND ${canonicalMessageSql()}`;
  if(mode==='people')return Prisma.sql`c.org_id = ${scope.orgId} AND c.zalo_account_id = ANY(${scope.readableAccountIds??scope.accountIds}::text[]) AND m.replied_by_user_id = ANY(${scope.userIds}::text[]) AND ${canonicalMessageSql()}`;
  return Prisma.sql`c.org_id = ${scope.orgId} AND c.zalo_account_id = ANY(${scope.accountIds}::text[]) AND (m.sender_type = 'contact' OR m.replied_by_user_id = ANY(${scope.userIds}::text[])) AND ${canonicalMessageSql()}`;
}
export function messageAccountSql(scope:ReportScope){
  return scope.kind==='org'
    ? Prisma.sql`c.org_id = ${scope.orgId}`
    : Prisma.sql`c.org_id = ${scope.orgId} AND c.zalo_account_id = ANY(${scope.accountIds??[]}::text[])`;
}
export function appointmentReportSql(scope:ReportScope,alias:'a'|''=''){
  const prefix=alias ? Prisma.raw(`${alias}.`) : Prisma.empty;
  return scope.kind==='org' ? Prisma.sql`${prefix}org_id = ${scope.orgId}` : Prisma.sql`${prefix}org_id = ${scope.orgId} AND ${prefix}assigned_user_id = ANY(${scope.userIds}::text[])`;
}
export function dailyReportSql(scope:ReportScope,alias:'d'|''=''){
  const prefix=alias ? Prisma.raw(`${alias}.`) : Prisma.empty;
  return scope.kind==='org' ? Prisma.sql`${prefix}org_id = ${scope.orgId}` : Prisma.sql`${prefix}org_id = ${scope.orgId} AND ${prefix}user_id = ANY(${scope.userIds}::text[])`;
}
