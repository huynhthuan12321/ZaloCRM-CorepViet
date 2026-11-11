# Reviewer-4: F4/F6 QA harness review (read-only, static)

Verdict: PASS-WITH-NOTES. No BLOCKER or HIGH findings. Nothing here was run: no browser, build or suite. This is a static reading of `e2e/f4f6-functional.spec.ts`, `e2e/f4f6-parity.spec.ts`, the current `rich-text-editor.vue` diff, `use-desktop-chat-drafts.ts`, the mock helpers and the context-menu and reply-bar components. No runtime result is claimed.

## Checks that hold
- **Production Vue access:** the functional spec no longer touches Vue internals. Rich content goes in through a real `ClipboardEvent('paste')` with `DataTransfer` on the contenteditable.
- **Mention node:** `Mention` is registered unconditionally in the editor (`rich-text-editor.vue:379`). A mention can therefore be pasted into `qa-conv-1`, which is `threadType: 'user'`. If that assumption were wrong, `toHaveCount(1)` on `[data-type="mention"]` would fail loudly rather than pass silently.
- **Context menu target:** `.message-bubble` and `.message-bubble.is-self` exist (`message-bubble.vue:24`).
  - The last mock message, n=60, is `self` (60 % 3 = 0) with `contentType: 'text'`, so "Chỉnh sửa" is rendered.
  - "Chỉnh sửa" is a `role="menuitem"` button, and the SVG icon has no text, so the accessible name is exact.
  - `.reply-preview-bar.bar--edit` exists (`reply-preview-bar.vue:7`).
- **Markup comparison:** the clone-only `documentMarkup()` removes just `data-placeholder` and the `is-empty` / `is-editor-empty` classes. It never mutates the live app DOM or CSS, and everything else is compared via `innerHTML`.
  - `strong`, `em`, the list and the mention span, including `data-id` / `data-label`, are all inside what gets compared, so dropping any of them would fail.
  - The only blind spot is the stripped placeholder decoration. That is acceptable because the placeholder is focus-driven.
- **Same plain text in B:** B is filled with `originalText`, so a plain-text-only restore would lose the rich markup and fail the `toEqual`.
  - Comparing `innerText` for the original B text is right, because `textContent` ignores block breaks.
- **Send payload:** the spec asserts `content`, `styles.length > 0`, `mentions` length 1 and uid `qa-peer`.
  - This checks the real send path, not just the DOM.
- **Reply flow:**
  - The reply bar is visible in A, absent in B, and the A→B→A path ends with a `replyMessageId` in the POST.
  - The B-only send clears only B's draft, and A is restored afterwards.
  - Reload clears the drafts, which is consistent with the RAM-only policy (no localStorage).

## Parity spec
- The design is sound: 3 × baseline→baseline (CONTROL) plus 3 × baseline→candidate (REAL), per scene and engine.
  - It uses the same fixed clock, a `Playwright` context with `deviceScaleFactor: 1`, and `animations: 'disabled'` with `caret: 'hide'`.
  - The `blur` plus `fonts.ready` step gives a stable state.
  - There are no CSS injections, masks or tolerance; `pixelDiff(..., 0)` is called with threshold 0.
- The REAL run permits a changed rect only for the `chat-switch-draft` scene, inside `.input-row`.
  - `outsidePixels` must be 0.
  - `insidePixels > 0` is required, so the test also fails if the candidate does not change the composer.
  - The text asserts pin A's draft text on the baseline and an empty composer on the candidate.
  - The rect comes from the baseline's `.input-row` bounding box. The send-button enable state sits inside that row, so it is covered.
- The CONTROL runs use the whole-frame diff with no allowed rect, which gives a determinism floor.
  - `outside` is computed with the rect `null`, so any difference fails.

## Findings / notes (all LOW)
1. **Only the first F4 test checks the B-contamination case.** The rich test ends with `innerText === originalText` for B. A leak of A's rich document into B would carry the same text and slip past that check.
   - Suggested hardening: assert B has no `strong`, `em`, `ul` or `[data-type=mention]`, or compare B's `documentMarkup` to the plain-paragraph baseline.
2. **Marks coverage.** The paste fixture covers bold, italic, list and mention only. The custom colour and size marks (`data-color`, `data-size`, `rich-text-editor.vue:219,233`), underline and strike are not exercised.
   - JSON round-trip should preserve them, but a regression in those marks would not be caught. Optional, since the contract names styles and mentions.
3. **`replyMessageId` is only `toBeTruthy()`.** Comparing it to the exact id of the message that was right-clicked would catch a wrong target. Low risk.
4. **Edit test is context-only.** It does not send an edit or check that the edit bar content is the right message. It covers draft/context isolation, which is the claim. The reply test also never re-asserts the reply bar when returning to A, though the POST check covers it.
5. **`getByText('Trả lời', { exact: true }).last()`** relies on the context menu being the last such text node. A reply-bar label added later could change the match. It is stable today.
6. **Fixed `waitForTimeout`** calls (350, 2200, 1000 ms) are acceptable for pixel stability. They could add flake risk in the functional `chat()` helper.
7. **Two behaviours not asserted:** the mobile RAM smoke checks only plain text, which matches the "smoke" scope, and the F6 tests were not re-reviewed beyond a read-through.
   - They assert status messages for 403/404/500, no hero rendered, no horizontal overflow, and the conflict text plus code-only fallback with the form kept.

## Limits
Static read only, no execution. I did not verify that mock routes match the selectors at runtime, the engine behaviour of `ClipboardEvent` paste in WebKit, pixel results or baseline ports 4218–4220. I did not re-audit application source beyond the rich-text-editor diff, the drafts composable and the elements named above, since reviewer-3 covered it.
