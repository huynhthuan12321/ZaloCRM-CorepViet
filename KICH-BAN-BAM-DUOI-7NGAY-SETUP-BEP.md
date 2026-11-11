# Kịch bản bám đuổi 7 ngày — Khách đã tư vấn Gói Khởi Nghiệp Bếp (chưa chốt)

> Kênh: Zalo cá nhân · Đối tượng: khách đã nghe tư vấn Gói Khởi Nghiệp Bếp (giá ưu đãi 3.890.000đ, niêm yết 4.990.000đ) nhưng chưa cọc.
> Công thức nền: PAS (retargeting audience ấm) + Funnel MOFU→BOFU. Tone: bạn bè thân mật, xưng "em", theo giọng FAQ chuẩn của Cờ Rếp Việt.
> Biến được hệ thống hỗ trợ: `{{ten}}`, `{{ten_khach}}`, `{{sdt}}`, `{{phone}}`.
> Chỗ đánh dấu `[CẦN DỮ LIỆU]` là phần anh phải bổ sung trước khi bật.

---

## A. Cấu hình Sequence (Luồng kịch bản)

Tên sequence: `Bám đuổi 7N - Setup Bếp - Sau tư vấn`

| Step | Khối | Delay (từ step trước) | Jitter | Điều kiện thoát |
|------|------|----------------------|--------|-----------------|
| 1 | BD-01 Cảm ơn + tóm tắt | 180 phút (3h sau tư vấn) | ±15 | Khách trả lời → thoát, sale tiếp quản |
| 2 | BD-02 Câu chuyện khách thật | 1.440 phút (ngày 1) | ±20 | Khách trả lời → thoát |
| 3 | BD-03 Gỡ nỗi sợ người mới | 1.440 phút (ngày 2) | ±20 | Khách trả lời → thoát |
| 4 | BD-04 Chi phí chờ đợi | 2.880 phút (ngày 4) | ±25 | Khách trả lời → thoát |
| 5 | BD-05 Cọc 200k chốt đơn | 2.880 phút (ngày 6) | ±25 | Khách trả lời → thoát |
| 6 | BD-06 Tin chia tay | 1.440 phút (ngày 7) | ±20 | Kết thúc luồng |

Runtime rules giữ mặc định hệ thống: khung giờ gửi 6h–22h, throttle theo nick, dừng khi khách phản hồi (`stopOnAccept`).

Tag chung cho 6 khối: `bam-duoi, setup-bep`. Loại khối: **Gửi tin nhắn**. Bật ✅ cả 6 khối.

---

## B. Nội dung 6 khối (mỗi khối 2 biến thể chống trùng)

### BD-01 · Ngày 0 (3h sau tư vấn) — Cảm ơn + tóm tắt + mở vòng tò mò

Tâm lý: Reciprocity, Open Loop. NLP: Presupposition ("khi mình bắt đầu").

**Biến thể 1**
> Dạ em cảm ơn {{ten}} đã dành thời gian nghe em chia sẻ về Gói Khởi Nghiệp Bếp nha 😊
> Em gửi lại mình thông tin chính để dễ xem: trọn bộ khung bếp inox 304 + bếp gang chuyên dụng + đầy đủ dụng cụ, kèm đào tạo online từ A-Z và hỗ trợ kỹ thuật trong quá trình bán. Giá ưu đãi hiện tại 3.890.000đ (niêm yết 4.990.000đ, mình tiết kiệm 1.100.000đ) ạ.
> Theo chương trình hiện tại còn được tặng 1 túi bột 1,2kg + máy đánh bột cầm tay + 50 giấy gói bánh nữa ạ.
> Mai em kể {{ten}} nghe chuyện một chị khách bán ngay tại nhà, cũng từng phân vân y như mình nha 😊

**Biến thể 2**
> Dạ em cảm ơn {{ten}} đã trao đổi với em nãy giờ nha 😊
> Em tóm gọn lại cho mình dễ nhớ: Gói Khởi Nghiệp Bếp giá ưu đãi 3.890.000đ (giá niêm yết 4.990.000đ) gồm đầy đủ bếp gang chuyên dụng, khung inox 304, dụng cụ làm bánh, đào tạo online từ A-Z và hỗ trợ kỹ thuật ạ.
> Chương trình hiện tại còn tặng kèm túi bột 1,2kg, máy đánh bột cầm tay và 50 giấy gói bánh. Em sẽ kiểm tra lại chương trình tại thời điểm mình lên đơn để xác nhận đầy đủ quyền lợi nha.
> {{ten}} cứ từ từ xem, có gì thắc mắc nhắn em bất cứ lúc nào ạ. Mai em gửi mình câu chuyện một khách mới toanh bắt đầu từ con số 0, hay lắm ạ 😊

Ảnh kèm: ảnh trọn bộ setup thực tế. `[CẦN DỮ LIỆU: link ảnh]`

---

### BD-02 · Ngày 1 — Câu chuyện khách thật (Social Proof)

Tâm lý: Identifiable Victim Effect, Social Proof. NLP: Future Pacing.

**Biến thể 1**
> {{ten}} ơi, em kể chuyện hôm qua em hứa nè 😊
> Chị Minh ở Phú Thọ, bán ngay tại nhà luôn ạ. Hiện mỗi ngày chị bán buổi sáng khoảng 75 cái, buổi chiều khoảng 50 cái, giá trung bình 20k/cái.
> Điều hay là chị không cần thuê mặt bằng, cứ đặt bếp trước cửa nhà bán thôi ạ. Tất nhiên mỗi khách kết quả mỗi khác tùy điểm bán và cách mình làm, nhưng khách quanh nhà mua lặp lại đều lắm ạ.
> Em gửi {{ten}} hình chị đang bán nha, mình xem cho dễ hình dung ạ 😊

**Biến thể 2**
> {{ten}} ơi, em gửi mình 2 câu chuyện có thật bên em nha 😊
> Anh Sang ở Đắk Lắk chọn bán ở công viên, sáng khoảng 110 cái, chiều đông hơn khoảng 150 cái. Còn chị Hà thì khéo lắm: đang có quán cà phê đối diện trường cấp 1, bán kèm thêm bánh, sáng khoảng 75 cái, chiều 45 cái ạ.
> Điểm chung của các khách bán tốt là chọn đúng điểm: gần trường học, công viên, khu đông người qua lại. Kết quả từng khách khác nhau tùy vị trí và cách làm, nhưng mô hình rất linh hoạt ạ.
> {{ten}} đang định bán ở khu vực nào, em tư vấn vị trí giúp mình luôn nha? 😊

Ảnh kèm: ảnh/clip khách thật đang bán. `[Anh tự chèn ảnh khi tạo khối — nhớ xin phép khách trước khi dùng]`

---

### BD-03 · Ngày 2 — Gỡ nỗi sợ "người mới làm không được"

Tâm lý: Cognitive Ease, Risk Reversal. NLP: Pacing & Leading.

**Biến thể 1**
> {{ten}} ơi, nhiều khách nói với em: "Chị chưa làm bánh bao giờ, sợ mua về rồi bỏ xó" 😊
> Em hiểu tâm lý đó lắm ạ. Nên gói bên em mới thiết kế riêng cho người mới: có công thức pha bột, video làm bánh từng bước, SOP vận hành và hỗ trợ online khi mình bán.
> Bánh crepe cũng là món dễ học nhất trong nhóm ăn vặt: học sinh sinh viên thích, dễ quay TikTok, giá bán dễ tiếp cận nên dễ bán lặp lại ạ.
> {{ten}} còn lo nhất điều gì, nhắn em để em giải đáp thẳng phần đó nha 😊

**Biến thể 2**
> {{ten}} nè, em gửi mình 3 câu khách hay hỏi nhất trước khi chốt nha 😊
> 1. "Chưa biết làm bánh có làm được không?" → Được ạ, có video từng bước + hỗ trợ online, đa số khách bên em đều bắt đầu từ số 0.
> 2. "Có cần mặt bằng lớn không?" → Không ạ, bán tại nhà, trước cửa, gần trường học đều được.
> 3. "Mua xong có được hỗ trợ tiếp không?" → Có ạ, bên em đồng hành vận hành chứ không chỉ bán thiết bị.
> Mình còn câu nào chưa được giải đáp không {{ten}}? 😊

---

### BD-04 · Ngày 4 — Chi phí của việc chờ đợi (PAS Agitate)

Tâm lý: Loss Aversion, Cost of Inaction, Negative Future Pacing. NLP: Embedded Command.

**Biến thể 1**
> {{ten}} ơi, em chia sẻ thật với mình một điều em thấy sau nhiều khách nha 😊
> Khách phân vân thêm 1-2 tháng thì cái mất không phải là tiền, mà là thời gian: mỗi tuần chưa bắt đầu là một tuần điểm bán đẹp gần nhà mình có thể có người khác nhảy vào trước. Chưa kể chương trình quà tặng (bột + máy đánh bột + giấy gói) áp dụng theo từng thời kỳ, em không giữ được lâu cho mình ạ.
> Sắp tới mùa tựu trường, khu gần trường học là thời điểm bán ăn vặt tốt nhất năm. Chuẩn bị từ bây giờ là vừa kịp ạ.
> {{ten}} có thể bắt đầu nhỏ trước, bán tại nhà để test, thấy ổn rồi mở rộng dần nha 😊

**Biến thể 2**
> {{ten}} nè, em hỏi mình một câu nhỏ nha 😊
> Nếu 2 tháng nữa nhìn lại mà mọi thứ vẫn y như bây giờ, mình có tiếc không ạ?
> Mô hình này vốn thấp, làm tại nhà được, nên rủi ro lớn nhất thật ra không phải là "làm mà thất bại", mà là "định làm hoài nhưng chưa bắt đầu" ạ.
> Bên em nhận hướng dẫn từ A-Z, {{ten}} chỉ cần quyết định bắt đầu thôi. Mình muốn em giữ ưu đãi tư vấn cho đợt này không ạ?

---

### BD-05 · Ngày 6 — Chốt bằng cọc 200k (Risk Reversal + BOFU)

Tâm lý: Risk Reversal, Foot-in-the-Door, Anchoring. NLP: Double Bind.

**Biến thể 1**
> {{ten}} ơi, em nhắc mình cơ chế đặt hàng bên em nè, nhẹ lắm ạ 😊
> Mình chỉ cần cọc 200.000đ vào tài khoản CÔNG TY để xác nhận đơn và giữ ưu đãi 3.890.000đ (thay vì giá niêm yết 4.990.000đ). Phần còn lại thanh toán khi nhận hàng theo phương thức giao nhận công ty xác nhận ạ.
> Giao dịch qua tài khoản công ty, có xác nhận đơn rõ ràng nên {{ten}} yên tâm tuyệt đối nha.
> {{ten}} muốn em lên đơn giao trong tuần này hay đầu tuần sau ạ? 😊

**Biến thể 2**
> Dạ {{ten}} ơi, em tóm lại để mình quyết cho dễ nha 😊
> Gói ưu đãi 3.890.000đ (tiết kiệm 1.100.000đ so với giá niêm yết), hôm nay mình chỉ cần cọc 200.000đ là bên em xác nhận đơn, giữ ưu đãi và chương trình quà tặng cho mình. Phần còn lại thanh toán khi nhận hàng ạ.
> Bên em giao toàn quốc, đóng gói chắc chắn, kèm đào tạo online từ A-Z để mình bắt đầu ngay ạ.
> Mình chốt cọc hôm nay để em xếp lịch giao sớm cho {{ten}} nha? Em gửi thông tin tài khoản công ty liền ạ 😊

**Tin gửi kèm khi khách đồng ý cọc (sale gửi tay, không đưa vào luồng tự động):**
> Dạ em gửi {{ten}} thông tin chuyển khoản CÔNG TY nha:
> Ngân hàng: VietinBank
> Số tài khoản: 116003043089
> Chủ tài khoản: CT TNHH TM SX XUAT NHAP KHAU THUAN TIN
> Nội dung CK: [Họ tên] + [SĐT] cọc Setup Bếp
> Mình chuyển xong chụp giúp em bill để em xác nhận đơn liền ạ 😊
> ⚠️ Lưu ý nội bộ: KHÔNG hướng dẫn khách chuyển vào tài khoản cá nhân.

---

### BD-06 · Ngày 7 — Tin "chia tay" (mở cửa quay lại)

Tâm lý: Peak-End Rule, Reverse Psychology nhẹ. Không gây áp lực, giữ thiện cảm dài hạn.

**Biến thể 1**
> {{ten}} ơi, chắc dạo này mình đang bận nên em xin phép không nhắn làm phiền mình thêm nha 😊
> Em chỉ muốn nói là: mô hình này không cần vội, nhưng lúc nào {{ten}} sẵn sàng khởi nghiệp thì em vẫn ở đây, tư vấn miễn phí cho mình từ chọn điểm bán đến vận hành ạ.
> Chúc {{ten}} nhiều sức khỏe, khi nào cần cứ nhắn "BẮT ĐẦU" là em hỗ trợ mình liền nha 😊

**Biến thể 2**
> Dạ {{ten}} nè, đây là tin cuối em chủ động nhắn, sau này em không làm phiền mình nữa nha 😊
> Nếu mình còn điều gì lấn cấn về gói Setup Bếp mà ngại hỏi, cứ nhắn thẳng cho em, em trả lời thật lòng kể cả khi câu trả lời là "mô hình này chưa hợp với mình" ạ.
> Còn nếu chỉ là chưa đúng thời điểm thì không sao hết, khi nào sẵn sàng {{ten}} nhắn em một tiếng nha. Em cảm ơn mình nhiều ạ 😊

---

## C. Trạng thái dữ liệu

Đã có đủ: giá (ưu đãi 3.890.000đ / niêm yết 4.990.000đ / cọc 200.000đ), quà tặng theo chương trình (túi bột 1,2kg + máy đánh bột + 50 giấy gói), 3 testimonial thật (chị Minh Phú Thọ, anh Sang Đắk Lắk, chị Hà), thông tin chuyển khoản công ty VietinBank.

Còn lại anh làm khi tạo khối:

1. **Ảnh**: chèn khi tạo khối — BD-01 ảnh trọn bộ setup, BD-02 ảnh/clip khách đang bán (xin phép khách trước khi dùng).
2. **Mốc "mùa tựu trường"** ở BD-04 hợp lệ đến hết tháng 8; sau đó thay bằng lý do thời điểm khác.

## Hướng dẫn gắn tag CRM (trả lời câu hỏi "tag phần nào?")

Có 2 loại tag khác nhau, đừng nhầm:

1. **Tag của KHỐI NỘI DUNG** — chính là ô "Tag (phân cách bằng dấu phẩy)" trong màn "Tạo khối nội dung" anh chụp. Điền `bam-duoi, setup-bep` cho cả 6 khối. Tag này chỉ để LỌC khối trong picker Broadcast/Luồng kịch bản, không liên quan đến khách.
2. **Tag của KHÁCH HÀNG (CRM tag)** — gắn trên hồ sơ khách (mở hội thoại khách → phần thông tin khách/tag). Tạo tag `da-tu-van-setup-bep` và quy định: sale tư vấn xong gói này thì gắn tag ngay. Tag này dùng để:
   - Lọc đúng tệp khách khi chạy Broadcast.
   - Làm điều kiện đưa khách vào luồng bám đuổi (hoặc sale gắn luồng thủ công cho khách ngay trong màn chat qua nút thêm luồng, sau buổi tư vấn).

Đề xuất thêm 2 tag vòng đời để đo hiệu quả: `dang-bam-duoi` (khi vào luồng) và `da-coc` (khi chốt) — khi khách cọc thì gỡ `dang-bam-duoi`.

## Quy tắc tuân thủ (theo 01_PRICING.md)

- Không cam kết doanh thu/lợi nhuận/thời gian hoàn vốn. Testimonial ở BD-02 đã kèm câu "kết quả mỗi khách mỗi khác" — giữ nguyên câu này, không cắt.
- Không tự giảm giá, không tự tạo khuyến mãi. Quà tặng luôn nói kèm "theo chương trình hiện tại".
- Gói KHÔNG gồm xe bán hàng — nếu khách hỏi, sale trả lời theo FAQ và giới thiệu Gói Setup Xe Chuyên Nghiệp 21.900.000đ.
- Chỉ nhận cọc vào tài khoản công ty (VietinBank 116003043089), không dùng tài khoản cá nhân.

## D. Lưu ý vận hành

- Khách trả lời ở bất kỳ bước nào → sequence tự thoát, sale phải tiếp quản trong ngày (nếu để nguội quá 24h thì hiệu quả kịch bản mất tác dụng).
- Nên tạo thêm 1 biến thể thứ 3 cho mỗi khối sau 2-3 tuần chạy để tránh Zalo đánh dấu tin trùng lặp hàng loạt.
- Theo dõi 2 chỉ số: tỷ lệ phản hồi theo từng bước (bước nào cao thì nhân bản góc content đó) và tỷ lệ cọc sau BD-05.
