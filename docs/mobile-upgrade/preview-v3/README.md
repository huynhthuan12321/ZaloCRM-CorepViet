# Cờ Rếp Việt — iPhone Preview V3

Ngày 07/11/2026 · **Chỉ thiết kế, dữ liệu giả hoàn toàn. Chưa sửa giao diện ứng dụng.**

Mục tiêu: sale nhìn thấy khách đang chờ → mở đúng hội thoại trên đúng nick → soạn trả lời/áp gợi ý AI vào nháp → xem hồ sơ → đặt lịch. Preview không gọi API, AI, socket, auth hoặc gửi tin thật. Tên, số bắt đầu bằng `0000`, tin nhắn, tài liệu, KPI và lịch đều bịa.

## Mở prototype

Tại root repository:

```powershell
node docs/mobile-upgrade/preview-v3/server.cjs
```

Mở [Preview V3 local](http://127.0.0.1:5183/). Server chỉ bind loopback, allowlist HTML/CSS/JS và Vue runtime **đã có** ở `frontend/node_modules/vue/dist/vue.esm-browser.prod.js`. Không cài dependency. Nếu runtime không có, dùng các PNG trong `renders/` để duyệt; không cần cài thêm để xem ảnh.

- Chọn 8 màn trong bảng bên trái; bottom nav có đủ 5 nhãn theo contract. Thread/hồ sơ ẩn nav, có back rõ ràng.
- Trạng thái: chọn “Đang tải / Rỗng / Lỗi / Mất mạng” cho Tổng quan, Hội thoại, Thread, Khách hàng. Nút “Thử lại” khôi phục fixture, không kiểm tra mạng thật.
- Inbox có search thật trên fixture; chip Chưa trả lời/Của tôi; sheet theo nick/kênh có Áp dụng/Xóa. Bộ lọc chưa áp không đổi list.
- Bấm một khách bất kỳ → thread đúng tên/nick/owner → Hồ sơ → Nhắn tin trở lại đúng `convId` mẫu. Back trong app giữ search/filter/scroll inbox và nháp theo conv.
- Composer: màn riêng mở bàn phím mô phỏng; bảng điều khiển cũng có nút mở/đóng. AI sheet có nguồn mẫu, Áp vào nháp; nếu nháp đã có chữ, có xác nhận thay. Nút gửi chỉ thêm bubble mô phỏng trong RAM.
- Khách hàng: search, filter status bằng sheet, card mở hồ sơ. Profile có thông tin/tag/note/timeline và đặt lịch. Sửa ghi chú và thao tác nâng cao hiện chỉ minh họa điểm đặt.
- Lịch: đổi ngày, về hôm nay, tạo lịch mẫu và đổi trạng thái hoàn thành trong RAM. Không lưu CRM. Thêm: menu là điểm điều hướng minh họa; logout có confirm, không gọi auth.
- URL hỗ trợ `screen`, `state`, `conv`, `keyboard`, `w`, `h`, các filter/search. Ví dụ [inbox 320](http://127.0.0.1:5183/?screen=inbox&w=320), [thread landscape](http://127.0.0.1:5183/?screen=thread&w=844&h=390), [AI](http://127.0.0.1:5183/?screen=thread&sheet=ai). Đây là query của tài liệu, không thay canonical route ứng dụng.

## Ảnh bàn giao

PNG được chụp Chrome desktop, deviceScaleFactor 1, đúng kích thước CSS px; tai thỏ/home indicator là presentation chrome. 32 ảnh trong [renders](renders/), danh sách đầy đủ tại [verification.json](verification.json).

| Màn | 390 × 844 | Bổ sung |
|---|---|---|
| 1. Tổng quan | [overview-390.png](renders/overview-390.png) | loading/empty/error/offline |
| 2. Hội thoại | [inbox-390.png](renders/inbox-390.png) | [320](renders/inbox-320.png), [430](renders/inbox-430.png), 4 trạng thái |
| 3. Thread chat | [thread-390.png](renders/thread-390.png) | [320](renders/thread-320.png), [430](renders/thread-430.png), [844 × 390](renders/thread-landscape-844x390.png), 4 trạng thái |
| 4. Composer / bàn phím mở | [composer-390.png](renders/composer-390.png) | [AI sheet](renders/ai-sheet-390.png); composer thường nằm trong ảnh thread |
| 5. Khách hàng | [contacts-390.png](renders/contacts-390.png) | [Filter sheet](renders/contact-filter-390.png), 4 trạng thái |
| 6. Hồ sơ khách | [profile-390.png](renders/profile-390.png) | Timeline cuộn tiếp bên dưới |
| 7. Lịch hẹn | [agenda-390.png](renders/agenda-390.png) | [Tạo lịch](renders/appointment-390.png) |
| 8. Thêm | [more-390.png](renders/more-390.png) | Quy tắc ẩn theo quyền ghi ngay trong màn mẫu |

Các trạng thái theo tên `{overview|inbox|thread|contacts}-{loading|empty|error|offline}-390.png`. Ảnh là viewport, không phải ảnh ghép kéo dài; nội dung phía dưới vẫn cuộn được.

## Quyết định thiết kế và khác V2

**Kế thừa, không thay hướng:** giữ brand xanh, font hệ thống, surface trắng/nền lạnh, component row/avatar/bubble, thứ tự thông tin và Vue runtime local từ V2. Giữ signature “nick + người phụ trách” xuyên suốt row, thread, hồ sơ, timeline và sheet AI. Không thêm hero marketing hoặc UI library.

| Điểm | Quyết định V3 / lý do |
|---|---|
| Hierarchy | “Đang chờ trả lời” dẫn đầu, số hàng chờ và CTA rõ. Lịch đứng sau, KPI thành nhịp text nhỏ; bỏ cách xem mọi số là card ngang vai |
| Inbox | Unread khác unreplied (`unreadCount` khác `isReplied`). Context kênh/nick/owner hiện ngay trước khi mở chat; tên dài wrap, preview tối đa 2 dòng |
| Chat | Header riêng back44px, context không ẩn trong menu. Message status bằng chữ. Media/file có điểm mở riêng; nút Tin mới không ép cuộn khi đọc lịch sử |
| Composer | Draft keyed by conv, không lẫn khi đổi khách. Bàn phím mẫu nằm dưới composer trong cùng flex flow; ẩn nav khi chat. Không coi mock keyboard là giải pháp production |
| AI | Sheet nguồn → nội dung → Áp vào nháp. Đóng sheet không mất nháp; không tự gửi. State AI chọn ở bảng điều khiển review, không đưa control thử lỗi vào UI sale |
| CRM / agenda | Card list và profile section rõ; filter hai pha; tạo lịch bằng sheet cuộn có footer action luôn thấy. Giờ hiển thị theo Việt Nam, field ngày/giờ native theo locale trình duyệt; có dòng xác nhận ngày Việt bên dưới |
| Trạng thái | Fixture riêng loading/empty/error/offline cho 4 màn chính. Offline ghi rõ chỉ đang xem mẫu, có nháp nhưng không gửi; không hứa tự gửi khi có mạng |
| Accessibility | Native button/link/input/dialog, input16px, target44px, focus ring, Escape/focus return, không khóa zoom, không gesture bắt buộc hoặc hiệu ứng chuyển động |
| Phạm vi | Menu Thêm và form nâng cao ghi rõ minh họa; parity tách riêng, không ngụ ý đã implement chức năng desktop |

Domain: nick, người phụ trách, hàng chờ trả lời, hồ sơ, lịch hẹn, nguồn kiến thức, nháp AI. Color world: xanh nhận diện, xanh action sâu, giấy trắng, nền lạnh, xanh hoàn thành, amber cần chú ý. Signature: chuỗi customer→account→owner; tránh inbox cá nhân không nick, grid KPI đồng hạng và dấu check không có nghĩa chữ.

Mỗi nhóm component dùng cùng brief: nhân viên sale chọn đúng việc/đúng nick; surface phân tầng nhẹ qua nền và border, không shadow dày; font hệ thống body16/title28/section17/meta13; base4px, gutter16 (320→12), card16, sheet24. Focal point: Overview=hàng chờ, Inbox=row cần trả lời, Thread=message/composer, AI=nội dung và apply, Contacts=khách, Profile=context+nhắn tin, Agenda=lịch theo giờ, More=menu được phép.

## Chuẩn và nguồn đã đọc

Thứ tự: `claude-setup/skills/corepviet-mobile-contract/SKILL.md` → `.interface-design/system.md` → tài liệu03/04/05 → README và source V2 → các view/component thật được chỉ định. Có đọc thêm tài liệu07 (chỉ là plan tương lai), types/composables/MessageThread/router để xác định parity.

- Không có `preview-v2/iphone-prototype.html`; bản cũ tìm được ở `docs/mobile-upgrade/iphone-prototype.html` và đã đọc. V2 thực tế dùng `index.html`, `app.js`, `styles.css`, `server.cjs`.
- Không có `docs/mobile-upgrade/contracts/`; chưa có contract freeze riêng để viện dẫn.
- Skill bổ trợ: interface-design, mobile-ux-optimizer, web-design-guidelines; Vue best practices cho state/component. Reference `mobile-ux-optimizer/references/keyboard-handling.md` không tồn tại tại skill đã cài; không giả đã đọc file đó. Dùng contract viewport của dự án làm chuẩn.
- `tokens.css` ghi token mới so với04. Giải quyết chênh lệch theo yêu cầu: text/muted từ system.md (`#152838`/`#526576`), body16/title28; giữ gutter16 của04, compact12. Không sửa tài liệu chuẩn hoặc token production.

## Kiểm tra và giới hạn

Xem [verification.json](verification.json), [REVIEW.md](REVIEW.md), [COMPONENTS.md](COMPONENTS.md), [PARITY-GAPS.md](PARITY-GAPS.md).

- PNG: 8 màn390, inbox/thread320/430, thread landscape, AI/filter/tạo lịch và 16 trạng thái bắt buộc.
- Đo DOM ở 320/375/390/393/430/768 cùng landscape; đối chiếu control tối thiểu44px và overflow. Bộ đo không chứng nhận touch vật lý hoặc mọi mức Dynamic Type.
- Kiểm tra search→empty, đúng customer/conv, AI→draft không gửi, draft theo conv, offline disable send, filter apply/focus return, lịch mẫu, vị trí composer và Escape dialog. Đây là kiểm tra fixture local, không E2E CRM.
- Không chạy vue-tsc/vitest ứng dụng vì không thay SFC/code ứng dụng; kiểm cú pháp JS và browser runtime cho artifact. Không cài dependency, sửa frontend/backend/package/config, commit/push/deploy.
- **Mới xem trên trình duyệt desktop Chrome, chưa thử trên iPhone thật.** Chưa kiểm Safari/WebKit, Home Screen PWA, bàn phím iOS, VisualViewport thật, VoiceOver, Dynamic Type, reconnect/outbox, prepend scroll anchor, API/permissions live. Khung bàn phím/tai thỏ/home indicator đều mô phỏng.
- Refresh/tab close làm mất dữ liệu RAM; có cảnh báo nếu nháp chat còn chữ. Back là nút trong prototype, không xác nhận lifecycle/history của router production. Body trang review có thể cuộn; mỗi màn chỉ có một vùng nội dung cuộn.

## Cần chủ dự án chọn trước vòng tiếp theo

1. **Hàng chờ mặc định:** toàn bộ phạm vi được phân công hay bật sẵn “Của tôi”? Đề xuất toàn phạm vi có quyền, có chip Của tôi dễ bật.
2. **Một khách nhiều nick:** ưu tiên nick đang mở và cho đổi qua picker hay luôn hỏi chọn trước khi nhắn từ hồ sơ? Đề xuất giữ context hiện tại, chỉ hỏi khi chưa có context rõ.
3. **TikTok:** đưa vào pilot mobile hay giữ fixture riêng/chờ xác nhận trạng thái kênh? Source type còn capability nhưng repo có tài liệu removal; preview không kết luận kênh đang hoạt động.
4. **Parity nâng cao:** bulk/import/export và quản trị có cần dùng trực tiếp trên iPhone trong pilot? Đề xuất chốt từng dòng PARITY-GAPS trước code.

Các pattern V3 đã lưu ngay trong bộ tài liệu này; không sửa `.interface-design/system.md` vì phạm vi chỉ cho phép `preview-v3/`.

## Cập nhật 07/11/2026 — nút + trong composer

Theo góp ý chủ dự án: nút **+** mở bảng "Gửi ảnh, video, tài liệu" gồm 5 lựa chọn — **Ảnh** (thư viện, nhiều ảnh), **Chụp ảnh** (camera), **Video** (MP4/MOV/WebM, ≤500MB), **Tài liệu** (PDF, Word, Excel, PPT, ZIP), **Kho media** (ảnh dự án, báo giá có sẵn). Dòng đầu nhắc gửi tới khách nào qua nick nào. Định dạng và giới hạn khớp backend hiện có (`backend/src/modules/chat/chat-attachment-routes.ts`, endpoint `POST /conversations/:id/attachments`) nên khi code chỉ cần làm giao diện, không đổi API. Nút "Tin mới ↓" chuyển ra giữa để không đè lên bubble.

## Cập nhật 07/11/2026 — thanh điều hướng và giao diện Tối

- Thanh dưới theo mẫu chủ dự án: **Tổng quan · Khách hàng · Hội thoại (nút tròn nổi ở giữa, badge số khách chờ) · Lịch hẹn · Tài khoản**. "Thêm" đổi thành "Tài khoản": hồ sơ, chọn giao diện, Thông tin cá nhân / Đổi mật khẩu / Thông báo, nhóm Công việc (Nick, Kho media, Báo cáo, Cài đặt tổ chức – theo quyền), Đăng xuất.
- **Giao diện Tối**: chọn ở cột trái (Giao diện) hoặc trong màn Tài khoản; có chế độ Theo máy. Mở thẳng: `?theme=dark`. Token tối nằm cuối `tokens.css`.
- Lưu ý kỹ thuật: Chrome có cờ "Auto Dark Mode" sẽ ép tối trang nếu trang khai báo hỗ trợ dark ở chế độ Sáng → meta `color-scheme` được đổi động theo theme. Production cần làm giống.
