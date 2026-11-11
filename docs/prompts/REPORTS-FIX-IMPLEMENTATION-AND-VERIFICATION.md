# Bộ prompt triển khai và kiểm tra lỗi Báo cáo

Ngày soạn: 29/10/2026. Workspace: `F:\ZaloCRM-CorepViet`.

Đây là prompt để sử dụng trong các lượt triển khai sau, không phải bằng chứng đã sửa lỗi. Việc soạn file này không khởi chạy các bước, bật AI hoặc deploy.

## Cách sử dụng

1. Chạy prompt **A — Triển khai** của từng bước, sau đó chạy prompt **B — Kiểm tra** tương ứng. Có thể dùng chat hiện tại hoặc chat mới trỏ cùng workspace. Khi dùng chat mới, gửi nguyên prompt; mỗi prompt yêu cầu đọc quy tắc chung trong file này.
2. Thứ tự: **0A → 0B → 1A → 1B → 2A → 2B → 3A → 3B → 4A → 4B → 5A → 5B → 6A → 6B → 7A → 7B**.
3. Bước0–3 xử lý lỗi nền. Bước4 bổ sung báo cáo AI. Bước5 áp giao diện mobile. Bước6 nghiệm thu tích hợp. Bước7 chuẩn bị phát hành, chưa triển khai production.
4. B chưa PASS thì dùng prompt **Sửa sau kiểm tra** ở cuối file, rồi chạy lại B. Không sửa test để làm biến mất lỗi hoặc đổi tiêu chí cho khớp implementation.
5. Bước sau chỉ bắt đầu khi có checkpoint PASS của bước trước. Nếu BLOCKED, làm phần độc lập có ích và báo đúng điều kiện còn thiếu; không coi thiếu môi trường/không chạy được test là PASS.

## Quy tắc chung bắt buộc cho mọi prompt

- Đọc AGENTS.md áp dụng trong workspace và các skill liên quan; kiểm tra lại source hiện tại. Nội dung audit là bằng chứng cần đối chiếu, không phải chân lý bất biến. Tuân thủ thứ bậc chỉ dẫn của phiên làm việc.
- Đọc `docs/mobile-upgrade/11_REPORTS_SOURCE_REVIEW.md` và `12_REPORTS_FOUR_POINT_VERIFICATION.md`. Đọc checkpoint bước trước trong `docs/reports-fix/`. Không tuyên bố một bước đã xong chỉ vì file kế hoạch tồn tại.
- Kiểm tra git status trước khi sửa. Workspace có thay đổi AI/TikTok và tài liệu từ trước: không reset, stash, ghi đè, xóa hay đưa các thay đổi không thuộc bước vào patch. Không tự commit/push/merge. Không tự tạo worktree mới hoặc giao việc cho agent khác nếu chưa có yêu cầu áp dụng.
- Giữ Fastify + Prisma/PostgreSQL và Vue/Vuetify. Không thay framework, cài thêm thư viện hoặc tái cấu trúc ngoài phạm vi nếu không chứng minh cần thiết. Dùng dependency hiện có trước.
- Không mở/ghi bí mật, token, .env vào báo cáo; không kết nối production, chạy migration production, bật/tắt AI thật, gửi tin Zalo/Telegram, gọi AI trả phí hay triển khai. Dữ liệu test phải giả; tắt/mô phỏng queue, cron, socket, provider và các đường gửi có tác dụng phụ.
- Trước test DB, xác minh đích là database local/test chuyên biệt, dùng dữ liệu giả; không lấy mặc định DATABASE_URL hiện có làm bằng chứng an toàn. Nếu không xác minh được thì không chạy truy vấn ghi và báo BLOCKED cho phần phụ thuộc DB.
- Các phép tổng hợp phải áp orgId và phạm vi phòng/user/contact/nick theo policy. Không để filter từ client nới rộng scope. Không coi ẩn menu là biện pháp phân quyền backend.
- Phân biệt không có dữ liệu (`null`/unavailable), đã đo bằng0, request lỗi và dữ liệu cũ. Không hard-code số đẹp hoặc giả thành số thật.
- Chỉ chạy các kiểm tra có ý nghĩa với thay đổi; ghi lệnh, số test và kết quả thực tế. Mock test không thay thế integration/RLS/browser test. Không sửa artifact bằng chứng để che lỗi.
- File `backend/tests/unit/reports-review-evidence.test.ts` là characterization test tái hiện lỗi cũ. Khi sửa, chuyển các ca tương ứng sang khẳng định hành vi đúng và thêm dữ liệu đối chứng; không giữ mong đợi có lỗi như tiêu chí nghiệm thu. Bảo tồn kết quả tái hiện cũ trong tài liệu.
- Kết thúc mỗi lượt: nêu file thay đổi, hành vi trước/sau, lệnh test, giới hạn và trạng thái PASS/FAIL/BLOCKED. Báo cáo kiểm tra phải có đường dẫn + dòng code đã xác minh ở phiên hiện tại.

## Quy ước checkpoint

Tạo `docs/reports-fix/README.md` làm chỉ mục và `00-contract.md`, `01-scope.md`, `02-periods.md`, `03-kpis.md`, `04-ai-report.md`, `05-mobile.md`, `06-acceptance.md`, `07-release.md` khi đến bước tương ứng. B lưu kết quả vào file cùng tên thêm hậu tố `-verification.md`.

Mỗi checkpoint gồm: ngày/giờ; trạng thái; phạm vi patch và git revision nếu có; file/test mới; dữ liệu fixture; lệnh/kết quả; tiêu chí đạt/chưa đạt; rủi ro; bước kế tiếp. Khi chưa commit, ghi rõ phạm vi working-tree đang kiểm tra, không giả có commit hash mới. Không coi kết quả B cũ còn hiệu lực nếu patch liên quan đã thay đổi.

---

## Bước 0 — Chốt contract, dữ liệu và baseline

### 0A — Prompt triển khai

```text
Hãy thực hiện bước 0 cho module Báo cáo ở F:\ZaloCRM-CorepViet.
Trước tiên đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và hai audit được tham chiếu.

Chưa sửa logic runtime. Kiểm tra lại router/menu, 8 report view, reports-co-ban, analytics/saved-reports, route registration, report-analytics-routes, report-routes, automation-summary, broadcast và ai/usage.

Lập contract ở docs/reports-fix/00-contract.md:
1. Bản đồ view → endpoint → service → bảng/nguồn ghi dữ liệu. Ghi rõ filter nào backend thật sự hỗ trợ.
2. Ma trận quyền owner/admin, trưởng/phó phòng, leader chỉ có bản thân, member; phạm vi phòng con, contact được chia sẻ, nick riêng tư và tổ chức khác. Đối chiếu policy hiện có; chỉ hỏi người dùng khi có xung đột nghiệp vụ thật sự không thể giải quyết từ source. Không suy quyền xem tổ chức từ quyền xem contact.
3. Định nghĩa mỗi KPI ưu tiên: đơn vị, nguồn, snapshot/cohort/event, khoảng thời gian, cách gán nhân viên, mẫu số, null/0 và loại dry-run/deleted/merged.
4. Chọn ngày báo cáo Asia/Ho_Chi_Minh. Chỉ rõ “hôm nay”, 7/30 ngày, khoảng tùy chọn và so sánh kỳ trước.
5. Inventory TODO/giá trị cố định: chỉ số có writer thật, nguồn ngừng ghi, nguồn thiếu. Không mặc định tái sử dụng DailyMessageStat.
6. Kế hoạch fixture và baseline test có thể chạy an toàn. Ghi lại characterization test cũ mà không coi pass của nó là đã sửa.

Tạo docs/reports-fix/README.md theo dõi 0–7, để mọi bước chưa thực hiện ở NOT_STARTED. Phân biệt quyết định đã có bằng chứng với đề xuất cần chốt. Chạy baseline liên quan, báo đúng lỗi có từ trước. Không triển khai bước1 trong lượt này.
```

### 0B — Prompt kiểm tra

```text
Kiểm tra độc lập bước0 của module Báo cáo trong F:\ZaloCRM-CorepViet. Đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Không chỉ tin checkpoint triển khai.

Đối chiếu 00-contract.md với source: đủ 8 view và các đường analytics/cơ bản/saved-report chưa; đúng endpoint automation-summary chưa; ma trận quyền có phản ánh backend và menu khác nhau không; snapshot và dữ liệu trong kỳ có được phân biệt không; null khác0 và khung ngày VN đã rõ chưa.

Kiểm tra nguồn ghi dữ liệu còn hoạt động bằng đường gọi code, không chỉ tên model/comment. Xem git diff để chắc chưa sửa runtime ngoài scope. Xác minh baseline test và phân biệt test tái hiện lỗi với test khẳng định đã sửa.

Ghi docs/reports-fix/00-contract-verification.md với PASS/FAIL/BLOCKED và bằng chứng cụ thể. Chỉ PASS nếu contract đủ rõ cho bước1–4; quyết định quyền/công thức còn mâu thuẫn thì BLOCKED ở phần đó. Lượt này chỉ kiểm tra, không tự sửa implementation.
```

## Bước 1 — Sửa phạm vi quyền báo cáo

### 1A — Prompt triển khai

```text
Triển khai bước1 ở F:\ZaloCRM-CorepViet sau khi bước0 đã PASS. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và contract đã được kiểm tra.

Sửa lỗi report gate cho trưởng nhóm qua nhưng query lấy toàn org. Tạo/tái sử dụng abstraction report scope có kiểu rõ ràng: org, người dùng/phòng được phép, contact và nick nếu metric cần. Truyền scope vào count/findMany/groupBy/raw SQL và service, không chỉ chặn ở menu.

Rà toàn bộ report-analytics-routes, report-routes/export, analytics/custom/saved report run và đường report liên quan. Áp policy đã chốt cho leader/deputy/member. Với automation-summary/broadcast admin-only hiện tại, giữ policy trừ khi contract có quyết định thay đổi rõ ràng. Không mở rộng quyền như tác dụng phụ.

Filter userId/departmentId/accountId từ request phải nằm trong scope; giá trị ngoài scope phải bị từ chối hoặc giao cắt an toàn theo contract. SQL phải parameterized; không serialize filter thẳng vào câu SQL. Xử lý scope rỗng theo fail-closed.

Test có hai org, hai phòng, phòng con, leader một mình, deputy, member, contact collaborator và user không có quyền. Bắt buộc kiểm tra hàng chi tiết, tổng KPI, leaderboard, export và saved report; tổng hợp cũng không được rò ngoài scope. Chuyển test tái hiện scope cũ thành regression mong đợi không có sale ngoài nhóm.

Ghi docs/reports-fix/01-scope.md, chỉ ra endpoint nào đã sửa/giữ nguyên và lý do. Chạy test liên quan và kiểm tra kiểu phù hợp, không deploy. Không sửa công thức thời gian ở bước này nếu không bắt buộc cho scope.
```

### 1B — Prompt kiểm tra

```text
Kiểm tra độc lập bước1 ở F:\ZaloCRM-CorepViet; đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và contract bước0. Không tự sửa.

Lần theo request thật đến query/service, bao gồm auth gate, orgId, report scope và filter client. Tìm mọi query/aggregate/raw SQL không nhận scope, kể cả export, custom report và chạy saved report. Kiểm tra query dùng nick owner khác assignedUser/contact collaborator có đúng contract không.

Tự chạy test đối chứng hai phòng và hai org: leader không thấy sale ngoài subtree trong response lẫn KPI; không dùng filter client để nới quyền; admin xem đúng toàn org; member và leader một mình xử lý đúng policy. Phân biệt route-handler mock, Fastify inject và DB/RLS. Nếu integration thiếu môi trường, báo rõ chưa xác minh thay vì tuyên bố end-to-end PASS.

Kiểm tra patch không vô tình đổi policy admin-only hoặc làm mất tính năng hợp lệ. Ghi docs/reports-fix/01-scope-verification.md: phát hiện theo mức độ, file:dòng, lệnh/kết quả và PASS/FAIL/BLOCKED. Không PASS nếu còn đường aggregate/export được phép nhưng thiếu scope.
```

## Bước 2 — Sửa ngày Việt Nam và định nghĩa kỳ

### 2A — Prompt triển khai

```text
Triển khai bước2 trong F:\ZaloCRM-CorepViet khi bước1 PASS. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và contract KPI.

Chuẩn hoá helper báo cáo theo Asia/Ho_Chi_Minh với khoảng nửa mở [start,end). Validate YYYY-MM-DD thật, from<=to và giới hạn kỳ theo contract. Không phụ thuộc timezone máy chạy. Phân biệt cột timestamp với cột SQL DATE, tránh dịch ngày hai lần.

Áp dụng cho report/analytics/automation-summary/broadcast và export tương ứng; frontend gửi cùng contract. “Hôm nay” phải có cả đầu và cuối ngày, không tính lịch tương lai. 7/30 ngày đúng số ngày; kỳ trước dài bằng kỳ hiện tại và không chồng lấn. Chuỗi biểu đồ bám kỳ đã chọn, ngày không phát sinh được điền0 chỉ khi nguồn đo hợp lệ.

Sửa nhãn/query theo định nghĩa đã chốt: snapshot hiện tại, cohort khách tạo trong kỳ, hoặc sự kiện chuyển trạng thái trong kỳ. Nếu không có lịch sử đủ để tính số chốt theo sự kiện, trả unavailable và ghi lý do; không lấy createdAt thay cho thời điểm chốt. Không tự tạo dữ liệu lịch sử giả.

Test mốc 23:59:59/00:00 VN, đổi tháng/năm, năm nhuận, ngày sai, khoảng đảo, lịch tương lai, chốt ngoài kỳ, kỳ trước và môi trường server UTC khác VN. Chuyển hai test tái hiện ngày cũ sang regression hành vi đúng.

Ghi docs/reports-fix/02-periods.md về công thức cũ/mới, thay đổi API/UI tương thích và nguồn lịch sử. Chạy test liên quan; không tự migration/backfill dữ liệu thật.
```

### 2B — Prompt kiểm tra

```text
Kiểm tra độc lập bước2 trong F:\ZaloCRM-CorepViet. Đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Không tự sửa.

Kiểm tra ngày01/10/2026 VN phải tương ứng 30/09 17:00Z đến01/10 17:00Z. Tin sát trước/sau biên phải vào đúng một ngày, không mất/đếm trùng. Kiểm tra DATE và timestamp riêng; chạy cùng fixture ở ít nhất timezone UTC và Asia/Ho_Chi_Minh nếu test runner hỗ trợ.

Kiểm tra lịch ngày mai không vào “hôm nay”; 7/30 ngày và kỳ trước đúng; filter engagement và biểu đồ thực sự đi tới backend; from/to sai bị400 trước query. Đối chiếu khách tạo kỳ trước nhưng chốt kỳ này và ngược lại để xác minh không trộn cohort/event/snapshot.

Đọc query thật và chạy test liên quan, không chỉ test helper độc lập. Ghi docs/reports-fix/02-periods-verification.md với ví dụ đầu vào/kết quả mong đợi/thực tế và PASS/FAIL/BLOCKED. Lưu ý kết quả scope bước1 phải còn đúng sau patch ngày.
```

## Bước 3 — KPI thật, dữ liệu thiếu và lỗi tải

### 3A — Prompt triển khai

```text
Triển khai bước3 trong F:\ZaloCRM-CorepViet sau khi bước2 PASS. Đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và inventory KPI bước0.

Thay KPI0/TODO bằng số đo từ nguồn có writer đang hoạt động. Ưu tiên Overview: tin gửi/nhận theo kỳ, tổng tin/ngày, lịch hẹn, tỷ lệ chốt đúng định nghĩa; sau đó Sales/Nick/Pipeline/Audit theo inventory. Không coi mọi bot là AI và không dùng quota giả.

Metric không đủ nguồn trả null và trạng thái/reason theo contract; frontend hiển thị “Chưa có dữ liệu”, không chuyển null thành0 bằng Number()/??0 hoặc biểu đồ rỗng như kết quả đo. Đã đo được0 vẫn phải hiển thị0. Tránh breaking API bằng kiểu TypeScript/contract và cập nhật tất cả consumer liên quan.

Đối soát tổng với detail/nhóm/phòng, loại merged/deleted/dry-run theo contract. Gán tin cho người thật theo nguồn đã định nghĩa, không tự quy mọi tin cho chủ nick. Tránh N+1 theo số sale/ngày; group query theo batch và kiểm tra index hiện hữu trước đề xuất index mới. Không tự thêm migration nếu chưa chứng minh cần.

Sửa trạng thái tải: loading/error/empty/unavailable rõ; đổi kỳ nhanh không để response cũ ghi đè; lỗi kỳ mới không hiển thị dữ liệu kỳ cũ như kỳ mới. Giữ dữ liệu cũ chỉ khi có nhãn kỳ cũ rõ ràng.

Dùng fixture có người/bot, nhiều nick/sale, dữ liệu0, thiếu writer, lỗi request và response đảo thứ tự. Chuyển test KPI placeholder cũ thành regression khẳng định số thật hoặc unavailable đúng nguồn.

Ghi docs/reports-fix/03-kpis.md kèm bảng từng KPI, query nguồn, công thức, trạng thái đã hoàn thiện/còn unavailable. Chạy unit/integration phù hợp và frontend type/build theo dự án; không gọi hệ thống thật.
```

### 3B — Prompt kiểm tra

```text
Kiểm tra độc lập bước3 trong F:\ZaloCRM-CorepViet, đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Không tự sửa.

Tìm lại placeholder/TODO trong endpoint và consumer báo cáo; mỗi trường còn placeholder phải unavailable hoặc được giải thích, không đánh tráo thành0. Đối chiếu fixture độc lập bằng đếm tay/truy vấn đối chứng, không chỉ tính mong đợi bằng cùng helper implementation.

Kiểm tra tổng tin=tổng các nhóm theo contract, scope/ngày của bước1–2 còn đúng, phân biệt người/bot/AI, contact merge/deleted và dữ liệu0. Tìm N+1, vòng lặp query và aggregation không giới hạn. Không khẳng định hiệu năng production từ fixture nhỏ.

Trong trình duyệt local dùng dữ liệu giả, kiểm tra đổi kỳ nhanh, API lỗi, dữ liệu thiếu, kết quả rỗng và retry. Xác minh không có request gửi tin/AI trả phí. Chạy kiểm tra kiểu/build/test liên quan; phân biệt lỗi có trước.

Ghi docs/reports-fix/03-kpis-verification.md gồm danh sách KPI đã đối soát, nguồn chưa có, bằng chứng UI và PASS/FAIL/BLOCKED. Không PASS nếu0 giả vẫn xuất hiện như dữ liệu đo hoặc kỳ hiển thị khác kỳ response.
```

## Bước 4 — Báo cáo AI dựa trên nguồn đã có

### 4A — Prompt triển khai

```text
Triển khai bước4 trong F:\ZaloCRM-CorepViet sau khi bước3 PASS. Đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và phần AI trong audit12.

Xác minh lại Message.sentVia='ai_auto', metadata.aiAuto/dryRun, ActivityLog ai_auto_reply_sent/ai_followup_sent, AiSuggestion và AiSuggestionApplied. Tránh nhầm applied CRM fields với duyệt gửi tin, đếm suggestion với model call hoặc tin đã gửi.

Xây report AI cùng kiến trúc report hiện tại: service/query có scope, API validation, typed response và tab/route UI theo quyền. Reuse helper kỳ VN. Cung cấp KPI có thể chứng minh: tin AI ghi nhận đã gửi, số hội thoại tương ứng, phân biệt auto reply/followup khi nguồn cho phép, bản nháp cần duyệt đúng nghĩa. Nếu chỉ biết “bản nháp từng được tạo”, ghi đúng nhãn; không gọi “đang chờ” khi không có trạng thái giải quyết.

Không tính dry-run/isLocal/test message vào gửi thật; tránh đếm kép Message và audit. Audit best-effort không phải nguồn toàn vẹn tuyệt đối. Nếu thiếu dấu phân loại đáng tin, trả unavailable thay vì suy đoán. Không trả nội dung chat/PII không cần thiết trong aggregate.

Giữ /ai/usage là lượt aiSuggestion được ghi nhận và hạn mức; không đổi nghĩa âm thầm. Chi phí/token, tỷ lệ chuyển nhân viên và conversion chưa đủ nguồn thì unavailable và ghi rõ phần thiếu; không dùng bảng giá ước lượng để giả thành chi phí thực tế. Không bật provider/exporter hoặc gọi AI thật để test.

Test scope/ngày, auto reply/followup, bản nháp, dry-run, audit thiếu/trùng, metadata cũ và dữ liệu0. Thêm link “Xem báo cáo AI” trong thiết lập nếu route đã sẵn sàng, theo quyền. Không đổi send policy/global switch.

Ghi docs/reports-fix/04-ai-report.md về metric lineage và giới hạn; chạy test/build liên quan. Không tự tạo migration khi nguồn cũ đã đủ; nếu cần schema mới, mô tả và kiểm thử local an toàn, không backfill thật.
```

### 4B — Prompt kiểm tra

```text
Kiểm tra độc lập báo cáo AI bước4 ở F:\ZaloCRM-CorepViet. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Không tự sửa.

Đối soát từng KPI với Message/ActivityLog/AiSuggestion thực tế trong fixture. Đảm bảo cùng một tin không bị đếm kép; audit thiếu không biến mất tin có nguồn hợp lệ; dry-run/isLocal và followup được xử lý đúng contract. Kiểm tra trạng thái “chờ duyệt” không chỉ đếm lịch sử tạo suggestion.

Kiểm tra quyền API trực tiếp, filter ngoài scope, ngày VN, member/leader/admin và hai org. Không được dùng quyền sửa cấu hình AI để mặc định suy quyền xem toàn tổ chức. Xác minh /ai/usage không bị đổi nghĩa và không có số tiền/token không có nguồn.

Kiểm tra route/tab/link bằng trình duyệt local, loading/error/unavailable, không có nội dung chat không cần thiết. Xem diff để chắc không đổi send policy, bật tự gửi, gọi model/provider hay exporter. Chạy test liên quan và ghi docs/reports-fix/04-ai-report-verification.md với PASS/FAIL/BLOCKED, chỉ rõ chỉ số nào chưa đo được.
```

## Bước 5 — Áp giao diện báo cáo mobile

### 5A — Prompt triển khai

```text
Triển khai bước5 ở F:\ZaloCRM-CorepViet sau bước4 PASS. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md, .interface-design/system.md và docs/mobile-upgrade/04_MOBILE_DESIGN_SYSTEM.md. Áp dụng skill interface-design, mobile-ux-optimizer và vue-best-practices đang có theo hướng dẫn; giữ Vue/Vuetify.

Chuyển module báo cáo hiện có sang bố cục dùng được trên iPhone, không thay domain bằng dashboard mẫu. Giữ 8 danh mục gốc, thêm AI nếu bước4 đã có; menu/subnav/router thống nhất capability và quyền. Desktop hiện tại vẫn dùng được. Đường vào mobile Thêm → Báo cáo chỉ áp nếu phù hợp navigation đang triển khai, không tự thay toàn bộ nav app.

Thiết kế selector danh mục, bộ lọc kỳ rõ, KPI ưu tiên, scope đang xem, ngày cập nhật và drill-down phù hợp quyền. Chỉ đưa filter nick/nhân viên lên khi API đã hỗ trợ đúng contract. Snapshot phải có nhãn thời điểm, không ám chỉ mọi KPI theo ngày.

Ở320/390/430 CSS px: không tràn ngang cấp trang, vùng chạm tối thiểu44×44, bảng/heatmap có cuộn riêng hoặc bản tóm tắt dễ hiểu, loading/error/empty/unavailable và focus rõ. Giữ thương hiệu xanh, tiếng Việt, không nhúng mock metric vào ứng dụng thật. Không dùng ảnh AI tạo làm bằng chứng UI đã chạy.

Render bằng trình duyệt local với fixture giả: Tổng quan, Sale & Team, Automation và AI; lưu ảnh ở docs/reports-fix/renders/ và ghi viewport/trạng thái. Kiểm tra tương tác lọc, retry, mở detail và quay lại. Không xác nhận Safari/iPhone thật nếu chỉ chạy Chromium.

Ghi docs/reports-fix/05-mobile.md, chạy type/build và kiểm tra giao diện phù hợp; không sửa backend công thức ngoài lỗi tích hợp được chứng minh, không deploy.
```

### 5B — Prompt kiểm tra

```text
Kiểm tra độc lập bước5 ở F:\ZaloCRM-CorepViet. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và skill review UI phù hợp. Không tự sửa.

Mở bản local dùng fixture, kiểm tra320/390/430 và desktop; kiểm tra page overflow, vùng chạm44px, chữ tiếng Việt, keyboard focus, contrast chính, bảng/heatmap, sticky/footer và các trạng thái error/unavailable. Xác minh route/menu/tab chỉ xuất hiện theo policy; API vẫn chặn nếu gọi trực tiếp.

Thao tác chọn danh mục/kỳ, đổi kỳ nhanh, retry, drill-down/quay lại; kiểm tra label kỳ/scope khớp response. Không chỉ xem ảnh tĩnh. Ảnh phải là capture giao diện thực tế, ghi rõ browser và viewport; không dùng mockup raster làm chứng nhận.

Chạy test/build liên quan. Ghi docs/reports-fix/05-mobile-verification.md với bằng chứng, phần chưa test trên thiết bị thật và PASS/FAIL/BLOCKED. Không PASS toàn bộ iOS/PWA chỉ từ Chromium responsive.
```

## Bước 6 — Nghiệm thu toàn luồng trên môi trường test

### 6A — Prompt triển khai

```text
Thực hiện bước6 tại F:\ZaloCRM-CorepViet sau bước5 PASS. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và mọi checkpoint trước.

Thiết lập bộ nghiệm thu tái lập với database test chuyên biệt đã xác minh, dữ liệu giả, provider/queue/cron/send được chặn hoặc mock. Không dùng database production hoặc credentials thật. Nếu thiếu môi trường, vẫn hoàn thiện fixture/harness/checklist, nhưng đánh dấu nghiệm thu tích hợp BLOCKED.

Seed nhỏ đủ hai org, phòng A/B, phòng con, admin/leader/deputy/member, nhiều nick/contact, shared/private data, lịch hôm nay/ngày mai, trạng thái chốt trong/ngoài kỳ, tin người/AI/followup và dry-run. Chỉ reset database test có đích được kiểm tra rõ, không xóa dữ liệu có sẵn không liên quan.

Xây/chạy kiểm tra browser → auth/API → aggregate DB → UI: quyền trực tiếp và tổng, kỳ VN,0/null/lỗi, tổng và breakdown, export/custom/saved-report nếu trong scope, report AI và race khi đổi filter. Dùng expected values độc lập với code implementation.

Chạy bộ regression liên quan và build backend/frontend. Với lỗi có trước, chỉ rõ bằng chứng và mức ảnh hưởng thay vì bỏ qua chung. Ghi nhận hiệu năng bằng dữ liệu test và query count; không hứa SLA production từ máy local.

Ghi docs/reports-fix/06-acceptance.md: môi trường an toàn đã xác minh, fixture, tài khoản giả, lệnh, expected/actual, ảnh, phạm vi chưa chạy, lỗi còn tồn tại và tiêu chí release. Không deploy.
```

### 6B — Prompt kiểm tra

```text
Kiểm tra độc lập nghiệm thu bước6 ở F:\ZaloCRM-CorepViet. Đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Không tự sửa.

Xác minh test thật sự chạy trên DB test, không chỉ mock response frontend; kiểm tra chặn mọi send/model/cron tác dụng phụ. Tái chạy các tình huống quan trọng: leader không thấy phòng khác, cross-org bị chặn, ngày VN đúng biên, lịch mai không vào hôm nay, KPI khớp đếm tay, AI không đếm dry-run/audit trùng.

Đánh giá coverage theo đường dữ liệu, không chỉ số lượng test. Kiểm tra mọi endpoint/view đã đổi còn khớp contract, export và saved report không có đường vòng quyền. Xác minh ảnh và log là từ patch hiện tại, không tái dùng artifact cũ.

Ghi docs/reports-fix/06-acceptance-verification.md với PASS/FAIL/BLOCKED. Chỉ PASS khi các tiêu chí bắt buộc thực sự chạy đạt. Thiếu DB/browser/role fixture phải ghi BLOCKED ở phạm vi tương ứng; không chuyển sang tuyên bố sẵn sàng production.
```

## Bước 7 — Chuẩn bị phát hành và rollback

### 7A — Prompt triển khai

```text
Chuẩn bị phát hành bước7 ở F:\ZaloCRM-CorepViet sau khi bước6 PASS. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Lượt này chỉ tạo bộ hồ sơ phát hành, không chạy lệnh deploy/migrate/push/merge.

Kiểm tra diff cuối cùng và ownership: chỉ đưa thay đổi báo cáo thuộc phạm vi vào danh sách release; không trộn AI send policy/TikTok hay dữ liệu cục bộ không liên quan. Không tự tạo commit hoặc PR nếu chưa được yêu cầu trong phiên hiện tại.

Ghi docs/reports-fix/07-release.md:
1. Danh sách thay đổi, endpoint/contract và ảnh hưởng theo role.
2. Lệnh build/test/package và kết quả trên patch hiện tại.
3. Có/không migration, backfill, biến môi trường mới; nếu có nêu tương thích, thứ tự và rủi ro, không chạy thật.
4. Kế hoạch rollout môi trường thử → nhóm kiểm tra nhỏ → production theo cơ chế sẵn có; không dựng feature flag mới chỉ vì checklist.
5. Smoke test sau phát hành: login admin/leader/member, dữ liệu phạm vi, ngày VN, KPI/API lỗi, export và báo cáo AI.
6. Theo dõi403/5xx, độ trễ, unavailable bất thường và sai lệch đối soát; không bật telemetry bên ngoài mới.
7. Điều kiện rollback và cách quay lại cả frontend/backend; rollback code không tự hoàn tác schema/data. Nêu rõ bước cần backup và cách xác minh backup, không xóa dữ liệu.

Cập nhật README với kết quả thực hiện và phần chưa có. Trình bày release candidate cụ thể để người dùng có thể duyệt. Chưa phát hành.
```

### 7B — Prompt kiểm tra

```text
Review độc lập hồ sơ phát hành bước7 tại F:\ZaloCRM-CorepViet. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md. Không deploy hoặc tự sửa.

Đối chiếu release candidate với patch và checkpoint0–6, bảo đảm không sót endpoint/contract/null consumer, không trộn thay đổi ngoài scope. Kiểm tra test/build là của patch hiện tại, quyền và công thức đã được nghiệm thu, migration/backfill/rollback có phương án khả thi.

Kiểm tra runbook có smoke test theo role, ngày VN và số liệu đối soát, điều kiện dừng/rollback rõ. Không chấp nhận “rollback bằng git” nếu còn schema/data không tương thích. Không đánh dấu phát hành xong khi chỉ tạo tài liệu.

Ghi docs/reports-fix/07-release-verification.md với READY/NOT_READY/BLOCKED và bằng chứng. READY chỉ có nghĩa hồ sơ đủ điều kiện xin duyệt phát hành; không phải đã triển khai production. Báo rõ quyết định cuối cần người dùng thực hiện hoặc cho phép theo phiên làm việc.
```

## Prompt sửa sau kiểm tra — dùng khi B báo FAIL

```text
Trong F:\ZaloCRM-CorepViet, hãy sửa đúng các lỗi của bước [ĐIỀN SỐ BƯỚC] được ghi trong docs/reports-fix/[ĐIỀN TÊN FILE]-verification.md. Đọc quy tắc chung tại docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md và đọc findings trước khi sửa.

Xác minh từng finding trên source hiện tại. Sửa nguyên nhân, không chỉ sửa ảnh/UI hoặc nới assertion để pass; nếu finding không đúng, nêu bằng chứng và giữ lịch sử review. Không thay policy/contract đã chốt để hợp thức hóa implementation.

Thêm hoặc sửa regression test có dữ liệu đối chứng cho từng lỗi, chạy lại kiểm tra ảnh hưởng của bước này và các bước trước liên quan. Cập nhật checkpoint triển khai với kết quả mới, đánh dấu kết quả verification cũ đã hết hiệu lực nếu patch thay đổi. Không ghi đè kết luận review bằng tuyên bố tự kiểm tra đã PASS.

Nếu chưa sửa được, ghi rõ FAIL/BLOCKED, nguyên nhân và phần còn thiếu. Kết thúc để tôi chạy lại prompt B tương ứng; không tự chuyển sang bước tiếp hoặc deploy.
```

## Prompt tiếp tục sau gián đoạn

```text
Tiếp tục lộ trình fix Báo cáo tại F:\ZaloCRM-CorepViet. Đọc quy tắc chung trong docs/prompts/REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md, chỉ mục docs/reports-fix/README.md, checkpoint và git diff hiện tại.

Xác định bước gần nhất có bằng chứng verification PASS còn khớp patch. Không suy đoán bước đã hoàn tất từ lời kể. Báo ngắn bước hiện tại rồi làm phần còn thiếu đúng phạm vi; không lặp lại bước đã nghiệm thu nếu source không thay đổi liên quan. Nếu verification trước đã hết hiệu lực, chạy kiểm tra cần thiết trước khi tiếp tục.

Không deploy, không thay đổi AI thật và không đụng dữ liệu production. Nếu đang chờ quyết định nghiệp vụ hoặc môi trường test bắt buộc, nêu đúng thiếu gì và tiếp tục phần độc lập được phép.
```

## Khi nào thực sự triển khai production?

Bộ prompt này kết thúc ở hồ sơ phát hành có thể duyệt. Sau7B READY, người dùng xem patch, kết quả nghiệm thu và runbook rồi yêu cầu triển khai đích cụ thể. Không dùng “ok” từ giai đoạn soạn kế hoạch làm bằng chứng đã cho phép mọi thao tác production về sau.
d