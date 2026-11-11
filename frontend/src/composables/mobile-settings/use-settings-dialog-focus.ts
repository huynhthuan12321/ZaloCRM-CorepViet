// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { nextTick, onScopeDispose, watch, type Ref } from 'vue';

/** Focus management for the existing non-teleported employee dialogs, only in mobile mode. */
export function useSettingsDialogFocus(open: () => boolean, mobile: () => boolean, panel: Ref<HTMLElement | null>, active: () => boolean = () => true) {
  let returnTo: HTMLElement | null = null;
  function keydown(event: KeyboardEvent) {
    if (!open() || !mobile() || !active() || event.key !== 'Tab' || !panel.value || document.querySelector('.cam-overlay')) return;
    const fields = [...panel.value.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
      .filter(el => !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0);
    const first = fields[0]; const last = fields.at(-1);
    if (!first || !last) { event.preventDefault(); panel.value.focus(); return; }
    const focused = document.activeElement;
    if (event.shiftKey && (focused === first || !panel.value.contains(focused))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (focused === last || !panel.value.contains(focused))) { event.preventDefault(); first.focus(); }
  }
  function restore() { document.removeEventListener('keydown', keydown); returnTo?.focus({ preventScroll: true }); returnTo = null; }
  watch([open, mobile], async ([isOpen, isMobile]) => {
    if (!isMobile) return;
    if (isOpen) { returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null; await nextTick(); panel.value?.focus({ preventScroll: true }); document.addEventListener('keydown', keydown); }
    else restore();
  });
  onScopeDispose(restore);
}
