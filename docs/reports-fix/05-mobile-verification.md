# Bước 5B — Kiểm tra độc lập giao diện Báo cáo

<a id="recheck-e1o1-20261102-2052"></a>

## Tái kiểm độc lập sau E-1/O-1 — 02/11/2026, 20:52–22:16 (+07): **PASS local**

Kiểm tra B trên working tree hiện tại, HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, không có commit mới. **975/975** file trong frontend/src, backend/src, backend/tests và backend/prisma giữ nguyên SHA256, không có file nguồn thêm hoặc mất. Không sửa runtime/assertion của dự án. Chỉ thêm helper/bằng chứng B và cập nhật tài liệu. Kết quả trước đây giữ nguyên ở bên dưới; không dùng PASS cũ làm bằng chứng trên patch E-1/O-1. **7A/7B NOT_STARTED.**

Artifact mới: [reports-5b6b-e1o1-20261102-205238](../../artifacts/reports-5b6b-e1o1-20261102-205238/). Có git status, preimage, hash, lệnh/log, JSON, ảnh, Excel, helper provenance và cleanup. Đã đối chiếu quy tắc chung/contract/checkpoint/source và áp dụng vue-best-practices. Không tìm thấy AGENTS.md trong repo/ancestor; áp dụng chỉ dẫn AGENTS người dùng cung cấp. Không giao agent, tạo worktree, commit, push hoặc deploy.

### Bằng chứng source đã kiểm trong lượt này

| Hành vi | File và dòng hiện tại |
|---|---|
| F3: đóng menu theo media query; trả focus sau leave khi còn mounted, đúng route, target connected và hiển thị | [use-report-compact-navigation.ts:23–46](../../frontend/src/composables/use-report-compact-navigation.ts), [DefaultLayout.vue:17 và :175–178](../../frontend/src/layouts/DefaultLayout.vue) |
| F4: layout mobile dùng phần bù breakpoint768, không dựa vào innerWidth làm tròn khi có matchMedia | [use-mobile.ts:9 và :17–33](../../frontend/src/composables/use-mobile.ts), [report-kit.css:147](../../frontend/src/assets/report-kit.css), [airtable.css:540 và :558](../../frontend/src/assets/airtable.css) |
| Snapshot và khách mới có section riêng; kỳ thành công chỉ gắn nhóm khách mới; requestId loại response cũ | [ReportsView.vue:64, :73 và :158–203](../../frontend/src/views/ReportsView.vue) |
| Snapshot không lọc ngày; newPerDay theo kỳ | [report-routes.ts:96–121](../../backend/src/modules/dashboard/report-routes.ts) |
| Automation/Broadcast lấy owner/admin hiện tại từ DB; menu vẫn là lớp UI riêng | [report-scope.ts:18–26](../../backend/src/modules/dashboard/report-scope.ts), [automation-report-routes.ts:56–59](../../backend/src/modules/automation/automation-report-routes.ts), [broadcast-report-routes.ts:45](../../backend/src/modules/broadcast/broadcast-report-routes.ts) |

### Browser và regression mới

Chrome/156.0.8078.74 headless trên Windows, build mới của lượt B, DSF1.33. Đăng nhập UI bằng fixture thật; thao tác chuột/bàn phím CDP. JS chỉ đọc DOM/network/geometry, không ép innerWidth, matchMedia, field value, auth storage hoặc Vue state. Đây không phải thiết bị iPhone/Safari thật hoặc kiểm thử OS scale của Windows.

| Phạm vi | Kết quả và bằng chứng mới |
|---|---|
| Bố cục | **40/40**: 9 danh mục ×320/390/430/1440, thêm768/1024/1099/1100; không tràn ngang hoặc nav ra ngoài. `browser/geometry-raw.json`, 40 ảnh |
| Contrast và touch | **82/82 avatar**, tối thiểu **5.83:1**; **789/789** mẫu chữ chính đạt. Không có mobile target dưới ngưỡng trong phép đo. `avatar-contrast.json`, `main-contrast.json`; geometry runner tổng44/44 check |
| F1/F3 và focus | Menu đóng tại1100/1440; quay lại compact không tự mở; Escape trả activator; rời report và chuyển MobileLayout không để overlay. **F3 2/2 tại CSS1099.248px, innerWidth1099**, media query compact=false; focus nút Báo cáo, Tab sang Cài đặt. `browser/boundaries-results.json`: **12/12** |
| F4 | CSS thực766.165 /767.669 /768.421px: MobileLayout dưới768, desktop trên768; không khe hở/tràn ngang. Cùng artifact boundaries, không sửa getter trong trang |
| Tải/lỗi/thử lại | **27/27** trên9 danh mục: pending thật do harness delay; HTTP503 hiện lỗi/thử lại; retry lấy response DB thật. Sáu ca response cũ của bộ chung đạt. `browser/loadstates-results.json` |
| Đổi kỳ khác nhau theo màn hình | Tổng quan: response30ngày về sau response hôm nay, UI vẫn hôm nay, **2/2**. Automation: request7ngày cũ bị huỷ/hoàn tất nhưng giữ kỳ hôm nay, **1/1**. AI: request cũ bị huỷ, giữ kỳ7ngày. Engagement: khoá nút kỳ lúc pending, đổi được sau tải, **2/2**. `browser/automation-race-results.json`, `rerun2/browser/races-results.json`, `rerun2/browser-results.json` |
| Báo cáo cơ bản | **9/9**: snapshot8 khác khách mới6; snapshot vẫn ở trên sau phân trang; ô ngày chưa gửi không đổi nhãn kỳ; zero giữ snapshot; lỗi/loading xoá cả2 nhóm/nhãn; retry phục hồi; response cũ bị bỏ; export lỗi có thông báo. `rerun2/browser/snapshot-results.json` |
| Điều hướng/API9 danh mục | **10/10** gồm đủ9 route, mỗi route có response API200 mới, không alert. `rerun2/browser/categories-results.json` |
| Drill-down và quyền UI | Drill-down **3/3** đóng bằng Escape, bàn phím và nút, đều trả focus opener. Trưởng/phó phòng có grant xem nhóm được phép; Automation/Broadcast/Audit bị chuyển về `/`. Member và deputy thiếu grant không có menu/quyền route. Admin orgY xem tổ chứcY. Các direct API denial/cross-org kiểm riêng trong6B |
| AI theo quyền | **4/4** tài khoản: nhãn kỳ/scope khớp API; chỉ fixture deputy có sharedAccount mới hiện phần nick được cấp thêm. Zero thật có nhãn0, null/unavailable có nhãn thiếu dữ liệu. `rerun2/browser-extra-results.json` |
| Frontend | **161/161**,20spec; `npm.cmd run build` gồm vue-tsc/vite **PASS**. Giữ cảnh báo chunk>500kB. Log mới tại `logs/frontend-*` |

Đã xem trực tiếp ảnh mobile390, F3 fractional, snapshot8/6 và ảnh lỗi đăng nhập của lần thử đầu. Các phép đo DOM không được gọi là DB integration; các số API/quyền được đối soát riêng trong [6B cùng lượt](06-acceptance-verification.md#recheck-e1o1-20261102-2052).

### Những lần chưa đạt được giữ nguyên

Bộ chung loadstates ghi33/36, không được gọi36/36: Automation mặc định7ngày khiến stimulus30ngày không khớp; Engagement khoá đổi kỳ lúc đang tải; AI huỷ request cũ nên không có response cũ200 về cuối. Bộ riêng sau đó kiểm đúng ba hành vi này; generic Automation trong rerun2 vẫn có oldRequests=[] và được ghi là stimulus mismatch, không phải một ca race PASS. Lần races/snapshot đầu lỗi login vì driver nhập trước layout ổn định; ảnh cho thấy email trống. Các helper đầu khác cũng lỗi target login. Giữ mọi JSON/log/ảnh; rerun2 chỉ tăng chờ layout, viewport đầu và đổi output, không nới assertion dự án. Chi tiết ở `commands.md` và `rerun2/provenance.txt`.

Runner flow ghi allApi200=false vì bấm lại Tổng quan đang mở không tạo request mới; không dùng cờ này làm PASS. Helper categories riêng điều hướng lại từng trang và đo response mới đạt10/10. AI không có `.rpt-context` như selector của flow cũ; nhãn/scope được đo lại đúng `.rpt-sub` ở4 tài khoản. Không xoá hoặc sửa kết quả cũ để che sai khác.

### Giới hạn, cleanup và bước tiếp

**PASS local5B** trong phạm vi Chromium/fixture đã mô tả. Chưa kiểm Safari/iPhone/PWA thật, staging/production hoặc hiệu năng với dữ liệu thật. Notifications/privacy/action-hub404 do harness không đăng ký; không kết luận lỗi production. Full backend suite chưa chạy mới trên E-1/O-1, giữ lịch sử FAIL; xem6B.

`cleanup.json`: dừng đúng2harness, Chrome/profile riêng và container tmpfs; không còn listener55571/55572/55574/55576/9364. Không chạm tài nguyên phiên khác. Không sửa implementation. Bước kế tiếp chỉ là chuẩn bị hồ sơ7A khi được yêu cầu; **7A/7B vẫn NOT_STARTED**, chưa release READY.

---

Cập nhật lượt B: 2026-11-02 19:42:05 +07:00. Working-tree verification, không có commit mới.

<a id="recheck-20261102-1804"></a>

## Tái kiểm độc lập sau F3/F4/F6B3/R-A-1 — 02/11/2026, bắt đầu 18:02 (+07): **PASS local**

Đây là lượt B, kiểm tra working tree sau remediation, không sửa runtime hoặc assertion của dự án. F3/F4 và nhãn snapshot đã có bằng chứng mới đạt. Kết luận chỉ áp dụng Chromium local với fixture và policy rollout hiện tại; không phải nghiệm thu iPhone/Safari/PWA hay production. Giữ nguyên mọi kết luận FAIL ở các mốc cũ. **7A/7B NOT_STARTED.**

### Patch, nguồn và tính toàn vẹn

- Workspace `F:\ZaloCRM-CorepViet`; HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`. Không có commit mới; phạm vi là working tree đang dirty được lưu trong `git-status-before.txt` và `git-status-after.txt` của artifact này. Không tìm thấy AGENTS.md trong repo/ancestor; đã đọc chỉ dẫn AGENTS do người dùng cung cấp, quy tắc chung, contract, các checkpoint liên quan và skill vue-best-practices.
- Artifact riêng: [reports-5b-6b-recheck-20261102-180400](../../artifacts/reports-5b-6b-recheck-20261102-180400/). `source-before.json` / `source-after.json` / `source-integrity-final.json` xác minh **973/973** file trong frontend/src, backend/src, backend/tests và backend/prisma giữ nguyên SHA256; không dùng HEAD làm thay thế snapshot working tree.
- F3: [use-report-compact-navigation.ts:23](../../frontend/src/composables/use-report-compact-navigation.ts) đóng menu theo media query; :29–36 chỉ trả focus sau leave khi còn mounted, còn ở report và target connected/hiển thị; :45–49 chặn unmount/late leave. [DefaultLayout.vue:17](../../frontend/src/layouts/DefaultLayout.vue) nối after-leave; :175–178 truyền chính phần tử nút.
- F4: [use-mobile.ts:9](../../frontend/src/composables/use-mobile.ts), :17–33 dùng phần bù media query 768px khi trình duyệt hỗ trợ; fallback innerWidth chỉ dành cho môi trường không có matchMedia. CSS cùng phần bù tại [report-kit.css:147](../../frontend/src/assets/report-kit.css), [airtable.css:540 và :558](../../frontend/src/assets/airtable.css).
- R-A-1: [ReportsView.vue:39](../../frontend/src/views/ReportsView.vue) không gắn kỳ chung vào tab khách; :63–80 tách hai section; :150–155 xóa cả hai bảng; :159–200 chống response cũ. Backend [report-routes.ts:96–109](../../backend/src/modules/dashboard/report-routes.ts) vẫn giữ newPerDay theo kỳ và byStatus snapshot không lọc ngày. Không thêm asOf giả.

### Ma trận browser mới

Chrome/156.0.8078.74, đăng nhập UI thật bằng fixture, build tạo trong lượt này; thao tác chuột/bàn phím CDP. JS trong trang chỉ đọc DOM/geometry, không sửa innerWidth, matchMedia hoặc state Vue. DSF1,33 tạo media query và CSS width lẻ thật; đây là Chrome trên Windows, không phải kiểm thử OS scale hoặc thiết bị iPhone thật.

| Phạm vi | Bằng chứng / kết quả |
|---|---|
| 9 danh mục | Tổng quan, Nick Zalo, Sale & Team, Pipeline & Lead Pool, Automation, Broadcast, Engagement, Audit & Hệ thống, AI. Lấy danh sách từ router/subnav hiện tại, không chỉ dựa checkpoint. |
| Bố cục | **40/40**: 9×320/390/430/1440 và Overview768/1024/1099/1100. Page/content không tràn ngang ngoài vùng cuộn riêng; nav không bị cắt. `browser/geometry-raw.json`, `geometry-results.json`, 40 PNG. Toàn mode geometry44/44 gồm category count, contrast và touch. |
| Touch | Các target mobile đo theo checklist44px; không suy tất cả nút desktop cũng đạt44px. Bảng/chart/heatmap cuộn riêng, bottom nav không che nội dung qua các luồng đại diện. |
| Contrast | **105/105 initials**, min **5,83:1**; **794/794 mẫu chữ** ở390/1440, min **4,56:1**. Lưu foreground/background, size, weight và threshold trong `browser/avatar-contrast.json`, `main-contrast.json`. Chỉ áp cho trạng thái đã render. |
| F3 | **2/2 lần** CSS **1099,2481689**, innerWidth1099, DPR1,33000004, compact media=false. Overlay đóng, focus đúng Reports, Tab sang Cài đặt. `browser/boundaries4-results.json`, ảnh `boundaries4-F3-1/2.png`. |
| F4 | CSS **767,6691895**, innerWidth768: MobileLayout, media mobile=true, không overflow. Đối chứng **766,1654053** mobile và **768,4210205** desktop. Có raw width/DPR/media và PNG riêng trong boundaries4. |
| Menu / keyboard | Mode boundaries4 **12/12**: mở compact bằng keyboard, 1100/1440 trả focus, về1024 không tự mở, Escape về Điều hướng, mở menu rồi chuyển766 không còn overlay, Enter rời report không kéo focus về Reports. Các guard target hidden/removed/unmount/late leave còn được kiểm bằng DOM tests; không gọi DOM là browser E2E. |
| Quyền UI và API | Admin9, leader/deputy có grant6, member/deputy thiếu grant không được vào report. Org Y chỉ hiện dữ liệu Y. Direct API được kiểm độc lập trong ma trận6B, không suy backend từ menu ẩn. `browser-results.json`, `browser-extra-results.json`; AI main/shared đúng kỳ/phạm vi trên4role. |
| Loading / lỗi / retry | Cả9 danh mục được kiểm request pending thật và lỗi503 có kiểm soát tại harness, sau đó tải lại. Pipeline trả partial status khi chỉ một trong hai API lỗi, giữ phần Lead Pool vừa tải thành công; nút Làm mới phục hồi. Không gọi partial là full error hoặc dữ liệu cũ. Raw ở loadstates3/4. |
| Đổi kỳ / stale | Overview/Nick/Sale/Pipeline/Broadcast/Audit giữ kỳ mới sau response cũ về muộn. Automation default7 ngày: ca riêng `automation-race-results.json` xác minh7 ngày→Hôm nay, old response không ghi đè. AI hủy request cũ: `races-results.json` có Network.loadingFailed canceled, kỳ mới giữ đúng. Engagement khóa nút khi loading; kiểm nút disabled, không nhận kỳ giả, rồi đổi kỳ sau khi xong. Không ép state để tạo race mà UI không cho phép. |
| 0 / null / detail | Automation/Broadcast0 khác unavailable; AI main/shared và các metric thiếu nguồn giữ nhãn; Overview/Sale hiển thị null có lý do. Sale drill-down3 lần, focus/Escape/quay lại và các vùng cuộn được ghi ở `browser-results.json`, `browser-extra-results.json` và ảnh. |

### R-A-1 / reports-co-ban: **9/9 browser PASS**

`browser/snapshot-results.json`, `logs/browser-snapshot.log`, `snapshot-*.png`:

1. Snapshot trạng thái ở bảng trên không đổi khi phân trang bảng khách mới bên dưới.
2. Đổi ô ngày chưa gửi giữ nhãn kỳ response thành công, hiện cảnh báo chưa bấm Xem; snapshot vẫn nói rõ không giới hạn theo kỳ.
3. Với D=2026-11-01: **snapshot8 khác newPerDay6**, hai nhóm/nhãn riêng; chỉ nhóm khách mới mang kỳ2026-11-01–2026-11-01.
4. Kỳ rỗng2000-01-01 có số0 thật, snapshot vẫn8.
5. Contacts503 xóa cả hai bảng, bỏ nhãn kỳ cũ, báo lỗi; empty error row không được tính là dòng số liệu cũ.
6. Thử lại khôi phục snapshot và số0 đúng.
7. Pending request xóa cả hai bảng và nhãn kỳ.
8. Slow D→tab/kỳ T: D về sau cùng không ghi đè snapshot/nhãn; T có1 khách mới.
9. Export503 hiện thông báo; request đúng from/to đã chọn. File Excel thật và giá trị được đối soát ở6B.

Ngày mặc định30 ngàyVN quan sát được2026-10-04–2026-11-02; nhánh00:00–06:59 được kiểm bằng frontend spec với clock giả, không gọi đó là quan sát browser lúc rạng sáng.

### Lệnh, kết quả và các lần thử cần giữ

- `frontend: node node_modules/vitest/vitest.mjs run --reporter=verbose`: **161/161**,20spec, exit0. `npm.cmd run build` (`vue-tsc -b && vite build`): exit0; cảnh báo chunk>500kB còn nguyên.
- `node <artifact>/browser/independent-ui.mjs <artifact> geometry|boundaries4|snapshot|loadstates3|loadstates4|races|automation-race`; fixture password chỉ truyền qua process env, không lưu vào artifact. Không cộng các mode/thử lại thành số journey độc lập. Chi tiết exit code và phạm vi tại `commands.md` và log.
- Giữ `boundaries` lần1 (width tạo sai;8PASS/4FAIL), boundaries2/3 không kết nối được CDP trước khi browser sẵn sàng. Chỉ boundaries4 đủ điều kiện F3/F4. Không biến chẩn đoán sai width thành lỗi sản phẩm.
- Loadstates1 dùng selector Hôm nay trên Sale vốn không có nút đó; loadstates2 chạm input trước hydrate; loadstates3 nhầm partial Pipeline với alert full error; loadstates4 giả định Automation default30 ngày/Engagement cho đổi khi tải/AI luôn nhận old response. Giữ nguyên các FAIL/log/ảnh. Các ca bổ sung sau đó xác minh điều kiện thật, không sửa assertion/test của dự án hoặc che kết quả cũ.
- `browser-results.json` có allApi200=false ở vòng9tab vì click lại Overview đang active không phát sinh request mới; initial Overview200 có trong HTTP log, geometry và retry/race mới cũng gọi200. Không coi đây là lỗi API hoặc tự sửa JSON thành true.

### Cleanup và giới hạn

DB/harness lần đầu đã biến mất khi tiếp tục lúc19:03; lưu `environment-interruption-1903.json`. Restart đúng container owned, xác minh cluster tmpfs rỗng rồi seed lại; các kết quả trước/sau gián đoạn giữ riêng, không gắn timestamp mới cho log cũ. `resume-1906/` có proof/setup mới. Tất cả đều cùng source hash.

Đã dừng harness/Chrome owned, xóa2 profile fixture và junction dependency của bản sao baseline (chỉ link), xóa đúng container tmpfs owned; ports55541/55542/55544/9354 không listener. `cleanup.json` success=true. Không đụng browser/container của phiên khác, không đọc secrets/.env trực tiếp, không gửi tin/gọi model/commit/deploy.

**5B PASS local trên patch được hash.** 6A giữ nguyên lịch sử đã chạy;6B được kết luận riêng ở mốc1804. E-1/O-1 và full backend suite FAIL vẫn cần theo dõi. Không mở7A/7B trong lượt này.

---


## Lịch sử trước lượt tái kiểm 18:04 (giữ nguyên)

**Kết quả bổ sung mới nhất —02/11/2026 16:51 (+07): FAIL vì F4, header tràn ở CSS width767,669px/innerWidth768. F3 đã PASS trên viewport lẻ thật.** Xem [bổ sung F4](#supplement-20261102-1651). Giữ lịch sử PASS local lúc13:39 và các FAIL trước đó. 6A đã chạy; 6B hiện FAIL theo checkpoint riêng, 7A/7B NOT_STARTED.

**02/11/2026 08:24 (+07), Asia/Ho_Chi_Minh — FAIL.** Có **2 finding P2** cần xử lý trước khi PASS5B. **Chưa đủ gate triển khai6A.** Mobile320/390/430, tương tác và quyền local đạt các kiểm tra bên dưới; không suy PASS toàn bộ từ các phần đã đạt.

Đối tượng: working tree tại HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, chưa commit. Đọc quy tắc chung, audit11/12, contract0, checkpoint4B/5A và source hiện tại. Dùng `web-design-guidelines`, `vue-best-practices`, `mobile-ux-optimizer`; đối chiếu design contract04. [Guidelines đã đọc mới](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) chỉ là tiêu chí review, không cấp quyền sửa/deploy.

**Không sửa implementation hoặc assertion của test có sẵn.** Source frontend/backend/tests giữ nguyên **833/833 hash** so với đầu5B. **57/57 artifact5A** giữ nguyên hash, gồm kết quả FAIL cũ. [Source integrity](../../artifacts/reports-mobile-5b-2026-11-02/source-integrity.json), [baseline source](../../artifacts/reports-mobile-5b-2026-11-02/source-before.json). Không reset/stash/commit/push/worktree/agent/deploy; giữ nguyên các thay đổi AI/TikTok/RLS có trước.

## Findings phải sửa

### F1 — P2: navigation compact bị cắt ở768–1024px

`frontend/src/composables/use-mobile.ts:5` và `:13`, `frontend/src/App.vue:30`: từ768px ứng dụng dùng DefaultLayout. `frontend/src/layouts/DefaultLayout.vue:404` giữ navigation `nowrap` và `flex-shrink:0`; header cùng brand/actions vượt chiều rộng khả dụng. `frontend/src/assets/report-kit.css:122` bỏ min-width1100 cho report nhưng chưa có cách bố trí compact cho header.

**Tái hiện mới bằng browser admin giả**, đang ở `/reports/ai`:

| CSS viewport | Phần rộng hơn viewport | Control nằm ngoài viewport |
|---|---|---|
| 768×844 | 318px | Báo cáo, Cài đặt, quản lý nick, thông báo, tài khoản |
| 1024×844 | 62px | Thông báo và tài khoản; avatar kết thúc ở x≈1086 |
| 1100×844 | 0 | Không phát hiện |
| 1440×900 | 0 | Không phát hiện trên4 view kiểm tra |

Tại768px, menu Báo cáo trên header nằm ngoài màn hình; người dùng không thể thao tác menu/tài khoản bình thường bằng vị trí nhìn thấy. App khóa cuộn cấp trang (`frontend/src/assets/main.css:13`), nên phần vượt bị cắt. Vùng nội dung report vẫn có overflow=0; riêng điều đó không chứng minh header dùng được.

Bằng chứng: [ảnh768](../../artifacts/reports-mobile-5b-2026-11-02/browser/5b-ai-768.png), [ảnh1024](../../artifacts/reports-mobile-5b-2026-11-02/browser/5b-ai-1024.png), [DOM geometry](../../artifacts/reports-mobile-5b-2026-11-02/browser/desktop-layouts.json). Phép đo lấy `max(documentElement.scrollWidth,body.scrollWidth,#app.scrollWidth) − innerWidth`, đồng thời kiểm tra rect từng control của header. Kết quả tablet0 overflow ghi ở5A chưa đủ: phép đo đó không bắt được phần header tràn trong app.

**Phân loại nguồn gốc:** cấu trúc header desktop này đã có trong preimage trước5A; đây là lỗi compact còn tồn tại trong phạm vi nghiệm thu, không kết luận5A mới tạo ra toàn bộ lỗi. [Preimage DefaultLayout](../../artifacts/reports-mobile-5a-2026-11-02/before/DefaultLayout.vue) còn nguyên.

**Hướng sửa:** bổ sung bố trí navigation compact theo chiều rộng khả dụng, bảo đảm Báo cáo/Cài đặt/tài khoản đều có vùng thao tác nhìn thấy và keyboard tới được; giữ giới hạn CSS phù hợp scope report. Kiểm tra lại768/1024/1100/1440 và mobile sau patch. Lượt5B này chưa sửa.

### F2 — P2: chữ quan trọng trên desktop chưa đạt contrast4,5:1

`frontend/src/assets/report-kit.css:5` dùng `--rk-faint:#97a0ac`, `--rk-muted:#6b7785`. Empty state tại `:109`, mô tả tại `:20`, period button tại `:25`, tab active tại `:117`. Override màu đậm chỉ nằm trong media query mobile ở `:147`/`:161`/`:200`, nên desktop vẫn giữ các cặp màu dưới chuẩn của `docs/mobile-upgrade/04_MOBILE_DESIGN_SYSTEM.md`.

**Đo từ computed style của giao diện thật** ở1024 và1440px, nền solid sau khi ghép alpha của các ancestor:

| Mẫu chữ | Màu chữ / nền | Font | Contrast | Mục tiêu |
|---|---|---|---|---|
| AI empty: “Chưa ghi nhận tin AI hoặc nháp cần duyệt…” | #97a0ac / #ffffff | 12,5px,400 | **2,64:1** | 4,5:1 |
| Tab AI đang chọn | #1786be / #ffffff | 13px,600 | **4,05:1** | 4,5:1 |
| Mô tả AI và nhãn kỳ/scope/asOf | #6b7785 / #f5f7fa | 13px,400 | **4,25:1** | 4,5:1 |
| Hôm nay/7 ngày chưa chọn | #6b7785 / #f8fafc | 12,5px,600 | **4,36:1** | 4,5:1 |

Ở mỗi desktop viewport có **8/39 mẫu không đạt**; đây là các mẫu lặp lại theo selector, không phải8 lỗi độc lập. Chữ trạng thái rỗng và kỳ/scope cần đọc được để phân biệt0, thiếu dữ liệu và kỳ đang xem. [Ảnh1440](../../artifacts/reports-mobile-5b-2026-11-02/browser/5b-ai-1440.png), [màu/font/ratio từng mẫu](../../artifacts/reports-mobile-5b-2026-11-02/browser/contrast.json).

**Phân loại nguồn gốc:** các token desktop này có trước5A. Patch mobile đã cải thiện chúng dưới768px nhưng tiêu chí contrast desktop của5B vẫn chưa đạt. Không gán finding này cho công thức/KPI/backend.

**Hướng sửa:** chọn token chữ/active đủ contrast cho report desktop/compact, giữ khác biệt selected/focus/disabled và tránh ảnh hưởng trang khác. Đo lại các cặp màu thật sau patch. Lượt này chưa sửa.

## Kết quả kiểm tra mới

| Hạng mục | Kết quả | Phạm vi thực tế |
|---|---|---|
| Mobile320/390/430 | **PASS27/27** | Admin9 danh mục×3 widths, page/content overflow0; vùng chạm enabled≈44px trở lên |
| Bảng/heatmap | PASS trong dữ liệu fixture | Table semantics; region có label/tabindex; scroll ngang riêng, gồm Nick7 ngày/Engagement28 ngày/CRM |
| Header/footer mobile | PASS khi safe-area inset=0 | Đáy scope≈780,35, footer bắt đầu≈780,37 ở height844; Ctrl+End tới được nội dung cuối phía trên footer |
| Desktop1440 | PASS bố cục4/4; **FAIL contrast** | Overview, Sale, Automation, AI không tràn ngang |
| Compact768/1024 | **FAIL F1** | Page/app overflow318/62px và control bị cắt |
| Compact1100 | PASS geometry1/1 | Không control header ngoài viewport trong lần đo |
| Contrast mobile390 | **PASS162/162 mẫu** | Overview44, Automation34, Sale52, AI32; chỉ các selector chữ chính đã đo |
| Browser interactions | **PASS18/18** | Xem danh sách dưới đây; không tính số ảnh thành tests |
| Menu/router/API | PASS policy rollout hiện tại | Admin9, leader/deputy có grant6, member0; backend trực tiếp vẫn chặn |
| Frontend DOM tests | **PASS51/51**,8 spec | Chạy mới07:16:45, không sửa test/source |
| Type-check/build | **PASS** | `npm.cmd run build` gồm vue-tsc+Vite; còn warning chunk>500kB |
| Baseline JWT/RLS/HTTP | **PASS15/15 cuối** | Giữ2 lần14/15 do chuẩn bị timestamp fixture; chi tiết bên dưới |
| AI DB/JWT/HTTP | **PASS14/14** | Main/shared, invalid query, org isolation, RLS và null0; run mới5B |
| API capability | **PASS33/33** |3 role×11 endpoint của9 danh mục, JWT login thật, DB/RLS |
| Automation/Broadcast DB | **PASS2/2** | Data paused/closed; số thật từ fixture, không gửi ra ngoài |
| Safari/iPhone/PWA/VoiceOver thật | **NOT_TESTED** | Không có bằng chứng thiết bị thật; không chứng nhận từ IAB |

Minimum rect control mobile đo≈43,9967px do sai số scale provider, làm tròn44px; không có control enabled dưới43,5px trong phép quét. Desktop không được mặc định áp số đo touch target mobile. Contrast dùng công thức relative luminance, bỏ control disabled; không phải chứng nhận accessibility đầy đủ hoặc kiểm tra mọi pixel/gradient/opacity của toàn app.

**18 tình huống browser mới:** entry admin; keyboard cuộn bảng/focus; detail đúng dòng/null/bounds/initial focus; reverse Tab trap; quay lại trả focus; Escape; loading không có result/context; lỗi503 có retry; retry nhận25%/33,3%; đổi kỳ xóa KPI cũ; response kỳ cũ không ghi đè kỳ mới; empty denominator khác0; Back đồng bộ selector; leader6 danh mục; AI main7/shared1 và unavailable; cuối report không bị footer che; leader URL Audit bị chặn; member không có entry và URL AI bị chặn.

[interactions.json](../../artifacts/reports-mobile-5b-2026-11-02/browser/interactions.json), [mobile layouts](../../artifacts/reports-mobile-5b-2026-11-02/browser/mobile-layouts.json), [browser summary/manifest25PNG](../../artifacts/reports-mobile-5b-2026-11-02/browser/browser-summary.json). Ảnh mới ở [browser/](../../artifacts/reports-mobile-5b-2026-11-02/browser/), không lấy ảnh5A làm kiểm tra mới. Đã mở xem ảnh768 và1440 để đối chiếu findings.

## Bằng chứng source đối chiếu trong phiên5B

- `frontend/src/utils/report-access.ts:2`, `:12`, `:24`: policy và9 danh mục,3 danh mục admin-only. `frontend/src/router/index.ts:91`, `:98`, `:100`, `:102`: guard khớp menu; backend vẫn là biện pháp phân quyền.
- `frontend/src/layouts/DefaultLayout.vue:32`/`:41`, `frontend/src/components/BottomNav.vue:29`, `frontend/src/views/reports/ReportsShell.vue:10`: cùng catalog, không dùng edition gate sai cho core reports.
- `frontend/src/views/reports/ReportsShell.vue:16`/`:26`: route điều khiển selector, đổi danh mục reset scroll. `ReportTable.vue:10`: region; `ReportDetail.vue:8`/`:13`: restore/initial focus.
- `frontend/src/views/reports/SalesReport.vue:129`/`:494`/`:590`: detail từ dòng đã tải, không thêm endpoint hoặc mở rộng scope. Browser đối chiếu đúng VERIFY Sale A, chốt unavailable.
- `frontend/src/views/reports/ReportContext.vue:17`/`:19`/`:26`: timestamp API, thiếu thì ghi rõ; range từ response, snapshot có nhãn riêng. `AiReport.vue:63` giữ ngày/scope/asOf từ response.
- `backend/src/modules/automation/automation-report-routes.ts:55`/`:57`, `backend/src/modules/broadcast/broadcast-report-routes.ts:41`/`:43`, `backend/src/modules/dashboard/report-analytics-routes.ts:964`/`:966`:3 endpoint admin-only. Bộ33 checks gọi trực tiếp cả endpoint phụ CRM Usage/Lead Pool.

Các đường dẫn source ở trên nằm dưới `F:/ZaloCRM-CorepViet/`; số dòng được đọc lại ở working tree phiên này. Các audit11/12 cũ chỉ dùng đối chiếu; không coi placeholder/scope lỗi lịch sử còn tồn tại khi code hiện tại đã sửa.

## Môi trường an toàn, fixture và sai khác baseline

Trước ghi đã kiểm tra ID container `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, label `codex.task=reports-1b-local-verification`, state exited, loopback127.0.0.1:55471, tmpfs data, không bind volume khác. Sau start, đọc `reports_1b_verify|postgres|0` trước db push: [preflight](../../artifacts/reports-mobile-5b-2026-11-02/database-preflight.txt). Lần psql đầu quá sớm khi PostgreSQL chưa ready, đã đọc lại trước mọi ghi.

Schema mới từ Prisma db push, **không phải migration replay**. Áp RLS hiện tại, app role `reports_verify_app` không superuser/bypass; [DB setup](../../artifacts/reports-mobile-5b-2026-11-02/db-setup.json). Harness5B chỉ bind127.0.0.1:30571, route/auth/JWT/Prisma thật, không import app bootstrap/socket/queue/cron/provider, không AI trả phí hay Zalo/Telegram thật. Token chỉ trong memory. Login/report có thể tạo defaults/token trong DB test, không tác động hệ thống bên ngoài.

Base fixture orgA/B ngày02/11; AI/Automation fixture ngày01/11. **Không mặc định dùng ngày/số của5A**. AI leader kỳ30 ngày main7/shared1; base admin AI empty0 vì khác org. Automation7 ngày4 lời mời/1 đồng ý,3 bám đuổi/1 phản hồi. Broadcast3 sent/1 failed/2 skipped, success75%; job paused, session closed.

Baseline lần đầu **14/15**, caF2 expected pending1 nhưng actual0:10 tin base fixture đặt09:00/09:01 VN trong khi mới07:18. Lần điều chỉnh đầu dùng pg Date vào TIMESTAMP WITHOUT TIME ZONE giữ giờ local và vẫn để timestamp tương lai; lần baseline tiếp theo vẫn14/15. Giữ [kết quả đầu](../../artifacts/reports-mobile-5b-2026-11-02/baseline-before-clock-correction.json), [kết quả sau lần thử đầu](../../artifacts/reports-mobile-5b-2026-11-02/baseline-after-first-clock-attempt.json), [bằng chứng lần thử đầu](../../artifacts/reports-mobile-5b-2026-11-02/fixture-clock-first-attempt.json).

Sau đó chỉ cập nhật đúng10 message giả có ID/conversation/org allowlist, đặt00:30/00:31 VN, ISO cast `timestamptz AT TIME ZONE 'UTC'`; đọc raw `sent_at::text` trước/sau. **Không sửa assertion hoặc runtime.** [Correction/oracle](../../artifacts/reports-mobile-5b-2026-11-02/fixture-clock-correction.json). Baseline nguyên bản chạy lại **15/15 PASS**: [results.json](../../artifacts/reports-mobile-5b-2026-11-02/results.json). Không cộng ba lần chạy thành45 tests, không xóa14/15. Helper `5b-fixture-clock.ts` chỉ xử lý namespace giả trên DB disposable này.

Helper metrics12 ca của5A **không chạy lại** trong5B; kết quả11/12 và oracle4/4 cũ được bảo tồn, không tính là kiểm tra mới. Cần chuẩn hóa clock/timezone của harness khi làm bước6. Đây là vấn đề chuẩn bị fixture tách biệt với2 finding UI, không dùng lỗi fixture để quy kết công thức backend.

Browser ChatGPT IAB, CSS viewport đo bằng innerWidth/innerHeight:320/390/430×844,768/1024/1100×844,1440×900. Provider DPR≈1,33; điều chỉnh override theo CSS đo được. Chuỗi kiểm tra browser07:21–08:22 có thời gian chờ xét duyệt tự động; JWT hết hạn trong ca race được interceptor refresh rồi retry. Log xác nhận response Hôm nay200 trước response Hôm qua200, sau cả hai UI vẫn Hôm nay: [report-http.jsonl](../../artifacts/reports-mobile-5b-2026-11-02/browser/report-http.jsonl), [scenario-events](../../artifacts/reports-mobile-5b-2026-11-02/browser/scenario-events.jsonl). Không tính đây là bộ nghiệm thu refresh-token đầy đủ.

## Lệnh kiểm tra và file mới

Từ `frontend/`, log mới5B:

```powershell
node node_modules/vitest/vitest.mjs run src/views/reports/ReportMobile.dom.spec.ts src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts
npm.cmd run build
```

[Frontend test log](../../artifacts/reports-mobile-5b-2026-11-02/frontend-tests.log), [build log](../../artifacts/reports-mobile-5b-2026-11-02/frontend-build.log). Mock tests không thay DB/RLS/browser; không thêm test lặp implementation để hợp thức hóa kết quả.

Từ `backend/`, sau preflight0 bảng và tạo schema bằng config disposable5B:

```powershell
node node_modules/prisma/build/index.js db push --config ../artifacts/reports-mobile-5b-2026-11-02/prisma-disposable.config.mjs
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-setup.ts
$env:REPORT_VERIFY_BROWSER_SCENARIOS='1'
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-server.ts
# Chạy ở tiến trình khác khi server đã listen:
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-ai-fixtures.ts seed
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-automation-fixtures.ts
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-ai-fixtures.ts check
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-capabilities.ts
# Correction của đúng fixture riêng lượt này, không phải lệnh reset DB:
node node_modules/tsx/dist/cli.mjs scripts/reports-verification/5b-fixture-clock.ts
```

Baseline tự chạy khi server start; có restart sau mỗi lần correction như lịch sử ở trên. [AI14](../../artifacts/reports-mobile-5b-2026-11-02/db-jwt-http-results.json), [capability33](../../artifacts/reports-mobile-5b-2026-11-02/capabilities-results.json), [Automation/Broadcast2](../../artifacts/reports-mobile-5b-2026-11-02/automation-broadcast-db-results.json). Các nhóm chồng lặp; không cộng thành tổng end-to-end duy nhất. Không chạy lại full backend unit suite vì5B không đổi backend source/test.

File mới của lượt review: checkpoint này, artifacts5B/browser25PNG+JSON/log/snapshot; **7 helper kiểm tra** `backend/scripts/reports-verification/5b-{setup,server,base-checks,ai-fixtures,automation-fixtures,capabilities,fixture-clock}.ts` và config disposable5B. Helper sao chép đổi đích evidence, không ghi đè helper/artifact5A. Cập nhật root README và roadmap với FAIL5B. Không sửa `05-mobile.md` để che kết luận review.

Đã logout, reset viewport, đóng tab test; dừng đúng harness PID28048 và đưa đúng container về exited, không tác động container khác: [cleanup](../../artifacts/reports-mobile-5b-2026-11-02/cleanup.json). Một lệnh ghi scenario delay local hết thời hạn xét duyệt tự động, thử lại một lần đã thành công; không còn phần công việc bị chặn bởi xét duyệt.

## Gate tiếp theo

**FAIL5B**, không phải BLOCKED do thiếu browser. Sửa F1/F2 trong lượt implementation riêng, chạy regression và yêu cầu tái kiểm tra5B sau patch. Chưa triển khai bước6. Phần chưa kiểm tra thật gồm Safari/WebKit/iPhone, notch/safe-area khác0, bàn phím ảo, installed PWA, VoiceOver và font scaling; các kiểm tra local ở đây không chứng nhận những môi trường đó.

## Tái kiểm tra độc lập sau remediation F1/F2 — 02/11/2026

**Kết quả: FAIL5B; không mở gate6A.** Snapshot là source tại HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7` cùng working tree có thay đổi trước lượt này. Artifact `results.json` được ghi lúc 09:12:38 (+07); ảnh browser được lưu riêng trong `artifacts/reports-mobile-5b-independent-20261102-0917/`. Không sửa runtime, assertion, hay artifact lịch sử trong lượt kiểm tra này. Các hash source đo tại snapshot:

| Source đối chiếu | SHA-256 |
|---|---|
| `frontend/src/layouts/DefaultLayout.vue` | `EAEA5331600D21ECFC960C451559D45C79852E36A8319445322FB5A9B88C5802` |
| `frontend/src/assets/report-kit.css` | `4C12A56ED60F06654163A762050658E6F547BD52F504713433B8C3BD87A4605B` |
| `frontend/src/views/reports/OverviewReport.vue` | `A05805AC8D10647460B18FE0AC5828B614F5EACA75E1595E187EA0F8A08A2F1B` |
| `frontend/src/views/reports/ReportsShell.vue` | `B640E75008B9C05428E1461C2D1DC45DEE719E05C96E99765FB53632D8822D72` |
| `frontend/src/utils/report-access.ts` | `7094194D0245435C05E7ADD7E96A4125DDE2EFC62B8E007A73AAC619BC0804CC` |
| `frontend/src/router/index.ts` | `D2A253BD3C24048317AD85E1161B746E2BA0D551F0BC4BDA4C8F422B51C3F716` |

### F1 — FAIL: menu Điều hướng bị orphan sau khi vượt breakpoint

Đã đối chiếu menu ở `DefaultLayout.vue:4,17-24,173-209,446,512-522`: class `rpt-app` chỉ có trên route `/reports/`; danh sách menu dùng `visiblePrimaryTabs`; cleanup đóng menu sau điều hướng; compact CSS chỉ áp dụng trong khoảng768–1099px. Ở route báo cáo, `max(documentElement.scrollWidth, body.scrollWidth, #app.scrollWidth)` bằng viewport tại 320, 390, 430, 768, 1024, 1099, 1100 và 1440px; không phát hiện control header vượt viewport khi menu đóng. Tại 320/390/430, kiểm tra 9 danh mục cho kết quả27/27 không tràn ngang cấp trang, không có target dưới44px; vùng bảng/heatmap tự cuộn và nội dung cuối không bị thanh điều hướng dưới che.

**Lỗi tái hiện được:** ở1024px mở menu compact, sau đó resize lên1100px. Nút `.compact-navigation` bị ẩn do qua breakpoint nhưng `.v-overlay--active` vẫn còn; menu không tự đóng. Ảnh: [overlay còn mở sau resize](../../artifacts/reports-mobile-5b-independent-20261102-0917/navigation-overlay-after-breakpoint.png). Vì vậy kiểm tra resize khi menu đang mở **FAIL** dù tổng thể layout ở1100px không tràn.

Các tương tác mới: Enter mở menu, ArrowDown chuyển focus, Tab chuyển focus, Escape đóng và trả focus; chọn Dashboard điều hướng và đóng menu, Back quay lại trang report không để overlay; Báo cáo/Cài đặt/tài khoản có thể mở/đóng. Menu thông báo thao tác được nhưng route `/notifications` không có trong harness (404), nên không xác nhận nội dung/dữ liệu thông báo thực. Ngoài route report ở1024px, `.rpt-app` không có, compact menu vẫn ẩn và 7 primary links giữ hành vi cũ; chiều rộng header1100px là overflow legacy ngoài phạm vi thay đổi report, không quy thành lỗi mới của F1.

### F2 — FAIL: một số initials avatar vẫn dưới ngưỡng tương phản chữ thường

Đo màu foreground/background từ computed style của build hiện tại, composite alpha trước khi tính tương phản; không đánh giá bằng screenshot. Các nhóm chữ report được yêu cầu đo — mô tả, kỳ/scope/asOf, trạng thái kỳ mặc định, tab active/inactive, nhãn KPI, empty/loading và trạng thái chính — có minimum4,56:1 trên desktop/compact và4,58:1 trên mobile; đạt4,5:1. Chữ trạng thái rỗng đạt6,03:1, tab active7,72:1. Focus-visible có outline3px; trạng thái selected và disabled vẫn phân biệt được.

Tuy vậy, chữ initials màu trắng cỡ11px trong avatar ở Overview là chữ thường và không đạt4,5:1: `VD` 3,88:1, `VA`/`VL` 4,05:1. Palette nằm tại `OverviewReport.vue:77-82`, kiểu chữ `.av` tại `report-kit.css:58`; do đó F2 chưa PASS dù các token chữ report chính đã đạt. Không áp ngưỡng chữ lớn3:1 cho các initials này.

### Hồi quy, quyền và kiểm tra thực tế

- Frontend: 8 spec files,51/51 tests PASS; `npm run build` chạy `vue-tsc -b && vite build`, PASS.
- DB/JWT/HTTP:15/15 baseline PASS; API role matrix44/44 status đúng với JWT đăng nhập thật. Admin có9 danh mục, leader/deputy có6, member không có entry; gọi API trực tiếp vẫn bị chặn theo capability. User DB test là `reports_verify_app` (`NOSUPERUSER`, `NOBYPASSRLS`); RLS chặn đọc/ghi cross-org theo fixture. Đây là regression liên quan5B, **không phải nghiệm thu6A**.
- Sale detail: có6 nút chi tiết; mở/đóng dialog và focus quay về control gọi được xác nhận.
- Không chạy lại helper phát lại JSON cũ để thay cho browser evidence. Không có bằng chứng browser mới đủ để kết luận các luồng đổi kỳ nhanh/chặn response cũ, retry/error và đầy đủ trạng thái0/null/unavailable trên cả9 danh mục; đánh dấu các trường hợp này **chưa xác minh độc lập trong lượt này**, không suy PASS từ test cũ.

### Môi trường, lệnh và giới hạn

DB là PostgreSQL disposable `reports_1b_verify` trong container local `reports-1b-verify-20261101`, bind loopback `127.0.0.1:55471`, data directory tmpfs, không mount dữ liệu bên ngoài. Trước khi ghi schema/fixture đã xác nhận DB mới rỗng, container và endpoint local, RLS bật; fixture hoàn toàn giả, API dùng JWT thực do harness login tạo và role ứng dụng không bypass RLS. Prisma dùng `backend/scripts/reports-verification/prisma.config.ts`, không đọc `.env` mặc định. Harness chỉ đăng ký route cần thiết; không chạy `app.ts`, queue, cron hoặc provider ngoài. Không gọi AI trả phí, gửi Zalo/Telegram, hay tác động production.

Lệnh chính:

```powershell
cd backend
npm.cmd exec -- prisma generate --config scripts\reports-verification\prisma.config.ts
npm.cmd exec -- prisma db push --config scripts\reports-verification\prisma.config.ts
npm.cmd exec -- tsx scripts\reports-verification\5b-independent-setup.ts
cd ..\frontend
npm.cmd test -- src/views/reports/SalesReport.dom.spec.ts src/views/reports/ReportMobile.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/AiReport.dom.spec.ts
npm.cmd run build
```

Frontend regression được chạy lại lúc09:30:34 (+07): 8/8 spec,51/51 tests; `vue-tsc -b && vite build` PASS. Lệnh PowerShell `npm` ban đầu bị ExecutionPolicy chặn và không tạo log; gọi `npm.cmd` trực tiếp thành công. Log thành công gồm `frontend-tests-npmcmd.log` và `frontend-build-npmcmd.log`.

Kết quả và ảnh mới: [artifact 5B độc lập](../../artifacts/reports-mobile-5b-independent-20261102-0917/), gồm ảnh Overview390/1024/1440, overlay sau breakpoint, `results.json`, HTTP access và log setup/schema. [Cleanup record](../../artifacts/reports-mobile-5b-independent-20261102-0917/cleanup.json) xác nhận harness, container và helper tạm đã dừng/xóa; không ghi đè artifact FAIL cũ hoặc evidence remediation. Chromium responsive local không chứng minh Safari/WebKit/iPhone/PWA/VoiceOver/font scaling thật; route thông báo và các kịch bản đổi kỳ/error nêu trên cũng chưa được xác minh đầy đủ.

**Gate:** F1 và F2 đều còn finding; 5B **FAIL**. Giữ bước6A ở **NOT_STARTED**; cần remediation riêng và một lượt tái kiểm tra độc lập mới trước khi triển khai6A. Bước6B chưa bắt đầu.

<a id="recheck-20261102-1159"></a>

## Tái kiểm tra độc lập lần2 —02/11/2026 11:59 (+07)

**FAIL — F1/F2 đã đạt, còn F3 (P2) về keyboard focus. Không sửa implementation; không bắt đầu6A/6B.** Đối tượng là working tree tại HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, gồm patch remediation11:36 chưa commit. Đọc lại prompt chung, hai audit lịch sử, contract, checkpoint4B/5A/remediation và đối chiếu source hiện tại. Không lấy69 test hoặc ảnh tự kiểm tra của tác giả làm kết quả độc lập.

### F3 — P2: rời compact ở chiều rộng CSS lẻ không trả focus

Đã tái hiện **hai lần** bằng IAB/Chromium mới, DPR≈1,33:

1. Ở CSS1024px, Enter mở Điều hướng; ArrowDown đưa focus vào Dashboard trong overlay.
2. Resize override vật lý1462px: header đo được **1099,248px**, `innerWidth=1099`. CSS compact hết hiệu lực vì điều kiện `max-width:1099px`; activator có rect0×0. Overlay đóng đúng.
3. Sau khi overlay leave xong, **`activeElement=BODY`**, nút Báo cáo vẫn hiện nhưng không nhận focus. Tab tiếp theo về logo `Cờ Rếp ViệtCRM` (`href=/`), mất vị trí bàn phím.

**Nguyên nhân đã đối chiếu:** `frontend/src/composables/use-report-compact-navigation.ts:22` và `:29` chặn restore bằng `window.innerWidth >= 1100`, trong khi media query ở `:33` và CSS `frontend/src/layouts/DefaultLayout.vue:518` xét chiều rộng CSS thực. Hai điều kiện không tương đương ở khoảng1099–1100 khi viewport có phần lẻ. Unit helper `frontend/src/composables/use-report-compact-navigation.dom.spec.ts:22` dùng cùng số `width` cho cả `innerWidth` và media query, nên69/69 PASS không phủ trường hợp này.

**Mong đợi:** khi rời compact nhưng vẫn ở DefaultLayout/report và nút Báo cáo hiển thị, sau leave phải chuyển focus tới nút đó. Sửa riêng ở lượt remediation: dùng trạng thái breakpoint/độ hiện diện của target nhất quán, giữ bảo vệ khi sang MobileLayout/rời report; bổ sung đối chứng media query=false nhưng `innerWidth=1099`. Không sửa trong lượt B này.

Bằng chứng mới: [hai lần resize và Tab tiếp theo](../../artifacts/reports-mobile-5b-recheck2-2026-11-02/browser-captures/interactions.json) (`fractional-breakpoint-1099`, `fractional-breakpoint-1099-repeat`, `fractional-breakpoint-next-tab`), [capture1099](../../artifacts/reports-mobile-5b-recheck2-2026-11-02/browser-captures/fractional-breakpoint-1099.png). Ảnh cho thấy menu đã đóng; JSON xác minh danh tính focus, không suy focus từ ảnh hoặc substring text của BODY.

### Các phần đã PASS trong lượt mới

| Hạng mục | Kết quả và phạm vi thực tế |
|---|---|
| F1 gốc1024→1100 | PASS: overlay0, focus chính xác button `[data-report-nav-trigger]`; quay lại1024 không mở lại. Mouse1024→1440, Escape trả focus compact và resize766 sang MobileLayout cũng sạch overlay. F3 ở khoảng lẻ được tách riêng, không gọi mọi resize đều PASS |
| F2 initials | **100/100 mẫu PASS**, font11px; thấp nhất**5,83:1**, ngưỡng4,5:1. Dòng avatar thực có tại Overview/Nick/Sale/Audit; không nhận coverage browser cho hàng trống ở Pipeline/Engagement |
| Bố cục | **40/40 PASS** về page/content overflow và header ngoài viewport:27 mobile=9 danh mục×320/390/430; Overview768/1024/1099/1100/1440;8 danh mục còn lại1440. Touch44px áp ở320/390/430, tolerance43,5 do làm tròn pixel; không áp rồi tuyên bố mọi control desktop44px |
| Chữ report chính | **691/691 mẫu PASS**,18 nhóm=9 danh mục×390/1440. Đo computed foreground/background solid và size/weight; không phải chứng nhận WCAG toàn app hoặc gradient avatar header |
| Biểu đồ | Overview30 cột ở1024: client933, scrollWidth1036, ArrowRight tạo scrollLeft30,08; region có tên và focus, parent content overflow0 |
| Bảng/heatmap/footer | Bảng Sale cuộn ngang bằng phím; heatmap168 ô nằm trong `.hh` rộng313/scroll560, Tab từ outer region vào inner scroll tự focus của Chromium, ArrowRight cuộn30,08. Outer region không phải phần tử thực sự cuộn. Nội dung cuối mobile bottom780,09 nằm trên footer top780,37. Chưa suy khả năng tự focus scroll container trên WebKit |
| Loading/error/retry | Overview loading bỏ KPI/context cũ;503 có kiểm soát hiện alert và Thử lại, KPI0 phần tử; retry gọi route thật trả200, phục hồi8 KPI và context. Lần fault đầu bị request mới sau chuyển layout thay thế được giữ trong HTTP log, không tính là ca alert PASS; lặp ở layout ổn định mới xác minh alert |
| Đổi kỳ nhanh | Delay request7 ngày2200ms; request Hôm nay hoàn tất04:52:32.888Z, request cũ hoàn tất04:52:34.788Z. Sau cả hai, UI vẫn chọn Hôm nay, context `2026-11-02 – 2026-11-02`, chart1 cột |
| Drill-down/quay lại | SaleA: dialog có tên, focus nút đóng, Shift+Tab vòng tới Quay lại báo cáo; Escape và nút Quay lại đều đóng, trả focus chính xác nút Chi tiết SaleA. Dữ liệu fixture hiển thị6 khách/2 tin/1 phút; chốt chưa có dữ liệu |
|0/null/unavailable | Automation Hôm nay: tin/lời mời0, tỷ lệ chưa có dữ liệu khi không có mẫu số;7 ngày hiển thị25%/33,3% khớp fixture. AI org không có tin: các KPI đo được0, chi phí/token/vòng đời chưa đủ nguồn ghi rõ chưa có dữ liệu; leader orgAI main7/shared1 tách riêng |
| Menu/route/API | Admin9 danh mục; leader/deputy6, không Automation/Broadcast/Audit; member không có nút Báo cáo, direct route về`/`. Deputy direct Automation cũng bị chặn UI. **44/44 HTTP checks**=11 endpoint×admin/leader/deputy/member qua JWT login thật; không coi ẩn menu là backend authorization |

Source palette mới `frontend/src/utils/report-avatar.ts:2`; CSS white11px `frontend/src/assets/report-kit.css:63`. Đã đọc imports ở Overview:9, NickFleet:230, Sales:499, Audit:9, Pipeline:261, Engagement:4. Chart scroll tại `report-kit.css:76`, named regions Overview:257/Sales:189. Menu lifecycle binding tại `DefaultLayout.vue:17`, target:45, callback:174–178. Navigation policy `frontend/src/utils/report-access.ts:2`/`:24`/`:30`, selector từ cùng catalog `ReportsShell.vue:10`/`:26`; AI route gọi gate backend ở `backend/src/modules/dashboard/ai-report-routes.ts:13`. Mỗi path+dòng trên được đọc lại trong phiên này.

### Môi trường, lệnh và kết quả thực tế

- Database **reports_1b_verify**, containerID `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, bind127.0.0.1:55471, tmpfs, không mount dữ liệu khác. Sau khởi động đã xác minh `reports_1b_verify|postgres|0` trước ghi; lần probe ngay sau start chưa ready không được tính là xác minh. Schema qua Prisma db push, **không phải migration replay**.
- Seed hai org cơ bản và hai orgAI giả, phòng A/B, deputy giả thêm từ grant/hash fixture leader, nick main/shared/foreign, message và bản ghi Automation/Broadcast đóng/paused. Không user/dữ liệu thật. App role `reports_verify_app`: NOSUPERUSER/NOBYPASSRLS,8 bảng kiểm tra đều ownerpostgres, ENABLE/FORCE RLS. HTTP nghe127.0.0.1:30571, actual routes/auth/Prisma, không app bootstrap/provider/worker/cron/socket/send. JWT chỉ trong bộ nhớ, không ghi token/.env.
- **15/15 baseline DB/JWT/HTTP**, **14/14 AI DB/JWT/HTTP/SQL oracle**, **2/2 Automation/Broadcast đối soát** PASS mới.31 checks này là nhóm local riêng, không cộng với44 role statuses để gọi75 luồng tích hợp. Các assertion hiện có không bị sửa; không chạy lại52 backend unit tests trong lượt chỉ review frontend này và không ghi thành kết quả mới.
- **10 spec/69 frontend tests PASS**, build gồmvue-tsc/Vite PASS. Warning chunk>500kB còn nguyên. Không đổi threshold hoặc artifact để che lỗi. Characterization reports-review-evidence không chạy trong lượt này, không được dùng làm tiêu chí đã sửa.

Lệnh tại `backend/`, sau khi verify container/DB rỗng:

```powershell
node node_modules/prisma/build/index.js db push --config ../artifacts/reports-mobile-5b-recheck2-2026-11-02/prisma-disposable.config.mjs
node --import tsx scripts/reports-verification/5b-recheck2-setup.ts
# Start-Process -WindowStyle Hidden: server read routes; tự chạy base-checks15/15
node --import tsx scripts/reports-verification/5b-recheck2-server.ts
node --import tsx scripts/reports-verification/5b-recheck2-automation-fixtures.ts
node --import tsx scripts/reports-verification/5b-recheck2-ai-fixtures.ts seed
node --import tsx scripts/reports-verification/5b-recheck2-capabilities.ts
node --import tsx scripts/reports-verification/5b-recheck2-ai-fixtures.ts check
```

Lệnh tại `frontend/`:

```powershell
node node_modules/vitest/vitest.mjs run src/views/reports/ReportMobile.dom.spec.ts src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts src/composables/use-report-compact-navigation.dom.spec.ts src/utils/report-avatar.spec.ts
npm.cmd run build
```

[Artifact mới](../../artifacts/reports-mobile-5b-recheck2-2026-11-02/): `results.json`15, `db-jwt-http-results.json`14, `automation-broadcast-db-results.json`2, `capabilities-results.json`44; test/build logs, container/DB/app-role proofs, `browser-captures/{summary,geometry,avatars,contrast,interactions}.json` và PNG thực. `browser/` giữ HTTP/scenario log và code đo;34 quan sát browser có cả probe chẩn đoán, **không gọi34/34 E2E PASS**. Giữ dữ liệu thô kể cả outer heatmap scroll0 và fault đầu bị thay thế.

### Tính độc lập, giới hạn và gate

[Source integrity](../../artifacts/reports-mobile-5b-recheck2-2026-11-02/source-integrity.json): **837/837 file frontend/src, backend/src, backend/tests giữ nguyên SHA256** so với lúc bắt đầu. Không sửa implementation/test assertion. Thêm6 helper prefix `5b-recheck2-` chỉ dùng kiểm chứng, artifacts, và cập nhật tài liệu verification/roadmap/README gốc; không nhập helper vào app. Không agent/worktree, reset/stash/commit/push/deploy. Git status đầu/cuối được lưu riêng để không quy dirty tree cũ thành patch B.

[Cleanup11:57:49](../../artifacts/reports-mobile-5b-recheck2-2026-11-02/cleanup.json): dừng đúngPID40360, listener30571=0, containerexited, không chạy Vite; logoutfixture/resetviewport/đóng tab6. Helper kiểm tra giữ để tái lập, không có service nền. Chưa kiểm tra Safari/WebKit/iPhone thật/PWA/VoiceOver hoặc font scaling; không tuyên bố đã nghiệm thu các mục đó. Notifications route404 do harness không đăng ký module (module thật import zaloPool tại`backend/src/modules/notifications/notification-routes.ts:10`), không tính là bug production hoặc giả200 để che thiếu coverage. Những luồng states đã nêu không đại diện mọi trạng thái mọi danh mục; bước6 nghiệm thu toàn luồng chưa bắt đầu.

**Gate hiện tại:5B FAIL vì F3.** Sửa focus tại breakpoint lẻ ở lượt riêng, thêm test đối chứng rồi tái kiểm tra B trên hash mới. **6A/6B vẫn NOT_STARTED** dù regression/layout/contrast đã đạt; kết quả FAIL F1/F2 cũ được giữ làm lịch sử.

<a id="recheck-20261102-1213"></a>

## Tái kiểm tra độc lập lần3 sau "remediation F3" —02/11/2026 12:06–12:13 (+07)

**FAIL — F3 chưa được sửa: không có remediation F3 trong working tree. Không sửa implementation; 6A/6B NOT_STARTED.**

### Phạm vi và đầu vào

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, nhánh `fix/reports-kpi-3b`, working tree dirty có sẵn (206 dòng `git status --porcelain`). Git status đầu/cuối và manifest SHA256 548 file dirty/untracked lúc bắt đầu lưu tại artifact; không reset/stash/commit/push/deploy, không agent/worktree, không cài dependency. Git được gọi với `-c safe.directory=...` theo từng lệnh vì repo báo dubious ownership; không đổi cấu hình global.
- `docs/reports-fix/05-mobile-remediation-3.md` **không tồn tại**; `AGENTS.md` cũng không có trong repo. README bước5 trước lượt này vẫn ghi A = NEEDS_REMEDIATION F3.
- **837/837 file `frontend/src`, `backend/src`, `backend/tests` trùng SHA256 với `source-before.json` của lượt FAIL 11:59** (đo cả đầu và cuối lượt). Không có file source nào mới hơn `source-integrity.json` của lượt trước. Tức là source đang kiểm tra chính là source đã FAIL.

### F3 — đối chiếu source (đọc lại trong phiên này)

- `frontend/src/composables/use-report-compact-navigation.ts:22` và `:29` vẫn chặn restore focus bằng `window.innerWidth >= 1100`; `:33` media query `(min-width: 768px) and (max-width: 1099px)`; CSS `frontend/src/layouts/DefaultLayout.vue:518`. Điều kiện vẫn không tương đương ở CSS width (1099,1100) khi `innerWidth` làm tròn xuống1099. File mtime11:20, trước lượt FAIL.
- Test `frontend/src/composables/use-report-compact-navigation.dom.spec.ts:22–27`: `resize(width)` gán cùng một số cho `innerWidth` và `matches`; **không có ca đối chứng độc lập media=false + innerWidth=1099**. 69/69 PASS vì thế không chứng minh F3 đã hết.

### Lệnh và kết quả mới

| Loại | Kết quả |
|---|---|
| Unit/DOM frontend (10 spec, cùng lệnh lượt 11:59) | **69/69 PASS** — `frontend-tests.log` |
| Build `vue-tsc -b && vite build` | **PASS**, còn warning chunk>500kB — `frontend-build.log` |
| DB disposable | Container `f24db02778ff` (postgres:15-alpine, tmpfs, bind127.0.0.1:55471, không mount). Sau start xác minh `reports_1b_verify|postgres|0 bảng|0 app role` trước ghi. Prisma db push (không phải migration replay), seed fixture giả bằng helper mới |
| App role | `reports_verify_app` NOSUPERUSER/NOBYPASSRLS; 7 bảng tenant (contacts, conversations, departments, messages, saved_reports, users, zalo_accounts) owner `postgres`, ENABLE+FORCE RLS; `organizations` không có RLS (bảng gốc tenant) |
| HTTP harness | Route thật auth/report/Prisma tại127.0.0.1:30572, phục vụ `frontend/dist` vừa build; không app bootstrap/queue/cron/socket/provider/AI/gửi tin. 170 request, 0 lỗi5xx; 404 cho notifications (5), privacy/status (2), action-hub (5) do harness không đăng ký module — **giới hạn harness, không phải lỗi production**. Lượt này không chạy base-checks/AI/capabilities |
| Browser thật (pane Chromium của Claude desktop, đăng nhập UI fixture `verify-admin`) | 1024px: Enter mở Điều hướng, ArrowDown focus `Dashboard` trong overlay — PASS. Đối chứng số nguyên 1099→1100: overlay0, activator0×0, focus đúng `[data-report-nav-trigger]` — PASS (chỉ đường F1) |
| **F3 viewport lẻ thật** | **BLOCKED trong môi trường này**: pane có `devicePixelRatio=1`; `resize_window 1099.25` cho `innerWidth=1099`, documentElement1099, visualViewport1099, media compact=true. Không tạo được CSS width nằm giữa1099 và1100, nên không có quan sát F3 thật mới (cũng không phải PASS) |
| F3 chẩn đoán (override getter `innerWidth`→1099 khi CSS width ∈[1100,1101), mô phỏng floor(1099,248)) | Sau leave: overlay0, media=false, **activeElement=BODY**, không có focusin tới nút Báo cáo; Tab tiếp theo tới logo `href="/"`. Khớp nguyên nhân ở `:22/:29`. **Đây là chẩn đoán có can thiệp in-page, không tính là browser E2E** |

Không chạy lại: mục 1024→1440, quay lại compact, MobileLayout/Escape/rời report/late leave trên browser; hồi quy 9 danh mục ở320/390/430, overflow, touch44px, contrast/initials, selector/đổi kỳ nhanh, loading/error/retry, 0/null, drill-down, menu/route/API theo admin/leader/deputy/member, DB/JWT/HTTP. Lý do: gate đã FAIL bởi F3 trên source byte-identical với lượt 11:59; kết quả hồi quy 11:59 **không** được dùng làm kết quả mới của lượt này và phải chạy lại sau khi có patch F3.

### Artifact, integrity, cleanup

[Artifact lần3](../../artifacts/reports-mobile-5b-recheck3-20261102/): `git-status-before.txt`, `git-status-after-checks.txt`, `dirty-manifest-before.txt`, `source-vs-recheck2-start.json`, `source-integrity.json` (837/837), `db-empty-check.txt`, `db-setup.json`, `app-role-rls-proof.txt`, `http-access.jsonl`, `browser-captures/interactions.json`, test/build/schema/setup/server logs, `cleanup.json`. Helper mới chỉ để kiểm chứng: `backend/scripts/reports-verification/5b-recheck3-setup.ts`, `5b-recheck3-server.ts` (bản sao helper recheck2, chỉ đổi đường dẫn artifact/port, bỏ base-checks); không ghi đè artifact cũ. Diff git status đầu/cuối chỉ thêm các file artifact/helper trên.

Cleanup12:13:26: dừng PID43824, listener30572=0, container `exited` (tmpfs nên dữ liệu fixture mất); browser xóa storage fixture, bỏ override, reset viewport, đóng tab. Chromium responsive không chứng minh Safari/iPhone/PWA/VoiceOver.

### Điều kiện để tái kiểm tra

1. Lượt A riêng sửa `use-report-compact-navigation.ts` để quyết định restore focus theo trạng thái breakpoint/media (hoặc độ hiển thị của target), không theo `innerWidth`, vẫn chặn khi sang MobileLayout/rời report/late leave; ghi checkpoint `05-mobile-remediation-3.md`.
2. Thêm test có `matches=false` nhưng `innerWidth=1099` (và ngược lại).
3. Lượt B mới cần một browser có DPR không nguyên (ví dụ Windows scale125–150% hoặc pane DPR≈1,33 như lượt 11:59) để tạo CSS width1099,x thật, rồi chạy đủ hồi quy 5B.

**Gate: 5B FAIL (F3 còn nguyên). 6A/6B NOT_STARTED.**

<a id="recheck-20261102-1338"></a>

## Tái kiểm tra độc lập lần4 trên patch F3 —02/11/2026 13:23–13:39 (+07)

**PASS local 5B — F3 đã hết trên viewport lẻ thật; không còn finding chặn.** Không sửa implementation hay assertion. 6A/6B vẫn NOT_STARTED.

### Phạm vi, đầu vào và sự cố quy trình

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, working tree dirty có sẵn (664 dòng `git status -uall` lúc 13:23:06). Đối tượng là patch F3 lúc12:38 ([remediation3](05-mobile-remediation-3.md)): 834/837 file source/test giống snapshot 11:59, 3 file khác đúng SHA của checkpoint (`use-report-compact-navigation.ts` `4e287ec8…`, spec `f7793dc4…`, `DefaultLayout.vue` `15245cea…`). Không reset/stash/commit/push/deploy, không worktree/agent, không cài dependency.
- **Sự cố:** lúc bắt đầu đã có một lượt kiểm tra khác (`artifacts/reports-mobile-5b-recheck4-20261102/`, helper `5b-recheck4-*`, tạo 12:43–12:54, không phải phiên Claude đang chạy). Lượt đó còn để harness PID44556 nghe 127.0.0.1:30574 và container `reports-1b-verify-20261101` đang chạy, chưa có cleanup. Lệnh snapshot của lượt này **đã ghi đè nhầm 3 file trong thư mục đó**: `start-time.txt`, `git-status-before.txt`, `source-before.json` (13:23:06). Bản gốc không khôi phục được; nội dung hiện tại là snapshot của lượt này, đã sao sang thư mục artifact riêng kèm `snapshot-note.txt`. Không dùng kết quả của lượt kia. Lượt này không dừng hay sửa process/container của lượt kia; mọi môi trường dưới đây đều tách riêng.

### F3 — browser thật trên viewport lẻ

Chrome 156 headless riêng, profile tạm trong scratchpad, `--force-device-scale-factor=1.25` (mô phỏng Windows 125%; OS thật đang 96 DPI). Viewport lấy từ kích thước cửa sổ thật (`Browser.setWindowBounds`), **không override `innerWidth`, không sửa state app**. Điều khiển bằng sự kiện bàn phím CDP thật (Tab tới activator, Enter, ArrowDown, Escape). Đăng nhập UI bằng fixture `verify-admin`.

Cửa sổ 1114 DIP cho **CSS width 1099,2000732px, `innerWidth`=1099, visualViewport 1099,19995, DPR 1,25**. Cả `(max-width:1099px)` lẫn `(min-width:1100px)` đều false, đúng điều kiện F3.

| Ca | Kết quả (3 lần lặp cho F3) |
|---|---|
| 1024: Tab tới `Điều hướng`, Enter, ArrowDown | overlay1, focus link `Dashboard` trong menu |
| → 1099,2 (đo ở 100ms và 1300ms) | media compact false, overlay0, activator 0×0, nút Báo cáo 102,35×36; **`activeElement === [data-report-nav-trigger]`** cả 3 lần |
| Tab tiếp theo | `Cài đặt` cả 3 lần (không về logo, không về BODY) |
| 1024 → 1100 | overlay0, focus nút Báo cáo; quay lại1024: không mở lại, focus giữ ở nút Báo cáo |
| 1024 → 1440 | overlay0, focus nút Báo cáo; quay lại1024 không mở lại |
| Escape ở 1024 | overlay0, focus về activator `Điều hướng` |
| Late leave: 1024 → 1099,2 → 1024 trong 40ms | overlay0, không mở lại, **không** focus nút Báo cáo; activeElement=BODY (xem ghi chú P3) |
| 1024 → 765,6 (innerWidth 766) | MobileLayout, overlay0, không còn target desktop; quay lại1024 overlay0 |
| Enter vào `Dashboard` trong menu (rời report) | route `/`, overlay0, focus không chuyển sang nút Báo cáo |

Ảnh: `f3-1099x-after-leave.png`, `f1-1100-after-leave.png`, `mobile-766-after-menu.png`; dữ liệu `browser-captures/f3-observations.json`, log `f3-scenarios.log`.

Source đã đọc lại: `use-report-compact-navigation.ts:4` (target getter), `:23–27` (restore theo route khi media rời compact, không còn `innerWidth`), `:36` (chỉ focus target `isConnected` + có client rect), `:40–41/:46` (mounted, media query); `DefaultLayout.vue:178`, CSS `:518`; `use-mobile.ts:13` (MobileLayout theo `innerWidth<768`). Test `use-report-compact-navigation.dom.spec.ts:62` và `:91` dùng `setViewport(1099, false)`: **có đối chứng độc lập media/innerWidth**; unit PASS không được dùng thay browser.

**Ghi chú P3 (không chặn):** sau khi resize vượt breakpoint rồi quay lại compact rất nhanh (40ms), menu đóng và focus nằm trên BODY. Patch đáp ứng yêu cầu "không cướp focus"; hành vi BODY giống code trước patch. Có thể cải thiện bằng cách trả focus về activator compact trong ca này. Sau khi rời report qua menu, focus cũng là BODY do route đổi; đây là hành vi chung của SPA, ngoài phạm vi F3.

### Hồi quy 5B trên browser

Cùng Chrome DSF1,25. Mobile 320/390/430 dùng `Emulation.setDeviceMetricsOverride` (mobile, DPR3, touch); compact/desktop dùng cửa sổ thật. Script đo đọc-only `measure-geometry.js`, `measure-main-contrast.js`, `measure-avatar-contrast.js` sao từ lượt 11:59 (không đổi ngưỡng).

| Hạng mục | Kết quả mới |
|---|---|
| Bố cục | **48/48**: 9 danh mục × 320/390/430, 9×1024, 9×1440, Overview 768/1099,2/1100. Page overflow0, content overflow0, không có control topnav nằm ngoài viewport; mobile không có target dưới 43,5px |
| Chữ report chính | **693/693** mẫu PASS, 9 danh mục × 390/1440, thấp nhất **4,56:1**, ngưỡng 4,5 (3 cho chữ lớn) |
| Initials | **63/63** PASS, font 11px, thấp nhất **5,83:1**, ngưỡng 4,5 (không dùng ngưỡng chữ lớn); có dữ liệu ở Overview/Nick/Sale/Audit |
| Selector danh mục | Focus `#report-category`, ArrowDown → `/reports/nick`, focus giữ ở select |
| Đổi kỳ nhanh | Request 7 ngày bị trễ 2200ms; request Hôm nay xong trước. Sau khi cả hai xong: UI chọn Hôm nay, context `2026-11-02 – 2026-11-02` khớp `from/to` của request Hôm nay |
| Loading | Đổi 30→7 ngày với độ trễ 2500ms: trong lúc tải KPI0, context ẩn, `Đang tải dữ liệu…`; sau đó 8 KPI và context `2026-10-27 – 2026-11-02` |
| Error/retry | 503 có kiểm soát: alert "Không tải được dữ liệu báo cáo…", KPI0, ẩn context; Thử lại → 200, 8 KPI, context trở lại |
| Nhãn kỳ/scope | Overview/Sale/Engagement/AI: kỳ trên UI khớp `from/to` của response 200 cuối; ghi rõ phần ảnh chụp hiện tại; AI admin "Phạm vi: Tổ chức", leader "Phòng ban và phòng con" |
| 0/null/unavailable | Automation Hôm nay: lời mời/bám đuổi0, hai tỉ lệ "Chưa có dữ liệu"; 7 ngày: 25% / 33,3% khớp fixture. AI orgA không có tin: KPI0, chỉ số thiếu nguồn không bị đổi thành0 |
| Drill-down | Sale: dialog mở, focus `Đóng chi tiết`, Shift+Tab vòng tới `Quay lại báo cáo`; Escape và nút Quay lại đều trả focus đúng nút mở |
| Bảng/heatmap/chart | Bảng Sale 390: region có tên, client338/scroll979, ArrowRight cuộn40. Heatmap `.hh` 314/560, page overflow0, Tab vào `.hh`, ArrowRight cuộn40. Chart Overview 30 ngày ở1024: 933/1036, focus, ArrowRight cuộn40, content overflow0 |
| Footer | Phần tử cuối có bottom 715,7 < footer top 780 sau khi cuộn `.rpt-scope` tới cuối |
| Menu/route theo quyền | Admin: 9 danh mục (+ Phân tích nâng cao), route trực tiếp vào cả 4 trang; leader và deputy: 6 danh mục, Automation/Broadcast/Audit chuyển về `/`, AI vào được; member: không có nút Báo cáo, `/reports/*` chuyển về `/` |

Ảnh: `tong-quan-390`, `audit-1440`, `overview-error-390`, `automation-7d-390`, `automation-today-390`, `ai-empty-390`, `sale-detail-390`, `leader-ai-1440`, `footer-bottom-390`. Lượt đầu, ca loading và Automation-Hôm-nay dùng sai điều kiện (kỳ đã được giữ từ bước trước, nên request không chạy) và đo footer sai container cuộn. Các số đó vẫn giữ trong `regression.json`; kết quả trong bảng lấy từ lần chạy lại có điều kiện đúng (`regression-2.json`).

### DB/JWT/HTTP

- Container mới `reports-5b-recheckf3-20261102` (`2283d9cf1240`, postgres:15-alpine, tmpfs, bind 127.0.0.1:55473, không mount). Trước khi ghi đã xác minh `reports_1b_verify|postgres|0 bảng|0 app role`. Prisma db push (không phải migration replay), fixture giả.
- App role `reports_verify_app` NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB; 70 bảng bật RLS đều có owner `postgres` và FORCE RLS.
- Harness 127.0.0.1:30575: chỉ route auth/report thật, không app bootstrap/queue/cron/socket/provider/AI/gửi tin.
- Kết quả: **15/15** baseline JWT/RLS/HTTP, **14/14** AI DB/JWT/HTTP/SQL oracle, **2/2** đối soát Automation/Broadcast, **44/44** trạng thái API theo quyền (11 endpoint × admin/leader/deputy/member, JWT login thật). Đây là các nhóm riêng, không cộng lại thành một số "luồng tích hợp".
- HTTP log: 5.601 request, một 503 có kiểm soát; 400/401/403 đến từ các ca âm của check backend; 404 notifications (123), privacy/status (96), action-hub (73) do harness không đăng ký module, **không phải lỗi production**, không giả thành 200.

### Unit/build

`frontend/`: 10 spec báo cáo **74/74 PASS**; toàn frontend **18 file, 145/145 PASS**; `npm.cmd run build` (`vue-tsc -b && vite build`) PASS, vẫn có cảnh báo chunk>500kB; bundle `index-odCaeQTb.js` giống lần build của checkpoint. Không chạy backend unit vì lượt này không đổi backend.

### Artifact, integrity, cleanup

- [Artifact lần4](../../artifacts/reports-mobile-5b-recheck-f3-20261102-1325/): snapshot/status trước–sau, `source-integrity.json`, log DB/RLS/test/build/schema/setup/server, `results.json` (15), `db-jwt-http-results.json` (14), `automation-broadcast-db-results.json` (2), `capabilities-results.json` (44), `http-access.jsonl`, `browser/` (CDP client, script, scenario events) và `browser-captures/` (JSON + PNG).
- Helper chỉ để kiểm chứng: `backend/scripts/reports-verification/5b-recheckf3-*.ts` (6 file, bản sao recheck2, chỉ đổi đường dẫn và port).
- **Source integrity: 837/837 file `frontend/src`, `backend/src`, `backend/tests` giữ nguyên SHA256 từ 13:23 tới 13:38.** Diff git status trước/sau chỉ thêm artifact và helper của lượt này.
- Cleanup 13:38–13:39: dừng 8 process Chrome của profile tạm (đã xóa profile), không còn listener 9333; dừng harness PID31392, không còn listener 30575; xóa container `reports-5b-recheckf3-20261102`; reset `scenario.json`; xóa token fixture khỏi storage. **Không đụng** PID44556 (30574) và container `reports-1b-verify-20261101` của lượt kia, cả hai vẫn chạy.

### Giới hạn

Chromium DSF1,25 headless và mobile emulation không chứng minh Safari/WebKit/iPhone/PWA/VoiceOver/font scaling thật, cũng như hành vi khi đổi scale OS thật. Các state đã kiểm tra là các luồng đại diện, chưa phủ mọi state của cả 9 danh mục. Đây không phải nghiệm thu tích hợp bước6.

**Gate: 5B PASS local.** Bước tiếp là 6A (nghiệm thu tích hợp), chưa bắt đầu trong lượt này. 6A/6B NOT_STARTED.

**Bổ sung 13:44 (+07), theo yêu cầu người dùng dừng môi trường của lượt recheck4:** khi kiểm tra, PID44556 không còn tồn tại, port 30574 và 55471 không còn listener, không có process node nào của `5b-recheck4`, và Docker Desktop không chạy (không kết nối được Docker API). Vì vậy không có gì để dừng thêm. Không khởi động lại Docker chỉ để kiểm tra container `reports-1b-verify-20261101`; container này dùng tmpfs nên dữ liệu fixture không còn sau khi engine dừng.

<a id="supplement-20261102-1651"></a>

## Bổ sung kết quả phiên recheck4 và đối chiếu báo cáo6B —02/11/2026 16:51 (+07)

**FAIL5B vì F4 P2. F3 PASS; không mở lại F3.** Hoàn thiện bằng chứng của phiên `reports-mobile-5b-recheck4-20261102` thu lúc12:43–12:54; đối chiếu source hiện tại và báo cáo6B khi người dùng gửi lúc16:xx. Không sửa runtime hay test. Không ghi ngược các bước6A/6B đã chạy thành NOT_STARTED.

### F4 — P2: khoảng CSS767,x vẫn chọn desktop nhưng không có compact navigation

- Browser IAB thật, DPR **1,33000004**, viewport vật lý1021: CSS width **767,66918945**, `innerWidth=768`. Không ép getter hoặc sửa state app.
- `frontend/src/composables/use-mobile.ts:13` dùng `innerWidth<768`; `frontend/src/App.vue:30` vì thế chọn DefaultLayout. CSS compact ở `frontend/src/layouts/DefaultLayout.vue:518` và media query của composable `use-report-compact-navigation.ts:41` bắt đầu từ CSS768 nên đều không khớp.
- Đo ổn định: `.compact-navigation` display:none/0 rect; 7 link desktop display:flex; nút Báo cáo x760,139→862,453, vượt viewport767,669. **body.scrollWidth1086/clientWidth768**, tràn318px; document có thể clip overflow nên không chỉ nhìn `document.scrollWidth` để kết luận PASS.
- Đã tái hiện lại sau khi đổi qua CSS766,165 và768,421. Hai điểm đối chứng có cấu hình layout phù hợp; lượt đo nhanh ban đầu có documentOverflow0 trong lúc chuyển layout, được giữ nguyên. Quan sát ổn định và screenshot mới là bằng chứng header bị cắt.
- [Quan sát raw](../../artifacts/reports-mobile-5b-recheck4-20261102/browser-captures/interactions.json), record `F4-stable-visible-cropped-header`; [ảnh F4](../../artifacts/reports-mobile-5b-recheck4-20261102/browser-captures/F4-real-lower-boundary-repeat.png). Không suy rằng vá F3 gây ra F4: `use-mobile.ts` và CSS breakpoint không thuộc patch F3.
- Lượt A cần thống nhất cách chọn MobileLayout và compact với CSS width thực. B kiểm lại cả biên767,x và1099,x, không chỉ width nguyên; giữ bảo vệ route/unmount/late-leave. Lượt này không sửa.

### Các kết quả đã đạt trong cùng phiên

| Kiểm tra | Kết quả và giới hạn |
|---|---|
| F3 width lẻ thật | CSS1099,248/innerWidth1099/DPR1,33: overlay0, focus đúng nút Báo cáo, Tab sang Cài đặt. Lặp lại với focus từ link Dashboard bên trong menu. [Ảnh](../../artifacts/reports-mobile-5b-recheck4-20261102/browser-captures/F3-real-fractional-repeat.png). |
| Focus/navigation | 1100/1440, trở về1024 không mở lại menu, Escape trả focus Điều hướng, 766 chuyển layout, rời report không kéo focus: đạt các quan sát đã lưu. |
| Bố cục chuẩn | **40/40 PASS**: 9×320/390/430, 9×1440, Overview768/1024/1099/1100. **Không bao gồm F4**, điểm bổ sung này FAIL. Touch44px được kiểm ở các width mobile, không áp kết luận đó cho mọi nút desktop. |
| Contrast | Initials **100/100**, min5,83:1 ở các avatar được render; chữ chính **691/691**,18 nhóm ở390/1440. Không khẳng định mọi màu/trạng thái chưa render. |
| Frontend | `node node_modules/vitest/vitest.mjs run --reporter=verbose`: **145/145**,18spec (gồm74 report tests/10spec). `npm.cmd run build` (`vue-tsc -b && vite build`): PASS; cảnh báo chunk>500kB vẫn còn. Log chạy12:43 riêng, không tái dùng log6B16:28. |
| DB/JWT/HTTP | **15/15 baseline +14/14 AI +2/2 Automation/Broadcast**; actual-login, route thật trên DB disposable/app role. **44/44** status theo4role×11endpoint. Không phải nghiệm thu6B. |
| Browser trạng thái | Overview loading/error503/retry không giữ KPI cũ, đổi7ngày→Hôm nay với response cũ về muộn, drill-down/trap/Escape/back, bảng/chart/heatmap cuộn bàn phím, footer không che nội dung; Automation0/unavailable; AI main/shared: đạt các luồng đại diện. Không phủ mọi state của9view. |
| Browser quyền | Admin9, leader/deputy6 danh mục; leader/deputy bị chặn route hệ thống, member không có menu và bị redirect khỏi report trên mobile/desktop. |

### Toàn vẹn, môi trường và giới hạn bằng chứng

- Artifact riêng: [reports-mobile-5b-recheck4-20261102](../../artifacts/reports-mobile-5b-recheck4-20261102/). Có6helper review-only `backend/scripts/reports-verification/5b-recheck4-*`, sao từ helper recheck2, đổi artifact/port; không đăng ký vào app runtime.
- **Sự cố baseline phải giữ rõ:** như lịch sử13:39 đã ghi, phiên khác ghi đè `start-time.txt`, `git-status-before.txt`, `source-before.json` của artifact này lúc13:23. Không dùng các file đó để khẳng định baseline đầu12:43 còn nguyên. `source-integrity.json` chỉ chứng minh **837/837 so với snapshot13:23 đến16:47**; ba SHA patch F3 hiện tại khớp `remediation3/postimage-sha256.txt`. Không che sự cố hay khôi phục giả bản gốc.
- DB local tmpfs, loopback55471, đã kiểm rỗng trước ghi; role `reports_verify_app` NOSUPERUSER/NOBYPASSRLS/non-owner, các bảng liên quan FORCE RLS. Schema db push + file RLS hiện tại, **không migration replay**. Harness30574 chỉ auth/report/static build, không app bootstrap/provider/queue/cron/socket/send/paidAI; notifications/privacy/action-hub404 là giới hạn đăng ký harness.
- Cleanup bổ sung16:47: không còn process `5b-recheck4-server.ts` để dừng; port30574/55471 không listener; exact container `f24db027…` ở trạng thái exited. Browser đã logout fixture, reset viewport, đóng tab riêng. [Cleanup](../../artifacts/reports-mobile-5b-recheck4-20261102/cleanup.json). Không xóa container hay môi trường của phiên6B.
- Cách đo helper nguồn có ở artifact recheck2; raw JSON/PNG trong artifact mới là quan sát của phiên này. Safari/iPhone/PWA/VoiceOver/scaleOS thật chưa nghiệm thu. Không có commit/push/deploy.

**Trạng thái hiện tại:** 5B FAIL do F4; F3 PASS. 6A đã chạy và6B FAIL vì F6B3-1/F6B3-2 theo [review báo cáo6B](06-acceptance-report-review.md). Cần remediation A rồi B kiểm lại;7A/7B chưa bắt đầu.
