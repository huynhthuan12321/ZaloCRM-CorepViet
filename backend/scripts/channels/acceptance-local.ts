// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// Isolated acceptance only: never reads DATABASE_URL/.env as the destination.
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { Server } from 'socket.io';
import { io as connectSocket, type Socket } from 'socket.io-client';

const backend = fileURLToPath(new URL('../../', import.meta.url));
const repo = resolve(backend, '..');
const runtime = join(repo, 'poc/tiktok-personal-qr/runtime/tt04-acceptance', randomUUID());
const bin = join(repo, 'poc/tiktok-personal-qr/runtime/postgresql16/pgsql/bin');
const data = join(runtime, 'pgdata');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const workerKey = (accountId: string) => createHmac('sha256', process.env.MOCK_CHANNEL_WORKER_SECRET!)
  .update(`mock-channel-worker:${accountId}`)
  .digest('hex');
const checks: Array<{ name: string; status: string; ms: number }> = [];
const measurements: Record<string, unknown> = {};
const sockets: Socket[] = [];
let started = false;
let client: Client | undefined;
let app: ReturnType<typeof Fastify> | undefined;
let io: Server | undefined;
let prisma: typeof import('../../src/shared/database/prisma-client.js')['prisma'] | undefined;
let vite: { close(): Promise<void> } | undefined;
let browser: { close(): Promise<void> } | undefined;

function run(executable: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return execFileSync(executable, args, { cwd: backend, env, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}
async function check(name: string, fn: () => Promise<void>) {
  const before = performance.now();
  try { await fn(); checks.push({ name, status: 'PASS', ms: Math.round(performance.now() - before) }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, status: 'FAIL', ms: Math.round(performance.now() - before) }); throw error; }
}
async function unusedPort() {
  const server = createServer();
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address(); assert(address && typeof address !== 'string');
  const port = address.port; await new Promise<void>(done => server.close(() => done())); return port;
}

async function main() {
  mkdirSync(runtime, { recursive: true });
  const version = run(join(bin, 'postgres.exe'), ['--version']).trim();
  assert.match(version, /PostgreSQL\) 16\./);
  measurements.postgresVersion = version;
  const port = await unusedPort();
  run(join(bin, 'initdb.exe'), ['-D', data, '-U', 'tt04_owner', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
  // Windows daemon descendants can inherit capture pipes even after pg_ctl exits.
  execFileSync(join(bin, 'pg_ctl.exe'), ['-D', data, '-l', join(runtime, 'postgres.log'), '-w', '-t', '30',
    '-o', `-h 127.0.0.1 -p ${port} -c shared_buffers=32MB -c max_connections=30`, 'start'], { windowsHide: true, stdio: 'ignore' });
  started = true;
  const connection = (database: string) => ({ host: '127.0.0.1', port, user: 'tt04_owner', database });
  client = new Client(connection('postgres')); await client.connect();
  // Must prove the listener is our freshly-created cluster before any DDL.
  const directory = (await client.query('SHOW data_directory')).rows[0].data_directory;
  assert.equal(resolve(directory).toLowerCase(), resolve(data).toLowerCase());
  await client.query('CREATE DATABASE tt04_legacy'); await client.query('CREATE DATABASE tt04_restored');
  await client.end(); client = new Client(connection('tt04_legacy')); await client.connect();

  await check('full-schema legacy fixture from pinned HEAD', async () => {
    const schema = run('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, 'show', 'bf31cdf:backend/prisma/schema.prisma']);
    const path = join(runtime, 'legacy.prisma'); writeFileSync(path, schema);
    const sql = run(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
      '--from-empty', '--to-schema', path, '--script'], { ...process.env, DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/never_connect' });
    writeFileSync(join(runtime, 'legacy-schema.sql'), sql); measurements.legacySchemaSha256 = hash(schema);
    await client!.query(sql);
    measurements.tableCount = Number((await client!.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count);
    assert(Number(measurements.tableCount) > 100);
    await client!.query(`INSERT INTO organizations(id,name,updated_at) VALUES($1,'Fixture A',now()),($2,'Fixture B',now())`, [id(1), id(2)]);
    await client!.query(`INSERT INTO permission_groups(id,org_id,name,grants,updated_at) VALUES($1,$2,'Fixture readers','{"conversation":{"access":true}}',now())`, [id(31), id(1)]);
    for (const [n, org, role, active] of [[11, 1, 'owner', true], [12, 1, 'member', true], [13, 1, 'member', true], [14, 1, 'member', false], [21, 2, 'owner', true]] as const) {
      await client!.query(`INSERT INTO users(id,org_id,password_hash,full_name,role,is_active,permission_group_id,updated_at)
        VALUES($1,$2,'fixture-no-password',$3,$4,$5,$6,now())`, [id(n), id(org), `Fixture user ${n}`, role, active, org === 1 ? id(31) : null]);
    }
    for (const [n, privacy] of [[41, 'sub'], [42, 'main']] as const) {
      await client!.query(`INSERT INTO zalo_accounts(id,org_id,owner_user_id,display_name,zalo_uid,privacy_mode)
        VALUES($1,$2,$3,$4,$5,$6)`, [id(n), id(1), id(11), `Fixture Zalo ${n}`, `fixture-uid-${n}`, privacy]);
    }
    await client!.query(`INSERT INTO zalo_account_access(id,zalo_account_id,user_id,permission) VALUES($1,$2,$3,'read')`, [id(70), id(41), id(12)]);
    for (const n of [61, 62, 63]) await client!.query(`INSERT INTO contacts(id,org_id,full_name,updated_at) VALUES($1,$2,$3,now())`, [id(n), id(1), `Fixture contact ${n}`]);
    for (const [n, account, contact, virtual] of [[51, 41, 61, false], [52, 42, 62, false], [53, 41, 63, true]] as const) {
      await client!.query(`INSERT INTO conversations(id,org_id,zalo_account_id,contact_id,external_thread_id,is_virtual,last_message_at)
        VALUES($1,$2,$3,$4,$5,$6,now())`, [id(n), id(1), id(account), id(contact), `fixture-thread-${n}`, virtual]);
    }
    await client!.query(`INSERT INTO messages(id,conversation_id,sender_type,content,sent_at)
      SELECT '00000000-0000-4000-8000-' || lpad((1000+i)::text,12,'0'),$1,'contact','LEGACY_FIXTURE_' || i,
        '2026-10-13T00:00:00Z'::timestamptz + i*interval '1 second' FROM generate_series(1,1200) i`, [id(51)]);
    await client!.query(`INSERT INTO messages(id,conversation_id,sender_type,content,sent_at) VALUES($1,$2,'contact','PRIVATE_FIXTURE',now()),($3,$4,'self','VIRTUAL_FIXTURE',now())`, [id(101), id(52), id(102), id(53)]);
  });
  const snapshot = async () => (await client!.query(`SELECT count(*)::int AS count,md5(string_agg(id||coalesce(content,''),'|' ORDER BY id)) AS digest FROM messages`)).rows[0];
  const before = await snapshot(); measurements.before = before;
  await check('pg_dump and pg_restore full fixture + media checksum', async () => {
    const dump = join(runtime, 'legacy.dump');
    run(join(bin, 'pg_dump.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'tt04_owner', '-d', 'tt04_legacy', '-Fc', '-f', dump]);
    run(join(bin, 'pg_restore.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'tt04_owner', '-d', 'tt04_restored', '--exit-on-error', dump]);
    await client!.end(); client = new Client(connection('tt04_restored')); await client.connect();
    assert.deepEqual(await snapshot(), before);
    const media = join(runtime, 'media-fixture.txt'), restored = join(runtime, 'media-restored.txt');
    writeFileSync(media, 'TT04 SYNTHETIC MEDIA FIXTURE'); copyFileSync(media, restored);
    assert.equal(hash(readFileSync(media)), hash(readFileSync(restored)));
    measurements.backupSha256 = hash(readFileSync(dump));
  });
  await check('B then D1 migrations on restored PostgreSQL 16', async () => {
    for (const path of ['prisma/migrations/20261013170000_multichannel_expand/migration.sql', 'prisma/migrations/20261013180000_multichannel_nullable/migration.sql']) {
      const sql = readFileSync(join(backend, path), 'utf8'); measurements[path] = hash(sql); await client!.query(sql);
    }
    assert.deepEqual(await snapshot(), before);
  });
  await check('bounded lock timeout with real concurrent PostgreSQL connections', async () => {
    const blocker = new Client(connection('tt04_restored')); await blocker.connect();
    try {
      await blocker.query('BEGIN; LOCK TABLE conversations IN ACCESS EXCLUSIVE MODE');
      await client!.query("SET lock_timeout='250ms'");
      await assert.rejects(client!.query('ALTER TABLE conversations ADD COLUMN acceptance_must_not_exist text'), (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03');
      const column = await blocker.query("SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='acceptance_must_not_exist'");
      assert.equal(column.rowCount, 0);
    } finally { await blocker.query('ROLLBACK'); await blocker.end(); await client!.query("SET lock_timeout='5s'"); }
  });
  await check('batch backfill + D2 validates all rows, no content changes', async () => {
    const { backfillMessageOrg } = await import('./backfill-message-org-id.js');
    const dry = await backfillMessageOrg(client!, { apply: false, batchSize: 200, maxBatches: 20 }); assert.equal(dry.remaining, 1202);
    const partial = await backfillMessageOrg(client!, { apply: true, batchSize: 200, maxBatches: 1 }); assert.equal(partial.changed, 200); assert.equal(partial.remaining, 1002);
    const resumed = await backfillMessageOrg(client!, { apply: true, batchSize: 200, maxBatches: 20 }); assert.equal(resumed.remaining, 0); assert.equal(resumed.invalid, 0);
    const repeated = await backfillMessageOrg(client!, { apply: true, batchSize: 200, maxBatches: 20 }); assert.equal(repeated.changed, 0);
    const sql = readFileSync(join(repo, 'docs/ops/sql/TIKTOK-TT04D-VALIDATE.sql'), 'utf8'); measurements.validationSha256 = hash(sql); await client!.query(sql);
    assert.deepEqual(await snapshot(), before);
    measurements.backfill = { dry, partial, resumed, repeated };
    measurements.databaseBytes = Number((await client!.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
  });
  await check('restored database matches the final Prisma datamodel', async () => {
    const diff = run(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
      '--from-config-datasource', '--to-schema', join(backend, 'prisma/schema.prisma'), '--exit-code'], {
      ...process.env, DATABASE_URL: `postgresql://tt04_owner@127.0.0.1:${port}/tt04_restored`,
    });
    // --exit-code: 0 only for empty diff, 2 throws via execFileSync for drift.
    measurements.schemaDiff = diff.trim();
    measurements.finalSchemaSha256 = hash(readFileSync(join(backend, 'prisma/schema.prisma')));
  });

  // No inherited target/secrets; import real runtime modules only after isolation is fixed.
  process.env.DATABASE_URL = `postgresql://tt04_owner@127.0.0.1:${port}/tt04_restored`;
  process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.CHANNELS_ENABLED = 'true'; process.env.MOCK_CHANNEL_ENABLED = 'true';
  process.env.MOCK_CHANNEL_WORKER_SECRET = randomBytes(32).toString('hex');
  process.env.TIKTOK_PERSONAL_ENABLED = 'false'; process.env.TIKTOK_PERSONAL_OUTBOUND_ENABLED = 'false';
  process.env.TIKTOK_PERSONAL_INBOUND_ENABLED = 'false'; process.env.RLS_SET_CONFIG = 'false'; process.env.TENANT_GUARD_MODE = 'off';
  process.env.SOCKET_REQUIRE_ACCESS_TYP = 'true';
  prisma = (await import('../../src/shared/database/prisma-client.js')).prisma;
  await check('Prisma actual writes/reads with derived message org', async () => {
    const contact = await prisma!.contact.create({ data: { id: id(64), orgId: id(1), fullName: 'Fixture channel contact' } });
    const account = await prisma!.channelAccount.create({ data: { id: id(81), orgId: id(1), ownerUserId: id(11), provider: 'MOCK_BROWSER', displayName: 'Fixture channel', enabled: true, inboundEnabled: true, status: 'CONNECTED' } });
    await prisma!.browserSessionRef.create({ data: { orgId: id(1), channelAccountId: account.id, profileRef: 'acceptance-opaque-profile', epoch: 1n, verifiedAt: new Date() } });
    await prisma!.channelAccountAccess.create({ data: { orgId: id(1), channelAccountId: account.id, userId: id(12), permission: 'read' } });
    const conversation = await prisma!.conversation.create({ data: { id: id(91), orgId: id(1), channelAccountId: account.id, contactId: contact.id, externalThreadId: 'fixture-channel-thread', unreadCount: 1, lastMessageAt: new Date() } });
    const message = await prisma!.message.create({ data: { id: id(201), conversationId: conversation.id, externalMessageId: 'fixture-external-1', senderType: 'contact', content: 'CHANNEL_ACCEPTANCE_01', sentAt: new Date() } });
    const secondContact = await prisma!.contact.create({ data: { id: id(65), orgId: id(1), fullName: 'Fixture second channel contact' } });
    const secondAccount = await prisma!.channelAccount.create({ data: {
      id: id(82), orgId: id(1), ownerUserId: id(11), provider: 'MOCK_BROWSER',
      displayName: 'Fixture second channel', enabled: true, inboundEnabled: true, status: 'CONNECTED',
    } });
    await prisma!.browserSessionRef.create({ data: {
      orgId: id(1), channelAccountId: secondAccount.id,
      profileRef: 'acceptance-opaque-profile-second', epoch: 7n, verifiedAt: new Date(),
    } });
    await prisma!.channelAccountAccess.create({ data: {
      orgId: id(1), channelAccountId: secondAccount.id, userId: id(13), permission: 'chat',
    } });
    await prisma!.conversation.create({ data: {
      id: id(92), orgId: id(1), channelAccountId: secondAccount.id, contactId: secondContact.id,
      externalThreadId: 'fixture-second-channel-thread', unreadCount: 0, lastMessageAt: new Date(),
    } });
    await prisma!.message.create({ data: {
      id: id(202), conversationId: id(92), externalMessageId: 'fixture-external-2',
      senderType: 'contact', content: 'CHANNEL_ACCEPTANCE_02', sentAt: new Date(),
    } });
    assert.equal(message.orgId, id(1)); assert.equal(conversation.zaloAccountId, null);
    await assert.rejects(prisma!.message.create({ data: { conversationId: id(91), orgId: id(2), senderType: 'contact', content: 'spoof', sentAt: new Date() } }));
    await assert.rejects(prisma!.message.create({ data: { conversationId: id(91), externalMessageId: 'fixture-external-1', senderType: 'contact', content: 'duplicate', sentAt: new Date() } }));
    const virtual = await prisma!.message.create({ data: { conversationId: id(53), senderType: 'self', isLocal: true, content: 'VIRTUAL_POST_MIGRATION', sentAt: new Date() } }); assert.equal(virtual.orgId, id(1));
  });
  app = Fastify({ logger: false }); await app.register(jwt, { secret: process.env.JWT_SECRET });
  io = new Server(app.server, { transports: ['websocket'], cors: { origin: '*' } }); app.decorate('io', io);
  const { registerSocketAuth } = await import('../../src/shared/realtime/socket-auth.js'); registerSocketAuth(io, app);
  const channelSocket = await import('../../src/modules/channels/channel-socket.js'); channelSocket.registerChannelSocketHandlers(io);
  const { channelInboxRoutes } = await import('../../src/modules/channels/channel-inbox-routes.js'); await app.register(channelInboxRoutes);
  const { mockChannelAccountRoutes } = await import('../../src/modules/channels/mock-channel-account-routes.js'); await app.register(mockChannelAccountRoutes);
  const { channelEventIngressRoutes } = await import('../../src/modules/channels/event-ingress.js'); await app.register(channelEventIngressRoutes);
  const { channelOutboundRoutes } = await import('../../src/modules/channels/outbound-command-routes.js'); await app.register(channelOutboundRoutes);
  const { channelPilotRoutes } = await import('../../src/modules/channels/pilot-routes.js'); await app.register(channelPilotRoutes);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  const tokens = new Map<number, string>();
  let channelEpoch = '1';
  const secondChannelEpoch = '7';
  // Reader deliberately carries a stale owner claim; current DB role must win.
  for (const n of [11, 12, 13, 14, 21]) tokens.set(n, app.jwt.sign({ id: id(n), orgId: id(n === 21 ? 2 : 1), role: [11, 12, 21].includes(n) ? 'owner' : 'member', typ: 'access' }, { expiresIn: '10m' }));
  const request = (n: number, path: string, method = 'GET') => fetch(`${base}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(n)}` } });
  const signedWorkerRequest = (path: string, nonce: string, payload: unknown) => {
    const body = JSON.stringify(payload), timestamp = Date.now().toString();
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.zalocrm.channel-command+json',
        'x-channel-timestamp': timestamp,
        'x-channel-nonce': nonce,
        'x-channel-signature': createHmac('sha256', workerKey((payload as { accountId: string }).accountId))
          .update(`${timestamp}.${nonce}.${body}`).digest('hex'),
      },
      body,
    });
  };
  const signedPilotRequest = (path: string, nonce: string, payload: unknown) => {
    const body = JSON.stringify(payload), timestamp = Date.now().toString();
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.zalocrm.channel-pilot+json',
        'x-channel-timestamp': timestamp,
        'x-channel-nonce': nonce,
        'x-channel-signature': createHmac('sha256', workerKey((payload as { accountId: string }).accountId))
          .update(`${timestamp}.${nonce}.${body}`).digest('hex'),
      },
      body,
    });
  };
  await check('actual JWT HTTP list/count/history and cross-org/no-grant denial', async () => {
    assert.equal((await fetch(`${base}/api/v1/channel-inbox`)).status, 401);
    assert.equal((await fetch(`${base}/api/v1/channel-inbox`, { headers: { Authorization: 'Bearer invalid-fixture-jwt' } })).status, 401);
    const response = await request(12, '/channel-inbox'); assert.equal(response.status, 200);
    const body = await response.json() as { conversations: Array<{ id: string }>; total: number; counts: { total: number } };
    assert(body.conversations.some(row => row.id === id(91))); assert.equal(body.total, body.conversations.length); assert.equal(body.counts.total, body.total);
    const messages = await (await request(12, `/channel-inbox/${id(91)}/messages`)).json() as { messages: Array<{ content: string }> }; assert.equal(messages.messages[0].content, 'CHANNEL_ACCEPTANCE_01');
    assert.equal((await request(13, `/channel-inbox/${id(91)}/messages`)).status, 404);
    assert.equal((await request(12, `/channel-inbox/${id(92)}/messages`)).status, 404);
    const secondMessages = await (await request(13, `/channel-inbox/${id(92)}/messages`)).json() as {
      messages: Array<{ content: string }>;
    };
    assert.equal(secondMessages.messages[0].content, 'CHANNEL_ACCEPTANCE_02');
    assert.equal((await request(21, `/channel-inbox/${id(91)}`)).status, 404);
    assert.equal((await request(14, `/channel-inbox/${id(91)}`)).status, 404);
    assert.equal((await request(12, `/channel-inbox/${id(91)}/messages`, 'POST')).status, 404);
    const privateSearch = await (await request(11, '/channel-inbox?search=PRIVATE_FIXTURE')).json() as { total: number }; assert.equal(privateSearch.total, 0);
  });
  await check('TT05 mock QR and identity confirmation remain owner/admin controlled', async () => {
    assert.equal((await request(12, `/channel-accounts/mock/${id(81)}/connect`, 'POST')).status, 404);
    const connected = await request(11, `/channel-accounts/mock/${id(81)}/connect`, 'POST');
    assert.equal(connected.status, 200);
    const qr = await connected.json() as { qr: string; epoch: string };
    assert.match(qr.qr, /^mock-qr:/); channelEpoch = qr.epoch;
    const confirmed = await fetch(`${base}/api/v1/channel-accounts/mock/${id(81)}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.get(11)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ externalAccountId: 'tt05-acceptance-account', displayName: 'Fixture channel', epoch: qr.epoch }),
    });
    assert.equal(confirmed.status, 200);
    const stored = await prisma!.channelAccount.findUnique({ where: { id: id(81) }, include: { session: true } });
    assert.equal(stored?.status, 'CONNECTED'); assert.equal(stored?.outboundEnabled, false);
    assert.equal(stored?.session?.epoch.toString(), channelEpoch);
  });
  await check('TT06 outbox is idempotent, single-claim and resolves atomically', async () => {
    const enabled = await fetch(`${base}/api/v1/channel-accounts/mock/${id(81)}/outbound`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokens.get(11)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enabled.status, 200);
    const idempotencyKey = randomUUID();
    const send = () => fetch(`${base}/api/v1/channel-inbox/${id(91)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.get(11)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'TT06_ACCEPTANCE_OUTBOUND', idempotencyKey }),
    });
    const first = await send(); assert.equal(first.status, 202);
    const pending = await first.json() as { id: string; clientEchoId: string; channelSendState: string };
    assert.equal(pending.channelSendState, 'PENDING');
    const retry = await send(); assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { id: string }).id, pending.id);
    assert.equal(await prisma!.outboundCommand.count({ where: { channelAccountId: id(81), idempotencyKey } }), 1);

    const signedWorker = (path: string, nonce: string, payload: unknown) => {
      const body = JSON.stringify(payload), timestamp = Date.now().toString();
      return fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.zalocrm.channel-command+json',
          'x-channel-timestamp': timestamp,
          'x-channel-nonce': nonce,
          'x-channel-signature': createHmac('sha256', workerKey((payload as { accountId: string }).accountId))
            .update(`${timestamp}.${nonce}.${body}`).digest('hex'),
        },
        body,
      });
    };
    const claimPayload = { accountId: id(81), epoch: channelEpoch };
    const [claimA, claimB] = await Promise.all([
      signedWorker('/internal/channel-workers/commands/claim', `claim:${id(81)}:${channelEpoch}`, claimPayload),
      signedWorker('/internal/channel-workers/commands/claim', `claim:${id(81)}:${channelEpoch}`, claimPayload),
    ]);
    assert.deepEqual([claimA.status, claimB.status].sort(), [200, 204]);
    const claimedResponse = claimA.status === 200 ? claimA : claimB;
    const claimed = (await claimedResponse.json() as { command: { commandId: string } }).command;
    const command = await prisma!.outboundCommand.findUnique({ where: { id: claimed.commandId } });
    assert.equal(command?.status, 'PROCESSING');
    assert.equal((await prisma!.message.findUnique({ where: { id: pending.id } }))?.channelSendState, 'PROCESSING');

    const resultPayload = {
      accountId: id(81),
      epoch: channelEpoch,
      result: { kind: 'confirmed', externalMessageId: 'tt06-fixture-message-1' },
    };
    const resolved = await signedWorker(
      `/internal/channel-workers/commands/${claimed.commandId}/result`,
      `result:${claimed.commandId}`,
      resultPayload,
    );
    assert.equal(resolved.status, 200);
    const duplicateResult = await signedWorker(
      `/internal/channel-workers/commands/${claimed.commandId}/result`,
      `result:${claimed.commandId}`,
      resultPayload,
    );
    assert.equal(duplicateResult.status, 200);
    const finalCommand = await prisma!.outboundCommand.findUnique({ where: { id: claimed.commandId } });
    const finalMessage = await prisma!.message.findUnique({ where: { id: pending.id } });
    assert.equal(finalCommand?.status, 'CONFIRMED');
    assert.equal(finalMessage?.channelSendState, 'CONFIRMED');
    assert.equal(finalMessage?.externalMessageId, 'tt06-fixture-message-1');

    const unknownKey = randomUUID();
    const second = await fetch(`${base}/api/v1/channel-inbox/${id(91)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.get(11)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'TT06_ACCEPTANCE_UNKNOWN', idempotencyKey: unknownKey }),
    });
    assert.equal(second.status, 202);
    const unknownMessage = await second.json() as { id: string };
    const secondClaim = await signedWorker(
      '/internal/channel-workers/commands/claim',
      `claim:${id(81)}:${channelEpoch}`,
      claimPayload,
    );
    assert.equal(secondClaim.status, 200);
    const unknownCommandId = (await secondClaim.json() as { command: { commandId: string } }).command.commandId;
    await prisma!.outboundCommand.update({
      where: { id: unknownCommandId },
      data: { submittedAt: new Date(Date.now() - 120_000) },
    });
    const { reapStaleOutboundCommands } = await import('../../src/modules/channels/outbound-command-service.js');
    assert.equal(await reapStaleOutboundCommands(new Date(Date.now() - 60_000)), 1);
    assert.equal((await prisma!.outboundCommand.findUnique({ where: { id: unknownCommandId } }))?.status, 'UNKNOWN');
    assert.equal((await prisma!.message.findUnique({ where: { id: unknownMessage.id } }))?.channelSendState, 'UNKNOWN');
    const noRetry = await signedWorker(
      '/internal/channel-workers/commands/claim',
      `claim:${id(81)}:${channelEpoch}`,
      claimPayload,
    );
    assert.equal(noRetry.status, 204);
    measurements.tt06Outbox = { idempotent: true, singleClaim: true, confirmed: true, staleBecomesUnknown: true, noAutomaticRetry: true };
  });
  const openSocket = async (n: number) => {
    const socket = connectSocket(base, { transports: ['websocket'], auth: { token: tokens.get(n) }, reconnection: false, timeout: 5000 }); sockets.push(socket);
    await new Promise<void>((done, reject) => { socket.once('connect', done); socket.once('connect_error', reject); }); return socket;
  };
  const subscribe = (socket: Socket, purpose = 'read') => new Promise<{ ok: boolean }>((done, reject) => {
    socket.timeout(5000).emit('channel:subscribe', { accountId: id(81), purpose }, (error: Error | null, result: { ok: boolean }) => error ? reject(error) : done(result));
  });
  await check('actual Socket.IO read/control separation and unauthorized joins', async () => {
    const reader = await openSocket(12), owner = await openSocket(11), outsider = await openSocket(21);
    assert.equal((await subscribe(reader)).ok, true); assert.equal((await subscribe(reader, 'control')).ok, false);
    assert.equal((await subscribe(owner, 'control')).ok, true); assert.equal((await subscribe(outsider)).ok, false);
    const ownerQr = new Promise<void>(done => owner.once('channel:connection', event => { assert.equal(event.qr, 'FAKE_QR_ACCEPTANCE_ONLY'); done(); }));
    const readEvents: unknown[] = [], qrEvents: unknown[] = []; reader.on('channel:message', event => readEvents.push(event)); reader.on('channel:connection', event => qrEvents.push(event));
    const received = new Promise<void>(done => reader.once('channel:message', () => done()));
    await channelSocket.emitAuthorizedChannelEvent({ io: io!, orgId: id(1), accountId: id(81), purpose: 'read', event: 'channel:message', payload: { conversationId: id(91) } });
    await Promise.race([received, new Promise((_, reject) => setTimeout(() => reject(new Error('No realtime message')), 5000))]);
    assert.equal(readEvents.length, 1);
    await channelSocket.emitAuthorizedChannelEvent({ io: io!, orgId: id(1), accountId: id(81), purpose: 'control', event: 'channel:connection', payload: { qr: 'FAKE_QR_ACCEPTANCE_ONLY' } });
    await Promise.race([ownerQr, new Promise((_, reject) => setTimeout(() => reject(new Error('No control event')), 5000))]);
    // ACK is a same-socket FIFO barrier: a forbidden QR would be received before it.
    assert.equal((await subscribe(reader)).ok, true);
    assert.equal(qrEvents.length, 0);
    measurements.authorizedHttp = true; measurements.authorizedSocket = true;
  });
  await check('TT05 signed ingress persists/deduplicates inbound and emits read-room event', async () => {
    const reader = sockets.find(socket => socket.connected && socket.auth && (socket.auth as { token?: string }).token === tokens.get(12));
    assert(reader);
    const received = new Promise<{ conversationId: string; messageId: string }>(done => reader.once('channel:message', done));
    const envelope = {
      version: 1,
      eventKey: 'mock:tt05-thread:tt05-message-1',
      accountId: id(81),
      epoch: channelEpoch,
      kind: 'message.observed',
      observedAt: new Date().toISOString(),
      thread: { id: 'tt05-thread', displayName: 'TT05 acceptance contact' },
      sender: { externalUserId: 'tt05-customer-1', displayName: 'TT05 acceptance contact' },
      message: { id: 'tt05-message-1', direction: 'inbound', text: 'TT05_ACCEPTANCE_INBOUND', sentAt: new Date().toISOString() },
    };
    const body = JSON.stringify(envelope), timestamp = Date.now().toString();
    const headers = {
      'content-type': 'application/vnd.zalocrm.channel-event+json',
      'x-channel-timestamp': timestamp,
      'x-channel-nonce': envelope.eventKey,
      'x-channel-signature': createHmac('sha256', workerKey(envelope.accountId)).update(`${timestamp}.${envelope.eventKey}.${body}`).digest('hex'),
    };
    const first = await fetch(`${base}/internal/channel-workers/events`, { method: 'POST', headers, body });
    assert.equal(first.status, 202);
    const event = await Promise.race([received, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No TT05 realtime event')), 5000))]);
    const stored = await prisma!.message.findUnique({ where: { conversationId_externalMessageId: { conversationId: event.conversationId, externalMessageId: 'tt05-message-1' } } });
    assert.equal(stored?.content, 'TT05_ACCEPTANCE_INBOUND');
    const retryTimestamp = Date.now().toString();
    const retryHeaders = {
      ...headers,
      'x-channel-timestamp': retryTimestamp,
      'x-channel-signature': createHmac('sha256', workerKey(envelope.accountId)).update(`${retryTimestamp}.${envelope.eventKey}.${body}`).digest('hex'),
    };
    const duplicate = await fetch(`${base}/internal/channel-workers/events`, { method: 'POST', headers: retryHeaders, body });
    assert.equal(duplicate.status, 200);
    assert.equal(await prisma!.message.count({ where: { conversationId: event.conversationId, externalMessageId: 'tt05-message-1' } }), 1);
    assert.equal((await prisma!.conversation.findUnique({ where: { id: event.conversationId } }))?.unreadCount, 1);
    measurements.tt05Ingress = { signed: true, deduplicated: true, realtime: true };
  });
  await check('TT07 signed heartbeat, read-only reconciliation and pilot alerts', async () => {
    const signedPilot = (path: string, nonce: string, payload: unknown) => {
      const body = JSON.stringify(payload), timestamp = Date.now().toString();
      return fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/vnd.zalocrm.channel-pilot+json',
          'x-channel-timestamp': timestamp,
          'x-channel-nonce': nonce,
          'x-channel-signature': createHmac('sha256', workerKey((payload as { accountId: string }).accountId))
            .update(`${timestamp}.${nonce}.${body}`).digest('hex'),
        },
        body,
      });
    };
    const heartbeat = await signedPilot('/internal/channel-workers/pilot/heartbeat', `heartbeat:${id(81)}`, {
      accountId: id(81),
      epoch: channelEpoch,
      sessionState: 'authenticated',
      rssBytes: 128 * 1024 * 1024,
      heapUsedBytes: 32 * 1024 * 1024,
      cpuPercent: 15,
      eventLoopP95Ms: 5,
      profileBytes: 64 * 1024 * 1024,
      ledgerBytes: 4 * 1024,
      ledgerMessages: 3,
      ledgerCommands: 2,
      observedAt: new Date().toISOString(),
    });
    assert.equal(heartbeat.status, 200);
    const crmMessages = await prisma!.message.findMany({
      where: { conversation: { channelAccountId: id(81) }, externalMessageId: { not: null } },
      select: { externalMessageId: true },
    });
    const crmCommands = await prisma!.outboundCommand.findMany({
      where: { channelAccountId: id(81) },
      select: { id: true },
    });
    const reconciliation = await signedPilot('/internal/channel-workers/pilot/reconcile', `reconcile:${id(81)}`, {
      accountId: id(81),
      epoch: channelEpoch,
      messageIds: crmMessages.map(row => row.externalMessageId),
      commandIds: crmCommands.map(row => row.id),
    });
    assert.equal(reconciliation.status, 200);
    const reconciliationBody = await reconciliation.json() as {
      checkedAt: string; workerMessageCount: number; crmMessageCount: number;
      missingInCrm: number; missingInWorker: number;
      workerCommandCount: number; crmCommandCount: number; commandMismatch: number;
    };
    assert.match(reconciliationBody.checkedAt, /^\d{4}-/);
    assert.equal(reconciliationBody.workerMessageCount, crmMessages.length);
    assert.equal(reconciliationBody.crmMessageCount, crmMessages.length);
    assert.equal(reconciliationBody.missingInCrm, 0);
    assert.equal(reconciliationBody.missingInWorker, 0);
    assert.equal(reconciliationBody.workerCommandCount, crmCommands.length);
    assert.equal(reconciliationBody.crmCommandCount, crmCommands.length);
    assert.equal(reconciliationBody.commandMismatch, 0);
    const pilot = await request(11, `/channel-accounts/mock/${id(81)}/pilot`);
    assert.equal(pilot.status, 200);
    const status = await pilot.json() as {
      readyForRealPilot: boolean; status: string; alerts: string[];
      worker: { rssBytes: number }; reconciliation: { commandMismatch: number };
    };
    assert.equal(status.readyForRealPilot, false);
    assert.equal(status.status, 'DEGRADED');
    assert(status.alerts.includes('UNKNOWN_DELIVERY_REVIEW'));
    assert.equal(status.worker.rssBytes, 128 * 1024 * 1024);
    assert.equal(status.reconciliation.commandMismatch, 0);
    assert.equal((await request(12, `/channel-accounts/mock/${id(81)}/pilot`)).status, 404);
    measurements.tt07Pilot = { heartbeat: true, reconciliationReadOnly: true, alerts: status.alerts };
  });
  await check('TT08 isolation and TT09 fleet capacity remain enforced', async () => {
    const enableSecond = await fetch(`${base}/api/v1/channel-accounts/mock/${id(82)}/outbound`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokens.get(11)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enableSecond.status, 200);
    const send = (user: number, conversationId: string, text: string) => fetch(
      `${base}/api/v1/channel-inbox/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.get(user)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text, idempotencyKey: randomUUID() }),
      },
    );
    const [sendA, sendB] = await Promise.all([
      send(11, id(91), 'TT08_ACCOUNT_A'),
      send(13, id(92), 'TT08_ACCOUNT_B'),
    ]);
    assert.equal(sendA.status, 202);
    assert.equal(sendB.status, 202);

    const [claimA, claimB] = await Promise.all([
      signedWorkerRequest('/internal/channel-workers/commands/claim', `claim:${id(81)}:${channelEpoch}`, {
        accountId: id(81), epoch: channelEpoch,
      }),
      signedWorkerRequest('/internal/channel-workers/commands/claim', `claim:${id(82)}:${secondChannelEpoch}`, {
        accountId: id(82), epoch: secondChannelEpoch,
      }),
    ]);
    assert.equal(claimA.status, 200);
    assert.equal(claimB.status, 200);
    const commandA = (await claimA.json() as { command: { commandId: string; accountId: string } }).command;
    const commandB = (await claimB.json() as { command: { commandId: string; accountId: string } }).command;
    assert.notEqual(commandA.commandId, commandB.commandId);
    assert.equal(commandA.accountId, id(81));
    assert.equal(commandB.accountId, id(82));
    const [resultA, resultB] = await Promise.all([
      signedWorkerRequest(`/internal/channel-workers/commands/${commandA.commandId}/result`, `result:${commandA.commandId}`, {
        accountId: id(81), epoch: channelEpoch,
        result: { kind: 'confirmed', externalMessageId: 'tt08-account-a-message' },
      }),
      signedWorkerRequest(`/internal/channel-workers/commands/${commandB.commandId}/result`, `result:${commandB.commandId}`, {
        accountId: id(82), epoch: secondChannelEpoch,
        result: { kind: 'confirmed', externalMessageId: 'tt08-account-b-message' },
      }),
    ]);
    assert.equal(resultA.status, 200);
    assert.equal(resultB.status, 200);

    const observedAt = new Date().toISOString();
    const [heartbeatA, heartbeatB] = await Promise.all([
      signedPilotRequest('/internal/channel-workers/pilot/heartbeat', `heartbeat:${id(81)}`, {
        accountId: id(81), epoch: channelEpoch, sessionState: 'authenticated',
        rssBytes: 111, heapUsedBytes: 11, cpuPercent: 11, eventLoopP95Ms: 2,
        profileBytes: 1_111, ledgerBytes: 111, ledgerMessages: 4, ledgerCommands: 3, observedAt,
      }),
      signedPilotRequest('/internal/channel-workers/pilot/heartbeat', `heartbeat:${id(82)}`, {
        accountId: id(82), epoch: secondChannelEpoch, sessionState: 'authenticated',
        rssBytes: 222, heapUsedBytes: 22, cpuPercent: 22, eventLoopP95Ms: 3,
        profileBytes: 2_222, ledgerBytes: 222, ledgerMessages: 2, ledgerCommands: 1, observedAt,
      }),
    ]);
    assert.equal(heartbeatA.status, 200);
    assert.equal(heartbeatB.status, 200);
    const pilotA = await (await request(11, `/channel-accounts/mock/${id(81)}/pilot`)).json() as {
      worker: { rssBytes: number };
    };
    const pilotB = await (await request(11, `/channel-accounts/mock/${id(82)}/pilot`)).json() as {
      worker: { rssBytes: number };
    };
    assert.equal(pilotA.worker.rssBytes, 111);
    assert.equal(pilotB.worker.rssBytes, 222);
    const fleetResponse = await request(11, '/channel-accounts/mock/fleet');
    assert.equal(fleetResponse.status, 200);
    const fleet = await fleetResponse.json() as {
      readyForRealPilot: boolean;
      capacity: { activeWorkers: number; effectiveLimit: number; remainingSlots: number; alerts: string[] };
    };
    assert.equal(fleet.readyForRealPilot, false);
    assert.equal(fleet.capacity.activeWorkers, 2);
    assert.equal(fleet.capacity.effectiveLimit, 2);
    assert.equal(fleet.capacity.remainingSlots, 0);
    assert(fleet.capacity.alerts.includes('WORKER_CAPACITY_REACHED'));
    assert.equal((await request(12, '/channel-accounts/mock/fleet')).status, 404);
    const thirdAccount = await fetch(`${base}/api/v1/channel-accounts/mock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.get(11)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'TT09 third account must be rejected' }),
    });
    assert.equal(thirdAccount.status, 409);
    assert.equal((await thirdAccount.json() as { code: string }).code, 'TT09_WORKER_CAPACITY_REACHED');
    await prisma!.channelAccount.create({ data: {
      id: id(83), orgId: id(1), ownerUserId: id(11), provider: 'MOCK_BROWSER',
      displayName: 'TT09 admission fixture', enabled: true, inboundEnabled: true, status: 'DISCONNECTED',
    } });
    const connectThird = await request(11, `/channel-accounts/mock/${id(83)}/connect`, 'POST');
    assert.equal(connectThird.status, 409);
    assert.equal((await connectThird.json() as { code: string }).code, 'TT09_WORKER_CAPACITY_REACHED');
    await prisma!.channelAccount.delete({ where: { id: id(83) } });
    assert.equal((await request(12, `/channel-inbox/${id(92)}/messages`)).status, 404);
    assert.equal((await request(13, `/channel-inbox/${id(91)}/messages`)).status, 404);
    measurements.tt08Isolation = {
      accountScopedAcl: true,
      concurrentClaims: true,
      independentResults: true,
      independentHeartbeats: true,
      fleetCapacityReached: true,
      thirdAccountRejected: true,
      thirdWorkerAdmissionRejected: true,
    };
    measurements.tt09Fleet = {
      activeWorkers: fleet.capacity.activeWorkers,
      effectiveLimit: fleet.capacity.effectiveLimit,
      remainingSlots: fleet.capacity.remainingSlots,
      alerts: fleet.capacity.alerts,
      thirdAccountRejected: true,
      thirdWorkerAdmissionRejected: true,
    };
  });

  if (process.argv.includes('--browser')) {
    await check('real Vue composable + read-only component over HTTP/socket', async () => {
      const { createServer: createViteServer } = await import('../../../frontend/node_modules/vite/dist/node/index.js');
      const dev = await createViteServer({ configFile: join(repo, 'frontend/vite.config.ts'), root: join(repo, 'frontend'), server: {
        host: '127.0.0.1', port: await unusedPort(), strictPort: true, proxy: { '/api': base, '/socket.io': { target: base, ws: true } },
      } }); vite = dev; await dev.listen();
      const viteAddress = dev.httpServer!.address(); assert(viteAddress && typeof viteAddress !== 'string');
      process.env.PLAYWRIGHT_BROWSERS_PATH = join(repo, 'poc/tiktok-personal-qr/runtime/browsers');
      const { chromium } = await import('../../../poc/tiktok-personal-qr/node_modules/playwright/index.mjs');
      const launched = await chromium.launch({ headless: true }); browser = launched;
      const page = await launched.newPage();
      await page.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token); (window as unknown as { tt04Fixture: unknown }).tt04Fixture = user;
      }, { token: tokens.get(12)!, user: { id: id(12), orgId: id(1), role: 'member', fullName: 'Fixture reader', grants: { conversation: { access: true } } } });
      await page.goto(`http://127.0.0.1:${viteAddress.port}/tt04-acceptance.html`);
      await page.getByRole('button', { name: 'Fixture channel contact' }).click();
      await page.getByText('CHANNEL_ACCEPTANCE_01', { exact: true }).waitFor();
      assert.equal(await page.locator('textarea,[contenteditable=true]').count(), 0);
      await page.screenshot({ path: join(runtime, 'inbox-before-revoke.png'), fullPage: true });
      const revoke = await request(11, `/channel-accounts/${id(81)}/access/${id(12)}`, 'DELETE'); assert.equal(revoke.status, 200);
      await page.getByText('CHANNEL_ACCEPTANCE_01', { exact: true }).waitFor({ state: 'hidden' });
      await page.getByText('2 hội thoại', { exact: true }).waitFor();
      assert.equal((await request(12, `/channel-inbox/${id(91)}/messages`)).status, 404);
      await page.screenshot({ path: join(runtime, 'inbox-after-revoke.png'), fullPage: true });
      measurements.browser = 'PASS'; await page.close();
    });
  } else {
    await check('HTTP grant revoke evicts real socket and blocks later history', async () => {
      const response = await request(11, `/channel-accounts/${id(81)}/access/${id(12)}`, 'DELETE'); assert.equal(response.status, 200);
      assert.equal((await request(12, `/channel-inbox/${id(91)}/messages`)).status, 404);
    });
  }
  await check('TT08 rollback of account A does not affect account B', async () => {
    const queuedForB = await fetch(`${base}/api/v1/channel-inbox/${id(92)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.get(13)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'TT08_ACCOUNT_B_AFTER_A_ROLLBACK', idempotencyKey: randomUUID() }),
    });
    assert.equal(queuedForB.status, 202);
    const beforeCommands = await prisma!.outboundCommand.count({ where: { channelAccountId: id(81) } });
    const rollback = await request(11, `/channel-accounts/mock/${id(81)}/rollback`, 'POST');
    assert.equal(rollback.status, 200);
    const body = await rollback.json() as { epoch: string; pendingCommandsPreserved: boolean };
    assert.equal(body.pendingCommandsPreserved, true);
    assert(BigInt(body.epoch) > BigInt(channelEpoch));
    const account = await prisma!.channelAccount.findUnique({ where: { id: id(81) }, include: { session: true } });
    assert.equal(account?.status, 'DISCONNECTED');
    assert.equal(account?.inboundEnabled, false);
    assert.equal(account?.outboundEnabled, false);
    assert.equal(await prisma!.outboundCommand.count({ where: { channelAccountId: id(81) } }), beforeCommands);
    const secondAccount = await prisma!.channelAccount.findUnique({ where: { id: id(82) }, include: { session: true } });
    assert.equal(secondAccount?.status, 'CONNECTED');
    assert.equal(secondAccount?.inboundEnabled, true);
    assert.equal(secondAccount?.outboundEnabled, true);
    assert.equal(secondAccount?.session?.epoch.toString(), secondChannelEpoch);
    const staleA = await signedWorkerRequest(
      '/internal/channel-workers/commands/claim',
      `claim:${id(81)}:${channelEpoch}`,
      { accountId: id(81), epoch: channelEpoch },
    );
    assert.equal(staleA.status, 204);
    const claimB = await signedWorkerRequest(
      '/internal/channel-workers/commands/claim',
      `claim:${id(82)}:${secondChannelEpoch}`,
      { accountId: id(82), epoch: secondChannelEpoch },
    );
    assert.equal(claimB.status, 200);
    const claimedB = (await claimB.json() as { command: { commandId: string } }).command;
    const resultB = await signedWorkerRequest(
      `/internal/channel-workers/commands/${claimedB.commandId}/result`,
      `result:${claimedB.commandId}`,
      {
        accountId: id(82), epoch: secondChannelEpoch,
        result: { kind: 'confirmed', externalMessageId: 'tt08-account-b-after-rollback' },
      },
    );
    assert.equal(resultB.status, 200);
    measurements.tt08Rollback = {
      accountAEpochFenced: true,
      accountACommandsPreserved: true,
      accountBStillConnected: true,
      accountBStillClaimable: true,
    };
  });
  await check('flags OFF retain Zalo data and prevent new channel access', async () => {
    process.env.CHANNELS_ENABLED = 'false';
    const body = await (await request(11, '/channel-accounts')).json() as { available: boolean }; assert.equal(body.available, false);
    assert.equal((await request(11, '/channel-inbox')).status, 503);
    const old = await prisma!.message.count({ where: { conversationId: id(51) } }); assert.equal(old, 1200);
    const virtual = await prisma!.conversation.findUnique({ where: { id: id(53) } }); assert.equal(virtual?.isVirtual, true);
  });
  measurements.finalChecks = (await client.query(`SELECT conname,convalidated FROM pg_constraint
    WHERE conname IN ('conversations_account_xor','messages_org_id_conversation_id_fkey') ORDER BY conname`)).rows;
}

try { await main(); }
catch (error) { console.error('Acceptance failed:', error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted-url]').slice(0, 500) : 'unknown'); process.exitCode = 1; }
finally {
  await browser?.close().catch(() => {}); await vite?.close().catch(() => {});
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise<void>(done => io!.close(() => done()));
  await app?.close().catch(() => {}); await prisma?.$disconnect().catch(() => {}); await client?.end().catch(() => {});
  if (started) {
    try { run(join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']); measurements.postgresStopped = true; }
    catch { measurements.postgresStopped = false; process.exitCode = 1; }
  }
  mkdirSync(runtime, { recursive: true });
  const report = { at: new Date().toISOString(), scope: 'synthetic full schema; no production data or real TikTok', baseline: 'bf31cdf', checks, measurements, passed: !process.exitCode };
  writeFileSync(join(runtime, 'results.json'), JSON.stringify(report, null, 2));
  console.log(`Results: ${join(runtime, 'results.json')}`);
}
