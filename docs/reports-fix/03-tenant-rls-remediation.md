# Sửa các điểm chặn 3B — tenant, RLS và KPI

**Cập nhật mới nhất 01/11/2026 23:18 (+07): 3B PASS local cho contract/rollout nền.** Đã có browser recheck mới 20/20 kịch bản trên 8 view, DB/JWT/HTTP chạy lại 29/29 PASS; không sửa runtime trong lượt này. Xem [báo cáo browser, source và giới hạn](03-browser-recheck.md). Các phần “chưa ký 3B” hoặc CDP timeout bên dưới là lịch sử. Bước4 chưa bắt đầu; không commit/deploy, không tính đây là nghiệm thu staging/production.

Ngày 01/11/2026, 22:48 (+07). **PASS phạm vi patch và các kiểm tra local bên dưới; chưa ký nghiệm thu toàn bộ 3B, chưa bắt đầu bước 4.** HEAD tham chiếu `eb1be0b`; patch đang ở working tree, không commit/deploy. Các thay đổi AI/TikTok và Automation/Broadcast có sẵn được giữ nguyên.

## Lỗi đã sửa và bằng chứng source hiện tại

| Lỗi trước sửa | Hành vi sau sửa / source |
|---|---|
| Login 500 vì lấy profile ngoài tenant; seed scoring cũng mất scope | `auth-routes.ts:36` seed trong tenant; `:96` profile trong tenant xác định từ user đã xác thực. Không bypass cho truy vấn nghiệp vụ. |
| `enterWith` trong async preHandler không truyền context vào continuation của Fastify | `auth-middleware.ts:58` dùng callback hook, chạy `done()` trong `withTenant` tại `:70`. Sửa wrapper public-prefix ở `contacts/zinstant-proxy-routes.ts` để giữ callback. Có test request đồng thời A/B và async hook kế tiếp. |
| Lazy PrismaPromise chỉ thực thi sau khi `storage.run` đã thoát | `shared/tenant/tenant-context.ts`: `withTenant`, `runSystemQuery`, `runWithRlsApplied` đều await callback trong frame của storage. Test thenable chứng minh context còn tồn tại khi thực thi. |
| Bảng messages không có RLS | `prisma/rls/tenant-rls.sql:26`: ENABLE/FORCE, USING + WITH CHECK cho messages. Script hiện có 70 CREATE POLICY; con số 62 trong header cũ không phải inventory hiện tại. Chỉ áp script trên container test, không production. |
| Raw aggregate không được gắn tenant, dù model query đã có | `shared/database/prisma-client.ts:139`: top-level `$allOperations` bao gồm raw SQL. `tenantTransaction` tại `:174` bao cả SET LOCAL trong frame không rewrap để giữ cùng connection. Test raw + model trong interactive transaction đều đọc đúng 2 messages org B. |
| Overview/Sales/CRM Usage trả 500 trên schema thật vì `c.thread_type` không tồn tại | `dashboard/report-analytics-routes.ts:32`, `:161` dùng `c."threadType"` đúng Prisma schema, không sửa schema để hợp thức hóa SQL sai. |
| Sale hoạt động hôm nay bị tính từ kỳ lịch sử đang chọn | `report-analytics-routes.ts:1269`: group riêng ActivityLog hôm nay theo scope; fixture kỳ hôm qua có 3 thao tác vẫn trả snapshot hôm nay đúng SQL oracle. |
| Audit lấy cả event tương lai | `report-analytics-routes.ts:978`, `:989`, `:1019`: chặn `lt: now` cho snapshot, rolling24h và feed. SQL oracle xác nhận 1/3 event lỗi = 33,3%, loại org B và event tương lai. |
| UI vẫn hứa xếp hạng hiệu quả khi công thức điểm chưa có | `frontend/src/views/reports/SalesReport.vue:228`, `:244`: bảng hoạt động theo Sale, bỏ thứ hạng số và tô top 3; ghi rõ thời gian ước tính. DOM test và browser build mới xác nhận. |

`AutomationReport.vue` không có patch mới trong lượt này: các sửa null/0, đơn vị, period guard và error/retry đã có từ lượt trước. Đã kiểm tra lại bằng DOM test và browser thật, không ghi nhận chúng là thay đổi mới.

## Môi trường và fixture

- Xác minh trước truy vấn ghi: container `reports-1b-verify-20261101`, id `f24db027…`, label `codex.task=reports-1b-local-verification`, tmpfs dữ liệu, port chỉ `127.0.0.1:55471`. DB `reports_1b_verify`, role kiểm tra `reports_verify_app` NOSUPERUSER/NOBYPASSRLS, không sở hữu bảng. Không dùng DATABASE_URL có sẵn hoặc .env làm bằng chứng an toàn.
- DB có schema từ lần `db push` vào database disposable, không phải migration replay. Áp file RLS hiện tại bằng `psql -v ON_ERROR_STOP=1 -1` trong container. Metadata mới: `artifacts/reports-real-verification-2026-11-01/db-after-remediation.json`; `db-setup.json` giữ snapshot trước sửa.
- 2 tổ chức, 2 phòng, nick main/shared, 10 tin giả. CRM hôm qua: 09:00,09:10,10:00 → 10 phút + session tối thiểu 5 phút = 15 phút; kỳ trước 09:00,09:20 → 20 phút. Có người ngoài phòng, org B và event tương lai làm đối chứng. Audit so bằng SQL riêng theo đúng window response.
- Automation hôm qua: accepted1/sent2/rejected1/no_zalo1/error1 → 4 đã gửi, 25% đồng ý; step_sent3/reply1 → 33,3%. Broadcast paused/done giả: gửi3/lỗi1/bỏ qua2 → 75%. Seed cả tổ chức B làm đối chứng, không được cộng vào A. Session giả closed, job giả paused; không tạo run item hoặc khởi động worker/provider.
- Harness loopback 30571 dùng JWT/route/service/Prisma thật, RLS_SET_CONFIG=true và TENANT_GUARD_MODE=enforce. JWT key ngẫu nhiên trong bộ nhớ; token không ghi artifact. Không import app bootstrap, cron, queue, socket hoặc provider. Refresh test riêng dùng role owner trên cùng DB disposable với guard/RLS binding off, không tính là bằng chứng RLS.

## Lệnh và kết quả thực tế

Từ `backend`:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/server.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/metrics.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/automation-fixtures.ts
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55471/reports_1b_verify'
$env:TENANT_GUARD_MODE='off'
$env:RLS_SET_CONFIG='false'
node node_modules/vitest/vitest.mjs run tests/security/tenant-context.test.ts tests/security/tenant-guard.test.ts tests/security/refresh-token-service.test.ts tests/unit/auth-tenant-continuation.test.ts tests/unit/reports-review-evidence.test.ts tests/unit/response-time-service.test.ts tests/unit/report-period-query-boundary.test.ts tests/unit/automation-broadcast-report-availability.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

- Bộ DB/JWT/HTTP ban đầu: **15/15 PASS**, tokenSource=`actual-login` (trước sửa lịch sử 6/15). Thiếu/giả/hết hạn JWT 401; mismatch org 403; direct/saved report và response-time đúng fixture; RLS cấm đọc org khác và không tenant.
- Đối soát metrics + RLS bổ sung: **12/12 PASS**, gồm 8 HTTP requests A/B đồng thời không lẫn raw aggregate; same-org write rollback, cross-org write/no-tenant insert bị 42501; interactive transaction giữ cùng tenant; raw không context trả 0 sau truy vấn có scope.
- Automation/Broadcast có dữ liệu: **2/2 nhóm kiểm tra PASS**. Tổng ba bộ là **29/29 checks local PASS**, không phải 29 test trình duyệt.
- Vitest backend **8 files, 52/52 PASS** tại 22:47; trong đó 10 test refresh dùng DB disposable, các test còn lại là unit/mock. TypeScript exit 0.
- Lần đầu vô tình đưa suite refresh cần DB vào lượt unit chưa override URL: suite lỗi kết nối ở setup/teardown, 10 tests skipped, không tính PASS. Chạy lại với URL container đã xác minh như trên đạt 10/10; không chạy lại với URL mặc định. Không có truy vấn ghi thành công được ghi nhận ở lần lỗi này.

Từ `frontend`:

```powershell
node node_modules/vitest/vitest.mjs run src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts
npm.cmd run build
```

**6 files, 19/19 PASS**; `vue-tsc -b && vite build` exit 0, 3.066 modules. Còn cảnh báo chunk >500 kB/plugin time. `git diff --check` cho patch PASS. Không cài dependency.

## Browser thật

Đăng nhập tài khoản admin giả qua form thật, vào menu Tổng quan → Automation/Audit/Sale & Team. Không inject token, không intercept API trả dữ liệu giả. Sau restart harness với key mới, reload và refresh session vẫn vào report được.

- Automation: Hôm nay không có mẫu số → “Chưa có dữ liệu”, không phải 0%; Hôm qua → 4 lời mời, 1 đồng ý, 25%, 3 tin bám đuổi, 1 phản hồi, 33,3%; chỉ Sale A/nick A có trong bảng.
- Audit: 33,3% lỗi automation; registry cron/queue unavailable, không hiển thị 0 job như số đo thật.
- Sale & Team: tải cả CRM Usage và response-time; build mới có “Hoạt động dùng CRM theo Sale”, không có thứ hạng số/top 3 giả.
- 404 notifications/privacy/dashboard-hub là endpoint không đăng ký trong harness; không dùng chúng làm lỗi mới của ứng dụng hoặc tuyên bố đã kiểm tra các module đó.

Ảnh: `artifacts/reports-real-verification-2026-11-01/automation-postgres-pass.png`, `automation-postgres-populated-pass.png`, `audit-postgres-pass.png`. Source snapshot: `source-after-remediation.json`. JSON kết quả: `results.json`, `metrics-results.json`, `automation-broadcast-db-results.json`. Lịch sử trung gian giữ `results-initial.json`, `results-context-fixed-before-rls.json`, `metrics-before-kpi-fix.json`; lỗi harness ban đầu sai tên bảng và chuyển đổi timezone pg đã được sửa trong script, không tính chúng là lỗi runtime.

## Giới hạn và bước tiếp

PASS cho patch đã nêu, **không tự nâng toàn bộ 3B hoặc bước 6 lên PASS**: cần lượt kiểm tra độc lập toàn ma trận báo cáo sau thay đổi auth/database dùng chung; chưa replay migration, kiểm tra load/query-plan đại diện, hoặc staging/production. Coverage Engagement và mẫu số trả lead vẫn thiếu nên tiếp tục unavailable theo contract, không tự đặt công thức mới. Bước 4 chưa bắt đầu.

HTTP harness được dừng khi kết thúc; container test được giữ ở trạng thái chạy như lúc bắt đầu để tái kiểm tra. Không sửa production, không commit/push/deploy, không gửi Zalo/Telegram/AI.

## Tái kiểm tra độc lập sau remediation — 01/11/2026

- Đã kiểm tra lại identity trước khi chạy: container có label `codex.task=reports-1b-local-verification`, bind `127.0.0.1:55471`, DB `reports_1b_verify`, role app `NOSUPERUSER/NOBYPASSRLS`; `messages` có `relrowsecurity=true`, `relforcerowsecurity=true`. Không chạy lại setup hay migration.
- Chạy lại HTTP/JWT harness: **15/15 PASS**. Chạy `metrics.ts`: **12/12 PASS**; đối chứng CRM Usage hoạt động hôm nay là 2, Audit loại event tương lai/org khác và khớp SQL oracle 33,3%, RLS deny write cross-org/no-tenant. Chạy fixture Automation/Broadcast: **2/2 PASS** (25%, 33,3%, 75%; tổ chức B không lọt vào kết quả). Tổng **29/29 kiểm tra DB/JWT/HTTP local PASS**. Harness HTTP đã dừng, PostgreSQL disposable giữ nguyên trạng thái đang chạy.
- Sáu report DOM specs: **19/19 PASS**; backend `tsc --noEmit` và frontend `npm run build` PASS. Build còn cảnh báo chunk lớn hơn 500 kB. Backend test chia đúng vai trò DB: bảy file unit/security chạy app role **42/42 PASS**; `refresh-token-service.test.ts` chạy riêng bằng role `postgres` trên đúng DB disposable **10/10 PASS**.
- Sai khác cần ghi nhận so với lệnh gộp ở mục trên: chạy cả tám file cùng `reports_verify_app` làm 42 test qua nhưng 10 test refresh bị skip do setup thất bại với `new row violates row-level security policy for table "users"`; suite đó xóa/tạo fixture `test-rt-user` không có tenant context. Không coi lần chạy gộp này là PASS. Tách suite: app role cho bảy file còn lại; owner chỉ cho integration refresh trên DB disposable đã xác minh. **52/52 là tổng của hai lần chạy theo hai role**, không phải một lần chạy.
- Browser CDP không kết nối được với ba tab đang chia sẻ trong lượt tái kiểm tra. Đã xem các PNG lịch sử `automation-postgres-pass.png`, `automation-postgres-populated-pass.png`, `audit-postgres-pass.png`; đây là bằng chứng của lượt 22:48, không ghi nhận là browser run mới. CRM Usage vẫn có bằng chứng HTTP/DB oracle và DOM test, nhưng không có ảnh browser mới.
- Kết luận: xác nhận lại thành công các patch tenant/RLS và KPI đã có bằng chứng DB/local; **toàn bước 3B vẫn IN_PROGRESS, chưa PASS** do chưa hoàn tất browser kiểm tra trực tiếp trong lượt này và không replay migration/kiểm tra query-plan tải đại diện. Coverage Engagement và mẫu số trả lead vẫn unavailable. Bước 4 vẫn NOT_STARTED.
