import { computed, onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { DESKTOP_COMPACT_MEDIA_QUERY } from '@/composables/use-mobile';

/** Own the compact menu's lifetime as well as its CSS visibility. */
export function useReportCompactNavigation(path: MaybeRefOrGetter<string>, reportsTarget: () => HTMLElement | null | undefined) {
  const matchesCompact = ref(false);
  const open = ref(false);
  let media: MediaQueryList | undefined;
  let mounted = false;
  let restoreFocusOnLeave = false;
  const isReportRoute = () => toValue(path).startsWith('/reports/');
  const isCompactNavigation = computed(() => isReportRoute() && matchesCompact.value);
  const primaryMenu = computed({
    get: () => isCompactNavigation.value && open.value,
    set: (value: boolean) => {
      open.value = value && isCompactNavigation.value;
      if (open.value) restoreFocusOnLeave = false;
    },
  });
  const updateMatch = (event: MediaQueryListEvent) => { matchesCompact.value = event.matches; };

  // Decide from the same media query as the CSS, never from the rounded
  // innerWidth: at 1099.248px innerWidth is 1099 while the query is false.
  watch(isCompactNavigation, (visible) => {
    if (visible || !open.value) return;
    open.value = false;
    restoreFocusOnLeave = isReportRoute();
  }, { flush: 'sync' });

  function onPrimaryMenuAfterLeave() {
    if (!restoreFocusOnLeave) return;
    restoreFocusOnLeave = false;
    // Wait until the overlay's focus handling and leave transition have ended,
    // then only focus a Reports button that is still mounted and rendered.
    if (!mounted || isCompactNavigation.value || !isReportRoute()) return;
    const target = reportsTarget();
    if (target?.isConnected && target.getClientRects().length > 0) target.focus();
  }

  onMounted(() => {
    mounted = true;
    media = window.matchMedia(DESKTOP_COMPACT_MEDIA_QUERY);
    matchesCompact.value = media.matches;
    media.addEventListener('change', updateMatch);
  });
  onBeforeUnmount(() => {
    mounted = false;
    media?.removeEventListener('change', updateMatch);
    restoreFocusOnLeave = false;
    open.value = false;
  });
  return { primaryMenu, isCompactNavigation, onPrimaryMenuAfterLeave };
}
