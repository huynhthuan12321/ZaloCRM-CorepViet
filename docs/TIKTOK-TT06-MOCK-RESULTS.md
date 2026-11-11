# TT06 — Gửi văn bản qua Outbox mock local

Ngày nghiệm thu: 13/10/2026.

## Kết luận

TT06 **PASS trong phạm vi mock/local, một tài khoản**. CRM ghi tin nhắn và lệnh gửi vào PostgreSQL trước khi worker nhận lệnh. Worker fixture claim tối đa một lệnh, dùng đúng `commandId` của CRM và trả một trong ba kết quả cuối: `CONFIRMED`, `FAILED` hoặc `UNKNOWN`.

Kết quả này không chứng minh gửi tin trên TikTok thật. `TIKTOK_WEB_SESSION`, staging, production và tài khoản thật vẫn chưa được bật.

## Hành vi đã triển khai

- `POST /api/v1/channel-inbox/:id/messages` yêu cầu quyền `chat`, tài khoản mock đang kết nối và `outboundEnabled=true`.
- `Message(PENDING)` và `OutboundCommand(PENDING)` được ghi trong cùng transaction.
- Retry cùng `idempotencyKey` và cùng nội dung trả lại tin cũ; đổi nội dung với cùng key trả `409`.
- HTTP của người dùng không gọi browser transport.
- Worker HMAC loopback claim lệnh cũ nhất bằng `FOR UPDATE SKIP LOCKED`, chuyển sang `PROCESSING` trước khi trả lệnh.
- Result endpoint ràng buộc account, command và epoch; kết quả cập nhật command/message trong cùng transaction.
- `PROCESSING` quá hạn chuyển sang `UNKNOWN`; không đưa lại về `PENDING` và không tự gửi lại.
- UI chỉ hiện composer khi capability từ API cho phép. Trạng thái hiển thị: đang chờ, đang xử lý, đã xác nhận bởi fixture, lỗi, chưa rõ.
- Nút quản trị mock cho phép bật/tắt gửi thử sau khi phiên mock được xác nhận.
- Không có media, bình luận, AI tự gửi, broadcast hoặc nhiều tài khoản thật.

## Nghiệm thu

| Kiểm tra | Kết quả |
|---|---:|
| PostgreSQL 16.15 full-schema, backup/restore, migration, HTTP/JWT/socket/browser | 14/14 nhóm PASS |
| Backend channel + 6 characterization Zalo | 162/162 PASS |
| Frontend toàn bộ | 64/64 PASS |
| Backend TypeScript | PASS |
| Frontend typecheck + production build | PASS; warning chunk lớn có sẵn |
| PoC Node | 13/13 PASS |
| PoC browser fixture | 3/3 PASS |
| `git diff --check` | PASS |

Nghiệm thu PostgreSQL xác nhận:

- retry HTTP không tạo command/message thứ hai;
- hai claim đồng thời chỉ có một claim nhận lệnh;
- `CONFIRMED` cập nhật command và message đồng thời;
- gửi lại cùng result là idempotent;
- command treo chuyển `UNKNOWN`;
- command `UNKNOWN` không được claim lại;
- PostgreSQL đã dừng sau kiểm thử.

## File chính

- `backend/src/modules/channels/outbound-command-routes.ts`
- `backend/src/modules/channels/outbound-command-service.ts`
- `backend/src/modules/channels/channel-inbox-routes.ts`
- `backend/src/modules/channels/mock-channel-account-routes.ts`
- `poc/tiktok-personal-qr/src/crm-outbound.mjs`
- `poc/tiktok-personal-qr/src/worker.mjs`
- `frontend/src/components/chat/channel-readonly-thread.vue`
- `frontend/src/components/chat/channel-mock-account-panel.vue`
- `frontend/src/composables/use-chat.ts`
- `backend/scripts/channels/acceptance-local.ts`

## Rollback

1. Tắt `outboundEnabled` của tài khoản mock bằng endpoint quản trị hoặc nút **Tắt gửi thử**.
2. Tắt `MOCK_CHANNEL_ENABLED` hoặc `CHANNELS_ENABLED` để đóng toàn bộ đường mock.
3. Dừng worker PoC.
4. Không xóa hoặc tự gửi lại các lệnh `UNKNOWN`; giữ để đối chiếu.

TT06 dừng tại đây. TT07 pilot thật chưa được triển khai.
