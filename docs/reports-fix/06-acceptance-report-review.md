# Đối chiếu báo cáo 6B lần 3

02/11/2026 16:51 (+07), Asia/Ho_Chi_Minh. **FAIL được giữ nguyên; chưa đủ điều kiện 7A.** Đây là review source và artifact của báo cáo người dùng gửi, không phải một lần chạy lại toàn bộ 6B. HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, working tree chưa commit. Không sửa runtime, assertion, framework hay dependency.

## Những kết luận có bằng chứng

| Nội dung | Kết quả đối chiếu hiện tại |
|---|---|
| F6B3-1 — số canonical sai | **Xác nhận.** `backend/src/modules/dashboard/report-scope.ts:56/:76` trả org filter trước điều kiện loại merged; `:81` chỉ giới hạn org cho message. `report-routes.ts:58/:100/:108`, `excel-sheet-builders.ts:37/:71` và `analytics/reports/custom-report.ts:141/:151/:205/:214/:222` dùng các helper đó. Saved-run dùng custom query. Contract `00-contract.md:118` đã yêu cầu loại các bản ghi không hợp lệ. |
| 14 check lệch | `artifacts/reports-6b3-verification-20261102-1559/oracle/api-oracle.json`: **696 PASS, 14 FAIL**, gồm basic-contract 6, export-contract 4, custom-contract 1, saved-contract 3. Ngày 01/11: 18 tin gửi so với 13; 8 contact mới so với 6. Các số này là kết quả artifact 6B, không được gọi là phép chạy DB mới của review này. |
| F6B3-2 — request lỗi vẫn giữ bảng cũ | **Xác nhận source.** `frontend/src/views/ReportsView.vue:103–142` chỉ console.error trong catch, không có state error/retry, không xóa/đánh dấu stale và không có guard request. Bằng chứng browser 503 có trong `shots/reports-co-ban-fault.png` của artifact 6B. |
| F6B3-3 — status/ngày mặc định | **Xác nhận source.** UI đọc treatmentProgress/medicationStatus ở `ReportsView.vue:119/:122`, trong khi API trả byStatus ở `report-routes.ts:121`. `ReportsView.vue:74/:75` trừ 30 ngày và dùng ISO UTC, tạo 31 ngày tính cả hai đầu; buổi sáng VN có thể mặc định ngày hôm qua. Nên sửa trong cùng lượt UI vì ngày VN đã là contract bắt buộc. |
| RLS/test được báo cáo | Artifact `oracle/rls-matrix.json` ghi **90/90**, app role NOSUPERUSER/NOBYPASSRLS, owned=0. Log thực tế ghi frontend **145/145**, backend app-role **112/112**, owner refresh **10/10**. Đây là xác nhận log tồn tại và số khớp; chưa tự chạy lại các bộ này trong review báo cáo. |

## Giới hạn cần giữ rõ

- Phát biểu phù hợp là **chưa phát hiện lỗi quyền/rò org trong ma trận đã kiểm**. Không suy toàn dự án an toàn: 28 bảng chưa có RLS, 6 model chưa vào guard; nhiều endpoint chưa đối soát giá trị SQL, saved POST/PUT/DELETE và migration replay chưa chạy.
- O-1 nên được xử lý hoặc có quyết định rủi ro trước phát hành: `automation-report-routes.ts:57` và `broadcast-report-routes.ts:43` dùng role JWT. `auth-middleware.ts:38/:52` kiểm token version/isActive nhưng giữ role claim; đường cập nhật role `auth/user-routes.ts:166/:192` không bump token version. Source hỗ trợ nguy cơ quyền cũ còn hiệu lực; review này chưa tái hiện hạ quyền bằng HTTP.
- `browser-results.json` có `admin 9 categories.allApi200=false` vì Tổng quan không phát sinh request mới trong vòng lặp (`api=[]`). Báo cáo chi tiết đã giải thích Tổng quan tải trước đó; không diễn giải cờ này thành 9/9 request mới PASS.
- Export **93/93 khớp SQL legacy** không chứng minh canonical đúng: **4 export-contract FAIL** vẫn là lỗi phải sửa.

## Bổ sung từ kiểm tra 5B đang hoàn thiện

**F3 PASS nhưng phát hiện F4 P2 tại biên dưới 768px.** Browser thật DPR 1,33, CSS width **767,669px**, innerWidth **768**: app giữ DefaultLayout (`use-mobile.ts:13`, `App.vue:30`), nhưng media query compact min-width768 không khớp (`DefaultLayout.vue:518`, composable `:41`). Nút Báo cáo nằm x760,139→862,453 ngoài viewport; body scrollWidth1086 so với clientWidth768. Compact button display:none. Đây là lỗi nhìn thấy thật, không override getter hoặc state.

Xem [bổ sung 5B](05-mobile-verification.md#supplement-20261102-1651) và [ảnh F4](../../artifacts/reports-mobile-5b-recheck4-20261102/browser-captures/F4-real-lower-boundary-repeat.png). Giữ nguyên lịch sử 5B PASS lúc13:39 và 6A đã chạy; kết luận bổ sung hiện tại là **5B FAIL vì F4**, **6B FAIL vì F6B3-1/F6B3-2**. Không ghi ngược 6A thành chưa bắt đầu.

## Thứ tự xử lý đề xuất

1. Lượt A sửa F6B3-1 theo contract hiện có; áp bộ lọc canonical ở mọi scope có thể đọc bản ghi loại trừ, không chỉ vá dữ liệu admin của fixture. Giữ org/main/shared và attribution đã duyệt.
2. Cùng lượt UI xử lý F6B3-2/F6B3-3: loading/error/retry, stale rõ ràng hoặc xóa số cũ, guard request, byStatus, ngày VN và khoảng30 ngày.
3. Sửa F4 ở lượt A riêng, thống nhất breakpoint chọn layout với CSS/media query; kiểm cả hai biên lẻ 767,x và1099,x, bảo tồn route/unmount/late-leave.
4. B kiểm tra độc lập lại 5B và 6B trên patch cuối. Không dùng test mock hoặc build PASS để đóng DB/browser gate. Chưa mở 7A/7B; quyết định E-1/O-1 trước phát hành.

File review mới này, phần bổ sung 5B và hai README là thay đổi tài liệu. Không commit/push/deploy; môi trường test riêng đã được kiểm tra không còn listener30574/55471, container disposable ở trạng thái exited. Không có lệnh ghi DB mới trong lượt đối chiếu báo cáo 6B.

Kiểm tra tài liệu: `git diff --check -- README.md docs/reports-fix/README.md docs/reports-fix/05-mobile-verification.md` còn báo blank-line-at-EOF ở hai README và cảnh báo LF→CRLF theo Git. Không coi đây là PASS của kiểm tra whitespace; không tự chuẩn hóa encoding/line endings toàn file hoặc chạm nội dung khác. Source/test hiện tại vẫn837/837 khớp snapshot13:23 (giới hạn baseline được ghi ở checkpoint5B).
