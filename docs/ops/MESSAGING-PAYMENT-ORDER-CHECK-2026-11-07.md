# Kiểm tra gửi tin, biến động số dư và đơn hàng — 07/11/2026

> Cập nhật 08/11: bản sửa đã được triển khai. Xem [báo cáo triển khai và hậu kiểm](MESSAGING-PAYMENT-ORDER-DEPLOY-2026-11-08.md). Các nhận định bên dưới là snapshot trước sửa; số cờ đối soát đã được kiểm lại với parser liên kết Lark đúng.

## Phạm vi và phương pháp

Kiểm tra chỉ đọc trên n8n.corepviet.com qua n8n MCP và đối chiếu source CRM. API n8n phản hồi healthy. Đọc metadata 71 workflow active; truy vấn toàn bộ danh sách execution error hiện API trả về: 36 bản ghi, từ 06/11 đến 07/11. Kiểm tra tối đa 5 lần chạy gần nhất của 28 workflow thuộc gửi tin/SePay/đơn mua/đơn bán/GHN và đọc chi tiết các bước có dấu hiệu lỗi. Đây là lịch sử còn được API cung cấp, không phải toàn bộ lịch sử vận hành.

Không chạy lại webhook, không gửi tin thử, không ghi dữ liệu tài chính, không thay workflow hoặc triển khai production. Không lưu raw execution, token hay dữ liệu liên hệ vào báo cáo.

## Lỗi đã xác nhận

| Mức ưu tiên | Luồng | Bằng chứng | Ảnh hưởng |
| --- | --- | --- | --- |
| P1 | Zalo xác nhận thanh toán | Execution 292401 lúc 21:37 ngày 07/11: Resolve Zalo Friend trả 500, tenant-guard báo AppSetting.findFirst ngoài tenant context. Return Failure: success=false, sent=false. | Đã nhận tiền nhưng chưa gửi xác nhận Zalo. Workflow tổng vẫn xanh. |
| P1 | Gửi ảnh đơn hàng | Execution 292414 lúc 21:40: Resolve Zalo Friend trả cùng lỗi 500; chuyển vào nhánh Zalo Chưa Gửi - Kiểm Tra Kết Bạn; Send Image Zalo không chạy. | Tạo tài liệu đơn hàng không đồng nghĩa đã gửi khách; lỗi hệ thống bị phân loại thành vấn đề kết bạn. |
| P1 | Cảnh báo lỗi Zalo và đối soát | 292401: Telegram Zalo Failure Alert lỗi can't parse entities. 287499 lúc 08:00: Telegram Summary và Telegram Da_Thu Drift Alert cùng lỗi parse entities. Các node tiếp tục regular output. | Cảnh báo quan trọng không tới người vận hành dù execution tổng xanh. |
| P2 | Thông báo đơn hàng về Lark | 292400 lúc 21:37: Telegram gửi được; Save TG Ref + Set Shipping Status trả code 1254045 FieldNameNotFound. Return Success vẫn success=true, lark_saved=false, notification_ref_needs_review=true. | Không lưu được đầy đủ tham chiếu Telegram/trạng thái giao hàng trong lần ghi này. |
| P2 | Đồng bộ phí GHN | 32/36 error records hiện có thuộc workflow ivN4pHbnOJeeXzBF. 292448 lúc 21:44: Find Fee Shipment trả items=[], total=0; Resolve Fee Shipment ném SHIPMENT_NOT_UNIQUE. | Không đồng bộ phí cho các sự kiện không khớp bản ghi vận đơn; thông báo hiện gộp trường hợp 0 và nhiều bản ghi. |

### Nguyên nhân API CRM

`backend/src/modules/api/public-api-routes.ts:40` dùng async preHandler `apiKeyAuth`; dòng 44 gọi prisma.appSetting.findFirst trước khi có tenant context, không bọc runSystemQuery. Sau lookup chỉ gán request.orgId, không truyền tenant context vào continuation của Fastify.

Cần sửa cả hai tầng: lookup hash API key trong system scope được giới hạn cho xác thực, sau đó chạy continuation trong withTenant của org đã xác thực. Không mở bypass cho các route nghiệp vụ và không tắt guard/RLS. Mẫu continuation đã có trong `backend/src/modules/auth/auth-middleware.ts`.

Do hook áp cho mọi public API, lỗi có thể chặn cả API tìm liên hệ, đọc thông tin và gửi text/ảnh. Bằng chứng production trực tiếp trong lượt kiểm tra này là hai route tìm người nhận được n8n gọi; chưa gửi tin thật để chứng minh mọi endpoint khác.

Lần trước: 288683 và 287732 xác nhận Zalo có Return Success sent=true; 288160 gửi đơn có Update Lark Sent code=0. Điều này xác nhận luồng từng hoạt động trong lịch sử hiện có, không xác định chính xác phút bắt đầu regression.

### Lark và Telegram

Node Save TG Ref + Set Shipping Status ghi ba field: OrderTelegramMessageId, OrderTelegramChatId, Trang_Thai_GiaoHang. API báo FieldNameNotFound nhưng chưa xác định field nào sai từ metadata schema trong lượt kiểm tra này. Cần đối chiếu schema thực tế trước khi đổi hoặc tạo field.

Các node Telegram lỗi đang đưa text động chứa tên field/key có dấu gạch dưới vào node Telegram, additionalFields không chỉ định parse mode. Lỗi parser được xác nhận từ execution; cần dùng plain text hoặc escape đúng parse mode, và kiểm tra kết quả gửi thay vì chỉ xem trạng thái workflow.

## Biến động số dư: phần đang hoạt động và phần cần đối chiếu

- 292397 → 292398: SePay nhận sự kiện lúc 21:36; P1 tạo bản ghi biến động, tạo thu tiền, cập nhật đơn; các bước kiểm ghi trả thành công. Telegram Payment Success có ok=true. Lỗi nằm ở nhánh xác nhận Zalo sau đó, không phải bằng chứng mất webhook SePay của giao dịch này.
- 287499: đối soát đọc 290 đơn và 147 phiếu thu, đánh dấu drift_count=249; pending_count=93, created_count=5, skipped_count=88. Hai cảnh báo Telegram bị lỗi parser.
- 249 là số cờ cảnh báo do thuật toán hiện tại sinh ra, chưa phải số đơn đã xác nhận sai tiền. Cần đối chiếu ledger lịch sử, trạng thái CONFIRMED, liên kết đơn và dữ liệu chuyển đổi trước khi sửa bất cứ số tiền nào. Không tự cân bằng hoặc ghi đè Da_Thu.
- Scanner 292456 chỉ tìm trạng thái Đang gửi; nó kết thúc nhánh không có stuck records. Điều này không chứng nhận các bản ghi đã chuyển sang trạng thái thất bại được retry.

## Các phát hiện bổ sung

- Tạo QR mua hàng: 289993 và 287790 dừng vì NCC chưa xác minh tài khoản ngân hàng. Đây là chặn nghiệp vụ; 290024 sau đó chạy đến Hoan Tat, notificationsQueued=true. Không nên bỏ kiểm xác minh ngân hàng để làm execution xanh.
- Đồng bộ sản lượng vào phiếu nhập: 290628 vào Intake Failure sau Lark App Token. Token node code=0; chưa đủ bằng chứng xác định nguyên nhân sâu hơn. Cần đọc input/error của nhánh Intake Failure và lần chạy kế tiếp trước khi kết luận token lỗi.
- Bung combo kho: 284546 thiếu record `recvqKSZUdEeSC`, journal=released_before_write; lỗi thiếu dữ liệu đầu vào, không đồng nhất với lỗi gửi tin.
- 291120 báo cáo đơn hàng hằng ngày đã đi qua gửi báo cáo và 8 thẻ đơn Telegram. 282678 callback đơn hàng đã cập nhật Lark, chạy xuất kho, sửa tin Telegram. Đây là bằng chứng cho những lần chạy cụ thể.
- 288180 khớp tiền ra và 288198 nhập kho đi tới FinishPlan; 292467 outbox không có việc để gửi, nên không dùng execution rỗng này làm bằng chứng giao tin.

## Danh sách workflow đã kiểm lịch sử gần nhất

| Workflow | Nhận định từ lịch sử hiện có |
| --- | --- |
| COREPVIET_TELEGRAM_BIEN_DONG_SO_DU_GATEWAY | Gần nhất chuyển tiếp tin lead, không phải chứng nhận nhận biến động ngân hàng |
| TELEGRAM CONFIRM - QUEUE PAYMENT | Không có execution trong kết quả API |
| TELEGRAM CONFIRM - CALLBACK GATEWAY | Có execution gần nhất xanh; chỉ kiểm metadata |
| CRV MUA - Telegram Callback | Lần gần nhất dừng ở kiểm claim, chưa chứng nhận xử lý callback đến cuối |
| TELEGRAM CONFIRM - CALLBACK PAYMENT | Không có execution trong kết quả API |
| SEPAY - FORWARD BIEN DONG SO DU TO P1 | Có nhận và chuyển tiếp sự kiện gần nhất |
| CRV GHN - Tao van don 2 cap | Không có execution trong kết quả API |
| GATE CHECK | Không có execution trong kết quả API |
| STAGING_DUYET_DON_HANG_LARK_V2 | Không có execution trong kết quả API |
| CRV MUA v2 - Nhap kho | Có lần chạy đến FinishPlan |
| COREPVIET_HERMES_BIEN_DONG_SO_DU_TO_LARK | Không có execution trong kết quả API |
| TELEGRAM CONFIRM - MANUAL ORDER INPUT | Không có execution trong kết quả API |
| COREPVIET_ORDER_CALLBACK | Có lần cập nhật Lark và Telegram thành công |
| ZALO - XAC NHAN THANH TOAN DON HANG | Lỗi API CRM, sent=false ở lần gần nhất |
| GHN_WEBHOOK_CAP_NHAT_LARK | Parent xanh nhưng phí GHN child lỗi |
| STUCK SCANNER - ZALO THANH TOAN | Chỉ kiểm stuck ở trạng thái Đang gửi |
| TAO_DON_ HANG_LARK | Gửi ảnh bị chặn ở resolve CRM |
| CRV MUA v2 - Tao QR | Có chặn NCC chưa xác minh; lần sau tạo kế hoạch/thông báo thành công |
| CRV GHN - Đồng bộ phí thực tế | Lỗi lặp lại khi không có shipment khớp |
| CRV MUA 4 - Kiem tra va bao cao | Có execution xanh; chỉ kiểm metadata |
| COREPVIET_ORDER_NOTIFICATION | Gửi Telegram được, ghi Lark thất bại |
| Invoice Image → ZaloCRM (Cờ Rếp Việt) | Không có execution trong kết quả API |
| COREPVIET_ORDER_DAILY_CHECK | Có báo cáo và thẻ đơn Telegram trong execution được kiểm |
| SEPAY - DOI SOAT DON HANG - P1 | Ghi nhận tiền được; nhánh Zalo thất bại riêng |
| CRV MUA 5 - Gui thong bao tu outbox | Gần nhất queue rỗng |
| CRV GHN - Chuan bi giao hang tu don ban | Không có execution trong kết quả API |
| CRV MUA v2 - Khop tien ra | Có lần chạy tới FinishPlan |
| COREPVIET_DOI_SOAT_CHO_DUYET_BIEN_DONG_SO_DU | Đối soát chạy, gửi cảnh báo Telegram lỗi |

## Thứ tự khắc phục

1. Sửa public API auth tenant continuation; test đồng thời hai org, thiếu/sai key, lỗi DB và không rò bypass sang handler. Triển khai qua bản phát hành giữ nguyên guard/RLS.
2. Sửa Telegram formatting và phát hiện kết quả lỗi; tách trạng thái API 500 khỏi không tìm thấy bạn Zalo.
3. Đối chiếu field Lark cho tham chiếu Telegram; không trả thành công toàn phần khi lark_saved=false.
4. Phân biệt shipment không tồn tại và trùng lặp, xác định mapping vận đơn GHN; không tạo shipment giả để bỏ lỗi.
5. Lập danh sách gửi thất bại và kế hoạch retry có chống trùng. Không replay webhook thu tiền vì có nguy cơ lặp ghi nhận nghiệp vụ; retry phần gửi sau khi xác minh idempotency.
6. Đối chiếu 249 cờ chênh lệch riêng trước mọi sửa tiền.

Kết luận: hệ thống có lỗi thực ở gửi Zalo và cảnh báo, cộng lỗi ghi tham chiếu đơn/đồng bộ phí. Không được dùng execution success hoặc health healthy làm chứng nhận toàn bộ luồng. Chưa sửa production trong lượt kiểm tra này.
