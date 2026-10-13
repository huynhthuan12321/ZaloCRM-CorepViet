# TikTok TT11 login diagnostic — 2026-10-14

## Kết quả

- Đã tái hiện lỗi trên profile production của `@setupxebanhcorep`.
- Worker đã nhận đúng epoch hiện hành từ CRM (`21`); epoch bootstrap `1` không còn chặn luồng.
- Trang TikTok thật tải được trang login và route QR (`/login/qrcode`).
- Nguyên nhân của lỗi trước đó là luồng worker báo trạng thái khi DOM login chưa ổn định, thiếu chờ render, và không phân biệt được login pending, QR hết hạn, yêu cầu xác minh và từ chối mật khẩu.

## Thay đổi

- Chờ tối đa 15–20 giây cho lựa chọn QR, chế độ mật khẩu, input và nút submit xuất hiện.
- Giữ trạng thái `login_pending` khi TikTok chưa trả kết quả, thay vì coi ngay là QR hết hạn.
- Phân loại thông báo trang thành `challenge`, `TIKTOK_LOGIN_REJECTED` và `expired`.
- Không chạy đồng bộ hộp thư khi báo cáo session bị CRM từ chối (`409`).
- UI hiển thị hướng dẫn xác minh và thông báo lỗi dễ hiểu hơn.

## Kiểm tra

- Worker: 11/11 test đạt.
- Backend test liên quan TikTok: 25/25 đạt.
- Backend build: đạt.
- Frontend: 69/69 test đạt; build đạt.
- Test toàn bộ backend vẫn có lỗi có sẵn ngoài phạm vi thay đổi (module Enterprise thiếu và DB test cục bộ).
- Đã build và recreate app/worker trên VPS. Zalo app health `200`, worker không restart.

## Phạm vi và rollback

- Không thay đổi schema, không migrate, không bật outbound TikTok, không gửi tin tự động.
- Rollback bằng image `zalocrm-corepviet-app:pre-loginfix-20261013` và `zalocrm-corepviet-tiktok-personal-worker:pre-loginfix-20261013`.
- Chưa coi login thật là PASS; cần thao tác lại một lần trên UI với QR mới hoặc tài khoản/mật khẩu do chủ tài khoản nhập trực tiếp.

## Kiểm tra lại sau phản hồi thất bại (epoch 23)

- Ảnh CRM cho thấy `TIKTOK_LOGIN_REJECTED`; thông báo đang gộp nhiều nguyên nhân, chưa đủ kết luận sai mật khẩu.
- Kiểm tra profile production sau khi dừng riêng worker: truy cập `/messages` chuyển về `/login`. Chưa có bằng chứng phiên đăng nhập thành công được lưu.
- Phát hiện nhánh thiếu: TikTok có thể chuyển về `/foryou` sau đăng nhập, nhưng worker chỉ kiểm tra selector hộp thư. Đã thêm quay về hộp thư khi thấy liên kết Messages trên trang TikTok ngoài `/login`. Chưa chứng minh đây là nguyên nhân của lần quét cụ thể.
- Bổ sung log `login_observation` chỉ có state, pathname và nhóm lý do (`attempt_limit`, `credentials_rejected`, `account_not_found`, `login_unavailable`). Không ghi nội dung trang, input, query URL, cookie hay token.
- Worker: 13/13 kiểm tra đạt với `node --test --test-isolation=none tests/*.test.mjs` (sandbox chặn spawn của npm test thông thường).
- Cần một lần chủ tài khoản thử QR mới để thu bằng chứng trực tiếp. Chưa coi unit test là đăng nhập thật PASS.
