# Sửa F4 sau 5B — biên dưới 768px

**Trạng thái: COMPLETED_PENDING_VERIFICATION.** Lượt A, 02/11/2026 17:02–17:20 (+07), làm cùng lượt với [06-remediation-6b3](06-remediation-6b3.md) và dùng chung artifact [artifacts/reports-fix-f4-6b3-20261102-1702](../../artifacts/reports-fix-f4-6b3-20261102-1702/). Tự kiểm tra, chưa phải 5B độc lập; 5B không tự chuyển thành PASS. 6A/6B/7A/7B giữ trạng thái hiện có.

## Lỗi

[Bổ sung 5B 16:51](05-mobile-verification.md#supplement-20261102-1651), trình duyệt thật DPR 1,33:
- CSS width **767,669px**, `innerWidth` làm tròn lên **768**.
- `use-mobile.ts:13` (`innerWidth < 768`) giữ DefaultLayout, nhưng mọi rule desktop `min-width: 768px` đã sai, nên menu compact bị ẩn.
- Header desktop tràn 318px; nút Báo cáo/Cài đặt nằm ngoài viewport.

Cùng gốc với F3: quyết định bằng `innerWidth` (số đã làm tròn) trong khi CSS dùng chiều rộng thực.

## Thay đổi

| File | Dòng | Nội dung |
|---|---|---|
| `frontend/src/composables/use-mobile.ts` | 6–9, 15–19, 28–34 | Chọn layout bằng `matchMedia('not all and (min-width: 768px)')`, tức đúng phần bù của các rule `min-width: 768px` (`hs-crm-theme.css:283`, `DefaultLayout.vue:518`). Không đổi 768 thành 767, không ép getter. Nghe sự kiện `change` của media query; khi môi trường không có `matchMedia` thì vẫn dùng `innerWidth` |
| `frontend/src/assets/report-kit.css` | 147 | `@media(max-width:767px)` → `@media not all and (min-width:768px)`: style mobile của báo cáo áp ở mọi CSS width < 768, không còn khe (767, 768) |
| `frontend/src/assets/airtable.css` | 540, 558 | Cùng thay đổi cho hai rule mobile dùng chung để không còn khe |

Vite biên dịch các rule này sang `not all and (width>=768px)` / `(width>=768px)`, giống rule compact đã có từ trước. Trình duyệt quá cũ không hỗ trợ cú pháp range thì đã chịu rủi ro này từ trước; lượt này không đổi cấu hình build. Các rule `max-width: 768px` khác (có chủ ý bao gồm 768) không đổi.

`useMobile` được dùng ở `App.vue:30` (chọn layout), `ChatView.vue` và `ContactsView.vue` (bản mobile). Ở CSS width nguyên, hành vi không đổi (test integer 767/768). Chỉ khoảng (767, 768) đổi từ desktop sang mobile, khớp với CSS.

**F3 giữ nguyên:**
- `use-report-compact-navigation.ts` và `DefaultLayout.vue` không đổi (hash trùng preimage).
- Khi xuống < 768, DefaultLayout unmount nên composable bỏ cờ trả focus; late leave sau unmount không làm gì.

## RED / GREEN

- `frontend/src/composables/use-mobile.dom.spec.ts` (mới, 4 ca, đặt media query và `innerWidth` độc lập).
  - Chạy trên bản sao preimage: **2/4 fail**, đúng 2 ca biên lẻ (767,669 với innerWidth 768; theo media query cả hai chiều) (`red-use-mobile.log`).
  - Trên patch: **4/4**. Cùng spec F3 (12 ca, gồm `setViewport(1099, false)`) là **16/16** (`green-use-mobile.log`).
- Toàn frontend **157/157**, build PASS (log chung với 06-remediation-6b3).

## Browser (build mới)

Chrome riêng, profile tạm; chiều rộng lấy từ cửa sổ thật; JS trong trang chỉ để đọc, không sửa `innerWidth`/state.

| Ca | Kết quả |
|---|---|
| **DSF 1,33, CSS 767,669px, innerWidth 768** (đúng điều kiện F4) — `/reports/tong-quan`, sau reload, và `/` | MobileLayout; media mobile true, `min-width:768` false; body scrollWidth 768 = clientWidth 768; không có topnav desktop (`f4-767x-iw768-report.png`, `selfcheck2.json`) |
| DSF 1,25, CSS 767,2 (innerWidth 767) | MobileLayout, page overflow 0 |
| CSS 768 (report) | DefaultLayout compact, không control nào ngoài viewport (`f4-768-report.png`) |
| Menu compact mở ở 1024 → 767,2 | MobileLayout, overlay 0 |
| F3 hồi quy, CSS 1099,2 / innerWidth 1099, 2 lần | Overlay 0, focus đúng nút Báo cáo, Tab tiếp theo sang Cài đặt |

Ghi nhận ngoài phạm vi F4: ở CSS 768 trên route không phải báo cáo (Dashboard), app giữ thiết kế cũ `#app { min-width: 1100px }` nên các nút cuối topnav nằm ngoài viewport và trang cuộn ngang. Đây là thiết kế desktop có từ trước (chỉ route báo cáo được nới min-width); lượt này không đổi.

## Giới hạn

Chromium headless với `--force-device-scale-factor` không chứng minh Safari/iPhone/PWA/VoiceOver hay thay đổi scale OS thật. Chưa chạy lại toàn bộ hồi quy 5B (9 danh mục × 320/390/430, contrast…); B cần chạy lại trên patch này.

## Cleanup

Xem [06-remediation-6b3](06-remediation-6b3.md#cleanup): Chrome, harness, container của lượt này đã dừng/xóa và các port đã giải phóng.
