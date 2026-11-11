# Marketing Phase 0 Audit

## Mục Tiêu

Phase 0 khóa phạm vi Marketing trước khi triển khai sâu các module Enterprise. Mục tiêu chính là tránh người dùng bấm vào màn đang mock, đang thiếu backend, hoặc có nguy cơ gửi tin/kết bạn thật khi chưa qua kiểm thử.

## Kết Luận Phase 0

Trạng thái: Hoàn tất ngày 12/07/2026.

Phase 0 đã đạt yêu cầu khóa phạm vi ở tầng frontend: route guard, sidebar gate, dry-run mặc định và chặn luồng gọi API sequence từ chat khi feature đang tắt. Các phần còn thiếu không bị bỏ quên, đã chuyển sang Phase 1-4 để triển khai tiếp.

## Feature Gates

| Flag | Default | Tác động |
| --- | --- | --- |
| `VITE_MARKETING_ENTERPRISE_ENABLED` | `false` | Mở/tắt nhóm Mục tiêu, Phiên chăm sóc, Bám đuổi thủ công. |
| `VITE_SEQUENCE_ENABLED` | Theo Enterprise, mặc định `false` | Mở/tắt Luồng kịch bản và Khối nội dung. |
| `VITE_BROADCAST_ENABLED` | Theo Enterprise, mặc định `false` | Mở/tắt Gửi tin hàng loạt. |
| `VITE_MARKETING_DRY_RUN` | `true` | Giữ môi trường test an toàn, không mặc định gửi thật. |

## Trạng Thái Route Sau Phase 0

| Route | Gate | Mặc định | Hành vi |
| --- | --- | --- | --- |
| `/marketing/lists` | `lists` | Mở | Route core còn dùng được. |
| `/marketing/lists/:id` | `listDetail` | Mở | Chi tiết tệp khách hàng còn dùng được. |
| `/marketing/templates` | `messageTemplates` | Mở | Mẫu tin nhắn còn dùng được. |
| `/marketing/message-templates` | `messageTemplates` | Mở | Alias mẫu tin nhắn còn dùng được. |
| `/marketing/group-scan` | `groupScan` | Mở | Route core còn dùng được. |
| `/marketing/goals` | `targets` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/targets` | `targets` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/care-sessions` | `careSessions` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/manual-followup` | `manualFollowup` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/followup/manual` | `manualFollowup` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/sequences` | `sequences` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/blocks` | `contentBlocks` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/content-blocks` | `contentBlocks` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |
| `/marketing/broadcasts` | `broadcasts` | Khóa | Redirect về fallback `/marketing/lists` khi flag tắt. |

## Thay Đổi Chính

- Router guard kiểm tra `getMarketingFeatureForPath()` và `isMarketingPathEnabled()` trước khi cho vào route Marketing.
- Sidebar Marketing lọc menu bằng `marketingFeatureGate`, nên user không thấy module đang khóa.
- `AddFlowModal` không gọi API sequences khi `marketingFeatureGate.sequences=false`.
- Nút tạo Mục tiêu/Broadcast từ chi tiết tệp vẫn dùng route hiện có, nhưng đi qua router guard nên không mở module bị khóa khi flag tắt.
- `VITE_MARKETING_DRY_RUN` mặc định `true`, giúp Phase 0 không mở gửi thật ngoài ý muốn.

## Checklist Kiểm Thử Phase 0

- [x] Mở `/marketing/lists` vẫn vào được.
- [x] Mở `/marketing/lists/:id` vẫn vào được.
- [x] Mở `/marketing/templates` hoặc `/marketing/message-templates` vẫn vào được.
- [x] Mở `/marketing/goals` hoặc `/marketing/targets` khi flag tắt sẽ redirect về `/marketing/lists`.
- [x] Mở `/marketing/sequences`, `/marketing/blocks`, `/marketing/broadcasts` khi flag tắt sẽ redirect về `/marketing/lists`.
- [x] Sidebar không hiển thị các module bị khóa mặc định.
- [x] Modal gắn luồng trong Chat không gọi API sequence khi sequence bị khóa.
- [x] Dry-run mặc định bật.
- [x] Checklist Phase 0 trong roadmap đã cập nhật trạng thái hoàn tất.

## Phần Còn Thiếu Chuyển Sang Phase 1-4

- Phase 1: Hoàn thiện backend/API thật cho Mục tiêu, Phiên chăm sóc, Bám đuổi thủ công trước khi bật Enterprise gate.
- Phase 2: Hoàn thiện luồng tạo từ tệp khách hàng, mapping list -> target/broadcast, trạng thái empty/loading/error và hành vi nút tạo Mục tiêu/Broadcast khi bật flag.
- Phase 3: Hoàn thiện Sequence/Block composer, save API, stats, preview và kiểm thử chống spam.
- Phase 4: Hoàn thiện Broadcast wizard, audience snapshot, recipient queue, detail page, lịch sử gửi và cơ chế dừng/kích hoạt an toàn.

## Rủi Ro Và Lưu Ý

- Khi bật `VITE_MARKETING_ENTERPRISE_ENABLED`, cần test lại toàn bộ route vì nhiều màn EE đang có dữ liệu demo/logic chưa hoàn chỉnh.
- Khi bật `VITE_SEQUENCE_ENABLED`, cần đảm bảo backend sequence/block đã sẵn sàng trước khi cho gắn luồng từ Chat.
- Khi bật `VITE_BROADCAST_ENABLED`, phải xác nhận preview audience, skip reason, dry-run và queue gửi trước khi cho gửi thật.
- Full backend test suite trước đó từng có lỗi cũ ngoài phạm vi Phase 0 ở `backend/tests/unit/tag-service-merge.test.ts` do mock thiếu `tenantTransaction`; cần xử lý riêng nếu muốn CI xanh toàn bộ.
