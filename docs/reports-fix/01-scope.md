# Bước1A — Scope báo cáo và quy tắc phản hồi

Cập nhật01/11/2026, Asia/Ho_Chi_Minh. HEAD tham chiếu `1b910e3971841afeec83d53bc0539f3d50167f5d`; patch nằm trong working tree, chưa commit/push/deploy.

**Trạng thái: PASS cho rollout foundation sau kiểm tra lại1B.** Review1B đầu đã FAIL; F1/F2 đã được sửa ngày01/11/2026; kiểm tra lại1B PASS phạm vi foundation với60 test đạt (gồm3 characterization của bước2–3). Xem [checkpoint sửa F1/F2](01-f1-f2-fix.md). Phần mô tả45 test bên dưới là lịch sử1A trước review. Policy mở rộng CEO/Marketing/HC–NS/Sale cá nhân và UI phần chia sẻ riêng chưa triển khai trong patch này. Đây là rollout đầu theo phương án đã duyệt, không phải hoàn tất mọi tính năng của ma trận đích.

## Hành vi trước/sau

| Trước | Sau |
|---|---|
|Gate trưởng nhóm qua nhưng truy vấn nhiều nơi lấy toàn org|Truy vấn main KPI thêm scope theo domain, scoped SQL bind parameters; role/grants hiện thời đọc lại mỗi request|
|Leader chỉ một mình bị403 vì size=1|Leader/deputy có access vẫn được vào theo membership, scope có chính mình|
|view_all có thể bị hiểu là global|Trong rollout này non-admin luôn cần leader/deputy và report access, view_all không bypass department|
|Contact/nick được chia sẻ có nguy cơ nhập nhằng attribution|Main contact theo assigned user; main nick theo chủ nick trong subtree. Read-grant ngoài phòng chỉ bổ sung readable accounts cho metric có actor thật thuộc scope, không mở main fleet hoặc people list|
|CRM usage gán tin theo chủ nick|Gán theo Message.repliedByUserId; không tự gán actor thiếu cho chủ nick|
|Saved report run chỉ lookup id+org, service org-wide|Kiểm tra quyền report, config trong createdBy subtree, rồi truyền viewer scope hiện tại vào service|
|Response-time đọc DailyMessageStat chưa thấy writer|Dùng message events: tin khách cuối cùng → reply người đầu tiên; mean theo cặp thật, AI/bot không đóng lượt|
|Helper SQL thiếu sau gián đoạn làm test custom-report lỗi|Khôi phục helper groupBy/date-column allowlist, giữ bound params, chạy lại regression SQL injection|

## File và luồng thay đổi

- `backend/src/modules/dashboard/report-scope.ts`: resolver, gate, filters ORM và SQL. Đọc user.isActive, role, permission group còn hiệu lực, deptRole/subtree; role admin/owner vẫn trong org; explicit account grants không thành quyền xem người ngoài phòng. Gate Audit và legacy Automation health có adminOnly tường minh.
- `dashboard/report-analytics-routes.ts`: scope cho overview/nick/sales/pipeline/lead-pool/engagement/crm-usage; Audit và legacy automation health giữ admin-only.
- `dashboard/report-routes.ts` + `excel-sheet-builders.ts`: API cơ bản/export dùng cùng viewer scope; không có đường export org-wide ngoài gate.
- `analytics/analytics-routes.ts` + `saved-report-routes.ts`: guard + scope được truyền vào mọi report service/run. Saved config không truyền quyền người tạo vào kết quả.
- `analytics/reports/conversion-funnel.ts`, `team-performance.ts`, `custom-report.ts`: query scope; service bắt buộc nhận ReportScope, không có default ngầm toàn org. Custom filters còn các giới hạn cũ được nêu dưới.
- `dashboard/response-turns.ts` + `analytics/reports/response-time.ts`: last-inbound pairing và service tổng hợp. Team analytics và custom avg_response_time dùng chung thuật toán. Grouping tuần giữ convention SQL cũ để tránh đổi nhãn không đồng bộ.

## Quy tắc đã cài

1. Role/grant thu hồi có hiệu lực ở request mới; không dựa role cũ trong JWT để bypass gate. Không đổi auth/PIN/send policy.
2. Hai scope account: main owned accounts và readable accounts (main + grants tường minh trong org). Metric vận hành chính chỉ main; metric people cần actor trong userIds, có thể ghi nhận gửi thật trên nick được cấp thêm. Actor ngoài scope không được cộng; KH được share không mở chat nick khác.
3. Tin khách vào được đếm ở nhánh operational trong nick main; outbound vẫn có ràng buộc actor. Đây là phương án an toàn thay cho bỏ toàn bộ điều kiện actor, đã từng bị auto-review từ chối trong lượt trước. Không triển khai bản nới truy vấn đã bị từ chối.
4. Response-time chỉ Zalo1–1, không virtual/group; bỏ isDeleted/isLocal/dryRun. Native human reply không có actor vẫn đóng lượt, ghi unattributed; không gán chủ nick. Reply đầu tiên của người ngoài scope cũng đóng lượt nhưng không vào kết quả credited.
5. Kỳ response-time dùng ngàyVN,lastInboundAt; asOf cố định đầu query. Reply có thể sau ngày kết thúc nhưng không sau asOf. Không có cặp hợp lệ→null;0 giây vẫn là0. Pending không vào mean.
6. Lấy tối đa50001 event để phát hiện vượt50000; nếu vượt trả unavailable/reason, không công bố mean từ mẫu bị cắt. Custom report không đổi unavailable thành0.

## Kiểm tra đã chạy

Xem [01-local-checks.md](01-local-checks.md) cho lệnh, kết quả cuối và lỗi trung gian. **9 file /45 test PASS**, TypeScript `--noEmit` exit0. Có Fastify inject với auth/Prisma mock và PostgreSQL PGlite chạy trong bộ nhớ. Không có DB URL, socket DB thật, app bootstrap, cron, provider AI hoặc gửi tin.

Rà cấu trúc AST6 file query:79 ORM calls và15 raw-query sites đều có scope predicate/helper; đây chỉ là coverage marker, không chứng minh đầy đủ semantics SQL. SQL predicates chính đã chạy với fixture hai org, staff ngoài phòng, nick cấp thêm, merged contact và scope rỗng trong PGlite.

Test characterization cũ: ca scope đã chuyển sang regression mong đợi loại người ngoài phòng. Các ca REPRO còn lại vẫn ghi nhận lỗi ngày/KPI chưa sửa, không được dùng chúng để tuyên bố các lỗi đó đã khắc phục. Tài liệu0A/12 giữ kết quả tái hiện cũ.

## Giới hạn và phần tiếp theo

- Chưa mở role chuyên biệt, report cá nhân, UI “Khách được chia sẻ/Nick được cấp thêm”; chưa có cấu hình report capability theo ID ổn định. Không tự cấp grant/migration vào DB hiện hữu.
- Chưa thay toàn bộ placeholder0, công thức chốt, cửa sổ ngày các report cũ hoặc stale UI. SalesReport/report sales-performance vẫn còn KPI response placeholder, cần bước3 đồng bộ consumer/availability; không coi mọi màn đã có số đo mới.
- Custom report còn giới hạn groupBy/filter/dataset alignment từ trước; filters.userId/status không được coi là đã hỗ trợ. Với received theo user không được suy người phụ trách từ chủ nick; cần đánh dấu availability/nhãn ở bước3.
- Uptime/quota/Audit health còn TODO. Không có báo cáo AI mới trong patch.
- Chưa chạy JWT thật, Prisma adapter+RLS trên database test đầy đủ hoặc browser/device. PGlite ở đây chỉ chứng minh predicate SQL trên schema fixture nhỏ, không thay kiểm thử triển khai.
- Hiệu năng pairing bị giới hạn event cap; dữ liệu cũ thiếu actor không được bịa attribution. Chưa có đo tải production.

Không đánh dấu phát hành sẵn sàng. Bước tiếp:1B review patch, đối soát thêm object/scope/filter và test thiếu; sau đó bước2 chuẩn hóa ngày toàn module. Phần response-time đã triển khai sớm do yêu cầu người dùng, nhưng chưa thay thế bước3 kiểm tra KPI đầy đủ.
