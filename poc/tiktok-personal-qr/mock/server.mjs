// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ACCOUNT, resolveAccount } from '../src/config.mjs';
const page = await readFile(new URL('./public/index.html', import.meta.url));
export async function createMock({
  port = 0,
  account = ACCOUNT,
  ticketTtlMs = 60_000,
  sessionTtlMs = 3_600_000,
} = {}) {
  const tickets = new Map(), sessions = new Map(), csrf = randomBytes(24).toString('hex');
  const messages = [], commands = new Map();
  let origin;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.headers.host !== new URL(origin).host) return reply(403, { error: 'HOST_DENIED' });
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      return res.end(page);
    }
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') return reply(200, { csrf });
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)mock_session=([a-f0-9]+)/)?.[1];
    const session = sessions.get(cookie);
    if (req.method === 'GET' && url.pathname === '/api/session') return reply(200,
      session && session.expiresAt > Date.now() ? { authenticated: true, accountId: session.accountId, needsVerification: session.needsVerification } : { authenticated: false });
    if (req.method === 'GET' && url.pathname === '/api/messages') {
      if (!session || session.expiresAt <= Date.now() || session.needsVerification || session.accountId !== account) return reply(401, { error: 'IDENTITY_REQUIRED' });
      return reply(200, { messages });
    }
    if (req.method !== 'POST') return reply(404, { error: 'NOT_FOUND' });
    if (req.headers.origin !== origin || req.headers['x-mock-csrf'] !== csrf) return reply(403, { error: 'CSRF_DENIED' });
    let body;
    try { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw Error('LIMIT'); } body = JSON.parse(raw || '{}'); }
    catch { return reply(400, { error: 'INVALID_BODY' }); }
    if (url.pathname === '/api/qr') {
      for (const [key, value] of tickets) if (value <= Date.now()) tickets.delete(key);
      if (tickets.size > 100) tickets.clear();
      const ticket = randomBytes(24).toString('hex'), expiresAt = Date.now() + ticketTtlMs;
      tickets.set(ticket, expiresAt); return reply(200, { ticket, expiresAt });
    }
    if (url.pathname === '/api/confirm') {
      const expiresAt = tickets.get(body.ticket); tickets.delete(body.ticket);
      if (!expiresAt || expiresAt <= Date.now()) return reply(410, { error: 'QR_EXPIRED_OR_USED' });
      const id = randomBytes(32).toString('hex');
      sessions.set(id, { accountId: body.wrongIdentity ? 'mock-other-account' : account, needsVerification: body.needsVerification === true, expiresAt: Date.now() + sessionTtlMs });
      res.setHeader('Set-Cookie', `mock_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}`);
      return reply(200, { ok: true });
    }
    if (url.pathname === '/api/verify') {
      if (!session || session.expiresAt <= Date.now()) return reply(401, { error: 'SESSION_EXPIRED' });
      session.needsVerification = false; return reply(200, { ok: true });
    }
    if (url.pathname === '/api/logout') {
      sessions.delete(cookie); res.setHeader('Set-Cookie', 'mock_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return reply(200, { ok: true });
    }
    if (url.pathname === '/api/send' || url.pathname === '/api/inject') {
      if (!session || session.expiresAt <= Date.now() || session.needsVerification || session.accountId !== account) return reply(401, { error: 'IDENTITY_REQUIRED' });
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) return reply(400, { error: 'TEXT_REQUIRED_MAX_1000' });
      if (messages.length >= 1000) return reply(429, { error: 'FIXTURE_LIMIT' });
      const send = url.pathname === '/api/send';
      if (send && (typeof body.commandId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(body.commandId))) return reply(400, { error: 'COMMAND_ID_REQUIRED' });
      if (send && commands.has(body.commandId)) {
        const old = commands.get(body.commandId);
        if (old.text !== body.text) return reply(409, { error: 'COMMAND_CONFLICT' });
        return reply(200, { messageId: old.id, commandId: body.commandId });
      }
      const msg = { id: randomUUID(), threadId: `mock-thread-${account.slice(-2)}`, accountId: account, text: body.text,
        direction: send || body.direction === 'self' ? 'self' : 'inbound', sentAt: new Date().toISOString(),
        commandId: send ? body.commandId : null, source: send ? 'worker' : (body.direction === 'self' ? 'native' : 'customer') };
      messages.push(msg);
      if (send) commands.set(body.commandId, msg);
      // Fault fixture: accepted by server, but HTTP acknowledgment lost.
      if (send && body.fault === 'after_accept') {
        // Send a response prefix before disconnecting so Chromium cannot treat
        // this as a safe connection retry before any response was observed.
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.write('{"commandId":', () => res.destroy());
        return;
      }
      return reply(200, { messageId: msg.id, commandId: msg.commandId });
    }
    return reply(404, { error: 'NOT_FOUND' });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const account = resolveAccount();
  const port = Number(process.env.POC_PORT ?? 4316 + Number(account.slice(-2)));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw Error('INVALID_POC_PORT');
  const mock = await createMock({ port, account });
  console.log(`Mock-only fixture account=${account} origin=${mock.origin}`);
  process.once('SIGINT', async () => { await mock.close(); process.exit(0); });
}
