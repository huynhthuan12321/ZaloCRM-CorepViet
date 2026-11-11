# QA F2 + F3 — mobile/ext, 10/11/2026

Mốc F1 đã duyệt và commit: `50db984ade40460be2ff21d043f62f5d4a15520d`.
Base/merge-base giữ `bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`.
F2/F3 ở worktree `F:/ZaloCRM-wt/ext`, **chưa commit, chưa merge/push/deploy**. Chưa làm F4.

## Phạm vi

- F2: kho ảnh/video/tài liệu, thư mục hiện có, tìm kiếm, tải thêm, viewer vuốt/nút/đóng; chọn gửi một mục/album/hỗn hợp tới hội thoại; trong thread đích cố định và có tên khách + nick.
- Gửi dùng lại `sendMediaToConversation` / `sendAlbumToConversation`; giữ snapshot convId qua xác nhận, dừng trước gửi nếu đổi đích/unmount/offline/khóa. Lỗi 403/409/413/415/429 bằng tiếng Việt; không outbox hay tự phát lại.
- Album trả count thiếu/không rõ: trạng thái bền yêu cầu kiểm tra hội thoại, bỏ tập chưa xác định khỏi lựa chọn để tránh gửi trùng. Không đoán ảnh nào đã gửi.
- F3: nhóm Khác theo quyền/cờ của desktop; Bạn bè, Nhóm, Marketing đọc dữ liệu qua GET hiện có, tìm/lọc/phân trang ở nơi API hỗ trợ; thao tác nặng dùng máy tính; Back về Tài khoản.
- Không thay backend/API/auth/socket/migration/dependency. `MediaTabPanel.vue` và các view desktop giữ nguyên source.

## Dev → reviewer mới → QA

Dev và reviewer là các phiên mới sau mốc F1. Reviewer độc lập chốt **SOURCE DELTA PASS Community**, bằng chứng [REVIEW-1](F2-F3/REVIEW-1.md), [REVIEW-DELTA](F2-F3/REVIEW-DELTA.md).
Các file dùng chung do main áp theo [LOCK-APPLIED](F2-F3/LOCK-APPLIED.md).

QA độc lập đã tạo fixture/spec và chạy kiểm ban đầu, sau đó chạm giới hạn phiên trước kết luận. Main tiếp quản chạy test, sửa lỗi và tổng hợp; không ghi là QA độc lập hoàn tất.
Một phiên reviewer bổ sung cho delta QA cũng không chạy được do giới hạn sử dụng. Không coi phiên thất bại này là PASS.

QA sửa lỗi thật: tương phản số thứ tự lựa chọn ở Tối; Safari không tự focus nút mở viewer; gutter scrollbar WebKit 10px trong MobileLayout (tái hiện cả F1, đo riêng trước/sau).
Các sửa test giữ kỳ vọng: tên ảnh số 004 là tên dài trong fixture; kết quả tìm là 6; scan-members pageSize50; đợi đúng link chi tiết tệp; offline được phát trước response đầu thay vì race sau response; tải thêm dùng IO để không race auto-scroll của WebKit.

## Kết quả

Lượt cuối sau các sửa QA đang chạy. Không dùng kết quả cũ thay cho gate cuối.

| Kiểm tra | Kết quả cuối |
|---|---|
| vue-tsc | PASS, 0 lỗi (`complete-tsc.exit=0`) |
| Vitest toàn bộ | PASS, 73 file / 852 test (`complete-vitest.exit=0`) |
| Build | PASS (`complete-build.exit=0`) |
| Chức năng Chromium + WebKit | PASS 111; 1 skip chỉ vì CDP touch chỉ có trên Chromium; WebKit vẫn kiểm vuốt tổng hợp (`complete-functional.exit=0`) |
| Ma trận 320/375/390/430, 844×390, 932×430, Sáng/Tối, hai engine | PASS 672/672: 28 trạng thái × 6 viewport × 2 theme × 2 engine (`complete-matrix.exit=0`) |
| Desktop 1440 và tablet 768×1024/1024×768 so F1 | **CHƯA ĐẠT gate exact0**: suite chính 54 PASS / 8 FAIL (`complete-parity.exit=1`), chi tiết dưới |

Suite ảnh chính cuối (`f2f3-desktop.spec.ts`, chạy tuần tự, hai engine):

| Viewport | Chromium exact0 | WebKit exact0 |
|---|---:|---:|
| 1440×900 | 8/13 | 12/13 |
| 768×1024 | 7/9 | 9/9 |
| 1024×768 | 9/9 | 9/9 |

Ca không bằng0 (số pixel khác bất kỳ kênh): Chromium1440 media-grid24, media-detail3, media-docs56, marketing-list-detail8, chat-media28; Chromium768 media-grid13, friends10. WebKit1440 chat-media3984 (ảnh diff cho thấy trạng thái focus composer). Lỗi nhỏ kênh màu từng tái hiện trong F1-với-F1, nhưng điều này **không thay thế gate0**. Không sửa desktop hay nới ngưỡng để ghi PASS. Suite main bổ sung báo riêng, không dùng để che 8 FAIL của suite chính.

Suite main bổ sung kết thúc49 PASS/5 FAIL (`complete-main-parity.exit=1`); WebKit27/27 exact0, Chromium22/27. Những ca Chromium lệch: media/friends1440, friends/scan768, lists1024. Các giá trị thô ở `evidence/results/main-parity-*.json`. Chẩn đoán scrollbar/đồng hồ cuối WebKit2/2 PASS (`complete-scrollbar.exit=0`). Tất cả tiến trình kiểm cuối đã kết thúc; không còn gate đang chạy.

**Kết luận bàn giao: chức năng và ma trận mobile PASS; toàn bộ gate F2/F3 chưa PASS vì ảnh exact0 và chưa có reviewer độc lập cuối cho delta QA. Chưa đủ điều kiện coi là bản được duyệt tích hợp.**

## Phương pháp và bằng chứng

Mọi API/socket dùng mock với dữ liệu giả. Không backend/DB/VPS/Zalo thật.
Build F1 lấy bằng git archive từ `50db984`, ở `C:/Users/Public/f2f3-baseline-50db984/frontend/dist`.
Candidate port4198, baseline4199; Service Worker bị chặn trong E2E.
Ảnh/log/JSON ngoài repository: `C:/Users/Public/f2f3-agent/evidence`, log `complete-*.log` và mã thoát `complete-*.exit`.

Chạy lại từ `frontend` trong PowerShell (cần giữ bản build F1 tại đường dẫn trên):

```powershell
$env:D_APP_PORT='4198'
$env:D_BASE_PORT='4199'
$env:BASE_DIST='C:/Users/Public/f2f3-baseline-50db984/frontend/dist'
npx playwright test e2e/f2f3-functional-f2.spec.ts e2e/f2f3-functional-f3.spec.ts
npx playwright test e2e/f2f3-matrix.spec.ts
npx playwright test e2e/f2f3-desktop.spec.ts --workers=1
npx playwright test e2e/f2f3-main-parity.spec.ts --workers=1
```

So pixel dùng `exactDiffPixels===0`, không mask, không đổi CSS trang để chụp.
Đối chứng F1-với-F1 từng lệch31/3 pixel kênh màu1 ở media; fixture raster và cấu hình Chromium giống nhau ở cả hai phía, cùng renderer từng cặp và chạy tuần tự để giảm nhiễu. Các kết quả có lệch vẫn là FAIL, không đổi ngưỡng.
Tablet <=1024px desktop gốc ẩn cột Media: so thread gốc ở tablet, cột Media có dữ liệu kiểm ở1440.

Ma trận đo tràn trang/điều khiển44px/ô nhập16px/Tối/tương phản và chụp ảnh.
Viewer/sheet đo lớp phủ đang mở; hàng chip cuộn ngang chủ ý được phân biệt với tràn trang.
Toast dùng chung đo và ghi riêng, không che trong ảnh. Không dùng số đo này để chứng nhận toàn bộ toast cũ.

Đối chứng scrollbar WebKit `/account` sau sửa: F1 client380/scroll390/scrollLeft10; candidate client390/scroll390/scrollLeft0, docX0 cả hai. Sửa gutter giải quyết bề rộng thật, không chỉ bỏ assertion.

## Giới hạn

- Bản đang kiểm là Community; `_ee` không có trong worktree. Marketing Enterprise ngoài repo chưa tích hợp wrapper; pane Khối EE giữ component hiện có, chưa chứng nhận runtime EE.
- WebKit Playwright là mô phỏng desktop, không phải iPhone thật; chưa VoiceOver/PWA Home Screen.
- Video fixture kiểm viewer/controls/cử chỉ, không chứng nhận codec/phát video trên iPhone thật.
- `useCareSessions` gốc làm mất HTTP status: 403 ở trang phiên hiện lỗi chung, đã ghi PARITY; không đổi backend/auth trong lượt này.
- Source review độc lập có trước các delta CSS/focus và gutter QA nhỏ do main sửa; reviewer bổ sung bị quota. Không hứa đã có review độc lập cuối cho các delta này.


## C?p nh?t theo y?u c?u ch?t F2/F3 ? 10/11/2026

Reviewer ??c l?p **M?I** ?? ch?y th?nh c?ng (phi?n CLI m?i, kh?ng resume phi?n tr??c), so?t delta sau QA v? ch?y 180 test li?n quan: **PASS Community source, kh?ng finding ch?n commit**. B?o c?o nguy?n v?n: [REVIEW-POST-QA](F2-F3/REVIEW-POST-QA.md). Kh?ng d?ng review n?y thay s? ?o browser/pixel ho?c ch?ng nh?n Enterprise/iPhone th?t.

C?c l?u ? LOW/INFO ???c gi?: shell mobile h?p d?ng chu?t kh?ng hi?n native scrollbar nh?ng v?n cu?n ???c; Back trong app v? T?i kho?n, l?ch s? browser sau nhi?u chip Marketing c? th? quay l?i route c?; m?u ph? ? ch?n tr?n ?nh l? l?p ph? c? ??nh c?n s? ch?n d?ng token ??ng theme; returnTo khi viewer r?ng v? confirm singleton kh?ng t?o l?i g?i nh?m. Kh?ng ??i CSS/source ?ng d?ng trong l??t ??i ch?ng n?y. Ch?a ki?m VoiceOver/thi?t b? th?t.

Ph?p ?o m?i gi? `exactDiffPixels===0`, kh?ng t?ng threshold, kh?ng mask, kh?ng s?a CSS ?? ch?p. M?i c?nh ch?y xen k? C1/R1/C2/R2/C3/R3; m?i c?p lu?n F1 tr??c, c?ng browser renderer/page, c?ng fixture PNG, viewport, theme S?ng, locale, gi? v? th? t? thao t?c. C = F1?F1; R = F1?F2/F3. Chat-media ? c? hai engine/b?n so s?nh g?i `document.activeElement.blur()`, ch? 1000ms v? x?c nh?n activeElement l? BODY tr??c screenshot; kh?ng thay style focus. WebKit l? Playwright desktop.

L??t ??u d?ng F1 c?ng origin4199 cho hai ?nh ??i ch?ng; th?m l??t ba c?nh ch?a r?. ?? ki?m so?t c? vi?c chuy?n origin (c?p th?t4199?4198), l??t ch?nh b? sung ??i ch?ng4199?4200; hai origin4199/4200 ph?c v? ch?nh x?c c?ng th? m?c dist F1. SHA256 HTML `/login` hai c?ng ??u `06a5c79989599191b7042d215f9d31a1a195eb1c8c45929b519db4e2dc29d152`; candidate4198 c? hash kh?c. Kh?ng rebuild/s?a app gi?a c?c l??t.

B?ng ch?ng ngo?i repo, kh?ng ??a ?nh/log/output v?o commit:

- L??t ??u 48 c?p: `C:/Users/Public/f2f3-agent/evidence-replicated-20261110-1912`.
- B? sung 18 c?p ba c?nh: `C:/Users/Public/f2f3-agent/evidence-replicated-followup-20261110`.
- ??i ch?ng chuy?n origin, ?? 48 c?p: `C:/Users/Public/f2f3-agent/evidence-cross-origin-20261110`.
- M?i c?p c? before/after/diff PNG v? JSON exact pixels/maxChannelDelta; ph?n t?ch t?a ?? v? hash ? `pixel-coordinate-analysis.json` trong th? m?c b?ng ch?ng t??ng ?ng. Test assertion kh?c0 v?n FAIL; vi?c ph?n lo?i nhi?u ph?i d?a ??i ch?ng, kh?ng ??i FAIL th?nh exact0.

### B?ng ??i ch?ng theo t?ng ca

K? hi?u m?i ? l? `pixel/maxChannelDelta` theo l?n1,2,3. ??y l? s? ?o th?, kh?ng ph?i ng??ng cho ph?p.

| Engine / viewport / c?nh | C l??t ??u | R l??t ??u | C chuy?n origin | R chuy?n origin | K?t lu?n |
|---|---|---|---|---|---|
| chromium / 1440x900 / chat-media-tab | 37/13, 28/14, 37/13 | 22/13, 0/0, 0/0 | 0/0, 0/0, 0/0 | 15/1, 18/6, 35/13 | Nhi?u m?i tr??ng: C l??t ??u28?37px delta13?14, R0?35px delta1?13; 13 pixel R l?p l??t chuy?n origin ??u c? trong C l??t ??u. Kh?ng l?p xuy?n hai l??t; focus composer ?? ?n ??nh. |
| chromium / 1440x900 / marketing-list-detail | 0/0, 67/2, 0/0 | 0/0, 8/22, 8/22 | 0/0, 0/0, 0/0 | 0/0, 0/0, 0/0 | Nhi?u m?i tr??ng/kh?ng t?i hi?n ?n ??nh: 67px delta2 ? C l??t ??u v? ??ng t?p t?a ?? R b? sung; 8px delta22 ch? c? ? 2 ?nh ??u, kh?ng l?p qua l??t b? sung/chuy?n origin; l??t cu?i c?6 ?nh exact0. |
| chromium / 1440x900 / media-detail | 0/0, 0/0, 0/0 | 0/0, 0/0, 3/1 | 0/0, 3/1, 3/1 | 3/1, 0/0, 0/0 | Nhi?u m?i tr??ng: ??ng 3 pixel delta1, bbox164,259?165,288 t?i hi?n trong C v? R; nhi?u R=0. |
| chromium / 1440x900 / media-docs-tab | 0/0, 0/0, 0/0 | 53/42, 53/42, 0/0 | 53/42, 0/0, 53/42 | 53/42, 0/0, 0/0 | Nhi?u m?i tr??ng: ??ng t?p53 pixel delta42 ? icon quy?n (bbox1158,181?1415,192) c? c?ng hash t?a ?? C/R; nhi?u R=0. |
| chromium / 1440x900 / media-grid | 53/42, 52/2, 105/6 | 77/2, 28/2, 77/42 | 91/2, 53/42, 33/2 | 87/2, 0/0, 0/0 | Nhi?u m?i tr??ng: C/R c?ng m?c; 24 pixel R l?p ? l??t ??u ??u ?? xu?t hi?n trong C; l??t chuy?n origin R2/R3=0. |
| chromium / 768x1024 / friends | 12/1, 12/1, 6/35 | 0/0, 12/1, 0/0 | 12/1, 0/0, 12/1 | 12/1, 6/35, 10/1 | Nhi?u m?i tr??ng: t?p12px delta1 v?6px delta35 c?a R t?i hi?n ??ng t?a ?? trong C; 10px delta1 l? t?p con v?ng raster header. |
| chromium / 768x1024 / media-grid | 18/2, 13/1, 31/2 | 0/0, 68/6, 31/2 | 13/1, 0/0, 26/1 | 13/1, 18/2, 31/2 | Nhi?u m?i tr??ng: t?p13/18/31 pixel c?a R c? c?ng hash t?a ?? v?i C; R kh?ng l?p c? ??nh xuy?n l??t. |
| webkit / 1440x900 / chat-media-tab | 0/0, 0/0, 0/0 | 0/0, 0/0, 0/0 | 0/0, 0/0, 0/0 | 0/0, 0/0, 0/0 | Sai kh?c tr?ng th?i focus c?a ph?p ch?p tr??c: sau blur + ch? focus BODY, to?n b? C/R c?a c? hai l??t ??u0. Kh?ng c?n s?a ?ng d?ng. |

B? sung ba c?nh ch?a r? (gi? c?ng ph??ng ph?p, kh?ng ch?n b? k?t qu?):

| C?nh Chromium1440 | C b? sung | R b? sung |
|---|---|---|
| marketing-list-detail | 0/0, 0/0, 0/0 | 0/0, 67/2, 67/2 |
| media-detail | 0/0, 3/1, 56/42 | 0/0, 3/1, 0/0 |
| media-docs-tab | 0/0, 0/0, 0/0 | 56/42, 3/1, 63/42 |

Kh?ng c? giao t?p pixel kh?c0 l?p qua m?i c?p th?t c?a b?t k? ca n?o sau c?c l??t l?p. C?c pixel chat-media l?p trong l??t chuy?n origin ?? c? trong ??i ch?ng l??t ??u. C? l?u ?nh diff cho m?i c?p kh?c0; ?? xem diff docs (icon quy?n) v? chat (vi?n/g?c bo nh?), kh?ng c? thay ??i b? c?c. Ph?n lo?i l? b?ng ch?ng th?c nghi?m trong m?i tr??ng n?y, kh?ng kh?ng ??nh m?i renderer/thi?t b? s? exact0. Kh?ng c? l?i ch? ? c?p th?t l?p ?n ??nh c?n s?a code mobile.

T?ng:114 c?p th?c thi =48 l??t ??u +18 b? sung +48 chuy?n origin. Assertion exact0 v?n b?o l?n l??t25 FAIL/23 PASS,8 FAIL/10 PASS,23 FAIL/25 PASS; hai suite ??8 c?nh c?48 skip m?i suite do c?nh ch? ch?y ??ng engine ?? ch? ??nh. M? tho?t1 ???c gi?, kh?ng ??i th?nh PASS exact0.

**K?t lu?n theo hai ?i?u ki?n ch? d? ?n giao:** ??i ch?ng ?? ph?n lo?i7 ca Chromium l? nhi?u m?i tr??ng/kh?ng l?p ?n ??nh; WebKit chat-media h?t l?ch sau ?n ??nh focus; reviewer ??c l?p m?i PASS Community source. ?? ?i?u ki?n commit F2/F3 theo ch? th? l?n n?y. Kh?ng tuy?n b? to?n suite screenshot exact0. Vue-tsc0, full Vitest852, build, ch?c n?ng111 PASS/1 skip, ma tr?n672 PASS v?n ?p d?ng v? m? ?ng d?ng kh?p to?n b? manifest QA tr??c; reviewer m?i th?m180 test PASS.

F2/F3 ch? commit tr?n mobile/ext; ch?a merge mobile/base, kh?ng push/deploy; d?ng tr??c F4.
