# QA F4 + F6 — 10/11/2026

Nhánh `mobile/ext`, worktree `F:/ZaloCRM-wt/ext`. Mốc desktop `68edf81c241ece787ed5c4722167c15a077443ed`; merge-base với `mobile/base` là `bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`. Không merge/push/deploy; backend/API/auth/socket/payload gửi không đổi.

## Phát triển và review

- Áp dụng corepviet-mobile-contract trước vue-best-practices. Dev F4 phiên riêng, main tích hợp shared file theo [LOCK-APPLIED](F4-F6/LOCK-APPLIED.md), phát triển F6 và xử lý finding.
- [REVIEW-1](F4-F6/REVIEW-1.md): sửa race 404 cũ làm nhiễm khách mới, watcher modelValue ghi nháp sang hội thoại khác, và reset editor đang mở khi đổi phiên.
- [REVIEW-2](F4-F6/REVIEW-2.md): PASS source, không Critical/High/Medium; main sửa LOW thứ tự SPDX/import.
- [REVIEW-3](F4-F6/REVIEW-3.md): reviewer MỚI kiểm delta thông báo server message-only và nối dây F6, PASS source; 80 test liên quan đạt. Review source không thay thế QA trình duyệt. [REVIEW-4](F4-F6/REVIEW-4.md) kiểm độc lập bộ E2E/pixel sau các sửa selector/clipboard, PASS-WITH-NOTES, mọi ghi chú LOW. Main bổ sung so sánh nguyên markup B với snapshot B trước khi rời hội thoại để chặn trường hợp cùng chữ nhưng lẫn định dạng A.

## F4 — cơ chế và phạm vi

`use-desktop-chat-drafts.ts` giữ nguyên tài liệu JSON Tiptap theo conversationId trong RAM, kèm ngữ cảnh reply/edit. `DesktopChatView` cung cấp khóa theo hội thoại đang hiển thị, `rich-text-editor` chỉ opt-in ở composer chính, `MessageThread` đặt key editor desktop theo conversation.id. Key mobile cố định và không dùng store desktop. Không localStorage/IndexedDB/outbox mới. Gửi xong editor rỗng được lưu/xóa đúng khóa. Logout/đổi user/org xóa store và editor đang mở. Guard PWA hiện có xét cả nháp desktop ẩn ở hội thoại khác; không sửa service worker/cache.

Diff `MessageThread.vue` chỉ có key và prop opt-in: `handleSend`, định dạng, mentions, replyMessageId, AI, đính kèm, phím tắt và payload không sửa. E2E kiểm gửi đúng conversation và dữ liệu styles/mentions/reply; unit Tiptap kiểm tài liệu cùng plain text nhưng khác định dạng. Các hành vi gửi thất bại/undo/focus vốn có không mở rộng trong lượt này.

## F6 — phản hồi server, giới hạn backend cần hotfix riêng

| Trường hợp server | Desktop và mobile |
|---|---|
| HTTP403 hồ sơ | Bạn không có quyền xem khách này |
| HTTP404 hồ sơ | Khách không tồn tại hoặc đã xóa |
| HTTP500/lỗi khác | Không tải được hồ sơ khách. Vui lòng thử lại. |
| Offline mobile | Trạng thái offline riêng |
| Lưu lịch có message server | Giữ nguyên nội dung cụ thể của server |
| Lưu lịch chỉ có error=appointment_conflict | Khách đã có lịch hẹn trùng giờ; yêu cầu chọn giờ khác/xử lý lịch cũ |
| 409/500 chung, không mã/message đủ thông tin | Báo lưu thất bại chung, không suy đoán trùng giờ |

- `backend/src/modules/contacts/contact-routes.ts:484` và `:2649` chủ ý trả404 khi `assertContactVisible=false`; khách thiếu thực sự tại `:496`/`:2655` cũng404. Frontend không thể phân biệt hai nguyên nhân nếu server cùng404, không đoán403 và không thay đổi chính sách giấu tồn tại.
- `backend/src/modules/contacts/appointment-routes.ts:220` kiểm trùng ở POST; `:243` trả409 với `appointment_conflict`, message tên KH/lịch/giờ/ngày/sale và conflictId. Frontend hiển thị message đó.
- **Backend cần làm riêng**: PUT `backend/src/modules/contacts/appointment-routes.ts:316` tìm lịch tại `:322` rồi update tại `:337`, chưa có guard trùng tương đương POST. Nếu PUT chấp nhận lịch trùng, frontend không thể tự suy đoán lỗi. Unit update409 chỉ chứng minh xử lý phòng thủ khi server có trả mã; không chứng minh backend PUT đã chặn trùng.

## Kiểm tra kỹ thuật

| Gate | Kết quả đã xác minh |
|---|---|
| vue-tsc -b | 0 lỗi |
| Vitest toàn bộ | 77 file / 877 test PASS |
| Build production | PASS, bao gồm PWA injectManifest |
| Chromium + WebKit functional | 26/26 PASS (13 mỗi engine), desktop F4 + mobile/desktop F6 Sáng/Tối |
| Desktop1440 so68edf81 | Đủ3 C +3 R từng cảnh/engine; số0 và ngoại lệ đối chứng trong bảng dưới; QA độc lập PASS với ngoại lệ nhiễu đã có đối chứng; chat-empty không đạt exact0 mọi lượt |

Các lượt QA đầu được giữ nguyên log ngoài repository: lỗi kỳ vọng404 cũ được sửa theo HTTP status thực, không thay test empty-search danh sách. Bộ E2E đầu truy cập nội bộ Vue không tồn tại ở production build; đã thay bằng paste HTML qua ClipboardEvent thật. Tiptap có decoration placeholder theo focus; so sánh cấu trúc tài liệu bỏ decoration trên bản clone DOM, không sửa DOM đang chạy/CSS/ảnh chụp. Bản B được đối chiếu với chính tài liệu B sau nhập, tránh nhầm innerText layout với textContent hay serializer gửi.

## Phương pháp đối chứng ảnh

Baseline được `git archive 68edf81` ra `C:/Users/Public/f4f6-baseline-68edf81`, build riêng, không dùng .env/profile. Cặp đối chứng chạy hai origin cùng dist baseline (4219 →4220), cặp thật 4219 →4218. Cùng renderer, thứ tự, locale, viewport1440×900, clock cố định, fixture giả. Mỗi cảnh/engine 3 C và3 R; không mask, không sửa CSS, không nới ngưỡng (RGBA exact0). Lượt đầu blur activeElement rồi chờ1000ms, caret hide. WebKit có thể tự lấy lại focus; ảnh đối chứng cũng lệch khoảng4000px. Đã giữ nguyên các thử nghiệm focus/blur trực tiếp, chờ frame và chuyển focus sang nút toolbar, kể cả các assert focus thất bại ở baseline. Cảnh đổi nháp có đủ3 C +3 R cùng trạng thái blur ở lượt chốt. Với chat trống, phương pháp cuối focus thật contenteditable ở cả hai bản, chờ1000ms, assert DOM focus và `.input-editor.focused` đều có trước chụp; caret vẫn hide. Không thay class/CSS bằng script và không gọi blur đã ổn định khi phép đo chứng minh ngược lại.

Cảnh `chat-switch-draft`: baseline mang nháp A sang B, candidate B rỗng; chỉ vùng `.message-thread .input-row` được phép khác, gồm ô soạn và trạng thái enable của nút Gửi phụ thuộc trực tiếp nội dung. Toolbar/header/tin nhắn/sidebar và mọi vùng còn lại phải được đo riêng với ngưỡng0. Các cảnh chat-empty/profile-success/appointments so toàn ảnh. Lưu nguyên ảnh before/after/diff và JSON tọa độ ngoài repo, không biến assertion khác0 thành PASS exact0 khi có nhiễu.

## Bảng đối chứng desktop1440 chốt

C = baseline68edf81 → baseline68edf81 ở origin khác; R = baseline68edf81 → candidate. Mỗi cột có3 lượt theo đúng thứ tự. Pixel ngoài vùng cho phép đo RGBA exact0, không tolerance. Với các cảnh không có nháp, “ngoài” là toàn ảnh. Trong row của cảnh đổi nháp phải có khác biệt >0, không được che/mask ảnh.

| Engine/cảnh | C pixel ngoài | C max Δ | R pixel ngoài | R max Δ | R pixel trong row | Kết luận |
|---|---|---|---|---|---|---|
| chromium · chat-empty | 14/14/49 | 1/1/33 | 14/0/0 | 1/0/0 | 0/0/0 | Nhiễu raster đã có đối chứng; xem tọa độ dưới |
| chromium · chat-switch-draft | 0/0/0 | 0/0/0 | 0/0/13 | 0/0/1 | 3016/3016/3016 | Nhiễu raster đã có đối chứng; xem tọa độ dưới |
| chromium · profile-success | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | Exact0 toàn ảnh |
| chromium · appointments | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | Exact0 toàn ảnh |
| webkit · chat-empty | 0/0/0 | 0/0/0 | 82/82/0 | 232/232/0 | 0/0/0 | Nhiễu countdown đã có đối chứng; xem tọa độ dưới |
| webkit · chat-switch-draft | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 2713/2713/2713 | Trong row khác đúng nội dung/nút Gửi; ngoài row exact0 |
| webkit · profile-success | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | Exact0 toàn ảnh |
| webkit · appointments | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | Exact0 toàn ảnh |

- Bảng dùng `evidence-pixel-focused` cho chat-empty (ô soạn được focus thật ở cả hai bản, assert DOM + class focused), `evidence-pixel-focus` cho chat-switch-draft, `evidence-pixel` cho profile/appointments. Mọi cặp trong cùng một lượt dùng cùng protocol/renderer/thứ tự. Lượt đổi nháp dùng blur; lượt chat trống cuối dùng focused vì WebKit tự khôi phục focus sau blur ngay cả ở baseline. Không sửa source/CSS để đạt ảnh.
- Chromium chat-empty R1=14/max1 cùng toàn bộ tọa độ với C1/C2: x258–261 và415–418,y59–60 (góc raster ô tìm). C3=49/max33 còn có góc bo/gradient avatar; R2/R3=0. Không có tập điểm chỉ xuất hiện ở candidate lặp cả3 lượt.
- Chromium chat-switch-draft R3=13/max1 **trùng nguyên mảng tọa độ** với C3 cùng cảnh ở lượt ban đầu: x848–851 và940–944,y57–60. R1/R2=0. Ba R đều có3016 pixel khác trong row, đúng nháp A bị bỏ khỏi B và nút Gửi đổi enable-state.
- WebKit chat-empty R1/R2=82/max232 ở x1298–1312,y377–386, chỉ chữ số trong “Ghim mở (tự thu sau …s)” chạy theo timer thực. Cặp baseline→baseline ban đầu (`webkit-chat-empty-control-2`) lệch4066 pixel gồm đúng **82 tọa độ đó** và3984 pixel focus. Tập82 của R là tập con chính xác của C, không phải suy đoán CSS; R3=0. Date cố định không dừng interval đếm ngược. Đây là nhiễu timer của bộ chụp, ghi riêng với nhiễu raster.
- WebKit đổi nháp: ngoài row0 cả3 C và3 R;2713 pixel trong row. Hồ sơ thành công/lịch hẹn:0 toàn ảnh cho cả3 C và3 R trên cả hai engine.
- Không gọi các cặp khác0 là PASS exact0. Tổng108 lần so cặp đã thử:48 ban đầu,24 chốt blur,12 có bringToFront/chờ frame,12 chuyển focus sang toolbar,12 focus editor cuối. Có94 cặp lưu đủ before/after/diff/JSON;14 lần dừng ở assert focus WebKit trước chụp (đối chứng cũng gặp). Mọi lượt/log thất bại được giữ, không xóa/nới assertion. Lượt đầu33 PASS/15 FAIL; blur17/7; chờ frame2/10; toolbar4/8; focused6/6. Các FAIL gồm nhiễu, focus của bộ chụp và innerText rỗng biểu diễn bằng newline ở lần đầu (đã sửa assertion trim, không thay ảnh).

### Lưu bằng chứng

Output ngoài repo tại `C:/Users/Public/f4f6-agent/`: `functional5.log` (26/26), `qa3-tsc.log`, `qa3-vitest.log` (877/877), `qa3-build.log`; các thư mục `evidence-pixel*` giữ nguyên ảnh/JSON và log `pixel*.log`. Baseline dist và fixture đều giả, không có .env/profile. Main đã mở xem ảnh before/after cảnh đổi nháp desktop1440; không có thay đổi nhìn thấy ngoài row soạn ở cặp exact0. Manifest SHA256 source được đối chiếu lại trước commit, không đổi từ bản đã build/QA.

## Các ca hành vi đã đạt

- Chromium và WebKit: A→B rỗng; A→B→A giữ nháp A; gửi B đúng POST conv-2, B rỗng và A còn; reload mất RAM.
- Rich clipboard chứa bold/italic/list/mention được phục hồi nguyên markup; gửi qua nút thật có content/styles/uid mention; nháp B được so với snapshot riêng của B. Unit còn kiểm hai tài liệu cùng plain text nhưng khác marks.
- Reply ở A không hiện tại B; quay A gửi có replyMessageId. Chế độ Edit A tách khỏi B, B giữ nguyên tài liệu riêng khi quay lại.
- Mobile smoke A/B tiếp tục giữ nháp RAM riêng, không dùng store desktop.
- Hồ sơ403/404/500 đúng câu, không hiện hero khách cũ; hai theme, hai dạng desktop/mobile, không overflow ngang.
- Lịch hẹn POST409 message đủ tên/lịch/giờ/ngày/sale hiển thị nguyên văn; code-only có câu trùng giờ; lỗi không đóng form hoặc làm mất tiêu đề đã nhập. Unit kiểm create/update và lỗi500 chung không suy đoán trùng.

## Kết luận QA độc lập và quyết định commit

[QA-AUDIT](F4-F6/QA-AUDIT.md): **QA PASS với ngoại lệ nhiễu có bằng chứng**, không có vị trí chỉ xuất hiện ở candidate lặp lại. Auditor đọc log, đối chiếu toàn bộ552 hash source không đổi, tự giải mã93/94 cặp PNG và khớp số đo JSON; một cặp chưa được auditor kiểm lại độc lập, nên không tuyên bố94/94 được kiểm hai lần.

**Chat-empty không đạt exact0 ở mọi lượt.** Suite pixel giữ assertion0 và vẫn báo đỏ khi gặp nhiễu; commit giữ cả spec để tái hiện phép đo, không biến ngoại lệ thành tolerance/mask hoặc skip. Đây là kết luận kiểm chứng đối chứng theo yêu cầu F2/F3, không phải tuyên bố mọi test ảnh xanh. Các điều kiện về ghi kết quả và protocol của auditor đã cập nhật ở trên. Các bảng gốc reviewer/QA được giữ nguyên; đính chính lỗi đếm trong báo cáo auditor: profile-success và appointments mỗi cảnh có3 C +3 R mỗi engine (không phải6 C +6 R mỗi engine); WebKit chat-switch có6 R tổng hai lượt, không phải12 R; chat-empty WebKit có9 C và7 R có JSON (8 C0,1 C4066), không phải6 C. Tổng94 JSON vẫn đúng.

Không đổi backend/API/payload gửi. Cho phép commit candidate trên mobile/ext theo chỉ định; chưa merge mobile/base, không push/deploy.

## Mã nguồn chính

- `frontend/src/composables/use-desktop-chat-drafts.ts:42`: store RAM theo convId.
- `frontend/src/views/DesktopChatView.vue:276`: provide ngữ cảnh desktop; `components/chat/MessageThread.vue:669`: key/opt-in composer.
- `frontend/src/components/chat/rich-text-editor.vue:524`: nhận binding; `:540`: persist đúng mountedDraftId.
- `frontend/src/utils/crm-request-errors.ts:9`: 403/404; `:16`: message/code lịch hẹn.
- `frontend/src/composables/use-contact-profile.ts:83`: status/generation; `mobile-crm/use-mobile-contact-detail.ts:70`: trạng thái mobile.
- `frontend/src/composables/use-appointments.ts:214`/`:231`: giữ lỗi create/update.

## Giới hạn

Dữ liệu hoàn toàn giả, API mock, không kết nối DB/VPS production. WebKit desktop/mô phỏng viewport mobile không phải Safari/iPhone thật hay Home Screen PWA. Chưa chứng nhận VoiceOver, EE, backend PUT conflict; không khẳng định kiểm thực tế iPhone. Output/profile/.env không đưa vào commit. Các giới hạn reviewer LOW về focus/caret/undo hoặc gửi thất bại được giữ như hành vi hiện có, không dùng PASS test để tuyên bố đã kiểm mọi luồng phụ.
