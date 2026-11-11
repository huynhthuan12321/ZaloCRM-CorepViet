<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Khung Cài đặt mobile (CHỈ mount khi isMobile, qua SettingsLayout — LOCK REQUEST S-1). Hai cấp:
   - Cấp 1 (`/settings`): danh sách menu toàn màn hình, dùng CHUNG useSettingsNav (nhóm, thứ tự, lọc quyền như sidebar desktop).
   - Cấp 2 (`/settings/**`): trang nội dung toàn màn hình; header riêng (nút quay lại danh sách + tiêu đề); không breadcrumb.
  F1 dùng trang mobile hoặc controller hiện có với nhánh mobile theo Sáng/Tối.
  Các trang ngoài F1 giữ policy đảo Sáng. Slot mặc định = <RouterView/> do SettingsLayout truyền vào.
-->
<template>
  <div class="crm-settings">
    <MobileSettingsMenu v-if="entry.isRoot.value && !entry.normalizing.value" :groups="visibleGroups" :query="query" :results="results" @update:query="query = $event" @select="onSelect" />

    <MobileFeedback v-else-if="entry.normalizing.value" state="loading" title="Đang mở cài đặt" />

    <template v-else>
      <header class="crm-settings__head">
        <button type="button" class="crm-settings__back" aria-label="Quay lại danh sách cài đặt" @click="entry.backToList">
          <i class="mdi mdi-arrow-left" aria-hidden="true" />
        </button>
        <h1 class="crm-settings__title">{{ title }}</h1>
      </header>
      <!-- Trang mobile dựng riêng (F1): theo token --m-* nên có Sáng/Tối; trang desktop tương ứng KHÔNG được mount. -->
      <div v-if="policy.kind === 'native'" class="crm-settings__native">
        <component :is="nativePages[policy.page]" v-if="entry.ready.value" />
        <MobileFeedback v-else state="loading" title="Đang mở cài đặt" />
      </div>
      <!-- Component desktop dùng lại (controller/RBAC gốc) có nhánh mobile riêng: nằm trong khung token nên đúng cả Sáng/Tối. -->
      <div v-else-if="policy.kind === 'shared'" class="crm-settings__native">
        <slot v-if="entry.ready.value" />
        <MobileFeedback v-else state="loading" title="Đang mở cài đặt" />
      </div>
      <!-- Component desktop giữ nguyên trong "đảo": Sáng, trừ trang thuần Vuetify đã duyệt thì theo Sáng/Tối. -->
      <v-theme-provider v-else :theme="islandTheme" with-background class="crm-settings__content">
        <slot v-if="entry.ready.value" />
        <MobileFeedback v-else state="loading" title="Đang mở cài đặt" />
      </v-theme-provider>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, provide, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { MOBILE_SHELL_KEY } from '@/components/mobile/shell/shell-context';
import { mobileRouteTitle } from '@/composables/use-mobile-nav';
import { useSettingsNav } from '@/composables/use-settings-nav';
import { useMobileSettingsEntry } from '@/composables/mobile-settings/use-mobile-settings-entry';
import { settingsPagePolicy, type NativePageKey } from '@/composables/mobile-settings/settings-page-registry';
import { MOBILE_SETTINGS_KEY } from './settings-context';
import { useUiThemeStore, VUETIFY_THEME_NAME } from '@/stores/ui-theme';
import MobileSettingsMenu from './MobileSettingsMenu.vue';

const nativePages: Record<NativePageKey, Component> = {
  account: defineAsyncComponent(() => import('@/views/mobile/settings/MobileAccountPage.vue')),
  notifications: defineAsyncComponent(() => import('@/views/mobile/settings/MobileNotificationsPage.vue')),
  internalContact: defineAsyncComponent(() => import('@/views/mobile/settings/MobileInternalContactPage.vue')),
  permissionGroups: defineAsyncComponent(() => import('@/views/mobile/settings/MobilePermissionGroupsPage.vue')),
  departments: defineAsyncComponent(() => import('@/views/mobile/settings/MobileDepartmentsPage.vue')),
  scoring: defineAsyncComponent(() => import('@/views/mobile/settings/MobileScoringPage.vue')),
  integrations: defineAsyncComponent(() => import('@/views/mobile/settings/MobileIntegrationsPage.vue')),
  audit: defineAsyncComponent(() => import('@/views/mobile/settings/MobileAuditPage.vue')),
  statuses: defineAsyncComponent(() => import('@/views/mobile/settings/MobileStatusesPage.vue')),
  tags: defineAsyncComponent(() => import('@/views/mobile/settings/MobileTagsPage.vue')),
};

const route = useRoute();
const { visibleGroups, activeItem, searchItems } = useSettingsNav();
const entry = useMobileSettingsEntry();
const shell = inject(MOBILE_SHELL_KEY, null);

const query = ref('');
const results = computed(() => searchItems(query.value));
// Component desktop dùng chung (OrgSettings, UsersRbacView) đọc cờ này để bật nhánh mobile; ngoài khung này mặc định false.
provide(MOBILE_SETTINGS_KEY, true);
const policy = computed(() => settingsPagePolicy(route.name, route.query));
const uiTheme = useUiThemeStore();
const islandTheme = computed(() => (policy.value.kind === 'island' && policy.value.followTheme ? VUETIFY_THEME_NAME[uiTheme.resolved] : 'hsLight'));
const title = computed(() => (policy.value.kind === 'native' ? policy.value.title : activeItem.value?.item.label ?? mobileRouteTitle(route)));
// Menu/đích desktop giữ nguyên (kể cả Thông báo của tôi -> /settings/channels/zalo?tab=internal-contact).
function onSelect(to: string) { entry.openItem(to); }

// Cấp 2 tự dựng header (nút quay lại về danh sách + tiêu đề trang): xin shell ẩn header mặc định. Cấp 1 dùng header shell ("Cài đặt").
let release: (() => void) | null = null;
function giveBackHeader() { release?.(); release = null; }
watch(
  () => entry.isRoot.value || entry.normalizing.value,
  (hideNothing) => {
    giveBackHeader();
    if (!hideNothing && shell) release = shell.requestChrome({ header: false });
  },
  { immediate: true },
);
// Watcher chạy ngoài scope của requestChrome nên shell không tự trả: phải trả khi shell Cài đặt bị gỡ (vd bấm tab khác).
onBeforeUnmount(giveBackHeader);
</script>

<style scoped>
.crm-settings { min-height: 100%; display: flex; flex-direction: column; }
.crm-settings__head {
  position: sticky; top: 0; z-index: var(--m-z-header); flex: none; display: flex; align-items: center; gap: var(--m-space-1); height: var(--m-header); padding: 0 var(--m-space-2);
  background: var(--m-surface); color: var(--m-text); border-bottom: 1px solid var(--m-line);
}
.crm-settings__back { flex: none; display: inline-grid; place-items: center; width: var(--m-touch); height: var(--m-touch); padding: 0; border: 0; border-radius: var(--m-radius-md); background: transparent; color: inherit; font-size: 24px; cursor: pointer; touch-action: manipulation; }
.crm-settings__back:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 1px; }
.crm-settings__title { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 20px; line-height: 1.25; font-weight: 700; letter-spacing: -0.2px; }

/* Trang mobile dựng riêng: nền theo token shell (Sáng/Tối), chừa chỗ cuối cho tabbar/nút Hội thoại. */
.crm-settings__native { flex: 1; min-width: 0; padding: var(--m-space-4) var(--m-gutter) calc(var(--m-space-8) + var(--m-safe-bottom)); box-sizing: border-box; overflow-x: hidden; background: var(--m-bg); }

/* Đảo sáng của trang desktop: cuộn theo shell, chừa chỗ cuối cho tabbar/nút Hội thoại (shell đã cộng --m-fab-lift) + thêm khoảng thở. */
.crm-settings__content { flex: 1; min-width: 0; padding: var(--m-space-4) var(--m-gutter) calc(var(--m-space-8) + var(--m-safe-bottom)); box-sizing: border-box; overflow-x: hidden; }
.crm-settings__content :deep(input), .crm-settings__content :deep(select), .crm-settings__content :deep(textarea) { font-size: 16px; }

/* Trang "Tài khoản của tôi" (PersonalAccountPage): ảnh đại diện, tên, SĐT, email xếp MỘT cột, không cắt. CSS chỉ nằm trong khung mobile. */
.crm-settings__content :deep(.account-page) { max-width: none; }
.crm-settings__content :deep(.account-page .page-head) { display: none; }
.crm-settings__content :deep(.account-page .card-pad) { padding: var(--m-space-4); }
.crm-settings__content :deep(.account-page .card-head) { padding: var(--m-space-3) var(--m-space-4); }
.crm-settings__content :deep(.account-page .hero) { flex-direction: column; align-items: flex-start; gap: var(--m-space-4); }
.crm-settings__content :deep(.account-page .hero-info) { width: 100%; min-width: 0; }
.crm-settings__content :deep(.account-page .hero-name) { flex-wrap: wrap; gap: var(--m-space-2); overflow-wrap: anywhere; }
.crm-settings__content :deep(.account-page .hero-meta) { flex-direction: column; gap: var(--m-space-1); overflow-wrap: anywhere; }
.crm-settings__content :deep(.account-page .avatar-actions) { flex-wrap: wrap; }
.crm-settings__content :deep(.account-page .frow) { flex-direction: column; align-items: flex-start; gap: var(--m-space-1); }
.crm-settings__content :deep(.account-page .flabel) { width: auto; }
.crm-settings__content :deep(.account-page .fval) { width: 100%; overflow-wrap: anywhere; }
.crm-settings__content :deep(.account-page .finput) { width: 100%; max-width: none; min-height: var(--m-touch); }
.crm-settings__content :deep(.account-page .sec-row) { flex-wrap: wrap; gap: var(--m-space-3); }
.crm-settings__content :deep(.account-page .shortcuts) { grid-template-columns: 1fr; }
.crm-settings__content :deep(.account-page .btn) { min-height: var(--m-touch); }
.crm-settings__content :deep(.account-page .avatar-edit) { min-width: var(--m-touch); min-height: var(--m-touch); }

/* Hồ sơ tổ chức: bố cục mobile đầy đủ nằm trong OrgSettings (inject mobile, scoped; shared.patch). Phần dưới là phương án dự phòng
   khi patch chưa được áp: chỉ chỉnh bố cục 1 cột, không đụng màu. */
.crm-settings__content :deep(.org-settings-layout) { min-width: 0; max-width: 100%; gap: var(--m-space-4); }
.crm-settings__content :deep(.org-form-col),
.crm-settings__content :deep(.org-preview-col) { flex: 1 1 100%; width: 100%; max-width: 100%; min-width: 0; }
.crm-settings__content :deep(.org-preview-col .login-card) { width: 100%; max-width: 100%; height: auto; flex-direction: column; }
.crm-settings__content :deep(.org-preview-col .login-form-wrap) { min-width: 0; padding: var(--m-space-6) var(--m-space-4); }
</style>
