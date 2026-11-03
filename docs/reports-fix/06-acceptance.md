# Nghiệm thu tích hợp Báo cáo — bước 6A

**Trạng thái: FAIL — không đạt gate phát hành.** Lượt này chạy tại local ngày 02/11/2026, 13:47–14:29 (+07), trên HEAD `eb1be0b` và working tree đã dirty từ trước. Không sửa runtime, không commit, không deploy; giữ nguyên thay đổi có sẵn.

## Phạm vi và môi trường

- Đã qua gate 5B local lúc 13:39; checkpoint 5B là bằng chứng nền, không thay thế lượt nghiệm thu này.
- Tạo artifact riêng: [`artifacts/reports-6a-acceptance-20261102-1347/`](../../artifacts/reports-6a-acceptance-20261102-1347/). Git status đầu lượt và SHA-256 đầu lượt được lưu tại `git-status-start.txt` và `source-hashes-start.json`; bản cuối lượt ở `git-status-end.txt` và `source-hashes-end.json`.
- PostgreSQL disposable mới `reports-6a-acceptance-20261102`, database `reports_6a_verify`, host bind `127.0.0.1:55489`, data dùng tmpfs, không có host mount. Đích được xác minh rỗng trước schema/fixture; cấu hình Prisma và URL của harness chỉ rõ database này, không dùng `DATABASE_URL` mặc định, không đọc `.env`.
- Chỉ dùng app role `reports_6a_app` cho API và phép đọc RLS; role có `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, sở hữu 0 bảng. Không dùng owner để chứng minh cô lập tenant.
- Tạo schema bằng `prisma db push`; **chưa replay migration**. Không khởi động `app.ts`, queue, cron, socket, AI provider hoặc gửi message thật. Không kết nối production.
- Harness Fastify riêng chỉ đăng ký login, các route báo cáo/analytics cần thiết và static frontend; bind loopback `127.0.0.1:55490`. JWT được cấp qua `/api/v1/auth/login` bằng tài khoản giả đã bcrypt-hash.
- Đã dừng PID harness `35228`, xóa đúng container disposable trên, xác minh không còn listener `55489`/`55490`. Không tạo browser profile riêng; tab browser tích hợp không còn truy cập được khi cleanup. Browser capture chỉ được trả inline trong phiên, không có PNG được persist dưới artifact directory.

## Fixture và oracle độc lập

Fixture chỉ chứa dữ liệu giả, hai tổ chức A/B; admin, leader, deputy, member; phòng A/B và phòng con; nick main/shared/private; contact và tin nhắn giả; lịch hôm nay/ngày mai; trạng thái trong/ngoài kỳ; AI, follow-up, dry-run, audit trùng, automation, broadcast, lead-pool, engagement và saved-report. Có fixture sát 00:00/23:59 theo `Asia/Ho_Chi_Minh`. Không ghi mật khẩu hoặc JWT vào báo cáo.

Oracle được tính bằng SQL riêng, không gọi hàm tổng hợp của report implementation. Kỳ kiểm tra là `2026-11-01` VN, từ `2026-10-31T17:00:00Z` đến trước `2026-11-01T17:00:00Z`. Bảng và row counts đầy đủ ở [`fixture-manifest.json`](../../artifacts/reports-6a-acceptance-20261102-1347/fixture-manifest.json), giá trị oracle ở [`sql-oracle.json`](../../artifacts/reports-6a-acceptance-20261102-1347/sql-oracle.json).

Các expected/actual tiêu biểu từ API:

| Danh mục | Expected độc lập | Actual | Kết quả |
|---|---:|---:|---|
| Overview — toàn tổ chức: contact tổng / mới | 5 / 3 | 5 / 3 | Khớp tổng; count tổng che khuất việc chọn sai bản ghi sát biên |
| Overview — leader subtree: contact mới | 2 | 3 | **FAIL** |
| Lịch hẹn: hôm nay / hoàn thành trong kỳ; ngày mai | 1 / 1; oracle 1 | 1 / 1; API không expose/assert ngày mai | Một phần; ngày mai chưa nghiệm thu đầu-cuối |
| Pipeline: New / Won; tỉ lệ trả Lead Pool | 4 / 1; `null` | 4 / 1; `null` | Khớp; tỉ lệ tiếp tục unavailable |
| Engagement: customer-initiated / inbound / outbound | 50% / 4 / 6 | 50% / 4 / 6 | Khớp; coverage interaction/day vẫn unavailable |
| Automation: accepted / rejected / no-Zalo; follow-up / reply | 1 / 1 / 1; 2 / 1 | 1 / 1 / 1; 2 / 1 | Khớp |
| Broadcast: jobs / active / runs; sent / failed / skipped; success | 1 / 0 / 1; 3 / 1 / 2; 75% | 1 / 0 / 1; 3 / 1 / 2; 75% | Khớp |
| AI toàn tổ chức: sent / auto-reply / follow-up / unclassified | 5 / 1 / 1 / 3 | 5 / 1 / 1 / 3 | Khớp ở các assertion này; dry-run, local, deleted, out-of-period bị loại và audit trùng không cộng đôi |
| AI leader — main và shared: nháp đã tạo | 1 mỗi phần | 0 mỗi phần | **FAIL**; deputy cũng trả 0 thay vì 1 mỗi phần |
| Custom report leader — contact mới theo sale | `[1, 1]` | `[1, 2]` | **FAIL** |
| Unavailable conversion/return-rate và AI cost | `null` | `null` | Khớp; không biến unavailable thành 0 |

API runner ghi **121 assertions: 115 PASS, 6 FAIL**. Sáu sai lệch cụ thể trong [`api-acceptance.json`](../../artifacts/reports-6a-acceptance-20261102-1347/api-acceptance.json): leader new contacts; nháp AI main/shared của leader; nháp AI main/shared của deputy; custom contacts theo sale. Không nới assertion.

## Finding chặn

### F6A-1 — RLS thiếu, app role đọc được dữ liệu tổ chức khác (HIGH)

Catalog PostgreSQL ghi 122 bảng, chỉ 70 bảng có RLS và FORCE RLS. Năm bảng liên quan báo cáo/automation không có RLS, FORCE hoặc policy: `care_sessions`, `care_session_events`, `lead_pool_distributions`, `broadcast_jobs`, `broadcast_runs`. Khi đặt `app.current_org='6a-org-a'` và đọc bằng app role, số row thuộc org khác nhìn thấy lần lượt là `1`, `2`, `1`, `1`, `1`; `messages` đối chứng trả `0`. Bằng chứng: [`rls-role-catalog.json`](../../artifacts/reports-6a-acceptance-20261102-1347/rls-role-catalog.json), [`rls-missing-table-detail.json`](../../artifacts/reports-6a-acceptance-20261102-1347/rls-missing-table-detail.json), [`app-role-tenant-visibility.json`](../../artifacts/reports-6a-acceptance-20261102-1347/app-role-tenant-visibility.json).

Đây là vi phạm tenant isolation có thể làm lộ dữ liệu nếu một đường truy vấn ứng dụng bỏ điều kiện `orgId`; không dùng kết quả API hiện tại để phủ nhận lỗi RLS. Cần bổ sung và nghiệm thu FORCE RLS/policy cho mọi bảng có tenant data, rồi chạy lại kiểm tra cross-org dưới app role.

### F6A-2 — Biên ngày VN lệch khi lọc timestamp (HIGH)

Các assertion cho thấy lệch nhất quán ở metric theo `created_at`: contact trước ngày bị tính thêm vào leader subtree và custom report; nháp AI trong ngày bị loại khỏi cả main/shared của leader và deputy. Fixture lưu cột `created_at` dạng `timestamp without time zone` và ghi các mốc theo giờ VN; `resolveReportPeriod` tạo `Date` tại nửa đêm VN (UTC 17:00), trong khi SQL oracle node chạy ở `Asia/Saigon` và chuẩn hóa Date theo giờ local. Ví dụ `6a-contact-before-boundary` có giá trị DB `2026-10-31 23:59:59.999` (ngoài ngày VN 01/11), còn hai nháp AI có `2026-11-01 18:00`; API period một ngày trả sai số như trên.

Các vị trí cần remediation/đối chiếu: `backend/src/modules/dashboard/report-period.ts` (chuyển ngày VN thành `Date`), `backend/src/modules/dashboard/report-analytics-routes.ts` (lọc `createdAt`), `backend/src/modules/analytics/reports/custom-report.ts` (metric `contacts_new`), `backend/src/modules/dashboard/ai-report-service.ts` (lọc nháp), và kiểu timestamp trong schema. Đây là finding runtime; **6A chỉ ghi nhận, không sửa**.

## Quyền API, browser và coverage

- API dùng login/JWT thật. Admin gọi được 12 route đã đăng ký; leader được phép các route trong contract và bị 403 ở route admin-only; member bị chặn 12/12 report routes, custom report và saved-report run trực tiếp; cross-org saved report trả 404; `orgId` query override không mở dữ liệu org B. Deputy được xác nhận quyền riêng cho AI. Chi tiết từng assertion trong `api-acceptance.json`.
- Chromium local: Chrome `150.0.7871.250` qua Electron `43.8.3`, viewport thực `1372×1249`, DPR 1. Đã tải đủ 9 trang admin: Tổng quan, Nick, Sale & Team, Pipeline & Lead Pool, Automation, Broadcast, Engagement, Audit, AI. Leader đi được các route được cấp quyền; Audit/Broadcast/Automation bị router đưa về `/`, phù hợp API 403. Có ảnh Tổng quan leader, AI admin và Sale trong các screenshot inline của phiên; không giả định chúng là file PNG trong artifact.
- Thử đổi kỳ liên tiếp trên Chromium: native DOM activation 7 ngày → 30 ngày → 7 ngày tạo 3 GET Overview HTTP 200; kỳ cuối hiển thị đúng `2026-10-27 – 2026-11-02`. Tuy nhiên click/keyboard qua browser action tool bị timeout/không phát sinh đổi kỳ; kết quả này chỉ xác nhận handler khi kích hoạt trong page, không thay cho thao tác chuột/bàn phím vật lý.
- Sale detail mở được; kết quả đóng/focus không ổn định trong automation: có lần dialog còn mở và focus BODY sau 1,5 giây, sau chuỗi thao tác khác dialog đóng và focus quay về nút kích hoạt. **Không kết luận đây là finding runtime xác nhận**; cần 6B tái chạy bằng thao tác browser ổn định.
- Không chủ động làm hỏng API/network để ép error/retry; race/error/retry/stale không được xác minh đủ trong browser ở lượt 6A. Export Excel trên Overview/Sale đang disabled; không có export thực để nghiệm thu. Saved-report checks giới hạn ở cùng-org read, cross-org 404 và member run bị từ chối; chưa nghiệm thu đầy đủ saved-report execution cho admin/leader.
- Notification `/notifications`, privacy `/privacy/status` và action-hub trả 404 vì harness không nạp module đó; đây là **giới hạn harness**, không giả 200 và không kết luận lỗi production.
- Không nghiệm thu Safari/iPhone/PWA/VoiceOver thật, replay migration, tải/query plan đại diện hoặc quyền chuyên biệt/self-report chưa rollout. Tỉ lệ trả Lead Pool vẫn `null`; Engagement daily coverage chưa được chứng minh đầy đủ.

## Lệnh và kết quả

- `backend`: targeted report/scope/AI/custom suite — **10 files, 62 tests PASS**; `npm run build` (`tsc`) — **PASS**.
- `frontend`: `npm test` — **18 files, 145 tests PASS**; `npm run build` (`vue-tsc -b && vite build`) — **PASS**.
- Disposable DB: xác minh empty → Prisma `db push` → apply RLS SQL hiện hành → tạo app role → seed fixture → SQL oracle → API/JWT role matrix. Mọi lệnh ghi DB chỉ chạy trên container/database đã xác minh; lần fixture lỗi đều rollback và ghi attempt riêng.
- API timing: **58 HTTP requests**, mean `39.71 ms`, max `354.1 ms` (bao gồm 6 bcrypt logins). PostgreSQL logging thu **6,538 duration records**, mean `0.155 ms`, max `15.938 ms` cho toàn phiên DB; gồm setup, fixture và kiểm tra, không phải query count/timing theo route. `pg_stat_statements` không khả dụng, không đo SLA production.
- Log tests/build/API nằm trong thư mục artifact theo lượt. Lỗi notification/privacy ở browser được giữ đúng là harness 404.

## Release gate, source integrity và cleanup

**Không phát hành.** Điều kiện tối thiểu trước nghiệm thu lại: (1) FORCE RLS/policy tenant cho đủ bảng và kiểm thử bằng app role; (2) sửa biên ngày VN và thêm regression record-level cho `created_at`/AI drafts/custom reports; (3) chạy lại API/browser cho toàn bộ 9 danh mục, error/retry/stale, drill-down/focus và export/saved-report trong scope; (4) independent review 6B chỉ sau khi 6A đạt.

SHA-256 đầu/cuối của `frontend/src`, `backend/src`, `backend/tests` được lưu riêng; so sánh phải khớp vì lượt này không sửa runtime. Helper `6a-*` và fixture chỉ phục vụ nghiệm thu; không tạo production data. Cleanup đã dừng process/container riêng và giải phóng hai port. **6A = FAIL; 6B = NOT_STARTED; 7A/7B = NOT_STARTED; chưa commit/deploy.**


<a id="rerun-20261102-1513"></a>

## Chạy lại 6A sau remediation — 02/11/2026 15:00–15:13 (+07)

**Trạng thái: COMPLETED_PENDING_VERIFICATION.** Mọi tiêu chí bắt buộc đã chạy và đạt; không có lỗi runtime chặn. Đây là lượt A (tự nghiệm thu), chưa phải 6B. Không sửa runtime, không commit/deploy. 7A/7B NOT_STARTED.

### Phạm vi và môi trường

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, working tree dirty có sẵn (786 dòng `git status -uall`), giữ nguyên. Đối tượng là patch remediation 14:57 ([06-remediation](06-remediation.md)); `tenant-rls.sql` SHA `a904fdff…` khớp postimage của remediation.
- Trước khi chạy đã kiểm tra lượt khác: không có harness/Chrome, không có listener ở dải port kiểm tra. Artifact riêng: [artifacts/reports-6a-rerun-20261102-1500](../../artifacts/reports-6a-rerun-20261102-1500/). Thư mục ban đầu đặt tên `…-1503` được đổi ngay thành `…-1500` trước khi ghi dữ liệu kiểm tra.
- DB: container mới `reports-6a-rerun-20261102` (`ad8c5dc5…`, postgres:15-alpine, tmpfs, 127.0.0.1:55498, không mount, TimeZone UTC). Đã xác minh `reports_6a3_verify|postgres|0 bảng|0 role` trước khi ghi. Prisma db push (không replay migration), áp `tenant-rls.sql` hiện hành (75/122 bảng ENABLE+FORCE).
- App role `reports_6a3_app`: NOSUPERUSER/NOBYPASSRLS, sở hữu 0 bảng; bật log statement để đếm query.
- Harness `6a3-server.ts` ở 127.0.0.1:55499: route auth/report/analytics/saved-report thật; `RLS_SET_CONFIG=true`, `TENANT_GUARD_MODE=enforce`; phục vụ `frontend/dist` vừa build. Có hook lỗi/độ trễ điều khiển bằng file `scenario.json` (không có endpoint điều khiển qua mạng) và access log. Không app bootstrap/queue/cron/socket/provider/AI/gửi tin.
- Helper mới (chỉ để kiểm chứng):
  - `6a3-{fixture,oracle,api-acceptance,server}.ts`: sao từ `6a2-*` (fixture/oracle UTC), đổi DB/port/role.
  - Bổ sung vào `6a3-api-acceptance.ts`: chạy saved report và kiểm tra lịch ngày mai.
  - `6a3-route-metrics.ts`, `6a3-rls-check.ts`, `6a3-app-role.sql`, `6a3-disposable-prisma.config.ts`.
  - Script browser `browser/e2e.mjs`, `browser/e2e-race.mjs`, CDP client `browser/cdp.mjs`.

### Fixture và oracle

- Cùng fixture giả 6A: 2 org; phòng A/B và phòng con; admin/leader/deputy/member; nick main/shared/private; dữ liệu sát 00:00/23:59 VN; lịch hôm nay/ngày mai; chốt trong/ngoài kỳ; tin người/AI/followup/dry-run/audit trùng; Automation/Broadcast/Lead Pool/Engagement; saved report. Tài khoản `6a-*@example.invalid`, mật khẩu chỉ có trong fixture, không ghi vào báo cáo.
- Chạy `TZ=UTC` với `parseInputDatesAsUTC`. Tự kiểm (`utc-self-check.txt`): `contact-before-boundary` = `2026-10-31 16:59:59.999`, nháp AI = `2026-11-01 11:00:00`, lịch hôm nay/ngày mai = `2026-11-02 02:00` / `2026-11-03 02:00`, tức 09:00 giờ VN.
- Oracle SQL độc lập (`sql-oracle.json`): kỳ `2026-11-01` VN, tức từ `2026-10-31T17:00Z` tới trước `2026-11-01T17:00Z`; contacts org 5/3, team 3/2; lịch today 1 / completed_period 1 / tomorrow 1.

### API/JWT — 129/129 PASS

121 assertion của lượt cũ cộng 8 assertion mới, đăng nhập thật qua `/api/v1/auth/login` (`api-acceptance.json`). Kết quả lượt cũ: 115/121.

| Nhóm | Expected (oracle) | Actual | Kết quả |
|---|---|---|---|
| Overview org: contact tổng / mới; lịch hôm nay / hoàn thành; Lead Pool chờ | 5 / 3; 1 / 1; 1 | 5 / 3; 1 / 1; 1 | PASS |
| **Leader overview contact mới (từng FAIL)** | 2 | 2 | **PASS** |
| Pipeline New / Won; tỉ lệ đo được nhưng thiếu nguồn | 4 / 1; `null` | 4 / 1; `null` | PASS |
| Engagement: customer-initiated / inbound / outbound; coverage | 50% / 4 / 6; unavailable | khớp | PASS |
| Automation (đồng ý / từ chối / không Zalo; bám đuổi / phản hồi) và Broadcast (job / active / run; sent / failed / skipped; 75%) | như lượt cũ | khớp | PASS |
| AI admin: sent / auto / followup / unclassified; audit trùng không cộng đôi; dry-run/local/deleted/ngoài kỳ bị loại; chỉ số thiếu nguồn = `null` | 5/1/1/3 | khớp | PASS |
| **AI leader main / shared, deputy main / shared: nháp cần duyệt (4 ca từng FAIL)** | 1 mỗi phần | 1 mỗi phần | **PASS** |
| **Custom report leader theo sale (từng FAIL)** | `[1,1]` | `[1,1]` | **PASS** |
| Quyền: leader 200/403 theo contract (automation/automation-summary/broadcast/audit = 403); member 403 ở cả 12 route, custom report và saved-report run; tham số `orgId` ghi đè bị bỏ qua; admin org B chỉ thấy org B | — | khớp | PASS |
| **Mới:** admin chạy saved report cùng org; tổng = contact mới org | 200; 3 | 200; 3 | PASS |
| **Mới:** leader chạy saved report do người trong subtree tạo; tổng giới hạn subtree | 200; 2 | 200; 2 | PASS |
| **Mới:** leader và admin A chạy saved report của org B | 404 / 404 | 404 / 404 | PASS |
| **Mới:** lịch ngày mai: oracle có 1 lịch ngày mai; Overview kỳ hôm nay chỉ đếm lịch hôm nay | 1; `apptToday` 1 | 1; 1 | PASS. API không expose số lịch ngày mai; kiểm tra bằng việc lịch ngày mai không lọt vào hôm nay |
| Kỳ đảo ngược → 400 `invalid_report_date_range`; audit tương lai bị loại theo as-of | — | khớp | PASS |

Export: nút "Xuất Excel" trên Overview/Sale đang disabled (thấy trong ảnh), **ngoài phạm vi**, không nghiệm thu.

### RLS (`rls-matrix-rerun.json`, `rls-tenant-catalog.json`, `rls-runtime-prisma.json`)

- Catalog: 122 bảng, 75 bảng ENABLE+FORCE. Còn **28 bảng có `org_id` chưa có policy** và 19 bảng không có `org_id` chưa có policy; danh sách trong JSON, khớp inventory ở 06-remediation.
- Ma trận bằng app role: **45/45 PASS**.
  - 5 bảng mới: đúng org thấy 1, org khác 0, không set tenant 0, bypass thấy đủ, UPDATE org khác ảnh hưởng 0, INSERT org khác bị 42501, INSERT row của mình thành công.
  - Đối chứng `messages`, `contacts` trên dữ liệu fixture 6A: org A thấy 12/5 row của mình, row org B 0, không tenant 0, UPDATE org B 0, INSERT org B bị từ chối.
- Runtime qua Prisma thật: **11/13**. Hai ca lệch là `runSystemQuery … findMany` kỳ vọng 2 nhưng thực tế 4. Đây là expected viết cho DB của lượt remediation (chỉ có 2 row tổng hợp); DB này có thêm row fixture 6A. Owner xác nhận tổng đúng 4 row (`rls-runtime-owner-totals.txt`): bypass trả đủ toàn bộ, đúng hành vi. **Không phải lỗi runtime**, không sửa assertion trong lượt này. 11 ca còn lại (withTenant, chặn cross-org, ngoài context = 0, batch transaction kiểu broadcast-cron) đều đạt.

### Browser E2E — Chrome 156 headless, `--force-device-scale-factor=1.25`, viewport 1440 CSS, DPR 1,25

Profile tạm trong scratchpad, điều khiển bằng sự kiện chuột/bàn phím CDP tại tâm phần tử. JS trong trang chỉ để đọc trạng thái, không gọi handler, không override `innerWidth`. Ảnh PNG thật trong `browser-captures/`.

| Ca | Kết quả |
|---|---|
| Admin 9 danh mục | Cả 9 route mở, mọi request report 200, không alert lỗi; 8 trang có khối context kỳ (AI hiển thị kỳ/phạm vi trên dòng riêng). Có 9 ảnh `admin-*-1440.png` |
| Nhãn kỳ khớp request | Chọn 7 ngày: context `2026-10-27 – 2026-11-02` khớp `from/to` của request 200 cuối |
| Response cũ về muộn | `e2e-race.json`, 2/2 lần: chọn 7 ngày → 30 ngày (request trễ 2500ms) → Hôm nay. Response Hôm nay về trước, 30 ngày về sau; UI vẫn chọn Hôm nay, context `2026-11-02 – 2026-11-02`, 8 KPI. Lần thử đầu trong `e2e.mjs` sai điều kiện (kỳ 30 ngày đã được chọn sẵn nên độ trễ rơi vào request Hôm nay); giữ log, không tính |
| Loading | Trong lúc chờ: KPI 0, có trạng thái loading, ẩn context; sau đó 8 KPI và context (`overview-loading.png`) |
| Error/retry | 503 có kiểm soát → alert "Không tải được dữ liệu báo cáo…", KPI 0, ẩn context; click chuột "Thử lại" → 200, 8 KPI, context trở lại (`overview-error.png`) |
| 0/null/unavailable | Overview 14, AI 6, Pipeline 9 chỗ "Chưa có dữ liệu"/"chưa đủ nguồn" cho chỉ số `null`; không đổi thành 0 |
| Drill-down Sale ×3 | Mở bằng chuột; lần nào cũng có dialog và focus `Đóng chi tiết`. Đóng bằng Escape / Shift+Tab tới `Quay lại báo cáo` + Enter / click chuột `Đóng`: cả 3 lần overlay 0 và focus trở về đúng nút mở (`stable: true`) |
| Leader / deputy | Menu Báo cáo: 6 danh mục + Phân tích nâng cao; Automation/Broadcast/Audit → `/`; AI và Sale vào được (`leader-ai-1440.png`, `deputy-ai-1440.png`) |
| Member | Không có nút Báo cáo; mọi `/reports/*` → `/` (`member-redirect.png`) |

### Hiệu năng theo route (`route-metrics.json`)

- Đo sau khi setup/fixture xong. Mỗi route gọi riêng 3 lần, kỳ `2026-11-01`, có khoảng nghỉ giữa các lần.
- `q` = số câu `execute` của app role trong cửa sổ request, gồm cả lookup của auth middleware, không tính `set_config`. Thời gian HTTP và DB lấy trung vị.

| Route | Admin q / HTTP / DB | Leader q / HTTP / DB |
|---|---|---|
| overview | 21 / 59,7ms / 0,96ms | 25 / 67,7ms / 1,13ms |
| nick-fleet | 6 / 14,3 / 0,13 | 10 / 26,2 / 0,32 |
| sales-performance | 14 / 31,0 / 0,58 | 18 / 39,1 / 0,76 |
| crm-usage | 14 / 34,7 / 0,52 | 18 / 53,3 / 0,69 |
| pipeline | 8 / 22,4 / 0,27 | 12 / 35,9 / 0,46 |
| lead-pool | 13 / 24,2 / 0,40 | 17 / 36,6 / 0,56 |
| automation-summary | 6 / 22,4 / 0,27 | 403, 0 query |
| broadcast | 4 / 16,4 / 0,15 | 403, 0 query |
| engagement | 15 / 45,1 / 0,47 | 19 / 56,4 / 0,76 |
| audit | 12 / 26,9 / 0,38 | 403 sau 8 query |
| ai | 6 / 15,0 / 0,43 | 10 / 26,6 / 0,56 |

Mỗi query khi bật `RLS_SET_CONFIG` kèm 1 `set_config` và cặp BEGIN/COMMIT (ví dụ Overview admin: 15 `set_config`, 30 BEGIN/COMMIT). Câu đơn chậm nhất 0,305ms. Ghi nhận phụ, không chặn: leader gọi `audit` chạy 8 query rồi mới trả 403, tức gate quyền nằm sau bước resolve scope. Số liệu chỉ trên dữ liệu test nhỏ, **không phải SLA production**.

### Regression và build

| Lệnh | Kết quả |
|---|---|
| `frontend`: `npm.cmd run build` (`vue-tsc -b && vite build`) | PASS (còn cảnh báo chunk >500kB) |
| `frontend`: `vitest run` toàn bộ | **18 file, 145/145 PASS** |
| `backend`: 16 file report/scope/AI/custom/tenant/characterization bằng app role trên DB disposable | **16 file, 101/101 PASS** |
| `backend`: `tests/security/refresh-token-service.test.ts` (integration, owner role) trên DB disposable | **10/10 PASS** |
| `backend`: `npm.cmd run build` (`tsc`) | PASS |

### Giới hạn harness và phạm vi chưa chạy

- 404 do harness không đăng ký module: notifications (54), privacy/status (44), action-hub (49), public/org-branding (64). Đây là **giới hạn harness**, không giả 200, không kết luận lỗi production. 404 của saved report org B là kết quả mong đợi.
- Chưa chạy: replay migration; apply RLS trên staging/production; Safari/iPhone/PWA/VoiceOver thật; tải/query plan đại diện; quyền chuyên biệt/self-report (chưa rollout); export (disabled).
- Tỉ lệ trả Lead Pool vẫn `null`; coverage Engagement theo ngày vẫn unavailable.

### Lỗi còn tồn tại (không chặn gate 6A)

| Mức | Nội dung | Đề xuất |
|---|---|---|
| MEDIUM | 28 bảng có `org_id` chưa có policy RLS (ví dụ `broadcast_run_items`, `target_jobs`, `target_run_items`, nhóm channel); 5 bảng vừa thêm chưa nằm trong `ORG_SCOPED_MODELS` | Remediation RLS đợt 2 + bổ sung tenant-guard, trước khi apply RLS production |
| LOW | Leader gọi route admin-only chạy query trước khi bị 403 | Có thể đưa gate lên trước, không gấp |
| LOW (helper) | Expected của `runSystemQuery` trong `6a3-rls-check.ts` giả định DB chỉ có row tổng hợp | Sửa helper ở lượt sau để expected lấy theo tổng của owner |

### Tiêu chí release

Chưa phát hành. Cần: 6B độc lập PASS trên đúng patch này; quyết định có làm remediation RLS đợt 2 trước release hay không; kế hoạch apply RLS staging → production (TENANT_GUARD_MODE=warn, app role không owner); sau đó 7A/7B.

### Source integrity và cleanup

- **971/971 file** `frontend/src`, `backend/src`, `backend/tests`, `backend/prisma` giữ nguyên SHA256 từ đầu đến cuối (`source-integrity.json`). Diff git status chỉ thêm artifact và helper `6a3-*` của lượt này.
- Cleanup 15:12: dừng harness PID40700; dừng 8 process Chrome và xóa profile tạm; xóa container `reports-6a-rerun-20261102`; listener 55498/55499/9334 = 0; reset `scenario.json`; xóa token fixture khỏi storage. Không đụng `reports-1b-verify-20261101` (đã exited) hay `sketchup-api-1`.

**Bước tiếp: 6B** (kiểm tra độc lập). 7A/7B NOT_STARTED.
