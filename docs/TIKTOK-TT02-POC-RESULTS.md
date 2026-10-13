# TT-02 — Hộp thư và gửi văn bản trong PoC mô phỏng

Ngày: 13/10/2026. Cơ sở: TT-01 mock đã đạt. Phạm vi user yêu cầu: đóng tab TikTok và triển khai bước tiếp; chưa chỉ định người nhận hoặc cho phép gửi tin thật. Tab TikTok đã đóng, danh sách tab iab trả rỗng. Người dùng báo đăng nhập thủ công thành công; không export, đọc hoặc dùng cookie phiên đó trong worker.

## Kết luận

Hoàn thành nền nhận/gửi mock TT-02, không chứng minh connector TikTok Personal. 7 test Node/API và 2 test browser chạy PASS (kết quả kiểm cuối bên dưới). Chưa nối CRM, migrate, deploy, AI hoặc nhiều tài khoản. TT-03 có thể tiếp tục khảo sát thiết kế nhưng không coi cổng connector thật đã PASS.

## Thay đổi

- Mock server: history, inbound/native injection, văn bản outbound với ID riêng, dedup command, kiểm identity/challenge/session, tối đa 1.000 tin.
- UI: inbox DOM có ID/thread/account/direction/source; dùng textContent để tránh HTML injection; compose fixture và fault mất ACK.
- Browser adapter: đọc DOM, gửi UI, ACK hợp lệ; failed history đọc báo lỗi, không trả DOM cũ.
- Ledger JSON local: serialize updates trong process, file tạm + fsync file + rename; lưu trước send, dedup ID, giữ hai tin giống nhau. Chưa fsync directory hoặc transactional database, không cam kết chống mọi power failure/filesystem fault.
- Recovery: pending/submitted sau restart → unknown; không retry mù. Echo mock khớp command/thread/account/text mới confirmed.
- Worker: CLI send/fault-send/sync/status, poll inbound khi connected, không log nội dung/ticket/cookie; khóa thao tác send/sync trong process.
- Chế độ live vẫn fail-closed. Package riêng, không thay dependency ZaloCRM.

## Bằng chứng test

| Phép kiểm | Kết quả mock | Live |
|---|---|---|
| QR expiry/replay, identity, verification, logout, browser profile restore | PASS, regression TT-01 | NOT TESTED |
| 20 inbound đánh số, đúng thứ tự | PASS | NOT TESTED |
| 10 outbound confirmed | PASS | NOT TESTED |
| 5 native cùng nội dung, ID khác | PASS, không gộp mất | NOT TESTED |
| Reload/sync lặp | PASS, 0 tin mới | NOT TESTED |
| Worker abstraction restart: browser + ledger mới | PASS, dữ liệu giữ | NOT TESTED |
| Accepted nhưng response ACK bị cắt | PASS, unknown rồi sync confirmed; phía fixture chỉ 1 tin | NOT TESTED |
| Abort đọc history và reconnect | PASS, lỗi không xóa ledger, sync lại không trùng | NOT TESTED |
| Wrong identity và gửi đồng thời trong controller | PASS, chặn trước intent/chặn BUSY | NOT TESTED |
| Unknown tự retry | Không có đường auto retry; test xác nhận send chỉ gọi 1 lần | NOT TESTED |
| History sâu/phân trang/requests | PARTIAL: mock trả toàn bộ tối đa 1.000 tin, không requests | NOT TESTED |
| Quan sát 72 giờ, sức chứa và p50/p95 | NOT TESTED; chỉ biết duration suite | NOT TESTED |

Fault đầu tiên chỉ destroy socket khiến Chromium tự thử lại ở tầng HTTP và nhận ACK. Đã sửa fixture phát response JSON chưa hoàn chỉnh trước disconnect; browser không nhận ACK hợp lệ. Server mock dedup theo commandId, không giả định TikTok có idempotency này.

## File sửa/tạo

Sửa trong poc/tiktok-personal-qr: package.json, mock/server.mjs, mock/public/index.html, src/browser-adapter.mjs, src/worker.mjs, README.md. Tạo src/ledger.mjs, src/send-controller.mjs, tests/ledger.test.mjs, tests/messaging.test.mjs và báo cáo này. Không thay code backend/frontend/schema, không đọc credential thật. TT-01 report giữ như lịch sử.

## Chạy và vận hành

Theo README: terminal mock, terminal worker, PLAYWRIGHT_BROWSERS_PATH trỏ runtime/browsers. Login bằng nút QR giả. Thêm tin inbound/native trong UI; gửi bằng CLI để đi ledger. Compose fixture trên UI là thao tác test server, không phải Outbox worker. Worker tự sync, unknown có thể được đối soát nhanh sau đó.

Một process/ledger. Server RAM mất session/history khi restart; profile browser vẫn có cookie nhưng cookie không còn valid. Ledger không bị xóa. Chưa phát hiện mọi missing gap/server generation; ghi giới hạn, không gọi full recovery đã đạt. Memory ledger/history bounded theo fixture sử dụng; không chạy lâu dài với dữ liệu thật.

## Rollback và bước sau

Dừng mock/worker, giữ runtime/ledger để đối soát hoặc xóa riêng khi xác nhận dữ liệu mock disposable. Xóa test artifacts phải verify resolved paths nằm trong runtime PoC. Không volume/database production. Không commit session/runtime.

Dừng trước TT-03. Live test cần xác nhận Personal thực tế, account/người nhận thử, host và quyền sử dụng phù hợp; không lấy đăng nhập thủ công thành công làm bằng chứng nhận/gửi/ID/ACK của connector.
