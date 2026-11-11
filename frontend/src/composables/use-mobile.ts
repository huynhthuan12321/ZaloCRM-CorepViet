// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';

const MOBILE_BREAKPOINT = 768;
/** Điện thoại xoay ngang: chiều cao ≤ 500px (iPhone ngang 320–430px; iPad ngang ≥ 744px). */
const PHONE_LANDSCAPE_MAX_HEIGHT = 500;

/**
 * Điện thoại ngang rộng nhất ~956px (iPhone Pro Max); tablet ngang ≥ 1024px. Giới hạn này để tablet
 * Android mở bàn phím ảo (cao tụt còn ~400px, vẫn cảm ứng) KHÔNG bị đổi sang MobileLayout giữa chừng.
 */
const PHONE_LANDSCAPE_MAX_WIDTH = 1023.98;

/*
 * NGUỒN DUY NHẤT cho "giao diện mobile" (hotfix xoay ngang 09/11/2026).
 *
 * Mobile = chiều rộng < 768px
 *        HOẶC điện thoại xoay ngang: rộng < 1024px VÀ cao ≤ 500px VÀ con trỏ thô (cảm ứng) VÀ không hover.
 * iPad (cao ≥ 744px), tablet Android, laptop/desktop dùng chuột (pointer: fine / hover: hover) KHÔNG đổi.
 *
 * CSS không import được hằng số JS, nên mọi `@media` chuyển layout trong CSS/SFC phải dùng NGUYÊN VĂN
 * MOBILE_MEDIA_QUERY (hoặc SHORT_LANDSCAPE / DESKTOP_COMPACT bên dưới). `use-mobile.dom.spec.ts` đọc các
 * file CSS và khẳng định điều đó, để JS (App chọn MobileLayout/DefaultLayout) và CSS không bao giờ lệch.
 * Luật "chỉ desktop" (vd `#app { min-width: 1100px }`) viết bằng cascade: mặc định cho desktop, rồi
 * `@media MOBILE_MEDIA_QUERY` gỡ ra — là phần bù chính xác, không có khe hở.
 *
 * Phần chiều rộng giữ `not all and (min-width: 768px)` = bù chính xác của `(min-width: 768px)`
 * (innerWidth bị làm tròn: 767.669px đọc thành 768).
 */
const PHONE_LANDSCAPE =
  `(max-width: ${PHONE_LANDSCAPE_MAX_WIDTH}px) and (max-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}px) and (pointer: coarse) and (hover: none)`;

export const MOBILE_MEDIA_QUERY = `not all and (min-width: ${MOBILE_BREAKPOINT}px), ${PHONE_LANDSCAPE}`;

/**
 * Bù của MOBILE_MEDIA_QUERY (dạng Level 3 cho Safari cũ) — chỉ dùng cho JS/test; CSS dùng cascade.
 * Phần chiều cao/chiều rộng lẻ (500.00–500.02px, 1023.98–1024px) không có thiết bị thật.
 */
const DESKTOP_CLAUSES = [
  '(min-width: 1024px)',
  `(min-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}.02px)`,
  '(pointer: fine)',
  '(pointer: none)',
  '(hover: hover)',
];
export const DESKTOP_MEDIA_QUERY = DESKTOP_CLAUSES
  .map((c) => `(min-width: ${MOBILE_BREAKPOINT}px) and ${c}`)
  .join(', ');

/**
 * Desktop hẹp 768–1099px (thanh điều hướng Báo cáo thu gọn). Chỉ dùng trong DefaultLayout — layout này chỉ
 * được render khi JS = desktop, nên không cần lặp điều kiện điện thoại ngang.
 */
export const DESKTOP_COMPACT_MEDIA_QUERY = `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: 1099px)`;

/** Màn thấp nằm ngang (trong MobileLayout): thu gọn header/tabbar/composer. */
export const SHORT_LANDSCAPE_MEDIA_QUERY = `(max-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}px) and (orientation: landscape)`;

export interface ViewportTraits {
  width: number;
  height: number;
  /** pointer chính: 'coarse' (cảm ứng), 'fine' (chuột), 'none'. */
  pointer: 'coarse' | 'fine' | 'none';
  /** true nếu thiết bị chính hover được (chuột). */
  hover: boolean;
}

/**
 * Cùng điều kiện với MOBILE_MEDIA_QUERY, dạng hàm thuần (dùng để test bảng thiết bị và làm
 * fallback khi trình duyệt không có matchMedia).
 */
export function isMobileViewport(t: ViewportTraits): boolean {
  if (t.width < MOBILE_BREAKPOINT) return true;
  return t.width <= PHONE_LANDSCAPE_MAX_WIDTH && t.height <= PHONE_LANDSCAPE_MAX_HEIGHT
    && t.pointer === 'coarse' && !t.hover;
}

const isMobile = ref(false);
const isOnline = ref(true);

let initialized = false;
let mobileMedia: MediaQueryList | undefined;

function updateMobile() {
  // Không có matchMedia thì không biết loại con trỏ → chỉ dựa chiều rộng (hành vi cũ).
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
