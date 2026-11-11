# Kiểm kê file đợt D — 09/11/2026

Worktree `F:\ZaloCRM-wt\crm`, nhánh `mobile/crm`, HEAD/base `e290e2d`. Không commit/merge.
Danh sách gồm phần D được bàn giao sẵn và phần hoàn tất trong chat này; không coi toàn bộ là mới viết lại.

## File tracked có diff nội dung / rename so với HEAD

`R100` là đổi tên giữ nguyên nội dung; `R099` là DesktopContacts bỏ nhánh mobile cũ. Wrapper tại đường dẫn view gốc được liệt kê phía dưới vì đang là untracked trong index hiện tại.

```text
M	docs/mobile-upgrade/13_SUBAGENT_TEAM.md
M	docs/mobile-upgrade/contracts/OWNERSHIP.md
M	docs/mobile-upgrade/contracts/PARITY.md
M	frontend/e2e/chat.spec.ts
M	frontend/e2e/helpers/audit.ts
M	frontend/playwright.config.ts
M	frontend/src/__tests__/mobile/message-thread-mobile.dom.spec.ts
M	frontend/src/__tests__/mobile/mobile-chat-view.dom.spec.ts
M	frontend/src/components/appointments/AppointmentEditor.vue
M	frontend/src/composables/use-mobile.dom.spec.ts
R100	frontend/src/views/AppointmentsView.vue	frontend/src/views/DesktopAppointmentsView.vue
R100	frontend/src/views/ContactProfileView.vue	frontend/src/views/DesktopContactProfileView.vue
R099	frontend/src/views/ContactsView.vue	frontend/src/views/DesktopContactsView.vue
R100	frontend/src/views/DashboardView.vue	frontend/src/views/DesktopDashboardView.vue
M	frontend/src/views/MobileChatView.vue
M	frontend/src/views/MobileContactView.vue
M	frontend/src/views/mobile/account/MobileAccountView.vue
M	frontend/src/views/settings/SettingsLayout.vue
```

## File mới / wrapper thay thế tại đường dẫn cũ

```text
docs/mobile-upgrade/qa/QA-D.md
frontend/e2e/crm-d-flows.spec.ts
frontend/e2e/crm-d.spec.ts
frontend/e2e/desktop-regression-d.spec.ts
frontend/e2e/helpers/mock-crm.ts
frontend/e2e/helpers/qa-checks.ts
frontend/src/__tests__/mobile/crm-d-states.dom.spec.ts
frontend/src/components/mobile/crm/AgendaDayStrip.vue
frontend/src/components/mobile/crm/AgendaFilterSheet.vue
frontend/src/components/mobile/crm/AppointmentActionsSheet.vue
frontend/src/components/mobile/crm/AppointmentCard.vue
frontend/src/components/mobile/crm/AppointmentSheet.vue
frontend/src/components/mobile/crm/ContactCard.vue
frontend/src/components/mobile/crm/ContactFilterSheet.vue
frontend/src/components/mobile/crm/ContactFormSheet.vue
frontend/src/components/mobile/crm/CustomerConversationPicker.vue
frontend/src/components/mobile/crm/CustomerProfile.vue
frontend/src/components/mobile/crm/MobileContactList.vue
frontend/src/components/mobile/crm/MobileOverview.vue
frontend/src/components/mobile/crm/OverviewScopeSheet.vue
frontend/src/components/mobile/crm/OverviewSystemPanel.vue
frontend/src/components/mobile/crm/OverviewTeamPanel.vue
frontend/src/components/mobile/crm/PrivacyValue.vue
frontend/src/components/mobile/crm/agenda-model.spec.ts
frontend/src/components/mobile/crm/agenda-model.ts
frontend/src/components/mobile/crm/contact-form-model.ts
frontend/src/components/mobile/crm/crm-components.dom.spec.ts
frontend/src/components/mobile/crm/crm-model.spec.ts
frontend/src/components/mobile/crm/crm-model.ts
frontend/src/components/mobile/crm/types.ts
frontend/src/components/mobile/settings/MobileSettingsMenu.vue
frontend/src/components/mobile/settings/MobileSettingsShell.vue
frontend/src/components/mobile/settings/settings-shell.dom.spec.ts
frontend/src/composables/mobile-crm/test-utils.ts
frontend/src/composables/mobile-crm/use-mobile-agenda.dom.spec.ts
frontend/src/composables/mobile-crm/use-mobile-agenda.ts
frontend/src/composables/mobile-crm/use-mobile-contact-detail.spec.ts
frontend/src/composables/mobile-crm/use-mobile-contact-detail.ts
frontend/src/composables/mobile-crm/use-mobile-contacts.dom.spec.ts
frontend/src/composables/mobile-crm/use-mobile-contacts.ts
frontend/src/composables/mobile-crm/use-mobile-overview.ts
frontend/src/composables/mobile-crm/use-shell-bottom-inset.ts
frontend/src/composables/mobile-settings/settings-nav-model.spec.ts
frontend/src/composables/mobile-settings/settings-nav-model.ts
frontend/src/composables/mobile-settings/use-mobile-settings-entry.ts
frontend/src/views/AppointmentsView.vue
frontend/src/views/ContactProfileView.vue
frontend/src/views/ContactsView.vue
frontend/src/views/DashboardView.vue
frontend/src/views/mobile/crm/MobileAgendaView.vue
frontend/src/views/mobile/crm/MobileContactProfileView.vue
frontend/src/views/mobile/crm/MobileOverviewView.vue
frontend/src/views/mobile/crm/crm-views.dom.spec.ts
```

## File dùng chung hoặc qua LOCK cần reviewer chú ý

| LOCK | File | Nội dung |
|---|---|---|
| D-1/D-2/D-3 | `views/ContactsView.vue`, `DashboardView.vue`, `AppointmentsView.vue`, `ContactProfileView.vue` + bốn `Desktop*View.vue` | Wrapper phân nhánh mobile, không chạy onMounted desktop khi mobile; giữ bản desktop |
| D-4, chủ dự án duyệt 09/11 | `views/MobileChatView.vue` | Nạp queryfilter trước fetch đầu, giữ khi mở/back; whitelist filter để không mở lại thread từ legacy query |
| S-1 | `views/settings/SettingsLayout.vue` | Mount settings shell riêng khi mobile, giữ desktop |
| A-1/A-1b | `components/appointments/AppointmentEditor.vue` | Override mobile khi `html[data-theme]`: Tối, vùng chạm44, input16, avatar tương phản; không đổi payload |
| A-2 | `views/mobile/account/MobileAccountView.vue` | Dark modal đổi mật khẩu, đã có trong bàn giao |
| QA dùng chung | `e2e/helpers/audit.ts`, `playwright.config.ts`, `e2e/chat.spec.ts` | Đo vùng chạm ủy quyền và clipping có bằng chứng, cổng/runID riêng, URL sau back có filter |

Các đường dẫn trong bảng có tiền tố `frontend/src/`, trừ hàng QA có tiền tố `frontend/`.
`use-chat.ts`, auth/API/socket, backend, package.json không bị sửa trong đợt này.

## Ảnh và dữ liệu QA

Ảnh/JSON sinh tự động được nhóm riêng trong `docs/mobile-upgrade/qa/D-shots/` để không trộn với source.
Bằng chứng chốt: thư mục `G3-final-20261109-2056/`; các run smoke và QA-D.md cũ chỉ là lịch sử.
Các JSON C/hotfix có thể hiện M do line-ending/stat-cache nhưng `git diff --numstat` không có thay đổi nội dung; không đưa chúng vào thay đổi sản phẩm D.
Báo cáo bàn giao và QA-G3 mới tự bổ sung vào danh sách tài liệu sau khi chốt test.

## Tài liệu chốt bổ sung

- `docs/mobile-upgrade/14_D_HANDOFF_REVIEW.md`
- `docs/mobile-upgrade/D_FILE_INVENTORY.md`
- `docs/mobile-upgrade/qa/QA-D-G3.md`
- `QA-D.md` được gắn nhãn snapshot lịch sử, không dùng thay kết quả strict mới.
