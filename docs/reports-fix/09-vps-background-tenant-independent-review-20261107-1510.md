# B — kiểm caller nền sau observer production

07/11/2026, Asia/Saigon. **Lần1: FAIL source image a136**; lịch sử RED dưới đây giữ nguyên. **Lần2: PASS_FOR_RELEASE_SCOPE cho exact background images db447/e216 và image-only runner6c6d…**, chốt sau B actual DB/compile/cleanup khoảng15:33 (+07). Không sửa implementation/production hoặc tắt guard/RLS. Gate B09:49 chỉ áp image/runner đã bind ở mốc đó; gate mới và kết quả execution mới được ghi riêng bên dưới.

Artifact B: [reports-vps-background-tenant-b-20261107-1510](../../artifacts/reports-vps-background-tenant-b-20261107-1510/). Đã đọc log sanitized `artifacts/reports-vps-cutover-prep-20261107-093609/logs/tenant-errors-1506.stdout.log`:22matched lines gồm cả stack lines, không phải22sự kiện độc lập. Có operations Friend.findMany, SdkLimit.findMany và ZaloAccount.findUnique/[sdk-limit]. Log này chỉ có frame tenant-guard, chưa đủ quy causal Friend.findMany vào một caller cụ thể; root đang thu adjacent frames không PII.

## Source đối chiếu và authority

Source runtime cần dùng **compat-source** của image a136, không lấy root zalo-pool làm tương đương: root có thay đổi từ trước và khác candidate. Hash snapshot SDK/backfill/pool tại `old-inputs.json`; source copy riêng từ frozen nullfix context của B trước, không chỉnh source root/candidate.

1. `compat-source/backend/src/modules/zalo/sdk-limit-service.ts:55`: nick→org lookup không context; `:81` business limit read cũng không withTenant. `resolveOrgId` cache global theo nick5phút kể cả null sau lỗi; limit cache keyed org/nick/category nhưng không là authorization boundary. Service trả fallback khi guard lỗi nên mất giới hạn cấu hình và lặp warnings; warm cached org/limit có thể trả trần của Y cho caller X.
2. `presence-service.ts:145` trở đi enumerate connected accounts bằng runSystemQuery rồi iterate ngoài context; SDK calls qua `zalo-operations.ts:178–180` gọi limiter. Đây là đường background hợp lý cho SdkLimit warnings: cache có thể được làm nóng lúc connect, sau đó metadata/limit reads thoát tenant. Mock xác minh cơ chế, không chứng nhận causal stack production cụ thể khi chưa có adjacent frames.
3. `scoring/backfill-cron.ts:58` global Friend.findMany và `:135` count ngoài context; per-friend business callback đã withTenant. Timer khởi chạy sau60s (`:159–163`), phù hợp cần kiểm với Friend warning. Unit trực tiếp chứng minh background tick không chạy được dưới enforce.
4. `friend-sync-service.ts:146`, `:463` đã withTenant; không sửa nó chỉ vì có Friend.findMany ở216. `zalo-pool.ts:170–183` có mẫu authority hữu ích: context normal giữ nguyên org; no-context bootstrap chỉ ID→org, sau đó scoped reread trước work. `autoSyncOnConnect:486–505` còn raw lookup; chỉ mở patch thêm khi adjacent frames/chạy callback cho thấy cần thiết.

## Bounded fix đề xuất

SDK limit:

- Context normal là thẩm quyền: không đổi sang org từ global nick cache. Reread nick `{id,orgId:ctx.orgId}` trong tenant trước cache hit/business query; foreign/not-found không đọc hoặc trả cached Y limit.
- Chỉ no-context/internal discovery dùng runSystemQuery cho metadata ID→org; sau đó withTenant(org)+scoped reread nick và truy vấn sdkLimit trong org. Không bọc toàn limiter/business trong bypass.
- Cache phục vụ hiệu năng sau authority check, không thay authority. Lỗi DB không bị negative-cache5phút; các positive cache phải không cho normal caller nhảy tenant. Trần override→org default→code fallback giữ contract.

Backfill:

- System discovery chỉ lấy `{id,orgId}` và giữ global chunk100; hydrate contact/status/nick bên trong withTenant sau scoped reread eligibility.
- Normal tenant caller giữ scope của nó, không enumerate rồi withTenant tenant khác. Remaining count metadata phải tương ứng scope; giữ inFlight/finally/done/stop semantics.
- Conversation/message/scoring writes dưới normal tenant, không nâng bypass quanh toàn tick. Nếu friend bị xóa/chuyển giữa discovery và work, scoped reread phải skip.

## Mock RED độc lập

Chạy `python artifacts/reports-vps-background-tenant-b-20261107-1510/run-r2.py old-r2`: **6cases,2PASS/4FAIL**, Vitest exit1; wrapper exit0 vì đã ghi lại expected RED. Dependency image a136 pin; source/tests/config riêng read-only; networknone, synthetic DBURLloopback9, real AsyncLocalStorage, mocked DB/SDK/scoring/logger. Không PostgreSQL/provider/production execution.

FAIL:

1. Cold background phải đọc được configured limit11 trong derived tenant, hiện fallback.
2. Warm cache Y17 không được trả17 cho normal caller X, hiện trả17.
3. Transient identity failure trong scope X không được poison nick cache5phút, hiện không recover.
4. Background backfill phải metadata discover→scoped business processing, hiện global read bị guard.

PASS đối chứng: parallel X/Y giữ ALS qua await; normal X backfill không xử lý Y trên source cũ. Test dùng strict mock: business sdkLimit/conversation/message không được chạy bypass; discovery Friend bypass chỉ select id/org. Đây là controls authority/call boundary, không thay DB/RLS proof.

First attempt5FAIL có một case parallel nhiễu do shared transient flag; giữ `old.*` và preimage spec. B thêm beforeEach reset fixture flag và đặt transient failure trong normal ctx rồi chạy `old-r2.*`; không nới assertion sản phẩm hoặc sửa source để che lỗi. Own containers đã dọn exact label/ID, không image/volume prune.

Chờ root cung cấp frozen fix context/digests để B chạy cùng6cases GREEN, thêm missing/deleted/reparented/cached authority controls nếu implementation cần, rồi integration/caller-timer execution phù hợp. Lần observer tiếp theo phải đi qua mốc60s và cache expiry5phút; không dùng instant SPA hoặc provider-stubbed891 làm chứng nhận timer/SDK path thật. Không tự deploy hoặc phát hành gate mới trong mốc này.

## Lần2 — patch4module và kiểm độc lập mới

Root sửa đúng4module trong frozen context `artifacts/reports-vps-tenant-remediation-20261107-1511/source`, trên parent release source a136, không copy pool cũ từ root. Provenance SHA256 `62a45b89c6c999892d2874c177d62a14c801f428f9ddbfd33250358cbaac5246`; source files SDK7aa97ab2…, backfillf78b26ca…, stuck097b8c5d…, autoTag500457aa…. Không schema/guard/RLS/provider setting/algorithm/schedule changes.

- SDK: existing normal org authoritative, invalidnormal'*'/empty fail closed trước lookup. No-context/explicit system chỉ discover ID→org; scoped account reread trước mọi cache hit; không negative identity cache5phút. Limit queries normal tenant, actor giữ nguyên.
- Backfill: global inventory chỉid/org; business data scoped reread còn eligible; normalX fence, inFlight/chunk100/stop semantics giữ. First2module patch còn2invalid-wildcard FAIL trên B15case; root bổ sung guard, log fixed-r1 giữ13PASS/2FAIL.
- Quick scheduled-family review phát hiện daily stuck/auto-tag thiếu per-org boundary, root thêm wrappers và scoped/global minimal org inventory. Decay đã có withTenant, không sửa nó. Source old `stuck-detection.ts:35–121`, `auto-tag.ts:305–356` chứng minh lịch6am/7am sẽ thiếu context dù observer5phút chưa tới lịch.

### Unit/mock và compile

Same expanded21case spec trên a136 source: **7PASS/14FAIL** (`old-r4.*`); frozen4module fix: **21/21PASS** (`fixed-r2.*`). Thêm hai existing rate-limiter specs nguyên assertion: **26/26PASS** (`fixed-regression2.*`). Không unit biến thành DB proof. Positive/negative gồm cold/warmforeign/transient/parallel, cacheddeleted/reparented/staleownership, actor metadata, minimal inventory, removed friend, inFlight recovery, nonempty daily stuck mutation/auto-tag reads, normalX/directY vàinvalid'*'/empty.

Root copy exact final B21case spec thành `backend/tests/unit/background-tenant-context.test.ts`; B không tự ghi project test. A helper selection attempt `fixed-regression` chỉ chạy21 do selector chưa match được giữ; kết quả26 chỉ từ selected3files ở `fixed-regression2`.

B tsc all source independently exit0; **8/8 JS/maps** khớp actual primary/fallback payload. [Compile B](../../artifacts/reports-vps-background-tenant-b-20261107-1510/compile-v3-result.json). Hai image cuối:

| | Image ID |
|---|---|
| Primary | `sha256:db447e8bd766e32fac08c5e76f294643cb715a304561d906411a86056c5b075e` |
| Fallback | `sha256:e2161cb55f8ba52cd4d4bb2d6ba08e16d56c445fbcb98b142860c8734ee57a56` |

### Actual PostgreSQL/timer execution

B local Docker mới, PG16.15 image0cefaabd…, namespace network-none/no published ports/no production mounts, tmpfs1GiB. Fresh database0public tables/OID/system ID riêng trước ghi, canonical Git LF130migrations;103ENABLE/FORCE RLS,103no-context SELECTs0, actual app role `b_background_app` LOGIN NOSUPER/NOBYPASS/nonowner. [Target](../../artifacts/reports-vps-background-tenant-b-20261107-1510/v2-db-target.json), [RLS](../../artifacts/reports-vps-background-tenant-b-20261107-1510/v2-db-rls.json).

Mỗi image được seed lại2org fake, owner/user/nick/contact/friend/conversation/message/SDK limits/scoring config/status/threshold giả. Maintenance connection riêng chỉ tạo/xóa/chuyển quyền fixture để đối chứng cached ownership; actual service queries qua app-role Prisma với enforce/GUCtrue. Không prodDB/keys/env/SDK/provider call.

**Primary30/30 +fallback30/30 PASS**, mỗi image có:

- configured nickoverride13, orgdefault11 vàY17; warmforeignX→Y không trảY; deleted/reparented cache bắt scoped reread và background rederive từ stored ownership.
- background backfill2friend thật ghi timestamp, daily stuck2mutation và auto-tag2nonempty scopes/3junction writes; normalXAllOrgs giữX, directX→Y vàinvalidctx không mở scope; RLS foreign read0.
- `startBackfillCron()` thực ngoài tenant, đợi **62giây wall clock**: first timer60s xử lý cả2org; SDK limit cache60s hết hạn đọc giá trịDB mới14. Không fake Date, không ép state trong implementation, không provider stub cho4module data paths.
- Actual8payload file hashes khớp; log stdout/stderr **0tenant-guard/RLS/Transaction errors**. [Summary](../../artifacts/reports-vps-background-tenant-b-20261107-1510/v2-db-summary.json).

FirstDB attempt14positive rồi FAIL vì **harness kỳ vọng sai active+stuck cùng lúc**. Existing `auto-tag.ts:115–116` quy định active overrides stuck; root không sửa algorithm. B giữ logs/code cũ, fresh targetr2 vớiXinboundmới→active-only vàY20ngày→cold+stuck, thêm junctioncount3. Firstearlydisconnect gây pending priority transaction errors; không tính là production finding. R2 chạy đủ62s/drain và0errors. Các assertion đúng contract đều giữ, không chuyển image cũ thànhPASS.

Own DB/client/migration containers đã dọn exact name/ID/label,0remaining; compile và mock containers cũng đã dọn. Không image/volume prune. Local data hoàn toànfake, không production connection/mutation. Không chạy lại891 để đổi nhãn thành kết quả mới; core auth/reports/AI/null fix dùng immutable parent/hash chain và bằng chứng cũ đúng phạm vi. Full-suite debt vẫn theo báo cáo trước, không full-suitegreen hoặc mọi feature được chứng nhận.

### Runner tĩnh và gate mới

Đã đọc toàn `artifacts/reports-vps-tenant-remediation-20261107-1511/tools/hotfix-phase.py`, xác minh final SHA **6c6d9ea26cc956c52f61e8de98f9f9ac2692e201f847a9de062f9130aba509d7**. Chỉ reuse definitions prefix của runner cũ hash e0d123…, không thực thi phase cũ. Override own paths/phase/image/APP globals trước actions. Existing DB/schema130/RLS103/nonowner/enforce được kiểm, config/env/User/resources giữ nguyên; không DDL/role mutation.

Image-only replace cần Bgate mới đúng2digests, IfMatch dedicated Caddy maintenance, clean stop và backup mới. Smoke dùng real known routes/role credentials, yêu cầu startup≥70s và broad logscan từ StartedAt trước open, rescan tạiopen. Explicit secure fallback dùng e216, xử lý app đã chết, cùng env/role/RLS/schema, không quay a136 hoặc unsafe old image. Root còn phải theo dõi thực≥6phút sauopen để xác nhận real nicks/background không còn lỗi; B không chạy production phases.

**Verdict: PASS_FOR_RELEASE_SCOPE** cho exact4module image-only remediation và reviewed runner; không còn finding mở trong scope đã kiểm. Đây không chứng nhận production đã healthy/stable sau rollout, không đầy đủ mọi SDK/provider path. [Gate mới](../../artifacts/reports-vps-background-tenant-b-20261107-1510/independent-b-gate.json) bound newdigests/runner/provenance/Breport. Root copy exact bytes và vẫn phải thỏa runtime smoke/open/observer gates. Old gates/FAIL/diagnostic giữ nguyên, không có production write bởi B.
