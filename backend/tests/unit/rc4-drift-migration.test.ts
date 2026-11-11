import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../prisma/migrations/20261103180000_reconcile_rc4_schema_drift/migration.sql', import.meta.url), 'utf8');
// Engine fixture for the NEW migration only. Full historical replay, ledger and
// app-role RLS assertions run separately on PostgreSQL16 disposable databases.
const baseline = `
CREATE TABLE conversations(id text PRIMARY KEY, org_id text NOT NULL, UNIQUE(org_id,id));
CREATE TABLE messages(id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES conversations(id), org_id text);
ALTER TABLE messages ADD CONSTRAINT messages_org_id_conversation_id_fkey
 FOREIGN KEY(org_id,conversation_id) REFERENCES conversations(org_id,id) ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
CREATE TABLE zalo_accounts(id text PRIMARY KEY, org_id text NOT NULL);
CREATE TABLE media_assets(id text PRIMARY KEY, org_id text NOT NULL, source_zalo_account_id text);
CREATE TABLE automation_triggers(id text PRIMARY KEY, welcome_delay_seconds int NOT NULL DEFAULT 60);
INSERT INTO conversations VALUES('cx','X'),('cy','Y');
INSERT INTO messages VALUES('legacy','cx',NULL),('existing','cy','Y');
INSERT INTO zalo_accounts VALUES('nx','X'),('ny','Y');
INSERT INTO media_assets VALUES('asset','X','nx');
INSERT INTO automation_triggers VALUES('configured',60),('custom',7);
`;
async function fixture() { const db = new PGlite(); await db.exec(baseline); return db; }

describe('RC-4 data-preserving migration on PostgreSQL engine', () => {
  it('backfills only from the trusted parent, validates FK and sets NOT NULL', async () => {
    const db = await fixture();
    try {
      await db.exec(migration);
      expect((await db.query('SELECT id,org_id FROM messages ORDER BY id')).rows)
        .toEqual([{ id: 'existing', org_id: 'Y' }, { id: 'legacy', org_id: 'X' }]);
      expect((await db.query("SELECT convalidated FROM pg_constraint WHERE conname='messages_org_id_conversation_id_fkey'")).rows)
        .toEqual([{ convalidated: true }]);
      await expect(db.query("INSERT INTO messages VALUES('null','cx',NULL)")).rejects.toMatchObject({ code: '23502' });
      await expect(db.query("INSERT INTO messages VALUES('cross','cx','Y')")).rejects.toMatchObject({ code: '23503' });
    } finally { await db.close(); }
  });
  it('changes future welcome defaults without rewriting existing choices', async () => {
    const db = await fixture();
    try {
      await db.exec(migration);
      await db.exec("INSERT INTO automation_triggers(id) VALUES('new')");
      expect((await db.query('SELECT welcome_delay_seconds FROM automation_triggers ORDER BY id')).rows)
        .toEqual([{ welcome_delay_seconds: 60 }, { welcome_delay_seconds: 7 }, { welcome_delay_seconds: 1 }]);
    } finally { await db.close(); }
  });
  it('retains source ID CASCADE and DELETE SET NULL, rejects foreign/orphan sources', async () => {
    const db = await fixture();
    try {
      await db.exec(migration);
      await expect(db.query("INSERT INTO media_assets VALUES('cross','X','ny')")).rejects.toMatchObject({ code: '23503' });
      await expect(db.query("INSERT INTO media_assets VALUES('orphan','X','missing')")).rejects.toMatchObject({ code: '23503' });
      await expect(db.query("UPDATE zalo_accounts SET org_id='Y' WHERE id='nx'")).rejects.toMatchObject({ code: '23503' });
      await db.exec("UPDATE zalo_accounts SET id='renamed' WHERE id='nx'");
      expect((await db.query('SELECT source_zalo_account_id FROM media_assets')).rows).toEqual([{ source_zalo_account_id: 'renamed' }]);
      await db.exec("DELETE FROM zalo_accounts WHERE id='renamed'");
      expect((await db.query('SELECT id,org_id,source_zalo_account_id FROM media_assets')).rows)
        .toEqual([{ id: 'asset', org_id: 'X', source_zalo_account_id: null }]);
    } finally { await db.close(); }
  });
  for (const source of ['missing', 'ny']) {
    it(`fails closed and rolls back for legacy media source ${source}`, async () => {
      const db = await fixture();
      try {
        await db.exec(`UPDATE media_assets SET source_zalo_account_id='${source}'`);
        await expect(db.exec(migration)).rejects.toThrow(/Media source is orphaned or cross-tenant/);
        await db.exec('ROLLBACK');
        expect((await db.query("SELECT org_id FROM messages WHERE id='legacy'")).rows).toEqual([{ org_id: null }]);
        expect((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='media_assets_source_zalo_account_id_fkey'")).rows).toEqual([{ n: 0 }]);
      } finally { await db.close(); }
    });
  }
  it('rejects mismatched legacy message tenants without rewriting them', async () => {
    const db = new PGlite();
    try {
      // A NOT VALID FK permits legitimate pre-existing legacy rows; never disable it.
      await db.exec(baseline.replace("('existing','cy','Y')", "('existing','cy','X')").replace(
        `ALTER TABLE messages ADD CONSTRAINT messages_org_id_conversation_id_fkey
 FOREIGN KEY(org_id,conversation_id) REFERENCES conversations(org_id,id) ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;`, ''));
      await db.exec('ALTER TABLE messages ADD CONSTRAINT messages_org_id_conversation_id_fkey FOREIGN KEY(org_id,conversation_id) REFERENCES conversations(org_id,id) NOT VALID');
      await expect(db.exec(migration)).rejects.toThrow(/Message tenant is orphaned or inconsistent/);
      await db.exec('ROLLBACK');
      expect((await db.query("SELECT org_id FROM messages WHERE id='existing'")).rows).toEqual([{ org_id: 'X' }]);
    } finally { await db.close(); }
  });
});
