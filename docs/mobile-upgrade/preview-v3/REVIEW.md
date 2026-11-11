# Review cuối — web-design-guidelines

07/11/2026. Đọc `index.html` (bao gồm Vue text template), cùng `app.js`, `preview.css`, `tokens.css`. Đối chiếu [Web Interface Guidelines — nguồn được tải trong phiên review](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Review artifact, không review hay chứng nhận ứng dụng production.

```text
index.html:1 - ✓ pass trong phạm vi prototype; không còn finding cần sửa từ checklist đã áp dụng
app.js:1 - ✓ pass trong phạm vi state/draft/dialog của prototype
preview.css:1 - ✓ pass trong phạm vi responsive/focus/touch đã đo
tokens.css:1 - ✓ pass cho các cặp contrast được đo
```

## Đã sửa trước khi chốt

- CTA dạng link bị rule nền trong suốt của control thắng cascade: thêm rule primary link riêng, text trắng trên action xanh đậm. PNG cuối đã có contrast đúng.
- KPI Tổng quan nằm sát mép nav: giảm spacing cục bộ, giữ hierarchy; 390px hiện đủ giá trị và nhãn KPI sau hàng chờ/lịch.
- Sheet giới hạn theo khung review và tách vùng nội dung cuộn/footer; native dialog hỗ trợ focus trap, Escape và trả focus về trigger.
- Control chọn trạng thái AI chuyển ra panel review, không xuất hiện như thao tác nghiệp vụ của sale.
- Search/filter được đồng bộ query. Text dài wrap/clamp theo vai trò; selected/pressed có trạng thái và aria tương ứng.
- Ngày/giờ native chịu locale Chrome desktop; thêm dòng xác nhận bằng định dạng `vi-VN` trong form để tránh đọc nhầm ngày.

## Bằng chứng

- [verification.json](verification.json): **81** ca đo DOM, không phát hiện overflow ngang document/phone hoặc target đã đo nhỏ hơn44×44 CSS px; **9/9** kiểm tra tương tác đạt, không có runtime exception trong lượt capture cuối.
- [audit.json](audit.json): kích thước 32 PNG, contrast text/action/chip/banner/message và kiểm tra source về zoom, focus-visible, light-only, safe-area viewport, input, dialog, API/import.
- Có native controls/semantic links, labels, skip link, thứ tự heading; toast `role=status`/live region, error có hành động tiếp theo. Không animation nên không cần reduced-motion override; không cấm pinch zoom/paste, không thao tác chỉ bằng gesture.
- Body16, input16+, nav đủ 5 nhãn ở320; giữ namespace `.crm-mobile`, token `--m-*`; không external font/image dependency.
- Native date/time sinh data URL icon nội bộ Chrome; không phải request API hoặc ảnh khách. Capture không ghi nhận external HTTP request của trang.

## Giới hạn review

Đo computed rect không xác nhận touch trên phần cứng, focus không bị che ở mọi mức zoom hoặc đủ accessibility/VoiceOver. Kiểm tra filter/native cancel có phần gọi state public của component; có kiểm tra Escape bằng CDP keyboard thực. Không coi các ca này là E2E business.

Chưa kiểm iPhone/Safari/Home Screen, bàn phím iOS, Dynamic Type, VoiceOver, PWA lifecycle, các trạng thái gửi FAILED/UNKNOWN với backend, reconnect/outbox, prepend anchor hoặc permission live. Các form/menu nâng cao có chỗ đề xuất trong PARITY-GAPS, chưa dựng đủ. Bộ state selector là công cụ review, không phải phát hiện offline mạng thật.

File header chỉ nêu dòng1 làm entry point cho kết quả pass toàn file; không ngụ ý mọi rule chỉ được kiểm tại dòng đó. Typecheck/vitest ứng dụng không chạy vì lượt này chỉ thêm tài liệu/HTML preview.
