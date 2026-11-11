// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Hàm thuần cho khung Cài đặt mobile (hai cấp). Nguồn menu là `SETTINGS_GROUPS` / `useSettingsNav` của desktop
 * (composables/use-settings-nav.ts) — KHÔNG sao chép menu; ở đây chỉ có quy tắc điều hướng cấp 1 <-> cấp 2.
 *
 *  Cấp 1: đúng `/settings` (danh sách menu toàn màn hình).
 *  Cấp 2: `/settings/**` (trang nội dung toàn màn hình, header riêng có nút quay lại danh sách).
 */
export const SETTINGS_ROOT = '/settings';

function bare(path: string): string {
  const noQuery = path.split(/[?#]/)[0] ?? '';
  return noQuery.length > 1 && noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery;
}

export function isSettingsRoot(path: string): boolean {
  return bare(path) === SETTINGS_ROOT;
}

export function isSettingsDetail(path: string): boolean {
  const p = bare(path);
  return p.startsWith(`${SETTINGS_ROOT}/`);
}

/** `history.state.back` có thuộc khu Cài đặt (cấp 1 hoặc cấp 2) không. */
export function backIsInSettings(back: unknown): boolean {
  return typeof back === 'string' && (isSettingsRoot(back) || isSettingsDetail(back));
}

/**
 * Vào cấp 2 mà entry ngay trước KHÔNG thuộc Cài đặt (mở thẳng link `/settings/...`, hoặc đi từ /account) -> cần chèn cấp 1
 * vào lịch sử: `replace('/settings')` rồi `push(đích)`. Nhờ đó vuốt/Back từ cấp 2 luôn về cấp 1, rồi nút quay lại của shell
 * mới đưa về /account. Không chèn khi đi từ cấp 1 hoặc giữa hai trang cấp 2 (back đã ở trong Cài đặt).
 */
export function needsEntryNormalize(path: string, back: unknown): boolean {
  return isSettingsDetail(path) && !backIsInSettings(back);
}

export type BackAction = 'history-back' | 'replace-root';

/** Nút quay lại ở header cấp 2: entry trước đúng là cấp 1 -> back; ngược lại về thẳng danh sách bằng replace (không rời app). */
export function backActionFromDetail(back: unknown): BackAction {
  return typeof back === 'string' && isSettingsRoot(back) ? 'history-back' : 'replace-root';
}

/** Số bước lùi (âm) từ entry hiện tại về entry `/settings` đã biết; null nếu không xác định được (dùng replace). */
export function backDeltaToRoot(rootPosition: number | null, currentPosition: number | null): number | null {
  if (rootPosition === null || currentPosition === null) return null;
  const delta = rootPosition - currentPosition;
  return delta < 0 ? delta : null;
}
