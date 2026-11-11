// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import 'dotenv/config';
import { Client } from 'pg';
import { pathToFileURL } from 'node:url';

export const BACKFILL_BATCH_SQL = `WITH batch AS (
  SELECT m.id FROM messages m WHERE m.org_id IS NULL ORDER BY m.id LIMIT $1
  FOR UPDATE OF m SKIP LOCKED
) UPDATE messages m SET org_id=c.org_id
  FROM batch b, conversations c WHERE m.id=b.id AND c.id=m.conversation_id
  RETURNING m.id`;
const CHECK_SQL = `SELECT count(*) FILTER (WHERE m.org_id IS NULL)::int AS remaining,
  count(*) FILTER (WHERE c.id IS NULL OR (m.org_id IS NOT NULL AND m.org_id <> c.org_id))::int AS invalid
  FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id`;

export async function backfillMessageOrg(client: Pick<Client, 'query'>, options: { apply: boolean; batchSize: number; maxBatches: number }) {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 10000
    || !Number.isInteger(options.maxBatches) || options.maxBatches < 1 || options.maxBatches > 100000) throw new Error('Invalid batch limits');
  const before = (await client.query(CHECK_SQL)).rows[0];
  if (before.invalid) throw new Error('Orphan or mismatched tenant exists; manual repair required');
  if (!options.apply) return { mode: 'dry-run', changed: 0, ...before };
  let changed = 0;
  for (let i = 0; i < options.maxBatches; i++) {
    // Each statement commits separately: bounded lock duration and resumable progress.
    const result = await client.query(BACKFILL_BATCH_SQL, [options.batchSize]);
    changed += result.rowCount ?? 0;
    if (!result.rowCount) break;
  }
  const after = (await client.query(CHECK_SQL)).rows[0];
  return { mode: 'apply', changed, ...after };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
    throw new Error('Production writes require explicit --allow-production');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SET lock_timeout='5s'");
    await client.query("SET statement_timeout='60s'");
    const result = await backfillMessageOrg(client, { apply, batchSize: 1000, maxBatches: 100 });
    console.log(JSON.stringify(result)); // Counts only, never connection string or message content.
    if (apply && (result.remaining || result.invalid)) process.exitCode = 2;
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Message tenant backfill failed; check DB locally without sharing credentials'); process.exitCode = 1; });
}
