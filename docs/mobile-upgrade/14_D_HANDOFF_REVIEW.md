# Bàn giao đợt D để Claude review — 09/11/2026

Worktree: `F:\ZaloCRM-wt\crm` · nhánh `mobile/crm` · HEAD/base `e290e2d`.
Đã dừng ở báo cáo, **chưa commit, merge hoặc push**. Các rename đã stage từ lúc nhận bàn giao được giữ nguyên.

Các yêu cầu bắt buộc G3 đã qua kiểm thử tự động. Còn một sai khác thoáng qua trong case pixel phụ 768, được ghi công khai bên dưới; chưa có bằng chứng trên iPhone thật.

## Phần đã có sẵn và cách tiếp tục

Khi nhận việc, worktree đã có wrappers, component/composable CRM và settings, bộ e2e cùng ảnh QA. Không dựng lại các phần này.
Baseline đọc trực tiếp trong worktree: vue-tsc không lỗi, Vitest 599/599 và không còn unhandled errors. Mock `clearAuthAndRedirect` đã được sửa trong file test bàn giao, nên giữ lại thay vì sửa auth ứng dụng.
Lượt QA khác chạy song song từng nới ngưỡng pixel lên 24 và cho qua D-L1. Kết luận đó không dùng để chốt yêu cầu hiện tại. Lượt chốt riêng dùng cổng 4186/4187, thư mục kết quả riêng, bỏ KNOWN_OPEN và assert pixel tuyệt đối 0.

## Kết quả chính

| Kiểm tra | Số liệu |
|---|---|
| TypeScript | `vue-tsc -b`: 0 lỗi, trong `npm run build` cuối |
| Vitest | **53 file, 605/605 pass, 0 unhandled errors** |
| Build | **PASS**, 3233 module, Vite 2,52 giây; cảnh báo chunk trên 500 kB có sẵn |
| E2E chức năng | **140/140 pass**: 28 case ma trận và 112 case luồng; 70 mỗi engine, không skip hoặc flaky |
| Pixel bắt buộc | **24/24 pass, exactDiffPixels = 0** ở 1440×900 và 1024×768, Chromium + WebKit |
| Pixel phụ 768×1024 | Lượt đầy đủ 11/12 pass; một case WebKit Tổng quan lệch 2 pixel, delta tối đa 15. Chạy lại riêng 1/1 pass exact 0; đối chứng base-vs-base 1/1 pass exact 0 |

Không gọi kết quả là “176/176 xanh trong một lượt”. Bộ pixel đầy đủ có 35/36 pass ban đầu, một case phụ được chạy lại và giữ cả hai bằng chứng. Không tăng threshold, sửa ảnh hoặc mask pixel. Hai kích thước chủ dự án yêu cầu so pixel đều đạt ngay trong lượt đầy đủ.

Ma trận mobile: 320×568, 375×812, 390×844, 430×932, 844×390, 932×430; cả Sáng/Tối, cả hai engine. Mỗi tổ hợp kiểm 19 màn, tổng 456 lượt màn; 24 JSON kết quả đều có 0 issues và 0 runtime errors. Có thêm 4 case 768×1024 xác nhận vẫn dùng desktop/compact.

## File mới và file dùng chung qua LOCK

Danh sách đầy đủ từng file: [D_FILE_INVENTORY.md](D_FILE_INVENTORY.md). Danh sách gồm toàn bộ phần D chưa commit, không chỉ file tạo trong lần tiếp tục.

| Nhóm | File / thư mục |
|---|---|
| Component mới | `frontend/src/components/mobile/crm/**`, `frontend/src/components/mobile/settings/**` |
| Composable mới | `frontend/src/composables/mobile-crm/**`, `frontend/src/composables/mobile-settings/**` |
| View mobile mới | `frontend/src/views/mobile/crm/**` |
| QA mới | `frontend/e2e/crm-d.spec.ts`, `crm-d-flows.spec.ts`, `desktop-regression-d.spec.ts`; helpers `mock-crm.ts`, `qa-checks.ts`; `src/__tests__/mobile/crm-d-states.dom.spec.ts` |
| Test owner mới | `frontend/src/composables/mobile-crm/use-mobile-contact-detail.spec.ts` |
| LOCK D-1/D-2/D-3 | Bốn wrapper `ContactsView`, `DashboardView`, `AppointmentsView`, `ContactProfileView` và bốn `Desktop*View`; DesktopContacts bỏ nhánh mobile cũ |
| LOCK D-4, đã duyệt 09/11 | `frontend/src/views/MobileChatView.vue`: chỉ đọc/giữ/xóa query bộ lọc và back; không đổi gửi tin |
| LOCK S-1 | `frontend/src/views/settings/SettingsLayout.vue` |
| LOCK A-1/A-1b | `frontend/src/components/appointments/AppointmentEditor.vue`: CSS mobile cho Tối, target, input và avatar |
| LOCK A-2 | `frontend/src/views/mobile/account/MobileAccountView.vue`: modal đổi mật khẩu Tối, có sẵn trong bàn giao |
| QA dùng chung | `frontend/e2e/helpers/audit.ts`, `frontend/playwright.config.ts`, `frontend/e2e/chat.spec.ts` |
| Test hiện có cập nhật | `message-thread-mobile.dom.spec.ts`, `mobile-chat-view.dom.spec.ts`, `use-mobile.dom.spec.ts` |
| Tài liệu | `13_SUBAGENT_TEAM.md`, `contracts/OWNERSHIP.md`, `contracts/PARITY.md`, báo cáo và kiểm kê D |

Không có diff trong backend, auth store, API/socket, use-chat hoặc package.json. Các file desktop đổi tên giữ nguyên nội dung, trừ DesktopContacts bỏ lớp rẽ nhánh mobile để wrapper mới sở hữu nó.

## Lỗi reviewer và trạng thái

| Mã / vấn đề | Trạng thái và bằng chứng |
|---|---|
| Mock thiếu clearAuthAndRedirect gây 2 errors | Đã có sửa trong test bàn giao; giữ nguyên. Baseline 599 và cuối 605 đều 0 errors; không sửa auth ứng dụng |
| HIGH mất header khi rời settings cấp 2 | Đã sửa từ bàn giao bằng cleanup requestChrome; test DOM và e2e điều hướng qua |
| MEDIUM lịch sử settings lặp, deep link chớp cấp 1 | Đã có fix rootPosition/normalizing; test warm/cold và back qua |
| CTA Chưa trả lời chưa thực sự lọc | Đã sửa: nạp query trước request đầu, truyền unreplied=true; thread/back/reload giữ; clear xóa query. Bốn test DOM và e2e mọi mobile viewport/theme/engine |
| Back cold link có conv cũ tự mở lại thread | Đã sửa: chỉ mang query filter về inbox, không mang one-shot conv/contactId/compose/draft |
| Picker lấy người gửi cuối làm phụ trách | Đã sửa: dùng owner hiện có, không suy từ lastOutbound; hai test owner A/sender B và owner null |
| Hủy lịch bị sheet che ConfirmHost | Đã sửa: đóng sheet, nextTick rồi hỏi; nếu giữ hoặc API lỗi mở lại đúng chi tiết. E2E tạo → sửa → hủy đã qua |
| D-H1: Hồ sơ tổ chức tràn/cắt ở mobile | Đã sửa CSS trong MobileSettingsShell: form/preview co theo khung, logo row wrap; không sửa desktop OrgSettings |
| D-M1: Editor Tối vẫn có nền/brand Sáng | Đã map brand token trong phạm vi mobile, sửa chữ primary và avatar; ma trận qua |
| D-M2 / D-L4: target nhỏ, input nhỏ, avatar 30, ngày 38,8 | Đã sửa editor 44px/16px, avatar 44px, dải ngày cuộn ngang có chủ đích; ma trận qua |
| D-L1: nút tổ chức 36px, preview input 40px | **Đã sửa**, cả v-btn và field form/preview tối thiểu 44px. Xóa KNOWN_OPEN, toàn bộ 24 tổ hợp đều 0 issues |
| Mock picker sai shape làm scope sheet crash | Chỉ sửa mock thành {users,canViewAll}/{depts}; không sửa app để che lỗi fixture |
| Audit ghi nhận nhầm decoration / vùng chạm VTextField | Chỉ bỏ decoration rỗng không tương tác bị clip; không bỏ text/control. Vùng chạm ủy quyền có kiểm click thực và giữ ngưỡng 44 |
| D-L2: line-height hint tổ chức chặt | Còn nhận xét thẩm mỹ mức thấp để Claude đánh giá; chưa có ngưỡng đo hoặc sửa thêm sau khi đóng băng code |
| D-L3: profile JSON sai contract thiếu contact | Chưa bổ sung phòng thủ cho response sai shape; API đúng contract và ma trận hiện không lỗi runtime |
| D-I2: thông báo Dùng máy tính cho tác vụ đang hoãn | Chưa bổ sung trong D; ghi nhận để review parity sau, không thêm tính năng đang hoãn |
| Pixel phụ 768 WebKit thoáng qua 2px | Đã giữ nguyên failure, rerun và control riêng. Không đủ bằng chứng khẳng định nguyên nhân; xem giới hạn QA |

## Hoãn F — không làm trong D

Đã ghi trong `contracts/PARITY.md`:

1. Giao diện Tối của trang cài đặt cấp 2; hiện vẫn là đảo Sáng.
2. Phân biệt 403 và 404 từ server ở hồ sơ khách.
3. Thông báo cụ thể khi lịch hẹn trùng giờ.

## Ảnh trước/sau và cách tái chạy

Báo cáo QA đầy đủ: [qa/QA-D-G3.md](qa/QA-D-G3.md).

- Ảnh mobile sau sửa: `qa/D-shots/G3-final-20261109-2056/`, 228 JPG đại diện 320/390/844, Sáng/Tối, cả hai engine. Các viewport còn lại vẫn có kết quả đo đầy đủ.
- Ảnh trước/sau desktop/iPad: thư mục `desktop-regression/` trong run trên, tên `*-base-*.png` và `*-dotD-*.png`, tổng 36 cặp, kèm JSON exact và ảnh diff nếu có.
- `e2e-functional.json`, `e2e-pixel.json`, `provenance.json` giữ kết quả runner, commit và hash build. Recheck/control ở hai thư mục riêng bên cạnh.
- Các run smoke, ảnh root D-shots và QA-D.md cũ chỉ là lịch sử, không dùng để thay kết quả chốt.

Chạy từ `frontend`, sau khi build đúng base e290e2d như provenance:

```powershell
npm run build
npx vue-tsc -b
npx vitest run
$env:D_APP_PORT='4186'
$env:D_BASE_PORT='4187'
$env:D_QA_RUN_ID='G3-review-new'
$env:BASE_DIST='<thư mục dist base e290e2d trong provenance.json>'
npx playwright test e2e/crm-d.spec.ts e2e/crm-d-flows.spec.ts --workers=4
npx playwright test e2e/desktop-regression-d.spec.ts --workers=1
```

Không chạy backend cho bộ này. API/socket dùng dữ liệu giả. Bộ pixel vẫn assert exactDiffPixels=0; nếu gặp nhiễu phải giữ và báo cáo kết quả, không đổi threshold.

## Chưa kiểm

Safari/iPhone/iPad thật; bàn phím, native picker và camera thật; Add to Home Screen/PWA; backend hoặc Zalo thật. Chưa kiểm mọi trang settings cấp 2 khác, dữ liệu hàng nghìn khách, mọi tổ hợp role/phòng ban và múi giờ tổ chức khác +07. Đo tương phản tự động hiện theo ngưỡng 3 của bộ QA, chưa phải chứng nhận WCAG AA toàn diện.

Ở cold deep link, nút Quay lại trong app có fallback /account. Không can thiệp native Back/vuốt Safari để ngăn người dùng rời website khi lịch sử trình duyệt đã hết.

## Checklist iPhone cho đợt D

1. Cùng dữ liệu test, chọn Sáng rồi Tối; Tổng quan ưu tiên khách chờ, public/private tách riêng.
2. Bấm Vào hội thoại chưa trả lời, kiểm chip; mở một khách rồi back; tải lại còn lọc; xóa lọc không tự bật lại.
3. Khách hàng: tìm, chọn bộ lọc nhưng chưa Áp dụng thì danh sách chưa đổi; áp dụng, cuộn tải thêm; xoay máy giữ trạng thái.
4. Hồ sơ: xem nick và phụ trách; Nhắn tin với khách có một/hai/không có hội thoại; chọn đúng nick trong picker.
5. Lịch hẹn: tạo, sửa, hủy; thử Giữ lại trong xác nhận. Sheet/confirm không che nhau; nguồn và nút mở hội thoại không mất.
6. Gõ nhiều dòng, bật bàn phím và xoay dọc/ngang: nút lưu còn tiếp cận được; không tự zoom vào input.
7. Cài đặt cấp 1 → cấp 2 → nút back về cấp 1 → back về /account; mở thẳng /settings/personal/profile rồi thử nút back trong app.
8. Ở Hồ sơ tổ chức, thử Chọn từ kho/Lưu và cuộn tới cuối; ô nhập không bị cắt. Cấp 2 vẫn Sáng theo mục F.
9. Lặp lại ở 844×390 / 932×430 trên máy phù hợp, quan sát safe-area và tabbar không che nội dung cuối.
10. Kiểm riêng Safari và Home Screen; iPad dọc/ngang giữ giao diện desktop/compact. Ghi lỗi thực tế cho vòng review, chưa phát hành.
