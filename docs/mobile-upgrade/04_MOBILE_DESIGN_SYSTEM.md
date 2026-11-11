# 04 — Mobile Design System đề xuất

Ngày 29/10/2026 · Thiết kế cho Vue/Vuetify hiện hữu · Không cài dependency ở audit.

## Cơ sở và lựa chọn thư viện

Source hiện tại: `frontend/src/plugins/vuetify.ts:6` tạo Vuetify, có theme `hsLight`, `smax-light`, `legacy-dark`; `frontend/src/main.ts:11` nạp nhiều CSS global, `:14` nạp HS theme thắng cascade; `assets/tokens.css:55` base font 14.3px. Không thay toàn bộ UI framework.

**Ưu tiên:** giữ Vuetify, xây wrapper mobile nhỏ cho header, sheet, list row, toolbar, feedback và safe-area. Dùng CSS namespace `.crm-mobile` và token `--m-*`. Điều chỉnh global chỉ khi có bằng chứng lỗi chung và screenshot regression desktop.

**Thay thế:** spike Vant cho một primitive mobile còn thiếu, ở một nhánh riêng sau phê duyệt dependency. [Vant 4](https://vant.pro/) hỗ trợ Vue 3; điều này không tự chứng minh tương thích dependency/CSS/accessibility trong repo. [Vuetify display/platform](https://vuetifyjs.com/en/features/display-and-platform/) có cơ chế breakpoint, nhưng cần đồng nhất với hook riêng của dự án, không mặc định hai hệ breakpoint đã khớp.

| Phương án | Tái sử dụng / chuyển đổi | Desktop / hiệu năng / bảo trì | Quyết định |
|---|---|---|---|
| Vuetify + wrapper mobile | Cao, giữ component props và validation | Ít dependency mới; vẫn cần giảm global imports/chunk theo đo đạc | Ưu tiên |
| Vant giới hạn theo route | Vue 3 phù hợp về framework; phải viết adapter | Hai design system/overlay/z-index, thêm CSS và bundle | Phương án B có spike |
| Ionic/Framework7 | Có giải pháp Vue nhưng thay shell/router/gesture là phạm vi lớn | Nguy cơ lifecycle và CSS ảnh hưởng desktop | Không chọn trong pilot |
| shadcn/ui hoặc React Aria bản React | Không trực tiếp khớp Vue hiện tại; không yêu cầu rewrite React | Mất tái sử dụng, chi phí cao | Không chọn; Vue alternatives cần audit riêng nếu sau này cân nhắc |
| Konsta UI/Ant Design Mobile | Chưa kiểm chứng edition/framework phù hợp repo | Không đủ bằng chứng lợi ích vượt wrapper hiện hữu | Chưa đề xuất tích hợp |

Đây là đánh giá kiến trúc cho repo, không phải benchmark các thư viện. Chưa đo bundle sau đổi thư viện.

## Token đề xuất (chưa áp dụng)

```css
.crm-mobile {
  --m-brand: #1786be;
  --m-brand-strong: #0b5880;
  --m-bg: #f7f9fc;
  --m-surface: #fff;
  --m-text: #141a24;
  --m-muted: #475467;
  --m-line: #d5dce5;
  --m-success: #157347;
  --m-danger: #b42318;
  --m-warning: #8a4b08;
  --m-focus: #0b5880;
  --m-space-1: 4px; --m-space-2: 8px; --m-space-3: 12px;
  --m-space-4: 16px; --m-space-5: 20px; --m-space-6: 24px;
  --m-radius-sm: 8px; --m-radius-md: 12px; --m-radius-lg: 20px;
  --m-shadow: 0 6px 24px rgb(20 26 36 / .10);
  --m-safe-top: env(safe-area-inset-top, 0px);
  --m-safe-bottom: env(safe-area-inset-bottom, 0px);
  --m-header: 56px;
  --m-tabbar: 56px;
  --m-touch: 44px;
}
```

| Token/pattern | Giá trị / quy tắc |
|---|---|
| Font | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; không tải font ngoài chỉ để giả iOS |
| Display / title / body / metadata | 28/24/17/13 CSS px; line-height 1.3–1.5; metadata không chứa thao tác quan trọng duy nhất |
| Input/composer | Font tối thiểu 16 CSS px làm baseline; không disable user zoom; keyboard thật vẫn cần kiểm tra |
| Tap region | Đặt min 44×44 CSS px cho web, tham chiếu mục tiêu 44×44pt của Apple; không đồng nhất CSS px với điểm vật lý trên mọi device |
| Spacing | 4,8,12,16,20,24,32; page gutter16, ở320 có thể12 |
| Z-index | Content0, sticky header20, tabbar30, backdrop100, sheet110, dialog120, toast130; cần map tương thích Vuetify overlay thay vì áp bừa số thấp |
| Breakpoint | <768 mobile; 768–1099 compact/tablet; >=1100 desktop hiện tại; đồng nhất JS/CSS và xử lý landscape bằng kích thước khả dụng |
| Safe-area | Shell chịu top inset; tabbar/composer chịu bottom inset tùy màn; không cộng hai lần |
| State | default/pressed/focus-visible/disabled/loading/error/selected; text và icon kèm màu để truyền nghĩa |

Apple khuyến nghị vùng chạm ít nhất 44×44pt trong [UI Design Dos and Don’ts](https://developer.apple.com/design/tips/). Đây là nguồn tham chiếu thiết kế; tiêu chí CSS cần đo và kiểm tra trên thiết bị thật.

Palette là đề xuất lấy từ nhận diện hiện hữu, chưa được chứng nhận tương phản cho mọi cặp màu. Gate: đo WCAG AA 4.5:1 cho body text, 3:1 cho text lớn/control graphic thích hợp; không dùng màu brand sáng cho chữ nhỏ trên nền trắng nếu không đạt.

## Components và hợp đồng

| Component đề xuất | Dùng lại | Hợp đồng |
|---|---|---|
| MobilePageHeader | VBtn/VIcon + route metadata | Một title, back44px, tối đa hai action; nhãn đọc màn hình |
| MobileTabBar | BottomNav/RBAC | Năm mục tối đa, nested route active, label không cắt ở320 |
| MobileSheet | VDialog/overlay phù hợp | Focus trap, Esc/close, scroll bên trong, restore focus, không phụ thuộc swipe |
| ConversationRow | ConversationList data contract | Preview hai dòng, unread bằng số/text, target full row |
| ThreadFrame | MessageThread/message bubble/composer | Một scroll owner, keyboard-safe, không đổi send/socket logic |
| ContactCard | useContacts/types | Nội dung chính 2–3 dòng, menu theo quyền, không nested button trong button |
| FeedbackBanner | OfflineIndicator/Toast hiện hữu | Phân biệt mất mạng, reconnect, lỗi tải, lỗi gửi và pending |
| FormField | VTextField/VSelect | Label luôn có, error gắn aria-describedby, autocomplete đúng mục đích |

Không fork message renderer, privacy blur, attachment parser hay auth interceptor chỉ để thay màu/spacing. Wrapper truyền đầy đủ event/props; lập parity checklist với desktop trước thay thế.

## Keyboard, motion và accessibility

Container dùng `min-height:0`, `min-width:0`, `100dvh` có fallback; không coi dvh là giải pháp duy nhất cho bàn phím. Nếu cần visualViewport adapter, chỉ tính viewport/chrome layout, không can thiệp logic gửi. Kiểm thử focus textarea, đổi orientation, mở attachment sheet và back từ full screen.

Ưu tiên light mode để khớp `index.html` light-only; sửa theme name mismatch trước khi hứa dark mode. Dark mode là đợt riêng với semantic token, contrast, media/message privacy regression.

Hỗ trợ font scaling, giảm chuyển động theo prefers-reduced-motion; focus ring rõ; thứ tự đọc đúng; không chỉ hover. New message thông báo vừa đủ qua live region, tránh đọc lại toàn thread. Không hijack swipe-back Safari bằng global touch handlers.

## Bảo vệ desktop

Mobile CSS chỉ dưới namespace/layout được chọn. Không đổi `:root`, `.v-btn`, `.v-dialog` toàn cục để giải quyết một màn. Global bug như min-width1100 ở >=768 phải tách PR với baseline 768/1024/1100/1440. Mỗi PR có ảnh trước/sau và test cùng payload. Ngân sách bundle/latency chốt sau baseline, không hứa số cải thiện khi chưa đo.
