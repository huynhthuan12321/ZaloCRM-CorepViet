# B độc lập — execution trên image live-compat và bản sửa null

07/11/2026, Asia/Saigon. Bắt đầu09:49 (+07), tiếp tục sau khi người dùng cho phép B chạy test disposable. **PASS_FOR_RELEASE_SCOPE** cho exact images, patch AI/null, rehearsal và runner được bind dưới đây. **Không full-suite PASS; chưa production cutover tại snapshot B.** Báo cáo tĩnh09:36 được giữ nguyên, không đổi thành execution.

Artifact riêng: [reports-vps-release-b-execution-20261107-094928](../../artifacts/reports-vps-release-b-execution-20261107-094928/). B không sửa runtime/test/ops/README dự án; chỉ tạo fixture/spec/helper/context/báo cáo riêng. Root thực hiện patch sản phẩm và đóng gói, B kiểm riêng. Không commit/push, không deploy, không production DB/traffic write. Không đọc .env hoặc khóa thật, không chuyển dump/row fingerprints/raw app logs về local.

## Identity được kiểm

Base candidate clean `297fe538eed7d62ab7f387f3b2e1a892433d2970`, runtime RC4 `b9160f5…`. Release là image derivative bất biến từ base, không giả có Git commit mới. Context ban đầu chỉ thêm3AI source và test policy hiện hữu; sau finding B thêm đúng guard bảo toàn nonplain objects ở Prisma và test mới.

| Bản cuối | Identity |
|---|---|
| Primary | `sha256:a136698ea86206675976596e52740272171ba8f77f5dc54dd20918b025798d68` |
| Fallback | `sha256:e0c1800ae823ac74bdea562fbfefe6019e116a7e04f611ff2e3bc6dd674c96cc` |
| Primary platform/config | `c0cd166c…` / `6ecac2f7…` |
| Fallback platform/config | `55a223e5…` / `70efcc75…` |
| Independent tsc | exit0, **8/8 JS/maps** bằng actual payload hai image; Prisma JS `3a3a751e6989e44012266b56aa9a3a55fe2a369f3ea362aaa20ebb7f6cd6d0c7` |
| Fresh backup |07/11,21091314bytes, SHA256 `f161301ba953263980c2340b85364028a2fc23fc362c7c133adc97fcfe4e87ab` |

[Compile B](../../artifacts/reports-vps-release-b-execution-20261107-094928/compile-v3-result.json), [actual compiled image controls](../../artifacts/reports-vps-release-b-execution-20261107-094928/compiled-v2-summary.json), provenance root `compat-provenance-v2.json` và OCI import50blobs được đối chiếu. B không kế thừa879 của image cũ cho image mới.

## Hai finding và cách xác minh

**Live AI compatibility:** bản primary/fallback ban đầu thiếu fullAuto đang dùng và timeout follow-up60s. Root giữ nguyên live behavior trong derivative: nguồn tài liệu vẫn bắt buộc, fullAuto chỉ true boolean mới bỏ guard giá/chốt; cả hai caller truyền cấu hình hiện tại; timeout60s. B kiểm10/10 compiled controls trên mỗi image cuối, kiểm đủ8payload hashes và tsc độc lập. Không gửi tin/gọi AI/provider.

**B-P2 — Prisma null sentinel bị biến thành object rỗng:** B phát hiện khi safety guard trước fallback thấy1synthetic session non-NULL sau cleanup. Trên app role thực, cả DbNull/JsonNull đều thành `{}`: **RED0/2**. Source `backend/src/shared/database/prisma-client.ts:41–59` trước sửa clone mọi object; active callers `backend/src/modules/zalo/zalo-pool.ts:623`, `:1114` ghi JsonNull. Đây là lỗi dữ liệu thật, không đổi expected để bỏ lỗi.

Root thêm guard Object.getPrototypeOf trước clone plain record; candidate source hash `d4185a3e…`→`0373bb60…`, giữ phần root khác source candidate. B source controls trên actual write-extension boundary: old3PASS/7FAIL→**GREEN10/10** (5test root mới +5control B). Bao phủ3write keys, DbNull/JsonNull/AnyNull identity, Decimal, Date/Buffer, NUL plain nested data và null-prototype dictionary.

Real PostgreSQL trên **mỗi final image:10/10 PASS**: app non-super/non-bypass; SQL NULL khác JSON null; AnyNull khớp cả hai và loại object thường; scalar/nested JSON/array vẫn lọc NUL; Date ghi đúng; DbNull cleanup thật SQLNULL. Thêm **3/3 mỗi image**: Bytes giữ byte0/255 trong AppSetting, plain string vẫn lọc NUL, foreign tenant không đọc fixture Bytes. Decimal được kiểm identity ở unit boundary; schema hiện tại không có Decimal field, không gọi đó là Decimal DB integration.

Evidence RED/GREEN giữ riêng: `logs/null-sentinel.stdout.log`, `null-red.vitest.json`, `null-green.vitest.json`, `logs/null-fixed.stdout.log`, `logs/buffer-fixed.stdout.log`. Các fixture nhạy cảm đều giả; raw SQL cleanup chỉ exact synthetic org/id trong DB B.

## Fresh PG16 và app-role execution

Namespace riêng0700 `/root/zalocrm-release-evidence/b-business-20261107-095700/`. Target `ffaa0a42769f97bcbfba902e1f8e178e6810ded76040542c6a16634c2ae67ffb`, name `zalocrm-b-business-20261107-095700`, database `b_business_rehearsal`, OID16385/system ID7705259167986352170. Exact ID/name/label/network-none/no published ports/tmpfs/OID/system khác production và0public tables được kiểm trước ghi.

Restore12.171s, **123/123 tables** khớp repeatable-read backup snapshot07/11 qua row count/sorted MD5 row controls. Canonical LF schema/migrations/RLS đã đối chiếu Git trước DDL. Upgrade129→130; **127/127 checks**,103ENABLE/FORCE/policies, app LOGIN nonowner/NOSUPER/NOBYPASS, selected cross-org/no-context DML đúng. **122business tables +129ledger rows cũ** giữ fingerprint trước sanitize. MD5 là comparison control, không chứng minh storage-byte/PITR.

Copy được sanitize trước boot: sessionNULL/disconnected/manual, provider/bridge/AI disabled, public plaintext key cleared, refresh tokens cleared. Không claim scrub mọi credential column hoặc original credential restore login. App/client/fresh Redis chỉ namespace network-none của PG B; rootfs/mount source read-only, tmpfs bounded, không production env/session/storage/network. API matrix test mode +cron stub; production SPA có thêm Worker stub. Không chứng nhận real jobs/provider/session/realtime từ mode này.

## Matrix cuối — execution B mới

| Lớp | Kết quả B |
|---|---|
| Primary→fallback→primary cuối | **297/297 mỗi pha;891/891**,0FAIL |
| Actual credential routes | Trong297: import qua HTTP, kiểm DB app-role giữ encrypted string, export khớp fake credential, reset session trước boot sau |
| Health |48assertions/12pause-recover controls; ready200/503 đúngdependency, live200 |
| Production SPA |5/5; HTML4route/API JSON404; không browser JS |
| Protected data |7tables messages/conversations/contacts/media_assets/knowledge_docs/knowledge_chunks/_prisma_migrations giữ qua switches và SPA |

297=293control đã source-review từ A +4control credential HTTP/storage bổ sung. B tạo target/fixture/oracle thực thi riêng, dùng lại helper đã audit và đổi exact names/IDs/labels/digests; không gọi oracle hoàn toàn được viết độc lập từ đầu. Main/shared, canonical canaries, snapshot/period VN, missing actor bucket, last-customer response60s, null/0/unavailable, current-role/grant revoke bằng cùng JWT, cross-org, saved/Excel đều được chạy lại. Tên endpoint200/foreign-ID check không chứng nhận mọi aggregate/field của mọi endpoint; không coverage%.

Mutation được quan sát ở activity_logs/permission_groups/refresh_tokens/users phù hợp login/audit và fixture revoke/restore. Không claim toànDB bất biến. Fingerprint inventories và raw logs ở private VPS; local chỉ receipt/assertions và aggregate error counts.

## Full suite và disposition

Full-suite dùng source/src/tests/config thật, dependency từ image pin (không host node_modules), identical synthetic env, network-none/read-only/tmpfs, DBURLloopback9 không có DB. Thêm đúng tracked promptfoo/docsSQL read-only vào cả hai context; không nới assertion hoặc thêm module giả để che lỗi.

| | Test files | Tests | PASS | FAIL | Pending |
|---|---:|---:|---:|---:|---:|
| Base nguyên297fe538 |169(40failed)|1156|1121|11|24|
| AI+nullfix cuối |170(40failed)|1164|1129|11|24|

**Full suite vẫn FAIL.** Không final-only failure name; thêm8PASS=3AI policy controls hiện hữu +5Prisma regression mới. Không lấy log RC3 33file/6test03/11 làm current result. [Comparison cuối](../../artifacts/reports-vps-release-b-execution-20261107-094928/nullfix-full-comparison.json).

Disposition cụ thể, không blanket “harmless vì baseline cũng fail”:

- 3broadcast assertions: global dry-run cố ý chặn simulated send; chọn2spec nguyên assertion/mock Zalo/DB/cron, network-none, dry-runfalse → **7/7 PASS**. Giữ11FAIL gốc.
- 4revive assertions: hai legacy test mocks chỉ export runSystemQuery, thiếu getTenantContext mà source hiện gọi; Vitest báo missing mock export trước nghiệp vụ. Không phải quan sát provider/runtime failure; test debt còn nguyên.
- 2branding: assertion HS Holding khác default Cờ Rếp Việt đang dùng; không crash. Không sửa brand runtime để làm test xanh.
- 2presence: old nested shape khác flat source contract; test dùng cùng ID/cache30s, chỉ clearMocks nên reject mock không được gọi. Không gọi đây là provider-error execution mới.
- 29setup/import files: legacy EE/automation/Facebook paths absent. Source optional loader `app.ts:127–147`, core registry noops; root kiểm actual live và cả hai image đều không có `_ee/index.js`, registry SHA giống nhau. Candidate không loại bỏ bundle đang chạy; không chứng nhận tính năng EE không tồn tại.
- 5DB fixture specs không thể chạy với no-DB full-suite config: B chạy riêng trên fresh EMPTY database đã zero-proof, canonical130, nguồn/image cuối: **23/23 PASS**; auth-flow/refresh-token/active-user/audit/AI capabilities. Fixture runner dùng maintenance role và guardoff để seed ngoài tenant; đây **không** app-role/RLS proof. App-role/JWT proof là matrix891 riêng. Original24pending không được đổi thành full-suite PASS; test ngoài5spec có skip riêng.

Các debt trên được đối chiếu source và đối chứng phù hợp; không có evidence regression mới do4source/8payload release cuối trong phạm vi đã kiểm. Không sửa/xóa failed project tests.

## Diagnostics được giữ

1. B v1 Node console.log rồi process.exit cắt JSON64KiB. Parse thất bại, không lấy partial count làm kết luận; v2 dùng synchronous stdout.
2. v2 bundle thiếu promptfoo/docsSQL là harness thiếu input; kết quả giữ. v3 thêm đúng tracked input vào cả hai; final comparison dựa v3/finalnullfix.
3. B compile memory2GiB gây V8 heapOOM; giữ log. Cùng source/tsc được chạy4GiB/heap3GiB, không đổi compiler/assertions;8hashes đúng.
4. First business run297PASS nhưng pre-fallback null safety guard FAIL dẫn đến finding thực0/2 và patch root; không che lỗi bằng SQL reset rồi gọi image cũ PASS.
5. r2 sau patch297PASS nhưng resume helper thiếu biến owned Redis gây NameError trước health. Giữ receipt, dừng exact owned app; r3 kiểm exact Redis ID/label/namespace và chạy lại đủ3pha.
6. Copied upgrade helper còn template limitation “backup03/11/selfcheck pendingB”; receipt restore SHA f161… và target/sysID chứng minh backup07/11/executorB. Có clarification riêng; không sửa log cũ để thay lịch sử.

## Production runner review và giới hạn

Đã đọc toàn runner root, review các hazard và kiểm lại bản cuối SHA256 **e0d123717f3fa4ad2456514cde418185ec43fd60343a0bce45e9c8c0deeeac84** tại `artifacts/reports-vps-cutover-prep-20261107-093609/tools/production-phase.py`:

- Real `/api/v1/analytics/team-performance`401 và POST `/api/v1/channel-accounts/tiktok`404, không dùng route sai/GET yếu.
- CLI dùng verified canonical LF bind read-only `/rehearsal` và explicit schema như rehearsal; không dựa image-default migration source.
- Dedicated Caddy route giữ matcher, nonempty IfMatch/ETag cho write; dừng old app trước backup/migration; giữ maintenance nếu fail.
- Schema129→130/hash checks, RLS+nonowner/SCRAM role atomic, no-context103table reads và122table preservation; actual runtime DB auth/role/guard/GUC smoke trước open.
- Fallback xử lý app đã chết không gọi stop304; giữ schema/RLS/role và secure fallback, không old image/down-migration/tắtRLS.
- Giữ old runtime User/resources/env/key continuity; scan stdout+stderr có actual `[tenant-guard]` forms; log unique không ghi đè.

Đây là review tĩnh runner, không execution production. Full provider/worker/live sessions, browser/mobile/PWA và mọi service/field không được nghiệm thu mới bởi lượt này. Backup/media/encrypted-env offsite gates do root kiểm riêng; B không đọc plaintext. Production smoke/traffic/monitoring phải do root thực hiện sau scoped gate; không đổi historical5B/6B thành test mới.

Collector cuối đã recount **891/891 HTTP,48/48 health,5/5 SPA** và7protected tables không đổi. Broad scanner gồm actual `[tenant-guard]`, TenantGuard, Missing tenant context, tenant_context_missing: **0guard errors/0startup fatal** trên cả3app phase và production-static. Bytes3/3 mỗi image và5security DB specs23/23 trên source/image cuối đều đạt. [Safe execution evidence](../../artifacts/reports-vps-release-b-execution-20261107-094928/logs/collect-b-v3.stdout.log).

Đã dọn44exact owned container IDs qua name/label/ID guards;0B-run container còn lại. Không image/volume prune. Postflight: production IDs/images/start/Git không đổi; ledger129/0unfinished/RLS0/app crmuser super-bypass vẫn trạng thái cũ. Đây là before-cutover metadata, không claim mọi live row bất biến. Raw data/fingerprints/logs giữ private, backup không đổi. Local test/compile/image-control containers cũng đã dọn theo các cleanup receipts.

End source identity: candidate clean297fe538,1037covered files vẫn khớp A. Root HEAD eb1be0b unchanged; trong1166covered inputs cũ chỉ prisma-client.ts đổi theo patch root đã review, không mất file. Test mới và derivative context được bind riêng bởi provenance/hash; không fake commit. B không sửa README chung/source.

**Disposition để tiếp tục:** không còn finding runtime/ops mở trong phạm vi4source/8payload và bounded release đã kiểm; P2null và compatibility AI đã có controls đóng. 11full-suite assertions/29legacy setup debt được phân loại ở trên, giữ FAIL và không cấp chứng nhận toàn bộ features. Technical verdict **PASS_FOR_RELEASE_SCOPE** cho root tiến hành runner SHA e0d123… theo từng gate, với primary a136…/fallback e0c…/backup f161…; production readiness thực tế vẫn phụ thuộc maintenance→upgrade→runtime smoke→open→monitor của root. Không tự chạy bất kỳ production phase nào ở B.

[Gate B](../../artifacts/reports-vps-release-b-execution-20261107-094928/independent-b-gate.json) được B tự tạo sau collector/cleanup, chỉ metadata/identity/scope/disposition. Root có thể copy **exact bytes** vào path runner yêu cầu; không được mở rộng nó thành full-suite green hoặc provider/browser/production execution proof. Mọi lệnh, số test, diagnostic và cleanup ở artifact; không xóa/nới assertion hoặc sửa log cũ.
