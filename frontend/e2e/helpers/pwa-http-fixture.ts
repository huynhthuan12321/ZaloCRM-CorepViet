import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { installCrmMocks } from './mock-crm';
import { ADMIN } from './mock-api';

export const QA_TOKEN = `e30.${Buffer.from(JSON.stringify({ id: ADMIN.id, orgId: ADMIN.orgId, role: 'admin', exp: 2100000000 })).toString('base64url')}.qa-only`;
export const QA_ROTATED_TOKEN = `e30.${Buffer.from(JSON.stringify({ id: ADMIN.id, orgId: ADMIN.orgId, role: 'admin', exp: 2100000001 })).toString('base64url')}.qa-only`;
export const QA_RT = 'qa-refresh-token-not-real';
const MIME: Record<string, string> = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf' };

/** The API is fake, but every HTTP request, ServiceWorker registration, cache and offline failure is real. */
export async function servePwaFixture(dist: string) {
  const handlers: Array<(route: any) => Promise<unknown>> = [];
  const listeners: Array<(request: any) => void> = [];
  const fixturePage = {
    addInitScript: async () => {}, routeWebSocket: async () => {},
    on: (event: string, fn: (request: any) => void) => { if (event === 'request') listeners.push(fn); },
    route: async (pattern: string, fn: (route: any) => Promise<unknown>) => { if (pattern.includes('api/v1')) handlers.push(fn); },
  } as unknown as Page;
  await installCrmMocks(fixturePage);
  const state = { version: 'A', enabled: true, navigationStatus: 200, profileStatus: 200, refreshStatus: 200,
    rejectOldToken: false, refreshCount: 0, profileCount: 0, calls: [] as Array<{ method: string; path: string }> };
  let origin = '';
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', origin);
    const finish = (body: string | Buffer, status = 200, contentType = 'application/json') => {
      response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control':'no-store, max-age=0' }); response.end(body);
    };
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    let body: unknown = {}; try { body = JSON.parse(text || '{}'); } catch {}
    state.calls.push({ method: request.method ?? 'GET', path: url.pathname });
    try {
      if (url.pathname === '/pwa/control.json') return finish(JSON.stringify({ enabled: state.enabled, version: 1 }));
      if (url.pathname === '/sw.js') {
        const script = state.version === 'tombstone' ? fs.readFileSync(path.join(dist, 'pwa/kill-sw.js'))
          : Buffer.from(fs.readFileSync(path.join(dist, 'sw.js'), 'utf8') + `\n/* QA_ONLY_REAL_WORKER_BYTES_${state.version} */\n`);
        return finish(script, 200, 'text/javascript');
      }
      if (url.pathname === '/api/v1/auth/refresh') {
        state.refreshCount++;
        if (state.refreshStatus !== 200) return finish(JSON.stringify({ code: state.refreshStatus === 401 ? 'refresh_invalid' : 'QA_UPSTREAM_UNAVAILABLE' }), state.refreshStatus);
        return finish(JSON.stringify({ token: QA_ROTATED_TOKEN, refreshToken: 'qa-rotated-refresh-not-real' }));
      }
      if (url.pathname === '/api/v1/profile') {
        state.profileCount++;
        const status = state.profileStatus !== 200 ? state.profileStatus
          : state.rejectOldToken && request.headers.authorization !== `Bearer ${QA_ROTATED_TOKEN}` ? 401 : 200;
        if (status !== 200) return finish(JSON.stringify({ error:'QA profile response' }), status);
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const req = { url: () => url.href, method: () => request.method ?? 'GET', postDataJSON: () => body,
          postData: () => text, headers: () => request.headers };
        for (const listener of listeners) listener(req);
        const invoke = async (index: number): Promise<unknown> => {
          if (index < 0) return finish('{}');
          return handlers[index]({ request: () => req,
            fulfill: async (options: { body: string; status?: number; contentType?: string }) => finish(options.body, options.status, options.contentType),
            fallback: () => invoke(index - 1), abort: () => finish('{}', 503),
          });
        };
        await invoke(handlers.length - 1); return;
      }
      if (url.pathname.startsWith('/socket.io') || /^\/(?:iphone-media|files|uploads|media-object)\//.test(url.pathname)) return finish('QA private bytes', 200, 'text/plain');
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!relative || !path.extname(relative)) {
        if (state.navigationStatus !== 200) return finish('QA maintenance response', state.navigationStatus, 'text/html');
        relative = 'index.html';
      }
      const file = path.resolve(dist, relative);
      if (!file.startsWith(path.resolve(dist) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return finish('not found', 404, 'text/plain');
      finish(fs.readFileSync(file), 200, MIME[path.extname(file)] ?? 'application/octet-stream');
    } catch (error) { if (!response.writableEnded) finish(JSON.stringify({ error: String(error) }), 500); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, state, async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
