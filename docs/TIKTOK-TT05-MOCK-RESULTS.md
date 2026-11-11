# TT05 — Kết quả bridge/inbound chỉ đọc trên local

Ngày 13/10/2026. **Kết quả: PASS cho phạm vi mock local, một tài khoản.**

## Phạm vi đã triển khai

- Tạo tối đa một `MOCK_BROWSER` account cho mỗi tổ chức ở giai đoạn TT05; chỉ
  owner/admin hiện hành được tạo. Account bật inbound và luôn khóa outbound.
- Vòng đời connect dùng QR mô phỏng, profile reference opaque và epoch tăng dần.
  QR/connection event chỉ phát vào control room đã kiểm quyền.
- Worker PoC có bridge tùy chọn tới backend loopback. Mỗi raw body được ký HMAC
  với timestamp + event key; secret tối thiểu 32 ký tự và không có giá trị mặc định.
- Ingress giới hạn 64 KiB, kiểm chữ ký/thời gian/nonce/schema, chỉ nhận
  `message.observed` của provider mock. Payload không có cookie, token, storage
  state hoặc đường dẫn profile.
- Processor khóa `ChannelEvent` bằng PostgreSQL `FOR UPDATE SKIP LOCKED`, kiểm
  account, trạng thái inbound và epoch phiên trước khi ghi dữ liệu.
- Identity chỉ unique trong account. Tên/avatar không tự ghép với Contact Zalo.
  Tin được khử trùng bằng external message ID trong conversation.
- Inbound cập nhật unread/contact aggregate một lần; self-message lưu
  `senderType=self`. Sau commit, event chỉ phát vào read room được kiểm lại ACL.
- Hộp thư desktop hiển thị channel row và thread chỉ đọc. Có panel tạo account,
  QR và confirm mock; composer, media, AI gửi, broadcast và outbound không mở.
- Processor nền quét lại event `PENDING` sau restart ở local/test capability;
  lỗi tick được log không chứa payload/secret.

## Nghiệm thu

Lệnh database/browser:

```powershell
$env:Path="C:\Users\Huynh Thuan\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd;$env:Path"
cd D:\ZaloCRM-CorepViet\backend
npx.cmd tsx scripts/channels/acceptance-local.ts --browser
```

Kết quả PostgreSQL 16.15: **13/13 nhóm PASS** trên schema legacy đầy đủ 116 bảng,
restore riêng, migrations B/D1/backfill/D2 và Prisma schema diff trống. Nhóm TT05
đã chứng minh QR/confirm bị giới hạn theo quyền, request ký thật qua HTTP tạo Contact/Identity/Conversation/Message,
phát Socket.IO tới reader, retry cùng event/message chỉ còn một Message và unread
giữ bằng 1. Báo cáo máy đọc:
`docs/TIKTOK-TT05-ACCEPTANCE-EVIDENCE.json`.

Kiểm tra bổ sung:

| Kiểm tra | Kết quả |
|---|---|
| Backend TT05 + channel + Zalo characterization, 14 file | 159/159 PASS |
| Backend TypeScript `tsc --noEmit` | PASS |
| Frontend toàn bộ | 61/61 PASS |
| Frontend `vue-tsc -b` + production build | PASS; chỉ còn warning chunk lớn có sẵn |
| PoC Node tests gồm bridge HMAC | 10/10 PASS |
| PoC browser/DOM/messaging | 3/3 PASS khi trỏ `PLAYWRIGHT_BROWSERS_PATH` vào runtime local |
| `git diff --check` | PASS |

Artifacts local của lần nghiệm thu:
`poc/tiktok-personal-qr/runtime/tt04-acceptance/acc4ee26-01cf-4daa-bfa5-2594147de6e4/`.
PostgreSQL test đã dừng; không còn process `postgres`/`pg_ctl`.

## File TT05 chính

```text
.env.example
backend/src/app.ts
backend/src/shared/database/prisma-client.ts
backend/src/modules/channels/worker-auth.ts
backend/src/modules/channels/event-ingress.ts
backend/src/modules/channels/channel-event-processor.ts
backend/src/modules/channels/contact-identity.service.ts
backend/src/modules/channels/mock-channel-account-routes.ts
backend/scripts/channels/acceptance-local.ts
backend/tests/unit/channel-worker-auth.test.ts
backend/tests/unit/channel-event-processor.test.ts
backend/tests/unit/mock-channel-account-routes.test.ts
frontend/src/components/chat/channel-mock-account-panel.vue
frontend/src/views/ChatView.vue
frontend/src/composables/use-chat.ts
poc/tiktok-personal-qr/src/crm-bridge.mjs
poc/tiktok-personal-qr/src/worker.mjs
poc/tiktok-personal-qr/tests/crm-bridge.test.mjs
poc/tiktok-personal-qr/package.json
poc/tiktok-personal-qr/README.md
```

## Giới hạn và điểm dừng

Kết quả này không kết nối TikTok thật và không chứng minh selector, session,
history, stable ID hoặc khả năng nhận nền của TikTok Personal. QR là chuỗi fixture.
Không dùng database/media production, không deploy staging/VPS, không thử full
`app.ts` trong container, mobile UI, nhiều node Socket.IO, RLS role không bypass,
tải lớn hoặc phục hồi event `PROCESSING` sau process crash.

TT06 outbound chưa được triển khai. `TIKTOK_WEB_SESSION` vẫn không nằm trong
provider được phép; các live capability và mọi cờ gửi vẫn false.

## Rollback

Tắt `CHANNELS_ENABLED` hoặc `MOCK_CHANNEL_ENABLED` làm route/account/inbox mock
không khả dụng và processor không khởi động. Gỡ các file TT05 và đúng hunk đăng ký
trong `app.ts`/UI nếu rollback code. Không xóa bảng đa kênh, database, profile,
backup hoặc dữ liệu TT04. Không đưa event/tin mock sang production.
