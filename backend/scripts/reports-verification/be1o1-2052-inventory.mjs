// Independent B inventory: schema -> guard set -> PostgreSQL catalog, read-only.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
const out=process.env.REPORTS_6B_ARTIFACT_DIR;
const schema=await readFile('prisma/schema.prisma','utf8');
const guard=await readFile('src/shared/tenant/org-scoped-models.ts','utf8');
const models=[...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].filter(m=>/^\s+orgId\s+\w+/m.test(m[2])).map(m=>({model:m[1],table:m[2].match(/@@map\("([^"]+)"\)/)?.[1]??m[1]}));
const guarded=[...guard.slice(guard.indexOf('new Set([')).matchAll(/'([A-Z]\w+)'/g)].map(m=>m[1]);
const db=new pg.Client({connectionString:'postgresql://reports_be1o1_app@127.0.0.1:55571/reports_be1o1_verify'});
await db.connect();
try{
 const target=(await db.query(`SELECT current_database() db,current_user role,inet_server_port() port,rolsuper,rolbypassrls,(SELECT count(*)::int FROM pg_class WHERE relowner=r.oid AND relkind IN ('r','p')) owned FROM pg_roles r WHERE rolname=current_user`)).rows[0];
 if(target.db!=='reports_be1o1_verify'||target.role!=='reports_be1o1_app'||target.port!==5432)throw Error('Wrong disposable target');
 const catalog=(await db.query(`SELECT c.relname table,c.relrowsecurity enabled,c.relforcerowsecurity forced,pg_get_expr(p.polqual,p.polrelid) using_expr,pg_get_expr(p.polwithcheck,p.polrelid) check_expr,p.polcmd command FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy p ON p.polrelid=c.oid WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
 const checks=[];const ck=(name,pass,actual)=>checks.push({name,pass,actual});
 ck('app role has no super/bypass/ownership',!target.rolsuper&&!target.rolbypassrls&&target.owned===0,target);
 ck('schema inventory matches exact guard set',models.length===102&&guarded.length===102&&models.every(m=>guarded.includes(m.model))&&guarded.every(g=>models.some(m=>m.model===g)),{schema:models.length,guard:guarded.length,missing:models.filter(m=>!guarded.includes(m.model)),extra:guarded.filter(g=>!models.some(m=>m.model===g))});
 for(const m of models){const rows=catalog.filter(r=>r.table===m.table);ck(`${m.model} maps to protected ${m.table}`,rows.some(r=>r.enabled&&r.forced&&r.command==='*'&&['using_expr','check_expr'].every(k=>r[k]?.includes('app.current_org')&&r[k]?.includes('app.bypass_rls'))),rows);}
 const result={time:new Date().toISOString(),target,checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length};
 await writeFile(resolve(out,'oracle/independent-inventory.json'),JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:checks.filter(c=>!c.pass)}));
 if(result.failed)process.exitCode=1;
}finally{await db.end();}
