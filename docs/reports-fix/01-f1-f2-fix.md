# Sửa F1/F2 sau kiểm tra 1B

> Kiểm tra lại1B lúc19:46 ngày01/11/2026 đã PASS phạm vi foundation; xem [báo cáo hiện hành](01-scope-verification.md). Nội dung triển khai bên dưới lưu trạng thái và kết quả tại thời điểm bàn giao trước kiểm tra.

Ngày 01/11/2026, Asia/Ho_Chi_Minh; checkpoint chụp lúc 19:41 +07. HEAD tham chiếu `1b910e3971841afeec83d53bc0539f3d50167f5d`. Patch trong working tree chưa commit; không tạo revision mới, không deploy.

**Triển khai: COMPLETED_PENDING_VERIFICATION. Kiểm tra local: PASS. Kiểm tra độc lập 1B trên patch mới: PENDING_REVERIFICATION.** Chưa chuyển bước 2. [Kết quả FAIL trước sửa](01-scope-verification-before-f1-f2.md) được giữ như bằng chứng lịch sử.

## Phạm vi patch và hành vi

### F1 — Tin nhận nhóm theo nhân viên

Trước: `messages_received` nhóm theo user dùng predicate people đòi `repliedByUserId` trong phòng; tin khách NULL actor biến mất dù nhóm theo ngày vẫn đếm được.

Sau: tin nhận dùng predicate **main** giống báo cáo theo ngày và có nhóm **Chưa xác định nhân viên**. Không suy nhân viên từ chủ nick, contact assignment hay cộng tác viên. Không tự đưa inbound trên shared-only nick vào main KPI. Nhánh messages_sent tiếp tục dùng people predicate, cho phép nhân viên trong scope được ghi nhận gửi trên nick đã cấp quyền đọc nhưng loại người ngoài phòng.

Khi chọn nhiều metric nhóm user, hợp nhất label và căn dữ liệu theo label để bucket chưa xác định không bị vẽ dưới tên nhân viên. Bucket thiếu của metric đếm là 0; mean không có cặp đo là null. Giữ numeric 0 khi thời gian phản hồi thực sự bằng 0. Chỉ sửa alignment cho groupBy=user trong lượt này; các grouping khác và kỳ ngày chung chưa được sửa.

**Bằng chứng source trong phiên này:**

- `backend/src/modules/analytics/reports/custom-report.ts:45`: thu kết quả từng metric; `:55`: căn label các dataset nhóm user, mean thiếu là null.
- `custom-report.ts:103`: nhánh tin nhận riêng; `:111`: `messageReportSql(scope)` main, sender contact và kỳ; `:113`: HAVING tránh tạo bucket giả khi scope rỗng.
- `custom-report.ts:121`: outbound giữ predicate people, không bỏ giới hạn actor để sửa inbound.
- `frontend/src/composables/use-analytics.ts:58`: kiểu dataset cho phép null; chart hiện hữu nhận mảng qua ReportBuilder, không thay layout/luồng tải.

### F2 — Counter phản hồi main và shared-only

Trước: service đọc main + explicit readable nick để tính cặp trả lời theo actor, nhưng pending/unattributed dùng chung tổng của cả hai tập.

Sau: lấy zaloAccountId của conversation từ DB, phân loại event vào main accountIds hoặc shared-only = readableAccountIds trừ accountIds **trước khi pairing**. Nick vừa owned vừa granted chỉ nằm main. Org-admin đặt toàn bộ nick cùng tổ chức trong main và shared counters bằng 0.

API khi availability=available có:

| Trường | Ý nghĩa |
|---|---|
| mainPending | Lượt chờ trên nick main |
| sharedPending | Lượt chờ trên nick được cấp thêm, loại nick đã thuộc main |
| mainUnattributed | Reply người đóng lượt trên nick main nhưng thiếu actor |
| sharedUnattributed | Reply người đóng lượt trên shared-only nick nhưng thiếu actor |
| pending / unattributed | Alias tương thích, chỉ phản ánh main; không còn tổng nhập nhằng |

Mean/daily/byUser vẫn là **people metric**, ghi nhận cặp trả lời thật của nhân viên trong scope trên nick main hoặc readable shared. Nhân viên ngoài scope đóng lượt nhưng không được credited, không ghép lại với reply người trong phòng đến sau. Pending/unknown trên shared-only không được gán cho chủ nick. Thời gian vẫn từ tin khách cuối của lượt → reply người đầu tiên; không thay thuật toán pairing hay mở role mới.

Nếu vượt 50.000 event: unavailable/response_event_limit, mean null và không công bố counter giả bằng 0. Không dùng scope client để nới quyền.

**Bằng chứng source trong phiên này:**

- `backend/src/modules/analytics/reports/response-time.ts:22`: select account ID từ quan hệ conversation; query vẫn có orgId, account read scope, isVirtual=false, threadType=user, isLocal/isDeleted=false và asOf.
- `response-time.ts:26`: tập main; `:27`: phép trừ shared-only; `:29` và `:30`: pairing riêng từng tập.
- `response-time.ts:33`: gộp cặp để tính people metrics; `:36`: truy vấn user tiếp tục áp reportModelWhere và tập actor được phép.
- `response-time.ts:48`: alias main; `:49` và `:50`: xuất bốn counter tách biệt.
- `frontend/src/composables/use-analytics.ts:37`: đồng bộ kiểu availability và counter. Chưa xây UI section shared, thuộc phạm vi rollout giao diện sau.
- `backend/src/modules/dashboard/report-scope.ts:12`: cập nhật comment readableAccountIds cho đúng hai mục đích trên; không sửa resolver hoặc predicate phân quyền trong file này.

## File sửa và fixture

Source/runtime: `custom-report.ts`, `response-time.ts`; comment trong `report-scope.ts`; kiểu API trong `frontend/src/composables/use-analytics.ts`.

Test: `backend/tests/unit/report-1b-review-evidence.test.ts`, `backend/tests/unit/response-time-service.test.ts`. Ba characterization cũ chuyển thành regression mong đợi hành vi đúng; thêm 7 test đối chứng, tổng suite từ 48 lên 55 test. Không sửa các artifact review cũ để che lỗi.

- PGlite: `new PGlite()` không URL/path, schema nhỏ tự tạo và đóng sau suite. 2 org, 4 conversations (main, shared, unreadable, foreign org), 2 nhân viên, 8 message giả. Xác nhận main inbound=1 theo ngày và theo bucket user; org-a=3, scope rỗng=[]; staff Sale B/foreign không lọt vào dataset gửi của phòng; Sale A vẫn được ghi nhận hai tin trên main+shared. Không Prisma adapter/server hay RLS thật.
- Service mock: main/shared pending và unknown; nick owned+granted trùng ID; cặp 60 giây của nhân viên trong phòng trên nick shared; người ngoài phòng đóng lượt; grant bị thu hồi làm shared không còn được phân loại; org-admin; limit; phản hồi 0 giây; mean null khi không có cặp.
- Đồng hồ review regression cố định 02/11/2026 12:00 +07; fixture service cố định 29/10/2026. Không phụ thuộc thời điểm chạy về sau.
- Original characterization source được sao lưu tại `artifacts/reports-1b-f1-f2-2026-11-01/review-characterization-before.test.txt`. Lần tái hiện trước sửa 19:35:49: 1 file/3 test pass nghĩa là tái hiện lỗi, không phải sửa xong.

## Lệnh và kết quả thực tế

Working directory `F:\ZaloCRM-CorepViet\backend`:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/custom-report-sqli.test.ts tests/unit/report-scope-policy.test.ts tests/unit/response-turns.test.ts tests/unit/report-scope-postgres.test.ts tests/unit/saved-report-scope.test.ts tests/unit/response-time-service.test.ts tests/unit/report-http-scope.test.ts tests/unit/custom-report-response-time.test.ts tests/unit/report-1b-review-evidence.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

- Regression cuối 19:40:37 +07: **10 files passed, 55 tests passed**, exit 0, duration 1.71s. Trong đó 14 test thuộc hai file F1/F2/service; các scope, SQL injection, HTTP và saved-run regression còn lại tiếp tục đạt.
- Backend TypeScript: **exit 0**, không diagnostics. Chạy sau sửa runtime; lần chỉnh cuối sau đó chỉ thêm assertion/đồng hồ test và comment scope.
- Tại frontend: `npm run build` (vue-tsc -b + vite build) — **exit 0**. Log tại `artifacts/reports-1b-f1-f2-2026-11-01/frontend-build.log`. Có cảnh báo chunk lớn hơn 500 kB; không phải lỗi build.
- Test chạy ngoài sandbox do Vitest từng bị EPERM khi rename cache trên máy này; chỉ mock/PGlite bộ nhớ. Không bootstrap app/cron/provider thật.

## Tính nguyên vẹn, giới hạn và bước tiếp

[Snapshot mới](01-f1-f2-source-snapshot.json) lưu 6 file source/test cùng hash và kết quả. Snapshot 1A cũ không bị ghi đè: 16/20 file vẫn khớp; 4 file khác chỉ là custom-report, response-time, comment report-scope và response-time-service test trong phạm vi sửa này. Review-evidence là file thêm ở lượt B trước, không thuộc snapshot 1A.

Đối chiếu removal-manifest của lượt gỡ TikTok: tất cả path source đã xóa/sửa vẫn giữ nguyên trạng thái/hash, trừ README được cập nhật thông tin tiến độ. Không phục hồi connector, không sửa AI, không commit/push/merge/migration/deploy.

**Đạt local:** F1 không mất inbound, không gán người giả; F2 không trộn counter; cặp trên shared nick vẫn credited đúng; test cũ được chuyển thành regression và có counterexample. **Chưa xác minh:** kiểm tra độc lập 1B trên snapshot mới, Prisma/JWT/RLS trên database test đầy đủ, browser/mobile và dữ liệu lớn/production. Mock kiểm tra revoke/query shape không thay integration test thu hồi grant thật.

Bước kế tiếp: kiểm tra lại 1B từ source và snapshot mới, gồm direct custom endpoint và saved run. Chỉ chuyển bước 2 sau checkpoint kiểm tra đạt; không dùng local test PASS để tự tuyên bố nghiệm thu 1B toàn bộ.
