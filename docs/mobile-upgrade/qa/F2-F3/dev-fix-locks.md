# F2+F3 — LOCK REQUEST (đề xuất cho main session)

Tôi KHÔNG sửa file shared nào trong lượt này. Các mục dưới là đề xuất.

## L-A. `frontend/src/views/MobileChatView.vue` ~dòng 111-115 — LỖI BIÊN DỊCH (đang chặn `vue-tsc -b` và `mobile-chat-view.dom.spec.ts`)
`<AttachmentSheet>` đang có `:customer-name` **hai lần** (TS1117 / "Duplicate attribute"), do thay đổi chưa commit của main cùng `:owner-name`. Đề xuất xóa MỘT dòng:
```diff
       :current-conversation-id="routeConvId"
       :customer-name="conversationDisplayName(selectedConv)"
       :owner-name="threadContext.ownerName"
-      :customer-name="conversationDisplayName(selectedConv)"
       :context="threadContext"
```
Đây là lỗi duy nhất của `vue-tsc -b` và là spec duy nhất đỏ (1/73 file) trong toàn bộ `vitest run`.
(Cần main kiểm thêm: `<MediaLibrarySheet>` trong cùng file có truyền `customer-name`/`owner-name` để đích gửi hiện đúng tên khách + người phụ trách; tôi chưa đọc phần đó vì file khóa.)

## L-B. Bản mở rộng (`isExtension === true`): route `/marketing` do `eeTopRoutes` đăng ký, KHÔNG qua `mobileToolRoute`
Router chỉ bọc `mobileToolRoute('marketing', …)` cho nhánh Community. Ở bản mở rộng, trên điện thoại vẫn mở view desktop của EE (bảng rộng). Menu Tài khoản đã đúng quyền/cờ, nhưng đích là view desktop. Đề xuất: nơi `eeTopRoutes` định nghĩa `component` của `/marketing` (repo EE, ngoài worktree này) bọc bằng `mobileToolRoute('marketing', () => import(<shell EE>))`. Presenter mobile đọc `route.path` nên hoạt động với các đường dẫn Community; chức năng riêng của EE (ngoài 9 khóa `MARKETING_FEATURE_KEYS`) sẽ rơi vào trạng thái "Chọn một chức năng". Không làm được trong worktree này vì repo EE không có ở đây.

## L-C. Alias Marketing cũ
`MARKETING_PATH_FEATURES` có `goals`, `triggers` → `targets` nhưng router Community không có route tương ứng; presenter chỉ biết 9 đường dẫn của CommunityMarketingShell. Không cần sửa router.

## Đã xử lý trong file của tôi, KHÔNG cần lock
- Tab "Khối" của thread: nhúng nguyên `AutomationBlocksPanel` (`@ee/automation/chat-blocks/AutomationBlocksPanel.vue`) ngay trong `components/mobile/chat/MediaLibrarySheet.vue`. Không đụng `MessageThread.vue` / `use-chat.ts`.
- Nút Quay lại của `/marketing`, `/groups`, `/friends` đã về Tài khoản qua `handleBack` của MobileLayout (main đã làm). Không đề xuất thêm.
