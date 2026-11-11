# Reviewer độc lập đợt E — 10/11/2026

Vai trò mobile-ui-reviewer, chỉ đọc. Kết luận sau vòng sửa: **MERGE ĐƯỢC trong phạm vi source review**, còn chờ QA/chủ dự án duyệt. Không thay thế iPhone thật hoặc kiểm pixel.

| Finding ban đầu | Mức | Sửa / trạng thái |
|---|---|---|
| Refresh 403 bị coi là profile 403 rồi logout | P1 | Đóng: xác định nguồn refresh trước status, test ghép store |
| Response refresh muộn có thể hồi sinh phiên logout hoặc xóa phiên mới | P1 | Đóng: snapshot RT kiểm cả success/rejection; stale operation không ghi/xóa/đánh dấu mất kết nối phiên mới |
| Port bị chiếm trong lúc build khiến tunnel có thể công khai listener khác | P1 | Đóng: xác minh listener PID và process sống trước/sau bật; supervisor theo dõi owned services |
| Rebuild dùng PID đã kiểm trước build, có cửa sổ PID reuse | P2 | Đóng: recheck tên/thời điểm tạo ngay trước dừng, kiểm listener và state atomic |
| Prompt/panel không theo Tối, nút contrast 4,046:1 | P2 | Đóng: namespace crm-mobile, token m-*, action/on-action; test contrast Sáng 7,715:1 / Tối 9,294:1 |

Reviewer đã đọc lại source sau sửa: socket chỉ đổi catch refresh, không đổi token storage/RBAC/protocol; cache chỉ shell tĩnh, cleanup/kill giới hạn kho CRM; icon đúng kích thước. Npm peer range của plugin chưa khai báo Vite8 dù build/runtime thử đạt; báo rõ, không tự đổi dependency.

Auth được chủ dự án duyệt commit riêng (xem AUTH-LOCK.md), áp dụng cả desktop. Source PWA/tunnel chưa commit/merge. Không truy cập VPS/production trong đợt E.

## Review tiếp tục — chỉ delta sau lần MERGE ĐƯỢC (10/11/2026)

Reviewer độc lập Sonnet nhận snapshot source delta, không có quyền sửa/chạy test. Orchestrator chạy QA riêng. Lượt đầu: **MERGE ĐƯỢC**; lượt cuối: **không có finding chặn merge**. Trả lời lưu ở `../qa/E-evidence/review.log` và `review-final.log`.

Phạm vi: observer/cleanup của PwaRuntime,6 test DOM, E2E explicit update và cold process restart, engine/profile harness và chọn chữ trước Backspace. Không review/sửa lại auth df9d9cf hoặc PWA cũ đã duyệt.

| Ghi nhận | Kết quả |
|---|---|
| Guard đồng bộ accept/controllerchange, nháp RAM/DOM/outbox | Giữ rào; không tự reload khi nháp/pending |
| Vòng lặp / cleanup | Không vòng lặp; ref cùng giá trị không trigger; disconnect, gỡ listener, guard fail-closed |
| Test DOM cũ | Capture phân biệt lỗi cũ; kiểm riêng characterData và guard trước observer |
| Chi phí quét body | Thấp, không chặn; đo thêm trên iPhone yếu |
| Reviewer thiếu source Map RAM | Orchestrator xác minh `use-mobile-chat-drafts.ts`: `reactive(new Map<string, string>())`; `hasAnyDraft()` duyệt `drafts.values()`, computed theo dõi Map. Không phải Map thường/cache cũ |
| Đổi contenteditable/plaintext-only | Selector có từ trước; Tiptap hiện dùng true. Guard vẫn rà đồng bộ |
| Profile Windows ngắn/root mới | Lệnh QA bắt buộc E_QA_PROFILE_ROOT ngắn ASCII + GUID mới mỗi lượt; chỉ ca restart dùng lại profile trong cùng test |

Kết luận tích hợp delta: **MERGE ĐƯỢC**, nhưng theo lệnh chủ dự án **CHƯA COMMIT PWA / CHƯA MERGE**. QA32/32, Vitest705/705, desktop1440 12/12 exact0: `../qa/QA-E-G4.md`. Chưa Safari/iPhone thật.
