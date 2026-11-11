# Review độc lập F1 — vòng 3 (mobile-ui-reviewer)
Worktree F:/ZaloCRM-wt/ext, nhánh mobile/ext. Chỉ đọc mã, chỉ ghi báo cáo này. **Chưa QA, chưa chạy trình duyệt/iPhone/VoiceOver.**
Đã chạy chỉ-đọc: `vue-tsc -b` exit 0; vitest `components/mobile/settings`, `views/mobile`, `composables/mobile-settings`: 8 file, 92 test xanh.

## VERDICT: MERGE ĐƯỢC (có điều kiện QA) — không còn blocker/High. 1 Medium nên sửa nhỏ trước khi merge (hoặc ghi nợ), do chính delta vòng 3 gây ra.

## Đối chiếu xử lý vòng 2
- **H1 Lưu trữ nhãn Zalo Real — ĐÃ XỬ LÝ ĐÚNG.** `TagFormSheet.vue:35` `:disabled="saving || tag.source === 'zalo_real'"` + dòng gợi ý `:37` ("Nhãn Zalo Real không thể lưu trữ", hiển thị cho trình đọc màn hình, không chỉ là nút mờ); lớp bảo vệ thứ hai ở `use-mobile-tags.ts:111` (`archive()` trả false + `formError`) nên không gọi `DELETE` được dù UI bị bỏ qua. Khớp desktop `TagTaxonomyV2Page`.
- **M1 Phòng ban — ĐÃ XỬ LÝ về nội dung** (`MobileDepartmentsPage.vue:19-21`: Trưởng phòng, Phó phòng, `<details>` thành viên; "Chưa giao" vs "Không có thông tin trong phạm vi quyền" phân biệt đúng). **Nhưng phát sinh hồi quy — xem M-A.**
- **M2 Danh sách nhân viên dựng lại — ĐÃ XỬ LÝ.** `MobileEmployeesList.vue:70` chỉ hiện spinner khi `state==='loading' && totalCount===0`; lúc làm mới giữ thẻ cũ + `aria-busy` (`:9`); thẻ có `:key="u.id"` + `data-user-id` nên node DOM được tái sử dụng, `returnTo` của focus trap còn hiệu lực.
- **M3 Chạm × ngay sau khi gõ — ĐÃ XỬ LÝ.** `UserEditPanel.vue:25` `@pointerdown` đặt `closeIntent` trước khi blur kích hoạt lưu (pointerdown chạy trước blur do đổi focus); `requestPanelClose` (`:326-329`) khi `busy` chỉ ghi nhớ ý định; `watch(busy)` (`:339`) tự đóng sau khi lưu xong **chỉ khi không có `error`** (lưu lỗi thì giữ panel, hiện lỗi — đúng). Nhánh "Bỏ thay đổi chưa lưu?" vẫn còn cho trường hợp lưu bị bỏ qua (email/SĐT không hợp lệ).
- **Chấm điểm signalKey — ĐÃ XỬ LÝ** (`MobileScoringPage.vue:42-43`: nhãn + `signalKey` ở dòng phụ).

## MEDIUM

**M-A. Trang Phòng ban: người chỉ có quyền Phòng ban (không có quyền Người dùng) bị khóa hẳn, hồi quy so với desktop**
- `views/mobile/settings/MobileDepartmentsPage.vue` fetcher: `Promise.all([store.loadDepartments(), api.get('/rbac/users')])` — nếu `/rbac/users` trả 403/lỗi thì **cả trang** rơi vào `error`/`forbidden` dù `GET /departments` thành công.
- Xác minh: `backend/.../department-routes.ts:24` chỉ cần `requireGrant('department','access')`; `user-assignment-routes.ts:19` cần `requireGrant('user','access')` — hai quyền độc lập. Desktop `views/rbac/DepartmentsView.vue:143` bắt riêng: `api.get('/rbac/users').then(...).catch(() => {})` → danh sách phòng ban vẫn hiện, chỉ không có tên.
- Repro: tài khoản có quyền xem Phòng ban, không có quyền Người dùng → mobile: "Không có quyền" / lỗi tải; desktop: hiện cây phòng ban.
- Sửa tối thiểu (trong fetcher): `const [, users] = await Promise.all([store.loadDepartments(), api.get('/rbac/users').then(r => r.data.users as RbacUser[]).catch(() => null)]); return users ?? [];` — khi `/rbac/users` lỗi, `userName()` sẽ in "Không có thông tin trong phạm vi quyền" (đã đúng ý) và `members()` rỗng. Thêm 1 test: users 403 + departments 200 → trang `ready`.

## LOW (không chặn, ghi nợ/QA lưu ý)
- `UserEditPanel.vue:25` `closeIntent` chỉ được xóa khi `requestPanelClose` chạy. Nếu người dùng nhấn × rồi kéo ngón tay ra ngoài (không có `click`), cờ vẫn `true`; lần `busy` kết thúc kế tiếp (vd. đổi phòng ban) sẽ tự đóng panel ngoài ý muốn. Sửa nhỏ: thêm `@pointercancel`/`@pointerleave` đặt lại cờ, hoặc xóa cờ ở `@focusout`/khi bắt đầu một lần lưu không do blur. Hiếm; để QA thử bằng tay.
- Khi làm mới danh sách nhân viên và bộ lọc trạng thái phía client cho kết quả 0 thẻ trong lúc `loading`, hiện câu "Không có nhân viên khớp bộ lọc" (`MobileEmployeesList.vue:72`) thoáng chốc; chấp nhận được.
- `MobileDepartmentsPage` tải toàn bộ `/rbac/users` chỉ để lấy tên/thành viên (giống desktop); danh sách rất lớn sẽ nặng nhưng cùng hành vi desktop.

## Chưa kiểm (để QA)
Playwright 320–430/768/1440, Safari/PWA iPhone thật, VoiceOver, bẫy focus bằng bàn phím, Dark thật của Org/UserEditPanel, so điểm ảnh desktop 1440. Không được ghi "đạt trên iPhone".

Test hồi quy đề nghị cho QA/main: (1) Phòng ban với `/rbac/users` 403; (2) nhấn × ngay khi blur-save đang chạy → đóng sau khi lưu OK, **không** đóng khi lưu lỗi; (3) archive tag `zalo_real` không phát DELETE; (4) làm mới nhân viên giữ nguyên node thẻ + `aria-busy`.
