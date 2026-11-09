# 9A — Bước4: actual-image business, JWT/report và fallback

**07/11/2026**, bắt đầu08:26, kiểm/cleanup xong09:02 (+07), Asia/Saigon. **COMPLETED_PENDING_VERIFICATION trong phạm vi A đã kiểm. VPS NOT_READY/BLOCKED.** B độc lập cho chuỗi rehearsal mới chưa thực hiện; không production cutover.

[Artifact](../../artifacts/reports-vps-business-9a-20261107-082623/), [lệnh/giới hạn/diagnostic](../../artifacts/reports-vps-business-9a-20261107-082623/commands.md), [receipt V2](../../artifacts/reports-vps-business-9a-20261107-082623/logs/business-v2-receipt.json), [kết quả/counter an toàn](../../artifacts/reports-vps-business-9a-20261107-082623/logs/safe-summary.json). Real backup, row fingerprints và raw app logs chỉ ở private VPS0700 `/root/zalocrm-release-evidence/9a-business-20261107-082623/`; không chuyển raw dữ liệu/token về local.

## Identity và scope

Root HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, dirty có sẵn; candidate clean `297fe538eed7d62ab7f387f3b2e1a892433d2970`, runtime RC4 `b9160f5da0df36cfc6bad2755b200e8cdb86f980`. Không sửa runtime/test/ops/SQL/dependency hoặc stage/commit/tag/push/merge/reset/stash. Không tạo agent/worktree. Chỉ checkpoint này, hai README và artifact mới thay đổi.

| Image | Identity mới kiểm/đưa vào cache VPS |
|---|---|
| Primary | `zalo-crm-rc:reports-rc4-drift-20261103-175649-final`; index `sha256:fdd5524c28eeae4bf01cc3c5f511889ba418272faeffb8e077f23e11c0c34eea`; platform `32dd4917…`; config `4377e23a…` |
| Fallback | `zalo-crm-rc:reports-rc4-followup-20261103-163013-final`; index `sha256:07f525e94a9607c748381d1129cbb9ba61e8328efc26a021b69df41f36eabb15`; platform `ed261890…`; config `24c27391…` |
| Transport | Docker image save hai image đã có,2199526912bytes; SHA256 `f7fafd0fc23f6c6c168b1d123f1280ef89728ba8fc3cfa7b1537b3e77f00e10b`. Kiểm **34 OCI blobs**, root index/platform/config/layers khớp; không rebuild hoặc thay production tag |

Docker Desktop local được khởi động hidden để xuất image; không tạo local CRM test container hoặc dừng/xóa container local khác. Hai image đã được nạp vào cache VPS để rehearsal và được giữ sau cleanup, không có candidate app chạy phục vụ traffic. TikTok tiếp tục bị loại; candidate/fallback POST route TikTok trả404 trong matrix.

## Prerequisite được chạy mới

Fresh PG16 target `5e0e230caf6d37b51fdc1189ea7d1c1888696062b54117a87a483892a1285dc7`, database `business_rehearsal`, OID16385 và system ID riêng. Network none,0published ports/production mounts; tmpfs1GiB/memory1.5GiB/no-swap/CPU1. Zero-table/ID/label/OID/backup SHA được xác minh trước ghi.

Backup03/11 SHA `d8afc177…cf32d4`, không phải dữ liệu live07/11. Restore **123 bảng khớp snapshot**,10.503s; canonical LF migrate129→130 bằng **CLI trong primary image**; validate/status exit0, RLS103 và app role non-owner/NOSUPER/NOBYPASS, **127/127** prerequisite SQL/metadata checks đạt. Đây là lượt mới, không lấy127 của bước1–3 làm execution hiện tại. Raw schema diff vẫn chứa DROP INDEX contacts_pool_robin_idx do index SQL-only; không áp script hoặc gọi diff0.

## Cô lập trước khi boot app

Chỉ bản copy được biến đổi: Zalo session_data=NULL/disconnected/manual; FB token/pull, bridge Telegram và AI/auto-reply/follow-up bị vô hiệu hóa; public API plaintext bị xóa và copied refresh tokens bị dọn. [Receipt zero-count](../../artifacts/reports-vps-business-9a-20261107-082623/logs/sanitization-receipt.json) được tạo trước application entrypoint. Không tuyên bố đã audit/scrub mọi credential column trong123table. Dump gốc không bị thay đổi.

JWT/password/encryption key đều tổng hợp. Test login dùng user X/Y mới seed sau restore; không rewrite password khách hàng và không chứng minh login bằng credential thật đã restore. Secret/token chỉ memory hoặc metadata của own ephemeral containers, không ghi báo cáo. No real .env/session/key mount.

App/client/fresh Redis chỉ join namespace **network-none của PG test**; không kết nối Redis production. App/client rootfs read-only, cap-drop/no-new-privileges, mount verify riêng read-only và tmpfs có giới hạn. `NODE_ENV=test` + cron boundary stub cho API matrix; source Fastify/routes/Prisma/auth/report giữ nguyên image. Production-mode SPA probe có thêm BullMQ Worker processor stub và synthetic keys. Không real send/provider/paid AI; không chứng nhận real queue/cron/SDK/realtime behavior từ mode này.

## Kết quả mới theo từng lớp

| Kiểm thực tế | Kết quả / giới hạn |
|---|---|
| OCI transport/import |34blobs và exact primary/fallback identity đạt; không image rebuild |
| Prerequisite PG16 |127/127, fresh backup restore + migrate/RLS/app role; không JWT/browser proof |
| V1 primary→fallback→primary | **281PASS/3FAIL mỗi pha;843PASS/9FAIL**. Giữ nguyên source/log/receipt;3stimulus/oracle mismatch được giải thích bên dưới |
| V2 primary→fallback→primary | **293/293 mỗi pha,879/879 tổng**, actual login/JWT/HTTP/Excel/Prisma trên real-backup derivative với user/fixtures giả |
| Health pause/recover | **48/48**, actual HTTP khi pause/recover Redis và PG riêng từng image; liveness vẫn200. Chạy ở V1 fixture với cùng images/config; không gọi là rerun V2 |
| Production-mode SPA | **5/5**: `/`, `/login`, `/reports/tong-quan`, `/reports-co-ban` trảHTML200; unknown API trảJSON404. Có cron/Worker stubs; không browser JS journey |
| Data qua switches và SPA | **7 protected tables** giữ fingerprint trong từng fixture version và sau production-static: messages/conversations/contacts/media_assets/knowledge_docs/knowledge_chunks/_prisma_migrations |

Các assertion có phần giao nhau, không cộng thành coverage %. Không chạy full suite/frontend/build/browser/mobile/PWA mới. V1/V2 là A tự kiểm, không B execution.

### Matrix HTTP và oracle

Mỗi pha kiểm owner/admin, leader/deputy có grant, singleton có grant, member, leader thiếu grant và tổ chức Y.12report endpoints, basic messages/contacts/appointments,3analytics GET, custom, saved CRUD/run, Excel. Auth bằng login thật; cùng access token sau downgrade/inactive/revoke grant bị403, khôi phục fixture hợp lệ lại200. Cross-org signed token và client filters không mở scope. TikTok404, unauth/invalid token401, invalid/reversed period400.

Oracle SQL maintenance độc lập với report-scope helper, chỉ query fixture org/roster cố định. App HTTP chạy role nonowner/enforce/GUC true. Canary local/deleted/dry-run/test/virtual/merged, biên00:00VN trước/đúng/sau kỳ, snapshot khác new-in-period, inbound missing actor giữ bucket, main/shared AI tách riêng và cost/token unavailable khác measured0. Thêm control response time **60s từ tin cuối khách09:04 đến người09:05**, AI09:04:30 không đóng lượt. Saved-run/Excel đối chiếu canonical SQL trong scope người xem.

Đây không phải exhaustive audit mọi endpoint/table/DML hay provider callback. Các media/knowledge bảng giữ dữ liệu không đồng nghĩa đã rerun toàn bộ service mutation/storage/provider suite. Default30day UI và browser error/retry/focus không được tái nghiệm thu trong lượt HTTP này.

## Ba lỗi harness V1 và cách bổ sung control

1. **SPA:** V1 đòi HTML khi NODE_ENV=test. Source candidate `backend/src/app.ts:238`/`:429–435` chỉ phục vụ SPA ở production. V2 kiểm404 đúng mode và thêm probe production-mode thật5/5, không bỏ mục tiêu HTML.
2. **AI fixture:** V1 dùng sentVia=ai; `ai-report-service.ts:58–62` yêu cầu ai_auto hoặc metadata.aiAuto. V2 đổi chỉ synthetic AI IDs sang marker writer thật, thêm unsupported-ai marker canary để kiểm âm; kỳ vọng main/shared1/1 đạt. V1 snapshot/receipts còn nguyên.
3. **Filter userId:** `custom-report.ts:195–223` chỉ áp source filter ở metric này; [01-scope.md:50](01-scope.md) đã ghi userId/status chưa hỗ trợ. V1 đòi0 không đúng contract hỗ trợ hiện tại. V2 yêu cầu số main-scope không đổi khi gửi field unsupported; thêm supported-source narrowing positive và source ngoài phòng trả0. Không triển khai filter userId hoặc nới quyền backend.

Không sửa assertion/project test hoặc runtime để tăng PASS. Harness V2 riêng, fixture version/oracle mới và log source-grounding đều giữ; không đổi9FAIL cũ thành PASS. B cần kiểm lại tính đúng của diagnosis/oracle, không chỉ chạy lại số đếm.

## State mutation, integrity và cleanup

Các bảng có mutation quan sát trong V1 gồm activity_logs, refresh_tokens, users/permission_groups, nba_templates/score_signal_rules/scoring_configs/stage_transition_rules/stuck_thresholds và zalo_account_status_log. Chúng tương ứng login/audit/fixture revoke-restore, seedScoringSystem và status-log startup backfill; không khẳng định toàn DB không đổi. Saved rows đã tạo/xóa trong test. Raw snapshots/log nằm private để B đối chiếu.

Fixture V1→V2 chủ ý đổi AI marker/contact source và thêm negative canary; không so hai fixture versions như cùng dataset. Trong từng version,7protected table hashes giữ nguyên sau các switches; sau production-static vẫn không đổi.0tenant-context/startup-fatal errors trong summary đã kiểm; raw logs vẫn private.

**Root1166/candidate1037 covered inputs giữ nguyên hash**, HEAD không đổi, candidate clean. Scope source/tests/Prisma/scripts/ops/Docker/frontend/build inputs/runbooks; không đọc .env/secrets/generated/node_modules. Không khẳng định hash toàn bộ filesystem. Preimage README, diff tài liệu và status scope proof nằm artifact.

Đã xóa đúng **33 container** do run tạo sau kiểm exact ID/name/label;0run container còn lại. Không xóa image/volume/prune; image cache/archive và private evidence được giữ cho B. Production app/DB ID/image/start time, Git HEAD/status không đổi; ledger129/0unfinished, RLS0 và crmuser super/bypass không bị lượt này thay. Live customer writes có thể tiếp tục; không tuyên bố mọi row production bất biến.

## Bàn giao B và gate production

1. B kiểm độc lập exact OCI index/platform/config và candidate297fe538; tự tạo target/label/evidence riêng. Không ghi đè artifact A hoặc dùng fixed-ID helpers như production runner.
2. Restore backup private, upgrade/RLS/app role, kiểm fixture sanitation/network/cron/Worker boundary trước startup. Tự tạo oracle/controls và xác minh cùng JWT revoke, main/shared, canonical, snapshot/period,60s, Excel/saved; review3diagnostic V1.
3. Kiểm các state mutations được phép và7protected data/ledger tables qua fallback; giữ fallback application-only trên schema130/RLS, không replay migration cũ/down-migrate/tắt guard/RLS. Fallback cùng runtime code nên không chữa common-mode bug.
4. Release vẫn cần full-suite/baseline disposition, actual AI/Compose dirty compatibility, actual-target app-role/config rollout, real session/provider/worker behavior trong phạm vi được duyệt, media/key/offsite recovery, maintenance/monitoring/soak và backup mới sát cutover. Không được xem879/879 là production approval.

**B cho rehearsal mới NOT_STARTED; VPS NOT_READY/BLOCKED.** Không deploy production trong lượt này.
