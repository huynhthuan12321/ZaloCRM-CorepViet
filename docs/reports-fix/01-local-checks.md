# Local checks cho patch1A

Ngày01/11/2026, múi giờAsia/Ho_Chi_Minh. Working directory lệnh dưới là `F:\ZaloCRM-CorepViet\backend`. Chỉ là tự kiểm tra implementation, không mạo danh1B review độc lập.

## Kết quả cuối

```powershell
node node_modules/typescript/bin/tsc --noEmit --pretty false

node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/custom-report-sqli.test.ts tests/unit/report-scope-policy.test.ts tests/unit/response-turns.test.ts tests/unit/report-scope-postgres.test.ts tests/unit/saved-report-scope.test.ts tests/unit/response-time-service.test.ts tests/unit/report-http-scope.test.ts tests/unit/custom-report-response-time.test.ts
```

- TypeScript: exit0, không có diagnostics (kết quả cuối sau bổ sung account/readable scope và grouping tuần).
- Vitest4.1.4: chạy18:53:32 +07, **9 file passed,45 test passed**, duration1.62s, exit0.
- Test không dùng app.ts hoặc database thật. Fastify.inject không listen port; auth và Prisma được mock. PGlite `new PGlite()` không URL/path, dữ liệu nằm trong bộ nhớ và đóng khi xong.
- Lượt sandbox đầu ngày01/11 bị EPERM ở cache rename,0 test thực thi; chạy lại qua escalation đã hoàn tất. Không coi lỗi môi trường đó là test regression.

## Nhóm bằng chứng

| File | Số ca | Kiểm tra |
|---|---:|---|
|reports-review-evidence.test.ts|5|Scope regression, member denied và3 REPRO ngày/KPI chưa sửa|
|custom-report-sqli.test.ts|5|Giữ bound parameter và allowlist, caller khai báo scope tường minh|
|report-scope-policy.test.ts|11|Grant/department/singleton, thu hồi, group archived, cross-org identity, shared-only, admin-only không phụ thuộc URL|
|response-turns.test.ts|7|Last inbound60s, AI/bot, first human, unknown actor, deleted/local/dry-run, asOf, kỳ|
|report-scope-postgres.test.ts|4|SQL thực thi trong bộ nhớ: hai org, ngoài phòng, main/shared, contact merged và scope rỗng|
|saved-report-scope.test.ts|3|Quyền object, viewer scope và thu hồi trước lookup|
|response-time-service.test.ts|4|Service thật với DB mock:60s, outsider closes turn, overflow unavailable,0-second|
|report-http-scope.test.ts|3|Fastify hook/gate, scoped ORM và403 trước handler|
|custom-report-response-time.test.ts|3|Weighted mean, nhãn tuần qua năm, unavailable không thành0|

## Lỗi trung gian được giữ trong lịch sử

- Lượt29/10 cuối:36/39 test đạt;3 custom SQL test lỗi vì thiếu assertDateColumn/groupByDateExpr sau thay thuật toán. Lần vá dự kiến khi đó không thực thi do automatic approval review hết usage limit. Lượt01/11 người dùng yêu cầu tiếp tục; helper đã khôi phục rồi mới chạy lại.
- Một lượt fixture cũ dùng where trực tiếp, trong khi scope mới bọc AND; đã sửa fixture để áp chính predicate AND, không bỏ assertion bảo vệ quyền.
- Khi thêm import scope tường minh, mock queryRaw phải dùng vi.hoisted; các assertion SQL injection được giữ.
- Lỗi helper đã được sửa ở source, không nới test để cho pass. Kết quả32/36/39/41/44 test ở các mốc trước không phải kết quả cuối của patch hiện tại.

## Giới hạn

Không có full-suite/build frontend hoặc nghiệm thu DB/JWT/RLS/browser. Không dùng45 PASS để tuyên bố các KPI/date REPRO đã sửa hoặc toàn ma trận role đích đã được bật. Không thay dữ liệu production/AI/send policy; không commit, push, migration hoặc deploy.
