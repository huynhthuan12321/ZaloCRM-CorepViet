# Live chỉ đọc — tin của hội thoại đang mở

Ngày: 13/10/2026. Người dùng yêu cầu kiểm tra và triển khai tiếp, trước đó chọn chỉ đọc account @setupxebanhcorep. Khi bắt đầu kiểm tra, một hội thoại đã được mở trong UI. Chỉ khảo sát thread đó, không chọn thread khách khác, không gửi tin.

## Bằng chứng thực

- Profile navigation trỏ account đã xác nhận; không kiểm account type trong settings.
- Vùng main-content-messages có dm-new-message-list và dm-new-chat-item.
- 3 tin văn bản đang render, mỗi tin có marker id dạng more-action-icon-msg-<digits>. ID giữ String, không Number.
- Avatar link trong row phân biệt 2 tin self và 1 tin inbound trên mẫu này.
- Sau reload TikTok trả Page not available. Bấm Try again một lần, trang trở lại Messages, chờ danh sách tải rồi mở lại đúng thread vừa khảo sát.
- 3/3 ID giữ nguyên, đều unique, thứ tự như trước. Không có tin gửi mới được tạo.

Không lưu nội dung, tên đối thoại hoặc raw ID thật vào báo cáo/repo. Browser snapshot quan sát có thể hiển thị nội dung; không export cookie, localStorage, network payload hoặc hidden React state.

## Triển khai trong lượt này

Tạo poc/tiktok-personal-qr/src/live-dom-reader.mjs: pure DOM observer, không network/click/navigation, không chạy live worker. Expected username bắt buộc, tìm profile ngoài main chat; đây là tín hiệu account quan sát trên DOM, không thay xác thực account ID phía connector. Sender thiếu/ambiguous báo unknown; ID thiếu/duplicate hoặc text không hỗ trợ trả partial/issues. Không dùng hash text/time làm ID.

Mặc định includeText=false, chỉ trả metadata của tin đang render. Không lấy timestamp từ nhãn tương đối thành epoch hoặc coi 3 tin render là toàn bộ lịch sử. System notice/reaction/media không nằm trong phạm vi text parser này. Không cố đoán direction từ màu hoặc CSS class hash.

Thêm test fixture HTML tương tự markup thật: ID lớn ngoài Number safe range, 2 text giống nhau vẫn giữ 2 tin, self/inbound, text opt-in, duplicate/missing ID, chưa chọn thread và account mismatch. Không copy HTML/data khách thật làm fixture. Cập nhật package script và README.

Live adapter vẫn stub; worker mock không dùng session in-app browser. Chưa migrate/schema hoặc nâng capability backend live. Đây là bước chuẩn bị reader có bằng chứng selector, không phải connector nhận/gửi đã hoàn thành.

## Kiểm thử

Chạy npm.cmd test: **7/7 PASS**, duration 401,3136 ms.

Chạy npm.cmd run test:browser: **3/3 PASS**, duration 7.345,8655 ms. Gồm regression TT-01, TT-02 messaging và reader fixture mới.

Tổng **10/10 PASS**. Test fixture không đăng nhập TikTok thật; live observations thực hiện riêng qua in-app browser. Không chạy lại 130 backend tests vì backend không đổi trong lượt này.

## Kết luận và cổng tiếp

PASS hạn chế cho ID/direction của 3 tin đang render và một lần reload có lỗi rồi recovery. PARTIAL cho live PoC toàn bộ. Chưa chứng minh tin mới realtime, pagination/history sâu, session của worker, restart process, account type, ACK gửi, lease hoặc quan sát dài hạn.

Đã có cơ sở thiết kế đầu đọc text theo DOM được quan sát. Không mở outbound hoặc schema production chỉ vì 3 IDs giữ nguyên. Tiếp theo cần kiểm reader trên thread thử có tin mới và phạm vi history; profile/QR worker độc lập là phép kiểm khác. Người dùng chỉ cấp scope read nên không gửi tới khách.

## File và rollback

Chỉ sửa/tạo trong PoC, tài liệu báo cáo và tiến độ roadmap. Giữ thay đổi TT-04A và file untracked trước đó. Rollback bỏ reader/test mới và revert script/README riêng; không reset repo, xóa profile hoặc database. Tab giữ handoff; mở thread có thể làm TikTok tự cập nhật read receipt, không gọi mark-read riêng.
