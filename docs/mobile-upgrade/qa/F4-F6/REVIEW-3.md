# Reviewer-3 (delta since REVIEW-2): F4 nháp desktop + F6 lỗi — HEAD 68edf81 + working tree
Read-only; không sửa/commit/delegate/build. Đã đọc corepviet-mobile-contract, REVIEW-2 và diff hiện tại. Đã chạy lại 7 spec nhắm đích (crm-request-errors, use-contact-errors, use-mobile-agenda, crm-views, crm-components, use-desktop-chat-drafts, rich-text-editor.draft): 7 file / 80 test PASS. KHÔNG chạy vue-tsc, full suite, Playwright, trình duyệt.

## Kết luận: PASS (source-only) — không Critical/High/Medium. 4 ghi chú Low/QA.

## Delta đã kiểm
- **appointmentSaveError** (`utils/crm-request-errors.ts:16-25`): thứ tự đúng — `data.message` là chuỗi không rỗng (sau trim) → trả nguyên văn dù không có code; chỉ `error === 'appointment_conflict'` (không message) mới ra câu "trùng giờ"; còn lại là câu chung không chứa "trùng". Không đoán 409/500 chung. Spec (`crm-request-errors.spec.ts`) phủ cả 3 nhánh + `other_conflict`/500/{} .
- **Nối dây**: `use-appointments.ts:209-231` reset `saveError` mỗi lần gọi, ghi lỗi ở catch; `use-mobile-agenda.ts:125,134` dùng `api.saveError.value || SAVE_ERROR_TEXT` (SAVE_ERROR_TEXT = hằng chung, bỏ câu đoán cũ "Có thể khách đã có lịch trùng giờ"). Specs agenda cũ vẫn khớp vì import hằng.
- **use-contacts.ts:1-9**: import nằm SAU SPDX/Copyright và sau block comment mô tả → L-a của REVIEW-2 đã xử lý (chỉ là import đứng trên import `vue` — thứ tự import hơi lạ, không ảnh hưởng).
- **crm-views.dom.spec.ts:169-172**: mock `{response:{status:404}}` đúng hình axios error, kỳ vọng "Khách không tồn tại hoặc đã xóa" khớp `contactReadError(404)`. Các chỗ còn chuỗi "Không tìm thấy khách hàng" (`crm-components.dom.spec.ts:72`, `crm-d-flows.spec.ts:87`, `crm-d-states:185`) thuộc empty-search danh sách / assert phủ định cho offline → không stale.
- **Nguồn F4/F6 hiện tại**: không phát hiện thay đổi so với kết luận REVIEW-2 (draft key theo conversation id desktop, mobile opt-out, payload gửi không đổi, 403/404 phân biệt, 500/offline không bị gán "đã xóa").

## E2E mới
- `f4f6-parity.spec.ts`: ngưỡng `pixelDiff(...,0)` + assert `outsidePixels === 0`, `sizeMatch`. Cảnh `chat-empty`, `profile-success`, `appointments` so toàn ảnh exact. Chỉ `chat-switch-draft` (REAL) miễn trừ rect `.message-thread .input-row` (bao gồm editor + nút gửi → enable-state) và bắt buộc `insidePixels > 0`, `a.text` = nháp A (baseline mang nháp sang B), `b.text` = ''. Lệch ngoài rect (vd chiều cao input-row đổi làm dịch layout) vẫn fail → không giấu regress. 3 CONTROL (baseline vs baseline @CONTROL_BASE) × 3 REAL cùng renderer, cùng thứ tự `shot(BASE)` → `shot(target)`, nên chứng minh được độ ổn định renderer. Không mask/CSS/tolerance. OK.
- `f4f6-functional.spec.ts`: A→B→A, gửi B không xóa A (assert body POST đúng conv-2), reload mất nháp RAM, rich/mention/list khôi phục + payload `content/styles/mentions` khớp, reply chỉ ở A và gửi `replyMessageId`, F6 403/404/500 (4 tổ hợp mobile/desktop × sáng/tối, kiểm tràn ngang + không hero), conflict có message và code-only, form giữ dữ liệu.

## Ghi chú Low / QA
- **L1 (Low, e2e)** Không có e2e cho mobile opt-out nháp (chỉ unit) và không có scene parity mobile/dark; mobile composer "không đổi" chưa được chứng minh bằng pixel. Gợi ý QA thủ công inbox+thread iPhone/WebKit.
- **L2 (Low, e2e)** Test gửi chỉ so `content/styles/mentions/replyMessageId`; không so toàn bộ body với baseline 68edf81 → "payload không đổi" dựa vào đọc diff + unit, chưa có so sánh byte-for-byte.
- **L3 (Low, hành vi)** Ưu tiên message server: 4xx/5xx có `message` tiếng Anh/kỹ thuật (vd "Internal server error") sẽ hiển thị nguyên cho người dùng (chấp nhận theo yêu cầu "server-only"). Ngoài ra `AppointmentEditor.vue:1037` tự lặp logic bằng `err.data.message || ...` thay vì gọi `appointmentSaveError` cho nhánh chung: message toàn khoảng trắng hoặc không phải chuỗi sẽ hiển thị khác với mobile (preexisting; không bug thực tế đã thấy). Có thể thống nhất sau.
- **L4 (Low, carry)** Các Low của REVIEW-2 còn nguyên: beforeunload chỉ khi DesktopChatView mounted, gửi lỗi vẫn xóa nháp, profile 403/404 với contact đã tải ẩn hồ sơ, `contactErrorStatus` dùng chung một instance composable.

## Giới hạn QA (PASS này KHÔNG phải chứng nhận runtime)
- Chưa chạy: `vue-tsc -b`, full vitest, Playwright (Chromium/WebKit), build, trình duyệt thật. Kết quả pixel 0-diff chưa tự xác nhận ở đợt này — cần QA chạy parity 4218/4219/4220 và đọc JSON/diff.
- Cần kiểm tay: remount editor mỗi lần đổi hội thoại (focus/caret/undo/popup @mention và "/", nhấp nháy, đổi nhanh), `?draft=` deep link, AI gợi ý + đổi hội thoại, đổi user/org không reload, 409 POST thật vs PUT (backend PUT chưa có conflict guard), offline/500 hồ sơ, iPhone Safari/Home Screen PWA chưa kiểm.
