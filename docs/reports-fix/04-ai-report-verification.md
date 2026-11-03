# Bước 4B — Kiểm tra độc lập Báo cáo AI

Cập nhật **02/11/2026 05:35 (+07), Asia/Ho_Chi_Minh**. **Kết quả: PASS local** cho phạm vi bước 4B; không có phát hiện chặn chuyển sang 5A. Chưa nghiệm thu staging/production, mobile hoặc toàn bộ bước 6.

HEAD đối chiếu: `eb1be0bce8f60858436b98370f3c517edcb041b7`. Đây là kiểm tra **working tree chưa commit**, gồm implementation 4A đang có trên đĩa. Không có commit mới. Đã đọc quy tắc chung, audit 11/12, contract và checkpoint 3B/4A rồi đối chiếu source, không lấy checkpoint làm kết quả kiểm tra.

## Phạm vi và tính độc lập

- Không sửa implementation, schema nguồn, send policy, công tắc AI hoặc test hiện có. Thêm helper kiểm tra riêng, dữ liệu giả, artifact và tài liệu kết quả.
- [Snapshot trước kiểm tra](../../artifacts/reports-ai-4b-2026-11-02/source-before.json) và [đối chiếu SHA256](../../artifacts/reports-ai-4b-2026-11-02/source-comparison.json): **22/22 file source/test có sẵn giữ nguyên**. Có cả report service/routes, auth scope/period, writers/send policy, app registration, UI/menu/router, test AI và harness/fixture gốc trong danh sách này.
- [Diff tích hợp so với HEAD](../../artifacts/reports-ai-4b-2026-11-02/integration-diff.patch) có cả thay đổi TikTok từ trước. Working tree rộng hơn còn có sửa AI/send policy/tenant từ các lượt trước; không quy chúng thành patch 4B hoặc tuyên bố toàn bộ checkout không có thay đổi send policy. Kiểm tra 4B không thay các file đó.
- Helper `4b-independent-checks.ts` bổ sung oracle theo **ID bản ghi dương tính đã biết**, đối chứng thay đổi audit/quyền/deletion và phục hồi fixture trong `finally`. Không chỉ chạy lại test của tác giả 4A.

## Môi trường DB, JWT và tác dụng phụ

Docker ban đầu chưa chạy. Sau khi khởi động engine, đã xác minh container `reports-1b-verify-20261101`, ID `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, label `codex.task=reports-1b-local-verification`, port **127.0.0.1:55471**, dữ liệu PostgreSQL nằm trên tmpfs. Container ban đầu ở trạng thái dừng; DB `reports_1b_verify` đã mất bảng sau khi tmpfs được tạo lại. Không đọc `.env`, không lấy DATABASE_URL mặc định làm bằng chứng an toàn.

Sau kiểm tra danh tính DB bằng truy vấn chỉ đọc, dựng schema bằng **Prisma db push với config local tường minh**, áp RLS và tạo fixture giả. Đây **không phải replay migration**. Lần `pg_isready` đầu chưa sẵn sàng trong lúc container khởi động; đã chờ và xác nhận kết nối/danh tính trước thao tác ghi. Không coi lỗi readiness tạm thời là lỗi sản phẩm.

HTTP harness chạy dưới `reports_verify_app`: không superuser, không BYPASSRLS, không phải owner bảng; RLS/FORCE RLS trên Message, ActivityLog, AiSuggestion đã đối chiếu catalog. Oracle và seed dùng owner của DB disposable. Kiểm tra raw SELECT của app role **không có WHERE org** vẫn không đọc được org khác. Bằng chứng: [DB setup](../../artifacts/reports-ai-4b-2026-11-02/db-setup.json), [catalog hiện tại](../../artifacts/reports-ai-4b-2026-11-02/rls-role-current.txt).

Harness chỉ đăng ký auth, report và static frontend đã build; không bootstrap app, worker, queue, cron, socket, provider hoặc exporter. JWT thật được lấy qua HTTP login, dùng trong bộ nhớ, không ghi token vào artifact. Không gửi Zalo/Telegram hoặc gọi model trả phí. Đã logout/đóng tab kiểm tra, dừng đúng harness và trả container disposable về trạng thái **exited**; các ứng dụng Docker khác giữ nguyên. [Bằng chứng cleanup](../../artifacts/reports-ai-4b-2026-11-02/cleanup.json).

## Nguồn ghi dữ liệu và công thức đã xác minh

Các dòng dưới được đọc trực tiếp trong phiên 4B này, không chỉ dựa tên model/comment:

| Thành phần | Đường gọi và bằng chứng source hiện tại | Kết luận |
|---|---|---|
| Auto reply | `backend/src/modules/zalo/zalo-listener-factory.ts:765` gọi `triggerAutoReply`; `backend/src/modules/ai/ai-auto-reply-service.ts:73`, gọi đường gửi zaloOps tại `:283`, ghi Message tại `:297`, sentVia tại `:310`, audit tại `:348` | Writer còn đường gọi. Audit best-effort, không phải sổ gửi đầy đủ. Chỉ đọc source, không kích hoạt gửi. |
| Followup | `backend/src/app.ts:501`–`:502` đăng ký cron; `backend/src/modules/ai/ai-followup-cron.ts:50`, gọi candidate tại `:140`, gọi đường gửi zaloOps tại `:275`, ghi Message tại `:297`, dấu aiFollowup tại `:313`, audit tại `:346` | Có nguồn Message và dấu followup riêng. Không chạy cron để kiểm tra. |
| Nháp cần duyệt đã tạo | `ai-auto-reply-service.ts:201` / `:264` gọi `saveNeedsReview`; hàm tại `:431`, ghi AiSuggestion tại `:443` | Đo sự kiện tạo nháp, không đủ lifecycle để suy số đang chờ. |
| CRM apply | `backend/src/modules/ai/ai-routes.ts:681` cập nhật Contact, `:685` ghi AiSuggestionApplied | Apply trường CRM không phải duyệt gửi tin; không đưa vào KPI gửi hoặc chờ duyệt. |
| Usage/quota cũ | `backend/src/modules/ai/ai-routes.ts:187` / `:189`; `backend/src/modules/ai/ai-service.ts:90` | Vẫn là AiSuggestion được ghi nhận theo ngày server + hạn mức. Hai file này không có diff so với HEAD; không đổi nghĩa thành model call/token/tin gửi. |

Report dùng hai query chỉ đọc tại `backend/src/modules/dashboard/ai-report-service.ts:48`:

| KPI / quy tắc | Bằng chứng source hiện tại | Đối soát fixture |
|---|---|---|
| Tổng tin AI ghi nhận đã gửi | `ai-report-service.ts:51`: Message self, real 1:1 conversation, sentVia ai_auto hoặc metadata.aiAuto **boolean** true; loại local/deleted/dryRun/test/isTest; period và asOf | 5 tin main, 1 tin shared trong ngày fixture. Audit không tạo thêm tin. Không cam kết khách đã nhận. |
| Hội thoại có AI gửi | `ai-report-service.ts:85`–`:89`: COUNT DISTINCT conversation_id trên toàn kỳ, tách section | 1 main; mở rộng qua 3 ngày vẫn 1, không cộng số distinct từng ngày. |
| Auto reply / followup đã phân loại | `ai-report-service.ts:65` / `:77`: audit cùng org/conversation/messageId, actor bot, gộp theo Message; metadata aiFollowup boolean có ưu tiên | Main auto reply 1, followup 2, chưa phân loại 2; shared followup 1. Trùng audit không nhân tổng. |
| Tin thiếu dấu phân loại | `ai-report-service.ts:77`; `frontend/src/views/reports/AiReportSection.vue:22` | Vẫn trong tổng tin. Xóa toàn bộ audit giả: tổng main vẫn 5, followup metadata 1, auto reply đã xác định 0, unknown 4. **Tổng subtype đầy đủ chưa khả dụng** khi unknown >0; các số hiển thị chỉ là tập đã xác định, không suy unknown thành auto reply. |
| Nháp cần duyệt đã tạo | `ai-report-service.ts:91` / `:98`: AiSuggestion type auto_reply_needs_review, join conversation/account hợp lệ và createdAt trong kỳ | Main 2 / shared 1. Đổi accepted=true vẫn là 2 sự kiện tạo, không biến thành pending hoặc số gửi. Loại suggestion thiếu conversation, virtual, khác type và org. |
| Kỳ VN / dữ liệu rỗng | `backend/src/modules/dashboard/ai-report-routes.ts:18`, `ai-report-service.ts:54`, `:64`, `:100` | Ngày fixture **2026-11-01 VN**, UTC từ `2026-10-31T17:00Z` đến trước `2026-11-01T17:00Z`. Tin ngay trước/đúng cuối kỳ ở ngày kế cận; future sau asOf không tính. Kỳ trống trả số đo 0. |
| Chỉ số chưa đo được | `ai-report-service.ts:117`–`:125`, `frontend/src/views/reports/AiReport.vue:15` / `:69` | pendingReviews, tokens, cost, handoffRate, conversionRate = **null + reason unavailable**, kể cả kỳ không có dữ liệu. Không dựng tiền/token/rate 0. |

Đây là **event trong kỳ trên bản ghi hiện còn hợp lệ**, không phải snapshot lịch sử bất biến. `asOf` giới hạn timestamp; thay đổi quyền/ownership hiện tại, soft delete và audit đến muộn có thể thay đổi kết quả khi đọc lại. Không join contact để suy conversion; contact chia sẻ không mở rộng quyền nick.

## Phân quyền và response

Scope tại `backend/src/modules/dashboard/report-scope.ts:19` đọc lại active user, group và membership mỗi request. SQL account/org tại `ai-report-service.ts:36`, tách main/shared tại `:41`. API `backend/src/modules/dashboard/ai-report-routes.ts:8` chỉ chấp nhận from/to, dùng auth + `gateReportAccess` tại `:11` / `:13`.

| Trường hợp | Kết quả thực tế |
|---|---|
| Thiếu / JWT bị sửa | 401 |
| Admin org A | 200; đủ dữ liệu org A, không lẫn org B; không có shared section cộng trùng |
| Leader có engagement_score.access | 200; main theo phòng/phòng con, nick cấp thêm nằm riêng; nick ngoài grant không lọt |
| Deputy; sau đó hạ thành member, cùng JWT | 200 rồi 403 theo membership hiện tại |
| Member có cả report/AI grant | 403; menu AI cũng bị ẩn nhưng backend chặn độc lập |
| Leader chỉ có quyền AI/settings | 403 với JWT đang dùng; không suy quyền cấu hình thành quyền báo cáo |
| Thu hồi explicit read grant của nick shared | Shared về null, main giữ nguyên, cùng JWT |
| Admin org B | Chỉ 1 tin của org B; không thấy tổng hoặc nội dung của org A |
| Thêm orgId/userId/account/scope filter, query array, ngày sai hoặc range quá lớn | 400; không mở rộng scope qua client |

Response aggregate không trả nội dung chat, ID tin/hội thoại/khách/nhân viên không cần thiết. RLS bảo vệ tenant, còn scope phòng/nick do service áp thêm; không coi RLS tenant hoặc ẩn menu là đủ cho quyền báo cáo.

## Lệnh và kết quả chạy mới

| Kiểm tra | Lệnh / môi trường | Kết quả |
|---|---|---|
| Backend AI/scope/period | Cwd backend: `node node_modules/vitest/vitest.mjs run tests/unit/ai-report.test.ts tests/unit/report-scope-policy.test.ts tests/unit/report-period.test.ts tests/unit/report-period-query-boundary.test.ts` | **4 spec, 37/37 PASS**, 05:22 (+07). AI riêng 15/15; PGlite/mocks không thay RLS/JWT test. |
| Frontend report DOM | Cwd frontend: `node node_modules/vitest/vitest.mjs run src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts` | **7 spec, 33/33 PASS**, 05:22. AI riêng 14/14; jsdom + API mock. |
| Backend TypeScript | Cwd backend: `node node_modules/typescript/bin/tsc --noEmit --pretty false` | **PASS**, exit 0 |
| Frontend type/build | Cwd frontend: `npm.cmd run build` | **PASS**, exit 0, vue-tsc + Vite. [Log](../../artifacts/reports-ai-4b-2026-11-02/frontend-build.log); còn cảnh báo chunk >500KB/plugin timing, không phải build failure. |
| DB schema/fixture | Cwd backend: `node node_modules/prisma/build/index.js db push --config ../artifacts/reports-ai-4b-2026-11-02/prisma-disposable.config.mjs`; sau đó `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/4b-setup.ts`; `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/4b-ai-fixtures.ts seed` | **PASS** trên DB disposable đã xác minh; dữ liệu giả namespace verify-ai-* |
| Harness và baseline tenant/JWT | Cwd backend: `$env:REPORT_VERIFY_BROWSER_SCENARIOS='1'`, rồi `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/4b-server.ts` | **15/15 baseline PASS**; [results.json](../../artifacts/reports-ai-4b-2026-11-02/results.json). Đây là kiểm tra nền, không phải 15 ca AI. |
| DB/JWT/HTTP AI | Cwd backend: `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/4b-ai-fixtures.ts check` | **14/14 PASS**, 05:27; [kết quả](../../artifacts/reports-ai-4b-2026-11-02/db-jwt-http-results.json) |
| Đối chứng độc lập bổ sung | Cwd backend: `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/4b-independent-checks.ts` | **12/12 PASS**, 05:27; [kết quả + ID oracle](../../artifacts/reports-ai-4b-2026-11-02/independent-db-results.json). Có thiếu/trùng audit, accepted draft, distinct đa ngày, future, thu hồi quyền, soft delete, query ngoài contract. |
| Trình duyệt thật | CUA in-app browser, phiên login mới trên harness local; không dùng ảnh lượt trước | **12/12 kịch bản PASS**, 05:28–05:30; [kết quả](../../artifacts/reports-ai-4b-2026-11-02/ai-4b-browser-results.json) |

**AI DB/JWT/HTTP: 26/26 nhóm kiểm tra (14 + 12)**, ngoài 15/15 baseline. Không cộng các nhóm có chồng lấp thành số test độc lập, không cộng ảnh hoặc request thành test. Không sửa characterization test cũ để tạo PASS; kết quả tái hiện lỗi các bước trước giữ nguyên trong tài liệu lịch sử.

Kiểm tra tài liệu: các file bằng chứng được liên kết đều tồn tại. `git diff --check -- README.md docs/reports-fix/README.md` còn cảnh báo blank line cuối README gốc đã có từ trước; không sửa phần ngoài patch 4B. Đây không phải kết quả type/build hoặc test runtime.

## Browser: hành vi và bằng chứng mới

Source đối chiếu: `frontend/src/views/reports/AiReport.vue:24` tải dữ liệu; `:30` xóa state cũ; `:34` sequence/period guard; `:44` watch; `:45` abort khi rời trang; `:60` loading, `:61` error/retry; `:64` / `:65` main/shared. Route `frontend/src/router/index.ts:102`, tab `ReportsShell.vue:34` / `:36`, menu `frontend/src/layouts/DefaultLayout.vue:49`, link `frontend/src/views/settings/AiAssistantPage.vue:15`.

1. Leader đi từ menu/tab vào AI; KPI chính và shared tách riêng, nhãn nháp không gọi là đang chờ.
2. Hôm nay đúng **2026-11-02 VN**, main 1/shared 0; unavailable vẫn riêng.
3. Delay 10 giây khi làm mới hiện loading và bỏ KPI kỳ trước.
4. Controlled HTTP 503 hiện lỗi + thử lại, không hiển thị rỗng/0 như thành công.
5. Retry trả đúng dữ liệu kỳ hiện tại.
6. Request 30 ngày bị giữ, đổi ngay sang 7 ngày: sau response cũ được thả, UI vẫn là **2026-10-27–2026-11-02**, không bị ghi đè.
7. Member không thấy menu/tab AI dù có grant report/AI.
8. Member gõ trực tiếp `/reports/ai` bị guard chuyển về `/`; API 403 được thử riêng.
9. Link “Xem báo cáo AI” trong header thiết lập trỏ `/reports/ai`.
10. Click link mở báo cáo org A admin, 9 tin / 3 hội thoại trong 30 ngày.
11. Admin org B chỉ thấy 1 tin của mình trong 30 ngày.
12. Org B hôm nay là 0 có trạng thái rỗng, chỉ số thiếu nguồn vẫn unavailable.

Các số đều là **fixture**, không phải dữ liệu vận hành: ngày fixture 01/11 main 5/shared 1, còn kỳ 30 ngày trên browser thêm hai tin biên ngày => main 7/shared 1, org A tổng 9. [Định nghĩa fixture](../../artifacts/reports-ai-4b-2026-11-02/fixture.json).

Ảnh mới: [leader](../../artifacts/reports-ai-4b-2026-11-02/ai-4b-leader.png), [loading](../../artifacts/reports-ai-4b-2026-11-02/ai-4b-loading.png), [lỗi](../../artifacts/reports-ai-4b-2026-11-02/ai-4b-error.png), [rỗng](../../artifacts/reports-ai-4b-2026-11-02/ai-4b-empty.png). [Log điều khiển delay/lỗi](../../artifacts/reports-ai-4b-2026-11-02/browser/scenario-events.jsonl). Scenario đã trả về inactive sau kiểm tra.

## File thay đổi, giới hạn và bước tiếp

File thêm trong lượt 4B: tài liệu này; `backend/scripts/reports-verification/4b-setup.ts`, `4b-server.ts`, `4b-base-checks.ts`, `4b-ai-fixtures.ts` (bản riêng trỏ artifact 4B), `4b-independent-checks.ts` (đối chứng mới); artifact dưới `artifacts/reports-ai-4b-2026-11-02/`. Cập nhật `docs/reports-fix/README.md` và README gốc. **Hành vi ứng dụng trước/sau lượt 4B giữ nguyên**; khác biệt là có bằng chứng kiểm tra độc lập và trạng thái gate đã xác minh.

- Chưa đo được pending review lifecycle, token/cost thực tế, handoff/conversion và tổng subtype đầy đủ khi còn unknown. Đây là giới hạn nguồn đã công khai, không phải KPI đã được đo bằng 0.
- `/ai/usage` xác minh bằng source và diff; không chạy HTTP full AI module. Trang thiết lập chỉ kiểm tra header/link/navigation; config API không đăng ký trong harness, không nghiệm thu CRUD cấu hình.
- Browser dùng viewport mặc định khoảng 975×543; chưa kiểm tra mobile 320/390/430, iPhone/PWA, focus/contrast đầy đủ. Phần này thuộc 5A/5B.
- Chưa chạy migration replay, query-plan/đo tải đại diện, staging/production, hoặc chứng minh coverage metadata/audit của dữ liệu lịch sử thật. Không dùng local PASS thay cho bước 6/7.
- Không sửa artifact cũ, commit, push hoặc deploy. Khi implementation/policy thay đổi phải kiểm tra lại các phần liên quan; PASS này gắn với snapshot source của lượt 4B.

**Bước tiếp: 5A — giao diện báo cáo mobile.** 4B đã đủ gate local theo contract hiện tại; 5A vẫn **NOT_STARTED**, không tự triển khai trong lượt kiểm tra này.
