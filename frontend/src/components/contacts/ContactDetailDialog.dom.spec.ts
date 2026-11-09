// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref } from 'vue';
import type { Contact } from '@/composables/use-contacts';
const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), get: vi.fn().mockResolvedValue({ data: {} }) }));
vi.mock('@/api/index', () => ({ api: { get: mocks.get } }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/appointments/AppointmentEditor.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/composables/use-contacts', () => ({
  useContacts: () => ({ saving: ref(false), deleting: ref(false), updateContact: mocks.update, createContact: mocks.create, deleteContact: vi.fn() }),
  SOURCE_OPTIONS: [], STATUS_OPTIONS: [], GENDER_OPTIONS: [], INCOME_RANGE_OPTIONS: [], CONSENT_OPTIONS: [],
  formatRecentDateTime: vi.fn(), messagePreview: vi.fn(),
}));
import ContactDetailDialog from './ContactDetailDialog.vue';
import { refreshOrgTimezone } from '@/composables/use-org-timezone';

afterEach(() => { vi.clearAllMocks(); refreshOrgTimezone('+07:00'); });
describe('desktop contact dialog open/save', () => {
  it.each(['+07:00', '+00:00'])('does not change any date or time when opened and saved in org %s', async tz => {
    refreshOrgTimezone(tz);
    const contact = { id: 'fake-contact', fullName: 'Fake contact', nextAppointment: '2026-11-09T17:00:00.000Z', firstContactDate: '2026-11-10T12:34:56.789Z', birthDate: '2000-01-01T00:00:00.000Z' } as Contact;
    const wrapper = shallowMount(ContactDetailDialog, { props: { modelValue: true, contact }, global: { config: { warnHandler: () => {} } } });
    const vm = wrapper.vm as unknown as { onSave(): Promise<void>; form: { nextAppointmentDate: string; firstContactDate: string; birthDate: string } };
    expect(vm.form.birthDate).toBe('2000-01-01');
    expect(vm.form.nextAppointmentDate).toBe(tz === '+07:00' ? '2026-11-10' : '2026-11-09');
    for (let round = 0; round < 3; round++) {
      await vm.onSave();
      const payload = mocks.update.mock.calls.at(-1)![1];
      expect(payload).toMatchObject({ nextAppointment: contact.nextAppointment, firstContactDate: contact.firstContactDate, birthDate: contact.birthDate });
      await wrapper.setProps({ contact: { ...contact, ...payload } });
    }
    wrapper.unmount();
  });
  it('sends edited dates in org time and birthDate at UTC midnight', async () => {
    refreshOrgTimezone('+07:00');
    const wrapper = shallowMount(ContactDetailDialog, { props: { modelValue: true, contact: { id: 'fake-contact', fullName: 'Fake contact' } as Contact }, global: { config: { warnHandler: () => {} } } });
    const vm = wrapper.vm as unknown as { onSave(): Promise<void>; form: { nextAppointmentDate: string; firstContactDate: string; birthDate: string } };
    vm.form.nextAppointmentDate = '2026-11-12'; vm.form.firstContactDate = '2026-11-12'; vm.form.birthDate = '2000-02-29';
    await vm.onSave();
    expect(mocks.update.mock.calls[0]![1]).toMatchObject({ nextAppointment: '2026-11-11T17:00:00.000Z', firstContactDate: '2026-11-11T17:00:00.000Z', birthDate: '2000-02-29T00:00:00.000Z' });
    wrapper.unmount();
  });
});
