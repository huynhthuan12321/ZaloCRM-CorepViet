# Hướng dẫn sử dụng Skill "hop-dong-corepviet"

> Skill đã được lưu vào tài khoản Claude của anh. Dùng được ở **mọi phiên chat mới**, không cần mở lại thư mục dự án.
> Cập nhật: 31/07/2026.

---

## 1. BỘ HỒ SƠ HOÀN CHỈNH = 3 TÀI LIỆU

Khách mua **Gói Setup Xe Chuyên Nghiệp** → bộ hồ sơ đủ 3 tài liệu, theo thứ tự:

| # | Tài liệu | File | Vai trò |
|---|----------|------|---------|
| 1 | **Báo giá Gói Xe Chuyên Nghiệp** | `.pdf` | Chào giá — 27 hạng mục có hình ảnh, quà tặng, khuyến mãi. Khách xem trước khi quyết định. |
| 2 | **Hợp đồng phân phối hàng hóa** | `.docx` | 18 điều + Phụ lục 01 bảng giá nguyên liệu. Điều chỉnh quan hệ mua bán dài hạn. |
| 3 | **Phụ lục 02 — Gói Setup Xe** | `.docx` | Ghi nhận đơn hàng xe + ràng buộc quyền dùng bộ nhận diện trên xe. |

Chỉ cần nói "soạn bộ hợp đồng cho khách..." là Claude sinh cả 3 file.

**Trường hợp khách chỉ mua Gói Khởi Nghiệp Bếp** (không mua xe): bộ hồ sơ gồm 2 tài liệu — Báo giá Gói Bếp (.pdf) + Hợp đồng phân phối (.docx). Không có Phụ lục 02 vì không có xe mang bộ nhận diện.

Skill đã nhớ sẵn: thông tin pháp nhân công ty, danh mục thiết bị 2 gói, bảng giá 13 mặt hàng nguyên liệu, chính sách cọc, chỉ tiêu doanh số, chính sách vận chuyển 2 khu vực, và 11 nguyên tắc pháp lý bắt buộc.

---

## 2. Cách gọi skill

### Cách 1 — Nói tự nhiên (khuyến nghị)

Chỉ cần nhắn như nói chuyện bình thường, Claude tự nhận ra:

> "Soạn hợp đồng cho chị Nguyễn Thị Lan, CCCD 079188001234 cấp ngày 12/3/2021 tại Cục CSQLHC, thường trú 45 Lê Lợi, TP Cần Thơ, bán tại nhà cùng địa chỉ, SĐT 0912345678"

### Cách 2 — Gọi thẳng tên skill

> "/hop-dong-corepviet — soạn hợp đồng cho khách sau: ..."

Dùng khi Claude không tự trigger, hoặc khi anh muốn chắc chắn.

---

## 3. Mẫu tin nhắn để copy

### 3.1. Hợp đồng phân phối cơ bản

```
Soạn hợp đồng phân phối cho khách:
- Họ tên:
- CCCD:
- Ngày cấp:
- Nơi cấp:
- Địa chỉ thường trú:
- Địa điểm kinh doanh:
- SĐT:
- Email:
```

### 3.2. BỘ HỒ SƠ ĐẦY ĐỦ 3 TÀI LIỆU (khách mua Gói Xe)

```
Soạn bộ hợp đồng đầy đủ cho khách:

BÊN B
- Họ tên:
- CCCD:
- Ngày cấp:
- Nơi cấp:
- Địa chỉ thường trú:
- Địa điểm kinh doanh:
- SĐT:
- Email:

GÓI XE
- Giá gói: 21.900.000đ
- Cọc: 5.000.000đ, ngày:
- Ngày giao xe dự kiến:
- Địa điểm giao:
- Khuyến mãi kèm: (VD: tặng 1 bình gas 12kg)
```

### 3.3. Khách là Hộ kinh doanh / Công ty

Thay CCCD bằng Mã số thuế, và bổ sung:

```
- Tên Hộ kinh doanh/Công ty:
- Mã số thuế:
- Người đại diện:
- Chức vụ:
```

---

## 4. Điều gì xảy ra sau khi anh gửi

1. Claude đối chiếu thông tin với checklist. **Thiếu mục bắt buộc → hỏi lại 1 lần duy nhất**, liệt kê đúng mục thiếu.
2. Thiếu mục tùy chọn → dùng mặc định đã chốt, báo lại cho anh biết dùng gì.
3. Sinh file `.docx`, tự kiểm tra bằng cách render ra ảnh và xem lại từng trang.
4. Lưu file vào thư mục làm việc, gửi link cho anh mở.

Tên file có dạng:

```
BAO-GIA-GOI-XE-NGUYEN-THI-LAN-31072026.pdf
HOP-DONG-PHAN-PHOI-NGUYEN-THI-LAN-31072026.docx
PHU-LUC-02-GOI-SETUP-XE-NGUYEN-THI-LAN-31072026.docx
```

Tất cả lưu vào thư mục `hop-dong-da-soan/`.

---

## 5. Giá trị mặc định skill đang dùng

| Mục | Giá trị |
|-----|---------|
| Thời hạn hợp đồng | 12 tháng, tự động gia hạn nếu không ai dừng trước 30 ngày |
| Đơn hàng tối thiểu | 3.000.000đ/đơn |
| Chỉ tiêu doanh số | 3.000.000đ/tháng |
| Freeship Khu vực 1 | Đơn ≥ 4.000.000đ — miền Tây, miền Đông Nam Bộ, Tây Nguyên, từ Bình Định trở vào |
| Freeship Khu vực 2 | Đơn ≥ 6.000.000đ — các tỉnh còn lại |
| Chương trình bột | Mua 10 tặng 1 |
| Độc quyền khu vực | KHÔNG độc quyền |
| Cọc Gói Bếp | 200.000đ (gói 3.890.000đ) |
| Cọc Gói Xe | 5.000.000đ (gói 21.900.000đ) |

**Muốn khác mặc định** → nói rõ trong tin nhắn, VD: *"khách này cho độc quyền huyện Cái Bè, chỉ tiêu 10 triệu/tháng"*.

---

## 6. Cách sửa skill khi chính sách thay đổi

Nhắn thẳng cho Claude, không cần sửa file tay:

> "Cập nhật skill hợp đồng: giá bột tăng lên 70.000đ/túi"

> "Cập nhật skill hợp đồng: chỉ tiêu doanh số đổi thành 5 triệu/tháng"

> "Cập nhật skill hợp đồng: thêm điều khoản về bảo hành thiết bị 12 tháng"

Claude sẽ ghi đè skill đã lưu. Lần soạn sau tự động dùng thông tin mới.

**Lưu ý:** sửa file trong thư mục này KHÔNG làm thay đổi skill đã lưu — skill nằm trên tài khoản Claude. Thư mục này chỉ để anh tra cứu và lưu bản mẫu.

---

## 7. Kiểm tra trước khi đưa khách ký

Dù skill đã cài sẵn quy tắc, anh vẫn nên soát nhanh 5 điểm:

- [ ] Tên và CCCD/MST Bên B đúng như giấy tờ, **không bỏ trống**
- [ ] Người ký chính là người đứng tên Bên B (nếu khác → phải có giấy ủy quyền)
- [ ] Bên A là **Công ty TNHH TM - SX - XNK Thuận Tín**, không phải tên thương hiệu hay cá nhân
- [ ] Ngày ký, ngày hiệu lực, ngày hết hạn khớp nhau
- [ ] Nếu có mua xe → đã kèm Phụ lục 02, số tiền cọc khớp với chứng từ chuyển khoản

---

## 8. Nguyên tắc pháp lý skill luôn tuân thủ

1. Bên A luôn là pháp nhân công ty, không ký bằng tên thương hiệu hay CCCD cá nhân.
2. Luôn gọi "Hợp đồng phân phối", không gọi "hợp đồng đại lý" (tránh nghĩa vụ bồi thường theo Điều 177 Luật Thương mại 2005).
3. Chỉ nhận tiền vào tài khoản công ty VietinBank 116003043089.
4. Bảng giá luôn để ở Phụ lục riêng, cập nhật không cần ký lại hợp đồng.
5. Không ấn định giá bán lẻ cứng — chỉ dùng "giá bán lẻ khuyến nghị".
6. Không cam kết doanh thu, lợi nhuận, thời gian hoàn vốn.
7. Điều khoản phạt vi phạm tối đa 8% giá trị nghĩa vụ bị vi phạm (Điều 301 LTM).
8. Luôn kiểm tra không sót tên thương hiệu lạ do copy nhầm mẫu.
9. Nhắc anh cho luật sư rà lại trước khi ký hàng loạt.

---

## 9. Tài liệu liên quan trong dự án

| File | Nội dung |
|------|----------|
| `HOP-DONG-PHAN-PHOI-CO-REP-VIET-2026.docx` | Bản mẫu gốc 18 điều + Phụ lục 01 |
| `PHU-LUC-02-GOI-SETUP-XE.docx` | Bản mẫu Phụ lục 02 |
| `HUONG-DAN-SOAN-HOP-DONG-PHAN-PHOI.md` | Checklist thông tin cần thu thập |
| `RA-SOAT-PHAP-LY-HOP-DONG-DAI-LY.md` | Phân tích lỗi của mẫu hợp đồng cũ |
| `docs/knowledge-base/bang-gia-nguyen-lieu.md` | Bảng giá nguyên liệu (nguồn cho Phụ lục 01) |
