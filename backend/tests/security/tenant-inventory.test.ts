import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ORG_SCOPED_MODELS } from '../../src/shared/tenant/org-scoped-models.js';

const schema = readFileSync(fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)), 'utf8');
const rls = readFileSync(fileURLToPath(new URL('../../prisma/rls/tenant-rls.sql', import.meta.url)), 'utf8');
const tenants = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
  .filter((m) => /^\s+orgId\s/m.test(m[2]))
  .map((m) => ({ model: m[1], table: m[2].match(/@@map\("([^"]+)"\)/)![1] }));

describe('Tenant inventory (schema coverage; not a database RLS test)', () => {
  it.each(tenants)('$model requires context and a forced read/write tenant policy', ({ model, table }) => {
    expect(ORG_SCOPED_MODELS.has(model), `${model} missing tenant guard`).toBe(true);
    expect(rls).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    expect(rls).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    const policy = rls.match(new RegExp(`CREATE POLICY tenant_isolation ON "${table}"([\\s\\S]*?);`));
    expect(policy, `${table} missing policy`).not.toBeNull();
    expect(policy![1]).toContain('USING');
    expect(policy![1]).toContain('WITH CHECK');
    expect(policy![1]).toContain('app.current_org');
  });
});
