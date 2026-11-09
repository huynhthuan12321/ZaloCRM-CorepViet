import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null }) }));
import { refreshOrgTimezone } from '@/composables/use-org-timezone';
import { contactDateInput, contactDatePayload } from './contact-date-fields';

afterEach(() => refreshOrgTimezone('+07:00'));
describe('contact calendar input conversion', () => {
  it('runs in the requested browser timezone', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Asia/Ho_Chi_Minh' || zone === 'Asia/Saigon') expect(new Date('2026-11-10T00:00:00').getTimezoneOffset()).toBe(-420);
    if (zone === 'UTC') expect(new Date('2026-11-10T00:00:00').getTimezoneOffset()).toBe(0);
  });
  it.each(['+07:00', '+00:00', '-05:00'])('preserves original timestamps, including time, for org %s', tz => {
    refreshOrgTimezone(tz);
    for (const original of ['2026-11-09T17:00:00.000Z', '2026-11-10T12:34:56.789Z', '2026-01-01T00:00:00.000Z']) {
      expect(contactDatePayload(contactDateInput(original), original)).toBe(original);
    }
  });
  it('reads midnight in the organization rather than UTC or the browser', () => {
    refreshOrgTimezone('+07:00');
    expect(contactDateInput('2026-11-09T17:00:00.000Z')).toBe('2026-11-10');
    expect(contactDatePayload('2026-11-12', null)).toBe('2026-11-11T17:00:00.000Z');
  });
  it('converts changed dates for a UTC organization', () => {
    refreshOrgTimezone('+00:00');
    expect(contactDatePayload('2026-11-12', null)).toBe('2026-11-12T00:00:00.000Z');
  });
  it.each(['+07:00', '+00:00', '-05:00'])('keeps SQL DATE independent of org %s', tz => {
    refreshOrgTimezone(tz);
    expect(contactDateInput('2000-01-01T00:00:00.000Z', 'date')).toBe('2000-01-01');
    expect(contactDatePayload('2000-02-29', null, 'date')).toBe('2000-02-29T00:00:00.000Z');
    expect(contactDatePayload('2000-01-01', '2000-01-01T00:00:00.000Z', 'date')).toBe('2000-01-01T00:00:00.000Z');
  });
  it('supports date-only API input and empty/new/cleared values', () => {
    expect(contactDateInput('2000-01-01', 'date')).toBe('2000-01-01');
    expect(contactDatePayload('2000-01-01', '2000-01-01', 'date')).toBe('2000-01-01');
    expect(contactDateInput(null)).toBe('');
    expect(contactDatePayload('', null)).toBeNull();
    expect(contactDatePayload('', '2026-11-10T00:00:00Z')).toBeNull();
  });
});
