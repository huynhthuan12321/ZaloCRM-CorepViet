<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Route / (Tổng quan) trên mobile (LOCK D-2). Dùng useDashboardActionHub (qua use-mobile-overview). Việc ĐANG CHỜ TRẢ LỜI đứng đầu.
  Phạm vi ("Tôi (...)") và tab Quản lý team / hệ thống thành chip + sheet vừa màn hình, chỉ hiện theo hasTeamSection/hasSystemSection.
  Mobile không mount DesktopDashboardView nên không có onMounted/click-outside của desktop.
-->
<template>
  <div class="crm-ov-view">
    <header class="crm-ov-view__top">
      <p class="crm-ov-view__greet">Chào {{ greeting }}, <strong>{{ firstName }}</strong></p>
      <button
        v-if="ov.canSwitchScope.value && ov.tab.value === 'me'" type="button" class="crm-ov-view__scope"
        :aria-label="`Đang xem số liệu: ${ov.scopeLabel.value}. Đổi phạm vi`" @click="scopeOpen = true"
      >
        <i class="mdi mdi-account-outline" aria-hidden="true" />
        <span class="crm-ov-view__scope-text">{{ ov.scopeLabel.value }}</span>
        <i class="mdi mdi-chevron-down" aria-hidden="true" />
      </button>
    </header>

    <div v-if="ov.hasTeam.value || ov.hasSystem.value" class="crm-ov-view__tabs" role="tablist" aria-label="Phạm vi số liệu">
      <button type="button" role="tab" class="crm-ov-view__tab" :class="{ 'crm-ov-view__tab--on': ov.tab.value === 'me' }" :aria-selected="ov.tab.value === 'me'" @click="ov.selectTab('me')">Việc của tôi</button>
      <button v-if="ov.hasTeam.value" type="button" role="tab" class="crm-ov-view__tab" :class="{ 'crm-ov-view__tab--on': ov.tab.value === 'team' }" :aria-selected="ov.tab.value === 'team'" @click="ov.selectTab('team')">Quản lý team</button>
      <button v-if="ov.hasSystem.value" type="button" role="tab" class="crm-ov-view__tab" :class="{ 'crm-ov-view__tab--on': ov.tab.value === 'system' }" :aria-selected="ov.tab.value === 'system'" @click="ov.selectTab('system')">Hệ thống</button>
    </div>

    <MobileOverview
      v-if="ov.tab.value === 'me'"
      :me="ov.me.value" :urgent="ov.urgent.value" :state="ov.state.value" :can-switch-scope="ov.canSwitchScope.value" :show-lead-pool="hasLeadPool"
      @open-conversation="openConversation" @open-inbox="openInbox" @open-appointment="openAppointments" @change-scope="scopeOpen = true"
      @retry="ov.load" @open-contacts="router.push('/contacts')" @open-lead-pool="router.push('/lead-pool')"
    />
    <OverviewTeamPanel v-else-if="ov.tab.value === 'team'" :team="ov.team.value" :loading="ov.loadingTeam.value || !ov.teamLoaded.value" @retry="ov.reloadTeam" @view-user="viewUser" />
    <OverviewSystemPanel v-else :system="ov.system.value" :loading="ov.loadingSystem.value || !ov.systemLoaded.value" @retry="ov.reloadSystem" />

    <OverviewScopeSheet
      v-model:open="scopeOpen" :users="ov.pickerUsers.value" :current-user-id="ov.hub.viewAsUserId.value" :self-name="auth.user?.fullName ?? 'Tôi'" @select="ov.viewAs"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useMobileOverview } from '@/composables/mobile-crm/use-mobile-overview';
import MobileOverview from '@/components/mobile/crm/MobileOverview.vue';
import OverviewTeamPanel from '@/components/mobile/crm/OverviewTeamPanel.vue';
import OverviewSystemPanel from '@/components/mobile/crm/OverviewSystemPanel.vue';
import OverviewScopeSheet from '@/components/mobile/crm/OverviewScopeSheet.vue';
import { firstNameOf, greetingFor } from '@/components/mobile/crm/crm-model';

const router = useRouter();
const auth = useAuthStore();
const ov = useMobileOverview();
const scopeOpen = ref(false);

const greeting = computed(() => greetingFor(new Date().getHours()));
const firstName = computed(() => firstNameOf(ov.viewedName.value || auth.user?.fullName));
// "Nhận khách" chỉ có ở bản có module Lead Pool (route do extension đăng ký); không có route thì ẩn nút thay vì dẫn tới 404.
const hasLeadPool = computed(() => router.resolve('/lead-pool').matched.length > 0);

function openConversation(convId: string) { void router.push({ name: 'Chat', params: { convId } }); }
// MobileChatView đọc filter=unreplied trước request đầu tiên và giữ query khi mở thread/back (đợt D, duyệt 09/11).
function openInbox(filter: 'unreplied' | 'all') { void router.push(filter === 'unreplied' ? { name: 'Chat', query: { filter: 'unreplied' } } : { name: 'Chat' }); }
function openAppointments() { void router.push({ name: 'Appointments' }); }
async function viewUser(userId: string) { ov.tab.value = 'me'; await ov.viewAs(userId); }

onMounted(() => { void ov.load(); });
</script>

<style scoped>
.crm-ov-view { min-height: 100%; }
.crm-ov-view__top { display: flex; flex-direction: column; align-items: flex-start; gap: var(--m-space-2); padding: var(--m-space-4) var(--m-gutter) 0; }
.crm-ov-view__greet { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-ov-view__greet strong { color: var(--m-text); }
.crm-ov-view__scope {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line);
  border-radius: 999px; background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation;
}
.crm-ov-view__scope-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crm-ov-view__tabs { display: flex; flex-wrap: wrap; gap: var(--m-space-1) var(--m-space-2); padding: var(--m-space-3) var(--m-gutter) 0; }
.crm-ov-view__tab { min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: 999px; background: var(--m-surface); color: var(--m-text); font: inherit; font-size: 15px; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-ov-view__tab--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.crm-ov-view__scope:focus-visible, .crm-ov-view__tab:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
