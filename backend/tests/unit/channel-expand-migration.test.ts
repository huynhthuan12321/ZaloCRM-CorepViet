// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ORG_SCOPED_MODELS } from '../../src/shared/tenant/org-scoped-models.js';

const sql = readFileSync(new URL('../../prisma/migrations/20261013170000_multichannel_expand/migration.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
const models = ['ChannelAccount', 'ChannelAccountAccess', 'BrowserSessionRef', 'ContactIdentity', 'ChannelEvent', 'OutboundCommand'];

describe('channel expand deployment contract (static; not a PostgreSQL execution test)', () => {
  it('preserves existing data and the required Zalo transport', () => {
    expect(sql).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
    // The final schema is nullable in D; the B migration itself must stay additive.
    expect(sql).not.toContain('DROP NOT NULL');
    expect(sql).toContain('"thread_kind" TEXT NOT NULL DEFAULT \'dm\'');
  });
  it('does not enable channels or grant send permission during migration', () => {
    for (const column of ['enabled', 'inbound_enabled', 'outbound_enabled']) {
      expect(sql).toContain(`"${column}" BOOLEAN NOT NULL DEFAULT false`);
    }
    expect(sql).toContain('"permission" TEXT NOT NULL DEFAULT \'read\'');
    expect(sql).not.toMatch(/\bINSERT\s+INTO/i);
  });
  it('binds access, ownership, contacts and commands to their organization', () => {
    for (const [column, table] of [['owner_user_id', 'users'], ['user_id', 'users'], ['contact_id', 'contacts'], ['requested_by_user_id', 'users']]) {
      expect(sql).toContain(`FOREIGN KEY ("org_id", "${column}") REFERENCES "${table}"("org_id", "id")`);
    }
    expect(sql).toContain('FOREIGN KEY ("org_id", "channel_account_id", "conversation_id") REFERENCES "conversations"("org_id", "channel_account_id", "id")');
  });
  it('deduplicates within the account or conversation rather than globally', () => {
    expect(sql).toContain('ON "channel_events"("channel_account_id", "event_key")');
    expect(sql).toContain('ON "outbound_commands"("channel_account_id", "idempotency_key")');
    expect(sql).toContain('ON "messages"("conversation_id", "external_message_id")');
  });
  it.each(models)('requires tenant context for new model %s', model => {
    expect(ORG_SCOPED_MODELS.has(model)).toBe(true);
  });
  it('keeps legacy Message tenant-guard behavior while DB trigger derives org in D', () => {
    expect(ORG_SCOPED_MODELS.has('Message')).toBe(false);
    expect(schema).toMatch(/orgId\s+String\s+@default\(dbgenerated\(\)\)\s+@map\("org_id"\)/);
  });
});
