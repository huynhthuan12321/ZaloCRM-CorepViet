import { prisma } from '../database/prisma-client.js';
import { withTenant } from './tenant-context.js';

/** Internal scheduled jobs: enumerate only organization IDs, then tenant-bound work.
 * Organization has no orgId and no tenant RLS. Business queries never use bypass.
 * Errors propagate to the caller; do not silently skip failed organizations.
 */
export async function forEachOrganization(work: (orgId: string) => Promise<void>): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const org of orgs) await withTenant(org.id, () => work(org.id));
}
