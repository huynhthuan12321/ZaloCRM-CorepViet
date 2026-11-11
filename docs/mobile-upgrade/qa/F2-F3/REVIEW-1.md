# REVIEW ĐỘC LẬP F2+F3 — mobile/ext (so với 50db984)

Reviewer: độc lập, mới. READ-ONLY (không sửa source, không commit/push).
Đã đọc: contract skill, dev-notes, shared-applied, dev-fix-final, dev-fix-locks, toàn bộ source F2/F3 mới, diff các file shared (router, MobileLayout, use-mobile-nav, MobileChatView, account-menu).
Chưa đọc đủ: vue-best-practices / interface-design / mobile-ux-optimizer ở `.codex/skills` (không áp dụng thêm quy tắc ngoài contract; contract thắng).

## Kiểm TĨNH vs RUNTIME
- Chạy được (runtime Node/jsdom): `npx vue-tsc -b` → **sạch (exit 0)**; `npx vitest run` → **73 file / 841 test pass**. L-A (thuộc tính `customer-name` trùng) đã hết. Đây chỉ là jsdom + mock API.
- KHÔNG kiểm (không có công cụ/thiết bị): Safari/WebKit iPhone, Home Screen PWA, Playwright viewport 320–430/768, pixel desktop/tablet so với 50db984, focus-trap thật của VDialog, stacking ConfirmHost trên sheet/viewer, ảnh chụp. Mọi kết luận về pixel/viewport/iOS dưới đây là suy luận từ code.

## KẾT LUẬN: **PASS CÓ ĐIỀU KIỆN cho bản Community (không có finding chặn merge ở mức correctness/an toàn dữ liệu)**.
- **KHÔNG PASS cho bản Enterprise/Extension** (`isExtension`): xem L-B (finding E1). Không được ghi "đạt" cho EE.
- **Chưa được gọi là "đạt trên iPhone"**: thiếu kiểm thiết bị thật + pixel desktop.
- Có 1 finding MEDIUM nên sửa trước khi giao người dùng (M1: vuốt trên video), còn lại LOW/INFO.

---
## FINDINGS (xếp theo mức độ)

### E1 — HIGH cho Enterprise / (không chặn Community): `/marketing` bản mở rộng trên mobile vẫn là view desktop
- `frontend/src/router/index.ts:224-228`: `mobileToolRoute('marketing', …)` chỉ nằm trong nhánh `!isExtension`. Nhánh EE do `eeTopRoutes` đăng ký, không qua wrapper (repo EE không có trong worktree).
- Nhưng `account-menu.ts:29-37` + `tools-model.ts:marketingEntryPath` (extension) VẪN hiện mục "Khác › Marketing" trỏ `/marketing/lists` hoặc `/marketing/group-scan`.
- Hậu quả (suy luận tĩnh): trên EE, user mobile bấm Marketing → view desktop rộng trong MobileLayout → khả năng tràn ngang, đúng thứ F3 cấm; `handleBack` về Account vẫn chạy nhưng nội dung không đọc được. Test `account.dom.spec.ts` chỉ kiểm menu, không kiểm đích.
- Đánh giá đúng: nhánh đang chạy trong worktree là Community → F3 Marketing đạt (tĩnh+jsdom). EE là **giới hạn tương lai**, phải xử lý ở repo EE (bọc component `/marketing` bằng `mobileToolRoute('marketing', …)`) HOẶC tạm ẩn mục Marketing khi `isExtension && !mobileWrapped`. Không PASS enterprise cho tới khi làm + kiểm.

### M1 — MEDIUM: vuốt ngang trên VIDEO trong trình xem sẽ chuyển mục / chặn kéo thanh tua
- `frontend/src/components/mobile/media/MediaViewer.vue:43-57,98-105` (+ CSS dòng 145 `touch-action: none`).
- `onMove` luôn `preventDefault()` khi kéo >8px và `onEnd` → `resolveViewerSwipe` đổi mục khi |dx| ≥ 56. `<video controls>` nằm trong stage nên kéo thanh tua/âm lượng ngang = vuốt "next/prev" (video bị bỏ giữa chừng); kéo xuống trên điều khiển = đóng viewer.
- Cách sửa: trong `onStart` bỏ qua cử chỉ nếu `(e.target as Element).closest('video')` (hoặc chỉ nhận cử chỉ ngoài vùng điều khiển, ví dụ nửa dưới của video); vẫn giữ nút Trước/Sau và nút X. Thêm test: touch bắt đầu trên `video` không emit `update:index`/`close`.
- Runtime: chưa chạy trên Safari; cần kiểm trên iPhone thật (controls gốc iOS).

### M2 — LOW-MEDIUM (a11y/UX): giới hạn chọn bị từ chối "im lặng" khi đang ở trình xem
- `MobileMediaLibrary.vue:50-55,171` đặt `notice` (role=status) trong trang; trình xem là VDialog fullscreen che hết → bấm "Chọn để gửi" lần 13 (hoặc video thứ 6) không có phản hồi nào thấy/nghe được.
- Sửa: truyền `notice`/`rejected` xuống MediaViewer (hiện dòng `role="status"` trong footer), hoặc `toast` khi `rejected`.

### M3 — LOW (a11y): focus không trả về ô lưới sau khi đóng trình xem
- `MediaViewer.vue:79-88` dùng `v-dialog` không có activator; Vuetify chỉ trả focus về `activatorEl`. Dev ghi "trả focus" nhưng chưa được kiểm; trên bàn phím/VoiceOver focus rơi về body.
- Sửa: lưu `document.activeElement` khi `open` chuyển true (hoặc tại `openViewer`) và `.focus()` ở `@after-leave`; hoặc truyền phần tử kích hoạt. Ngoài ra `role="dialog" aria-modal` ở dòng 89 lồng trong overlay `role=dialog` của Vuetify → trùng vai trò; bỏ role ở div trong, giữ `aria-label` trên content (cần xác nhận bằng runtime).

### M4 — LOW (bug chức năng nhỏ): ô tìm trong "thành viên lần quét" không lọc gì
- `ToolMembersSheet.vue:25` (`paged` → không `localSearch`) ⇒ `useMobileReadList` gọi lại `load` với `req.search`, nhưng `fetchScanMembers` (`mobile-tool-readers.ts` ~dòng 168) bỏ qua `search`; backend `group-scan-routes.ts:115` chỉ nhận `isFriend,page,limit`. Gõ từ khóa = tải lại y trang 1, danh sách không đổi; nút "Không có mục phù hợp" không bao giờ hiện.
- Sửa: ẩn ô tìm cho sheet `paged` (`no-search`) hoặc lọc client trên các trang đã tải và ghi chú "chỉ lọc phần đã tải".

### M5 — LOW (UX/điều hướng): Back dùng `router.replace('/account')`
- `MobileLayout.vue:~110-115`. Vào Marketing từ Account rồi bấm Back: lịch sử thành `[…, /account, /account]`, nút Back của trình duyệt/vuốt cạnh iOS quay lại `/account` lần nữa. Sửa: nếu `history.state?.back === '/account'` thì `router.back()`, ngược lại `replace`. (File shared – cần main; không chặn.)

### M6 — LOW (perf/offline): router vẫn nạp chunk view desktop của route con Marketing trên mobile
- `router/index.ts:228-250`: children `component: () => import('@/views/...')`; Vue Router resolve component lười của mọi route khớp trước khi hoàn tất điều hướng, dù `MobileToolPage` không render `<RouterView>`. Mobile tải thừa chunk desktop (GroupScanView, ListsView…) và điều hướng có thể lỗi nếu chunk không có (offline/PWA chưa cache) dù trang mobile không cần. Cần kiểm runtime (Network tab). Hướng xử lý: trên mobile không cần sửa nếu chấp nhận; hoặc `mobileToolRoute` cho children trả component rỗng khi mobile. (Shared – chỉ ghi nhận.)

### M7 — LOW: sau lỗi tải, danh sách cũ bị xóa dù comment nói "giữ dữ liệu cũ"
- `use-mobile-media-library.ts:~63-70` (`items.value = []` trong catch của `reload`) mâu thuẫn comment ngay trên. Đổi bộ lọc luôn xóa nên hợp lý, nhưng đang xem rồi lỗi mạng khi "Thử lại" thì mất lưới; chọn đã gửi dùng `selected` riêng nên không mất lựa chọn. Chỉ sửa comment hoặc hành vi.

### M8 — INFO/LOW: cosmetic & hygiene
- `router/index.ts:1` — `import { mobileToolRoute }` chèn TRƯỚC dòng SPDX/Copyright (file shared, xếp lại cho đúng).
- `InternalContactSetupPage.vue` hiện "modified" chỉ do đổi cuối dòng (numstat 0, git cảnh báo LF→CRLF) — không liên quan F2/F3; không nên đưa vào commit F2/F3.
- `MediaLibrarySheet.vue:~50` fallback `nickName` = "Không rõ nick" xuất hiện nguyên văn trong hộp xác nhận "qua nick Không rõ nick" (có thể chặn gửi khi không có nick thay vì xác nhận).
- `fetchMarketingFeature` care-sessions ném `new Error(...)` ⇒ `classifyReadError` không phân biệt 403 (hiện "lỗi" chứ không "không quyền").
- `MobileFriendsReader`: `counts` không reset khi đổi nick → số đếm cũ có thể hiện thoáng chốc.

---
## ĐÃ KIỂM VÀ KHÔNG THẤY LỖI (tĩnh + jsdom)
**F2**
- Race nhầm hội thoại: `onSend` chụp snapshot target+items TRƯỚC `confirm`; sau confirm kiểm lại `convId`, `nickName`, `externalLock`, `lockReason`, online; `send()` dùng `target.convId` snapshot, `sending` đặt đồng bộ trước `await` ⇒ bấm đúp không gửi hai lần (`useConfirm` hủy hộp cũ). Đổi hội thoại trong thread: sheet có `v-if conversationId===currentConversationId` + tự đóng; confirm vẫn nêu đúng khách đã chọn lúc bấm.
- Partial failure/duplicate: `sentIds` bỏ mục đã gửi ngay khỏi vùng chọn; lỗi không phản hồi ⇒ `ambiguous` + chữ yêu cầu kiểm tra hội thoại trước khi gửi lại; không retry tự động; album là một request (thành công/thất bại nguyên khối).
- Offline: khóa ở nút, ở `onSend` sau confirm và trong `send()`; không có outbox. Thông báo 403/409/413/415/429/404/400/mạng bằng tiếng Việt cụ thể (`describeMediaSendError`).
- Phân trang/tìm kiếm: `seq` bỏ kết quả muộn, `loadingMore` reset khi đổi bộ lọc, bỏ trùng id, IO + nút "Tải thêm" dự phòng, `folderSeq`.
- RBAC: chỉ dùng API sẵn có (`listMediaPaged`, `listMediaFolders`, `sendMediaToConversation`, `sendAlbumToConversation`, GET /conversations); không có upload/xóa/sửa trên mobile; khóa riêng tư dùng `usePrivacyVisibility.canSendInConv` + `attachmentLockReason`.
- Touch 44px: tab, chip, nút ô chọn (vùng 44), nút viewer, nút gửi đều ≥44. Token `--m-*` dùng nhất quán; màu cứng chỉ ở viewer (đen cố định, biến cục bộ) và badge trên ảnh — chấp nhận được (không phải token dùng chung).
**F3**
- Quyền/cờ khớp router+desktop: Friends = `canAccess('friend')`; Groups = đã đăng nhập (route không có resource — đúng); Marketing Community = đăng nhập + `isMarketingPathEnabled`/fallback; tất cả cờ tắt ⇒ ẩn. `MobileToolPage` kiểm lại `allowed` (không lộ khi deep-link). Router guard/`meta` không đổi.
- Chỉ GET, không POST/PATCH/DELETE, không socket, không đổi business logic marketing/broadcast/scan (test khẳng định). Endpoint scan-members tồn tại ở backend (`group-scan-routes.ts:113`).
- Trang đích đọc được trong khung mobile, Back về Account (`handleBack`), hành động nặng đẩy sang desktop qua `MobileDesktopNotice`. `use-mobile-nav`: Friends/Groups/Marketing thuộc tab Account, tiêu đề đúng.
- Wrapper `mobileToolRoute`: ngoài mobile trả `h(Desktop, attrs)` (không thêm DOM) ⇒ DOM cuối cùng desktop/tablet giữ nguyên (suy luận; **chưa so pixel**). Khác biệt thoáng qua: view desktop nay được nạp SAU khi điều hướng xong (`defineAsyncComponent`) thay vì trước ⇒ có thể có khung trống ngắn lần đầu truy cập trên desktop; cần xem bằng mắt (INFO).

## ĐIỀU KIỆN TRƯỚC KHI GỌI "DONE"
1. Sửa M1 (bắt buộc nên làm), ưu tiên M2/M3/M4.
2. Chạy Playwright WebKit+Chromium 320/375/390/393/430/768 cho /media, viewer, /marketing/*, /groups, /friends; so ảnh desktop 1440/tablet với 50db984 cho /media /groups /friends /marketing.
3. Kiểm Safari iPhone thật: viewer (focus, vuốt, video), sheet kho trong thread (safe-area đáy thanh gửi dính), ConfirmHost hiện TRÊN sheet/viewer.
4. EE: bọc `/marketing` trong repo EE hoặc ẩn mục Marketing khi `isExtension`; chưa làm thì ghi rõ "Enterprise: chưa hỗ trợ mobile Marketing".
