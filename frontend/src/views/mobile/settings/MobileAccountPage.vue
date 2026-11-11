<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  "Tài khoản của tôi" (F1): sửa họ tên (sheet có chặn mất dữ liệu), đổi/xóa ảnh đại diện, đổi mật khẩu (dùng lại ChangePasswordModal desktop).
  Email/SĐT/vai trò chỉ xem, do quản trị quản lý (đúng desktop). Token --m-* nên có Sáng/Tối.
-->
<template>
  <section v-if="auth.user" class="crm-ap">
    <div class="crm-ap__hero">
      <Avatar :src="auth.user.avatarUrl" :name="auth.user.fullName" :size="72" :platform="null" />
      <div class="crm-ap__who">
        <strong class="crm-ap__name">{{ auth.user.fullName }}</strong>
        <span class="crm-ap__role">{{ roleLabel(auth.user.role) }}</span>
        <span class="crm-ap__org">{{ auth.user.orgName }}</span>
      </div>
    </div>

    <div class="crm-ap__actions">
      <button type="button" class="crm-btn" :disabled="profile.avatarBusy.value" @click="fileInput?.click()">
        <i class="mdi mdi-camera-outline" aria-hidden="true" />{{ profile.avatarBusy.value ? 'Đang xử lý…' : 'Đổi ảnh' }}
      </button>
      <button v-if="auth.user.avatarUrl" type="button" class="crm-btn crm-btn--danger" :disabled="profile.avatarBusy.value" @click="onRemoveAvatar">
        <i class="mdi mdi-trash-can-outline" aria-hidden="true" />Xóa ảnh
      </button>
      <input ref="fileInput" type="file" :accept="AVATAR_ACCEPT" hidden @change="onFilePicked" />
    </div>

    <h2 class="crm-ap__h">Thông tin</h2>
    <dl class="crm-ap__card">
      <div class="crm-ap__row">
        <dt>Họ tên</dt>
        <dd>{{ auth.user.fullName }}</dd>
        <button type="button" class="crm-ap__edit" aria-label="Sửa họ tên" :disabled="profile.busy.value" @click="openName"><i class="mdi mdi-pencil-outline" aria-hidden="true" /></button>
      </div>
      <div class="crm-ap__row"><dt>Email</dt><dd>{{ auth.user.email || '—' }}</dd></div>
      <div class="crm-ap__row"><dt>Số điện thoại</dt><dd>{{ auth.user.phone || '—' }}</dd></div>
      <div class="crm-ap__row"><dt>Vai trò</dt><dd>{{ roleLabel(auth.user.role) }}</dd></div>
    </dl>
    <p class="crm-ap__hint"><i class="mdi mdi-lock-outline" aria-hidden="true" /> Email và số điện thoại do quản trị quản lý.</p>

    <h2 class="crm-ap__h">Bảo mật</h2>
    <button type="button" class="crm-ap__link" @click="showPw = true">
      <i class="mdi mdi-key-outline" aria-hidden="true" /><span>Đổi mật khẩu</span><i class="mdi mdi-chevron-right" aria-hidden="true" />
    </button>

    <MobileSheet :open="nameOpen" title="Sửa họ tên" :dirty="dirty" :persistent="profile.saving.value" @update:open="nameOpen = $event">
      <form id="crm-ap-name" class="crm-ap__form" novalidate @submit.prevent="submitName">
        <p v-if="profile.error.value" class="crm-ap__err" role="alert">{{ profile.error.value }}</p>
        <label for="crm-ap-fullname">Họ tên</label>
        <input id="crm-ap-fullname" v-model="nameDraft" type="text" :maxlength="NAME_MAX" autocomplete="name" :aria-invalid="!!profile.error.value" />
        <p class="crm-ap__count">{{ nameDraft.trim().length }}/{{ NAME_MAX }}</p>
      </form>
      <template #footer="{ requestClose }">
        <div class="crm-ap__foot">
          <button type="button" class="crm-btn" :disabled="profile.saving.value" @click="requestClose">Hủy</button>
          <button type="submit" form="crm-ap-name" class="crm-btn crm-btn--primary" :disabled="profile.saving.value || !dirty || !!validateFullName(nameDraft)">{{ profile.saving.value ? 'Đang lưu…' : 'Lưu thay đổi' }}</button>
        </div>
      </template>
    </MobileSheet>

    <ChangePasswordModal v-if="showPw" @close="showPw = false" />
  </section>
  <MobileFeedback v-else state="error" title="Không có thông tin tài khoản" description="Đăng nhập lại để tiếp tục." />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Avatar from '@/components/ui/Avatar.vue';
import ChangePasswordModal from '@/components/settings/ChangePasswordModal.vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { useAuthStore } from '@/stores/auth';
import { useConfirm } from '@/composables/use-confirm';
import { roleLabel } from '@/composables/mobile-settings/employee-model';
import { AVATAR_ACCEPT, NAME_MAX, useMobileAccountProfile, validateFullName } from '@/composables/mobile-settings/use-mobile-account-profile';

const auth = useAuthStore();
const profile = useMobileAccountProfile();
const { confirm } = useConfirm();

const fileInput = ref<HTMLInputElement | null>(null);
const showPw = ref(false);
const nameOpen = ref(false);
const nameDraft = ref('');
const dirty = computed(() => nameOpen.value && nameDraft.value.trim() !== (auth.user?.fullName ?? ''));

function openName() {
  nameDraft.value = auth.user?.fullName ?? '';
  profile.error.value = '';
  nameOpen.value = true;
}
async function submitName() {
  if (!dirty.value) { nameOpen.value = false; return; }
  if (await profile.saveName(nameDraft.value)) nameOpen.value = false;
}
async function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await profile.uploadAvatar(file);
}
async function onRemoveAvatar() {
  if (!(await confirm({ title: 'Xóa ảnh đại diện?', tone: 'danger', confirmText: 'Xóa ảnh', cancelText: 'Giữ lại' }))) return;
  await profile.removeAvatar();
}
</script>

<style scoped>
.crm-ap { display: flex; flex-direction: column; gap: var(--m-space-4); color: var(--m-text); }
.crm-ap__hero { display: flex; align-items: center; gap: var(--m-space-4); min-width: 0; }
.crm-ap__who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.crm-ap__name { font-size: var(--m-font-title); line-height: 1.2; font-weight: 700; overflow-wrap: anywhere; }
.crm-ap__role { font-weight: 650; color: var(--m-brand-strong); }
.crm-ap__org { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-ap__actions { display: flex; flex-wrap: wrap; gap: var(--m-space-3); }
.crm-ap__h { margin: var(--m-space-2) 0 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-ap__card { margin: 0; border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); overflow: hidden; }
.crm-ap__row { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: var(--m-space-2); min-height: 56px; padding: var(--m-space-2) var(--m-space-2) var(--m-space-2) var(--m-space-4); }
.crm-ap__row + .crm-ap__row { border-top: 1px solid var(--m-line); }
.crm-ap__row dt { grid-column: 1 / -1; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-ap__row dd { margin: 0; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.crm-ap__edit { display: inline-grid; place-items: center; width: var(--m-touch); height: var(--m-touch); border: 0; border-radius: var(--m-radius-md); background: transparent; color: var(--m-brand-strong); font-size: 22px; cursor: pointer; touch-action: manipulation; }
.crm-ap__edit:disabled { opacity: 0.5; }
.crm-ap__hint { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-ap__link { display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 56px; padding: 0 var(--m-space-3) 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; text-align: left; cursor: pointer; touch-action: manipulation; }
.crm-ap__link span { flex: 1; }
.crm-ap__link i:first-child { font-size: 22px; color: var(--m-brand-strong); }
.crm-ap__link i:last-child { font-size: 22px; color: var(--m-muted); }
.crm-ap__form { display: flex; flex-direction: column; gap: var(--m-space-2); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); }
.crm-ap__form label { font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.crm-ap__form input { width: 100%; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; box-sizing: border-box; }
.crm-ap__form input[aria-invalid='true'] { border-color: var(--m-danger); }
.crm-ap__err { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-weight: 600; }
.crm-ap__count { margin: 0; align-self: flex-end; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-ap__foot { display: flex; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--m-space-2); flex: 1; min-width: 120px; min-height: 48px; padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-btn:disabled { opacity: 0.6; cursor: default; }
.crm-btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-btn--danger { color: var(--m-danger); }
.crm-btn:focus-visible, .crm-ap__link:focus-visible, .crm-ap__edit:focus-visible, .crm-ap__form input:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
