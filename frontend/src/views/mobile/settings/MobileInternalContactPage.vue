<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { useReadonlyLoad } from '@/composables/mobile-settings/use-readonly-load';
interface Config {
  method: string | null;
  internalContactPhone: string | null;
  internalContactNick: { displayName: string | null } | null;
  recipient: { status: string; error: string | null } | null;
}
const router = useRouter();
const load = useReadonlyLoad<Config>(async () => (await api.get('/me/internal-contact')).data);
const labels: Record<string, string> = { ready: 'Sẵn sàng nhận thông báo', pending_friend_request: 'Đang chờ kết bạn', pending_user_confirm: 'Đang chờ xác nhận', failed: 'Cần quản trị kiểm tra' };
const status = computed(() => load.data.value?.recipient?.status);
onMounted(load.load);
</script>

<template>
  <section class="crm-ic">
    <button type="button" class="crm-ic__feed" @click="router.push('/settings/personal/notifications')">
      <i class="mdi mdi-bell-outline" aria-hidden="true" /> Xem thông báo cần xử lý
      <i class="mdi mdi-chevron-right" aria-hidden="true" />
    </button>
    <MobileFeedback v-if="load.state.value !== 'ready'" :state="load.state.value" :title="load.state.value === 'error' ? 'Không tải được cấu hình thông báo' : undefined" :retryable="load.state.value !== 'forbidden'" @retry="load.load" />
    <template v-else>
      <dl class="crm-ic__card">
        <div><dt>Trạng thái nhận thông báo</dt><dd>{{ status ? labels[status] ?? status : 'Chưa có cấu hình nhận thông báo' }}</dd></div>
        <div v-if="load.data.value?.internalContactNick?.displayName"><dt>Nick nhận thông báo</dt><dd>{{ load.data.value.internalContactNick.displayName }}</dd></div>
        <div v-if="load.data.value?.internalContactPhone"><dt>Số điện thoại nhận thông báo</dt><dd>{{ load.data.value.internalContactPhone }}</dd></div>
        <div v-if="load.data.value?.recipient?.error"><dt>Lỗi nhận thông báo</dt><dd role="alert">{{ load.data.value.recipient.error }}</dd></div>
      </dl>
      <p class="crm-ic__note">Để thay đổi nơi nhận thông báo, nhờ quản trị viên dùng máy tính kiểm tra tại Thông báo hệ thống. Thiết lập thủ công đã được khóa.</p>
    </template>
  </section>
</template>

<style scoped>
.crm-ic { display: flex; flex-direction: column; gap: var(--m-space-4); min-width: 0; color: var(--m-text); }
.crm-ic__feed { display: flex; align-items: center; gap: var(--m-space-2); min-height: var(--m-touch); padding: var(--m-space-2) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; text-align: left; cursor: pointer; touch-action: manipulation; }
.crm-ic__feed .mdi-chevron-right { margin-left: auto; }
.crm-ic__feed:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-ic__card { margin: 0; padding: var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); display: grid; gap: var(--m-space-4); }
.crm-ic__card dt { color: var(--m-muted); font-size: var(--m-font-meta); }
.crm-ic__card dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.crm-ic__note { margin: 0; color: var(--m-muted); line-height: 1.5; }
</style>
