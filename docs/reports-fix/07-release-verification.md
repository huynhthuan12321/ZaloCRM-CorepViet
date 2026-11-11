# Independent 7B review — Reports release dossier

Review started 2026-11-03 05:35 (+07), Asia/Ho_Chi_Minh. Repository: `F:\ZaloCRM-CorepViet`; HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`. This was a read-only review of the 7A dossier, its evidence, and current packaging/operations source.

## Result

- **7B dossier review: FAIL — one P2 finding.** The dossier is conservative and correctly states that release is blocked, but its clean-worktree deployment control does not detect untracked files. That leaves a path for excluded verification helpers to enter the Docker image.
- **Release candidate: NOT_READY / BLOCKED.** No release tag/image digest or isolated candidate build exists. This conclusion is independent of the 7B dossier result.
- 7A remains `COMPLETED_PENDING_VERIFICATION` for its dossier only. 5B/6B remain local PASS as documented; this review did not rerun them and does not confer staging/production readiness.

## Scope and method

Read the current 7A runbook, both roadmap summaries, the candidate manifest and hunk records, 7A evidence index and integrity/scope records, the latest 5B/6B report and commands, and the current Docker/deploy/backup/restore source. Compared stored hashes and recorded counts without running the saved helpers. Source, tests, operational scripts, and 7A/B evidence were read-only and not edited. No environment files or secrets were opened.

No application tests, build, install, Docker, database, migration, backup/restore, deploy, browser, or provider operation was run. No agent or worktree was created.

## Independent integrity and evidence checks

| Check | Expected | Observed | Result |
|---|---:|---:|---|
| Current `frontend/src`, `backend/src`, `backend/tests`, and `backend/prisma` vs B snapshot | 975 files, no content/path delta | 975; no changed, added, or missing paths | PASS; source binding only |
| Existing files in the 7A candidate manifest | 156 available files match manifest SHA-256 | 156 matched; zero mismatches | PASS |
| Absent manifest paths | Must be explicitly explained by current Git status | Seven; all are the previously deleted TikTok paths and report `D` | Expected removals, not missing report files |
| Build/package/ops inputs checked separately | Current content matches 7A manifest | 13/13 match, including package manifests/locks, `.dockerignore`, Dockerfile, Compose, Prisma schema/RLS SQL, and deploy/restore scripts | PASS for hash binding, not a build |
| 7A saved B evidence records | Hash and expected/actual values match | 16/16 hashes match; 16/16 expected/actual records match; all are reused evidence, not new executions | PASS for evidence consistency only |
| Saved build logs | Hash/size match index | Frontend and backend logs match | Historical B builds, not a candidate image build |

The preliminary 7B comparison file `independent-integrity-before-docs.json` marked the seven expected TikTok deletions as hash mismatches because its deletion classifier was incomplete. A follow-up check compared each path with Git status; all seven are confirmed deletions. The corrected reconciliation is in `manifest-audit.json`. No source path is unexpectedly absent.

The evidence index correctly retains the old 13/14 RLS, 33/36 load-state, and race-driver diagnostics as historical failures, separately from replacement evidence. The latest B commands explicitly identify the generic race stimulus mismatch and do not count it as a product PASS. They also state that the full backend suite was not rerun on E-1/O-1; the prior 35-file/9-test baseline result is not promoted into a current full-suite pass.

Latest B results are reused only as recorded: canonical oracle 710/710; 6A3 API 129/129; Engagement/funnel/team/saved oracle 189/189; singleton/revocation 18/18; RLS matrix 90/90 and current guard 14/14; E-1/O-1 boundary checks 524/524 and inventory 104/104; frontend 161/161; targeted backend 306/306; separate owner refresh test 10/10; frontend/backend builds recorded PASS. The refresh test used an owner and is not RLS evidence. No new application test was run in 7B.

## Finding

### P2 — Untracked verification helpers can bypass the deploy script's clean-worktree check

`scripts/ops/deploy.sh` implements `ensure_clean_worktree` using only `git diff` and `git diff --cached` (lines 94–109). Those checks do not include untracked files. The deploy path subsequently checks out the target SHA and builds from the Compose context `.`. Git checkout does not remove unrelated untracked files.

The current source confirms the packaging consequence:

- `docker-compose.yml` uses repository root as the build context.
- `docker/Dockerfile` copies `backend/` into the backend build stage and copies the full backend `scripts/` directory into the final image (line 55).
- `.dockerignore` does not exclude `backend/scripts/reports-verification/**`.
- The current verification directory contains untracked helper files. 7A also explicitly identifies these helpers as excluded from the intended production payload, while recording that Docker currently copies them.

The current tracked worktree is dirty, so the normal deploy branch should stop at its tracked-diff check in this state; no deploy command was run. The finding is that the check is not a reliable control for a future checkout with clean tracked files but leftover untracked helpers. This expands the already documented P2 packaging risk; it does not establish that a production image was built or that any secret is present in those helpers.

**Required before release:** build from an isolated/exported approved revision or make the gate reject untracked paths, and enforce the intended helper exclusion in the actual Docker build context/image. Then inspect the produced image and verify its digest and contents. Do not rely on the current “clean worktree” message as proof that the context is clean.

## Candidate readiness and remaining gates

The 7A disposition `BLOCKED / NOT_READY` is supported. Manifest metadata has no release tag or image digest and says isolated candidate build is unverified. The current evidence is tied to a whole working tree; it does not prove a report-only candidate, clean dependency installation, or image equivalence. B used PostgreSQL 15 and local Node 24, whereas the Docker path uses Node 22 and Compose targets PostgreSQL 16. The backend image build uses `npm install`, not a clean reproducible image rehearsal.

Still not proven: clean isolated candidate build/package, full backend suite with an appropriate baseline, migration-history replay, PostgreSQL 16 rehearsal, staging policy/app-role rollout, backup restore, secure rollback retaining E-1/O-1, representative load/query plans, soak/monitoring, and real Safari/iPhone/PWA/assistive-technology behavior. The runbook correctly does not treat local/disposable evidence, readiness HTTP 200, or a code rollback as production authorization.

## Files and integrity

This review created `docs/reports-fix/07-release-verification.md`, updated only the root `README.md` and `docs/reports-fix/README.md` status summaries, and added evidence under `artifacts/reports-release-7b-20261103-0535/`. `docs/reports-fix/07-release.md`, source, tests, package files, operational scripts, and 7A/B historical artifacts were not modified. Start/end Git status, HEAD, source hashes, and the allowed documentation/artifact delta are recorded in the 7B artifact.

No deployment, migration, or commit was performed. Candidate remains **NOT_READY**. The next step is a separate A-lane correction of the P2 packaging control and candidate isolation, followed by an independent verification; this review does not authorize release.
