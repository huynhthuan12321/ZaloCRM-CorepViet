# 7B ? Secure fallback RC-4 compatibility v? backup/restore local

Ng?y 03/11/2026, Asia/Saigon. **PASS_LOCAL_DISPOSABLE** cho secure application fallback compatibility + local recovery trong ph?m vi ki?m d??i ??y. **VPS NOT_READY/BLOCKED.** Kh?ng c?p production approval, kh?ng commit/push/merge/deploy ho?c t?o agent.

Artifact B m?i: `artifacts/reports-secure-recovery-7b-20261103-202201/`. ?i?m v?o: `final-receipt.json`, `commands.md`, `b-validation-summary.json`, `restore-summary.json`, `catalog-review-summary.json`, `business-summary.json`, `recovery-smoke-summary.json`, `image-oci-identity.json`, `source-binding.json`, `integrity-final.json`, `cleanup-receipt.json`.

## 1. Identity v? ph?m vi

| ??i t??ng | B ??i chi?u th?c t? |
| --- | --- |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023`; clean tr??c/sau |
| Branch | `release/reports-20261103-1023` |
| Runtime baseline | `b9160f5da0df36cfc6bad2755b200e8cdb86f980` |
| Documentation final | `297fe538eed7d62ab7f387f3b2e1a892433d2970` |
| Annotated tag/object | `reports-secure-recovery-20261103-193629` / `861faa51646dc3cff270d302512e52831fd78301` |
| Exact full-index/binary patch SHA256 | `687df148c15cc5c367fc10cbc7f7e6f87cf675d875d651bb5567df12a2555a01` |
| Changed paths | Ch? `docs/runbooks/SECURE-RECOVERY-LOCAL.md` |
| Primary image | `zalo-crm-rc:reports-rc4-drift-20261103-175649-final` |
| Primary index | `sha256:fdd5524c28eeae4bf01cc3c5f511889ba418272faeffb8e077f23e11c0c34eea` |
| Primary platform/config | `sha256:32dd4917e90770a8d35b7386d76c676aff7a450e6d06bcfd3e5923e695513ec8` / `sha256:4377e23a4e661295f97835ef429eff22fcca46780f4d9abc460af6f065a6b829` |
| Fallback runtime | `cf70b805eb88894fa2d68be1e44ac5c6bf73261c` |
| Fallback annotated tag/object | `reports-rc4-followup-20261103-163013` / `227ae7af673f2fa129d53e618258034e5f060b44` |
| Fallback image/index | `zalo-crm-rc:reports-rc4-followup-20261103-163013-final` / `sha256:07f525e94a9607c748381d1129cbb9ba61e8328efc26a021b69df41f36eabb15` |
| Fallback platform/config | `sha256:ed261890f7b7a754945d6311135f017bebc1ea0ee3ff7023cadffde420b3a6c8` / `sha256:24c273914dd5b25e3fb63b3bf47637e7e74e5a72d6a5e799b946a17ffa762b18` |

Primary v?n l? image c?a b9160f5. Kh?ng c? rebuild/new image cho documentation commit297fe538. Kh?ng thay runtime/tests/schema/migrations/ops/dependencies ?? ??t k?t qu?. Root dirty c? s?n gi? nguy?n; ch? th?m report n?y v? artifact B m?i. Git d?ng safe.directory t?ng l?nh; kh?ng global config/reset/stash/checkout/stage/commit/tag.

?? ??c AGENTS user cung c?p; kh?ng th?y AGENTS.md v?t l? root/candidate/ancestor ?? ki?m. ??c contract0, E-1/O-1, release7, drift independent B, hai recovery runbooks, report/evidence A; helper ???c review source/side effects tr??c khi d?ng. Kh?ng ch?y A initial/resume chain nguy?n tr?ng. Runner B m?i d?ng t?n/labels/ports/resource ledger ri?ng; assertion image helpers sau review ???c copy v?o B v? ch?y m?i, kh?c v?i t?i s? d?ng k?t qu? A.

?p d?ng **codex-security:assess-patch-risk** sau khi ??c ??y ?? SKILL.md, artifact-storage, risk-rubric v? JSON schema. Output `patch-risk-assessment.json/.md`, validator **exit0**. Recommendation **merge / human_review_required** ch? l? advisory cho t?i li?u c? contract local ?? ???c ki?m; kh?ng c? thao t?c merge ho?c quy?n production. Impact high, likelihood low, protection partial, document revert easy, confidence high. Kh?ng scan/verify-fix ho?c agent. Destination theo y?u c?u user, kh?ng gi? scan ID.

## 2. Contract/fallback review

`docs/runbooks/SECURE-RECOVERY-LOCAL.md:14?34` x?c ??nh ??ng fallback ?ng d?ng tr?n schema130 ?? n?ng c?p/RLS; `:51?61` gi?i h?n authority/target identity; `:65?124` n?u ph?m vi dump v? restore; `:155?170` gi? release gates.

B x?c nh?n actual `dist/static/scripts` c?a primary/fallback b?ng nhau. Input/generated Prisma kh?c, primary c? th?m migration RC-4. Client cf70 ch?a c? `KnowledgeDoc.org`, n?n helper ki?m API th?c s? c? `orgId/chunks` v? physical Organization FK/catalog; kh?ng b?a relation field ho?c b? tenant assertions. Fallback ch? ch?ng minh t??ng th?ch client/schema RC-4 cho workload ?? ki?m. **Kh?ng ch?a common-mode runtime defect**, kh?ng replay fallback migration directory, down-migrate, thay ledger ho?c coi Git revert l? rollback d? li?u. `docker/Dockerfile:63?67` ch?y `node dist/app.js`, kh?ng auto replay migrations.

Historical baseline-eb1be0b v?n b? lo?i d?a historical login500/RLS v? TikTok401. B kh?ng ch?y l?i image ?? v? kh?ng bi?n historical failure th?nh B execution m?i.

Known deferred operational issue: `scripts/ops/verify-restore.sh:104?108,195?197` cleanup theo t?n v? count-only acceptance. B ?? ??c, kh?ng execute/fix runner n?y. N? **kh?ng** ???c harden/certify b?i rehearsal m?i; c?n scope ri?ng tr??c khi d?ng v?i t?i nguy?n th?t. ??y l? finding v?n h?nh ?? bi?t, kh?ng regression c?a documentation patch m?i.

## 3. B m?i ? clusters/migrate/backup/restore

Hai PostgreSQL16.15 clusters ri?ng `recovery-b7-pg-202201` v? `recovery-b7-restored-202201`, tmpfs, loopback64213/64214, kh?ng real-data mount. System identifiers kh?c nhau, actual DB/version v?0 user tables ???c x?c nh?n tr??c ghi. Source replay ?? migrations b?ng repo Prisma CLI/help/config `migrate deploy`, ?p tenant-rls.sql nguy?n tr?ng trong transaction; kh?ng db push/dev/reset/resolve.

Source/target ??u ch?ng minh role `recovery_app` ch?a t?n t?i tr??c explicit recreation. App role NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION, **0 owned tables**. Gi? ownership, object/schema/table/sequence ACL v? default privileges; kh?ng no-owner/no-acl. Owner ch? setup/migrate/fixture/backup/catalog, kh?ng l?m isolation proof. Target kh?ng replay migration/RLS sau restore. Config ch? synthetic, DOTENV_CONFIG_PATH tr? ngu?n absent, kh?ng ??c .env/session/secret th?t.

B seed relational fixtures X/Y (dr-X/Y v? b7-X/Y), Unicode, Message/conversation/media/knowledge chunks/default60/custom7/NULL v? additive `recovery_fixture.sequence_probe`. Fixture owner setup kh?ng b? t?nh l? app isolation. Snapshot reader + pg_dump d?ng chung exported repeatable-read snapshot trong khi actual **app role** commit120 parent/child transactions sau snapshot. B x?c nh?n live source c?120 pairs, backup oracle kh?ng c?; kh?ng so dump v?i tr?ng th?i live mu?n h?n v? kh?ng claim PITR/zero loss.

| Ph?p ?o B m?i | K?t qu? |
| --- | --- |
| B relational dump | 570960 bytes; SHA256 `d57c380fe5a16fac1330820d1349dc27f774b14e4328dbb61328a6d21790e06d` |
| B dump time | 0.517s |
| Restore target primary copy | 1.299s |
| Restore fallback copy | 1.010s |
| Restore retry target m?i | 1.005s |
| Auth-ready B dump | 573734 bytes; SHA256 `109a24426399d626c2aee97ef4ac17f464b8cb7df881c19922c1021f8c198e4e` |
| Auth-ready backup time | 0.510s |

T?t c? l? tiny synthetic fixture/tmpfs local measurements, kh?ng production RTO/RPO ho?c capacity benchmark.

B ki?m SHA256/size hai A dumps ??ng input user; **429/429 A manifest entries** kh?p. Ngo?i backup B m?i, B restore actual A `synthetic-source.dump` v?o DB m?i `recovery_a_copy`, so full snapshot A oracle b?ng assertions ch?y m?i. Kh?ng in raw dump. Auth-ready B dump ???c t?o sau seed bcrypt synthetic, restore r?i actual login **kh?ng rewrite password**. Signing/JWT/raw refresh tokens ch? memory; DB snapshot c? synthetic bcrypt/refresh-token hashes theo c? ch? app, kh?ng raw usable token/provider material.

## 4. Data/catalog/privilege equivalence

B so full records c?a **123 public tables +1 additive sequence fixture**, to?n130 migration ledger entries/0 unfinished v? sequences; kh?ng ch? counts. Restore copies kh?p snapshot d? li?u, sequence v? logical catalog tr??c business mutations. Ki?m postrestore sequence insert tr?3, kh?ng collision.

Catalog g?m1686 live columns, type/default/NOT NULL/identity/collation/precision, live order, FK/VALID/index definition/order, functions/owners/ACL/security/config, triggers/enabled state, RLS ENABLE+FORCE/policies, relation ownership/options, role attributes/membership, schema/table/column/sequence/default grants v? extensions. B th?y103 policies/6 noninternal triggers; ??y l? observed inventory, kh?ng quota. SQL-only `contacts_pool_robin_idx` gi? `(org_id, pooled_count, last_pooled_at NULLS FIRST, created_at)`.

Logical restore compact **35 physical ordinal positions** do dropped-column history; live-column order v? metadata kh?c kh?p. Extended comparator ph?t hi?n th?m `information_schema.dtd_identifier` l? c?ng physical attnum: B bind t?ng gi? tr? v?o ordinal capture ??c l?p c?a ch?nh DB tr??c normalization. `table_catalog/udt_catalog` c?ng ph?i kh?p actual source/target DB tr??c normalization. Kh?ng b? logic type/grant/constraint ?? ??t PASS. Raw JSON/schema-only dumps v? hai initial comparator errors ???c gi?; xem `catalog-first-diagnostic.txt`, `catalog-database-identity-normalization.json`, `catalog-physical-dtd-differences.json`.

Cluster globals/password hashes kh?ng n?m trong database dump. Ch? recreate r? hai synthetic roles, ki?m memberships/config; kh?ng export password hashes. Fixture DB creation properties/default DB ACL/tablespace/locale ???c inventory/compare nh?ng **kh?ng claim dump v?n chuy?n c?c DB-level properties ??**. External media bytes/keys/environment/Redis/offsite kh?ng covered. Kh?ng c? actual target grants/revision/data proof.

## 5. Failure controls v? recovery

B m?i reject tr??c restore/copy mutation: missing file, checksum/length mismatch, wrong container ID, wrong ownership label, wrong DB OID, nonempty target; nonexistent database c?ng fail tr??c ghi. DB targets m?i thu?c resource ledger B, exact IDs/labels ???c ki?m.

Actual truncated archive v?i **self-consistent checksum manifest** ?i v?o `pg_restore --single-transaction --exit-on-error`, b? t? ch?i exit1 v? ??0 user tables/kh?ng partial ledger. Failure DB/log gi? ri?ng t?i cleanup, kh?ng repair/resolve. Retry d?ng DB m?i r?ng, ngu?n backup nguy?n v?n, full equivalence ??t. Negative controls exit1/2 l? expected rejection, kh?ng ??i evidence th?nh successful restore. `restore-controls.json`, `restore-failure.json`, raw `corrupt-content-restore.log` v? commands c? exit/time.

## 6. Actual-image business/tenant/SDK controls

M?i image ch?y **187 assertions**: compiled client/tenant37, actual media registerAsset10, knowledge service17, action children15, reconnect69, extra callback39. ??y l? k?t qu? B execution m?i tr?n PG16/app role, kh?ng A receipt v? kh?ng quota. Helpers d?ng compiled code trong exact image, ch? stub SDK/storage/embedding/provider adapters; kh?ng provider/MinIO/send/paid AI th?t.

- Missing-context guard/raw RLS deny; own dr-X/Y async/concurrency ??c/ghi ??ng, foreign/missing/unknown-org b? ch?n. Actual Message/conversation child derive tenant, foreign parent rejection, defaults m?i1/existing60/custom7, source SET NULL/ID cascade gi? asset/org/privacy, knowledge/chunk cascade v? sequence advance.
- Actual `registerAsset` create/dedup/update v? foreign source atomic rejection qua `media-service.ts:253,295`; in-memory storage adapter. Knowledge ingest/list/delete/chunk qua `knowledge-service.ts:28,56,64`, embedding stub. Kh?ng g?i l? service-route HTTP/storage/provider certification.
- Actual action children ghi notification/Message/conversation d??i tenant context. Separate restored SDK copies so equivalence tr??c reset; sau ?? ch? delete **synthetic dr-X/dr-Y organizations** ?? broad sweep test c? fixture b7-X/Y ??ng. Kh?ng disable constraints/triggers/guard/RLS.
- SDK `getOwnId()` nonempty. Reconnect/loginQR/dynamic callbacks: ngo?i ALS, NULL?passive/disconnectedAt, passive/manual/other, foreign/missing account, callback foreign ID, stale epoch, pending/overlap/account-org, profile/status/log, duplicate/globalUID v? manual/ghost/archived invariants. Trace observed business writes kh?ng bypass. Identity-only bootstrap/login system side effects t?ch kh?i isolation proof; kh?ng suy repository-wide isolation/global sweep certification.

Actual callers ?? ??i chi?u: tenant extensions `prisma-client.ts:120?155`; callback `zalo-pool.ts:518?538`, connected reset`:640`; service callers v? `app.ts` health registration. Kh?ng source change trong B.

## 7. Exact-image switch/auth/fault smoke B m?i

Primary?fallback?primary tr?n **c?ng restored auth-ready DB**. M?i switch ki?m original Message/conversation/media/knowledge/chunks, ledger v? catalog gi? nguy?n. Expected login/audit/refresh-token/scoring/startup mutations ???c gi? ? snapshots ri?ng, kh?ng claim to?n b? DB b?t bi?n.

Actual login/profile + report quy?n hi?n th?i: **22 assertions m?i phase/66 total**. C?ng access token sau downgrade/inactive b?403 tr?n route t??ng ?ng; X/Y own reports, unauth401, cross-org403, TikTokPOST404. Representative report overview/sales/automation-summary/broadcast/ai v? foreign-ID exclusion; kh?ng m?i report metric/field ho?c canonical path ??u ???c t?i nghi?m thu to?n di?n.

**1764 readiness requests B m?i**,21 phases?84 native/fetch1?20?20?1, ??ng200/503, max **1529ms**, kh?ng timeout. Gi? dependency1500ms/HTTP2000ms/response<3000ms/abort4000ms. Primary-before v? fallback: healthy; Redis stop/recover/pause/recover; PG pause/recover/rejected; OS-hosts actual healthy; numeric app IP. Primary-after healthy. Health response db/redis/status ???c analyzer ki?m t? raw body; liveness200 v? Messenger informational contract gi?.

OS-hosts normal PG SELECT1/Redis PING positive control + dedicated probes/single-flight40 + actual HTTP200. Query-host override, IPv4/IPv6 literals/localhost OS ordering/address fallback/20 abort-reap per image ???c ki?m; Redis family4 positive/family6 negative tr?n IPv4-only alias **kh?ng** l? IPv6 success. PG rejected actual app HTTP503 ri?ng, inspector samples0 cho phase n?y; dedicated bad-URL probe t?ch r?.

Inspector40 callers/dependency share pending work, worker object unchanged, queue/offline0. Primary CLIENTID3 tr??c/sau restart c? th? t?i d?ng3 do Redis counter reset; kh?ng suy c?ng physical socket ch? t? s? ID ??. Fallback91?4 sau restart. Close count0?3 khi stop/retry, gi?3 qua pause/recovery; worker PING ph?c h?i/PONG, kh?ng th?y probe-induced worker disconnect trong matrix n?y. Finite resource/timer/socket/process samples kh?ng ch?ng minh no-leak v? h?n. Gi? startup/fault warnings.

Startup session NULL kh?ng SDK proof; SDK proof l? helpers ri?ng ph?a tr?n. TLS/real IPv6 network/Unix success/all provider/background workloads **UNVERIFIED**.

## 8. OCI/source binding v? diagnostics

B export actual primary/fallback OCI archives **m?i**, t? SHA256-check index/platform/config v?16 blob descriptors m?i image (15 runtime layers+attestation layer). RootFS diffIDs kh?p config/inspect, RepoDigests kh?p index. Actual Node22/13 scripts v? app-owned payload hygiene ??t; dependency files kh?ng b? ??nh ??ng v?i app helper/tests/fixtures. Kh?ng pull/prune/rebuild image. Hai archive t?m ri?ng B ?? x?a sau receipts; gi? image/tag/history.

New actual1619 primary payload hashes kh?p receipt historical independently clean-built Linux image. ?? l? historical build provenance + new content/blob verification, **kh?ng** B rebuild/cold install. Local primary input schema so raw bytes ri?ng, local GENERATED schema so actual generated bytes ri?ng; kh?ng so raw input v?i generated format-normalized schema.

B ki?m l?i host output diagnostic:1538 matches,80 missing host-static asset names, static/index.html kh?c. Kh?ng claim host frontend/dist byte-identical accepted Linux image. Actual primary/fallback static bytes b?ng nhau, accepted Linux binding ri?ng ??t.

Initial fallback schema Git text hash assertion FAIL do Git blob LF/image file CRLF (4534 line endings); direct byte captures x?c minh **ch?** newline kh?c. `schema-newline-binding.json` gi? byte lengths/SHA/raw schema bytes; kh?ng thay source ?? x?a diagnostic. Historical A extras FAIL, tool timeout/P1001/catalog assertion/OID TypeError v? intermediate logs nguy?n tr?ng trong A ?? hash-verify.

## 9. Regression, diagnostics v? claims

Targeted m?i **141/141 tests,8 files**, Prisma validate exit0, immutable diff --check exit0. Tenant context/guard/inventory, auth continuation, health/probe, RC-4 migration engine v? manual-disconnect. Unit/mock/PGlite kh?c PG16 app/business; compilation kh?ng business proof. Kh?ng build/generate/P2/bash/frontend m?i v? patch ch? docs, kh?ng ??i inputs/ops; actual image checks ?? ch?y ri?ng.

**Kh?ng rerun full suite, kh?ng full-suite PASS.** Ch? historical-log/report comparison: RC3 33 failed files/6 failed tests; RC2final35/8,29 import/setup headings m?i b?n. Shared failures kh?ng harmless ho?c mi?n release gate.

| Claim A | K?t lu?n B |
| --- | --- |
| Documentation-only identity v? reused image | X?c nh?n Git/patch/OCI/runtime inputs m?i |
| Separate-cluster recovery, full data/catalog/roles | X?c nh?n b?ng execution B m?i + extended metadata/grants |
| Snapshot writer v? failure controls | X?c nh?n B m?i; th?m wrong container/label v? nonexistent DB controls |
| cf70 application-only RC-4 compatibility | X?c nh?n local business/auth/switch matrix; common-runtime limitation c?n nguy?n |
| Restore auth credentials kh?ng rewrite | X?c nh?n B dump?restore?actual login m?i |
| Host outputs byte-identical / production READY | Kh?ng ???c ch?ng minh; runbook A ?? lo?i claim n?y |
| Full-suite/real target DR/RTO-RPO | Ch?a ?? v? ngo?i scope |

**Kh?ng c? finding m?i c?n s?a source/runbook trong scope local ?? ki?m.** Existing production-runner risk v? proof gaps ???c gi?, kh?ng bi?n th?nh regression m?i ho?c production waiver.

B helper diagnostics c?n nguy?n: extended catalog absolute identity/dtd comparisons FAIL tr??c khi validate normalization; analyzer offset0 JSONDecodeError do leading logger line; image fallback text-hash assertion CRLF; cleanup receipt ban ??u so full IDs v?i short IDs. Original scripts/raw JSON/logs v? diagnostic notes gi?, ch? s?a B checker/parsing, kh?ng runtime/test assertions ho?c timing. Hai catalog/analyzer errors ??u ???c ghi trong tool transcript v? diagnostic notes; kh?ng gi? c? raw stderr file ri?ng n?u kh?ng capture.

## 10. Integrity, cleanup v? k?t lu?n

Covered source/test/Prisma/ops/Docker/frontend-public/build inputs: **root1272/1272, candidate1143/1143 unchanged** tr??c/sau. Ph?m vi tracked+nonignored inputs/runbooks; deliberate exclusions secrets/.env, ignored generated/node_modules/dist/coverage, report/artifact outputs. Kh?ng ch? Git status. A preflight inventory **428/428 retained files** unchanged (excludes pycache), manifest429 entries verified ri?ng. Old tags/image tag IDs gi? nguy?n. Root HEAD/dirty lines b?o to?n; candidate s?ch/HEAD unchanged, ch? report B m?i ? root.

Cleanup x?c minh exact created IDs/labels r?i x?a **13 own containers/1 own internal network**, PostgreSQL/Redis tmpfs, kh?ng anonymous volume m?i. Loopback64213/64214 kh?ng listener. Hai phi?n kh?c `reports-1b-verify-20261101` v? `sketchup-api-1` gi? nguy?n full IDs/running state. Final read-only receipt s?a l?i full-vs-short-ID comparator sau deletion ?? ho?n t?t, kh?ng replay destructive cleanup. Gi? synthetic dumps/checksums/logs v? A/tag/images/history; kh?ng prune.

**K?t lu?n 1: PASS_LOCAL_DISPOSABLE** ? secure application fallback RC-4 schema compatibility + synthetic local backup/restore tr?n exact documentation commit297fe538 v? hai reused images ?? ??nh danh. Kh?ng suy c? recovery production runner ho?c common-mode fallback an to?n.

**K?t lu?n 2: VPS NOT_READY/BLOCKED.** Actual deployed revision/schema/data/grants/config preflight; real DB/media/key/offsite backup/restore; target-scale/RTO-RPO/maintenance budget; legacy runner hardening/review; full-suite disposition; staging/monitoring/soak v? production approval c?n l? c?c gate ri?ng. Local PASS kh?ng c?p ph?p target access/deploy. B??c ti?p l? l?p scope ri?ng cho c?c gate ??; kh?ng t? th?c hi?n trong B n?y.
