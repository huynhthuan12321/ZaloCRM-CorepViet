# Background tenant remediation after VPS cutover

07/11/2026 (+07), bắt đầu15:06. **IN_PROGRESS — production đang phục vụ image a136… nhưng initial observation FAIL; chưa đóng rollout.** Giữ guard=enforce, RLS103FORCE, app role nonowner; không tắt bảo vệ để che lỗi.

## Evidence và phạm vi

Root HEAD eb1be0b unchanged, working tree đã dirty; không commit/reset/stash/push hoặc worktree mới. Candidate checkout297fe538 vẫn clean. [Artifact A riêng](../../artifacts/reports-vps-tenant-remediation-20261107-1511/), [B độc lập và RED](09-vps-background-tenant-independent-review-20261107-1510.md). Không sửa pool root cũ vào release: build context kế thừa exact source của image a136 đã qua B, chỉ bổ sung4module dưới đây.

Production mở15:00:37 sau15/15smoke, HTTPS/22checks ban đầu đạt.2nick connected;36public JS/CSS trả200 và khớp image hashes. Sau334s, observer **21/22,FAIL**:22matched log lines tenant guard (không phải22request độc lập),0RLS permission/fatal. Actual operations Friend.findMany, SdkLimit.findMany, ZaloAccount.findUnique. Sanitized code-only diagnostics ở artifact cutover; raw logs không ra VPS.

- SDK limit: `backend/src/modules/zalo/sdk-limit-service.ts` đọc nick→org và limit không có context khi timer presence chạy ngoài request; cache cũ còn trả limitY cho contextX. B mock tái hiện cold/warm cache, DBfailure và parallel controls.
- Scoring backfill: `backend/src/modules/scoring/backfill-cron.ts` global candidates/count không context ở warmup60s và interval5phút. Business loop cówithTenant nhưng discovery đã fail trước.
- B rà đúng scheduler liên quan, xác minh `stuck-detection.ts`/`auto-tag.ts` daily6/7AM cũng thiếu tenant boundary; xử lý cùng lượt trước khi chờ lịch ngày sau mới lỗi. Decay caller đã có wrapper, không đổi.

## Patch4module

1. SDK dùng org từ normal caller, chỉ no-context/explicit system được minimal ID→org lookup. Mọi cachehit phải qua scoped reread nick{id,orgId}; bỏ nick-org cache làm authority/negative-cache error5min. Limit rows vẫn đúngorg và nick/default. Giữ fallback hằng số cũ khi DB lỗi, không tự đổi business fail-open/fail-closed policy.
2. Backfill inventory global chỉ{id,orgId}, business hydrate lại trong tenant rồi mới đọc/ghi. Normal callerX chỉ inventory/countX; stale/deleted/reparented candidate bị bỏ; không đổi100chunk,90day lookback, tín hiệu, lịch, mutex/finally.
3. Daily stuck/auto-tag thêm per-org boundary, kiểm normal caller không chuyển sang org khác, giữ actor; AllOrgs chỉ inventoryID ở system hoặc giới hạn org của caller. Không bọc scoring business trong bypass.
4. Normal context `*`/rỗng không được nâng thành system. Explicit system context luôn hạ xuống tenant cụ thể khi xử lý nghiệp vụ.

Source provenance v2 SHA `62a45b89c6c999892d2874c177d62a14c801f428f9ddbfd33250358cbaac5246`; compile full release source PASS,8JS/maps. Guard/RLS/schema/AI configuration/frontend/dependencies không đổi. Root chỉ thêm patch vào4file có source trước sửa khớp release; preimages/raw hashes giữ riêng. New21-case spec được copyexact từ B vào `backend/tests/unit/background-tenant-context.test.ts`, không nới assertion dự án cũ.

## Selfcheck và B đang thực hiện

- B old source21cases:7PASS/14FAIL; final source21/21PASS. Intermediate2modulefix13/15 vẫnFAIL do normal`*` escalation, giữ log và sửa thật; không đổi expected.
- `node .../tools/compile-v2.mjs`: full TypeScript compile/type-check exit0, noDB/network/provider; first2module compile và source/payload version được giữ riêng.
- Build 2immutable derivative, Docker context chỉ8payloads/Dockerfile. Primary `sha256:db447e8bd766e32fac08c5e76f294643cb715a304561d906411a86056c5b075e`; corrected fallback `sha256:e2161cb55f8ba52cd4d4bb2d6ba08e16d56c445fbcb98b142860c8734ee57a56`. Parent tương ứng a136…/e0c…; no rebuild of dirty workspace or secret copy.
- B tiếp tục actual DB/role/RLS cho4caller + existing relevant specs + runner review trước hotfix. Không coi mock21/21 là DB hoặc provider proof.891 của image trước giữ phạm vi cũ, không kể như execution mới trên derivative.

## Rollout chuẩn bị, chưa áp dụng hotfix

Image-only update sau gate B mới. Runner `hotfix-phase.py` tái sử dụng chính functions/API clients/smoke của runner cũ đã reviewSHA e0d123…; source bị hash-check, không chạy lại production phases cũ. Giữ Env/User/media/network/resources/role/guard/GUC, maintenance riêngCRM, clean-stop, dump mới, rồi thay image. Không migration/RLS grant/schema change. Quan sát ít nhất70s warmup trước mở và hơn5phút sau mở; raw logs giữ private. Gate cũ không được dùng cho image mới.

Tiếp theo: B DB/spec/runner verdict → pin exact image/gate → image-only replace → actual timer/log/HTTPS observation → cập nhật trạng thái cuối và recovery instructions. Website hiện vẫn phục vụ parent a136; chưa công bố ổn định sau5phút.


## Cập nhật kết thúc 07/11/2026, 20:32 (+07)

Phần trên giữ lịch sử tại thời điểm viết. Rollout cuối **DEPLOYED_OBSERVATION_PASSED**, image 652376… sau sửa thêm interaction-cron; smoke15/15 và observer22/22 sau379s mở. State vận hành của đợt này được SUPERSEDED có preimage, không dùng wrapper/image cũ để khôi phục. [Checkpoint hiện hành](09-vps-interaction-remediation-20261107-1955.md). Full-suite FAIL và các kết quả FAIL trước vẫn giữ; không coi test/ảnh cũ là chạy lại trên image cuối. Root có commit mobile khác luồng, chưa đưa mobile mới vào release; candidate1037hash vẫn nguyên.
