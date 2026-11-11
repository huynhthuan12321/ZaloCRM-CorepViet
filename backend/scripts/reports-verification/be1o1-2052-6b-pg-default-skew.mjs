// 6B lần 3 — group D control: reproduce the 6A-harness skew mechanism inside a rolled-back transaction.
import pg from 'pg';
const c = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:55571/reports_be1o1_verify' });
await c.connect();
await c.query('BEGIN');
const at = new Date('2026-10-31T23:59:59.999+07:00');
await c.query(`INSERT INTO contacts (id,org_id,full_name,created_at,updated_at) VALUES ('6b-c-skew-probe','6b-org-y','probe',$1,$1)`, [at]);
const r = (await c.query(`SELECT created_at::text t, (created_at >= '2026-10-31 17:00'::timestamp AND created_at < '2026-11-01 17:00'::timestamp) AS in_vn_day_2026_11_01 FROM contacts WHERE id='6b-c-skew-probe'`)).rows[0];
await c.query('ROLLBACK');
const left = (await c.query(`SELECT count(*)::int n FROM contacts WHERE id='6b-c-skew-probe'`)).rows[0].n;
console.log(JSON.stringify({ processTZ: Intl.DateTimeFormat().resolvedOptions().timeZone, parseInputDatesAsUTC: pg.defaults.parseInputDatesAsUTC ?? false, intendedUtc: at.toISOString(), stored: r.t, countedInVnDay20261101: r.in_vn_day_2026_11_01, rowsLeftAfterRollback: left }));
await c.end();
