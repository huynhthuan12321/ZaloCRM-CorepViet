import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type Handler = (event: { waitUntil(promise: Promise<unknown>): void; request: Request; respondWith(promise: Promise<Response>): void; data?: { type: string } }) => void;
const handlers = new Map<string, Handler>();
let cacheStores: Map<string, Map<string, Response>>;
let fetcher: ReturnType<typeof vi.fn>;
let scope: { __WB_MANIFEST: Array<{ url: string; revision: string }>; skipWaiting: ReturnType<typeof vi.fn>; registration: { unregister: ReturnType<typeof vi.fn> }; clients: { claim: ReturnType<typeof vi.fn>; matchAll: ReturnType<typeof vi.fn> }; location: { origin: string }; addEventListener(type: string, handler: Handler): void };
async function lifetime(type: string, data?: { type: string }): Promise<void> {
  let work: Promise<unknown> | undefined;
  handlers.get(type)!({ waitUntil: promise => { work = promise; }, request: null as unknown as Request, respondWith: vi.fn(), data });
  await work;
}
function request(path: string, mode: RequestMode = 'cors', method = 'GET'): Promise<Response> | undefined {
  let result: Promise<Response> | undefined;
  handlers.get('fetch')!({ request: { url: 'https://crm.test' + path, mode, method } as Request, waitUntil: vi.fn(), respondWith: promise => { result = promise; } });
  return result;
}
beforeEach(async () => {
  vi.resetModules(); handlers.clear(); cacheStores = new Map();
  vi.stubGlobal('caches', {
    keys: vi.fn(async () => [...cacheStores.keys()]),
    delete: vi.fn(async (name: string) => cacheStores.delete(name)),
    open: vi.fn(async (name: string) => {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name)!;
      return { put: vi.fn(async (key: string, response: Response) => { store.set(key, response.clone()); }), match: vi.fn(async (key: string) => store.get(key)?.clone()) };
    }),
  });
  scope = { __WB_MANIFEST: [{ url: 'index.html', revision: 'a' }, { url: 'assets/app.js', revision: 'b' }], location: { origin: 'https://crm.test' }, skipWaiting: vi.fn().mockResolvedValue(undefined), registration: { unregister: vi.fn().mockResolvedValue(true) }, clients: { claim: vi.fn().mockResolvedValue(undefined), matchAll: vi.fn().mockResolvedValue([]) }, addEventListener: (type, handler) => { handlers.set(type, handler); } };
  vi.stubGlobal('self', scope);
  fetcher = vi.fn(async (input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/pwa/control.json') return new Response('{"enabled":true}');
    return new Response(url.endsWith('.js') ? '// static shell' : '<html>shell</html>', { headers: { 'Content-Type': url.endsWith('.js') ? 'text/javascript' : 'text/html' } });
  });
  vi.stubGlobal('fetch', fetcher);
  await import('./sw');
});
afterEach(() => vi.unstubAllGlobals());
describe('real custom service worker', () => {
  it('precache only static manifest with credentials omitted and does not auto skip waiting', async () => {
    await lifetime('install');
    expect([...cacheStores.values()][0].size).toBe(2);
    expect(fetcher).toHaveBeenCalledWith('https://crm.test/index.html', expect.objectContaining({ credentials: 'omit' }));
    expect(scope.skipWaiting).not.toHaveBeenCalled();
  });
  it('never intercepts API, socket, private media, cross-origin or POST', async () => {
    for (const path of ['/api/v1/contacts', '/socket.io/?transport=polling', '/uploads/customer.png', '/media/customer.pdf', '/iphone-media/file.png']) expect(request(path)).toBeUndefined();
    expect(request('/chat/fake', 'navigate', 'POST')).toBeUndefined();
    const crossOrigin = vi.fn();
    handlers.get('fetch')!({ request: { url: 'https://foreign.test/assets/app.js', method: 'GET', mode: 'cors' } as Request, waitUntil: vi.fn(), respondWith: crossOrigin });
    expect(crossOrigin).not.toHaveBeenCalled();
    expect(cacheStores.size).toBe(0);
  });
  it('offline SPA uses only generic index; request URLs/tokens are never stored', async () => {
    await lifetime('install');
    fetcher.mockRejectedValue(new TypeError('offline'));
    const response = await request('/chat/fake?private=x', 'navigate');
    expect(await response?.text()).toBe('<html>shell</html>');
    expect([...cacheStores.values()][0].size).toBe(2);
    expect(request('/unknown', 'navigate')).toBeUndefined();
    expect(request('/api/private', 'navigate')).toBeUndefined();
  });
  it('does not hide server maintenance behind the cached shell', async () => {
    await lifetime('install');
    fetcher.mockResolvedValue(new Response('maintenance', { status: 503 }));
    expect((await request('/chat/fake', 'navigate'))?.status).toBe(503);
  });
  it('server kill-switch deletes caches, unregisters, notifies clients and never reloads them', async () => {
    await lifetime('install');
    const postMessage = vi.fn(); scope.clients.matchAll.mockResolvedValue([{ postMessage }]);
    fetcher.mockImplementation(async (input: string | Request) => typeof input === 'string' && input === '/pwa/control.json' ? new Response('{"enabled":false}') : new Response('network'));
    expect(await (await request('/chat/fake', 'navigate'))?.text()).toBe('network');
    expect(cacheStores.size).toBe(0);
    expect(scope.registration.unregister).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'CRM_PWA_DISABLED' });
  });
  it('refuses an unsafe injected manifest even if a future config glob is broadened', async () => {
    scope.__WB_MANIFEST.push({ url: '/api/private.json', revision: 'secret' });
    vi.resetModules(); await import('./sw');
    await expect(lifetime('install')).rejects.toThrow('unsafe precache');
    expect(cacheStores.size).toBe(0);
  });
  it('skip waiting requires an explicit client message', async () => {
    await lifetime('install');
    await lifetime('message', { type: 'CRM_PWA_SKIP_WAITING' });
    expect(scope.skipWaiting).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong MIME before storing private JSON', async () => {
    fetcher.mockImplementation(async (input: string | Request) => typeof input === 'string' && input === '/pwa/control.json' ? new Response('{"enabled":true}') : new Response('{"private":true}', { headers: { 'Content-Type': 'application/json' } }));
    await expect(lifetime('install')).rejects.toThrow('wrong MIME');
    expect([...cacheStores.values()][0].size).toBe(0);
  });
});
