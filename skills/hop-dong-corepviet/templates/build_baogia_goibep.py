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

D = "/sessions/relaxed-sharp-bell/mnt/outputs/goibep"
LOGO = "/sessions/relaxed-sharp-bell/mnt/outputs/goixe/img-002.jpg"
OUT = os.path.join(D, "BAO-GIA-GOI-KHOI-NGHIEP-BEP-2026.pdf")

pdfmetrics.registerFont(TTFont("DVS", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVSB", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

NAVY = colors.HexColor("#1a2b5f")
YELLOW = colors.HexColor("#f6b21b")
RED = colors.HexColor("#c62828")
LIGHT = colors.HexColor("#f5f7fc")
GREY = colors.HexColor("#6b7280")
W, H = A4
M = 14 * mm
CW = W - 2 * M

def st(name, **kw):
    base = dict(fontName="DVS", fontSize=9, leading=12, textColor=colors.black)
    base.update(kw); return ParagraphStyle(name, **base)

s_title = st("t", fontName="DVSB", fontSize=17, leading=21, textColor=NAVY, alignment=TA_CENTER)
s_sub = st("sub", fontSize=9.5, textColor=GREY, alignment=TA_CENTER)
s_h = st("h", fontName="DVSB", fontSize=11, leading=14, textColor=NAVY)
s_n = st("n", fontSize=9, leading=12.5)
s_nc = st("nc", fontSize=9, leading=12, alignment=TA_CENTER)
s_small = st("sm", fontSize=8, leading=10.5, textColor=GREY)
s_th = st("th", fontName="DVSB", fontSize=9, leading=11, textColor=colors.white, alignment=TA_CENTER)
s_item = st("it", fontName="DVSB", fontSize=9.5, leading=12)

def header_footer(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY); canv.rect(0, H - 6, W, 6, stroke=0, fill=1)
    canv.setFillColor(YELLOW); canv.rect(0, H - 8.5, W, 2.5, stroke=0, fill=1)
    canv.setFillColor(NAVY); canv.rect(0, 0, W, 26, stroke=0, fill=1)
    canv.setFillColor(colors.white); canv.setFont("DVS", 7.2)
    canv.drawCentredString(W/2, 16, "Công ty TNHH Thương mại - Sản xuất - Xuất nhập khẩu Thuận Tín — MST: 0319348507")
    canv.drawCentredString(W/2, 7, "537/173/36 Tô Ngọc Vân, P. Thới An, TP. Hồ Chí Minh · www.corepviet.com · Thương hiệu: CỜ RẾP VIỆT")
    canv.setFillColor(GREY); canv.setFont("DVS", 7)
    canv.drawRightString(W - M, 30, "Trang %d" % doc.page)
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=12*mm, bottomMargin=14*mm)
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(M, 12*mm, CW, H - 24*mm, id="f")], onPage=header_footer)])
story = []

logo = RLImage(LOGO, width=30*mm, height=30*mm, kind="proportional")
comp = Paragraph(
    "<font name='DVSB' size='11' color='#1a2b5f'>CÔNG TY TNHH TM - SX - XNK THUẬN TÍN</font><br/>"
    "<font size='8.5'>Mã số thuế: <b>0319348507</b><br/>"
    "537/173/36 Đường Tô Ngọc Vân, Phường Thới An, TP. Hồ Chí Minh<br/>"
    "Người đại diện: <b>Huỳnh Ngọc Thuận</b> · Thương hiệu vận hành: <b>CỜ RẾP VIỆT</b></font>", s_n)
ht = Table([[logo, comp]], colWidths=[36*mm, CW - 36*mm])
ht.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(0,0),0)]))
story += [ht, Spacer(1, 5*mm)]

story.append(Paragraph("BÁO GIÁ GÓI KHỞI NGHIỆP BẾP", s_title))
story.append(Spacer(1, 1.5*mm))
story.append(Paragraph("Trọn bộ - Sẵn sàng - Bắt đầu ngay · Setup bếp bánh Cờ Rếp cho người mới khởi nghiệp", s_sub))
story.append(Spacer(1, 4*mm))

info = Table([[Paragraph("Số báo giá: <b>BG-GB-072026</b>", s_n),
               Paragraph("Ngày lập: <b>31/07/2026</b>", s_nc),
               Paragraph("Hiệu lực: <b>30 ngày</b> kể từ ngày lập", st("ir", fontSize=9, alignment=TA_RIGHT))]],
             colWidths=[CW/3]*3)
info.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT),("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#d8deeb")),
    ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
    ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8)]))
story += [info, Spacer(1, 5*mm)]

# I. Danh mục
story.append(Paragraph("I. DANH MỤC THIẾT BỊ TRONG GÓI", s_h))
story.append(Spacer(1, 2*mm))
items = [
    (1, "Khung bếp", "Cái", "Khung bếp inox 304, kích thước 40 × 40 × 10 cm; mặt bếp dày 8 li", 1, "b-001.jpg"),
    (2, "Bếp hầm", "Cái", "Bếp gang 2 tầng lửa, kích thước 62 × 40 × 7 cm", 1, "b-002.jpg"),
    (3, "Thanh quay bột chữ T", "Cái", "Thanh inox 304 quay bột, kích thước 20 × 20 cm", 1, "b-000.jpg"),
    (4, "Xẻng làm bánh", "Cái", "Inox 304", 1, "b-003.jpg"),
    (5, "Dụng cụ vệ sinh bếp", "Bộ", "Inox", 1, "b-005.jpg"),
    (6, "Van gas", "Bộ", "Van gas Namilux", 1, "b-007.jpg"),
    (7, "Dây cấp gas", "Bộ", "Dây cao áp, vỏ bọc inox, phủ lớp nhựa", 1, "b-006.jpg"),
]
def thumb(fname, mw=24*mm, mh=17*mm, base=D):
    p = os.path.join(base, fname)
    with PILImage.open(p) as im: w, h = im.size
    r = min(mw/w, mh/h)
    return RLImage(p, width=w*r, height=h*r)

col_w = [12*mm, 44*mm, 14*mm, 66*mm, 12*mm, 34*mm]
rows = [[Paragraph(x, s_th) for x in ["STT","Danh mục","ĐVT","Quy cách - Chất liệu","SL","Hình ảnh"]]]
for n,name,dvt,spec,sl,img in items:
    rows.append([Paragraph("%02d"%n, st("num", fontName="DVSB", fontSize=11, textColor=NAVY, alignment=TA_CENTER)),
                 Paragraph(name, s_item), Paragraph(dvt, s_nc), Paragraph(spec, s_n),
                 Paragraph(str(sl), s_nc), thumb(img)])
tbl = Table(rows, colWidths=col_w, repeatRows=1)
sty = [("BACKGROUND",(0,0),(-1,0),NAVY),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
       ("ALIGN",(5,1),(5,-1),"CENTER"),("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#c9d2e4")),
       ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
       ("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5)]
for i in range(1, len(rows)):
    if i % 2 == 0: sty.append(("BACKGROUND",(0,i),(-1,i),LIGHT))
tbl.setStyle(TableStyle(sty))
story += [tbl, Spacer(1, 4*mm)]

# Price block
price = Table([[
    Paragraph("GIÁ NIÊM YẾT<br/><font size='12'><strike>4.990.000 đ</strike></font>",
              st("p0", fontName="DVSB", fontSize=8.5, leading=15, textColor=colors.white, alignment=TA_CENTER)),
    Paragraph("GIÁ ƯU ĐÃI TRỌN GÓI<br/><font size='19' color='#f6b21b'>3.890.000 đ</font>",
              st("p1", fontName="DVSB", fontSize=9, leading=23, textColor=colors.white, alignment=TA_CENTER)),
    Paragraph("TIẾT KIỆM<br/><font size='12' color='#f6b21b'>1.100.000 đ</font>",
              st("p2", fontName="DVSB", fontSize=8.5, leading=15, textColor=colors.white, alignment=TA_CENTER)),
]], colWidths=[CW*0.28, CW*0.44, CW*0.28])
price.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),NAVY),("BACKGROUND",(1,0),(1,0),RED),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9),
    ("BOX",(0,0),(-1,-1),1,NAVY)]))
story += [price, Spacer(1, 5*mm)]

# II. Quà tặng
gift_head = [Paragraph("II. QUÀ TẶNG KHI MUA BỘ SETUP (theo chương trình hiện hành)", s_h), Spacer(1, 2.5*mm)]
def gift_cell(img, title, desc):
    inner = Table([[thumb(img, 30*mm, 22*mm)],
                   [Paragraph("<font name='DVSB' size='10' color='#1a2b5f'>%s</font>" % title, s_nc)],
                   [Paragraph("<font size='8.5' color='#6b7280'>%s</font>" % desc, s_nc)]],
                  colWidths=[CW/3 - 14*mm])
    inner.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
    return inner

g = Table([[gift_cell("gift-flour.png", "01 TÚI BỘT LÀM BÁNH COREP", "Quy cách 1,2 kg/túi — dùng thực hành và bán mở màn"),
            gift_cell("gift-mixer.jpg", "MÁY ĐÁNH BỘT CẦM TAY", "Đánh bột nhanh, đều, tiết kiệm thời gian chuẩn bị"),
            gift_cell("gift-paper.jpg", "50 GIẤY GÓI BÁNH", "In nhận diện Cờ Rếp Việt, dùng ngay khi bán")]],
          colWidths=[CW/3]*3)
g.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("ALIGN",(0,0),(-1,-1),"CENTER"),
    ("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#fff7e0")),("BOX",(0,0),(-1,-1),1.2,YELLOW),
    ("LINEAFTER",(0,0),(-2,-1),0.6,YELLOW),
    ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
    ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6)]))
story += [KeepTogether(gift_head + [g]), Spacer(1, 2.5*mm)]
story.append(Paragraph("Quà tặng áp dụng theo chương trình tại thời điểm khách lên đơn; số lượng và loại quà có thể thay đổi theo từng thời kỳ. "
                       "Chuyên viên tư vấn sẽ xác nhận lại quyền lợi đầy đủ khi lên đơn.", s_small))
story.append(Spacer(1, 4*mm))

# III. Quyền lợi
story.append(Paragraph("III. QUYỀN LỢI KHÁCH HÀNG", s_h))
story.append(Spacer(1, 2.5*mm))
ben = [
    ("TRỌN BỘ - TIỆN LỢI", "Đầy đủ dụng cụ cần thiết, nhận là sử dụng ngay, không cần mua thêm."),
    ("HIỆU SUẤT CAO", "Bếp gang 2 tầng lửa, lửa mạnh và ổn định, làm bánh nhanh, chín đều."),
    ("CHẤT LIỆU BỀN BỈ", "Inox 304 cao cấp, chống gỉ sét, an toàn thực phẩm, dễ vệ sinh."),
    ("DỄ DÀNG SỬ DỤNG", "Dụng cụ đúng chuẩn, thiết kế phù hợp, người mới cũng làm được."),
    ("CHI PHÍ HỢP LÝ", "Đầu tư thấp, phù hợp khởi nghiệp nhỏ, dễ kiểm soát vốn ban đầu."),
    ("SẴN SÀNG KINH DOANH", "Setup xong là bán được tại nhà, vỉa hè hoặc trước cổng trường."),
]
brows = []
for i in range(0, 6, 2):
    r = []
    for a, b in ben[i:i+2]:
        r.append(Paragraph("<font name='DVSB' size='9.5' color='#1a2b5f'>▸ %s</font><br/>"
                           "<font size='8.5'>%s</font>" % (a, b), st("b", fontSize=8.5, leading=12)))
    brows.append(r)
bt = Table(brows, colWidths=[CW/2]*2)
bt.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
    ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
    ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
    ("LINEBELOW",(0,0),(-1,-2),0.4,colors.HexColor("#dde3ef")),
    ("BACKGROUND",(0,0),(-1,-1),LIGHT),("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#d8deeb"))]))
story += [KeepTogether(bt), Spacer(1, 4*mm)]

# IV. Đặt hàng
pay = [Paragraph("IV. ĐẶT HÀNG &amp; THANH TOÁN", s_h), Spacer(1, 2*mm),
  Paragraph("• Đặt cọc: <b>200.000 VNĐ</b> để xác nhận đơn và giữ ưu đãi.<br/>"
            "• Phần còn lại: thanh toán theo phương thức giao hàng được công ty xác nhận khi lên đơn.<br/>"
            "• Quy trình: Gửi họ tên + số điện thoại + địa chỉ → Đặt cọc → Công ty xác nhận đơn → "
            "Đóng gói &amp; gửi hàng → Khách kiểm tra hàng → Thanh toán phần còn lại.<br/>"
            "• Lưu ý: Gói này <b>chưa bao gồm xe bán hàng</b>. Khách cần có sẵn xe đẩy, quầy, ki-ốt hoặc bàn chắc chắn để đặt bếp. "
            "Nếu cần điểm bán đồng bộ ngay từ đầu, tham khảo <b>Gói Xe Chuyên Nghiệp 21.900.000 VNĐ</b>.",
            st("p1x", fontSize=9.5, leading=15)), Spacer(1, 3*mm)]
bank = Table([[Paragraph(
    "<font name='DVSB' color='#1a2b5f'>THÔNG TIN CHUYỂN KHOẢN (chỉ dùng tài khoản công ty)</font><br/>"
    "Ngân hàng: <b>VietinBank</b> · Số tài khoản: <b>116003043089</b><br/>"
    "Chủ tài khoản: <b>CT TNHH TM SX XUAT NHAP KHAU THUAN TIN</b><br/>"
    "Nội dung: <i>[Họ tên] + [SĐT] cọc Gói Bếp</i>", st("bk", fontSize=9.5, leading=14))]], colWidths=[CW])
bank.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT),("BOX",(0,0),(-1,-1),0.8,NAVY),
    ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8),("LEFTPADDING",(0,0),(-1,-1),10)]))
pay += [bank, Spacer(1, 2.5*mm),
        Paragraph("Ghi chú: Báo giá chưa bao gồm phí vận chuyển (tính theo khu vực thực tế, báo cụ thể khi lên đơn). "
                  "Gói bao gồm đào tạo online từ A-Z, công thức bánh và hỗ trợ kỹ thuật trong quá trình bán.", s_small)]
story.append(KeepTogether(pay))
story.append(Spacer(1, 3.5*mm))

# Cam kết dịch vụ
svc = Table([[
    Paragraph("<font name='DVSB' size='9' color='#f6b21b'>HÀNG CHUẨN CHẤT LƯỢNG</font><br/><font size='8' color='#ffffff'>Bền bỉ - An toàn</font>", s_nc),
    Paragraph("<font name='DVSB' size='9' color='#f6b21b'>HƯỚNG DẪN SỬ DỤNG</font><br/><font size='8' color='#ffffff'>Chi tiết, dễ hiểu</font>", s_nc),
    Paragraph("<font name='DVSB' size='9' color='#f6b21b'>HỖ TRỢ TƯ VẤN</font><br/><font size='8' color='#ffffff'>Nhiệt tình, dài lâu</font>", s_nc),
    Paragraph("<font name='DVSB' size='9' color='#f6b21b'>GIAO HÀNG TOÀN QUỐC</font><br/><font size='8' color='#ffffff'>Nhanh chóng</font>", s_nc),
]], colWidths=[CW/4]*4)
svc.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),NAVY),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
    ("LINEAFTER",(0,0),(-2,-1),0.5,colors.HexColor("#3a4a7f")),
    ("TEXTCOLOR",(0,0),(-1,-1),colors.white)]))
for c in range(4):
    svc.setStyle(TableStyle([("BACKGROUND",(c,0),(c,0),NAVY)]))
story += [svc, Spacer(1, 4*mm)]

sig = Table([
    [Paragraph("XÁC NHẬN KHÁCH HÀNG", st("s1", fontName="DVSB", fontSize=9.5, alignment=TA_CENTER)),
     Paragraph("CHUYÊN VIÊN TƯ VẤN", st("s2", fontName="DVSB", fontSize=9.5, alignment=TA_CENTER))],
    [Paragraph("(Ký, ghi rõ họ tên)", st("s3", fontSize=8, textColor=GREY, alignment=TA_CENTER)),
     Paragraph("(Ký, ghi rõ họ tên)", st("s4", fontSize=8, textColor=GREY, alignment=TA_CENTER))],
    [Spacer(1, 10*mm), Spacer(1, 10*mm)],
    [Paragraph("", s_nc), Paragraph("Huỳnh Ngọc Thuận", st("s5", fontName="DVSB", fontSize=10, alignment=TA_CENTER))],
], colWidths=[CW/2]*2)
sig.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
story.append(KeepTogether(sig))

doc.build(story)
print("OK", OUT)
