# Checkpoint triển khai sửa Báo cáo

Cập nhật01/11/2026, Asia/Ho_Chi_Minh. HEAD tham chiếu: `1b910e3971841afeec83d53bc0539f3d50167f5d`. Checkout có thay đổi chưa commit từ trước; patch báo cáo cũng chưa commit/deploy.

| Bước | Nội dung | Triển khai A | Kiểm tra độc lập B |
|---|---|---|---|
| 0 | Contract, nguồn dữ liệu, baseline | PASS — đã cập nhật quyết định người dùng | PASS contract rollout nền; giữ lịch sử BLOCKED |
| 1 | Phạm vi quyền | PASS — foundation, đã sửa F1/F2 | PASS kiểm tra lại1B; chưa phải nghiệm thu DB/RLS/browser |
| 2 | Kỳ Việt Nam và công thức thời gian | PASS — triển khai2A và xử lý phát hiện | PASS — kiểm tra lại sau remediation |
| 3 | KPI, dữ liệu thiếu và lỗi tải | REMEDIATION_IMPLEMENTED_PENDING_VERIFICATION — sửa các phát hiện 3B, chạy local regression checks; xem `03-kpis.md` | FAIL ban đầu — remediation đã có, cần kiểm tra độc lập lại; xem `03-kpis-verification.md` |
| 4 | Báo cáo AI | NOT_STARTED | NOT_STARTED |
| 5 | Giao diện mobile | NOT_STARTED | NOT_STARTED |
| 6 | Nghiệm thu tích hợp | NOT_STARTED | FAIL/BLOCKED — PostgreSQL/RLS hiện6/15 PASS,9/15 FAIL |
| 7 | Hồ sơ phát hành | NOT_STARTED | NOT_STARTED |

- [Contract bước0](00-contract.md): kết quả source review, policy hiện tại/đích và định nghĩa metric.
- [Baseline bước0](00-baseline.md): lệnh chạy, kết quả, giới hạn fixture và cách kiểm tra an toàn.
- [Snapshot source](00-source-snapshot.json): SHA256 file liên quan tại thời điểm lập contract; không chứa .env hoặc secrets.
- [Bộ prompt A/B](../prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md).
- [Patch1A](01-scope.md): phạm vi backend đã triển khai, rollout role còn lại và các giới hạn.
- [Local checks1A](01-local-checks.md):45 test PASS và TypeScript PASS; không thay kiểm tra1B độc lập.
- [Kiểm tra lại1B](01-scope-verification.md): PASS phạm vi foundation,11 file/60 test đạt; có3 ca tái hiện lỗi bước2–3.
- [Kết quả1B cũ](01-scope-verification-before-f1-f2.md): giữ nguyên FAIL và bằng chứng trước sửa.
- [Sửa F1/F2](01-f1-f2-fix.md): 55 tests PASS tại thời điểm sửa (có3 characterization bước2–3); snapshot mới tại `01-f1-f2-source-snapshot.json`. Kiểm tra lại1B đã PASS; xem snapshot `01-scope-reverification-snapshot.json`.
- [Triển khai2A](02-periods.md): chuẩn hóa kỳ báo cáo theo giờ Việt Nam, validation ngày/range và consumers; local checks PASS.
- [Kiểm tra2B](02-periods-verification.md): PASS sau remediation — kiểm tra timezone kép, query message biên ngày trên PGlite, DATE-only, Engagement UI và cohort/unavailable conversion.
- [Nghiệm thu PostgreSQL/RLS](02-postgres-rls-verification.md): đã chạy lại với Docker/PostgreSQL disposable (6/15 PASS, 9/15 FAIL); phát hiện RLS thiếu trên `messages`, HTTP auth/report vẫn 500.
- [Triển khai KPI3A](03-kpis.md): nguồn, công thức, trạng thái khả dụng, giới hạn và local checks; chưa phải nghiệm thu độc lập3B hoặc PostgreSQL/RLS.
- [Kiểm tra KPI3B](03-kpis-verification.md): 20 backend tests, 4 frontend tests, type-check/build và browser fake-data; **FAIL**, không thay thế nghiệm thu PostgreSQL/RLS.
- [Remediation 3B](03-kpis-verification.md#cập-nhật-remediation): các lỗi được sửa, tỉ lệ trả Lead Pool fail-closed đến khi xác nhận mẫu số; local checks mới 10 backend + 6 frontend test PASS. Cần tái nghiệm thu 3B.

Đối chiếu lại 3B lúc 22:00 (+07), 01/11/2026: sáu remediation đã có trong source; bổ sung xóa state Engagement khi tải lại và hai test đối chứng. Regression mới 22 backend + 10 frontend PASS; TypeScript và frontend build PASS. Xem phần đối chiếu cuối `03-kpis-verification.md`; chưa nâng trạng thái nghiệm thu toàn bộ 3B.

**Bước tiếp: chạy lại kiểm tra độc lập 3B.** Không dùng local checks để thay PostgreSQL/RLS acceptance: kết quả DB/RLS vẫn FAIL (6/15), và chặn nghiệm thu tích hợp/phát hành cho đến khi sửa tenant-context và bật policy `messages`. Tỉ lệ trả Lead Pool tiếp tục unavailable cho đến khi có mẫu số được xác nhận. Quyết định người dùng đã giải tỏa các câu hỏi contract0B; xem [cập nhật cuối tài liệu review](00-contract-verification.md). Quyền chuyên biệt, self-report và UI phần chia sẻ chưa được rollout.

Trạng thái cho checkpoint: NOT_STARTED; IN_PROGRESS; COMPLETED_PENDING_VERIFICATION; PASS; FAIL; BLOCKED. PASS của test tái hiện lỗi không phải PASS nghiệm thu ứng dụng. B phải kiểm tra lại nếu patch hoặc contract thay đổi liên quan.

Chỉ tạo checkpoint của bước tương ứng khi thực hiện; không tạo sẵn nội dung giả cho bước2–7. Bước0 không sửa runtime; bước1A có patch backend. Không thay schema/send policy/cấu hình AI hoặc deploy.
