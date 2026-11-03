# Remediation sau 6B lần 3 — F6B3-1, F6B3-2, F6B3-3

**Trạng thái: COMPLETED_PENDING_VERIFICATION.** Lượt A, 02/11/2026 17:02–17:20 (+07). Đây là tự kiểm tra của lượt sửa, chưa phải kiểm tra độc lập 6B. 6B **không** tự chuyển thành PASS; 7A/7B NOT_STARTED. Không commit/push/deploy. F4 của 5B nằm ở checkpoint riêng [05-mobile-remediation-4](05-mobile-remediation-4.md) (cùng lượt và cùng artifact).

## Đầu vào và phạm vi

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, working tree dirty sẵn (1019 dòng `git status -uall` lúc bắt đầu), giữ nguyên.
  - 971/971 file `frontend/src`, `backend/src`, `backend/tests`, `backend/prisma` trùng snapshot 6A chạy lại 15:00, tức lượt 6B3 không sửa source.
  - Không reset/stash/worktree/agent, không thêm dependency.
- Đã đọc: prompt A/B, `00-contract.md` (mục 5.1, dòng 118), `06-acceptance-verification.md` (finding F6B3-1/2/3, E-1, O-1), `06-acceptance-report-review.md`, `05-mobile-verification.md`, `05-mobile-remediation-3.md`, README roadmap và source thực tế.
  - Repo không có `AGENTS.md`. Skill `vue-best-practices` không có trong phiên; áp dụng quy ước Composition API sẵn có trong file.
- Artifact riêng: [artifacts/reports-fix-f4-6b3-20261102-1702](../../artifacts/reports-fix-f4-6b3-20261102-1702/). Gồm preimage và SHA, `patch.diff`, git status trước/sau, `source-integrity.json`, log RED/GREEN, test/build, oracle, browser, cleanup.

## F6B3-1 — định nghĩa canonical thống nhất

**Trước:**
- Nhánh org của `reportModelWhere`/`contactReportSql` không loại contact đã gộp (merged).
- `messageReportSql` (mọi scope) không loại tin local/deleted/dry-run/test và hội thoại ảo.
- Hệ quả: báo cáo cơ bản, Excel, custom và saved report của admin lệch contract (ngày 01/11 ra 18 tin gửi và 8 contact mới, trong khi contract cho 13 và 6).

**Sau** (`backend/src/modules/dashboard/report-scope.ts`):

| Dòng | Thay đổi |
|---|---|
| 56–61 | Nhánh org: `contact` thêm `mergedInto: null`; `contactEngagementDaily` lọc `contact.mergedInto = null`; các model khác giữ `{orgId}` |
| 81 | `contactReportSql` nhánh org thêm `merged_into IS NULL` (nhánh phòng ban vốn đã có) |
| 84–88 | Hàm mới `canonicalMessageSql()`: `c.zalo_account_id IS NOT NULL AND c.is_virtual = false AND m.is_local = false AND m.is_deleted = false`, loại `metadata.dryRun`/`metadata.test` = 'true'. Dùng đúng các điều kiện mà `report-analytics-routes.ts:32–36` và `:161–164` đã áp cho Overview |
| 92–94 | `messageReportSql` áp `canonicalMessageSql()` cho cả 3 nhánh (org, people, main) |

Vì dùng chung helper, cùng một định nghĩa chảy qua:
- `report-routes.ts` (`/reports/messages`, `/contacts`, `/appointments`);
- `excel-sheet-builders.ts` (export);
- `analytics/reports/custom-report.ts` (custom và saved-run);
- `team-performance.ts`, `conversion-funnel.ts`.

Giữ nguyên:
- orgId, quyền phòng ban, main/shared (`accountIds` / `readableAccountIds`);
- bucket "Chưa xác định nhân viên" cho tin vào.
- Không lọc theo `sent_via`, nên tin AI/bot hợp lệ vẫn được đếm (có test riêng).
- Không lọc `threadType`: contract chỉ loại group khi metric ghi rõ 1–1; báo cáo cơ bản không ghi như vậy, trùng cách hiểu của oracle 6B3.

## F6B3-2 / F6B3-3 — `/reports-co-ban` (`frontend/src/views/ReportsView.vue`)

| Trước | Sau |
|---|---|
| `catch` chỉ `console.error`; bảng cũ vẫn hiện khi request lỗi | Mỗi lần tải xóa dữ liệu tab đang xem. Lỗi hiện `v-alert` (`role="alert"`) với "Thử lại"; bảng ghi "Chưa tải được dữ liệu" thay vì "không có dữ liệu". Lỗi 400 `invalid_report_date_range` có thông báo riêng |
| Không chặn response cũ về muộn | `requestId`: response đến muộn của kỳ/tab cũ không ghi đè dữ liệu, `loading` hay nhãn kỳ |
| Không có nhãn kỳ | "Kỳ dữ liệu: from – to · Giờ Việt Nam" lấy từ response. Nếu ô ngày đã đổi mà chưa bấm "Xem" thì báo "Khoảng ngày đã đổi" |
| Đọc `treatmentProgress`/`medicationStatus` (không tồn tại) | Đọc `byStatus` thật; đặt các dòng trạng thái lên trước danh sách theo ngày vì danh sách theo ngày phân trang |
| Mặc định `toISOString()` (UTC) lùi 30 ngày, ra 31 ngày | `vietnamDateRange(30)`: 30 ngày VN tính cả hôm nay, kể cả khung 00:00–06:59 VN |
| Lỗi export bị nuốt | Thông báo "Không xuất được file Excel"; tên file và request mang đúng kỳ đã gửi |

Số 0 hiển thị là 0. Bảng trống sau khi tải thành công ghi "Không có dữ liệu trong kỳ". API báo cáo cơ bản không trả `null`/unavailable, nên trang này không có trạng thái unavailable.

## RED / GREEN

| Bộ test | RED (code cũ) | GREEN (patch) |
|---|---|---|
| `backend/tests/unit/report-scope-postgres.test.ts` (PGlite). Thêm 3 ca: org canonical giữ tin AI, phòng ban loại local/deleted/dry-run/test/virtual, org loại merged ở SQL và Prisma | 5 fail / 2 pass. Gồm 2 ca cũ, vì fixture mới có thêm row local/dry-run trên cùng nick (`red-backend-canonical.log`) | scope-postgres + scope-policy **18/18** (`green-backend-canonical.log`) |
| `frontend/src/views/ReportsView.dom.spec.ts` (mới, 8 ca): 30 ngày VN lúc 01:30 VN, byStatus, 503 + thử lại, response kỳ cũ về muộn, đổi tab nhanh, nhãn kỳ đã đổi, lỗi export, lỗi khoảng ngày | **8/8 fail** khi chạy trên bản sao preimage (`red-reports-view.log`) | **8/8** |

Lần đầu tôi định chép preimage đè lên file thật để chạy RED nhưng bị `Permission denied`, nên log đó vẫn chạy trên bản patch. Lần đó không được tính là RED; RED hợp lệ chạy trên một bản sao tạm của preimage, đã xóa sau khi chạy.

Bốn file test PGlite (`report-scope-postgres`, `report-1b-reverification-http`, `report-1b-review-evidence`, `report-period-query-boundary`) dùng schema thu gọn. Tôi chỉ thêm các cột canonical (`is_virtual`, `is_local`, `is_deleted`, `metadata`) có giá trị mặc định, nên row cũ vẫn là row hợp lệ. Không đổi hay xóa assertion. Lần chạy đầu trước khi thêm cột bị 6 fail do `column c.is_virtual does not exist` (`backend-tests-app-role-attempt1-mini-schema.log`).

## Test, build và DB/HTTP

| Lệnh | Kết quả |
|---|---|
| `frontend`: `vitest run` toàn bộ | **20 file, 157/157 PASS** (thêm 12 ca mới) |
| `frontend`: `npm.cmd run build` (`vue-tsc -b && vite build`) | PASS |
| `backend`: 16 file report/scope/AI/custom/tenant/characterization, app role trên DB disposable | **16 file, 104/104 PASS** |
| `backend`: `tests/security/refresh-token-service.test.ts`, owner trên DB disposable | **10/10 PASS** |
| `backend`: `npm.cmd run build` (`tsc`) | PASS |
| `backend`: `vitest run` toàn bộ (tham khảo) | **FAIL: 39 file / 9 test; 990 pass / 20 skip. Nguồn gốc chưa xác minh.** Log có lỗi module thiếu, chuỗi thương hiệu "HS Holding" và timeout; một số có dấu hiệu ngoài phạm vi patch nhưng chưa đủ căn cứ kết luận tất cả là lỗi có trước. Chưa chạy baseline full tương ứng trên preimage để so (`backend-tests-full.log`) |

**Đính chính 02/11/2026, lượt sửa nhãn snapshot:** nhận định trước “Coi là có từ trước” được rút lại vì chưa có baseline. Số liệu và log full suite gốc giữ nguyên; không chạy lại toàn bộ backend trong lượt sửa nhãn UI. Đối chiếu baseline an toàn và phân loại nguyên nhân là việc cần hoàn tất trong lượt kiểm tra độc lập. Xem [checkpoint nhãn snapshot](06-remediation-snapshot-label.md).

**DB disposable:**
- Container `reports-fix-f4-6b3-20261102` (`609dec0a…`, postgres:15-alpine, tmpfs, 127.0.0.1:55531, không mount); xác minh rỗng trước khi ghi.
- Prisma db push (không replay migration), `tenant-rls.sql` hiện hành.
- App role `reports_6b3_app` NOSUPERUSER/NOBYPASSRLS, sở hữu 0 bảng.

**Oracle độc lập của 6B3, chạy lại, không sửa:**
- Chạy đúng chuỗi lệnh của 6B3: `6b-fixture.ts`, `6b-prisma-boundary.ts 2026-11-01 2026-10-31`, `6b-pg-default-skew.mjs`, `6b-server.ts` (app role, RLS_SET_CONFIG, guard enforce), `6b-api-oracle.ts`.
- Kết quả: **694/710**. **Mọi nhóm `*-contract` đạt 60/60** (basic 30, export 20, custom 3, saved 7); lượt 6B3 chỉ đạt 46/60.
- 16 ca lệch còn lại đều so với định nghĩa **legacy** cũ (18 tin / 8 contact). Đây là hành vi cũ đã được sửa có chủ đích; không có lệch nào khác.
- Quyền 179/179, cross-org vẫn bị chặn (2 ca "cross-org" lệch chỉ vì so giá trị org X theo định nghĩa legacy).
- Hai lần chạy bị thay thế giữ lại: oracle lần 1 thiếu thư mục `excel/`; lần 2 chưa chạy bước seed `6b-prisma-boundary`, làm 3 ca org Y lệch (`oracle-run1/`).

**Browser** (Chrome riêng, profile tạm, DSF 1,25, chuột/bàn phím CDP thật, build mới):
- Kỳ mặc định `2026-10-04 – 2026-11-02` (hôm nay VN 02/11).
- Lịch hẹn: 503 có kiểm soát → alert "Không tải được dữ liệu báo cáo…", **0 dòng cũ** còn hiển thị, không có nhãn kỳ; "Thử lại" → 4 dòng trạng thái và nhãn kỳ quay lại.
- Ảnh: `basic-default.png`, `basic-fault.png`, `basic-contacts-bystatus-first-page.png` (contacted 2 / converted 1 / new 5 ở trang đầu).
- Đoạn đọc text tự động của ca contacts lấy nhầm bảng ẩn của tab trước; ảnh chụp là bằng chứng đúng, ghi rõ để B không dựa vào trường text đó.

## E-1, O-1 và rủi ro còn lại

- **E-1 còn nguyên:** 28 bảng có `org_id` chưa có policy RLS; các model chưa vào `ORG_SCOPED_MODELS`. Lượt này không chạm.
- **O-1 còn nguyên:** `automation-report-routes.ts:57` và `broadcast-report-routes.ts:43` vẫn kiểm role trong JWT. Lượt này không chạm.
- Đổi định nghĩa làm số Excel/custom/saved giảm so với trước. Đây là hành vi đúng contract, nhưng người dùng sẽ thấy số khác bản cũ; nên ghi vào ghi chú phát hành (7A).
- `contactEngagementDaily` ở phạm vi org giờ loại contact đã gộp. Có thể làm Engagement org lệch so với số đã nghiệm thu nếu dữ liệu có contact merged. Lượt này chưa chạy lại `6a3-api-acceptance`; B nên chạy lại.
- Không lọc `threadType` cho báo cáo cơ bản (giữ group). Nếu sản phẩm muốn chỉ 1–1 thì cần quyết định contract.

## Cleanup

17:19:
- Dừng harness PID 12856 và 33024; dừng 16 process Chrome của 2 profile tạm (đã xóa profile).
- Xóa container `reports-fix-f4-6b3-20261102`; listener 55531/55532/9352/9353 = 0; reset `scenario.json`.
- Không đụng `reports-1b-verify-20261101` hay `sketchup-api-1`.
- Source/test so với lúc bắt đầu: 962/971 giữ hash; 9 file đổi đúng như danh sách và 2 spec mới (`source-integrity.json`).

## Bước tiếp

B kiểm tra độc lập lại 6B (nhóm C và mọi nhóm bị ảnh hưởng bởi định nghĩa canonical, gồm chạy lại `6a3-api-acceptance`) và 5B trên patch này. Quyết định E-1/O-1 trước 7A. 7A/7B NOT_STARTED.
