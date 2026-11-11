# Reviewer ??c l?p M?I ? delta sau QA, 10/11/2026

Phi?n m?i, read-only; m? tho?t 0. B?o c?o nguy?n v?n c?a reviewer b?n d??i. Log th? ngo?i repo: `C:/Users/Public/f2f3-agent/new-independent-review-20261110-1909.log`.

# Review độc lập F2/F3 so với 50db984: PASS có điều kiện, chỉ phạm vi Community source, không có finding chặn

Tôi đọc contract skill, `PARITY.md §14`, `REVIEW-DELTA.md` và `git diff`. Tôi đọc source thật của các file F2/F3 dưới đây. Không sửa file, không commit, không gọi agent khác.

**Đã chạy**
- `vitest run` cho `components/mobile/{media,tools,chat,account}`, `composables/mobile-media`, `use-mobile-nav.spec.ts` và `views/mobile/account`: 10 file, 180 test pass.
- Môi trường là jsdom. Tôi không chạy `vue-tsc -b` vì nó ghi build info.

**Không chạy, không tuyên bố**
- Playwright/WebKit/Chromium, iPhone thật, Home Screen PWA, so pixel.
- Overflow 320/375/390/393/430/768, VDialog thật (focus-trap, trả focus), VoiceOver.
- Enterprise: E1 vẫn là giới hạn (route `/marketing` của EE chưa qua `mobileToolRoute`), nên không PASS EE.

## Kết quả theo trọng tâm

**1. Đích gửi và snapshot `convId`: đạt**
- `MobileMediaLibrary.vue:70-72` chụp `snapshotTarget` và `snapshotItems` trước khi hỏi xác nhận.
- Sau khi xác nhận (`:79-93`) có đủ các kiểm tra theo thứ tự:
  - `active` (còn mount hay không)
  - online
  - `convId` còn khớp snapshot
  - `externalLock`
  - `lockReason` và `nickName`
- `use-mobile-media-send.ts:64` chụp lại `convId` một lần nữa trước khi gọi API.
- Trong thread, `MediaLibrarySheet.vue:79` chỉ dựng thư viện khi `conversationId === currentConversationId`, kèm `:key`. Đổi hội thoại hoặc đóng sheet sẽ unmount.
- Kiểm tra `convId` ở `:86` thực ra luôn đúng, vì `target.convId` lấy từ prop `conversationId` bất biến. Lớp bảo vệ thật là unmount và guard `active`. Đây không phải lỗi.
- Hộp xác nhận mồ côi (D1 trong `REVIEW-DELTA.md`) đã được sửa. Nếu người dùng đã rời kho mà vẫn bấm Gửi, `:80` hiện `toast.warning('Chưa gửi vì bạn đã rời khỏi Kho media.')` và không gửi. Nếu họ bấm Hủy thì im lặng, đúng ý.
- Thông báo lỗi 409/413 trong `media-model.ts` đã sửa theo D2/D3. Chữ 100MB đã bỏ.
- Có test cho ca unmount khi hộp xác nhận đang mở (`media-library.dom.spec.ts`), nhưng `confirm` bị mock chứ không phải ConfirmHost thật.

**2. Khóa khi offline: đạt**
- Nút Gửi khóa bằng `lockReason` kèm chữ lý do.
- Có kiểm lại sau xác nhận (`:84`), kiểm lại trước mỗi request ở chế độ gửi tuần tự (`use-mobile-media-send.ts:90`) và kiểm ở đầu `send` (`:62`).
- Không có outbox, không tự gửi lại.
- Thiếu tên khách hoặc nick thì `target.lockReason` chặn gửi nhưng vẫn xem được kho.
- Album trả về một phần được xử lý đúng: không đoán ảnh nào đã đi, và `send-status` hiện bền ngoài thanh chọn.

**3. Menu "Khác" ở Tài khoản (`account-menu.ts`, `tools-model.ts`): khớp desktop**
- Bạn bè: `canAccess('friend')` khớp tab desktop ở `DefaultLayout.vue:295`.
- Marketing: bản Community luôn hiện cho người đã đăng nhập, khớp desktop. Bản mở rộng dùng cùng `MARKETING_FUNCTIONS` (`customer_list` rồi `friend`) như desktop.
- Mobile chặt hơn desktop một điểm: kiểm thêm `isMarketingPathEnabled`, tức cờ tính năng của router guard. Tôi coi đây là chủ ý và an toàn.
- `MobileToolPage.vue:34` kiểm lại quyền khi vào bằng deep link.
- Nhóm: desktop không có tab riêng cho `/groups`, mobile hiện cho mọi người đã đăng nhập. Đây là hành vi mới, đã được ghi trong comment của `tools-model.ts`. Cần chủ dự án chấp nhận.
- Mapping tab và tiêu đề (Bạn bè → Tài khoản, `/marketing` → "Marketing") nhất quán với test.

**4. Các fix sau QA**
- **MediaGrid, token chọn:** `.m-mg__tick--on` dùng `--m-brand-strong` với chữ `--m-on-action` ở cả hai theme (`#fff` trên `#0b5880`, `#0f1720` trên `#6cc4f2`). Không có finding chặn. Tôi không đo contrast bằng công cụ.
- **Focus trình xem:** `MediaGrid.vue:20` focus ô lưới tường minh trước khi mở. Viết đúng cho Safari, vì Safari không tự focus nút khi chạm. `MediaViewer.vue` chụp `activeElement` bằng watch `flush: 'sync'` và trả focus ở `@after-leave`, có kiểm `isConnected`. Đúng về mặt code; hành vi thật của VDialog chưa kiểm.
- **Scrollbar `MobileLayout`:** nằm trong `<style scoped>` của layout mobile, nên không rò sang desktop. Tôi không xác nhận được nó có thật sự hết lệch trên Chromium/WebKit.
- **Nút Quay lại (`handleBack`):** logic `history.state.back` đúng như mô tả.

## Findings (đều LOW/INFO, không chặn commit)

1. **LOW** `MobileLayout.vue:192-198`: `scrollbar-width: none` và `::-webkit-scrollbar` áp cho toàn bộ `.m-main__scroll` của mọi trang mobile, kể cả cửa sổ desktop hẹp dưới 768px dùng chuột và màn hình ngang cảm ứng. Người dùng chuột mất thanh cuộn, chỉ cuộn được bằng bánh xe. Comment nói về "10px WebKit classic scrollbar", nhưng iOS thật không có classic scrollbar, nên fix này chủ yếu tác động lên Chromium/emulation. Đề xuất ghi vào QA là đã chấp nhận đánh đổi, hoặc thu hẹp điều kiện bằng `@media (pointer: coarse)`.
2. **LOW** `MobileLayout.vue:110-117`: `handleBack` dùng `router.replace('/account')` khi `state.back` không phải `/account`. Các chip Marketing là `RouterLink`, tức push. Sau khi chuyển chip, Back sẽ thay entry hiện tại và vẫn để các entry marketing cũ trong history. Nút back của trình duyệt hoặc phần cứng sau đó có thể quay lại một trang marketing cũ. Hành vi chấp nhận được và khớp comment "luôn về Tài khoản", nhưng nên có trong checklist thiết bị thật. Có hai dòng trống thừa ở `:117-118`.
3. **LOW** `MediaGrid.vue:84-85`: `#fff` và `rgb(0 0 0 / .55)` được hardcode trên ô chọn, trái contract "không hardcode màu ngoài token". Hợp lý vì đây là lớp phủ trên ảnh, nhưng nên ghi chú là ngoại lệ có chủ ý như `--viewer-*`. Viền `outline` của `.m-mg__cell--on` (`:68`) dùng `--m-brand-strong` trên ảnh bất kỳ, nên contrast không đảm bảo. Dấu số thứ tự vẫn là tín hiệu chính.
4. **INFO** `MediaViewer.vue` (watch `open`): `returnTo` được chụp khi `open` bật dù `current` rỗng. Khi đó dialog không hiện nên không có `after-leave`, và `returnTo` có thể tồn tại đến lần mở sau. Thực tế gần như không xảy ra, chỉ ghi nhận.
5. **INFO** `use-confirm.ts:49,58`: confirm là singleton, mở hộp thứ hai sẽ coi hộp cũ là hủy. Hiện không gây gửi nhầm, vì hủy nghĩa là không gửi.

## Kết luận

**PASS giới hạn Community source** cho các hạng mục trên. Không có lỗi logic, quyền hay snapshot nào chặn commit.

Trước khi coi là xong cần QA chạy thật:
- overflow ở 320–768 cho `/media`, `/groups`, `/friends`, `/marketing`;
- ConfirmHost thật trên sheet và viewer;
- trả focus sau khi đóng viewer (VoiceOver, Safari);
- scrollbar và Back trên Chromium/WebKit;
- thiết bị thật.

`InternalContactSetupPage.vue` chỉ đổi cuối dòng, nên không đưa vào commit F2/F3, như `REVIEW-DELTA.md` đã ghi.
