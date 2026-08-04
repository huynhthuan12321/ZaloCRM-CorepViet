import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const initialConfig = () => ({
    id: 'ai-config-1',
    orgId: 'org-1',
    aiAutoReplyGlobalEnabled: true,
    aiAutoReplyScope: 'new_customers',
    aiAutoReplyFullAuto: true,
    aiFollowupEnabled: true,
  });
  const state = { config: initialConfig() };

  const update = vi.fn(async ({ data }: { data: { aiAutoReplyGlobalEnabled: boolean } }) => {
    state.config = { ...state.config, ...data };
    return { ...state.config };
  });
  const activityCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);

  return { initialConfig, state, update, activityCreate };
});

vi.mock('../../src/shared/crypto/api-key-hash.js', () => ({
  hashApiKey: (value: string) => `hashed:${value}`,
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    appSetting: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.valueHash === 'hashed:valid-key' ? { orgId: 'org-1' } : null),
    },
    aiConfig: { update: testState.update },
    activityLog: { create: testState.activityCreate },
    $transaction: vi.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
  },
}));

vi.mock('../../src/modules/ai/ai-service.js', () => ({
  getAiConfig: vi.fn(async () => ({ ...testState.state.config, availableProviders: [] })),
}));

vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { publicApiRoutes } from '../../src/modules/api/public-api-routes.js';

describe('public AI control routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  beforeEach(() => {
    testState.state.config = testState.initialConfig();
    testState.update.mockClear();
    testState.activityCreate.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function createApp() {
    const app = Fastify();
    apps.push(app);
    await app.register(publicApiRoutes);
    return app;
  }

  it('requires X-Api-Key', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/api/public/ai/status' });
    expect(response.statusCode).toBe(401);
  });

  it('returns status, pauses and resumes without changing the other settings', async () => {
    const app = await createApp();
    const headers = { 'x-api-key': 'valid-key' };

    const initial = await app.inject({ method: 'GET', url: '/api/public/ai/status', headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({
      globalEnabled: true,
      scope: 'new_customers',
      fullAuto: true,
      followupEnabled: true,
    });

    const paused = await app.inject({ method: 'POST', url: '/api/public/ai/pause', headers });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toEqual({
      globalEnabled: false,
      scope: 'new_customers',
      fullAuto: true,
      followupEnabled: true,
    });

    const resumed = await app.inject({ method: 'POST', url: '/api/public/ai/resume', headers });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().globalEnabled).toBe(true);

    expect(testState.update.mock.calls.map(([input]) => input.data)).toEqual([
      { aiAutoReplyGlobalEnabled: false },
      { aiAutoReplyGlobalEnabled: true },
    ]);
    expect(testState.activityCreate).toHaveBeenCalledTimes(2);
    expect(testState.activityCreate.mock.calls.map(([input]) => input.data.action)).toEqual([
      'ai_paused',
      'ai_resumed',
    ]);
    expect(testState.activityCreate.mock.calls.every(([input]) =>
      input.data.actorType === 'api' && input.data.entityType === 'ai_config')).toBe(true);
  });
});
