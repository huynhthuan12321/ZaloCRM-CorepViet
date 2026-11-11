# Ảnh browser local — Báo cáo 5A

Chụp 02/11/2026 khoảng 06:51–06:58 (+07), từ frontend build và Fastify/JWT/PostgreSQL disposable, fixture giả. Provider ChatGPT IAB, **không chứng nhận Safari/iPhone/PWA thật**. Các số là response từ DB fixture; không nhúng mock metric vào ứng dụng. [Checkpoint](../05-mobile.md), [layout đo từ DOM](../../../artifacts/reports-mobile-5a-2026-11-02/layout-final.json), [manifest](../../../artifacts/reports-mobile-5a-2026-11-02/render-manifest.json).

Kích thước dưới đây là **CSS viewport đo được**, mobile cao844, desktop cao900. Provider tỷ lệ pixel1,33; tên file dùng CSS width, không dùng tham số override vật lý. Ảnh viewport hiển thị phần đầu vùng cuộn; bảng/phần shared phía dưới được xác minh bằng tương tác và DOM, không ghép ảnh hoặc tạo bằng AI.

| View | 320×844 | 390×844 | 430×844 | 1440×900 | Trạng thái |
|---|---|---|---|---|---|
| Tổng quan | [320](05-tong-quan-320.png) | [390](05-tong-quan-390.png) | [430](05-tong-quan-430.png) | [desktop](05-tong-quan-1440.png) | Base admin orgA; snapshot khách=6, msgToday=0, fixture lịch sử ngày01/11 |
| Sale & Team | [320](05-sale-320.png) | [390](05-sale-390.png) | [430](05-sale-430.png) | [desktop](05-sale-1440.png) | Base admin; dữ liệu dòng VERIFY Sale A; chốt unavailable |
| Automation | [320](05-automation-320.png) | [390](05-automation-390.png) | [430](05-automation-430.png) | [desktop](05-automation-1440.png) | Base admin; kỳ7 ngày; 4/1=25%,3/1=33,3% |
| AI admin base-org | [320](05-ai-320.png) | [390](05-ai-390.png) | [430](05-ai-430.png) | [desktop](05-ai-1440.png) | Empty/0 do AI seed thuộc org khác; token/cost unavailable |
| AI leader org riêng | [320](05-ai-leader-320.png) | [390](05-ai-leader-390.png) | [430](05-ai-leader-430.png) | — | Main7 tin/2 nháp; shared1 tin/1 nháp, tách biệt; menu6 mục |

Ảnh tương tác đều **390×844 CSS px**:

- [Chi tiết Sale sau sửa focus](05-sale-detail-final-390.png): null rõ, focus tự chuyển vào nút Đóng; khi quay lại trả về nút mở.
- [Chi tiết với focus bàn phím](05-sale-detail-focus-390.png): kiểm tra chuyển Tab bên trong dialog.
- [Chi tiết trước sửa focus](05-sale-detail-390.png): giữ lịch sử, không dùng làm bằng chứng focus đã đạt.
- [Loading Automation](05-automation-loading-390.png): request GET bị delay có kiểm soát; dữ liệu cũ đã xóa.
- [Lỗi Automation](05-automation-error-390.png): lỗi503 giả từ harness, có nút Thử lại; lần retry lấy số thật từ DB fixture.

Tổng24 PNG; **số ảnh không phải số tests**. Một số ảnh chụp trước patch focus cuối nhưng layout của các view không đổi bởi patch đó; ảnh `detail-final` là bằng chứng sau sửa. Dữ liệu/giờ cập nhật là tại lúc chụp. Mọi bản nguồn đều working tree chưa commit, HEAD gốc `eb1be0b`; [snapshot source](../../../artifacts/reports-mobile-5a-2026-11-02/source-comparison.json). Chưa có kiểm tra độc lập5B.
