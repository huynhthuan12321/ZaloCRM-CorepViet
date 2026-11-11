# Triển khai sửa gửi tin, biến động số dư và đơn hàng — 08/11/2026

Đã triển khai production và mở lại website lúc **07:43:51 (+07)**. Hậu kiểm lúc **07:50:49**: app healthy, restart 0, không có lỗi tenant-guard/RLS/fatal từ startup; DB container và cấu hình runtime giữ nguyên. Đây là kết quả trong cửa sổ quan sát, không phải chứng nhận full-suite hoặc toàn bộ nhà cung cấp.

## CRM

- Image mới: `sha256:0600cdff4def1278d9fe812326713c691003a10a7e658f9b279619af3e22d606`, derivative của image đang chạy `652376…`. Chỉ overlay hai module public API/auth và source maps; không build từ checkout production cũ hoặc toàn bộ workspace đang có thay đổi khác.
- Lookup hash API key dùng system scope chỉ trong xác thực; Fastify continuation chạy trong tenant của key đã xác thực. Không mở bypass cho nghiệp vụ, không tắt guard/RLS.
- Giữ Env/User/ports/mounts/network/resources, schema 130 migration, 103 bảng forced RLS và app role không có superuser/bypass. Không migration và không sửa số tiền.
- Probe n8n dùng credential public API thật gọi đúng đường tìm người nhận: HTTP 200, tìm thấy liên hệ và 1 bạn Zalo. Không gửi tin cho khách trong probe.

## n8n và Lark

Năm workflow đã được cập nhật, validate runtime và đọc lại published graph/connection:

| Workflow | Thay đổi | Published version |
| --- | --- | --- |
| ZALO - XAC NHAN THANH TOAN DON HANG | Escape HTML cho cảnh báo; phân biệt lỗi API với không có bạn; kiểm acknowledgement cảnh báo | `3d822b08-1ad0-4298-9247-fc39e035d353` |
| TAO_DON_ HANG_LARK | Lỗi HTTP 401/403/429/5xx không bị coi là khách chưa kết bạn; gắn error workflow | `9d7a09dd-f545-4833-a158-2f4d4e0d4081` |
| COREPVIET_ORDER_NOTIFICATION | Trả success=false khi đã gửi Telegram nhưng chưa lưu Lark; nêu telegram_sent=true để không gửi trùng | `a7ddfae1-69c9-49e1-804f-5b28720f34b3` |
| CRV GHN - Đồng bộ phí thực tế | Tách vận đơn không được đăng ký khỏi trùng vận đơn; không khớp thì trả review, không gọi/ghi phí; giữ kiểm tra unique/GHN và error workflow | `7f418ab9-0dbf-4d0f-b3da-8b28efb3736e` |
| COREPVIET_DOI_SOAT_CHO_DUYET_BIEN_DONG_SO_DU | Escape HTML; kiểm kết quả gửi cảnh báo sau khi đối soát; sửa parser liên kết và phân nhóm thiếu ledger | `13d86a0e-15ae-4125-b9f2-0511ccb9d194` |

Lark đã tạo hai field text đúng tên workflow đang dùng: `OrderTelegramMessageId` (`fldvaI57dk`) và `OrderTelegramChatId` (`fldrDdDEzx`). Không đổi field giao hàng hoặc ghi lại trạng thái các đơn cũ trong lượt này.

Tool n8n báo instance không hỗ trợ ghi setting `timeSavedMode` ở hai workflow; tool giữ giá trị instance đang có. Không nâng n8n hoặc đổi setting đó trong bản sửa.

## Nguyên nhân cảnh báo đối soát nhiều đơn

Probe Lark thật xác nhận liên kết `Don_Hang` là array object chứa `record_ids`, `table_id`, `text`, `text_arr`, `type`. Parser cũ chỉ nhận record_id/id/link_record_id nên nhận **0 liên kết** từ 150 phiếu thu trong snapshot mới.

Lúc 07:47–07:48, dữ liệu có **294 đơn, 150 phiếu thu**. Parser cũ sinh 252 cờ; parser sửa đọc được 150 liên kết và phân loại:

- **13 đơn** chênh lệch so với phiếu thu CONFIRMED liên kết.
- **131 đơn** chưa có phiếu thu CONFIRMED liên kết; cần đối chiếu dữ liệu lịch sử, không tự xem là sai tiền.

Tổng 144 cờ cần đối chiếu, không phải 144 khoản đã xác nhận thất thoát. Con số 249 trong báo cáo 07/11 là snapshot cũ, không cùng số bản ghi. Mã reconciliation đã sửa được kiểm qua probe chỉ đọc với chính code sẽ chạy trong workflow, rồi mới publish. Không tự tạo phiếu thu hoặc cân bằng Da_Thu.

## Kiểm thử và giới hạn

- 9 unit tests public API/JWT: PASS, gồm concurrent tenants, key thiếu/sai, tenant không hợp lệ, DB failure và không rò system bypass. Lần đầu Vitest bị sandbox chặn cache, lần khởi động kế bị timeout; lần chạy chung cuối PASS. Không gọi full backend suite là xanh.
- 36 assertions offline cho HTML escaping, API error classification, partial Lark result, GHN matching và reconciliation: PASS.
- Compile đầy đủ source release đóng băng: PASS. Lần build đầu thiếu heap Node; đã tăng heap chỉ cho container compile không mạng, app production không bị đổi resources.
- 15 production smoke checks: PASS; authenticated CRM resolver probe: PASS; reconciliation probe trên Lark thật: PASS.
- Hai probe workflow tạm đã xóa sau kiểm tra. Không replay webhook SePay, không gửi tin thử cho khách và không gửi lại đơn cũ.
- Chưa có execution gửi Zalo/đơn hàng mới tự nhiên sau bản sửa trong thời gian kiểm tra. Chưa chứng nhận delivery acknowledgement của provider hoặc lịch đối soát 08:00; cần theo dõi các lần chạy thật tiếp theo.
- Vận đơn GHN `GYE7QFDC` không tồn tại trong bảng giao hàng tại lần đối chiếu. Bản sửa trả `ok=false, skipped=true, needs_review=true, reason=SHIPMENT_NOT_FOUND`, không ghi phí. Cần liên kết vận đơn thật trước khi đồng bộ; không coi skipped là đã cập nhật phí.
- Các lỗi dữ liệu bổ sung ở báo cáo trước (NCC chưa xác minh tài khoản ngân hàng, thiếu record bung combo, intake sản lượng) không được xử lý bằng cách bỏ kiểm nghiệp vụ hoặc tạo dữ liệu giả trong bản triển khai gửi tin này.

## Bằng chứng và phục hồi

[Release summary](../../artifacts/messaging-fix-20261108/release-summary.json), [kiểm thử workflow](../../artifacts/messaging-fix-20261108/tools/test-workflow-patches.mjs), [hướng dẫn vận hành](../../artifacts/messaging-fix-20261108/OPERATIONS.md).

VPS giữ cấu hình private, log và DB backup trong `/root/zalocrm-release-evidence/messaging-fix-20261108`. Backup SHA256 `f4809e3ead9c5605484bf38d574aeea640e3c9bd2afc5a77d5ce5bdc0675d5a6`. Runner phục hồi SHA256 `6a9321bab629894bf34cc5e071106f9a51228ea99f13affeda0f2d57feea332c`, đã đối chiếu local/VPS. Old app container được giữ để fallback app, không restore DB và không hạ bảo vệ tenant. Fallback quay về code public API có lỗi cũ nên chỉ dùng khi cần phục hồi dịch vụ khẩn cấp.

Không commit/push hoặc đưa các thay đổi khác đang có trong workspace vào image.

## Hậu kiểm theo phản ánh còn lỗi — 07:56 ngày 08/11

Đã đối chiếu cùng đơn **DH5811107**, chỉ đọc lịch sử và Lark, không retry gửi:

- Execution cũ `292414`, 21:40 ngày 07/11: Resolve Zalo Friend trả HTTP 500 AppSetting.findFirst ngoài tenant context; không chạy gửi ảnh.
- Execution mới `295967`, 07:53:17–07:53:42 ngày 08/11: Resolve Zalo Friend trả contact/friends hợp lệ, Validate CRM Resolve Response chạy thành công, Send Image Zalo trả `success=true, sent=1`, Update Lark Sent trả `code=0`.
- Đọc trực tiếp bản ghi Lark `reczz28WkYx4kD43`: Trang_Thai_Gui_Zalo=`Da gui`; Ma_Xac_Thuc_Da_Gui và Ma_Xac_Thuc_Da_Duyet cùng bằng `v1-635471f502a20654`; Ngay_Gui_Zalo=`2026-11-08T07:53:41.774+07:00`.
- Hậu kiểm runtime 07:56:21: đúng image `0600cd…`, healthy, restart 0, không có lỗi guard/RLS/fatal từ startup.

Đây là bằng chứng gửi ảnh thực và lưu trạng thái cho đơn cụ thể, bổ sung cho giới hạn chưa có execution tự nhiên ở cửa sổ triển khai phía trên. Không chứng nhận các đơn khác đều đã gửi, và provider acceptance không thay thế xác nhận khách đã đọc ảnh.
