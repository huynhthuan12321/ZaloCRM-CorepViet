// B-only independent SQL/HTTP supplement. No report implementation imports.
import pg from 'pg';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
pg.defaults.parseInputDatesAsUTC=true;
const OUT=process.env.REPORTS_6B_ARTIFACT_DIR!;
const db=new pg.Client({connectionString:'postgresql://postgres@127.0.0.1:55541/reports_5b6b_verify'});
await db.connect();
const q=async(s:string,p:any[]=[]) => (await db.query(s,p)).rows;
const id=(await q('SELECT current_database() d,current_user u,inet_server_port() p'))[0];
if(id.d!=='reports_5b6b_verify'||id.u!=='postgres'||id.p!==5432)throw Error('Wrong disposable target');
const {dates:{D,T,DM1}}=JSON.parse(await readFile(resolve(OUT,'oracle/fixture-manifest.json'),'utf8'));
const S=new Date(`${D}T00:00:00+07:00`), E=new Date(`${T}T00:00:00+07:00`);
const tokens:Record<string,string>={}, checks:any[]=[];
const canonical=(x:any):any=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const check=(name:string,expected:any,actual:any)=>{checks.push({name,expected,actual,pass:JSON.stringify(canonical(expected))===JSON.stringify(canonical(actual))});};
async function http(who:string,path:string,method='GET',body?:any){const r=await fetch('http://127.0.0.1:55542'+path,{method,headers:{...(tokens[who]?{authorization:`Bearer ${tokens[who]}`} :{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json() as any};}
const people:Record<string,string|null>={admX:'6b-u-adm-x',leadS:'6b-u-lead-s',depS1:'6b-u-dep-s1',leadM:'6b-u-lead-m',admY:'6b-u-adm-y',member:'6b-u-sale-s1a'};
const scopes:Record<string,any>={};
for(const [who,uid] of Object.entries(people)){
 const r=await http(who,'/api/v1/auth/login','POST',{email:`${uid}@example.invalid`,password:process.env.REPORTS_FIXTURE_PASSWORD});check(`login ${who}`,200,r.status);tokens[who]=r.data.token;
 const u=(await q('SELECT org_id,role FROM users WHERE id=$1',[uid]))[0];
 const users=u.role==='admin'?null:(await q(`WITH root AS (SELECT d.path FROM department_members dm JOIN departments d ON d.id=dm.department_id WHERE dm.user_id=$1) SELECT DISTINCT u.id FROM users u JOIN department_members dm ON dm.user_id=u.id JOIN departments d ON d.id=dm.department_id, root WHERE u.org_id=$2 AND d.org_id=$2 AND left(d.path,length(root.path))=root.path UNION SELECT $1 ORDER BY 1`,[uid,u.org_id])).map(r=>r.id);
 const accounts=users===null?null:(await q(`SELECT id FROM zalo_accounts WHERE org_id=$1 AND owner_user_id=ANY($2) AND (archived_at IS NULL OR zalo_uid IS NOT NULL)`,[u.org_id,users])).map(r=>r.id);
 const granted=(await q(`SELECT z.id FROM zalo_account_access a JOIN zalo_accounts z ON z.id=a.zalo_account_id WHERE a.user_id=$1 AND z.org_id=$2 AND (z.archived_at IS NULL OR z.zalo_uid IS NOT NULL)`,[uid,u.org_id])).map(r=>r.id);
 scopes[who]={org:u.org_id,users,accounts,readable:accounts===null?null:[...new Set([...accounts,...granted])]};
}
// Deliberately enormous merged/cross-org canaries; owner inserts synthetic rows only.
const rows=[['s1a-start',3,2,true,80,'hot'],['s-mid',1,4,false,50,'cooling'],['m-mid',7,9,true,60,'hot'],['s1a-merged',1000,1000,true,100,'hot'],['m-merged',1000,1000,false,100,'cooling'],['y1',5000,5000,true,100,'hot']];
await db.query('BEGIN');
try{
 if(Number((await q('SELECT count(*) n FROM contact_engagement_daily'))[0].n)!==0)throw Error('Supplement expects no previous daily rows');
 for(const [suffix,inbound,outbound,ci,intensity,pattern] of rows){
  const cid=`6b-c-${suffix}`,org=suffix==='y1'?'6b-org-y':'6b-org-x';
  await q(`UPDATE contacts SET engagement_pattern=$2 WHERE id=$1 AND org_id=$3`,[cid,pattern,org]);
  await q(`INSERT INTO contact_engagement_daily(id,org_id,contact_id,date,inbound_msg_count,outbound_msg_count,reaction_count,voice_msg_count,call_count,customer_initiated,daily_intensity,updated_at) VALUES($1,$2,$3,$4::date,$5,$6,1,2,3,$7,$8,now())`,[`recheck1804-daily-${suffix}`,org,cid,D,inbound,outbound,ci,intensity]);
 }
 await q(`INSERT INTO contact_engagement_daily(id,org_id,contact_id,date,inbound_msg_count,daily_intensity,updated_at) VALUES('recheck1804-before','6b-org-x','6b-c-s1a-start',$1::date,17,20,now())`,[DM1]);
 await q(`INSERT INTO contact_access(id,org_id,contact_id,user_id,updated_at) VALUES('recheck1804-collaborator','6b-org-x','6b-c-m-mid','6b-u-dep-s1',now())`);
 await db.query('COMMIT');
}catch(e){await db.query('ROLLBACK');throw e;}
await writeFile(resolve(OUT,'oracle/extra-fixture.json'),JSON.stringify({target:id,D,T,DM1,rows,outsidePeriodInbound:17,collaborator:'depS1 on m-mid',note:'owner seed only; all requests hit app-role HTTP'},null,2));
const all:Record<string,any>={};
for(const who of ['admX','leadS','depS1','leadM','admY']){
 const s=scopes[who],p=[s.org,s.users],w=`c.org_id=$1 AND c.merged_into IS NULL AND ($2::text[] IS NULL OR c.assigned_user_id=ANY($2))`;
 const c=(await q(`SELECT count(*)::int n FROM contacts c WHERE ${w}`,p))[0].n;
 const basic=await http(who,`/api/v1/reports/contacts?from=${D}&to=${D}`);check(`${who} collaborator does not expand contact main`,c,basic.data.byStatus.reduce((a:number,b:any)=>a+Number(b.count),0));
 const actual=await http(who,`/api/v1/reports/engagement?from=${D}&to=${D}&orgId=6b-org-y&userId=6b-u-sale-m`);check(`${who} engagement HTTP`,200,actual.status);all[who]={engagement:actual.data};
 const agg=(await q(`SELECT count(*)::int n,count(*) FILTER(WHERE e.customer_initiated)::int ci,coalesce(sum(e.inbound_msg_count),0)::int inbound,coalesce(sum(e.outbound_msg_count),0)::int outbound,coalesce(sum(e.reaction_count),0)::int reaction,coalesce(sum(e.voice_msg_count+e.call_count),0)::int vc FROM contact_engagement_daily e JOIN contacts c ON c.id=e.contact_id AND c.org_id=e.org_id WHERE ${w} AND e.date >= $3::date AND e.date < $4::date`,[...p,D,T]))[0];
 check(`${who} canonical daily percentage`,agg.n?Math.round(agg.ci/agg.n*1000)/10:null,actual.data.kpis.customerInitiatedPct);
 check(`${who} canonical interactions`,{inbound:agg.inbound,outbound:agg.outbound,reaction:agg.reaction,voiceCall:agg.vc},actual.data.interactionTypes);
 const patterns=await q(`SELECT engagement_pattern pattern,count(*)::int count FROM contacts c WHERE ${w} AND engagement_pattern IS NOT NULL GROUP BY engagement_pattern ORDER BY engagement_pattern`,p);
 check(`${who} canonical pattern distribution`,patterns,actual.data.patternDist.sort((a:any,b:any)=>a.pattern.localeCompare(b.pattern)));
 const heat=(await q(`SELECT e.contact_id FROM contact_engagement_daily e JOIN contacts c ON c.id=e.contact_id AND c.org_id=e.org_id WHERE ${w} AND e.date >= CURRENT_DATE-27 AND e.date <= CURRENT_DATE GROUP BY e.contact_id ORDER BY sum(e.daily_intensity) DESC LIMIT 15`,p)).map(r=>r.contact_id).sort();
 check(`${who} heatmap excludes merged and other rooms/org`,heat,actual.data.heatmap.map((r:any)=>r.contactId).sort());
 check(`${who} heatmap 28 measured buckets`,true,actual.data.heatmap.every((r:any)=>r.cells.length===28));
 for(const [key,ps] of [['hot',['hot','champion']],['cooling',['cooling','cold']]] as const){const ids=(await q(`SELECT id FROM contacts c WHERE ${w} AND engagement_pattern=ANY($3)`,[...p,ps])).map(r=>r.id).sort();check(`${who} ${key} canonical IDs`,ids,actual.data[key].map((r:any)=>r.contactId).sort());check(`${who} ${key} snapshot count`,ids.length,actual.data.kpis[key+'Count']);}
 check(`${who} unavailable average stays null`,null,actual.data.kpis.avgInteractionsPerDay);check(`${who} unavailable coverage reason`,'engagement_daily_coverage_unverified',actual.data.availability.avgInteractionsPerDay.reason);
 const empty=await http(who,'/api/v1/reports/engagement?from=2000-01-01&to=2000-01-01');check(`${who} zero denominator null`,null,empty.data.kpis.customerInitiatedPct);check(`${who} measured empty event sum`,{inbound:0,outbound:0,reaction:0,voiceCall:0},empty.data.interactionTypes);
 const funnel=await http(who,`/api/v1/analytics/conversion-funnel?from=${D}&to=${D}`);all[who].funnel=funnel.data;const groups=await q(`SELECT status,count(*)::int n FROM contacts c WHERE ${w} AND status IS NOT NULL AND created_at >= $3 AND created_at < $4 GROUP BY status`,[...p,S,E]);const total=groups.reduce((n,r)=>n+r.n,0);check(`${who} created-cohort funnel total`,total,funnel.data.totalContacts);for(const stage of funnel.data.stages){const n=groups.find(r=>r.status===stage.status)?.n??0;check(`${who} funnel ${stage.status}`,{count:n,rate:total?Math.round(n/total*1000)/10:0},{count:stage.count,rate:stage.rate});}check(`${who} conversion days unavailable`,null,funnel.data.avgConversionDays);
 const team=await http(who,`/api/v1/analytics/team-performance?from=${D}&to=${D}`);all[who].team=team.data;const expectedUsers=(await q('SELECT id FROM users WHERE org_id=$1 AND is_active AND ($2::text[] IS NULL OR id=ANY($2)) ORDER BY id',p)).map(r=>r.id);check(`${who} team users scope`,expectedUsers,team.data.users.map((u:any)=>u.userId).sort());
 for(const u of team.data.users){const sent=(await q(`SELECT count(*)::int n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND c.zalo_account_id IS NOT NULL AND ($2::text[] IS NULL OR c.zalo_account_id=ANY($2)) AND NOT c.is_virtual AND NOT m.is_local AND NOT m.is_deleted AND coalesce(m.metadata->>'dryRun','false')<>'true' AND coalesce(m.metadata->>'test','false')<>'true' AND m.sender_type='self' AND m.replied_by_user_id=$3 AND m.sent_at >= $4 AND m.sent_at < $5`,[s.org,s.readable,u.userId,S,E]))[0].n;check(`${who} team sent ${u.userId}`,sent,u.messagesSent);const converted=(await q(`SELECT count(*)::int n FROM contacts c WHERE ${w} AND assigned_user_id=$3 AND status='converted' AND updated_at >= $4 AND updated_at < $5`,[...p,u.userId,S,E]))[0].n;check(`${who} team converted ${u.userId}`,converted,u.contactsConverted);const ap=(await q(`SELECT count(*)::int n FROM appointments WHERE org_id=$1 AND assigned_user_id=$2 AND status='completed' AND appointment_date >= $3::date AND appointment_date < $4::date`,[s.org,u.userId,D,T]))[0].n;check(`${who} team appointments ${u.userId}`,ap,u.appointmentsCompleted);}
}
// Saved object CRUD checks ownership and org isolation independently of report run scope.
const created=await http('leadS','/api/v1/saved-reports','POST',{name:'B independent disposable CRUD',type:'custom',orgId:'6b-org-y',createdBy:'6b-u-adm-y',config:{metrics:['contacts_new'],groupBy:'date',dateRange:{from:D,to:D}}});
check('saved create',201,created.status);const sid=created.data.id;check('saved ignores client org and creator',{org:'6b-org-x',creator:'6b-u-lead-s'},{org:created.data.orgId,creator:created.data.createdBy});
for(const who of ['leadM','admY']){for(const method of ['GET','PUT','DELETE']){const r=await http(who,`/api/v1/saved-reports/${sid}`,method,method==='PUT'?{name:'forbidden'}:undefined);check(`saved ${who} ${method} denied`,404,r.status);}}
check('saved owner update',200,(await http('leadS',`/api/v1/saved-reports/${sid}`,'PUT',{name:'B updated'})).status);
check('saved owner delete',200,(await http('leadS',`/api/v1/saved-reports/${sid}`,'DELETE')).status);check('saved deleted unavailable',404,(await http('leadS',`/api/v1/saved-reports/${sid}`)).status);
await writeFile(resolve(OUT,'oracle/extra-oracle.json'),JSON.stringify({createdAt:new Date().toISOString(),target:id,checks,responses:all,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length},null,2));
console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,failures:checks.filter(c=>!c.pass)},null,2));await db.end();if(checks.some(c=>!c.pass))process.exitCode=1;
