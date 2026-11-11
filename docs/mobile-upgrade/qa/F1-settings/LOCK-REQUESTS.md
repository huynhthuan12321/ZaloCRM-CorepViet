# F1 — LOCK REQUEST và quyết định tích hợp

Ngày 10/11/2026. Candidate `mobile/ext`, worktree `F:/ZaloCRM-wt/ext`; base/merge-base `bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`.

Các patch shared chỉ do main đọc và áp dụng; agent dev chuẩn bị bản đề xuất ngoài repository. Main đã đọc toàn bộ diff và áp các LOCK bên dưới; lần đầu `git apply --check` thành công.

| File | Mục đích LOCK REQUEST | Rào phạm vi |
|---|---|---|
| `frontend/src/views/rbac/UsersRbacView.vue` | Nối presenter thẻ mobile với controller và handler nhân viên hiện có | Nhánh desktop giữ nguyên; role gate/payload giữ nguyên |
| `frontend/src/components/rbac/UserEditPanel.vue` | Sheet chi tiết mobile, hiển thị Tối, focus và vùng cuộn | Dùng lại thao tác nhân viên; tùy chọn mobile mặc định tắt |
| `frontend/src/components/users/CreateUserWithZaloModal.vue` | Modal tạo nhân viên vừa màn mobile | Giữ nguyên wizard và điều kiện quyền |
| `frontend/src/components/settings/OrgSettings.vue` | Loading/error/offline và bảo vệ thay đổi chưa lưu trên mobile | PUT/GET hiện có, chỉ owner sửa; desktop mặc định như cũ |
| `frontend/src/components/zalo-accounts/InternalContactSetupPage.vue` | Giữ cấu hình nhận thông báo, trình bày mobile và trạng thái tải | Không đổi luồng handshake hay endpoint |
| `frontend/src/components/mobile/shell/MobileSheet.vue` | Nút Đóng tôn trọng trạng thái đang lưu (`persistent`) | Mặc định false giữ hành vi cũ |

Reviewer vòng 1: **CẦN SỬA**. Chưa QA, chưa đủ điều kiện nghiệm thu. Không merge/push/deploy.

Thiết kế F1: người dùng sửa thông tin thường dùng bằng một tay; tên/thông tin chính dẫn đầu, hành động theo quyền phía sau. Dùng token `--m-*` hiện có, nền/surface thay theo Sáng/Tối; chữ hệ thống 16px, tiêu đề section17/650; spacing4px với gutter/surface12–16px. Thẻ nhân viên có thông tin vai trò/phòng ban; sheet dùng primitive có sẵn. Trang quản trị chỉ đọc phải giữ thao tác chọn mục/lọc và nội dung trong accessibility tree.

## Tích hợp thực tế

- Main áp `shared.patch` SHA256 `B4C2B890DEA097398CA48427504A3BB104CCE5FF2A3DABF286E56C28FD6BB042` cho 5 file; tiếp đó patch trạng thái lỗi cho wizard thông báo và amendment `mobile: undefined` cho Org/Users (tránh Vue ép Boolean vắng mặt thành false, làm mất cờ inject).
- Main bổ sung focus trap/return cho modal nhân viên hiện có, nhãn truy cập trường, rào đóng khi đang lưu, màu cho confirm teleport; truyền nguồn người nhận bàn giao; dọn debounce/request cũ; chặn rời Org trong request lưu. Các sửa này nằm đúng LOCK đã yêu cầu.
- `OrgSettings`/`UsersRbacView` chỉ bật chế độ mobile khi có prop hoặc context từ `MobileSettingsShell`. Desktop giữ đường xử lý/markup gốc qua nhánh `v-else`. Payload nghiệp vụ gốc giữ nguyên.
- Login preview mô phỏng trang đăng nhập vẫn Sáng có nhãn rõ; các phần còn lại trong F1 theo Tối thật. Các cài đặt ngoài danh sách F1 không được tuyên bố đã tối ưu.
- Đối chiếu nguồn backend chỉ đọc: `tag-routes.ts` POST `/tags` không nhận/bắt buộc `zaloAccountId`; giữ payload tạo nhãn hợp đồng hiện có.
- Kiểm tra tích hợp trước QA trình duyệt: vue-tsc0, toàn bộ Vitest68 file/756 test pass, build0. Đây chưa phải gate QA trình duyệt.

## LOCK F1-QA — main tích hợp sau kiểm trình duyệt

- Mở rộng LOCK CreateUserWithZaloModal/UserEditPanel: nền bước/nhãn/quan hệ/kết quả theo token; link panel chạm44px, empty/danger theo token. Không đổi handler/payload.
- LOCK REQUEST `frontend/src/assets/mobile-tokens.css` và `frontend/src/views/MobileChatView.vue`: main xác minh cold-load Cài đặt bị confirm z1100 nằm dưới sheet2400/3000; mở Chat trước thì z2600 che lỗi. Chuyển riêng CSS confirm từ lazy Chat sang token được MobileLayout nạp, z13000 trên panel/confirm nhân viên, target44/input16; gate body.m-toast-host nên desktop giữ nguyên. CSS chat nick/sticker giữ tại chỗ. Main đọc hai file và tự tích hợp.
- LOCK MobileSheet: footer slot nhận `requestClose` (thêm tương thích); nút Hủy F1 gọi dirty/persistent guard như nút Đóng. Consumer không dùng slot prop giữ nguyên.
- StatusFormSheet: nút Tạo rộng tối thiểu44; thẻ nhân viên focus trước emit để Safari trả focus đúng; empty có lọc xóa đủ bộ lọc.
- QA phải chạy lại cold URL và confirm bỏ thay đổi trên build mới.

## Soát policy thông báo sau QA

Main phát hiện `ZaloAccountsView.vue` đã khóa tab internal-contact (CEO-review 10/06, lý do gửi nhầm UID), dù menu cũ còn trỏ URL này. Không được phục hồi wizard chỉ vì component còn trong source. Main trả `InternalContactSetupPage.vue` về nguyên HEAD; MobileInternalContactPage chỉ GET cấu hình và có hướng dẫn quản trị dùng máy tính/Thông báo hệ thống. Không PATCH/DELETE/handshake. Review vòng3 trước phát hiện này không được coi là duyệt thay đổi mới; cần review độc lập lại.
