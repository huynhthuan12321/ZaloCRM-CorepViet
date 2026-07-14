# Marketing — Thông tin & Yêu cầu review (đang thu thập)

> Ngày bắt đầu: 2026-07-13
> Trạng thái: **ĐANG THU THẬP** — chờ user gửi hết rồi nói **"xong"** mới bắt đầu so sánh/kiểm tra.
> Quy ước: mỗi lượt append; ảnh → transcribe (không nhúng ảnh).

---

## 1. Spec / yêu cầu do user cung cấp

### Lượt 1 — Spec "6. Marketing — Tự động hoá" (hướng dẫn chi tiết)

**Lưu ý bản Community (theo spec gốc):** menu Marketing bản Community **chỉ có 2 mục: Quét nhóm và Tệp khách hàng** (broadcast tới tệp thủ công). Các mục gắn 🔶 EE (Mục tiêu, Phiên chăm sóc, Luồng kịch bản, Khối nội dung, Broadcast tự động, Bot Auto…) là **Enterprise — bản Community KHÔNG có**.

**Bảng menu Marketing (spec):**
| Mục | Đường dẫn | Vai trò | Nhãn |
|---|---|---|---|
| Mục tiêu | `/marketing/triggers` | Chiến dịch kết bạn + bám đuổi theo Tệp KH | 🔶 EE |
| Phiên chăm sóc | `/marketing/care-sessions` | Theo dõi KH trong luồng bám đuổi | 🔶 EE |
| Luồng kịch bản | `/marketing/sequences` | Chuỗi khối nội dung gửi theo thời gian | 🔶 EE |
| Khối nội dung | `/marketing/blocks` | Hành động đơn tái sử dụng | 🔶 EE |
| Mẫu tin nhắn | `/marketing/templates` | Mẫu câu soạn sẵn chèn nhanh khi chat | (core) |
| Gửi tin hàng loạt | `/marketing/broadcasts` | Broadcast tới một tệp khách | 🔶 EE |
| Tệp khách hàng | `/marketing/lists` | Tệp KH nguồn (paste/Excel/Lead Ads) | (core) |
| Bám đuổi thủ công | `/marketing/manual-followup` | Sale gắn bám đuổi thủ công từ chat | 🔶 EE |

**Mô hình tổng:** Tạo Khối nội dung → ghép thành Luồng kịch bản → gắn vào Mục tiêu (chạy trên 1 Tệp KH) → KH qua luồng xuất hiện trong Phiên chăm sóc. Broadcast = gửi một lần tới cả tệp.

**Chi tiết từng mục (spec):**
- **6.1 Mục tiêu** (`/marketing/triggers`) 🔶EE: thẻ tổng (đang bật/khách vào/hoàn thành/tỉ lệ phản hồi); lọc trạng thái (Đang chạy/Tạm dừng/Hoàn thành/Hẹn lịch/Nháp/Đã xoá); bảng: tên/Tệp/Nick/Phase1(Mời KB)/Phase2(Bám đuổi)/Phản hồi/Trạng thái; **+ Tạo Mục tiêu mới → wizard nhiều bước** (chọn tệp, nick, luồng, giới hạn).
- **Bám đuổi thủ công** (`/marketing/manual-followup`) 🔶EE: KH được sale gắn từ chat; thẻ Tổng gắn tay/Đang chạy/Hoàn thành/Đã dừng/Tỉ lệ phản hồi.
- **6.2 Phiên chăm sóc** (`/marketing/care-sessions`) 🔶EE: thẻ (Vừa trả lời/Tạm dừng/Đang chăm sóc/Đã đóng); lọc; danh sách phiên (tên/SĐT/luồng/nick/tiến độ) + panel chi tiết bên phải; tab **Cài đặt lắng nghe**.
- **6.3 Luồng kịch bản** (`/marketing/sequences`) 🔶EE: thẻ luồng (tên/bước/công tắc); luật an toàn (Giãn đều giữa nick, Dừng khi kết bạn/trả lời); bộ đếm (Enroll/Hoàn thành/Lỗi/Đang chạy); **+ Tạo luồng**; thống kê `/sequences/:id/stats`.
- **6.4 Khối nội dung** (`/marketing/blocks`) 🔶EE: thư mục + tag; lọc loại (Mới kết bạn/Gửi tin/Đổi trạng thái); thẻ khối (tiêu đề/nội dung/số biến thể); **+ Tạo khối / thư mục**.
- **6.5 Mẫu tin nhắn** (`/marketing/templates`) core: slug (`//cskh`, `//camon`, `//baogia`, `//chao`); phân Dự án + thư mục; **+ Tạo mẫu**.
- **6.6 Gửi tin hàng loạt** (`/marketing/broadcasts`) 🔶EE: lọc (Đang chạy/Tạm dừng/Hoàn tất/Hẹn lịch/Nháp); bảng (tên/Tệp/Tiến độ 118/120/Tỷ lệ/Lỗi/Thời gian/Trạng thái); **+ Soạn broadcast → wizard `/marketing/broadcasts/tao-moi`** (chọn tệp/nội dung/nick/thời điểm).
- **6.7 Tệp khách hàng** (`/marketing/lists`) core: thẻ tổng (Tổng tệp/Lead Ads/Paste-File/SĐT/Có Zalo); lọc (Đang dùng/Lưu trữ/Tất cả); bảng entries; **+ Tạo tệp / Import CSV**; detail `/marketing/lists/:id`.

**Tài liệu con tham chiếu:** 6a (Mục tiêu & Phiên chăm sóc — wizard 4 bước, chi tiết, Cài đặt lắng nghe, Bám đuổi thủ công) · 6b (Luồng · Khối · Mẫu) · 6c (Broadcast · Tệp KH — wizard broadcast 4 bước, chi tiết, Tạo/Import tệp).

---

## 2. Ảnh đã nhận (transcribe)

### Lượt 1 — 5 ảnh app **"HS Holding CRM"** (org khác THUAN TIN IMEX; sidebar Marketing ĐẦY ĐỦ)

Sidebar Marketing (cả 5 ảnh): **Tạo Mục tiêu mới · Mục tiêu · Phiên chăm sóc · Luồng kịch bản · Khối nội dung · Mẫu tin nhắn · Gửi tin hàng loạt · Tệp khách hàng**. Footer: "Kênh: Zalo cá nhân".

- **Ảnh 1 — Luồng kịch bản:** "Chuỗi các Khối nội dung gửi theo thời gian + luật chạy an toàn". Nút **Tạo luồng**. 3 thẻ chuỗi: "Chuỗi tái kích hoạt KH cũ" (Chăm sóc định kỳ · 1 bước Gửi tin nhắn "Tin gửi ưu đãi/Ngay" · TẮT), "Chuỗi kết bạn & chào" (Kết bạn→chào hỏi · 2 bước: Gửi kết bạn "Kết bạn khách FB/Ngay" → Gửi tin nhắn "Tin chào lead mới/+2 giờ" · BẬT), "Chuỗi chăm sóc lead mới" (Chào→ưu đãi→nhắc chốt · BẬT). Chip luật: "Giãn đều giữa nick", "Dừng khi kết bạn". Bộ đếm: Đã enroll/Hoàn thành/Lỗi/Đang chạy = 0.

- **Ảnh 2 — Gửi tin hàng loạt:** "Gửi tin nhắn hàng loạt cho tệp khách hàng theo nhiều cách". Nút **Nhập từ Excel** + **Soạn broadcast**. Lọc: Tất cả 3 · Đang chạy 0 · Tạm dừng 0 · Hoàn tất 1 · Hẹn lịch 1 · Nháp 1. Nút Cập nhật. Bảng: cột #/Chiến dịch/Tệp khách/Tiến độ gửi/Tỷ lệ thành công/Lỗi/Thời gian/Trạng thái. 3 dòng: "Broadcast chào KH mới" (Bộ lọc tuỳ chỉnh · 0/0 · Gửi ngay 11/06 · **Nháp**), "Broadcast chốt cuối tuần" (0/80 · Hẹn lịch 13/06 · **Hẹn lịch**), "Broadcast ưu đãi tháng 6" (118/120 · 100% · Gửi ngay · **Hoàn tất**).

- **Ảnh 3 — Phiên chăm sóc:** "Theo dõi khách trong các luồng bám đuổi — ai vừa trả lời, phiên nào đang tạm dừng, khi nào chạy lại". Tab: **Phiên chăm sóc** · Cài đặt lắng nghe. Thẻ: 0 KH vừa trả lời · 0 Đang tạm dừng · **10 Đang chăm sóc** · **2 Đã đóng**. Lọc: Tất cả/Vừa trả lời/Tạm dừng/Đang chăm/Đã đóng + ô tìm tên/SĐT. Danh sách 10 phiên (vd Ngô Minh Như 0987000012 "Gắn tay · nick Lộc Nguyễn · đã gửi xong chuỗi · mở 4 giờ trước"; Phạm Hồng Em "Tự động chào khi có lead mới"…). Panel phải: "Chọn 1 phiên để xem chi tiết".

- **Ảnh 4 — Bám đuổi khách hàng thủ công** (Mục tiêu / Bám đuổi... — "Mục tiêu hệ thống"): "Khách hàng được sale gắn luồng bám đuổi thủ công ngay từ màn chat". Nút "Quay lại Mục tiêu". Thẻ: TỔNG KH GẮN TAY 0 (90 ngày) · ĐANG CHẠY 0 · ĐÃ HOÀN THÀNH 0 · ĐÃ DỪNG 0 · TỈ LỆ PHẢN HỒI 0%. Lọc: Tất cả/Đang chạy/Đã xong/Đã dừng. Empty: "Chưa có KH nào được gắn tay".

- **Ảnh 5 — Mục tiêu:** "Quản lý chiến dịch mời kết bạn + bám đuổi". Nút Nhập từ Excel + **Tạo Mục tiêu mới** + ⚙. Thẻ: **1/3 Mục tiêu đang bật** · 0 Khách đã vào · 0 Đã hoàn thành · 0% Tỉ lệ phản hồi. Lọc: Tất cả 3 · Đang chạy 1 · Tạm dừng 1 · Hoàn tất 0 · Hẹn lịch 1 · Nháp 1 · Đã xóa 0. Sắp xếp + Bảng/Card. Bảng: #/Ngày tạo/Mục tiêu/Tệp KH/Nick/Phase1·Mới KB/Phase2·Bám đuổi/Phản hồi/Trạng thái/Ngày kết thúc. 2 dòng: "Chiến dịch kết bạn KH tiềm năng" (Tệp KH tiềm năng Q2 · nick LN · Phase1 0% 0/0 · Phase2 0% · **Tạm dừng**), "Chiến dịch kết bạn KH FB" (Tệp KH FB tháng 6 · **Đang chạy**).

> ⚠️ Quan sát (chưa kết luận): các ảnh "HS Holding CRM" hiển thị **UI EE đầy đủ** (Mục tiêu wizard, Phiên chăm sóc panel, Bám đuổi thủ công standalone, Broadcast bảng đầy đủ) — khác với bản Community đang deploy ở THUAN TIN IMEX. **Chưa so sánh** — chờ "xong".

### Lượt 2 — 3 ảnh **"HS Holding CRM"** (Khối nội dung · Mẫu tin nhắn · Tệp khách hàng)

- **Ảnh 6 — Khối nội dung:** "Mẫu hành động tái sử dụng — gửi 1-1 hàng ngày hoặc ghép vào Luồng". Nút **Tạo thư mục** + **Tạo khối**. Cột trái: Tất cả khối 4 · CÔNG KHAI (cả org dùng) → Khối automation 4 · Đã lưu trữ 0 · Tạo thư mục mới. Search + TAG (+Thêm tag) + LOẠI: Mời kết bạn / Gửi tin / Đổi trạng thái. "Khối automation · Công khai · 4 khối". 4 thẻ: "Tin nhắc chốt đơn" (Gửi tin · 1 biến thể), "Tin gửi ưu đãi" (Gửi tin · 1 biến thể · "giảm 20%"), "Tin chào lead mới" (Gửi tin · 2 biến thể · "Thiên Phúc"), "Kết bạn khách FB" (Mời kết bạn · 2 biến thể). → **CÓ hỗ trợ biến thể (variants) + phân loại 3 loại + thư mục/tag**.

- **Ảnh 7 — Mẫu tin nhắn:** "Câu mẫu soạn sẵn — sale gõ '/' trong khung chat để chèn nhanh". Nút **Tạo thư mục** + **Tạo mẫu**. Cột trái: Tất cả mẫu 5 · CÔNG KHAI (cả công ty) → Mẫu tin chung 5. Search + **Dự án chips: Emerald Garden View · Emerald Boulevard · Emerald River Park · Monrei Sài Gòn** (đều 0). 5 thẻ: CSKH `//csdk` "Chăm sóc định kỳ", `//camon` "Cảm ơn sau mua" (Thiên Phúc), `//nhachen` "Nhắc hẹn", `//baogia` "Gửi báo giá", `//chao` "Chào khách mới" (Thiên Phúc). → **Vẫn hiển thị 4 tag dự án bất động sản hard-code + brand "Thiên Phúc"** (⚠ điểm cần đối chiếu với Phase 1 gỡ hard-code — nhưng đây là bản HS Holding, chưa kết luận).

- **Ảnh 8 — Tệp khách hàng:** "Paste / Excel / Lead Ads (FB · TikTok · Google · Zalo) đổ về tệp tự động theo #mã... nguồn đối tượng cho Sequence / Broadcast / Campaign". Nút **Import CSV** + **Tạo tệp**. Thẻ: 6 Tổng tệp · 0 Lead Ads · 6 Paste/File · 148 SĐT · 60 có Zalo. Tabs: Đang dùng 6 / Lưu trữ / Tất cả. Bảng: Tên tệp/Số khách/Nguồn/Mã đồng bộ/Chia sẻ/Cập nhật/Hợp lệ/Trùng/Có Zalo/Tiến độ/Trạng thái + icon gửi/tải mỗi dòng. Dòng: "Tệp KH tiềm năng Q2" (30·Paste·30/0/30·Hoàn tất), "Tệp KH FB tháng 6" (30·Paste·30/0/30·Hoàn tất), "Tệp 18:07 10-06" (22·Excel·22/**22 trùng**/0·Hoàn tất).

### Lượt 3 — Spec chi tiết EE "6.1+6.2 Mục tiêu & Phiên chăm sóc" (🔶EE) + ảnh HS Holding

**A. Wizard "Tạo Mục tiêu mới" (4 bước):** `1 Tệp+Nick+Skip` → `2 Lời chào+Chuỗi` → `3 Quy tắc gửi an toàn` → `4 Xem trước+Bắt đầu`.
- **Bước 1 — Tệp + Nick + Bỏ qua:** Tên Mục tiêu (bắt buộc); chọn **1 Tệp KH** nguồn; **Nick gửi (chọn NHIỀU)** — tick nick, hiện mức còn lại (vd `KB 202/300 · Tin 118/300`), nick offline tự loại; Quy tắc bỏ qua: bỏ KH đã chat trước (1-1), bỏ KH đã là bạn (phạm vi "Bạn với nick trong danh sách"), bỏ KH không có Zalo.
- **Bước 2 — Lời chào + Chuỗi tin:** Lời mời kết bạn (kèm cùng lúc, **≤200 ký tự**); Tin 1 chào mừng (gửi ngay sau lời mời, không chờ đồng ý); các tin tiếp (nhắc chưa đồng ý / cảm ơn khi đồng ý / bám đuổi khi từ chối — mỗi tin **BẬT/TẮT + thời gian chờ**); biến `{gender} {name} {sale}` trong cả 5 tin; **Báo nội bộ**: Sale phụ trách nick / Quản lý của Sale / Nhóm Zalo báo cáo.
- **Bước 3 — Quy tắc gửi an toàn:** bỏ KH đã kết bạn nhiều nick (Threshold, 0=không lọc); Bám đuổi: Delay sau lời mời → bước 1 (giờ), **Pause khi KH tương tác** (reply → tạm dừng N giờ, cancel job + notify sale); **Phản ứng nâng cao**: Reaction tích cực (tim/like/hoả), tiêu cực (giận/dislike/tim vỡ) → cộng/trừ điểm hoặc tạm dừng.
- **Bước 4 — Xem trước + Bắt đầu:** tóm tắt quy tắc (giờ 08:00–22:00, khoảng cách gửi, pause khi reply…); **Thời điểm bắt đầu** (Bắt đầu ngay / Hẹn lịch, khung 6h–22h VN); nút **Bắt đầu chạy Mục tiêu**. ⚠️ nút này **gửi lời mời/tin THẬT** — demo thì bấm Huỷ.

**B. Trang chi tiết Mục tiêu (drawer bên phải khi bấm 1 dòng):** thẻ Trong tệp / Đã gửi / Có Zalo / Không Zalo; **Phase 1 — Mời kết bạn** (tiến độ gửi lời mời/đồng ý); **Phase 2 — Bám đuổi** (Welcome/bước tiếp/hoàn tất/dừng); **Top 5 nick** theo đã gửi/accept; nút **Mở trang chi tiết đầy đủ** → dashboard + nhật ký (log).

**C. Phiên chăm sóc (`/marketing/care-sessions`):** 4 thẻ (Vừa trả lời-xử lý gấp / Tạm dừng / Đang chăm sóc / Đã đóng); lọc + tìm; mỗi dòng: tên/SĐT/nguồn (Gắn tay / "Tự động chào khi có lead mới")/nick/"đã gửi xong chuỗi"; bấm → chi tiết bên phải.
  - **Tab "Cài đặt lắng nghe":** bảng **Sự kiện lắng nghe & xử lý thông báo** — bật/tắt từng sự kiện (khách rep, kết bạn, cảm ơn khi kết bạn, reaction, chặn nick, thành lead), gắn **mức xử lý (flow/session)** + **thông báo 3 đích: Owner / Quản lý / Nhóm Zalo**; khối Cảnh báo khi ≥3 lỗi + Nhóm Zalo nhận báo cáo; nút **Áp dụng cho tất cả nick / Lưu cài đặt**.

**D. Bám đuổi thủ công (`/marketing/manual-followup`):** "Mục tiêu hệ thống" đặc biệt — gom KH được sale gắn bám đuổi thủ công từ Chat (không qua luồng tự động). Thẻ: Tổng KH gắn tay / Đang chạy / Đã hoàn thành / Đã dừng / Tỉ lệ phản hồi; lọc Tất cả/Đang chạy/Đã xong/Đã dừng; empty "Chưa có KH nào được gắn tay".

### Lượt 4a — Spec chi tiết "6.3+6.4+6.5 Luồng · Khối · Mẫu" (Luồng+Khối 🔶EE, Mẫu core)

**A. Luồng kịch bản (`/marketing/sequences`) 🔶EE:** thẻ luồng (tên · bước ngang "Gửi kết bạn→Gửi tin nhắn" · công tắc · độ trễ +2 giờ) · luật Giãn đều giữa nick / Dừng khi kết bạn/khách trả lời · bộ đếm Enroll/Hoàn thành/Lỗi/Đang chạy.
  - **Tạo luồng (drawer):** Tên; Khi nào chạy (Giờ làm việc 08:00-22:00 VN, giãn cách giữa lần gửi); Bảo vệ chống spam (tránh trùng, giãn nick, dừng nếu rep); sau lưu → thêm Khối + độ trễ giữa bước; thống kê `/sequences/:id/stats`.
**B. Khối nội dung (`/marketing/blocks`) 🔶EE:** thư mục (Khối automation) + Tạo thư mục; lọc loại Mới kết bạn/Gửi tin/Đổi trạng thái; thẻ khối (nhãn loại/tiêu đề/nội dung/số biến thể).
  - **Tạo khối (trang toàn màn):** Tên + Thư mục + Loại; **Thành phần: Tin nhắn** (nhiều thành phần); mỗi thành phần **nhiều biến thể** (Biến thể 1 mặc định) + Thêm (xoay vòng) + **AI tạo biến thể**; **rich-text** (B/I/U, danh sách, emoji) + chèn biến `{gender} {name} {sale}`; panel phải **Xem trước Zalo (LIVE)**. Khối `request_friend` = gửi lời mời; `send_message` = nội dung. Ghép nhiều khối → Luồng.
**C. Mẫu tin nhắn (`/marketing/templates`) core:** Mẫu tin chung + thư mục theo **Dự án (Emerald Garden View, Boulevard…)**; slug (`//cdk //camon //nhachen //baogia //chao`).
  - **Tạo mẫu (popup):** Tên + từ khoá gõ tắt (vd `giaegv`) + Thư mục + Loại; Riêng tư/Công khai; gắn **Dự án chips**; chèn biến `{gender}` Anh/Chị · `{name}` Tên khách · `{sale}` Tên em (sale); soạn nội dung → Lưu.

### Lượt 4b — Spec chi tiết "6.6+6.7 Broadcast · Tệp khách hàng" (Broadcast 🔶EE, Tệp core)

**A. Wizard "Tạo Broadcast mới" (4 bước) 🔶EE:** `1 Đối tượng → 2 Nội dung → 3 Lịch gửi → 4 Xem trước & Gửi`. Panel phải luôn hiện tóm tắt Đối tượng + cảnh báo **"Skip n KH (không Zalo / bị chặn / chưa kết bạn)"**.
  - **B1 Đối tượng:** 1 trong 4 cách: **Tệp KH** (chọn 1 tệp processing/done) · **Nhãn CRM** · **Mẫu có sẵn** · **Bộ lọc**. Nút **Đếm KH** → số lượng → Tiếp tục.
  - **B2 Nội dung:** chọn **Khối nội dung loại `send_message`** (chưa có → vào Khối nội dung tạo) → Tiếp tục.
  - **B3 Lịch gửi:** **Nick gửi** (tick nick, hạn mức `Tin n/300`, worker ưu tiên nick tương tác gần nhất); **Phase 2 — Tìm SĐT chưa kết bạn**: Tắt (mặc định, chỉ gửi KH đã là bạn, chưa KB→skip) / Bật (lookup SĐT + gửi vào tab Người lạ, cap 30/nick/ngày, cooldown 20s); **Khi nào gửi**: Gửi ngay / Hẹn lịch 1 lần.
  - **B4 Xem trước & Gửi:** đặt tên + bảng tóm tắt (Đối tượng/Số nhận tin/Khối nội dung/Lịch gửi/**Window 6:00-22:00 VN**/**Throttle 3-10s/KH · cap 300/nick**). Bấm **Lưu & Gửi ngay**. ⚠️ gửi tin THẬT hàng loạt — demo bấm Huỷ.
**B. Trang chi tiết Broadcast 🔶EE:** tiêu đề + trạng thái (Nháp) + người tạo/thời gian; nút **Kích hoạt / Xoá**; **3 tab: Tổng quan · Người nhận · Lịch sử gửi**; thẻ số: Tổng KH (snapshot), Đã gửi (server), KH đã nhận (tick xám), KH đã xem (tick xanh), Lỗi (chi tiết/nick), Chờ gửi (queued); khối Đối tượng (điều kiện lọc) + Nội dung (khối + xem trước tin).
**C. Tệp khách hàng (`/marketing/lists`) core:** thẻ tổng + lọc + bảng (Tên/Số khách/Nguồn/Mã đồng bộ/Chia sẻ/Cập nhật/Hợp lệ/Trùng/Có Zalo/Tiến độ/Trạng thái + gửi/tải).
  - **Tạo tệp (popup):** Tên (auto theo ngày) + Icon; 4 nguồn tab: **Paste / Upload Excel / Upload CSV / Lead Ads**; SĐT trước tên, tự dedup + lookup Zalo, cắt prefix `p:`/`tel:`; async lookup UID qua zalo-pool. Import CSV/Excel → popup tab tương ứng.
  - **Chi tiết tệp (`/marketing/lists/:id`):** header (tên/tổng SĐT/nguồn + **Tạo Mục tiêu từ tệp này · Quét lại Zalo · Export CSV**); thẻ Tổng SĐT/hợp lệ/Trùng/Trong vùng phủ/Đã có CRM; bảng SĐT (Phone/Tên/Có Zalo·No/đối soát khi gửi).

> Ghi chú reviewer (chưa kết luận): (1) Broadcast wizard spec KHỚP wizard tôi vừa build. (2) Broadcast detail spec = **3 tab** (Tổng quan/Người nhận/Lịch sử gửi) — tôi build **4 tab** (thêm Cài đặt). (3) Broadcast detail spec có KPI "đã nhận/đã xem" (tick xám/xanh) — model RunItem hiện KHÔNG có. (4) Khối nội dung spec có variants+AI+rich-text+Zalo-LIVE — Community hiện chỉ CRUD cơ bản. (5) Mẫu tin nhắn spec vẫn có Dự án chips bất động sản.

---

## 3. Kết quả đối chiếu spec ↔ code (2026-07-14, sau khi user nói "xong")

> Đối chiếu trên `main` @ `0f69410`. Quy ước lệch chữ/ảnh: **theo ảnh** (user chốt).
> Hướng đã chốt (MARKETING_EE_GAP_TODO §0): build EE đầy đủ, không cắt về Community 2 mục.

### 3.1 ĐÚNG / ĐỦ so với spec

- **Tệp khách hàng** (`/marketing/lists` + `:id`): đủ thẻ tổng, 4 nguồn nhập, dedup/normalize (`p:`/`tel:`/`sdt:`…), lookup async, chi tiết + Export CSV + deep-link tạo Mục tiêu/Broadcast. ✅
- **Mẫu tin nhắn**: folder + slug + Riêng tư/Công khai + biến + track-use; **tag Dự án lấy ĐỘNG theo org** (`use-project-tags`) — spec HS Holding hiện chips BĐS hard-code nhưng bản mình dynamic là ĐÚNG hướng Phase 1. ✅
- **Khối nội dung**: CRUD thật + biến thể + 3 loại khối + tag + bật/tắt + tìm/lọc + validate biến. ✅ (phần lõi)
- **Luồng kịch bản**: bước ghép Khối `send_message` thật + delay + reorder + toggle. ✅ (phần lõi)
- **Broadcast wizard 4 bước**: số bước/độ an toàn khớp spec (đếm KH, chặn biến lạ, dry-run → nháp). ✅
- **Phiên chăm sóc + Bám đuổi thủ công**: ĐÃ CÓ VIEW THẬT (commit `1bd9e5b`, Phase 4.1) — `CareSessionListPanel` dùng chung: 5 thẻ tổng + filter + search + pause 24h/stop, data từ `GET /automation/care-sessions` (list tổng đã bổ sung). Manual-followup = cùng panel lọc `sourceType=sequence_manual`. ✅ (khung chính — chi tiết còn thiếu ở 3.2)

### 3.2 THIẾU so với spec (gap thật, xếp theo mức độ)

**GAP LỚN NHẤT — Mục tiêu (B3):** `TargetsView.vue` vẫn là **modal 1 trang, 1 nick** (`form.zaloAccountId` đơn):
- ☐ Wizard 4 bước (Tệp+Nick+Skip → Lời chào+Chuỗi → Quy tắc an toàn → Xem trước+Bắt đầu).
- ☐ Multi-nick + hạn mức `KB n/300 · Tin n/300` + tự loại nick offline.
- ☐ Quy tắc bỏ qua bước 1 (đã chat 1-1 / đã là bạn theo phạm vi / không Zalo).
- ☐ Chuỗi 5 tin (lời mời ≤200 + welcome "Hộp người lạ" + nhắc + cảm ơn + bám đuổi từ chối), mỗi tin BẬT/TẮT + delay — hiện chỉ welcome + 1 sequence.
- ☐ Báo nội bộ: chỉ cần đích **Sale phụ trách nick** (2 đích kia chính HS Holding cũng "Đang phát triển").
- ☐ Quy tắc an toàn theo ảnh: threshold multi-nick (RBAC-scope), delay 60ph, pause reply 24h + reset + cancel job + notify; reaction rules **CỐ ĐỊNH** (+5 điểm / pause 48h -5 điểm) — không cho config.
- ☐ Hẹn lịch bắt đầu (khung 6h–22h VN).
- ☐ Drawer chi tiết: 4 thẻ (TRONG TỆP/**ĐÃ XỬ LÝ**/CÓ ZALO/KHÔNG ZALO), Phase 1 breakdown (gửi/đồng ý/từ chối/chờ), Phase 2 (welcome/bước tiếp/hoàn tất/dừng), **TOP 3 nick theo tỉ lệ accept**, nút mở trang chi tiết đầy đủ + log.

**Broadcast (B1):**
- ☐ Nguồn đối tượng: có 2/4 (Bạn bè + Tệp KH); thiếu **Nhãn CRM** + **Bộ lọc động** ("Mẫu có sẵn" cân nhắc bỏ).
- ☐ KPI **đã nhận (tick xám) / đã xem (tick xanh)**: `BroadcastRunItem` chưa có cột `receivedAt/seenAt` → cần migration + nguồn sự kiện.
- ☐ Detail đang 4 tab (spec 3 tab) — chờ user chốt giữ hay bỏ tab Cài đặt.

**Phiên chăm sóc (B5 phần còn lại):**
- ☐ Thẻ/lọc "**Vừa trả lời**" (needs_attention) — panel hiện có `lastReplyAt` per-row nhưng chưa có thẻ + filter riêng.
- ☐ **Panel chi tiết bên phải** khi click 1 phiên (timeline — backend `followup-history` đã có, chưa nối vào trang này).
- ☐ Tab **Cài đặt lắng nghe** org-level (bảng sự kiện + mức xử lý + 3 đích thông báo) — backend `listen*` có, UI chưa.

**Luồng kịch bản (B4 phần còn lại):**
- ☐ UI giờ làm việc + giãn cách + luật chống spam (BE `runtimeRules` đã thực thi, chưa phơi UI).
- ☐ Bộ đếm Enroll/Hoàn thành/Lỗi/Đang chạy trên thẻ + trang `/sequences/:id/stats`.

**Khối nội dung (B2 phần còn lại):**
- ☐ AI tạo biến thể · rich-text (tái dùng `rich-text-editor`) · preview Zalo LIVE · UI cây folder (cột BE có) · trình soạn toàn trang.

### 3.3 LỆCH / CẦN QUYẾT ĐỊNH — ✅ USER CHỐT 2026-07-14

1. Broadcast detail: **GIỮ 4 tab**. ✅
2. Nguồn Broadcast: **GIỮ "Mẫu có sẵn"** — B1 làm đủ 4 nguồn spec (Tệp KH / Nhãn CRM / Mẫu có sẵn / Bộ lọc) + giữ "Bạn bè" hiện có. ✅
3. Care-session: **THÊM thẻ "Vừa trả lời"** (không đổi enum DB — derive từ lastReplyAt). ✅ → triển khai ngay (mục 3.5).
4. Tham số cứng theo ảnh: làm default trong config backend (không ai phản đối — giữ đề xuất).

### 3.4 Đề xuất thứ tự triển khai (chờ user xác nhận)

1. **B3 — Mục tiêu wizard 4 bước + drawer chi tiết** (gap lớn nhất, spec Lượt 6 đã đủ chi tiết để làm).
2. **B5 còn lại — thẻ Vừa trả lời + panel timeline + Cài đặt lắng nghe** (nhanh, backend sẵn).
3. **B4 còn lại — UI luật luồng + stats** (vừa).
4. **B1 — Broadcast nguồn CRM/bộ lọc + KPI nhận/xem** (cần migration + nguồn event Zalo).
5. **B2 còn lại — AI/rich-text/preview/folder** (polish, làm sau).

> Toàn bộ triển khai giữ nguyên 2 cờ dry-run; không gửi Zalo thật. CHƯA code — chờ xác nhận thứ tự.
> 2026-07-14: User yêu cầu soạn prompt triển khai B3 (không code) → **`MARKETING_B3_PROMPT.md`**. Việc "thêm thẻ Vừa trả lời" (B5) đã chốt làm nhưng chưa triển khai.

---

## LƯỢT 5 — NGUỒN CHÍNH THỨC: docs.locnguyendata.com (phần 6, đọc trực tiếp)

> Nguồn: https://docs.locnguyendata.com — trang overview `/marketing`, `/06a-muc-tieu-phien-cham-soc`, `/06b-luong-khoi-mau`, `/06c-broadcast-tep-khach`. Đây là bản chữ chuẩn (trước đây chỉ có ảnh chụp). Trích để đối chiếu khi user nói "xong".

### 6.0 — Overview `/marketing`

**⭐ GHI CHÚ QUAN TRỌNG (bản Community):** *"menu Marketing ở bản Community CHỈ CÓ 2 MỤC: **Quét nhóm** và **Tệp khách hàng** (broadcast tới tệp thủ công). Các mục gắn nhãn 🔶 EE (Mục tiêu, Phiên chăm sóc, Luồng kịch bản, Khối nội dung, Broadcast tự động, Bot Auto…) là tính năng Enterprise — bản Community KHÔNG CÓ."*

Bảng menu Marketing (đầy đủ EE):

| Mục | Đường dẫn | Vai trò | Nhãn |
|---|---|---|---|
| Mục tiêu | /marketing/triggers | Chiến dịch kết bạn + bám đuổi theo Tệp KH | 🔶 EE |
| Phiên chăm sóc | /marketing/care-sessions | Theo dõi KH đang trong luồng bám đuổi | 🔶 EE |
| Luồng kịch bản | /marketing/sequences | Chuỗi khối nội dung gửi theo thời gian | 🔶 EE |
| Khối nội dung | /marketing/blocks | Hành động đơn (gửi tin, kết bạn…) tái sử dụng | 🔶 EE |
| Mẫu tin nhắn | /marketing/templates | Mẫu câu soạn sẵn, chèn nhanh khi chat | (core) |
| Gửi tin hàng loạt | /marketing/broadcasts | Broadcast tới một tệp khách | 🔶 EE |
| Tệp khách hàng | /marketing/lists | Tệp KH nguồn (paste/Excel/Lead Ads) | (core) |

Mô hình tổng: Khối nội dung → ghép thành Luồng kịch bản → gắn vào Mục tiêu (chạy trên một Tệp KH) → KH chạy qua luồng xuất hiện trong Phiên chăm sóc. Broadcast = gửi một lần tới cả tệp.

Nhãn EE theo overview: 6.1 Mục tiêu 🔶, Bám đuổi thủ công 🔶, 6.2 Phiên chăm sóc 🔶, 6.3 Luồng 🔶, 6.4 Khối 🔶, 6.5 Mẫu tin nhắn (KHÔNG EE), 6.6 Broadcast 🔶, 6.7 Tệp khách hàng (KHÔNG EE).

### 6a — Mục tiêu & Phiên chăm sóc (`/06a-muc-tieu-phien-cham-soc`) 🔶 EE

**A. Wizard "Tạo Mục tiêu mới" (4 bước):** thanh tiến trình `1 Tệp+Nick+Skip → 2 Lời chào+Chuỗi → 3 Quy tắc gửi an toàn → 4 Xem trước+Bắt đầu`.
- **Bước 1 — Tệp + Nick + Quy tắc bỏ qua:** Tên Mục tiêu (bắt buộc); Tệp KH (bắt buộc, cạnh ô hiện số SĐT vd "30 SĐT"); Nick gửi mời (chọn nhiều, bắt buộc — mỗi thẻ nick hiện hạn mức vd "KB 202/300 · Tin 118/300", tối đa 300 mời/ngày + 300 tin/ngày, nick offline tự loại); Quy tắc bỏ qua: bỏ KH đã có chat 1-1, bỏ KH đã là bạn (phạm vi "Bạn với nick trong danh sách"), bỏ KH không có Zalo.
- **Bước 2 — Lời chào + Chuỗi tin:** Lời mời kết bạn (≤200 ký tự); Tin 1 chào mừng (gửi ngay sau lời mời, không chờ đồng ý); các tin tiếp theo (nhắc khi chưa đồng ý / cảm ơn khi đồng ý / bám đuổi khi bị từ chối — mỗi tin có công tắc BẬT/TẮT + thời gian chờ); biến cá nhân hoá `{gender} {name} {sale}` chèn được trong cả 5 tin; báo nội bộ khi sự kiện (Sale phụ trách nick / Quản lý của Sale / Nhóm Zalo báo cáo).
- **Bước 3 — Quy tắc gửi an toàn:** Bỏ qua KH đã kết bạn nhiều nick (Threshold, 0 = không lọc); Bám đuổi (Delay sau lời mời → bước 1 bám đuổi tính giờ; Pause khi KH tương tác — khách reply thì tạm dừng chuỗi N giờ + cancel job + notify khẩn sale); Phản ứng nâng cao (Reaction tích cực tim/like/hoa và tiêu cực giận/dislike/tim vỡ → cộng/trừ điểm hoặc tạm dừng).
- **Bước 4 — Xem trước + Bắt đầu:** tóm tắt quy tắc gửi an toàn; Thời điểm bắt đầu (Bắt đầu ngay / Hẹn lịch — chỉ trong khung 6h–22h giờ VN); nút "Bắt đầu chạy Mục tiêu".

**B. Trang chi tiết một Mục tiêu:** thẻ trạng thái (Trong tệp, Đã gửi, Có Zalo, Không Zalo); Phase 1 Mời kết bạn (tiến độ gửi/đồng ý); Phase 2 Bám đuổi (tiến độ chuỗi sau kết bạn); Top 5 nick theo đã gửi/accept; nút "Mở trang chi tiết" (dashboard + log). Trạng thái: Đang chạy · Tạm dừng · Hoàn tất · Hẹn lịch · Nháp · Đã xoá.

**C. Phiên chăm sóc (`/marketing/care-sessions`):** 4 thẻ (KH vừa trả lời / Đang tạm dừng / Đang chăm sóc / Đã đóng); lọc Tất cả · Vừa trả lời · Tạm dừng · Đang chăm · Đã đóng + tìm theo tên/SĐT; mỗi dòng: tên KH, SĐT, nguồn (Gắn tay / tự động chào khi có lead mới), nick chăm, "đã gửi xong chuỗi". **Tab "Cài đặt lắng nghe":** bảng Sự kiện lắng nghe & xử lý thông báo (bật/tắt từng sự kiện: khách đã rep / khách kết bạn / cảm ơn kết bạn…, gán mức xử lý + thông báo); khối "Cảnh báo khi 3 lỗi" + "Nhóm Zalo nhận báo cáo"; nút "Áp dụng cho tất cả nick" / "Lưu cài đặt".

**D. Bám đuổi thủ công (`/marketing/manual-followup`):** gom KH được sale gắn bám đuổi thủ công từ màn Chat (không qua luồng tự động). Thẻ: Tổng KH gắn tay, Đang chạy, Đã hoàn thành, Đã dừng, Tỉ lệ phản hồi. Lọc Tất cả · Đang chạy · Đã xong · Đã dừng + tìm theo tên KH/luồng/sale. Rỗng → "Chưa có KH nào được gắn tay."

### 6b — Luồng · Khối · Mẫu (`/06b-luong-khoi-mau`)

**A. Luồng kịch bản (`/marketing/sequences`) 🔶 EE:** mỗi luồng là thẻ: tên, các bước (khối) xếp ngang (vd "Gửi kết bạn → Gửi tin nhắn"), công tắc bật/tắt; mỗi bước hiện độ trễ (vd +2 giờ); luật an toàn Giãn đều giữa nick, Dừng khi kết bạn/khách trả lời; bộ đếm Đã enroll · Hoàn thành · Lỗi · Đang chạy.
- **Tạo luồng:** nút "Tạo luồng" → drawer phải: Tên luồng; Khi nào chạy (Giờ làm việc vd 08:00–22:00 giờ VN, giãn cách giữa các lần gửi); Bảo vệ không spam (Tránh gửi trùng lặp, Giãn đều giữa nick, Dừng nếu khách đã rep); sau lưu khung thêm Khối + đặt độ trễ. Thống kê tại `/marketing/sequences/:id/stats`.

**B. Khối nội dung (`/marketing/blocks`) 🔶 EE:** cột trái thư mục + Tạo thư mục; lọc loại Mới kết bạn · Gửi tin · Đổi trạng thái; tìm theo tên/nội dung/tag + Thêm tag; mỗi khối = thẻ (nhãn loại, tiêu đề, nội dung mẫu, số biến thể vd "2 biến thể").
- **Tạo khối:** nút "Tạo khối" → trình soạn khối TOÀN TRANG: Tên Khối + Thư mục + Tag + Loại (Gửi tin nhắn / Mới kết bạn…); Thành phần: thêm Tin nhắn — mỗi thành phần có nhiều **biến thể** (Biến thể 1 mặc định, + Thêm) để xoay vòng tránh trùng — nút **AI tạo biến thể**; **trình soạn rich-text** (B/I/U, danh sách, emoji) + chèn biến `{gender} {name} {sale}`; panel phải **Xem trước trên Zalo (LIVE)**; nút Lưu. Khối "Mới kết bạn" = request_friend gửi lời mời; "Gửi tin" = nhắn nội dung.

**C. Mẫu tin nhắn (`/marketing/templates`) (core, không EE):** cột trái Mẫu tin chung + thư mục theo Dự án (Emerald Garden View, Boulevard…); mỗi mẫu có slug (vd `//cdk //camon //nhachen //baogia //chao`) + nội dung; gõ slug trong khung chat để chèn.
- **Tạo mẫu:** nút "Tạo mẫu" → popup "Tạo mẫu tin nhắn": Tên mẫu + từ khoá gõ tắt (vd `giaegv`) + Thư mục + Loại; Riêng tư / Công khai; gắn Dự án (chips); chèn biến `{gender}` Anh/Chị · `{name}` Tên khách · `{sale}` Tên em (sale); soạn nội dung → Lưu.

### 6c — Broadcast · Tệp KH (`/06c-broadcast-tep-khach`)

**A. Wizard "Tạo Broadcast mới" (4 bước) 🔶 EE:** vào Marketing › Gửi tin hàng loạt → "+ Soạn broadcast". Thanh tiến trình `1 Đối tượng → 2 Nội dung → 3 Lịch gửi → 4 Xem trước & Gửi`. Panel phải luôn hiện tóm tắt Đối tượng + cảnh báo "Skip n KH (không Zalo / bị chặn / chưa kết bạn)".
- **Bước 1 — Đối tượng:** chọn 1 trong 4 cách: **Tệp KH** (chỉ hiện tệp processing/done), **Nhãn CRM**, **Mẫu có sẵn**, **Bộ lọc** (lọc động). Bấm "Đếm KH" xem số lượng → "Tiếp tục".
- **Bước 2 — Nội dung:** chọn **Khối nội dung** loại `send_message` đã có (chưa có → vào Khối nội dung tạo trước); chọn ở ô "— chọn khối —" → Tiếp tục.
- **Bước 3 — Lịch gửi:** Nick gửi tin (tích nick được phép — worker ưu tiên nick tương tác gần nhất với KH; mỗi nick hiện hạn mức "Tin n/300"); **Phase 2 — Tìm SĐT chưa kết bạn**: Tắt (mặc định, chỉ gửi KH đã là bạn — chưa bạn thì skip) / Bật (tự lookup SĐT + gửi vào tab Người lạ, cap 30/nick/ngày); Khi nào gửi (Gửi ngay / Hẹn lịch 1 lần chọn ngày+giờ) → Tiếp tục.
- **Bước 4 — Xem trước & Gửi:** Đặt tên broadcast + bảng tóm tắt (Đối tượng/tệp, Sẽ nhận tin/số KH, Khối nội dung, Lịch gửi, Window vd 6:00→22:00 VN, Throttle vd 3–10s/KH · cap 300/nick); nút "Lưu & Gửi ngay". (⚠ gửi thật — demo nên lưu Nháp/Hẹn lịch hoặc Huỷ.)

**B. Trang chi tiết một Broadcast 🔶 EE:** Tiêu đề + trạng thái (vd Nháp), người tạo, thời gian; nút "Kích hoạt / Xoá". **3 tab: Tổng quan · Người nhận · Lịch sử gửi.** Thẻ số: Tổng KH (sau dedup+skip), Đã gửi (tiến độ server), **KH đã nhận (tick xám)**, **KH đã xem (tick xanh)**, Lỗi (chặn/lỗi nick), Chờ gửi (trong queue). Khối Đối tượng (điều kiện lọc) và Nội dung (khối + bản xem trước tin).

**C. Tệp khách hàng (`/marketing/lists`) (core):** tệp KH nguồn cho Mục tiêu/Broadcast/Campaign; Paste/Excel/Lead Ads (FB·TikTok·Google·Zalo) đổ về tệp tự động theo `#mã` trong tên chiến dịch.
- Thẻ tổng: Tổng tệp · Lead Ads · Paste/File · SĐT trong các tệp · SĐT có Zalo. Lọc Đang dùng · Lưu trữ · Tất cả + tìm theo tên tệp. Bảng mỗi tệp: Tên, Số khách, Nguồn, Mã đồng bộ, Chia sẻ, Cập nhật, Hợp lệ/Trùng/Có Zalo, Tiến độ, Trạng thái, nút gửi/tải.
- **Tạo tệp (popup "Tạo tệp khách hàng mới"):** Tên tệp (trống → auto theo ngày giờ) + Icon; **4 nguồn nhập (tab): Paste danh sách · Upload Excel · Upload CSV · Lead Ads**; Paste: mỗi dòng 1 SĐT (kèm tên — SĐT trước tên sau), tự nhận diện/dedup/lookup Zalo, prefix `p:`/`tel:` strip tự động; nút "Tạo tệp" → async lookup UID Zalo qua zalo-pool (không chặn UI). Import CSV/Excel dùng chính popup này (tab Upload).
- **Chi tiết một tệp (`/marketing/lists/:id`):** Header tên tệp, tổng SĐT, nguồn; nút "Tạo Mục tiêu từ tệp này", "Quét lại Zalo", "Export CSV"; thẻ Tổng SĐT · Hợp lệ · Trùng · Trong vùng phủ · Đã có CRM; bảng từng SĐT: Phone, Tên, trạng thái Có Zalo / No.

### Ghi chú reviewer (chưa kết luận — chờ "xong")
- [ ] **Community scope theo docs = CHỈ 2 mục** (Quét nhóm + Tệp khách hàng). Deploy hiện tại đang bật 7 mục qua feature flag `VITE_MARKETING_ENTERPRISE_ENABLED=true`. → cần đối chiếu: có phải ta đang bật nhầm nội dung EE trên bản Community không, hay chủ ý dùng bản EE.
- [ ] Broadcast detail docs = **3 tab** (Tổng quan · Người nhận · Lịch sử gửi); implementation của tôi = 4 tab (thêm "Cài đặt"). Docs cũng yêu cầu thẻ **KH đã nhận (tick xám)** + **KH đã xem (tick xanh)** — cần xem BroadcastRunItem có track received/seen chưa.
- [ ] Broadcast Bước 1 docs = **4 nguồn đối tượng** (Tệp KH / Nhãn CRM / Mẫu có sẵn / Bộ lọc). Implementation hiện chỉ Tệp KH? → kiểm tra.
- [ ] Khối nội dung docs yêu cầu **biến thể + AI tạo biến thể + rich-text + preview Zalo LIVE**; Community hiện là CRUD cơ bản → gap lớn (nhưng docs xếp Khối là EE).
- [ ] Mẫu tin nhắn: slug `//` + gắn Dự án chips — kiểm tra template view có hỗ trợ.
- [ ] Wizard Mục tiêu 4 bước + Broadcast 4 bước: đối chiếu số bước/tên bước với code.

---

## LƯỢT 6 (2026-07-14) — File Word "6.1 Mục tiêu" (spec chữ + 6 ảnh HS Holding, chi tiết hơn Lượt 3)

> Nguồn: `New Microsoft Word Document.docx` (Desktop user). Phần chữ = spec 6.1 Mục tiêu (trùng Lượt 3 mục A/B và Lượt 5/6a). Kèm **6 screenshot HS Holding CRM** — transcribe các chi tiết MỚI chỉ thấy trong ảnh:

- **Ảnh 1 — List Mục tiêu:** thẻ 1/3 đang bật · 0 khách vào · 0 hoàn thành · 0% phản hồi; lọc Tất cả 3/Đang chạy 1/Tạm dừng 1/Hoàn tất 0/Hẹn lịch 1/Nháp 1/Đã xóa 0; toggle Bảng/Card + Sắp xếp; cột: #/Ngày tạo/Mục tiêu (kèm "bởi Nguyễn Tiến Lộc")/Tệp KH (kèm "0 SĐT · 0 có Zalo · 0 không Zalo")/Nick/Phase1·Mời KB (%, Gửi n · Đồng ý n)/Phase2·Bám đuổi (%, Xong n · Đang chạy n)/Phản hồi/Trạng thái/Ngày kết thúc; nút Nhập từ Excel + ⚙ + Tạo Mục tiêu mới.
- **Ảnh 2 — Wizard B1:** thanh 4 bước đúng tên `1 Tệp + Nick + Skip → 2 Lời chào + Chuỗi → 3 Quy tắc gửi an toàn → 4 Xem trước + Bắt đầu`; header bước ghi "Bắt buộc · ~30 giây"; nick card: `Online · KB 202/300 · Tin 118/300` (chọn NHIỀU nick); "Bỏ qua KH đã là bạn rồi" có dropdown phạm vi **"Bạn với nick trong danh sách"**.
- **Ảnh 3 — Wizard B2:** Lời mời kết bạn badge **"Bắt buộc"** + đếm ký tự `115/200`; Tin 1 chào mừng badge **"Hộp người lạ"** (gửi ngay sau lời mời, KHÔNG chờ đồng ý) + "CHỜ SAU KHI MỜI: 1 Giây"; Tin 2 "Tin cảm ơn khách đã đồng ý kết bạn" badge "Sau khi đồng ý" + chờ 1 Phút; **mỗi tin có khối "Báo nội bộ khi sự kiện xảy ra"** 3 đích: Sale phụ trách nick (**Hoạt động**) / Quản lý của Sale (**Đang phát triển**) / Nhóm Zalo báo cáo (**Đang phát triển**) ⇒ chính bản HS Holding cũng mới xong 1/3 đích notify.
- **Ảnh 4 — Wizard B3:** Threshold multi-nick + note "Privacy: chỉ đếm nick trong phạm vi phòng/dept của anh (RBAC M2)"; Delay sau lời mời → bước 1: 1 Giờ, chú thích **"'Spam HẾT luồng' — KH KHÔNG cần accept vẫn nhận đủ chuỗi qua stranger inbox"**; Pause khi KH tương tác: 1 Ngày + "KH reply tiếp → reset" + "reply giữa chuỗi → cancel job pending + notify KHẨN sale"; **Phản ứng nâng cao = 2 rule CỐ ĐỊNH, không cho config** ("Anh chốt 2026-06-01"): tích cực → KHÔNG dừng chuỗi, chỉ +5 điểm CRM; tiêu cực → Pause 48h + -5 điểm + notify sale ("mạnh hơn customer_reply 24h").
- **Ảnh 5 — Wizard B4:** bảng "Quy tắc gửi an toàn (đã cấu hình ở Bước 3)" với số cụ thể: Giờ hoạt động 06:00–22:00 (16 giờ/ngày) · Khoảng cách giữa các lần gửi 60 giây · Bỏ qua KH gần đây (cross-nick) 30 ngày · Bỏ qua KH nhiều nick: Tắt · Delay sau kết bạn 60 phút · Tạm dừng khi KH reply 24 giờ; panel preview tin (Lời mời + Tin chào mừng render biến thật "Anh Nguyễn Tuấn Trang"); Thời điểm bắt đầu: Bắt đầu ngay / Hẹn lịch (6h–22h VN); nút **"Bắt đầu chạy Mục tiêu"**; footer "Sau khi bắt đầu vẫn có thể tạm dừng/sửa bất cứ lúc nào".
- **Ảnh 6 — Detail drawer:** 4 thẻ **TRONG TỆP / ĐÃ XỬ LÝ / CÓ ZALO / KHÔNG ZALO** (spec chữ ghi "Đã gửi" — lệch nhẹ); Phase 1 breakdown: Đã gửi lời mời / Đồng ý kết bạn / Từ chối / Đang chờ phản hồi; Phase 2 (Welcome → Follow-up): Đã gửi tin Welcome / Đang chạy bước tiếp / Hoàn tất chuỗi / Dừng (reply/block); **TOP 3 NICK THEO TỈ LỆ ACCEPT** (spec chữ ghi Top 5 — lệch nhẹ) bảng Nick/Gửi/Accept/%; nút "Mở trang chi tiết đầy đủ →".

> ⚠️ Lệch nội bộ giữa spec chữ và ảnh: Top 5 vs **Top 3** nick; thẻ "Đã gửi" vs **"ĐÃ XỬ LÝ"**. Ảnh cũng cho thấy nhiều tham số cứng (60s/30 ngày/24h/48h/±5 điểm) không có trong spec chữ.
> ✅ **User chốt 2026-07-14: "theo hình ảnh"** — khi lệch chữ vs ảnh thì lấy theo ẢNH (Top 3 nick theo tỉ lệ accept; thẻ "ĐÃ XỬ LÝ"; tham số cứng trong ảnh là chuẩn).
> ✅ **User nói "xong" 2026-07-14** — kết thúc thu thập, bắt đầu đối chiếu spec ↔ code.
