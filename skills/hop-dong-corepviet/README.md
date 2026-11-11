# Skill: hop-dong-corepviet

Bộ tài liệu và bản mẫu của skill soạn hợp đồng Cờ Rếp Việt.

## Nội dung thư mục

| File | Mục đích |
|------|----------|
| `HUONG-DAN-SU-DUNG.md` | **Đọc file này trước** — cách gọi skill, mẫu tin nhắn copy sẵn, giá trị mặc định |
| `templates/BAO-GIA-GOI-XE-CHUYEN-NGHIEP-2026.pdf` | Bản mẫu ① Báo giá Gói Xe (27 hạng mục có hình) |
| `templates/HOP-DONG-PHAN-PHOI-CO-REP-VIET-2026.docx` | Bản mẫu ② Hợp đồng 18 điều + Phụ lục 01 bảng giá |
| `templates/PHU-LUC-02-GOI-SETUP-XE.docx` | Bản mẫu ③ Phụ lục 02 dùng khi khách mua Gói Setup Xe |
| `templates/BAO-GIA-GOI-KHOI-NGHIEP-BEP-2026.pdf` | Bản mẫu báo giá Gói Bếp (dùng khi khách không mua xe) |
| `templates/build_*.py` | Script Python sinh từng loại tài liệu |
| `templates/images/` | Kho ảnh sản phẩm dùng cho báo giá |

## Bộ hồ sơ hoàn chỉnh

Khách mua **Gói Setup Xe** → 3 tài liệu: Báo giá Gói Xe (.pdf) + Hợp đồng phân phối (.docx) + Phụ lục 02 (.docx).

Khách chỉ mua **Gói Khởi Nghiệp Bếp** → 2 tài liệu: Báo giá Gói Bếp (.pdf) + Hợp đồng phân phối (.docx).

## Lưu ý quan trọng

Skill thật đã được lưu trên **tài khoản Claude**, dùng được ở mọi phiên chat mới.

Thư mục này chỉ để tra cứu và giữ bản mẫu. **Sửa file ở đây KHÔNG làm thay đổi skill.** Muốn đổi nội dung skill, nhắn trực tiếp cho Claude, ví dụ:

> "Cập nhật skill hợp đồng: chỉ tiêu doanh số đổi thành 5 triệu/tháng"

## Dùng nhanh

Nhắn cho Claude ở bất kỳ phiên nào:

```
Soạn hợp đồng phân phối cho khách:
- Họ tên:
- CCCD:
- Ngày cấp:          - Nơi cấp:
- Địa chỉ thường trú:
- Địa điểm kinh doanh:
- SĐT:
```

Chi tiết đầy đủ xem `HUONG-DAN-SU-DUNG.md`.
