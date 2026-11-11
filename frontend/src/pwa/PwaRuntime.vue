<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useOfflineQueue } from '@/composables/use-offline-queue';
import { useDesktopChatDrafts } from '@/composables/use-desktop-chat-drafts';
import { useMobileChatDrafts } from '@/composables/mobile/use-mobile-chat-drafts';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';
import { pwaDisabled, setPwaReloadGuard } from './register';
import { clearUserBrowserStorage } from './session-cleanup';
import PwaUpdatePrompt from './PwaUpdatePrompt.vue';
import { isSpaPath } from './policy';
import { pwaLaunchUrl } from './launch-state';

const auth = useAuthStore();
const router = useRouter();
const online = shallowRef(navigator.onLine);
const retrying = shallowRef(false);
const needsVerification = computed(() => !!auth.token && !auth.user && (!online.value || auth.profileUnavailable));
const verificationMessage = computed(() => online.value ? 'Chưa xác minh được phiên đăng nhập. Máy chủ có thể đang bận; hãy thử lại.' : 'Không có kết nối mạng. Phiên đăng nhập vẫn được giữ. Kết nối mạng để xác minh và tiếp tục.');
function syncOnline(): void { online.value = navigator.onLine; }
async function retryProfile(): Promise<void> {
  if (retrying.value) return;
  retrying.value = true;
  try { await auth.init(); } finally { retrying.value = false; }
}
watch(() => auth.user?.id, userId => {
  if (!userId || !auth.token || router.currentRoute.value.path !== '/login') return;
  const target = new URL(pwaLaunchUrl, window.location.origin);
  if (target.pathname !== '/login' && isSpaPath(target.pathname)) void router.replace(target.pathname + target.search + target.hash);
});
const drafts = useMobileChatDrafts();
const desktopDrafts = useDesktopChatDrafts();
const queue = useOfflineQueue();
const domHasDraft = shallowRef(false);
let composerObserver: MutationObserver | undefined;
const cleanupBlocked = shallowRef(false);
const blocked = computed(() => drafts.hasAnyDraft() || desktopDrafts.hasAnyDraft() || queue.pendingCount.value > 0 || domHasDraft.value);
// Also protect desktop rich-text composers; these drafts do not use the mobile RAM map.
function inspectComposer(): void {
  domHasDraft.value = [...document.querySelectorAll<HTMLElement>('[contenteditable="true"]')]
    .some(element => !!element.textContent?.trim());
}
async function cleanup(): Promise<void> {
  try { cleanupBlocked.value = !(await clearUserBrowserStorage()); }
  catch { cleanupBlocked.value = true; }
}
watch(() => [auth.user?.orgId ?? '', auth.user?.id ?? '', auth.token] as const, ([org, user, token], old) => {
  // An unverified cold-start token is not a logout and must not grant offline access.
  if (token && !user) return;
  const previousUserId = old?.[1] || null;
  if (!token || (previousUserId && (old?.[0] !== org || previousUserId !== user))) {
    void cleanup();
    if (previousUserId || !token) window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId, userId: user || null } }));
  }
}, { immediate: true });
onMounted(() => {
  inspectComposer();
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  document.addEventListener('input', inspectComposer, true);
  // Tiptap updates after the capture-phase input handler and may clear without an input event.
  // MutationObserver batches actual DOM transactions, including clear/remove, without polling.
  if (typeof MutationObserver !== 'undefined') {
    composerObserver = new MutationObserver(inspectComposer);
    composerObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  setPwaReloadGuard(() => { inspectComposer(); return !blocked.value; });
});
onBeforeUnmount(() => { composerObserver?.disconnect(); window.removeEventListener('online', syncOnline); window.removeEventListener('offline', syncOnline); document.removeEventListener('input', inspectComposer, true); setPwaReloadGuard(() => false); });
</script>

<template>
  <PwaUpdatePrompt :blocked="blocked" />
  <aside v-if="!online && !auth.token" class="crm-mobile pwa-notice" role="status">Bạn đang ngoại tuyến. Kết nối mạng để đăng nhập hoặc tải dữ liệu.</aside>
  <section v-if="needsVerification" class="crm-mobile pwa-verification" role="status" aria-live="polite">
    <div class="pwa-verification-card">
      <h1>{{ online ? 'Chưa thể mở ứng dụng' : 'Bạn đang ngoại tuyến' }}</h1>
      <p>{{ verificationMessage }}</p>
      <button type="button" :disabled="!online || retrying" @click="retryProfile">{{ retrying ? 'Đang kiểm tra…' : 'Thử lại' }}</button>
    </div>
  </section>
  <aside v-if="pwaDisabled" class="crm-mobile pwa-notice" role="status">Chế độ ngoại tuyến tạm tắt. Bạn vẫn có thể dùng ứng dụng khi có mạng.</aside>
  <aside v-if="cleanupBlocked" class="crm-mobile pwa-notice" role="alert">Hãy đóng các tab CRM khác để dọn bộ nhớ của phiên trước. <button type="button" @click="cleanup">Thử lại</button></aside>
</template>

<style scoped>
.pwa-verification { position: fixed; inset: 0; z-index: 20000; display: grid; place-items: center; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); background: var(--m-bg, #f7f9fc); color: var(--m-text, #152838); font: var(--m-font-body, 16px)/1.6 var(--m-font-family, system-ui, sans-serif); }
.pwa-verification-card { width: min(100%, 440px); padding: 24px; background: var(--m-surface, #fff); border: 1px solid var(--m-line, #d5dce5); border-radius: var(--m-radius-lg, 18px); }
.pwa-verification h1 { font-size: 22px; line-height: 1.35; margin-bottom: 12px; }
.pwa-verification button { min-height: 44px; padding: 10px 18px; border-radius: 10px; border: 0; font: inherit; background: var(--m-brand-strong, #0b5880); color: var(--m-on-action, #fff); }
.pwa-verification button:disabled { opacity: .6; }
.pwa-verification button:focus-visible { outline: 3px solid var(--m-focus, #0b5880); outline-offset: 3px; }
.pwa-notice { position: fixed; z-index: 2999; left: 12px; right: 12px; bottom: max(100px, env(safe-area-inset-bottom)); width: fit-content; max-width: calc(100vw - 24px); margin: auto; padding: 12px 16px; border: 1px solid var(--m-line, #d5dce5); border-radius: var(--m-radius-md, 12px); background: var(--m-surface, #fff); color: var(--m-text, #152838); font: var(--m-font-body, 16px)/1.4 var(--m-font-family, system-ui, sans-serif); }
.pwa-notice button { min-height: 44px; padding: 8px 12px; color: var(--m-brand-strong, #0b5880); font: inherit; text-decoration: underline; }
</style>
