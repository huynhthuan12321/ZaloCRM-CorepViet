// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Tổng quan mobile: bọc `useDashboardActionHub` (không API mới). Thêm trạng thái loading/ready/error/offline cho tab "Việc của tôi"
 * (me) và phát hiện section team/system tải hỏng (hub gán null khi lỗi) để UI hiện LỖI chứ không hiện 0.
 */
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useDashboardActionHub } from '@/composables/use-dashboard-action-hub';
import { useMobile } from '@/composables/use-mobile';
import { useToast } from '@/composables/use-toast';

export type OverviewState = 'loading' | 'ready' | 'error' | 'offline';
export type OverviewTab = 'me' | 'team' | 'system';

export function useMobileOverview() {
  const auth = useAuthStore();
  const { isOnline } = useMobile();
  const toast = useToast();
  const hub = useDashboardActionHub();

  const state = ref<OverviewState>('loading');
  const tab = ref<OverviewTab>('me');
  const teamLoaded = ref(false);
  const systemLoaded = ref(false);

  const me = computed(() => hub.me.value);
  const urgent = computed(() => hub.me.value?.urgent ?? []);
  const canSwitchScope = computed(() => hub.hasTeamSection.value);
  const hasTeam = computed(() => hub.hasTeamSection.value);
  const hasSystem = computed(() => hub.hasSystemSection.value);

  const viewedName = computed(() => {
    if (!hub.viewAsUserId.value) return auth.user?.fullName ?? '';
    return hub.pickerUsers.value.find(u => u.id === hub.viewAsUserId.value)?.fullName ?? '';
  });
  const scopeLabel = computed(() => (hub.viewAsUserId.value ? viewedName.value : `Tôi (${auth.user?.fullName ?? ''})`));

  async function load(): Promise<void> {
    if (!me.value) state.value = 'loading';
    try {
      await hub.fetchAll();
      state.value = 'ready';
    } catch {
      state.value = isOnline.value ? 'error' : 'offline';
    } finally {
      teamLoaded.value = true;
      systemLoaded.value = true;
    }
  }

  async function reloadTeam(): Promise<void> { teamLoaded.value = false; await hub.fetchTeam(); teamLoaded.value = true; }
  async function reloadSystem(): Promise<void> { systemLoaded.value = false; await hub.fetchSystem(); systemLoaded.value = true; }

  async function viewAs(userId: string | null): Promise<void> {
    try {
      await hub.fetchMe(userId);
      state.value = 'ready';
    } catch {
      toast.error('Không tải được số liệu của nhân viên này');
    }
  }

  function selectTab(next: OverviewTab): void {
    if (next === 'team' && !hasTeam.value) return;
    if (next === 'system' && !hasSystem.value) return;
    tab.value = next;
  }

  return {
    hub, state, tab, me, urgent, canSwitchScope, hasTeam, hasSystem, viewedName, scopeLabel, teamLoaded, systemLoaded,
    team: hub.team, system: hub.system, loadingTeam: hub.loadingTeam, loadingSystem: hub.loadingSystem, pickerUsers: hub.pickerUsers,
    load, reloadTeam, reloadSystem, viewAs, selectTab,
  };
}
