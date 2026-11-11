# TT07 — Pilot vận hành một tài khoản mock local

Ngày nghiệm thu: 13/10/2026.

## Kết luận

TT07 **PASS trong phạm vi mock/local, một tài khoản**. Đã có heartbeat worker, số đo tài nguyên, trạng thái Outbox, đối soát ID chỉ đọc, cảnh báo vận hành và diễn tập rollback có epoch fencing.

Endpoint trạng thái luôn trả `readyForRealPilot=false`. Kết quả này không chứng minh khả năng chạy nhiều ngày hoặc phục hồi trên TikTok thật.

## Phần đã triển khai

- Worker gửi heartbeat HMAC mỗi 5 giây:
  - trạng thái phiên đã phân loại;
  - RSS và heap;
  - số message/command trong ledger;
  - thời điểm quan sát.
- Không gửi cookie, token, QR, profile hoặc nội dung tin trong heartbeat.
- Worker đối soát định kỳ bằng message ID và CRM command ID.
- Đối soát chỉ đọc database, không tự thêm/xóa/sửa message.
- Trang quản trị tài khoản mock hiển thị:
  - tuổi heartbeat;
  - RSS worker;
  - số lệnh pending/processing/confirmed/failed/unknown;
  - cảnh báo phiên, heartbeat, unknown delivery và chênh lệch đối soát.
- Endpoint trạng thái pilot yêu cầu quyền `admin` trên tài khoản kênh.
- Diễn tập rollback:
  - tắt inbound và outbound;
  - chuyển tài khoản sang `DISCONNECTED`;
  - tăng session epoch và xóa xác nhận phiên;
  - giữ nguyên mọi OutboundCommand để điều tra;
  - worker mang epoch cũ bị từ chối.

## Cảnh báo hiện có

| Mã | Ý nghĩa |
|---|---|
| `SESSION_NOT_CONNECTED` | Tài khoản hoặc phiên mock không còn được xác nhận |
| `WORKER_HEARTBEAT_STALE` | Không có heartbeat hoặc heartbeat cũ hơn 15 giây |
| `UNKNOWN_DELIVERY_REVIEW` | Có lệnh gửi chưa xác định kết quả, không tự retry |
| `RECONCILIATION_MISMATCH` | Ledger worker và CRM lệch message/command ID |

## Nghiệm thu

| Kiểm tra | Kết quả |
|---|---:|
| PostgreSQL 16.15 full-schema + HTTP/JWT/socket/browser + rollback | 16/16 nhóm PASS |
| Backend channel + 6 characterization Zalo | 165/165 PASS |
| Frontend toàn bộ | 66/66 PASS |
| Backend TypeScript | PASS |
| Frontend typecheck + production build | PASS; warning chunk lớn có sẵn |
| PoC Node | 16/16 PASS |
| PoC browser fixture | 3/3 PASS |
| `git diff --check` | PASS |

Nghiệm thu xác nhận:

- heartbeat sai epoch bị từ chối;
- member không có quyền admin không xem được số liệu pilot;
- đối soát khớp trả chênh lệch bằng 0 và không ghi dữ liệu;
- `UNKNOWN` tạo cảnh báo vận hành;
- rollback tăng epoch, tắt nhận/gửi và giữ nguyên command;
- PostgreSQL kiểm thử đã dừng.

## Giới hạn trước pilot thật

- Heartbeat và kết quả đối soát hiện giữ trong bộ nhớ backend; restart backend sẽ trở về trạng thái chưa có heartbeat. Đây là hành vi fail-safe cho mock nhưng chưa đủ cho theo dõi nhiều ngày.
- Chưa có kho metric bền vững, biểu đồ thời gian, cảnh báo ngoài ứng dụng hoặc đo p50/p95 nhiều ngày.
- Chưa có bằng chứng tài khoản TikTok thật hoạt động qua worker CRM.
- Chưa kiểm chứng restart/mất mạng/hết phiên trên một worker TikTok thật.
- Chưa có chấp thuận production hoặc thay đổi quyết định điều khoản đã ghi trong nghiên cứu.

## File chính

- `backend/src/modules/channels/pilot-observability.ts`
- `backend/src/modules/channels/pilot-routes.ts`
- `backend/src/modules/channels/mock-channel-account-routes.ts`
- `poc/tiktok-personal-qr/src/crm-pilot.mjs`
- `poc/tiktok-personal-qr/src/worker.mjs`
- `frontend/src/components/chat/channel-mock-account-panel.vue`
- `backend/scripts/channels/acceptance-local.ts`

TT07 dừng tại mock/local. TT08 nhiều tài khoản chưa được triển khai.
