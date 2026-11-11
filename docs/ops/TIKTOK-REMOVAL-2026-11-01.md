# Gỡ tích hợp TikTok Personal

- Ngày: 01/11/2026, Asia/Ho_Chi_Minh. Trạng thái: **PASS cho phạm vi mã nguồn và kiểm tra local**.
- Reference HEAD: `1b910e3`. Đây là working tree chưa commit, có thay đổi AI/Báo cáo và tài liệu từ trước. Không tạo commit mới.
- Yêu cầu: bỏ dự án TikTok tích hợp khỏi CRM. Không chạy migration, truy vấn DB, gửi tin, gọi provider hay deploy.

## Trước và sau

Trước: CRM đăng ký API TikTok Personal, hỗ trợ QR/password/verification và worker browser, có tab TikTok trong chat và service Compose riêng.

Sau: xóa 67 file gồm worker, POC, API/config/state/login-control, test riêng TikTok, trang acceptance và script acceptance phụ thuộc POC. Gỡ import/route registration, health metadata, tab/panel kết nối và service/volume declaration trong Compose. Các điểm ingress, outbound, background event processing, socket/ACL và inbox chỉ cho phép provider mock khi cấu hình local/test cho phép. Không còn giải quyết secret của worker TikTok; provider đã nghỉ bị từ chối kể cả cấu hình cũ còn tồn tại.

Kênh thử nghiệm còn dùng cấu hình `mock-channel-config.ts`, độc lập hoàn toàn với TikTok. Hạ tầng kênh dùng chung được giữ để tránh ảnh hưởng phạm vi phân quyền và đường chat Zalo hiện có.

## Bằng chứng source đã đối chiếu

- `backend/src/app.ts:291`: đăng ký các route kênh chung/mock, không còn import hoặc register TikTok. `:406`: health giữ Messenger, bỏ TikTok.
- `backend/src/config/mock-channel-config.ts:2`: chỉ bật mock với NODE_ENV development/test và hai flag CHANNELS_ENABLED/MOCK_CHANNEL_ENABLED.
- `backend/src/modules/channels/channel-scope.ts:15`: allowlist chỉ có MOCK_BROWSER; `:22` áp provider vào predicate cùng orgId.
- `backend/src/modules/channels/worker-auth.ts:38`: chỉ dẫn xuất secret mock; `:39` trả null với provider khác.
- `backend/src/modules/channels/channel-inbox-routes.ts:18`: schema filter chỉ còn all/zalo/mock.
- `frontend/src/views/ChatView.vue:246`: danh sách tab chỉ còn tất cả, Zalo, thử nghiệm; panel TikTok đã xóa.
- `docker-compose.yml`: không còn service/profile/build context/named volume declaration TikTok. Không thao tác Docker runtime hay xóa volume thật.

Danh sách từng file đã xóa/sửa cùng hash trước/sau nằm ở `artifacts/tiktok-removal-2026-11-01/removal-manifest.json`. File này được chụp trước khi cập nhật README; README là thay đổi tài liệu bổ sung trong lượt này.

## Phần được giữ có chủ đích

- Migration Prisma lịch sử, enum/schema cũ: phục vụ tương thích dữ liệu, không còn connector Personal sử dụng chúng. Không sửa lịch sử migration hoặc drop dữ liệu.
- Trường socialTiktok và biến template trong hồ sơ khách: chỉ là liên kết khách hàng nhập tay.
- Nhãn/metadata nguồn `tiktok-leadgen` trong danh sách lead và schema dùng chung: là nguồn marketing khác với connector Personal vừa gỡ; không có adapter TikTok Personal còn hoạt động. Các lựa chọn marketing này chưa được thay đổi trong phạm vi gỡ connector chat.
- Tài liệu audit/ops và SQL kiểm chứng lịch sử: chỉ là bằng chứng cũ, không phải hướng dẫn bật lại tính năng trong source hiện tại.
- Thư mục ignored chứa dependency, runtime, browser profile/session và ảnh chẩn đoán: không duyệt nội dung, không sao lưu hoặc xóa. Không đưa dữ liệu đăng nhập vào báo cáo.

## Bản sao trước khi xóa

[source-backup.zip](../../artifacts/tiktok-removal-2026-11-01/source-backup.zip) chứa 96 file nguồn/tài liệu cấu hình được chọn theo allowlist, gồm cả thay đổi TikTok chưa commit và bản trước sửa của các file dùng chung. Không sao lưu .env, browser profile hay node_modules. `manifest.json` lưu SHA-256 từng file; `git-status-before.txt` lưu trạng thái trước patch. Đây là artifact local, không phải module được build/đăng ký lại.

## Kiểm tra thực tế

1. Tại backend: `node node_modules/typescript/bin/tsc --noEmit --pretty false` — **exit 0**.
2. Tại frontend: `npm run build` (vue-tsc -b và vite build) — **exit 0**. Vite còn cảnh báo chunk lớn hơn 500 kB và thời gian plugin; không phải lỗi build.
3. Tại backend:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/mock-channel-config.test.ts tests/unit/channel-worker-auth.test.ts tests/unit/channel-access-realtime.test.ts tests/unit/channel-inbox-http.test.ts tests/unit/channel-outbound-routes.test.ts tests/unit/channel-event-processor.test.ts tests/unit/channel-pilot-routes.test.ts tests/unit/mock-channel-account-routes.test.ts tests/unit/health-check.test.ts
```

Kết quả lúc 19:17:47: **9 file, 55 test PASS**. Có thêm kiểm tra filter `channel=tiktok` trả 400, provider cũ không có capability và không dẫn xuất/verify được worker secret. Các ca mock, scope, redaction, outbox và health tiếp tục đạt. Lần chạy đầu bị EPERM khi Vitest rename cache tạm, chưa chạy được test; lần chạy ngoài sandbox dùng cùng mã đã đạt.

4. Tìm `tiktok-personal`, `tt04-acceptance`, `tiktokChannelAccountRoutes`, `resolveTikTokPersonalConfig` trong backend/src, frontend/src, backend/scripts và docker-compose.yml — **không còn kết quả**.
5. Đối chiếu SHA-256 snapshot Báo cáo `docs/reports-fix/01-source-snapshot.json` — **20/20 file giữ nguyên**. Không thay đổi kết luận FAIL của kiểm tra 1B trước đó.

## Giới hạn và bước tiếp theo

Test HTTP dùng Fastify inject với Prisma/auth/provider giả; chưa phải integration DB/RLS, browser đăng nhập thật hoặc nghiệm thu production. Không khởi động app có queue/cron thật. Build mới chỉ tạo artifact local; hệ thống/container đang chạy chưa được restart hoặc triển khai. Nếu đã có worker TikTok đang chạy riêng, việc dừng worker và xử lý session/volume thuộc thao tác vận hành tiếp theo, chưa được thực hiện ở đây.
