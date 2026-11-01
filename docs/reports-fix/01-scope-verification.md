# Kiểm tra lại 1B — PASS phạm vi foundation

Ngày 01/11/2026, Asia/Ho_Chi_Minh. Test lúc 19:46:47 +07; báo cáo sau đối chiếu source. HEAD tham chiếu `1b910e3971841afeec83d53bc0539f3d50167f5d`; đối tượng là working tree chưa commit, có thay đổi AI và gỡ TikTok từ trước.

**Kết luận: PASS cho kiểm tra1B của rollout backend foundation đã chốt.** F1/F2 đã đóng bằng source và test hành vi đúng; chưa thấy lỗi chặn mới trong phạm vi kiểm tra. Được chuyển sang2A. Lượt này chưa triển khai bước2, không chứng nhận production hoặc hoàn thành mọi role/UI trong ma trận đích.

[Kết quả FAIL trước sửa](01-scope-verification-before-f1-f2.md) được sao lưu nguyên byte, không xóa bằng chứng cũ. [Snapshot triển khai](01-f1-f2-source-snapshot.json) khớp **6/6 hash** cả đầu và cuối review. [Snapshot kiểm tra lại](01-scope-reverification-snapshot.json) ghi mã đã kiểm tra và test review mới.

## F1 — PASS: tin nhận không mất khi nhóm user

Đã lần theo direct POST `/api/v1/analytics/custom` và saved custom run đến service thật, không mock analytics-service hoặc report gate trong test review mới.

- `backend/src/modules/analytics/analytics-routes.ts:30`: gate report; `:82`: truyền scope của request vào executeCustomReport.
- `backend/src/modules/analytics/saved-report-routes.ts:123`: gate lại quyền hiện tại; `:124`: lấy viewer scope; `:127`: lookup config kèm orgId và createdBy trong subtree; `:142`: executeCustomReport với scope này.
- `backend/src/modules/analytics/reports/custom-report.ts:103`: nhánh received/user riêng. `:111`: dùng main messageReportSql và sender contact, cùng kỳ với day. `:113`: scope rỗng không sinh bucket giả. `:121`: sent/user tiếp tục giữ people predicate, không bỏ ràng buộc actor.
- `backend/src/modules/dashboard/report-scope.ts:82`: people SQL giữ readable nick AND userIds; `:83`: main SQL giữ owned nick và xử lý contact inbound riêng.
- `custom-report.ts:49` và `:59`: union label rồi căn từng dataset theo label. Không đặt bucket tin nhận vào tên nhân viên khi chọn nhiều chỉ số; count thiếu=0, mean chưa đo=null.

Fixture PostgreSQL bộ nhớ của regression: main inbound=1 theo ngày và theo user, user label là **Chưa xác định nhân viên**. Tin nhận shared-only/ngoài quyền/tổ chức khác không vào main của phòng. Scope rỗng vẫn rỗng; org-admin chỉ đếm org-a=3. Tin gửi Sale A trên main+shared=2, Sale B và foreign bị loại.

Test HTTP review mới: direct và saved custom cùng trả labels `[Sale A, Chưa xác định nhân viên]`, sent `[2,0]`, received `[0,1]`. JWT fixture cố tình có role owner cũ nhưng DB fixture là leader: kết quả vẫn scope phòng. Không suy người nhận/chủ nick thành nhân viên đã thực hiện.

**Bằng chứng test:** `backend/tests/unit/report-1b-review-evidence.test.ts:33`, `:37`, `:42`, `:46`; `backend/tests/unit/report-1b-reverification-http.test.ts:79`.

## F2 — PASS: counter tách main và shared-only

- `backend/src/modules/analytics/reports/response-time.ts:20`: query event có orgId từ session, readable account scope, isVirtual=false, threadType=user, isLocal/isDeleted=false và asOf. `:22`: lấy zaloAccountId từ conversation trong DB.
- `response-time.ts:26`: main theo accountIds. `:27`: shared-only = readableAccountIds MINUS accountIds. `:29` và `:30`: pairing riêng từng tập, nick trùng main/grant không bị cộng hai lần.
- `response-time.ts:33` và `:34`: cặp thật trên cả hai tập vẫn phải có actor trong user scope. `:36`: tên user tiếp tục AND reportModelWhere. Không loại bỏ legitimate shared reply để làm counter đẹp.
- `response-time.ts:48`: pending/unattributed alias main-only. `:49` và `:50`: xuất mainPending/sharedPending/mainUnattributed/sharedUnattributed riêng. Không có cặp -> mean null; response 0 giây vẫn là 0; vượt limit -> unavailable, không xuất counter giả 0.
- `backend/src/modules/dashboard/response-turns.ts:15`: inbound liên tiếp thay tin chờ; `:19`: human đầu tiên đóng lượt; `:21`: unknown actor vào unattributed, không gán chủ nick hoặc ghép sang reply sau.
- `backend/src/modules/analytics/saved-report-routes.ts:140` và `analytics-routes.ts:66`: direct/saved response-time dùng cùng service với viewer scope.

Test HTTP: main pending=1, shared pending=1, main unknown=0, shared unknown=1. Sau thu hồi shared grant ở request tiếp theo, query chỉ còn nick-a, shared counters=0, main pending vẫn1. Saved response_time trả cùng kết quả với direct endpoint. Service regression còn xác nhận main0/shared1, trùng grant chỉ tính main một lần, org-admin main toàn org, shared reply của nhân viên trong scope vẫn60 giây, người ngoài scope đóng lượt nhưng không được credited.

**Bằng chứng test:** `backend/tests/unit/response-time-service.test.ts:29`, `:39`, `:47`, `:53`; `backend/tests/unit/report-1b-reverification-http.test.ts:90`, `:100`, `:107`, `:116`. Ca revoke dùng fixture adapter, không phải quyền DB/RLS thật.

## Các đường scope còn lại đã đối chiếu

| Hạng mục | Kết quả và source |
|---|---|
| Current identity, role và grants | PASS local: report-scope.ts:18–37 đọc DB hiện tại; scope-policy tests có leader/deputy singleton, access revoked, group archived, admin trong org, view_all không global |
| Main contact và collaborator | PASS predicate: report-scope.ts:60 và :76; assigned user scope, department merged excluded; PGlite có main/shared-only/merged/foreign đối chứng. Không suy quyền tổ chức từ contact access |
| Sales/leaderboard | PASS scope: report-analytics-routes.ts:286, :297–305; user/contact/appointment/leadRequest AND scoped helper. CRM usage :1039 có people predicate |
| Analytics team/funnel | PASS scope: team-performance.ts:36, :51, :65, :76 và conversion-funnel.ts:35, :57; scope không chỉ dừng ở menu/gate |
| Report cơ bản/export | PASS static propagation: report-routes.ts:163–179 gate và truyền scope vào builder; excel-sheet-builders.ts:36, :70, :101 dùng message/contact/appointment scope. Chưa tải và đối chiếu workbook từ Prisma/DB thật |
| Audit/legacy automation health | PASS scope gate: report-analytics-routes.ts:580, :864 dùng adminOnly=true. Test alias không thể bỏ requirement |
| automation-summary/broadcast | Giữ policy admin-only, không mở role: automation-report-routes.ts:56, broadcast-report-routes.ts:40, query theo org. Gate legacy dựa user role hiện hữu; không chứng nhận toàn bộ luồng JWT demotion/revocation của các endpoint ngoài resolver mới |
| Saved object unreadable / report access revoked | PASS HTTP: unreadable config404 trước aggregate; revoked report access403 trước config lookup hoặc query dữ liệu. CRUD config giữ owner-scope hiện hữu, chưa xác minh JWT thật cho mọi CRUD |

Không thấy đường aggregate/export **trong patch scope được rà** bỏ giới hạn viewer. Kết luận này là phạm vi source/fixture, không phải chứng nhận an toàn toàn repository.

## Lệnh và kết quả thực tế

Working directory `F:\ZaloCRM-CorepViet\backend`:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/custom-report-sqli.test.ts tests/unit/report-scope-policy.test.ts tests/unit/response-turns.test.ts tests/unit/report-scope-postgres.test.ts tests/unit/saved-report-scope.test.ts tests/unit/response-time-service.test.ts tests/unit/report-http-scope.test.ts tests/unit/custom-report-response-time.test.ts tests/unit/report-1b-review-evidence.test.ts tests/unit/report-1b-reverification-http.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Vitest4.1.4 lúc **19:46:47 +07**: **11 files passed, 60 tests passed**, exit0, duration3.10s. TypeScript exit0, không diagnostics.

**Phân loại60 test:** 57 test khẳng định scope, hành vi đã sửa hoặc hạ tầng; 3 characterization trong reports-review-evidence.test.ts:52/:60/:71 còn tái hiện fixed KPI0, lịch tương lai vào hôm nay và cửa sổ UTC lệch ngày VN. Chúng thuộc bước2–3, không dùng pass của3 ca này để tuyên bố các lỗi ấy đã sửa. Ba oracle F1/F2 cũ nay đã chuyển sang hành vi đúng, có thêm counterexamples.

Test review mới gồm5 ca HTTP, không sửa implementation: direct/saved custom; counter và revoke grant; revoke report access; saved response_time; config unreadable. Dùng Fastify inject, không listen cổng. PGlite `new PGlite()` ở test:29, không URL/path, schema và dữ liệu giả, đóng sau suite. SQL custom chạy trên PostgreSQL engine bộ nhớ; Prisma ORM, auth và membership dùng fixture adapter. Không bootstrap app, cron/queue, socket, provider AI hoặc gửi tin. Việc chạy test ngoài sandbox chỉ tránh lỗi Vitest EPERM cache đã gặp ở các lượt trước.

## Thay đổi của lượt review và giới hạn

- Thêm `backend/tests/unit/report-1b-reverification-http.test.ts` và `docs/reports-fix/01-scope-reverification-snapshot.json`.
- Báo cáo hiện hành tại file này; lưu nguyên bản FAIL trước đó vào `01-scope-verification-before-f1-f2.md`. Cập nhật chỉ mục, checkpoint triển khai và README để trỏ đúng trạng thái mới.
- Không sửa source runtime hoặc6 file trong snapshot triển khai; 6/6 hash khớp trước/sau. Không commit/push/merge/worktree/deploy, không kết nối DB thật, không đọc .env/bí mật. Không thấy AGENTS.md trong các ancestor/workspace/subfolder đã kiểm tra; không giao việc agent khác.
- **Chưa xác minh:** Prisma adapter/JWT thật/RLS trên test DB đầy đủ, workbook thật, browser/mobile, performance dữ liệu lớn và production. Không dùng mock/PGlite để thay thế các nghiệm thu đó.
- Quyền CEO/Marketing/HC–NS/self-report đầy đủ, UI shared sections, KPI placeholders, timezone chung và dataset alignment ngoài groupBy=user vẫn theo rollout/step kế tiếp. Không đánh dấu chúng đã hoàn thành vì1B PASS.

**Bước tiếp:** có thể chạy2A theo contract; chưa triển khai trong lượt này. Nếu patch liên quan thay đổi sau snapshot, phải kiểm tra lại phần ảnh hưởng; kết luận PASS này không tự chuyển sang revision khác.
