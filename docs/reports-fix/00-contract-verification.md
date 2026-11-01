# Kiểm tra độc lập0B — Contract Báo cáo

Ngày29/10/2026, bắt đầu16:56 +07. Workspace `F:\ZaloCRM-CorepViet`. HEAD tham chiếu `1b910e3971841afeec83d53bc0539f3d50167f5d`; kiểm tra working tree, không có commit mới.

## Kết luận lần đầu ngày29/10: BLOCKED

**Cập nhật01/11/2026: PASS cho contract rollout nền đã được người dùng chốt.** F1/F2/F3/N1 được giải quyết như phần cập nhật cuối tài liệu. Kết quả này không phải PASS nghiệm thu patch1A; kiểm tra1B vẫn tách riêng. Findings/lệnh/kết quả cũ bên dưới được giữ làm lịch sử.

Contract có bản đồ nguồn và baseline hữu ích, nhưng **chưa đủ rõ để PASS và chuyển bước1–4**. Còn hai quyết định quyền chưa giải quyết đầy đủ (F1/F2), cùng định nghĩa thời gian phản hồi chưa đủ để viết oracle độc lập (F3). Các phần đạt được ghi riêng bên dưới;10 test baseline pass không giải quyết các quyết định này.

Lượt0B chỉ thêm tài liệu review này và cập nhật trạng thái chỉ mục. Không sửa `00-contract.md`, baseline, snapshot, test, runtime, schema hoặc cấu hình. Không tự thực hiện bước1.

## 1. Findings cần giải quyết

### F1 — Cao / BLOCKED: chưa có quy tắc ưu tiên giữa permission group và deptRole

**Contract:** `docs/reports-fix/00-contract.md:58–80` có ma trận owner/admin, leader/deputy, member; dòng80 để việc kiểm tra view_all/grants cho bước sau. Ma trận chưa có trường hợp CEO/Marketing/HC‑NS không mang legacy role admin/owner hoặc không là dept leader. Dòng65 deny member team report có thể bao phủ cả người mang nhóm quyền báo cáo chuyên biệt nếu implementation chỉ nhìn legacy role.

**Source đã kiểm tra lại:**

- `backend/src/modules/rbac/permission-types.ts:66`: report resource có cả access và view_all.
- Cùng file:166 (CEO),188 (Trưởng phòng),245 (Marketing) cấp engagement_score.view_all;257 (HC‑NS) cấp access, kèm comment view-only report;208/229 Sale cũng có access. Đây là quyền có trong định nghĩa source, không phải bằng chứng quyền cụ thể đã gán trong DB thật.
- `frontend/src/stores/auth.ts:56–60` và `frontend/src/router/index.ts:336–345`: UI/route dựa grants.access; menu Báo cáo cũng dùng canAccess ở `DefaultLayout.vue:31`.
- `backend/src/modules/dashboard/report-analytics-routes.ts:23–35` và `analytics/analytics-routes.ts:29–40`: backend lại gate bằng legacy admin/owner hoặc ContactScope.size>1, không hỏi report grant.
- `backend/src/modules/rbac/owner-scope.ts:37–58` cho phép view_all khi có resource; SavedReport caller không truyền resource. Không thể suy ra helper này đã thống nhất nghĩa view_all cho mọi report.

**Vì sao chặn:** source đang có nhiều lớp policy khác nhau; việc contract ghi CURRENT khác TARGET chưa tự chốt được permission group nào được mở báo cáo, phạm vi nào và grant có ưu tiên deptRole hay không. Không kết luận view_all phải mở toàn org: preset Trưởng phòng cũng có view_all và comment nói trong scope phòng. Tự áp một nghĩa global hoặc tự bỏ mọi grant đều có thể sai.

**Điều kiện gỡ:** bổ sung ma trận kết hợp legacy role × deptRole × report.access/view_all. Nêu rõ CEO/Marketing/HC‑NS, user bị gỡ access, singleton leader và member có grant đặc biệt. Quyết định riêng quyền vào và phạm vi dữ liệu; giữ admin-only automation-summary/broadcast nếu không có yêu cầu thay đổi. Nếu không xác định được ý định từ tài liệu nghiệp vụ, cần người dùng chốt đúng các trường hợp này; không làm1A theo suy đoán.

### F2 — Cao / BLOCKED: phép kết hợp scope domain chưa xác định cho contact/nick được chia sẻ

**Contract:** bảng dòng63 nói leader chỉ trong phòng/cây con, không phòng ngang; dòng74 dùng nick read scope, dòng76 nói account/contact scope “thích hợp”, nhưng chưa định nghĩa giao/hợp và cách tính tổng so với leaderboard.

**Source:**

- `backend/src/modules/zalo/zalo-scope.ts:117–144`: account read scope gồm nick thuộc subtree **cộng explicit ZaloAccountAccess** của viewer; explicit grant có thể trỏ nick của người ngoài subtree trong cùng org.
- `backend/src/modules/contacts/contact-scope.ts:107–129`: contact được phép là union ContactAccess primary/collaborator của user subtree; không đồng nghĩa assignedUserId cũng thuộc subtree.
- `backend/src/modules/privacy/redact.ts:4–9,31–38`: aggregate không blur, content nick main vẫn có điều kiện riêng. Đây là hai tầng khác nhau, không giải quyết được cách cộng metric theo người/nick.

**Ví dụ còn thiếu expected result:** leaderA được grant nickB của saleB; hoặc contactC assigned saleB nhưng có collaborator saleA. Contract chưa trả lời dứt khoát: tin/contact đó có vào tổng nào; nickB có vào fleet không; saleB có xuất hiện leaderboard không; AI metric cần account AND contact scope hay chỉ một nguồn quyền. Hai người thực hiện có thể chọn hai query đều nhận là “theo contract” nhưng trả kết quả khác.

**Điều kiện gỡ:** lập bảng domain cụ thể (people performance, contact snapshot, nick fleet, messages/AI, audit) với predicate và expected result cho hai fixture trên, cả org total lẫn breakdown. Khóa nguyên tắc không vì contact shared mà mở chat nick khác; không suy permission gửi từ read scope. Đây là bổ sung contract, chưa yêu cầu mở rộng quyền hiện tại.

### F3 — Trung bình / BLOCKED riêng công thức response-time bước3

**Contract:** dòng122 nói nhiều inbound liên tiếp “cùng lượt”, trả lời người đầu tiên và attribution theo inbound, nhưng chưa chọn mốc inbound đầu hay cuối lượt. Ví dụ inbound09:00,09:04 và reply09:05 có thể là5 phút hoặc1 phút. Cũng chưa nói khi cutoff kết thúc kỳ mà reply xuất hiện sau kỳ thì mean được cập nhật đến asOf nào.

**Source:** `backend/src/modules/analytics/reports/response-time.ts:33–56` chỉ AVG các daily averages; `team-performance.ts:77–85` cùng nguồn. Nó không cung cấp quyết định pairing; không thể dùng output cũ như oracle cho thuật toán mới. Không thấy writer DailyMessageStat hiện hành qua cả Prisma writes lẫn INSERT/UPDATE raw trong backend/src.

**Điều kiện gỡ:** chọn anchor, cách gộp lượt, tie-break timestamp, cutoff/asOf và denominator; đưa ví dụ09:00/09:04/09:05 thành expected value cụ thể. Hoặc quyết định response-time unavailable cho đợt sửa này và hoãn pairing sang scope riêng, thay vì để người implement tự chọn. Không cần bật provider hoặc truy vấn production để chốt định nghĩa.

### N1 — Nhẹ / FAIL tài liệu endpoint cơ bản

`00-contract.md:32` liệt kê `/reports/messages`, rồi `/contacts`, `/appointments`, `/export`; phần mở đầu chỉ quy ước prefix `/api/v1`, không nói rút gọn `/reports`. Literal path này dễ bị hiểu thành `/api/v1/contacts` vốn là domain khác.

Source đúng tại `backend/src/modules/dashboard/report-routes.ts:95,140,176` và `frontend/src/views/ReportsView.vue:111,127,148`: `/reports/contacts`, `/reports/appointments`, `/reports/export`. Nên viết đầy đủ khi sửa contract. Review0B không tự sửa bản gốc.

## 2. Những phần đã đối chiếu đạt

| Hạng mục | Kết quả review | Bằng chứng source hiện tại |
|---|---|---|
|8 view gốc và shell/router|PASS|frontend/src/router/index.ts:91–100; views/reports/ReportsShell.vue:21–29 |
|Endpoint Automation đúng|PASS|AutomationReport.vue:210 gọi /reports/automation-summary; backend automation-report-routes.ts:54. RA:590 vẫn có /reports/automation cũ, contract đã nêu |
|Đăng ký route backend|PASS|backend/src/app.ts:340–341,355–356,375,377 |
|Analytics, cơ bản, export, saved CRUD/run|PASS phạm vi, trừ typo N1|use-analytics.ts:79–145; ReportsView.vue:108–149; saved-report-routes.ts:24–143 |
|Phân biệt menu/API hiện tại|PASS mô tả CURRENT|DefaultLayout.vue:31/46–47; router và ReportsShell đủ8 mục; report gate khác grant UI |
|Saved-run thiếu owner/report gate|PASS nhận diện|saved-report-routes.ts:120–143 lookup id+orgId, gọi service org-wide; không owner-scope như GET/PUT/DELETE |
|Snapshot/cohort/event|PASS cách phân biệt|RA:93–134,318,415–438; conversion-funnel.ts:31–69. Contract không mặc định createdAt/updatedAt là thời điểm chốt |
|Won khác terminal|PASS nhánh unavailable an toàn|schema.prisma:755–763 ghi rõ terminal gồm Chốt/Thất Bại/Mất; RA:80–82 fallback terminal. Contract chặn tự terminal=won; chưa có mapping thì unavailable |
|null/0/error/stale|PASS thiết kế nguyên tắc|contract:102–108. Runtime chưa sửa: RA:43 dùng Number(v??0); OverviewReport.vue:43–48 vẫn giữ data khi lỗi. Contract không tuyên bố đã khắc phục |
|Ngày VN/7/30 ngày/kỳ trước|PASS định nghĩa|contract:84–98; tự tính DateTimeOffset cho4 ví dụ ngày, kết quả bên dưới. RA:45–49 vẫn UTC, được mô tả đúng là lỗi CURRENT |
|Bucket engagement UTC|PASS cảnh báo|engagement-service.ts:165/182, không thể đổi nhãn UTC thành VN để tái chia ngày chính xác |
|AI chưa có dashboard riêng và usage khác send count|PASS|ai-routes.ts:187–194; ai-service.ts:90–101; auto-reply/followup writers bên dưới |

PASS ở bảng là phần review tài liệu, không nghiệm thu runtime hoặc0B tổng thể. Giới hạn366 ngày là đề xuất mới ghi rõ; không có bằng chứng đã tương thích mọi khoảng saved config cũ. Khi sửa phải validate rõ400, không cắt kỳ thầm. Uptime rolling7d so với period phải gắn nhãn đúng như contract yêu cầu; `status-log-service.ts:96–125` hiện là rolling đến now, không phải helper mọi kỳ tùy chọn.

## 3. Kiểm tra đường ghi dữ liệu

Không chỉ đọc comment/model. Đã lần theo caller, lệnh ghi và consumer:

- **Message/engagement:** `chat/message-handler.ts:401` tạo Message;490/517 import và gọi incrementDailyAggregate; `engagement-service.ts:182,229–234` chọn bucket UTC rồi ghi daily row. Reaction hook `zalo-listener-factory.ts:165–166` gọi cùng writer. `app.ts:474–475` có khởi động classifier cron. Ghi aggregate là best-effort; không chứng minh coverage DB thật.
- **Status log:** `zalo-pool.ts:24,648` import/gọi writeTransition; `status-log-service.ts:57,63` đóng interval và tạo interval mới; `app.ts:538–539` khởi động checkpoint cron. Consumer uptime tồn tại ở96/144, route report chưa dùng metrics thật.
- **Friendship:** `target-cron.ts:34` import attemptFriendRequest/ByUid từ campaign-service; các đường chạy target gọi các hàm này; campaign-service.ts:88/108/130/249 ghi/cập nhật FriendshipAttempt. `app.ts:488–489` startTargetCron nằm trong guard không-test. Không chạy cron ở review.
- **Care:** `app.ts:493–496` khởi động care cron/listener trong guard; `care-session-cron.ts:114` và community-automation-routes.ts:766 gọi processCareSessionStep; process-care-session-step.ts:305/365 ghi CareSessionEvent; listener:83/226 ghi reply/enroll events; automation-report-routes.ts:79–106/124–131 tổng hợp. Có writer/caller trong source, không có bằng chứng enabled theo org thật.
- **Broadcast:** `app.ts:485–487` startBroadcastCron khi không-test; broadcast-cron.ts:73 tạo run và156/420/433 cập nhật; broadcast-report-routes.ts:58 lấy run trong kỳ,129–138 trả counters. Không giả định sentCount là delivery/read receipt hoặc đã loại dry-run nếu chưa kiểm chứng.
- **Status changes/activity:** contact-routes.ts:1188/1212 ghi log status_change,1218–1219 có old/newStatusId; activity-logger.ts:41 ghi fire-and-forget. Không thể gọi đó là lịch sử chốt toàn vẹn nếu chưa xác minh mọi writer/retention.
- **AI:** auto-reply-service.ts:296–317 ghi Message ai_auto và dryRun,348 ghi audit;443–448 tạo suggestion cần duyệt. followup-cron.ts:310–314 có aiFollowup=true,349 audit details; ai-service.ts:94 đếm AiSuggestion. Nguồn này có thể hỗ trợ report; không đồng nhất pending lifecycle hoặc token cost.
- **DailyMessageStat:** vẫn có reader trong analytics/legacy dashboard. Tìm backend/src bằng Prisma create/createMany/update/updateMany/upsert và raw INSERT/UPDATE không thấy writer hiện hành. Kết luận đúng mức: chưa chứng minh nguồn fresh trong checkout; không khẳng định database trống hoặc không thể có writer ở hệ thống ngoài.

Không kết nối DB, mở .env, bật exporter, gọi model, gửi Zalo/Telegram hoặc chạy worker. Vì vậy chỉ PASS source lineage, không PASS vận hành production.

## 4. Baseline chạy lại độc lập

Đã đọc mock trước chạy: `backend/tests/unit/reports-review-evidence.test.ts:4–14` mock Prisma/auth/contact scope/logger, `tests/custom-report-sqli.test.ts:13–18` mock Prisma raw. Không import app bootstrap hoặc adapter thật.

Lệnh ở `F:\ZaloCRM-CorepViet\backend`:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/custom-report-sqli.test.ts
```

Kết quả29/10/2026 **16:57:50 +07**: Vitest4.1.4, **2 file passed,10 tests passed**, duration303ms (transform169ms, import273ms, tests18ms), exit0. Chạy ngoài sandbox để dùng cache Windows; không thay test/dependency hoặc kết nối database.

-5 characterization tests gồm4 ca tái hiện lỗi (scope, KPI, lịch tương lai, UTC boundary) và1 đối chứng member403. PASS có nghĩa hành vi cũ còn tái hiện, không có nghĩa đã sửa.
-5 custom-report tests kiểm tra bound parameter, bỏ source khi không có, reject groupBy không hợp lệ ở đường tested và fixture appointments. Không chứng nhận toàn bộ filter userId/status, semantics mọi branch, scope hoặc SQL chạy thật.
-Không có baseline failure mới trong hai file này. Không chạy full suite, build, DB integration/JWT/RLS/browser; thiếu các kiểm tra đó không phải lý do chính chặn0B, vì0B chỉ review contract. Chúng vẫn cần ở các bước thích hợp.

Kiểm tra ngày bằng DateTimeOffset thuần, không DB:29/10/2026 00:00+07→28/10 17:00Z;7 ngày23–29/10 gồm7 ngày;30 ngày30/09–29/10 gồm30 ngày; kỳ trước16–22/10 gồm7 ngày. Các kết quả này không chứng minh runtime đã dùng helper VN.

## 5. Git, snapshot và tính nguyên vẹn

- Đầu lượt đọc git status; các tracked AI/TikTok/docker/README thay đổi từ trước vẫn có. `git diff --name-only -- backend/src frontend/src backend/tests` cho các đường AI/TikTok đã có trong status0A; không thấy tracked report runtime mới sửa.
- Đối chiếu SHA256 toàn bộ44 file trong `00-source-snapshot.json`: **44/44 khớp,0 thay đổi** trước review. Kiểm tra lại sau khi ghi report bằng cùng cách.
- Snapshot không bao phủ mọi file trong repository nên không đủ tự chứng minh toàn bộ lịch sử0A không sửa gì; không vượt quá bằng chứng44 file + status/diff và phạm vi thao tác phiên này.
- Contract đang review có SHA256 `112bdabd946df60895095ebdadaa752bae9b7ecdc7791e9aac9cdb2f35feb418`; baseline `99d2fdb2b39c9972a78b600e4269d699e1356aab9152eb0c750817fe89f09e39`; snapshot `e1e5ccc774d07a7adf97308fb4560703198ec82b6681893b13425f530114ea17`. Không sửa ba file này để hợp thức hóa review.
- Không có AGENTS.md được tìm thấy bằng rg trong workspace; các parent path đã kiểm tra ở0A được kiểm tra lại nếu có. Không cần skill UI/Vue implementation vì chỉ đọc source/tài liệu và chạy baseline đã có; không viết component.

## 6. Bước tiếp theo

1. Sửa **tài liệu contract0A** để giải quyết F1/F2, chốt F3 hoặc hoãn response-time với trạng thái unavailable rõ; sửa typo N1. Nếu cần quyết định nghiệp vụ, hỏi đúng ma trận grant/role và explicit grants, không tự mở rộng quyền.
2. Chạy lại0B trên contract mới. Giữ review này như lịch sử, cập nhật kết quả kiểm tra sau khi đối chiếu patch hiện tại.
3. **Chưa chuyển1A**, không coi PASS baseline hoặc PASS các mục con là PASS0B tổng thể. Bước1–7 vẫn NOT_STARTED.

## 7. Kiểm tra lại contract sau quyết định người dùng — 01/11/2026

Nguồn quyết định: người dùng duyệt phương án quyền và dữ liệu chia sẻ; yêu cầu thời gian tính từ **tin nhắn cuối cùng của khách hàng**, sau đó yêu cầu tiếp tục triển khai. Không suy đồng ý deploy hoặc thay đổi quyền trên DB thật.

| Finding cũ | Cách giải quyết trong contract cập nhật | Kết luận contract |
|---|---|---|
|F1|Mục3.2 tách role/domain/scope, access trước scope; view_all không tự global. Rollout đầu chỉ owner/admin và leader/deputy có report access; role chuyên biệt/self-report mở sau bằng capability tường minh, không dò tên nhóm để cấp quyền.|PASS cho rollout nền; chưa khẳng định mọi role mới đã có runtime|
|F2|Mục3.3 tách main vs shared-only; people attribution theo actor thật. Nick grant ngoài phòng không đưa chủ nick vào leaderboard/main fleet. Contact collaborator không vào main assigned KPI. Gửi thật bởi sale trong scope trên nick được cấp thêm vẫn ghi cho sale đó.|PASS với expected fixtures rõ|
|F3|Mục5.3 chọn lastInbound→first human reply;09:00/09:04→09:05=60s; AI không đóng lượt, unknown actor không gán chủ nick, kỳ theo lastInbound/asOf và pending riêng.|PASS contract|
|N1|Các đường cơ bản đã ghi đầy đủ /reports/contacts, /reports/appointments, /reports/export.|PASS|

Đã đối chiếu lại source và test hiện tại: scope resolver dùng membership/grants hiện thời; main accountIds khác readableAccountIds; saved-run nhận viewer scope; pairing có test oracle60s. Đây là rà lại contract sau quyết định, không đổi kết quả tái hiện lỗi cũ ngày29/10 thành test đã sửa. Baseline0A và snapshot0A giữ nguyên.

Mã nguồn đã bắt đầu1A trong lượt triển khai sau khi người dùng chốt phương án; checkpoint chỉ mục trước đó chưa phản ánh tiến độ do phiên bị gián đoạn. Lần cập nhật này ghi đúng hiện trạng, không giả0B đã PASS từ ngày29/10 hoặc các bước đã được nghiệm thu khi chưa chạy.

Trạng thái tiếp theo:1A foundation backend có patch và local checks; cần1B review riêng. Toàn bộ sửa ngày/KPI/AI/mobile/DB nghiệm thu chưa hoàn tất; xem README và01-scope.md.
