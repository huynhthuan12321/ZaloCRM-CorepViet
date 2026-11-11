---
name: hop-dong-corepviet
description: Soạn BỘ HỒ SƠ HỢP ĐỒNG hoàn chỉnh cho Cờ Rếp Việt (Công ty TNHH TM-SX-XNK Thuận Tín) gồm 3 tài liệu - Báo giá Gói Xe + Hợp đồng phân phối + Phụ lục 02. Trigger khi user nói "soạn hợp đồng", "làm hợp đồng cho khách", "bộ hợp đồng", "hợp đồng đại lý/phân phối", "phụ lục hợp đồng", "báo giá gói xe/gói bếp", hoặc gửi thông tin khách hàng kèm ý định lập hợp đồng.
---

# Soạn bộ hồ sơ hợp đồng Cờ Rếp Việt

Skill này soạn **bộ hồ sơ hợp đồng hoàn chỉnh** cho hệ thống Cờ Rếp Việt. Xuất file định dạng chuẩn văn bản hành chính Việt Nam.

## Tài nguyên đi kèm skill

| Đường dẫn | Nội dung |
|-----------|----------|
| `templates/images/MANIFEST.md` | **Đọc file này trước khi làm báo giá** — bản đồ ảnh sản phẩm sang từng hạng mục |
| `templates/images/` | 38 ảnh sản phẩm thật (xe, thiết bị, đồng phục, quà tặng, logo) |
| `templates/build_baogia_goixe.py` | Script sinh báo giá Gói Xe (PDF) |
| `templates/build_baogia_goibep.py` | Script sinh báo giá Gói Bếp (PDF) |
| `templates/build_hopdong.py` | Script sinh hợp đồng phân phối (DOCX) |
| `templates/build_phuluc02.py` | Script sinh Phụ lục 02 (DOCX) |
| `templates/*.docx`, `templates/*.pdf` | Bản mẫu đã hoàn thiện để đối chiếu |

**Cách dùng script:** copy script ra thư mục làm việc, sửa biến `D` (thư mục ảnh) trỏ về `templates/images/` của skill, sửa `OUT` (đường dẫn file xuất) và các trường thông tin khách, rồi chạy bằng python3. Nếu script không chạy được, viết lại từ đầu theo mô tả cấu trúc bên dưới — nội dung và bố cục quan trọng hơn việc tái sử dụng script.

## BỘ HỒ SƠ HOÀN CHỈNH = 3 TÀI LIỆU

Khi khách mua **Gói Setup Xe Chuyên Nghiệp** và trở thành điểm bán hệ thống, bộ hồ sơ phải đủ 3 tài liệu, theo đúng thứ tự này:

| # | Tài liệu | File | Vai trò |
|---|----------|------|---------|
| 1 | **Báo giá Gói Xe Chuyên Nghiệp** | `.pdf` | Chào giá, liệt kê 27 hạng mục thiết bị có hình ảnh, quà tặng, khuyến mãi. Khách xem và quyết định trước khi ký. |
| 2 | **Hợp đồng phân phối hàng hóa** | `.docx` | 18 điều + Phụ lục 01 bảng giá nguyên liệu. Điều chỉnh quan hệ mua bán nguyên liệu dài hạn. |
| 3 | **Phụ lục 02 — Gói Setup Xe** | `.docx` | Ghi nhận giao dịch mua xe + ràng buộc quyền dùng bộ nhận diện thương hiệu trên xe với hiệu lực hợp đồng. |

**Mặc định: khi user yêu cầu soạn hợp đồng cho khách mua Gói Xe → sinh cả 3 file.** Chỉ sinh riêng lẻ khi user nói rõ chỉ cần 1 loại.

Nếu khách chỉ mua **Gói Khởi Nghiệp Bếp** (không mua xe): bộ hồ sơ gồm Báo giá Gói Bếp (.pdf) + Hợp đồng phân phối (.docx). KHÔNG có Phụ lục 02 vì không có xe mang bộ nhận diện.

## Quy trình

1. Xác định khách mua gói nào (Xe / Bếp / chỉ lấy nguyên liệu) → quyết định bộ hồ sơ gồm mấy tài liệu.
2. Đối chiếu thông tin user gửi với checklist "Thông tin cần có".
3. Thiếu thông tin **bắt buộc** → hỏi gọn 1 lần, liệt kê đúng mục thiếu. Thiếu thông tin **tùy chọn** → dùng mặc định, báo lại cho user biết đã dùng gì.
4. Sinh file bằng python-docx (hợp đồng, phụ lục) và reportlab (báo giá PDF).
5. **Bắt buộc kiểm tra:** convert sang PDF rồi render ảnh và xem lại từng trang — `soffice --headless --convert-to pdf file.docx` rồi `pdftoppm -jpeg -r 70 file.pdf pg`, sau đó Read ảnh.
6. Lưu vào thư mục làm việc của user (thư mục `hop-dong-da-soan/` nếu có) và present tất cả file cùng lúc. Nếu đang chạy trên điện thoại hoặc không có thư mục kết nối, xuất file trong cuộc trò chuyện để user tải về.
7. Nhắc user các ô còn để trống cần điền tay khi ký.

## Thông tin cần có

### Bắt buộc — Bên B
- Họ tên đầy đủ (hoặc tên Hộ kinh doanh/Công ty)
- Số CCCD (hoặc MST nếu là HKD/công ty) — **không được để trống**
- Ngày cấp, nơi cấp CCCD
- Địa chỉ thường trú (nên có đủ phường/xã, quận/huyện)
- Địa điểm kinh doanh (nơi đặt xe/điểm bán)
- Số điện thoại
- Người đại diện + chức vụ (chỉ khi Bên B là tổ chức)

Cảnh báo user nếu người ký khác người đứng tên Bên B → cần giấy ủy quyền.

### Bắt buộc khi có Gói Setup Xe (cho Phụ lục 02 + Báo giá)
- Giá gói (mặc định 21.900.000đ)
- Số tiền cọc (mặc định 5.000.000đ) + ngày cọc
- Số tiền còn lại
- Ngày giao xe dự kiến
- Địa điểm giao xe
- Khuyến mãi kèm theo (VD: tặng 01 bình gas 12kg trong tháng)

### Tùy chọn — có mặc định (chính sách đã chốt)
| Mục | Mặc định |
|---|---|
| Số hợp đồng | `..../2026/HĐPP-CRV` (để trống cho user điền) |
| Ngày ký / hiệu lực | Để trống dạng "ngày ..... tháng ..... năm ....." |
| Thời hạn | 12 tháng, tự động gia hạn nếu không ai yêu cầu dừng trước 30 ngày |
| Đơn hàng tối thiểu | 3.000.000đ/đơn |
| **Chỉ tiêu doanh số** | **3.000.000đ/tháng** |
| **Freeship Khu vực 1** | Đơn từ **4.000.000đ** |
| **Freeship Khu vực 2** | Đơn từ **6.000.000đ** |
| Chương trình bột | Mua 10 tặng 1 |
| Độc quyền khu vực | KHÔNG độc quyền |

**Phân vùng vận chuyển:**
- Khu vực 1: miền Tây, miền Đông Nam Bộ, Tây Nguyên và các tỉnh **từ Bình Định trở vào** → freeship đơn ≥ 4 triệu.
- Khu vực 2: các tỉnh, thành phố còn lại (từ Quảng Ngãi trở ra) → freeship đơn ≥ 6 triệu.
- Đơn không đạt mức miễn phí → Bên B trả phí vận chuyển thực tế theo biểu phí đơn vị vận chuyển.

Khi soạn xong, nên chủ động cho user biết khách thuộc khu vực nào và mức freeship áp dụng.

## Dữ liệu cố định — Bên A

```
CÔNG TY TNHH THƯƠNG MẠI - SẢN XUẤT - XUẤT NHẬP KHẨU THUẬN TÍN
Chủ sở hữu và vận hành thương hiệu CỜ RẾP VIỆT
Mã số thuế: 0319348507
Địa chỉ: 537/173/36 Đường Tô Ngọc Vân, Phường Thới An, Thành phố Hồ Chí Minh
Người đại diện: Ông HUỲNH NGỌC THUẬN — Chức vụ: Giám đốc
Điện thoại: 0981 224 978 — Website: www.corepviet.com
Tài khoản: 116003043089 — VietinBank
Chủ tài khoản: CT TNHH TM SX XUAT NHAP KHAU THUAN TIN
```

## Sản phẩm & giá

**Gói Setup Xe Chuyên Nghiệp:** 21.900.000đ, cọc 5.000.000đ. Gồm 27 hạng mục: xe quầy inox (cao 205 × dài 120 × rộng 60 cm, khung inox 6mm + inox 420, có mái che), 4 bộ decal nhận diện (menu/hông/mái/mặt trước), khung bếp inox 304, bếp gang 2 tầng lửa, thanh quay bột chữ T, máy đánh bột 450W, xẻng, dụng cụ, van gas Namilux, dây gas, 200 túi giấy, đồng phục (áo/tạp dề/nón × 2), xô đựng bột × 4, khăn lau × 10. Quà tặng: khóa đào tạo A-Z, 01 banner khai trương, 6 kg bột, gói nguyên liệu cơ bản.

**Gói Khởi Nghiệp Bếp:** ưu đãi 3.890.000đ (niêm yết 4.990.000đ, tiết kiệm 1.100.000đ), cọc 200.000đ. Gồm 7 thiết bị: khung bếp inox 304, bếp hầm gang 2 tầng lửa, thanh quay bột chữ T, xẻng làm bánh, dụng cụ vệ sinh, van gas, dây cấp gas. Quà tặng theo chương trình: 01 túi bột 1,2kg + máy đánh bột cầm tay + 50 giấy gói bánh. **Gói này KHÔNG bao gồm xe bán hàng** — phải ghi rõ trong báo giá.

**Bảng giá nguyên liệu (Phụ lục 01) — đã gồm VAT:**

| STT | Tên hàng hóa | ĐVT | Đơn giá (VNĐ) |
|---|---|---|---|
| 01 | Giấy gói bánh (có màng) | Cái | 990 |
| 02 | Bột làm bánh crepe (túi 1,2 kg) | Gói | 65.000 |
| 03 | Bơ thực vật | Kg | 69.000 |
| 04 | Sốt cam | Kg | 77.000 |
| 05 | Sốt trắng | Kg | 110.000 |
| 06 | Xúc xích Đức xông khói | Kg | 110.000 |
| 07 | Mứt dâu tây (hộp 900 gr) | Hộp | 145.000 |
| 08 | Cốm mix 5 màu | Kg | 150.000 |
| 09 | Socola đen (hộp 1 kg) | Hộp | 165.000 |
| 10 | Chà bông xù | Kg | 190.000 |
| 11 | Phô mai mozzarella | Kg | 210.000 |
| 12 | Thịt dăm bông thái sợi | Kg | 230.000 |
| 13 | Ba rọi xông khói thái sợi | Kg | 240.000 |

## Nguyên tắc pháp lý BẤT DI BẤT DỊCH

1. Bên A **luôn là Công ty TNHH TM - SX - XNK Thuận Tín**, không bao giờ ký bằng tên thương hiệu "Cờ Rếp Việt" hay bằng CCCD cá nhân. Thương hiệu không có tư cách chủ thể ký hợp đồng.
2. Luôn gọi là **"Hợp đồng phân phối hàng hóa"**, KHÔNG gọi "hợp đồng đại lý" — quan hệ thực tế là mua đứt bán đoạn. Gọi sai làm phát sinh nghĩa vụ bồi thường theo Điều 177 Luật Thương mại 2005. Phải có điều khoản khẳng định rõ đây không phải đại lý thương mại theo Điều 166 LTM.
3. Tiền **chỉ chuyển vào tài khoản công ty**, không dùng tài khoản cá nhân. Ghi rõ trong mọi tài liệu.
4. Bảng giá luôn nằm ở **Phụ lục riêng**, không nhúng vào thân hợp đồng — để cập nhật giá không phải ký lại toàn bộ.
5. **Không ấn định giá bán lẻ cứng** cho bên phân phối (rủi ro theo pháp luật cạnh tranh). Chỉ dùng "giá bán lẻ khuyến nghị" mang tính tham khảo.
6. **Không cam kết** doanh thu, lợi nhuận, thời gian hoàn vốn trong bất kỳ tài liệu nào.
7. Phạt vi phạm phải ghi rõ trong hợp đồng mới áp dụng được, mức tối đa 8% giá trị phần nghĩa vụ bị vi phạm (Điều 301 LTM 2005).
8. Không cam kết ngày giao xe cố định khi chưa có xác nhận của xưởng sản xuất.
9. Quà tặng luôn ghi "theo chương trình tại thời điểm lên đơn", không phải thành phần cố định của gói.
10. Luôn kiểm tra không còn sót tên thương hiệu lạ (lỗi copy từ mẫu khác).
11. Cuối mỗi lần soạn, nhắc user: nên cho luật sư địa phương rà lại trước khi ký hàng loạt; đây là tư vấn ở góc độ doanh nghiệp, không thay thế ý kiến luật sư hành nghề.

## Tài liệu 1 — Báo giá (PDF)

**Đọc `templates/images/MANIFEST.md` trước** để lấy đúng file ảnh cho từng hạng mục.

Thiết kế theo màu thương hiệu: navy `#1a2b5f`, vàng `#f6b21b`, nền nhạt `#f5f7fc`, đỏ nhấn `#c62828`.

Cấu trúc:
- Header: logo (`templates/images/img-002.jpg`) + khối thông tin công ty (tên, MST, địa chỉ, người đại diện, thương hiệu)
- Tiêu đề báo giá + slogan phụ
- Dải thông tin: số báo giá, ngày lập, hiệu lực 30 ngày
- Bảng hạng mục có cột hình ảnh thật của từng thiết bị
- Khối tổng giá nổi bật (với Gói Bếp: gạch giá niêm yết → giá ưu đãi → tiết kiệm)
- Khối quà tặng + khung khuyến mãi trong tháng (viền vàng, nền `#fff7e0`)
- Quyền lợi khách hàng
- Đặt hàng & thanh toán + thông tin chuyển khoản công ty
- Dải cam kết dịch vụ (chữ vàng/trắng trên nền navy)
- Khối ký xác nhận 2 bên
- Footer mọi trang: tên công ty + MST + địa chỉ + website

Kỹ thuật: reportlab với font DejaVuSans (`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` và `-Bold.ttf`) để hiển thị đúng tiếng Việt. Dùng `BaseDocTemplate` + `PageTemplate(onPage=...)` cho header/footer. **Tuyệt đối không dùng emoji** trong reportlab (font không có glyph → ô đen), dùng ký tự `★` hoặc `▸`.

## Tài liệu 2 — Hợp đồng phân phối (18 điều)

Căn cứ: BLDS 91/2015/QH13, Luật Thương mại 36/2005/QH11, Luật An toàn thực phẩm 55/2010/QH12, Luật Sở hữu trí tuệ.

1. Giải thích từ ngữ (Hàng hóa, Bảng giá, Điểm bán, Thương hiệu)
2. Đối tượng và bản chất hợp đồng — khẳng định mua đứt bán đoạn, không phải đại lý
3. Giá, bảng giá, điều chỉnh giá (báo trước 15 ngày; đơn đã xác nhận giữ giá cũ)
4. Đặt hàng, giao nhận, chuyển rủi ro (đơn tối thiểu 3 triệu, giao 1-2 ngày làm việc, khiếu nại số lượng trong 24h)
5. Phương thức thanh toán (100% khi đặt hàng, chỉ vào tài khoản công ty)
6. Chính sách hỗ trợ (giá phân phối, 10+1, freeship 2 khu vực, tư vấn kỹ thuật, ấn phẩm nhận diện)
7. Chỉ tiêu doanh số 3 triệu/tháng (không phát sinh đơn 3 tháng → có quyền chấm dứt)
8. Quyền và nghĩa vụ Bên A
9. Quyền và nghĩa vụ Bên B (tự ĐKKD & nghĩa vụ thuế; tuân thủ ATTP; CẤM pha trộn/đóng gói lại/sao chép công thức; tự định giá bán lẻ)
10. Quyền sở hữu trí tuệ và sử dụng thương hiệu (không độc quyền, không chuyển giao lại, tháo gỡ trong 15 ngày khi chấm dứt)
11. Bảo mật (hiệu lực tiếp 2 năm sau chấm dứt; không dùng know-how cho thương hiệu khác trong 6 tháng)
12. Chất lượng, bảo quản và đổi trả (phân biệt lỗi nhà sản xuất vs lỗi bảo quản; khiếu nại 7 ngày)
13. Phạm vi phân phối — KHÔNG độc quyền khu vực
14. Thời hạn, gia hạn, chấm dứt (tự động gia hạn nếu không ai yêu cầu dừng trước 30 ngày; các trường hợp chấm dứt ngay; khẳng định không phát sinh bồi thường Điều 177 LTM)
15. Vi phạm, phạt 8%, bồi thường
16. Bất khả kháng
17. Giải quyết tranh chấp — thương lượng 30 ngày, sau đó Tòa án nhân dân có thẩm quyền tại TP.HCM (thỏa thuận bằng văn bản theo BLTTDS 2015)
18. Điều khoản chung (sửa đổi bằng phụ lục, thông báo qua văn bản/email/Zalo, cấm chuyển nhượng, hiệu lực từng phần, 02 bản)

Kèm **Phụ lục 01** ở trang riêng: bảng giá nguyên liệu 13 mặt hàng + ghi chú (đã gồm VAT, chương trình 10+1, freeship 2 khu vực, giá thay đổi theo Điều 3, chính sách nguyên liệu tươi khác nhau theo khu vực) + khối ký 2 bên.

## Tài liệu 3 — Phụ lục 02, Gói Setup Xe (5 điều)

Mục đích: gắn quyền sử dụng bộ nhận diện trên xe với hiệu lực hợp đồng phân phối, tránh trường hợp khách mua đứt xe rồi dùng xe thương hiệu bán hàng nguồn khác.

1. Ghi nhận giao dịch Gói Setup Xe (bảng: tên gói, giá, cọc, ngày cọc, còn lại, ngày giao, địa điểm, khuyến mãi)
2. Quyền sở hữu Xe (chuyển sau khi thanh toán đủ + nghiệm thu; sở hữu Xe KHÔNG đồng nghĩa sở hữu thương hiệu)
3. Điều kiện sử dụng bộ nhận diện (chỉ kinh doanh nguyên liệu hệ thống; cấm dùng xe thương hiệu bán hàng nguồn khác; cấm sửa đổi nhận diện) — vi phạm = căn cứ chấm dứt ngay
4. Xử lý bộ nhận diện khi chấm dứt (tháo gỡ trong 15 ngày, tự chịu chi phí; Bên B giữ khung xe, Bên A không hoàn tiền)
5. Điều khoản thi hành (là bộ phận không tách rời; mâu thuẫn thì ưu tiên Phụ lục về nội dung xe)

## Kỹ thuật tạo file .docx

Dùng `python-docx`. Định dạng chuẩn văn bản hành chính Việt Nam:

- Font Times New Roman 12pt, line spacing 1.15, space after 4pt
- Lề: trên/dưới 2cm, trái 2.5cm, phải 2cm
- Set cả `font.name` lẫn `rPr.rFonts` với `qn('w:eastAsia')` để không lỗi font tiếng Việt
- Header: quốc hiệu + tiêu ngữ căn giữa in đậm, dòng `---------------o0o---------------`
- Tiêu đề in đậm 15pt căn giữa
- Tên điều: in đậm 12.5pt, space_before 10pt
- Nội dung điều khoản: căn đều (JUSTIFY)
- Gạch đầu dòng: dùng ký tự `- ` với left_indent, KHÔNG dùng bullet tự động
- Bảng: `style='Table Grid'`, set `cell.width` cho từng ô
- Khối chữ ký: bảng 2 cột, điền sẵn "HUỲNH NGỌC THUẬN" bên A và TÊN KHÁCH IN HOA bên B
- Chỗ user điền tay: dùng dấu chấm `...........` cho thẳng hàng

## Đặt tên file

- `BAO-GIA-GOI-XE-[TEN-KHACH]-[DDMMYYYY].pdf`
- `HOP-DONG-PHAN-PHOI-[TEN-KHACH]-[DDMMYYYY].docx`
- `PHU-LUC-02-GOI-SETUP-XE-[TEN-KHACH]-[DDMMYYYY].docx`

Tên khách viết không dấu, IN HOA, nối bằng gạch ngang. Lưu vào thư mục `hop-dong-da-soan/` trong thư mục làm việc của user nếu có.
