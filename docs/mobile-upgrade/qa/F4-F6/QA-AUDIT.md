# QA audit (independent, read-only) — F4 desktop RAM drafts + F6 error messages

Auditor: a new QA evidence auditor. Method: read the contract skill, QA-F4-F6.md (draft), REVIEW-3/4, the parity spec and every `evidence-pixel*` JSON plus its logs. I decoded the PNGs myself (own PNG decoder, no browser, no build, no repo edits). Evidence directories and logs were not touched.

## VERDICT: QA PASS — with explicitly evidenced noise exceptions. Exact-0 is NOT achieved for `chat-empty`.

- **`chat-empty` never reaches exact 0 in 3/3 pairs in either engine, and this audit does not claim it does.** The parity spec as written is red on this scene.
- **Every nonzero pixel outside the allowed rect traces to a rendering-noise source that also appears in baseline-vs-baseline CONTROL runs.** None of it is a candidate-only location. The sources and run counts are in sections 2 and 3.
- This is a judgment on desktop 1440×900 pixel parity. It does not certify real iPhone, a real DB or EE.

## 0. Preconditions I verified

- **Source unchanged.** All 552 entries in `app-source-manifest.json` match the current sha256 of the files on disk: 0 changed, 0 missing.
- **Evidence internally consistent.**
  - I recomputed exact diff, outside and inside counts from the before/after PNGs for 93 of the 94 JSON files. All 93 match.
  - The one not rechecked is probably a late-written file; I did not identify it.
  - Max deltas and coordinates below were taken from my own PNG decoding and the JSON `outside` arrays, with index = y·1440 + x.
- **Technical gates**, read from logs and not re-run:
  - qa3-tsc exit 0
  - vitest: 77 files, 877 tests passed
  - qa3-build exit 0
  - functional5: 26 passed (13 per engine)
- **Batch not in the brief.** A fifth batch, `evidence-pixel-focused` (log `pixel-focused.log`, written 20:31), appeared while I was auditing. I include it and report it; it is the only batch run with the current `f4f6-parity.spec.ts`.

## 1. Batch protocol (every batch reported)

| Batch | Protocol | Contents |
|---|---|---|
| `evidence-pixel` (initial) | Blur `activeElement`, wait 1000 ms | 48 JSON: 4 scenes × 2 engines × (3C + 3R) |
| `evidence-pixel-focus` | Direct focus/blur of the contenteditable | 22 JSON. Chat-empty: Chromium 3C+3R; WebKit C1–3 and R1 only. R2 and R3 fail the focus assertion and have no JSON. chat-switch-draft: 3C+3R × 2 engines |
| `evidence-pixel-empty-final` | Chat-empty only | 6 JSON, all Chromium. WebKit pairs failed the focus assertion, controls included, so there is no WebKit JSON |
| `evidence-pixel-neutral` | Focus moved to the existing "Gửi ảnh" button | 6 JSON, Chromium only. All 6 WebKit pairs (3C+3R) failed `not.toBeFocused` (editor still `ProseMirror-focused`), so there is no WebKit pixel evidence |
| `evidence-pixel-focused` | Current spec: `focus()` the editor in both runs and assert it is focused | 12 JSON (6 per engine) |

**Caveat on the checked-in spec.**
- The current `e2e/f4f6-parity.spec.ts` is the "focused" variant.
- QA-F4-F6.md describes a different protocol ("focus then blur directly"). The draft must be aligned with the spec, or with whichever batch is cited.

## 2. Results by scene

### profile-success and appointments (initial batch)
- 24/24 pairs are exact 0. That is 3C+3R × 2 scenes × 2 engines.
- Max delta 0, 0 outside, 0 inside.
- **Clean exact-0.**

### chat-switch-draft (Chromium and WebKit, initial + focus batches; 3C+3R each)
- **Inside the allowed rect** (x573 y829 w574 h62, the `.input-row`):
  - Chromium REAL: 3016 px in 6/6 runs, max Δ 222.
  - WebKit REAL: 2713 px in 6/6 runs, max Δ 222.
  - Counts are identical every run, so they are deterministic.
  - Bounding box of all diff pixels in Chromium REAL-1: x637–1146, y840–879. In WebKit REAL-1: x638–1146, y840–879. Both lie within the rect.
  - The diff image shows the draft text and the Send button enable-state.
  - Limit: the rect exemption means content inside the rect is only checked for "differs", not "differs correctly". Behavior is covered by the functional tests.
- **Outside the rect.**
  - WebKit: 0 outside in 12/12 REAL runs and 0 diff in 6/6 controls. Clean.
  - Chromium REAL outside, across the 6 runs:

| Run | Outside px | Max Δ | Where |
|---|---|---|---|
| initial R1, R2 | 0 | 0 | — |
| initial R3 | 4 | 1 | (1192,124), (1193,124), (1216,124), (1217,124) |
| focus R1, R2 | 0 | 0 | — |
| focus R3 | 13 | 1 | (848–851, 57–60) and (940–944, 57–60) |

    - The 13 px set is **identical** to the 13 px in the initial-batch CONTROL-3 (`chromium-chat-switch-draft-control-3`): (848,59), (848,60), (849,58), (849,59), (850,57), (850,58), (851,57), (940,57), (941,57), (942,57), (943,58), (944,59), (944,60). That control is baseline vs baseline.
    - The 4 px at y=124 are the same four pixels that appear in the Chromium chat-empty noise (set C, below).
  - Chromium controls: 5 of 6 are 0 (focus C1–3 and initial C1–2). Initial C3 has the 13 px set above.

### chat-empty — Chromium (5 batches, 15C + 15R; nonzero in 10C and 9R)

All nonzero outside pixels fall into three recurring location sets. Every set appears in at least one CONTROL.

| Set | Pixels | Location | Max Δ | In controls? |
|---|---|---|---|---|
| A | 14 | (258–261, 59–60), (415–418, 59–60). Identical coordinates every time. | 1 | Yes. Controls: initial C1, focus C1, empty-final C1/C2/C3, neutral C3, focused C1/C2. Reals: initial R1/R2/R3, focus R1, empty-final none, neutral R3, focused R1. |
| B | 13 | (586,64), (586,107), (848–851, 57–60), (940–944, 57–60). The 13 px (848–944) are identical to the chat-switch-draft control-3 set. | 1 | Yes. Initial C3: 15 px = B plus (586,64) and (586,107). |
| C | 4 + ~20 | y=124: (1192,124), (1193,124), (1216,124), (1217,124). An arc at (1185–1190, 220–223) and (1219–1224, 220–223) (~20 px), the edge of a purple avatar. | 1 at y=124; **33** on the arc | **Yes, in a CONTROL: `focused` batch CONTROL-3.** |

**Set C evidence.**
- `evidence-pixel-focused/chromium-chat-empty-control-3` is baseline vs baseline, with the same dist on both origins. It contains 49 pixels, max Δ 33. That is A (14) + B (15) + all of C (20, arc plus y=124).
- Reals carrying set C (the arc with max Δ 33): focus R2 (35 px, max 33) and empty-final R3 (35 px, max 33). A third real, initial chat-switch R3, carried only the y=124 part (4 px, max 1).
- The odd pixel value is anti-aliasing at a rounded avatar edge, and it occurs on both the baseline side and the candidate side:
  - At (1219,223): the common value is (149,71,179); the odd value is (168,104,193). The odd value occurs once on the baseline-side screenshot (empty-final R3) and once on the candidate-side screenshot (focus R2). Across 37 chat shots there are no other occurrences.
  - At (1192,124): the common value is (236,230,223); the odd value is (236,231,224). It occurs once in a baseline-side screenshot and twice in candidate-side screenshots (all in REAL).
  - The same pixel and the same two values therefore appear in both roles. That is raster nondeterminism, not a candidate change.
- **Frequency.**
  - Across 15 REAL + 15 CONTROL chat-empty Chromium pairs, set C appears in 2 reals (max 33) and in 1 control (max 33), plus 1 additional REAL chat-empty run with only the y=124 part.
  - It is rare and intermittent in both groups. It is not candidate-only.
- **Verdict on the Chromium outside changes: same environment raster as the controls.** No location repeats in REAL runs while being absent from every CONTROL.
  - Set A is deterministic when present and occurs equally in controls.
  - Set B and set C appear in controls.
- **Nonzero is not exact 0.** Max Δ is 1 for A, B and the y=124 pixels, and 33 for the avatar arc.

### chat-empty — WebKit

| Batch | Controls | Reals |
|---|---|---|
| initial | C1 0; **C2 4066 px, max 232**; C3 0 | R1 0; **R2 4019 px**; **R3 4066 px**; max 232 |
| focus | C1–3 all 0 | R1 0; R2/R3 have no JSON (focus assertion failed) |
| empty-final | no JSON | no JSON |
| neutral | no JSON (assertion failed) | no JSON (assertion failed) |
| focused | C1–3 all 0 | **R1 82 px; R2 82 px**; R3 0; max 232 |

- All nonzero WebKit pixels fall into two sources:
  1. **Composer focus decoration**: 3984 px, bounding box x620–1058, y820–893, with the blue focus fill (232,244,254).
     - In control C2 (initial), baseline had the decoration and the second load did not.
     - In REAL R2/R3 the baseline side is also the darker (decorated) one in 4003 of 4019 and 4023 of 4066 pixels.
     - It is the same 3984 px as in the control.
     - This only occurs in the initial batch (activeElement-only blur).
  2. **A wall-clock countdown**: the red "8s" in "Ghim mở (tự thu sau 8s)" at (1298–1312, 377–386), 82 px. I confirmed it in the diff image of `evidence-pixel-focused/webkit-chat-empty-real-1-diff.png`; it is the only highlighted spot.
     - In the initial-batch control C2, the same 82 px box is nonzero.
     - In R2 (initial) 35 px of the box differ, hence 4019 vs 4066.
     - The countdown is real time and is not frozen by `page.clock.setFixedTime`. Baseline and candidate load at different moments.
- **Limit of this evidence.**
  - In the `focused` batch, the 82 px countdown appears only in REAL R1 and R2; the three controls were 0. In that batch the evidence for "same as controls" is the cross-batch C2 (initial) result, not a same-batch control.
  - Both the 82 px box and the 3984 px decoration are outside every changed source file of F4/F6.
  - The countdown has no relation to the composer or to draft logic.
- **Net.**
  - WebKit chat-empty REAL runs with data: 7. Exact 0 in 3 (initial R1, focus R1, focused R3). Nonzero in 4, all explained by the sources above.
  - WebKit chat-empty has no pixel data at all in `empty-final` and `neutral`.
  - No WebKit run shows any outside diff beyond the two explained sources.

## 3. Reruns, pooled

I counted every run from every batch. I did not widen any threshold and I do not call any nonzero result exact 0.

| Scene | Engine | Controls | Reals |
|---|---|---|---|
| profile-success | Chromium + WebKit | 6/6 zero per engine | 6/6 zero per engine |
| appointments | Chromium + WebKit | 6/6 zero per engine | 6/6 zero per engine |
| chat-switch-draft, outside rect | Chromium | 5/6 zero; 1 has 13 px max 1 | 4/6 zero; 1 has 4 px max 1 (set C); 1 has 13 px max 1 (set B) |
| chat-switch-draft, outside rect | WebKit | 6/6 zero | 6/6 zero |
| chat-empty | Chromium (5 batches) | 5/15 zero; 10/15 nonzero (set A, B or C) | 6/15 zero; 9/15 nonzero (sets A, B, C) |
| chat-empty | WebKit (3 batches with JSON) | 5/6 zero; 1 nonzero (C2, initial, 4066 px) | 3/7 zero; 4/7 nonzero (4019, 4066, 82, 82) |

Zero chat-empty runs in either engine are not evidence that the F4 change is pixel-identical on that scene. They show only that the nonzero runs are noise that controls also produce.

## 4. What this audit does and does not conclude

**Defensible (current source, desktop 1440×900, Chromium + WebKit desktop):**
- The functional behavior suite passes 26/26: A→B empty, A→B→A, send B, reload, rich paste, reply, edit, F6 403/404/500, appointment 409.
- tsc, vitest and the build are green.
- Pixel parity is clean for profile-success and appointments (24/24 exact 0) and for chat-switch-draft outside the rect in WebKit (12/12 reals).
- For chat-switch-draft in Chromium, the 6 reals show 4 px and 13 px max-1 outside noise at fixed coordinates that controls also produced.
- For chat-empty, all nonzero pixels lie in the sets listed above, each of which appears in a baseline-vs-baseline CONTROL.
- I found no location that is candidate-only and repeated.

**Not defensible:**
- "Every exact-0 assertion passes." It does not: the parity spec reports `chat-empty` failed in Chromium and WebKit in several batches.
- "Chromium chat-empty is deterministic." It is not; the first batch alone gave 14 px in 5 of 6 pairs and 0 in one.
- Any claim from `empty-final` / `neutral` WebKit: it is blocked by the focus assertion and has no pixel data.

**Not tested here (do not claim):**
- Real iPhone Safari / Home Screen PWA.
- A real DB, the VPS, or EE.
- The backend PUT appointment conflict guard. REVIEW-3 and the doc record that backend `appointment-routes.ts` PUT has no conflict guard, so the frontend 409 path is only unit-tested defensively.
- Mobile composer pixel parity: no mobile scene exists. REVIEW-3 L1 stays open.
- Focus, caret, undo, @mention popup and rapid-switch edge cases.
- VoiceOver.
- Payload byte-for-byte equality with baseline (REVIEW-3 L2).

## 5. Conditions before committing

1. Update the draft QA-F4-F6.md "Desktop 1440 so 68edf81" row with the actual counts above. State plainly that chat-empty is not exact 0 and that the noise sets A/B/C (Chromium) and the focus decoration plus countdown (WebKit) are baseline-reproducible.
2. Align the doc's description of the focus protocol with the spec. The spec now focuses the editor and asserts focus; the doc describes a blur-based protocol.
3. Keep `f4f6-parity.spec.ts` and `f4f6-functional.spec.ts` (untracked) in the commit only if you accept a red `chat-empty` test. Otherwise do not add it to the commit; leave it as local evidence tooling.
4. Do not widen the 0 threshold or add masks to make it green.
