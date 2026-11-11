# TT-00 — Đánh giá TikTok Personal + QR, một tài khoản

Ngày: 13/10/2026. Checkout: main, HEAD bf31cdf. Trạng thái: hoàn thành khảo sát TT-00; chưa thực hiện TT-01.

## 1. Kết luận

Giữ mục tiêu Personal + QR, không chuyển Business. Chọn browser worker với profile riêng làm ứng viên đánh giá tiếp, không coi là connector đã hoạt động.

| Mức | Kết quả hiện tại | Lý do |
|---|---|---|
| Nghiên cứu TT-00 | Hoàn thành | Đã đối chiếu code local và nguồn chính thức, lập kế hoạch độc lập |
| PoC kiến trúc trên website mô phỏng | GO về thiết kế | Có thể kiểm phiên, sự kiện, dedup và unknown mà không truy cập TikTok |
| PoC TikTok thật | Chưa đủ điều kiện/bằng chứng | Chưa xác nhận loại tài khoản, tài khoản thử, môi trường và quyền sử dụng tự động hóa |
| Tích hợp staging | Chưa mở | Phụ thuộc kết quả connector thật và kiến trúc TT-03 |
| Production / nhiều tài khoản | Chưa mở | Chưa có số đo và kiểm chứng một tài khoản |

Không cài dependency, không chạy browser/connector, không dùng tài khoản thật, không sửa ứng dụng/schema, không migrate hoặc deploy. Không khẳng định kết quả mô phỏng chứng minh TikTok hoạt động.

## 2. Checkout và hướng dẫn

Đã đọc CONTRIBUTING.md: AGPL, TypeScript strict, backend import .js, Vue script setup, SPDX nguồn mới, không commit secrets, typecheck/build trước đóng góp. Không tìm thấy AGENTS.md qua tìm kiếm file trong workspace ở TT-00.

Git status đầu vào: không thấy thay đổi tracked; có file untracked trong Claude outputs, bốn tài liệu TikTok, biên bản D1 và docs/prompts. Giữ nguyên tất cả. Git dùng safe.directory chỉ cho từng lệnh để đọc checkout, không sửa cấu hình global.

Đã đọc roadmap Personal và phần hiện hành của hai tài liệu đa tài khoản. Phụ lục Business-first chỉ là tham khảo.

## 3. Bằng chứng trực tiếp từ repo

| Bằng chứng | File:dòng | Hệ quả |
|---|---|---|
| Tài khoản và ACL riêng cho Zalo | backend/prisma/schema.prisma:351,498 | Không dùng account Zalo giả cho TikTok |
| Conversation bắt buộc zaloAccountId | backend/prisma/schema.prisma:764,767 | Chưa ghi được hội thoại TikTok đúng mô hình |
| Message có unique Zalo và clientEchoId | backend/prisma/schema.prisma:817,887,889 | Dedup hiện có chưa là hợp đồng TikTok |
| socialTiktok là trường liên hệ | backend/prisma/schema.prisma:592 | Không dùng làm identity tự động |
| Query danh sách dựa quan hệ nick | backend/src/modules/chat/chat-routes.ts:140,475,1028 | Hội thoại kênh mới cần query/scope riêng hoặc tổng quát hóa |
| Gửi SDK rồi ghi DB | backend/src/modules/chat/chat-routes.ts:1708,1786,1828 | TikTok cần Outbox tránh khe gửi rồi crash trước persist |
| Middleware tra quyền nick từ hội thoại | backend/src/modules/zalo/zalo-access-middleware.ts:69-87 | Không áp nguyên trạng cho account TikTok |
| Subscribe room account kiểm cùng org | backend/src/modules/zalo/zalo-socket.ts:29-49 | QR TikTok cần thêm quyền kết nối theo account; không copy nguyên trạng |
| Tin nick Thường phát room org | backend/src/shared/realtime/emit-chat.ts:58-63 | Kênh mới phải kiểm người nhận theo account; chưa kết luận vulnerability đầy đủ chỉ từ code này |
| QR Zalo có event riêng | backend/src/modules/zalo/zalo-pool.ts:164,214 | Có mẫu trải nghiệm UI, không tái dùng giao thức Zalo |
| AI tự gửi qua zaloOps | backend/src/modules/ai/ai-auto-reply-service.ts:281; ai-followup-cron.ts:273 | TikTok MVP giữ AI gửi tắt |
| Layout chat sẵn | frontend/src/views/ChatView.vue:42,76,123 | Tái sử dụng list/thread/contact panel sau PoC |
| BullMQ/Socket.IO/ZCA, chưa khai Playwright | backend/package.json:45,56,59 | PoC package độc lập, không sửa dependency backend |
| App runtime Alpine, copy node_modules builder | docker/Dockerfile:37,51 | Không đưa Chromium vào app container hiện tại để thử |
| Giới hạn app mặc định 1G/2 CPU | docker-compose.yml:66-67 | Không phải tài nguyên VPS live; cần đo worker riêng |
| Có 6 characterization tests | backend/tests/characterization/ | Lưới regression về sau; TT-00 không sửa code nên chưa chạy suite |
| Khung ChannelAccount/Outbox/XOR trong runbook | docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md:9,94,424-426 | Kế hoạch chung có sẵn; tìm schema không thấy model ChannelAccount/OutboundCommand hiện tại |

Đây là khảo sát phạm vi tích hợp, không phải audit bảo mật toàn repo. Các khác biệt HTTP/socket cần tái hiện và đối chiếu policy trước khi sửa bảo mật Zalo.

## 4. Ba trục đánh giá độc lập

### Kỹ thuật

[Playwright Authentication](https://playwright.dev/docs/auth) mô tả lưu/reuse browser state và cảnh báo state có thể chứa cookie/header nhạy cảm. Cơ chế này hỗ trợ xây PoC profile/session riêng, không xác nhận TikTok Web tương thích.

[TikTok Login Kit QR](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization) là OAuth có client_key và scope được cấp. Trang đưa ví dụ scope hồ sơ/video; không cung cấp bằng chứng quyền DM Personal. Không nhầm Login Kit QR với QR đăng nhập phiên web.

Browser worker phải chứng minh UI Personal có hộp thư truy cập được, ID thread/message, self-message và tín hiệu gửi. Ảnh Business Suite chưa chứng minh loại tài khoản hoặc khả năng Personal.

### Điều khoản/quyền sử dụng

[TikTok ROW Terms](https://www.tiktok.com/legal/page/row/terms-of-service/en), trang ghi cập nhật 01/12/2025, đọc 13/10/2026: mục 5 hạn chế script tự động tương tác/thu thập, tích hợp dịch vụ vào sản phẩm khác và reverse engineering; TikTok có thể hạn chế hoặc chấm dứt tài khoản. Đây là rủi ro điều khoản trực tiếp cho worker thật. Sự đồng ý của chủ tài khoản không tự tạo quyền từ TikTok. Cần đối chiếu quyền/chấp thuận hoặc thỏa thuận áp dụng trước chạy thật. Bản điều khoản này không đề cập thiết kế hay kiểm thử trên website mô phỏng độc lập; không dùng nó để kết luận mô phỏng bị cấm. Không kết luận pháp lý tuyệt đối về mọi hoạt động bán hàng Personal chỉ từ các đoạn này.

TT-00 không liên hệ TikTok hoặc đưa ra xác nhận được phép. Không tự đặt yêu cầu thuê pháp chế như điều kiện cho đọc code/thiết kế; rà soát chuyên môn là khuyến nghị khi cần diễn giải thỏa thuận.

### Vận hành

Ưu tiên local/máy thử riêng. Số liệu VPS người dùng ngày 12/10 còn khoảng 15 GB, dùng 82% chỉ là lịch sử; chưa truy cập VPS trong TT-00. Chưa đo RAM/CPU/profile nên chưa định sức chứa. Không cần disk dưới 80% để viết tài liệu hay test local; deploy cần headroom thực đo.

## 5. So sánh ứng viên

| Hướng | Đánh giá TT-00 |
|---|---|
| Browser worker UI + QR | Phù hợp mục tiêu trải nghiệm để khảo sát, dễ cô lập và quan sát; chưa có proof nhận/gửi Personal, selector/ID/phiên là điểm chưa biết |
| ReLttk nguyên trạng | Không chọn: source hiện đọc có CERT_NONE tại client.py:1255, bỏ own-sender tại :1109-1110, tự chấp nhận request ở stranger loop; chưa đánh giá toàn bộ dependency/license ở TT-00 |
| Business API | Để so sánh, không triển khai hoặc tự chuyển tài khoản |

[ReLttk client.py](https://raw.githubusercontent.com/Linkmail16/ReLttk-TikTok-Client-Bot/main/client.py) đọc theo main ngày khảo sát, chưa pin SHA. Không xác nhận lại toàn bộ B1–B14 hoặc commit da1d2f0. Số dòng source ngoài thay đổi so với phụ lục cũ; phải pin commit nếu đánh giá sâu ở bước sau.

Không chọn chuyển đổi giao thức nội bộ để lấp phần UI không làm được, không tắt TLS hoặc né bảo vệ.

## 6. Cấu trúc PoC dự kiến, chưa tạo

Thư mục đề xuất: poc/tiktok-personal-qr/, package Node/TypeScript riêng, không workspace dependency của backend và không DB CRM.

```text
poc/tiktok-personal-qr/
  README.md
  package.json / lockfile
  .gitignore
  src/config.ts
  src/worker.ts
  src/session-store.ts
  src/account-verifier.ts
  src/adapters/browser-adapter.ts
  src/adapters/mock-adapter.ts
  src/events.ts
  src/message-ledger.ts
  src/send-controller.ts
  src/redaction.ts
  mock/server.ts
  mock/public/
  tests/
  results/                 # chỉ báo cáo không bí mật
  runtime/                 # ignored: profile, state, log tạm
```

Đây là thiết kế, chưa khóa Playwright version hoặc cài package. Chọn version hỗ trợ Node thực tế ở TT-01. File nguồn mới theo SPDX của repo; không sao chép code ngoài thiếu provenance.

Mock server chỉ loopback, QR là ticket giả chỉ có tác dụng trên mock. Có expiry, scan-confirm, hội thoại/tin ổn định, repeated identical texts, self-message, requests và fault injection. Không giả làm TikTok hoặc sử dụng credential thật.

Worker ban đầu có chế độ mock mặc định, thao tác gửi chỉ do người thử kích hoạt, không AI/broadcast. Adapter thực tách riêng, mặc định tắt và chưa chọn selector từ ảnh. Không có kết nối backend CRM hoặc outbound public mặc định ở mock.

## 7. Hợp đồng và dữ liệu PoC

Session: disconnected → awaiting_qr → verifying_identity → connected; nhánh needs_verification/session_expired/error. Browser mở được trang không đủ coi connected: phải xác minh account cụ thể. Sau restart không thấy đúng account thì khóa gửi.

Event tối thiểu: eventId, accountKey, externalThreadId, externalMessageId nếu có, direction, observedAt, platformSentAt nếu có, text và source. Không lưu cookie vào event. Thời gian hiển thị không đủ làm identity.

Ledger cục bộ cần tồn tại qua restart, không DB CRM. Đánh giá SQLite hay append journal tại TT-01; lưu message/outbound intent trước gửi. Outbound: pending → submitted → confirmed/failed/unknown. confirmed chỉ nghĩa xác nhận phía nền tảng theo bằng chứng đã định nghĩa, không gọi delivered/seen. Nếu trước submit chắc chắn chưa gửi thì có thể thử lại có giới hạn; sau click/request không chắc chắn thì unknown.

ID không ổn định: không hash nội dung theo phút rồi coi giải quyết. Hai tin giống nhau phải vẫn giữ hai bản. Nếu không đối soát được unknown, giữ trạng thái và người thử kiểm tra, không tự gửi lại.

Session/profile chỉ local, excluded Git; bảo vệ quyền filesystem, không expose state/QR trên endpoint public, log redaction. Không cam kết browser profile mã hóa chỉ bằng storageState; nếu cần mã hóa at rest phải thiết kế riêng, browser cần profile sử dụng được khi chạy. Screenshot/traces có thể chứa tin/QR; tắt mặc định và lọc trước lưu báo cáo.

## 8. Kế hoạch kiểm chứng

| ID | Test | Điều kiện nghiệm thu / thông tin thu |
|---|---|---|
| P1 | QR, expiry, scan-confirm, identity | Đúng account; QR hết hạn không tạo phiên connected |
| P2 | 20 tin inbound đánh số | Đủ, đúng thread; thứ tự có căn cứ |
| P3 | 10 tin outbound thủ công | Người thử nhận đúng, không trùng; evidence confirmed |
| P4 | 5 self-message từ app/Web | Không bỏ tin self, direction đúng |
| P5 | Hai tin giống nhau, reload/cuộn | Không mất/nhân đôi; ID ổn định hoặc giới hạn được ghi |
| P6 | Lịch sử | Ghi độ sâu và pagination thực tế; không bắt toàn bộ lịch sử |
| P7 | Restart khi tin tới | Phiên đúng; backfill hoặc phát hiện gap |
| P8 | Mất mạng | Không gửi lặp, phục hồi có checkpoint |
| P9 | Ngắt quanh send | Unknown không retry; reconciliation có evidence hoặc cần review |
| P10 | Hết phiên/logout | Khóa gửi, QR lại; không tự login vòng lặp |
| P11 | Request người lạ | Ghi phạm vi hỗ trợ; không tự chấp nhận mọi request |
| P12 | Tài nguyên/latency | CPU/RSS/profile/log, p50/p95 và số mẫu; chưa suy số tài khoản tối đa |

Mock PASS chỉ kiểm cơ chế của chúng ta. Bộ test thật riêng phải ghi NOT TESTED đến khi thực hiện. Quan sát thật đề xuất 72 giờ có hoạt động hằng ngày, không bảo đảm uptime lâu dài.

Nếu không có hộp thư Personal phù hợp, dừng hoặc báo scope không đáp ứng, không tự chuyển Business. Nếu thiếu history cũ có thể giảm scope; nếu lẫn identity, mất tin không phát hiện, dedup gộp mất hoặc gửi trùng thì FAIL. Read-only PARTIAL không mở outbound.

## 9. Điều kiện đầu vào còn thiếu

| Thông tin | Trạng thái | Ảnh hưởng |
|---|---|---|
| Loại tài khoản trong app | Chưa xác nhận | Chọn đúng bề mặt Personal |
| Account thử và người nhận thử | Chưa chỉ định | Chưa chạy test thật |
| Máy/host thử, Node/runtime | Chưa chọn | Cài đặt/tài nguyên TT-01 |
| Quyền sử dụng tự động hóa | Chưa có bằng chứng phù hợp | Cổng trước live PoC |
| Giới hạn history/request | Chưa thử | Scope PoC, không chặn mock |
| Có thể có ID/ACK đáng tin | Chưa thử | Quyết định tích hợp hai chiều |

Không yêu cầu cookie/token trong chat. Các thông tin này không ngăn hoàn thành nghiên cứu TT-00 hoặc thiết kế mock.

## 10. Đầu ra, kiểm tra và rollback TT-00

File mới duy nhất: docs/TIKTOK-TT00-ASSESSMENT.md. Không chỉnh ba tài liệu đầu vào hoặc code. Đã kiểm report tồn tại và các mục kết luận/checklist/nguồn; git diff --stat tracked rỗng sau ghi báo cáo, phù hợp trạng thái tracked sạch đầu vào. Không thực hiện hash toàn bộ cây nguồn. Không chạy typecheck/test ứng dụng vì không đổi code hoặc dependency.

Rollback TT-00: bỏ riêng báo cáo mới nếu không muốn giữ. Không cần rollback app/DB. TT-01 chưa bắt đầu; bước tiếp chỉ khi chủ dự án chỉ định. Cơ sở TT-01 là xây mock độc lập và thử session/worker, không tuyên bố đã kết nối TikTok.
