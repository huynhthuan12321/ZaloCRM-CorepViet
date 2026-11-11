<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Khung mobile (CONTRACT-A §2.1, §5). KHÔNG dùng v-app-bar / v-bottom-navigation (layout Vuetify tự cộng padding,
  xung đột với viewport API). Cột flex: [banner offline][header][main][tabbar]; root cao var(--m-app-height, 100dvh).
  Màn con KHÔNG tự trừ pixel header/tabbar: lấy chiều cao qua useMobileShell().
-->
<template>
  <v-app :class="{ 'rpt-app rpt-mobile-app': isReportsRoute }">
    <div
      class="crm-mobile m-shell"
      :class="{ 'm-shell--banner': !isOnline, 'm-shell--keyboard': viewport.keyboardOpen.value }"
      :data-theme="effective"
      :style="cssVars"
    >
      <OfflineIndicator />

      <MobilePageHeader
        v-if="shell.headerVisible.value"
        :title="headerTitle"
        :subtitle="headerSubtitle"
        :show-back="showBack"
        :tone="isReportsRoute ? 'brand' : 'default'"
        @back="handleBack"
      >
        <template #trailing><NotificationBell /></template>
      </MobilePageHeader>

      <main
        class="m-main"
        :class="{
          'm-main--pad-top': !shell.headerVisible.value && isOnline,
          'm-main--pad-bottom': !shell.tabbarVisible.value && !viewport.keyboardOpen.value,
        }"
      >
        <div ref="scroller" class="m-main__scroll" :class="{ 'm-main__scroll--fab': hasFab }">
          <slot />
        </div>
      </main>

      <BottomNav v-if="shell.tabbarVisible.value" />
    </div>
    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import '@/assets/mobile-tokens.css';
import { useAuthStore } from '@/stores/auth';
import { useUiThemeStore } from '@/stores/ui-theme';
import { useMobile } from '@/composables/use-mobile';
import { useMobileViewport } from '@/composables/use-mobile-viewport';
import { useMobileThemeEffects } from '@/composables/use-mobile-theme-effects';
import { useMobileWaitingCount } from '@/composables/use-mobile-waiting-count';
import { useMobileBack } from '@/composables/use-mobile-back';
import { hasOwnMobileHeader, isMobileDetailRoute, isMobileRootRoute, mobileRouteTitle } from '@/composables/use-mobile-nav';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import MobilePageHeader from '@/components/mobile/shell/MobilePageHeader.vue';
import { createChromeController, MOBILE_SESSION_RESET_EVENT, MOBILE_SHELL_KEY } from '@/components/mobile/shell/shell-context';

const auth = useAuthStore();
const route = useRoute();
const uiTheme = useUiThemeStore();
const { isOnline } = useMobile();

// Báo cáo luôn Sáng (report-kit chỉ có bản sáng, D-3) và giữ header/nhãn riêng như trước.
const isReportsRoute = computed(() => route.path.startsWith('/reports/'));
const { effective } = useMobileThemeEffects({ forceLight: isReportsRoute });

// CHỈ nơi này gọi viewport; con đọc qua useMobileShell().
const viewport = useMobileViewport();
const cssVars = viewport.cssVars;

const shell = {
  viewport,
  ...createChromeController({
    tabbar: computed(() => !isMobileDetailRoute(route)),
    header: computed(() => !hasOwnMobileHeader(route)),
    keyboardOpen: viewport.keyboardOpen,
  }),
};
provide(MOBILE_SHELL_KEY, shell);

// Giữ singleton badge sống suốt vòng đời shell (BottomNav bị gỡ khi mở thread nhưng badge vẫn cần cập nhật).
// Reset/refresh khi đổi user đã do watcher trong chính composable đảm nhiệm (không reset thêm ở đây để khỏi hủy request đang bay).
useMobileWaitingCount();

// Nút Hội thoại nổi nhô lên khỏi tabbar --m-fab-lift: chừa chỗ cho hàng cuối của nội dung.
const hasFab = computed(() => shell.tabbarVisible.value && auth.canAccess('conversation'));

// ToastContainer teleport ra <body> (ngoài .crm-mobile): đánh dấu body để style toast tránh tabbar/safe-area.
watch(
  () => shell.tabbarVisible.value,
  (visible) => document.body.classList.toggle('m-toast-host--tabbar', visible),
  { immediate: true },
);
onMounted(() => document.body.classList.add('m-toast-host'));
onBeforeUnmount(() => document.body.classList.remove('m-toast-host', 'm-toast-host--tabbar'));

const headerTitle = computed(() => (isReportsRoute.value ? 'Báo cáo' : mobileRouteTitle(route)));
const headerSubtitle = computed(() => (isReportsRoute.value && auth.user?.orgName ? `CRM · ${auth.user.orgName}` : undefined));
const showBack = computed(() => isReportsRoute.value || !isMobileRootRoute(route));
const { goBack } = useMobileBack('/account');

// F3: nút quay lại của nhóm Khác luôn về Tài khoản, kể cả khi mở liên kết Marketing cấp sâu.
const router = useRouter();
function handleBack() {
  if (route.path === '/groups' || route.path === '/friends' || route.path === '/marketing' || route.path.startsWith('/marketing/')) {
    if (window.history.state?.back === '/account') router.back();
    else void router.replace('/account');
  } else void goBack();
}


// Lựa chọn giao diện theo người dùng + dọn state khi logout / đổi user (§8). Không sửa stores/auth.ts.
watch(
  () => auth.user?.id ?? null,
  (userId, previousUserId) => {
    uiTheme.bindUser(userId);
    // Chỉ khi có user cũ thật sự (logout A->null, đổi A->B). null->id lúc đăng nhập/F5 KHÔNG phải reset.
    if (previousUserId != null && previousUserId !== userId) {
      window.dispatchEvent(new CustomEvent(MOBILE_SESSION_RESET_EVENT, { detail: { previousUserId, userId } }));
    }
  },
  { immediate: true },
);

// Cuộn về đầu khi đổi màn (trước đây cuộn là của window nên không dính giữa các tab).
const scroller = ref<HTMLElement | null>(null);
watch(
  () => route.name,
  () => { if (scroller.value) scroller.value.scrollTop = 0; },
  { flush: 'post' },
);
</script>

<style scoped>
/* Khóa khung theo VisualViewport: fixed + dịch theo offsetTop để bàn phím iOS không đẩy cả trang. */
.m-shell {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  height: var(--m-app-height, 100dvh);
  transform: translateY(var(--m-vv-offset-top, 0px));
  overflow: hidden;
  background: var(--m-bg);
  color: var(--m-text);
  font-family: var(--m-font-family);
  font-size: var(--m-font-body);
  line-height: 1.45;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
@supports not (height: 100dvh) {
  .m-shell {
    height: -webkit-fill-available;
  }
}
/* Có banner offline ở đầu cột: banner đã nhận safe-top, header không cộng lần hai. */
.m-shell--banner :deep(.m-header) {
  padding-top: 0;
}
.m-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-left: var(--m-safe-left);
  padding-right: var(--m-safe-right);
}
/* Màn có header riêng (thread) / không tabbar: shell nhường safe-area cho vùng nội dung. */
.m-main--pad-top {
  padding-top: var(--m-safe-top);
}
.m-main--pad-bottom {
  padding-bottom: var(--m-safe-bottom);
}
.m-main__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* Shell cảm ứng: WebKit classic scrollbar chiếm 10px nhưng block con vẫn dùng đủ width.
     Bỏ gutter, giữ cuộn dọc tự nhiên để không có phần nội dung trượt ngang phía dưới scrollbar. */
  scrollbar-width: none;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.m-main__scroll::-webkit-scrollbar { width: 0; height: 0; }
.m-main__scroll--fab {
  padding-bottom: var(--m-fab-lift);
}
</style>

<!-- Toast teleport ra <body>: không có token --m-* ở đó nên khai báo lại giá trị đúng bằng mobile-tokens.css (test đối chiếu). -->
<style>
body.m-toast-host {
  --m-z-toast: 130;
  /* Khai báo lại đúng giá trị token (teleport ra body nên không thừa hưởng từ .crm-mobile). */
  --m-tabbar: 64px;
  --m-fab-lift: 22px;
  --m-space-4: 16px;
  /* --m-composer-h do MobileChatView ghi lên body khi thread mở (đo composer thật); mặc định 0. */
  --m-toast-bottom: calc(var(--m-composer-h, 0px) + var(--m-space-4) + env(safe-area-inset-bottom, 0px));
}
body.m-toast-host.m-toast-host--tabbar {
  --m-toast-bottom: calc(var(--m-tabbar) + var(--m-fab-lift) + var(--m-space-4) + env(safe-area-inset-bottom, 0px));
}
body.m-toast-host .toast-container {
  top: auto;
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: var(--m-toast-bottom);
  left: max(12px, env(safe-area-inset-left, 0px));
  z-index: var(--m-z-toast);
}
body.m-toast-host .toast-container .toast {
  min-width: 0;
  max-width: none;
}
</style>
