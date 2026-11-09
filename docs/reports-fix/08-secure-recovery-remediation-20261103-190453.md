# 7A — Secure fallback và backup/restore rehearsal local

Ngày03/11/2026, Asia/Saigon. **COMPLETED_PENDING_INDEPENDENT_VERIFICATION**
trong phạm vi local/disposable được mô tả dưới đây. **VPS NOT_READY/BLOCKED.**
Không có kết luận7B mới, deployment hoặc quyền production từ báo cáo này.

Artifact mới:
[reports-secure-recovery-7a-20261103-190453](../../artifacts/reports-secure-recovery-7a-20261103-190453/).
Điểm vào: [final receipt](../../artifacts/reports-secure-recovery-7a-20261103-190453/final-receipt.json),
[commands](../../artifacts/reports-secure-recovery-7a-20261103-190453/commands.md),
[prompt7B](../../artifacts/reports-secure-recovery-7a-20261103-190453/next-independent-verification-prompt.md).

## 1. Identity, phạm vi và skill

| Đối tượng | Identity đã kiểm |
| --- | --- |
| Root | `F:/ZaloCRM-CorepViet`; dirty có sẵn, không sửa source |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023` |
| Branch | `release/reports-20261103-1023` |
| Accepted runtime baseline | `b9160f5da0df36cfc6bad2755b200e8cdb86f980` |
| Accepted tag/object | `reports-rc4-drift-20261103-175649` / `aee908e42d91d26badd8e52cb5663b9473f97a54` |
| Commit mới, chỉ tài liệu | **`297fe538eed7d62ab7f387f3b2e1a892433d2970`** |
| Annotated tag mới / object | **`reports-secure-recovery-20261103-193629`** / **`861faa51646dc3cff270d302512e52831fd78301`** |
| Baseline→documentation patch SHA256 | `687df148c15cc5c367fc10cbc7f7e6f87cf675d875d651bb5567df12a2555a01` |
| Primary image | `zalo-crm-rc:reports-rc4-drift-20261103-175649-final` |
| Primary local index | `sha256:fdd5524c28eeae4bf01cc3c5f511889ba418272faeffb8e077f23e11c0c34eea` |
| Primary platform / config | `sha256:32dd4917e90770a8d35b7386d76c676aff7a450e6d06bcfd3e5923e695513ec8` / `sha256:4377e23a4e661295f97835ef429eff22fcca46780f4d9abc460af6f065a6b829` |
| Fallback runtime | `cf70b805eb88894fa2d68be1e44ac5c6bf73261c` |
| Fallback tag / object | `reports-rc4-followup-20261103-163013` / `227ae7af673f2fa129d53e618258034e5f060b44` |
| Fallback image / index | `zalo-crm-rc:reports-rc4-followup-20261103-163013-final` / `sha256:07f525e94a9607c748381d1129cbb9ba61e8328efc26a021b69df41f36eabb15` |

Candidate sạch ở đầu lượt. Chỉ thêm
`docs/runbooks/SECURE-RECOVERY-LOCAL.md:1`; explicit staging, review cached
diff/paths và diff --check trước commit. Không runtime/test/ops/dependency/
schema/migration thay đổi. Không rebuild hoặc tạo image tag mới vì patch chỉ
có tài liệu ngoài payload; image vẫn gắn runtime revision b9160f5, không tự
gán image cũ thành một build của documentation commit mới.

Đã đọc hướng dẫn người dùng, contract0, E-1/O-1, release7, drift A/B và source/
helper liên quan. Không có file AGENTS.md vật lý ở root/candidate/ancestor đã
kiểm; áp dụng AGENTS người dùng cung cấp. Không tạo agent. Git safe.directory
từng lệnh; không reset/stash/push/merge/deploy hoặc chạy deploy.sh.

Dùng `codex-security:propose-security-hardening`:
[portfolio](../../artifacts/reports-secure-recovery-7a-20261103-190453/hardening/hardening.md),
[JSON](../../artifacts/reports-secure-recovery-7a-20261103-190453/hardening/hardening.json),
context/hash và validation ở cùng thư mục. Kết luận **local_remediation_preferred**:
khoảng trống evidence/recovery boundary được xử lý tương xứng bằng local
controls; chưa có căn cứ mở dự án đổi kiến trúc tenant/recovery service.
Không tạo proposal/diagram cho structural opportunity không được chứng minh.

Dùng `codex-security:assess-patch-risk` trên immutable one-file patch:
[JSON](../../artifacts/reports-secure-recovery-7a-20261103-190453/patch-risk-assessment.json),
[Markdown](../../artifacts/reports-secure-recovery-7a-20261103-190453/patch-risk-assessment.md),
validator **exit0**. Recommendation/workflow **hold_for_evidence**, chờ7B.
Đây là advisory về patch, không cấp quyền merge/deploy. Không dùng verify-fix.
Artifact destination theo yêu cầu trực tiếp của user; không giả scan ID.

## 2. Fallback matrix và giới hạn compatibility

| Lựa chọn | Kết quả |
| --- | --- |
| Primary b9160f5 / fdd5524 | Exact-image business/SDK/auth/fault controls mới đạt |
| Followup cf70b805 /07f525e | Tương thích local với DB đã có130 migrations/RLS; giữ E-1/O-1, callback/readiness và TikTok404 trong coverage đã kiểm |
| Historical baseline-eb1be0b | Không chọn. Historical login500/RLS và TikTok401 thay404 còn nguyên; không rerun image này và không gọi historical là execution mới |
| Intermediate/RC3/RC4 cũ khác | Không chọn làm fallback final; giữ history, không tuyên bố compatibility mới |

**Fallback được kiểm là application-only, giữ nguyên upgraded schema130 và
ledger/RLS.** Không chạy migration từ image fallback, down migration, ledger
repair hoặc restore DB để giả application rollback.

Actual primary/fallback `dist`, `static`,13 scripts bằng nhau từng file/hash.
Khác input/generated Prisma schema và migration RC-4 mới; query relation mới
`KnowledgeDoc.org` không thuộc API Prisma client cũ. Helper compatibility dùng
writer/read shape thực sự có ở client cũ, kiểm `orgId/chunks` và physical FK
riêng. Không tuyên bố client cũ có relation field mới.

Vì runtime chung bằng nhau, fallback này có ích cho RC-4 client/schema/image
compatibility; **không chữa common-mode runtime defect**, không phải chứng
nhận fallback độc lập cho mọi sự cố. Actual target revision/config vẫn chưa
xác minh nên không cấp fallback production approval.

## 3. DB setup, backup coverage và roles/grants

Hai cluster PostgreSQL16.15 mới, tmpfs, không real-data mount:
`recovery-a7-pg-190453` và `recovery-a7-restored-190453`, loopback64173/64174.
App/client chỉ internal `recovery-a7-net-190453`; PG thêm bridge để host CLI
truy cập loopback. Resource IDs/labels và0 user tables được kiểm trước ghi.

Source DB mới dùng repo Prisma CLI/config và **migrate deploy130**, không
db push/dev/reset/resolve; tenant-rls.sql nguyên trạng áp transactionally.
Roles `recovery_owner` chỉ setup/migrate/fixture/dump/catalog;
`recovery_app` NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION,
sở hữu0 bảng. Không dùng owner/business bypass làm isolation proof.

Restore cluster chứng minh role app chưa có rồi tạo lại role attributes/
authentication test-only; không export pg_authid/password hash. Custom dump
giữ object ownership/ACL/default privileges; không dùng no-owner/no-acl rồi
bỏ qua grants. Thực chạy app-role sau restore chứng minh authentication và
object grants hoạt động.

Backup **không** chứa cluster roles, database-create properties/DB-level ACL,
tablespaces/config, external media bytes, real keys/secrets, Redis recovery
hoặc off-site durability. Fixtures không có custom database ACL/tablespace/
locale. Những inventory đó cần riêng cho actual target, không suy từ dump này.
Media storage/embedding/SDK đều là adapter tổng hợp, không provider thật.

## 4. Consistent snapshot và restore thật

### Relational dump

`synthetic-source.dump`: **570.946 bytes**,
SHA256 `f45e369310d618ad7f039dc5b569bfde39f3500ece53b53b0f99cfc741e788d6`.
PG16 pg_dump/pg_restore version/help thực tế được lưu. Backup CLI khoảng
**0.290s**; restore khoảng0.99s/target. Chỉ là local fixture duration.

Exported repeatable-read snapshot được giữ đến khi pg_dump và comparison
reader hoàn tất. Concurrent nonowner app role commit **120 conversation/
Message pairs** sau snapshot; dump/restore loại đúng120 pairs đó, live source
sau writer có đủ120. Không lấy live source sau writer làm oracle dump.
Exporter rollback/close và writer wait/close được quan sát thực.

Restore thật bằng `pg_restore --single-transaction --exit-on-error` vào
`recovery_restore`, `recovery_fallback` và target retry mới. Không replay
migration hoặc RLS sau restore để bù object mất.

So toàn bộ **123 public tables +1 synthetic identity fixture table**:
dữ liệu bao gồm ledger130/0 unfinished khớp; sequences khớp;1686 live columns
và order, defaults/NOT NULL, constraints/VALID, index definitions/order,
functions/owners/ACL, triggers, roles/memberships, schema/object/default ACL,
RLS ENABLE/FORCE và103 policies/6 noninternal triggers khớp logic.
SQL-only contacts_pool_robin_idx giữ definition, không drop để raw diff0.

Logical restore compact các khoảng attnum của cột đã bị drop: **35 ordinal
positions khác**, live-column order và mọi metadata khác giữ nguyên.
Absolute-catalog assertion đầu FAIL được giữ; corrected equivalence liệt kê
từng physical difference, không bỏ data/grants/constraint để làm PASS.
Post-restore app-role insert vào identity fixture cho id3, không collision.
Schema `recovery_fixture` là fixture riêng, không application migration/RLS proof.

### Authentication dump

Một dump đầy đủ **riêng** `synthetic-auth-ready.dump` tạo sau khi app-role
source chuẩn bị bcrypt credentials tổng hợp. Manifest/size/hash và timing ở
`auth-backup-manifest.json`. Restore sang `recovery_smoke` rồi so data/catalog/
sequences trước startup; **không sửa password sau restore** để login qua.
JWT/signing/refresh material không ghi vào artifact; synthetic bcrypt hashes
trong dump được phân biệt với real credentials không được phép đọc.

## 5. Failure controls và recovery

| Control mới A | Expected / actual |
| --- | --- |
| Missing dump | Bị từ chối trước target mutation |
| Truncated dump với manifest gốc | Length/SHA mismatch, bị từ chối |
| Sai target DB OID | Bị từ chối sau read-only identity proof |
| Target có dữ liệu | Bị từ chối; không DROP/reset để tiếp tục |
| Truncated archive với manifest riêng đúng bytes | Actual pg_restore exit1, transaction rollback để0 user tables; không ledger repair |
| Valid retry | Dùng target mới rỗng `recovery_retry`; data/catalog/sequence equivalent |

Giữ `restore-controls.json`, `restore-failure.json`, raw root error và failure
DB identity/empty-after snapshot. Failure DB chỉ bị hủy khi cleanup sau thu
evidence; không được sửa rồi gắn PASS. Không thử production rollback, PITR,
backup encryption/off-site restoration hoặc real media/key recovery.

Existing `scripts/ops/verify-restore.sh:104–108,195–197` dùng name-only cleanup
và checks count không đủ cho proof ở đây; không execute hoặc sửa script đó.
Runner local mới kiểm resource ID/label và empty target. Cần review/harden
legacy operational runner riêng trước khi dùng trong môi trường thật; báo cáo
này không gọi runner cũ đã an toàn.

## 6. Actual business và SDK sau restore

Các số dưới đây là **A executions mới**, không lấy JSON của B làm test mới.
Đọc helper trước copy; compiled-image adaptations/provenance được lưu.

| Coverage | Primary / fallback |
| --- | --- |
| Actual image Prisma/tenant, raw/default/sequence, async X/Y, missing/foreign/unknown, Message/conversation/media/knowledge, FK/set-null/cascade/privacy |37 /37 |
| Actual registerAsset create/dedup/update; storage in-memory |10 /10 |
| Actual knowledge ingest/list/delete/chunkText; embedding stub |17 /17 |
| Actual appointment action recipient/notification/Message/conversation children, SDK adapter |15 /15 |
| Reconnect/profile/status/log/UID/manual/ghost/archived/dynamic followups |69 /69 |
| Extra callbacks ngoài ALS, NULL/passive/manual/other, foreign ID, stale epoch, pending/overlap/account-org |39 /39 |
| Tổng assertion có pass flag trên mỗi image |**187 /187**, không dùng làm quota |

SDK ownId nonempty; observed business callback writes không bypass.
Identity-only bootstrap và login timestamp side effects không được tính làm
proof business isolation. Không chứng nhận repository-wide isolation, mọi
global sweep hoặc real provider/MinIO/embedding/HTTP media route.

SDK helpers dùng bản restore riêng cho mỗi image. Trước reset đã so với
backup; sau đó owner chỉ xóa named synthetic `dr-X/dr-Y` trong SDK copy để
broad sweeps có đúng fixture b7-X/Y. Không tắt trigger/FK/RLS/guard. Main
relational/HTTP restored DB không bị reset như vậy.

## 7. Exact-image HTTP, faults và application switch

Actual restored credential login/profile trên primary-before → fallback →
primary-after: **22 assertions/phase,66 tổng**. Cùng access token sau downgrade
role bị Automation/Broadcast403; inactive bị report403; fixture role/active
được trả lại bằng tenant-bound update. Không ghi token/refresh vào logs.

Mỗi phase readiness chạy native/fetch1→20→20→1,84 requests:

| Pha | Primary-before max ms | Fallback max ms | Expected |
| --- | ---: | ---: | --- |
| Healthy |75|68|200|
| Redis stopped |1037|1030|503|
| Stop recovered |63|84|200|
| Redis paused |1528|1524|503|
| Pause recovered |58|66|200|
| PG paused |1056|1057|503|
| PG recovered |63|63|200|
| OS-hosts actual HTTP |65|66|200|
| PG rejected actual HTTP |61|67|503|
| Numeric app IP |71|70|200|

Primary-after healthy84 requests max73ms. Tổng **1764 readiness requests**,
max**1528ms**, đúng status và không timeout. Dependency1500ms/HTTP2000ms/
response<3000ms/abort4000ms giữ nguyên.

OS-hosts có normal PG SELECT1/Redis PING và dedicated probes healthy;
query-host URL override cũng đạt. Family4 positive/family6 negative trên
IPv4-only alias và native localhost/literal/fallback/20 child abort/reap kiểm
mới trên cả hai image. Không coi đó là real IPv6 success.

Inspector40 caller/dependency share work, queue/offline0 trong samples.
Primary CLIENTID3→4 sau stop, fallback91→4; close count tăng0→3 khi stop/retry
rồi giữ3 qua pause/recovery/PG faults. Worker object giữ nguyên và PING phục
hồi. Fault samples còn thấy worker retry DNS/process/timer activity; finite
samples không chứng minh không leak vô hạn. Không chứng nhận mọi worker job.

Rejected-PG HTTP phase không lấy inspector samples từ normal DB; dedicated
rejected-URL probe kiểm riêng. Liveness200, response/Messenger contract,
representative X/Y reports, unauth401/cross-org403/TikTok404 giữ. Logs startup
và fault warnings nguyên vẹn. Startup0 session không phải SDK reconnect proof.

Sau mỗi switch: ledger/catalog giữ nguyên và original Message/conversation/
media/knowledge/chunks data exact. Full snapshots còn ghi các mutation hợp lệ
của auth/audit/scoring/startup; không tuyên bố toàn bộ DB bất biến khi login.

## 8. Image binding, regression và các check không chạy

Actual image Node22.23.4,13 operational scripts, không app-owned helpers/
tests/fixtures/.env/artifacts/TikTok connector trong scanned payload. Không
đánh đồng third-party dependency files với app-owned files.

New1619 actual payload hashes primary khớp historical independent clean Linux
image receipt; actual RootFS diffIDs khớp platform manifest đã xác minh. Các
primary/fallback runtime payload hashes bằng nhau như mục2. Primary input/
generated Prisma schema so riêng, generated hash
`c5c7384b754bb30cc97962cf5469533760a7e1358f6b6af9f1983158b2ab7167`;
fallback generated
`d6e321416102b3abc176745070dfd032b0829e0a9938fc5341dfe18b94d895df`.

**Không rebuild/cold install/new pull/new registry RepoDigest trong lượt này.**
Compressed-layer byte checks và independent clean-context rebuild là
historical B evidence, không gọi là A build mới.

Diagnostic mới: so với current host build outputs có1538 exact matches,
**80 static asset paths không có ở host và static/index.html khác**. Giữ
`extras-error.log` và `local-image-content-binding.json` FAIL. Không sửa
frontend hoặc build lại để xóa diagnostic. `source-binding-final.json` dùng
actual hashes khớp accepted independent Linux image, source-input integrity,
actual image identity/RootFS và historical clean-build provenance; không
tuyên bố host frontend/dist byte-identical.

New targeted regression **141/141,8 files**: tenant context/guard/inventory,
auth continuation, health/probe-host, drift migration và manual disconnect.
Prisma validate exit0. Các số là execution result, không coverage percentage.
Backend source/schema/build inputs không đổi nên không generate/build mới;
compile không phải business test. Không đổi ops nên không rerun P2/bash suite.
Git staged/final diff --check exit0.

Frontend source không đổi, **không rerun frontend suite**. Không rerun full
suite. Chỉ historical-log comparison: RC3 **33 failed files/6 failed tests**,
RC2final **35/8**,29 import/setup headings mỗi bên. Shared failures không tự
harmless hoặc được miễn release gate.

## 9. Diagnostics, integrity và cleanup

Giữ các attempt/log gốc:

- Tool timeout lúc setup; read-only/help steps xong, Python stdout lỗi sau
  tool timeout. Kiểm process/state trước resume, không tạo duplicate resource.
- Initial host migrate P1001 khi PG chỉ internal network; DB vẫn0 bảng.
  Thêm bridge với loopback publish, rồi migrate deploy thành công. Không đổi
  source, timeout, DB ledger hoặc quyền để né lỗi.
- Absolute catalog mismatch do35 physical ordinal gaps; raw snapshots giữ
  nguyên, logical comparator vẫn kiểm live order và mọi thuộc tính khác.
- Resume control đầu TypeError vì pg OID JSON là string; sửa phép tính
  expected wrong-OID trong helper, không thay guard/DB assertion.
- Host-generated static mismatch như mục8; raw FAIL không bị ghi đè thành PASS.

Root/candidate input snapshots đầu phủ1263/1133 files, gồm source/tests/
Prisma/ops/Docker/frontend-public/build inputs, loại secrets/ignored generated
trees và report/artifact output. So exact covered inputs cuối, explicit
candidate doc diff và Git status được ghi trong `integrity-final.json`.
Historical A/B artifact inventory1124 files được hash và đối chiếu cuối;
không sửa history. Thời điểm artifact-history snapshot tách khỏi initial
source-input snapshot, không giả cả hai được lấy cùng lúc.

Cleanup theo `resources.json` và actual IDs/labels, không prune. Giữ synthetic
dumps/manifests/raw logs cho7B; xóa đúng container/network A, gồm PG tmpfs.
Giữ candidate mới sạch, mọi old tags/images/evidence và tài nguyên phiên khác.
Chi tiết thực tế ở `cleanup-receipt.json`; không để cleanup instruction thay
cho receipt.

Chốt cleanup: **13 containers,1 internal network và1 anonymous Redis /data
volume** đã xóa. Anonymous volume được xác định bằng Docker mount/unmount
events gắn exact Redis container ID, kiểm không container nào còn dùng rồi mới
xóa; không suy ownership chỉ từ timestamp hoặc prune dangling volumes.
Loopback64173/64174 không listener. Hai container phiên khác giữ nguyên
running. Chốt integrity: **root1263/1263, candidate1133/1133** covered inputs
giữ nguyên, **1124/1124** historical artifact hashes khớp. Candidate sạch,
root HEAD/dirty lines cũ giữ nguyên, chỉ thêm report root này.

## 10. Kết luận và bàn giao

**Secure fallback RC-4 compatibility + local backup/restore:
COMPLETED_PENDING_INDEPENDENT_VERIFICATION.** Không có B PASS mới. Runbook mới
và exact existing images là bàn giao cụ thể; final receipt ghi rõ documentation
commit khác runtime image commit.

**VPS NOT_READY/BLOCKED.** Còn actual deployed revision/schema/data/grants,
real DB/media/key backup/restore, approved RTO/RPO và maintenance budget,
legacy runner hardening/review, full-suite release disposition, staging/
monitoring/soak và production approval. Không tự truy cập VPS hoặc deploy.
