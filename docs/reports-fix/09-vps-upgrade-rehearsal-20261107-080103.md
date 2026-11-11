# 9A tiếp tục — rehearsal nâng cấp VPS, bước1–3

Ngày **07/11/2026**, bắt đầu08:01, chốt kết quả08:18 (+07), Asia/Saigon. **COMPLETED_PENDING_VERIFICATION** trong phạm vi preflight + restore + migration/app-role/RLS tự kiểm. **VPS NOT_READY/BLOCKED**; chưa thực hiện bước4 nghiệp vụ trên image candidate, kiểm độc lập B hoặc production cutover.

Artifact: [reports-vps-upgrade-9a-20261107-080103](../../artifacts/reports-vps-upgrade-9a-20261107-080103/); [lệnh/giới hạn](../../artifacts/reports-vps-upgrade-9a-20261107-080103/commands.md), [receipt nâng cấp](../../artifacts/reports-vps-upgrade-9a-20261107-080103/logs/upgrade-receipt.json), [127 checks](../../artifacts/reports-vps-upgrade-9a-20261107-080103/logs/upgrade-checks.json). Evidence/dump/fingerprint đầy đủ ở thư mục VPS riêng0700 `/root/zalocrm-release-evidence/9a-upgrade-20261107-080103/`; backup gốc và dữ liệu khách không chuyển về local.

## 1. Phạm vi và identity

Người dùng chấp thuận triển khai bước1–3 đã đề xuất: kiểm target/candidate, restore cô lập, rehearsal migration/RLS/app role. Quyền này không được diễn giải thành triển khai production. Đã đọc quy tắc chung, contract0, E-1/O-1, audit11/12, runbook recovery, các B RC4/drift/recovery và checkpoint VPS gần nhất. Không thấy AGENTS vật lý ở root/candidate/ancestor đã kiểm; giữ chỉ dẫn AGENTS người dùng cung cấp. Không dùng agent/worktree mới, không sửa runtime/test/ops/SQL/dependency; không Git stage/commit/tag/push/merge/reset/stash hoặc deploy.

| Đối tượng | Identity đã đối chiếu |
|---|---|
| Root | `F:/ZaloCRM-CorepViet`, HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, dirty có sẵn giữ nguyên |
| Candidate | `F:/ZaloCRM-candidates/reports-20261103-1023`, clean `297fe538eed7d62ab7f387f3b2e1a892433d2970`, tag secure-recovery đã có; runtime RC4 `b9160f5da0df36cfc6bad2755b200e8cdb86f980` |
| Patch bất biến | `cf70b805…` → `b9160f5…`,3paths migration/schema/test; SHA256 `e1a296cf3a13d9b4e44923f4f038c998d7843170e3b8c413cda42a92ef75a728` |
| Git LF bundle | SHA256 `5013d78762fa4ec1ee746e8553154c6d7303fabe87a0c8a05d6e9eafc663530f`; mọi Prisma file khớp blob Git chuẩn |
| VPS deployed HEAD/image | `40675e42…`; app image `sha256:7222380be97b0ff4f74c786752a07f0d0f3509876152eb0b19429fd1a4046f14` |
| Backup dùng lại | Snapshot03/11,20,778,508bytes, SHA256 `d8afc177c3973de2053a622c9d30623c98b03565e2291935d5241864cecf32d4`; file0600, không tạo dump production mới |
| PG image | Existing `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`, PG16.15, pull=never |

TikTok tiếp tục bị loại trong candidate đã duyệt; không khôi phục connector, không xóa migration/dữ liệu lịch sử. Không tuyên bố VPS cũ đã được gỡ TikTok bằng rehearsal này.

## 2. Preflight mới, không dùng số liệu03/11 làm hiện trạng

VPS hiện có tổng RAM khoảng15.6GiB, khả dụng khoảng11.2GiB, swap trống4GiB; filesystem53GB trống/126.7GB tổng theo đơn vị thập phân tại sample. Mức84% disk/1.3GiB khả dụng của03/11 không còn là sample hiện tại. Đây là headroom cho rehearsal có giới hạn, không phải load/capacity production approval.

Git production vẫn `40675e42…` với các thay đổi AI/Compose/backup UI có sẵn; không checkout hoặc ghi đè chúng. App/DB IDs giữ nguyên nhưng đã có start time mới sáng07/11 trước khi lượt này bắt đầu. Baseline được lấy từ preflight mới, không khẳng định còn nguyên start time tháng10.

Ledger target129/129 finished,0unfinished; tất cả checksum khớp blob LF của candidate, chỉ thiếu `20261103180000_reconcile_rc4_schema_drift`. App hiện tại vẫn dùng crmuser superuser/BYPASSRLS và public RLS enabled/forced đều0. Rehearsal không thay những trạng thái production này.

## 3. Restore cô lập đã thực hiện

Helper `restore-only.py:13–15` kiểm private backup/archive SHA; `:32` tạo target riêng; `:46` xác minh ID/name/label/network/mount/OID/system ID trước restore; `:52–59` so với fingerprint snapshot gốc. Source helper chỉ nằm trong artifact, không được đăng ký app hoặc production runner.

Container mới `zalocrm-upgrade-20261107-080103`, ID `1fe5aee1555aa25035ad719411781ed6ad79e19ab4e48b0b01f4efaef22714c9`, database `upgrade_rehearsal`, OID16385, system identifier riêng. Xác nhận0table trước restore; network none,0published port,0production mount,1.5GiB memory/no-swap,1GiB data tmpfs,CPU1. Restore single-transaction/exit-on-error mất **11.057s**, không phải RTO cam kết.

**123/123 bảng** khớp snapshot backup qua row count và MD5 của chuỗi row-hash đã sort; row values/fingerprint inventories không rời VPS. Đây là comparison control có giới hạn collision, không phải chứng minh byte-level storage hoặc PITR. Không so backup03/11 với live writes07/11.

Role crmuser superuser chỉ được tái dựng trong cluster test để phục hồi ownership và làm maintenance. Nó không được dùng làm bằng chứng isolation của app.

## 4. Migration, RLS và app role đã thực hiện

Windows Docker daemon đang tắt. Không tự khởi động hoặc rebuild image. Dùng **image VPS có sẵn chỉ làm Prisma CLI7.5.0/Node22.23.3**, đã so candidate lock Prisma/client7.5.0. Đây không phải chạy image ứng dụng candidate.

CLI containers dùng entrypoint Node/Prisma, không boot app; bundle riêng chỉ read-only, DOTENV_CONFIG_PATH trỏ đường dẫn không tồn tại; DATABASE_URL là kết nối maintenance tổng hợp chỉ trong namespace PG test. Namespace của PG là network-none; không có provider/session/queue/cron/socket app, real send hoặc paid AI. Không mount source production, .env hoặc session thật vào runner.

`upgrade-only.py:26` gọi `prisma migrate deploy` bằng exact canonical migrations; role crmuser maintenance chỉ ở target đã xác minh. Migration RC4 tại candidate `backend/prisma/migrations/20261103180000_reconcile_rc4_schema_drift/migration.sql:2–59`: explicit transaction, lock_timeout5s, statement_timeout5min mỗi statement, reject orphan/cross-org trước backfill. Lượt này không tạo dữ liệu lỗi để rerun toàn bộ bad-data/concurrency/lock matrix.

SQL RLS được áp **riêng sau migrate**, nguyên file Git, trong transaction/ON_ERROR_STOP bằng maintenance owner. App role mới `rehearsal_app_20261107` LOGIN NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION,0owned object và không CREATE public; ledger không app-writable. Đây là kết nối psql thực bằng app role trong container test với local trust; không chứng minh password/JWT authentication.

| Lệnh/kiểm thực tế | Kết quả mới |
|---|---|
| `migrate deploy` | exit0, **129→130**, chỉ thêm migration RC4 đúng checksum;10.417s |
| `prisma validate` | exit0;9.362s, chỉ schema validation |
| `migrate status` | exit0;9.426s, không pending migration |
| `migrate diff --from-config-datasource --to-schema --script` | exit0 tạo SQL,9.659s; **còn DROP INDEX contacts_pool_robin_idx** do index SQL-only chủ ý giữ; không gọi schema diff0 và không áp script |
| Policy/catalog |102direct-org tables và care_session_events: **103 ENABLE/FORCE/policies**; Message NOT NULL/FK valid, mediaFK+2trigger và welcome default1 |
| App SQL checks | **127/127 PASS**,0FAIL; xem phân lớp bên dưới |
| Data sau upgrade và dọn fixture | **122/122 bảng nghiệp vụ** giữ fingerprint, **129 bản ghi ledger cũ** giữ nội dung/hash; chỉ ledger thêm RC4 |

127 checks gồm identity/restore/ledger/catalog/role,103no-context SELECT count trả0 trên các bảng policy, và selected own/foreign/missing-context contact DML. Fixture2org/2contact tổng hợp chỉ được tạo ở bản copy, không gửi tin; các mutation kiểm bằng app role đều rollback hoặc bị reject42501. Owner dọn đúng hai org fixture, sau đó so lại122 bảng.

Các boundary đọc/ghi được kiểm tại `upgrade-only.py:43–65`: actual current_user/session_user cùng app role, own X/Y đọc được, foreign/unknown bị ẩn; own insert/update hợp lệ; foreign update/delete0; cross insert/reparent, missing context và ledger-write bị42501. Không suy103no-context reads thành chứng nhận mọi bảng có đầy đủ cross-org DML hoặc mọi HTTP endpoint.

## 5. Diagnostics được giữ nguyên

1. Preflight đầu lỗi helper vì Python VPS không có hashlib.file_digest; không tạo resource. Đổi helper sang streamed SHA256, không đổi expected hash; rerun1 đạt. Log đầu còn nguyên.
2. Archive Git mặc định Windows có CRLF. Archive-level checksum đúng nhưng guard file-level blob hashes từ chối **trước khi tạo DB/container**. Giữ archive/extracted inputs/FAILED receipt. Xuất archive LF riêng bằng process-only Git config; mọi hash Git/129ledger expectation giữ nguyên. Không normalize rồi ghi đè migration hoặc sửa ledger.
3. Docker local không chạy; đã nêu giới hạn tooling phía trên. Không lấy image VPS cũ làm chứng nhận candidate-image business/fallback.
4. Prisma diff còn index SQL-only; giữ stdout SQL nguyên, không sửa schema/xóa index để làm diff sạch.

## 6. Integrity, cleanup và risk

Covered input hashes đầu/cuối: **root1166/1166, candidate1037/1037 không đổi**, HEAD unchanged và candidate clean. Scope gồm source/test/Prisma/backend scripts/ops/Docker/frontend/build inputs/runbooks, chủ ý không đọc .env/secrets/generated/node_modules. Không gọi đây là hash mọi byte trong toàn repository. Preimage2README, diff tài liệu và git scope proof lưu riêng.

Đã xóa đúng **5 container** do lượt này tạo sau kiểm exact ID/name/label:4CLI+1PG.0run container còn lại; không xóa image/volume, giữ backup và private evidence. Hậu kiểm production: app/DB ID/image/start time và Git HEAD/status không đổi, ledger vẫn129/0unfinished, RLS vẫn0 và crmuser vẫn super/bypass. Live customer writes có thể tiếp tục bình thường; không khẳng định dữ liệu production hoàn toàn bất biến.

Áp dụng skill [assess-patch-risk](<C:/Users/Huynh Thuan/.codex/plugins/cache/openai-curated-remote/codex-security/0.1.32/skills/assess-patch-risk/SKILL.md>) cho diff bất biến. JSON và Markdown lưu qua plugin-managed storage, validator **exit0** trước/sau rehearsal. Recommendation **hold_for_evidence**; impact high, likelihood moderate, protection partial, recovery hard, confidence moderate. Đây là advisory về rollout, không phải production approval hoặc B execution.

[Risk JSON cuối](<C:/Users/Huynh Thuan/.codex/state/plugins/codex-security/scans/ZaloCRM-CorepViet/artifacts-885902c26c51612e9d8524a501d7200f4a85a165ec3ee70ab606091af1facec1/artifacts/rehearsal-20261107-080103/patch-risk-assessment-final.json>).

## 7. Trước/sau và bước tiếp

Trước: chỉ có bằng chứng restore current backup, chưa rehearsal nâng cấp từ backup thực. Sau: bước1–3 tự kiểm đạt, có127SQL/metadata checks và bằng chứng data/ledger preservation trên backup03/11. Không đổi source/product behavior trong lượt này. File dự án tạo/sửa chỉ checkpoint này, README gốc, roadmap và artifact mới.

**Tiếp theo là bước4 rồi lượt B độc lập** trên exact candidate/image:

1. Có image candidate đúng digest trên môi trường staging cô lập; restore mới và lặp upgrade đã review. Bản test của lượt này đã bị dọn; không coi DB còn sống.
2. Kiểm app bootstrap/JWT/HTTP/report/Excel/main/shared/canonical và các caller jobs/reconnect/media/knowledge dưới app role/guard/GUC; cô lập provider/session/background trước startup. Kiểm fallback giữ E-1/O-1 và no TikTok. Không dùng CLI image làm app candidate.
3. B tạo evidence riêng, không đổi A checks thành B execution. Nguồn dump có PII vẫn private; chỉ receipt được chuyển local.
4. Hoàn tất full-suite/baseline disposition, AI/Compose dirty compatibility, actual-target config/role rollout, media/key/offsite recovery, maintenance/monitoring/soak và backup mới sát cutover. Chưa làm các phần này; không deploy production theo kết quả127/127.

Không tiếp tục bước4/B hoặc production trong lượt1–3 này. **COMPLETED_PENDING_VERIFICATION; VPS NOT_READY/BLOCKED.**
