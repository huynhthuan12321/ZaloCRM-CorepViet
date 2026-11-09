// Calendar inputs for contacts: instants use the organization timezone; SQL DATE does not.
import { orgDayKey, orgWallClockToUtc } from '@/composables/use-org-timezone';

export type ContactDateKind = 'datetime' | 'date';

export function contactDateInput(value: string | null | undefined, kind: ContactDateKind = 'datetime'): string {
  if (!value) return '';
  return kind === 'date' ? value.slice(0, 10) : orgDayKey(value);
}

/** Preserve the exact original instant when the calendar input has not changed. */
export function contactDatePayload(day: string, original: string | null | undefined, kind: ContactDateKind = 'datetime'): string | null {
  if (original && day === contactDateInput(original, kind)) return original;
  if (!day) return null;
  // birthDate is PostgreSQL DATE: serialize its calendar day at UTC midnight.
  if (kind === 'date') return `${day}T00:00:00.000Z`;
  return orgWallClockToUtc(day, '00:00')?.toISOString() ?? null;
}
