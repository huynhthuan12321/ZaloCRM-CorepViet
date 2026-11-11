// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Agenda lịch hẹn mobile: bọc `useAppointments` (giữ API cũ, không endpoint mới).
 * - Cửa sổ truy vấn = một tuần theo MÚI GIỜ TỔ CHỨC; người dùng chọn ngày trong tuần để xem agenda của ngày đó.
 * - Tạo/sửa dùng buildAppointmentPayload: không bao giờ gửi source/externalRef/conversationId nên lịch từ Zalo giữ nguyên nguồn.
 * - Hủy / vắng / xóa luôn qua ConfirmHost (useConfirm). Lỗi tải: useAppointments nuốt lỗi nên phát hiện bằng sentinel.
 */
import { computed, ref, toRaw } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAppointments, type Appointment } from '@/composables/use-appointments';
import { useConfirm } from '@/composables/use-confirm';
import { useContacts, type Contact } from '@/composables/use-contacts';
import { useMobile } from '@/composables/use-mobile';
import { orgDayKey } from '@/composables/use-org-timezone';
import { useToast } from '@/composables/use-toast';
import { APPOINTMENT_SAVE_ERROR } from '@/utils/crm-request-errors';
import { useUsers } from '@/composables/use-users';
import {
  appointmentDayKey, buildAppointmentPayload, filterAppointments, groupByDay, validateDraft, weekDays, weekRange,
  type DayKey, type StatusMode,
} from '@/components/mobile/crm/agenda-model';
import type { AppointmentDraft } from '@/components/mobile/crm/types';

export type AgendaState = 'loading' | 'ready' | 'error' | 'offline';

export const SAVE_ERROR_TEXT = APPOINTMENT_SAVE_ERROR;

export function useMobileAgenda() {
  const auth = useAuthStore();
  const { isOnline } = useMobile();
  const toast = useToast();
  const { confirm } = useConfirm();
  const api = useAppointments();
  const usersApi = useUsers();
  const contactSearch = useContacts();

  const today = ref<DayKey>(orgDayKey(new Date()));
  const selectedDay = ref<DayKey>(today.value);
  const state = ref<AgendaState>('loading');
  /** Danh sách đang hiển thị: giữ nguyên trong lúc tải lại (useAppointments.fetchAppointments không giữ dữ liệu cũ khi lỗi). */
  const list = ref<Appointment[]>([]);
  const statusMode = ref<StatusMode>('open');
  const assignee = ref<string>('me'); // 'me' | 'all' | userId
  let generation = 0;

  const currentUserId = computed(() => auth.user?.id ?? null);
  const days = computed(() => weekDays(selectedDay.value));

  const visible = computed(() => filterAppointments(list.value, {
    mode: statusMode.value, assignee: assignee.value, currentUserId: currentUserId.value,
  }));
  const byDay = computed(() => groupByDay(visible.value));
  const dayItems = computed(() => byDay.value.get(selectedDay.value) ?? []);
  const countsByDay = computed(() => {
    const m: Record<DayKey, number> = {};
    for (const [k, v] of byDay.value) m[k] = v.length;
    return m;
  });
  const hiddenByFilter = computed(() => list.value.length - visible.value.length);

  const userOptions = computed(() => usersApi.users.value.map(u => ({ id: u.id, fullName: u.fullName })));

  function syncList(): void { list.value = [...api.appointments.value]; }

  async function fetchWeek(): Promise<void> {
    const gen = ++generation;
    if (!list.value.length) state.value = 'loading';
    const range = weekRange(selectedDay.value);
    api.filters.from = range.from;
    api.filters.to = range.to;
    api.filters.source = 'all';
    const previous = list.value.slice();
    const sentinel: Appointment[] = [];
    api.appointments.value = sentinel;
    await api.fetchAppointments();
    if (gen !== generation) return;
    if (toRaw(api.appointments.value) === sentinel) {
      api.appointments.value = previous; // lỗi: giữ dữ liệu cũ, báo trạng thái lỗi/offline
      state.value = isOnline.value ? 'error' : 'offline';
    } else {
      syncList();
      state.value = 'ready';
    }
  }

  async function selectDay(day: DayKey): Promise<void> {
    const sameWeek = weekDays(selectedDay.value).includes(day);
    selectedDay.value = day;
    if (!sameWeek) await fetchWeek();
  }

  async function shiftWeek(delta: -1 | 1): Promise<void> {
    const first = weekDays(selectedDay.value)[0];
    const [y, m, d] = first.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + delta * 7));
    selectedDay.value = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    await fetchWeek();
  }

  async function goToday(): Promise<void> {
    today.value = orgDayKey(new Date());
    await selectDay(today.value);
  }

  async function ensureUsers(): Promise<void> {
    if (!usersApi.users.value.length) await usersApi.fetchUsers();
  }

  async function searchContacts(q: string): Promise<Contact[]> {
    const text = q.trim();
    if (text.length < 2) return [];
    contactSearch.filters.search = text;
    contactSearch.filters.threadType = 'user';
    contactSearch.pagination.page = 1;
    contactSearch.pagination.limit = 8;
    await contactSearch.fetchContacts();
    return [...contactSearch.contacts.value];
  }

  async function create(draft: AppointmentDraft, opts: { refresh?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
    const errs = validateDraft(draft);
    if (Object.keys(errs).length) return { ok: false, error: Object.values(errs)[0] };
    const created = await api.createAppointment(buildAppointmentPayload(draft));
    if (!created) return { ok: false, error: api.saveError.value || SAVE_ERROR_TEXT };
    if (opts.refresh !== false) await fetchWeek();
    return { ok: true };
  }

  async function update(id: string, draft: AppointmentDraft): Promise<{ ok: true } | { ok: false; error: string }> {
    const errs = validateDraft(draft);
    if (Object.keys(errs).length) return { ok: false, error: Object.values(errs)[0] };
    const ok = await api.updateAppointment(id, buildAppointmentPayload(draft));
    if (!ok) return { ok: false, error: api.saveError.value || SAVE_ERROR_TEXT };
    // Làm tươi từ server (assignedUser, trạng thái...). Nếu tải lại lỗi, fetchWeek giữ danh sách cũ; bản ghi cục bộ do
    // useAppointments gộp payload vào bản cũ nên VẪN giữ source/externalRef/conversationId (payload không chứa các trường đó).
    syncList();
    await fetchWeek();
    return { ok: true };
  }

  async function complete(a: Appointment): Promise<boolean> {
    const ok = await api.markComplete(a.id);
    if (ok) syncList();
    if (ok) toast.success('Đã đánh dấu hoàn thành'); else toast.error('Không cập nhật được lịch hẹn');
    return ok;
  }

  async function cancel(a: Appointment): Promise<boolean> {
    const yes = await confirm({
      title: 'Hủy lịch hẹn này?',
      message: `"${a.title || 'Lịch hẹn'}" sẽ chuyển sang trạng thái Đã hủy.`,
      confirmText: 'Hủy lịch hẹn', cancelText: 'Giữ lại', tone: 'danger',
    });
    if (!yes) return false;
    const ok = await api.cancelAppointment(a.id);
    if (ok) syncList();
    if (ok) toast.success('Đã hủy lịch hẹn'); else toast.error('Không hủy được lịch hẹn');
    return ok;
  }

  async function noShow(a: Appointment): Promise<boolean> {
    const yes = await confirm({
      title: 'Đánh dấu khách vắng mặt?', message: `"${a.title || 'Lịch hẹn'}" sẽ chuyển sang Vắng mặt.`,
      confirmText: 'Đánh dấu vắng', cancelText: 'Giữ lại', tone: 'danger',
    });
    if (!yes) return false;
    const ok = await api.markNoShow(a.id);
    if (ok) syncList();
    if (ok) toast.success('Đã đánh dấu vắng mặt'); else toast.error('Không cập nhật được lịch hẹn');
    return ok;
  }

  async function remove(a: Appointment): Promise<boolean> {
    const yes = await confirm({
      title: 'Xóa lịch hẹn này?', message: `"${a.title || 'Lịch hẹn'}" sẽ bị xóa vĩnh viễn.`,
      confirmText: 'Xóa lịch hẹn', cancelText: 'Giữ lại', tone: 'danger',
    });
    if (!yes) return false;
    const ok = await api.deleteAppointment(a.id);
    if (ok) syncList();
    if (ok) toast.success('Đã xóa lịch hẹn'); else toast.error('Không xóa được lịch hẹn');
    return ok;
  }

  return {
    today, selectedDay, days, state, statusMode, assignee, dayItems, countsByDay, hiddenByFilter, userOptions,
    appointments: list, saving: api.saving, deleting: api.deleting, currentUserId,
    fetchWeek, selectDay, shiftWeek, goToday, ensureUsers, searchContacts, create, update, complete, cancel, noShow, remove,
    dayKeyOf: appointmentDayKey,
  };
}
