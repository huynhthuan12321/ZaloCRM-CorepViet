# TT-04C/D/E — Kết quả triển khai local

Ngày 13/10/2026. Repo `D:\ZaloCRM-CorepViet`, nhánh `main`, HEAD `bf31cdf`.

**Cập nhật sau báo cáo này:** đã nghiệm thu local trên PostgreSQL 16.15 native với schema tổng hợp đầy đủ; 11/11 nhóm PASS và schema diff trống. Xem TIKTOK-TT04-ACCEPTANCE-RESULTS.md. Những trạng thái “chưa chạy DB thật” bên dưới là lịch sử lúc giao code C/D/E; DB/media production vẫn chưa được dùng hoặc nghiệm thu.

## Trạng thái

Đã triển khai **code nền C/D/E**, kiểm tra kiểu, build và các phép thử local. **Chưa nghiệm thu triển khai database/staging/production**: B/D1 chưa chạy trên DB thật, backfill và D2 chưa áp dụng. Không kết nối tài khoản thật, gửi tin, deploy hoặc mở live capability. Dừng trước TT05.

Các thay đổi/untracked file có sẵn của người dùng và TT04-A/B/PoC được giữ. Không commit hoặc tạo PR.

## TT04-C — Scope và hộp thư đọc chung

- `backend/src/modules/channels/channel-scope.ts`: kiểm user hiện hành trong DB, active/role/RBAC conversation.access; quyền account read/chat/admin theo owner hoặc grant. Scope luôn có org và provider được phép. Flag OFF không query channel tables trong đường metadata/access.
- `unified-inbox-query.ts`: AND của scope với bộ lọc, không thay authorization OR bằng search OR; dùng cùng predicate cho list/count/search. Bộ lọc account kênh dùng `channelAccountId`, không dùng accountId của Zalo.
- `channel-inbox-routes.ts`: GET `/api/v1/channel-accounts`, `/channel-inbox`, `/channel-inbox/:id`, `/channel-inbox/:id/messages`; PATCH/DELETE grant cần quyền account admin. Detail/history không có quyền trả 404 và không đọc message body. Pagination giới hạn 100.
- DTO account chỉ có id/displayName/provider/status; không trả session, profileRef, grant list hoặc QR. Tin channel chỉ đọc; không có endpoint gửi, media, AI hoặc broadcast.
- Zalo trong chế độ hộp thư chung vẫn qua redactConversationRow/redactMessage. Tìm kiếm mới loại nick privacy=main để tránh suy ra nội dung qua kết quả/đếm; endpoint Zalo cũ giữ hành vi hiện tại.
- `zalo-conversation-guard.ts` và các route chat/attachment/media kiểm transport trước thao tác Zalo. Middleware Zalo giải quyết conversation trước bypass admin; account routes giữ fast path admin. Mark-read Zalo có access middleware. AI, followup, Friend aggregate/backfill, consolidation và Telegram bridge không xử lý channel rows như Zalo.
- Raw SQL tại `contacts/contact-aggregate.ts`, `dashboard-routes.ts`, `report-routes.ts`, `excel-sheet-builders.ts` thêm điều kiện nick Zalo khác NULL. Báo cáo owner tại report-analytics có INNER JOIN zalo_accounts, vẫn Zalo-only. Chưa mở báo cáo kinh doanh TikTok.

**Điều chỉnh so với thiết kế TT03:** dùng endpoint đọc chung `/channel-inbox` để giữ endpoint `/conversations` phục vụ Zalo; không chuyển toàn bộ bộ lọc Zalo sang đa kênh trong một lần. Bộ lọc chung hiện có channel/account/search/unread, chưa có nhóm/folder/tag/triage Zalo cho channel. Các bộ lọc không hỗ trợ bị ẩn trong UI hoặc bị HTTP schema từ chối, không âm thầm áp sai scope.

## Frontend

- `frontend/src/composables/use-chat.ts`: chọn endpoint theo channel DTO, account namespace riêng, subscribe lại sau reconnect, purge cache/selection/messages khi revoke và vô hiệu hóa response đang bay. Channel send không đi vào endpoint Zalo.
- `frontend/src/views/ChatView.vue`, `components/chat/ConversationList.vue`: mặc định vẫn hộp thư Zalo. Chế độ chung/fixture và bộ lọc account chỉ xuất hiện khi backend báo mock inbox khả dụng; TikTok vẫn chưa kết nối. Context menu Zalo không mở trên channel rows.
- `components/chat/channel-readonly-thread.vue`: hiển thị văn bản bằng interpolation, placeholder cho loại tin chưa hỗ trợ, chỉ nút tải lại; không composer/AI/media/nhãn trạng thái đã nhận/đã xem giả.
- `use-privacy-visibility.ts`: composer không coi zaloAccount=null là đủ quyền gửi nếu có channelAccount.
- Phạm vi UI mới là desktop; mobile tiếp tục Zalo. Chưa có màn hình tạo/connect tài khoản hoặc seed fixture vào CRM. Các phần đó thuộc TT05. Avatar/tên giống nhau không làm tự gộp contact.

## TT04-D — Nullable, tổ chức của tin và rollout theo giai đoạn

- Schema Conversation.zaloAccountId/ZaloAccount relation nullable. D1 SQL có CHECK XOR đúng một account, kể cả virtual Zalo; giữ index/FK Zalo.
- `backend/prisma/migrations/20261013180000_multichannel_nullable/migration.sql`: preflight XOR, transaction + lock/statement timeout, ràng buộc XOR, trigger tenant cho message và contact channel, composite Message→Conversation FK NOT VALID. Contact channel không thể liên kết hoặc chuyển sang org khác qua các đường SQL đã thử.
- Message.orgId ở schema đích là required với `@default(dbgenerated())`: cho phép Prisma writer cũ bỏ trường này, BEFORE trigger tự suy từ Conversation và RETURNING nhận org thực. Trigger phủ cả createMany/nested/raw writer; từ chối caller đặt org sai. Đây là điều chỉnh có chủ ý so với sửa từng message writer.
- `backend/scripts/channels/backfill-message-org-id.ts`: mặc định dry-run; apply theo batch 1000, tối đa 100 batch/lần, mỗi statement commit riêng, SKIP LOCKED, preflight orphan/mismatch, báo remaining/invalid. Không log URL/content; còn rows trả exit code 2 và chạy lại sau khi xử lý lock/đánh giá tải.
- `docs/ops/sql/TIKTOK-TT04D-VALIDATE.sql` là **D2 có gate**, nằm ngoài auto migrations: kiểm không còn NULL/orphan/mismatch, VALIDATE composite FK, validated NOT NULL check rồi SET NOT NULL. Không tự chạy D2 ngay khi deploy B/D1.
- Giữ Message ngoài danh sách tenant guard ứng dụng hiện có để không đổi semantics các job Zalo cũ chưa audit tenant context. DB trigger/FK là ràng buộc org khi ghi; endpoint mới query org và account scope. Không tuyên bố đã hoàn tất audit RLS hoặc toàn bộ tenant context cho Message.

**Không chạy app/client mới với DB cũ hoặc DB chưa hoàn thành backfill/D2.** Prisma client hiện hành khai Message.orgId non-null; chỉ cờ OFF không giải quyết thiếu cột/NULL khi query. Không dùng db push/migrate dev để bỏ qua quy trình staged. Cần quản lý SQL D2 và trạng thái schema trong runbook migration tiếp theo trước triển khai thực tế.

## TT04-E — Realtime và thu hồi quyền

- `channel-socket.ts` đăng ký sau socket-auth: room `channel:<org>:<account>:read` và `:control`. Join read cần read; QR/connection control cần admin. Không dùng room org/account Zalo để phát channel payload.
- Publisher gọi fetchSockets rồi kiểm lại user/role/RBAC/account/grant ở DB cho mỗi recipient trước emit; kiểm purpose/event phù hợp, accountId trong envelope lấy từ tham số server. DB lỗi không phát payload.
- Grant mutation gọi recheck để leave read/control và phát thông báo revoke không có nội dung tin. Publisher cũng kiểm lại nếu grant bị đổi từ công cụ quản trị khác. Ownership và org-admin vẫn là quyền ngầm; xóa grant không thu hồi quyền của owner.
- Frontend nhận event kênh riêng, refresh qua HTTP có ACL; revoke purge nội dung và response đến muộn. Không phát QR thật hoặc tin thật trong bước này; publisher chưa được nối worker/event processor.
- Chưa chứng minh với nhiều node Socket.IO adapter hoặc các thay đổi quyền diễn ra đồng thời với đúng thời điểm gửi. Kiểm lại trước mỗi emit thu hẹp cửa sổ stale ACL; không phải transaction nguyên tử giữa DB revoke và network emit.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Prisma validate + generate 7.5.0 | PASS |
| Backend `npx.cmd tsc --noEmit` | PASS |
| Backend targeted, 16 files (HTTP/scope/socket/SQL/foundation/tenant/6 characterization Zalo) | **188/188 PASS** |
| Frontend Vitest, 5 files | **61/61 PASS**, gồm không dùng lại message cache của user khác |
| Frontend vue-tsc + production build | PASS; warning bundle lớn có sẵn, không phải lỗi compile |
| PostgreSQL in-memory fixture | 9 tests PASS trên **PostgreSQL 17.5 / PGlite 0.3.15** |
| `git diff --check` | PASS |
| Backend toàn bộ | **Không PASS**: 38 files thất bại, 101 pass, 1 skipped; 6 tests fail, 867 pass, 24 skipped |

Toàn bộ suite HEAD được chạy trên snapshot TEMP riêng, source `bf31cdf`, cùng dependency/client đã cài và DATABASE_URL giả loopback: 38 files thất bại, 96 pass, 1 skipped; 6 tests fail, 804 pass, 24 skipped. **Danh sách tên test/suite thất bại không khác nhau (diff = 0)**. Những lỗi gồm module automation/Facebook/_ee thiếu, security integration cần DB thật và sáu assertion cũ (branding, credential import, last-online, ghost guard). Không sửa các lỗi ngoài phạm vi hoặc đổi test để làm xanh.

Các lần snapshot đầu bị thiếu promptfoo fixture/cwd sai đã được sửa trước đối chiếu cuối; không lấy số liệu các lần đó làm baseline. Full-suite run đầu có một timeout voice test; lần cuối không lặp lại. Targeted regression giữ assertion cũ; hook thêm query từng làm lệch thứ tự mock đã được loại bỏ.

PGlite tests dùng cấu trúc legacy tối thiểu, chạy **SQL B/D1/D2 thật** và backfill function trên fixture: giữ row cũ, XOR, tenant spoof, wrong-account command, idempotency theo account, writer cũ sau NOT NULL, external ID theo conversation. Đây **không** là restore toàn bộ DB production, không đo lock/index size/tải VPS, không chứng minh PostgreSQL phiên bản production, JWT end-to-end hoặc connector TikTok thật.

Dependency: khai `@electric-sql/pglite` 0.3.15 trực tiếp trong devDependencies backend và lockfile; không dùng làm database runtime của CRM.

## Quy trình còn phải nghiệm thu trước staging

1. Backup/restore DB và media độc lập; xác nhận phiên bản PostgreSQL thực tế. Snapshot thử phải được khử dữ liệu nhạy cảm và không dùng session TikTok production.
2. Preflight counts/orphans/duplicate/XOR trên restore; chạy B rồi D1 theo quyền migration được cấp riêng. Đo locks, runtime và dung lượng index.
3. Chạy backfill dry-run, apply theo batch có giám sát và chạy lại đến remaining=0/invalid=0. Không suy từ fixture nhỏ ra thời gian database thật.
4. Review và thực hiện D2, lưu hash SQL/kết quả/schema state; không để Prisma rollout tự giải quyết drift theo suy đoán.
5. Sau đó dùng client/app mới, mock flags chỉ development/test; test HTTP→DB→UI→socket thực, thay đổi quyền/reconnect và smoke Zalo. Bổ sung regression của extension `_ee` nếu môi trường triển khai có các module đó.
6. Chỉ sang TT05 bridge/ingress/QR sau nghiệm thu nền DB; điều kiện live vẫn riêng. Live capability TikTok vẫn false dù mock PASS.

## Rollback

- Chưa migrate DB: rollback riêng patch C/D/E đã review; giữ thay đổi TT04-A/B hoặc công việc khác nếu muốn giữ; generate client từ đúng schema của app/DB. Không git reset toàn repo.
- Đã B/D1, chưa có channel rows: dùng app/client cũ nếu đã restore-test tương thích; giữ cột/bảng/trigger additive. D1 trigger giúp writers cũ tiếp tục bỏ orgId.
- Đã có channel rows: chỉ rollback về phiên bản **null-safe** đã được kiểm chứng, tắt channel flags và giữ dữ liệu. Không trả app cũ bắt buộc nick Zalo hoặc xóa bảng/profile/volume.
- D2 không tự viết down migration bỏ tenant/NOT NULL. Khôi phục DB từ backup chỉ theo quy trình riêng đã được chấp thuận và xác định mất dữ liệu.

## Điểm dừng

TT04-C/D/E code local hoàn tất theo phạm vi trên; database rollout và tích hợp connector chưa nghiệm thu. Chưa tự chuyển TT05, không thêm nhiều tài khoản thật, media, bình luận, AI gửi hoặc broadcast.

## Manifest file C/D/E

Đường dẫn dưới tính từ root repo. `schema.prisma`, `app.ts`, test expand và roadmap có thay đổi TT04 trước đó; rollback phải gỡ đúng hunk C/D/E.

```text
backend/package.json
backend/package-lock.json
backend/prisma/schema.prisma
backend/prisma/migrations/20261013180000_multichannel_nullable/migration.sql
backend/scripts/channels/backfill-message-org-id.ts
backend/src/app.ts
backend/src/modules/channels/channel-scope.ts
backend/src/modules/channels/unified-inbox-query.ts
backend/src/modules/channels/channel-inbox-routes.ts
backend/src/modules/channels/channel-socket.ts
backend/src/modules/channels/zalo-conversation-guard.ts
backend/src/modules/ai/ai-auto-reply-service.ts
backend/src/modules/ai/ai-followup-cron.ts
backend/src/modules/ai/ai-privacy-guard.ts
backend/src/modules/ai/ai-routes.ts
backend/src/modules/automation/stage-followup-cron.ts
backend/src/modules/chat/chat-attachment-routes.ts
backend/src/modules/chat/chat-operations-routes.ts
backend/src/modules/chat/chat-routes.ts
backend/src/modules/chat/message-handler.ts
backend/src/modules/contacts/backfill-missing-friends.ts
backend/src/modules/contacts/contact-aggregate.ts
backend/src/modules/contacts/conversation-consolidate.ts
backend/src/modules/dashboard/dashboard-action-hub-routes.ts
backend/src/modules/dashboard/dashboard-routes.ts
backend/src/modules/dashboard/excel-sheet-builders.ts
backend/src/modules/dashboard/report-routes.ts
backend/src/modules/integrations/providers/telegram-bridge/index.ts
backend/src/modules/integrations/providers/telegram-bridge/receiver.ts
backend/src/modules/media/media-routes.ts
backend/src/modules/zalo/zalo-access-middleware.ts
backend/tests/unit/channel-expand-migration.test.ts
backend/tests/unit/channel-migration-postgres.test.ts
backend/tests/unit/channel-access-realtime.test.ts
backend/tests/unit/channel-inbox-http.test.ts
frontend/src/components/chat/ConversationList.vue
frontend/src/components/chat/channel-readonly-thread.vue
frontend/src/composables/use-chat.ts
frontend/src/composables/use-privacy-visibility.ts
frontend/src/composables/channel-inbox.spec.ts
frontend/src/views/ChatView.vue
docs/ops/sql/TIKTOK-TT04D-VALIDATE.sql
docs/TIKTOK-PERSONAL-QR-IMPLEMENTATION-ROADMAP.md
docs/TIKTOK-TT04-CDE-RESULTS.md
```
