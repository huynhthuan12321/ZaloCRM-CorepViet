import { EventEmitter } from 'node:events';
import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ tcp: vi.fn(), tls: vi.fn(), urls: [] as string[], streams: [] as any[] }));
vi.mock('node:net', async original => ({ ...await original<typeof import('node:net')>(), createConnection: state.tcp }));
vi.mock('node:tls', () => ({ connect: state.tls }));
vi.mock('../../src/shared/http/probe-host.js', async original => ({
  ...await original<typeof import('../../src/shared/http/probe-host.js')>(),
  resolveProbeHost: async () => [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }],
}));
vi.mock('ioredis', async original => ({ ...await original<typeof import('ioredis')>(), Redis: class {
  connector: any;
  constructor(url: string, options: any) {
    state.urls.push(url); const parsed = new URL(url);
    this.connector = new options.Connector({ host: parsed.hostname, port: Number(parsed.port),
      family: Number(parsed.searchParams.get('family') ?? 0), tls: options.tls });
  }
  on() { return this; }
  connect() { return this.connector.connect(); }
  async ping() { return 'PONG'; }
  disconnect() { this.connector.disconnect(); }
} }));
beforeEach(() => {
  vi.resetModules(); vi.unstubAllEnvs(); state.urls.length = 0; state.streams.length = 0;
  const stream = () => { const value = Object.assign(new EventEmitter(), { destroy: vi.fn() }); state.streams.push(value); return value; };
  state.tcp.mockReset().mockImplementation(stream); state.tls.mockReset().mockImplementation(stream);
});
describe('Redis readiness URL transport policy', () => {
  it.each([0, 4, 6])('keeps explicit address family %i with original auth/database URL', async family => {
    const url = `redis://synthetic:p%40ss@localhost:6380/2?family=${family}`;
    vi.stubEnv('REDIS_URL', url);
    const { isBullMQRedisHealthy } = await import('../../src/shared/queue/redis-connection.js');
    expect(await isBullMQRedisHealthy()).toBe(true); expect(state.urls).toEqual([url]);
    const options = state.tcp.mock.calls[0][0]; expect(options).toMatchObject({ host: 'localhost', port: 6380, family, autoSelectFamily: true });
    const callback = vi.fn(); options.lookup('localhost', { all: true, family }, callback);
    await new Promise(resolve => process.nextTick(resolve));
    const expected = [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }].filter(row => !family || row.family === family);
    expect(callback).toHaveBeenCalledWith(null, expected); expect(state.streams[0].destroy).toHaveBeenCalled();
  });
  it('retains rediss verification hostname without disabling certificate verification', async () => {
    vi.stubEnv('REDIS_URL', 'rediss://synthetic:p%40ss@secure.synthetic:6380/2?family=6');
    const { isBullMQRedisHealthy } = await import('../../src/shared/queue/redis-connection.js');
    expect(await isBullMQRedisHealthy()).toBe(true);
    expect(state.tls.mock.calls[0][0]).toMatchObject({ host: 'secure.synthetic', servername: 'secure.synthetic', family: 6 });
    expect(state.tls.mock.calls[0][0].rejectUnauthorized).not.toBe(false); expect(state.tcp).not.toHaveBeenCalled();
  });
});
