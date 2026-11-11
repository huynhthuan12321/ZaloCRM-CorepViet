# 9A — Production backup and isolated restore rehearsal

Date: 2026-11-03, Asia/Saigon. User explicitly approved the production backup and isolated restore step after the initial automatic approval rejection. This report supersedes the blocked execution status of the earlier preparation report for this step only; the earlier report and rejection remain historical evidence.

**Result: backup data and current catalog verified after actual isolated restore; upgrade/business/independent verification remain pending. VPS NOT_READY/BLOCKED.**

Local evidence: `artifacts/reports-vps-preparation-9a-20261103-210033/`. Remote private evidence: `/root/zalocrm-release-evidence/9a-20261103-210033/`. The real dump and row-hash inventories remain on VPS; no raw customer records, sessions, keys or dump contents were printed or transferred locally. SSH used the existing identity without printing private-key material.

## Executed scope

Verified source container exact ID `f43646ecd3194efea619ce1576abaddb0f91823ffe87c41f078067443f107b18`, database zalocrm, PG16.15. Exported a repeatable-read, read-only snapshot and used it for both pg_dump and source table fingerprints. Production writes continued normally; source reads used a 60-second statement deadline, dump lock wait 5 seconds, process limit 180 seconds. No production DDL/DML, RLS/grant change, app restart or traffic switch was performed.

Created one PG16 container from the existing exact image, `--pull=never`, `network=none`, no host port or production volume, 512MiB memory/no swap, CPU0.5 and 384MiB data tmpfs. Confirmed zero user tables and captured target OID before restore. Checked ID/ownership label/network/OID/emptiness/checksum again before restore. Recreated original crmuser ownership as setup-only superuser in the isolated cluster. This is restoration of the insecure original state, not app-role isolation proof.

Backup: `/root/zalocrm-release-evidence/9a-20261103-210033/source-current.dump`, **20,778,508 bytes**, SHA256 **d8afc177c3973de2053a622c9d30623c98b03565e2291935d5241864cecf32d4**. Private evidence directory0700 and dump0600 verified. Custom pg_dump took **7.855 seconds**; actual single-transaction, exit-on-error pg_restore took **22.006 seconds**. These are single local measurements, not production RTO/RPO commitments or media/offsite DR proof.

## Data and metadata checks

All **123 public tables**, including the complete migration ledger, match the exported snapshot using row count plus deterministic sorted row-MD5 concatenation. Hash equality is a strong comparison control subject to hash collision limits, not a formal byte-level proof. Source data was compared at the backup snapshot, not against later live writes. Actual row values never left PostgreSQL; only row hashes were sorted within VPS memory and only summary receipts returned locally.

Current-source versus restored catalog comparisons agree across all selected categories: **1684 live columns**,123 relations,345 constraints with validation/deferral properties,477 index definitions,4 noninternal triggers,4 public functions (definition hashes/security/owner/config/ACL),0 policies,0 default-ACL entries,public schema ACL and plpgsql extension. Column comparison preserves live order while ignoring physical dropped-column gaps. Catalog source capture was after backup without freezing DDL, explicitly not a snapshot-boundary catalog oracle. Catalog coverage does not include every possible PostgreSQL property or cluster/global configuration.

No owned public sequences were found, so no postrestore increment assertion was performed or claimed. The original role and ownership were reconstructed for restore; no real password hashes/global-role export was used. Database properties, external media, encryption-key custody, Redis recovery, offsite durability and actual business behavior remain separate gates.

## Preserved diagnostic failure

The first script completed pg_dump and pg_restore but failed in its SQL fingerprint sort. A diagnostic rerun captured SQLSTATE **53100**. The 384MiB tmpfs had only about35MiB free after restore, insufficient for that sort's temporary files. Original `receipt.json` remains FAILED and both attempts/logs are retained; no failed receipt was relabeled successful.

The resumed comparator computes the identical sorted row-hash concatenation in VPS Python memory instead of PostgreSQL temporary files, with a per-table memory guard. It changes neither the expected fingerprint nor the dataset. It does not increase tmpfs/RAM limits or timeouts. The resumed123-table comparison completed in **25.817 seconds** and is recorded separately in `restore-validation-streamed.json` on VPS and the corresponding local log. The earlier preflight trailing-CR error also remains preserved.

## Cleanup and integrity

After successful comparison, removed only exact target ID `253614cb94d8e48512cd26576beea72f223e60ca9b7c0a354c9d2f02c9e3a493` after validating label/name/network and mounts. No run-labelled container remains. No images or volumes were deleted. Backup and remote logs/manifests are retained privately. The isolated restored DB is gone; a future upgrade rehearsal must restore a fresh target, not assume it remains available.

Postflight confirmed production app/database exact IDs remain running with original start times (app2026-10-22,DB2026-10-17). VPS Git HEAD40675e42 and preexisting dirty paths are unchanged. Candidate remains clean at297fe538. About1555MiB memory available after cleanup. No complete before/after byte inventory of all source inputs was collected in this new production-rehearsal step; Git/status evidence must not be described as that stronger integrity proof.

Scripts are new preparation/evidence tooling, not a certified production restore runner. No immutable runtime patch, skill risk assessment, build, migration, targeted business suite or full suite was performed in this step. Earlier skill results do not certify these helpers. Historical full-suite failures remain open.

## Next gates

1. Review and rehearse upgrade from this real backup in a new isolated target, apply exact migration via migrate deploy, separate application role and RLS/grants. Preserve privacy and block provider/session/background execution before any app starts.
2. Verify business/auth/tenant/fallback and compare data/catalog before and after; independent7B must create its own evidence, not reuse this as B execution.
3. Resolve AI/Compose dirty-change compatibility, deploy configuration, capacity/failure controls, real media/key/offsite recovery, full-suite disposition and maintenance/monitoring/soak plan before production approval.

No production rollout is claimed. Backup plus successful restoration of the current insecure state does not approve switching production to the candidate.
