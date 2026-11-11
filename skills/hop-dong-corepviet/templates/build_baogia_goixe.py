# -*- coding: utf-8 -*-
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, Image as RLImage, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

D = "/sessions/relaxed-sharp-bell/mnt/outputs/goixe"
OUT = os.path.join(D, "BAO-GIA-GOI-XE-CHUYEN-NGHIEP-2026.pdf")

pdfmetrics.registerFont(TTFont("DVS", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVSB", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

NAVY = colors.HexColor("#1a2b5f")
YELLOW = colors.HexColor("#f6b21b")
LIGHT = colors.HexColor("#f5f7fc")
GREY = colors.HexColor("#6b7280")
W, H = A4
M = 14 * mm

def st(name, **kw):
    base = dict(fontName="DVS", fontSize=9, leading=12, textColor=colors.black)
    base.update(kw)
    return ParagraphStyle(name, **base)

s_title = st("t", fontName="DVSB", fontSize=17, leading=21, textColor=NAVY, alignment=TA_CENTER)
s_sub = st("sub", fontSize=9.5, textColor=GREY, alignment=TA_CENTER)
s_h = st("h", fontName="DVSB", fontSize=11, leading=14, textColor=NAVY)
s_n = st("n", fontSize=9, leading=12.5)
s_nc = st("nc", fontSize=9, leading=12, alignment=TA_CENTER)
s_small = st("sm", fontSize=8, leading=10.5, textColor=GREY)
s_th = st("th", fontName="DVSB", fontSize=9, leading=11, textColor=colors.white, alignment=TA_CENTER)
s_item = st("it", fontName="DVSB", fontSize=9, leading=11.5)

def header_footer(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY); canv.rect(0, H - 6, W, 6, stroke=0, fill=1)
    canv.setFillColor(YELLOW); canv.rect(0, H - 8.5, W, 2.5, stroke=0, fill=1)
    canv.setFillColor(NAVY); canv.rect(0, 0, W, 26, stroke=0, fill=1)
    canv.setFillColor(colors.white); canv.setFont("DVS", 7.2)
    canv.drawCentredString(W / 2, 16, "Công ty TNHH Thương mại - Sản xuất - Xuất nhập khẩu Thuận Tín — MST: 0319348507")
    canv.drawCentredString(W / 2, 7, "537/173/36 Tô Ngọc Vân, P. Thới An, TP. Hồ Chí Minh · Thương hiệu: CỜ RẾP VIỆT")
    canv.setFillColor(GREY); canv.setFont("DVS", 7)
    canv.drawRightString(W - M, 30, "Trang %d" % doc.page)
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=12 * mm, bottomMargin=14 * mm)
frame = Frame(M, 12 * mm, W - 2 * M, H - 24 * mm, id="f")
doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=header_footer)])
story = []

logo = RLImage(os.path.join(D, "img-002.jpg"), width=30 * mm, height=30 * mm, kind="proportional")
comp = Paragraph(
    "<font name='DVSB' size='11' color='#1a2b5f'>CÔNG TY TNHH TM - SX - XNK THUẬN TÍN</font><br/>"
    "<font size='8.5'>Mã số thuế: <b>0319348507</b><br/>"
    "537/173/36 Đường Tô Ngọc Vân, Phường Thới An, TP. Hồ Chí Minh<br/>"
    "Người đại diện: <b>Huỳnh Ngọc Thuận</b> · Thương hiệu vận hành: <b>CỜ RẾP VIỆT</b></font>", s_n)
ht = Table([[logo, comp]], colWidths=[36 * mm, W - 2 * M - 36 * mm])
ht.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
story.append(ht)
story.append(Spacer(1, 6 * mm))
story.append(Paragraph("BÁO GIÁ GÓI XE CHUYÊN NGHIỆP", s_title))
story.append(Spacer(1, 1.5 * mm))
story.append(Paragraph("Giải pháp điểm bán bánh Cờ Rếp hoàn chỉnh — đồng bộ thương hiệu, đào tạo A-Z, đồng hành lâu dài", s_sub))
story.append(Spacer(1, 4 * mm))

info = Table([[Paragraph("Số báo giá: <b>BG-GX-072026</b>", s_n),
               Paragraph("Ngày lập: <b>31/07/2026</b>", s_nc),
               Paragraph("Hiệu lực: <b>30 ngày</b> kể từ ngày lập", st("ir", fontSize=9, alignment=TA_RIGHT))]],
             colWidths=[(W - 2 * M) / 3] * 3)
info.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d8deeb")),
    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
story.append(info)
story.append(Spacer(1, 5 * mm))
story.append(Paragraph("I. DANH MỤC ĐẦU TƯ TRONG GÓI (27 HẠNG MỤC)", s_h))
story.append(Spacer(1, 2 * mm))

items = [
    (1, "Xe quầy Inox", "Cái", "Khung inox dày 6mm + inox 420, KT cao 205 × dài 120 × rộng 60 cm; khung gầm vuông chắc chắn, có mái che mưa", 1, "img-003.jpg"),
    (2, "Decan menu", "Bộ", "Decan cán mờ, dán menu", 1, "img-000.png"),
    (3, "Decan hông", "Bộ", "Decan cán mờ, dán bên hông xe", 1, "img-001.jpg"),
    (4, "Decan mái", "Bộ", "Decan dán full mái", 1, "img-004.png"),
    (5, "Decan mặt trước", "Bộ", "Decan dán full mặt trước xe", 1, "img-011.jpg"),
    (6, "Khung bếp", "Cái", "Inox 304, KT 40 × 40 × 10 cm; mặt dày 8mm, khung dày 1mm", 1, "img-009.jpg"),
    (7, "Chai đựng sốt 3 đầu", "Cái", "Chai mềm 650 ml", 3, "img-014.jpg"),
    (8, "Bếp hầm", "Cái", "Bếp gang 2 tầng lửa, KT 62 × 40 × 7 cm", 1, "img-006.jpg"),
    (9, "Thanh quay bột chữ T", "Cái", "Inox 304, KT 20 × 30 cm", 1, "img-005.jpg"),
    (10, "Máy đánh bột", "Cái", "Công suất 450W", 1, "img-007.jpg"),
    (11, "Xẻng gắp bánh", "Cái", "Inox 304", 1, "img-008.jpg"),
    (12, "Xẻng quét sốt ngọt", "Cái", "Silicon, KT 20 cm", 2, "img-013.jpg"),
    (13, "Giỏ đựng túi giấy", "Cái", "Nhựa", 1, "img-012.jpg"),
    (14, "Vá inox", "Cái", "Inox 304, KT 9 cm", 1, "img-022.jpg"),
    (15, "Kẹp gắp", "Cái", "Inox 304", 1, "img-020.jpg"),
    (16, "Chén gắp topping", "Cái", "Inox 304", 1, "img-019.jpg"),
    (17, "Dụng cụ vệ sinh bếp", "Bộ", "Inox", 1, "img-023.jpg"),
    (18, "Hủ đựng cốm", "Cái", "Inox", 1, "img-024.jpg"),
    (19, "Khay đựng tay quay", "Cái", "Inox", 1, "img-021.jpg"),
    (20, "Van gas", "Bộ", "Van gas Namilux", 1, "img-017.jpg"),
    (21, "Dây cấp gas", "Bộ", "Dây gas bọc inox phủ nhựa", 1, "img-018.png"),
    (22, "Túi giấy đựng bánh", "Cái", "Túi giấy chuyên dụng", 200, "img-015.jpg"),
    (23, "Áo đồng phục", "Cái", "Vải kaki", 2, "img-016.jpg"),
    (24, "Tạp dề đồng phục", "Cái", "Vải kaki", 2, "img-025.jpg"),
    (25, "Nón bếp đồng phục", "Cái", "Vải kaki", 2, "img-026.jpg"),
    (26, "Xô đựng bột", "Cái", "Xô đựng thực phẩm 3 lít", 4, "img-028.png"),
    (27, "Khăn lau mặt bếp", "Cái", "Khăn than tre, KT 20 × 20 cm", 10, "img-027.jpg"),
]

def thumb(fname, max_w=20 * mm, max_h=16 * mm):
    p = os.path.join(D, fname)
    with PILImage.open(p) as im:
        w, h = im.size
    r = min(max_w / w, max_h / h)
    return RLImage(p, width=w * r, height=h * r)

col_w = [10 * mm, 40 * mm, 12 * mm, 72 * mm, 12 * mm, 26 * mm]
rows = [[Paragraph(x, s_th) for x in ["STT", "Hạng mục", "ĐVT", "Quy cách - Chất liệu", "SL", "Hình ảnh"]]]
for n, name, dvt, spec, sl, img in items:
    rows.append([Paragraph(str(n), s_nc), Paragraph(name, s_item), Paragraph(dvt, s_nc),
                 Paragraph(spec, s_n), Paragraph(str(sl), s_nc), thumb(img)])

tbl = Table(rows, colWidths=col_w, repeatRows=1)
style = [
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN", (5, 1), (5, -1), "CENTER"),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c9d2e4")),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
for i in range(1, len(rows)):
    if i % 2 == 0:
        style.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
tbl.setStyle(TableStyle(style))
story.append(tbl)
story.append(Spacer(1, 3 * mm))

total = Table([[Paragraph("TỔNG GIÁ TRỊ ĐẦU TƯ (trọn gói thiết bị + nhận diện thương hiệu + đào tạo)", st("tt", fontName="DVSB", fontSize=10.5, textColor=colors.white)),
                Paragraph("21.900.000 VNĐ", st("tv", fontName="DVSB", fontSize=14, textColor=YELLOW, alignment=TA_RIGHT))]],
              colWidths=[(W - 2 * M) * 0.68, (W - 2 * M) * 0.32])
total.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
story.append(total)
story.append(Spacer(1, 5 * mm))

gift_left = Paragraph(
    "<font name='DVSB' color='#1a2b5f'>II. QUÀ TẶNG KÈM GÓI</font><br/><br/>"
    "1. Khóa đào tạo &amp; hướng dẫn làm bánh Cờ Rếp từ A-Z (online, thực hành đến khi làm được)<br/>"
    "2. 01 banner khai trương<br/>"
    "3. 6 kg bột làm bánh<br/>"
    "4. Gói nguyên liệu cơ bản ban đầu", st("g", fontSize=9.5, leading=15))
gift_right = Paragraph(
    "<font name='DVSB' size='11' color='#1a2b5f'>★ KHUYẾN MÃI TRONG THÁNG</font><br/><br/>"
    "<font name='DVSB' size='12.5' color='#b45309'>TẶNG 01 BÌNH GAS 12KG</font><br/><br/>"
    "<font size='8.5' color='#6b7280'>Áp dụng cho khách hàng đặt cọc trong tháng. "
    "Số lượng có hạn — vui lòng liên hệ chuyên viên tư vấn để xác nhận chương trình.</font>",
    st("g2", fontSize=9.5, leading=13))
gt = Table([[gift_left, gift_right]], colWidths=[(W - 2 * M) * 0.52, (W - 2 * M) * 0.48])
gt.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#fff7e0")),
    ("BOX", (1, 0), (1, 0), 1.2, YELLOW),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
story.append(KeepTogether(gt))
story.append(Spacer(1, 5 * mm))

pay_block = [
    Paragraph("III. ĐẶT HÀNG &amp; THANH TOÁN", s_h),
    Spacer(1, 2 * mm),
    Paragraph(
        "• Đặt cọc: <b>5.000.000 VNĐ</b> để xác nhận đơn và đưa xe vào sản xuất.<br/>"
        "• Phần còn lại: thanh toán khi nghiệm thu xe, theo phương thức giao nhận được công ty xác nhận.<br/>"
        "• Quy trình: Đặt cọc → Xác nhận đơn → Sản xuất xe theo thiết kế → Kiểm tra chất lượng → "
        "Vận chuyển → Khách nghiệm thu → Thanh toán phần còn lại.<br/>"
        "• Thời gian hoàn thiện xe: theo tiến độ xưởng và lịch khai trương dự kiến của khách, "
        "được xác nhận cụ thể khi lên đơn.", st("p1", fontSize=9.5, leading=15)),
    Spacer(1, 3 * mm)]
bank = Table([[Paragraph(
    "<font name='DVSB' color='#1a2b5f'>THÔNG TIN CHUYỂN KHOẢN (chỉ dùng tài khoản công ty)</font><br/>"
    "Ngân hàng: <b>VietinBank</b> · Số tài khoản: <b>116003043089</b><br/>"
    "Chủ tài khoản: <b>CT TNHH TM SX XUAT NHAP KHAU THUAN TIN</b><br/>"
    "Nội dung: <i>[Họ tên] + [SĐT] cọc Gói Xe</i>", st("bk", fontSize=9.5, leading=14))]],
    colWidths=[W - 2 * M])
bank.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("BOX", (0, 0), (-1, -1), 0.8, NAVY),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
pay_block.append(bank)
pay_block.append(Spacer(1, 2.5 * mm))
pay_block.append(Paragraph(
    "Ghi chú: Báo giá chưa bao gồm phí vận chuyển (tính theo khu vực thực tế, báo cụ thể khi lên đơn). "
    "Quà tặng áp dụng theo chương trình tại thời điểm đặt cọc.", s_small))
story.append(KeepTogether(pay_block))
story.append(Spacer(1, 8 * mm))

sig = Table([
    [Paragraph("XÁC NHẬN KHÁCH HÀNG", st("s1", fontName="DVSB", fontSize=9.5, alignment=TA_CENTER)),
     Paragraph("CHUYÊN VIÊN TƯ VẤN", st("s2", fontName="DVSB", fontSize=9.5, alignment=TA_CENTER))],
    [Paragraph("(Ký, ghi rõ họ tên)", st("s3", fontSize=8, textColor=GREY, alignment=TA_CENTER)),
     Paragraph("(Ký, ghi rõ họ tên)", st("s4", fontSize=8, textColor=GREY, alignment=TA_CENTER))],
    [Spacer(1, 18 * mm), Spacer(1, 18 * mm)],
    [Paragraph("", s_nc),
     Paragraph("Huỳnh Ngọc Thuận", st("s5", fontName="DVSB", fontSize=10, alignment=TA_CENTER))]],
    colWidths=[(W - 2 * M) / 2] * 2)
sig.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(KeepTogether(sig))

doc.build(story)
print("OK:", OUT)
