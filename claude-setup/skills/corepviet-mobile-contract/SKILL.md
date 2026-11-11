---
name: corepviet-mobile-contract
description: Hợp đồng thiết kế + kỹ thuật bắt buộc cho mọi việc nâng cấp giao diện iPhone/mobile của ZaloCRM-CorepViet (Vue 3 + Vuetify 4 PWA). Dùng TRƯỚC khi sửa bất kỳ file nào trong frontend liên quan mobile, MobileLayout, BottomNav, MobileChatView, MobileContactView, PWA, safe-area, bàn phím iPhone, hoặc khi review UI mobile.
---

# Hợp đồng mobile ZaloCRM-CorepViet

Skill này là nguồn chuẩn chung cho cả đội agent. Skill cộng đồng (interface-design, mobile-ux-optimizer, progressive-web-app, vue-*) chỉ là kỹ thuật bổ trợ; **khi mâu thuẫn, hợp đồng này thắng**.

## 1. Đọc trước khi làm (theo thứ tự)

1. `.interface-design/system.md` — design memory (màu, spacing, chữ, signature).
2. `docs/mobile-upgrade/04_MOBILE_DESIGN_SYSTEM.md` — tokens chuẩn.
3. `docs/mobile-upgrade/03_MOBILE_INFORMATION_ARCHITECTURE.md` + `05_IPHONE_UI_PROPOSAL.md` — điều hướng, wireframe, trạng thái.
4. `docs/mobile-upgrade/07_MULTI_AGENT_PLAN.md` — ownership + shared-file locks.
5. `docs/mobile-upgrade/contracts/` (nếu đã có) — contract đã freeze bởi mobile-architect.

Không tìm thấy file nào trong danh sách → ghi rõ trong báo cáo, không tự bịa nội dung thay thế.

## 2. Stack — không được đổi

- Vue 3.5 `<script setup lang="ts">`, Vuetify 4, Pinia 3, Vue Router 4, Vite 8, vitest. Icon: `@mdi/font`, `lucide-vue-next`.
- **Cấm**: thêm React/JSX, Tailwind, Vant/Ionic/Framework7 hay UI library thứ hai; cấm thêm dependency mới khi chưa có duyệt của chủ dự án (ghi đề xuất vào báo cáo).
- Ví dụ React/Next/Tailwind trong skill cộng đồng: chỉ lấy nguyên tắc, viết lại bằng Vue/Vuetify.

## 3. Visual contract (tóm tắt — chi tiết ở system.md)

- Namespace `.crm-mobile`, CSS custom properties `--m-*`. Không thêm selector global không scope; không override Vuetify toàn cục.
- Brand `#1786be`, action `#0b5880`, nền `#f7f9fc`, surface trắng, chữ `#152838`/`#526576`, success `#157347`, warning `#8a4b08` (luôn kèm chữ, không chỉ màu).
- Spacing 4px base (8/12/16/20/24/32). Font hệ thống. Body 16px (input ≥16px để iOS không auto-zoom), title 28/700, section 17/650.
- Touch target ≥ 44×44 CSS px. Bottom nav 5 mục có nhãn (chốt 07/11/2026): **Tổng quan · Khách hàng · [Hội thoại – nút tròn nổi ở giữa, có badge số khách chờ] · Lịch hẹn · Tài khoản**. Mục "Tài khoản" chứa hồ sơ cá nhân, chọn giao diện, menu công việc lọc theo RBAC, đăng xuất. Mẫu: `docs/mobile-upgrade/preview-v3/`.
- Signature: mọi hàng hội thoại, header thread, hồ sơ khách luôn hiện **nick Zalo/TikTok + người phụ trách**. Không biến CRM đa tài khoản thành messenger cá nhân.
- **Hai giao diện Sáng + Tối** (chốt 07/11/2026), người dùng chọn Sáng / Tối / Theo máy trong Tài khoản. Cùng tên token `--m-*`, chỉ đổi giá trị dưới `[data-theme="dark"]` (giá trị chuẩn: `preview-v3/tokens.css`). Không hardcode màu ngoài token. Thẻ `<meta name="color-scheme">` phải đổi theo theme đang chọn (`light only` khi Sáng, `dark` khi Tối) để Chrome/Android không tự ép tối. Vuetify cần theme dark thật (vd `hsDark`) thay cho toggle cũ trỏ tới theme không tồn tại.

## 4. Quy tắc iPhone kỹ thuật

- `viewport-fit=cover` đã bật → tôn trọng `env(safe-area-inset-*)` cả 4 cạnh, kể cả landscape.
- Không dùng `100vh` / `calc(100vh - Npx)` cố định. Shell cung cấp chiều cao khả dụng qua một composable viewport (VisualViewport + fallback `100dvh`); con không tự trừ pixel lần nữa.
- Một scroll owner cho thread chat; giữ anchor khi prepend lịch sử; không auto-scroll vô điều kiện khi người dùng đang đọc tin cũ.
- Composer không bị bàn phím che; nút gửi ≥44px; ảnh/file picker qua `<input type=file accept capture>` chuẩn.
- Breakpoint: dùng `MOBILE_MEDIA_QUERY` từ `composables/use-mobile.ts`; 768–1099 là compact, không được ép `min-width:1100`.

## 5. Ranh giới logic — tuyệt đối

- Không đổi backend, API contract, auth (`stores/auth.ts`), socket (`api/socket.ts`), payload/điều kiện gửi tin, chính sách AI auto-reply, RBAC server.
- Presentation mobile nhận props / emit event có kiểu; dùng lại composables hiện có (`use-chat`, `use-contacts`, `use-appointments`, `use-dashboard`…). Không nhân đôi socket listener.
- Mobile phải giữ parity: AI gợi ý, media, privacy, quyền, deep link `/chat/:convId?`. Thiếu thao tác nào → ghi vào bảng parity, không âm thầm bỏ.
- OfflineIndicator không được hứa "tự gửi khi có mạng" nếu chưa có outbox bền; không tự gửi lại tin.

## 6. Shared-file locks (chỉ orchestrator/main session sửa)

`frontend/src/main.ts`, `App.vue`, `router/index.ts`, `plugins/vuetify.ts`, `assets/main.css`, `assets/hs-crm-theme.css`, `stores/auth.ts`, `stores/privacy.ts`, `api/index.ts`, `api/socket.ts`, `composables/use-chat.ts`, `components/chat/MessageThread.vue`, `frontend/package.json`, `vite.config.ts`.

Agent cần đổi file bị lock → dừng phần đó, ghi **"LOCK REQUEST: file, lý do, diff đề xuất"** trong báo cáo, tiếp tục phần độc lập.

## 7. Git an toàn

Working tree đang có nhiều thay đổi chưa commit của chủ dự án. **Cấm** `git reset`, `git checkout -- .`, `git stash`, `git clean`, `git restore`, force push. Không commit/push trừ khi orchestrator giao rõ. Làm việc trong worktree/branch được giao.

## 8. Định nghĩa xong (mỗi PR/lượt)

- `cd frontend && npx vue-tsc -b` và `npx vitest run` pass (hoặc ghi rõ lỗi baseline có sẵn trước khi sửa).
- Không overflow ngang ở 320 / 375 / 390 / 393 / 430; 768 không lệch; desktop 1440 không đổi ngoài phạm vi.
- Có trạng thái loading / empty / error / offline cho màn đã sửa.
- Báo cáo bằng tiếng Việt: file đã sửa, lý do, cách test, phần **chưa** kiểm (đặc biệt Safari iPhone thật / Home Screen PWA). Không gọi "đạt trên iPhone" khi mới chạy Chromium.
- Dữ liệu test hoàn toàn giả; không chép token, số điện thoại, tin nhắn khách thật vào code/ảnh/log.
