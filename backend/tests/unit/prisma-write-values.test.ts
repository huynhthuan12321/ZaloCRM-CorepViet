import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const captured = vi.hoisted(() => ({ extensions: [] as any[] }));
vi.mock('@prisma/client', async (original) => ({
  ...await original<typeof import('@prisma/client')>(),
  PrismaClient: class {
    $extends(extension: unknown) { captured.extensions.push(extension); return this; }
  },
}));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
vi.mock('../../src/config/index.js', () => ({ config: { tenantGuardMode: 'off', rlsSetConfig: false } }));

let sanitizeWrite: (args: any) => Promise<unknown>;
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1:9/disposable_only');
  delete (globalThis as any).prisma;
  await import('../../src/shared/database/prisma-client.js');
  sanitizeWrite = captured.extensions.find(e => e.name === 'strip-null-bytes').query.$allModels.$allOperations;
});

// Client-extension unit tests; no database or provider is connected.
describe('Prisma write-value preservation', () => {
  it.each(['data', 'create', 'update'])('preserves JSON-null sentinel identity in %s', async (key) => {
    const value = { db: Prisma.DbNull, json: Prisma.JsonNull, any: Prisma.AnyNull, nested: { json: Prisma.JsonNull } };
    const args = { [key]: value };
    const query = vi.fn().mockResolvedValue('ok');
    await sanitizeWrite({ args, query });
    expect(query).toHaveBeenCalledOnce();
    expect(args[key].db).toBe(Prisma.DbNull);
    expect(args[key].json).toBe(Prisma.JsonNull);
    expect(args[key].any).toBe(Prisma.AnyNull);
    expect(args[key].nested.json).toBe(Prisma.JsonNull);
  });

  it('keeps Date, Buffer and Decimal instances while cleaning nested plain strings', async () => {
    const date = new Date('2026-11-07T00:00:00Z');
    const buffer = Buffer.from([0, 1, 2]);
    const decimal = new Prisma.Decimal('123.45');
    const original = { date, buffer, decimal, text: 'a\u0000b', nested: [{ text: 'c\u0000d' }], nil: null };
    const args = { data: original };
    await sanitizeWrite({ args, query: vi.fn().mockResolvedValue(null) });
    expect(args.data.date).toBe(date);
    expect(args.data.buffer).toBe(buffer);
    expect(args.data.decimal).toBe(decimal);
    expect(args.data.text).toBe('ab');
    expect(args.data.nested).toEqual([{ text: 'cd' }]);
    expect(args.data.nil).toBeNull();
    expect(original.text).toBe('a\u0000b');
  });

  it('still sanitizes dictionaries without a prototype', async () => {
    const dictionary = Object.create(null);
    dictionary.text = 'a\u0000b'; dictionary.json = Prisma.JsonNull;
    const args = { data: dictionary };
    await sanitizeWrite({ args, query: vi.fn().mockResolvedValue(null) });
    expect(args.data.text).toBe('ab');
    expect(args.data.json).toBe(Prisma.JsonNull);
  });
});
