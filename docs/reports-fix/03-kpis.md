# Bước3A — KPI thật, dữ liệu thiếu và trạng thái tải

Cập nhật01/11/2026 (+07). Trạng thái: **đã triển khai3A và remediation sau 3B; chờ kiểm tra độc lập lại**. Đây là local implementation và test; không phải nghiệm thu PostgreSQL/RLS, tích hợp hoặc production. Không sửa schema, migration, chính sách gửi tin hay cấu hình AI; không deploy.

## Quy tắc thực hiện

- Giá trị số chỉ là0 khi nguồn đã được truy vấn và xác nhận không có bản ghi. Metric thiếu writer, mapping hoặc coverage trả `null` và có `availability.status='unavailable'` cùng `reason`.
- Period dùng helper giờ Việt Nam đã được nghiệm thu ở2B. Snapshot có `asOf`; dữ liệu theo kỳ có `from/to`.
- Message thực được lọc conversation thật, loại message local/deleted/dry-run/test. Attribution người gửi dựa `repliedByUserId`, không suy từ chủ nick.
- Không suy trạng thái thắng từ `isTerminal` hoặc tên hiển thị “Chốt”. Không lấy số contact đang ở terminal làm số conversion/event đã chốt.
- UI xóa dữ liệu cũ khi đổi kỳ, bỏ response lỗi/đến trễ, hiển thị loading/error/retry và render `null` là “Chưa có dữ liệu”. Số0 đã đo vẫn hiển thị0.

## Đối chiếu KPI và nguồn

| API / màn hình | KPI / dữ liệu | Nguồn, kỳ và công thức | Trạng thái / lý do |
|---|---|---|---|
| `/reports/overview` — Tổng quan | Tổng contact; contact mới; chênh contact mới | `Contact.count`, bỏ merged; tổng là snapshot, contact mới theo `createdAt` trong kỳ VN; chênh là cohort kỳ hiện tại trừ kỳ liền trước cùng độ dài. | Đã đo; số0 là số đo hợp lệ. |
| `/reports/overview` | Tin nhắn theo ngày, tổng hôm nay, tin automation hôm nay | Aggregate `messages` join `conversations`, đúng org/account scope; tin thật trong hội thoại user, loại local/deleted/dry-run/test. Phân loại automation chỉ khi `sentVia='automation'`; không gộp mọi bot/AI vào nhóm này. | Đã đo; ngày không có row trong aggregate được thể hiện là0 trong một query thành công. |
| `/reports/overview` | Nick online/tổng nick/cần đăng nhập lại | Snapshot `ZaloAccount` chưa archive; online khi status=`connected`. | Đã đo theo trạng thái hiện tại, không phải uptime theo kỳ. |
| `/reports/overview` | Lịch hẹn hôm nay; lịch hẹn hoàn thành | `Appointment.count`; hôm nay theo `appointmentDate` VN; hoàn thành theo status=`completed` trong kỳ đang chọn. | Đã đo; UI ghi rõ hai time basis. |
| `/reports/overview` | Lead Pool đang chờ | Snapshot `LeadRequest` với `releaseReason=null`. | Đã đo ở thời điểm truy vấn; không phải dự báo sắp hết hạn. |
| `/reports/overview` | Funnel trạng thái hiện tại | `Contact.groupBy(statusId)` hiện tại, bỏ merged. | Đã đo snapshot; không diễn giải là lịch sử chuyển stage. |
| `/reports/overview` | Tỉ lệ chốt, thay đổi tỉ lệ chốt, số chốt theo Sale | Nguồn status hiện không có mapping thắng ổn định; chỉ tên trạng thái/terminal không đủ để kết luận won. | `null`, `won_status_mapping_unavailable`; top Sale được xếp theo số contact mới, không theo số chốt. |
| `/reports/overview` | Kết bạn, quota, uptime, Lead Pool sắp auto-trả | Không có nguồn coverage phù hợp trong API này. | `null`; reason lần lượt `friend_acceptance_source_unavailable`, `friend_invite_source_unavailable`, `sdk_quota_source_unavailable`, `uptime_coverage_unavailable`, `lead_expiry_coverage_unavailable`. |
| `/reports/nick-fleet` — Nick | Tổng nick, online, cần đăng nhập lại | Snapshot `ZaloAccount` theo account scope và status hiện tại. | Đã đo. |
| `/reports/nick-fleet` | Tin bot theo nick, uptime, nhận lời mời, quota SDK, tra cứu số điện thoại | Chưa có attribution/coverage/writer đáng tin để tính theo nick. Heatmap uptime giữ cell `null`, không dựng dữ liệu0. | `null`/unavailable: `nick_message_attribution_unavailable`, `uptime_coverage_unavailable`, `friend_acceptance_source_unavailable`, `sdk_quota_source_unavailable`, `phone_lookup_source_unavailable`. |
| `/reports/sales-performance` — Sale | Contact phụ trách; tin Sale gửi; tin chưa gán người; tin trung bình/Sale | Contacts là snapshot ownership hiện tại. Tin người thật aggregate một lần theo `repliedByUserId`, `sentVia IN ('user','user_native')`, kỳ VN và message filters. Trung bình = tổng tin attributed / số Sale active trong scope. | Đã đo; tin không gán hoặc actor ngoài visible user scope được tính riêng là `sentUnattributed`, không gán cho chủ nick. |
| `/reports/sales-performance` | Response time tổng/theo Sale/phân bố bucket | `/analytics/reports/response-time.ts` ghép inbound cuối cùng của khách với reply người thật đầu tiên tiếp theo trong cùng conversation; 09:00/09:04 → 09:05 = 60 giây. Kỳ thuộc inbound; cutoff `asOf`; AI không kết thúc lượt; actor ngoài scope không được ghi công. Trung bình là tổng giây / số cặp actor đã biết. Bucket: `<5`, `5–15`, `15–30`, `30–60`, `>60` phút. | Đã đo khi có ít nhất một cặp; `null` khi không có cặp được ghi công. Trên50.000 event thì unavailable `response_event_limit`, không coi sample bị cắt là toàn bộ. |
| `/reports/sales-performance` | Lịch hẹn hoàn thành/vắng; yêu cầu Lead Pool | Group theo Sale và appointment status, `appointmentDate` trong kỳ; lead request group theo requester và `requestedAt` trong kỳ. | Đã đo; aggregate theo batch, không query riêng theo Sale. |
| `/reports/sales-performance` | Số chốt, tỉ lệ chốt, điểm/xếp hạng performance | Không có won-status mapping; công thức điểm trước đó chưa được xác thực. | `null`; `won_status_mapping_unavailable` hoặc `performance_score_formula_unvalidated`. Sale được sắp theo tên để tránh giả xếp hạng. |
| `/reports/pipeline` — Pipeline | Funnel theo stage | `Contact.groupBy(statusId)` là snapshot hiện tại. | Đã đo; `dropPct` luôn `null`, vì không có lịch sử chuyển trạng thái. |
| `/reports/pipeline` | Lead mới theo nguồn | `Contact.groupBy(source)` theo `createdAt` trong kỳ VN. | Đã đo. |
| `/reports/pipeline` | Chốt/tỉ lệ chốt theo pipeline hoặc nguồn; thời gian ở stage; tỉ lệ đã liên hệ | Không có mapping thắng hoặc lịch sử stage/contact event đầy đủ. | `null`, lần lượt `won_status_mapping_unavailable`, `status_history_unavailable`, `contact_event_history_unavailable`. |
| `/reports/lead-pool` | Chờ, phân phối trong kỳ, holding/returned/overdue theo Sale | Count hiện tại và aggregate `groupBy` theo requester/release reason; overdue là `expiresAt < now`; phân phối theo `distributedAt` trong kỳ. | Đã đo; trạng thái theo Sale dùng batch group queries. Tỉ lệ trả lead hiện `null`, `lead_return_denominator_unavailable`: chưa có mẫu số/lifecycle event đủ tin cậy để tính theo kỳ. |
| `/reports/lead-pool` | Thời gian giữ lead trung bình | Không có lịch sử release/hold đủ để tính. | `null`, `lead_release_history_unavailable`. |
| `/reports/engagement` — Engagement | KH chủ động nhắn và tương tác trung bình/ngày | `ContactEngagementDaily` chỉ được ghi theo sự kiện, writer best-effort; chưa có coverage signal để khẳng định đủ dữ liệu trong kỳ. | Customer-initiated trả `null` với `engagement_daily_denominator_zero` khi không có row. Avg interactions/day luôn `null`, `engagement_daily_coverage_unverified`, đến khi xác minh được coverage đầy đủ. |
| `/reports/crm-usage` — Mức độ dùng CRM | Thao tác, module, active Sale hôm nay, thời gian hoạt động ước tính/ngày, daily series, heatmap | `ActivityLog` user trong kỳ/scope; active theo event từ đầu ngày VN; session estimate tách khi gap >30 phút, tối thiểu5 phút mỗi session/ngày. Đây là ước tính từ nhịp thao tác, không phải tracking session chính xác. | Đã đo trong giới hạn coverage; khi đọc vượt100.000 event, các phần phụ thuộc activity bị unavailable `activity_event_limit` (kỳ trước riêng `previous_activity_event_limit`). |
| `/reports/crm-usage` | Funnel kết quả, số chốt/giờ, điểm hiệu quả | Won mapping không được contract xác định; không dùng trọng số lịch hẹn để giả thành kết quả. | Kết quả `null`, `availability.outcomes=unavailable`; UI không hiển thị bảng xếp hạng giả. |
| `/reports/audit` — Audit | Activity thay đổi hôm nay; nick disconnect24h; tỉ lệ lỗi Automation event24h | `ActivityLog`, `ZaloAccountStatusLog`, `AutomationEventLog`; lỗi = event type chứa `failed` / tổng event trong24h. | Đã đo; tỉ lệ lỗi `null` khi không có event và reason `no_automation_events_in_window`. |
| `/reports/audit` | Cron registry, độ sâu hàng đợi, phân loại lỗi | Chưa có registry/queue/category source. | `null`/unavailable (`cron_registry_unavailable`, `queue_registry_unavailable`, `error_category_source_unavailable`); UI không trình bày như0 job/queue rỗng. |

## Local checks

- Backend: 4 test files, **28/28 PASS** — `reports-review-evidence`, `response-time-service`, `report-1b-review-evidence`, `report-http-scope`.
- Backend TypeScript: `tsc --noEmit --pretty false` — PASS.
- Frontend: `SalesReport.dom.spec.ts`, **3/3 PASS** (measured zero vs unavailable, retry/error, stale response).
- Frontend build `npm.cmd run build` (`vue-tsc -b && vite build`) — PASS; Vite transformed3,066 modules.
- `git diff --check` trên các file implementation/test thuộc bước3A — PASS. Root `README.md` có một dòng trống cuối file đã tồn tại và không thuộc patch này; không sửa file đó.

Không chạy DB/PostgreSQL/RLS, browser integration, production hoặc external service trong bước này. Working tree vốn đã có thay đổi khác; không reset/revert các thay đổi đó. Patch chưa commit/deploy.

## Chưa nghiệm thu

3B cần đối soát từng metric độc lập bằng fixture/DB phù hợp, kiểm tra mọi consumer còn phụ thuộc response shape, kiểm tra UI unavailable/error và query scoping. Kết quả local không nâng trạng thái PostgreSQL/RLS: xem [02-postgres-rls-verification.md](./02-postgres-rls-verification.md), hiện **FAIL 6/15 PASS, 9/15 FAIL** do thiếu RLS trên `messages` và tenant-context làm HTTP auth/report trả500.

## Remediation sau kiểm tra 3B

Đã cập nhật sau các phát hiện 3B, chờ kiểm tra độc lập lại:

- Engagement không còn trình bày mẫu số 0 hoặc aggregate coverage chưa xác minh thành số0; response kèm `availability`.
- Lỗi request Engagement có thông báo riêng và nút thử lại.
- Tỉ lệ trả Lead Pool được giữ unavailable (`lead_return_denominator_unavailable`) theo quyết định người dùng; cần xác nhận mẫu số trước khi tính lại.
- Nick Fleet chỉ gắn đơn vị `%` khi số liệu hợp lệ; trường thiếu thống nhất hiển thị “Chưa có dữ liệu”. Copy Pipeline không hứa phân tích kết quả chốt chưa có nguồn.
- Regression tests bổ sung: backend report analytics 10/10; frontend Engagement/Nick Fleet/Pipeline 6/6; backend type-check và frontend build PASS.
