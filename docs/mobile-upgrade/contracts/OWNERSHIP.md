# OWNERSHIP — File → agent (đợt B–E)

Ngày 07/11/2026 · base `2608eb6` · kèm `CONTRACT-A.md`.

Nguyên tắc: một file chỉ một chủ. Agent chỉ được **tạo/sửa** file trong phạm vi của mình; mọi file khác là **chỉ đọc**. Cần sửa file ngoài phạm vi → dừng phần đó, ghi `LOCK REQUEST: file, lý do, diff đề xuất`. Spec cạnh file (`*.spec.ts`, `*.dom.spec.ts`) thuộc chủ của file được test.

## 1. Shared-file lock — chỉ orchestrator (giữ nguyên danh sách skill)

```
frontend/src/main.ts
frontend/src/App.vue
frontend/src/router/index.ts
frontend/src/plugins/vuetify.ts
frontend/src/assets/main.css
frontend/src/assets/hs-crm-theme.css
frontend/src/stores/auth.ts
frontend/src/stores/privacy.ts
frontend/src/api/index.ts
frontend/src/api/socket.ts
frontend/src/composables/use-chat.ts
frontend/src/components/chat/MessageThread.vue
frontend/package.json
frontend/vite.config.ts
```

## 2. Orchestrator sở hữu thêm (không thuộc lock skill nhưng là điểm tích hợp)

| File / glob | Lý do |
|---|---|
| `frontend/src/views/ChatView.vue` (+ `views/DesktopChatView.vue` nếu LOCK C-1 phương án A) | Wrapper desktop/mobile |
| `frontend/src/views/ContactsView.vue` (+ `views/DesktopContactsView.vue` nếu A) | Wrapper |
| `frontend/src/views/DashboardView.vue`, `frontend/src/views/AppointmentsView.vue`, `frontend/src/views/ContactProfileView.vue` | Thêm nhánh mobile (LOCK D-2, D-3) |
| `frontend/src/composables/use-chat-attachments.ts` (mới) | Tách từ MessageThread (LOCK C-2); chat agent chỉ dùng |
| `frontend/src/layouts/DefaultLayout.vue` | Desktop shell |
| `frontend/src/views/reports/ReportMobile.dom.spec.ts` | Cập nhật có chủ đích (LOCK B-4) |
| `frontend/vitest.config.ts`, `frontend/package-lock.json` | Cấu hình/dependency |
| `docs/mobile-upgrade/13_SUBAGENT_TEAM.md`, `docs/mobile-upgrade/README.md` | Nhật ký đợt |

Chỉ đọc cho mọi agent (component desktop dùng chung, đổi phải qua LOCK REQUEST tới orchestrator): `frontend/src/components/chat/**` (trừ khi ghi khác), `frontend/src/components/contacts/**`, `frontend/src/components/settings/**`, `frontend/src/components/NotificationBell.vue`, `frontend/src/composables/use-contacts.ts`, `use-appointments.ts`, `use-dashboard-action-hub.ts`, `use-dashboard.ts`, `use-open-contact-chat.ts`, `use-work-scope.ts`, `frontend/src/views/reports/**`, `frontend/src/views/settings/**`, `backend/**`.

## 3. Bảng sở hữu theo agent

| Agent | Đợt | Được tạo/sửa | Ghi chú |
|---|---|---|---|
| **mobile-shell-dev** | B | `frontend/src/layouts/MobileLayout.vue`<br>`frontend/src/components/BottomNav.vue`<br>`frontend/src/components/OfflineIndicator.vue`<br>`frontend/src/components/mobile/shell/**`<br>`frontend/src/components/mobile/account/**`<br>`frontend/src/views/mobile/account/**`<br>`frontend/src/composables/use-mobile.ts` (giữ nguyên API `useMobile`, `MOBILE_MEDIA_QUERY`) + `use-mobile.dom.spec.ts`<br>`frontend/src/composables/use-mobile-viewport.ts`<br>`frontend/src/composables/use-mobile-theme-effects.ts`<br>`frontend/src/composables/use-mobile-nav.ts`<br>`frontend/src/composables/use-mobile-back.ts`<br>`frontend/src/composables/use-mobile-waiting-count.ts`<br>`frontend/src/stores/ui-theme.ts`<br>`frontend/src/assets/mobile-tokens.css` | LOCK B-1 (router), B-2 (vuetify), B-4 (spec reports) gửi orchestrator. Không sửa `index.html` |
| **mobile-chat-dev** | C | `frontend/src/views/MobileChatView.vue`<br>`frontend/src/components/mobile/chat/**`<br>`frontend/src/composables/mobile/**` (vd `use-mobile-chat-drafts.ts`, `use-mobile-inbox-filters.ts`)<br>`frontend/src/composables/use-offline-queue.ts` (chỉ theo D-6 sau khi duyệt) | LOCK C-1…C-4. Dùng `useMobileShell`, `useMobileBack`, `MobileSheet` của shell (chỉ đọc) |
| **mobile-crm-dev** | D | `frontend/src/views/MobileContactView.vue`<br>`frontend/src/components/mobile/crm/**`<br>`frontend/src/views/mobile/crm/**`<br>`frontend/src/composables/mobile-crm/**` | LOCK D-1…D-3. **Không** chạm `components/mobile/chat/**`, `composables/mobile/**`, `views/MobileChatView.vue` |
| **mobile-pwa-dev** | E | `frontend/index.html`<br>`frontend/public/manifest.json`<br>`frontend/public/pwa/**` (icon mới 180/192/512, maskable)<br>`frontend/src/pwa/**` | LOCK E-1 (main.ts), E-2 (vite.config.ts), E-3 (package.json). Không đổi `public/brand/**` hiện có (dùng ở nơi khác) |
| **mobile-qa** | B–E | `frontend/src/__tests__/mobile/**`<br>`frontend/e2e/**` + `frontend/playwright.config.ts`<br>`docs/mobile-upgrade/qa/**` | Không sửa code để test xanh. Fixtures giả hoàn toàn. Playwright đã duyệt 07/11/2026 (D-13): project WebKit + Chromium, viewport iPhone; thêm script `test:e2e` vào `package.json` qua LOCK REQUEST |
| **mobile-architect** | A, cập nhật mỗi đợt | `docs/mobile-upgrade/contracts/**` | |
| **mobile-ui-reviewer** | B–E | không ghi | Chỉ đọc, báo cáo |

## 4. Kiểm tra không chồng file C ↔ D

| Vùng | Chat (C) | CRM (D) |
|---|---|---|
| View adapter | `views/MobileChatView.vue` | `views/MobileContactView.vue`, `views/mobile/crm/**` |
| Component | `components/mobile/chat/**` | `components/mobile/crm/**` |
| Composable | `composables/mobile/**` | `composables/mobile-crm/**` |
| Wrapper desktop | ChatView (orchestrator) | ContactsView, DashboardView, AppointmentsView, ContactProfileView (orchestrator) |
| Điểm giao nhau | Hồ sơ → "Nhắn tin" chỉ `router.push({ name: 'Chat', params: { convId } })` hoặc `openContactChat` (chỉ đọc) — không import component của nhau | Tổng quan → mở hội thoại cũng chỉ qua router |

Không glob nào giao nhau. Component dùng chung giữa C và D (sheet, feedback, header) **chỉ** nằm ở `components/mobile/shell/**` (shell sở hữu, merge trước).

## 5. Thứ tự merge

1. **A** — `contracts/**` (đợt này). Chủ dự án duyệt §12 CONTRACT-A.
2. **B shell** — orchestrator merge LOCK B-1, B-2 trước (route `/account`, `hsDark`), rồi PR shell, rồi B-4 (spec reports) cùng PR shell để CI xanh.
3. **LOCK C-1, C-2, D-1** — orchestrator tách wrapper và helper upload (không đổi hành vi, có ảnh desktop trước/sau).
4. **C chat** và **D CRM** song song trên worktree riêng, rebase lên (3). C-3/C-4 orchestrator merge trước PR chat. D-2/D-3 orchestrator merge trước PR CRM.
5. **QA** tích hợp sau mỗi merge; QA chuẩn bị fixture song song từ đợt B.
6. **E PWA** sau khi C và D merge (SW cache phải biết route cuối); E-1/E-2/E-3 orchestrator merge cùng PR PWA.

Xung đột ở file lock → orchestrator giải quyết; agent không copy shared file sang worktree của mình để sửa.

## 6. Git

Cấm `git reset`, `git checkout -- .`, `git stash`, `git clean`, `git restore`, force push. Không commit/push nếu orchestrator chưa giao. Branch đề xuất: `mobile/shell`, `mobile/chat`, `mobile/crm`, `mobile/pwa`, `mobile/qa` tách từ `mobile/base`.


## 7. LOCK bổ sung đợt D — duyệt trực tiếp 09/11/2026

| LOCK | Người thực hiện | File | Phạm vi được duyệt |
|---|---|---|---|
| D-4 (liên kết Tổng quan → inbox) | Orchestrator | `frontend/src/views/MobileChatView.vue` (file thuộc C, dùng chung giữa các đợt) | Đọc query `filter=unreplied` trước request đầu; giữ query khi chọn/back; đồng bộ query khi bỏ lọc. Không đổi gửi tin/socket/nháp/use-chat/desktop |

`MobileOverviewView.vue` đã phát query trước lượt tiếp tục này; chỉ cập nhật comment hết hạn, giữ liên kết hiện có. QA sở hữu test DOM/e2e và báo cáo G3. Ba mục hoãn F ghi trong PARITY, không sửa code ứng dụng để làm các mục đó trong D.
