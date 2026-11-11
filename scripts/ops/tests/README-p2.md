# P2 deploy gate and packaging

The deploy gate is read-only and independent of environment files, Docker and
databases. Run `bash scripts/ops/check-build-worktree.sh` to inspect a checkout
without invoking deploy. It reports paths, never file contents.

`deploy.sh` runs the gate before checkout and immediately before build. The
current helper is captured in memory before checkout, so checking out an older
revision cannot silently replace the gate. `ALLOW_DIRTY=1` no longer bypasses it.
Dry-run also executes the read-only gate. Rollback retains its existing no-build
behavior and is a separate operational gate.

The gate rejects tracked changes (staged, unstaged, deletions and dirty
submodules), every non-ignored untracked file, and ignored files under `backend`,
`frontend` and `docker`. Known ignored local outputs are exempt only because
the Docker policy also excludes them: `node_modules`, `dist`, `backend/static`,
environment files, logs and `.DS_Store`. A Dockerfile-specific ignore override
is rejected. Unknown ignored inputs are conservatively blocked even when the
current Docker policy would exclude them.

Resolve a blocked checkout by reviewing each listed path and committing approved
release inputs or moving local material outside the checkout. Do not delete user
files or rely on Git ignore as a substitute for Docker exclusion.

## Reviewed script inventory

The inventory contains 157 files: 142 under `reports-verification` and 15 other
scripts. The 13 retained scripts are explicit in both `.dockerignore` and the
runtime Dockerfile COPY statements:

| Scripts | Purpose / direct dependencies |
| --- | --- |
| `backfill-contact-inbound.mjs`, `migrate-conv-tab-indexes.mjs` | Prisma client/PG adapter |
| `backfill_profile_2026_05_29.ts` | Source Prisma client and Zalo operations |
| `cleanup-ghost-nicks.ts`, `split-mismerged-contacts.ts` | Source Prisma client and tenant context |
| `dedup-globalid-dryrun.mjs` | Compiled `dist/shared/database/prisma-client.js` |
| `seed-demo-data.ts`, `seed-demo-muctieu.ts` | Prisma client/PG adapter; first also bcrypt and crypto |
| `seed-project-blocks.mjs` | Relative shared/database, text formatter and notification builder imports |
| `update-block-greetings.mjs` | Relative shared/database import |
| `wave_1_5_backfill.sql` | Existing operational SQL; retained, never executed in this check |
| `tg-provisioner-login.mjs` | Telegram packages; referenced in Telegram provisioner source and setup guide |
| `channels/backfill-message-org-id.ts` | dotenv, pg, node:url; referenced in channel deployment docs |

No retained script imports another script from the excluded verification tree.
Prisma schema, migrations, RLS SQL, seeds, config and the existing dependencies
remain available. This patch preserves existing script files and paths; it does
not claim all legacy scripts are executable in the image. Some already import
source or relative shared/module paths that the previous runtime image did not
copy either. Resolving those legacy execution paths is outside P2.

Excluded scripts: all `reports-verification`, `mint-test-jwt.cjs`,
`tg-provision-test.mjs`, and any future unreviewed script. New operational scripts
require an explicit inventory/context/COPY review.

The root context admits reviewed manifests/config, source, Prisma and operational
scripts. Other root directories are excluded by default. Nested tests, fixtures,
acceptance tooling, local data, artifacts, logs, environment files, spreadsheets,
dependencies and existing build outputs are excluded. Generated `dist` and
dependencies from the builder stages retain their existing runtime COPY behavior.
Node 22, PostgreSQL 16 and Compose configuration are unchanged.

## Focused verification

Run:

```text
python scripts/ops/tests/build-worktree.test.py
bash -n scripts/ops/deploy.sh
bash -n scripts/ops/check-build-worktree.sh
git diff --check -- .dockerignore docker/Dockerfile scripts/ops/deploy.sh
```

The regression creates disposable temporary Git repositories with synthetic
files. It never invokes `deploy.sh`, Docker, a provider or a database. Python 3,
Git and Bash are test prerequisites; no application dependency is added.
On Windows it selects Git Bash; `BASH` may explicitly override the executable.

Gate cases execute the real helper. Packaging cases model the restricted glob
rules in `.dockerignore`, verify every retained file and the explicit runtime
COPY inventory, and verify deploy integration statically. The model is a focused
regression, not Docker's native matcher or an actual context/image export.

Independent B must still check the real context and final image from an isolated
approved candidate. Image contents/digest, candidate isolation, dependency and
full-suite baseline, DB/RLS, migration replay, rollback, staging and production
remain separate gates. Existing 5B/6B/7A/7B status documents are not changed.
