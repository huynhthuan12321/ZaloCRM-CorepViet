# ADR-001: Chiến lược schema & API cho module Marketing

Ngày: 12/07/2026
Trạng thái: **Được chấp nhận** (Phase 1)
Liên quan: `MARKETING_UPGRADE_ANALYSIS.md`, `MARKETING_IMPLEMENTATION_ROADMAP.md`, `MARKETING_PHASE1_AUDIT.md`

## Bối cảnh

Roadmap ban đầu đề xuất một bộ model canonical `Marketing*` (`MarketingList`, `MarketingTemplate`,
`MarketingBlock`, `MarketingSequence`, `MarketingGoal`, `MarketingBroadcast`...). Tuy nhiên audit
Phase 1 xác nhận repo Community **đã có sẵn** các model legacy đang gắn với dữ liệu production:

| Domain Marketing | Model legacy hiện có |
| --- | --- |
| Tệp khách hàng | `CustomerList` + `CustomerListEntry` |
| Mẫu tin nhắn | `MessageTemplate` + `MessageTemplateFolder` |
| Khối nội dung | `ContentBlock` |
| Luồng kịch bản | `AutomationSequence` (+ `SequenceStep`) |
| Mục tiêu | `TargetJob` (+ `TargetRunItem`) |
| Phiên chăm sóc | `CareSession` (+ `CareSessionEvent`) |
| Gửi tin hàng loạt | `BroadcastJob` (+ `BroadcastRun`, `BroadcastRunItem`) |

Ngoài ra, một số route (vd `/automation/templates`) là **EE-only** — không có trong bundle Community.
Frontend đang gọi trực tiếp các route legacy phân tán: `/customer-lists`, `/content-blocks`,
`/automation/sequences`, `/target-jobs`, `/broadcast-jobs`, `/automation/care-sessions/*`.

## Quyết định

1. **KHÔNG tạo bảng `Marketing*` mới trong Phase 1.** Tạo bảng song song với bảng legacy đang chạy
   production sẽ gây phân mảnh dữ liệu và rủi ro migrate lớn, không tương xứng lợi ích.

2. **Thêm một lớp facade READ-ONLY `/api/v1/marketing/*`** map về các model legacy hiện có. Đây là
   contract đọc canonical + trang tổng quan (`summary`) cho toàn module. Facade **chỉ THÊM**, không
   đụng/không thay route legacy — các màn hình đang chạy giữ nguyên đường gọi cũ.

3. **Route legacy vẫn là contract ghi (create/update/delete) chính thức** cho đến khi có nhu cầu rõ
   ràng để hợp nhất. Roadmap được cập nhật để **chấp nhận chính thức route legacy** (đúng nhánh
   "HOẶC cập nhật roadmap chấp nhận route legacy" mà audit cho phép).

4. **Org-scoping bắt buộc, defense-in-depth.** Mọi query facade lọc `orgId` tường minh, đồng thời
   tenant-guard ở `prisma-client.ts` là lớp chặn thứ hai. Không dựa vào một lớp duy nhất.

5. **Gỡ hard-code branding.** Bỏ mảng `PROJECT_TAGS` bất động sản hard-code khỏi UI; tag dự án lấy
   động theo org (`GET /api/v1/marketing/project-tags` = distinct `tagIds` của MessageTemplate trong
   org; popup chat derive từ dữ liệu template đã nạp).

## Facade contract (Phase 1 — read-only)

```
GET /api/v1/marketing/summary          → đếm tổng theo domain cho org
GET /api/v1/marketing/lists            → CustomerList
GET /api/v1/marketing/templates        → MessageTemplate
GET /api/v1/marketing/blocks           → ContentBlock
GET /api/v1/marketing/sequences        → AutomationSequence
GET /api/v1/marketing/goals            → TargetJob
GET /api/v1/marketing/care-sessions    → CareSession
GET /api/v1/marketing/broadcasts       → BroadcastJob
GET /api/v1/marketing/project-tags     → distinct MessageTemplate.tagIds (org)
```

Tất cả yêu cầu auth (`authMiddleware`) và lọc theo `request.user.orgId`.

## Audit index tối thiểu (DoD Phase 1)

Kiểm tra các bảng liên quan cho index `orgId`/`status`/`phone`/`zaloUid`/`createdAt`:

| Bảng | Index sẵn có | Kết luận |
| --- | --- | --- |
| `CustomerList` | `[orgId, status, createdAt desc]`, `[orgId, archivedAt]` | Đủ |
| `CustomerListEntry` | `[customerListId, status]`, `[phoneE164]`, `[phoneLocal]` | Thêm `[zaloUid]`, `[contactId]` (lookup/dedup theo UID) |
| `MessageTemplate` | `[orgId, ...]` ×6 + GIN `tagIds` | Đủ |
| `ContentBlock` | `[orgId]` | Thêm `[orgId, createdAt desc]` (ordering facade) |
| `AutomationSequence` | `[orgId, channel, enabled]` | Thêm `[orgId, createdAt desc]` (ordering facade + route) |
| `TargetJob` | `[orgId, status]` | Đủ |
| `CareSession` | 6 index gồm `[orgId, ownerUserId, state]`, `[state, nextRunAt]` | Đủ |
| `BroadcastJob` | `[orgId, status]`, `[status, nextRunAt]` | Đủ |

Các index bổ sung nằm ở migration `20260712120000_marketing_phase1_indexes` (thuần `CREATE INDEX`,
additive, an toàn dữ liệu cũ — chạy `prisma migrate deploy` khi deploy).

## Hệ quả

- Frontend Marketing giữ nguyên đường gọi legacy (không rewrite ở Phase 1 → rủi ro regression thấp).
- Có một điểm đọc/summary canonical để các màn dashboard/tổng quan tương lai dùng chung.
- Khi (nếu) cần hợp nhất schema canonical, facade là ranh giới cô lập — đổi mapping bên trong không
  phá frontend.

## Việc chưa làm (ngoài phạm vi Phase 1, để lại roadmap)

- Chuyển frontend sang gọi facade (rủi ro cao, giá trị Phase 1 thấp).
- Contract ghi (POST/PATCH/DELETE) trên `/api/v1/marketing/*`.
- Hợp nhất/rename schema sang `Marketing*` canonical.
