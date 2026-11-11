# Kiểm nhận tin thật và checkpoint chỉ đọc

Ngày: 13/10/2026. Scope: account @setupxebanhcorep, chỉ đọc; không gửi thay người dùng, không cookie/profile export, không schema/migration.

## Tin thử thật

Người dùng xác nhận có account thử thứ hai và đã gửi. Tin xuất hiện ở đầu danh sách từ “Mở xe bánh Cờ Rếp”, preview “Hế lô”; người dùng xác nhận đúng tin thử. Sau xác nhận mới mở thread này, profile đối thoại là @bepbanhcrep.

Quan sát:
- Danh sách có unread mới, không phải tin giả mock.
- Thread render 2 rows có 2 ID riêng: tin thử văn bản và một tin cũ không hỗ trợ.
- Tin thử đúng nội dung người dùng xác nhận, sender avatar link thuộc account thử.
- Đọc lại: 2 IDs unique như trước, 0 ID mới, tin thử xuất hiện đúng một lần.
- Message list không có overflow: scrollHeight bằng clientHeight; chưa có trường hợp pagination lịch sử dài để thử. Không cố cuộn hoặc mở thread khách khác.

Không ghi raw IDs hoặc nội dung khách khác vào báo cáo. Nội dung “Hế lô” là tin thử đã được xác nhận. Mở thread có thể khiến TikTok cập nhật read receipt tự động; không gọi mark-read riêng. Chưa gửi phản hồi.

## Code triển khai

- live-dom-reader.mjs: thêm expectedPeerUsername để tránh đọc nhầm thread; nhận diện fallback unsupported chính thức thành contentType=unsupported, text=null. Không chuyển placeholder thành tin văn bản đã đọc đủ.
- read-checkpoint.mjs: component nhận snapshot, lưu metadata bằng Ledger atomic hiện có; key account/thread explicit, dedup ID, scope guards, interruptions và coverageGapPossible. Không có network/browser navigation/send.
- Tests: read-checkpoint.test.mjs mới; live-dom-reader.test.mjs thêm peer mismatch/unsupported; package script và README cập nhật.

Checkpoint lưu ID, direction, contentType và thời điểm quan sát, không lưu text. newlyObserved không tự đồng nghĩa tin gửi mới: ID có thể được thấy lần đầu khi tải lịch sử. Snapshot thành công không tự xóa coverage gap; không tuyên bố historyComplete. Caller phải gọi markUnavailable khi phát hiện lỗi/restart; component không tự phát hiện mọi khoảng mất tin.

Component kiểm trên fixture local, chưa nối session in-app browser vào worker hoặc CRM. Quan sát thật được làm qua browser tool riêng; không tuyên bố file checkpoint đã ingest dữ liệu khách thật. Live-adapter vẫn chưa có runtime transport và backend live capability false.

## Kiểm thử

Chạy Node suite: **8/8 PASS**, duration 539,0112 ms; browser suite: **3/3 PASS**, duration 7.219,3982 ms trước chỉnh assertion metadata cuối. Sau chỉnh assertion, Node suite chạy lại **8/8 PASS**, duration 496,2163 ms. Test mới kiểm persistence, restart, scope mismatch, duplicate batch, history ID mới, gap giữ rõ và không tạo outbound command/không lưu text.

Các test fixture không dùng tài khoản thật. Quan sát thật xác nhận một incoming text; chưa kiểm headless worker, polling nền thật, profile restart, received timestamp p50/p95, tổng history hoặc ACK gửi.

## Kết luận và cổng

PASS hạn chế cho tin inbound thử hiển thị trên Web và có ID. PARTIAL cho nhận/đồng bộ live tổng thể. Unsupported cũ là bằng chứng không được gọi tất cả nội dung đã đọc đủ chỉ vì Web có danh sách.

Tiếp theo hợp lý: kiểm selected-thread reader với tin mới bổ sung/lịch sử dài theo scope được chỉ định và thiết kế runtime nhận chỉ đọc riêng. Chưa bật gửi, migrate hoặc cấp capability tự động từ kết quả này. Loại tài khoản Personal trong settings và quyền sử dụng worker vẫn cần xác minh độc lập.

## Rollback

Chỉ bỏ component/checkpoint test mới, thay đổi reader/script/README và tài liệu lượt này nếu cần; giữ các thay đổi TT-04A và PoC trước đó. Runtime fixture test cleanup giới hạn trong PoC; không xóa phiên thật, CRM DB hoặc volume. Không deploy/commit.
