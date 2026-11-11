# Review báo cáo sửa F4 và F6B3-1/2/3

02/11/2026 17:28 (+07), Asia/Ho_Chi_Minh. HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, working tree chưa commit. **Đã có patch đúng các đường được báo cáo; cần bổ sung nhãn snapshot và hoàn tất B.** Đây là review source/artifact và test chọn lọc, không thay thế tái nghiệm thu5B/6B. Không sửa implementation/assertion, không chạy DB/JWT/HTTP/browser mới trong review này.

## Đã xác nhận

- `backend/src/modules/dashboard/report-scope.ts:58/:59/:81` loại contact merged ở scope org. `:84–94` thêm canonical message cho cả org/people/main: loại local/deleted/dry-run/test/virtual, không lọc bỏ AI/bot hợp lệ. Bounds org/nick/user cũ được giữ. Không thêm threadType là phù hợp định nghĩa báo cáo cơ bản đang dùng; metric1–1 vẫn phải có filter riêng ở consumer.
- `frontend/src/views/ReportsView.vue:138–180` chụp tab/kỳ, clear dữ liệu đang tải, guard requestId, error/retry. `:91` dùng vietnamDateRange30; `:156` đọc byStatus. Export `:188/:194/:198` giữ kỳ trong tên file và có thông báo lỗi.
- `frontend/src/composables/use-mobile.ts:9/:17/:29/:32` dùng media query phần bù min-width768; `report-kit.css:147`, `airtable.css:540/:558` lấp khe767,x. Composable F3/DefaultLayout không thuộc patch này.
- Năm hash runtime hiện tại khớp `postimage-sha256.txt` của A. Bốn test PGlite giữ đủ **41 dòng expect cũ**; diff thêm cột mặc định và fixture/3 ca canonical, không thay expected cũ. Check theo dòng expect không được dùng thay cho đọc diff; đã đọc thêm các hunk schema/fixture.
- Log A đúng số: frontend157/157, backend report104/104, owner10/10, buildPASS; full backend **39 file FAIL, 9 test FAIL, 990 PASS, 20 skip**. Các bộ có phạm vi khác nhau; không cộng hoặc so số104 với112 của lượt6B trước để suy coverage tương đương.

## Oracle694/710 cần hiểu thế nào

Đã đọc **từng16 ca FAIL** trong artifact A `oracle/api-oracle.json`, không chỉ tin diễn giải checkpoint:

| Nhóm còn khác expected legacy | Số ca |
|---|---:|
| basic | 6 |
| export | 4 |
| custom | 1 |
| saved | 3 |
| cross-org (so giá trị orgX với số legacy) | 2 |

Actual đổi18→13 tin gửi,8→6 khách và breakdown tương ứng. Cả **60/60 contract checks PASS** (30 basic,20 export,3 custom,7 saved). Những khác biệt này phù hợp sửa contract; không phải16 lỗi canonical mới. Tuy nhiên **không gọi nguyên bộ710 là PASS**. Lượt B cần chuyển các expected legacy tương ứng sang canonical dựa trên SQL/fixture độc lập, giữ kết quả cũ và kiểm canary org khác; không bỏ hai test cross-org chỉ vì chúng đang lệch giá trị legacy.

Đây là review artifact đã chạy của A, **không phải một lần chạy PostgreSQL oracle mới**. Chi tiết đã sao phân loại vào artifact review riêng, không sửa oracle/log của A.

## R-A-1 — P2: chưa phân biệt snapshot trạng thái với khách mới trong kỳ trên UI

`backend/src/modules/dashboard/report-routes.ts:97–108` chỉ lọc createdAt cho newPerDay; byStatus groupBy không có điều kiện kỳ, là snapshot hiện tại. Contract `00-contract.md:116/:126/:128` yêu cầu phân biệt snapshot và period.

Trong UI, `ReportsView.vue:39–41` đặt một nhãn chung **“Kỳ dữ liệu: from – to”**, còn `:154–160` gộp “Trạng thái: …” và “Mới YYYY-MM-DD” vào cùng bảng mà không ghi snapshot/không giới hạn kỳ. Vì vậy contact tạo ngoài khoảng vẫn nằm trong trạng thái, nhưng người xem có thể hiểu cả bảng đã lọc theo khoảng.

**Cần bổ sung trước khi chốt6B:** ghi rõ nhóm trạng thái là “Trạng thái hiện tại — không giới hạn theo kỳ”; nhóm khách mới là dữ liệu trong kỳ. Không đổi SQL snapshot thành period chỉ để khớp nhãn. Không tự dựng timestamp asOf nếu API chưa có. Thêm kiểm tra nhãn và đối chứng contact ngoài kỳ; phần này được phát hiện bằng source review, chưa có browser mới của review này.

## Kết luận full suite cần sửa cách diễn đạt

Checkpoint A `06-remediation-6b3.md:75` ghi “Coi là có từ trước” dù chưa baseline. Chưa đủ bằng chứng cho kết luận đó. Cách ghi đúng: **full suite FAIL; nguồn gốc chưa xác minh**. Lỗi module thiếu có dấu hiệu ngoài patch; timeout và assertion cần đối chiếu thêm, không suy từ việc không import trực tiếp report.

Lượt sau có thể so các test lỗi trên bản sao preimage trong cùng môi trường an toàn, không chép code cũ đè working tree và không dùng DB chưa xác minh. Không bắt buộc sửa mọi lỗi ngoài phạm vi report trong lượt này, nhưng phải phân loại có bằng chứng.

## Kiểm tra chạy mới trong review

Artifact riêng: `artifacts/reports-remediation-a-review-20261102/`.

```text
# cwd frontend
node node_modules/vitest/vitest.mjs run src/views/ReportsView.dom.spec.ts src/composables/use-mobile.dom.spec.ts src/composables/use-report-compact-navigation.dom.spec.ts --reporter=verbose
# PASS 24/24, 3spec; frontend-targeted.log

# cwd backend; NODE_ENV=test, DATABASE_URL đặt đích dummy127.0.0.1:1
node node_modules/vitest/vitest.mjs run tests/unit/report-scope-postgres.test.ts tests/unit/report-scope-policy.test.ts --reporter=verbose
# PASS 18/18, 2spec; backend-targeted.log
```

Backend dùng PGlite in-memory và Prisma mock; không socket/DB thật, không provider/send/paidAI. **42/42 targeted PASS không thay integration/RLS/browser.** Source/test/prisma **973/973 giữ hash** từ đầu review. Không có harness/container/browser mới cần dừng. Không commit/deploy.

## Bước tiếp

1. A bổ sung nhãn snapshot; điều chỉnh diễn giải full-suite, bảo tồn log cũ.
2. B kiểm độc lập5B đầy đủ trên patch cuối (9danh mục/mobile/contrast/focus và hai biên lẻ),6B/JWT/RLS/SQL/export/custom/saved. Chạy lại6a3-api-acceptance và đối soát Engagement org vì predicate contactEngagementDaily đã thay đổi. Giữ phần chưa phủ của6B trước như savedCRUD/analytics trong danh sách nghiệm thu.
3. Giữ trạng thái chờ xác minh; không tự chuyển5B/6B sangPASS hay bắt đầu7A/7B. E-1/O-1 vẫn tồn đọng riêng trước phát hành.
