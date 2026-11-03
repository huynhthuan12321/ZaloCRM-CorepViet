# R-A-1 — Tách nhãn snapshot và khách mới trong kỳ

Ngày/giờ: 02/11/2026, 17:35–17:43 +07 (Asia/Ho_Chi_Minh).

**Trạng thái: COMPLETED_PENDING_VERIFICATION.** Tự kiểm tra A PASS; chưa thực hiện nghiệm thu B. 5B/6B vẫn chờ tái kiểm độc lập, giữ nguyên lịch sử FAIL và các lượt 6A đã chạy. 7A/7B NOT_STARTED. Không commit/push/deploy.

## Revision và phạm vi

- Workspace: `F:\ZaloCRM-CorepViet`; HEAD: `eb1be0bce8f60858436b98370f3c517edcb041b7`. Đây là patch working tree chưa commit, không có commit hash mới.
- Đã kiểm tra git status/diff trước khi sửa và đọc quy tắc chung, contract, remediation F4/F6B3, review R-A-1, roadmap. Không tìm thấy `AGENTS.md` trong các thư mục tổ tiên áp dụng đã kiểm; chỉ dẫn AGENTS do người dùng cung cấp vẫn áp dụng. Đã đọc skill `vue-best-practices` và các tài liệu tham chiếu bắt buộc; giữ cách tổ chức component hiện có, không tái cấu trúc.
- Runtime chỉ đổi `frontend/src/views/ReportsView.vue`; bổ sung regression ở `frontend/src/views/ReportsView.dom.spec.ts`. Tài liệu đổi: checkpoint này, `06-remediation-6b3.md`, README roadmap và README gốc.
- Artifact riêng, được tạo khi chưa tồn tại: [`reports-snapshot-label-20261102-173525`](../../artifacts/reports-snapshot-label-20261102-173525/). Preimage/diff riêng so với lúc bắt đầu lượt này, không dùng diff HEAD để nhận toàn bộ thay đổi cũ là patch mới.
- Hash trước/sau: **971/973 file giữ nguyên**, chỉ component/spec trên thay đổi trong `frontend/src`, `backend/src`, `backend/tests`, `backend/prisma`; không thêm/xóa file source trong các cây này. Backend, Prisma, canonical, org/main/shared, quyền/attribution và F3/F4 không đổi. Xem `source-before.json`, `source-after.json`, `source-integrity.json`.

## Đối chiếu contract và source trong lượt này

- [`00-contract.md:116`](00-contract.md#L116) phân biệt snapshot/period; dòng 126–128 định nghĩa tổng khách và phễu hiện tại là snapshot, khách mới theo `Contact.createdAt` trong kỳ.
- [`report-routes.ts:96`](../../backend/src/modules/dashboard/report-routes.ts#L96): `newPerDay` dùng `contactReportSql(scope)` và giới hạn `created_at >= start`, `< end` ở dòng 100–102. `byStatus` ở dòng 106–109 dùng phạm vi quyền, không có điều kiện khoảng ngày. Không đổi query để khớp nhãn.
- [`ReportsView.vue:64`](../../frontend/src/views/ReportsView.vue#L64): nhãn snapshot chính xác **“Trạng thái hiện tại — không giới hạn theo kỳ”**. Bảng snapshot riêng, luôn ở trước bảng khách mới, không chung phân trang với các ngày.
- [`ReportsView.vue:73`](../../frontend/src/views/ReportsView.vue#L73): nhóm **“Khách mới trong kỳ”** có nhãn ngày từ `loadedPeriod` sau response thành công. Nhãn kỳ ở dòng 74–76 chỉ thuộc nhóm này; dòng 39 loại nhãn kỳ chung khỏi tab Khách hàng.
- [`ReportsView.vue:138`](../../frontend/src/views/ReportsView.vue#L138) giữ cảnh báo ô ngày đã đổi nhưng chưa tải. Dòng 152 xóa snapshot cùng dữ liệu trong kỳ; dòng 176–185 tách `statusRows` và `newPerDay` sau guard response hiện có. Không tạo `asOf` hay timestamp snapshot giả.

## Hành vi trước/sau

Trước: tab Khách hàng có một nhãn “Kỳ dữ liệu” cho bảng trộn các dòng trạng thái hiện tại và khách mới từng ngày. Dù đưa trạng thái lên trước, người đọc vẫn có thể hiểu chúng đều bị giới hạn theo kỳ.

Sau: hai nhóm có tiêu đề và bảng riêng. Snapshot hiện tại đứng trước, không mang nhãn khoảng ngày. Kỳ đã tải thành công và cảnh báo thay đổi ô ngày chỉ nằm trong nhóm khách mới. Snapshot vẫn bao phủ phạm vi quyền hiện tại, khách mới vẫn theo ngày đã gửi; không cộng hai loại số thành tổng chung.

Giữ mặc định 30 ngày theo giờ Việt Nam, loading, lỗi/retry, xóa dữ liệu cũ và guard response đến muộn. Hai nhóm cùng được xóa khi tải/lỗi và cùng phục hồi khi thành công. Snapshot rỗng thành công dùng “Không có dữ liệu trạng thái hiện tại”; khách mới rỗng dùng “Không có dữ liệu trong kỳ”; request lỗi vẫn dùng “Chưa tải được dữ liệu”. Số đo 0 có dòng riêng, không biến lỗi thành 0. Export và thông báo lỗi giữ nguyên.

## Fixture và regression

Đây là **mock DOM**, không phải integration/DB/browser test. Vuetify được stub theo cấu hình spec hiện có.

- Clock giả của spec: `2026-11-01T18:30:00Z`, tức 01:30 ngày 02/11 tại Việt Nam; kỳ mặc định `2026-10-04 – 2026-11-02`.
- Response mock của Khách hàng: snapshot `new=9`, `won=0`, khách mới trong kỳ `2`; snapshot có khách ngoài kỳ nên khác tổng khách mới. Kiểm tra từng nhóm độc lập, không gộp số.
- Đổi ô ngày sang 01/11 khi chưa gửi: giữ kỳ thành công cũ và cảnh báo; khi gửi thì xóa cả hai bảng, ẩn kỳ trong lúc tải. Response mới: snapshot vẫn 9, khách mới 0, kỳ mới 01/11–01/11.
- Lỗi 503 xóa cả hai bảng và nhãn kỳ; retry với response rỗng hiện đúng trạng thái rỗng riêng, nhãn kỳ trở lại.
- Race đổi tab/kỳ: response mới snapshot 4/khách mới 0 được giữ; response cũ 9/2 đến muộn không ghi đè bất kỳ nhóm hay nhãn kỳ nào.
- Bốn ca mới ở [`ReportsView.dom.spec.ts:147`](../../frontend/src/views/ReportsView.dom.spec.ts#L147), `:172`, `:204`, `:229`. **Toàn bộ thân 8 ca và assertion cũ giữ nguyên**, kiểm tra bằng so sánh nguyên văn với preimage (`assertion-preservation.json`).

## Lệnh và kết quả mới

Các lệnh chạy trong `F:\ZaloCRM-CorepViet\frontend`, dùng dependency/cấu hình hiện có.

| Lệnh / thời điểm | Kết quả thực tế | Log trong artifact |
|---|---|---|
| RED — `node node_modules/vitest/vitest.mjs run src/views/ReportsView.dom.spec.ts --reporter=verbose`, spec bổ sung trên runtime preimage | **4 FAIL / 8 PASS**, exit 1; đúng bốn ca mới về phân biệt nhóm | `red-reports-view.log` |
| GREEN — cùng lệnh trên runtime đã sửa, 17:37:17 | **12/12 PASS**, 1 spec, exit 0 | `green-reports-view.log` |
| `node node_modules/vitest/vitest.mjs run --reporter=verbose`, 17:37:50 | **161/161 PASS**, 20 spec, exit 0 | `frontend-tests.log` |
| `npm.cmd run build` (`vue-tsc -b && vite build`) | **PASS**, exit 0; vẫn có cảnh báo chunk lớn hơn 500 kB | `frontend-build.log` |

Không chạy lại toàn bộ backend cho thay đổi nhãn UI; không dựng DB, harness, browser hay container. Không mở `.env`/bí mật, gọi provider/AI trả phí hoặc gửi tin. Không có dịch vụ test của lượt này cần dừng; các tiến trình test/build đã thoát.

## Đính chính full backend suite

[`06-remediation-6b3.md:75`](06-remediation-6b3.md#L75) nay ghi đúng: full suite trước đó **FAIL 39 file / 9 test**, kèm 990 PASS / 20 SKIP trong log cũ. **Chưa chạy baseline tương ứng, nguồn gốc chưa xác minh.** Một số lỗi có dấu hiệu ngoài phạm vi patch (module thiếu, chuỗi thương hiệu, timeout), nhưng chưa đủ căn cứ kết luận tất cả là lỗi có trước.

Nhận định “Coi là có từ trước” đã được rút lại, với đính chính tại dòng 77; số liệu/log gốc và preimage được giữ nguyên. Không chỉnh artifact hoặc xóa test lỗi. Đối chiếu baseline có kiểm soát là phần cần hoàn tất trong lượt kiểm tra độc lập; không lấy kết quả frontend làm bằng chứng giải thích backend FAIL.

## Giới hạn, gate và đầu vào cho B

- A đã hoàn tất phần sửa này và tự kiểm tra đạt; **chưa xác minh bằng browser/Vuetify thật** việc hiển thị hai bảng, phân trang và các chiều rộng. Không gọi kết quả DOM là nghiệm thu 5B/6B.
- **5B/6B chờ tái kiểm độc lập trên toàn bộ patch hiện tại**, gồm remediation F3/F4/F6B3 và nhãn snapshot này; không dùng lại số PASS cũ như kết quả mới. Giữ lịch sử các lượt 6A/FAIL trước. **7A/7B NOT_STARTED.**
- **E-1/O-1 còn tồn đọng** như checkpoint trước: 28 bảng `org_id` chưa có policy RLS và kiểm role JWT ở automation/broadcast. Không sửa trong lượt này; cần xử lý quyết định phát hành trước 7A.
- Đầu vào source: HEAD trên + working tree được ghi hash, diff nhãn và checkpoint này; đọc thêm `05-mobile-remediation-4.md`, `06-remediation-6b3.md`, `06-remediation-6b3-review.md`, `05-mobile-verification.md`, `06-acceptance-verification.md`.
- **B/5B:** chạy đủ hồi quy 9 danh mục, quyền/khả năng truy cập, contrast, loading/error/retry/race/0-null-unavailable, mobile/desktop, F3 tại CSS 1099,x và F4 tại 767,x bằng viewport thật. Kiểm tra hai nhóm Khách hàng, nhãn kỳ sau đổi ô ngày/gửi request, phân trang riêng và export.
- **B/6B:** kiểm lại DB/RLS/JWT/HTTP/API theo role/main/shared/cross-org, canonical và attribution; đối soát cơ bản/Excel/custom/saved và các nhóm bị ảnh hưởng. Dùng fixture có snapshot khác tổng khách mới trong kỳ. Expected theo contract phải được chứng minh độc lập; giữ nguyên log/expected legacy và giải thích từng thay đổi, không nới assertion để đạt số PASS.
- **B phải chạy lại `6a3-api-acceptance` và Engagement**, nhất là `contactEngagementDaily` phạm vi org có contact đã gộp: remediation trước thay định nghĩa nguồn này nhưng chưa chạy lại acceptance tương ứng. Định vị helper theo tên hiện có, không suy lệnh từ báo cáo cũ.
- **Baseline full backend:** so preimage tương ứng trước remediation với source mới bằng cùng cấu hình và môi trường cô lập an toàn; không reset/stash checkout đang có thay đổi. Phân loại riêng 39 file/9 test, xác định lỗi có trước hay phát sinh bằng kết quả thực tế. Không đủ preimage/môi trường thì ghi BLOCKED phần đó, không kết luận “có từ trước”. Trước bất kỳ phép ghi DB, xác minh disposable/local-test chuyên biệt và app role không vượt RLS; không dựa vào DATABASE_URL mặc định.

Lượt này dừng tại bàn giao A; không tự thực hiện các bước B nêu trên.
