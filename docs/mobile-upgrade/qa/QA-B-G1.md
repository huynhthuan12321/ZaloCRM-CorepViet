# QA Đợt B — Gate G1 (khung mobile)

Ngày: 2026-11-07 · Worktree `F:\ZaloCRM-wt\shell` · branch `mobile/shell` · base `9f228c7` (chưa commit) · Người kiểm: mobile-qa
Contract: `contracts/CONTRACT-A.md` §4, §5, §6, §10.2 (đợt B) · Gate: 07_MULTI_AGENT_PLAN §5 (G1)

**Kết luận: ĐẠT G1 ở mức bằng chứng Chromium + WebKit desktop (Playwright) và static. CHƯA có bằng chứng Safari iPhone / Home Screen PWA — G1 chưa thể coi là "đạt trên iPhone".**
Không có lỗi chặn (Critical). Có 1 lỗi High (giao diện Tối chưa phủ màn cũ) và các lỗi Medium/Low bên dưới; tất cả nằm ngoài phạm vi sở hữu của shell (view cũ do đợt C/D thay).

## 1. Lệnh và kết quả

| Lệnh (trong `frontend/`) | Kết quả |
|---|---|
| `npx vue-tsc -b` | exit 0, **0 lỗi** |
| `npx vitest run` | **35 file pass / 35; 291 test pass, 0 fail** (baseline đợt A: 20 file / 161 test — phần tăng là spec mới của đợt B) |
| `npm run build` (vue-tsc -b && vite build) | thành công (~2,4 s). Cảnh báo chunk >500 kB (ChatView, exceljs, rich-text-editor): **có sẵn từ trước**, không phải do đợt B |
| `npx playwright test e2e/shell.spec.ts` (WebKit + Chromium, chạy trên `vite preview` của bản build) | **138 pass / 138** (69 test × 2 engine) |
| `BASE_DIST=<dist mobile/base> npx playwright test e2e/desktop-regression.spec.ts` | **8 pass / 8**, diff pixel = 0 (xem §4) |
| `npx playwright test e2e/shots.spec.ts` + `e2e/make-pairs.spec.ts` | 44 ảnh + 8 ảnh ghép cặp |

Lỗi baseline có sẵn trước đợt B: **không có** (tsc/vitest sạch ở đợt A).
Ghi chú: thư mục `e2e/` KHÔNG nằm trong `tsconfig.app.json` (`include: src/**`), nên `vue-tsc -b` không kiểm kiểu cho file e2e; Playwright tự biên dịch. `vitest.config.ts` chỉ lấy `src/**/*.spec.ts` nên không nhặt nhầm file e2e.

## 2. Phạm vi file đã ghi (chỉ trong worktree shell)
- `frontend/playwright.config.ts` — 2 project (`chromium`, `webkit` = Desktop Safari/WebKit desktop), webServer `vite preview` cổng 4174 (dist của worktree), cổng 4175 chỉ dựng khi có env `BASE_DIST`. Output: `test-results/`, `playwright-report/` (xem đề xuất .gitignore §8).
- `frontend/e2e/shell.spec.ts`, `desktop-regression.spec.ts`, `shots.spec.ts`, `make-pairs.spec.ts`
- `frontend/e2e/helpers/mock-api.ts` (mock `page.route`, user giả, dữ liệu giả `*.example.invalid`, "Khách Giả A/B"), `helpers/pixel-diff.ts` (so pixel bằng canvas trong trình duyệt, không thêm thư viện)
- `docs/mobile-upgrade/qa/QA-B-G1.md`, `docs/mobile-upgrade/qa/B-shots/**`
- Không sửa `frontend/src/**`, không sửa `package.json`/`.gitignore`. Không ghi gì vào `F:\ZaloCRM-CorepViet` (bản build base ra `%TEMP%\qa-base-dist`; `git status` checkout chính chỉ còn thay đổi có sẵn `claude-setup/commands/mobile-sprint.md`). Profile trình duyệt do Playwright tạo trong %TEMP%.

## 3. Bảng gate G1

| # | Tiêu chí | Kết quả | Bằng chứng / mức |
|---|---|---|---|
| 1 | Không overflow ngang 320/375/390/430 + landscape 667x375 (6 route × 5 viewport × 2 engine) | **PASS** (có ghi chú) | Chromium + WebKit desktop. `documentElement`, `body`, `.m-shell`, `.m-main__scroll` đều `scrollWidth <= clientWidth` (riêng `.m-main__scroll` tính tới `offsetWidth` — xem L-2). Ghi chú: phần tử bị clip trong màn Tổng quan (M-1) |
| 2 | Safe-area | **PASS có điều kiện — CHỈ MÔ PHỎNG** | `env(safe-area-inset-*)` = 0 trên desktop. Test đè tay `--m-safe-top:47px`, `--m-safe-bottom:34px`: header cao thêm ≥46px, tabbar cao thêm ≥33px, tiêu đề không nằm trong 47px trên, nút tab cuối không nằm trong 34px dưới, tabbar sát đáy viewport. **Không thay thế kiểm trên iPhone thật** (notch, Dynamic Island, home indicator, landscape trái/phải) |
| 3 | Nav đúng route + quyền | **PASS** | Chromium + WebKit: 5 mục đúng thứ tự Tổng quan · Khách hàng · **Hội thoại (giữa, nổi, tâm ±3px)** · Lịch hẹn · Tài khoản; href `/`,`/contacts`,`/chat`,`/appointments`,`/account`; bấm đúng route; `aria-current` đúng cho `/`, `/contacts`, `/chat`, `/appointments`, `/account`, `/reports/tong-quan`→Tài khoản, `/settings/personal/profile`→Tài khoản; `/chat/:convId` ẩn tabbar; user thiếu `conversation`+`contact` → còn 3 mục, không nút nổi, chia đều; sale đủ 5, không có tab Báo cáo. Badge: hiện `7`, aria-label "Hội thoại, 7 khách đang chờ trả lời", `99+`, **ẩn khi 0, ẩn khi API 500** (không đổi lỗi thành 0). Menu Tài khoản: admin đủ 7 mục + Đăng xuất; sale ẩn Nick Zalo/Kho media/Báo cáo/Cài đặt tổ chức; leader có `engagement_score` thấy Báo cáo, ẩn Nick/Cài đặt; **không có chữ "TikTok"** trong toàn trang `/account` |
| 4 | Sáng / Tối / Theo máy | **PASS (phần khung)** | Chromium + WebKit: mặc định Sáng (kể cả khi máy tối → vẫn `light only`); Tối → `html[data-theme]=dark`, `.m-shell[data-theme]=dark`, `meta color-scheme=dark`, `theme-color=#0f1720`, Vuetify `v-theme--hsDark`, nền shell `rgb(15,23,32)`; Theo máy bám `prefers-color-scheme` và đổi trực tiếp khi emulate đổi; reload giữ lựa chọn theo user (`crm.mobile.themePreference:<userId>`), user khác không thừa hưởng (về Sáng), quay lại user đầu vẫn Tối, **không ghi key `theme`**; Báo cáo luôn Sáng dù chọn Tối, về Tài khoản lại Tối; resize sang desktop dọn `data-theme`, `color-scheme` về `light only`, Vuetify `hsLight`. **Giới hạn:** các màn cũ chưa tối theo (H-1) |
| 5 | Desktop ≥1100 không đổi | **PASS** | So pixel 1440x900, cùng mock, cùng giờ cố định, build worktree shell vs build mobile/base (`9f228c7`): `/`, `/contacts`, `/chat`, `/appointments` × (Chromium, WebKit) — **0 pixel khác (maxChannelDelta 0)**, kích thước ảnh khớp. 768/1024/1440: không dựng `.m-shell`/tabbar mobile; `/account` → `/settings/personal/profile` ở cả 3. Giới hạn: mock rỗng/ít dữ liệu; `/chat` desktop dựng khung nhưng 1 computed ném `TypeError` do mock thiếu (cả hai bản như nhau) nên chưa phủ thread có dữ liệu |
| 6 | `vue-tsc -b` | **PASS** | static |
| 7 | `vitest run` | **PASS** | static (291/291) |
| + | Touch target ≥44px | **PASS** cho phần shell | tab (kể cả nút nổi), nút header (Quay lại, chuông), hàng menu Tài khoản, nút Đăng xuất, nhãn Sáng/Tối/Theo máy: tất cả ≥44×44 ở 5 viewport × 2 engine |
| + | Offline banner | **PASS** | Câu chữ đúng "Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng"; nằm trong luồng, không đè header (`bottom ≤ header.top`), không tràn ngang, biến mất khi online. Mô phỏng bằng ghi đè `navigator.onLine` + sự kiện `offline`/`online` (không dùng `context.setOffline`) |
| + | Input <16px | **Không đo ở đợt này** | Màn Tài khoản không có ô nhập; ô tìm kiếm Chat/Khách là view cũ (xem M-2). Cần đo lại ở đợt C/D |

## 4. Hồi quy desktop 1440x900
Ảnh: `docs/mobile-upgrade/qa/B-shots/desktop-regression/{tongquan,khachhang,chat,lichhen}-1440-{base,shell}-{chromium,webkit}.png`; số liệu `*.json` cạnh đó. Ngưỡng test 0,1% pixel; thực tế **0,000%** cả 8 ca. Bản base được build từ checkout chính bằng `npx vite build --outDir %TEMP%\qa-base-dist` (không ghi vào repo chính).

## 5. Lỗi / phát hiện (theo mức)

Không có Critical.

**High**
- **H-1. Giao diện Tối không phủ màn cũ.** Chọn Tối chỉ đổi khung (header, tabbar, nền, màn Tài khoản). Tổng quan hiển thị thẻ/nền trắng chữ tối trong khung tối; Hội thoại có ô tìm kiếm + vùng danh sách sáng; Lịch hẹn nội dung sáng. Khách hàng thì đã tối (CSS riêng). Bằng chứng: `B-shots/tongquan-390-dark-{chromium,webkit}.png`, `chat-390-dark-chromium.png`, `lichhen-390-dark-chromium.png`; cặp `B-shots/pairs/*`. Đây đúng rủi ro đã nêu ở CONTRACT-A §6/§10.1 (`hs-crm-theme.css` nhiều `!important` màu sáng). Không phải lỗi của file shell; được giải quyết khi C/D thay view bằng bản mobile dùng token `--m-*`. **Không nên bật lựa chọn Tối cho người dùng cuối trước khi C/D xong** (hoặc chấp nhận trải nghiệm lẫn).

**Medium**
- **M-1. Tổng quan mobile: nội dung bị clip mép phải.** `frontend/src/views/DashboardView.vue:49` (`.at-greet__r`), nút `.at-btn--primary` ("Vào Tin nhắn") `right=556` ở viewport 320/375/390/430 và nút "Nhận khách" bị cắt; lời chào bị bóp thành cột hẹp 4 dòng. Tái hiện: mock đăng nhập admin, mở `/` ở 390x844 → Expected: mọi nút nằm trong màn hình; Actual: nút bị che sau mép (không gây scroll ngang vì cha `overflow:hidden`). Tồn tại từ baseline đợt A; thuộc LOCK D-2 (`DashboardView`).
- **M-2. Chiều cao `100vh` cứng ở các view cũ** làm cao hơn vùng khả dụng của shell: `frontend/src/views/AppointmentsView.vue:481` (`calc(100vh - var(--smax-topnav-h, 52px))`) → trang cao ~792px trong vùng cuộn 722px (sh=796 / ch=722 ở 390x844), tạo cuộn lồng/đáy bị che dưới tabbar. Cùng mẫu: `ContactsView.vue:1586`, `ChatView.vue:836,987`, `DashboardView.vue:658`. Vi phạm CONTRACT-A §5 (cấm `100vh` trong mã mobile; con không tự trừ pixel). Thuộc đợt C/D (LOCK C-1, D-1, D-2). Chưa đo tương tác bàn phím iOS với các view này.
- **M-3. Khách hàng (sáng): hàng danh sách nền xám, chip "Mới" gần như không đọc được** (`B-shots/khachhang-390-light-chromium.png`) — view cũ, D scope.

**Low**
- **L-1. Pill tab đang chọn chạm sát mép màn hình** ở ô ngoài cùng (Tổng quan bên trái, Tài khoản bên phải; thấy rõ ở `taikhoan-landscape-667x375-light-webkit.png`): `frontend/src/components/mobile/shell/MobileTabBar.vue` (style `.m-tab`/`.m-tabbar__cell`). Thẩm mỹ, không mất chức năng.
- **L-2. Artefact thanh cuộn cổ điển trong WebKit desktop:** trên `/account`, `/appointments` (và `/contacts` landscape), `.m-main__scroll` báo `scrollWidth` = `offsetWidth` (dư đúng 10px = bề rộng thanh cuộn) vì nội dung (`.m-account`, `.apt-page`…) giữ chiều rộng lúc chưa có thanh cuộn; không tái hiện ở 1 worker, tái hiện được khi chạy song song. iOS dùng thanh cuộn nổi nên **không ảnh hưởng thực tế**; test coi `sw ≤ offsetWidth` là artefact và ghi annotation `scrollbar-artifact`. Cần xác nhận lại trên iPhone thật. Gợi ý nếu muốn triệt tiêu: `scrollbar-gutter: stable` hoặc `overflow-y: scroll` ở `.m-main__scroll` (`MobileLayout.vue`) — để shell-dev xem xét.
- **L-3. Nhãn "Hội thoại" dưới nút nổi** nằm thấp hơn nhãn các tab khác và sát đáy khung khi `safe-area-bottom = 0` (cách đáy ~6px ở 390x844). Chưa rõ khi có home indicator 34px — cần xem trên iPhone thật.
- **L-4. Landscape 667x375:** header 56px + tabbar ~64px còn vùng nội dung 253px/375px (67%). Cân nhắc ẩn/thu gọn header ở landscape (quyết định thiết kế).

## 6. Mức bằng chứng (không nâng hạng)
| Hạng | Đã có | Ghi chú |
|---|---|---|
| Static (tsc, vitest, build, đọc code) | Có | |
| Chromium (desktop, viewport mô phỏng) | Có | Playwright 1.65, "Desktop Chrome" + `setViewportSize`; **không** emulate mobile/touch/DPR iPhone. DPR=1 |
| WebKit desktop | Có | "Desktop Safari" (WebKit Windows), DPR 2, thanh cuộn cổ điển, không phải iOS WebKit |
| Safari iPhone thật | **CHƯA** | |
| Home Screen PWA iPhone | **CHƯA** | Đợt E |

Không kiểm: bàn phím ảo / VisualViewport thật (chỉ có unit test jsdom của composable), `100dvh` động khi thanh Safari co giãn, notch/Dynamic Island, vuốt-back, rotate thật, font hệ thống iOS, `-webkit-fill-available` iOS <15.4, hiệu năng, a11y VoiceOver, dữ liệu thật/độ dài tên thật, socket thật (đã chặn socket.io), badge với `GET /conversations/counts` thật, chat deep link/gửi (đợt C), media picker.

## 7. Checklist cần thử trên iPhone thật (Safari + Home Screen)
1. Mở `/account`, `/`, `/contacts`, `/chat`, `/appointments`: header không bị notch/Dynamic Island che; tabbar không bị home indicator che; nút nổi Hội thoại + badge không bị cắt (portrait và landscape cả hai chiều xoay).
2. Landscape: nội dung trái/phải không lọt vào vùng notch (safe-left/right); tabbar không che nội dung cuối trang.
3. Cuộn trang: thanh địa chỉ Safari co giãn → shell không nhảy, không khoảng trắng đen trên tabbar (cf. baseline đợt A).
4. Chọn Sáng / Tối / Theo máy: đổi chế độ hệ thống (Control Center) khi đang ở "Theo máy" → đổi ngay; status bar/`theme-color` đổi đúng; không có chữ vô hình ở màn cũ ở chế độ Tối (H-1).
5. Đăng nhập user A chọn Tối, đăng xuất, user B đăng nhập → B ở Sáng; A đăng nhập lại → Tối.
6. Offline: bật Chế độ máy bay → banner mới, đúng câu chữ, không đè header; tắt → banner biến mất.
7. Báo cáo (Tài khoản → Báo cáo): luôn Sáng, header riêng, quay lại về Tài khoản; vuốt-back của Safari hoạt động, không thoát app.
8. Chạm thử từng tab/nút bằng ngón tay (≥44px) kể cả nút nổi; không zoom trang khi chạm ô nhập (đợt C/D).
9. Thêm vào Màn hình chính (đợt E): mở từ icon, kiểm lại mục 1–3 và 6–7 ở chế độ standalone, khóa máy rồi mở lại.
10. Dùng tài khoản test: badge số khách chờ khớp số `unreplied` thật; badge ẩn khi mất mạng/lỗi (không về 0).

## 8. Đề xuất cho orchestrator

**LOCK REQUEST: `frontend/package.json`** — thêm script chạy E2E (devDependency `@playwright/test ^1.65.0` đã có ở dòng 34). Diff đề xuất:
```diff
   "scripts": {
     "dev": "vite",
     "build": "vue-tsc -b && vite build",
     "preview": "vite preview",
     "test": "vitest run",
-    "test:watch": "vitest"
+    "test:watch": "vitest",
+    "test:e2e": "playwright test",
+    "test:e2e:regression": "playwright test e2e/desktop-regression.spec.ts"
   },
```
Ghi chú vận hành: `test:e2e` chạy trên **bản build có sẵn** (`npm run build` trước); `test:e2e:regression` cần biến môi trường `BASE_DIST` (đường dẫn dist đã build từ `mobile/base`). Cần `npx playwright install webkit chromium` trên máy mới. Shots/pairs chỉ chạy khi gọi riêng (`playwright test e2e/shots.spec.ts`, `e2e/make-pairs.spec.ts`); nếu muốn loại khỏi `test:e2e` mặc định, đổi tên hoặc thêm `testIgnore` (QA sẽ làm trong `playwright.config.ts` nếu được yêu cầu).

**Đề xuất `.gitignore`** (QA không sửa): chưa có mục nào bỏ qua kết quả Playwright (đã kiểm `git check-ignore`). Đề xuất thêm:
```
frontend/test-results/
frontend/playwright-report/
```
Hiện `git status` không báo hai thư mục này vì QA đã xóa sau khi chạy; chúng sẽ xuất hiện lại ở lần chạy sau nếu chưa ignore.

Mục đề nghị khác: (a) giữ B-shots trong repo hay chuyển ra artifact ngoài (44 ảnh + 8 ảnh ghép + 24 ảnh desktop) — kích thước đáng kể; (b) đợt C/D cần fixture có dữ liệu (conversation + messages) để phủ thread/deep link/gửi; mock hiện chỉ có Dashboard/Contacts/Appointments tối thiểu.

## 9. Cách chạy lại
```
cd frontend
npx vue-tsc -b && npx vitest run && npm run build
npx playwright test e2e/shell.spec.ts                   # WebKit + Chromium, tự dựng vite preview :4174
# hồi quy desktop: build mobile/base ra thư mục ngoài repo rồi trỏ BASE_DIST
BASE_DIST=<thư mục dist base> npx playwright test e2e/desktop-regression.spec.ts
npx playwright test e2e/shots.spec.ts && npx playwright test e2e/make-pairs.spec.ts --project=chromium
```
