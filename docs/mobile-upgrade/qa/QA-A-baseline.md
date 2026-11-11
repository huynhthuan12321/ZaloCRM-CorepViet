# QA Đợt A — Baseline trước khi nâng cấp iPhone

Ngày: 2026-11-07 · Branch `mobile/base` · Base commit `2608eb6` · Người kiểm: mobile-qa

## 1. Môi trường
- Windows 11, Node v26.13.0, npm 11.20.0, Vite 8.0.2, Vitest 4.1.8.
- Chrome 156 (headless, điều khiển bằng CDP qua script tạm ngoài repo, profile trong %TEMP%). Playwright KHÔNG có trong repo/máy; không cài thêm gì.

## 2. Kết quả lệnh (chạy trong `frontend/`)
| Lệnh | Kết quả |
|---|---|
| `npx vue-tsc -b` | exit 0, **0 lỗi TypeScript** (~30 s) |
| `npx vitest run` | **20 file pass / 20; 161 test pass, 0 fail, 0 skip** (~11 s) |

Lỗi baseline có sẵn: **không có** (tsc và vitest đều sạch).
`git status --short` sau khi chạy: chỉ có `?? docs/mobile-upgrade/qa/` (do báo cáo này). `vue-tsc -b` không làm bẩn git (tsbuildinfo nằm ngoài tracking/ignore).

## 3. Ảnh chụp baseline
Thư mục: `docs/mobile-upgrade/qa/baseline-shots/` — 15 ảnh: `{login, tongquan, khachhang, chat, lichhen}-{375x812, 390x844, 430x932}.png` (DPR 2, emulation mobile).

Điều kiện: backend KHÔNG chạy. Login chụp thật (không nhập mật khẩu). Các màn còn lại chụp bằng **mock API giả** (CDP chặn `/api/v1/*`: user "QA Test" owner, danh sách rỗng) + token giả trong localStorage -> chỉ thấy **shell + trạng thái rỗng**, không có dữ liệu khách; không dùng dữ liệu thật.

Ghi chú quan sát (baseline hiện tại):
- Mobile hiện là top bar đen + bottom nav 5 mục: Chat · Khách hàng · Lịch hẹn · Tổng quan · Báo cáo (khác chốt mới: Tổng quan · Khách hàng · Hội thoại nổi · Lịch hẹn · Tài khoản).
- Tổng quan: lời chào "Chào buổi chiều, Test!" bị bóp thành cột hẹp 4 dòng; nút "Nhận khách" và các nút `at-btn` bị cắt ở mép phải; ba tab trên cùng xuống dòng 2 dòng.
- Chat: ô tìm kiếm chữ 13px (<16px -> iOS sẽ auto-zoom); vùng trống thấy dải đen phía trên bottom nav (khoảng trống/safe-area).
- Chưa chụp: landscape, trang chi tiết hội thoại có dữ liệu, ảnh có dữ liệu thật.

## 4. Kiểm nhanh overflow & kích thước (Chromium emulation, 320/375/390/430)
- `documentElement.scrollWidth == clientWidth` ở mọi màn/mọi viewport: **không overflow ở cấp trang**.
- Nhưng phần tử vượt mép phải (bị clip, không kéo scroll): Login `.brand-glow` (trang trí, vô hại); **Tổng quan** `.at-greet__r`, 2 nút `at-btn--sm` (ở 320–430) -> nội dung bị cắt (lỗi nhìn thấy được).
- Input <16px: Chat 13px; Tổng quan/Setup 14px (setup-password); Login/Khách hàng 16px (đạt).
- Touch target <44px (số button/link): Login 1, Tổng quan 6, Khách hàng 2, Chat 3, Lịch hẹn 16 — cần đối chiếu sau khi nâng cấp.
- Chưa đo 768/1024/1440, 393, 402.

## 5. Mức bằng chứng
Chỉ **Chromium emulation + mock** (và static: tsc/vitest). KHÔNG có WebKit, Safari iPhone, Home Screen PWA. Không kết luận "đạt trên iPhone".

## 6. Đề xuất cho gate G1 đợt B
- Cần `@playwright/test` (devDependency) để chạy WebKit + Chromium theo ma trận. **LOCK REQUEST: `frontend/package.json` — thêm `@playwright/test` vào devDependencies (+ `npx playwright install webkit chromium`)**; chờ chủ dự án duyệt. Thêm script `test:mobile` trong cùng PR.
- Test sống trong `frontend/tests/mobile/**`, fixture giả `frontend/tests/fixtures/mobile/**`; mock API theo kiểu chặn route (như script baseline).
- Backend local + seed tài khoản test nếu muốn kiểm chat/deep link/payload thật.
- Safari iPhone thật và Home Screen PWA vẫn phải kiểm tay.
