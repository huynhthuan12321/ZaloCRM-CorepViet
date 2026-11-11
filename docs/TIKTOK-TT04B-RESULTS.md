# TT-04B — Chuẩn bị schema đa kênh local

Ngày: 13/10/2026. Checkout: `main`, HEAD `bf31cdf`; giữ các thay đổi TT04-A/PoC và tài liệu có sẵn.

## Kết quả và phạm vi

Đã chuẩn bị schema, SQL migration và đăng ký tenant guard. Chưa thực thi migration trên database nào. TT-04 tổng thể chưa hoàn thành: TT04-C/D/E vẫn cần triển khai. Không có route/worker đọc hay gửi TikTok được bật ở bước này.

User yêu cầu triển khai bước 4 sau kiểm inbound. Đây là quyền chuẩn bị schema local; bằng chứng live vẫn PARTIAL và không mở cổng staging/production/outbound. Không lấy kiểm thử mock làm bằng chứng connector thật.

## File thay đổi trong TT04-B

- `backend/prisma/schema.prisma`: thêm ChannelAccount, ChannelAccountAccess, BrowserSessionRef, ContactIdentity, ChannelEvent, OutboundCommand; thêm các quan hệ và index.
- `backend/prisma/migrations/20261013170000_multichannel_expand/migration.sql`: SQL do Prisma 7.5.0 sinh từ schema trước/sau, không từ datasource.
- `backend/src/shared/tenant/org-scoped-models.ts`: đăng ký sáu model mới.
- `backend/tests/unit/channel-expand-migration.test.ts`: kiểm tra hợp đồng migration tĩnh.
- Báo cáo này và dòng tiến độ trong roadmap.

## Các ràng buộc

- Cờ account enabled/inbound/outbound mặc định false; grant mặc định read. Không seed account/grant.
- FK composite giữ owner, grant, identity/contact cùng org với account. OutboundCommand liên kết cùng org/account/conversation; không chỉ kiểm conversation thuộc cùng org.
- Unique theo account cho eventKey/idempotencyKey/identity; unique theo conversation cho externalMessageId. ID nền tảng là String.
- BrowserSessionRef chỉ chứa tham chiếu profile opaque và epoch; không có trường cookie/token/storageState/QR. Việc kiểm nội dung tham chiếu và ingress payload thuộc TT05, chưa có runtime validation.
- Conversation.zaloAccountId vẫn NOT NULL. Giữ FK/index Zalo cũ; chưa cho tạo hội thoại TikTok thuần, không giả nick Zalo. threadKind thêm mặc định dm; threadType cũ vẫn là nguồn phân biệt user/group cho Zalo.
- Message.orgId nullable, không backfill; chưa thêm Message vào tenant guard để tránh phá writers cũ. Message org consistency phải hoàn thành tại TT04-D trước channel writes.
- Provider, permission và status là String; chưa có CHECK/enum hoặc state machine. Không được coi schema là authorization runtime.
- Không thêm message FK cho OutboundCommand lúc này; transaction tạo message/command, pending/unknown và correlation sẽ được làm TT06. Không được tự gửi từ bảng command.

## Kiểm tra đã chạy

1. `prisma validate`: PASS.
2. `prisma migrate diff --from-schema <schema-before> --to-schema prisma/schema.prisma --script`: PASS, chỉ so sánh file.
3. `prisma generate`: PASS, Prisma Client 7.5.0.
4. `npx.cmd tsc --noEmit` tại backend: PASS.
5. Vitest targeted: **153/153 PASS, 13 files**: foundation, migration contract, health, Messenger config, production config, tenant guard/context và sáu characterization Zalo.
6. `git diff --check`: PASS (cảnh báo LF/CRLF của Git, không lỗi whitespace).

Một test ban đầu nhận nhầm ON DELETE/ON UPDATE của FK là câu lệnh phá dữ liệu; đã sửa kiểm tra câu lệnh ở đầu dòng và chạy lại toàn bộ tập trên.

## Kiểm tra chưa chạy và giới hạn triển khai

Chưa chạy migration trên PostgreSQL, restore backup, đo lock time/index size hoặc insert cross-org/duplicate trong DB thật. Máy local không có executable docker/psql được tìm thấy. Static SQL tests không chứng minh FK hoạt động trên database và không thay migration acceptance.

Prisma Client mới chọn cả các cột mới khi query model mặc định. **Không chạy/deploy app với client mới trên database chưa áp dụng migration**: có thể báo thiếu cột. Việc giữ Zalo NOT NULL bảo vệ kiểu và luồng code cũ; không đảm bảo app mới chạy với schema DB cũ.

Trước áp dụng: dùng PostgreSQL staging độc lập cùng phiên bản production, restore backup đã khử dữ liệu nhạy cảm, so row counts; chạy migration; thử cross-org owner/grant/contact/command và wrong-account conversation (phải bị FK từ chối), dedup đúng scope; chạy HTTP/Zalo smoke; đo lock time. Chỉ áp dụng production khi được yêu cầu riêng.

## Rollback

- Chưa áp dụng DB: gỡ riêng thay đổi TT04-B bằng patch đã review; không reset file để tránh xóa TT04-A/công việc khác. Sinh lại Prisma Client từ schema trước TT04-B trước chạy app với DB cũ.
- Đã áp dụng additive migration nhưng chưa có channel writes: rollback app sang image/client cũ, giữ cột/bảng mới. Không xóa bảng/volume hoặc đánh dấu migration thất bại chỉ để rollback code.
- Khi có channel rows: không rollback về code bắt buộc Zalo; cần bản null-safe được chứng minh. Không dùng down migration xóa dữ liệu channel.

## Tiếp theo trong TT-04

TT04-C: quyền account/conversation, list/count/search thống nhất, rà null safety route/UI/SQL và bảo vệ các operation Zalo-only. TT04-D chỉ nullable/backfill/XOR sau khi C được kiểm chứng; TT04-E account-scoped realtime/QR và revoke. Chưa chuyển sang TT05.
