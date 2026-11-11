# 3B — Browser recheck trên PostgreSQL disposable

Ngày kiểm tra: **01/11/2026 23:07–23:18 (+07)**. **PASS 20/20 kịch bản browser local**, cùng DB/JWT/HTTP chạy lại **29/29 PASS**. Đóng điều kiện browser còn thiếu của 3B cho contract/rollout nền hiện tại. Bước 4 vẫn **NOT_STARTED** trong lượt này.

## Phạm vi, revision và fixture

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`; kiểm tra **working-tree chưa commit**. Không sửa runtime sản phẩm trong lượt này; giữ nguyên thay đổi AI/TikTok có trước.
- Đọc lại quy tắc chung, audit 11/12, checkpoint 2/3 và prompt 3B; đối chiếu source. Chín SHA256 của snapshot remediation trước đều khớp. [Snapshot mở rộng](../../artifacts/reports-real-verification-2026-11-01/browser-recheck/source-snapshot.json) ghi hash runtime, tám report view và harness hiện tại.
- Xác minh Docker `reports-1b-verify-20261101`, ID `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, label `codex.task=reports-1b-local-verification`, tmpfs, publish chỉ `127.0.0.1:55471`. DB `reports_1b_verify`; app role `reports_verify_app` không superuser/bypass RLS. Không dùng DATABASE_URL mặc định làm chứng cứ.
- Fastify harness loopback `127.0.0.1:30571`, route/auth/JWT/Prisma thật, frontend dist build 22:55. Đăng nhập bằng form fixture; JWT key chỉ ở bộ nhớ, không chèn token/localStorage. Không import app.ts/queue/cron/socket/provider, không đọc .env/production hoặc gửi tin/AI.
- Fixture hai org/hai phòng, leader/member/admin; 8 tin org A và 2 tin org B. Hôm qua Automation có 4 lời mời đã gửi/1 đồng ý, 3 bước chăm sóc/1 phản hồi. Broadcast có 3 gửi/1 lỗi/2 bỏ qua. CRM hôm qua 3 thao tác/15 phút ước tính, kỳ trước 20 phút. Audit có 3 event/1 lỗi, đối chứng org khác và event tương lai.

## Browser mới — 20/20 PASS

IAB thật qua skill computer-use. Đây là **20 checklist quan sát qua browser**, không phải 20 test tự động. Có 26 lần lưu DOM text/ảnh; không tính số ảnh thành số test. 503/delay chỉ do harness test tạo; response thành công vẫn truy vấn route và PostgreSQL thật.

| ID | Quan sát thực tế | Kết quả |
|---|---|---|
| B01 | Admin login qua form; Overview org A hiện 8 tin, 0 lịch hẹn, tỉ lệ chốt unavailable. | PASS |
| B02 | Nick Fleet: 2 nick mất kết nối; uptime/SDK/kết bạn/tra cứu thiếu nguồn không ghép `%` vào null. | PASS |
| B03 | Sales phản hồi 1 phút; CRM mang nhãn “Hoạt động dùng CRM theo Sale”, “Thời gian ước tính”; hiệu quả/chốt unavailable. | PASS |
| B04 | Pipeline: 0 lead chờ; tỉ lệ trả lead unavailable, nêu mẫu số chưa xác nhận; không hứa phân tích chốt thiếu nguồn. | PASS |
| B05 | Automation có dữ liệu: 4/1 → 25%; 3/1 → 33,3%, chỉ Sale A/nick A. | PASS |
| B06 | Automation Hôm nay: count 0, hai tỉ lệ unavailable và bảng rỗng. | PASS |
| B07 | Automation 503 hiện lỗi riêng, không có KPI/empty giả; “Thử lại” GET 200 phục hồi đúng Hôm nay. | PASS |
| B08 | Giữ GET Hôm nay 15 giây rồi chọn Hôm qua; sau response cũ về 200, UI vẫn chọn Hôm qua, giữ 4/1 và 25%/33,3%. | PASS |
| B09 | Broadcast có dữ liệu: 3 gửi/1 lỗi/2 bỏ qua, 1 run; tỉ lệ 75%, skipped không vào mẫu số. | PASS |
| B10 | Broadcast Hôm nay: 0 run/0 gửi/0 lỗi, tỉ lệ unavailable; tổng job vẫn là snapshot 1. | PASS |
| B11 | Broadcast 503 hiện lỗi riêng; “Thử lại” phục hồi kết quả rỗng, không thành 0% giả. | PASS |
| B12 | Giữ GET Hôm nay 12 giây rồi chọn 7 ngày; sau response cũ về, UI vẫn chọn 7 ngày và giữ 3 gửi/75%. | PASS |
| B13 | Engagement: nóng/nguội/count ghi nhận 0; KH khởi tạo và TB/ngày unavailable; heatmap rỗng có giải thích. | PASS |
| B14 | Engagement 503 hiện “Không tải được báo cáo tương tác”; retry phục hồi, lỗi khác rỗng. | PASS |
| B15 | Engagement chậm 12 giây xóa KPI cũ, hiện loading, khóa đổi kỳ. Không force-click nút disabled. Sau tải xong chọn 7 ngày, UI ghi `2026-10-26 – 2026-11-01 (giờ Việt Nam)`. | PASS |
| B16 | Audit hiện 33,3% lỗi automation; cron/queue unavailable. Counter snapshot tăng hợp lệ sau login fixture. | PASS |
| B17 | Leader Sales/CRM thấy Sale A, không có Sale B/org B trong DOM/bảng/tổng phòng. | PASS |
| B18 | Leader bấm tab Audit vẫn nhận API 403, không thấy nhật ký. Tab/menu không thay quyền backend. | PASS |
| B19 | Đăng nhập admin org B: Overview có 2 tin/1 nick; không có Sale A/nick A/B của org A. | PASS |
| B20 | Member mở URL Sales trực tiếp: sales-performance/crm-usage trả 403, UI không lộ KPI/hàng. | PASS |

### Artifacts mới

- [DOM text và thời điểm 26 quan sát](../../artifacts/reports-real-verification-2026-11-01/browser-recheck/3b-observations.json).
- [HTTP path/from/to/status](../../artifacts/reports-real-verification-2026-11-01/browser-recheck/report-http.jsonl), [thời điểm chặn/thả request](../../artifacts/reports-real-verification-2026-11-01/browser-recheck/scenario-events.jsonl).
- Ảnh trong cùng thư mục: `3b-automation-error-verified.png`, `3b-automation-retry-today.png`, `3b-automation-late-ignored.png`, `3b-broadcast-error.png`, `3b-broadcast-late-ignored.png`, `3b-engagement-loading-clears.png`, `3b-engagement-after-delay-7days.png`, `3b-audit.png`, `3b-leader-sales-scope.png`, `3b-leader-audit-forbidden.png`, `3b-org-b-overview.png`, `3b-member-report-denied.png`.

Chụp `fullPage:true` đầu lượt xuất hiện mount lại về kỳ mặc định; chưa đủ bằng chứng kết luận do sản phẩm hay công cụ đổi viewport. **Không dùng lần fault `automation-error` đầu hoặc ảnh `3b-automation-empty.png` làm chứng cứ lỗi/retry/kỳ**. Giữ artifact, chuyển sang `fullPage:false`, chạy lại `automation-error-2` và các ca chậm. Ảnh viewport không làm mất trạng thái. Không đổi viewport thủ công; ảnh có thể không chứa bảng ngoài màn hình, phần đó đối chiếu DOM text. Chưa nghiệm thu responsive/mobile bước 5.

## Source xác minh ở lượt này

| Hành vi | File và dòng hiện tại |
|---|---|
| Fastify continuation trong tenant | `backend/src/modules/auth/auth-middleware.ts:58`, `:70` |
| Messages ENABLE/FORCE RLS và policy | `backend/prisma/rls/tenant-rls.sql:27`, `:30` |
| Scope tin gửi/cột PostgreSQL đúng | `backend/src/modules/dashboard/report-analytics-routes.ts:26`, `:32`, `:161` |
| Audit loại tương lai, công thức lỗi 24h | `backend/src/modules/dashboard/report-analytics-routes.ts:978`, `:980`, `:983`, `:989`, `:1019` |
| CRM giới hạn mẫu, activeSalesToday snapshot | `backend/src/modules/dashboard/report-analytics-routes.ts:1110`, `:1115`, `:1269` |
| Return-rate/Engagement chưa đủ nguồn giữ unavailable | `backend/src/modules/dashboard/report-analytics-routes.ts:522`, `:633`, `:944`, `:945` |
| Mẫu số rỗng Automation/Broadcast | `backend/src/modules/automation/automation-report-routes.ts:35`, `:55`, `:212`; `backend/src/modules/broadcast/broadcast-report-routes.ts:28`, `:41`, `:146` |
| Error/retry/chống response cũ | `frontend/src/views/reports/AutomationReport.vue:163`, `:217`, `:225`; `frontend/src/views/reports/BroadcastReport.vue:139`, `:172`, `:180` |
| Engagement clear/loading/khóa filter/đơn vị | `frontend/src/views/reports/EngagementReport.vue:54`, `:58`, `:180`, `:194`, `:233` |
| Null không có %, CRM không gọi xếp hạng hiệu quả | `frontend/src/views/reports/NickFleetReport.vue:70`, `:137`, `:164`, `:209`; `frontend/src/views/reports/SalesReport.vue:228`, `:229` |
| Fault chỉ trong harness opt-in, GET allowlist, log không có token | `backend/scripts/reports-verification/server.ts:28`, `:31`, `:33`, `:41`, `:49`, `:64` |

Rà lại groupBy/findMany/take và vòng lặp: không phát hiện query trong vòng lặp từng Sale tại Sales/Lead Pool/CRM; CRM đọc tối đa 100.001 để phát hiện quá mẫu; heatmap top15/28 ngày. Snapshot Lead Pool còn aggregate lịch sử. **Chưa có query-plan/tải đại diện**, không suy hiệu năng production từ fixture nhỏ.

## Lệnh, kết quả và phạm vi patch

Thực chạy từ backend sau khi xác minh DB:

```powershell
$env:REPORT_VERIFY_BROWSER_SCENARIOS='1'
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/server.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/metrics.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/automation-fixtures.ts
```

- Harness startup: **15/15 PASS**, JWT/auth/RLS/F1/F2 thật; [results.json](../../artifacts/reports-real-verification-2026-11-01/results.json).
- Smoke test harness lúc 23:22 sau khi bổ sung tự tạo thư mục artifacts bằng `mkdir(..., recursive:true)`: startup và 15 checks tiếp tục PASS. Không sửa luồng query/browser hoặc runtime sản phẩm; không tính lần lặp này thành thêm 15 kịch bản khác.
- SQL oracle/metrics: **12/12 PASS**, [metrics-results.json](../../artifacts/reports-real-verification-2026-11-01/metrics-results.json). Các thử write RLS rollback trong DB disposable.
- Automation/Broadcast: **2/2 PASS**, [automation-broadcast-db-results.json](../../artifacts/reports-real-verification-2026-11-01/automation-broadcast-db-results.json).
- Browser **20/20 PASS** theo checklist; lỗi 503/delay có kiểm soát không chứng minh upstream tự phát lỗi.
- `git diff --check -- backend/scripts/reports-verification/server.ts` và tài liệu patch: **PASS**; cảnh báo LF→CRLF không phải lỗi whitespace/test.
- Backend **52/52**, frontend **19/19**, TypeScript/build PASS là lượt trước, **không giả chạy mới**. Không sửa runtime nên không lặp toàn bộ suite. Giữ phân vai 42 app-role +10 refresh owner-role; owner không dùng để chứng minh RLS.

Sau 23:08 request không phải GET chỉ có POST login/logout fixture (gồm script đối soát), không có gửi tin/broadcast/AI. API dashboard/notification/privacy ngoài harness trả 404 là giới hạn môi trường. Giữ cảnh báo pg concurrent client query, không che thành PASS hiệu năng.

Patch mới: thêm filesystem-controlled 503/delay và log path/kỳ/status trong `backend/scripts/reports-verification/server.ts`; không thêm thư viện, không sửa runtime/framework/KPI/quyền/send policy. Tài liệu: file này, `03-kpis-verification.md`, `03-kpis.md`, `03-tenant-rls-remediation.md`, `README.md`; artifacts mới trong `browser-recheck/`.

**Trước:** 3B IN_PROGRESS vì thiếu browser recheck. **Sau:** 3B PASS local cho contract/rollout nền, không có lỗi runtime mới cần sửa trong lượt này. Coverage Engagement, mẫu số trả lead, trạng thái thắng, cron/queue/SDK/uptime tiếp tục unavailable đúng contract. Chưa rollout self-report/chia sẻ; chưa migration replay/staging/production/benchmark/mobile hoặc nghiệm thu bước 6/7.

Đã logout fixture, đóng tab tự tạo, dừng đúng harness process; giữ container test chạy như lúc đầu. Không commit/push/deploy. Bước kế tiếp đủ điều kiện: **4A — Báo cáo AI**, chưa thực hiện trong lượt này; sau đó kiểm tra độc lập 4B.
