<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  "Thông báo cần xử lý" (F1): danh sách thông báo trong app (GET /notifications, cùng đích với NotificationBell). Chỉ đọc.
  KHÔNG thay mục menu "Thông báo của tôi" (đó là cấu hình Zalo nội bộ, mở bằng wizard gốc) — trang này chỉ là feed phụ, có lối sang wizard.
-->
<template>
  <section class="crm-np" aria-labelledby="crm-np-h">
    <h2 id="crm-np-h" class="crm-np__h">Cần xử lý</h2>
    <MobileFeedback v-if="load.state.value === 'loading'" state="loading" />
    <MobileFeedback v-else-if="load.state.value !== 'ready'" :state="load.state.value" :title="load.state.value === 'error' ? 'Không tải được thông báo' : undefined" retryable @retry="load.load" />
    <MobileFeedback v-else-if="load.items.value.length === 0" state="empty" title="Không có thông báo" description="Khi có việc cần xử lý, bạn sẽ thấy ở đây." />
    <ul v-else class="crm-np__list">
      <li v-for="n in load.items.value" :key="n.id">
        <component :is="target(n.id) ? 'button' : 'div'" class="crm-np__row" :type="target(n.id) ? 'button' : undefined" @click="open(n.id)">
          <i class="mdi crm-np__ic" :class="[iconFor(n.type), `crm-np__ic--${n.type}`]" aria-hidden="true" />
          <span class="crm-np__text">
            <span class="crm-np__title"><span class="crm-np__sr">{{ levelLabel(n.type) }}: </span>{{ n.title }}</span>
            <span class="crm-np__detail">{{ n.detail }}</span>
          </span>
          <i v-if="target(n.id)" class="mdi mdi-chevron-right crm-np__chev" aria-hidden="true" />
        </component>
      </li>
    </ul>
    <button type="button" class="crm-np__cfg" @click="router.push(INTERNAL_CONTACT_ROUTE)">
      <i class="mdi mdi-cog-outline" aria-hidden="true" /> Cấu hình nhận thông báo qua Zalo
    </button>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { notificationTarget, useMobileNotifications } from '@/composables/mobile-settings/use-mobile-notifications';

const INTERNAL_CONTACT_ROUTE = '/settings/channels/zalo?tab=internal-contact';
const router = useRouter();
const load = useMobileNotifications();
onMounted(() => { void load.load(); });

const target = notificationTarget;
function open(id: string) {
  const to = notificationTarget(id);
  if (to) void router.push(to);
}
function levelLabel(type: string): string {
  return type === 'error' ? 'Lỗi' : type === 'warning' ? 'Cảnh báo' : 'Thông tin';
}
function iconFor(type: string): string {
  if (type === 'error') return 'mdi-alert-circle';
  if (type === 'warning') return 'mdi-alert';
  return 'mdi-information';
}
</script>

<style scoped>
.crm-np { display: flex; flex-direction: column; gap: var(--m-space-4); }
.crm-np__h { margin: 0; font-size: var(--m-font-section); font-weight: 650; color: var(--m-text); }
.crm-np__list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); overflow: hidden; }
.crm-np__list > li + li { border-top: 1px solid var(--m-line); }
.crm-np__row { display: flex; align-items: flex-start; gap: var(--m-space-3); width: 100%; min-height: var(--m-touch); padding: var(--m-space-3) var(--m-space-4); border: 0; background: transparent; color: var(--m-text); font: inherit; text-align: left; box-sizing: border-box; }
button.crm-np__row { cursor: pointer; touch-action: manipulation; }
button.crm-np__row:active { background: var(--m-surface-inset); }
button.crm-np__row:focus-visible { outline: 3px solid var(--m-focus); outline-offset: -3px; }
.crm-np__ic { flex: none; font-size: 22px; line-height: 1.2; color: var(--m-brand-strong); }
.crm-np__ic--warning { color: var(--m-warning); }
.crm-np__ic--error { color: var(--m-danger); }
.crm-np__text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.crm-np__title { font-weight: 650; overflow-wrap: anywhere; }
.crm-np__detail { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-np__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.crm-np__cfg { display: inline-flex; align-items: center; justify-content: center; gap: var(--m-space-2); min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-np__cfg:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-np__chev { flex: none; align-self: center; font-size: 22px; color: var(--m-muted); }
</style>
