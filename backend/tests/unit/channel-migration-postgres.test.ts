// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { backfillMessageOrg } from '../../scripts/channels/backfill-message-org-id.js';

const sql = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const expand = sql('../../prisma/migrations/20261013170000_multichannel_expand/migration.sql');
const nullable = sql('../../prisma/migrations/20261013180000_multichannel_nullable/migration.sql');
const validate = sql('../../../docs/ops/sql/TIKTOK-TT04D-VALIDATE.sql');
let db: PGlite;
// Minimal legacy tables with the actual key/column names needed by these migrations.
// This verifies PostgreSQL constraints, not a full production backup/restore.
const baseline = `
CREATE TABLE organizations(id text PRIMARY KEY);
CREATE TABLE users(id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id));
CREATE TABLE contacts(id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id));
CREATE TABLE zalo_accounts(id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id));
CREATE TABLE conversations(id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id),
  zalo_account_id text NOT NULL REFERENCES zalo_accounts(id), contact_id text REFERENCES contacts(id), external_thread_id text);
CREATE TABLE messages(id text PRIMARY KEY, conversation_id text NOT NULL,
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE);
INSERT INTO organizations VALUES('org-a'),('org-b');
INSERT INTO users VALUES('user-a','org-a'),('user-b','org-b');
INSERT INTO contacts VALUES('contact-a','org-a'),('contact-b','org-b');
INSERT INTO zalo_accounts VALUES('zalo-a','org-a');
INSERT INTO conversations VALUES('legacy','org-a','zalo-a','contact-a','thread-legacy');
INSERT INTO messages VALUES('old-message','legacy');`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(baseline);
  await db.exec(expand);
  await db.exec(nullable);
  await db.exec(`INSERT INTO channel_accounts(id,org_id,owner_user_id,provider,display_name,updated_at)
    VALUES('account-a','org-a','user-a','MOCK_BROWSER','A',now()),('account-a2','org-a','user-a','MOCK_BROWSER','A2',now()),
      ('account-b','org-b','user-b','MOCK_BROWSER','B',now());
    INSERT INTO conversations(id,org_id,channel_account_id,contact_id,external_thread_id)
      VALUES('channel-a','org-a','account-a','contact-a','thread'),('channel-a2','org-a','account-a2','contact-a','thread'),
      ('channel-b','org-b','account-b','contact-b','thread');`);
}, 60000);
afterAll(async () => { await db?.close(); });

describe.sequential('TT04-D PostgreSQL engine on in-memory fixtures', () => {
  it('preserves the legacy message and defaults channels off', async () => {
    expect((await db.query('SELECT count(*)::int AS n FROM messages')).rows).toEqual([{ n: 1 }]);
    expect((await db.query('SELECT enabled,inbound_enabled,outbound_enabled FROM channel_accounts LIMIT 1')).rows)
      .toEqual([{ enabled: false, inbound_enabled: false, outbound_enabled: false }]);
  });
  it('rejects neither/both transport identities', async () => {
    await expect(db.query("INSERT INTO conversations(id,org_id) VALUES('no-account','org-a')")).rejects.toMatchObject({ code: '23514' });
    await expect(db.query("INSERT INTO conversations(id,org_id,zalo_account_id,channel_account_id) VALUES('both','org-a','zalo-a','account-a')"))
      .rejects.toMatchObject({ code: '23514' });
  });
  it('rejects cross-org account ownership, grants and conversation contacts', async () => {
    await expect(db.query("INSERT INTO channel_accounts(id,org_id,owner_user_id,provider,display_name,updated_at) VALUES('bad','org-a','user-b','MOCK_BROWSER','Bad',now())"))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query("INSERT INTO channel_account_access(id,org_id,channel_account_id,user_id) VALUES('bad','org-a','account-a','user-b')"))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query("INSERT INTO conversations(id,org_id,channel_account_id,contact_id) VALUES('bad','org-a','account-a','contact-b')"))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query("INSERT INTO conversations(id,org_id,channel_account_id) VALUES('bad','org-a','account-b')"))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query("UPDATE contacts SET org_id='org-b' WHERE id='contact-a'"))
      .rejects.toMatchObject({ code: '23503' });
  });
  it('rejects a command bound to the wrong account even within the same org', async () => {
    await expect(db.query(`INSERT INTO outbound_commands(id,org_id,channel_account_id,conversation_id,requested_by_user_id,idempotency_key,text,updated_at)
      VALUES('bad-command','org-a','account-a','channel-a2','user-a','key','test',now())`)).rejects.toMatchObject({ code: '23503' });
  });
  it('deduplicates commands per account, allowing another account to use the same key', async () => {
    const insert = `INSERT INTO outbound_commands(id,org_id,channel_account_id,conversation_id,requested_by_user_id,idempotency_key,text,updated_at)
      VALUES($1,'org-a',$2,$3,'user-a','key','test',now())`;
    await db.query(insert, ['command-a', 'account-a', 'channel-a']);
    await expect(db.query(insert, ['command-a-duplicate', 'account-a', 'channel-a'])).rejects.toMatchObject({ code: '23505' });
    await db.query(insert, ['command-a2', 'account-a2', 'channel-a2']);
  });
  it('derives message org for legacy/raw writers and rejects spoofed org', async () => {
    await db.query("INSERT INTO messages(id,conversation_id) VALUES('new-legacy','legacy')");
    expect((await db.query("SELECT org_id FROM messages WHERE id='new-legacy'")).rows).toEqual([{ org_id: 'org-a' }]);
    await expect(db.query("INSERT INTO messages(id,conversation_id,org_id) VALUES('spoof','channel-a','org-b')"))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query("UPDATE messages SET conversation_id='channel-b' WHERE id='new-legacy'"))
      .rejects.toMatchObject({ code: '23503' });
  });
  it('blocks final NOT NULL validation until old messages are backfilled', async () => {
    await expect(db.exec(validate)).rejects.toThrow(/backfill incomplete/);
    await db.exec('ROLLBACK');
  });
  it('backfills in bounded statements, defaults dry-run and is resumable/idempotent', async () => {
    const client = { query: async (statement: string, params?: unknown[]) => {
      const result = await db.query(statement, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    } } as unknown as Pick<Client, 'query'>;
    const dry = await backfillMessageOrg(client, { apply: false, batchSize: 1, maxBatches: 1 });
    expect(dry).toMatchObject({ mode: 'dry-run', changed: 0, remaining: 1, invalid: 0 });
    expect(await backfillMessageOrg(client, { apply: true, batchSize: 1, maxBatches: 1 }))
      .toMatchObject({ changed: 1, remaining: 0, invalid: 0 });
    expect(await backfillMessageOrg(client, { apply: true, batchSize: 1, maxBatches: 1 }))
      .toMatchObject({ changed: 0, remaining: 0 });
    await db.exec(validate);
    const constraints = (await db.query("SELECT convalidated FROM pg_constraint WHERE conname='messages_org_id_conversation_id_fkey'")).rows;
    expect(constraints).toEqual([{ convalidated: true }]);
  });
  it('retains old writer compatibility after NOT NULL and deduplicates external IDs by conversation', async () => {
    await db.query("INSERT INTO messages(id,conversation_id,external_message_id) VALUES('channel-message','channel-a','external-1')");
    await expect(db.query("INSERT INTO messages(id,conversation_id,external_message_id) VALUES('dup','channel-a','external-1')"))
      .rejects.toMatchObject({ code: '23505' });
    await db.query("INSERT INTO messages(id,conversation_id,external_message_id) VALUES('another-channel','channel-a2','external-1')");
    expect((await db.query('SELECT count(*)::int AS n FROM messages WHERE org_id IS NULL')).rows).toEqual([{ n: 0 }]);
  });
});
