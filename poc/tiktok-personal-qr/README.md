# TT-01/TT-02 — PoC độc lập, chỉ mô phỏng

## Bổ sung khảo sát DOM thật (13/10/2026)

src/live-dom-reader.mjs là hàm thuần đọc một Document đã có, không mở browser, tự chọn hội thoại, đọc cookie hoặc gọi mạng. Nó chỉ quan sát thread đang được người dùng mở, lấy ID dạng chuỗi từ marker DOM đã thấy, direction theo avatar link và text khi includeText=true. Mặc định không trả nội dung. Trạng thái no_selected_thread/partial không được coi là đã đọc đầy đủ lịch sử.

Hàm này chưa nối live-adapter/worker; POC_MODE=live vẫn bị từ chối. Test live-dom-reader.test.mjs dùng HTML giả cùng cấu trúc selector, không phiên thật. Quan sát trực tiếp trên in-app browser đã thấy 3 ID tin giữ nguyên sau reload/khôi phục một thread; đó chưa chứng minh mọi thread, background worker, phiên hoặc tin mới hoạt động.

## Checkpoint chỉ đọc

src/read-checkpoint.mjs dùng Ledger local để giữ metadata theo account/thread đã chỉ định. Gọi observe với snapshot của reader và expectedPeerUsername cụ thể; gọi markUnavailable khi caller biết có gián đoạn. Không có send, navigation hoặc polling live trong component này. Snapshot scope sai bị từ chối trước ghi. Mặc định checkpoint không lưu text, chỉ ID, direction, content type và thời điểm quan sát.

newlyObserved nghĩa ID lần đầu thấy, có thể là lịch sử vừa cuộn tới, không tự coi là tin vừa gửi. coverageGapPossible không tự xóa sau snapshot thành công; historyComplete luôn false vì DOM hữu hạn chưa chứng minh lịch sử đầy đủ. Reader nhận diện thông báo TikTok “This message type isn’t supported…” là unsupported/null text, không lưu nó thành nội dung đọc thành công.

Ngày 13/10 đã quan sát một tin thử thật do người dùng tự gửi từ account thử xác nhận; xem docs/TIKTOK-LIVE-INBOUND-CHECKPOINT-2026-10-13.md. In-app browser và worker Chromium vẫn là hai profile riêng, không export session để nối chúng.

Chỉ mô phỏng trên loopback. QR là hình minh họa giả, không scannable và không đăng nhập TikTok. Dùng nút “Mô phỏng quét và xác nhận”. Có hộp thư và nhận/gửi văn bản giả; bridge TT05/TT06 chỉ nối CRM local khi cấu hình tường minh. Chế độ live bị từ chối, không có selector hoặc endpoint TikTok.

## Yêu cầu

Node >=20 (đã kiểm trên Node 24.21.0), package riêng Playwright 1.63.0. Nguồn .mjs dùng ESM và node:test để chạy trực tiếp, không cần compiler/dependency TypeScript của CRM. Package lock được tạo bởi npm. File nguồn giữ SPDX AGPL.

## Cài và chạy trên PowerShell

Trong thư mục này:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'runtime\browsers'
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run test:browser
npm.cmd run mock
```

Terminal thứ hai, cùng thư mục:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'runtime\browsers'
npm.cmd run worker
```

Worker mở browser để người thử bấm các nút mock. Browser visible là cần thiết cho thao tác thử này. Headless kiểm thử dùng POC_HEADLESS=true. Địa chỉ mặc định http://127.0.0.1:4317. POC_URL chỉ cho phép HTTP 127.0.0.1 và đường dẫn gốc. Bấm tạo QR giả → xác nhận. Thử checkbox sai danh tính và xác minh bổ sung. Worker chỉ log trạng thái, không log ticket/cookie.

Ctrl+C dừng worker. Khởi động lại worker trong khi mock server vẫn chạy sẽ dùng lại profile. Mock server giữ session trong RAM; restart server chủ động làm phiên vô hiệu. Đây chưa phải cơ chế persistence phía nền tảng.

## TT05 — bridge vào CRM local

Bridge mặc định tắt. Sau khi bật `CHANNELS_ENABLED=true`,
`MOCK_CHANNEL_ENABLED=true` và tạo/xác nhận một tài khoản thử trong hộp thư CRM,
chạy worker với đúng ID account, epoch trả về lúc tạo QR và một secret ngẫu nhiên
tối thiểu 32 ký tự. Backend và worker phải dùng cùng secret:

```powershell
$env:CRM_BRIDGE_URL = 'http://127.0.0.1:9000'
$env:CRM_CHANNEL_ACCOUNT_ID = '<uuid tài khoản mock trong CRM>'
$env:CRM_CHANNEL_EPOCH = '<epoch phiên mock>'
$env:MOCK_CHANNEL_WORKER_SECRET = '<secret ngẫu nhiên 32+ ký tự>'
npm.cmd run worker
```

Bridge chỉ chấp nhận backend loopback HTTP, ký từng raw body bằng HMAC, không gửi
cookie/profile/QR. Mỗi tin fixture dùng event key và message ID ổn định; backend
khử trùng theo account/event và conversation/message. Gửi từ CRM mặc định khóa cho tới
khi quản trị viên bật riêng `outboundEnabled` cho tài khoản mock.
Đây là kiểm thử pipeline local, không phải bằng chứng TikTok thật hoạt động.

## TT06 — Outbox gửi văn bản mock

Sau khi xác nhận phiên mock, quản trị viên bật **Bật gửi thử** trong panel tài
khoản. Composer chỉ xuất hiện với người có quyền `chat`. CRM ghi `Message` và
`OutboundCommand` trước; worker poll claim endpoint đã ký HMAC, thực thi lệnh
fixture bằng chính command ID của CRM rồi báo `confirmed`, `rejected` hoặc
`unknown`.

Worker không claim lại lệnh `PROCESSING` hoặc `UNKNOWN`. Nếu browser đã nhận
nhưng báo kết quả về CRM thất bại, reaper phía CRM chuyển lệnh treo thành
`UNKNOWN`; người vận hành phải đối chiếu, không tự gửi lại. Nhãn
“Đã xác nhận bởi fixture” không có nghĩa khách đã nhận hoặc đã xem.

## TT07 — Giám sát pilot mock

Khi bridge CRM được cấu hình, worker gửi heartbeat HMAC mỗi 5 giây và chạy đối
soát ID định kỳ. Heartbeat chỉ có trạng thái phiên, RSS/heap và số lượng ledger;
không chứa cookie, token, QR, profile hoặc nội dung tin.

Trong panel tài khoản mock, quản trị viên có thể xem tuổi heartbeat, tài nguyên,
trạng thái Outbox và cảnh báo đối soát. **Diễn tập rollback** tắt nhận/gửi, ngắt
phiên và tăng epoch để chặn worker cũ; command đã có vẫn được giữ nguyên.

Thông tin pilot hiện được giữ trong bộ nhớ backend và mất khi backend restart.
Điều này phù hợp kiểm thử local nhưng chưa phải hệ metric bền vững cho pilot thật.

## Quyền, dữ liệu và cleanup

Server bind loopback, kiểm Host/Origin và CSRF cho POST. Browser chặn request khác origin và service worker. Không phải sandbox bảo mật toàn máy. HTTP cookie mock dùng HttpOnly/SameSite; không dùng credential thật. Nút gửi fixture chỉ mở cho danh tính đúng và đã xác minh. Nút này thử server mock; worker CLI mới ghi intent vào ledger trước gửi.

node_modules, runtime/profile/browser và .env được ignore trong package. Profile không mã hóa at rest; mode 0700 chỉ có ý nghĩa hạn chế trên Windows, cần ACL/BitLocker nếu sau này có bí mật thật. Không chụp trace/screenshot có session mặc định.

Dọn phiên: bấm logout, dừng worker và server; xóa riêng runtime/profiles/mock-personal-01 sau khi kiểm đường dẫn tuyệt đối nằm trong thư mục PoC. Không xóa dữ liệu backend/database. Test browser tự dọn profile test nằm trong runtime với kiểm tra đường dẫn; không dọn profile thủ công.

## TT-02 — Hộp thư, ledger và mất ACK

Sau login mock, dùng ô “Tin khách/native giả” để thêm inbound hoặc tin từ điện thoại giả. Worker tự sync khoảng một giây khi không bận. Ledger JSON local ghi atomic và fsync file, khóa thao tác trong một process; không phải hệ DB production. Chỉ chạy một worker trên profile/ledger này.

Trong terminal worker:

```text
send Xin chào khách thử
fault-send Tin thử mất ACK
sync
status
```

send chỉ do người thử nhập. fault-send cố ý cho server nhận tin rồi cắt response; lệnh thành unknown, lần sync sau đối soát bằng commandId riêng của mock và chuyển confirmed. CommandId echo là khả năng fixture, chưa có bằng chứng TikTok thật có trường tương đương. Không tự gửi lại unknown. Hai tin giống nhau được giữ bởi ID riêng.

runtime/ledgers/<account>.json giữ messages/commands khi worker restart; lệnh pending/submitted còn sót được chuyển unknown, không tự phát lại. Mock server giữ lịch sử trong RAM, tối đa 1.000 tin: restart server mất history và session. Ledger giữ tin đã nhận; chưa có cơ chế phát hiện mọi gap sau server restart, chưa có request người lạ, chưa benchmark 72 giờ.

confirmed chỉ là ACK hợp lệ hoặc echo khớp trong mock, không delivered/seen. Failed đọc history không xóa ledger hoặc tự coi tin cũ là phản hồi mới. Tests TT-01 vẫn chạy; test TT-02 kiểm 20 inbound, 10 outbound, 5 native cùng nội dung, reload/dedup, restart, unknown reconciliation và lỗi mạng. Live tests tất cả NOT TESTED.

## TT08 — Hai tài khoản mock độc lập

TT08 giới hạn đúng hai định danh `mock-personal-01` và `mock-personal-02`. Mỗi worker chạy một process riêng, dùng profile, ledger và lease riêng. Lease dùng thư mục độc quyền; worker thứ hai cho cùng account dừng với `ACCOUNT_WORKER_ALREADY_LEASED`. Lease còn lại sau crash không tự bị xóa vì chưa thể chứng minh process cũ đã mất quyền sử dụng tài nguyên.

Chạy hai mock server trong hai terminal:

```powershell
$env:POC_ACCOUNT='mock-personal-01'; $env:POC_PORT='4317'; npm.cmd run mock
$env:POC_ACCOUNT='mock-personal-02'; $env:POC_PORT='4318'; npm.cmd run mock
```

Chạy worker tương ứng trong hai terminal khác, đặt `POC_ACCOUNT`, `POC_URL`, `CRM_CHANNEL_ACCOUNT_ID` và `CRM_CHANNEL_EPOCH` đúng theo từng account. Không dùng chung profile, ledger, CRM account ID hoặc epoch giữa hai process. Phạm vi này vẫn chỉ là mock/local; không mở chế độ live và không chứng minh TikTok thật hoạt động.

## TT09 — Giới hạn tài nguyên và fleet monitoring

Backend tính giới hạn worker hiệu lực bằng giá trị nhỏ hơn giữa
`MOCK_CHANNEL_MAX_WORKERS` và số worker vừa ngân sách RAM:

```text
floor((MEMORY_BUDGET_MB - MEMORY_RESERVE_MB) / PER_WORKER_MB)
```

Mặc định local là tối đa 2 worker, ngân sách 2 GB, giữ lại 512 MB và dự phòng 512 MB cho mỗi
worker. Chỉ tăng giới hạn sau khi chạy `npm.cmd run benchmark:tt09` trên đúng máy sẽ vận hành và
giữ headroom cho backend, PostgreSQL, Zalo worker và hệ điều hành.

Heartbeat TT09 bổ sung CPU process, event-loop p95, kích thước profile và ledger. Fleet endpoint
chỉ dành cho owner/admin, hiển thị slot còn lại, RAM dự phòng và các cảnh báo:
`WORKER_CAPACITY_REACHED`, `WORKER_MEMORY_RESERVATION_EXCEEDED`, `WORKER_CPU_HIGH`,
`WORKER_METRICS_INCOMPLETE`.

`POC_ACCOUNT` chấp nhận `mock-personal-01` tới `mock-personal-32`; đây chỉ là miền định danh
fixture. Số worker thực chạy vẫn bị admission gate của backend giới hạn. Kết quả benchmark mock
không được coi là số đo TikTok thật hoặc VPS production.
