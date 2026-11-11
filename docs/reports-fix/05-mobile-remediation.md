# Sửa F1/F2 sau kiểm tra 5B

**02/11/2026 08:51 (+07), Asia/Ho_Chi_Minh — COMPLETED_PENDING_VERIFICATION.** Tự kiểm tra bản sửa: **PASS trong phạm vi bên dưới**. Cần người kiểm tra chạy lại **5B** trên patch hiện tại; chưa có PASS độc lập mới, chưa đủ gate6A.

Working tree chưa commit tại HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`. Phạm vi bản sửa này chỉ có **2 file runtime frontend** so với snapshot bắt đầu lượt sửa. [Source integrity](../../artifacts/reports-mobile-5b-fix-2026-11-02/source-integrity.json): **831/833 file source/test giữ nguyên hash**, hai file khác là `DefaultLayout.vue` và `report-kit.css`. Không sửa backend runtime/schema/KPI/quyền API. Git diff với HEAD còn bao gồm các patch AI/TikTok/report/RLS từ trước; không nhận toàn bộ diff đó là patch của lượt này. [Git status trước sửa](../../artifacts/reports-mobile-5b-fix-2026-11-02/git-status-before.txt), [preimage hai file](../../artifacts/reports-mobile-5b-fix-2026-11-02/before/).

[5B FAIL lúc08:24](05-mobile-verification.md) và các ảnh/JSON cũ được giữ nguyên. **Kết quả verification đó thuộc snapshot trước sửa, đã hết hiệu lực để nghiệm thu working tree hiện tại**. Các kết quả tự kiểm tra sau đây không ghi đè hoặc nâng kết luận5B thành PASS.

## Phạm vi, hành vi trước/sau và source đã đối chiếu

| Finding | Trước sửa | Sau sửa | Bằng chứng source hiện tại |
|---|---|---|---|
| F1, header compact | 768/1024px tràn318/62px; Reports/Settings/tài khoản bị cắt | 768–1099px gom các tab chính vào menu **Điều hướng**; Báo cáo/Cài đặt/actions giữ trên header; overflow0, không control header ngoài viewport | `frontend/src/layouts/DefaultLayout.vue:15` nav có label, `:17` menu dùng lại `visiblePrimaryTabs`, `:173` state và `:177` đóng khi điều hướng, `:446` ẩn mặc định, `:512` CSS chỉ áp `.rpt-app` trong768–1099 |
| F2, chữ report desktop | Empty2,64:1; active tab4,05:1; nhãn/period4,25–4,36:1 | Muted/faint `#526576` cho mọi viewport report, active tab `#0b5880`; giữ underline thương hiệu, selected/focus/disabled | `frontend/src/assets/report-kit.css:5` token chữ; `:109` empty dùng token; `:117` active tab dùng brand-700 |

Empty desktop nay **6,03:1**, active tab **7,72:1**, period chưa chọn trên `#f8fafc` **5,76:1**. Các tỷ lệ lấy từ computed styles của bản build thật, không suy ra từ screenshot. [Mẫu màu/font/ratio](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/contrast.json).

Menu mới dùng cùng mảng quyền của nav cũ, không sao chép policy sang một danh sách riêng. Tại viewport ngoài compact hoặc route ngoài report, nút Điều hướng ẩn; đã thử quay Dashboard bằng Enter và xác nhận7 liên kết gốc còn hiển thị, overlay đóng. Giới hạn wordmark160px và kích thước action44px ở compact giúp giữ chỗ cho tài khoản. Menu Report vẫn9 danh mục admin/6 leader; không coi menu là backend authorization.

## File/test mới và fixture

- Runtime sửa: `frontend/src/layouts/DefaultLayout.vue`, `frontend/src/assets/report-kit.css`.
- Helpers kiểm chứng mới: `backend/scripts/reports-verification/5b-fix-{setup,server,base-checks,automation-fixtures}.ts`. Tách artifact path khỏi5B cũ; setup dùng tin giả00:30/00:31 giờ VN đã xảy ra trước lúc test. Không sửa helper/bằng chứng5B cũ.
- Regression mới: `backend/scripts/reports-verification/5b-fix-browser-assertions.mjs:1`. Khẳng định hành vi đúng trên **quan sát DOM browser mới**, kèm đối chứng âm từ geometry/contrast FAIL5B cũ. **62/62 assertion PASS**: 3 đối chứng âm,3 coverage,34 geometry,11 nhóm contrast,11 tương tác. Đây là replay assertions trên bằng chứng, **không phải62 ca browser end-to-end mới** và không thay thế việc capture mới khi patch đổi.
- Artifact riêng: `artifacts/reports-mobile-5b-fix-2026-11-02/`, gồm logs, baseline, geometry, contrast, interactions, source hash và12 ảnh PNG. [Hàm đo geometry](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/measure-geometry.js), [hàm đo contrast](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/measure-contrast.js) lưu để tái lập trong CUA read-only evaluate.
- Tài liệu sửa: checkpoint này, `05-mobile.md`, `docs/reports-fix/README.md`, README gốc. Bản verification5B cũ giữ nguyên.

Trước DB write đã kiểm tra container **`f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`**, label `codex.task=reports-1b-local-verification`, chỉ bind `127.0.0.1:55471`, data tmpfs, không mount dữ liệu khác. Sau start, truy vấn read-only trả **`reports_1b_verify|postgres|0`** bảng public. Sau đó mới db push bằng config explicit và seed fixture giả. Lần probe ngay sau start ban đầu chưa có socket vì PostgreSQL đang khởi động; không ghi gì ở lần probe đó. Không dùng DATABASE_URL mặc định hoặc .env làm bằng chứng an toàn.

Harness chỉ listen `127.0.0.1:30571`; không import app bootstrap/queue/cron/socket/provider/send. JWT secret chỉ sinh trong RAM, không ghi token. `reports_verify_app` NOSUPERUSER/NOBYPASSRLS, các bảng kiểm tra bật FORCE RLS. Fixture `verify-org-a/b`, admin/leader/member/nick/conversation/message giả; Automation có4 lời mời/1 đồng ý và3 lượt bám đuổi/1 phản hồi. [DB identity/RLS](../../artifacts/reports-mobile-5b-fix-2026-11-02/db-setup.json). Schema tạo bằng **Prisma db push**, không phải kiểm tra replay migration.

## Lệnh và kết quả thực tế

Chạy trong `frontend/`:

```powershell
node node_modules/vitest/vitest.mjs run src/views/reports/ReportMobile.dom.spec.ts src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts
npm.cmd run build
```

**8 spec,51/51 tests PASS** lúc08:38; không sửa assertion có sẵn. **vue-tsc + Vite PASS**, build cuối sau chỉnh cascade CSS nút compact. Còn warning chunk>500kB. [Test log](../../artifacts/reports-mobile-5b-fix-2026-11-02/frontend-tests.log), [build log](../../artifacts/reports-mobile-5b-fix-2026-11-02/frontend-build.log). Không chạy full backend unit suite vì backend runtime không đổi.

`git diff --check -- frontend/src/layouts/DefaultLayout.vue frontend/src/assets/report-kit.css` **PASS**. Khi gộp cả README có thay đổi từ trước, Git báo `README.md:673: new blank line at EOF`; patch lượt này chỉ chèn cập nhật đầu README, không sửa phần EOF nằm ngoài phạm vi. Không sửa các thay đổi có trước để làm sạch cảnh báo đó.

Chạy trong `backend/`, chỉ sau preflight disposable DB đã nêu:

```powershell
node node_modules/prisma/build/index.js db push --config ../artifacts/reports-mobile-5b-fix-2026-11-02/prisma-disposable.config.mjs
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fix-setup.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fix-server.ts
# Sau khi server sẵn sàng, trong process khác:
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fix-automation-fixtures.ts
# Sau khi thu thập mới và lưu DOM/ảnh bằng CUA:
node scripts/reports-verification/5b-fix-browser-assertions.mjs
```

**Baseline JWT/RLS/HTTP15/15 PASS** ngay lần chạy fixture này. **Automation/Broadcast2/2 PASS**. Không chạy lại AI14/capability33 hoặc full DB acceptance; các số đó ở5B cũ không được tính là run mới. [Baseline](../../artifacts/reports-mobile-5b-fix-2026-11-02/results.json), [Automation/Broadcast](../../artifacts/reports-mobile-5b-fix-2026-11-02/automation-broadcast-db-results.json), [regression assertions62](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser-regression-results.json).

## Kiểm tra trình duyệt mới

Browser: **ChatGPT IAB/Chromium**, CSS viewport đo từ `innerWidth`, không lấy kích thước override làm kết quả. DevicePixelRatio≈1,33. Đăng nhập bằng UI với tài khoản fixture, gọi report endpoint thật qua JWT/Prisma/app role/RLS; không dùng mock metrics/ảnh AI.

| Hạng mục | Kết quả mới |
|---|---|
| AI768/1024/1100/1440 | **4/4 PASS**: page/app/content overflow0; không control header ngoài viewport |
| Overview/Sale/Automation1440 | **3/3 PASS** geometry; desktop vẫn dùng nav gốc |
| Mobile320/390/430,9 danh mục | **27/27 PASS**: page/content overflow0, không enabled target dưới≈44px, không report alert |
| Contrast sampled | **469/469 PASS**,11 nhóm: AI4 widths,3 view desktop khác,4 view mobile390 |
| Tương tác nav/quyền | **11/11 PASS**: Enter mở menu7 links admin; ArrowDown vào Dashboard; Escape đóng/restore focus; Settings và account mở ở768; Enter điều hướng và đóng overlay, scope ngoài report giữ nav cũ; menu chính1024; Reports9 mục1024 và đóng sau chọn; leader chỉ4 primary links được phép và6 report, không có3 report admin-only |

[Geometry34](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/geometry.json), [contrast](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/contrast.json), [11 tình huống](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/interactions.json).

Ảnh mới đã xem: [AI768](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/fix-ai-768.png), [menu compact768](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/fix-primary-menu-768.png), [AI1440](../../artifacts/reports-mobile-5b-fix-2026-11-02/browser/fix-ai-1440.png). Không tính số ảnh thành số test.

## Tiêu chí, giới hạn, rủi ro và bước tiếp

F1/F2 **đạt tự kiểm tra local** với đối chứng lỗi cũ và source hiện tại. Chưa PASS độc lập5B. Contrast chỉ lấy các selector chữ chính trên nền solid sau ghép alpha; không phải chứng nhận WCAG toàn app. Touch44px đã kiểm tra mobile; không tuyên bố toàn bộ control desktop đạt44px. Không test Safari/iPhone/PWA thật, bàn phím ảo/notch, migration replay, tải/query plan hoặc production.

Môi trường test đã dừng lúc08:49:56: đúng2 process Node của harness bị dừng, port30571 không còn listener, container trở về **exited**; browser logout, reset viewport và đóng tab tạm. [Cleanup](../../artifacts/reports-mobile-5b-fix-2026-11-02/cleanup.json). Không commit/push/deploy hoặc gọi AI/gửi Zalo/Telegram.

**Bước tiếp: tái kiểm tra độc lập5B** theo prompt hiện hành, bắt đầu từ finding F1/F2, snapshot/hash mới và kiểm tra tích hợp mobile liên quan. B chưa PASS thì chưa bắt đầu6A.
