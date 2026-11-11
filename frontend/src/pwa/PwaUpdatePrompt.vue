<script setup lang="ts">
import { acceptPwaUpdate, pwaUpdating, pwaWaiting } from './register';
defineProps<{ blocked: boolean }>();
</script>

<template>
  <aside v-if="pwaWaiting" class="crm-mobile pwa-update" role="status" aria-live="polite">
    <span>Có bản mới — <span v-if="blocked">hãy xử lý nháp và tin đang chờ gửi trước.</span></span>
    <button type="button" :disabled="blocked || pwaUpdating" @click="acceptPwaUpdate">{{ pwaUpdating ? 'Đang cập nhật…' : 'Cập nhật' }}</button>
  </aside>
</template>

<style scoped>
.pwa-update { position: fixed; z-index: 3000; top: max(12px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: min(92vw, 520px); display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--m-line, #d5dce5); border-radius: var(--m-radius-md, 14px); box-shadow: var(--m-shadow, 0 8px 30px #15283833); background: var(--m-surface, #fff); color: var(--m-text, #152838); font: var(--m-font-body, 16px)/1.4 var(--m-font-family, system-ui, sans-serif); }
.pwa-update button { flex-shrink: 0; min-height: 44px; border: 0; border-radius: 10px; padding: 8px 14px; background: var(--m-brand-strong, #0b5880); color: var(--m-on-action, #fff); font: inherit; cursor: pointer; }
.pwa-update button:disabled { opacity: .6; cursor: default; }
.pwa-update button:focus-visible { outline: 3px solid var(--m-focus, #0b5880); outline-offset: 3px; }
</style>
