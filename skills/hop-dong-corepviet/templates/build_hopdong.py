# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = "/sessions/relaxed-sharp-bell/mnt/outputs/hopdong/HOP-DONG-PHAN-PHOI-CO-REP-VIET-2026.docx"
doc = Document()

sec = doc.sections[0]
sec.top_margin = Cm(2); sec.bottom_margin = Cm(2)
sec.left_margin = Cm(2.5); sec.right_margin = Cm(2)

st = doc.styles['Normal']
st.font.name = 'Times New Roman'
st.font.size = Pt(12)
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Times New Roman')
st.paragraph_format.space_after = Pt(4)
st.paragraph_format.line_spacing = 1.15

def P(text="", bold=False, align='left', size=12, italic=False, space_before=0, space_after=4, indent=None):
    p = doc.add_paragraph()
    p.alignment = {'left':WD_ALIGN_PARAGRAPH.LEFT,'center':WD_ALIGN_PARAGRAPH.CENTER,
                   'right':WD_ALIGN_PARAGRAPH.RIGHT,'just':WD_ALIGN_PARAGRAPH.JUSTIFY}[align]
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    if indent: p.paragraph_format.left_indent = Cm(indent)
    r = p.add_run(text); r.bold = bold; r.italic = italic; r.font.size = Pt(size)
    r.font.name = 'Times New Roman'
    return p

def ART(title):
    P(title, bold=True, size=12.5, space_before=10, space_after=5)

def BUL(text, indent=0.6):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(indent)
    p.paragraph_format.space_after = Pt(3)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run("- " + text); r.font.size = Pt(12); r.font.name='Times New Roman'
    return p

def LINE():
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2)
    pPr = p._p.get_or_add_pPr(); pbdr = OxmlElement('w:pBdr'); b = OxmlElement('w:bottom')
    b.set(qn('w:val'),'single'); b.set(qn('w:sz'),'6'); b.set(qn('w:color'),'999999')
    pbdr.append(b); pPr.append(pbdr)

# ===== HEADER =====
P("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold=True, align='center', size=12)
P("Độc lập - Tự do - Hạnh phúc", bold=True, align='center', size=12)
P("---------------o0o---------------", align='center', size=11, space_after=10)
P("Số: ......../2026/HĐPP-CRV", align='right', size=11, space_after=10)

P("HỢP ĐỒNG PHÂN PHỐI HÀNG HÓA", bold=True, align='center', size=15, space_after=2)
P("(Nguyên vật liệu, vật tư hệ thống Cờ Rếp Việt)", italic=True, align='center', size=11, space_after=10)

P("Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;", size=11.5)
P("Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/6/2005;", size=11.5)
P("Căn cứ Luật An toàn thực phẩm số 55/2010/QH12 ngày 17/6/2010;", size=11.5)
P("Căn cứ Luật Sở hữu trí tuệ hiện hành và các văn bản hướng dẫn thi hành;", size=11.5)
P("Căn cứ nhu cầu và khả năng của hai Bên,", size=11.5, space_after=8)

P("Hôm nay, ngày ....... tháng ....... năm 2026, tại Thành phố Hồ Chí Minh, chúng tôi gồm:",
  align='just', space_after=8)

# ===== PARTIES =====
P("BÊN A (BÊN CUNG CẤP):", bold=True, space_before=4)
P("CÔNG TY TNHH THƯƠNG MẠI - SẢN XUẤT - XUẤT NHẬP KHẨU THUẬN TÍN", bold=True, indent=0.5)
P("Chủ sở hữu và vận hành thương hiệu CỜ RẾP VIỆT", italic=True, size=11, indent=0.5)
for t in ["Mã số doanh nghiệp/Mã số thuế: 0319348507",
          "Địa chỉ trụ sở: 537/173/36 Đường Tô Ngọc Vân, Phường Thới An, Thành phố Hồ Chí Minh",
          "Người đại diện theo pháp luật: Ông HUỲNH NGỌC THUẬN            Chức vụ: Giám đốc",
          "Điện thoại: 0981 224 978                    Website: www.corepviet.com",
          "Tài khoản: 116003043089 - Ngân hàng TMCP Công Thương Việt Nam (VietinBank)",
          "Chủ tài khoản: CT TNHH TM SX XUAT NHAP KHAU THUAN TIN"]:
    P(t, indent=0.5, size=11.5, space_after=2)

P("BÊN B (BÊN PHÂN PHỐI):", bold=True, space_before=8)
for t in ["Ông/Bà (hoặc Hộ kinh doanh/Công ty): ...........................................................................",
          "Số CCCD/Mã số thuế: ...................................  Ngày cấp: ................  Nơi cấp: ........................",
          "Địa chỉ thường trú: ......................................................................................................",
          "Địa điểm kinh doanh đăng ký: ......................................................................................",
          "Người đại diện (nếu Bên B là tổ chức): ..............................  Chức vụ: ..............................",
          "Điện thoại: ...................................  Email: ..................................................................."]:
    P(t, indent=0.5, size=11.5, space_after=2)

P("Sau khi bàn bạc, hai Bên thống nhất ký kết Hợp đồng phân phối hàng hóa (sau đây gọi là \"Hợp đồng\") "
  "với các điều khoản sau:", align='just', space_before=8, space_after=6)

# ===== ĐIỀU 1 =====
ART("ĐIỀU 1. GIẢI THÍCH TỪ NGỮ")
BUL("\"Hàng hóa\": nguyên vật liệu, vật tư, bao bì mang thương hiệu Cờ Rếp Việt hoặc do Bên A cung cấp, được liệt kê tại Phụ lục 01 đính kèm Hợp đồng.")
BUL("\"Bảng giá\": bảng giá phân phối tại Phụ lục 01, là bộ phận không tách rời của Hợp đồng.")
BUL("\"Điểm bán\": địa điểm kinh doanh của Bên B ghi tại phần thông tin Bên B hoặc tại Phụ lục 02 (nếu có).")
BUL("\"Thương hiệu\": nhãn hiệu, logo, hình ảnh nhận diện, bộ nhận diện thương hiệu \"CỜ RẾP VIỆT\" thuộc quyền sở hữu của Bên A.")

# ===== ĐIỀU 2 =====
ART("ĐIỀU 2. ĐỐI TƯỢNG VÀ BẢN CHẤT HỢP ĐỒNG")
P("2.1. Bên A đồng ý bán và Bên B đồng ý mua Hàng hóa theo Bảng giá tại Phụ lục 01 để Bên B phân phối, "
  "sử dụng và bán lại tại Điểm bán của Bên B.", align='just')
P("2.2. Hai Bên xác nhận rõ: đây là quan hệ MUA BÁN HÀNG HÓA (mua đứt bán đoạn). Hàng hóa thuộc quyền "
  "sở hữu của Bên B kể từ thời điểm hoàn tất giao nhận và thanh toán. Bên B tự định giá bán lẻ, tự chịu "
  "lãi/lỗ và mọi rủi ro kinh doanh.", align='just', bold=False)
P("2.3. Hợp đồng này KHÔNG phải hợp đồng đại lý thương mại theo Điều 166 và các điều khoản liên quan của "
  "Luật Thương mại 2005. Bên B không phải là đại lý, không hưởng thù lao đại lý, không nhân danh Bên A "
  "trong bất kỳ giao dịch nào và không được tạo ra nghĩa vụ ràng buộc đối với Bên A.", align='just')
P("2.4. Bên B được sử dụng danh xưng \"Điểm bán thuộc hệ thống Cờ Rếp Việt\" trong phạm vi Điều 10.",
  align='just')

# ===== ĐIỀU 3 =====
ART("ĐIỀU 3. GIÁ, BẢNG GIÁ VÀ ĐIỀU CHỈNH GIÁ")
P("3.1. Giá Hàng hóa áp dụng theo Bảng giá tại Phụ lục 01. Giá đã bao gồm thuế giá trị gia tăng (VAT), "
  "chưa bao gồm chi phí vận chuyển (trừ trường hợp được miễn theo Điều 6).", align='just')
P("3.2. Bên A có quyền điều chỉnh Bảng giá và phải thông báo cho Bên B bằng văn bản, email, tin nhắn Zalo "
  "hoặc phương tiện điện tử khác trước tối thiểu 15 (mười lăm) ngày. Đơn hàng đã được Bên A xác nhận trước "
  "ngày giá mới có hiệu lực vẫn áp dụng giá cũ.", align='just')
P("3.3. Bảng giá được cập nhật bằng Phụ lục sửa đổi có chữ ký của hai Bên hoặc bằng thông báo của Bên A "
  "được Bên B xác nhận qua phương tiện điện tử; không cần ký lại toàn bộ Hợp đồng.", align='just')

# ===== ĐIỀU 4 =====
ART("ĐIỀU 4. ĐẶT HÀNG, GIAO NHẬN VÀ CHUYỂN RỦI RO")
P("4.1. Bên B đặt hàng bằng văn bản, email, điện thoại hoặc tin nhắn Zalo. Đơn hàng chỉ có hiệu lực khi "
  "được Bên A xác nhận.", align='just')
P("4.2. Giá trị đơn hàng tối thiểu: 3.000.000 VNĐ (ba triệu đồng) cho mỗi lần đặt.", align='just')
P("4.3. Bên A giao hàng chậm nhất sau 01-02 ngày làm việc kể từ khi xác nhận đơn hàng và nhận đủ thanh "
  "toán, không tính ngày lễ, Tết và Chủ nhật. Trường hợp thiếu hàng hoặc nguyên nhân khách quan, Bên A "
  "thông báo và thống nhất lại thời gian giao với Bên B.", align='just')
P("4.4. Địa điểm giao nhận: tại Điểm bán của Bên B hoặc tại nhà xe/chành xe do hai Bên thống nhất.",
  align='just')
P("4.5. Bên B có trách nhiệm kiểm tra số lượng, quy cách và tình trạng Hàng hóa ngay khi nhận. Quyền sở "
  "hữu và rủi ro đối với Hàng hóa được chuyển từ Bên A sang Bên B kể từ thời điểm hoàn tất giao nhận. "
  "Khiếu nại về số lượng, bao bì rách vỡ phải được lập trong vòng 24 giờ kể từ khi nhận hàng, kèm hình ảnh.",
  align='just')
P("4.6. Bên A cam kết giao Hàng hóa thuộc lô sản xuất mới nhất tại thời điểm giao, còn nguyên bao bì, "
  "nhãn mác và còn hạn sử dụng theo quy định.", align='just')

# ===== ĐIỀU 5 =====
ART("ĐIỀU 5. PHƯƠNG THỨC THANH TOÁN")
P("5.1. Bên B thanh toán 100% giá trị đơn hàng cho Bên A ngay khi đặt hàng, bằng chuyển khoản hoặc tiền mặt.",
  align='just')
P("5.2. Mọi khoản thanh toán bằng chuyển khoản phải được thực hiện vào tài khoản của Bên A ghi tại phần "
  "thông tin Bên A. Bên A không chịu trách nhiệm đối với khoản tiền Bên B chuyển vào tài khoản cá nhân "
  "hoặc tài khoản khác không được Bên A công bố bằng văn bản.", align='just')
P("5.3. Đơn hàng chỉ được đưa vào xử lý sau khi Bên A xác nhận đã nhận đủ tiền.", align='just')
P("5.4. Bên A xuất hóa đơn giá trị gia tăng theo quy định pháp luật khi Bên B có yêu cầu và cung cấp đủ "
  "thông tin xuất hóa đơn.", align='just')

# ===== ĐIỀU 6 =====
ART("ĐIỀU 6. CHÍNH SÁCH HỖ TRỢ CỦA BÊN A")
BUL("Bên B được mua Hàng hóa theo Bảng giá phân phối tại Phụ lục 01.")
BUL("Chương trình 10 + 1: mua 10 (mười) túi bột làm bánh Cờ Rếp được tặng 01 (một) túi cùng loại. Chương trình áp dụng theo chính sách tại thời điểm đặt hàng.")
BUL("Miễn phí vận chuyển theo khu vực địa lý như sau:")
P("+ Khu vực 1 (miền Tây, miền Đông Nam Bộ, Tây Nguyên và các tỉnh từ Bình Định trở vào): "
  "miễn phí vận chuyển với đơn hàng có giá trị từ 4.000.000 VNĐ trở lên.", align='just', indent=1.1, size=11.5, space_after=3)
P("+ Khu vực 2 (các tỉnh, thành phố ngoài Khu vực 1): miễn phí vận chuyển với đơn hàng có giá trị "
  "từ 6.000.000 VNĐ trở lên.", align='just', indent=1.1, size=11.5, space_after=3)
P("+ Đơn hàng không đạt mức miễn phí tương ứng: Bên B thanh toán chi phí vận chuyển thực tế theo "
  "biểu phí của đơn vị vận chuyển tại thời điểm giao hàng.", align='just', indent=1.1, size=11.5, space_after=3)
BUL("Hỗ trợ tư vấn kỹ thuật, công thức, vận hành điểm bán và xử lý sự cố trong quá trình kinh doanh.")
BUL("Cung cấp hình ảnh, ấn phẩm nhận diện thương hiệu để Bên B sử dụng đúng mục đích theo Điều 10.")
P("Các chính sách hỗ trợ trên có thể được Bên A điều chỉnh theo từng thời kỳ và được thông báo trước "
  "tối thiểu 15 ngày theo cơ chế tại khoản 3.2.", align='just', size=11.5, italic=True)

# ===== ĐIỀU 7 =====
ART("ĐIỀU 7. CHỈ TIÊU DOANH SỐ")
P("7.1. Chỉ tiêu doanh số tối thiểu của Bên B: 3.000.000 VNĐ/tháng (ba triệu đồng mỗi tháng), được ghi "
  "nhận theo tổng giá trị đơn hàng Bên B đã thanh toán cho Bên A trong tháng.",
  align='just')
P("7.2. Việc đạt chỉ tiêu doanh số là điều kiện để Bên A xem xét gia hạn Hợp đồng và duy trì các chính "
  "sách hỗ trợ tại Điều 6.", align='just')
P("7.3. Trường hợp Bên B không phát sinh đơn hàng liên tục trong 03 (ba) tháng, Bên A có quyền đơn phương "
  "chấm dứt Hợp đồng theo khoản 14.3 mà không phải bồi thường.", align='just')

# ===== ĐIỀU 8 =====
ART("ĐIỀU 8. QUYỀN VÀ NGHĨA VỤ CỦA BÊN A")
P("8.1. Nghĩa vụ của Bên A:", bold=True, size=12)
BUL("Cung cấp Hàng hóa đúng chủng loại, số lượng, chất lượng và thời gian đã thỏa thuận.")
BUL("Chịu trách nhiệm về chất lượng, nguồn gốc xuất xứ và tính hợp pháp của Hàng hóa do mình cung cấp; bảo đảm Hàng hóa đáp ứng quy định pháp luật về an toàn thực phẩm.")
BUL("Thu hồi, đổi hoặc hoàn tiền đối với Hàng hóa bị lỗi do nhà sản xuất theo Điều 12.")
BUL("Thông báo trước 15 ngày khi thay đổi giá, chính sách hỗ trợ hoặc chương trình khuyến mại.")
BUL("Thực hiện đầy đủ chính sách hỗ trợ tại Điều 6 khi Bên B tuân thủ Hợp đồng.")
BUL("Hỗ trợ đào tạo, tư vấn kỹ thuật và vận hành cho Bên B theo chính sách hệ thống.")
P("8.2. Quyền của Bên A:", bold=True, size=12, space_before=4)
BUL("Yêu cầu Bên B thanh toán đầy đủ, đúng hạn.")
BUL("Kiểm tra, giám sát việc sử dụng Thương hiệu, chất lượng vận hành và mức độ tuân thủ tiêu chuẩn hệ thống tại Điểm bán của Bên B, sau khi thông báo trước cho Bên B.")
BUL("Từ chối hoặc tạm dừng cung cấp Hàng hóa nếu Bên B vi phạm nghĩa vụ thanh toán hoặc vi phạm Điều 9, Điều 10, Điều 11.")
BUL("Phát triển thêm điểm bán, đại lý, nhà phân phối khác theo Điều 13.")

# ===== ĐIỀU 9 =====
ART("ĐIỀU 9. QUYỀN VÀ NGHĨA VỤ CỦA BÊN B")
P("9.1. Nghĩa vụ của Bên B:", bold=True, size=12)
BUL("Thanh toán đầy đủ, đúng hạn theo Điều 5.")
BUL("Kiểm tra Hàng hóa khi nhận và chịu trách nhiệm về Hàng hóa sau khi hoàn tất giao nhận.")
BUL("Tự đăng ký kinh doanh, tự thực hiện nghĩa vụ thuế và các nghĩa vụ pháp lý khác đối với hoạt động kinh doanh của mình theo quy định pháp luật.")
BUL("Tuân thủ pháp luật về an toàn thực phẩm: bảo đảm điều kiện vệ sinh tại Điểm bán, bảo quản nguyên liệu đúng hướng dẫn của Bên A, không sử dụng nguyên liệu quá hạn hoặc không rõ nguồn gốc.")
BUL("KHÔNG pha trộn, thay thế, đóng gói lại Hàng hóa mang Thương hiệu của Bên A; không sử dụng bao bì, nhãn mác của Bên A cho sản phẩm không do Bên A cung cấp.")
BUL("KHÔNG sản xuất, sao chép công thức, quy trình kỹ thuật hoặc bộ nhận diện của Bên A dưới bất kỳ hình thức nào.")
BUL("Bảo vệ hình ảnh, uy tín Thương hiệu CỜ RẾP VIỆT trong suốt thời hạn Hợp đồng; không có hành vi làm tổn hại uy tín hệ thống.")
BUL("Bảo mật nội dung Hợp đồng, Bảng giá, tài liệu đào tạo và bí quyết kỹ thuật theo Điều 11.")
BUL("Thông báo cho Bên A khi thay đổi Điểm bán, thông tin liên hệ hoặc tư cách pháp lý.")
BUL("Chịu hoàn toàn trách nhiệm trước khách hàng và cơ quan nhà nước đối với hoạt động kinh doanh, chất lượng thành phẩm do Bên B chế biến và bán ra tại Điểm bán.")
P("9.2. Quyền của Bên B:", bold=True, size=12, space_before=4)
BUL("Được mua Hàng hóa theo Bảng giá phân phối và hưởng các chính sách hỗ trợ tại Điều 6.")
BUL("Được sử dụng Thương hiệu trong phạm vi Điều 10.")
BUL("Được Bên A hỗ trợ kỹ thuật, đào tạo và tư vấn vận hành.")
BUL("Tự quyết định giá bán lẻ tại Điểm bán. Bên A có thể đưa ra giá bán lẻ khuyến nghị nhằm bảo đảm tính đồng bộ của hệ thống; giá khuyến nghị không mang tính bắt buộc.")
BUL("Yêu cầu Bên A đổi/hoàn Hàng hóa bị lỗi do nhà sản xuất theo Điều 12.")

# ===== ĐIỀU 10 =====
ART("ĐIỀU 10. QUYỀN SỞ HỮU TRÍ TUỆ VÀ SỬ DỤNG THƯƠNG HIỆU")
P("10.1. Thương hiệu \"CỜ RẾP VIỆT\", logo, bộ nhận diện, hình ảnh, công thức, tài liệu đào tạo và mọi "
  "tài sản trí tuệ liên quan thuộc quyền sở hữu duy nhất của Bên A.", align='just')
P("10.2. Bên A cho phép Bên B sử dụng Thương hiệu một cách KHÔNG ĐỘC QUYỀN, KHÔNG ĐƯỢC CHUYỂN GIAO LẠI, "
  "chỉ giới hạn tại Điểm bán đã đăng ký và chỉ nhằm mục đích phân phối Hàng hóa của Bên A trong thời hạn "
  "Hợp đồng.", align='just')
P("10.3. Bên B không được: đăng ký nhãn hiệu, tên miền, tài khoản mạng xã hội trùng hoặc tương tự gây "
  "nhầm lẫn với Thương hiệu; sử dụng Thương hiệu cho sản phẩm/dịch vụ khác; chuyển giao quyền sử dụng "
  "Thương hiệu cho bên thứ ba.", align='just')
P("10.4. Khi Hợp đồng chấm dứt, Bên B phải chấm dứt ngay việc sử dụng Thương hiệu, tháo gỡ toàn bộ biển "
  "hiệu, decal, ấn phẩm nhận diện trong vòng 15 (mười lăm) ngày kể từ ngày chấm dứt.", align='just')

# ===== ĐIỀU 11 =====
ART("ĐIỀU 11. BẢO MẬT")
P("11.1. Hai Bên cam kết bảo mật nội dung Hợp đồng, Bảng giá, chính sách hỗ trợ, tài liệu đào tạo, công "
  "thức, quy trình kỹ thuật và thông tin khách hàng của Bên kia.", align='just')
P("11.2. Nghĩa vụ bảo mật có hiệu lực trong thời hạn Hợp đồng và tiếp tục có hiệu lực 02 (hai) năm sau "
  "khi Hợp đồng chấm dứt.", align='just')
P("11.3. Trong thời hạn Hợp đồng và 06 (sáu) tháng kể từ ngày chấm dứt, Bên B không sử dụng công thức, "
  "bí quyết kỹ thuật, tài liệu do Bên A cung cấp để sản xuất, kinh doanh sản phẩm cùng loại dưới thương "
  "hiệu khác hoặc cung cấp cho bên thứ ba.", align='just')

# ===== ĐIỀU 12 =====
ART("ĐIỀU 12. CHẤT LƯỢNG, BẢO QUẢN VÀ ĐỔI TRẢ")
P("12.1. Bên A chịu trách nhiệm đối với Hàng hóa bị lỗi do nhà sản xuất (hư hỏng, biến chất, sai quy cách, "
  "hết hạn sử dụng tại thời điểm giao). Bên A thực hiện đổi hàng hoặc hoàn tiền theo giá trị Hàng hóa lỗi.",
  align='just')
P("12.2. Bên A KHÔNG chịu trách nhiệm đối với Hàng hóa hư hỏng do: bảo quản sai hướng dẫn, để quá hạn sử "
  "dụng sau khi nhận, tác động bên ngoài, hoặc do lỗi vận hành của Bên B.", align='just')
P("12.3. Thời hạn khiếu nại chất lượng: 07 (bảy) ngày kể từ ngày nhận hàng đối với lỗi có thể phát hiện "
  "bằng mắt thường; đối với lỗi ẩn tỳ, trong vòng 07 ngày kể từ ngày phát hiện nhưng không quá thời hạn "
  "sử dụng của Hàng hóa. Khiếu nại phải kèm hình ảnh, thông tin lô hàng và chứng từ giao nhận.", align='just')
P("12.4. Hàng hóa không thuộc diện đổi trả nếu đã được Bên B mở, sử dụng một phần, trừ trường hợp lỗi ẩn "
  "tỳ được Bên A xác nhận.", align='just')

# ===== ĐIỀU 13 =====
ART("ĐIỀU 13. PHẠM VI PHÂN PHỐI")
P("13.1. Hợp đồng này KHÔNG trao cho Bên B quyền phân phối độc quyền tại bất kỳ khu vực địa lý nào.",
  align='just')
P("13.2. Bên A có toàn quyền phát triển thêm điểm bán, nhà phân phối, đại lý hoặc kênh bán hàng khác "
  "tại bất kỳ địa bàn nào, kể cả địa bàn Bên B đang hoạt động, mà không phải bồi thường cho Bên B.",
  align='just')
P("13.3. Trường hợp hai Bên có thỏa thuận riêng về quyền độc quyền khu vực, thỏa thuận đó phải được lập "
  "thành Phụ lục có chữ ký của hai Bên.", align='just')

# ===== ĐIỀU 14 =====
ART("ĐIỀU 14. THỜI HẠN, GIA HẠN VÀ CHẤM DỨT HỢP ĐỒNG")
P("14.1. Thời hạn Hợp đồng: 12 (mười hai) tháng, kể từ ngày ...... tháng ...... năm 2026 đến ngày "
  "...... tháng ...... năm 2027.", align='just')
P("14.2. Hợp đồng được tự động gia hạn từng kỳ 12 tháng nếu trước ngày hết hạn 30 ngày không Bên nào có "
  "văn bản yêu cầu chấm dứt, và Bên B đã hoàn thành nghĩa vụ thanh toán cũng như chỉ tiêu doanh số tại "
  "Điều 7.", align='just')
P("14.3. Hợp đồng chấm dứt trong các trường hợp:", align='just')
BUL("Hết thời hạn mà không gia hạn.")
BUL("Hai Bên thỏa thuận chấm dứt bằng văn bản.")
BUL("Một Bên đơn phương chấm dứt bằng thông báo trước 30 (ba mươi) ngày bằng văn bản.")
BUL("Bên A đơn phương chấm dứt ngay lập tức, không cần báo trước, khi Bên B: vi phạm Điều 9 khoản 9.1 về pha trộn/đóng gói lại/sao chép; vi phạm Điều 10 về sở hữu trí tuệ; vi phạm Điều 11 về bảo mật; hoặc có hành vi gây tổn hại nghiêm trọng uy tín Thương hiệu.")
BUL("Bên B không phát sinh đơn hàng liên tục 03 tháng theo khoản 7.3.")
BUL("Một Bên bị giải thể, phá sản hoặc mất năng lực hành vi dân sự.")
P("14.4. Khi Hợp đồng chấm dứt, hai Bên có nghĩa vụ đối chiếu và tất toán công nợ trong vòng 15 ngày. "
  "Bên B thực hiện nghĩa vụ tại khoản 10.4. Các nghĩa vụ tại Điều 10 và Điều 11 tiếp tục có hiệu lực "
  "sau khi Hợp đồng chấm dứt.", align='just')
P("14.5. Hai Bên xác nhận: do đây là quan hệ mua bán hàng hóa (không phải đại lý thương mại), việc chấm "
  "dứt Hợp đồng theo Điều này KHÔNG làm phát sinh nghĩa vụ bồi thường theo Điều 177 Luật Thương mại 2005.",
  align='just')

# ===== ĐIỀU 15 =====
ART("ĐIỀU 15. VI PHẠM HỢP ĐỒNG, PHẠT VÀ BỒI THƯỜNG")
P("15.1. Bên vi phạm nghĩa vụ Hợp đồng phải chịu phạt vi phạm với mức 8% (tám phần trăm) giá trị phần "
  "nghĩa vụ hợp đồng bị vi phạm, theo Điều 301 Luật Thương mại 2005.", align='just')
P("15.2. Ngoài phạt vi phạm, Bên vi phạm phải bồi thường toàn bộ thiệt hại thực tế, trực tiếp mà Bên bị "
  "vi phạm phải gánh chịu.", align='just')
P("15.3. Trường hợp Bên B vi phạm Điều 10 hoặc Điều 11, ngoài phạt và bồi thường, Bên A có quyền yêu cầu "
  "chấm dứt ngay hành vi vi phạm và áp dụng các biện pháp bảo vệ quyền sở hữu trí tuệ theo quy định pháp luật.",
  align='just')

# ===== ĐIỀU 16 =====
ART("ĐIỀU 16. BẤT KHẢ KHÁNG")
P("16.1. Bất khả kháng là sự kiện xảy ra khách quan, không thể lường trước và không thể khắc phục dù đã "
  "áp dụng mọi biện pháp cần thiết: thiên tai, dịch bệnh, hỏa hoạn, chiến tranh, đình công, thay đổi chính "
  "sách pháp luật, quyết định của cơ quan nhà nước có thẩm quyền.", align='just')
P("16.2. Bên gặp sự kiện bất khả kháng phải thông báo cho Bên kia trong vòng 07 ngày và được miễn trách "
  "nhiệm đối với phần nghĩa vụ bị ảnh hưởng. Nếu sự kiện kéo dài quá 60 ngày, mỗi Bên có quyền chấm dứt "
  "Hợp đồng sau khi tất toán công nợ.", align='just')

# ===== ĐIỀU 17 =====
ART("ĐIỀU 17. GIẢI QUYẾT TRANH CHẤP")
P("17.1. Mọi tranh chấp phát sinh được ưu tiên giải quyết bằng thương lượng, hòa giải trên tinh thần hợp "
  "tác trong vòng 30 ngày kể từ ngày một Bên có thông báo.", align='just')
P("17.2. Nếu thương lượng không thành, tranh chấp được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền "
  "tại Thành phố Hồ Chí Minh - nơi Bên A có trụ sở. Hai Bên xác nhận đây là thỏa thuận bằng văn bản về "
  "lựa chọn Tòa án theo quy định của Bộ luật Tố tụng dân sự 2015. Phán quyết của Tòa án là chung thẩm và "
  "buộc hai Bên thi hành.", align='just')
P("17.3. Bên thua kiện chịu án phí và chi phí hợp lý liên quan.", align='just')

# ===== ĐIỀU 18 =====
ART("ĐIỀU 18. ĐIỀU KHOẢN CHUNG")
P("18.1. Hai Bên thường xuyên thông báo cho nhau tình hình thực hiện Hợp đồng. Mọi sửa đổi, bổ sung phải "
  "được lập thành văn bản hoặc Phụ lục có chữ ký của hai Bên. Các Phụ lục, đơn hàng, chứng từ giao nhận và "
  "hóa đơn là bộ phận không tách rời của Hợp đồng.", align='just')
P("18.2. Thông báo giữa hai Bên được gửi qua văn bản, email hoặc Zalo tới địa chỉ/số liên hệ ghi tại Hợp "
  "đồng và được coi là đã nhận sau 24 giờ kể từ khi gửi thành công.", align='just')
P("18.3. Bên B không được chuyển nhượng quyền và nghĩa vụ theo Hợp đồng cho bên thứ ba nếu không có văn "
  "bản chấp thuận của Bên A.", align='just')
P("18.4. Nếu một điều khoản bất kỳ bị coi là vô hiệu, các điều khoản còn lại vẫn giữ nguyên hiệu lực.",
  align='just')
P("18.5. Hợp đồng gồm ...... trang và các Phụ lục đính kèm, được lập thành 02 (hai) bản có giá trị pháp "
  "lý như nhau, mỗi Bên giữ 01 (một) bản.", align='just')
P("18.6. Hợp đồng có hiệu lực kể từ ngày hai Bên cùng ký.", align='just')

# ===== SIGNATURES =====
doc.add_paragraph()
tb = doc.add_table(rows=2, cols=2)
tb.alignment = WD_TABLE_ALIGNMENT.CENTER
c1 = tb.cell(0,0).paragraphs[0]; c1.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = c1.add_run("ĐẠI DIỆN BÊN A"); r.bold=True; r.font.size=Pt(12); r.font.name='Times New Roman'
c2 = tb.cell(0,1).paragraphs[0]; c2.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = c2.add_run("ĐẠI DIỆN BÊN B"); r.bold=True; r.font.size=Pt(12); r.font.name='Times New Roman'
b1 = tb.cell(1,0).paragraphs[0]; b1.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = b1.add_run("(Ký, ghi rõ họ tên và đóng dấu)"); r.italic=True; r.font.size=Pt(10.5); r.font.name='Times New Roman'
tb.cell(1,0).add_paragraph(); tb.cell(1,0).add_paragraph(); tb.cell(1,0).add_paragraph()
pn = tb.cell(1,0).add_paragraph(); pn.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = pn.add_run("HUỲNH NGỌC THUẬN"); r.bold=True; r.font.size=Pt(12); r.font.name='Times New Roman'
b2 = tb.cell(1,1).paragraphs[0]; b2.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = b2.add_run("(Ký, ghi rõ họ tên)"); r.italic=True; r.font.size=Pt(10.5); r.font.name='Times New Roman'

# ===== PHỤ LỤC =====
doc.add_page_break()
P("PHỤ LỤC 01", bold=True, align='center', size=13.5)
P("BẢNG GIÁ PHÂN PHỐI NGUYÊN VẬT LIỆU HỆ THỐNG CỜ RẾP VIỆT", bold=True, align='center', size=12)
P("(Đính kèm và là bộ phận không tách rời Hợp đồng số ......../2026/HĐPP-CRV)",
  italic=True, align='center', size=11, space_after=10)

data = [("STT","Tên hàng hóa","ĐVT","Đơn giá (VNĐ)"),
        ("01","Giấy gói bánh (có màng)","Cái","990"),
        ("02","Bột làm bánh crepe (túi 1,2 kg)","Gói","65.000"),
        ("03","Bơ thực vật","Kg","69.000"),
        ("04","Sốt cam","Kg","77.000"),
        ("05","Sốt trắng","Kg","110.000"),
        ("06","Xúc xích Đức xông khói","Kg","110.000"),
        ("07","Mứt dâu tây (hộp 900 gr)","Hộp","145.000"),
        ("08","Cốm mix 5 màu","Kg","150.000"),
        ("09","Socola đen (hộp 1 kg)","Hộp","165.000"),
        ("10","Chà bông xù","Kg","190.000"),
        ("11","Phô mai mozzarella","Kg","210.000"),
        ("12","Thịt dăm bông thái sợi","Kg","230.000"),
        ("13","Ba rọi xông khói thái sợi","Kg","240.000")]
t = doc.add_table(rows=len(data), cols=4)
t.style = 'Table Grid'
t.alignment = WD_TABLE_ALIGNMENT.CENTER
widths = [Cm(1.6), Cm(8.6), Cm(2.2), Cm(3.6)]
for i,row in enumerate(data):
    for j,val in enumerate(row):
        cell = t.cell(i,j); cell.width = widths[j]
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if j==1 else WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(val); r.font.size = Pt(11); r.font.name='Times New Roman'
        if i==0: r.bold = True
        if i>0 and j==3: r.bold = True

P("", space_after=6)
P("Ghi chú:", bold=True, size=11.5, space_before=6)
BUL("Đơn giá trên đã bao gồm thuế giá trị gia tăng (VAT).")
BUL("Chương trình 10 + 1 áp dụng đối với bột làm bánh Cờ Rếp: mua 10 túi tặng 01 túi cùng loại.")
BUL("Miễn phí vận chuyển: đơn từ 4.000.000 VNĐ đối với miền Tây, miền Đông Nam Bộ, Tây Nguyên và các tỉnh từ Bình Định trở vào; đơn từ 6.000.000 VNĐ đối với các tỉnh, thành phố còn lại.")
BUL("Giá có thể thay đổi theo từng thời kỳ và theo số lượng đặt hàng; việc điều chỉnh giá thực hiện theo Điều 3 của Hợp đồng.")
BUL("Chính sách cung cấp nguyên liệu tươi áp dụng khác nhau theo khu vực địa lý, theo quy định hiện hành của Bên A.")

doc.add_paragraph()
tb2 = doc.add_table(rows=2, cols=2)
tb2.alignment = WD_TABLE_ALIGNMENT.CENTER
for idx,txt in enumerate(["ĐẠI DIỆN BÊN A","ĐẠI DIỆN BÊN B"]):
    p = tb2.cell(0,idx).paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(txt); r.bold=True; r.font.size=Pt(12); r.font.name='Times New Roman'
for idx in range(2):
    p = tb2.cell(1,idx).paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("(Ký, ghi rõ họ tên)"); r.italic=True; r.font.size=Pt(10.5); r.font.name='Times New Roman'
    tb2.cell(1,idx).add_paragraph(); tb2.cell(1,idx).add_paragraph()

doc.save(OUT)
print("OK", OUT)
