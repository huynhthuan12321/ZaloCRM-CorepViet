# Khảo sát tích hợp TikTok vào ZaloCRM

Ngày khảo sát: 12/10/2026. Phạm vi: mã nguồn local, tài liệu chính thức và các repository công khai được tìm thấy. Chưa chạy connector trên tài khoản thật, chưa xác nhận quyền API của doanh nghiệp. Không phải danh mục toàn bộ repository trên Internet. Không thay đổi mã ứng dụng.

## Kết luận

Repo phù hợp để mở rộng thành hộp thư đa kênh nhưng hiện chat gắn trực tiếp với Zalo. Ưu tiên API chính thức cho bình luận video của tài khoản được ủy quyền và DM Business; nếu có TikTok Shop, dùng connector Customer Service riêng. DM cá nhân chỉ nên thử nghiệm connector không chính thức trước khi đầu tư tích hợp. LIVE là một luồng sự kiện riêng, không phải DM.

## Bằng chứng local

- backend/prisma/schema.prisma:351: ZaloAccount quản lý tài khoản Zalo.
- backend/prisma/schema.prisma:592: socialTiktok chỉ là trường liên hệ.
- backend/prisma/schema.prisma:764-815: Conversation bắt buộc zaloAccountId, quan hệ ZaloAccount và khóa duy nhất theo tài khoản Zalo/externalThreadId.
- backend/prisma/schema.prisma:817 trở đi: Message có zaloMsgId, zaloMsgIdNum, zaloCliMsgId và quy tắc sắp xếp đặc thù Zalo.
- backend/src/modules/chat/chat-routes.ts:1708,1786: gửi tin lấy instance từ zaloPool và gọi instance.api.sendMessage.
- backend/src/modules/chat/message-handler.ts: IncomingMessage và xử lý danh tính/hồ sơ đặc thù Zalo; không thể coi là pipeline đa nền tảng hoàn chỉnh.
- frontend/src/views/ChatView.vue:42,76,123: ConversationList, MessageThread, ChatContactPanel là nền giao diện tái sử dụng.
- backend/src/modules/integrations/integration-routes.ts: VALID_TYPES hiện gồm google_sheets, telegram, facebook, zapier; không có TikTok.
- backend/src/modules/integrations/providers: google-sheets, telegram-bot, zapier-webhook, telegram-bridge; không thấy connector TikTok.
- _shared/normalized-lead.schema.ts, lead-routing.service.ts và frontend source-badge: có tiktok-leadgen nhưng đó không phải connector nhận/gửi DM hoặc bình luận.
- backend/package.json: có zca-js, socket.io, bullmq; không khai báo Playwright/Puppeteer.
- docker/Dockerfile và docker-compose.yml: chưa có service browser worker TikTok; nên xây service riêng nếu chọn worker.

## Phân loại API và repository

### 1. DM Business chính thức

[Education Hub](https://business-api.tiktok.com/portal/bm-api/education-hub) mô tả trao đổi DM cho Business Account được cấp quyền. [Get started](https://business-api.tiktok.com/portal/docs/business-messaging-api-get-started/v1.3) yêu cầu developer app, quyền truy cập, ủy quyền, webhook và authentication. [API reference](https://business-api.tiktok.com/gateway/docs/index?doc_id=1751454172429314) liệt kê gửi tin, danh sách hội thoại/tin nhắn, media và kiểm tra capability.

Khả thi về thiết kế; điều kiện quyết định là app và tài khoản được cấp quyền. Không mặc định quyền này có sẵn cho mọi tài khoản tại Việt Nam. Hạn chế gửi tin phải đọc lại từ tài liệu chi tiết khi được cấp quyền.

### 2. Bình luận video chính thức

[Accounts API](https://business-api.tiktok.com/portal/docs/accounts-api-overview/v1.3) hỗ trợ moderation cho tài khoản Business và Personal được ủy quyền. Tài liệu hiện yêu cầu Accounts API Access Application Form cho app mới/tăng scope TikTok Accounts từ 20/03/2026. [Danh mục endpoint](https://business-api.tiktok.com/gateway/docs/index?doc_id=1740029171730433) có lấy bình luận, replies, tạo/trả lời, like, ẩn và xóa trên video sở hữu.

Đây là hướng ưu tiên cho bình luận trên video của doanh nghiệp. Không suy rộng thành truy cập/quản lý bình luận mọi video. Chưa xác nhận đầy đủ webhook bình luận trong khảo sát; có thể thiết kế polling phân trang có checkpoint trong phạm vi rate limit cho phép.

### 3. SDK chính thức

[tiktok/tiktok-business-api-sdk](https://github.com/tiktok/tiktok-business-api-sdk) là SDK Business API. [CommentsApi.md](https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/main/js_sdk/docs/CommentsApi.md) có commentList/commentPost và moderation, dùng advertiser_id, chủ yếu liên quan bình luận quảng cáo. Không nhầm nhóm này với Accounts API cho bình luận organic. Chưa xác nhận SDK bao phủ toàn bộ DM/Accounts hiện hành; có thể viết HTTP client TypeScript theo tài liệu thay vì phụ thuộc SDK không đủ endpoint.

### 4. DM cá nhân không chính thức

[Linkmail16/ReLttk-TikTok-Client-Bot](https://github.com/Linkmail16/ReLttk-TikTok-Client-Bot): Python, MIT, dự án ở giai đoạn đầu; README mô tả QR, DM WebSocket, inbox/history. Không dùng browser automation. [client.py](https://raw.githubusercontent.com/Linkmail16/ReLttk-TikTok-Client-Bot/main/client.py) có send_message dựng packet và gửi WebSocket. Hàm trả về dữ liệu client sau gửi socket, chưa thể dùng riêng kết quả này làm xác nhận TikTok đã giao tin. Cần kiểm tra ACK/echo, timeout và reconciliation. [core/api.py](https://raw.githubusercontent.com/Linkmail16/ReLttk-TikTok-Client-Bot/main/core/api.py) có lấy inbox/history.

Đáng thử nghiệm kỹ thuật, chưa đủ căn cứ production. Tách service Python, kiểm tra signer/dependency và nơi dữ liệu phiên được truyền/lưu. Không mặc định khả năng nhận media đồng nghĩa upload/gửi media. Không tự chấp nhận message request chỉ vì code upstream làm vậy; cần lựa chọn nghiệp vụ rõ ràng.

[sheryyiee121/tiktok-bot](https://github.com/sheryyiee121/tiktok-bot): README ghi API mô phỏng; loại khỏi danh sách connector thật.

Browser worker theo ảnh tư vấn: có thể là lựa chọn thử nghiệm khác, nhưng chưa có source của nhà cung cấp nên không xác định được cách đọc/gửi, xử lý lịch sử hay độ ổn định. Không thể kết luận worker browser bắt buộc cho mọi phương án.

### 5. Bình luận video không chính thức

[davidteather/TikTok-Api](https://github.com/davidteather/TikTok-Api): Python wrapper không chính thức. [video.py](https://raw.githubusercontent.com/davidteather/TikTok-Api/main/TikTokApi/api/video.py) có comments() lấy bình luận phân trang. Hữu ích để thử nghiệm đọc dữ liệu; không dùng làm bằng chứng rằng có DM hoặc trả lời bình luận hai chiều ổn định. Cần kiểm tra license và dependency ở commit được chọn trước khi tích hợp.

### 6. Bình luận LIVE

[zerodytrash/TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector): Node.js, nhận sự kiện LIVE, phù hợp stack worker hiện tại. README tự ghi đây là dự án reverse engineering chưa production-ready. sendMessage là gửi chat vào phòng LIVE, không phải DM; hiện mô tả cần Euler Stream API key và session xác thực.

[isaackogan/TikTokLive](https://github.com/isaackogan/TikTokLive): lựa chọn Python cho nhận sự kiện LIVE. Chọn một thư viện theo stack, không dùng cả hai nếu không có nhu cầu riêng.

### 7. TikTok Shop

[Partner Center Send Message](https://partner.tiktokshop.com/docv2/page/send-message) có API Customer Service gửi tin theo conversation và shop. Đây là miền tích hợp riêng; cần xác minh scope, thị trường, seller authorization, nhận tin và webhook trên app thực tế. Không dùng Business DM hoặc thư viện LIVE để thay thế Shop chat.

### 8. Nhà cung cấp trung gian

[Infobip TikTok over API](https://www.infobip.com/docs/tiktok/api) có API key và webhook cho gửi/nhận TikTok Business Messaging. Là phương án giảm phần tự xây connector, vẫn cần Business Account và onboarding. Phải xác nhận tài khoản Việt Nam, giá, lưu trữ dữ liệu và quyền lấy lịch sử; không giả định hỗ trợ bình luận/Shop từ tài liệu DM này.

## Thiết kế đề xuất cho repo

Chọn chuyển đổi tăng dần, schema bổ sung; tránh đổi tên toàn bộ Zalo ngay từ đầu.

1. Thêm ChannelAccount, ChannelAccountAccess, ChannelIdentity, ChannelConversation, ChannelMessage cho phần đa kênh; hoặc mở rộng Conversation/Message sau khi đánh giá toàn bộ dependency. Giai đoạn đầu bảng riêng giúp giảm ảnh hưởng đường Zalo đang hoạt động. Nhược điểm là cần hợp nhất query/list/count/search; ghi rõ bước chuyển về mô hình chung sau MVP để tránh hai pipeline vĩnh viễn.
2. UnifiedInboxService cung cấp DTO chung cho danh sách/chi tiết/gửi tin. Zalo adapter bọc đường cũ, TikTok adapter quản lý connector mới. Backend thực thi capability; frontend chỉ hiển thị thao tác phù hợp.
3. Khóa ngoài theo (orgId, accountId, threadKind, externalThreadId); tin dedup theo account và externalMessageId. ID nền tảng lưu String, không ép số JS.
4. Bình luận dùng threadKind=comment, giữ postId/commentId/parentCommentId và link nguồn. LIVE dùng room/session riêng, không biến mỗi commenter thành DM.
5. Contact chung nhưng identity riêng theo nền tảng/phạm vi API. Chỉ ghép TikTok với Zalo bằng bằng chứng xác minh hoặc người dùng chủ động; không dựa tên/avatar, không giả định ID commenter và DM giống nhau.
6. Worker gửi sự kiện qua API nội bộ xác thực hoặc hàng đợi; sự kiện có org/account, loại kênh, eventId, thời gian, external IDs và payload chuẩn hóa. ACL và org ownership phải được backend kiểm tra.
7. Outbox phân biệt pending/sent/failed/unknown. Timeout sau gửi không đồng nghĩa chưa gửi; đối soát trước retry để tránh nhân đôi. ACK/echo hợp nhất bản ghi optimistic.
8. Cookie/token mã hóa, không log; tách volume/profile theo tài khoản. Mỗi tài khoản có lease một worker, trạng thái needs_verification/session_expired, ngắt kết nối xóa quyền/phiên theo lựa chọn.
9. AI trước tiên chỉ tạo nháp. Chưa nối automation/broadcast Zalo vào TikTok. Chặn thao tác nhóm, friend lookup, thu hồi, typing/reactions không hỗ trợ.

## Lộ trình và điều kiện quyết định

- PR0: PoC ngoài pipeline CRM, một tài khoản được cho phép. API chính thức: chứng minh quyền và request thật. Cá nhân: kiểm tra connector nguồn mở hoặc source nhà cung cấp trong môi trường riêng.
- PR1: hợp đồng adapter, DTO, capability và feature flag mặc định tắt; regression Zalo.
- PR2: schema bổ sung, ACL, identity và inbound persistence; webhook duplicate/replay, isolation giữa org/tài khoản.
- PR3: unified inbox, nhãn kênh, gửi văn bản và outbox; kiểm tra ACK/echo/retry.
- PR4: bình luận dạng thread, media/lịch sử nếu đã chứng minh connector hỗ trợ, reconnect và dashboard health.
- PR5: AI nháp rồi mới xem xét tự động hóa phù hợp quyền từng kênh.

PoC nên đối chiếu với app TikTok trong 72 giờ: nhận/gửi, tin từ thiết bị khác, request người lạ, restart, mất mạng, hết phiên, history và trùng tin. 72 giờ là tiêu chí thử nghiệm đề xuất, không bảo đảm uptime lâu dài. Đo số tin thiếu/trùng, độ trễ, tỉ lệ gửi được xác nhận và tài nguyên/tài khoản.

Rollback: tắt flag/worker và đường gửi TikTok, giữ dữ liệu đã thu để đối soát; không xóa hoặc di chuyển dữ liệu Zalo trong MVP.

## Quyết định

- Bình luận organic: GO cho thiết kế/API PoC, phụ thuộc Accounts permission.
- DM Business: GO cho onboarding và PoC, phụ thuộc Business Messaging access.
- DM cá nhân: GO có điều kiện cho thử nghiệm ReLttk/browser; NO-GO production khi chưa kiểm chứng.
- LIVE: GO cho PoC riêng nếu nghiệp vụ cần; không suy rộng thành DM.
- Shop: khảo sát quyền Customer Service riêng nếu doanh nghiệp cần chat người mua.

Thông tin cần từ chủ repo: tài khoản cá nhân hay Business/Shop, đã có developer app/quyền API chưa, số tài khoản, cần bình luận video hay LIVE, bắt buộc gửi media hay chỉ văn bản. Có thể khảo sát kiến trúc tiếp mà chưa có câu trả lời, nhưng lựa chọn connector production phụ thuộc các thông tin này.
