# F1 — xử lý review

Reviewer độc lập vòng1/2 yêu cầu sửa parity thông báo, controller nhân viên, nội dung trang nặng, Tối, Zalo Real archive, giữ danh sách, close-after-blur, dữ liệu phòng ban. Dev và main đã sửa; shared qua LOCK-REQUESTS.md.

Vòng3 MERGE ĐƯỢC có điều kiện QA. Main đã xử lý Medium users403 làm khóa trang Phòng ban: endpoint phụ bắt lỗi riêng, giữ departments200; thêm test DOM. Low pointerleave/cancel closeIntent đã sửa. Vitest68 file/758 pass trước QA.

QA phát hiện cold confirm dưới sheet, Hủy bỏ qua dirty, màu/target overlay và focus trả lại thẻ trên WebKit. Main đã sửa. Agent QA và reviewer vòng4 hết quota (429) trước khi chốt; main chạy lại bộ QA đã chuẩn bị, không coi là review độc lập vòng4 đã đạt. Chưa iPhone/VoiceOver. Kết quả cuối ghi trong QA-F1.md.

Main soát lại parity với ZaloAccountsView: VALID_TABS đã loại internal-contact, cơ chế thủ công bị khóa do gửi nhầm UID. Reviewer vòng3 đã bỏ sót policy này. Main thay trang mobile bằng cấu hình chỉ đọc qua GET và giữ nguyên khóa, trả wizard shared về HEAD. Vì delta này và sửa QA chưa có reviewer độc lập vòng4 hoàn tất, không tuyên bố toàn candidate MERGE ĐƯỢC cuối cùng.
