// Only the ten explicitly named synthetic base messages in the disposable DB.
// Put inbound/reply before now, retaining a 60-second reply interval and all
// original assertions. Preserve the first baseline result before rerunning.
import { Client } from 'pg';
import assert from 'node:assert/strict';
import { copyFile, writeFile } from 'node:fs/promises';
const root = '../artifacts/reports-mobile-5b-2026-11-02';
const db = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify' });
await db.connect();
try {
  assert.deepEqual((await db.query('SELECT current_database() AS db,current_user AS role')).rows[0], { db: 'reports_1b_verify', role: 'postgres' });
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:30:00+07:00`);
  assert.ok(start.getTime() + 60000 < Date.now());
  const conversations = ['verify-main', 'verify-main-wait', 'verify-shared', 'verify-shared-wait', 'verify-shared-unknown', 'verify-foreign'];
  const before = (await db.query('SELECT id,sender_type,sent_at::text AS stored_utc FROM messages WHERE conversation_id=ANY($1) AND org_id=ANY($2) ORDER BY id', [conversations, ['verify-org-a', 'verify-org-b']])).rows;
  assert.equal(before.length, 10);
  await copyFile(`${root}/results.json`, `${root}/baseline-after-first-clock-attempt.json`);
  await copyFile(`${root}/fixture-clock-correction.json`, `${root}/fixture-clock-first-attempt.json`);
  await db.query('BEGIN');
  for (const row of before) {
    const time = new Date(start.getTime() + (row.sender_type === 'self' ? 60000 : 0));
    await db.query("UPDATE messages SET sent_at=$1::timestamptz AT TIME ZONE 'UTC' WHERE id=$2 AND conversation_id=ANY($3) AND org_id=ANY($4)", [time.toISOString(), row.id, conversations, ['verify-org-a', 'verify-org-b']]);
  }
  await db.query('COMMIT');
  const after = (await db.query('SELECT id,sent_at::text AS stored_utc FROM messages WHERE conversation_id=ANY($1) AND org_id=ANY($2) ORDER BY id', [conversations, ['verify-org-a', 'verify-org-b']])).rows;
  await writeFile(`${root}/fixture-clock-correction.json`, JSON.stringify({ time: new Date().toISOString(), reason: 'Original 09:00 VN fixture was in the future. First pg Date write to TIMESTAMP WITHOUT TIME ZONE retained the process local time; now explicitly cast ISO timestamptz AT TIME ZONE UTC. Keep all old failures; no assertion/runtime changes.', day, before, after, correctedInbound: start.toISOString(), correctedReply: new Date(start.getTime() + 60000).toISOString(), updatedRows: before.length }, null, 2));
  console.log('CORRECTED 10 explicitly named fake message timestamps; initial baseline retained');
} finally { await db.end(); }
