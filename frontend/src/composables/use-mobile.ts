// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';

const MOBILE_BREAKPOINT = 768;
// Exact complement of the CSS `(min-width: 768px)` rules (app min-width, compact report
// navigation). innerWidth is rounded, so 767.669px reads as 768 and would keep the desktop
// layout while every desktop media query is already false; the media query uses the real width.
export const MOBILE_MEDIA_QUERY = `not all and (min-width: ${MOBILE_BREAKPOINT}px)`;

const isMobile = ref(false);
const isOnline = ref(true);

let initialized = false;
let mobileMedia: MediaQueryList | undefined;

function updateMobile() {
  isMobile.value = mobileMedia ? mobileMedia.matches : window.innerWidth < MOBILE_BREAKPOINT;
}

function updateOnline() {
  isOnline.value = navigator.onLine;
}

export function useMobile() {
  if (!initialized) {
    initialized = true;
    if (typeof window !== 'undefined') {
      mobileMedia = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_MEDIA_QUERY) : undefined;
      updateMobile();
      updateOnline();
      if (mobileMedia) mobileMedia.addEventListener('change', updateMobile);
      else window.addEventListener('resize', updateMobile);
      window.addEventListener('online', updateOnline);
      window.addEventListener('offline', updateOnline);
    }
  }

  return { isMobile, isOnline };
}
