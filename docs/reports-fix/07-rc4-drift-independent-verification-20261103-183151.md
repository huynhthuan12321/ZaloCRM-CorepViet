# RC-4 migration/schema drift — kiểm độc lập 7B

03/11/2026, Asia/Saigon. **RC-4 remediation: PASS trong phạm vi local/disposable đã kiểm. VPS: NOT_READY / BLOCKED.** Không phát hiện finding mới chặn remediation trong matrix dưới đây. Không cấp chứng nhận toàn repository, mọi interleaving, full suite hoặc production. Không sửa runtime/test/schema/migration/ops, không tạo agent, không push/merge/deploy.

Artifact B mới: [reports-rc4-drift-7b-20261103-183151](../../artifacts/reports-rc4-drift-7b-20261103-183151/). [Commands](../../artifacts/reports-rc4-drift-7b-20261103-183151/commands.md), [risk JSON](../../artifacts/reports-rc4-drift-7b-20261103-183151/patch-risk-assessment.json), [DB replay](../../artifacts/reports-rc4-drift-7b-20261103-183151/replay-summary.json), [business](../../artifacts/reports-rc4-drift-7b-20261103-183151/business-summary.json), [smoke](../../artifacts/reports-rc4-drift-7b-20261103-183151/smoke-summary.json), [integrity](../../artifacts/reports-rc4-drift-7b-20261103-183151/integrity-final.json), [cleanup](../../artifacts/reports-rc4-drift-7b-20261103-183151/cleanup-receipt.json).

Skill `codex-security:assess-patch-risk` áp dụng cho diff bất biến; recommendation/workflow **hold_for_evidence**, validator **exit0**. Đây là đánh giá rủi ro phát hành, riêng với verdict remediation local. Không dùng `verify-fix` cho drift thông thường. Đường dẫn artifact/report theo yêu cầu trực tiếp của người dùng; không chạy security scan hoặc tạo scan ID giả.

## 1. Identity và phạm vi kiểm mới

| Đối tượng | B xác nhận |
|---|---|
| Root | `F:/ZaloCRM-CorepViet`, HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, dirty có sẵn giữ nguyên |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023`, sạch trước/sau |
| Branch | `release/reports-20261103-1023` |
| Baseline | `cf70b805eb88894fa2d68be1e44ac5c6bf73261c` |
| Final | **`b9160f5da0df36cfc6bad2755b200e8cdb86f980`** |
| Annotated tag | `reports-rc4-drift-20261103-175649` |
| Tag object | `aee908e42d91d26badd8e52cb5663b9473f97a54`, type tag, peel đúng final |
| Exact A image được smoke | `zalo-crm-rc:reports-rc4-drift-20261103-175649-final` |
| Local image/index | `sha256:fdd5524c28eeae4bf01cc3c5f511889ba418272faeffb8e077f23e11c0c34eea` |
| Platform manifest linux/amd64 | `sha256:32dd4917e90770a8d35b7386d76c676aff7a450e6d06bcfd3e5923e695513ec8` |
| Config | `sha256:4377e23a4e661295f97835ef429eff22fcca46780f4d9abc460af6f065a6b829` |
| B regenerated full-index/binary patch SHA256 | `e1a296cf3a13d9b4e44923f4f038c998d7843170e3b8c413cda42a92ef75a728`, trùng A |

Đọc hướng dẫn người dùng, contract0/E-1/O-1/release, followup A/B, drift A và helper/source liên quan trước chạy. AGENTS ở root/candidate/ancestor đã kiểm không có file; áp dụng AGENTS được người dùng cung cấp. Tài liệu/helper chỉ là evidence. Git safe.directory từng lệnh, không global config. Không reset/stash/checkout/stage/commit/tag trong candidate. P2 chỉ dùng Git trong fixture tạm của test.

Scope diff đúng ba path: schema Prisma, migration mới `20261103180000_reconcile_rc4_schema_drift/migration.sql`, và `tests/unit/rc4-drift-migration.test.ts`. Không đổi 129 migration directories đã phát hành; không sửa dependency/runtime/frontend/ops/RLS policy. `published-migration-integrity.json` xác minh bytes thực từ baseline export. A artifact manifest **561 entries khớp**, không missing/mismatch; không sửa evidence lịch sử.

## 2. Inventory drift và quyết định được xác nhận

B dựng baseline DB mới rồi dùng actual Prisma CLI/config tái hiện **9 SQL statements** lịch sử. Không chạy nguyên `schema-drift.sql`, không coi schema hoặc DB mặc nhiên đúng hơn bên kia.

| Delta | Source và kết luận B |
|---|---|
| Knowledge Organization FK | Schema `Organization.knowledgeDocs`/`KnowledgeDoc.org` tại khoảng189/1889 mô tả existing CASCADE FK; giữ constraint vật lý. Actual Prisma và knowledge service ingest/list/delete/chunk controls đạt |
| Contacts FIFO index | Giữ `(org_id, pooled_count, last_pooled_at NULLS FIRST, created_at)` từ migration FIFO. Schema:743 bỏ khai báo ba cột dư; catalog xác nhận không mất index hoặc tạo replacement dư |
| Zalo org/archived index | Schema:444 mô tả existing index, không drop/rebuild |
| Welcome default60→1 | Schema:2749–2751 ghi quyết định nghiệp vụ từ trước. Migration mới:28 đổi future SQL default; raw/Prisma inserts nhận1, existing60 và7 giữ nguyên |
| Ack updatedAt | Schema:4000 giữ `@updatedAt` và thêm `@default(now())` để khớp DB CURRENT_TIMESTAMP. Raw insert bỏ timestamp vẫn có; actual Prisma update tiến timestamp |
| Message tenant | Migration:9–26 reject orphan/nonnull mismatch, trusted-parent-only NULL backfill, validate composite FK rồi NOT NULL. Existing `channel_message_org_guard` vẫn derive org cho writer cũ/nested/raw |
| Media source | Migration:15–20 preflight; :29–31 FK SET NULL/UPDATE CASCADE; :33–59 hai SECURITY INVOKER guards giữ same tenant và source lock. B kiểm behavior, không chỉ FK tồn tại |
| Distribution index | Schema:3689 map đúng PostgreSQL truncated name hiện hữu, không đổi physical index/order |

**Raw Prisma diff sau sửa vẫn còn một đề xuất `DROP INDEX contacts_pool_robin_idx`.** Đây là SQL-only exception có inventory/catalog chính xác, không phải raw diff0. Các delta Prisma-representable đã khớp; constraints/index/triggers/policies ngoài Prisma được kiểm riêng. Không drop object để che drift.

## 3. PG16 mới, fresh/upgrade/legacy/failure

Container B `drift-b7-pg-183151`, PostgreSQL16.15, tmpfs, loopback64067 được bind kiểm trước tạo, không real-data mount. Mỗi DB trước ghi có identity/version và **0 public tables**. Repo Prisma7.5.0, đọc actual CLI help; chỉ **migrate deploy**, không db push/dev/reset/resolve.

Các lần chạy dưới đây là **B executions mới**, không nhận JSON/log A làm kết quả B:

- `drift_base`: baseline129 migration deploy; drift/catalog RED tái hiện trạng thái trước sửa.
- `drift_fresh`: toàn bộ130 migrations rồi nguyên trạng tenant-rls.sql trong transaction/ON_ERROR_STOP.
- `drift_upgrade`: exact baseline Git export → seed X/Y tổng hợp → migration mới; prefix ledger cũ exact.
- `drift_legacy`: genuine128-migration prefix trước Message trigger; seed NULL hợp lệ tại đúng trạng thái đó, upgrade hai migration còn lại. Không disable trigger/constraint. Chỉ org NULL được derive đúng conversation.
- `drift_orphan_failure`, `drift_cross_failure`: baseline hợp lệ cho phép legacy invalid media source; seed orphan/cross-org rồi upgrade phải FAIL.
- `drift_message_failure`: expansion prefix thực sự cho phép nonnull mismatch; migration mới phải FAIL, không rewrite tenant.

Snapshot trước/sau **10 bảng fixture** gồm organizations/users/accounts/contacts/conversations/messages/media/knowledge/default/ack. Upgrade dữ liệu bằng nhau; legacy chỉ trusted NULL tenant thay đổi; ba failure dữ liệu bằng nhau. Mỗi old ledger prefix giữ exact từng field. Failure entries chưa finished/không marked rolled-back được giữ riêng, không repair rồi gọi PASS. Sau capture evidence mới cleanup tmpfs DB.

Prisma CLI có thể surfaced generic transaction-aborted; `pg-failure-root-diagnostics.log` giữ actual server root errors Message/Media. Đây là expected negative controls, không phải lỗi final-head ở đường dữ liệu hợp lệ.

Fresh/upgrade/legacy **full complete catalog và normalized schema-only dump bằng nhau**. Catalog B target:123 bảng,130 completed/0 unfinished,102 org tables ENABLE+FORCE,103 policies,6 noninternal triggers. So constraints/VALID, index definition/order, functions/triggers/RLS/policies; không dùng migrate status up-to-date làm proof hết drift.

## 4. Actual app role, service callers và concurrency

Role `drift_app`: NOSUPERUSER/NOBYPASSRLS/**0 owned tables**. Owner chỉ setup/migrate/grants/fixture. App proof giữ guard enforce/RLS_SET_CONFIG=true, own X/Y, foreign/missing/unknown org, async/concurrency; không business bypass. Host network guard giới hạn loopback PG B, môi trường chỉ giá trị test tổng hợp và DOTENV_CONFIG_PATH rỗng. Không đọc credentials/session/.env thật.

| Check B mới | Kết quả và giới hạn |
|---|---|
| Drift actual Prisma/app-role |47 +8 assertions: Message derive/spoof/orphan, media own/foreign/source update/delete/cascade/privacy, knowledge relation/chunks/cascade, defaults/timestamps |
| Actual `registerAsset` |10 assertions qua source thật `media-service.ts:253,295`, Prisma+PG16 thật; storage adapter in-memory, file payload tổng hợp. Own X/Y create và dedup gắn source thành công; foreign create/dedup update bị từ chối và không sửa asset. Không gọi đây là save-from-chat HTTP hoặc MinIO proof |
| Actual knowledge service |17 assertions qua `ingestText/listDocs/deleteDoc` và chunkText thật; embedding adapter giả, generation/key access bị chặn. Own X/Y lưu/đọc/cascade đúng; foreign/missing/unknown org deny. Không gọi provider/AI trả phí |
| B concurrency bổ sung |5 assertions: source ID rename chờ child insert rồi cascade; referenced source org move bị guard23503; conversation ID rename chờ Message insert rồi cascade và giữ org. App role thật, không bypass |
| DB/jobs |51 assertions, actual queries/updates và scheduling/provider adapter stub |
| Action children |15 assertions, actual recipient/notification/Message/conversation writes với SDK stub |
| Reconnect |69 assertions, nonempty ownId, own/foreign/missing, profile/status/log/UID/manual/ghost/archived và ghost-memory |
| Extra callback |39 assertions: NULL/passive/manual/other, ngoài ALS, foreign callback ID, stale epoch, pending/overlap/account-org |

A helper copies được đọc trước chạy và đặt trong B artifact, không sửa A. B bổ sung service và race helpers riêng. Các adapter chỉ thay boundary network/provider; tenant context, actual Prisma/app-role và relevant service bodies giữ nguyên. Trace không bypass business writes; identity-only bootstrap tách khỏi isolation proof.

Callers đã rà: `app.ts` đăng ký media/knowledge; `media-routes.ts:141–157` resolve Message/nick trong org và privacy trước gọi service:235; `media-service.ts:253` dedup update/:295 create; `knowledge-routes.ts:61,65,78` → service:28/56/64; Message child writers qua appointment action service; tenant guard/binding ở `prisma-client.ts:120,139`. Không suy mọi route hoặc global sweeps đều đã được chứng nhận.

## 5. Lock/scale và recoverability

B thêm **hai DB riêng**, dựng baseline từ0, không sửa/retry DB failure cũ:

- `drift_lock_failure`: giao dịch khác giữ RowExclusive trên Message; new migration không lấy được lock. Server báo đúng lock_timeout5s; thời gian CLI khoảng **6.070s** gồm startup CLI. Old ledger prefix exact, default60 và media FK absent giữ nguyên; failed entry không repair. Negative control này đo conflict cụ thể, không phải nâng cấp thành công. Lock xảy ra trước DML; check riêng này không có full data snapshot-before, khác ba bad-data controls có10-table snapshots.
- `drift_scale`: **50.002 Message** tổng hợp, existing tenant đều hợp lệ; upgrade CLI khoảng **1.208s**, count/distinct/tenant-null/content checksum trước/sau bằng nhau. Đây là local fixture trên tmpfs, **không phải target-volume backfill, production benchmark hoặc downtime/RTO cam kết**.

`lock-scale-summary.json`, raw lock/server/deploy logs giữ timing/exit. Migration giữ SHARE ROW EXCLUSIVE trên bốn bảng và ALTER có thể cần mạnh hơn. lock_timeout là mỗi lần lấy lock; statement_timeout là mỗi statement, **không phải deadline tổng cho cả rollout**. Cần target-sized workload/data/grants/maintenance plan riêng. Backfill tenant không được rollback về NULL; Git revert không khôi phục DB. Actual backup/restore và secure fallback chưa được chứng minh trong lượt này.

## 6. Regression/build mới B

| Kiểm | Kết quả |
|---|---|
| Targeted report/tenant/RLS/Message/media/channel/jobs/readiness/RC1/ghost/manual |**401/401**,43 files, gồm6 migration engine regression |
| Prisma validate/generate |exit0 |
| Backend TypeScript build |exit0; compile không phải business test |
| P2 |16/16; fixture Git riêng |
| Bash syntax / immutable range diff --check |exit0; không execute deploy.sh |

Không dùng số assertion làm quota/coverage %. Unit/mock/PGlite không được gọi toàn bộ là PG16 integration. Node host26.13.0, image22.23.4. Guard có chặn vài attempt localhost không port trong import/test harness; event log giữ nguyên, không real network/provider. Cảnh báo sharp fallback trên bytes hỏng là negative control đã expected, không bị giấu.

Frontend source không đổi, **không rerun frontend test suite**. Docker frontend stage cache-hit là rebuild packaging evidence, không phải frontend suite mới.

## 7. Exact A image, B rebuild và smoke

B smoke dùng **A final image**; tag rebuild B không thay A. B rebuild từ candidate clean, cùng Dockerfile/.dockerignore, `--pull=false`; exit0, khoảng0.85s, cache-backed. Không cold install/new pull claim; A offline FAIL còn nguyên.

Tag B tạm `zalo-crm-rc:reports-rc4-drift-7b-20261103-183151`, index `sha256:cf8a4ca30e27495ef3630bbe1650f62ac5a1fb8e64d24287321623622ebfb86e`. Platform manifest/config/layer descriptors **bằng A**. Index khác vì attestation manifests được đối chiếu thực:

- A attestation `sha256:9eacd0bc9c69b88144b5e5c847bde7162828983bd1cb4e0dc86245a3d2ea2f4b`.
- B attestation `sha256:9e276bd2e75da72b8bcc6865632761754012180a74979bf86c182f26555efbec`.

OCI export A/B kiểm index/manifest/config digest và diffIDs/descriptors; actual bytes của **16 compressed layers A** được SHA256-verify. B platform/config/layers bằng A, toàn payload hashes A/B bằng nhau. **1410 local source/compile/metadata hashes +210 static hashes** khớp rebuild; generated Prisma schema so riêng với local generated schema, input schema cũng khớp. App-owned1620 files, đúng13 operational scripts; không own helper/test/fixture/.env/artifacts/TikTok connector. Third-party node_modules files không bị đánh đồng với app payload; không dependency audit toàn diện.

App/client/inspector chỉ internal network, không app port; PG có thêm loopback bridge cho host checks. Session tổng hợp SQLNULL trước startup, nonnull0; JWT memory only, không provider key. NODE_ENV=test/MARKETING_DRY_RUN=true/OPIK_ENABLED=false, guard/RLS giữ nguyên. Image warnings do thiếu encryption-key config và fault injection được giữ, không biến thành production certification.

Mỗi pha native/fetch1→20→20→1,84 readiness requests; response<3000ms/abort4000ms giữ nguyên:

| Pha B | Readiness | Max response |
|---|---|---:|
| Healthy |84/84 HTTP200|75ms|
| Redis stopped |84/84 HTTP503|1019ms|
| Stopped numeric app IP |84/84 HTTP503|1033ms|
| Stop recovered |84/84 HTTP200|60ms|
| Redis paused |84/84 HTTP503|1530ms|
| Pause recovered |84/84 HTTP200|59ms|
| OS-hosts actual HTTP |84/84 HTTP200|68ms|

**588 ready HTTP requests mới B**, đúng expected status, không timeout. Liveness200; representative overview/sales/automation-summary/broadcast/ai X/Y200, foreign ID excluded, unauth401, X claim Y403, TikTokPOST404. Không gọi mọi report/field/worker workload PASS.

OS-hosts positive normal PG/Redis và dedicated readiness cùng healthy,82ms; PG query-host override98ms. Redis family4 positive38ms/family6 negative33ms trên IPv4-only alias; không phải IPv6 connectivity success. Native helper kiểm OS localhost order, literals, fallback và20 child abort/reap. PG probe fan-in numeric16ms/rejected46ms/paused1040ms/recovered59ms; settle rồi chỉ PipeWrap.

Inspector từng sample thêm40 callers/dependency share pending promise; queue/offline0, worker object giữ nguyên. CLIENTID3→4 sau stop/restart; close count tăng6 trong retry, giữ6 qua pause/recovery và CLIENTID4/PING/PONG phục hồi. Không thấy probe ngắt worker trong matrix này. Finite samples không chứng minh không leak vô hạn. B không rerun actual TLS/IPv6 network/Unix success hoặc pending-DNS blackhole của B trước; các proof cũ chỉ historical. Startup0 session khác với actual nonempty SDK reconnect helpers.

## 8. Claim A, lịch sử và finding

| Claim A | Kết luận B |
|---|---|
| Exact identity/patch/history |Xác nhận mới bằng Git/Docker/OCI/hash |
| Delta reconcile giữ dữ liệu/object chủ ý |Xác nhận bằng baseline RED, target catalog và fresh/upgrade/legacy |
| Bad tenant data fail closed |Xác nhận ba failure DB mới, data/ledger preserved; root PG diagnostics |
| App-role/business contracts |Xác nhận matrix mới; bổ sung actual media/knowledge service và selected races |
| Lock/runtime safety |Có timeout/atomicity local control và50k synthetic control; chưa đủ target-scale/RTO/restore |
| Exact image/readiness/reconnect compatibility |Xác nhận mới trong matrix đã ghi |
| Raw diff0/full suite/production READY |Không có căn cứ; A cũng không cấp các claim này |

Không có finding mới được chứng minh cần sửa source trong scope RC-4. Limitations là proof gaps hoặc gate vận hành, không tự biến thành runtime defect hay được miễn kiểm.

Không rerun full suite. Chỉ historical report/log comparison: RC3 **33 failed files/6 failed tests**; RC2final **35/8**,29 import/setup headings mỗi bên. Không lấy targeted PASS hoặc shared failures để gọi full suite xanh/harmless/miễn gate. Không tạo baseline giả hoặc sửa assertion.

## 9. Integrity, diagnostics và cleanup

Snapshot B ban đầu thực lưu **root1026/candidate1034** files; các input đó giữ nguyên hash và không added/removed trong cây đã phủ. Inventory cuối mở rộng **1185/1055**. B bổ sung đối chiếu A-after snapshots **1179/1049** (A manifest561 entries đã hash-verify): không changed/missing. Phần mở rộng là coverage inventory, không giả snapshot đầu đã phủ tất cả.

Diagnostic integrity cần giữ rõ: preflight recursive đầu timeout ở tool nhưng child read-only tiếp tục và lưu inventory trước khi DB/test bắt đầu, supersede inventory nhanh hơn. Final checker đầu so hai path sets khác nhau báo FAIL; `integrity-final-check.log` giữ nguyên. Checker sửa để so đúng initial covered set và bổ sung A-after provenance riêng, không tính lại trước-image hay nới content assertion. `integrity-final-corrected.log` đạt. Candidate clean và HEAD/tag giữ nguyên; root dirty có sẵn giữ nguyên.

Diagnostic khác: analyzer đầu chọn nhầm `smoke-console.log` qua glob nên JSONDecodeError (raw tool transcript); sửa chọn đúng bảy phase logs, không đổi smoke assertion. Initial preflight timeout và analyzer error không phải business FAIL; không giả chúng là clean first-run. Expected bad-data/lock failures và A offline/compile diagnostics còn nguyên.

Cleanup đã xác minh create-log ID khớp actual ID trước xóa đúng năm B containers, internal network và B rebuild tag. Hai OCI archives tạm xóa sau layer/digest receipts. Port64067 không listener. DB tmpfs failure/success chỉ bị hủy khi cleanup sau capture evidence; không repair ledger. Giữ candidate, mọi A tags/images/history và hai phiên khác `reports-1b-verify-20261101`, `sketchup-api-1`. Không prune.

## 10. Hai kết luận riêng và bước tiếp

**RC-4 remediation PASS local/disposable trên exact b9160f5 và image fdd5524.** Không cần sửa thêm source chỉ để làm PASS scope vừa kiểm.

**VPS NOT_READY/BLOCKED.** Actual deployed revision/schema/data/grants, secure fallback giữ E-1/O-1/no TikTok, backup/restore thật, staging/monitoring/soak, full-suite release disposition và production approval còn là gate riêng. Scale control ở đây không cấp maintenance window. Bước tiếp là mở phạm vi được phép để xác minh các gate đó; không tự deploy hoặc truy cập VPS trong lượt B này.
