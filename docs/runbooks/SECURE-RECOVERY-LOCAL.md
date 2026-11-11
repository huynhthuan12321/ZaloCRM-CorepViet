# Secure fallback and recovery rehearsal — local scope

Status: **COMPLETED_PENDING_INDEPENDENT_VERIFICATION**, subject to the final
receipt and cleanup evidence. This document does not approve a production
deployment or disaster-recovery operation.

## Accepted identities and compatibility boundary

The application baseline is commit
`b9160f5da0df36cfc6bad2755b200e8cdb86f980`, annotated tag
`reports-rc4-drift-20261103-175649`. The primary image is
`zalo-crm-rc:reports-rc4-drift-20261103-175649-final`, local index
`sha256:fdd5524c28eeae4bf01cc3c5f511889ba418272faeffb8e077f23e11c0c34eea`.

For the RC-4 schema rollout, the tested previous application image is
`zalo-crm-rc:reports-rc4-followup-20261103-163013-final`, local index
`sha256:07f525e94a9607c748381d1129cbb9ba61e8328efc26a021b69df41f36eabb15`,
at commit `cf70b805eb88894fa2d68be1e44ac5c6bf73261c`.
Both images were exercised against the **upgraded 130-migration schema with
the unchanged tenant RLS script applied**.

This is an application-only fallback: retain the upgraded database, policy,
constraints, and migration history. Do not replay the old image's migration
directory, remove the new migration, run a down migration, or change the
ledger to match the old image. Both image entrypoints run `node dist/app.js`;
the rehearsal does not execute a deployment script.

Actual `dist`, `static`, and operational-script bytes are equal between these
images. Their input/generated Prisma schemas and the new migration differ.
Consequently this fallback tests client/schema compatibility for RC-4; it
does not provide an independent remedy for a runtime defect shared by both
images. No application image was rebuilt for this documentation change.

The historical `baseline-eb1be0b` image is not an approved fallback. Earlier
evidence showed login500 with the protected database and a reappearing TikTok
route. Those failures remain historical evidence, not new execution results.

## Evidence and safe execution boundary

The evidence set is
`artifacts/reports-secure-recovery-7a-20261103-190453/` in the audit workspace.
The new report is
`docs/reports-fix/08-secure-recovery-remediation-20261103-190453.md`.
Neither the evidence set nor its helpers belongs in the application image.

Read `commands.md`, the helper sources, manifests, raw failures, final receipt,
and cleanup receipt before reproducing the exercise. The record contains
initial attempts and explicitly named resume scripts; it is not a command
list to execute blindly. An independent reviewer must choose fresh artifact
and Docker names, free ports, and a new disposable resource ledger.

The helpers only create PostgreSQL16/Redis containers using already available
images, synthetic data, and an internal app/client network. PostgreSQL has
additional loopback-only published ports for the local CLI. No production
connection, existing data volume, real environment file, provider, session,
or external storage is an input.

Before a restore, verify the exact created target container ID and ownership
label, current database identity/OID, and zero user tables. Validate the dump
length and SHA256 before copying it. A nonempty or mismatched target is a
failure; never drop it to make the preflight pass. Cleanup must likewise use
the created resource IDs and labels, not just a caller-supplied container name.

The legacy `scripts/ops/verify-restore.sh` is not the runner used here. Its
count-only checks and name-based cleanup do not establish the stronger
identity, full-data, RLS, and privilege properties of this rehearsal.

## Backup coverage and role reconstruction

The PostgreSQL custom-format dumps include schema, data, sequences, migration
ledger, functions, triggers, constraints, indexes, policies, object ownership,
object ACLs, and default privileges. Restore uses `pg_restore` with
`--single-transaction --exit-on-error`; no migration or RLS script is replayed
afterward to conceal missing objects.

Database roles are cluster-wide and are not supplied by a database dump. A
separate fresh restore cluster first proves the app role absent, then creates
the same synthetic role identity with NOSUPERUSER, NOBYPASSRLS, NOCREATEDB,
NOCREATEROLE, and NOREPLICATION. An explicit test-only password supplies
authentication; no role password/hash export is used. The dump restores object
grants and ownership. The app owns zero tables, including the synthetic
identity-sequence fixture.

Role attributes, memberships, ownership, schema/table/sequence ACLs, default
ACLs, functions, RLS ENABLE/FORCE/policies, constraints/validation, indexes,
columns/defaults, and sequences are compared independently. These fixtures
have no custom database-level ACL/tablespace/locale configuration. Database
creation properties and database-level grants require a separate inventory
for any real target; they are not claimed to be transported by this dump.

External media bytes, object storage, real encryption/signing keys, real
environment configuration, off-site durability, and Redis recovery are not
covered. The media-service checks use an in-memory storage adapter. Retained
dumps contain synthetic records only, including synthetic bcrypt hashes in
the separate authentication dump; they contain no real customer credentials.

## Consistency, restore, and failure controls

The first dump uses an exported PostgreSQL repeatable-read snapshot. Its
comparison reader and `pg_dump --snapshot` share that snapshot while a genuine
nonowner app role commits 120 additional conversation/Message pairs. Restored
data must match the snapshot, not the later live source. This establishes a
consistent local snapshot, not PITR or zero production data loss.

A second full dump contains usable synthetic authentication fixtures. The
primary → fallback → primary sequence uses its restored database; passwords
are not rewritten after that restore. JWT and refresh material remain in
memory. Login, profile, representative reports, same-token role/inactive
revocation, tenant denial, and TikTok404 are checked on actual application
HTTP routes.

All public-table records and the explicitly labeled synthetic sequence fixture
are compared before business checks. Live-column order and metadata must match.
Physical attribute-number gaps left by historical dropped columns are not
retained by a logical restore: 35 ordinal positions differ in this fixture,
and the original absolute-catalog comparison failure is retained. The
equivalence receipt lists those differences; no data, grants, or constraints
are excluded to make the logical comparison pass.

Missing/corrupt files, incorrect checksums, incorrect DB identity, and nonempty
targets must fail closed. A truncated archive with its own matching checksum
is separately fed to actual `pg_restore`; it fails and leaves the target
empty through transaction rollback. A subsequent valid restore uses a new
empty target. Failed targets are not repaired and relabeled successful.

The sequence fixture is additive test-only schema `recovery_fixture`, not an
application migration. Post-restore insertion must advance its identity to3.
SDK tests use separate restored copies and delete only the named synthetic
`dr-X`/`dr-Y` fixture organizations so broad sweeps see their intended X/Y
dataset. No trigger, FK, tenant guard, or RLS policy is disabled.

## Security and availability checks

Each exact image runs its actual compiled Prisma/tenant code, Message and
media writes, knowledge service, action child writes, and reconnect callbacks.
Only provider/SDK/storage/embedding boundaries are stubbed; SDK ownId is
nonempty. Missing/foreign tenant, async context, NULL/passive/manual reasons,
foreign callback ID, stale epoch, pending overlap, UID ownership, and ghost/
archived/manual invariants are exercised. Identity bootstrap and existing
login timestamp side effects are not counted as tenant-isolation proof.

The primary and fallback receive Redis stop/recover/pause/recover, PostgreSQL
pause/recover/rejected, OS-hosts positive controls, numeric app IP, family and
address-fallback controls. Per-phase native/fetch readiness requests use
1→20→20→1, response<3000ms and abort4000ms, retaining the dependency1500ms and
HTTP2000ms implementation deadlines. Forty callers per dependency share probe
work; worker identity/close counts, queues, and recovery samples are retained.
Finite samples do not prove the absence of every resource leak.

The rejected-PG HTTP phase has no inspector samples; it uses a separately
invoked rejected-URL dedicated probe. TLS, real IPv6 connectivity, Unix-socket
success, and every background/provider workload remain unverified. A family6
negative result on an IPv4-only alias is not an IPv6 connectivity success.

## Release gates retained

This rehearsal supplies local A evidence for independent7B. It does not
certify the actual deployed revision/data/grants, secure target configuration,
real backup/restore, media/key recovery, RTO/RPO, maintenance budget, staging,
monitoring/soak, full-suite disposition, or production approval.

The eight targeted files are not a full-suite result. Historical failures
remain: RC3 33 failed files/6 failed tests, RC2final35/8, and29 import/setup
headings on each side. No frontend suite or backend rebuild is required for
this documentation-only patch; exact-image business tests are separate from
compilation.

**VPS remains NOT_READY/BLOCKED.** Production recovery or deployment needs its
own authorized plan and independent evidence. Never infer that permission from
this local rehearsal.
