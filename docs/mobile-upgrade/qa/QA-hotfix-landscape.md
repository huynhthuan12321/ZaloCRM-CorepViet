# QA hotfix "iPhone xoay ngang bị chuyển sang desktop" - 09/11/2026

Worktree `F:\ZaloCRM-wt\hotfix-landscape` (branch mobile/hotfix-landscape, nền 7f3874a, chưa commit). Dữ liệu giả hoàn toàn.

## Kết luận: ĐẠT (ở mức Chromium + WebKit desktop mô phỏng cảm ứng; CHƯA kiểm iPhone thật)

## Lệnh và kết quả
| Lệnh | Kết quả |
|---|---|
| `npx vue-tsc -b` | 0 lỗi |
| `npx vitest run` | 43 file, 465/465 pass; 2 "Unhandled Rejection" từ `src/__tests__/mobile/message-thread-mobile.dom.spec.ts` |
| `npm run build` | OK (chỉ cảnh báo chunk >500kB, có sẵn) |
| Baseline vitest (7f3874a sạch, `git archive` ra %TEMP%) | 43 file, 450/450 pass, CÙNG 2 Unhandled Rejection -> lỗi có sẵn từ trước, không do hotfix (+15 test mới của hotfix) |
| `BASE_DIST=%TEMP%\qa-base-dist-hotfix npx playwright test landscape shell chat chat-realtime` (chromium+webkit) | 262 pass, 0 fail, 0 skip |
| `desktop-regression.spec.ts` 1440x900 (chromium+webkit, 6 trang) | 12/12 pass, 0 pixel lệch vượt ngưỡng (chat-thread chromium có 13 pixel khác nhẹ dưới ngưỡng channel 8, diffPixels=0) |
| `ipad-regression.spec.ts` 1024x768 + 768x1024 cảm ứng, 5 trang, 2 engine | 20/20 pass, diffPixels=0, exactDiffPixels=0, maxChannelDelta=0 |

Lưu ý bản base: dựng từ commit sạch 7f3874a (`git archive` -> `%TEMP%\qa-base-src`, node_modules nối junction), KHÔNG dựng từ checkout chính vì checkout chính đang có thay đổi chưa commit (use-chat*.ts, MobileChatView.vue...) sẽ làm sai phép so. Không ghi gì vào F:\ZaloCRM-CorepViet.

## Emulate: engine nào cho pointer:coarse / hover:none
Context `hasTouch:true, isMobile:true`: CẢ Chromium và WebKit (Playwright, WebKit desktop) cho `pointer:coarse` = true, `hover:none` = true, `pointer:fine` = false. Context không touch cho `pointer:fine`, `hover:hover`. Đây là mô phỏng của Playwright, không phải thiết bị iOS thật.

## Bảng yêu cầu
| # | Yêu cầu | Kết quả |
|---|---|---|
| 1 | tsc, vitest, build | ĐẠT (baseline vitest 2 Unhandled Rejection có sẵn) |
| 2a | Ma trận 8 context: luôn đúng MỘT trong MOBILE/DESKTOP true; layout dựng đúng | ĐẠT cả 2 engine. 390x844, 844x390, 932x430, 667x375 cảm ứng -> `.m-shell`, `#app` không min-width 1100. 1024x768 và 1366x1024 cảm ứng, 1440x900 chuột, 900x400 chuột -> DefaultLayout (`.smax-topnav`), min-width 1100 |
| 2b | 844x390, 932x430 Sáng+Tối: inbox, thread+nháp, composer, Tài khoản | ĐẠT: không overflow ngang; không min-width 1100; tabbar và composer trong màn hình; safe trái/phải mô phỏng 47/59px, nội dung không dưới tai thỏ; vùng tin 195/390 = 50,0% (844x390) và 235/430 = 54,7% (932x430), >= 45%; nút gửi >= 44px, ô soạn >= 16px |
| 2c | Xoay 390x844 -> 844x390 -> 390x844 | ĐẠT: MobileChatView/vùng tin/ô soạn KHÔNG remount (đánh dấu DOM còn nguyên), không có `.smax-topnav` nào được chèn, URL giữ `/chat/qa-conv-1`, nháp còn. scrollTop thread: 300 -> 218 (ngang, nội dung reflow, còn cách đáy ~4100px) -> 300 (dọc, y nguyên). Inbox lọc "Chưa trả lời": chip còn, 15 hàng, scrollTop 520 -> 482 -> 520, không remount |
| 2d | shell, chat, chat-realtime xanh | ĐẠT (69+42+2 mỗi engine) |
| 3 | Hồi quy 1440 và iPad vs base | ĐẠT, 0 pixel lệch (xem bảng lệnh) |
| 4 | Ảnh | Có, xem dưới |

## Lỗi
Không có lỗi chặn/nghiêm trọng. Ghi nhận mức Thấp / quan sát (không phải lỗi hotfix):
- L-1 (Thấp, UX, không do hotfix): ở 844x390 vùng danh sách inbox chỉ cao 164px (~1,5 hàng) vì header + ô tìm kiếm + thanh lọc chiếm 118px và tabbar cao 86px (22% màn). Đọc được nhưng chật; cân nhắc rút gọn tabbar khi cao <= 500px ở đợt sau. Số đo: `.m-inbox__list` y=118,h=164; `.m-tabbar` y=304,h=86.
- L-2 (Thấp, chủ ý): nút quay lại `.m-thread-back` lấn 2px sang vùng safe trái (left = safe-left - 2) để tâm chạm sát mép; icon vẫn trong vùng an toàn. Test đã nới dung sai 2,5px. (Cùng quyết định cũ của đợt C.)
- L-3 (Thông tin): `desktop-regression.spec.ts` ghi đè file kết quả/ảnh có sẵn trong `docs/mobile-upgrade/qa/C-shots/desktop-regression/` (đang tracked) -> git hiện các file đó modified; nội dung mới là kết quả lần chạy này (vẫn 0 lệch). Có thể bỏ khỏi commit nếu muốn giữ nguyên bằng chứng đợt C.

## Mức bằng chứng
- Static: vue-tsc, vitest.
- Chromium (mô phỏng touch/isMobile) và WebKit desktop Playwright (mô phỏng touch/isMobile): toàn bộ e2e ở trên.
- CHƯA có: Safari iPhone thật, Home Screen PWA, iPad thật, bàn phím ảo iOS, safe-area thật (tai thỏ/Dynamic Island chỉ mô phỏng bằng đè `--m-safe-left/right`).
- Chưa kiểm: bàn phím mở ở chế độ ngang (>=45% chỉ đo khi bàn phím đóng); xoay trong lúc Safari đang hiện bàn phím; Android/Chrome thật.

## Checklist iPhone thật (người dùng làm)
1. iPhone dọc -> xoay ngang ở /chat: vẫn là giao diện mobile (tabbar dưới), không hiện thanh menu desktop.
2. Mở /chat/<id>, gõ dở một câu, xoay ngang rồi dọc: nháp còn, đang ở đúng hội thoại, vị trí cuộn không nhảy về đáy/đầu.
3. Đang gõ (bàn phím mở) rồi xoay: ô soạn không bị che, nút gửi bấm được.
4. iPhone Pro Max ngang (932x430): inbox, thread, Tài khoản; nội dung không bị tai thỏ/Dynamic Island che ở cạnh trái-phải.
5. Chế độ Sáng và Tối đều đúng, kể cả sau khi xoay.
6. iPad (dọc và ngang, kể cả Split View): giao diện desktop/compact giữ nguyên như trước, không chuyển sang mobile.
7. Desktop 1440 và cửa sổ trình duyệt thấp dùng chuột: không đổi.
8. Home Screen PWA: lặp lại bước 1-2.

## File đã ghi
- `frontend/e2e/landscape.spec.ts` (mới), `frontend/e2e/ipad-regression.spec.ts` (mới)
- `docs/mobile-upgrade/qa/hotfix-landscape-shots/` (ảnh: inbox, thread, thread-nhap, taikhoan; 844x390 và 932x430; Sáng/Tối; chromium/webkit; thread có `-truoc` (base) và `-sau` (hotfix); `ipad/` ảnh + JSON + diff)
- `docs/mobile-upgrade/qa/QA-hotfix-landscape.md`
- Ghi đè (xem L-3): `docs/mobile-upgrade/qa/C-shots/desktop-regression/*`

## Vòng 2 (orchestrator, sau review) — 09/11/2026

Sửa theo mobile-ui-reviewer:
- Nhánh điện thoại ngang thêm `(max-width: 1023.98px)` → tablet Android mở bàn phím (1280x450, 1024x400) không đổi sang MobileLayout.
- `#app { min-width: 1100px }` viết bằng cascade (mặc định + `@media MOBILE_MEDIA_QUERY { min-width: 0 }`) → không còn khe hở.
- `DefaultLayout`/`use-report-compact-navigation` về `(min-width: 768px) and (max-width: 1099px)` (`DESKTOP_COMPACT_MEDIA_QUERY`; chỉ render khi JS = desktop).
- `MessageThread.vue` (LOCK): không tự focus ô soạn khi `mobile` (trước đây iPhone ngang ≥768 bật bàn phím khi mở thread).
- `MobileChatView` dùng `SHORT_LANDSCAPE_MEDIA_QUERY`; `mobile-tokens.css` thu gọn header 44 / tabbar 52 / fab-lift 16 khi cao ≤ 500 ngang.
- Lịch hẹn: `isNarrow` = `< 900 || isMobile`, CSS drawer thêm `, MOBILE_MEDIA_QUERY`.
- Test đọc CSS khớp nguyên văn hằng số mở rộng sang AppointmentsView + mobile-tokens; bảng thiết bị thêm 956x440, 915x412, tablet Android 1280x450 / 1024x400.

Chạy lại: vue-tsc 0 lỗi; vitest 469/469; build OK; Playwright 294/294 (shell, chat, chat-realtime, landscape, desktop-regression 1440, ipad-regression 1024x768 & 768x1024) — WebKit + Chromium, desktop và iPad 0 pixel lệch so với 7f3874a. Ảnh trong `hotfix-landscape-shots/` chụp ở vòng 1 (trước khi thu gọn header/tabbar ngang).

Ghi chú độ ổn định: ngưỡng `desktop-regression` cho phép lệch ≤ 0,1%; số liệu thật lần chạy lại: 1440 (12 ca) và iPad (20 ca) đều `diffPixels = 0`, `maxChannelDelta = 0`. Một lần chạy cả bộ song song, `ipad-regression` 768x1024 `/contacts` Chromium lệch 6 pixel (max 13/255) do avatar mock tải chậm khi máy tải nặng; chạy riêng hotfix-vs-base 6/6 và base-vs-base 6/6 đều 0 pixel → flaky môi trường, không do hotfix.

## Vòng 3 (orchestrator) — nút tròn đè nhãn khi ngang

Ảnh 844x390 sau vòng 2 cho thấy nút Hội thoại (60px, nổi 16px) đè nhãn "Hội thoại" khi thanh tab gọn 52px. Sửa: ở `SHORT_LANDSCAPE_MEDIA_QUERY` nút còn 48px (vẫn ≥ 44px chạm) → đáy nút 32px = đỉnh nhãn. Thêm test hình học (dọc và ngang). Ảnh `inbox-844x390-*-sau.png` đã chụp lại, nhãn hiện đủ.

Chạy lại: vue-tsc 0; vitest 471/471; build OK; e2e shell + landscape + chat 250/250.

Độ ổn định so ảnh (trung thực): lần chạy đầy đủ vòng 2, 32/32 ca desktop 1440 + iPad đều 0 pixel. Các lần chạy lặp sau đó WebKit thỉnh thoảng lệch 2–8 pixel (max 13–15/255) ở `/contacts`, `/` — **base so với chính nó cũng lệch** (1/24 lần), Chromium tương tự (6 px, avatar mock tải chậm). Kết luận: nhiễu render của WebKit/ảnh mock, không phải thay đổi layout. Ngưỡng spec `desktop-regression` (≤ 0,1%) vẫn pass; `ipad-regression` yêu cầu 0 pixel tuyệt đối nên thỉnh thoảng đỏ — đề xuất QA ổn định bằng cách chờ ảnh tải xong (`img.complete`) trước khi chụp.
