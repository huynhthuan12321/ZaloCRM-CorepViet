# TT10 — Media, AI và automation: kết quả triển khai foundation

Ngày kiểm tra: 13/10/2026
Phạm vi: local repository, không deploy, không migrate production, không kết nối tài khoản TikTok thật.

## Kết luận

**FOUNDATION PASS / LIVE CAPABILITY NOT IMPLEMENTED.**

TT10 đã bổ sung hợp đồng capability và cổng chính sách theo hướng fail-closed. Việc đặt biến môi trường không thể tự tạo khả năng đọc/gửi ảnh, khởi tạo hội thoại, AI tự gửi, automation hoặc broadcast. Các chức năng này hiện đều trả `false` cho TikTok Personal và mock connector.

Kết quả này không chứng minh TikTok thật hỗ trợ media hoặc AI tự gửi. TT10 chưa thêm transport media, chưa sửa AI service để gửi qua TikTok và chưa nối sequence/broadcast vào kênh TikTok.

## Phần đã triển khai

### 1. Cờ cấu hình

Thêm hai cờ yêu cầu, mặc định tắt:

```env
TIKTOK_MEDIA_ENABLED=false
TIKTOK_AI_AUTO_SEND_ENABLED=false
```

`resolveTikTokPersonalConfig()` đọc các cờ này nhưng giữ toàn bộ capability live ở trạng thái tắt:

- `effective.media = false`
- `effective.aiAutoSend = false`
- `effective.automation = false`
- `effective.broadcast = false`

Nếu cờ con được yêu cầu khi cờ cha hoặc outbound chưa bật, cấu hình trả cảnh báo nhưng không làm ứng dụng production dừng và không mở capability.

### 2. Hợp đồng capability

`ChannelCapabilities` đã có các trường:

- `imageRead`
- `imageSend`
- `canInitiate`
- `aiAutoSend`
- `automation`
- `broadcast`

Cả provider không khả dụng và `MOCK_BROWSER` đều giữ các capability TT10 ở `false`. Mock hiện chỉ chứng minh luồng văn bản local, không được dùng làm bằng chứng cho TikTok live.

### 3. Cổng chính sách TT10

Thêm `channelExtensionPolicy()` để tính quyền sử dụng cuối cùng từ cấu hình và capability của provider:

- Gửi văn bản thủ công chỉ theo `textSend`.
- Nhận/gửi ảnh cần đồng thời có effective media flag và capability provider.
- `canInitiate`, AI tự gửi, automation và broadcast luôn `false`.

API inbox trả các capability này cho frontend. Frontend đã mở rộng kiểu dữ liệu để đọc contract mới, chưa hiển thị nút media hay automation TikTok.

### 4. Bảo vệ luồng Zalo hiện tại

Không đổi transport AI/automation đang dùng cho Zalo:

- `ai-auto-reply-service.ts` vẫn yêu cầu `zaloAccountId` và quan hệ `zaloAccount`.
- `ai-followup-cron.ts` vẫn yêu cầu tài khoản Zalo.
- `stage-followup-cron.ts` lọc `zaloAccountId: { not: null }`.
- Không nối sequence hoặc broadcast Zalo sang TikTok.

## File thuộc thay đổi TT10

- `.env.example`
- `backend/src/config/tiktok-personal-config.ts`
- `backend/src/modules/channels/channel-types.ts`
- `backend/src/modules/channels/channel-capabilities.ts`
- `backend/src/modules/channels/channel-extension-policy.ts`
- `backend/src/modules/channels/channel-inbox-routes.ts`
- `backend/tests/unit/tiktok-personal-foundation.test.ts`
- `backend/tests/unit/channel-inbox-http.test.ts`
- `frontend/src/composables/use-chat.ts`

Repository đã có nhiều thay đổi TT00–TT09 và công việc khác trước TT10. Không reset, checkout hoặc ghi đè các thay đổi đó.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
|---|---:|
| Backend TT00–TT10 targeted regression | 10 file, 73/73 test PASS |
| AI/Zalo characterization và policy | 3 file, 25/25 test PASS |
| Backend TypeScript build | PASS |
| Prisma validate | PASS |
| Frontend test | 7 file, 69/69 test PASS |
| Frontend production build | PASS |
| PoC Node regression | 20/20 test PASS |
| `git diff --check` | PASS |

Frontend build còn cảnh báo chunk lớn hơn 500 kB đã tồn tại trong cấu hình build; không phải lỗi TT10.

## Điều kiện trước khi mở media

Chỉ chuyển `imageRead` hoặc `imageSend` sang `true` khi có đủ:

1. Connector thật công bố và kiểm chứng riêng capability nhận/gửi ảnh.
2. Tải media qua storage của hệ thống với chống SSRF, giới hạn loại file, kích thước và thời gian tải.
3. Có idempotency, audit, quyền theo tài khoản và trạng thái gửi không rõ.
4. Acceptance trên môi trường được phép, không dùng kết quả mock thay cho bằng chứng live.
5. Có rollback bằng feature flag và kiểm tra regression Zalo.

## Điều kiện trước khi mở AI tự gửi

Chỉ xem xét sau khi outbound thủ công live đã ổn định:

1. Connector thật xác nhận gửi văn bản và đối soát trạng thái.
2. Cờ kép ở cấp hệ thống và tài khoản.
3. Chính sách cửa sổ hội thoại, quota, audit và handoff cho người thật.
4. `ai-send-policy.ts` được áp dụng cho gateway theo kênh.
5. Test chống gửi trùng, sai tài khoản và retry khi kết quả chưa rõ.
6. Không tự động mở `canInitiate`, sequence, automation hoặc broadcast.

## Rollback

Rollback logic TT10 bằng cách:

1. Giữ `TIKTOK_MEDIA_ENABLED=false` và `TIKTOK_AI_AUTO_SEND_ENABLED=false`.
2. Gỡ việc dùng `channelExtensionPolicy()` khỏi route inbox và quay lại kiểm tra `textSend` trực tiếp.
3. Gỡ các trường TT10 khỏi `ChannelCapabilities`, response type frontend và hai test contract.
4. Xóa `channel-extension-policy.ts`.

Không có migration database trong TT10 nên không cần rollback schema hoặc dữ liệu.
