<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Màn Tài khoản (route /account, chỉ mobile). Tiêu đề do MobilePageHeader của MobileLayout dựng. -->
<template>
  <div class="crm-mobile m-account">
    <section v-if="auth.user" class="m-account__profile" aria-label="Hồ sơ của bạn">
      <Avatar :src="auth.user.avatarUrl" :name="auth.user.fullName" :size="56" />
      <div class="m-account__who">
        <p class="m-account__name">{{ auth.user.fullName }}</p>
        <p v-if="auth.user.orgName" class="m-account__meta">{{ auth.user.orgName }}</p>
        <p v-if="auth.user.permissionGroupName" class="m-account__meta">{{ auth.user.permissionGroupName }}</p>
      </div>
    </section>

    <ThemeModePicker :model-value="theme.preference" @update:model-value="theme.setPreference" />

    <AccountMenuList :items="menuItems" @select="onSelect" />

    <button type="button" class="m-account__logout" @click="onLogout">
      <i class="mdi mdi-logout" aria-hidden="true" />
      <span>Đăng xuất</span>
    </button>

    <NotificationListSheet v-model:open="showNotifications" />
    <!-- Dùng lại modal đổi mật khẩu hiện có (cùng PersonalAccountPage); chỉ ép ô nhập ≥16px để iOS không tự zoom. -->
    <ChangePasswordModal v-if="showPassword" class="m-account__pw" @close="showPassword = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import '@/assets/mobile-tokens.css';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiThemeStore } from '@/stores/ui-theme';
import { useConfirm } from '@/composables/use-confirm';
import Avatar from '@/components/ui/Avatar.vue';
import ChangePasswordModal from '@/components/settings/ChangePasswordModal.vue';
import AccountMenuList from '@/components/mobile/account/AccountMenuList.vue';
import ThemeModePicker from '@/components/mobile/account/ThemeModePicker.vue';
import NotificationListSheet from '@/components/mobile/account/NotificationListSheet.vue';
import { buildAccountMenuItems, type AccountMenuItem } from '@/components/mobile/account/account-menu';

const auth = useAuthStore();
const theme = useUiThemeStore();
const router = useRouter();
const { confirm } = useConfirm();

const showNotifications = ref(false);
const showPassword = ref(false);

// Tính lại khi quyền đổi lúc đang mở màn (hạ quyền runtime -> mục biến mất).
const menuItems = computed(() => buildAccountMenuItems(auth));

function onSelect(id: AccountMenuItem['id']) {
  const item = menuItems.value.find(i => i.id === id);
  if (!item || !item.visible) return;
  if (id === 'password') showPassword.value = true;
  else if (id === 'notifications') showNotifications.value = true;
  else if (item.to) void router.push(item.to);
}

async function onLogout() {
  const ok = await confirm({
    title: 'Đăng xuất?',
    message: 'Bạn sẽ cần đăng nhập lại để tiếp tục.',
    confirmText: 'Đăng xuất',
    cancelText: 'Ở lại',
    tone: 'danger',
  });
  if (!ok) return;
  auth.logout();
  await router.replace('/login');
}
</script>

<style scoped>
.m-account {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-5);
  padding: var(--m-space-4) var(--m-gutter) var(--m-space-8);
  background: var(--m-bg);
  color: var(--m-text);
  font-family: var(--m-font-family);
  font-size: var(--m-font-body);
}
.m-account__profile {
  display: flex;
  align-items: center;
  gap: var(--m-space-4);
  padding: var(--m-space-4);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-card);
  background: var(--m-surface);
}
.m-account__who {
  min-width: 0;
}
.m-account__who p {
  margin: 0;
}
.m-account__name {
  font-size: var(--m-font-section);
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.m-account__meta {
  font-size: var(--m-font-meta);
  line-height: 1.4;
  color: var(--m-muted);
  overflow-wrap: anywhere;
}
.m-account__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--m-space-2);
  width: 100%;
  min-height: 48px;
  border: 1px solid var(--m-danger);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-danger);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  touch-action: manipulation;
}
.m-account__logout:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-account__logout .mdi {
  font-size: 20px;
  line-height: 1;
}
/* ChangePasswordModal là component desktop: ô nhập 14px làm iOS tự zoom -> ép 16px + vùng chạm 44px. */
.m-account__pw :deep(input) {
  font-size: 16px;
  min-height: 44px;
}
.m-account__pw :deep(.pw-eye),
.m-account__pw :deep(.btn),
.m-account__pw :deep(.x) {
  min-width: 44px;
  min-height: 44px;
}
/* Giao diện Tối (LOCK A-2, đợt D): ChangePasswordModal là component desktop nền trắng cố định -> dùng token --m-* (overlay nằm trong .crm-mobile nên có token). */
.m-account__pw :deep(.modal) { background: var(--m-surface); color: var(--m-text); box-shadow: var(--m-shadow); }
.m-account__pw :deep(.modal-head),
.m-account__pw :deep(.modal-foot) { border-color: var(--m-line); }
.m-account__pw :deep(.modal-foot) { background: var(--m-surface-inset); }
.m-account__pw :deep(.modal-head h3) { color: var(--m-text); }
.m-account__pw :deep(.hint),
.m-account__pw :deep(.note),
.m-account__pw :deep(.mfield label),
.m-account__pw :deep(.pwstrength),
.m-account__pw :deep(.pw-eye),
.m-account__pw :deep(.x) { color: var(--m-muted); }
.m-account__pw :deep(.pwstrength li.ok) { color: var(--m-success); }
.m-account__pw :deep(.mfield input) { background: var(--m-surface-inset); color: var(--m-text); border-color: var(--m-line); }
.m-account__pw :deep(.mfield input:focus) { border-color: var(--m-focus); box-shadow: 0 0 0 3px var(--m-tap-highlight); }
.m-account__pw :deep(.btn) { background: var(--m-surface); color: var(--m-text); border-color: var(--m-line); }
.m-account__pw :deep(.btn-primary) { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.m-account__pw :deep(.form-error),
.m-account__pw :deep(.mismatch) { background: var(--m-warning-soft); color: var(--m-danger); }
</style>
