-- Chỉ cập nhật các rule còn nguyên nhãn mặc định bất động sản.
-- Rule đã được quản trị viên tùy chỉnh sẽ không bị ghi đè.

UPDATE "score_signal_rules"
SET "keywords" = '["thành phần","nguồn gốc","chứng nhận","an toàn thực phẩm","hạn sử dụng","bảo quản","công bố"]'::jsonb,
    "label" = 'KH hỏi thành phần / chất lượng',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "signal_key" = 'ask_legal'
  AND "label" = 'KH hỏi thủ tục pháp lý';

UPDATE "score_signal_rules"
SET "keywords" = '["khi nào giao","bao giờ có hàng","còn hàng không","ngày mai","tuần này","tháng này"]'::jsonb,
    "label" = 'KH hỏi thời gian có hàng / giao hàng',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "signal_key" = 'ask_future'
  AND "label" = 'KH đặt câu hỏi tương lai';

UPDATE "score_signal_rules"
SET "label" = 'Đã đặt lịch tư vấn / xem hàng', "updated_at" = CURRENT_TIMESTAMP
WHERE "signal_key" = 'appointment_book' AND "label" = 'Đã đặt lịch xem nhà';

UPDATE "score_signal_rules"
SET "label" = 'Hoàn thành lịch tư vấn / xem hàng', "updated_at" = CURRENT_TIMESTAMP
WHERE "signal_key" = 'appointment_complete' AND "label" = 'Hoàn thành lịch xem nhà';

UPDATE "score_signal_rules"
SET "label" = 'Đã xác nhận / đặt cọc đơn hàng', "updated_at" = CURRENT_TIMESTAMP
WHERE "signal_key" = 'deposit' AND "label" = 'Đặt cọc giữ chỗ';
