# TT-04A — Hợp đồng kênh, capability, cấu hình và health

Ngày: 13/10/2026. Checkout nền main @ bf31cdf. Phạm vi: foundation backend local; chưa schema, adapter runtime, browser bridge, route account/chat, migrate hoặc deploy.

## Kết quả

Hoàn thành TT-04A. Cờ mặc định OFF. Live transport chưa được triển khai nên mọi effective live flag luôn false, kể cả khi người dùng đặt tất cả cờ true. Mock capability chỉ cho explicit NODE_ENV=development hoặc test và CHANNELS_ENABLED + MOCK_CHANNEL_ENABLED. Mock flag không tự chạy fixture hoặc cấp quyền kết nối backend từ PoC.

Khối tiktok tại /health/ready chỉ là thông tin. DB/Redis mới quyết định HTTP 200/503 như trước. /health và /health/live không đổi. Cấu hình TikTok sai chỉ cảnh báo, không fatal khiến Zalo dừng. Health không chứa credential, giá trị env, problems hoặc requested flags.

## Thay đổi file

| File | Thay đổi |
|---|---|
| backend/src/config/tiktok-personal-config.ts (mới) | Parser boolean, cờ phân cấp, status, startup snapshot và health summary không bí mật |
| backend/src/modules/channels/channel-types.ts (mới) | Provider mock/live, capabilities, observation, send command/outcome và adapter interface |
| backend/src/modules/channels/channel-capabilities.ts (mới) | Capability bất biến; mock được gate, live chưa chứng minh trả mọi quyền false |
| backend/src/shared/http/health.ts | Khối tiktok optional, informational |
| backend/src/app.ts | Truyền startup summary vào readiness; không đăng ký route hoặc worker |
| backend/src/config/validate-production-config.ts | Cảnh báo cấu hình TikTok riêng, không thay fatal checks cũ |
| .env.example | CHANNELS_ENABLED, TIKTOK_PERSONAL_* và MOCK_CHANNEL_ENABLED, tất cả false |
| backend/tests/unit/tiktok-personal-foundation.test.ts (mới) | Kiểm fail-closed, fixture/live separation, production isolation, health và validation |

Không thay package/lockfile ứng dụng, frontend, schema, ACL/chat implementation hoặc PoC. Các untracked file có sẵn giữ nguyên; không commit/push/create PR. File nguồn có SPDX và import .js theo CONTRIBUTING.

## Ý nghĩa trạng thái

| Status | Ý nghĩa |
|---|---|
| disabled | Chưa yêu cầu channel foundation phù hợp; mặc định |
| mock_only | Chỉ fixture capability được cho phép local/test; chưa có runtime integration |
| unavailable | Đã yêu cầu Personal live nhưng transport chưa có; live inbound/outbound false |
| misconfigured | Mock được yêu cầu ngoài môi trường development/test; khóa capability |

Nếu bật mock và yêu cầu live trong development/test, status là unavailable cho live, mock capability vẫn có thể true. Health inbound/outbound vẫn false. Không có status ready vì chưa có connector thật.

Cờ môi trường chỉ là snapshot startup, cần restart khi đổi. Không sửa .env thực tế. Các TIKTOK_* Lead Gen cũ không bật Personal. Giá trị cờ sai chỉ nêu tên biến, không log giá trị. Chưa tạo worker URL/key hoặc yêu cầu OAuth token.

## Kiểm chứng đã thực hiện

1. Baseline backend npx.cmd tsc --noEmit trước chỉnh: exit 0.
2. Sau chỉnh backend npx.cmd tsc --noEmit: exit 0.
3. Vitest targeted + regression: **10 files / 130 tests PASS**, 0 lỗi, duration 8,50 giây:

```text
npx.cmd vitest run tests/unit/tiktok-personal-foundation.test.ts tests/unit/health-check.test.ts tests/unit/messenger-config.test.ts tests/unit/production-config-token-keys.test.ts tests/characterization
```

Bao gồm sáu characterization Zalo: inbound, outbound, websocket, assignment, AI handoff, broadcast/labels/queue. Test không cần DB/Redis thật; không login hoặc gửi tin nền tảng.

4. git diff --check: exit 0, không lỗi whitespace tracked.

Không start backend/VPS thật, không gọi readiness live hoặc diễn tập deployment; health đã kiểm bằng helper. Không chạy frontend build vì frontend không đổi. Không chạy toàn bộ test repo; phạm vi kiểm là các contract/health/config đã sửa và characterization Zalo liên quan. Không rerun PoC vì code PoC không đổi.

## Rủi ro và giới hạn

Hợp đồng TypeScript chưa thay schema validation cho payload thực; TTL, lease, ACL, signed ingress, outbox và account routes chưa tồn tại. Capability mock chỉ mô tả fixture, không thành chứng nhận stable ID/ACK TikTok. Backend chưa dùng adapter này để nhận/gửi. TT-04A không tự làm UI đa kênh xuất hiện.

TikTok thật vẫn NOT TESTED. Login thủ công chỉ là quan sát người dùng, không chứng minh connector. Không bật Personals real transport qua env trong phiên bản này.

## Rollback và phần tiếp theo

Rollback riêng TT-04A: bỏ import/health wiring và warning parser đã thêm, bỏ khối env mới và các file foundation mới; giữ nguyên thay đổi người khác. Không reset toàn repo. Không có migration hoặc credential để thu hồi. Không xóa PoC hay tài liệu untracked có sẵn.

Dừng sau TT-04A. TT-04B schema expand và TT-04D migration vẫn chờ bằng chứng connector và thiết kế được review theo TT-03. Nếu tiếp tục chuẩn bị mock/local, cần chỉ định scope rõ, không mặc định migrate hoặc tích hợp live vì 130 tests PASS.
