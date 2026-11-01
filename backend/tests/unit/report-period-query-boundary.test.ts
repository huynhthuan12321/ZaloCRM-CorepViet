import Fastify from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    user: { findFirst: h.userFindFirst },
    $queryRaw: h.queryRaw,
  },
}));

vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { id: 'report-admin', orgId: 'org-a', role: 'owner' };
  },
}));

import { reportRoutes } from '../../src/modules/dashboard/report-routes.js';
import { resolveReportPeriod } from '../../src/modules/dashboard/report-period.js';

let db: PGlite;
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    CREATE TABLE conversations(id text PRIMARY KEY, org_id text, zalo_account_id text);
    CREATE TABLE messages(id text PRIMARY KEY, conversation_id text, sender_type text, sent_at timestamptz);
    INSERT INTO conversations VALUES ('conversation-a', 'org-a', 'nick-a');
    INSERT INTO messages VALUES
      ('before-start', 'conversation-a', 'self', '2026-09-30T16:59:59.999Z'),
      ('at-start', 'conversation-a', 'self', '2026-09-30T17:00:00.000Z'),
      ('last-included', 'conversation-a', 'contact', '2026-10-01T16:59:59.999Z'),
      ('at-end', 'conversation-a', 'contact', '2026-10-01T17:00:00.000Z');
    CREATE TABLE appointments(id text PRIMARY KEY, appointment_date date);
    INSERT INTO appointments VALUES
      ('previous-day', '2026-09-30'),
      ('selected-day', '2026-10-01'),
      ('next-day', '2026-10-02');
  `);
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  h.userFindFirst.mockReset().mockResolvedValue({ role: 'owner' });
  h.queryRaw.mockReset().mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = Prisma.sql(strings, ...values);
    return (await db.query(query.text, query.values)).rows;
  });
  app = Fastify();
  await app.register(reportRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('report date boundaries against PostgreSQL fixture', () => {
  it('counts messages at both inclusive Vietnam-day edges exactly once', async () => {
    const response = await app.inject({
      url: '/api/v1/reports/messages?from=2026-10-01&to=2026-10-01',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
      data: [{ date: '2026-10-01', sent: 1, received: 1, total: 2 }],
    });
  });

  it('uses UTC-midnight bounds for SQL DATE appointment values', async () => {
    const period = resolveReportPeriod(
      { from: '2026-10-01', to: '2026-10-01' },
      { now: new Date('2026-10-01T04:00:00.000Z') },
    );
    const rows = await db.query(
      'SELECT id FROM appointments WHERE appointment_date >= $1::date AND appointment_date < $2::date ORDER BY id',
      [period.dateStart, period.dateEnd],
    );

    expect(period.dateStart.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(period.dateEnd.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(rows.rows).toEqual([{ id: 'selected-day' }]);
  });
});
