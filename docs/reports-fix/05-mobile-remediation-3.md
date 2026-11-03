# Sửa F3 sau tái kiểm tra5B — focus tại breakpoint lẻ

**Trạng thái: COMPLETED_PENDING_VERIFICATION.** Lượt A, 02/11/2026 12:31–12:38 (+07). Đây là tự kiểm tra của lượt sửa, chưa phải tái kiểm tra độc lập 5B. **Ca browser có CSS width thật nằm giữa1099 và1100: BLOCKED** (xem bên dưới). 6A/6B vẫn NOT_STARTED.

## Phạm vi và đầu vào

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, nhánh `fix/reports-kpi-3b`. Working tree đã dirty từ trước (`git status` lúc bắt đầu 618 dòng gồm cả `-uall`), được giữ nguyên: không reset/stash/commit/push/merge/deploy, không worktree/agent, không thêm dependency. Git gọi với `-c safe.directory=...` từng lệnh, không đổi cấu hình global.
- Đã đọc: prompt A/B, `11_REPORTS_SOURCE_REVIEW.md`, `12_REPORTS_FOUR_POINT_VERIFICATION.md`, README roadmap, `05-mobile-remediation-2.md`, mục `recheck-20261102-1159` và `recheck-20261102-1213` của `05-mobile-verification.md`, cùng source hiện tại. Repo không có `AGENTS.md`; skill `vue-best-practices` không có trong phiên này, nên áp dụng quy ước Vue 3 Composition API đang có trong file.
- Trước khi sửa: 837/837 file `frontend/src`, `backend/src`, `backend/tests` trùng hash snapshot lượt 11:59. Preimage và SHA256 của 3 file sẽ sửa lưu tại `preimage/`.

## Thay đổi

| File | Dòng | Nội dung |
|---|---|---|
| `frontend/src/composables/use-report-compact-navigation.ts` | 4, 8–11, 21–37, 40, 46 | Tham số thứ hai đổi từ callback `focusReports()` thành getter `reportsTarget()`. Bỏ cả hai guard `window.innerWidth >= 1100` (trước ở `:22`, `:29`). Watch đặt cờ restore khi rời compact mà vẫn ở `/reports/` — quyết định theo cùng media query với CSS. Sau leave chỉ focus nếu component còn mounted, không còn compact, còn ở report và target `isConnected` + có client rect (đang được render) |
| `frontend/src/layouts/DefaultLayout.vue` | 177–178 | Truyền phần tử `[data-report-nav-trigger]` thay vì gọi `.focus()` trực tiếp. Không đổi template, menu, quyền hay CSS |
| `frontend/src/composables/use-report-compact-navigation.dom.spec.ts` | 21–32, 33–44, 59–120, 131–142 | Helper `setViewport(innerWidth, compactMatches)` tách hai giá trị; `resize()` cũ dùng helper này. Thêm ca F3, ca đối chứng ngược, 1440, target ẩn/tách khỏi DOM, rời route/unmount trước late leave; bổ sung late leave sau unmount vào ca dưới768. Không xóa hay nới assertion cũ |

Diff đầy đủ: `composable.diff`, `DefaultLayout.diff`, `spec.diff` trong artifact.

**Trước:** CSS width1099,248px → media `max-width:1099px` false, overlay đóng, nhưng `innerWidth=1099` nên guard bỏ trả focus; focus rơi BODY, Tab về logo.
**Sau:** cờ restore không phụ thuộc `innerWidth`; khi leave xong, nút Báo cáo đang hiển thị nhận focus đúng một lần. Không đổi 1100 thành 1099.

Các bảo vệ giữ nguyên/bổ sung: integer1099 vẫn compact (menu mở); quay lại compact trước late leave không focus; xuống dưới768 App thay DefaultLayout bằng MobileLayout (`App.vue:30`, `use-mobile.ts:13`) nên composable unmount và late leave vô hiệu; rời report, target ẩn hoặc bị unmount không nhận focus; menu không tự mở lại.

## RED / GREEN

- **RED** 12:32:31 — implementation cũ (SHA `3fe21579…`) + spec có `setViewport` và hai ca mới (vẫn dùng signature callback cũ): **1 failed | 8 passed (9)**, đúng ca `fractional 1099.248px…`: `expected "vi.fn()" to be called 1 times, but got 0 times`. Bản spec trung gian này không lưu riêng; nội dung là spec cuối trừ phần chuyển sang target getter và các ca bảo vệ thêm sau. Log `red.log`.
- **GREEN** 12:33:23 — implementation mới (SHA `4e287ec8…`) + spec cuối (SHA `f7793dc4…`): **12/12 PASS**. Log `green.log`.

## Test và build

| Lệnh (tại `frontend/`) | Kết quả |
|---|---|
| `node node_modules/vitest/vitest.mjs run` 10 spec report (cùng danh sách lượt 11:59) | **10 file, 74/74 PASS** (12:33:25). Tăng từ 69 vì spec compact từ 7 lên 12 ca |
| `node node_modules/vitest/vitest.mjs run` toàn frontend | **18 file, 145/145 PASS** (12:33:57) |
| `npm.cmd run build` (`vue-tsc -b && vite build`) | **PASS** (12:33:28), còn warning chunk>500kB có từ trước |

Không chạy backend tests vì không có thay đổi backend.

## Browser tự kiểm tra

Môi trường: DB disposable `reports_1b_verify` trong container `f24db02778ff` (postgres:15-alpine, tmpfs, bind 127.0.0.1:55471, không mount). Sau start đã xác minh `reports_1b_verify|postgres|0 bảng|0 app role` trước mọi lệnh ghi. Prisma db push (không phải migration replay), seed fixture giả bằng `5b-remediation3-setup.ts`. App role `reports_verify_app` NOSUPERUSER/NOBYPASSRLS; 7 bảng tenant owner `postgres`, ENABLE+FORCE RLS. Harness `5b-remediation3-server.ts` ở 127.0.0.1:30573 dùng route auth/report thật, phục vụ `frontend/dist` vừa build (bundle `index-odCaeQTb.js` có logic mới, không còn `innerWidth>=1100`). Không app bootstrap/queue/cron/socket/provider/AI/gửi tin; 180 request, 0 lỗi 5xx. Đăng nhập UI bằng fixture `verify-admin`.

Đo bằng hàm read-only: chiều rộng CSS thực, `innerWidth`, visualViewport, DPR, media query, số overlay active, rect activator/target và **danh tính** `document.activeElement` (so sánh với phần tử, không dùng textContent của BODY). Không override `innerWidth`, không đổi state app. Bước setup gọi `.focus()` lên activator trước khi nhấn Enter.

| Ca | Kết quả |
|---|---|
| 1024: Enter mở Điều hướng, ArrowDown | Overlay1, focus link `Dashboard` trong menu |
| **1024 → CSS width lẻ (1099,25)** | **BLOCKED**: pane có DPR1, `resize_window` làm tròn thành1099 (innerWidth/css/visualViewport đều1099, media compact true, menu vẫn mở — đúng cho integer1099). Không tạo được width thật trong (1099,1100) |
| 1099 → 1100 | Media false, overlay0, activator0×0, target102×36, **focus = `[data-report-nav-trigger]`**; Tab tiếp theo → `Cài đặt` (không về logo). Có ảnh `A-1100-after-leave.jpg` |
| 1100 → 1024 | Overlay0, không mở lại, focus giữ ở `Cài đặt` (không bị cướp) |
| 1024 mở menu → 1440 | Overlay0, **focus = nút Báo cáo** |
| 1024 mở menu → Escape | Overlay0, focus về activator `Điều hướng` |
| 1024 mở menu → 766 | MobileLayout (không còn topnav desktop), overlay0, không có target desktop; focus BODY vì DefaultLayout đã unmount |
| 1024 mở menu → Enter vào Dashboard (rời report) | Route `/`, overlay0, focus không chuyển sang nút Báo cáo |

Lần thử đầu của ca rời report ngay sau khi quay về từ766 để menu đóng và route không đổi; làm lại từng bước thì đạt. Chuỗi thô giữ trong `browser-captures/observations.json`.

## Artifact

[artifacts/reports-mobile-5b-remediation3-20261102](../../artifacts/reports-mobile-5b-remediation3-20261102/): `start-time.txt`, `git-status-before.txt`/`git-status-after.txt`, `preimage/` (+ `sha256.txt`), `postimage-sha256.txt`, `*.diff`, `red.log`, `green.log`, `frontend-tests.log`, `frontend-all-tests.log`, `frontend-build.log`, `db-empty-check.txt`, `db-setup.json`, `app-role-rls-proof.txt`, `schema.log`, `setup.log`, `server*.log`, `http-access.jsonl`, `browser-captures/{observations.json,A-1100-after-leave.jpg}`, `source-integrity.json`, `cleanup.json`. Không sửa artifact hay tài liệu FAIL cũ.

**Source integrity:** so với snapshot 11:59, 834/837 file giữ nguyên; chỉ 3 file trong bảng thay đổi. Diff git status đầu/cuối chỉ thêm artifact này và hai helper `backend/scripts/reports-verification/5b-remediation3-{setup,server}.ts` (bản sao helper recheck3, chỉ đổi đường dẫn artifact/port).

## Cleanup

12:37:39: dừng PID22392, listener30573=0, container `exited` (tmpfs, dữ liệu fixture mất); browser xóa storage (localStorage rỗng), reset viewport, đóng tab. Không chạy Vite.

## Giới hạn và bước tiếp

- Ca CSS width lẻ thật chưa chạy được trên browser; mới có unit đối chứng media=false/innerWidth=1099 (RED→GREEN). Không tuyên bố PASS cho ca browser này.
- Chromium responsive không chứng minh Safari/iPhone/PWA/VoiceOver. Notifications/privacy/action-hub 404 là giới hạn harness.
- Không chạy lại hồi quy rộng 5B (9 danh mục, contrast, quyền/API, DB/JWT/HTTP) trong lượt sửa này.
- **Bước tiếp: tái kiểm tra độc lập 5B** trên hash mới, nên dùng browser có DPR không nguyên (Windows scale 125–150%) để chạy ca 1099,x thật, kèm toàn bộ hồi quy 5B. 6A/6B NOT_STARTED.
