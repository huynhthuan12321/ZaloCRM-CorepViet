# Review hotfix ngày trong ContactDetailDialog — 09/11/2026

## Trạng thái và phạm vi

- Nhánh `hotfix/contact-date-shift`, worktree `F:\ZaloCRM-wt\hotfix-date`.
- HEAD và merge-base với `release/hotfix-20261108`: `afeea4a01dd78d949e3316a94a3d18e248253f76`.
- Chủ dự án đã DUYỆT ngày 09/11/2026: commit hotfix, fast-forward nhánh release và cherry-pick sang mobile/base. Chưa deploy; mọi sửa dữ liệu cũ vẫn chờ duyệt riêng.
- Không truy cập VPS hoặc database production; mọi kiểm thử dùng API mock, không database.
- `0600cdff` là định danh image chủ dự án cung cấp, không resolve thành Git object local. Báo cáo xác nhận source nhánh release, không tự xác minh nội dung image đang chạy.
- Nhật ký iPhone thật đợt D ĐẠT đã commit riêng trên mobile/base: `b1aade3`.

## Nguyên nhân và trường ảnh hưởng

Desktop đọc cả ba input bằng `new Date(value).toISOString().split('T')[0]` (ngày UTC), nhưng ghi bằng `new Date(day + 'T00:00:00').toISOString()` (nửa đêm trình duyệt).

| Trường | Kiểu lưu | Kết luận trong source release |
|---|---|---|
| `nextAppointment` — Ngày hẹn tiếp | Prisma DateTime, timestamp | PUT và POST có ghi; mở-lưu có thể thay instant và sau các vòng lưu làm lùi ngày |
| `firstContactDate` — Ngày tiếp xúc đầu | Prisma DateTime, timestamp | PUT có ghi; POST hiện bỏ qua; cùng lỗi khi sửa khách |
| `birthDate` — Ngày sinh | Prisma DateTime @db.Date, PostgreSQL DATE | Payload desktop sai UTC date khi trình duyệt UTC+7; POST/PUT hiện bỏ qua trường này, chưa có bằng chứng route đó ghi lệch ngày sinh vào DB |

Các trường khác như sourceDate, createdAt không được form này chuyển/ghi theo cách trên. Không mở rộng hotfix sang lỗi backend bỏ qua trường hoặc xóa lịch hẹn (null hiện thành undefined).

Điều kiện: ở UTC+7, chọn ngày 10/11 tạo `2026-11-09T17:00:00.000Z` (đúng midnight ngày 10 theo tổ chức +07). Lần mở tiếp theo desktop lấy ngày UTC 09/11, rồi lưu thành `2026-11-08T17:00:00.000Z`: ngày tổ chức đã lùi một ngày. Mỗi vòng có thể lặp lại. Đổi thông tin khác rồi Lưu cũng gây lỗi vì payload luôn chứa các trường ngày.

UTC không tạo vòng lùi ngày theo cơ chế UTC+7, nhưng vẫn làm mất giờ/phút/giây của datetime và có thể hiển thị sai ngày tổ chức ở gần ranh giới ngày. UTC âm cũng có thể mất giờ; mức lệch ngày phụ thuộc instant và offset. Ngày sinh là ngày lịch thuần, không được chuyển theo timezone trình duyệt/tổ chức.

## Nguồn gốc

`git blame` trỏ các dòng đọc/lưu về `86645670bced5efec199b2e5903945a225cb567a`, ngày 26/06/2026. Đây là shallow boundary (`git rev-parse --is-shallow-repository` = true), nên chỉ kết luận lỗi tồn tại ít nhất từ snapshot đó, không khẳng định đây là commit gốc tạo lỗi. Lỗi không mới phát sinh bởi đợt D.

## Bản sửa để review

- Helper `frontend/src/utils/contact-date-fields.ts` dùng `orgDayKey` và `orgWallClockToUtc`, cùng cơ chế timezone tổ chức với mobile.
- Input datetime hiển thị ngày tổ chức; không đổi ngày thì trả NGUYÊN ISO ban đầu, giữ cả giờ/phút/giây.
- Chọn ngày mới: datetime chuyển midnight tổ chức; SQL DATE dùng midnight UTC, giữ nguyên ngày lịch.
- Chỉ thay sáu chỗ đọc/ghi ngày trong desktop dialog; không thay layout/API/backend/schema.
- Sau khi duyệt: commit hotfix, cherry-pick đúng commit lên mobile/base; không merge cả nhánh release vào mobile/base. Việc cherry-pick chưa làm vì yêu cầu chờ duyệt commit.

## Kiểm thử

- Unit + component thật với API mock: 2 file, 13/13 PASS ở `TZ=Asia/Ho_Chi_Minh`, 13/13 PASS ở `TZ=UTC`.
- Xác minh offset runtime thật -420/0; bao gồm org +07, UTC, -05; datetime có giờ lẻ; ngày sinh, ngày nhuận, rỗng/xóa; mở-lưu ba vòng không đổi ISO.
- Regression trên component release nguyên gốc: 3/3 component tests FAIL, chứng minh test phát hiện lỗi; đã trả lại nguyên bản sửa ngay sau chạy.
- `vue-tsc -b`: 0 lỗi.
- Log trước/sau: `%TEMP%\hotfix-date-before.log`, `hotfix-date-vitest-hcm.log`, `hotfix-date-vitest-utc.log`, `hotfix-date-tsc.log`.
- Chưa kiểm trình duyệt desktop tương tác thật hoặc dữ liệu production; không chụp ảnh UI vì không đổi layout.

## Đề xuất kiểm dữ liệu cũ — CHỜ DUYỆT

Không thể suy ra ngày đúng chỉ từ giá trị hiện tại. Mốc 17:00 UTC có thể là midnight tổ chức hợp lệ; không được cộng một ngày hàng loạt. updated_at không cho biết số lần lưu hay người dùng có chủ động đổi ngày. Audit customer_update hiện không liệt kê nextAppointment/firstContactDate trong infoDiff, nên không bảo đảm có lịch sử đầy đủ cho hai trường đó.

Nếu được duyệt kiểm chỉ đọc: dùng tài khoản SELECT-only, transaction READ ONLY và giới hạn theo org/khách/thời gian; lấy id, next_appointment, first_contact_date, birth_date, updated_at từ contacts. Thống kê thời điểm 17:00 UTC chỉ dùng lọc ứng viên, không xác nhận sai. Đối chiếu bản backup/snapshot cũ, nguồn nhập, lịch hẹn thực tế và thông tin chủ dự án/nhân viên xác nhận; không mặc định updated_at là thời điểm lỗi.

Nếu có bằng chứng đủ: lập bảng từng contact/field gồm giá trị hiện tại, giá trị đúng, nguồn chứng minh và người duyệt. Chỉ sau phê duyệt riêng mới thiết kế sửa có backup, transaction và điều kiện so khớp giá trị hiện tại (tránh ghi đè cập nhật mới), ghi audit và kiểm lại. Ca không đủ bằng chứng để nguyên/chờ xác minh. Chưa viết script sửa, chưa chạy query production nào.
