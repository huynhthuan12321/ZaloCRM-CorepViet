// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, getCurrentScope, onScopeDispose, readonly, ref, type ComputedRef, type Ref } from 'vue';

/**
 * Viewport API cho mobile shell (CONTRACT-A §5).
 *
 * Singleton ref-count: listener gắn ở lần gọi đầu, gỡ khi consumer cuối dispose scope.
 * CHỈ MobileLayout gọi; con lấy qua useMobileShell() (components/mobile/shell/shell-context.ts).
 * Không có VisualViewport (iOS < 13, jsdom, SSR) → '--m-app-height' = '100dvh'.
 */
export const KEYBOARD_MIN_INSET = 120; // px — nhỏ hơn coi là thanh công cụ Safari co giãn, không phải bàn phím
const ZOOM_EPSILON = 1.01; // pinch-zoom làm visualViewport co lại; không coi là bàn phím/viewport thật

export type MobileOrientation = 'portrait' | 'landscape';

export interface MobileViewportState {
  supported: Readonly<Ref<boolean>>;
  viewportHeight: Readonly<Ref<number>>;
  viewportWidth: Readonly<Ref<number>>;
  offsetTop: Readonly<Ref<number>>;
  keyboardInset: Readonly<Ref<number>>;
  keyboardOpen: Readonly<Ref<boolean>>;
  orientation: Readonly<Ref<MobileOrientation>>;
  cssVars: ComputedRef<{ '--m-app-height': string; '--m-keyboard-inset': string; '--m-vv-offset-top': string }>;
}

const supported = ref(false);
const viewportHeight = ref(0);
const viewportWidth = ref(0);
const offsetTop = ref(0);
const keyboardInset = ref(0);
const keyboardOpen = ref(false);
const orientation = ref<MobileOrientation>('portrait');

const cssVars = computed(() => ({
  '--m-app-height': supported.value && viewportHeight.value > 0 ? `${viewportHeight.value}px` : '100dvh',
  '--m-keyboard-inset': `${keyboardInset.value}px`,
  '--m-vv-offset-top': `${offsetTop.value}px`,
}));

const state: MobileViewportState = {
  supported: readonly(supported),
  viewportHeight: readonly(viewportHeight),
  viewportWidth: readonly(viewportWidth),
  offsetTop: readonly(offsetTop),
  keyboardInset: readonly(keyboardInset),
  keyboardOpen: readonly(keyboardOpen),
  orientation: readonly(orientation),
  cssVars,
};

let consumers = 0;
let rafId: number | null = null;
let attachedVv: VisualViewport | null = null;
let closeHeld = false;

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'range', 'color'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

function readOrientation(): MobileOrientation {
  const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
  if (type) return type.startsWith('landscape') ? 'landscape' : 'portrait';
  // innerWidth/innerHeight là layout viewport — không co theo bàn phím iOS như visualViewport.
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

function measure() {
  if (typeof window === 'undefined') return;
  const vv = window.visualViewport ?? null;
  supported.value = !!vv;
  const inner = window.innerHeight;
  const zoomed = !!vv && vv.scale > ZOOM_EPSILON;

  if (vv && !zoomed) {
    viewportHeight.value = vv.height;
    viewportWidth.value = vv.width;
    offsetTop.value = vv.offsetTop;
    keyboardInset.value = Math.max(0, inner - vv.height - vv.offsetTop);
  } else {
    viewportHeight.value = inner;
    viewportWidth.value = window.innerWidth;
    offsetTop.value = 0;
    keyboardInset.value = 0;
  }
  const open = keyboardInset.value >= KEYBOARD_MIN_INSET && isEditable(document.activeElement);
  if (keyboardOpen.value && !open && !closeHeld) {
    // Giữ thêm một frame sau khi bàn phím đóng (iOS hay nháy inset/focus) để tabbar không nháy.
    closeHeld = true;
    schedule();
  } else {
    closeHeld = false;
    keyboardOpen.value = open;
  }
  orientation.value = readOrientation();
}

function schedule() {
  if (rafId !== null) return; // gộp nhiều event trong một frame
  if (typeof window.requestAnimationFrame !== 'function') {
    measure();
    return;
  }
  rafId = window.requestAnimationFrame(() => {
    rafId = null;
    measure();
  });
}

function attach() {
  if (typeof window === 'undefined') return;
  measure();
  attachedVv = window.visualViewport ?? null;
  attachedVv?.addEventListener('resize', schedule);
  attachedVv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
}

function detach() {
  if (typeof window === 'undefined') return;
  attachedVv?.removeEventListener('resize', schedule);
  attachedVv?.removeEventListener('scroll', schedule);
  attachedVv = null;
  window.removeEventListener('resize', schedule);
  window.removeEventListener('orientationchange', schedule);
  document.removeEventListener('focusin', schedule);
  document.removeEventListener('focusout', schedule);
  if (rafId !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(rafId);
  rafId = null;
  closeHeld = false;
}

export function useMobileViewport(): MobileViewportState {
  consumers += 1;
  if (consumers === 1) attach();

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    consumers -= 1;
    if (consumers === 0) detach();
  };
  // Ngoài effect scope thì không tự dọn được — caller phải nằm trong setup()/effectScope.
  if (getCurrentScope()) onScopeDispose(release);

  return state;
}
