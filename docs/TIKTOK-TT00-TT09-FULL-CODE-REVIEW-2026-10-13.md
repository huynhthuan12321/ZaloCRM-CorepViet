# Kiểm tra toàn bộ TT00–TT09 — 2026-10-13

## Kết luận

TT00–TT09 đạt **PASS trong phạm vi mock/local** sau khi sửa ba lỗi quan trọng và các điểm UI/accessibility đã xác nhận.

Kết quả này không chứng minh connector TikTok Personal thật hoạt động. `live-adapter.mjs` vẫn cố ý chưa triển khai; lần kiểm tra này không đăng nhập thêm tài khoản thật, không deploy và không migrate production.

## Phạm vi và phương pháp

- Repository: `D:\ZaloCRM-CorepViet`
- Baseline Git: `bf31cdf`
- Giữ nguyên toàn bộ working tree đang dirty/untracked; không reset hoặc checkout đè công việc khác.
- Đọc và đối chiếu code backend, frontend, Prisma migrations, PoC worker và các tài liệu TT00–TT09.
- Áp dụng Superpowers tại:
  - `C:\Users\Huynh Thuan\.codex\.tmp\plugins\plugins\superpowers`
  - Các workflow dùng: requesting-code-review, systematic-debugging, test-driven-development, verification-before-completion và executing-plans.
- Áp dụng UI/UX Pro Max tại:
  - `D:\skill\ui-ux-pro-max-skill-main\.claude\skills\ui-ux-pro-max\SKILL.md`
  - Tiêu chí dùng: WCAG AA, nhãn form nhìn thấy được, trạng thái loading/error, focus rõ, touch target tối thiểu 44px và responsive dashboard.
- Review được thực hiện tuần tự trong phiên hiện tại. Không dùng reviewer subagent vì instruction của môi trường không cho phép tự phân công agent khi người dùng chưa yêu cầu rõ.

## Trạng thái TT00–TT09

| Giai đoạn | Kết quả review | Bằng chứng chính |
| --- | --- | --- |
| TT00 | PASS cho assessment/guardrail | Live mode vẫn bị chặn; mock và live được phân biệt rõ |
| TT01 | PASS cho mock setup | QR/session fixture và cấu hình loopback |
| TT02 | PASS cho PoC messaging mock | Node 20/20; browser 3/3 |
| TT03 | PASS cho kiến trúc tích hợp | Adapter, epoch, outbox, ACL và rollback khớp thiết kế hiện hành |
| TT04 | PASS | PostgreSQL restore/migration/schema/tenant guard |
| TT05 | PASS sau sửa | QR confirm được bind vào epoch hiện hành; ingress ký, dedup và realtime |
| TT06 | PASS | Outbox idempotent, single claim, resolve atomic, unknown không tự gửi lại |
| TT07 | PASS sau sửa | Heartbeat/reconciliation; command IDs tồn tại qua restart |
| TT08 | PASS sau sửa | Hai account tách ACL/session/result và chữ ký được bind theo account |
| TT09 | PASS | Capacity limit, fleet metrics, reject account/worker thứ ba |

## Phát hiện và thay đổi

### Important — đã sửa: stale QR có thể xác nhận lại session cũ

Trước khi sửa, endpoint confirm chỉ cần `browserSessionRef` tồn tại. Nó không bắt buộc:

- account đang ở `QR_PENDING`;
- epoch từ UI trùng epoch hiện hành;
- session chưa verified và chưa expired.

Sau rollback hoặc tạo QR mới, request cũ có thể nối account lại bằng trạng thái stale.

Thay đổi:

- Payload confirm bắt buộc có `epoch`.
- Backend tìm account đúng org/provider, trạng thái `QR_PENDING`, session đúng epoch, `verifiedAt=null`, `expiresAt=null`.
- Kiểm tra và update chạy trong transaction `Serializable`, retry `P2034`.
- Stale request trả `409 QR_SESSION_STALE`.
- Frontend và acceptance client gửi epoch của QR đang hiển thị.

File chính:

- `backend/src/modules/channels/mock-channel-account-routes.ts`
- `backend/tests/unit/mock-channel-account-routes.test.ts`
- `backend/scripts/channels/acceptance-local.ts`
- `frontend/src/components/chat/channel-mock-account-panel.vue`

### Important — đã sửa: reconciliation báo sai sau restart worker

Trước khi sửa, `pilotCommandIds` là `Set` trong RAM. Sau restart, CRM vẫn có command nhưng worker quên toàn bộ ID đã claim, làm `commandMismatch` tăng sai.

Thay đổi:

- Ledger có thêm `crmCommands`.
- ID command được ghi bền vững ngay sau claim và trước khi browser xử lý.
- Reconciliation đọc ID trực tiếp từ ledger.
- Ledger cũ không có field này được nâng tương thích khi load.

File chính:

- `poc/tiktok-personal-qr/src/ledger.mjs`
- `poc/tiktok-personal-qr/src/worker.mjs`
- `poc/tiktok-personal-qr/src/crm-pilot.mjs`
- `poc/tiktok-personal-qr/tests/ledger.test.mjs`
- `poc/tiktok-personal-qr/tests/crm-pilot.test.mjs`

### Important — đã sửa: chữ ký worker chưa bind theo account

Trước khi sửa, mọi mock worker ký trực tiếp bằng cùng root secret. Request hợp lệ về mặt HMAC không được ràng buộc mật mã với account cụ thể.

Thay đổi:

- Backend và worker derive signing key bằng HMAC của root secret với `mock-channel-worker:<accountId>`.
- Backend lấy `accountId` từ body chưa tin cậy chỉ để chọn key, sau đó mới xác minh HMAC và validate schema.
- Test chứng minh chữ ký tạo cho account A bị từ chối khi xác minh như account B.
- Acceptance hai account dùng key đã derive tương ứng.

File chính:

- `backend/src/modules/channels/worker-auth.ts`
- `backend/src/modules/channels/event-ingress.ts`
- `backend/src/modules/channels/outbound-command-routes.ts`
- `backend/src/modules/channels/pilot-routes.ts`
- `poc/tiktok-personal-qr/src/worker-auth.mjs`
- `poc/tiktok-personal-qr/src/crm-bridge.mjs`
- `poc/tiktok-personal-qr/src/crm-outbound.mjs`
- `poc/tiktok-personal-qr/src/crm-pilot.mjs`

### Minor — đã sửa: form/control chưa đạt tiêu chí UI/accessibility

Thay đổi:

- Thêm label nhìn thấy được với `for`/`id`.
- Thêm `aria-busy` cho panel và thread.
- Khóa nút refresh khi đang tải.
- Khóa nút gửi khi callback send không tồn tại.
- Touch target tối thiểu 44px.
- Thêm focus-visible và disabled state rõ ràng.

File chính:

- `frontend/src/components/chat/channel-mock-account-panel.vue`
- `frontend/src/components/chat/channel-readonly-thread.vue`
- Hai file spec tương ứng.

## Bằng chứng kiểm thử mới

| Kiểm tra | Kết quả |
| --- | --- |
| Backend TT targeted | 10 files, 72 tests PASS |
| Backend TypeScript build | PASS |
| Prisma validate | PASS |
| Frontend tests | 7 files, 69 tests PASS |
| Frontend production build | PASS |
| PoC Node tests | 20/20 PASS |
| PoC Playwright/browser tests | 3/3 PASS |
| `git diff --check` | PASS; chỉ có cảnh báo LF/CRLF hiện hữu |
| PostgreSQL 16 acceptance | 17/17 checks PASS |

Acceptance artifact:

`poc/tiktok-personal-qr/runtime/tt04-acceptance/c19ffc1e-c751-439e-bd3c-8428585674e8/results.json`

Acceptance xác nhận:

- restore full legacy fixture từ `bf31cdf`;
- dump/restore và checksum;
- hai migration TT04;
- lock timeout;
- backfill có thể resume và lặp lại an toàn;
- final Prisma schema không lệch database;
- tenant FK/trigger từ chối spoof org;
- JWT HTTP và Socket.IO ACL;
- QR confirmation;
- outbox idempotency/single claim/unknown;
- ingress dedup/realtime;
- pilot heartbeat/reconciliation;
- hai account độc lập;
- capacity account/worker;
- rollback account A không ảnh hưởng account B;
- tắt flags không làm mất dữ liệu Zalo.

PostgreSQL tạm đã dừng sau acceptance.

## Baseline suite ngoài phạm vi

Full backend suite đã được chạy trước vòng sửa và không xanh toàn repo:

- 107 test files pass, 38 fail, 1 skipped.
- 884 tests pass, 6 fail, 24 skipped.

Các failure quan sát được thuộc module automation/EE/Facebook thiếu, một số test cần PostgreSQL/config riêng và assertion Zalo cũ. Targeted TT suite, build, Prisma và acceptance thực đều xanh. Không coi full-suite failure này là lỗi do TT00–TT09, nhưng repo chưa có trạng thái “toàn bộ backend tests PASS”.

Frontend build còn warning chunk lớn hiện hữu; build vẫn PASS.

## Giới hạn còn mở

1. Đây vẫn là mock/local. `live-adapter.mjs` chưa triển khai TikTok thật.
2. Root worker secret vẫn là credential gốc trong môi trường local. Account-derived key chặn nhầm/cross-account ở protocol layer; muốn cách ly khi một worker process bị xâm nhập cần cấp credential riêng cho từng process/account.
3. Claim request dùng timestamp/HMAC và endpoint loopback nhưng chưa có nonce store bền vững. Một signed claim bị replay trong cửa sổ thời gian có thể gọi claim lần nữa. Trước production cần nonce/idempotency bền vững cho worker protocol.
4. Lease directory fail closed sau crash và có thể cần operator dọn stale lease sau khi xác minh PID/process. Chưa có cơ chế tự chiếm lại stale lease.
5. Pilot reconciliation giới hạn 2.000 ID. Khi vượt cửa sổ, API trả `PILOT_WINDOW_EXCEEDED`; cần retention/window strategy trước khi chạy dài hạn.
6. Runtime pilot state ở RAM backend nên heartbeat/reconciliation snapshot mất khi backend restart; worker sẽ gửi lại theo chu kỳ.
7. Kết quả kỹ thuật không thay thế việc xác nhận điều khoản/quyền sử dụng TikTok.

## Rollback các thay đổi của vòng review này

Không rollback toàn repo và không dùng `git reset`, vì working tree chứa nhiều công việc TT00–TT09 chưa commit.

Rollback chọn lọc:

1. QR epoch gate:
   - hoàn tác phần confirm trong `mock-channel-account-routes.ts`;
   - hoàn tác epoch gửi từ panel và acceptance;
   - hoàn tác test tương ứng.
2. Durable reconciliation:
   - bỏ `crmCommands`/`recordCrmCommand` khỏi ledger;
   - phục hồi `pilotCommandIds` trong RAM;
   - hoàn tác hai test PoC.
3. Account-bound HMAC:
   - bỏ hai helper derive;
   - phục hồi ký/xác minh trực tiếp bằng root secret;
   - hoàn tác test worker auth và acceptance signer.
4. UI:
   - hoàn tác riêng hai component và hai spec.

Nên rollback bằng patch chọn lọc theo các file trên sau khi lưu bản sao working tree hiện tại.
