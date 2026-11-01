# Bước 3B — Kiểm tra độc lập KPI và UI

Cập nhật 01/11/2026 (+07). **Kết quả ban đầu: FAIL; remediation đã triển khai, đang chờ kiểm tra độc lập lại.** Bằng chứng ban đầu bên dưới được giữ nguyên; phần cập nhật remediation ghi trạng thái hiện tại.

## Phạm vi và cách kiểm tra

- Đối chiếu [contract bước 0](./00-contract.md), [triển khai 3A](./03-kpis.md), API trong `report-analytics-routes.ts` và các consumer báo cáo.
- Chạy fixture/test không dùng dữ liệu production; dùng browser trên Vite local và route interception để trả JSON giả. Không gọi hệ thống bên ngoài.
- PostgreSQL/RLS không đạt nghiệm thu: [02-postgres-rls-verification.md](./02-postgres-rls-verification.md) ghi **6/15 PASS, 9/15 FAIL**. Do đó chưa thể coi mock/Prisma unit test là đối soát với dữ liệu PostgreSQL thực.
- Chưa có số liệu tải production hoặc query plan; không suy ra hiệu năng production từ fixture nhỏ.

## Phát hiện cần xử lý

| ID | Mức độ | Phát hiện và bằng chứng | Kết quả |
|---|---|---|---|
| 3B-01 | Cao | Engagement đếm `ContactEngagementDaily` có `ciTotal=0` thành `customerInitiatedPct=0` (`report-analytics-routes.ts:821–825`), trái quy ước mẫu số 0 phải unavailable trong contract. UI cũng biến `null` thành chuỗi `0`/`0%` (`EngagementReport.vue:65–70`). Browser fixture có `customerInitiatedPct=null`, `avgInteractionsPerDay=null` đã render `0%` và `0`, trong khi các danh sách rỗng vẫn có thông báo rỗng. | **FAIL** — dữ liệu thiếu có thể bị trình bày như số đo 0. |
| 3B-02 | Trung bình | `avgInteractionsPerDay` luôn chia tổng aggregate cho số ngày kỳ; khi aggregate không có row/tổng bằng 0 API vẫn trả 0 (`report-analytics-routes.ts:892–895`) và không có kiểm tra coverage. Contract chỉ cho dùng metric này khi coverage đủ. Chưa có bằng chứng để phân biệt kỳ thật sự không tương tác với aggregate bị thiếu. | **BLOCKED** — chưa xác minh coverage; không được khẳng định số 0 là số đo. |
| 3B-03 | Trung bình | Tỉ lệ trả lead hiện lấy request **được tạo trong kỳ** có `autoReturnedAt != null` chia tổng request tạo trong kỳ (`report-analytics-routes.ts:488–493`, `551–557`). Contract yêu cầu return event theo `autoReturnedAt`/release event **xảy ra trong kỳ** (`00-contract.md:143`). Ví dụ request tạo 01/10 và trả 01/11 vẫn bị tính vào numerator kỳ tháng 10; request tạo trước tháng 10 nhưng trả trong tháng 10 lại bị bỏ qua. UI gọi chung là “Tỉ lệ trả lead” (`PipelineReport.vue:72–75`), không nói đây là cohort. | **FAIL** — attribution theo kỳ không khớp contract; cần chốt/đổi công thức trước khi nghiệm thu. |
| 3B-04 | Trung bình | Engagement bắt lỗi request bằng cách đặt `data=null`; template dùng cùng trạng thái “Không có dữ liệu tương tác cho kỳ này” cho cả kết quả rỗng và HTTP 503. Browser giả lập 503 xác nhận trạng thái lỗi bị trình bày như dữ liệu rỗng. Nút “Làm mới” thực hiện request GET thứ hai và tải thành công, nhưng lỗi không được phân biệt/giải thích. | **FAIL** — retry hoạt động, thông báo lỗi không đạt yêu cầu. |
| 3B-05 | Thấp | Nick Fleet trả `null`/unavailable cho uptime, kết bạn, quota và tra cứu SĐT (`report-analytics-routes.ts:280–300`), nhưng các KPI UI nối `%` cố định; fixture null hiển thị “Chưa có dữ liệu%”. Một số ô null dùng dấu `—` thay cho “Chưa có dữ liệu” (`NickFleetReport.vue:70–82`, `147–163`). | **FAIL** — placeholder/đơn vị gây hiểu nhầm ở metric unavailable. |
| 3B-06 | Thấp | Mô tả Pipeline nói “nguồn nào ra chốt tốt” (`PipelineReport.vue:16`) trong khi close rate và closed-by-source đang unavailable theo API/contract (`report-analytics-routes.ts:520–525`). | **FAIL** — copy hiện tại hứa phân tích chưa có nguồn. |

## Đối chiếu fixture và vùng đã kiểm tra

| Màn/API | KPI/logic đã rà | Kết quả kiểm tra |
|---|---|---|
| Overview | Số đo 0 và unavailable trên UI; đổi kỳ nhanh/response đến trễ; message series | Kiểm tra browser fake trước đó xác nhận Overview giữ số 0 đo được tách khỏi unavailable và kỳ đang chọn không bị response cũ ghi đè. Trong fixture route, tự cộng `2+3=5` tin gửi, `1+0=1` tin nhận; ngày cuối có `3` gửi + `0` nhận nên `msgToday=3`, `msgByBot=1`. Không có DB độc lập để xác nhận predicate/coverage với dữ liệu thật. |
| Nick Fleet | Nick hiện tại và các metric thiếu nguồn | Status/count có nguồn snapshot; API đánh dấu các metric thiếu nguồn. Browser fake cho một nick xác nhận các KPI null hiện kèm `%` không hợp lệ và một số ô là `—`. |
| Sales & Team | Scope sale; aggregate tin; lịch hẹn/Lead Pool; response time; close/score | Unit fixture xác nhận scope không lấy sale ngoài phòng, aggregate theo batch, và close/score vẫn unavailable. Đối chiếu tay oracle response-time: inbound 09:00, 09:04; người thật trả lời 09:05 → anchor là 09:04, kết quả **60 giây**. |
| Pipeline & Lead Pool | Snapshot funnel/source, return rate, nhóm theo sale | Close/time-in-stage/drop được trả unavailable đúng lý do trong fixture. Return rate **FAIL** theo 3B-03. Không thấy count query lặp cho từng sale: test xác nhận nhóm Lead Pool dùng một `distribution.groupBy`, hai `request.groupBy` và các count tổng. |
| Automation & Broadcast | KPI tổng hợp và trạng thái unavailable | Source 3A có các metric unavailable khi thiếu registry/counter; lượt 3B này chưa có fixture độc lập đủ để đối soát từng công thức/count. **BLOCKED**, không tính là PASS. |
| Engagement | Customer-initiated, tương tác/ngày, heatmap và empty/error UI | **FAIL** theo 3B-01/02/04. Browser giả lập xác nhận null thành 0/0%; 503 thành empty-state; nút “Làm mới” tải lại thành công. |
| CRM Usage & Audit | Activity, giới hạn mẫu, kết quả/chỉ số audit | Rà source thấy có giới hạn đọc activity và các trường thiếu nguồn được gắn unavailable. Chưa có fixture độc lập/DB để đối soát mọi phép cộng, coverage và phạm vi từng KPI. **BLOCKED**. |

### Kiểm tra N+1, giới hạn và an toàn

- Không thấy truy vấn DB trong vòng lặp theo từng Sale ở các aggregate Sales/Lead Pool đã rà; test `reports-review-evidence` kiểm tra việc nhóm theo batch thay vì count riêng cho từng Sale.
- Response-time đọc tối đa 50.001 event để phát hiện vượt ngưỡng 50.000; CRM Usage đọc tối đa 100.001 activity để phát hiện truncation; heatmap Engagement giới hạn top 15 contact và cửa sổ 28 ngày.
- Một số `LeadRequest.groupBy`/`LeadPoolDistribution.groupBy` cho trạng thái snapshot không có giới hạn ngày. Đây là aggregation trên lịch sử; không phải N+1 đã tái hiện, nhưng cần đo query plan/khối lượng với DB đại diện trước khi tuyên bố hiệu năng đạt.
- Browser test chỉ ghi nhận GET đến endpoint báo cáo; không phát hiện request POST/gửi tin/broadcast/AI trong kịch bản này.

## Kiểm thử đã chạy

- Backend: `npm.cmd test -- tests/unit/reports-review-evidence.test.ts tests/unit/response-time-service.test.ts tests/unit/report-period-query-boundary.test.ts` — **20/20 PASS**.
- Frontend: `npm.cmd test -- src/views/reports/EngagementReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts` — **4/4 PASS**. Các test hiện có không bắt lỗi null-to-zero ở Engagement hoặc đơn vị `%` ở Nick Fleet.
- Backend `npx.cmd tsc --noEmit --pretty false` — **PASS**.
- Frontend `npm.cmd run build` (`vue-tsc -b && vite build`) — **PASS**.
- Các test PASS ở trên không xóa các FAIL/BLOCKED về semantics, coverage hoặc PostgreSQL/RLS.

## Kết luận

**Kết quả nghiệm thu ban đầu: FAIL.** Nghiệm thu PostgreSQL/RLS vẫn FAIL 6/15 PASS, 9/15 FAIL và tiếp tục chặn nghiệm thu tích hợp/phát hành.

## Cập nhật remediation

Theo yêu cầu sửa lỗi, đã cập nhật runtime và regression tests; chưa tuyên bố 3B PASS vì cần chạy lại kiểm tra độc lập và PostgreSQL/RLS vẫn chưa đạt.

| Phát hiện | Thay đổi xử lý | Xác minh |
|---|---|---|
| 3B-01: Engagement thiếu dữ liệu thành 0 | Backend trả `null` khi mẫu số customer-initiated bằng 0; UI formatter giữ số 0 đo được, còn `null` hiện “Chưa có dữ liệu” và bỏ hậu tố `%`. | Backend test xác nhận `null` + availability reason; frontend DOM test xác nhận zero khác unavailable. |
| 3B-02: coverage tương tác/ngày | Vì writer `ContactEngagementDaily` best-effort và không có coverage signal, KPI được fail-closed thành `null` với `engagement_daily_coverage_unverified`; không còn công bố phép chia partial aggregate như KPI hợp lệ. | Backend fixture xác nhận aggregate 4 inbound + 6 outbound vẫn không được trình bày thành trung bình khi coverage không chứng minh đủ. |
| 3B-03: công thức tỉ lệ trả Lead Pool | Theo lựa chọn người dùng, metric `returnRate` ở Pipeline và Lead Pool chuyển sang `null`, availability `lead_return_denominator_unavailable`; không dùng công thức event/cohort khi mẫu số chưa được xác nhận. | Backend regression test xác nhận cả hai endpoint không trả số giả; query đếm cohort không còn chạy. |
| 3B-04: request lỗi Engagement bị gọi là rỗng | Thêm trạng thái lỗi riêng, log lỗi và nút “Thử lại”; trạng thái rỗng thành công tách khỏi lỗi tải. | Frontend DOM test mô phỏng lỗi rồi retry thành công. |
| 3B-05: đơn vị/placeholder Nick Fleet | Chỉ hiện `%` khi giá trị hữu hạn; các ô friend-send và phone-lookup chưa có dữ liệu hiện “Chưa có dữ liệu”; copy đầu trang phản ánh nguồn chưa có. | Frontend DOM test xác nhận null không có `%`/`—` và số0 vẫn hiển thị `0%`. |
| 3B-06: copy Pipeline hứa chỉ số chưa có | Thay mô tả thành trạng thái nguồn hiện có và nêu rõ KPI chốt/time-in-stage chưa đủ dữ liệu tin cậy. | Frontend DOM test xác nhận copy không còn nói nguồn nào “ra chốt tốt”. |

Kiểm thử sau remediation: backend report evidence **10/10 PASS**; frontend Engagement/Nick Fleet/Pipeline **6/6 PASS**; backend TypeScript và frontend `vue-tsc -b && vite build` PASS. Đây là local checks, không thay thế kiểm tra độc lập lại, đối soát PostgreSQL/RLS, hoặc production verification. Không đổi schema, chính sách gửi tin, cấu hình AI hay deploy.

## Đối chiếu và bổ sung sau bản báo cáo được gửi lại — 01/11/2026 22:00 (+07)

Trạng thái: **PASS regression KPI/UI cục bộ; nghiệm thu đầy đủ vẫn BLOCKED**. Working tree tham chiếu HEAD `1b910e3`, chưa commit. Sáu remediation phía trên đã có trong source trước lượt này; không ghi nhận chúng là patch mới của lượt này.

- Đã đối chiếu `backend/src/modules/dashboard/report-analytics-routes.ts:819`, `:944`, `:945`: mẫu số 0 trả null; trung bình/ngày thiếu coverage trả unavailable. Tỉ lệ trả Lead Pool giữ unavailable tại `:522` và `:633`.
- `frontend/src/views/reports/NickFleetReport.vue:70` chỉ nối đơn vị khi có số; `frontend/src/views/reports/PipelineReport.vue:17` không hứa số liệu chốt chưa đủ nguồn. Engagement có error/retry tại `frontend/src/views/reports/EngagementReport.vue:196`.
- Patch mới: `EngagementReport.vue:58` xóa state dữ liệu ngay khi bắt đầu request, trước đây chỉ che dữ liệu cũ bằng loading. Không thay công thức KPI hoặc quyền.
- Test mới: `backend/tests/unit/reports-review-evidence.test.ts:176` đối chứng 0/5 là số đo 0 available, khác mẫu số 0. `frontend/src/views/reports/EngagementReport.dom.spec.ts:77` kiểm tra ẩn KPI khi tải kỳ mới và từ chối response sai kỳ.

Lệnh thực chạy từ thư mục tương ứng:

```text
backend: node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/unit/response-time-service.test.ts tests/unit/report-period-query-boundary.test.ts
frontend: node node_modules/vitest/vitest.mjs run src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts
backend: node node_modules/typescript/bin/tsc --noEmit --pretty false
frontend: npm.cmd run build
```

Backend 3 files **22/22 PASS**; frontend 4 files **10/10 PASS**; backend TypeScript PASS. Lần khởi chạy trong sandbox bị spawn EPERM, chưa chạy test; các kết quả trên là lần chạy lại ngoài sandbox. Fixture Prisma/API giả; frontend dùng jsdom, không phải trình duyệt thật. Không kết nối DB hoặc production, không gửi tin/AI. `git diff --check` trên file patch PASS.

Frontend build hoàn tất exit 0, 3.066 modules; còn cảnh báo chunk lớn hơn 500 kB, không phải lỗi build.

Giới hạn: chưa tái nghiệm thu độc lập toàn bộ 3B, chưa đối soát đủ Automation/Broadcast/CRM Usage/Audit với PostgreSQL. Coverage Engagement và mẫu số trả lead vẫn thiếu nên giữ unavailable. Kết quả DB/JWT/browser trước đó không được nâng thành PASS; xem `02-postgres-rls-verification.md`. Bước tiếp là xử lý tenant-context/RLS trong patch riêng, rồi nghiệm thu DB và browser đầy đủ.

## Rà soát lại — 01/11/2026 22:10 (+07)

- Xác nhận lại trong source: 3B-01/02 (`report-analytics-routes.ts:819`, `:887`, `:944–945`), 3B-03 (`:522`, `:633`), 3B-04 (`EngagementReport.vue:194–196`), 3B-05 (`NickFleetReport.vue:70–82`), 3B-06 (`PipelineReport.vue:15–17`) đều còn hiệu lực.
- Patch mới (cùng nhóm 3B-05): `NickFleetReport.vue` còn 3 chỗ guard bằng `!= null` hoặc không guard đơn vị — uptime 7 ngày (`:137`), tra cứu SĐT (`:164`) và `%` SDK theo loại (`:209`). Đổi sang `hasValue(...)` để giá trị null/không hữu hạn không bao giờ hiện kèm `%` ("Chưa có dữ liệu%"). Không đổi công thức KPI, API hay quyền.
- Kiểm thử: backend 3 files **22/22 PASS**, backend `tsc --noEmit` PASS; frontend 4 files **10/10 PASS**; `npm.cmd run build` PASS (chỉ còn cảnh báo chunk > 500 kB).
- Trạng thái không đổi: PASS regression KPI/UI cục bộ; nghiệm thu đầy đủ vẫn **BLOCKED** bởi PostgreSQL/RLS (`02-postgres-rls-verification.md`) và các vùng Automation/Broadcast/CRM Usage/Audit chưa đối soát với DB.
