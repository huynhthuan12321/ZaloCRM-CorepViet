# Bước0A — Contract Báo cáo và dữ liệu

Ngày kiểm tra: 29/10/2026, bắt đầu 16:42 +07; snapshot source lúc16:49:43 +07 trong `00-source-snapshot.json`. Workspace `F:\ZaloCRM-CorepViet`. HEAD: `1b910e3971841afeec83d53bc0539f3d50167f5d`.

**Trạng thái: contract đã cập nhật theo quyết định người dùng sau review0B.** Bản0B đầu BLOCKED được giữ trong file verification; kết quả kiểm tra lại ghi ở cuối file đó. Chưa sửa lỗi runtime trong bước0. Phạm vi patch contract chỉ `docs/reports-fix/`; bằng chứng CURRENT vẫn là working tree có thay đổi AI/TikTok từ trước.

## 1. Cách đọc và phạm vi

Ghi chú cập nhật01/11/2026: các đoạn **CURRENT** và line-reference của audit0A dưới đây chụp source ngày29/10, trước patch1A. Các quyết định TARGET đã được cập nhật theo người dùng. Source sau triển khai được mô tả riêng trong [checkpoint1A](01-scope.md); không coi bảng CURRENT lịch sử là mô tả runtime sau bản sửa.

- **CURRENT / xác nhận**: code đang làm gì, có đường dẫn:dòng đối chiếu trong phiên này.
- **TARGET / contract thiết kế**: quy tắc cho bước sửa tiếp theo, dựa policy có trong source và yêu cầu người dùng. Chưa phải code đã triển khai hoặc người dùng đã duyệt từng chi tiết mới.
- **UNAVAILABLE**: chưa đủ nguồn/độ bao phủ để đưa ra số đo; không giả thành0.
- **NEEDS_VERIFICATION**: cần test DB/role hoặc kiểm tra coverage thực tế sau này. Không đọc .env, truy cập DB hay dịch vụ ngoài trong0A.

Đã đọc hai audit11/12 và quy tắc bộ prompt. Tìm không thấy AGENTS.md trong các file workspace bằng `rg --files -g AGENTS.md`; kiểm tra riêng `F:\AGENTS.md` và `F:\ZaloCRM-CorepViet\AGENTS.md` cũng không có. Không áp skill tạo UI/Vue/docx vì0A chỉ lập tài liệu Markdown và đọc source, không thay component hoặc dựng UI. Không giao agent, tạo worktree hoặc commit.

## 2. Bản đồ màn hình → API → query → nguồn ghi

Các API trong bảng có prefix `/api/v1`. `RA` = `backend/src/modules/dashboard/report-analytics-routes.ts`. RA tự truy vấn Prisma trong route, chưa có service report chung. Filter backend đang hỗ trợ là filter được code đọc/áp dụng, không phải dropdown trên UI.

| Màn hình/route | API và vị trí | Query/model sử dụng | Nguồn ghi có trong source | Filter CURRENT |
|---|---|---|---|---|
| Overview `/reports/tong-quan` | `/reports/overview`, RA:59 | Contact, Status, ZaloAccount, Appointment, LeadRequest; messages là placeholder | contact-routes; chat aggregate; account lifecycle; appointment/lead-pool modules | from/to; nhiều phần vẫn snapshot hiện tại; msgSeries cố định14 ngày |
| Nick `/reports/nick` | `/reports/nick-fleet`, RA:210 | ZaloAccount hiện tại; metrics khác placeholder | zalo-pool/lifecycle; StatusLog có writer nhưng route chưa dùng | đọc from/to nhưng không lọc lịch sử nick |
| Sale `/reports/sale` | `/reports/sales-performance`, RA:282 | User, Contact, Status, Appointment, LeadRequest | contact/appointment/lead-pool writes | from/to chỉ áp một phần; contacts/closed snapshot |
| Sale, phần CRM usage | `/reports/crm-usage`, RA:982 | ActivityLog, Contact, Appointment, Message join Conversation/ZaloAccount | activity-logger + security-audit; chat persistence | from/to; event giới hạn100000; gán tin theo chủ nick hiện tại |
| Pipeline `/reports/pipeline` | `/reports/pipeline`, RA:395 | Status, Contact, LeadRequest | contact routes/aggregate; lead pool | from/to cho cohort; funnel/bySource vẫn snapshot |
| Pipeline, Lead Pool | `/reports/lead-pool`, RA:487 | LeadRequest, LeadPoolDistribution, Contact, User | lead-pool module request/distribute/return | from/to cho distribution; nhiều count snapshot/toàn lịch sử |
| Automation `/reports/automation` | **`/reports/automation-summary`**, `automation/automation-report-routes.ts:54` | FriendshipAttempt, CareSessionEvent join CareSession, ZaloAccountStatusLog, ZaloAccount/User | campaign-service:88/108; care-session-listener:83/226; process-care-session-step:305/365; status-log-service:35 | from/to; KHÔNG nhận user/nick filter backend; nhóm trả sẵn bySale/byNick |
| Broadcast `/reports/broadcast` | `/reports/broadcast`, `broadcast/broadcast-report-routes.ts:38` | BroadcastJob, BroadcastRun, CustomerList, ZaloAccount | broadcast-cron:73/156/420/433, broadcast-routes:438 | from/to theo run.startedAt; jobs là snapshot, recentRuns lấy20 |
| Engagement `/reports/engagement` | `/reports/engagement`, RA:709 | Contact.engagementPattern, ContactEngagementDaily | chat/message-handler:490–517 → incrementDailyAggregate; reaction hook zalo-listener-factory:166; engagement cron/classifier | API đọc from/to; frontend EngagementReport.vue:35 không gửi kỳ; heatmap28 ngày, pattern snapshot |
| Audit `/reports/audit` | `/reports/audit`, RA:872 | ActivityLog, ZaloAccountStatusLog, AutomationEventLog; cron/queue một phần giả | activity-logger:41; status-log-service:63; automation event writers | from/to cho một phần feed; KPI hôm nay/24h độc lập kỳ |
| Cơ bản `/reports-co-ban` | `/reports/messages`, `/reports/contacts`, `/reports/appointments`, `/reports/export`, `dashboard/report-routes.ts:53/95/140/176` | Message→Conversation; Contact legacy status; Appointment; export gọi excel-sheet-builders | chat/message-handler; chat send; contact/appointment routes | from/to; export thêm type=messages/contacts/appointments |
| Analytics `/analytics` | `/analytics/conversion-funnel`, `analytics/analytics-routes.ts:44` → getConversionFunnel | Contact.status legacy + createdAt/updatedAt | contact writes | from/to; cohort tạo trong kỳ, không phải lịch sử đi qua mọi stage |
| Analytics Team | `/analytics/team-performance`, analytics-routes:58 → getTeamPerformance | Message.repliedByUserId, Contact.status/updatedAt, Appointment, DailyMessageStat | Message/Contact/Appointment có writer; DailyMessageStat chưa tìm thấy writer hiện hành | from/to; hiện lấy user toàn org |
| Analytics Response | `/analytics/response-time`, analytics-routes:72 → getResponseTimeAnalysis | DailyMessageStat, AVG(avg_response_time_seconds) | chưa thấy writer trong backend/src; không đủ khẳng định đã có dữ liệu mới | from/to; mean-of-averages, chưa phải weighted response mean |
| Analytics Builder | `/analytics/custom`, analytics-routes:86 → executeCustomReport | metrics Message/Contact/Appointment/DailyMessageStat | như trên | metrics, groupBy=day/week/month/user/source, dateRange; filters khai báo userId/source/status nhưng chỉ source được đọc và chỉ ở một số nhánh contact |
| Saved report CRUD/run | `analytics/saved-report-routes.ts:24/42/66/82/103/120` | SavedReport→service analytics theo type | POST tạo, PUT cập nhật config | CRUD id/name/type/config; list/get/update/delete áp createdBy owner scope; run chỉ id+orgId, không owner scope/report gate; kỳ từ config.dateRange |
| Cài đặt AI | `/ai/usage`, ai/ai-routes.ts:187 → getAiUsage ai-service.ts:90 | AiSuggestion.count từ đầu ngày giờ server | ai-service:127; ai-auto-reply-service:443; virtual-chat/followup-service | không nhận from/to; org từ session; usedToday/maxDaily/remaining/enabled |

Frontend evidence: `frontend/src/router/index.ts:84–112`, `views/reports/ReportsShell.vue:21–29`, `composables/use-analytics.ts:79–145`, `views/ReportsView.vue:108–149`. Backend registration: `backend/src/app.ts:340–341,355–356,375,377`.

Endpoint **`/reports/automation` tại RA:590 vẫn tồn tại**, lấy AutomationSequence/EventLog/CareSession/AutomationBroadcast và có TODO riêng; **không phải endpoint AutomationReport.vue:210 đang gọi**. Bước1 phải rà cả endpoint còn gọi được này; bước3 không nhầm nó với automation-summary.

Menu hiện tại `DefaultLayout.vue:31–53`: canAccess('engagement_score'), Pipeline/Automation còn isExtension; ReportsShell/router cơ sở vẫn khai báo đủ8 mục. Chưa có báo cáo AI riêng. Capability, quyền hiển thị và quyền API phải kiểm tra độc lập khi sửa.

## 3. Ma trận quyền — CURRENT và TARGET

### 3.1 Bằng chứng hiện tại

- RA:23–35 và report-routes.ts:26–38: owner/admin qua; người còn lại qua khi contactScope.visibleUserIds.size>1. Gate không trả scope cho query.
- contact-scope.ts:89–129: leader/deputy theo **deptRole**, không phải chỉ tên legacy role; lấy subtree qua path và contactAccess primary/collaborator.
- zalo-scope.ts:69–155: owner/admin toàn org; leader/deputy nick thuộc user subtree, cộng explicit account grant cho viewer; active/read-only archived được tách accessibleIds/displayableIds.
- owner-scope.ts:37–102: list object theo createdBy; chỉ kiểm tra view_all khi caller truyền resource. Saved report hiện không truyền resource; không được suy grant view_all tự động áp vào run.
- automation-summary và broadcast: chỉ owner/admin (`automation-report-routes.ts:56`, `broadcast-report-routes.ts:40`).
- saved-report-routes.ts:120–143: run khác gate analytics; sở hữu cấu hình không được coi là quyền xem kết quả toàn org. Đây là đường cần sửa ở bước1.
- Privacy `privacy/redact.ts:4–9,31–38`: count/score/KPI aggregate không blur; content nick main chỉ owner+unlock. Quyền xem aggregate không cấp quyền xem chat/PII.

### 3.2 Policy đã được người dùng duyệt — thay thế ma trận đích cũ

| Nhóm | Phạm vi đích | Loại báo cáo được xem | Giới hạn |
|---|---|---|---|
| Owner/admin | org | Tất cả trong tổ chức | Không vượt org |
| CEO/Ban giám đốc | org | Kinh doanh, hiệu suất nhân sự bán hàng, hiệu quả AI | Không mặc định có Audit hệ thống/queue/cấu hình hoặc cost AI chi tiết |
| Trưởng/phó phòng | department subtree | Kinh doanh, hiệu suất phòng, khách/lịch hẹn, AI trong phạm vi | Singleton vẫn được xem; không mở phòng ngang |
| Marketing | org trong domain marketing | Nguồn khách, pipeline, chiến dịch, Broadcast/Automation | Không tự mở báo cáo chi tiết hiệu suất nhân viên, chat/PII hoặc system audit |
| HC–NS | org trong domain people aggregate | Hiệu suất/hoạt động nhân viên dạng tổng hợp | Không chat, hồ sơ/PII khách, nick detail, nội dung activity details |
| Sale/Sale Senior | self | Khách phụ trách, tin chính mình gửi, lịch hẹn phụ trách, kết quả cá nhân đủ nguồn | Không báo cáo team hoặc system audit |
| Không có report access | none | Không | Chặn cả API và saved-run |

Đây là policy đích đã được duyệt trong tin nhắn người dùng “ok vậy triển khai theo phương án trên”; không giả định nó đã có trong code/DB hiện tại. Broadcast/Automation vẫn giữ gate owner/admin trong đợt sửa nền đầu tiên; mở cho Marketing là rollout sau khi có capability chuyên biệt và test tương ứng. Báo cáo cá nhân và nhóm CEO/Marketing/HC–NS cũng là mốc mở rộng được ghi rõ, không âm thầm bật trong patch chỉ sửa scope cũ.

**Thứ tự quyết định bắt buộc:** org/identity hợp lệ → quyền vào domain report → scope dữ liệu đã cấp → predicate metric → privacy/field allowlist. Legacy owner/admin bypass trong org như hiện tại. Non-admin không có access thì deny dù deptRole hoặc view_all tồn tại. Report view_all chỉ đầy đủ trong scope được cấp, không tự biến thành org. Nguồn scope/capability phải là cấu hình do admin quản lý theo ID/khóa ổn định; không suy quyền từ tên nhóm hiển thị, tên phòng hoặc tổ hợp grants của resource khác.

Patch bước1 trước mắt sửa gate/scope hiện có cho owner/admin và trưởng/phó phòng (cần report access), chặn đường saved-run vượt quyền và singleton đúng deptRole. Các nhóm ngoài rollout giữ deny rõ ở backend thay vì hiển thị số liệu toàn org hoặc tự cấp grant. Khi mở policy mới, cần contract cấu hình tường minh và UI/backend cùng capability; việc thêm cấu hình không được tự backfill/mở quyền nhóm đang vận hành. Không triển khai global bằng cách đọc raw engagement_score.view_all, vì preset Trưởng phòng hiện cũng có flag đó.

Saved config chia sẻ chỉ chia bố cục/filter; list/get/update/delete áp quyền object, run phải áp cả quyền object lẫn report domain và **scope hiện tại của viewer**. Thu hồi quyền phải có hiệu lực ở request tiếp theo (hoặc cache có invalidation rõ), không dùng scope đã lưu trong config hoặc scope người tạo.

### 3.3 Phép áp scope theo domain

1. orgId luôn từ session, AND với mọi relation/raw query. Không nhận orgId tùy ý từ client. Scope rỗng trả0 đã đo/danh sách rỗng hoặc403 theo gate; không bỏ filter rỗng để trở thành toàn org.
2. People performance/leaderboard chính: visibleUserIds từ self/dept/org policy, không thêm chủ nick/khách ngoài scope chỉ vì được chia sẻ. Tin người ghi theo repliedByUserId; không có actor tin cậy→nhóm chưa xác định, không gán chủ nick.
3. KPI khách phụ trách chính: assignedUserId trong people scope, canonical contact chưa merged. Khách từ ContactAccess collaborator ngoài scope đưa vào phần **Khách được chia sẻ**, DISTINCT contactId, không cộng âm thầm vào KPI chính. Khi contact vừa là phụ trách chính vừa collaborator, chỉ nằm main; shared-only = accessibleContactIds MINUS main IDs. Tổng org đếm DISTINCT, không cộng số khách của các cá nhân để suy tổng.
4. Account scope tách main và shared: main nick thuộc user scope; shared-only = explicit readable nick IDs MINUS main IDs. Fleet/KPI chính dùng main; phần **Nick được cấp thêm** dùng shared-only. Nhãn/số liệu phần chia sẻ không thay đổi leaderboard. Account phải thuộc org và read-scope hợp lệ; nhãn main/shared không cấp quyền nội dung nick main hoặc gửi tin.
5. Message/AI vận hành theo nick: org AND allowedAccountIds của phần đang xem; khi hiện customer detail thì AND contact visibility, không dùng contact shared để mở nick ngoài quyền. Báo cáo hiệu suất tin theo nhân viên: org AND repliedByUserId trong people scope AND account read visibility; không cộng tin của người ngoài phòng vào bảng phòng chỉ vì nick được grant. AI ghi riêng theo nick/conversation, không credited vào tin người. Shared contact chỉ có hồ sơ được phép, không mở toàn bộ message history.
6. LeadRequest/Distribution theo requester/recipient trong people scope; Care/Automation theo domain/capability đã rollout. Audit hệ thống/queue/cost AI chi tiết giữ owner/admin trong đợt đầu. HC–NS chỉ nhận people aggregates allowlist, không được qua audit activity details bằng quyền people. Không tự cho non-admin xem endpoint Audit toàn org.
7. Filter userId/departmentId/accountId nếu bổ sung: intersect server scope, giá trị ngoài scope403 hoặc object không thấy404 theo convention; không nới scope bằng query/body/saved config. Không có filter hiện hành thì không vẽ dropdown coi như đã hoạt động.
8. Archived nick có lịch sử và uid: chỉ dùng displayableIds cho báo cáo lịch sử được phép; fleet online snapshot chỉ nick chưa archived. Không tái sử dụng read-only scope làm send permission. Không đổi grants/privacy/PIN trong patch sửa scope cũ.
9. Thu hồi ContactAccess/ZaloAccountAccess hoặc quyền report: truy vấn tiếp theo không còn nhận phần chia sẻ; history về actor vẫn giữ nguyên. Bản export đã tải là file độc lập, không tuyên bố thu hồi được bản đã tải bằng thay quyền API.

**Expected fixtures đã chốt:** leaderA có saleA và được grant nickB của saleB: saleB không vào people leaderboard; nickB chỉ trong phần Nick được cấp thêm; tin saleB trên nickB không vào hiệu suất phòngA. ContactC assigned saleB nhưng collaborator saleA: C chỉ vào Khách được chia sẻ của A, không main KPI; tin saleA thực sự gửi trên nick được phép vẫn credited saleA. Tổng org contactC=1. Lịch hẹn theo assignedUserId lịch; chốt theo trách nhiệm tại thời điểm event nếu lịch sử đủ, không theo cộng tác viên/owner hiện tại suy ngược.

## 4. Contract thời gian

**TARGET**: ngày nghiệp vụ `Asia/Ho_Chi_Minh`, date string `YYYY-MM-DD` không mang giờ; timestamp query dùng `[start,end)`; end là00:00 ngày sau to tại VN. Ngày có thể chuyển bằng logic hiện hữu/Intl, không cần thư viện mới mặc định.

| Lựa chọn | from/to ngày VN | Khoảng timestamp |
|---|---|---|
| Hôm nay29/10/2026 |29/10–29/10|28/10 17:00Z đến29/10 17:00Z |
|7 ngày tính cả hôm nay|23/10–29/10|22/10 17:00Z đến29/10 17:00Z |
|30 ngày tính cả hôm nay|30/09–29/10|29/09 17:00Z đến29/10 17:00Z |
|Tùy chọn01–29/10|01/10–29/10|30/09 17:00Z đến29/10 17:00Z |
|Kỳ trước của23–29/10|16–22/10|15/10 17:00Z đến22/10 17:00Z |

Chỉ số hôm nay/rolling24h/7d hoặc28d cố định phải ghi rõ cửa sổ riêng trong response/UI; không gán nhãn chung theo range đã chọn. Snapshot trả asOf, không dùng range để giả có lịch sử snapshot.

**Validation đề xuất cho bước2:** ngày lịch thật, from<=to, đầu/cuối cùng contract; khoảng tùy chọn tối đa366 ngày để giới hạn workload; không nhận query không hỗ trợ như filter có hiệu lực. Đây là giới hạn thiết kế mới,0B phải kiểm tra tương thích consumer trước khi chốt; nếu cần export dài hơn thiết kế riêng, không cắt thầm. Lỗi validation400 trước DB.

Cột `@db.Date`/bucket daily không chuyển giờ hai lần. ContactEngagementDaily được ghi qua `toUtcDay` (`engagement-service.ts:180`); các bucket UTC cũ **không thể chia lại VN chính xác chỉ bằng đổi timestamp/label**. Bước2/3 phải hoặc giữ nhãn UTC tường minh cho historical series hoặc tái tổng hợp từ event gốc có đủ timestamp, xác minh đủ coverage; không thay writer/backfill thật trong0A. Avg response nguồn daily cũ cũng cần xác minh timezone/coverage.

## 5. Contract KPI ưu tiên

### 5.1 Quy tắc chung cho dữ liệu và attribution

TARGET: value number|null, unit, availability, reason, timeBasis(period/snapshot/rolling), source/coverage và scope. Hình dạng API cụ thể bước3 phải thiết kế tương thích consumer, không đổi payload trong0A. `0` chỉ khi có nguồn hợp lệ phủ kỳ và không có event; thiếu nguồn/denominator không hợp lệ → null. Lỗi transport là error riêng, không đổi thành unavailable hay0. Stale có nhãn kỳ thành công gần nhất, không hiển thị như kỳ mới.

Contact: loại mergedInto!=null khỏi count canonical. Message vận hành: loại isLocal, metadata.dryRun/test, isDeleted theo contract này; chỉ conv Zalo thật thuộc scope, không group/virtual khi metric ghi rõ1–1. Không diễn giải số ghi nhận trong CRM là chứng nhận khách đã nhận/đọc. Tin tự gửi native không có actor CRM phải nằm nhóm “Chưa xác định”, không tự gán chủ nick.

Nhân viên: tin người theo repliedByUserId đáng tin; bot/AI tách riêng, chủ nick chỉ dùng khi metric gọi đúng “theo chủ nick”. Contact/lịch hẹn snapshot theo assignedUserId hiện tại, nhãn rõ; historical chuyển owner không có lịch sử thì không khẳng định attribution tại thời điểm event. Contact collaborator được thấy không đồng nghĩa credited sale. Không cộng số contact distinct của các sale để suy tổng nếu có overlap.

### 5.2 Danh mục và định nghĩa đích

| KPI | Loại/đơn vị/nguồn | Công thức, attribution và null |
|---|---|---|
| Tổng khách hiện tại | snapshot/contact, Contact | DISTINCT canonical contact trong scope; asOf; không phải tổng khách trong kỳ |
| Khách mới | period/contact, Contact.createdAt | canonical contact tạo trong kỳ; theo assigned user hiện tại nếu breakdown;0 hợp lệ khi nguồn phủ kỳ |
| Phễu trạng thái | snapshot/contact, Contact.statusId→Status | count theo trạng thái hiện tại; không gọi là số từng đi qua stage; không suy drop/conversion lịch sử từ snapshot |
| Khách mới hiện đã chốt / tỷ lệ cohort | cohort/contact/% | tử số khách tạo trong kỳ hiện ở won; mẫu số khách tạo trong kỳ; mẫu0→null. Không đặt nhãn “số chốt trong kỳ” |
| Chốt phát sinh trong kỳ | event/contact | chỉ dùng event chuyển non-won→won đủ coverage, DISTINCT contact theo kỳ (không đếm lặp reopen) và actor/owner rõ. Thiếu event hoàn chỉnh→unavailable, không dùng updatedAt/createdAt thay thế |
| Won status | cấu hình trạng thái | source hiện dùng tên chứa “Chốt” rồi fallback terminal; terminal có thể bao gồm lost. TARGET không coi mọi terminal=won. Chưa có mapping won chắc chắn thì metric won unavailable; cần0B đối chiếu Status/schema/config trước bước2/3 |
| Tin gửi/nhận theo ngày | period/message, Message.sentAt | eligible message theo senderType self/contact; chia ngày VN từ timestamp. Người/bot/AI phân nhóm sentVia/metadata allow-list có bằng chứng; unknown tách riêng |
| Tin hôm nay | today/message | cùng bộ predicate tin và cửa sổ VN hôm nay; không dùng series14 ngày hoặc toàn lịch sử |
| Thời gian phản hồi | period/giây hoặc phút | ĐÃ DUYỆT: lấy **tin khách cuối cùng của lượt chờ** → **phản hồi người đầu tiên** sau tin đó. Các inbound liên tiếp gom1 lượt; bot/AI không đóng lượt. Attribution kỳ theo lastInboundAt và nhân viên thực sự trả lời. Ghi asOf cố định cho query; có thể tìm reply sau end nhưng <=asOf; người chưa trả lời tính pending riêng, không vào mean. Không giả bot là người; thiếu actor/pairing đáng tin thì unavailable. Chi tiết oracle ở5.3 |
| Lịch hẹn hôm nay | today/appointment | appointmentDate trong đầu/cuối ngày VN; snapshot status; tách cancelled thay vì âm thầm trộn. Chọn nhãn “Tổng lịch” hay “Còn hiệu lực” đúng filter |
| Lịch hẹn hoàn thành trong kỳ | period/appointment | source hiện lọc appointmentDate+status completed; nhãn “Lịch trong kỳ hiện đã hoàn thành”. “Hoàn thành phát sinh trong kỳ” cần completedAt/event đáng tin; chưa có→unavailable |
| Nick online/tổng/cần kiểm tra | snapshot/nick | nick active chưa archived; connected là online. Non-connected không mặc định đều phải re-login nếu status không chứng minh; giữ label trạng thái đúng |
| Uptime | rolling hoặc period/% | thời gian connected giao window / effective observed window, ZaloAccountStatusLog. effectiveWindowMs0→null; hiển thị coverage, không hứa7 ngày nếu log mới bắt đầu |
| Quota SDK | snapshot/requests/% | limiter counters + configured cap có hiệu lực; không gọi API gửi để đo. Không đủ counters/cap→unavailable; cap0 không chia0 |
| Kết bạn gửi/đồng ý | cohort/attempt và % | automation-summary hiện cohort queuedAt, đếm sent+accepted+rejected là kbGui, accepted là dongY; % accepted/kbGui, mẫu0→null. Ghi rõ cohort, không gọi là accepted event trong kỳ |
| Chăm sóc gửi/phản hồi | period/event và % | CareSessionEvent.step_sent/reply trong kỳ; replyEvents/sentEvents là tỷ lệ event, có thể>100%, không coi là tỷ lệ khách chuyển đổi. Muốn tỷ lệ session cần DISTINCT theo session và cohort rõ |
| Broadcast | period/run,message,% + job snapshot | run.startedAt trong kỳ; sent/failed/skipped theo persisted counters; success=sent/(sent+failed), mẫu0→null. Total/activeJobs snapshot riêng; byNick/list là nhóm của run, không số khách distinct |
| Lead Pool chờ/trả | snapshot/request hoặc period/event | pending releaseReason=null theo scope; return event theo autoReturnedAt/release event trong kỳ. Không lấy total lịch sử làm denominator của tỷ lệ theo kỳ; thời gian giữ cần releasedAt đủ |
| Engagement nóng/lạnh | snapshot/contact | pattern hiện tại từ classifier; ghi ngày cập nhật; không suy “trong kỳ” |
| KH chủ động | daily bucket/% | CURRENT true rows/total ContactEngagementDaily rows; không phải unique customer % và dữ liệu UTC. TARGET giữ nhãn đúng/ngày bucket; nếu cần VN phải rebuild đủ nguồn |
| Tương tác trung bình/ngày | period/event/day | tổng inbound+outbound eligible / số ngày trong kỳ; chỉ áp nếu daily coverage đủ, không gồm reaction/call trừ khi nhãn nêu |
| CRM actions/giờ hoạt động | period/action/phút ước tính | ActivityLog.user; session gap30p, floor5p như RA:1058+. Giữ chữ ước tính; take100000 có thể cắt, phải flag truncation/coverage; không suy giờ làm việc thực tế |
| Audit lỗi24h | rolling/event/% | failed/total AutomationEventLog24h; đây là tỷ lệ log khớp rule, không mọi lỗi hệ thống; mẫu0→null. Scope actor/entity hoặc admin-only cho phần org health |
| Cron/queue health | snapshot/status | chỉ đo registry/queue thật, unknown khi chưa đọc; không dùng ok=true cố định làm chứng nhận khỏe |
| AI usage | today/suggestion record | giữ nghĩa count AiSuggestion, không token/model-call/tin gửi; timezone hiện server, chuẩn hóa UI report riêng không đổi quota policy ở0A |
| AI tự gửi | period/message, distinct Message.id | sentVia ai_auto/metadata được kiểm chứng; loại dry-run/isLocal; số hội thoại DISTINCT conversationId; nhãn “đã ghi nhận gửi”, không delivery guarantee |
| AI reply/followup | period/message | metadata.aiFollowup=true cho followup, auto reply có nguồn rõ; legacy không phân loại→unknown. Hai loại cộng+unknown=total |
| Bản nháp AI cần duyệt | period/suggestion | type auto_reply_needs_review là bản ghi tạo trong kỳ; chưa có lifecycle thì chỉ gọi “bản nháp đã tạo cần duyệt”, không “đang chờ” |
| AI cost/token/handoff/conversion | period/value | hiện không đủ nguồn tổng hợp; unavailable. AiSuggestionApplied là apply trường CRM, không bằng chứng sale đã duyệt gửi |

Những định nghĩa TARGET mới (response pairing, giới hạn366 ngày, null khi denominator0 và DISTINCT chốt) là phương án cụ thể cho0B đánh giá, không khẳng định code đã hỗ trợ. Nếu mâu thuẫn nhu cầu nghiệp vụ thật sự, ghi vấn đề cần chốt trước khi sửa metric đó; có thể sửa scope độc lập sau0B PASS phần scope, không âm thầm thay nghĩa KPI.

### 5.3 Oracle thời gian phản hồi đã được người dùng chốt

- Anchor = tin **cuối cùng của khách** trong lượt chưa có người phản hồi; khách nhắn tiếp sẽ thay anchor. Nhân viên trả lời người đầu tiên đóng lượt; các reply tiếp theo không tạo thêm sample.
- Ví dụ khách09:00,09:04 → người09:05: **60 giây**, không phải300 giây. AI09:04:30 không đóng lượt. Bot/AI gửi trước khi người trả lời không làm giảm thời gian chờ người.
- Attribution nhân viên = repliedByUserId đáng tin; native reply không có actor vẫn đóng lượt nhưng vào unattributed, không gán chủ nick và không ghép sang reply tiếp theo. Người ngoài scope cũng đóng lượt nhưng không được credited vào people aggregate của phòng.
- Tie-break cùng sentAt theo id tăng dần;0 giây hợp lệ. Không suy id là thứ tự nghiệp vụ nếu nguồn sau này có sequence tốt hơn; hợp đồng hiện dùng deterministic fallback và phải ghi nhận giới hạn này.
- Chọn kỳ theo lastInboundAt trong[start,end). asOf chụp một lần đầu query; có thể ghép reply sau end nhưng không sau asOf. LastInbound mới ngoài kỳ làm sample thuộc kỳ mới. Pending chỉ là lượt còn chờ với anchor trong kỳ tại asOf; không vào mean. Có thể thay đổi kết quả lịch sử khi asOf khác nhau, vì đây là cohort được theo dõi đến asOf, không frozen snapshot.
- Loại deleted/local/dry-run; group/virtual không thuộc metric1–1. Mean tổng = tổng giây / số cặp người có actor hợp lệ, không mean-of-averages. Không có cặp→null, không phải0. Vượt giới hạn lấy event→unavailable, không tính mean từ mẫu bị cắt.

## 6. Inventory giá trị cố định, writer và độ tin cậy

| Nhóm | CURRENT tại source | Nguồn có thể dùng / hạn chế | Hướng bước sau |
|---|---|---|---|
| Overview | RA:141,160–194: sent/topSales, quota, uptime, msgSeries, newContactsDelta, msgToday/msgByBot, leadPoolAutoReturnSoon, closeRateDelta, friendAcceptRate/invites cố định0 | Message có writer; status log có writer; quota/acceptance cần service/coverage | aggregate thật theo contract, phần thiếu unavailable |
| Nick | RA:233–271: metrics0; uptimeHeat.days=false; sdkByCategory=[] | nick-metrics-service.ts:94/259/278 truy vấn thật nhưng ngày UTC; phân bot tại208 chỉ sentVia automation, ai_auto có thể vào nhóm khác; chưa reuse mù | chuẩn hóa classification/window và coverage trước tích hợp |
| Sales | RA:329–379: sent, response, buckets, byDept.sent0 | Message actor vs nick owner; response DailyMessageStat nguồn cũ | thật/unknown actor và response unavailable khi chưa pairing |
| Pipeline | RA:428/458/470 avgDays/contactedPct0 | Friend.stageEnteredAt snapshot ởschema:2190, không lịch sử đầy đủ mọi stage/contact | stage-age hiện tại có thể tính riêng, historical average chưa đủ |
| Lead Pool | RA:574 avgHoldHours0 | LeadRequest có timestamp; kiểm tra nghĩa lifecycle trước | query có coverage hoặc unavailable |
| Automation endpoint cũ | RA:633/649/688–692: sent0, category benign cố định, acceptRate0, lag/stuck0 | AutomationEventLog/Care/queue có đường ghi riêng; endpoint UI hiện không gọi | không bỏ quên endpoint còn public theo auth |
| Engagement | RA:709+ query thật; daily UTC, fixed28days heatmap; boolean rows count | message-handler:490/517 → engagement-service:180/229/234; reaction hook:166; fire-and-forget, cleanup84 ngày ở engagement-cron | xác minh coverage/múi giờ, không backfill thật0A |
| Audit | RA:893–901 ok=true cố định, queueWaiting0/queues[]/errorBreakdown[] ở961–968 | ActivityLog/status logs có writer; registry queue chưa nối | unknown status thay vì xanh giả |
| Automation-summary | query thật theo queuedAt/care events/status logs | campaign-service create/update; care-session-listener/process-step; status writer best-effort | cohort/event label, scope admin-only, validate kỳ |
| Broadcast | counters/run query thật | broadcast-cron ghi run và counters, retry run riêng | xác minh trạng thái sent có loại dry-run chưa; chưa chứng nhận delivery |
| DailyMessageStat | schema:1601 tồn tại, analytics còn đọc | tìm toàn backend/src không có create/update/upsert; zalo-dashboard-routes.ts:217 ghi chú dead writer, route legacy khác còn đọc | UNVERIFIED/LEGACY, không chứng nhận fresh từ schema |
| Status history | contact-routes.ts:1188/1212 log legacy/dynamic status_change có old/newStatusId | activity-logger.ts:41 fire-and-forget/catch; friend status khác scope; nhiều đường aggregate/automation | event coverage chưa chắc, không dùng updatedAt làm closedAt |
| AI | Message ai_auto writer + metadata.dryRun, followup.aiFollowup, audit action, AiSuggestion | auto-reply-service:296–352/443; followup-cron:297–317/346; audit best-effort; schema1911/1930 | Message là nguồn canonical, audit enrich không đếm đôi; missing classification→unknown |
| Observability AI | ai-trace-contract.ts:30–48 có operation/provider/model/latency/status, không token/cost | exporter Opik là dịch vụ ngoài, không bật/kiểm tra ở0A | cost/token chưa khả dụng |

**Không xác nhận writer có chạy trong production** chỉ từ source: có đường gọi là WRITER_PRESENT, coverage/freshness cần fixture/integration/đối soát. Message SDK send/ingest và native reconciliation phải kiểm tra dedupe trong bước3; không suy mỗi row là một delivery duy nhất nếu chưa đối chiếu.

## 7. Fixture và baseline an toàn

Xem [00-baseline.md](00-baseline.md) về kết quả đã chạy. Chưa tạo DB fixture hoặc thay test trong0A.

| Fixture kế hoạch | Mục tiêu / oracle độc lập |
|---|---|
| orgA/orgB; A/B và A.1; admin, leaderA, deputyA, soloLeader, member | response rows, KPI, export/custom/saved-run đều không vượt org/subtree; soloLeader nhận đúng scope self theo policy đích |
| ContactAccess primary/collaborator trùng contact; nick owned/granted/main/archived | count distinct; shared contact không mở chat nick khác; aggregate không lộ PII; lịch sử archived hợp lệ không cấp quyền gửi |
| Tin self/contact, user/automation/ai_auto/native, isDeleted/isLocal/dryRun | counted/unknown/excluded theo từng predicate; tổng và breakdown đối soát tay; không quy bot thành sale |
|29/10 00:00 VN,28/10 23:59:59 VN,29/10 23:59:59,30/10 00:00; lịch hôm nay/10–11 | cửa sổ đúng1 lần, lịch tương lai không vào hôm nay; test UTC/VN cho cùng expected |
| Khách tạo kỳ trước chốt kỳ này; khách tạo kỳ này chốt kỳ sau; reopen; status lost terminal | phân biệt cohort/snapshot/event; không lost=won; missing history unavailable |
| Counter0 thật, writer thiếu, log thiếu, scope rỗng, mẫu số0 | không lẫn0/unavailable/error; test rõ đơn vị/coverage |
| AI followup metadata, legacy unknown, audit mất/trùng, suggested/apply CRM | canonical Message count, không duplicate, không nhầm accepted fields với approved send |
| Response chậm A rồi nhanh B; B lỗi; kỳ cũ đang hiển thị | không stale overwrite; lỗi/retry rõ; đúng nhãn dataPeriod |
|>100000 activity rows / quan sát chưa đủ7d uptime | flag truncation/partial coverage thay vì kết quả full giả |

Không dùng database hiện hữu chỉ vì DATABASE_URL có sẵn. Bước6 mới kiểm tra đích DB test chuyên biệt (host/database/role an toàn, không lộ password), chặn cron/send/provider/network và dùng fixture giả. Nếu không chứng minh đích test, đánh dấu BLOCKED cho DB integration, vẫn làm unit/mock và tài liệu độc lập.

## 8. Các tiêu chí hoàn thành0A và giới hạn

- Đã kiểm tra bản đồ8 view + cơ bản/analytics/saved CRUD/run + AI usage + endpoint automation cũ; có filter CURRENT và writer lineage.
- Có ma trận CURRENT/TARGET, scope theo từng domain, riêng tư aggregate khác nội dung, không suy report permission từ ContactAccess.
- Có định nghĩa KPI/kỳ/null/actor và inventory placeholder/legacy nguồn; lựa chọn thiết kế mới ghi rõ để0B review.
- Baseline hiện tại10/10 test đạt;5 test tái hiện lỗi cũ,5 test bảo vệ bound params; không DB/JWT/RLS/browser test.
- Chưa sửa runtime; không commit/push, migration/deploy, mở .env hoặc gọi dịch vụ thật. Có snapshot source/test để0B nhận biết đổi phiên.
- **Chưa có PASS0B**; chưa tạo các checkpoint1–7. Không dùng0A này làm bằng chứng quyền/KPI đã được sửa.

Rủi ro còn lại: policy override RBAC có thể cần review bổ sung; lịch sử stage/assignment chưa toàn vẹn; bucket UTC/retention; classification bot legacy; audit best-effort; source thay đổi chưa commit. Không có blocker cho việc lập0A; DB integration và production verification chưa nằm trong phạm vi và chưa chạy.

Bước tiếp: chạy0B của bộ prompt, đối chiếu contract và nguồn; chỉ khi0B PASS mới triển khai1A.0B có thể yêu cầu điều chỉnh quyết định thiết kế hoặc hỏi người dùng khi có mâu thuẫn policy thật sự.
