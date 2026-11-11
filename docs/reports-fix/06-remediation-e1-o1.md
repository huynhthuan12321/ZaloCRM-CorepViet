# Remediation A — E-1 / O-1

Ngày 02/11/2026, 20:38 (+07), Asia/Ho_Chi_Minh. **COMPLETED_PENDING_VERIFICATION** — tự kiểm tra A đạt trong môi trường local; chưa có nghiệm thu B trên patch này. HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`; kiểm tra working tree chưa commit, không có revision mới. **7A/7B NOT_STARTED**.

Artifact riêng: [reports-e1-o1-20261102-201708](../../artifacts/reports-e1-o1-20261102-201708/). Giữ nguyên log, snapshot, lịch sử FAIL và kết quả B 18:04. Các PASS B cũ không xác nhận quyền/RLS trên source mới; 5B/6B chờ tái kiểm phần bị ảnh hưởng.

## Contract và phạm vi

Đã đối chiếu quy tắc chung, contract, audit 11/12, báo cáo B mới nhất và source. Repo/ổ F không có AGENTS.md; áp dụng chỉ dẫn AGENTS do người dùng cung cấp. Dùng skill `fix-finding`; thực hiện hai lượt tự rà theo góc nhìn biên bảo mật và bypass/regression. Không giao agent theo ràng buộc người dùng; các lượt tự rà này **không phải B độc lập**.

- E-1: không được đọc/ghi hàng của tenant khác trên các bảng có `org_id`; thiếu tenant phải fail closed. RLS là biên DB, tenant guard là lớp bắt lỗi lập trình. Không đổi cấu hình mặc định hoặc tự apply staging/production.
- O-1: Automation/Broadcast vẫn chỉ owner/admin hiện hành trong cùng org. JWT hợp lệ xác định danh tính; role trong JWT không quyết định quyền báo cáo. Hạ quyền/khoá user phải có hiệu lực ở request kế tiếp, kể cả access token chưa hết hạn hoặc tokenVersion chưa đổi.
- Không đổi KPI/canonical, kỳ VN, main/shared, attribution, SQL snapshot, F3/F4 hoặc UI. Không thêm dependency, commit/push/deploy/worktree; không dùng production, đọc .env, chạy provider/queue/cron/socket hay gửi tin/gọi AI.

## Trước / sau và bằng chứng source hiện tại

| File, dòng | Trước | Sau |
|---|---|---|
| `backend/prisma/rls/tenant-rls.sql:639` | 28 bảng org_id không có policy; app role đọc/ghi chéo org | Thêm 28 bộ ENABLE/FORCE + USING/WITH CHECK theo org hoặc system context tường minh. Catalog disposable: 102/102 bảng org_id có RLS/policy, tổng 103 bảng có policy gồm care_session_events theo cha |
| `backend/src/shared/tenant/org-scoped-models.ts:34` | Inventory hiện tại thiếu **30 model**, không chỉ 6 như nhận định cũ | Đủ 102 model trực tiếp có orgId; inventory test đối chiếu schema để phát hiện thiếu về sau |
| `backend/src/modules/dashboard/report-scope.ts:18` | Có resolver quyền hiện tại cho báo cáo khác | Thêm tham số adminOnly mặc định false; non-admin bị chặn trước khi xét grant/phòng. Giữ nguyên gateReportAccess và mã lỗi reports_admin_only cho caller cũ |
| `backend/src/modules/automation/automation-report-routes.ts:59` | So sánh role JWT | Dùng resolver DB, giữ code automation_report_admin_only; route thật automation-summary |
| `backend/src/modules/broadcast/broadcast-report-routes.ts:45` | So sánh role JWT | Dùng resolver DB, giữ code broadcast_admin_only |
| `backend/src/modules/zalo/group-scan-worker.ts:43` | Job chỉ mang scanId, không có tenant context | System lookup chỉ lấy orgId từ ID job nội bộ; sau đó đọc lại và xử lý toàn bộ trong withTenant, tương tự channel processor |
| `backend/src/modules/contacts/appointment-public-routes.ts:24` | Public capability lookup chưa có context | Lookup short-code trong system context; sau khi HMAC token được kiểm tra, GET ở dòng44 và POST ở dòng73 dùng tenant của token. Giữ expiry, invalid-token, idempotency và reminder semantics |
| `backend/src/modules/integrations/providers/telegram-bridge/link.ts:38` | Tra/liên kết Telegram identity trước khi biết org chưa có context | Bootstrap identity tường minh qua system context, giới hạn exact telegramUserId và mã CRM dùng một lần còn hạn; không mở bypass gửi tin. Lookup danh tính ở dòng52 |

Hai bảng TikTok còn trong schema cũng được cô lập. Không phục hồi connector, không thay schema hoặc migration lịch sử.

Rà candidate phát hiện nguy cơ thay đổi mã lỗi của gate cũ khi truyền adminOnly xuống resolver. Đã giữ gate cũ, chỉ hai route mới dùng chế độ adminOnly của resolver; thêm assertion reports_admin_only. Không đổi assertion cũ để hợp thức hoá regression.

## Fixture và an toàn DB

Container `reports-e1o1-20261102-201708`, PostgreSQL15-alpine, tmpfs, chỉ bind `127.0.0.1:55561`; DB riêng `reports_e1o1`. `evidence/empty-proof.txt` xác nhận **0 bảng public trước khi ghi**; container proof lưu port/tmpfs/label. Schema tạo bằng config disposable có kiểm tra hostname/port/database/owner; không dùng DATABASE_URL có sẵn làm bằng chứng.

Role `reports_e1o1_app`: NOSUPERUSER, NOBYPASSRLS, không sở hữu bảng. Backend dùng `RLS_SET_CONFIG=true`, `TENANT_GUARD_MODE=enforce`. Fixture giả cho org X/Y, các relation bắt buộc được seed trước, **FK/unique vẫn bật**. Không tắt trigger/constraint để làm pass. Owner chỉ dùng tạo fixture và đổi role/isActive; kiểm tra biên chạy app role.

Mỗi SQL mutation test nằm trong BEGIN/ROLLBACK; thử cả thiếu context, org không tồn tại và system context. Prisma dùng extension thật và ALS thật. HTTP nghe loopback55562, chỉ đăng ký **hai route report thật + authMiddleware thật**; JWT ký trong bộ nhớ, không ghi JWT/key/password vào artifact. Không app bootstrap hoặc route gửi. DOTENV_CONFIG_PATH luôn trỏ file test không tồn tại trước import/chạy test.

## Lệnh và kết quả thực tế

CWD `F:/ZaloCRM-CorepViet/backend`. Danh sách đủ 30 spec nằm ở `helpers/backend-specs.txt`; môi trường và lệnh tái lập ở `commands.md` trong artifact.

| Kiểm tra | Kết quả |
|---|---|
| RED `vitest run tests/security/tenant-inventory.test.ts tests/unit/automation-broadcast-report-availability.test.ts` trên source cũ | **40 FAIL /70 PASS**, exit1; đúng thiếu inventory/guard/policy và freshness. Giữ red-unit.log |
| RED DB/JWT/HTTP trên policy/source cũ | **208 PASS /288 FAIL**, exit1; có các ca đọc/ghi chéo org và stale JWT. Trong tổng FAIL còn một đối chứng DELETE bị FK RESTRICT; không coi ca đó là lỗi RLS |
| GREEN cuối `node --import tsx scripts/reports-verification/e1o1-boundaries.ts green4` | **524/524 PASS**, exit0; evidence/green4-boundaries.json |
| Trong 524: SQL app role | **392/392** = 28 bảng ×14 ca: own/foreign/no-context/unknown reads, update/delete, chuyển org, insert foreign/no-context/own, system lookup |
| Trong 524: Prisma | **84/84** trên 28 bảng + **18/18** trên Message/CareSession/LeadPoolDistribution/MediaAsset/MediaBlob/MediaAlbum đã có RLS nhưng thiếu guard |
| Trong 524: JWT/HTTP | **28/28**: owner/admin, thiếu/sai token, cùng access/legacy JWT sau downgrade không đổi tokenVersion, leader/deputy có report/view_all vẫn bị chặn, sai org, inactive và identity không tồn tại |
| Trong 524: safety + catalog | **2/2**: app role đúng điều kiện; không còn bảng org_id thiếu ENABLE/FORCE/policy |
| `node node_modules/vitest/vitest.mjs run <30 spec> --maxWorkers=2 --reporter=verbose` | **306/306 PASS**, 30 file; logs/backend-regression-final.log. Gồm report/tenant, inventory102, caller-context, group-scan, channel tests. Đây là unit/mock/PGlite, không thay thế bộ DB thật ở trên |
| `npm.cmd run build` | **PASS**, exit0, TypeScript backend; logs/backend-build-reviewed.log |
| Áp tenant-rls.sql hai lần trên disposable | **PASS**, cả hai exit0, kiểm tính lặp lại; không apply môi trường khác |

Không chạy frontend/browser vì không sửa frontend. Không gọi mock DOM là browser/integration. Full backend suite **không chạy mới**: lịch sử A39file/9test và B current/baseline35file/9test FAIL vẫn giữ, không tuyên bố full suite đã xanh hoặc đã xử lý các lỗi ngoài phạm vi.

### Các lần không dùng làm kết quả cuối

- DB attempt1: runtime DMMF Prisma7 thiếu metadata required/default nên helper thiếu Organization.name; attempt2: fixture Conversation thiếu channel account cho composite FK. Giữ hai log lỗi, sửa metadata/fixture, không sửa constraint hoặc source để lách lỗi.
- GREEN đầu **495/496**, đối chứng own DELETE channel_accounts vướng FK RESTRICT do fixture có child. Đã dùng fixture riêng không bị tham chiếu cho đối chứng DELETE, assertion vẫn phải xoá đúng1 hàng; không đổi sang chấp nhận lỗi. Giữ JSON/log thất bại.
- GREEN2 **500/500**, GREEN3 **518/518**, GREEN4 **524/524** sau khi bổ sung leader/deputy, sáu model guard và JWT legacy. Không sửa/ghi đè các kết quả cũ.
- Lượt regression đầu **298 PASS/8 FAIL**: fixture groupScan.findUnique chỉ mockResolvedValueOnce, bị lookup tenant tiêu thụ. Chuyển fixture đó sang mockResolvedValue cho hai lần đọc; giữ toàn bộ assertion cũ, thêm test xác nhận system lookup rồi tenant scope. Regression cuối306/306.
- Manifest đầu cắt sai prefix đường dẫn do dùng độ dài cố định. Giữ source-before.json gốc và tạo source-before-normalized.json bằng ánh xạ suffix sang path hiện tại; **giữ nguyên 973 hash ban đầu**, không tính lại hash cũ từ source đã sửa.

## Giới hạn và rủi ro còn lại

- Đây là tự kiểm A. Chưa tái nghiệm thu B5B/6B, chưa browser theo role trên patch mới, chưa chạy lại canonical oracle/6a3-api-acceptance/Engagement. Không gán số PASS của B18:04 cho source này.
- 102/102 là **coverage catalog của bảng có org_id**, không phải chứng minh mọi bảng/luồng trong ứng dụng đã cách ly. 19 bảng không có org_id chưa có policy trong catalog cũ không thuộc E-1; cần audit riêng quan hệ cha/identity/global, không thêm policy đoán mò.
- Các bootstrap system được giới hạn ở lookup job, short-link capability và Telegram identity. Chưa thử gửi thật, kết nối provider, worker chạy thật, push/APNs hoặc Telegram receive pipeline. Các tác vụ nền khác, đăng ký device sau đổi tổ chức và migration replay cần kiểm trên staging trước rollout. Không thêm bypass để cho phép ghi chéo tenant khi gặp unique token của org khác.
- RLS chưa được apply staging/production; không tự bật enforce trên môi trường đang chạy. File policy cần chạy trong transaction với ON_ERROR_STOP khi rollout được phê duyệt, bằng app role đúng thiết kế và đối chứng rollback. Hiện không tuyên bố release READY.

## Bàn giao cho lượt B riêng

1. Đọc checkpoint này, quy tắc chung, contract và lịch sử5B/6B; so source/hash/diff với artifact, không chỉ tin số524/306.
2. DB disposable mới: xác minh rỗng/loopback/tmpfs/app role non-owner; áp policy, kiểm catalog102/102 và runtime read/write của28 bảng, ORM/context và system bootstrap. Lấy helper e1o1 làm đầu vào kiểm tra, tự đối chiếu expected/fixture; không dùng JSON A như kết quả mới.
3. Dùng JWT thật chưa hết hạn: thay role/isActive trong DB, giữ token/version; kiểm cả access/legacy, owner/admin/leader/deputy/member, org giả và error code. Kiểm các caller quét nhóm/capability/identity với provider được mock, không gửi thật.
4. Chạy hồi quy5B/6B theo ma trận hiện hành, gồm `6a3-api-acceptance`, canonical SQL/Excel/custom/saved, Engagement/funnel/team, quyền trên browser và các ca bắt buộc F3/F4/R-A-1. Số test là kết quả thực chạy, không phải chỉ tiêu chép từ lần cũ.
5. Giữ full-suite FAIL lịch sử và các phần chưa kiểm; chỉ cập nhật B PASS nếu bằng chứng mới đủ. **Không bắt đầu7A/7B** trong lượt A này.

Cleanup và integrity cuối: xem `cleanup.json`, `evidence/source-changes.json`, manifest/diff/status cuối trong artifact. Không commit/deploy.

Mốc chốt 20:44 (+07): container đã xóa sau khi kiểm đúng ID/label; không còn listener55561/55562. Trong973 file source/test/Prisma ban đầu,962 giữ nguyên hash,11 thay đổi đúng phạm vi; thêm2 test, không xóa file hoặc thay frontend. Hai helper mới được liệt kê/hash riêng. `git diff --check` so HEAD báo2 blank-line-at-EOF đã có ở README trước lượt này;100 ký tự cuối của cả hai file khớp preimage. So patch với preimage không có lỗi whitespace mới, chỉ cảnh báo LF/CRLF của Git; không sửa nội dung cũ để che kết quả.
