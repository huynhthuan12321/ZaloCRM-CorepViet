# Bước 2B — Kiểm tra kỳ báo cáo sau remediation

**Kết quả: PASS trong phạm vi kiểm tra local.** Đây là kiểm tra source, Fastify và PGlite fixture; không phải nghiệm thu trên PostgreSQL/RLS hoặc production. Không deploy, migration hay backfill.

## Đối chiếu phát hiện lần kiểm tra đầu

| Phát hiện ban đầu | Xử lý | Bằng chứng |
|---|---|---|
| `contacts_converted` suy thời điểm chuyển đổi từ `updated_at`; `avgConversionDays` cũng dùng `updated_at` | Không còn giả định conversion event từ field sửa đổi. Custom metric trả `availability: unavailable`, `reason: conversion_event_history_unavailable`, bucket là `null`; funnel chỉ báo cohort tạo trong kỳ và trạng thái hiện tại. Thời gian conversion trả null/unavailable cùng reason. | `custom-report-response-time.test.ts`, `conversion-funnel-availability.test.ts`; xác nhận không truy vấn metric event giả. |
| Engagement UI không gửi kỳ | Thêm lựa chọn Hôm nay/7 ngày/30 ngày; gửi `from/to` từ helper timezone VN. Ghi rõ heatmap cố định 28 ngày UTC; KPI tổng hợp theo kỳ, phân bố/danh sách nóng-nguội là snapshot. Chặn response cũ ghi đè response kỳ mới. | `EngagementReport.dom.spec.ts` kiểm tra request mặc định 30 ngày và chọn Hôm nay. Backend endpoint parse kỳ qua helper chung. |
| Thiếu fixture kiểm tra query sát biên và DATE-only | Thêm Fastify route test với PGlite cho message đúng đầu/cuối ngày; thêm đối chứng SQL DATE với bounds UTC-midnight. | `report-period-query-boundary.test.ts`: trước đầu kỳ và đúng cuối kỳ bị loại; đúng đầu kỳ và `23:59:59.999` VN được tính đúng một lần; appointment DATE chỉ lấy đúng ngày đã chọn. |

## Ma trận 2B

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 01/10/2026 VN → `[30/09 17:00Z, 01/10 17:00Z)` | PASS | Helper boundary và fixture Fastify/PGlite. |
| Tin sát trước/sau biên không mất/đếm trùng | PASS | PGlite fixture chứa `16:59:59.999Z`, `17:00:00.000Z`, `16:59:59.999Z` ngày kế và `17:00:00.000Z` ngày kế; response chỉ đếm hai message trong ngày VN. |
| SQL DATE tách timestamp | PASS trong fixture | Bounds `dateStart/dateEnd` là UTC midnight; SQL DATE fixture chỉ trả ngày 01/10. |
| 7/30 ngày, kỳ trước cùng độ dài và không chồng lấn, đổi tháng/năm/năm nhuận | PASS | Backend và frontend helper tests. |
| Ngày sai/khoảng đảo bị chặn trước aggregate | PASS cho route test | HTTP overview và custom-report; invalid custom range không gọi aggregate. |
| Ngày mai không vào “hôm nay” | PASS | Route-handler fixture appointment dùng DATE-only bounds ngày VN. |
| Engagement filter thực sự truyền kỳ; heatmap khác kỳ được gắn nhãn riêng | PASS | Frontend component test; API response ghi daily aggregate theo kỳ và heatmap 28 ngày UTC. |
| Cohort khác event; thiếu lịch sử không giả số chuyển đổi | PASS | Funnel trả `stagesMeaning=created_in_period_current_status`, `asOf`; metric conversion event và duration là unavailable, không query `updated_at`. |
| Scope bước 1 còn hiệu lực | PASS trong test hiện có | Chạy lại HTTP report scope và 1B reverification test; không phải DB/RLS integration. |

## Lệnh và kết quả

Backend, mỗi timezone `UTC` và `Asia/Ho_Chi_Minh`:

```text
node node_modules/vitest/vitest.mjs run tests/unit/custom-report-response-time.test.ts tests/unit/conversion-funnel-availability.test.ts tests/unit/report-period-query-boundary.test.ts tests/unit/report-period.test.ts tests/unit/report-http-scope.test.ts tests/unit/reports-review-evidence.test.ts tests/unit/report-1b-reverification-http.test.ts
Mỗi timezone: 7 test files, 32 tests passed
```

Frontend, mỗi timezone `UTC` và `Asia/Ho_Chi_Minh`:

```text
node node_modules/vitest/vitest.mjs run src/views/reports/EngagementReport.dom.spec.ts src/utils/report-period.spec.ts
Mỗi timezone: 2 test files, 3 tests passed
```

- Backend `npm.cmd run build` — **PASS**.
- Frontend `npm.cmd run build` (vue-tsc + Vite) — **PASS**.
- `git diff --check` trên phần sửa 2B — **PASS**.

## Giới hạn còn lại

- PGlite fixture thực thi query báo cáo message qua Fastify nhưng không thay PostgreSQL production, Prisma adapter/RLS hoặc dữ liệu thật.
- Appointment DATE được đối chứng bằng SQL DATE fixture và helper bounds; chưa chạy PostgreSQL adapter/RLS thực tế.
- Stage funnel là cohort theo `createdAt` với trạng thái hiện tại, không phải lịch sử các lần chuyển stage. Event “chốt phát sinh trong kỳ” và thời gian chuyển đổi vẫn unavailable cho đến khi có writer/event history đủ tin cậy.
- Nick Fleet còn snapshot/placeholder theo contract; Bước 3 xử lý các KPI và cách hiển thị unavailable liên quan.

**Kết luận:** PASS cho bước 2B theo source, API fixture và timezone checks đã nêu. Cho phép chuyển sang bước 3A; bước 3A chưa được thực hiện trong lượt này.
