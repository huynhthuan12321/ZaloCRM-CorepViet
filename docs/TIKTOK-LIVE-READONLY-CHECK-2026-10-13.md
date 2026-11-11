# Kiểm tra TikTok thật — chỉ đọc danh sách hội thoại

Ngày: 13/10/2026. Account được người dùng xác nhận: @setupxebanhcorep. Người dùng chọn phạm vi chỉ đọc; chưa chỉ định hội thoại thử hoặc người nhận/nội dung gửi. Không gửi tin, không mở thread khách.

## Kết quả thực quan sát

| Hạng mục | Kết quả |
|---|---|
| Phiên đăng nhập | Trang messages mở được trong in-app browser; link Profile trỏ @setupxebanhcorep |
| Hộp thư | https://www.tiktok.com/messages?lang=en có danh sách hội thoại |
| Marker DOM | data-e2e=dm-new-conversation-list và dm-new-conversation-item |
| Thread identity | Wrapper có data-conversation-id; item có id DOM |
| Mẫu đang hiển thị trước reload | 30 threads, 30 ID unique, 0 ID rỗng |
| Sau một lần reload khi danh sách tải xong | 30 threads, 30 unique, 30 ID giữ nguyên; thứ tự giống trước reload |
| Loading | Kiểm ngay sau reload ban đầu trả 0 rows; wait locator một lần timeout, sau quan sát kế tiếp danh sách tải đủ. Không coi empty lúc loading là không có hội thoại |
| Nội dung tin riêng trong thread | NOT TESTED: chưa có thread thử được chỉ định |
| Stable message ID, self sync, history, send/ACK | NOT TESTED |
| Loại tài khoản Personal trong settings | Chưa xác minh; username và URL Messages không chứng minh account type |

Không lưu danh sách tên khách, nội dung preview, raw conversation IDs, cookie hoặc QR vào report. Browser snapshot/screenshot khi quan sát có thể hiển thị preview; không xuất dữ liệu đó thành artifact trong repo.

## Phạm vi kỹ thuật

Đọc DOM đang hiển thị qua công cụ browser, không đọc network nội bộ, cookies, localStorage/sessionStorage, hidden React state hoặc endpoint nội bộ. Không export/import phiên sang worker. Không click hội thoại, mark read chủ động, gửi tin, like/follow hay chấp nhận request.

Tab hộp thư được giữ handoff để người dùng chọn hội thoại thử. Đây là cùng profile in-app browser đã được người dùng đăng nhập thủ công; không phải profile Chromium PoC. Vì vậy kết quả này chưa chứng minh worker tự QR, headless, restore session hay vận hành 72 giờ.

## Kết luận

PASS cho việc truy cập hộp thư thật và quan sát thread IDs giữ nguyên trong một lần reload trên 30 rows hiện có. Chưa kiểm total history/pagination hoặc thay đổi danh sách; không cam kết ID ổn định lâu dài.

PARTIAL cho live PoC tổng thể. Không nâng capability TIKTOK_WEB_SESSION, không mở schema/migration hoặc outbound vì thread identity được quan sát. Cổng message identity/correlation/recovery vẫn chưa đạt.

## Bước cần dữ liệu đầu vào tiếp

Người dùng chỉ định tên/username một hội thoại thử được phép đọc. Sau đó mới xem DOM message IDs, direction và lịch sử của thread đó. Việc mở hội thoại có thể khiến TikTok cập nhật đã xem tự động; cần nêu cho người dùng khi chọn thread. Không tự chọn thread khách để kiểm tra.

Test gửi là scope riêng, cần recipient thử đã đồng ý và nội dung cụ thể; người dùng hiện chọn chỉ đọc nên không thực hiện.

## Thay đổi trong lượt này

Chỉ tạo báo cáo và cập nhật tiến độ roadmap. Không chỉnh backend/frontend/schema/PoC/config hoặc dependency. Những sửa TT-04A và untracked file trước đó giữ nguyên. Không deploy, migrate, commit hoặc gọi connector gửi thật.
