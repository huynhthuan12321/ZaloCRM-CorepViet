// Independent review-only oracle. Explicit loopback disposable DB; no application bootstrap.
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
const root='../artifacts/reports-mobile-5b-recheck2-2026-11-02';
const owner=new Client({connectionString:'postgresql://postgres@127.0.0.1:55471/reports_1b_verify'});
await owner.connect();
assert.equal((await owner.query('select current_database() db')).rows[0].db,'reports_1b_verify');
// Add one synthetic deputy, copying only the known test password hash and grant.
await owner.query(`INSERT INTO users (id,org_id,email,full_name,password_hash,role,permission_group_id,password_changed_at,updated_at)
 SELECT 'verify-ai-deputy',org_id,'verify-ai-deputy@example.test','VERIFY AI Deputy',password_hash,role,permission_group_id,password_changed_at,NOW() FROM users WHERE id='verify-ai-leader'`);
await owner.query(`INSERT INTO department_members (id,user_id,department_id,dept_role)
 VALUES ('verify-ai-deputy-membership','verify-ai-deputy','verify-ai-dept-a','deputy')`);
await owner.end();
const endpoints=['overview','nick-fleet','sales-performance','crm-usage','pipeline','lead-pool','automation-summary','broadcast','engagement','audit','ai'];
const adminOnly=new Set(['automation-summary','broadcast','audit']);
const checks:any[]=[];
for(const [user,access] of [['verify-ai-admin','admin'],['verify-ai-leader','leader'],['verify-ai-deputy','deputy'],['verify-ai-member','member']]) {
 const login=await fetch('http://127.0.0.1:30571/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user+'@example.test',password:'VerifyLocalOnly-2026!'})});
 assert.equal(login.status,200); const {token}=await login.json(); assert.ok(token);
 for(const endpoint of endpoints) {
  const expected=access==='admin'||((access==='leader'||access==='deputy')&&!adminOnly.has(endpoint))?200:403;
  const response=await fetch('http://127.0.0.1:30571/api/v1/reports/'+endpoint,{headers:{authorization:'Bearer '+token}});
  await response.arrayBuffer(); checks.push({user,endpoint,expected,actual:response.status,status:response.status===expected?'PASS':'FAIL'});
 }
}
await writeFile(root+'/capabilities-results.json',JSON.stringify({time:new Date().toISOString(),checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length},null,2));
console.log('CAPABILITIES',checks.filter(c=>c.status==='PASS').length+'/'+checks.length);
assert.ok(checks.every(c=>c.status==='PASS'));
