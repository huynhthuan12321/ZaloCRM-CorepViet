import { describe, expect, it } from 'vitest';
import { buildLiveHealth, buildReadyHealth } from '../../src/shared/http/health.js';

describe('health check helpers', () => {
  it('PH-HC01 liveness reports process alive', () => {
    expect(buildLiveHealth(12)).toEqual({ status: 'ok', uptime: 12 });
  });

  it('PH-HC02 readiness returns 200 when DB and Redis are healthy', async () => {
    const result = await buildReadyHealth({
      checkDb: async () => {},
      checkRedis: () => true,
      uptime: 12,
      timestamp: '2026-09-15T10:00:00.000Z',
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ status: 'ok', db: 'connected', redis: 'connected' });
  });

  it('PH-HC03 readiness returns 503 when DB is down', async () => {
    const result = await buildReadyHealth({
      checkDb: async () => { throw new Error('db down'); },
      checkRedis: () => true,
    });
    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({ status: 'error', db: 'disconnected', redis: 'connected' });
  });

  it('PH-HC04 readiness returns 503 when Redis is down', async () => {
    const result = await buildReadyHealth({
      checkDb: async () => {},
      checkRedis: () => false,
    });
    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({ status: 'error', db: 'connected', redis: 'disconnected' });
  });
});
