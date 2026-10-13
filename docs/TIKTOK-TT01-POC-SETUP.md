# TT-01 — PoC phiên QR mô phỏng độc lập

Ngày: 13/10/2026. Cơ sở: TT-00 tại main/bf31cdf. Trạng thái: hoàn thành nền mock TT-01; không kết nối TikTok thật, không thực hiện TT-02.

## Kết quả

- Package riêng tại poc/tiktok-personal-qr, không sửa dependency/backend/frontend/schema CRM.
- Mock server HTTP loopback 127.0.0.1:4317; kiểm Host, Origin và CSRF cho mutation.
- QR giả là hình minh họa và ticket nội bộ một lần, TTL 60 giây. Không phải QR scannable, không dùng TikTok Login Kit.
- Mock cookie HttpOnly/SameSite, TTL một giờ. State server trong RAM.
- Browser worker persistent profile riêng cho mock-personal-01, xác nhận danh tính trước connected; sai danh tính/cần xác minh/hết phiên khóa canSend.
- Browser chặn request ngoài origin mock, service worker và downloads. Đây là phạm vi request adapter, không phải sandbox toàn máy.
- Log worker chỉ có trạng thái. Trace/screenshot và logging nội dung không bật.
- Live adapter là stub fail-closed; POC_MODE khác mock bị từ chối. Chưa có endpoint/selector/cookie TikTok thật.

## Quyết định implementation

Dùng Node ESM .mjs với node:test thay TypeScript trong PoC để không kéo compiler hoặc dependency CRM. Node thực tế 24.21.0; package yêu cầu >=20. Playwright khóa 1.63.0 và npm tạo package-lock.json. Dependency và Chromium chỉ cài vào package/runtime riêng, không sửa global Node/npm hoặc package ứng dụng.

Không tạo ledger/outbox/tin nhắn ở TT-01. Chúng thuộc TT-02. canSend chỉ là gate identity nền; nút gửi trên UI vẫn disabled.

## File tạo

```text
poc/tiktok-personal-qr/
  package.json
  package-lock.json
  .gitignore
  README.md
  src/config.mjs
  src/session.mjs
  src/browser-adapter.mjs
  src/live-adapter.mjs
  src/worker.mjs
  mock/server.mjs
  mock/public/index.html
  tests/session.test.mjs
  tests/browser.test.mjs
```

runtime/browsers và node_modules là tài nguyên local ignored. Profile production hoặc tài khoản thật không được tạo. Test profile tạm đã cleanup; browser tests dừng browser và server khi kết thúc.

## Kiểm thử đã chạy

| Lệnh | Kết quả | Phạm vi |
|---|---|---|
| npm.cmd test | 4/4 PASS | Config fail-closed, identity/challenge/expiry, QR expiry/replay/logout, CSRF |
| npm.cmd run test:browser | 1/1 PASS | Chromium headless: QR giả, profile restore qua browser restart, logout, sai identity, challenge/verify, chặn request ngoài mock |

Test không bỏ qua browser khi thiếu binary. Ban đầu Node test bị sandbox chặn spawn EPERM; chạy lại với quyền thực thi cần thiết và đạt. Chromium được tải về runtime riêng. Không có automatic-review rejection hoặc yêu cầu người dùng gửi session.

TT-00/01 chưa chứng minh QR TikTok thật, DM Personal, message ID, self-message thật hoặc quyền sử dụng; tất cả live NOT TESTED. Tests nhận/gửi/unknown/history và quan sát 72 giờ chưa chạy ở TT-01. Không chạy suite CRM vì không đổi code ứng dụng.

## Cách chạy

Đọc poc/tiktok-personal-qr/README.md. Tại thư mục PoC, PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'runtime\browsers'
npm.cmd run mock
```

Terminal thứ hai cùng thư mục:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'runtime\browsers'
npm.cmd run worker
```

Browser mở để bấm tạo QR giả và mô phỏng xác nhận; không quét bằng điện thoại. Có checkbox thử sai danh tính/challenge và nút logout. Dừng bằng Ctrl+C. Worker restart khi mock server còn chạy tái sử dụng profile; restart mock server làm session server mất và phải login mock lại.

## Bảo vệ dữ liệu / giới hạn

Profile local chưa mã hóa at rest; Unix mode 0700 không thay ACL Windows. Chưa đặt credential thật vào đây. README ghi cần bảo vệ filesystem nếu mở rộng. Server không có TLS vì chỉ mock loopback. Mọi người dùng cùng máy có quyền filesystem/browser vẫn là yếu tố ngoài phạm vi mock. Session server RAM có giới hạn vận hành fixture, không production.

QR giả chưa là phép thử scan thực trên điện thoại. UI read-only chưa có hội thoại. Live mode intentionally unimplemented, không tự suy selector từ ảnh hoặc gọi endpoint nội bộ.

## Rollback và bước tiếp

Không có migration/deploy. Dừng mock/worker; bỏ riêng thư mục PoC và báo cáo TT-01 nếu muốn rollback, không chạm các file untracked trước đó. Trước xóa profile/runtime phải kiểm resolved path nằm trong PoC; không xóa volume/database.

TT-02 tiếp theo mới bổ sung hộp thư mô phỏng, ledger và gửi văn bản thủ công với trạng thái unknown. Test thật là nhánh riêng sau khi có tài khoản/môi trường và quyền sử dụng phù hợp. Không tự chuyển TT-02 hoặc mở nhiều tài khoản.
