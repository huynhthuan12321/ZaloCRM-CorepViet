// 6B lần 3 — group D: insert two org-Y boundary contacts through the application's Prisma client
// while the process runs in Asia/Ho_Chi_Minh, then compare stored text with the pg/UTC fixture rows.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:55531/reports_6b3_verify';
process.env.RLS_SET_CONFIG = 'false';
process.env.TENANT_GUARD_MODE = 'off';
const out = process.env.REPORTS_6B_ARTIFACT_DIR!;
const { prisma } = await import('../../src/shared/database/prisma-client.js');
const D = process.argv[2], DM1 = process.argv[3];
const tzOffset = new Date().getTimezoneOffset();
const rows = [
  { id: '6b-c-yp-start', createdAt: new Date(`${D}T00:00:00.000+07:00`) },
  { id: '6b-c-yp-before', createdAt: new Date(`${DM1}T23:59:59.999+07:00`) },
];
for (const r of rows) {
  await prisma.contact.create({ data: { id: r.id, orgId: '6b-org-y', assignedUserId: '6b-u-sale-y', statusId: '6b-st-y', status: 'new', source: 'FB', fullName: `6B ${r.id}`, createdAt: r.createdAt } });
}
const stored = await prisma.$queryRaw<Array<{ id: string; t: string }>>`SELECT id, created_at::text AS t FROM contacts WHERE id IN ('6b-c-yp-start','6b-c-yp-before','6b-c-y2') ORDER BY id`;
const result = { processTimezoneOffsetMinutes: tzOffset, processTZ: Intl.DateTimeFormat().resolvedOptions().timeZone, inserted: rows.map(r => ({ id: r.id, iso: r.createdAt.toISOString() })), stored };
await writeFile(resolve(out, 'prisma-boundary.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 1));
await prisma.$disconnect();
