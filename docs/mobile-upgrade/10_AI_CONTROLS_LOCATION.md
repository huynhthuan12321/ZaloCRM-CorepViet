# 10 — Vị trí bật/tắt và thiết lập AI hiện tại

Ngày 29/10/2026. Đối chiếu mã nguồn local; chưa đọc trạng thái cấu hình thật trên server, không thay công tắc hay gửi tin.

## Hai khu vực chính trong ứng dụng

1. **Cài đặt → CRM → Trợ lý AI**, route `/settings/crm/ai-assistant`. Menu tại `frontend/src/composables/use-settings-nav.ts:133`, route tại `frontend/src/router/index.ts:162`, view `frontend/src/views/settings/AiAssistantPage.vue`.
2. **Thanh thông tin phía trên của từng hội thoại**, công tắc **AI tự tư vấn** trong `frontend/src/components/chat/MessageThread.vue:225`. Chỉ hiển thị với hội thoại không phải virtual; bị disabled lúc lưu hoặc khi nick đã archived. Luồng auto-reply backend chỉ nhận hội thoại Zalo 1-1; không dùng sự hiện diện công tắc để khẳng định mọi kênh/nhóm đều được tự trả lời.

## Bản đồ chức năng trên trang cài đặt

| Khu vực | Tác dụng | Vị trí code |
|---|---|---|
| Bật trợ lý AI ở đầu trang | Gợi ý/trích xuất dữ liệu cho virtual chat; khác công tắc tổng auto-tư vấn | AiAssistantPage.vue:21 |
| Nhà cung cấp AI (Tư vấn) → Cấu hình | Provider, API key, model, quota và enabled; API key không đưa vào báo cáo | AiAssistantPage.vue:32; components/ai/ai-config-dialog.vue |
| Prompt mẫu/quy tắc bỏ qua tin ngắn | Cấu hình assistant tương ứng; không mặc định là toàn bộ system prompt cho mọi luồng AI | AiAssistantPage.vue:59 |
| Tự động tư vấn theo phạm vi | Công tắc tổng, phạm vi khách và chính sách auto-reply | AiAssistantPage.vue:90 |
| Bật công tắc tổng auto-tư vấn | Dừng/cho phép toàn bộ auto-reply theo tổ chức, vẫn còn các gate khác | AiAssistantPage.vue:100; backend/src/modules/ai/ai-auto-reply-service.ts:117 |
| Trợ lý tự động phản hồi cho | Thủ công / Khách mới / Mọi khách; khách mới là hội thoại chưa có nhân viên thật trả lời | AiAssistantPage.vue:111; backend/src/modules/ai/ai-auto-reply-eligibility.ts |
| Khách chủ động nhắn nhưng chưa kết bạn | Quyền nhận thêm inbound khách lạ theo nick/UID | AiAssistantPage.vue:122 |
| Chế độ trọn | Chính sách gửi tự động cả nội dung giá/đơn hàng khi bật; vẫn cần nguồn và gate khác | AiAssistantPage.vue:134; backend/src/modules/ai/ai-send-policy.ts |
| Từ khóa nhạy cảm/khung giờ/tin liên tiếp/ngưỡng tin cậy | Các điều kiện auto-reply; ngoài khung hoặc vượt giới hạn không đồng nghĩa lỗi model | AiAssistantPage.vue:148–178 |
| Tự nhắc lại khi khách im lặng | Cờ riêng, số giờ im lặng, giới hạn và khoảng cách; phụ thuộc công tắc tổng | AiAssistantPage.vue:183 |
| Lưu cài đặt | Áp dụng form; bật checkbox trên form chưa đồng nghĩa đã lưu server | AiAssistantPage.vue:223 |
| Knowledge base phía dưới | Tài liệu/nguồn kiến thức, embedding model riêng | AiAssistantPage.vue:232 |

## Ý nghĩa công tắc riêng từng khách

`MessageThread.vue:1666` gọi PATCH `/api/v1/conversations/:id/ai-auto-reply`. Đây là cờ `aiAutoReplyEnabled` để cấp quyền thủ công cho hội thoại. **False không phải một per-conversation opt-out tuyệt đối:** `isConversationEligibleForAutoReply` vẫn có thể trả true qua scope all, new_customers hoặc inbound stranger.

Tắt công tắc tổng là cách dừng toàn bộ auto-reply theo tổ chức trong đường xử lý đã khảo sát. Bật tổng chưa đủ để chắc chắn có tin gửi: `aiCfg.enabled`, scope, giờ, nguồn, policy, privacy, nick và các điều kiện khác vẫn được kiểm tra. Chưa xác minh giá trị hiện hành trên production.

Tooltip của công tắc riêng còn mô tả câu giá/cọc/chốt đơn luôn cần duyệt (`MessageThread.vue:1650`), trong khi chế độ trọn có thể cho gửi; cần đồng bộ câu chữ ở đợt UI được duyệt. Không thay chính sách gửi trong lần kiểm tra này.

## Trong preview V2 vừa render

Nút **Gợi ý AI** và màn **Trợ lý AI** là trợ giúp soạn bản nháp. Bản V2 ban đầu chưa có màn quản trị auto-tư vấn. Đợt render bổ sung ngày 29/10 đã có bản mô phỏng độc lập tại preview-v2/ai-controls.html, xem liên kết đầu tài liệu; tab Thêm của bản V2 cũ vẫn giữ nguyên. Không nhầm nút tạo gợi ý với quyền tự gửi tin.

Vị trí đề xuất cho lần thiết kế tiếp theo: **Thêm → Trợ lý AI** mở cài đặt theo quyền; trong chat có trạng thái AI rõ ràng và nút quản lý riêng hội thoại. Cần hiển thị cả scope hiệu lực và công tắc tổng để tránh báo “Đã tắt” khi hội thoại vẫn được nhận qua scope. Đây mới là đề xuất, chưa sửa preview hoặc ứng dụng.
# Bản render giao diện đề xuất

Đã bổ sung [3 màn hình điều khiển AI](preview-v2/AI-CONTROLS-README.md) và [ảnh tổng hợp](preview-v2/renders/04-ai-controls.jpg). Đây là bản xem trước, chưa thay đổi giao diện hoặc cấu hình AI thật.


