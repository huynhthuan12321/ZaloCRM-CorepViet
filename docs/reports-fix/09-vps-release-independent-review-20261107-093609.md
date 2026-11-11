# B độc lập — source và bằng chứng rehearsal VPS

Ngày 07/11/2026, Asia/Saigon; bắt đầu 09:36, đối chiếu source và bằng chứng đến 09:48 (+07). Chỉ read-only Git/source/log/hash; không SSH, DB, Docker, test ứng dụng, provider hoặc deploy. Người dùng cho phép agent B chỉ kiểm tra. Không sửa source/ops/test/README hoặc artifact A. Đầu ra riêng tại [artifact B](../../artifacts/reports-vps-release-b-20261107-093609/).

**Hồ sơ/claims A: PASS trong phạm vi kiểm tĩnh được nêu dưới đây. Production readiness: NOT_READY / BLOCKED.** Không phát hiện contradiction làm mất hiệu lực những kết quả A đã giới hạn đúng phạm vi. Có blocker tương thích AI được root phát hiện khi kiểm target mới, B đã đọc lại receipt/source evidence; không dùng kết quả của image cũ chứng nhận image overlay mới. Đây không phải B DB/JWT/HTTP execution mới và không chuyển 5B/6B/9B execution gate thành PASS.

## 1. Identity và tính toàn vẹn được kiểm mới

Đã đọc quy tắc chung, checkpoint 9A bước1–3/bước4, scope contract, B RC4/followup/drift/recovery03/11 và source liên quan. Không tìm thấy AGENTS vật lý trong các cây source đã tìm; giữ AGENTS người dùng cung cấp. Root có thay đổi có sẵn, bao gồm xóa TikTok được duyệt; không khôi phục chúng.

| Input | B kiểm mới |
|---|---|
| Root HEAD | `eb1be0bce8f60858436b98370f3c517edcb041b7`, dirty; **1166/1166** covered files khớp A, không thêm/mất/đổi input trong tập bao phủ |
| Candidate | `297fe538eed7d62ab7f387f3b2e1a892433d2970`, clean; **1037/1037** covered files khớp A; runtime baseline `b9160f5…` theo provenance B03/11 |
| A artifact manifest | **114/114** paths khớp byte count/SHA256; không mismatch |
| OCI archive A | Stream hash khớp `f7fafd0fc23f6c6c168b1d123f1280ef89728ba8fc3cfa7b1537b3e77f00e10b`; **34/34** blob content digests khớp tên blob |
| Image identity | Primary index `fdd5524c…`, platform `32dd4917…`, config `4377e23a…`; fallback index `07f525e9…`, platform `ed261890…`, config `24c27391…` trong receipt A/provenance B03/11 |

B không load/rebuild/chạy image. Hash archive không tự chứng minh tiến trình hiện đang phục vụ traffic. Tập hash không bao gồm .env/bí mật/generated/node_modules hoặc toàn filesystem. Verifier chỉ đọc byte/hash OCI, không trích xuất rootfs. [Current identity](../../artifacts/reports-vps-release-b-20261107-093609/current-identity.json), [manifest](../../artifacts/reports-vps-release-b-20261107-093609/a-manifest-integrity.json), [OCI](../../artifacts/reports-vps-release-b-20261107-093609/oci-blob-integrity.json).

## 2. Recount hồ sơ A và tính đúng của V1→V2

Tự parse các JSON assertion, không chỉ tin receipt tổng hợp:

| Lớp A đã chạy | B đọc/recount mới | Phạm vi |
|---|---|---|
| V1 ba pha | mỗi pha281 PASS/3 FAIL; tổng843 PASS/9 FAIL | Original FAIL và tên3ca còn nguyên |
| V2 ba pha | mỗi pha293/293; tổng879/879 | Assertion HTTP/login/JWT/Excel/Prisma trên copy backup đã sanitize |
| Prerequisite |127/127 | Metadata/SQL/RLS, gồm103 no-context reads và selected contact DML |
| Health |12 controls,48/48 assertions | V1 fixture, pause/recover; max readiness ghi nhận1691ms |
| Production SPA |5/5 | HTML và API404; cron/Worker stub, không browser JS |

Health helper `readiness-client.mjs:2` dùng timeout6000ms và không assertion deadline3000ms. Do đó48/48 không được nâng thành chứng nhận lại native/fetch concurrency/deadline matrix B03/11; A không đưa claim đó. Các con số là assertion có giao nhau, không coverage%.

Ba diagnosis hợp lệ trong phạm vi stimulus đã sửa:

1. **SPA test mode:** candidate `backend/src/app.ts:238`, `:430–435` chỉ đăng ký static/fallback ở production. V1 kỳ vọng HTML ở NODE_ENV=test sai mode. V2 giữ kiểm404 và bổ sung production-mode probe5/5. Không xóa mục tiêu HTML.
2. **AI marker:** candidate `backend/src/modules/dashboard/ai-report-service.ts:60` đếm `ai_auto` hoặc boolean metadata.aiAuto; writer `backend/src/modules/ai/ai-auto-reply-service.ts:308–312` ghi đúng hai marker. V1 sentVia=ai không đúng writer. `business-rerun.py:19–20` chỉ sửa fixture IDs X/Y và thêm invalid-marker canary. V2 main/shared1/1 có control âm, không sửa definition để hợp số.
3. **Unsupported userId:** candidate `backend/src/modules/analytics/reports/custom-report.ts:195–223` không áp userId; `docs/reports-fix/01-scope.md:50` đã ghi rõ chưa hỗ trợ userId/status. V1 đòi0 không tương ứng contract. V2 đòi main department count giữ nguyên và thêm supported-source narrow/outside0. Control source áp groupBy day; không chứng nhận source filtering ở mọi groupBy/metric. Không chứng nhận mọi unsupported client field bị reject.

`business-client-v2.mjs:19–25` có nhiều route checks status/foreign ID; kiểm tổng SQL chính tập trung basic/custom/Excel với5scope. Không suy12report route200 thành mọi aggregate/field đều đúng. Oracle `business-run.py:35–48` dùng SQL/roster cố định, không import report-scope; vẫn là oracle A, không oracle B execution. [HTTP recount](../../artifacts/reports-vps-release-b-20261107-093609/http-recount.json), [layers](../../artifacts/reports-vps-release-b-20261107-093609/saved-layer-recount.json).

## 3. Safety, state mutation và cleanup

Source `rehearsal_common.py:35–45` kiểm exact container ID/name/label/network-none/no ports/tmpfs/OID/system ID khác production; `restore-only.py:46–51` kiểm identity và0table trước restore. Canonical Git SHA check trước extraction/DDL; không normalize ledger. Upgrade `upgrade-only.py:33–46` áp exact RLS và tạo app role NOSUPER/NOBYPASS/nonowner; selected DML không đồng nghĩa mọi bảng đã được DML test.

App `business-run.py:11–23` truyền synthetic env keys, namespace PG đã cô lập, read-only rootfs/mount verify, không mount production env/source/socket. `:56–58` sanitize copied sessions/providers/AI/public plaintext key và refresh trước app. Không claim scrub tất cả credential columns. `production-guard.mjs:4–6` thay BullMQ Worker; `job-guard.mjs:4–5` thay cron callbacks. Đây là safety boundary hợp lý cho rehearsal, đồng thời loại khả năng chứng nhận real workers/cron/session/provider.

`business-run.py:98–106`, `business-rerun.py:40–42` và `collect-summary.py:20–30` so7protected tables trong từng fixture version, sau SPA. Fingerprints là sorted MD5 row controls, không byte-level storage proof. V1→V2 thay fixture có chủ ý nên không dùng chung baseline. Raw fingerprints/customer rows/app logs không có trong local evidence B được phép đọc; B xác minh logic/receipt, không tái đo remote data.

Mutation A khai báo phù hợp đường gọi: auth/login/audit và fixture roles/grants; scoring defaults; candidate `backend/src/app.ts:523–527` chạy status-log backfill. Không chứng nhận mọi mutation từng row được audit độc lập. Các bảng protected không thay đổi theo receipts; không suy toàn DB bất biến.

Cleanup source `cleanup-owned.py:7–16` kiểm exactID/name/label và loại production IDs trước rm. Receipt stdout có33unique IDs removed/0remaining; không image/volume prune. Postflight ghi production IDs/images/start/Git không đổi, ledger129/0unfinished/RLS0; đây là receipt A đã hash, không live check B. Không coi hoạt động ghi live hợp lệ của khách là mất integrity.

## 4. Blocker deployment mới — tương thích AI đang phục vụ

**P2 — không deploy nguyên primary/fallback đã kiểm nếu yêu cầu giữ tùy biến AI hiện hành.** Root mới kiểm read-only target; B đọc lại `artifacts/reports-vps-cutover-prep-20261107-093609/logs/ai-compatibility.stdout.log:4–35`, `:39–100` và helper `tools/ai-compatibility.py:7–14`. Đây là inspection root, không SSH invocation B.

- Live policy/auto-reply có fullAuto; policy chỉ bỏ guard giá/chốt khi fullAuto=true và vẫn yêu cầu sources. Primary và fallback đều không có fullAuto. Thay image trực tiếp làm thay đổi hành vi đang dùng.
- Live follow-up `FOLLOWUP_TIMEOUT_MS=60_000`; hai image candidate đều30_000. Live file còn khác hash do hotpatch; chỉ Git dirty source không đủ chứng minh bytes đang chạy.
- Hash live policy `8ae20fe6…`, auto-reply `ff1738ea…`, follow-up `73398dc1…`; primary/fallback lần lượt `57caf22a…`, `cde3f181…`, `9e9eb16d…`.

Đây không bác bỏ A vì A đã giữ gate actual AI/Compose compatibility mở. Nếu root tạo immutable overlay bảo tồn thay đổi, đó là **identity mới** cần source→compile→payload binding và kiểm synthetic policy/worker boundaries liên quan; không gán879/879 của fdd5524/07f525e cho overlay. Không khuyến nghị copy opaque live dist toàn bộ hoặc mở thêm bypass ngoài tùy biến đã xác minh. [B ghi nhận receipt tương thích](../../artifacts/reports-vps-release-b-20261107-093609/root-ai-compatibility-evidence.json).

## 5. Full suite — phân loại có bằng chứng, chưa miễn gate

B đọc/hash/parse **log gốc** RC3 và RC2final: SHA khớp audit B03/11, failure headings khớp; RC3 **33file FAIL/6test FAIL/1119PASS**, RC2final **35/8/1111**,29import/setup headings chung,0candidate-only failure name. Không full-suite mới, không kết luận current RC4 vẫn đúng6fail hoặc đã PASS. [Parser result](../../artifacts/reports-vps-release-b-20261107-093609/historical-full-suite.json).

| Lỗi lịch sử | Đối chiếu current source/test | Disposition B tĩnh |
|---|---|---|
| Branding2 | source `org-branding-routes.ts:30–35` default Cờ Rếp Việt; log `full-candidate.log:1763–1780` đòi HS Holding | Assertion branding cũ; không bằng chứng crash, cần chốt expected brand/test ở lượt sửa riêng |
| Last-online2 | source `profile-routes.ts:52–71` trả flat; `presence-service.ts:47–53` cache30s. Test `profile-routes.test.ts:52`,`:78–85` chỉ clearMocks, kỳ vọng nested và dùng lại cùng account/user khi mock rejects | Mismatch shape/cache rõ; chưa new execution. Không coi200 từ cache là chứng nhận provider-error path |
| Reconnect1 | old log `:1856–1885` strict select thiếu disconnectReason; current `zalo-ghost-fix.test.ts:98–100` đã mong orgId+disconnectReason, source `zalo-pool.ts:370–385` có guard | Test đã đổi sau log; old FAIL không chứng minh current fail hoặc pass. Các B reconnect controls03/11 riêng vẫn có giá trị trong scope cũ |
| Credentials/import500 | `credential-routes.ts:108–120` gọi encryptSessionData; `session-crypto.ts:24–25` ném lỗi nếu thiếu ENCRYPTION_KEY. Test profile-media không set/mock key; logger mocked | Khả năng thiếu synthetic key có căn cứ source nhưng log không chứng minh nguyên nhân500. **Cần kiểm synthetic-key import/encrypt/decrypt roundtrip mới**, giữ key production khi cutover; không thử credential thật |
|29setup/import headings| log gốc `:1355–1755` missing automation/EE/Facebook/Zalo-ads modules/path | Cần đối chiếu active feature registry/deployment usage; không toàn bộ harmless chỉ vì baseline cũng fail |

Điểm thực dụng ưu tiên: credentials/key continuity, live AI compatibility và active feature bindings; không yêu cầu sửa branding runtime để làm con số đẹp. Không sửa artifact hoặc assertion trong lượt này.

## 6. Gate còn mở và bàn giao

Production **NOT_READY/BLOCKED** từ evidence hiện có. Các việc còn có thể đổi quyết định cutover:

1. Đóng AI hotpatch/Compose compatibility bằng release identity mới nếu bảo tồn live customization; kiểm synthetic controls và primary/fallback tương thích.
2. Full-suite failure disposition ở current revision, ưu tiên credential import/crypto và active modules; cần execution phù hợp hoặc lý do có bằng chứng rõ, không blanket waiver.
3. Target production đang khác rehearsal (A postflight ledger129/RLS0/app super-bypass; rehearsal130/103RLS/nonowner/enforce/GUC). Cần triển khai cấu hình/role/migration theo runbook với fresh backup gần cutover, chứng minh guard/RLS/auth/caller behavior trước mở traffic. B này không thực hiện.
4. Real session/key/media recovery và worker/cron behavior chưa được879 chứng nhận do sanitize/stubs. Tách phần đã có B03/11 local với kiểm target/mount/config hiện tại. Có maintenance/rollback/monitoring/soak cụ thể trước tuyên bố READY.
5. Nếu yêu cầu B execution mới trên copy isolated/new image: cần quyền phù hợp; B hiện chỉ được read-only. Không đổi các số A thành B mới. Independent source review này đã hoàn thành, không phải tự sinh thêm yêu cầu approval.

Lệnh B thực chạy: Git read-only; `python artifacts/reports-vps-release-b-20261107-093609/static_review.py` (exit0; file/hash/log verifier, **không test sản phẩm**); đọc/range/rg source/log. Đã chạy verifier lại sau thêm layers parser; không thay input ứng dụng. Có một lần Git read candidate bị sandbox Permission denied rồi rerun read-only escalated đạt; không thay Git config/global permissions.

File thay đổi chỉ báo cáo này và artifact B riêng. Không commit/push/deploy, không mở secret, không tạo/dọn container. Kết luận cuối: **A dossier PASS tĩnh, deployment NOT_READY/BLOCKED**; original A evidence giữ nguyên và chỉ áp exact original images.
