# RC-4 migration/schema drift — remediation 7A

03/11/2026, Asia/Saigon. **COMPLETED_PENDING_INDEPENDENT_VERIFICATION** trong phạm vi local/disposable đã kiểm. Đây là tự kiểm A, **không phải B PASS**. **VPS NOT_READY / BLOCKED.** RC-4 là ID finding drift; không đồng nhất với tên candidate RC4. Không push/merge/deploy hoặc chạy deploy.sh.

Artifact mới: [reports-rc4-drift-remediation-20261103-173819](../../artifacts/reports-rc4-drift-remediation-20261103-173819/). [Commands](../../artifacts/reports-rc4-drift-remediation-20261103-173819/commands.md), [receipt](../../artifacts/reports-rc4-drift-remediation-20261103-173819/final-receipt.json), [prompt 7B](../../artifacts/reports-rc4-drift-remediation-20261103-173819/next-independent-verification-prompt.md), [risk JSON](../../artifacts/reports-rc4-drift-remediation-20261103-173819/patch-risk-assessment.json). Risk recommendation `hold_for_evidence`, validator exit0; chờ kiểm độc lập và các gate môi trường/phát hành riêng.

## Exact final

| Mục | Định danh |
|---|---|
| Candidate / branch | `F:/ZaloCRM-candidates/reports-20261103-1023` / `release/reports-20261103-1023` |
| Baseline | `cf70b805eb88894fa2d68be1e44ac5c6bf73261c` |
| Final commit | **`b9160f5da0df36cfc6bad2755b200e8cdb86f980`** |
| Annotated tag mới | **`reports-rc4-drift-20261103-175649`** |
| Tag object | `aee908e42d91d26badd8e52cb5663b9473f97a54` |
| Image mới | **`zalo-crm-rc:reports-rc4-drift-20261103-175649-final`** |
| Local image/index | `sha256:fdd5524c28eeae4bf01cc3c5f511889ba418272faeffb8e077f23e11c0c34eea` |
| Platform manifest linux/amd64 | `sha256:32dd4917e90770a8d35b7386d76c676aff7a450e6d06bcfd3e5923e695513ec8` |
| Config | `sha256:4377e23a4e661295f97835ef429eff22fcca46780f4d9abc460af6f065a6b829` |
| cf70b805→b9160f5 patch SHA256 | `e1a296cf3a13d9b4e44923f4f038c998d7843170e3b8c413cda42a92ef75a728` |

Root vẫn HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, dirty có sẵn. Baseline tag object `227ae7af673f2fa129d53e618258034e5f060b44` và image/index `07f525e94a96...` kiểm cuối không đổi. Mọi tag/image/history cũ được giữ. Candidate sạch trước sửa, sau commit và khi build. Chỉ stage ba đường dẫn đã review; không git add -A/reset/stash/checkout. Git safe.directory từng lệnh, không đổi global config; không active Git hooks. Không tạo agent.

Áp dụng AGENTS người dùng cung cấp; ancestor/repo không có AGENTS.md được tìm thấy. Đọc contract0/E-1/O-1/release và hai report followup A/B, source/schema/migration/RLS/helper. Dùng skill assess-patch-risk cho patch bất biến; output theo đường dẫn người dùng yêu cầu. `rg` không có trên PATH nên dùng Git/Python/PowerShell. Tài liệu/helper chỉ là evidence.

## Inventory và quyết định từng delta

Fresh baseline PG16 replay tái hiện **đủ 9 SQL statements** trong file drift lịch sử. Không áp nguyên schema-drift.sql. Root cause là thiếu bước reconcile migration/metadata và Message validation sau rollout phân kỳ, cộng một index SQL không biểu diễn được đầy đủ trong Prisma. Nhận xét giữa lượt “chỉ còn 3 delta” là sai; đã đính chính trước khi sửa source, raw RED vẫn giữ.

| Delta baseline | Quyết định và thay đổi | Evidence |
|---|---|---|
| Đề xuất drop `knowledge_docs_org_id_fkey` | Giữ FK CASCADE từ migration `20260711180000`; thêm `Organization.knowledgeDocs` và `KnowledgeDoc.org` vào schema:189/1889. Sửa comment metadata cũ | Actual Prisma doc/chunk writes, org FK rejection, cascade; complete catalog |
| Drop `contacts_pool_robin_idx` và tạo index ba cột | Giữ SQL index bốn cột `(org_id, pooled_count, last_pooled_at ASC NULLS FIRST, created_at)` từ migration FIFO. Bỏ khai báo Prisma ba cột dư ở schema:743; inventory/catalog xác minh index thật | `drift-decisions-before-edit.md`, `*-complete-catalog.json`, app-role index assertions |
| Drop index Zalo org/archived | Giữ index hiện hữu; khai báo `@@index([orgId, archivedAt])` ở schema:444 | Catalog đúng definition, không rebuild/drop |
| Welcome default DB60 vs schema1 | Migration mới:27 đổi **future default** thành1 theo quyết định nghiệp vụ đã ghi trong schema. Không sửa delay đã cấu hình | Raw+Prisma default1; dữ liệu60 và7 giữ nguyên |
| Ack updated_at có default DB nhưng schema không mô tả | Giữ DB CURRENT_TIMESTAMP; thêm `@default(now())` cùng `@updatedAt` tại schema:4000 | Raw insert có timestamp; Prisma cập nhật timestamp vẫn tiến |
| Message org nullable / composite FK chưa validate | Migration mới:8–26 reject orphan/non-NULL mismatch; chỉ NULL được derive từ conversation tin cậy, validate composite FK rồi NOT NULL. BEFORE trigger cũ giữ nguyên | Fresh/upgrade/legacy-prefix và failure riêng; actual Message child writes |
| Media thiếu source FK | Migration mới:14–20 preflight orphan/cross-org; :28–30 FK ID với SET NULL/CASCADE. :32–58 thêm hai guard DB cùng tenant, giữ source lock FOR SHARE và chặn org move khi đang được tham chiếu | Actual app-role own/foreign/missing/UPDATE/race; ID cascade/delete-null giữ privacy/tenant |
| Rename distribution index | Map schema:3689 tới tên PostgreSQL truncated đã tồn tại; không rename/rebuild vật lý vì không có lợi ích nghiệp vụ | Catalog, index assertions, data preservation |

Canonical diff chỉ ba file: `backend/prisma/schema.prisma`, migration **MỚI** `backend/prisma/migrations/20261103180000_reconcile_rc4_schema_drift/migration.sql` (59 dòng), regression `backend/tests/unit/rc4-drift-migration.test.ts` (85 dòng). **129 migration cũ byte-identical**, không sửa checksum/ledger. Không sửa runtime, RLS policy, ops, deps, frontend hoặc hai remediation B7-RC4-01/B7-RC4-02.

Media FK theo ID **không tự chứng minh cùng tenant**; hai trigger bổ sung là thay đổi DB behavior cần thiết trong scope tenant invariants. Trigger là SECURITY INVOKER, query chịu RLS; không thêm bypass. Writer `media-routes.ts:133,235` lấy nick qua Message/conversation scoped rồi gọi `media-service.ts:295`; nguồn knowledge `knowledge-service.ts:37,56,64`. Prisma guard/RLS binding vẫn ở `prisma-client.ts:111,139`.

## RED → GREEN và database rehearsal

PG mới `drift-a-pg-173819`, PostgreSQL16.15, tmpfs `/var/lib/postgresql/data`, không real-data mount. Bind loopback64066 được kiểm bằng bind socket trước tạo. Lần thử55703 bị Windows từ chối bind; container chưa chạy đã được xóa đúng tên rồi chọn cổng bind được. Empty proof từng DB **0 bảng public trước ghi**. `DOTENV_CONFIG_PATH` trỏ file rỗng/absent, chỉ URL tổng hợp. Chạy Prisma CLI của repo7.5.0, đọc `migrate diff --help`, dùng **migrate deploy**, không db push/dev/reset/resolve.

- **RED:** `baseline-drift.log` tái hiện9 statements; `red-catalog.log`, `red-assertions.json`: Message nullable/FK chưa validate, media FK0, welcome default60. RED script exit1 vì đúng bốn property đang lỗi. Không coi migrate status up-to-date là hết drift.
- **Fresh:** `drift_fresh`, toàn bộ130 migrations → tenant-rls.sql nguyên trạng qua transaction/ON_ERROR_STOP → status đúng. Không unfinished/rolled-back migration.
- **Upgrade:** DB riêng `drift_upgrade` dựng đúng129 migrations từ Git archive baseline cf70b805; seed X/Y tổng hợp có Message/media/knowledge/default. Upgrade thêm đúng một migration, ledger prefix giữ nguyên từng field; dữ liệu snapshot năm bảng chịu ảnh hưởng trước/sau bằng nhau. Các bảng cha/user/contact/conversation không có DML trong migration mới.
- **Legacy NULL hợp lệ:** `drift_legacy` dựng đúng128-migration prefix trước nullable/Message trigger; seed message.org_id=NULL tại trạng thái thực sự cho phép, không disable trigger/FK. Áp hai migration còn lại. Chỉ NULL tenant chuyển đúng org của conversation; các payload/delay còn nguyên. Prefix ledger giữ nguyên.
- **Failure riêng:** `drift_orphan_failure`, `drift_cross_failure` dựng baseline rồi seed nguồn media invalid khi baseline chưa có FK/guard. `drift_message_failure` dựng expansion prefix rồi seed nonnull mismatch trước khi trigger tồn tại. Cả ba upgrade **FAIL có chủ ý**, dữ liệu không đổi, default vẫn60/media FK0. Giữ unfinished ledger entry, không repair/resolve/rerun để gọi PASS. Prisma CLI báo generic transaction-aborted khi ghi failure log; server log giữ **root diagnostic RC-4**. Không che lỗi này.
- So pg_dump schema-only (chỉ bỏ random restrict markers), cùng complete catalog constraint/index/policy/RLS/function/trigger: **fresh=upgrade=legacy**. Catalog target:123 bảng,130 completed migrations,102 org tables ENABLE+FORCE RLS,103 policies,6 noninternal triggers (cũ4+mới2).

**Drift sau sửa:** raw Prisma diff vẫn có `DROP INDEX contacts_pool_robin_idx` vì SQL-only ordering không biểu diễn được. Đây là ngoại lệ có inventory/expected definition/assertion riêng; **không gọi raw diff0**. Các delta Prisma-representable còn lại đã khớp. Không drop index hoặc FK để che drift.

Ledger/data/catalog receipts: `drift_*-ledger-before/after.log`, `drift_*-data-before/after.log`, `*-comparison.json`, `fresh-upgrade-equivalence.json`, `db-final-assertions.json`, `published-migration-integrity.json`. Các failure DB được giữ riêng tới cleanup, snapshots/log còn trong artifact.

## Business/isolation và regression mới

`drift_app`: LOGIN **NOSUPERUSER/NOBYPASSRLS/0 owned tables**. Owner chỉ setup/migrate/role/fixture tổng hợp. Business/isolation dùng app role, guard enforce và RLS_SET_CONFIG=true, host network guard chỉ cho loopback PG của lượt này; không dùng bypass business write làm proof.

| Kiểm mới | Kết quả và coverage |
|---|---|
| Targeted43 files | **401/401**, gồm6 regression migration mới, report/tenant/RLS/Message/channel/jobs/readiness/RC1/ghost/manual/media |
| Drift app role | **47+8 assertions**: own X/Y, missing/foreign tenant, ALS async/concurrency; actual Message legacy derivation/mismatch/orphan; media relation/default privacy/FK/cross UPDATE; knowledge relation/chunk/delete cascade/unknown org; raw+Prisma defaults và updatedAt |
| Concurrent media source | Hai app-role transaction: insert giữ source SHARE lock; delete pending trước commit, sau commit SET NULL và giữ child. Không gọi đây là mọi interleaving/org-move proof |
| DB/jobs |51 assertions, scheduling/provider adapter stub, query/update thật |
| Action children |15 assertions, actual recipient/notification/Message/conversation, SDK stub |
| Reconnect |69 assertions, actual pool/Prisma, nonempty ownId, UID/manual/ghost/tenant |
| Extra callback matrix |39 assertions, NULL/passive/manual/other, ngoài ALS, foreign ID, stale epoch/pending/overlap/account-org |
| Prisma validate/generate/backend build |exit0; build là compile, không business test |
| P2 / bash syntax / diff check |16/16 và exit0; chỉ `bash -n` deploy.sh, không execute |

Compile/test output ignored được phép; integrity giữ input. Các test unit/mock/PGlite không được gọi toàn bộ là PG16 integration. Frontend source không đổi, **không rerun frontend suite**. EE welcome/lead-ack worker implementation không nằm trong candidate accepted; chỉ xác nhận default/storage contract và caller hiện có, không chứng nhận EE/provider workload.

Diagnostics được giữ: fixture attempt1 thiếu cột conversations.updated_at (đã xóa đúng fixture giả bị seed dở, không reset schema/ledger), test parse lỗi string trước khi có6 test chạy, helper loader Windows path không phải file URL, initial integrity set mismatch do mở rộng phạm vi snapshot, và generated-schema byte comparison ban đầu dùng sai đối tượng. Prisma client embeds **schema đã format**; so lại với local generated schema và schema input riêng, cả hai hash đúng; không nới assertion. Historical reports/artifacts không bị sửa.

## Exact-image build, binding và smoke

Build từ clean committed candidate, Dockerfile/.dockerignore không đổi, **--pull=false**, không pull image mới. Offline `--network=none` FAIL ở apk/cache resolution, log giữ riêng; network-enabled build theo Dockerfile gốc exit0, cache-backed, không cold-install claim. Node image **22.23.4**; host test Node26.13.0.

`image-binding.json`: **1620 app-owned files**,1410 nonstatic/metadata hashes khớp local compile/source,210 static hashes khớp accepted baseline (frontend stages cached), generated Prisma schema hash khớp local generated schema. Input schema hash cũng khớp bản được copy. Đúng13 operational scripts; không app-owned tests/helpers/fixtures/.env/artifacts/TikTok connector. Dependency node_modules có file nội bộ riêng, không đánh đồng với app-owned payload hoặc gọi là dependency audit toàn diện.

OCI export xác minh actual index/platform/config và **16 compressed layer content digests** với config diffIDs. RepoDigests local có index mới; không chứng minh publication registry. Source binding dùng clean context+content/hash+layer, không dựa label. Temporary OCI archive được dọn sau receipt.

App/client/inspector chỉ internal network, không app published port; PG có bridge+loopback phục vụ host tests. Session tổng hợp được set SQLNULL trước smoke, nonnull0; JWT/signing material chỉ trong bộ nhớ môi trường process, không ghi token/key vào evidence. NODE_ENV=test/MARKETING_DRY_RUN=true/OPIK_ENABLED=false, guard/RLS giữ nguyên, không real provider/session/key/send/AI trả phí.

Mỗi pha native/fetch1→20→20→1,84 readiness requests; response<3000ms, abort4000ms; timeout FAIL.

| Pha exact image | HTTPready | Max response |
|---|---:|---:|
| Healthy |84/84 HTTP200|62ms|
| Redis stopped |84/84 HTTP503|1024ms|
| Stopped numeric app IP |84/84 HTTP503|1025ms|
| Stop recovered |84/84 HTTP200|75ms|
| Redis paused |84/84 HTTP503|1527ms|
| Pause recovered |84/84 HTTP200|54ms|
| OS-hosts actual HTTP |84/84 HTTP200|65ms|

**588 readiness requests** mới; liveness200, representative overview/sales/automation-summary/broadcast/ai X/Y200; unauth401, X identity claim Y403, foreign-ID exclusion, TikTokPOST404. Không suy tất cả route/field đều được chứng nhận.

Normal PG SELECT1/Redis PING và dedicated probes cùng healthy trên hosts-only aliases80ms; query host override81ms. Family4 positive/family6 negative trên alias IPv4-only34/35ms, không phải IPv6 success. Native transport helper kiểm literal/localhost/OS order/fallback/20 child abort+cleanup. PG fan-in numeric18ms/rejected43ms/paused1042ms/recovered59ms; settle, sau50ms chỉ PipeWrap.

Inspector fan-in40 lời gọi bổ sung/dependency cùng promise đầu, queue/offline0. Worker CLIENTID3 trước stop và4 sau restart; close count lên6 khi retry lúc stop, giữ6 qua pause/recovery; PING/PONG đạt sau recovery, resource samples về range hữu hạn. Fault warnings còn nguyên; không nói probe ngắt worker hoặc mọi workload đều PASS. Real PG TLS/IPv6/Unix/NSS variants/process restrictions không test mới; Redis TLS proof ở B trước là **historical**, không nhận là lượt này chạy lại. Startup0 sessions không phải SDK reconnect proof; reconnect có helper nonempty riêng.

## Integrity, cleanup và gate còn lại

`integrity-final.json`: snapshot đầu root1157/candidate1025 inputs; snapshot cuối mở rộng root1179/candidate1049. **Root không changed/added/removed trong các cây đã phủ từ đầu**. Candidate đúng một file đổi (schema), hai file mới (migration/test), không removed. Supplement đối chiếu accepted B build-input snapshots root1171/candidate1039: root giữ nguyên; candidate chỉ schema đổi và hai file mới. Phần phạm vi bổ sung/ignored CSS/Compose được ghi rõ trong receipt, không giả snapshot đầu đã phủ mọi file. Source/test/Prisma/ops/build inputs không có thay đổi ngoài scope; HEAD/root dirty được giữ.

Cleanup chỉ `drift-a-app/probe/hosts-app/redis/pg-173819` và network `drift-a-net-173819`, temporary OCI archive; giữ final candidate/tag/image và mọi lịch sử. Hai container phiên khác `reports-1b-verify-20261101`, `sketchup-api-1` giữ nguyên. Port64066 được kiểm cuối, không prune. Chi tiết cleanup/inventory/exit trong `cleanup-receipt.json` và commands.

Không rerun full suite. Chỉ **historical-log comparison theo report B đã đọc**: RC3 **33 failed files/6 failed tests**; RC2final **35/8**,29 import/setup headings mỗi bên. Không gọi401 targeted là full suite PASS hoặc shared failures harmless/miễn gate.

Giới hạn rollout: lock_timeout5s/statement_timeout5min không thay thế rehearsal dữ liệu lớn/lock contention; actual target revision/data/grants chưa được truy cập. Tenant backfill không được rollback về NULL để “khôi phục”. Thay đổi welcome default chỉ dữ liệu mới; consumer EE thiếu source chưa được nghiệm thu. Secure fallback giữ E-1/O-1/no TikTok, backup/restore thật, deployed revision, staging/monitoring/soak, full-suite release evaluation và production approval vẫn là scope/gate riêng. **VPS tiếp tục NOT_READY/BLOCKED**, không triển khai.

Bước tiếp: 7B dùng prompt đính kèm, kiểm exact final mới, độc lập tái hiện delta/catalog/fresh/upgrade/failure/isolation/image. A chỉ bàn giao **COMPLETED_PENDING_INDEPENDENT_VERIFICATION** cho RC-4 trong scope local đã kiểm.
