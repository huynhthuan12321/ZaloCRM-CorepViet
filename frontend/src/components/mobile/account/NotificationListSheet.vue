<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Danh sách thông báo trong app (D-8). Cùng endpoint GET /notifications và cùng đích điều hướng với
     NotificationBell; chỉ đọc, không đổi API. Trang cài đặt thông báo vẫn "sắp có". -->
<template>
  <MobileSheet :open="open" title="Thông báo" @update:open="emit('update:open', $event)">
    <MobileFeedback v-if="state === 'loading'" state="loading" />
    <MobileFeedback v-else-if="state === 'error'" state="error" title="Không tải được thông báo" retryable @retry="load" />
    <MobileFeedback v-else-if="items.length === 0" state="empty" title="Không có thông báo" description="Khi có việc cần xử lý, bạn sẽ thấy ở đây." />
    <ul v-else class="m-notif">
      <li v-for="n in items" :key="n.id">
        <button type="button" class="m-notif__row" @click="openItem(n)">
          <i class="mdi m-notif__icon" :class="[iconFor(n.type), `m-notif__icon--${n.type}`]" aria-hidden="true" />
          <span class="m-notif__text">
            <span class="m-notif__title">{{ n.title }}</span>
            <span class="m-notif__detail">{{ n.detail }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p class="m-notif__soon">Cài đặt thông báo: sắp có.</p>
  </MobileSheet>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
}

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const router = useRouter();
const items = ref<NotificationItem[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');

async function load() {
  state.value = 'loading';
  try {
    const res = await api.get('/notifications');
    items.value = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
    state.value = 'ready';
  } catch {
    state.value = 'error'; // lỗi hiện là lỗi, không giả làm "không có thông báo"
  }
}

watch(() => props.open, (isOpen) => { if (isOpen) void load(); }, { immediate: true });

function iconFor(type: string): string {
  if (type === 'error') return 'mdi-alert-circle';
  if (type === 'warning') return 'mdi-alert';
  return 'mdi-information';
}

// Cùng bản đồ đích với NotificationBell.handleClick.
function openItem(n: NotificationItem) {
  emit('update:open', false);
  if (n.id === 'unreplied') void router.push('/chat');
  else if (n.id.startsWith('apt-') || n.id === 'tmr-apts') void router.push('/appointments');
  else if (n.id.startsWith('zalo-')) void router.push('/zalo-accounts');
}
</script>

<style scoped>
.m-notif {
  margin: 0;
  padding: 0;
  list-style: none;
}
.m-notif li + li {
  border-top: 1px solid var(--m-line);
}
.m-notif__row {
  display: flex;
  align-items: flex-start;
  gap: var(--m-space-3);
  width: 100%;
  min-height: 52px;
  padding: var(--m-space-3) 0;
  border: 0;
  background: transparent;
  color: var(--m-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}
.m-notif__row:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-notif__icon {
  flex: none;
  font-size: 22px;
  line-height: 1.2;
  color: var(--m-brand-strong);
}
.m-notif__icon--warning {
  color: var(--m-warning);
}
.m-notif__icon--error {
  color: var(--m-danger);
}
.m-notif__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.m-notif__title {
  font-weight: 650;
  overflow-wrap: anywhere;
}
.m-notif__detail {
  font-size: var(--m-font-meta);
  color: var(--m-muted);
  overflow-wrap: anywhere;
}
.m-notif__soon {
  margin: var(--m-space-4) 0 0;
  font-size: var(--m-font-meta);
  color: var(--m-muted);
  text-align: center;
}
</style>
