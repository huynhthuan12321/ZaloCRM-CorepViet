# VPS final interaction remediation — 07/11/2026

**Cập nhật cuối 20:32 (+07): DEPLOYED_OBSERVATION_PASSED.** Website https://zalocrm.corepviet.com đã mở. Smoke 15/15; observer 22/22 sau 379 giây mở, restart 0. Receipt chốt sau 545,905 giây; không thay traffic/DB khi chốt. Các mốc 20:23 và nhận định sơ bộ bên dưới giữ lịch sử; đối chiếu cuối ở cuối tài liệu thay thế nhận định root HEAD chưa đổi.

**20:23 (+07): DEPLOYED_PENDING_OBSERVATION.** Website đã mở lại bằng image cuối652376… sau15/15smoke và156s warmup,0guard/RLS/fatal lúc mở. Initial public observation22/22; DB/Redis connected,2nick connected. Chờmốcquan sát>=6phút đểchốt. Không commit/push/reset/stash, không worktree mới.

## Nguyên nhân và lịch sử được giữ

Quota phiên kiểm bị ngắt khi CRM vẫn maintenance. Khi người dùng tiếp tục19:53, root xác minh db447… vẫn healthy/restart0 sau4h; chỉ còn2matched log lines của **một** lỗi Contact.findMany tại interaction-cron lúc19h.4moduleSDK/scoring đã sửa trước không xuất hiện lại lỗi. Không xóa log hoặc mở guard để bỏ qua finding.

Source job ghi “19UTC/02VN” nhưng cron thiếu timezone; imageTZAsia làm nó chạy19hVN. Global Contact query đọc business fields trước tenant context, trong khi loop chỉ wrap sau đó. [B độc lập cuối](09-vps-interaction-independent-review-20261107-2000.md), [parser supplement](09-vps-background-parser-supplement-20261107-1958.md), [artifact A](../../artifacts/reports-vps-interaction-remediation-20261107-1955/).

Parser helper cũ gặp Docker timestamp9fractiondigits trên Python3.10; normalize xuống6digits chỉ là ops compatibility, không đổi clock/app. B kiểm12/12vectors và giữ gate cũ riêng. Final runner2383… đã gồm fix này. ChuỗiFAIL0/12old,11/12intermediate thiếu actor và các harness-only failures đều giữ trong B artifact.

## Patch và identity

- `backend/src/modules/contacts/interaction-cron.ts`: explicit timezoneUTC cho lịch0 19 →02Asia/Ho_Chi_Minh; giữ30/31day window, eventtype/dedup.
- Metadata discovery chỉ{id,orgId}; no-context/explicit system được discovery hệ thống, normalX bị giới hạnX; normal`*`/rỗng failclosed. Hydrate lại contact còn eligible trong đúngtenant trước dedup/write; bỏ stale/deleted/reparented records. Giữ actoruserId/role.
- New project regression: `backend/tests/unit/interaction-tenant-context.test.ts`, copyexact12casesB, không sửa/nới assertion cũ.
- Parent652 release kế thừa exact db447/e216 và4caller fixes, AI fullAuto/60s customization, Prisma null fix, E-1/O-1 và TikTok removal; không copy pool root cũ hoặc build dirty workspace.

| Identity | Exact value |
|---|---|
| Primary OCI/DockerID | `sha256:652376662d4c4046e364d70f775df5aab3089652d3cd51030fa22c89c1ea6dfd` |
| Corrected fallback | `sha256:9b75c0e7fa09a02d4d4ffd83e5e2aba1e4e75fb5b8c136c193235bc07ced4cf1` |
| Source provenance v2 | `5b34817429e31e40c5c1e6a865f152bc2766e0f8c36c286f1cf17ed2a85ecf5d` |
| Final runner | `2383ffb00fc251882f5658c0fa936131f91da87dccccdf28b36ce5cb5b29aba2` |
| B gate | `15c95b8ad38df3f0e051cd455e317105979b4fb55e445661aff420b24bc69dd2` |
| Running appID | `fc248e216a6e3e0ea4ca5ee24f8efb1b985d0a54cdb5ea958f7c2e0c65e482e1` |

Build context allowlist2JS/maps;70OCI blobs được hash trước import. Source/checkouts không có commit mới; root HEAD eb1be0b unchanged, candidate297fe538clean. Runtime là immutable derivative có provenance, không phải toàn bộ root working tree. Schema130,103forcedRLS, nonowner role/guardenforce/GUCtrue giữ nguyên; không migration mới ở lượt này.

## Kiểm đã thực chạy

| Layer | Evidence/result |
|---|---|
| A compile | `node artifacts/reports-vps-interaction-remediation-20261107-1955/tools/freeze-compile-v2.mjs`: full release source TypeScript PASS;2outputs |
| A build/import | `build-v2.mjs`, `transport-v2.py`, `import-images-v2.py`: exact image/provenance,70blobs verified; khônghelper/.envcopy |
| B unit |12/12PASS, sameassertions0/12REDsource cũ; v1actor11/12FAIL giữ nguyên |
| B realDB |18/18mỗiimage,36total, freshPG16.15/zero-proof/130migrations/RLS103/appnonowner; actualActivityLogpersist/dedup, foreign/scope/bounds, registeredcronUTCcallback dướiTZVN |
| B compile |2/2payloadhash khớp independentcompile;0guard/RLS/txerrors;6owncontainersremoved/0remaining |
| Production replace | `release-replace`: kế thừa exact maintenance đangON, oldapp exit0, dump mới, image-only change, Env/User/resources giữ nguyên |
| Production smoke | `release-smoke`:15/15,156.469sstartup,0broadguard errors trướcopen |
| Initial public | `observe-production`:22/22; TLSverified/5publicpaths200, exact image/config/mounts;0guard/RLS/fatal |

Không gọi891 cũ là test mới trên652. Full backend suite trước vẫn FAIL11assertions/40files với baseline/edition/mock disposition đã ghi ở B trước; lượt1module này không chạy lại toàn suite. Không browser/mobile/PWA journey mới; HTTP/asset probes không thay thếbrowser. Không test gửiZalo/Telegram/paidAI;2nickconnected không chứng nhận toàn bộ providerflows/load.

## Actual rollout và backup

Kế thừa maintenance đã bật, không mở unsafe parent giữa patches. Finalimage khởi động20:20:29, smokepassed20:23:05, originalCaddyroute khôi phục20:23:22; originalmatcher/ETag logic giữ đúngdomainCRM. Current app restart0 ởmốcinitial; serviceskhác không đổi.

Pre-final DB dump giữ private tại `/root/zalocrm-release-evidence/interaction-hotfix-20261107-1955/pre-hotfix.dump`, SHA `10becb78b4028e7c1aba9b34812704ba3c089b3cdefaeccfb284a2e9e8ce7d18`. Initialmigration bảo toàn122business fingerprints; các thay đổi app/jobs hợp lệ sauboot không được gọi là DBbấtbiến. Media8887file/checksum vàencryptedoff-VPSenv/recovery giữ trong hồsơcutover. No real silentjob replay đểtest; cycle19hfailed không được giả đãghi event, lầnlịchtiếp theo02VN theo contract.

Các runner cũ sẽ được đánh dấu superseded sau khi final observer đạt, để không dùng nhầm recovery của image đã thay. Current operations chỉ fallback application sang9b75 trên cùngDBrole/schema/RLS; khôngrestoređè, down-migrate, tắtguard/RLS hoặc đưaTikToktrởlại. Khôngexecutefallbackproduction trong lượt bình thường.

## Mốc kết thúc

Đang quan sát sauopen; sẽ bổ sung receipt>=6phút, currentmetadata/disk vàsourcestatus/diff/hashes rồi cập nhật README. GateB chỉ áp đúngscope/image/runner này, không chứng nhận fullrepo/provider/browser/productionđãquan sát thayroot.

## Chốt hậu kiểm production — 20:32 (+07)

**PASS trong phạm vi triển khai và cửa sổ quan sát đã đo.** Không phải chứng nhận toàn bộ hệ thống hoặc theo dõi dài hạn.

- Mở route: event state **20:23:21 (+07)**; receipt open hoàn tất 20:23:22. Không dùng đồng hồ Windows để suy tuổi rollout.
- Observer mới lúc **20:29:40**: **22/22 PASS**, cách event mở 379 giây. Đúng app/image nêu trên, healthy, runtime Env/User/mount/network/resources khớp kế hoạch; 5 HTTPS paths trả 200 với TLS verification. Không có tenant-guard, RLS permission hoặc fatal match từ lúc container khởi động.
- Health độc lập lúc **20:31:35**: DB/Redis connected; 2 nick connected; Messenger disabled như cấu hình hiện hành; app dùng 272,6 MiB/4 GiB, CPU 0,21% tại thời điểm đo. Không cố ý gửi tin để thử.
- Receipt cuối **20:32:27**, elapsed **545,905s**, restart **0**, DB container giữ nguyên; catalog **130 migration / 0 unfinished / 103 ENABLE+FORCE RLS / role false|false**. Disk **79,53%**, free **19.480.678.400 bytes**; cần theo dõi dung lượng trước backup/image kế tiếp, không prune evidence hoặc dữ liệu ngoài phạm vi.

Lệnh đã chạy, exit 0:

```powershell
node artifacts/reports-vps-interaction-remediation-20261107-1955/tools/remote-run.mjs observe-production final-six-minute-observation
node artifacts/reports-vps-interaction-remediation-20261107-1955/tools/remote-run.mjs runtime-health-detail final-health-detail
node artifacts/reports-vps-interaction-remediation-20261107-1955/tools/ship-operations.mjs
node artifacts/reports-vps-interaction-remediation-20261107-1955/tools/remote-run.mjs finalize-operations final-release-receipt
node artifacts/reports-vps-interaction-remediation-20261107-1955/tools/final-source-evidence.mjs
```

Safe logs và execution JSON ở [artifact cuối](../../artifacts/reports-vps-interaction-remediation-20261107-1955/logs/). Raw customer logs/config/dump không ra workspace. B đã đọc handoff mới, không phát hiện blocker; B không chạy production. Finalize chỉ đổi metadata của **hai state cũ** thành SUPERSEDED, lưu preimage bằng exclusive-create và append event; current state vẫn OPENED_MONITORING. Kết quả hoàn tất nằm riêng trong release-final.json. Nếu finalize lỗi giữa chừng, đọc preimages trước, không chạy lại mù vì không idempotent.

## Đối chiếu source và phạm vi cuối

Snapshot cuối chạy lệnh `node artifacts/reports-vps-cutover-prep-20261107-093609/tools/snapshot.mjs final` trả **exit 1 do workspace drift**, không phải lỗi test sản phẩm. Đã phân loại thay vì bỏ qua:

- Initial root HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`; current HEAD **`32a8f049765c057015e53ca96de924f783278775`**, có commit mobile từ luồng khác trong ngày. Lượt triển khai này không commit/push/reset/stash. Nhận định sơ bộ “root HEAD unchanged” ở trên không còn đúng cho trạng thái cuối.
- Root covered inputs **1166 → 1202**: 6 backend file sửa và 3 test mới của triển khai; ngoài ra 9 frontend/package file đổi và 33 file frontend mới được giữ nguyên, không đưa vào image. Không có file missing. Các delta frontend/mobile và dependency ở root không thuộc payload phát hành.
- Candidate HEAD **`297fe538eed7d62ab7f387f3b2e1a892433d2970`**, clean; **1037/1037** covered inputs giữ hash. Production dùng immutable derivative từ candidate và các overlay đã B kiểm, không phải toàn bộ root HEAD hiện tại.
- Interaction source LF SHA **`d995abbe455f8aafd1687c0e8e4cb25198edd424632038c5ade02f41e4ac79a4`** khớp B/compile. Scoped preimage/diff/hash của 6 runtime +3 test: [classified evidence](../../artifacts/reports-vps-interaction-remediation-20261107-1955/final-evidence/source-integrity-classified.json).

Các dòng source được đọc lại trong phiên: interaction-cron.ts **21–28** (UTC), **43–53** (inventory/context), **57–63** (fresh scoped reread), **65–86** (dedup/write/actor); prisma-client.ts **53–54** (giữ non-plain sentinel); sdk-limit-service.ts **52–74**; backfill-cron.ts **56–88**; stuck-detection.ts **37–41,123–130**; auto-tag.ts **307–311,361–365**. Tên test mới: prisma-write-values.test.ts, background-tenant-context.test.ts, interaction-tenant-context.test.ts. Bằng chứng line output được giữ trong artifact; không sửa SQL/report formula/frontend của candidate trong các overlay này.

## Nợ kiểm thử và bàn giao

Full-suite trước null fix: baseline **169 file / 1156 test: 1121 PASS, 11 FAIL, 24 pending**, 40 file lỗi; sau null fix **170 file / 1164 test: 1129 PASS, 11 FAIL, 24 pending**, vẫn 40 file lỗi. So sánh/disposition theo B trước; không blanket coi mọi lỗi vô hại. Không chạy lại full-suite sau hai lượt background/interaction và không gọi 12 unit +36 DB là full-suite xanh. B cũ 891 HTTP checks không được tính thành mới trên image cuối.

Hướng dẫn vận hành hiện hành [OPERATIONS.md](../../artifacts/reports-vps-interaction-remediation-20261107-1955/OPERATIONS.md), đã lưu trên VPS cùng reviewed runner và wrapper. Corrected fallback chỉ application trên cùng schema/RLS/role; không chạy fallback thật trong rollout bình thường. Hai image có code chung, không bảo đảm chữa lỗi chung. Không dùng stopped old container để rollback.

DB/media chỉ có backup tại VPS; chỉ env ciphertext được xác minh off-VPS và memory recovery. Chưa có off-site DB/media/portable key escrow, full mobile/browser journey trên bản này, provider sends/paid-AI hoặc load/soak dài hạn. Lần cron interaction tự nhiên tiếp theo **02:00 VN ngày 08/11** chưa quan sát; không phát lại cycle 19h đã lỗi. Duy trì giám sát job/queue/provider và dung lượng theo runbook. Các thay đổi mobile mới cần candidate và kiểm riêng trước lần phát hành tiếp.

Trạng thái: triển khai/cửa sổ quan sát **PASS**; B cuối **PASS_FOR_RELEASE_SCOPE**; full-suite vẫn **FAIL lịch sử**; các luồng chưa chạy ghi **chưa xác minh**, không đổi thành PASS. Website đang mở, không còn công việc deploy bắt buộc trong lượt này.
