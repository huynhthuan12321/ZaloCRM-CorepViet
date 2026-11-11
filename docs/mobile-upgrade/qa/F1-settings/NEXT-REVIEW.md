# F1 — phần cần reviewer độc lập chốt

Base/merge-base bcd220d06b4a2706ee2ec44a0b59f76be379c7d5, branch mobile/ext. Chưa commit/merge/push/deploy.

Vòng3 độc lập có báo cáo REVIEW-F1-round3.md; main đã sửa Medium departments403 và Low pointercancel. Reviewer bổ sung vòng4 bị quota429 trước khi đọc/chốt. Cần một lượt reviewer độc lập cho delta QA sau vòng3:

- MobileSheet footer slot requestClose và nút Hủy account/status/tag: dirty/persistent guard.
- MobileEmployeesList focus thẻ trước emit trên Safari; clear đầy đủ filter khi API trả rỗng.
- CreateUserWithZaloModal mobile: dark step/label/relation/success/error, close không shrink, body cuộn + footer cố định khi dọc/ngang.
- UserEditPanel mobile: links44, empty/danger token.
- mobile-tokens.css nhận CSS confirm từ lazy MobileChatView, z13000 (trên sheet/panel), target44/input16; chỉ body.m-toast-host, desktop không đổi.
- MobileInternalContactPage chỉ GET cấu hình: giữ khóa wizard thủ công có sẵn trong ZaloAccountsView.VALID_TABS. Không phục hồi PATCH/DELETE/handshake. InternalContactSetupPage nguyên HEAD. Reviewer vòng3 đã bỏ sót khóa cũ này.

Đọc LOCK-REQUESTS.md, REVIEW-RESOLUTIONS.md và QA-F1.md. Đánh giá desktop isolation, API/payload/role gate, luồng dirty/confirm và khóa thông báo. Không dùng kết quả reviewer vòng3 để tự xác nhận delta mới đã được review độc lập. Không làm F2 trước khi báo riêng F1.
