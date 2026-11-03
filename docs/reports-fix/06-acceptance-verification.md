# Kiểm tra độc lập 6B — Nghiệm thu tích hợp Báo cáo

<a id="recheck-e1o1-20261102-2052"></a>

## Tái kiểm độc lập sau E-1/O-1 — 02/11/2026, 20:52–22:16 (+07): **PASS local cho module Báo cáo**

**5B và6B PASS local trên patch hiện tại. E-1/O-1 đạt kiểm tra độc lập trong DB disposable.** Không phát hiện lỗi runtime mới chặn phạm vi báo cáo được kiểm. Full backend suite chưa chạy mới trên patch E-1/O-1; vẫn giữ FAIL lịch sử, không xác nhận toàn hệ thống xanh hoặc release READY. **7A/7B NOT_STARTED.** Không sửa implementation, assertion dự án, commit/push/deploy hoặc apply RLS ngoài disposable.

### Snapshot working tree và môi trường

HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, không có commit mới. Phạm vi kiểm là working tree dirty, không phải chỉ HEAD. Artifact riêng [reports-5b6b-e1o1-20261102-205238](../../artifacts/reports-5b6b-e1o1-20261102-205238/). `source-before.json`, `source-after.json`, `source-integrity-final.json`: **975/975** file frontend/src, backend/src, backend/tests, backend/prisma giữ nguyên hash; không thêm/mất source. Chỉ thêm helper/bằng chứng B và cập nhật4tài liệu. Đã đọc contract, quy tắc chung, remediation và source; không dựa vào PASS tự kiểm A hoặc lịch sử B18:04. Không dùng agent/worktree mới.

Container owned `reports-be1o1-20261102-205238`, PostgreSQL15-alpine, tmpfs, chỉ bind127.0.0.1:55571. Ba DB mới `reports_be1o1_verify`, `reports_be1o1_6a`, `reports_be1o1_security`: chứng minh0table trước schema/seed ở `logs/*-empty.txt`. DB thứ4 `reports_suite_current` chỉ dành refresh-token owner test, có empty proof riêng. Schema qua db push + tenant-rls.sql hiện hành; **không migration replay**.

App role `reports_be1o1_app` và `reports_be1o1_6a_app`: NOSUPERUSER/NOBYPASSRLS, không sở hữu bảng. `RLS_SET_CONFIG=true`, `TENANT_GUARD_MODE=enforce`; owner chỉ chuẩn bị fixture/SQL oracle và test refresh riêng. Catalog122table, **103 ENABLE/FORCE/policy**, gồm **102/102 bảng org_id** và care_session_events theo cha; **0 bảng org_id thiếu policy**. 19bảng không có org_id không được suy diễn là đã kiểm hết isolation. Các FK/constraint vẫn bật.

Harness55572/55574 chỉ auth/report/analytics/saved routes thật và static build; E1/O1 dùng server tạm55576. JWT ký/kiểm thật; main/6a3 đăng nhập bằng auth route thật. Fixture hoàn toàn giả. Không app bootstrap/provider/queue/cron/socket/send/AI trả phí. Delay503 là chức năng harness; số liệu thành công vẫn đọc DB thật. Không đọc .env; DOTENV_CONFIG_PATH trỏ file absent. Không ghi password/JWT/key vào báo cáo.

Lúc20:56, auto approval review từ chối setup vì usage limit tới21:47; lệnh không chạy. Tiếp tục21:50 qua cùng cơ chế review, xác nhận DB vẫn0table và source975/975 không đổi. Các frontend check hoàn tất trước gián đoạn áp dụng đúng patch này. Một lần review browser timeout sau đó được retry đúng một lần và thành công; không bypass.

### Bằng chứng source hiện tại

| Phạm vi | Đường gọi và dòng đã đối chiếu |
|---|---|
| E-1 policy | [tenant-rls.sql:639](../../backend/prisma/rls/tenant-rls.sql):28policy bổ sung; ENABLE/FORCE, USING/WITH CHECK theo app.current_org hoặc system bypass tường minh |
| Guard đủ model | [org-scoped-models.ts:15 và :34–64](../../backend/src/shared/tenant/org-scoped-models.ts):102model; đối chiếu schema độc lập với catalog thật, không chỉ comment/model name |
| RLS được gắn vào query | [prisma-client.ts:128–157](../../backend/src/shared/database/prisma-client.ts), [tenant-context.ts:90 và :113](../../backend/src/shared/tenant/tenant-context.ts): guard trước query, tenant/system config gắn cùng transaction khi bật |
| O-1 quyền hiện tại | [report-scope.ts:18–26](../../backend/src/modules/dashboard/report-scope.ts): id+orgId+isActive, DB role owner/admin, non-admin bị chặn trước grants. Gate cũ :41–47 giữ reports_admin_only |
| Route thực | [automation-report-routes.ts:56–59](../../backend/src/modules/automation/automation-report-routes.ts) là automation-summary; [broadcast-report-routes.ts:45](../../backend/src/modules/broadcast/broadcast-report-routes.ts) cùng resolver(user,true), giữ mã lỗi route |
| Caller sau guard | [group-scan-worker.ts:39–51](../../backend/src/modules/zalo/group-scan-worker.ts): system lookup org rồi scoped reread. [appointment-public-routes.ts:24, :44, :73](../../backend/src/modules/contacts/appointment-public-routes.ts): capability lookup, sau HMAC dùng tenant token. [telegram-bridge/link.ts:38 và :52](../../backend/src/modules/integrations/providers/telegram-bridge/link.ts): exact identity bootstrap/mã dùng1lần; không chạy gửi tin |
| Canonical và snapshot | [report-scope.ts:59–95](../../backend/src/modules/dashboard/report-scope.ts) giữ merged/local/deleted/dryRun/test/virtual exclusions và main/shared; [report-routes.ts:96–121](../../backend/src/modules/dashboard/report-routes.ts) giữ byStatus snapshot và newPerDay theo kỳ |

### Lệnh và kết quả mới

CWD backend; prefix helper `scripts/reports-verification/be1o1-2052-`. Lệnh, env không chứa secrets và log cụ thể ở [commands.md](../../artifacts/reports-5b6b-e1o1-20261102-205238/commands.md), danh sách30spec ở `helpers/backend-specs.txt`.

| Kiểm tra | Kết quả thực tế |
|---|---|
| `6b-contract-oracle.ts` | **710/710**, gồm **60/60 contract**. API/JWT, basic/export/custom/saved, canonical count, quyền/phòng/nick/shared/attribution và cross-org. `oracle/api-oracle.json`, Excel riêng |
| `6a3-api-acceptance.ts` | **129/129**:12endpoint nhóm admin, scope theo role, CRM Usage/Audit, AI main/shared, kỳ VN. `6a3/api-acceptance.json` |
| `extra-oracle.ts` | **189/189**, SQL kỳ vọng riêng cho Engagement/funnel/team/savedCRUD. Có merged/cross-org canary, denominator0/null, daily interactions và snapshot patterns. `oracle/extra-oracle.json` |
| `singleton2.ts` | **18/18**: leader một mình không mở rộng org, custom/saved cùng scope; cùng JWT mất quyền ở request sau khi bỏ grant. `oracle/singleton-revocation2.json` |
| `6b-rls.ts matrix` | **90/90**,9bảng kiểm đọc/ghi own/foreign/no-context/system với app role; catalog103forced,0org_id không policy. `oracle/rls-matrix.json` |
| `6b-rls-enforce.ts runtime` | **14/14** sau đối chiếu expectation guard mới; giữ kết quả helper cũ13/14 ở file khác. `oracle/rls-runtime-enforce.json` |
| `e1o1-boundaries.ts green4` | **524/524**, breakdown bên dưới. `e1o1/evidence/green4-boundaries.json` |
| `inventory.mjs` độc lập B | **104/104**: app-role safety, exact schema/guard set102,102mapping schema→table→ENABLE/FORCE/USING/WITH CHECK. `oracle/independent-inventory.json` |
| `vitest run <30spec> --maxWorkers=2 --reporter=verbose` | **306/306**,30file, app-role env. Unit/mock/PGlite, không thay SQL/JWT/HTTP integration |
| `vitest run tests/security/refresh-token-service.test.ts --maxWorkers=1 --reporter=verbose` | **10/10**,1file, DB thứ4/owner, guard off cho fixture ngoài tenant. Không dùng kết quả này chứng minh RLS |
| Frontend Vitest theo config hiện có | **161/161**,20spec. Mock DOM/unit, không gọi là browser integration |
| Backend/frontend build | **PASS**, backend tsc; frontend vue-tsc + vite. Cảnh báo chunk>500kB giữ nguyên |
| Browser | **PASS local5B**:40layout,82avatar/789mẫu chữ, F3 CSS1099.248px innerWidth1099 hai lần, F4 CSS767.669px,9nhóm loading/error/retry,9route/API200, snapshot9/9, drill-down3/3, UI roles và AI4scope. [Báo cáo5B cùng lượt](05-mobile-verification.md#recheck-e1o1-20261102-2052) |

Trong **524**:392SQL (28bảng×14) kiểm own/foreign/no-context/unknown-tenant reads, UPDATE/DELETE, chuyển org, INSERT own/foreign/no-context và system context;84Prisma (28×3) cộng18ca ở6model đã có RLS nhưng thiếu guard;28JWT/HTTP trên2route;2safety/catalog. JWT kiểm cả access/legacy, cùng token sau downgrade không đổi tokenVersion, leader/deputy có grant vẫn bị chặn, token sai/thiếu, identity không tồn tại, khác org và inactive. App-role test không dùng table owner vượt policy; mutation SQL rollback. Không mở rộng kết luận thành audit toàn bộ endpoint/caller của hệ thống.

### Kết quả chưa đạt/không dùng làm PASS

- Preflight6a3 cũ yêu cầu75forced nên dừng trước seed; cập nhật helper B thành exact103 theo catalog/schema hiện tại. Giữ log thất bại và helper preimage. Không nới inequality hoặc sửa assertion dự án.
- Helper runtime cũ **13/14** mong CareSession ngoài context trả0, comment còn nói model chưa có guard. Source mới đã có CareSession trong inventory; thực tế throw `[tenant-guard] CareSession.count`. Helper B riêng xác nhận đúng lỗi đó và13đối chứng còn lại, đạt14/14. JSON13/14 giữ nguyên. Lần gọi nhầm đường dẫn backend/backend không chạy được helper, log cũng giữ riêng.
- Browser generic **33/36** và các login/selector/stimulus mismatch được ghi đầy đủ trong5B, không đổi thành PASS hồi tố. Các ca thay thế có request/DOM/ảnh mới; không gọi response đã huỷ là response200 về muộn. categories riêng10/10 đo lại đủ9route; AI label riêng4/4 đo đúng selector.
- **Không chạy full backend suite mới trên E-1/O-1.** Lịch sử A39file/9test FAIL và B18:04 current/baseline35file/9test FAIL còn nguyên. Baseline cũ thuộc patch trước, không đủ kết luận mọi lỗi full suite của source hiện tại đã có từ trước. 306targeted và10refresh PASS không thay thế full suite. Đối chiếu full suite/baseline mới còn là đầu vào cho đánh giá phát hành; không sửa artifact hoặc xoá test lỗi.

### Kết luận, rủi ro và bàn giao

**PASS local6B cho module Báo cáo và remediation E-1/O-1 trong phạm vi đã kiểm;5B PASS local.** Số canonical/kỳ VN/snapshot/main/shared/quyền không có regression trong ma trận mới. 28bảng thiếu policy và stale JWT role của2report route đã đạt kiểm tra biên mới. Source unchanged975/975. E-1/O-1 không còn là finding local mở, nhưng **policy chưa apply staging/production**; app role/config rollout thật, migration replay, thiết bị iPhone/Safari/PWA và dữ liệu/hiệu năng thật chưa được nghiệm thu. 19table khôngorg_id nằm ngoài inventory trực tiếp, không tuyên bố cô lập toàn bộ hệ thống. Không chạy provider/worker thật để kiểm caller; các context caller có source review và unit/mock regression trong306test.

Cleanup22:16: dừng2harness PID7140/11708; dừng đúng Chrome/profile owned; stop/remove container tmpfs và cả4DB; xác nhận0listener55571/55572/55574/55576/9364. `cleanup.json` có ownership/path checks. Không chạm phiên khác. File thay đổi của B: hai verification, hai README, helper/artifact riêng; không runtime hoặc schema change.

**Bước tiếp theo:** chỉ chuẩn bị7A khi có yêu cầu. Đầu vào gồm hai báo cáo B mới, `commands.md`, source integrity, canonical710,6a3 API129, Engagement189, E1/O1 boundaries524+inventory104, RLS90+14, JWT revocation18, browser/Excel và giới hạn full backend nêu trên. Cần giữ kế hoạch staging/rollback/app-role validation và full suite/baseline trong hồ sơ phát hành; chưa deploy, chưa release READY. **7A/7B NOT_STARTED.**

---

Cập nhật lượt B: 2026-11-02 19:42:05 +07:00. Working-tree verification, không có commit mới.

<a id="recheck-20261102-1804"></a>

## Tái kiểm độc lập F6B3 và R-A-1 — 02/11/2026, bắt đầu18:02 (+07): **PASS local cho module Báo cáo**

**5B PASS local;6B PASS local trong phạm vi rollout/contract đã chốt. Full backend suite vẫn FAIL; đối chiếu baseline đã hoàn tất cho cấu hình an toàn của lượt này.** Không có finding mới chặn các remediation báo cáo đang kiểm. Đây không phải xác nhận toàn hệ thống xanh hoặc sẵn sàng production. E-1/O-1 còn nguyên; **7A/7B NOT_STARTED**. Lượt B không sửa runtime/test/assertion, không commit/push/deploy.

### Working tree và môi trường

- Workspace `F:\ZaloCRM-CorepViet`; HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, chưa có commit mới. Artifact [reports-5b-6b-recheck-20261102-180400](../../artifacts/reports-5b-6b-recheck-20261102-180400/), gồm status/diff/hash/log/preimage tài liệu, oracle/fixture, Excel/PNG và cleanup. **973/973 source/test/Prisma files giữ nguyên SHA256**, xem `source-integrity-final.json`; helper review-only ở backend/scripts/reports-verification/recheck1804-* không đăng ký vào app runtime.
- PostgreSQL15.19, container owned `reports-5b6b-recheck-20261102-1804`, tmpfs, bind127.0.0.1:55541. DB chính `reports_5b6b_verify`, DB6a3 `reports_5b6b_6a_verify`;2DB full suite riêng. Trước seed kiểm current_database/current_user/port +0table/0role, không lấy DATABASE_URL mặc định làm bằng chứng.
- App role chính `reports_5b6b_app`,6a3 `reports_5b6b_6a_app`: NOSUPERUSER/NOBYPASSRLS, không sở hữu bảng. Owner chỉ tạo schema/RLS/fixture, làm SQL oracle độc lập và integration refresh cần tạo user khác tenant. Không dùng owner PASS làm chứng minh RLS.
- Schema bằng db push + tenant-rls.sql hiện hành; **không migration replay**. Catalog122 bảng/75 ENABLE+FORCE/policy;28 org tables chưa có policy vẫn là E-1. `app-role-proof.txt`, `oracle/rls-matrix.json`, `resume-1906/final-db-role-rls-proof.txt` xác minh scope bảng thực tế.
- Harness55542 (6b),55544 (6a3): auth/JWT/middleware/report/analytics/saved routes thật và static build; không app bootstrap, provider/queue/cron/socket/send/paidAI. Delay503 do file scenario riêng của harness; response thành công vẫn truy DB thật. Route notifications/privacy/action-hub404 do không đăng ký harness, không kết luận lỗi production.
- Lúc tiếp tục19:03 môi trường cũ không còn chạy. Restart đúng owned container, tmpfs reset, xác minh rỗng và seed lại. Giữ log/proof của2vòng trong thư mục riêng; không tái dùng log cũ làm lần chạy mới. Source không đổi nên các lượt test hoàn tất trước gián đoạn vẫn là bằng chứng của patch này.

### Bằng chứng source hiện tại

| Nội dung | Source đã kiểm trong lượt B |
|---|---|
| Gate + subtree + main/shared | `backend/src/modules/dashboard/report-scope.ts:20–47`: role/grant hiện tại từ DB, singleton trưởng/phó hợp lệ; subtree/user/nick từ server, shared grant không thêm người ngoài phòng. Các domain self/CEO/Marketing/HC-NS chưa rollout giữ deny theo contract:3.2. |
| Canonical contact mọi scope | `report-scope.ts:54–70`, :79–81: org/dept loại merged; ContactEngagementDaily AND canonical contact +org và assignedUser scope. |
| Canonical message | `report-scope.ts:84–94`: real nick, không virtual/local/deleted/dryRun/test; modes main/people giữ org, scope nick và attribution đúng. Không đổi classifier AI hoặc credited tin người. |
| Snapshot khác period | `backend/src/modules/dashboard/report-routes.ts:96–109`: createdAt theo kỳ/nhóm ngàyVN; byStatus current snapshot. `frontend/src/views/ReportsView.vue:63–80`, :150–200: hai bảng/nhãn riêng, clear/request guard. |
| Engagement | `backend/src/modules/dashboard/report-analytics-routes.ts:815–837`, :869–884: mọi daily query đi qua reportModelWhere; :924–945 giữ cửa sổ dailyUTC/heatmap28ngày và coverage unavailable. |
| Analytics + saved | `backend/src/modules/analytics/analytics-routes.ts:36–51` gate trước query; `reports/conversion-funnel.ts:42–65` cohort canonical; `reports/team-performance.ts:42–114` scope từng domain. `saved-report-routes.ts:56–69` gán creator/org từ server; :89–125 áp object ownership khi get/update/delete; :131 trở đi run áp scope hiện tại của viewer. |
| F3/F4 | Chi tiết path/dòng/browser mới tại [5B mốc1804](05-mobile-verification.md#recheck-20261102-1804). |

### Các bộ kiểm thực chạy — không cộng số để suy coverage

| Bộ / command chính (cwd backend nếu không ghi khác) | Kết quả mới / exit |
|---|---|
| `node --import tsx scripts/reports-verification/recheck1804-6b-api-oracle.ts` | **694/710**; contract60/60.16lệch expected legacy; helper exit0 dù check FAIL nên không gọi toàn bộ PASS. `oracle/api-oracle.json`, `logs/api-oracle-legacy.log`. |
| `node --import tsx .../recheck1804-6b-contract-oracle.ts` | **710/710**, exit0. Oracle riêng với mapping expected rõ, giữ oracle/log legacy nguyên. `contract/oracle/api-oracle.json`, `contract/expected-changes.json`. |
| `node --import tsx scripts/reports-verification/recheck1804-6b-rls.ts matrix` | **90/90** direct DB RLS (9bảng×10case), role non-owner; owner chỉ seed/đối chứng; rollback probes. `oracle/rls-matrix.json`. |
| `node --import tsx scripts/reports-verification/recheck1804-6b-rls.ts runtime` | **14/14** Prisma/context/RLS thật. Cùng helper với matrix, mode runtime; không có helper rls-prisma riêng. `oracle/rls-runtime-prisma.json`, `logs/rls-runtime.log`. |
| `node --import tsx .../recheck1804-6a3-api-acceptance.ts` | **129/129**, exit0. Rerun mới, signed JWT login thật, biênVN/lịchmai/AI/Automation/Broadcast/saved/scope. `6a3/api-acceptance.json`. |
| `node --import tsx .../recheck1804-extra-oracle.ts` | **189/189**, exit0: Engagement merged/cross-org/room/collaborator, heatmap, null/0; funnel/team canonical; saved CRUD ownership. `oracle/extra-oracle.json`, `extra-fixture.json`. |
| `node --import tsx .../recheck1804-singleton2.ts` | **18/18**, exit0: phòng1người, own contact/new/custom/saved/AI0, Audit403, thu hồi grant chặn ngay JWT cũ cả report/custom/saved-run. `oracle/singleton-revocation2.json`. |
| `node node_modules/vitest/vitest.mjs run <18 spec reports/response/tenant> --maxWorkers=2 --reporter=verbose` | **120/120**,18file, exit0, app role + RLS_SET_CONFIG=true/TENANT_GUARD_MODE=enforce. Có PGlite/mock tests; không thay thế matrix PostgreSQL/HTTP. Danh sách file ở commands.md và log backend-scoped-app. |
| `node node_modules/vitest/vitest.mjs run tests/security/refresh-token-service.test.ts --reporter=verbose` | **10/10**, exit0, owner role riêng trên suite DB disposable; không phải chứng minh RLS. Lần đầu dùng nhầm đường integration/ không tìm thấy test, exit1; giữ refresh-owner.log, chỉ refresh-owner-actual.log là kết quả10/10. |
| Frontend toàn bộ + build | **161/161**,20file, exit0; `npm.cmd run build` (`vue-tsc -b && vite build`) exit0, warning chunk>500kB còn. Backend `npm.cmd run build` (`tsc`) exit0. |

Tên/lệnh runtime helper phải theo inventory của artifact, không đoán từ tiêu đề báo cáo; commands.md được đối chiếu log chạy và file hiện có trước khi kết thúc.

### Phạm vi oracle và đối chứng mới

- Fixture2org, S>S1>S1a và phòngM, admin/leader/deputy/member/no-grant, nicks main/private aggregate/explicit shared/archived, contact merged/ngoài phòng/chưa assigned, lịch hôm nay/ngày mai, tin inbound không repliedByUserId, human/native/automation/AI/unknown, dry-run/local/deleted/test/virtual. SQL oracle viết riêng không import report-scope/metric implementation. Có hand-count tự kiểm oracle.
- Ma trận710 gồm **179 permission assertions**, các snapshot/cohort/kỳtrước, from/to invalid, cross-org/query-body filters, inbound byuser/bucket chưa xác định, attribution, pending/unattributed main/shared, Excel/custom/saved-run. Đây là assertion có phần trùng nhau, không phải710journey độc lập.
- **16 ca legacy lệch:** basic6, export4, custom1, saved3, cross-org2. Ở orgX/ngàyD, số sent canonical **13 thay18**, new contacts **6 thay8**;2contact merged và5message excluded giải thích chênh lệch. Mỗi actual/expected và row/công thức nằm `contract/legacy-16-differences.json`;9thay thế biểu thức expected được lưu `expected-changes.json`, không xóa kiểm legacy hoặc sửa contract để tăng PASS. 60contract assertions giữ nguyên nội dung và đạt cả2oracle.
- **Excel:** export messages/contacts/appointments theo nhiều viewer/kỳ;30workbook mỗi oracle, lưu legacy và canonical riêng. Kiểm row/tổng/period/scope với SQL; không lấy file tải được làm chứng minh số đúng. Browser còn xác nhận request/download thật và export503 báo lỗi.
- **Engagement bắt buộc đã bổ sung:** canonical daily3rowX có inbound3+1+7=11;2rowmerged mỗi row inbound1000, orgYcanary5000;1rowngoài kỳ inbound17. OrgX percentage2/3=66,7%, interactions11/15; merged không ảnh hưởng denominator/interaction/heatmap/hot-cooling. RoomS/DeputyS1/M/Y đối chứng riêng; contactAccess collaborator của Deputy trên M không làm tăng main KPI. Empty period pct=null nhưng event sums=0, average vẫn unavailable vì coverage chưa đủ. Không coi event-driven daily là nguồn đầy đủ cho toàn bộ số tin.
- **Saved CRUD mới:** create bỏ client org/creator giả; owner update/delete; peer phòngM/cross-org GET/PUT/DELETE404; deleted404. Seeded saved-run được đối chiếu canonical/scope trong710 và129. Thu hồi report grant không mất cấu hình nhưng next run403; không mở đường vòng quyền.
- **Singleton:** fixture một trưởng phòng có đúng1contact, không nick; own scope1, AI measured0, Audit403, next JWT request sau revoke403. Lần1 AI nhận400 vì helper gửi orgId/userId mà schema AI strict chỉ nhận from/to (`ai-report-routes.ts:8–15`); giữ8PASS/1FAIL+exception. Singleton2 kiểm400 đó riêng và query hợp lệ,18/18; không sửa route hoặc assertion dự án.
- **Browser R-A-1:**9/9 mới, snapshot8/new6, phân trang riêng, số0, loading/503/retry, ô ngày chưa gửi, stale response và export error. 9danh mục/40layouts/contrast/focus/F3-F4/quyền/race được ghi riêng ở5B; không tái dùng ảnh của phiên trước.

### Full backend suite: **FAIL — đã có đối chứng mới, không còn suy đoán chung**

Lịch sử A **39file/9testFAIL** vẫn được giữ. Lượt B dựng bản sao cô lập trong artifact, không checkout/reset/worktree:

- `baseline/reconstruction-proof.json`: **617/617 backend src/tests/Prisma files** khớp toàn bộ manifest source-before của remediation17:02. Khôi phục đúng5file A đã đổi: report-scope +4schema PGlite. Giữ toàn bộ3test canonical mới ở bản hiện tại; không hạ assertion. Package/lock/tsconfig/Vitest dùng cùng file hiện có; dependencies là junction đến node_modules đã cài, không install.
- Round1 baseline thiếu support promptfoo/scripts/channels; **không dùng làm baseline hợp lệ**. Giữ log nguyên. Round2 bổ sung toàn bộ support được test import/read (promptfoo, channels, SQL docs); hash current/copy bằng nhau ở `baseline/comparison.json`, git diff support/config không đổi. Kiểm đủ graph file bằng kết quả import/ENOENT hai bên, không bỏ file lỗi khỏi suite.
- Giới hạn setup round1: import script channels có `dotenv/config` trước khi đặt DOTENV_CONFIG_PATH riêng. Không mở hoặc in nội dung .env bằng công cụ, nhưng không có bằng chứng loader đã tránh đọc đường mặc định ở vòng đó; vì vậy không dùng round1 để chứng minh cấu hình hoàn toàn tách .env. Round2 đặt đường test không tồn tại cho cả hai bên; mọi DB URL/key test quan trọng đều được gán rõ và network guard vẫn chặn outbound. Không suy ngược round1 an toàn chỉ từ round2.
- Hai DB riêng cùng schema/RLS/owner và fixture của tests, cùng Node/Vitest/config/TZ/worker2. Preload `helpers/network-guard.cjs` chặn outbound network ngoài DB55541; DOTENV_CONFIG_PATH trỏ path test không tồn tại cho round2, không dùng .env làm cấu hình. Không gọi provider/model/send thật. Các blocked attempts chỉ ghi host/port, không ghi header/body/token.
- Cùng command `node <backend>/node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=2 --reporter=verbose`:
  - **Current:35failed /127passed /1skipped files;9failed /1009passed /1skipped tests; exit1.**
  - **Baseline:35failed /127passed /1skipped files;9failed /1006passed /1skipped tests; exit1.**
  - **Cùng toàn bộ fail names**, new-only0/baseline-only0. Chênh3PASS đúng3regression canonical mới của remediation. Module thiếu, broadcast mock expectations, branding, profile/Zalo và zinstant timeout tái hiện trên baseline dưới cùng cấu hình; không có report finding chỉ xuất hiện ở patch mới.
- Đây là **tái hiện trên baseline trong môi trường hạn chế này**, không khẳng định mọi lỗi là bug sản phẩm hoặc tất cả39file/9test lịch sử đã được giải thích. Một số lỗi có yếu tố mock/network/timeout; round1 còn có profile-media timeout không ổn định. Historical configuration không đồng nhất nên không lấy35/9 thay thế39/9. Xem `baseline/README.md`, comparison.json, log2vòng và fail-name lists.

### Tồn đọng và gate tiếp theo

- **E-1 MEDIUM:**28bảng có org_id chưa có policy (catalog RLS JSON). Không sửa trong lượt B; phải có remediation/quyết định trước7A, không lấy90/90 của9bảng để suy mọi bảng đã RLS.
- **O-1 LOW:** Automation/Broadcast kiểm role từ JWT tại `backend/src/modules/automation/automation-report-routes.ts:56–58` và `backend/src/modules/broadcast/broadcast-report-routes.ts:42–44`; chưa sửa freshness/revocation của2route đó. Singleton revoke chỉ chứng minh routes đi qua report-scope hiện tại.
- Khả năng self-report/CEO/Marketing/HC-NS là rollout tiếp theo theo contract, chưa tự bật. Không migration replay, staging/production apply, Safari/iPhone/PWA/VoiceOver, tải/query-plan đại diện. Numeric oracle mới tập trung đường dữ liệu bị canonical ảnh hưởng; một số field diagnostic legacy nick/lead-pool/audit/CRM vẫn chỉ có status/scope/as-of, không được gọi là đã đối soát mọi field chỉ vì710PASS.
- Chỉ các remediation F3/F4/F6B3/R-A-1 và ma trận bắt buộc local của lượt này được đóng. Full backend suite vẫn đỏ và E-1/O-1 phải được đưa vào bàn giao; không tự bắt đầu7A/7B hoặc tuyên bố release READY.

Cleanup `cleanup.json` success=true: harness/Chrome owned đã dừng,2profile fixture/junction đã xóa, exact container tmpfs đã xóa; ports55541/55542/55544/9354 không listener. Source hash cuối giữ nguyên, chỉ4tài liệu verification/README cùng review helpers và artifact mới thuộc patch B. Không commit/deploy.

---


## Lịch sử trước lượt tái kiểm 18:04 (giữ nguyên)

Các lượt bên dưới giữ nguyên lịch sử. Lượt mới nhất ở trên cùng.

<a id="lan-3-20261102-1559"></a>

## 6B lần 3 — 02/11/2026 15:59–16:29 (+07): **FAIL**

**Kết luận chung: FAIL.** Không có lỗi phạm vi quyền hay rò dữ liệu khác org. Tất cả KPI chính đều khớp SQL tự viết: Overview, Sale, Pipeline, AI, Automation, Broadcast. RLS, browser bắt buộc, test và build đều đạt.

Lượt này vẫn FAIL vì có hai finding MEDIUM trên view `/reports-co-ban`. View này nằm trong bản đồ contract ([00-contract.md:34](00-contract.md)) và đang bật nút xuất Excel:

- **F6B3-1:** với admin, báo cáo cơ bản, file export, custom report và saved report đếm cả contact đã gộp (merged). Riêng báo cáo/export tin nhắn còn đếm cả tin dry-run, local, đã xóa, test và hội thoại ảo. Điều này trái với [00-contract.md:118](00-contract.md).
- **F6B3-2:** trang `/reports-co-ban` không hiện trạng thái lỗi. Khi request trả 503, bảng vẫn giữ dữ liệu cũ như thể là số hiện tại.

Lượt này chỉ kiểm tra: không sửa runtime, test hay helper của A; không commit/push/deploy. **7A/7B vẫn NOT_STARTED.** Đây không phải tuyên bố sẵn sàng production.

### Revision, working tree và artifact

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, branch `fix/reports-kpi-3b`. Working tree đã dirty từ trước, giữ nguyên: đầu lượt có 247 dòng `git status --porcelain`.
- Cuối lượt chỉ thêm 11 helper `backend/scripts/reports-verification/6b-*`. Danh sách nằm trong `logs/git-status-end.txt`.
- Artifact: [artifacts/reports-6b3-verification-20261102-1559](../../artifacts/reports-6b3-verification-20261102-1559/). Thư mục được xác nhận chưa tồn tại trước khi tạo.
- Trước khi thao tác đã kiểm tra lượt chạy khác:
  - Process node/chrome đang chạy đều thuộc ứng dụng khác (Adobe, Codex, Lark MCP). Đã che tham số bí mật trong `logs/preexisting-processes.txt`.
  - Container `reports-1b-verify-20261101` (Exited) và `sketchup-api-1` không bị đụng tới.
  - Artifact mới nhất trước lượt này là `reports-6b2-…-1553`.
- `tenant-rls.sql` SHA-256 `a904fdfff288809dd2f8f127a1df05576c8a1c92fe054e8303dad060e79f7b39`, khớp prefix `a904fdff`.

**Source integrity:** đầu và cuối lượt trùng nhau (`logs/hash-start.txt` = `logs/hash-end.txt`).

| Thư mục | Số file | SHA-256 tổng hợp |
|---|---:|---|
| `frontend/src` | 354 | `8f6ac8b4…` |
| `backend/src` | 319 | `5400d504…` |
| `backend/tests` | 164 | `fdecf2c9…` |
| `backend/prisma` | 134 | `afa58e92…` |

Build ghi lại `frontend/dist` và `backend/dist`; đây là output build, không phải source.

### Môi trường đã xác minh

- **PostgreSQL:** container mới `reports-6b3-verify-20261102`, image `postgres:15-alpine` 15.19, chạy trên tmpfs, bind `127.0.0.1:55531`, không mount (`logs/container-inspect.txt`), TimeZone UTC. DB `reports_6b3_verify` được xác minh có 0 bảng và 0 role trước mọi lệnh ghi (`logs/db-empty-check.txt`).
- **Schema và RLS:** `prisma db push` dùng config riêng `6b-disposable-prisma.config.ts`, URL chỉ rõ DB này; không đọc `.env`, không dùng `DATABASE_URL` mặc định. Sau đó áp `tenant-rls.sql` hiện hành: 122 bảng, 75 bảng ENABLE+FORCE.
- **App role** `reports_6b3_app`: NOSUPERUSER, NOBYPASSRLS, sở hữu 0 bảng (`logs/app-role-proof.txt`).
- **Harness** `6b-server.ts`:
  - Bind `127.0.0.1:55532`, kết nối bằng app role, `RLS_SET_CONFIG=true`, `TENANT_GUARD_MODE=enforce`. JWT secret ngẫu nhiên, không ghi ra file.
  - Đăng ký auth, report-analytics, **`reportRoutes` (messages/contacts/appointments/export)**, AI, automation-summary, broadcast, analytics và saved-report.
  - Không có queue, cron, socket, provider, AI hay đường gửi tin.
  - Fault/delay điều khiển bằng file `http/scenario.json`, không có endpoint điều khiển qua mạng.
- **Browser:** Chrome `156.0.8078.74` headless, profile tạm trong scratchpad, `--force-device-scale-factor=1.25`, `--window-size=1440,1000`. Viewport thực đo được: `innerWidth` 1424, `innerHeight` 906, DPR 1,25.
  - Điều khiển qua CDP 9351 bằng `Input.dispatchMouseEvent`/`Input.dispatchKeyEvent` tại tâm phần tử.
  - JS trong trang chỉ đọc trạng thái (cùng `scrollIntoView`); không gọi handler, không override `innerWidth`.

### Fixture và oracle độc lập

- **Fixture riêng** `6b-fixture.ts`, viết mới, không dẫn xuất từ `6a*`. Manifest ở `oracle/fixture-manifest.json`. Gồm:
  - 2 org; phòng S > tổ S1 > nhóm S1a (3 cấp), phòng M ngang cấp, phòng Y thuộc org B.
  - admin; leader S; deputy S1 (có grant đọc nick M); leader M; sale; deputy M không có grant; admin Y; sale Y.
  - Nick archived không có `zalo_uid`; 12 contact (2 contact merged, 1 contact chưa gán); 8 hội thoại (gồm 1 ảo và 1 nhóm); 33 tin nhắn.
  - Tin AI dry-run/local/deleted/test, tin AI có audit trả lời trùng, audit chỉ có dry-run, tin AI tương lai.
  - 6 nháp AI, 10 lịch hẹn (hôm nay/ngày mai/hủy/no-show), lead request/distribution, friendship attempt, care event, broadcast run và 4 saved report.
  - Các mốc biên VN `00:00:00.000` và `23:59:59.999` ở kỳ trước, trong kỳ và sau kỳ.
- **Ghi theo UTC:** chạy với `TZ=UTC` và `pg.defaults.parseInputDatesAsUTC = true`.
  - Tự kiểm: contact `23:59:59.999` VN lưu thành `2026-11-01 16:59:59.999`; contact `00:00` VN lưu thành `2026-10-31 17:00:00`.
  - Lịch hẹn theo ngữ nghĩa date-only: `2026-11-02 00:00:00`.
  - Kỳ kiểm tra D = `2026-11-01` VN; T = `2026-11-02`; T+1 = `2026-11-03`.
- **Oracle** `6b-api-oracle.ts`: SQL viết lại từ bảng gốc bằng owner, không import hàm báo cáo, không chép expected của A.
  - Phạm vi phòng tính lại từ `departments.path`, nick sở hữu (loại archived không có uid) và grant.
  - Một bảng **đếm tay** (45 giá trị) đối chiếu chính oracle: 45/45 khớp.

### Kết quả theo nhóm

| Nhóm | Kết quả | Bằng chứng chính |
|---|---|---|
| A. Tính xác thực bằng chứng A | **PASS** | Xem mục A |
| B. Tái chạy độc lập trên DB mới | **PASS** | 271 check không lỗi |
| C. Báo cáo cơ bản và export | **FAIL** | F6B3-1, F6B3-2 |
| D. Phân loại lỗi biên ngày | **PASS** | Lỗi 6A là do harness, không phải runtime |
| E. RLS | **PASS** cho 6B | Còn MEDIUM: 28 bảng, 6 model |
| F. Coverage theo đường dữ liệu | **PASS**, có liệt kê phần chưa phủ | Không có đường vòng quyền |
| G. Browser độc lập | **PASS** kịch bản bắt buộc | Có finding trên `/reports-co-ban` |
| H. Regression/build | **PASS** | Xem mục H |
| I. Hiệu năng và giới hạn harness | **PASS** (ghi nhận, không SLA) | Khớp số A |

#### A. Tính xác thực bằng chứng A — PASS

- **Source khớp:** `source-before.json` của A có 971 file; cả 971 file trùng SHA-256 với file hiện tại (`logs/a-source-vs-now.json`).
- **Bundle khớp:** tên hash của 11 chunk báo cáo và `index` trong build log A trùng với build mới lúc 16:08 (`logs/a-bundle.txt` = `logs/b-bundle.txt`). Ảnh và log browser của A vì vậy đến từ cùng frontend source.
- **Chạy thật qua JWT/app role:**
  - `api-acceptance-run.log` của A ghi login 200 qua `/api/v1/auth/login`.
  - `6a3-server.ts:25-32` từ chối khởi động nếu không phải `reports_6a3_app` với `RLS_SET_CONFIG=true`.
  - `app-role-proof.txt` là `f|f|0`.
  - Số query theo route của A trùng chính xác với lượt đo độc lập này (xem nhóm I), nên A đã chạy qua API thật.
- **Đọc `6a3-server.ts:1-90`:** chỉ đăng ký auth, reportAnalytics, AI, automation-report, broadcast-report, analytics, saved-report và static. Không có send/model/cron/socket/provider.
- **Route A chưa đăng ký:** `dashboard/report-routes.ts`, gồm `/api/v1/reports/messages`, `/contacts`, `/appointments`, `/export`. Ngoài ra còn notifications, privacy, action-hub và org-branding.

#### B. Tái chạy độc lập — PASS

Nguồn: `oracle/api-oracle.json`, `logs/api-oracle.log`. Trong các nhóm thuộc B đều không có lỗi:

| Nhóm check | Số check đạt |
|---|---:|
| auth | 8/8 |
| overview | 75/75 |
| sales | 35/35 |
| pipeline | 25/25 |
| ai | 21/21 |
| scope | 4/4 |
| boundary | 7/7 |
| automation | 22/22 |
| broadcast | 16/16 |
| permission | 179/179 |
| cross-org | 8/8 |
| saved | 26/26 |
| hand-count | 45/45 |

Các giá trị kỳ D tiêu biểu (expected từ SQL = actual từ API):

| Phạm vi | KH tổng / mới | Lịch hôm nay / hoàn thành | Lead chờ | AI sent / auto / follow / chưa phân loại / nháp |
|---|---|---|---:|---|
| Admin X | 8 / 6 | 2 / 2 | 2 | 5 / 2 / 1 / 2 / 3 |
| Leader S (subtree 3 cấp) | 6 / 4 | 1 / 2 | 1 | 4 / 1 / 1 / 2 / 2; shared = `null` |
| Deputy S1 | 4 / 2 | 1 / 1 | 1 | main 4 / 1 / 1 / 2 / 2; shared (nick M được cấp) 1 / 1 / 0 / 0 / 1 |
| Leader M | 1 / 1 | 1 / 0 | 1 | 1 / 1 / 0 / 0 / 1 |
| Admin Y | 4 / 3 | — | — | — |

**Leader không thấy phòng khác:**
- Bảng Sale của leader S không có user nào thuộc phòng M.
- Deputy S1 chỉ thấy đúng `dep-s1` và `sale-s1a`; leader S và sale S không lọt vào.
- Deputy S1 có `sharedAccounts=1`, đến từ grant nick M.

**Member bị chặn:** sale không có grant và deputy M không có grant đều nhận 403 ở 18 route report/export, 3 route analytics GET, custom và saved-run. Request không có token nhận 401.

**Leader/deputy với route admin-only:** nhận 403 ở `audit`, `automation`, `automation-summary` và `broadcast`; 200 ở các route còn lại.

**Cross-org:**
- Admin X gửi `?orgId=Y` vẫn nhận số liệu org X ở overview, messages và export. Route AI trả 400 (schema strict).
- Admin Y chỉ thấy org Y; `?orgId=X` trên broadcast vẫn ra org Y.
- Leader S gửi `?orgId=Y&userId=sale-y` bị bỏ qua.
- Custom với body `orgId`/`filters.userId` bị bỏ qua.
- Saved report org Y trả 404 cho admin X ở cả run và GET; danh sách của admin X không chứa report org Y.

**Biên ngày VN:**
- Deputy S1 `/reports/contacts` theo ngày: 31/10 = 1 (contact `23:59:59.999` hôm trước), 01/11 = 2 (`00:00:00.000` và `23:59:59.999`), 02/11 = 1 (`00:00` hôm sau).
- Admin Y với 2 contact chèn qua Prisma: `yp-before` rơi vào 31/10, `yp-start` rơi vào 01/11.

**Lịch ngày mai không vào hôm nay:** oracle có 1 lịch ngày mai của deputy S1. `apptToday` = 1, chỉ là lịch hôm nay. `/reports/appointments` hôm nay = `[scheduled 1]`, ngày mai = `[scheduled 1]`.

**AI không đếm sai:**
- Loại m04 (dry-run), m05 (local), m06 (deleted), m11 (test), m25 (hội thoại ảo) và tin của ngày khác.
- Audit trả lời trùng của m03 chỉ tính 1 auto reply; m13 chỉ có audit dry-run nên vào nhóm chưa phân loại.
- Kỳ hôm nay loại tin AI lúc 23:00 tương lai (asOf).

**Automation X** (D): `kbGui` 3, `dongY` 1, `tuChoi` 1, `noZalo` 1, `bdGui` 2, `phanHoi` 1; tỉ lệ 33,3% / 50%; `tongNick` 6, online 4. Trạng thái `error`, event `enrolled` và các mốc ngoài kỳ đều bị loại.

**Broadcast X** (D): 2 job, 1 active, 2 run; sent 7, failed 1, skipped 3; tỉ lệ 87,5%. Run lúc 00:00 hôm sau và 23:59:59.999 hôm trước bị loại.

**Saved report theo phạm vi người xem:**
- Admin: chạy được 3 report org X (200) với tổng org; report org Y trả 404.
- Leader S: chạy report do người trong subtree tạo (`sr-sub`, `sr-sale-s`) với số của subtree; report của admin trả 404.
- Deputy S1: chỉ `sr-sub` (200); `sr-sale-s` ngoài subtree trả 404.
- Leader M: 404. Member: 403. Admin Y: `sr-y` 200, `sr-sub` 404.
- Ở phạm vi admin, các giá trị này bị ảnh hưởng bởi F6B3-1.

#### C. Báo cáo cơ bản và export — FAIL

- **Đạt:**
  - Admin, leader, deputy, leader M, admin Y gọi messages, contacts, appointments ở kỳ D và kỳ 31/10–02/11: 80/80 khớp SQL theo định nghĩa hiện tại của route.
  - Export ba loại × hai kỳ × năm vai trò: mọi file 200, đúng `spreadsheetml`. File mở bằng `exceljs` có sẵn trong repo; **mọi dòng khớp SQL theo phạm vi**: 93/93 check. 30 file nằm ở `excel/` (lần thử đầu giữ ở `excel-attempt1/`).
  - Export của leader M chỉ có 1 contact (phòng M). Type sai trả 400; kỳ đảo ngược trả 400 `invalid_report_date_range`.
  - Không có dòng nào vượt org/subtree.
- **Lệch contract (F6B3-1):** 14 check `*-contract` lệch, tất cả ở phạm vi admin:

| Chỉ số (admin X, kỳ D) | Theo contract | API/export trả về |
|---|---:|---:|
| `/reports/messages` sent | 13 | 18 |
| `/reports/contacts` contact mới | 6 | 8 |
| `byStatus` converted | 1 | 3 |
| `contacts_new` theo user: Sale M | 1 | 2 |
| `contacts_new` theo user: Sale S1a | 2 | 3 |
| Saved report (3 report) | 6 | 8 |

  Overview của cùng admin, cùng kỳ báo 6 contact mới. Như vậy hai view cho cùng người dùng ra hai số khác nhau. Với phạm vi phòng, kết quả khớp contract vì nhánh `department` đã có `merged_into IS NULL`, và tin outbound AI/automation bị loại do giới hạn theo nhân viên.
- **Browser (F6B3-2):** xem nhóm G.

#### D. Phân loại lỗi biên ngày — PASS: lỗi harness, không phải runtime

- Prisma của ứng dụng, chạy trong process có TZ `Asia/Saigon` (offset −420), chèn 2 contact org Y. Giá trị lưu là `2026-10-31 17:00:00` và `2026-10-31 16:59:59.999`, giống hệt fixture pg+UTC (`oracle/prisma-boundary.json`).
- Đối chứng: pg mặc định (`parseInputDatesAsUTC=false`) trong TZ VN, chạy trong transaction có ROLLBACK. Mốc `2026-10-31T16:59:59.999Z` bị lưu thành `2026-10-31 23:59:59.999` và bị tính vào ngày VN 01/11; sau rollback còn 0 dòng (`oracle/pg-default-skew.json`). Đây đúng là cơ chế gây 6 sai lệch ở 6A lúc 14:29.
- Runtime lọc đúng biên với dữ liệu ghi theo cách Prisma ghi (nhóm B, biên ngày).

#### E. RLS — PASS cho 6B; còn MEDIUM trước khi apply RLS staging/production

- **Catalog** (`oracle/rls-matrix.json`): 122 bảng, 75 bảng FORCE, 28 bảng có `org_id` chưa có policy, 19 bảng không có `org_id` chưa có policy. 5 bảng mới đều ENABLE+FORCE và có policy.
- **Ma trận app role 90/90.** Áp cho 5 bảng mới và 4 bảng đối chứng `contacts`, `messages`, `appointments`, `ai_suggestions`, với 10 ca mỗi bảng:

| Ca kiểm tra | Expected |
|---|---|
| Fixture có dữ liệu cả X và Y | có |
| X đọc dòng của X | = số đếm của owner |
| X đọc dòng của Y | 0 |
| Không đặt tenant | 0 |
| Bypass | = tổng X+Y của owner |
| X UPDATE dòng Y | 0 dòng |
| X DELETE dòng Y | 0 dòng |
| X INSERT dòng Y | bị từ chối 42501 |
| X INSERT dòng của X | thành công |
| INSERT khi không có tenant | bị từ chối 42501 |

  Lần thử đầu 89/90 do câu INSERT của helper này thiếu cột `confidence` (lỗi 23502, không phải RLS); giữ log `logs/rls-matrix-attempt1.log`.
- **Runtime qua Prisma thật 14/14** (`oracle/rls-runtime-prisma.json`):
  - `withTenant(X)` đếm = owner X ở 5 model; `findUnique` id của Y trả null.
  - **2 ca 11/13 của A, chạy lại với expected = tổng owner:** `runSystemQuery broadcastJob.findMany` = 3/3, `careSession.findMany` = 2/2. Kết luận: A ghi expected sai, runtime đúng.
  - Ngoài context: `careSession.count` = 0 nhờ RLS. Model này không có trong `ORG_SCOPED_MODELS` nên guard không báo; đối chứng `contact.count` bị tenant-guard enforce chặn.
  - Tạo event trên session của Y bị từ chối; `updateMany`/`deleteMany` trên Y ảnh hưởng 0 dòng; dữ liệu Y không đổi.
- **Đánh giá 28 bảng có `org_id` chưa có policy:** `appointment_action_links`, `broadcast_run_items`, `browser_session_refs`, `channel_*`, `contact_identities`, `content_blocks`, `devices`, `facebook_*`, `group_*`, `knowledge_*`, `lead_notify_acks`, `media_usage_events`, `message_template_folders`, `outbound_commands`, `sale_assignment_states`, `target_*`, `telegram_*`, `tiktok_*`.
  - Đã grep toàn bộ code báo cáo (dashboard report, automation/broadcast report, analytics): **không bảng nào trong số này nằm trên đường dữ liệu báo cáo.**
  - Mức **MEDIUM**, không chặn 6B. Đây là **điều kiện bắt buộc trước khi apply RLS lên staging/production và cần quyết định trước 7A.**
- **Model chưa vào `org-scoped-models.ts`:** `CareSession`, `CareSessionEvent`, `LeadPoolDistribution`, `BroadcastJob`, `BroadcastRun`, và thêm `BroadcastRunItem`.
  - RLS vẫn chặn được, nhưng tenant-guard không cảnh báo khi các model này bị truy vấn ngoài context.
  - MEDIUM, cùng điều kiện như trên.

#### F. Coverage theo đường dữ liệu — PASS, có phần chưa phủ

| Endpoint/view | Quyền + cross-org | Giá trị so với SQL | Browser |
|---|---|---|---|
| overview, sales-performance, pipeline, ai | có | có | có |
| automation-summary, broadcast | có (admin-only) | có | có |
| nick-fleet, lead-pool, engagement, audit, crm-usage, `/reports/automation` (legacy) | có | **chưa** (chỉ status) | 200 trong 9 danh mục |
| messages, contacts, appointments, export ×3 | có | có (+ contract) | `/reports-co-ban` |
| analytics conversion-funnel, team-performance, response-time | có | **chưa** | — |
| analytics custom | có | có (theo user) | — |
| saved-report run | có | có | — |
| saved-report GET/list org khác | có | — | — |
| saved-report POST/PUT/DELETE | **chưa** | — | — |

- **Không có đường vòng quyền:**
  - Export đi qua `gateReportAccess` rồi `reportScope` (`report-routes.ts:175-190`).
  - Saved-run được gate và lọc `createdBy ∈ subtree`, chạy với scope của người xem (`saved-report-routes.ts:133-152`).
  - Custom dùng scope của server, bỏ qua `orgId`/`userId` trong body (`analytics-routes.ts:85-93`).
  - Menu bị ẩn không phải biện pháp duy nhất: API trả 403 cho member.
- **Đối chiếu [00-contract.md](00-contract.md):** các route trong bảng 24–39 đều có mặt. Lệch so với dòng 118 ở báo cáo cơ bản (F6B3-1).

#### G. Browser độc lập — PASS kịch bản bắt buộc

Kết quả trong `browser-results.json`, `browser-extra-results.json`; 40 ảnh PNG thật trong `shots/`.

| Ca | Kết quả |
|---|---|
| Admin 9 danh mục | Click chuột qua subnav. 8 trang phát sinh request mới, tất cả 200; Tổng quan đã tải 200 ngay trước đó. Không trang nào hiện alert. Ảnh `admin-*.png` |
| Nhãn kỳ khớp response | Chọn "7 ngày" (mặc định là 30 ngày): context `2026-10-27 – 2026-11-02` khớp request 200 cuối |
| Nhãn kỳ/phạm vi AI | Admin "Tổ chức"; leader, deputy, leader M "Phòng ban và phòng con". Kỳ khớp response 4/4. Deputy có mục "Nick được cấp thêm" (`shared` ≠ null), leader không có |
| Response cũ về muộn | 2/2 lần: 7 ngày → 30 ngày (trễ 2500 ms) → Hôm nay. Response 30 ngày về sau cùng; UI vẫn hiện `2026-11-02 – 2026-11-02`, 8 KPI |
| Loading | Trong lúc chờ: có loading, 0 KPI, ẩn context; sau đó 8 KPI và context (`overview-loading.png`) |
| Error/retry | 503 có kiểm soát → alert "Không tải được dữ liệu báo cáo…", 0 KPI; click "Thử lại" → 200, 8 KPI (`overview-error.png`, `overview-after-retry.png`) |
| 0 / null / unavailable | Chỗ ghi "Chưa có dữ liệu"/"chưa đủ nguồn": Overview 15, AI 6, Pipeline 20. Leader M có "Tin nhắn hôm nay 0", là số đo bằng 0, không bị đổi thành null |
| Số trên UI so với oracle (kỳ 30 ngày) | Admin: KH 8, KH mới 8, nick 4/5, tin hôm nay 5, lịch hôm nay 2, hoàn thành 3. Leader 6/6. Deputy 4/4. Tất cả khớp SQL |
| Drill-down Sale ×3 | Mở bằng chuột; focus vào "Đóng chi tiết". Đóng lần lượt bằng Escape; Tab tới "Quay lại báo cáo" + Enter; click "Đóng chi tiết". Cả 3 lần overlay về 0 và focus trở về đúng nút mở |
| Leader / deputy | Menu 6 danh mục + Phân tích nâng cao. `/reports/audit`, `/broadcast`, `/automation` chuyển về `/`. Tổng quan, Sale, AI và `/reports-co-ban` trả 200 |
| Member / deputy không có grant | Không có nút Báo cáo; mọi `/reports/*` và `/reports-co-ban` chuyển về `/`; 0 request report |
| Admin org Y | 10 mục menu, mọi route 200, chỉ dữ liệu org Y |
| `/reports-co-ban` (admin) | Nhập ngày bằng bàn phím thật. Bảng tin nhắn hiện `2026-11-01 18 6`, đúng response API (số này bị F6B3-1 làm sai). "Xuất Excel" tải được file thật, mở bằng exceljs: `cancelled 1 / completed 2 / no_show 1`, khớp API |
| `/reports-co-ban` khi lỗi | `/reports/appointments` trả 503: **không có alert, 6 dòng cũ vẫn hiển thị** (`reports-co-ban-fault.png`). Đây là F6B3-2 |

#### H. Regression/build — PASS

| Lệnh | Kết quả |
|---|---|
| `frontend`: `npm.cmd run build` | PASS (cảnh báo chunk > 500 kB) |
| `frontend`: `vitest run` | **18 file, 145/145 PASS** |
| `backend`: `vitest run` 17 file report/scope/AI/custom/period/tenant/saved/characterization, `DATABASE_URL` = app role trên DB disposable | **17 file, 112/112 PASS** |
| `backend`: `tests/security/refresh-token-service.test.ts` bằng owner trên DB disposable | **10/10 PASS**, không skip |
| `backend`: `npm.cmd run build` (`tsc`) | PASS |

#### I. Hiệu năng — PASS (ghi nhận, không phải SLA)

Nguồn: `oracle/route-metrics.json`. Mỗi route gọi 3 lần. `q` = số câu `execute` của app role, đã trừ `set_config`/BEGIN/COMMIT, có tính lookup của auth. Thời gian là trung vị.

| Route | Admin q / HTTP / DB | Leader q / HTTP / DB | So với A (q) |
|---|---|---|---|
| overview | 21 / 52,9 ms / 1,01 ms | 25 / 64,2 / 1,13 | trùng 21/25 |
| sales-performance | 14 / 32,3 / 0,69 | 18 / 42,6 / 0,80 | trùng 14/18 |
| ai | 6 / 15,4 / 0,38 | 10 / 29,7 / 0,56 | trùng 6/10 |
| export messages / contacts / appointments | 5 / 17–20 / 0,16 | 9 / 31–32 / 0,35–0,37 | A chưa đo |
| messages / contacts / appointments | 5–6 / 13–19 / 0,18–0,25 | 9–10 / 30–31 / 0,37–0,44 | A chưa đo |

- Câu đơn chậm nhất 0,197 ms. Dữ liệu fixture rất nhỏ, không suy ra SLA production.
- **Giới hạn harness:** notifications, privacy/status, action-hub, public/org-branding không được đăng ký. Đây là giới hạn harness, không phải lỗi production. Browser lượt này không ghi nhận 404 nào làm hỏng trang báo cáo.

### Finding

| ID | Mức | Có chặn 6B | Nội dung và bằng chứng | Điều kiện remediation cho lượt A sau |
|---|---|---|---|---|
| F6B3-1 | MEDIUM | **Có** | Xem chi tiết bên dưới bảng | Xem chi tiết bên dưới bảng |
| F6B3-2 | MEDIUM | **Có** | Xem chi tiết bên dưới bảng | Xem chi tiết bên dưới bảng |
| F6B3-3 | LOW | Không | Xem chi tiết bên dưới bảng | Xem chi tiết bên dưới bảng |
| E-1 | MEDIUM | Không chặn 6B; là điều kiện trước khi apply RLS staging/production và cần quyết định trước 7A | 28 bảng có `org_id` chưa có policy; 6 model chưa vào `ORG_SCOPED_MODELS`. Không bảng nào trên đường dữ liệu báo cáo | Thêm policy và tenant-guard, kiểm thử SELECT/UPDATE/INSERT cross-org bằng app role |
| O-1 | LOW | Không | `automation-report-routes.ts:57-59` và `broadcast-report-routes.ts:43-45` kiểm tra role trong JWT, không đọc role hiện tại trong DB. Admin bị hạ quyền vẫn xem được trong thời gian sống của access token | Tùy chọn: dùng `resolveReportScope` |
| O-2 | ghi chú | Không | Mỗi lần login chạy auto-seed scoring (`seed-defaults.ts:156`, cảnh báo unique khi login đồng thời). Ngoài phạm vi báo cáo | — |

**F6B3-1 (MEDIUM, chặn 6B).** Ở phạm vi org, báo cáo cơ bản, export, custom và saved report lệch với [00-contract.md:118](00-contract.md):

- Nhánh org của `report-scope.ts:76` (`contactReportSql`) và `report-scope.ts:56` (`reportModelWhere`) không có `merged_into IS NULL`. Hệ quả rơi vào:
  - `report-routes.ts:97-110`;
  - `excel-sheet-builders.ts:68-76`;
  - `custom-report.ts:205`, `:214`, `:222` (và saved-run qua đường này).
- Tin nhắn (`report-routes.ts:51-63`, `excel-sheet-builders.ts:30-43`, nhánh org ở `report-scope.ts:81`) không loại `is_local`/`is_deleted`/dry-run/test/hội thoại ảo.
- Bằng chứng: 14 check `*-contract` trong `oracle/api-oracle.json`.

Điều kiện remediation: áp định nghĩa canonical cho nhánh org, gồm loại contact merged và loại các tin local/deleted/dry-run/test/ảo. Nếu muốn giữ định nghĩa cũ thì phải có quyết định contract ghi rõ. Thêm regression ở phạm vi org có fixture merged và dry-run, rồi chạy lại 6B nhóm C.

**F6B3-2 (MEDIUM, chặn 6B).** `/reports-co-ban` không phân biệt request lỗi với dữ liệu cũ:

- `ReportsView.vue:103-142`: `fetchReport` chỉ `console.error` khi lỗi; không có trạng thái lỗi hay "Thử lại", không xóa dữ liệu khi tải lại, không có guard thứ tự request.
- Bằng chứng: khi 503, bảng vẫn hiện 6 dòng cũ (`shots/reports-co-ban-fault.png`).

Điều kiện remediation: thêm error/retry, xóa dữ liệu cũ và thêm guard thứ tự khi đổi tab/kỳ. Kiểm tra lại bằng browser với fault có kiểm soát.

**F6B3-3 (LOW, không chặn).** Vẫn ở `/reports-co-ban`:

- Tab Khách hàng bỏ qua `byStatus`, chỉ đọc `treatmentProgress`/`medicationStatus` vốn không tồn tại (`ReportsView.vue:113-122`).
- Ngày mặc định lấy theo `toISOString()` (UTC) và lùi 30 ngày, thành kỳ 31 ngày (`ReportsView.vue:71-77`). Từ 00:00 đến 06:59 giờ VN, ngày "hôm nay" mặc định sẽ là hôm qua.

Điều kiện remediation: hiển thị `byStatus`; lấy ngày mặc định theo giờ VN.

### Lệnh chính

Tất cả chạy trong `backend/` với `TZ=UTC`.

1. `docker run -d --name reports-6b3-verify-20261102 --tmpfs /var/lib/postgresql/data -p 127.0.0.1:55531:5432 … postgres:15-alpine`
2. `npx prisma db push --config scripts/reports-verification/6b-disposable-prisma.config.ts`
3. `psql < backend/prisma/rls/tenant-rls.sql`
4. `psql < 6b-app-role.sql`
5. `tsx 6b-fixture.ts`
6. `tsx 6b-prisma-boundary.ts` (process TZ VN)
7. `node 6b-pg-default-skew.mjs`
8. `tsx 6b-server.ts` (app role)
9. `tsx 6b-api-oracle.ts`
10. `tsx 6b-rls.ts matrix|runtime`
11. `tsx 6b-route-metrics.ts`
12. `chrome.exe --headless=new --remote-debugging-port=9351 --force-device-scale-factor=1.25 …`
13. `node 6b-browser.mjs`
14. `node 6b-browser-extra.mjs`
15. Lệnh test/build như bảng ở nhóm H.

**Lần thử bị thay thế:** giữ ở `logs/api-oracle-attempt1.log` (695/710; 1 lệch do comparator so sánh JSON theo thứ tự key) và `logs/rls-matrix-attempt1.log` (89/90; lỗi INSERT của helper). Cả hai là lỗi của helper lượt này; kết quả nghiệm thu không bị nới.

### Cleanup

- Đã dừng harness PID 21600 và Chrome của lượt này.
- Đã xóa profile `chrome-6b3-profile` và container `reports-6b3-verify-20261102`.
- Listener 55531, 55532, 9351 = 0. Không còn process nào có `6b3`/`6b-server` trong command line.
- Đã reset `http/scenario.json` về `{}`.
- Không đụng `reports-1b-verify-20261101`, `sketchup-api-1` hay process của ứng dụng khác.
- Artifact không chứa JWT, mật khẩu hay hash mật khẩu (đã quét).

### Phạm vi chưa chạy

- Giá trị so với SQL chưa kiểm cho nick-fleet, lead-pool, engagement, audit, crm-usage, `/reports/automation` legacy và analytics funnel/team/response-time (chỉ kiểm quyền/status).
- Chưa kiểm saved-report POST/PUT/DELETE.
- Chưa replay migration, chưa apply RLS staging/production; chưa có Safari/iPhone/PWA/VoiceOver thật; chưa đo tải/query plan đại diện; quyền chuyên biệt/self-report chưa rollout.

**Bước tiếp:** lượt A sửa F6B3-1 và F6B3-2 (hoặc có quyết định contract ghi rõ), rồi chạy lại 6B. E-1 cần quyết định trước 7A. **7A/7B NOT_STARTED.**

---

## 6B lần 2 — 02/11/2026 15:53 (+07): BLOCKED tại preflight

Docker API trả permission denied và sandbox không có quyền ghi artifact. Không thực hiện kiểm tra dang dở.

Chi tiết: [artifact preflight](../../artifacts/reports-6b2-verification-20261102-1553/6b2-preflight.md).

## 6B lần 1 — 02/11/2026 15:29 (+07): BLOCKED

Docker Desktop Linux engine trả permission denied, nên không tạo được DB disposable mới. Lượt đó chỉ đọc source và `6a3-server.ts`. Build bị EPERM khi ghi `frontend/node_modules/.tmp` và `backend/dist`. Không chạy DB, API, RLS hay browser độc lập.

Chi tiết: [6b-report](../../artifacts/reports-6b-verification-20261102-1529/6b-report.md).
