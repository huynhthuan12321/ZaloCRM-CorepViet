# RC4 remediation — lượt 7A tiếp theo

Ngày 03/11/2026, Asia/Saigon. **COMPLETED_PENDING_INDEPENDENT_VERIFICATION** cho hai finding B7-RC3-01/B7-RC3-02 trong phạm vi local/disposable đã kiểm. Đây là tự kiểm A, **không phải B PASS**.

**Phát hành VPS: NOT_READY / BLOCKED.** Không deploy, push/merge, truy cập staging/production, gọi provider thật, gửi tin hoặc AI trả phí. Finding lịch sử **RC-4 migration/schema drift** chưa xử lý; tên candidate RC4 không có nghĩa finding đó đã được sửa. Secure fallback giữ E-1/O-1 và không phục hồi TikTok, backup/restore, deployed revision, staging/monitoring/soak và production approval vẫn là gate riêng.

Artifact: [reports-rc4-remediation-20261103-143825](../../artifacts/reports-rc4-remediation-20261103-143825/). [Commands](../../artifacts/reports-rc4-remediation-20261103-143825/commands.md). [Prompt B tiếp theo](../../artifacts/reports-rc4-remediation-20261103-143825/next-independent-verification-prompt.md).

## 1. Handoff bất biến — dùng bản final này cho B

| Định danh | Giá trị đã kiểm |
|---|---|
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023` |
| Branch | `release/reports-20261103-1023` |
| Baseline RC3 | `97c8640a892449c753443c66b9f5c8c81c329709`, annotated `reports-rc3-20261103` |
| Final commit | **`41d5c1e64ada75abbad969554de8a72287a883ee`** |
| Final annotated tag | **`reports-rc4-20261103-143825`** |
| Final tag object | `7b55d65b42662eaf69429cb0a98ae50f7c8f836f` |
| Final image | **`zalo-crm-rc:reports-rc4-20261103-143825-final`** |
| Docker local .Id / index digest | `sha256:1b42f0d128cde3695c99976c7b141168a4cc605f82ebb26a31f124feb14d041a` |
| RepoDigests local | `zalo-crm-rc@sha256:1b42f0d128cde3695c99976c7b141168a4cc605f82ebb26a31f124feb14d041a`; không chứng minh registry publication |
| Platform manifest | `sha256:3895dd8c0b355c7c0e85dcf55acb8eaf64b951c9457a65e4cd119f249c9e7a51` |
| Image config digest | `sha256:6d3cecc9f34c086b3f361531090e980dde61592c939da1e2f8aac4ae1878947c` |
| RC3..final diff SHA256 | `8251c944fe1375a3241fbabb3b8c487fb52d3e2fe4eeb68ae5ee98737927a8e8` — `remediation-final.patch` |

Có hai commit trong lượt này: `bbcd005bd4dc612d168a3792b27a65d89a4f6694` sửa chính; `41d5c1e...` thêm explicit org predicate và regression cho duplicate-owner lookup. Tag đầu `reports-rc4-20261103` / object `000ba69778d9528a8433e06ed00b679ed5c7263f` và image đầu `reports-rc4-20261103-143825` / digest `27574756...` được giữ nguyên như lịch sử. **Không dùng tag đầu thay cho final.** Không tag nào bị di chuyển.

Repository gốc vẫn HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, branch `fix/reports-kpi-3b`, dirty có sẵn; source không bị sửa. Candidate sạch trước patch, sau mỗi commit và khi build final. Safe.directory dùng theo lệnh, không đổi global Git config. Đọc AGENTS được cung cấp, contract/E-1/O-1/release, báo cáo và helper B; dùng skill `codex-security:fix-finding`. Không tạo agent; hai lượt rà boundary/compatibility và bypass/regression được thực hiện tự kiểm, không gọi là độc lập.

## 2. B7-RC3-01: nguyên nhân và sửa readiness

**Trước sửa, tái hiện mới trên image RC3:** PG16/Redis disposable, internal network, không session/provider key. Native HTTP theo thứ tự **1 → 20 → 20 → 1**: **8/42 request FAIL**, max 4002 ms, giữ ngưỡng response <3000 ms và abort 4000 ms. Một lần fetch numeric sau khi pool đã warm không tái hiện; giữ riêng, không dùng để bác bỏ native FAIL.

Instrumentation chỉ mount từ artifact, không commit runtime: `buildReadyHealth` chờ DB **3401–4998 ms** rồi mới bắt đầu Redis. DNS Redis qua getaddrinfo còn pending nhiều giây, có mẫu **6–10 giây** trước EAI_AGAIN. Như vậy timeout chỉ quanh Redis không thể bảo đảm deadline HTTP. Log cho thấy tương tác DB/pool/DNS, không khẳng định đã đo hết mọi cơ chế nội bộ của libuv.

**Thay đổi:**

- `shared/http/health.ts`: bắt đầu hai dependency song song; deadline response fallback 2000 ms, giữ response shape/liveness/Messenger semantics.
- `shared/database/readiness.ts`: một probe PG disposable/single-flight, tách khỏi pool Prisma nghiệp vụ; deadline 1500 ms, timeout connect/query, destroy socket và end client. Chỉ `SELECT 1`, không query nghiệp vụ hoặc privilege mới.
- `shared/http/probe-host.ts`: cancellable c-ares resolver, timeout/tries có hạn, cancel outstanding DNS; không tạo thêm getaddrinfo work trong libuv pool. Hỗ trợ hostname DNS và literal IPv4/IPv6, localhost; không cache địa chỉ.
- `shared/queue/redis-connection.ts`: disposable single-flight Redis probe, offline queue tắt/retry tắt; deadline 1500 ms, `disconnectTimeout:0`, cleanup cả resolver/connection. Không dùng worker connection để probe.
- `app.ts`: readiness dùng PG probe mới; `/health/live` và `/health` legacy không đổi.

Giữ URL auth/database và TLS policy/verification hostname ở PG; chỉ transport TCP dùng địa chỉ đã resolve. Redis giữ TLS servername ban đầu khi URL dùng rediss. Không mở/in URL chứa credential trong diagnostic.

**Tradeoff/phạm vi:** readiness DB nay đo khả năng kết nối/query DB bằng một connection riêng, không đo trực tiếp độ sẵn sàng của mọi queue trong pool Prisma. Single-flight giới hạn một connection/probe cho mỗi dependency trong tiến trình. Test helper timeout không được dùng thay cho cleanup; runtime probes có cleanup riêng. Chưa kiểm TLS server thật, Unix socket, hosts-file-only aliases hoặc mạng IPv6 thật; không tuyên bố đã chứng minh mọi biến thể cấu hình ngoài môi trường đã exercise.

## 3. B7-RC3-02: tenant xuyên reconnect/callee

Bằng chứng trước sửa: pool RC3 xuất từ Git vào artifact, SDK stub, Prisma/ALS thật; các profile/status writes chạy `org='*', bypass=true`. Không dùng write bypass làm bằng chứng tenant isolation.

**Boundary mới trong `modules/zalo/zalo-pool.ts`:**

- Giữ public signatures; `withAccountTenant` tôn trọng tenant hiện có. Caller org X không được đổi sang org Y theo account ID. Tenant '*' không explicit bypass fail closed.
- Internal background caller thiếu context chỉ được lookup **account ID → org ID**, sau đó vào `withTenant` không bypass và reread account với ID+org trước SDK/business work. Không mở quyền enumerate business data mới.
- LoginQR/reconnect/status update/auto-reconnect/event emit dùng private tenant-bound implementations. Profile/status/credential writes có org predicate; callback SDK được bind lại về org đã xác minh, không phụ thuộc EventEmitter giữ ALS.
- Status transition bỏ system bypass, kiểm org conflict, xác minh account cùng org trong transaction và áp org predicate cho open-record lookup/update.
- Dọn ghost dùng `updateManyAndReturn` có org/owner/status predicate, chỉ disconnect các instance tương ứng IDs thực sự được update. Không quét mọi instance qr_pending của các org khác.
- Duplicate-owner lookup có **org predicate tường minh**, ngoài RLS; missing context bị từ chối. Regression dùng fixture không tự lọc RLS để chứng minh foreign UID không trả về danh tính tenant khác.

**UID compatibility:** global unique constraint giữ nguyên. Không nhả UID archived thuộc org khác; duplicate trả thông báo chung, không lộ ID/tên owner foreign. UID archived cùng org vẫn reclaim được, UID active cùng org không bị cướp. Test thực DB phát hiện Prisma7 có thể không cung cấp `meta.target`; sửa nhận diện trường hợp này để không nuốt duplicate rồi tiếp tục attach listener. Không đổi schema/constraint.

**Đã kiểm bằng nonempty SDK stub + app role thật:** X/Y, concurrent context, internal identity bootstrap, foreign/missing account, manual/ghost/archived guard, SDK rejection→qr_pending, UID mismatch không đổi identity, duplicate cùng/khác org, callback ngoài ALS, status-log conflict và ghost memory cleanup. **69 assertion đạt**, business bypass observed = `[]`. Source/runtime thật cho các sink; các provider/follow-up adapter được stub, không gọi provider.

Boot reconnect vẫn được await tuần tự sau HTTP listen. Không thêm timeout SDK hoặc đổi chính sách một org lỗi ảnh hưởng org sau; rủi ro pending SDK/sweep propagation vẫn như phạm vi B đã nêu. Không coi startup scan 0 session là bằng chứng SDK reconnect đạt. Global stale-ghost cleanup và các background sweeps ngoài đường reconnect được review khi truy caller nhưng không redesign trong lượt này.

## 4. Check mới của A — phân biệt lịch sử và test type

| Check final | Kết quả | Giới hạn |
|---|---:|---|
| Targeted report/tenant/job/health/RC-1 + nearest ghost/manual | **358/358**, 38 file | Node local26.13.0, network guard; unit/mock/PGlite và boundary checks, không gọi tất cả là DB16 test |
| DB job helper | **51 assertion** | actual query/update/callback, cron/provider scheduling stub |
| Action child helper | **15 assertion** | recipient/notification/Message/conversation writes thật, SDK/Redis anti-spam stub |
| Reconnect extended helper | **69 assertion** | actual app-role DB/profile/status/log/query; SDK/follow-up adapters stub |
| P2 | **16/16** | disposable Git fixtures; không deploy.sh |
| Backend build | exit0 | TypeScript compile, không phải test nghiệp vụ |
| Bash syntax / diff --check | exit0 | chỉ bash -n deploy.sh/gate; không chạy deploy |
| Image final build / clean gate | exit0 | source committed sạch; không cold dependency install |

Không cộng các assertion chồng lắp thành tỷ lệ coverage. Targeted đầu 357/357; final thêm một case duplicate-owner nên 358/358. P2/ops không đổi qua bổ sung cuối, không ghi đã chạy lặp lại P2 sau đó. Frontend không đổi, không rerun toàn bộ frontend suite; frontend build stage cache được reuse.

Các diagnostic được giữ: port55703 thuộc Windows excluded range nên chuyển55683; DB51 đầu gặp startup-created status logs nên reset **fixture giả** và rerun nguyên assertion; SDK stub đầu trả undefined ownId được sửa output control; missing Prisma7 target dẫn tới runtime fix; owner-filter test FAIL khi source chưa được ghi do proxy PowerShell không nhận NoNewline, sau đó ghi bằng Node và giữ nguyên assertion. Audit final từng có ENOENT do thay nhầm đường dẫn baseline hash; sửa đúng đường dẫn đọc B, không thay file B. Không sửa FAIL lịch sử thành PASS.

**Full suite:** không rerun trong lượt này; lịch sử A/B RC3 vẫn **FAIL** (RC3 33 failed files/6 failed tests; final baseline RC2 35/8, có 29 import/setup failure headings mỗi bên). Không suy shared failure harmless hoặc miễn gate. Targeted/boundary mới đủ cho phạm vi tự kiểm hai finding nhưng không chứng nhận mọi unrun suite hay production workflow.

## 5. PostgreSQL16/RLS

Hai lần rehearsal local đều container mới: PostgreSQL **16.15**, DBb7, empty public schema được xác nhận trước ghi; tmpfs, không real-data mount. Loopback cuối55683. Owner chỉ migrate/RLS/role/fixture setup; assertion isolation bằng `b7_app` **NOSUPERUSER/NOBYPASSRLS, sở hữu0 bảng**, guard enforce/RLS binding true.

`migrate deploy`, không db push. Áp tenant-rls.sql nguyên trạng với transaction/ON_ERROR_STOP. Catalog final: **129 migration,0 unfinished/rolled-back;123 bảng;4 noninternal trigger;103 policy;102/102 bảng org_id ENABLE+FORCE RLS**. Không xóa ledger/tắt constraint. Các reset/clear chỉ trên fixture tổng hợp của lượt này, không thay schema để hợp thức hóa test. Không xử lý drift lịch sử.

Missing tenant, foreign read/update/insert và async/concurrency được kiểm; action child writes có trigger Message và relation thật. Các credential/session fixture là giả; trước smoke owner setup đưa session_data về SQL NULL để app không có session dùng được. Không đọc session thật.

## 6. Image/source binding và smoke final

Image final build từ clean candidate commit41d5c1e, Dockerfile/ops nguyên trạng, --pull=false; không pull image mới. Cached npm/dependency/frontend stages, backend generate/build được chạy cho source mới. Không coi đây là cold install hay chứng minh build reproducible.

Node **v22.23.4**. App-owned inventory **1619 file**; hash inventory dist/scripts/Prisma/static **1617 file**. **1407/1407** nonstatic payload hashes khớp output/source candidate, **210/210 static hashes** khớp RC3 có source binding đã kiểm; không dựa riêng label/hash image. Đúng **13 operational scripts**, không app-owned helper/tests/spec/fixtures/.env/artifacts/TikTok connector. Third-party node_modules internal tests/fixtures không bị đánh đồng với app payload và không có audit dependency toàn diện mới.

App/client/inspector chỉ trên Docker internal network, không publish app port. Riêng PG có bridge bổ sung để host loopback Prisma; app không có bridge/Internet. Dùng NODE_ENV=test/MARKETING_DRY_RUN=true/OPIK_ENABLED=false và guard/RLS có sẵn, không thêm runtime test mode. JWT sinh trong bộ nhớ, không ghi artifact. Không session/provider key trong smoke.

Mỗi pha chạy **84 request readiness**: fetch1→20→20→1 và native1→20→20→1, giữ response<3000ms/client abort4000ms; timeout là FAIL.

| Pha final | Status readiness | Max elapsed | Assertion/control |
|---|---:|---:|---:|
| healthy | 84/84 HTTP200 | 38ms | 108/108 |
| Redis stopped, hostname app | 84/84 HTTP503 | 35ms | 85/85 |
| stopped, numeric IP app | 84/84 HTTP503 | 47ms | 85/85 |
| stop recovered | 84/84 HTTP200 | 20ms | 85/85 |
| Redis paused | 84/84 HTTP503 | 1515ms | 85/85 |
| pause recovered | 84/84 HTTP200 | 41ms | 85/85 |

Tổng **533 assertion/control**, gồm 10 foreign-ID exclusion checks; không gọi là533 HTTP request. Live200 các pha;10 report requests X/Y200; unauth401; user X claim org Y403 đúng report-gate deny; TikTok POST404. Không tuyên bố representative routes chứng minh mọi field/route không leak.

24 inspector samples, mỗi sample40 caller/dependency: DB và Redis đều single-flight, tất cả settle; pause max probe1503ms. Worker queue/offline0, PING/PONG sau recovery; worker CLIENTID **4 trước và sau pause**, close count vẫn1 (lần close do Redis stop). Probe không ngắt worker. Resource snapshots/cleanup unit tests không thấy tăng đơn điệu trong finite sample; không coi finite test là bằng chứng mọi môi trường không leak vô hạn. Không chạy BullMQ workload/provider thật.

Startup/job log không còn tenant-guard errors RC-2 trong phần exercise; reconnect startup0 saved session và backfill6 fixture accounts được ghi riêng với nonempty SDK-stub regression69.

## 7. Integrity, cleanup và bước tiếp

Root **996/996 tracked inputs không đổi**, broader historical source trees **985/985 khớp** (ghi rõ là đối chiếu snapshot lịch sử). Candidate1019→1022 tracked inputs: đúng7 file thay đổi+3 file mới trong10-path scope; không xóa file. Prisma/schema/migration/dependency/ops/frontend không đổi. Root HEAD/branch giữ nguyên; candidate final sạch, tag/image RC3 giữ nguyên. Source binding/integrity final ở `integrity-final.json`, `image-binding-final.json`.

Đã cleanup đúng app/probe/Redis/PG containers và network r4 của cả hai lần chạy; loopback55683 không listener. Không prune cache, không đụng `reports-1b-verify-20261101` hoặc `sketchup-api-1`. Giữ final candidate/tag/image, tag/image RC4 đầu và toàn bộ lịch sử RC3/A/B.

Bước tiếp là **7B kiểm độc lập exact final commit/tag/image** theo prompt đính kèm, tự xác định assertion/coverage, đọc helper trước chạy. A không tự cấp B PASS và không chuyển sang sửa drift/secure fallback hoặc deploy.
