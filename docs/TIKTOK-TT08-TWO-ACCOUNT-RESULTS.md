# TT08 — Nghiệm thu hai tài khoản mock độc lập

Ngày nghiệm thu: 13/10/2026.

## Kết luận

TT08 **PASS trong phạm vi mock/local với đúng hai tài khoản**. Hai account có profile, ledger,
lease, epoch, ACL, outbox, heartbeat và rollback tách biệt. Ngắt account A không làm account B
mất kết nối hoặc ngừng claim lệnh.

Kết quả này không chứng minh hai tài khoản TikTok thật hoạt động, không mở production và
không thay đổi cổng `readyForRealPilot=false`.

## Phần đã triển khai

- Backend cho phép tối đa hai `MOCK_BROWSER` account trong một tổ chức; account thứ ba bị từ
  chối với `TT08_TWO_ACCOUNT_LIMIT`.
- UI cho phép tạo account thứ hai và ẩn form khi đã đạt giới hạn.
- Worker yêu cầu `POC_ACCOUNT=mock-personal-01|mock-personal-02`.
- Tài nguyên tách theo account:
  - `runtime/profiles/<account>`;
  - `runtime/ledgers/<account>.json`;
  - `runtime/leases/<account>`.
- Lease thư mục độc quyền chặn hai worker dùng cùng account. Hai account khác nhau có thể giữ
  lease đồng thời.
- Mock server nhận account và port riêng; mặc định account 01 dùng 4317, account 02 dùng 4318.
- Pilot API và UI giữ heartbeat, Outbox, sự kiện gần nhất và cảnh báo theo từng account.
- Rollback chỉ xóa runtime pilot của account được chọn, tăng epoch và tắt inbound/outbound của
  account đó.

## Bằng chứng nghiệm thu

PostgreSQL 16.15 acceptance dùng full schema tổng hợp, không dùng dữ liệu production:

- 17/17 nhóm PASS.
- Evidence: `TIKTOK-TT08-ACCEPTANCE-EVIDENCE.json`.
- SHA-256: `F4C1E83E5EB768CF51978837AD8A7743CCF2D99D8686B03BA5291910CCE98642`.
- ACL: user có quyền account A không đọc account B và ngược lại.
- Hai lệnh được ghi và claim đồng thời theo đúng account/epoch.
- Kết quả gửi của A và B được resolve độc lập.
- Heartbeat A và B không ghi đè nhau.
- Rollback A giữ nguyên trạng thái `CONNECTED`, inbound/outbound và epoch của B.
- Claim bằng epoch cũ của A không ngăn B claim và hoàn tất lệnh.
- PostgreSQL kiểm thử đã dừng sau khi hoàn tất.

Kiểm tra bổ sung:

| Kiểm tra | Kết quả |
|---|---:|
| Backend channel unit | 58/58 PASS |
| Backend TypeScript | PASS |
| Frontend toàn bộ | 67/67 PASS |
| Frontend production build | PASS; còn warning chunk lớn có sẵn |
| PoC Node | 19/19 PASS |
| PoC browser | 3/3 PASS |
| `git diff --check` | PASS; chỉ có cảnh báo LF/CRLF trên file có sẵn |

Lần chạy toàn bộ backend có 881 test PASS, 24 skipped và các suite khác FAIL vì các file module
không tồn tại, database test không được cấu hình và một số assertion cũ không khớp hành vi hiện
tại. Các lỗi đó nằm ngoài phần channel TT08; channel unit, typecheck và acceptance PostgreSQL
đều PASS.

## File chính

- `backend/src/modules/channels/mock-channel-account-routes.ts`
- `backend/src/modules/channels/pilot-routes.ts`
- `backend/scripts/channels/acceptance-local.ts`
- `frontend/src/components/chat/channel-mock-account-panel.vue`
- `poc/tiktok-personal-qr/src/config.mjs`
- `poc/tiktok-personal-qr/src/account-lease.mjs`
- `poc/tiktok-personal-qr/src/worker.mjs`
- `poc/tiktok-personal-qr/mock/server.mjs`
- `poc/tiktok-personal-qr/tests/multi-account.test.mjs`

## Giới hạn và rollback

- Chỉ hai account mock đã được kiểm chứng. Không mở rộng số worker ở TT08.
- Lease sót sau crash cần người vận hành xác minh process cũ đã dừng rồi mới xóa đúng thư mục
  lease của account; hệ thống không tự đoán stale lease.
- Pilot runtime vẫn nằm trong bộ nhớ backend và mất sau restart.
- Không có đo tải nhiều ngày hoặc số liệu RAM/CPU cho TikTok thật.
- Rollback code: đặt giới hạn tạo account về một, bỏ cấu hình account 02 và lease; dữ liệu đã
  ghi vẫn giữ để đối soát.
- Rollback vận hành: gọi rollback riêng account cần dừng; không xóa profile, ledger, command
  hoặc database hàng loạt.

TT08 dừng tại mock/local. TT09 chưa triển khai.
