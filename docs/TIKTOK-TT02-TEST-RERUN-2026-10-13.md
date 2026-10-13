# Báo cáo chạy lại test TT-01/TT-02

Ngày: 13/10/2026. Phạm vi: package poc/tiktok-personal-qr trên máy local; mock HTTP loopback và Chromium headless. Không dùng TikTok thật hoặc database CRM.

## Kết quả thực chạy

| Lệnh | PASS | FAIL | SKIP | Thời gian suite |
|---|---:|---:|---:|---:|
| npm.cmd test | 7 | 0 | 0 | 409,7661 ms |
| npm.cmd run test:browser | 2 | 0 | 0 | 6.764,0303 ms |
| Tổng | 9 | 0 | 0 | Khoảng 7,17 giây theo duration hai suite |

Tiến trình kết thúc exit code 0. PLAYWRIGHT_BROWSERS_PATH trỏ runtime/browsers trong package PoC. Thời gian suite không phải độ trễ tin nhắn, benchmark CPU/RAM hoặc bằng chứng uptime.

## Những gì đã kiểm

1. Ledger tồn tại qua load lại; dedup theo ID giữ được hai tin giống nội dung; submitted sau restart chuyển unknown.
2. Timeout không tự gửi lại; echo khớp command chuyển unknown sang confirmed; test xác nhận adapter send gọi một lần.
3. Sai danh tính chặn trước tạo intent; gửi đồng thời bị chặn BUSY.
4. Config từ chối live và URL ngoài loopback.
5. Session chặn gửi khi sai danh tính, cần xác minh hoặc hết phiên.
6. QR ticket hết hạn/dùng lại bị từ chối; challenge, cookie/session và logout đúng.
7. Mutation thiếu CSRF hoặc khác origin bị chặn.
8. Chromium kiểm QR giả, profile restore qua restart browser, logout, sai identity, challenge và chặn truy cập ngoài mock.
9. Chromium kiểm 20 inbound, 10 outbound, 5 native cùng nội dung, reload không trùng, mất ACK sau accept, restart browser/ledger, sync đối soát và abort/reconnect đọc history. Fixture có 36 tin cuối test; tin mất ACK xuất hiện đúng một lần. Logout chặn gửi.

## Giới hạn và kết luận

PASS cho hành vi được kiểm trên mô phỏng. Chưa kiểm DM TikTok thật, QR điện thoại thật, ID/ACK nền tảng, message requests, lịch sử phân trang sâu, 72 giờ hoặc sức chứa worker. Restart kiểm browser và ledger mới trong harness, chưa phải diễn tập kill tiến trình/host hoặc power failure. Echo commandId và idempotency là khả năng của mock, không giả định TikTok hỗ trợ.

Test browser dọn profile/ledger tạm và dừng browser/mock server qua finally; không khởi chạy service thường trực. Không sửa code trong lượt chạy lại. Không chạy suite ZaloCRM vì không thay ứng dụng; không migrate/deploy. Dừng trước TT-03.
