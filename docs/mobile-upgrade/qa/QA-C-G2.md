# QA Đợt C — Gate G2 (chat mobile)

Ngày: 2026-11-08 · Worktree `F:\ZaloCRM-wt\chat` · branch `mobile/chat` · base `7f322c3` (chưa commit) · Người kiểm: mobile-qa
Căn cứ: `contracts/CONTRACT-A.md` §3, §4.1–4.2, §5, §10.2 (dòng C), §12.1 · Gate: 07_MULTI_AGENT_PLAN §5 (G2) · Baseline: `QA-B-G1.md`

## Kết luận

**KHÔNG ĐẠT G2.**

1. Có **1 lỗi High** và **1 lỗi Medium** nằm trong code đợt C (H-1, M-1 bên dưới); cả hai đều tái hiện ổn định trên Chromium và WebKit desktop.
2. G2 yêu cầu "keyboard test Safari/PWA iPhone thật" — **chưa có kết quả nào trên iPhone thật hay Home Screen PWA**. Mọi bằng chứng dưới đây chỉ là static + Chromium desktop + WebKit desktop (viewport mô phỏng). Không được đọc là "đạt trên iPhone".
3. Phần còn lại của chat mobile đạt tốt ở mức bằng chứng đó: deep link, back, nháp theo hội thoại, gửi đúng payload, "Tin mới ↓", một socket, nút +, hàng đợi offline, privacy, Tối, 768+ không dựng mobile, desktop 1440 không đổi (0 pixel lệch). Sửa H-1 và M-1 rồi chạy lại là có thể chuyển sang "ĐẠT ở mức desktop-emulation", còn chờ checklist iPhone (mục 8).

## 1. Lệnh và kết quả

| Lệnh (trong `frontend/`) | Kết quả |
|---|---|
| `npx vue-tsc -b` | exit 0, **0 lỗi** |
| `npx vitest run` | **42 file pass / 42; 431 test pass, 0 fail** (đợt B: 35 file / 291 test; phần tăng là spec đợt C) |
| `npm run build` | thành công (~2,2 s). Cảnh báo chunk >500 kB (exceljs, ChatView…) **có sẵn từ trước** |
| `npx playwright test e2e/chat.spec.ts` (Chromium + WebKit) | **80 pass / 84** (42 test × 2 engine). 4 fail = 2 lỗi thật × 2 engine (H-1, M-1). Lần chạy cuối sau khi chỉnh cách đo, không còn flaky |
| `npx playwright test e2e/chat-realtime.spec.ts` | **4 pass / 4** (2 test × 2 engine): chưa đọc, reconnect |
| `npx playwright test e2e/shell.spec.ts` (hồi quy khung đợt B, vì C sửa `MobileTabBar`/`MobileLayout`) | **138 pass / 138** |
| `BASE_DIST=%TEMP%\qa-base-dist-c npx playwright test e2e/desktop-regression.spec.ts` | **12 pass / 12**, `diffPixels = 0`, `exactDiffPixels = 0`, `maxChannelDelta = 0` cả 12 ca (xem §5) |
| `npx playwright test e2e/chat-shots.spec.ts` + `e2e/make-pairs-c.spec.ts` | 24 test ảnh (kèm đo thanh tab) + 4 ảnh ghép |

Lỗi baseline có sẵn trước đợt C: **không có** (tsc/vitest sạch). `test-results/` và `playwright-report/` đã xóa sau khi chạy.

Ghi chú cách đo (quan trọng để không đọc sai kết quả):
- Backend không chạy: mọi `/api/v1` mock bằng `page.route`; Socket.IO được giả bằng `page.routeWebSocket` (giao thức Engine.IO v4) để phát `chat:message` thật qua đúng handler của `use-chat`. Dữ liệu hoàn toàn giả ("Khách Giả …", `*.example.invalid`, 30 hội thoại, hội thoại 1 có 60 tin).
- `env(safe-area-inset-*)` = 0 trên desktop → test **đè tay** `--m-safe-bottom` (34px dọc, 21px ngang) giống đợt B. Chỉ là mô phỏng.
- WebKit desktop (Windows) có thanh cuộn cổ điển 10px, iOS thì nổi. `chat.spec.ts` và `chat-shots.spec.ts` chèn `*{scrollbar-width:none}` để mô phỏng iOS (xem L-3). Hệ quả: các test này **không** phát hiện được lỗi tràn do thanh cuộn cổ điển (không áp dụng trên iPhone).
- `page.clock.setFixedTime` làm `Date.now()` đứng yên → test reconnect không dùng nó (nếu dùng thì `onReconnect` coi downtime = 0 và không tải bù).
- Offline dùng `context.setOffline`; cả Chromium và WebKit đều cập nhật `navigator.onLine` + phát sự kiện `online/offline` nên không phải bổ sung thủ công (đã ghi annotation `offline-mode` trong test).

## 2. Phạm vi file đã ghi (chỉ trong worktree chat)

Mới:
- `frontend/e2e/chat.spec.ts` (42 test × 2 engine) — bố cục, điều hướng, trạng thái, nháp/gửi, cuộn/realtime, AI, nút +, offline, privacy, 768+
- `frontend/e2e/chat-realtime.spec.ts` — chưa đọc, reconnect
- `frontend/e2e/chat-shots.spec.ts`, `frontend/e2e/make-pairs-c.spec.ts` — ảnh sau + ảnh ghép
- `frontend/e2e/helpers/mock-chat.ts` (mock hội thoại/tin/đính kèm/AI/Socket.IO giả, đo mạng, chờ sheet), `frontend/e2e/helpers/audit.ts` (đo overflow, touch target, font input, khối sáng trong Tối)
- `docs/mobile-upgrade/qa/C-shots/**` (ảnh + `pairs/` + `desktop-regression/`), `docs/mobile-upgrade/qa/QA-C-G2.md`

Sửa: `frontend/e2e/desktop-regression.spec.ts` — thêm 2 ca có dữ liệu chat (`/chat` có danh sách, `/chat/qa-conv-2` mở thread) và đổi thư mục ra `C-shots/desktop-regression/` (để không ghi đè ảnh đợt B).
Không sửa `frontend/src/**`, `package.json`, `playwright.config.ts`. Không ghi gì vào `F:\ZaloCRM-CorepViet`. Các file `B-shots/desktop-regression/*.json` đang hiện `M` trong `git status` là thay đổi **có sẵn từ lúc tôi bắt đầu**, không phải do lượt này.

## 3. Bảng gate G2

Mức bằng chứng: **S** = static (tsc/vitest/build/đọc code) · **C** = Chromium desktop · **W** = WebKit desktop · Safari iPhone = **CHƯA** · Home Screen PWA = **CHƯA**.

| # | Tiêu chí | Kết quả | Bằng chứng (mức) |
|---|---|---|---|
| 1 | Deep link | **PASS** | `/chat/qa-conv-2` (cold) mở đúng thread, header "Khách Giả B"; GET `/conversations/qa-conv-2/messages` **đúng 1 lần**, GET detail 1 lần, mark-read 1 lần, không tải thread khác; tabbar ẩn. Link cũ `/chat?conv=X` → `/chat/X`. (C, W) |
| 2 | Back | **PASS** | Chọn hàng → URL `/chat/:id`; nút back → `/chat`, inbox bỏ `inert`, **bộ lọc "Chưa trả lời" + số hàng (15) + scrollTop giữ nguyên (±2px)**. Deep link không có lịch sử nội bộ: back → `/chat` (replace), không rời app. (C, W) — chưa thử vuốt-back Safari |
| 3 | Loading / error / empty | **PASS một phần — FAIL ở error inbox (M-1)** | Inbox: loading ("Đang tải hội thoại…") PASS, rỗng ("Chưa có hội thoại nào") PASS. **API 500 hiển thị "Chưa có hội thoại nào" thay vì lỗi + Thử lại** → FAIL. Thread: id không tồn tại → "Không mở được hội thoại" + Thử lại + back PASS. Offline: banner PASS. (C, W) |
| 4 | Media | **PASS** | Sheet + đúng 5 mục Ảnh / Chụp ảnh / Video / Tài liệu / Kho media; `accept`/`capture`/`multiple` đúng bảng §3.3 (camera có `capture="environment"`, video 1 tệp); `setInputFiles` ảnh → `POST /conversations/:id/attachments`, `multipart/form-data`, field `files`, rồi tải lại tin, **không** đi qua `/messages`. HEIC bị từ chối bằng tiếng Việt, **không gọi API**. Mock 413 / 415 / 429 / 403 PRIVACY_LOCKED / 409 → đều ra thông báo tiếng Việt đúng chữ trong `describeUploadError`. Offline (`context.setOffline`) → sheet khóa, có dòng lý do, cả 5 nút `disabled`. Kho media mở sheet riêng. (C, W). Chưa đo nội dung Kho media (mock rỗng), chưa thử tệp 600 MB (đã có vitest) |
| 5 | AI | **PASS một phần — FAIL ở xác nhận thay nháp (H-1)** | Gợi ý về **không tự điền** ô soạn (đợi thêm 800ms vẫn rỗng); đóng sheet giữ nguyên nháp; "Áp vào nháp" → chữ vào ô soạn, sheet đóng, **0 POST `/messages`**; `POST /ai/suggest` đúng `{conversationId}`. Khi **đã có nháp**: hiện nút "Chèn vào cuối nháp"/"Thay nháp hiện tại" và hộp "Thay nháp hiện tại?" nhưng **hộp xác nhận bị sheet AI che, không bấm được "Giữ nháp"/"Thay nháp"** → FAIL (H-1). Logic phía sau (bấm ép) giữ nháp đúng và vẫn 0 POST. (C, W) |
| 6 | Privacy | **PASS** | Nick Riêng tư của người khác: hàng inbox hiện "Nội dung riêng tư", không lộ preview; thread khóa composer (overlay "Riêng tư — chỉ chính chủ nick gửi được tin"), nội dung tin không xuất hiện trong DOM thread; bấm vùng khóa không tạo POST (mở hộp thoại overlay, nhiều khả năng là mở khóa như desktop — chưa xác nhận nội dung); 403 PRIVACY_LOCKED khi upload có thông báo riêng. Ghi nhận L-2 (sheet + không khóa phía client). (C, W). Chưa kiểm chủ nick đã unlock |
| 7 | Unread | **PASS** | Tin đến hội thoại khác: hàng nhảy lên đầu, badge "1", preview cập nhật; mở hội thoại → `POST mark-read` 1 lần, quay lại hết badge. Badge tab Hội thoại bám `/conversations/counts` (đã kiểm ở G1). (C, W) |
| 8 | Reconnect | **PASS** | Từ chối WS mới + đóng socket → sau >4s hiện "Mất kết nối realtime, đang thử kết nối lại…" (nằm trong luồng, trên ô tìm kiếm, không đè nút); cho phép lại → banner mất, **GET `/conversations` được gọi bù**, tin đến sau đó hiện đúng 1 lần. (C, W). Không có socket thật; chưa kiểm refresh token hết hạn/`io server disconnect` |
| 9 | Một socket handler | **PASS** | Mount/unmount `MobileChatView` 3 lần (về lại Hội thoại sau Tài khoản): WS mở 4 (1 ban đầu + 3), đóng 3, **còn sống đúng 1**; một tin `chat:message` → thêm đúng **1** bong bóng, chờ 800ms vẫn 1. (C, W) + vitest "một socket" (S) |
| 10 | Nháp theo hội thoại | **PASS** | Gõ ở A → sang B: ô soạn B **rỗng** → quay lại A: nháp A **còn** → gửi ở B: **đúng 1** `POST /conversations/qa-conv-2/messages`, body `{"content":"Xin chào B, đây là tin thử"}`, không có POST của A; ô soạn B xóa sau gửi. (C, W) |
| 11 | Payload = desktop | **PASS** | Cùng mock, cùng nội dung: mobile (`/chat/qa-conv-2`, nút gửi) và desktop 1440 (`/chat/qa-conv-2`, Enter) cho **cùng path và cùng body** (`toEqual`). Gửi khi đang đọc cũ → kéo đáy, không pill. (C) |
| 12 | "Tin mới ↓" / scroll anchor | **PASS** | Đang cuộn lên đọc cũ (scrollTop 200): tin đến → bong bóng +1, **scrollTop không đổi (±2px)**, pill "Tin mới (1) ↓" hiện ngay trên composer, cao **44px**; bấm → pill mất, về đáy (<8px). Đang ở đáy: tự cuộn, không pill. (C, W). Không có phân trang tin cũ nên chưa thử giữ anchor khi prepend |
| 13 | Hàng đợi offline | **PASS** | Offline gửi văn bản → hiện "Đang chờ gửi" + nút Hủy (cao ≥44px); Hủy → mất và **không gửi** khi online lại. Xếp hàng ở A rồi chuyển sang B lúc offline (không hiện tin chờ của A ở B); online lại → **đúng 1** POST `/conversations/qa-conv-1/messages` body `{"content":"Tin chờ của khách A"}` dù đang mở B; không gửi trùng; banner câu chữ mới "Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng" hiện khi offline và mất khi online. (C, W). Mục >24h, đổi user, lỗi giữa chừng: chỉ có vitest (S), chưa e2e |
| 14 | Giao diện Tối | **PASS (phạm vi đã đo)** | Mọi viewport × engine: nền hiệu dụng của inbox, danh sách, hàng, ô tìm kiếm, thread, vùng tin, header thread, composer, ô soạn, sheet lọc/+/AI đều tối (độ sáng < 0,35); **không có khối nền sáng ≥ 6000 px²** trong inbox/thread, ≥ 3000 px² trong sheet +. Xem ảnh `C-shots/chat-*-dark-*.png`. **Chưa phủ:** bong bóng media (ảnh/video/tệp/sticker), menu ngữ cảnh, emoji picker, popup template/mention, dropdown đổi nick, lightbox, hộp xác nhận, Kho media |
| 15 | Bố cục / overflow | **PASS** | 320x568, 375x812, 390x844, 430x932, landscape 667x375 × Sáng/Tối × 2 engine (20 ca): `html/body/.m-shell/.m-main__scroll/.mobile-chat/.m-inbox/thread/messages/composer/.m-sheet` đều `scrollWidth ≤ clientWidth`; không phần tử nào lọt khỏi mép (trừ toolbar cuộn ngang chủ ý). Sheet lọc/+/AI nằm trọn trong viewport, nút "Áp vào nháp" trong màn hình |
| 16 | Composer sát đáy | **PASS** | Khoảng cách đáy composer ↔ đáy viewport = **đúng safe-bottom mô phỏng** ở cả 10 ca (34px dọc, 21px ngang; ví dụ 390x844: composerBottom 810, gap 34). Không còn khoảng trống ~120px; khe giữa vùng tin và composer ≤ 80px. Tabbar ẩn ở thread. **Chưa mô phỏng được bàn phím ảo** (VisualViewport thật) |
| 17 | Ô nhập / nút gửi, + | **PASS** | Ô soạn 16px, ô tìm kiếm inbox ≥16px; nút gửi và nút + ≥ 44×44; mọi nút trong header thread, composer, inbox (lọc, soạn mới, hàng), sheet ≥ 44px |
| 18 | 768 / 1024 / 1440 không dựng mobile | **PASS** | `/chat` ở 768x1024, 1024x768, 1440x900: không có `.m-shell`, `.m-tabbar`, `.mobile-chat`; `scrollWidth = clientWidth`. Không đánh giá độ dễ dùng của chat desktop ở 768 |
| 19 | Desktop 1440 không đổi | **PASS** | So pixel build worktree vs build `mobile/base` (7f322c3): `/`, `/contacts`, `/chat`, `/appointments` + **2 ca mới có dữ liệu**: `/chat` có 30 hội thoại và `/chat/qa-conv-2` mở thread đầy đủ (3 cột) — **0 pixel lệch** × 2 engine (12/12) |
| 20 | Khung đợt B không hồi quy | **PASS** | `shell.spec.ts` 138/138 sau các thay đổi `MobileTabBar`/`MobileLayout` của C |
| 21 | Thanh tab mới (nhìn bằng mắt + đo) | **PASS** | 320 / 390 / 430 × Sáng/Tối × 2 engine: nút giữa **60px** (56px ở ≤359px đúng `--m-fab-size`), nổi **22px** so với mép trên mục tab; nhãn "Hội thoại" nằm **dưới** nút nổi, không bị đè, không bị cắt; 5 nhãn không chồng nhau, không lọt mép. Ảnh `C-shots/tabbar-{320,390,430}-*.png` |
| 22 | `vue-tsc -b` | **PASS** | S |
| 23 | `vitest run` | **PASS** | S (431/431) |
| 24 | Keyboard test Safari / PWA iPhone thật | **CHƯA KIỂM** | Điều kiện của G2 — xem checklist §8 |

## 4. Lỗi, theo mức

Không có Critical.

**H-1 (High). Hộp xác nhận "Thay nháp hiện tại?" nằm dưới sheet AI — người dùng không bấm được.**
- File: `frontend/src/views/MobileChatView.vue:576-590` (`onApplyDraft`: `await confirm(...)` ở dòng 585 trong khi `aiOpen` vẫn `true`, mãi tới dòng 598 mới đóng sheet).
- Tái hiện: mở `/chat/qa-conv-2` ở 390x844 → gõ "Nháp dở" vào ô soạn → bấm ✨ → chờ gợi ý → bấm "Thay nháp hiện tại".
- Expected: hộp "Thay nháp hiện tại? / Giữ nháp / Thay nháp" nằm trên cùng và bấm được.
- Actual: hộp hiện (mờ) **phía sau** sheet AI; `document.elementFromPoint` tại tâm nút "Giữ nháp" trả về `.m-sheet__head`; Playwright báo `m-sheet__head … intercepts pointer events`. Người dùng phải tự đóng sheet mới thấy/bấm được hộp. Ảnh bằng chứng (Chromium 390x844): `C-shots/bug-H1-confirm-duoi-sheet-AI-390-chromium.png` — hộp "Thay nháp hiện tại?" nằm sau sheet "Gợi ý trả lời từ AI". Dựng lại bằng test `đã có nháp: hỏi xác nhận…` (fail ở Chromium và WebKit, thông báo "nút Giữ nháp của hộp xác nhận có bị sheet AI che không"). Chưa tra nguyên nhân z-index chính xác (đo được `.v-overlay` của sheet có `z-index: 2400`; hộp xác nhận nằm ở lớp thấp hơn hoặc cùng lớp nhưng xếp trước).
- Gợi ý (cho dev, QA không sửa): đóng sheet (`aiOpen.value = false`) trước khi `confirm`, hoặc nâng z-index của dialog xác nhận trên sheet. Ảnh hưởng: chỉ nhánh "đã có nháp" (nhánh thường vẫn dùng được).

**M-1 (Medium). API danh sách hội thoại lỗi 500 → inbox hiện "Chưa có hội thoại nào" (trạng thái rỗng) thay vì "Không tải được hội thoại" + Thử lại.**
- File: `frontend/src/views/MobileChatView.vue:350-354` (`inboxState` chỉ trả `loading | offline | ready`, không bao giờ trả `error`) và `frontend/src/composables/use-chat.ts:524-526` (`fetchConversations` nuốt lỗi bằng `console.error`, không có cờ lỗi). `MobileInbox.vue:50` đã sẵn nhánh `state === 'error'` nhưng không bao giờ được kích hoạt.
- Tái hiện: mock `GET /conversations` → 500, mở `/chat`. Expected: lỗi + Thử lại. Actual: "Chưa có hội thoại nào — Khi khách nhắn tin, hội thoại sẽ hiện ở đây." (báo rỗng giả, người dùng tưởng mất dữ liệu).
- Cần sửa ở `use-chat.ts` (file khóa) → **LOCK REQUEST** bên dưới.

**M-2 (Medium). Thread ở màn ngang gần như không đọc được.** 667x375: header 115px + thanh nick/phụ trách 27px + composer 113px = 255px chrome; vùng tin chỉ còn **120px (32%)** khi chưa bật bàn phím (đo bằng `boundingBox`). Ở 320x568 vùng tin 263px (46%), header riêng 165px. Ảnh `C-shots/chat-thread-landscape-667x375-*.png`. Gợi ý thiết kế: thu gọn chip header/ẩn toolbar khi landscape. Chưa đo khi có bàn phím thật (khả năng còn tệ hơn).

**M-3 (Medium). Toast che composer/nút gửi ở màn thread.** `frontend/src/layouts/MobileLayout.vue:192-198`: khi tabbar ẩn (thread), `--m-toast-bottom = 16px + safe`, trùng đúng vị trí composer (cao ~113px). Toast "Mất kết nối: tin sẽ tự gửi khi có mạng" và các toast lỗi upload đè lên ô soạn/nút gửi trong vài giây. Ảnh: `C-shots/chat-queue-offline-390-light-chromium.png`. Không mất chức năng nhưng chặn thao tác ngay lúc người dùng cần gửi lại.

**L-1 (Low). Placeholder ô soạn dài bị cắt dòng 2 ở 390px:** `Gõ tin nhắn... ("/" template, "@" mention, "#" tag)` xuống 2 dòng, dòng 2 bị clip ở đáy ô (`MessageThread.vue:2311+` `inputPlaceholder`; ảnh `C-shots/chat-thread-390-light-chromium.png`). Cosmetic.

**L-2 (Low). Sheet + không khóa phía client với nick Riêng tư của người khác.** `components/mobile/chat/conversation-model.ts:95-103` (`attachmentLockReason` không xét `privateNick` dù `buildConversationContext` đã có cờ). Người dùng chọn xong tệp mới nhận 403 PRIVACY_LOCKED (thông báo tiếng Việt đúng, backend vẫn chặn). Composer văn bản thì đã khóa. Trải nghiệm: khóa sớm kèm lý do sẽ tốt hơn.

**L-3 (Low, môi trường). WebKit desktop Windows: thanh cuộn cổ điển 10px làm bố cục inbox chạy hai pha** — hàng cao 113px khi chưa có thanh cuộn, 132px sau khi có (dòng nick/phụ trách xuống dòng), kéo theo WebKit neo lại `scrollTop` (+56px ở 7/12 lần chạy ban đầu). Không liên quan điều hướng; iOS dùng thanh cuộn nổi nên **không áp dụng**; test ẩn thanh cuộn để đo đúng. Cần xác nhận lại trên iPhone thật (cùng ghi chú L-2 của QA-B).

**L-4 (Low, UX). Header thread chiếm 22% màn ở 390x844** (191px; 3 hàng chip: Trống / Phân loại / Nick / AI tự tư vấn / Kết bạn) trước khi tới tin nhắn đầu tiên. Cùng hướng với M-2.

**L-5 (Info). Nút quay lại lấn trái 2px** (`.m-thread-back`, left = −2, rộng 44px, tâm chạm sát mép) — chủ ý, vẫn ≥44px; chỉ ghi nhận.

## 5. Hồi quy desktop 1440x900

Ảnh + số liệu: `docs/mobile-upgrade/qa/C-shots/desktop-regression/{tongquan,khachhang,chat,lichhen,chat-hoithoai,chat-thread}-1440-{base,shell}-{chromium,webkit}.png` và `*.json`. `diffPixels`, `exactDiffPixels`, `maxChannelDelta` đều **0** ở cả 12 ca; kích thước ảnh khớp. Bản base build từ checkout `mobile/base` (`7f322c3`) ra `%TEMP%\qa-base-dist-c`. Giới hạn: một cấu hình mock, một viewport (1440x900), giờ cố định; không phủ mọi trạng thái desktop (modal, popup, tab phụ).

## 6. Ảnh

Thư mục `docs/mobile-upgrade/qa/C-shots/` (Chromium + WebKit × 375/390 × Sáng/Tối):
- `chat-inbox-{375,390}-{light,dark}-{chromium,webkit}.png`
- `chat-thread-…`, `chat-composer-draft-…` (có nháp), `chat-sheet-plus-…`, `chat-sheet-ai-…`, `chat-pill-…` (Tin mới), `chat-queue-offline-…` (hàng đợi offline)
- `*-landscape-667x375-{light,dark}-{chromium,webkit}.png` cho inbox, thread, sheet +, pill
- `tabbar-{320,390,430}-{light,dark}-{chromium,webkit}.png` (thanh tab)
- `pairs/chat-{inbox,thread}-{375,390}-truoc-sau.png`: baseline đợt A | B Sáng | C Sáng/Tối Chromium | C Sáng/Tối WebKit (baseline/B chỉ có màn danh sách nên cột thread chỉ so được phần khung)

Ảnh chụp với safe-bottom mô phỏng 34px (dọc) / 21px (ngang) và thanh cuộn ẩn.

## 7. Mức bằng chứng (không nâng hạng)

| Hạng | Đã có | Ghi chú |
|---|---|---|
| Static (tsc, vitest, build, đọc code) | Có | 431 test |
| Chromium desktop | Có | Playwright, "Desktop Chrome" + `setViewportSize`; không emulate touch/DPR iPhone |
| WebKit desktop | Có | "Desktop Safari" (WebKit Windows), DPR 2. **Không phải iOS WebKit** |
| Safari iPhone thật | **CHƯA** | |
| Home Screen PWA iPhone | **CHƯA** | Đợt E |

**Chưa kiểm / không phủ được ở môi trường này:** bàn phím ảo và VisualViewport thật (composer có bị che, header thu gọn khi bàn phím mở, `100dvh` khi thanh Safari co giãn); notch/Dynamic Island/home indicator thật (chỉ mô phỏng biến `--m-safe-*`); chọn ảnh/chụp ảnh/quay video thật (HEIC từ camera, video lớn, quyền camera); khóa máy rồi quay lại app (socket chết, `online`, hồi phục hàng đợi); offline thật (chỉ `setOffline` của trình duyệt); vuốt-back Safari; xoay máy thật; bong bóng media (ảnh/video/tệp/sticker/lightbox) và các popup trong MessageThread ở giao diện Tối; trả lời/sửa/mention/reaction/chuyển tiếp; `/chat?compose=` và `/chat?contactId=`; hội thoại kênh không phải Zalo; chủ nick Riêng tư đã unlock; hàng đợi >24h/đổi user/lỗi giữa chừng (chỉ vitest); phân trang tin cũ (chưa có tính năng); `fetchAiConfig` khi AI tắt/hết lượt; Kho media với dữ liệu thật; hiệu năng danh sách dài (>100 hội thoại, tải thêm); VoiceOver; font hệ thống iOS và độ dài tên khách thật.

## 8. Checklist cần thử trên iPhone thật (Safari + Home Screen)

1. Mở `/chat` rồi chọn hội thoại: header không bị notch che; composer sát đáy, không bị home indicator che; khe dưới composer không còn khoảng trống ~120px (H-1/QA-A).
2. **Bàn phím:** chạm ô soạn → bàn phím mở: composer nằm trên bàn phím, không bị che; vùng tin còn đọc được (M-2); header thu gọn; bàn phím đóng lại → bố cục trả về, tabbar không nhảy; xoay ngang khi đang gõ; gõ tiếng Việt có dấu (Telex/VNI) không mất nháp; ô soạn không bị Safari zoom (≥16px).
3. Cuộn thread khi thanh địa chỉ Safari co giãn: không nhảy, không khoảng trắng.
4. **Chụp ảnh từ camera** (Nút + → Chụp ảnh) và **chọn ảnh HEIC từ thư viện**: kiểm file gửi lên là JPEG hay HEIC (nếu HEIC → có thông báo tiếng Việt, không treo); chọn nhiều ảnh; ảnh lớn.
5. **Video:** chọn 1 video từ thư viện và quay mới (MP4/MOV); thử video lớn gần 500MB trên mạng yếu; thông báo khi quá cỡ/415.
6. Tài liệu: PDF/DOCX/XLSX từ Tệp (Files); Kho media chọn ảnh/video có sẵn.
7. **Quay lại app sau khi khóa máy** (30 giây, 5 phút, vài giờ): banner "Mất kết nối realtime" xuất hiện rồi tự mất; danh sách và thread được tải bù; nháp còn (nháp chỉ trong RAM — kiểm khi iOS thu hồi tab/PWA thì nháp mất và có cảnh báo hợp lý hay không); "Tin mới ↓" hoạt động khi tin đến lúc màn hình tắt.
8. **Offline thật** (Chế độ máy bay): banner mới đúng chữ; gửi văn bản → "Đang chờ gửi" + Hủy; chuyển sang hội thoại khác; bật mạng → tin tự gửi **đúng khách lúc bấm**, không gửi trùng; nút + bị khóa kèm lý do; toast không che nút gửi (M-3).
9. Deep link: mở `/chat/<id>` từ thông báo/link ngoài (cold start) và từ icon Home Screen; nút back về `/chat`; vuốt-back Safari không rời app; đăng xuất → đăng nhập user khác: không còn nháp/bộ lọc/hàng đợi của user trước.
10. Sáng/Tối: chọn Tối, kiểm thread có bong bóng ảnh/video/tệp/sticker, menu ngữ cảnh, emoji picker, popup template, đổi nick, lightbox, hộp xác nhận, Kho media — không có khối sáng/chữ vô hình.
11. Privacy: nick Riêng tư của người khác → preview ẩn, composer khóa; chính chủ nhập PIN mở khóa → thấy nội dung.
12. Nhấn giữ/chạm thử mọi nút ≥44px bằng ngón tay (nút +, ✨, gửi, pill "Tin mới", Hủy, nút trong sheet).
13. Home Screen PWA (đợt E): lặp lại 1–9 ở chế độ standalone, kèm khóa máy và cập nhật SW khi đang có nháp.

## 9. LOCK REQUEST

**LOCK REQUEST: `frontend/src/composables/use-chat.ts` (+ nhẹ `MobileChatView.vue`, không khóa) — sửa M-1: lộ trạng thái lỗi của danh sách hội thoại.** Lý do: `fetchConversations` (dòng ~524) nuốt lỗi nên mobile không phân biệt được "rỗng" và "lỗi". Diff đề xuất (chưa áp dụng):
```diff
--- a/frontend/src/composables/use-chat.ts
+++ b/frontend/src/composables/use-chat.ts
@@ const loadingConvs = ref(false);
+  const convFetchError = ref(false);   // true khi trang đầu của danh sách tải lỗi; xóa khi tải thành công
@@ async function fetchConversations(...)
     try {
       const res = await api.get(inboxChannel.value === 'legacy' ? '/conversations' : '/channel-inbox', { params });
       if (requestVersion !== convRequestVersion) return;
+      convFetchError.value = false;
       ...
     } catch (err) {
-      if (requestVersion === convRequestVersion) console.error('Failed to fetch conversations:', err);
+      if (requestVersion === convRequestVersion) {
+        console.error('Failed to fetch conversations:', err);
+        convFetchError.value = true;
+      }
     } finally {
@@ return { ... }
+    convFetchError,
```
Và trong `MobileChatView.vue` (không khóa, dev đợt C tự áp): lấy `convFetchError` từ `useChat()` và thêm vào đầu `inboxState`: `if (convFetchError.value && conversations.value.length === 0) return 'error';` (nhánh `error` + `@retry="onRetryInbox"` đã có sẵn trong `MobileInbox.vue:50-57`). Desktop không bị ảnh hưởng vì không đọc cờ mới.

Đề xuất không phải lock: H-1 (sửa trong `MobileChatView.vue:576-600`), M-3 (`MobileLayout.vue:192-198`), L-1/L-2 (dev đợt C).

Tồn đọng từ đợt B (đã có trong `package.json`: `test:e2e`, `test:e2e:regression`; `.gitignore` đã bỏ qua `frontend/test-results/` và `frontend/playwright-report/`) — không còn LOCK REQUEST nào cho hai file này.

## 10. Cách chạy lại
```
cd frontend
npx vue-tsc -b && npx vitest run && npm run build
npx playwright test e2e/chat.spec.ts e2e/chat-realtime.spec.ts      # WebKit + Chromium, vite preview :4174 trên dist của worktree
npx playwright test e2e/shell.spec.ts                                # hồi quy khung đợt B
BASE_DIST=<dist build từ mobile/base> npx playwright test e2e/desktop-regression.spec.ts
npx playwright test e2e/chat-shots.spec.ts && npx playwright test e2e/make-pairs-c.spec.ts --project=chromium
```
Khi H-1/M-1 được sửa, 4 test hiện đang fail (`lỗi máy chủ: không hiện "rỗng" giả`, `đã có nháp: hỏi xác nhận…` × 2 engine) phải chuyển xanh mà không cần đổi test.
