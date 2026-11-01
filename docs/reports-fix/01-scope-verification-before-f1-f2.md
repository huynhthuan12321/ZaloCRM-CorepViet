# Kiểm tra độc lập1B — Patch scope Báo cáo

> Cập nhật sau triển khai F1/F2 ngày01/11/2026: tài liệu này giữ nguyên kết quả FAIL của **patch trước sửa**, không phải kết luận kiểm tra cho patch hiện tại. Xem [patch sửa và55 local tests](01-f1-f2-fix.md); cần kiểm tra lại1B trên snapshot mới.

Ngày01/11/2026, bắt đầu18:58 +07; test19:04:39 +07. Workspace `F:\ZaloCRM-CorepViet`. HEAD tham chiếu `1b910e3971841afeec83d53bc0539f3d50167f5d`; kiểm tra working tree có file untracked, không phải revision đã commit.

## Kết luận: FAIL

**Chưa chuyển bước2, chưa nghiệm thu/deploy patch.** Có2 lỗi mứcP2 cần sửa trong phần custom report và các counter của response-time. Không tìm thấy bằng chứng vượt tổ chức trong các đường/fixture đã kiểm tra; không dùng kết luận giới hạn đó làm chứng nhận an toàn toàn hệ thống.

Rà từ source và query, không chỉ từ checkpoint1A hoặc kết quả45 test cũ. Snapshot1A có20 file, **20/20 SHA256 khớp** trước review; không sửa implementation. Chỉ thêm test bằng chứng review, tài liệu này và cập nhật chỉ mục.

## F1 — P2: Tin nhận bị loại hết khi custom report nhóm theo nhân viên

**Vị trí:** `backend/src/modules/analytics/reports/custom-report.ts:93–102`; predicate trong `backend/src/modules/dashboard/report-scope.ts:79–84`.

Đường vào: POST `/api/v1/analytics/custom` hoặc saved-report type custom → executeCustomReport → queryMessageMetric. Khi `groupBy='user'`, code dùng `messageReportSql(scope,'people')` cho cả messages_sent và messages_received. Ở scope phòng, predicate people yêu cầu `m.replied_by_user_id = ANY(scope.userIds)`.

Tin khách đến hợp lệ có sender_type='contact', replied_by_user_id=NULL. Nó qua main predicate khi group theo day, nhưng bị loại khi group theo user. Kết quả trả labels/dataset rỗng, không có thông báo unsupported/unavailable hoặc nhóm chưa xác định. Đổi nhóm làm mất dữ liệu, không chỉ đổi cách trình bày.

**Bằng chứng chạy SQL thật trong PGlite bộ nhớ:** `backend/tests/unit/report-1b-review-evidence.test.ts:28–34`:

- Cùng fixture1 tin inbound trong orgA, nickA, thuộc phạm vi leaderA.
- messages_received/groupBy day → `data=[1]`.
- messages_received/groupBy user → `labels=[]`, `data=[]`.
- Không có tin ngoài org/phòng hoặc request nới scope trong fixture.

**So với baseline:** HEAD dùng orgId ở nhánh groupBy user, giữ được inbound dưới nhãn N/A vì authorNULL; patch thêm predicate actor nên loại nó. Cách nhóm N/A cũ chưa phải attribution nghiệp vụ hoàn chỉnh, nhưng việc âm thầm biến inbound hợp lệ thành rỗng là regression mới. Checkpoint1A có ghi đây là giới hạn chờ bước3; ghi chú không đủ để nghiệm thu hồi quy của query vừa sửa.

**Yêu cầu sửa:** tách hợp đồng sent theo actor và received theo người. Không suy khách nhắn=chủ nick đã thực hiện. Nếu chưa có attribution hợp lệ cho received/user, trả trạng thái không hỗ trợ/unavailable rõ ở API/consumer hoặc bucket chưa xác định vẫn trong scope, thay vì kết quả rỗng như đã đo. Không nới outbound actor predicate để sửa inbound. Thêm regression mong đợi hành vi đúng sau khi chọn cách biểu diễn.

## F2 — P2: Pending/unattributed gộp dữ liệu nick cấp thêm mà không khai báo/tách scope

**Vị trí:** `backend/src/modules/analytics/reports/response-time.ts:19–25,39`; `backend/src/modules/dashboard/response-turns.ts:22–27`.

Service lấy events trên `readableAccountIds` gồm main+explicit grants. Sau pairing, chỉ `pairs` được lọc tiếp theo userIds. `pending` và `unattributed` lại lấy nguyên từ bước pairing rồi trả như scalar tổng; response không có main/shared partition hoặc nhãn scope riêng cho chúng.

Nguyên tắc đã duyệt: dữ liệu cấp thêm phục vụ phối hợp, không âm thầm nhập KPI chính; nhân viên thực sự trong scope vẫn được credited khi gửi trên nick được phép. Việc dùng readable accounts để tính pair có actor là đúng; vấn đề là đem counter chưa có actor/không phân loại nick trả chung với số liệu đã lọc people.

**Hai fixture qua service thật, Prisma được mock:** `backend/tests/unit/report-1b-review-evidence.test.ts:35–48`:

1. Scope userA, mainAccounts=[nickA], readableAccounts=[nickA,nickB]. Chỉ có inbound chờ trên nickB được cấp thêm, không có cặp trong main hoặc credited people. API vẫn `overall=null`, `byUser=[]`, **pending=1**; không có mainPending/sharedPending.
2. Chỉ có inbound và native human reply thiếu actor trên nickB → **unattributed=1**, không có sharedUnattributed. Không có attribution cho nhân viên trong phòng.

**Mức độ:** đây là sai scope/ý nghĩa tổng hợp, **không phải bằng chứng rò dữ liệu ngoài read grant**: viewer thực sự được cấp đọc nickB. Không quy chụp là vượt tổ chức hay lộ nội dung tin nhắn. Tuy nhiên response hiện không cho consumer biết counter nào đến từ phần cấp thêm, trái nguyên tắc tách main/shared.

**Yêu cầu sửa:** giữ việc đóng lượt bởi human reply ngoài scope/unknown actor; không xóa event boundary để ghép sai sang người tiếp theo. Cần phân loại nguồn account trước khi tổng hợp counter và trả main/shared riêng, hoặc trả scopeBasis/counter riêng cho operational readable-account view với consumer gắn nhãn đúng, không trộn vào main people KPI. Thêm test main0/shared1 và thu hồi grant; pairs có actor vẫn credited đúng như test1A.

## Phần đã xác minh đạt trong phạm vi local

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
|Gate identity/role/grants hiện tại|PASS local|report-scope.ts:18–37; report-scope-policy.test.ts, HTTP inject. Không chỉ tin role cũ từ JWT|
|Leader/deputy singleton|PASS local|Resolver kiểm deptRole, không dùng size>1; test singleton|
|view_all không tự global|PASS local|Resolver chỉ cho non-admin department trong rollout; explicit grant không thêm user ngoài phòng|
|Main contact vs collaborator|PASS predicate|assignedUserId+mergedInto ở reportModelWhere/contactReportSql; PGlite loại shared-only và merged|
|Main fleet vs readable accounts|PASS local|accountIds tách readableAccountIds; testSQL main không có nickB, people ghi saleA trên nickB không ghi saleB|
|Saved-run|PASS đường đã test|saved-report-routes.ts:123–142 gate+createdBy subtree+viewer scope; revoked access dừng trước lookup|
|Export/cơ bản|PASS static scope propagation|report-routes.ts:167–179 truyền scope; excel-sheet-builders.ts:36,70,103 dùng predicate tương ứng. Chưa load/xác minh workbook từ Prisma thật|
|ORM/raw-query scope markers|PASS cấu trúc trong patch|Các query changed đều AND scope/helper; marker có mặt không chứng minh mọi công thức đúng, như F1/F2 minh họa|
|System Audit và legacy Automation health|PASS local|RA gate adminOnly=true tường minh; thử alias không được dùng URL spelling để bỏ requirement|
|Response last-inbound→human đầu tiên|PASS các ca đã test|09:00/09:04→09:05=60s; AI/bot không đóng lượt, outside/unknown human đóng nhưng không credited|
|Không có cặp/0 giây/overflow|PASS service cases|null cho thiếu cặp,0 giây giữ0, >50000 events trả unavailable thay vì mẫu bị cắt|
|Bound SQL parameters|PASS regression cũ|custom-report-sqli và PGlite; alias SQL là hằng số code, không lấy từ query/body|

**Privacy validation:** đã đọc `backend/src/modules/privacy/redact.ts:168–189`: Contact Cha identity được giữ theo policy cập nhật, preview/content nick riêng tư vẫn bảo vệ. Không coi việc report trả tên contact thuộc scope là lỗi chỉ dựa vào comment PII cũ đầu file. Report response-time không trả message.content hoặc metadata ra response. Không tìm thấy đủ bằng chứng để báo một finding nội dung chat riêng tư trong patch này.

## Những giới hạn cũ/đã nêu không gộp thành findings mới

- KPI0, UTC/date filter cũ, formula chốt và stale UI còn trong bước2/3, được checkpoint ghi đúng là chưa sửa.
- Bộ lọc userId/status và alignment nhiều dataset của custom report chưa hoàn chỉnh từ trước. Không coi các filter ấy là quyền có hiệu lực.
- Chưa rollout toàn bộ nhóm CEO/Marketing/HC–NS/Sale cá nhân, capability cấu hình, UI shared sections; đã giới hạn rõ ở contract/1A. Không đánh dấu tính năng đó đã có, nhưng cũng không coi nó là phần grant đã vô tình được mở ở patch.
- CRUD saved config dùng owner-scope hiện hữu; khác đường run vừa sửa. Chưa kiểm thử end-to-end demotion với JWT thật cho tất cả CRUD. Không khẳng định cơ chế revoke của mọi endpoint đã được chứng nhận.
- Mean response đã đổi nguồn, nhưng các consumer/UI vẫn có phần chưa đọc availability/reason; Team/Chart chưa được nghiệm thu browser. Không dùng kiểm tra source backend làm bằng chứng UI hoàn thiện.

## Lệnh và kết quả chạy độc lập

Working directory `F:\ZaloCRM-CorepViet\backend`:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/custom-report-sqli.test.ts tests/unit/report-scope-policy.test.ts tests/unit/response-turns.test.ts tests/unit/report-scope-postgres.test.ts tests/unit/saved-report-scope.test.ts tests/unit/response-time-service.test.ts tests/unit/report-http-scope.test.ts tests/unit/custom-report-response-time.test.ts tests/unit/report-1b-review-evidence.test.ts

node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Kết quả01/11/2026 **19:04:39 +07**: Vitest4.1.4, **10 files passed/48 tests passed**, duration2.12s, exit0. TypeScript `--noEmit`: exit0, không diagnostics.

Trong48 test có45 test implementation đã có và3 **characterization test mới tái hiện defects**. Không được gọi48 PASS là patch PASS1B. Khi sửa, chuyển expectation tương ứng sang hành vi đúng, giữ tài liệu/bằng chứng cũ.

Database evidence dùng PGlite bộ nhớ `new PGlite()` không URL/path; schema nhỏ và dữ liệu giả do test tạo, đóng sau test. `$queryRaw` được mock thành executor thực thi Prisma.sql.text/values trên engine này. Không Prisma adapter/DB server thật, không .env, không JWT thật, RLS, cron, provider AI, Zalo/Telegram hoặc gửi tin. Fastify tests dùng inject, auth mock, không listen port.

## Tính nguyên vẹn và phạm vi review

- Chỉ review mã Báo cáo/analytics, scope helper, pairing và các test liên quan; giữ nguyên thay đổi AI/TikTok của workspace. Snapshot1A20/20 khớp cả trước và sau review; test bằng chứng mới không sửa source hoặc test cũ.
- File thêm: `backend/tests/unit/report-1b-review-evidence.test.ts`; `docs/reports-fix/01-scope-verification.md`. File cập nhật: chỉ mục `docs/reports-fix/README.md`.
- Không sửa contract1A, snapshot1A, implementation hoặc artifact local-checks cũ; không commit/push/deploy.
- Không thấy AGENTS.md trong workspace và hai path ancestor đã kiểm tra. SECURITY.md hiện là template, không có policy ứng dụng cụ thể để mở rộng phạm vi.
- Đã đọc skill security-diff-scan và references. Workflow scan chuẩn cần baseline phù hợp và inventory thay đổi; workspace hiện trộn patch khác ngoài scope user. Không khởi tạo scan plugin/canonical report hoặc sửa cấu hình Codex; đây là **review1B thủ công có test bằng chứng**, không phải scan Codex Security đã complete/sealed. Đích report theo yêu cầu người dùng được giữ ở file này. Giới hạn này không ngăn hoàn tất review1B được yêu cầu.

**Chưa xác minh:** JWT/RLS/Prisma integration trên database test đầy đủ, workbook thực tế, browser/mobile, hiệu năng dữ liệu lớn và production. Không tuyên bố end-to-end PASS. Review hiện FAIL vì hai hành vi tái hiện, không chỉ vì thiếu môi trường integration.

## Bước kế tiếp

Sửa F1 và F2 trong phạm vi patch1A bằng prompt “Sửa sau kiểm tra — bước1”; không sửa test để hợp thức hóa mất dữ liệu hoặc nhập main/shared. Chạy regression+3 oracle mới, rồi kiểm tra1B lại trên snapshot patch mới. **Chưa chuyển bước2 hoặc phát hành**. Các ưu tiên triển khai tiếp theo giữ nguyên sau khi1B đạt.
