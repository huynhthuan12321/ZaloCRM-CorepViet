import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { frontendStaticHeaders, isPwaStaticPath } from '../../src/shared/http/frontend-static.js';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const clean of cleanup.splice(0).reverse()) await clean();
});

async function fixture(includePwa = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'crm-pwa-static-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'pwa'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>CRM fixture</title>');
  if (includePwa) {
    await writeFile(path.join(root, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    await writeFile(path.join(root, 'pwa/kill-sw.js'), 'self.registration.unregister();');
    await writeFile(path.join(root, 'pwa/control.json'), '{"enabled":true,"version":1}');
  }
  const app = Fastify();
  cleanup.push(() => app.close());
  app.addHook('onSend', frontendStaticHeaders);
  await app.register(fastifyStatic, { root, prefix: '/' });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || isPwaStaticPath(request.url)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });
  return app;
}

describe('production frontend static delivery', () => {
  it.each([
    ['/sw.js', 'no-cache', 'application/javascript'],
    ['/pwa/kill-sw.js', 'no-cache', 'application/javascript'],
    ['/pwa/control.json?version=2', 'no-store', 'application/json'],
    ['/', 'no-cache', 'text/html'],
    ['/index.html', 'no-cache', 'text/html'],
    ['/chat/example', 'no-cache', 'text/html'],
  ])('%s has explicit cache policy and content type', async (url, cache, type) => {
    const app = await fixture();
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe(cache);
      expect(response.headers['content-type']).toContain(type);
      if (method === 'HEAD') expect(response.body).toBe('');
    }
  });

  it.each(['/sw.js', '/pwa/control.json', '/pwa/kill-sw.js', '/sw.js?v=2', '/api/v1/unknown'])(
    'missing %s returns 404 instead of SPA HTML',
    async (url) => {
      const response = await (await fixture(false)).inject({ url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    },
  );

  it.each([
    ['/sw.js', 'no-cache'],
    ['/pwa/control.json', 'no-store'],
    ['/pwa/kill-sw.js', 'no-cache'],
  ])('conditional %s retains its cache policy', async (url, cache) => {
    const app = await fixture();
    const first = await app.inject({ url });
    const response = await app.inject({ url, headers: { 'if-none-match': String(first.headers.etag) } });
    expect(response.statusCode).toBe(304);
    expect(response.headers['cache-control']).toBe(cache);
  });
});
