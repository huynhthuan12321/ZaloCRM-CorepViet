# 13 — Skill GitHub đã áp dụng & đội subagent triển khai iPhone

<!-- F5 candidate status -->

## Tách F5 thành candidate chính thức — 10/11/2026

- Worktree `F:\ZaloCRM-wt\f5`, nhánh `mobile/f5-sale-filter`, merge-base với `mobile/base` đúng `269d8a3`. Cherry-pick không commit rồi bỏ phụ thuộc chế độ fixture; chọn Sale dùng quyền role/RBAC thật. Không đổi API/backend.
- npm ci exit 0, lockfile không đổi; vue-tsc 0 lỗi; toàn bộ Vitest 64 file, 708/708; build PASS; F5 Chromium và WebKit 10/10 PASS. Fixture API tạm có rào host DB TEST, development và health; đã dọn, còn 0 bản ghi.
- Desktop 1440×900 đóng Sale exact 0 pixel lệch; mở Sale ngoài vùng popover và bóng exact 0 trên cả hai engine. Giữ clipping header khi mở Sale để không đổi bóng badge riêng tư.
- Tài liệu/ảnh mới ở `qa/F5-sale-filter/`. Giới hạn backend Chưa giao không ánh xạ null giữ nguyên. Chưa merge candidate vào base, không push/deploy.


Ngày 07/11/2026. Kế thừa tài liệu 01–12 (audit 29/10). File này chuyển kế hoạch 07/09 thành cấu hình chạy được trong Claude Code.

## 1. Hiện trạng dự án (tóm tắt)

- Frontend Vue 3.5 + Vuetify 4 + Pinia + Vite 8; đã có `MobileLayout.vue`, `BottomNav.vue`, `MobileChatView.vue`, `MobileContactView.vue`, `use-mobile.ts` (breakpoint 768).
- Báo cáo mobile (đợt 5A/5B ngày 02/11) đã làm; chat/khách hàng/lịch hẹn/tổng quan mobile mới ở mức wrapper.
- Vấn đề chính còn lại (theo 02/06/08): chiều cao `100vh`/72px cứng → composer dễ bị bàn phím che; MobileChatView ép AI = null (mất parity); toggle dark/light không có theme thật; BottomNav chưa lọc quyền; PWA service worker đang tắt (`main.ts:22`), icon sai kích thước; OfflineIndicator hứa "tự gửi" khi chưa có outbox.
- **Rủi ro git:** working tree đang có khoảng 360 thay đổi chưa commit (backend TikTok, reports…). Phải commit/tách nhánh trước khi chạy đội agent.

## 2. Skill đóng gói trong `claude-setup/skills/` (pin commit, chỉ markdown, MIT) → cài vào `.claude/skills/` bằng `claude-setup/install.bat`

| Skill | Nguồn @commit | Dùng cho |
|---|---|---|
| corepviet-mobile-contract | **viết riêng cho dự án** | Chuẩn chung: tokens, lock file, ranh giới logic, định nghĩa xong. Mọi agent nạp đầu tiên |
| vue-best-practices | vuejs-ai/skills @198f0cd | Composition API/TS, data flow, composable, cleanup |
| vue-router-best-practices | vuejs-ai/skills @198f0cd | Deep link `/chat/:convId`, back, guard |
| vue-pinia-best-practices | vuejs-ai/skills @198f0cd | Store, reactivity |
| vue-testing-best-practices | vuejs-ai/skills @198f0cd | Vitest, Vue Test Utils, Playwright |
| vue-debug-guides | vuejs-ai/skills @198f0cd | Debug lỗi runtime Vue |
| mobile-ux-optimizer | curiositech/some_claude_skills @d47e2e5 | Safe-area, dvh, touch, gesture, nav (ví dụ React → dịch sang Vue) |
| interface-design | Dammyjay93/interface-design @2f9be32 | Hierarchy, states cho CRM/dashboard |
| web-design-guidelines | vercel-labs/agent-skills @1a2c79d + guidelines @434b7f9 | Review UI; **đã sửa để đọc bản quy tắc pin cục bộ** thay vì tải mạng mỗi lần |
| progressive-web-app | sickn33/antigravity-awesome-skills @828257c | Manifest, SW, iOS quirks (viết cho JS thuần → agent áp vào vite-plugin-pwa) |

Không cài: ui-ux-pro-max (chạy script Python, trùng design system đã chốt), mobile-ios-design (SwiftUI), các skill React/shadcn/Tailwind. design-system (Anthropic) có thể thêm sau nếu cần audit token.

## 3. Đội subagent (`claude-setup/agents/` → `.claude/agents/`)

| Agent | Model | Skill nạp sẵn | Được sửa |
|---|---|---|---|
| mobile-architect | inherit | contract, vue-best, router, pinia | `docs/mobile-upgrade/contracts/**` |
| mobile-shell-dev | sonnet | contract, mobile-ux, vue-best | MobileLayout, BottomNav, `components/mobile/shell`, `use-mobile-viewport`, mobile-tokens.css |
| mobile-chat-dev | sonnet | contract, vue-best, router, mobile-ux | MobileChatView, `components/mobile/chat` |
| mobile-crm-dev | sonnet | contract, interface-design, vue-best, pinia | MobileContactView, `components/mobile/crm`, `views/mobile` |
| mobile-pwa-dev | sonnet | contract, progressive-web-app, vue-best | manifest, icon, index.html, `src/pwa` |
| mobile-qa | sonnet | contract, vue-testing, vue-debug | `frontend/tests/mobile`, `docs/mobile-upgrade/qa` |
| mobile-ui-reviewer | sonnet | contract, web-design-guidelines, interface-design, mobile-ux | Chỉ đọc |

Orchestrator = session chính, chạy bằng lệnh **`/mobile-sprint <đợt>`** (`claude-setup/commands/mobile-sprint.md`). Shared files (main.ts, App.vue, router, use-chat, MessageThread, package.json, vite.config…) chỉ orchestrator sửa qua LOCK REQUEST.

Luồng mỗi đợt: architect freeze contract → dev (tối đa 3 song song, mỗi agent một worktree) → ui-reviewer → qa → orchestrator merge.

## 4. Cách chạy (Claude Code trên Windows, trong `F:\ZaloCRM-CorepViet`)

0. Chạy `claude-setup\install.bat` một lần (copy skills/agents/commands vào `.claude`).
1. Commit hoặc tách các thay đổi hiện có, rồi `git switch -c mobile/base`.
2. Mở Claude Code tại thư mục dự án → gõ `/agents` để thấy 7 agent; `/skills` (hoặc hỏi "liệt kê skill") để thấy 10 skill.
3. `/mobile-sprint A` → baseline + contract. Duyệt contract.
4. `/mobile-sprint B` → shell. Sau đó `C` (chat) và `D` (CRM) có thể chạy song song, rồi `E` (PWA).
5. Test iPhone thật sau mỗi gate: Safari + Add to Home Screen, bàn phím, xoay ngang, khoá màn hình rồi mở lại.

Lưu ý gói Pro: mỗi subagent tốn quota riêng; chạy 3 dev song song sẽ hết lượt nhanh. Nên chạy tuần tự B → C → D nếu bị giới hạn.

## 5. Quyết định cần chủ dự án

- Cho phép thêm `@playwright/test` (devDependency) để QA chạy WebKit hay chỉ dùng vitest + kiểm tay.
- Có bật lại service worker (đợt E) không, và phiên bản iOS tối thiểu.
- Pilot cho nhóm sale nào; Web Push có làm hay tách dự án (backend hiện chỉ có FCM native).

## 6. Nhật ký đợt

| Ngày | Đợt | Kết quả | Ghi chú |
|---|---|---|---|
| 07/11/2026 | Chuẩn bị | Đóng gói 10 skill + 7 agent + lệnh /mobile-sprint trong `claude-setup/` | Chưa sửa code ứng dụng; chủ dự án chạy install.bat |
| 07/11/2026 | A | Contract freeze: `contracts/CONTRACT-A.md`, `PARITY.md`, `OWNERSHIP.md`. Baseline QA: `vue-tsc -b` 0 lỗi, vitest 161/161 pass, 15 ảnh baseline (`qa/baseline-shots/`) | Base `2608eb6`. Bằng chứng: đọc code tĩnh + Chromium emulation có mock API; chưa WebKit/iPhone thật. Không sửa `frontend/src` |
| 07/11/2026 | A (duyệt) | Chủ dự án duyệt D-1…D-14 (CONTRACT-A §12.1) | D-6 khác đề xuất: giữ tự gửi khi có mạng (rào chắn §3.5); D-3/D-14 chỉ mobile; Đã thêm `@playwright/test` ^1.65.0 (devDependency) + WebKit/Chromium; tsc 0 lỗi, vitest 161/161 sau khi cài |
| 07/11/2026 | B | Khung mobile trên `mobile/shell` (worktree `F:\ZaloCRM-wt\shell`, base `9f228c7`): MobileLayout mới, tabbar 5 mục + nút Hội thoại nổi + badge, `/account`, Sáng/Tối/Theo máy lưu theo user, viewport/safe-area, toast mobile. Reviewer: CẦN SỬA nhẹ → đã sửa 12/12. QA G1: ĐẠT (Chromium + WebKit desktop). Lần chạy lại cuối: tsc 0 lỗi, vitest 302/302, build OK, e2e 138/138 + desktop 1440 lệch 0 pixel (8/8) | LOCK đã áp: router `/account`, vuetify `hsDark`, ReportMobile spec, package.json script e2e, NotificationBell aria-label, .gitignore. Chưa Safari iPhone thật. Tối chưa phủ Tổng quan/Chat/Lịch hẹn (đợt C/D). Không phát hành riêng B trước C (chat còn 100vh). Chưa commit/merge |
| 08/11/2026 | C | Chat pilot trên `mobile/chat` (worktree `F:\ZaloCRM-wt\chat`, base `7f322c3`): tinh chỉnh tabbar (nút 60px nổi 22px), MobileChatView viết lại (viewport, /chat/:convId, back giữ lọc/cuộn, 1 useChat, nháp RAM theo hội thoại, "Tin mới ↓", AI chỉ "Áp vào nháp", sheet + 5 lựa chọn, nick + phụ trách +N, Tối), hàng đợi offline 6 rào chắn. Reviewer: CẦN SỬA (H1 AI nhầm khách, H2 Tối Kho media) → đã sửa. QA G2 lần 1: KHÔNG ĐẠT (confirm bị sheet đè, inbox lỗi hiện "rỗng") → đã sửa. Chạy lại cuối: tsc 0, vitest 450/450, build OK, e2e 238/238 (shell 138, chat 84, realtime 4, desktop 1440 12/12 lệch 0 pixel) | LOCK: C-1 ChatView→DesktopChatView (nguyên văn), C-2 use-chat-attachments, C-3/C-4 MessageThread (chỉ khi prop mobile), C-5 use-chat `convFetchError`, vitest alias @ee. Chưa Safari iPhone thật (G2 cần keyboard test thật). Còn sáng ở Tối: dialog Tạo nhắc hẹn. Chưa commit/merge |
| 09/11/2026 | Hotfix ngang | `mobile/hotfix-landscape` (worktree `F:\ZaloCRM-wt\hotfix-landscape`, base `7f3874a`): mobile = rộng < 768 HOẶC (rộng < 1024, cao ≤ 500, cảm ứng, không hover); một nguồn trong `use-mobile.ts`, CSS dùng nguyên văn (có test); `#app` min-width bằng cascade; không tự focus ô soạn ở mobile; header/tabbar gọn khi ngang; Lịch hẹn hẹp ở mobile. Reviewer: CẦN SỬA → đã sửa. QA: ĐẠT. Cuối: tsc 0, vitest 471/471, build OK, e2e 294 (vòng 2) + 250 (vòng 3), desktop 1440 + iPad 0 pixel ở lần chạy đầy đủ; WebKit có nhiễu 2–8 px cả ở base-vs-base | Vòng 3: nút tròn 48px khi ngang (không đè nhãn). Chưa iPhone/iPad thật. Chưa commit/merge |
| 09/11/2026 | D (chốt tiếp tục) | Giữ phần CRM/settings đã có, hoàn tất filter Chưa trả lời, sửa owner picker, confirm lịch, target/font/dark editor và responsive tổ chức. TypeScript0; Vitest605/605,0errors; buildOK; e2e chức năng140/140; pixel bắt buộc1440/1024:24/24 exact0. Pixel phụ768: một case2px ở lượt35/36, rerun1/1 exact0, control1/1 exact0 | LOCK D-4 đã được chủ dự án duyệt trực tiếp09/11, orchestrator thực hiện. Không KNOWN_OPEN, không threshold24. Ba mục F giữ nguyên. Báo cáo14_D_HANDOFF_REVIEW.md và qa/QA-D-G3.md. Chưa iPhone thật; chưa commit/merge |


## Chủ dự án duyệt và yêu cầu tích hợp đợt D — 09/11/2026

Chủ dự án đã DUYỆT đợt D và cho commit toàn bộ phần D trên `mobile/crm` với message:
`feat(mobile): dot D - Tong quan, Khach hang, Ho so, Lich hen, khung Cai dat mobile`.
Loại khỏi commit: `test-results/`, `playwright-report/`, profile trình duyệt và `.env*`; JSON baseline chỉ khác xuống dòng được trả về bản gốc.
Sau commit, chỉ dùng `git merge --ff-only mobile/crm` tại `F:\ZaloCRM-CorepViet` (`mobile/base`). Nếu merge bị chặn thì dừng; không tự stash/reset hoặc ghi đè thay đổi local. `mobile/base` đang có thay đổi local ở MobileChatView từ môi trường test iPhone, nên chưa xác nhận tích hợp hoặc kiểm thử sau merge tại thời điểm ghi mục này. Kết quả kiểm thử đợt D trước tích hợp vẫn là 605/605 Vitest, build/TypeScript qua; chi tiết QA trong QA-D-G3.md.
Không push. Kết quả merge và kiểm tra sau tích hợp được báo trực tiếp sau lệnh thực hiện, không giả định đã thành công.


## Tích hợp đợt D và chính sách nhánh test iPhone — 09/11/2026

- Đợt D đã fast-forward từ `mobile/crm` vào `mobile/base`, commit `45b0fea`.
- Kiểm tra lại ngay trên checkout chính sau merge: `vue-tsc -b` 0 lỗi; Vitest 53 file, 605/605 pass; `npm run build` PASS. Không chạy backend hoặc gửi tin thật để kiểm tra này.
- `dev/iphone-test` là nhánh phát triển môi trường TEST LOCAL, **KHÔNG BAO GIỜ merge vào mobile/base hoặc production**. Các cờ mock, banner, endpoint và seed test chỉ tồn tại ở nhánh này.
- Worktree test riêng: `F:\ZaloCRM-wt\iphone-test`. Backend/frontend phục vụ iPhone phải chạy từ worktree này, không chạy từ checkout mobile/base.
- Sau mỗi đợt mobile mới, cập nhật bằng `git -C F:\ZaloCRM-wt\iphone-test rebase mobile/base`. Nếu xung đột MobileChatView, giữ cả chức năng mobile đã duyệt (ví dụ lọc Chưa trả lời) lẫn banner/khóa iPhone-test; chạy lại test trước khi thử máy thật.
- `.env.iphone-test` lấy từ checkout chính và không commit. Không dùng dữ liệu/nick Zalo thật, không tự deploy migration, không push.
- Các thay đổi VPS/public API và artifacts chưa commit vẫn giữ trong checkout chính; không đưa vào commit nhánh test hoặc commit nhật ký này.

- 09/11/2026: Chủ dự án đã thử đợt D trên iPhone thật — **ĐẠT**.


## Tích hợp hotfix ngày khách hàng desktop — 09/11/2026

- Chủ dự án đã DUYỆT hotfix. Commit `35abe1a` trên `hotfix/contact-date-shift` gồm đúng ContactDetailDialog.vue, helper contact-date-fields.ts, hai file test và docs/ops/CONTACT-DATE-SHIFT-REVIEW.md; không có .env hoặc test output.
- `release/hotfix-20261108` được fast-forward từ `afeea4a` lên `35abe1a` sau khi kiểm ancestor; không push, chưa deploy.
- Cherry-pick vào `mobile/base`: `c5d7034`. Không có xung đột ContactDetailDialog/mobile; source riêng của mobile giữ nguyên, không cần giải quyết thủ công chỗ nào.
- Kiểm lại frontend trên mobile/base: vue-tsc -b 0 lỗi; Vitest 55 file, 618/618 PASS; npm run build PASS (chỉ cảnh báo chunk >500 kB).
- `dev/iphone-test` tại F:\ZaloCRM-wt\iphone-test đã rebase thành công lên mobile/base chứa hotfix, không xung đột; giữ bộ lọc Chưa trả lời và banner/khóa TEST LOCAL. Nhánh này chỉ để test, KHÔNG BAO GIỜ merge vào base/production.
- 3.034 file công việc khác đang dirty/untracked được đối chiếu SHA256 trước/sau tích hợp: nguyên vẹn. Không stash/reset, không sửa dữ liệu cũ hoặc truy cập VPS/database production.
- Kiểm tra dữ liệu cũ/sửa dữ liệu và deploy vẫn cần chủ dự án duyệt riêng. Chi tiết nguyên nhân/giới hạn trong docs/ops/CONTACT-DATE-SHIFT-REVIEW.md.

## Đợt E — tiếp tục và bàn giao soát (10/11/2026)

`mobile/pwa` tại `F:\ZaloCRM-wt\pwa`, base3ae82c4/HEADdf9d9cf: giữ nguyên auth đã duyệt; hoàn tất rào update sau xóa nháp bàn phím với observer +6 test DOM. Reviewer độc lập chỉ delta: MERGE ĐƯỢC/không finding chặn. QA:63 file Vitest705/705, vue-tsc0, buildPASS, E2E32/32 đúng Chromium+WebKit, desktop1440 12/12 exact0. Có đóng tiến trình rồi mở cùng profile offline. Sửa harness engine và profile Windows ngắn; không dùng lượt WebKit chạy nhầm Chromium làm bằng chứng. Tunnel -PrepareOnly build source chưa commit pwa thành công; không cần rebase vì ghép trực tiếp candidate. Chưa bật tunnel ở lượt tiếp tục, chưa iPhone thật. **CHƯA COMMIT PWA, CHƯA MERGE/PUSH/DEPLOY**. Chi tiết `qa/QA-E-G4.md`, `pwa/REVIEW-E.md`, `pwa/IPHONE-TUNNEL.md`; ảnh `qa/E-shots/`.

## Đợt E — chủ dự án duyệt iPhone thật (10/11/2026)

**E đạt iPhone thật 10/11/2026** — chủ dự án xác nhận đã thử iPhone thật ổn và duyệt tích hợp.
Giữ nguyên commit auth `df9d9cf`; commit phần PWA trên `mobile/pwa`, fast-forward
`mobile/base` bằng `--ff-only`, kiểm tra vue-tsc/Vitest/build tại base, rồi rebase
`dev/iphone-test` lên base mới. Không đưa test output, profile trình duyệt hay `.env`
vào commit. Không push; nhánh `dev/iphone-test` chỉ để test, không merge.


## Tích hợp F5 đã duyệt — 10/11/2026

- Chủ dự án DUYỆT F5. Tại `F:\ZaloCRM-CorepViet`, `mobile/base` đã fast-forward bằng `git merge --ff-only mobile/f5-sale-filter` từ `269d8a3` tới `3d9c4ef`, không có merge commit.
- Kiểm tra ngay tại frontend mobile/base: vue-tsc -b 0 lỗi; toàn bộ Vitest 64 file, 708/708 PASS; production build PASS. Output kiểm tra nằm ngoài repository.
- `dev/iphone-test` đã rebase lên base mới, không xung đột. Bỏ commit F5 bản test `547d1fb` theo duyệt vì nội dung chính thức đã có trong base. Các commit môi trường TEST LOCAL, seed hai nick và tunnel được giữ lại. Ref local `backup/iphone-before-f5-20261110` lưu trạng thái trước rebase.
- Giữ riêng điều kiện không chọn nhân viên trong chế độ iPhone mock ở MobileChatView, vì inbox mock không hỗ trợ assignedUserId; base chỉ dùng quyền RBAC thật. Nhánh test sau rebase kiểm lại vue-tsc 0 lỗi và Vitest 64 file, 708/708 PASS.
- Ghi nhật ký bằng commit riêng trên base rồi cập nhật nhánh test lên cả commit nhật ký. Giữ nguyên các thay đổi có sẵn ngoài phạm vi tích hợp. Không push, không deploy. Nhánh test vẫn không được merge vào base/production.


## F1 — cài đặt cấp 2, candidate đang kiểm (10/11/2026)

- Worktree thủ công `F:/ZaloCRM-wt/ext`, nhánh `mobile/ext`, base và merge-base bằng `mobile/base @ bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`. `npm ci` thành công. Không đụng thay đổi có sẵn ở checkout chính.
- Dev → reviewer độc lập ba vòng → QA độc lập. Reviewer vòng3: MERGE ĐƯỢC có điều kiện QA; main sửa cả Medium phòng ban/users403 và Low pointercancel. Shared file do main tích hợp theo `qa/F1-settings/LOCK-REQUESTS.md`.
- F1: tài khoản tên/ảnh, đọc cấu hình thông báo, tổ chức, thẻ/sheet nhân viên với controller gốc, trạng thái/nhãn, Sáng/Tối. Phân quyền/phòng ban/Audit/scoring/tích hợp đọc được; sửa nặng dùng máy tính. Gộp/đếm lại nhãn dùng máy tính.
- QA phát hiện và main sửa: confirm cold-load dưới sheet; Hủy bỏ qua dirty; màu/chạm/chiều cao overlay; Safari trả focus về thẻ. Main đối chiếu `ZaloAccountsView` phát hiện wizard internal-contact đã bị khóa từ CEO-review trước đây; bỏ phục hồi wizard, chỉ GET cấu hình hiện có và hướng dẫn quản trị. `InternalContactSetupPage.vue` trả nguyên HEAD, không thay API/backend/quyền/payload.
- Agent QA và reviewer bổ sung vòng4 bị giới hạn quota429 trước khi kết luận. Main tiếp tục chạy bộ test do QA chuẩn bị, không ghi nhận vòng4 review độc lập đã đạt. Kết quả cuối cập nhật `qa/F1-settings/QA-F1.md`; chưa iPhone thật/VoiceOver.
- F2/F3/F4/F6 chưa bắt đầu; báo riêng F1 trước. Chưa commit, chưa merge/push/deploy.

- F1 kiểm cuối trên candidate: vue-tsc0, toàn bộ Vitest68 file/758 PASS, buildPASS, E2E212/212 (Chromium+WebKit:116 luồng,32 ma trận,64 ảnh). Desktop1440 32/32 exact0, tablet32/32 exact0. Main chạy lại sau agent QA bị quota; reviewer độc lập delta sau QA chưa hoàn tất. Báo cáo `qa/F1-settings/QA-F1.md`; chưa đủ gate merge.
- Đối chứng ảnh base-vs-base cuối6/6 exact0; git diff --check PASS. Bàn giao candidate, chờ reviewer độc lập delta mới; dừng trước F2.

## F1 — chủ dự án duyệt làm mốc (10/11/2026)

Chủ dự án xác nhận Claude đã soát desktop giữ nguyên, wizard thông báo vẫn khóa, không API mới; DUYỆT commit F1 trên mobile/ext, chưa merge mobile/base. Commit chỉ mã nguồn/test và tài liệu, loại output QA/ảnh/profile/.env. Sau mốc này làm gộp F2+F3, reviewer mới; chưa commit F2/F3, không merge/push/deploy.

## F2 + F3 — phát triển sau mốc F1 (10/11/2026)

- F1 đã commit `50db984ade40460be2ff21d043f62f5d4a15520d`, message `feat(mobile): F1 - trang cai dat cap 2 tren mobile`. Chỉ source/test/docs; ảnh/output QA F1 giữ ngoài commit. `mobile/base` chưa đổi (`bcd220d`).
- User duyệt gộp F2 + F3, dùng skill corepviet-mobile-contract (ưu tiên) → Vue/interface-design/mobile-ux. Dev phiên mới; reviewer độc lập mới sau dev; QA sau reviewer.
- Main dựng baseline F1 bằng git archive trong `C:/Users/Public/f2f3-baseline-50db984`, build thành công; node_modules junction dùng dependency đã có. Không .env/profile/output trong commit.
- LOCK REQUEST được main đọc và tích hợp: router wrapper theo useMobile giữ view desktop nguyên DOM, use-mobile-nav (Friends thuộc Account, title Marketing), MobileChatView truyền tên khách/phụ trách vào sheet; MobileLayout Back nhóm Khác luôn về Account. Chi tiết proposed/applied trong QA report cuối.
- Main bắt thiếu sót dev trước review: F3 cần đọc dữ liệu thật, không intro-only; F2 cần hủy gửi khi đích đổi trước xác nhận, loại mục đã gửi khi partial fail, reset loadingMore khi đổi filter, focus trap viewer, target44, giữ tab Khối. Đang sửa; chưa ghi PASS cho QA.
- F2/F3 chưa commit, chưa merge/push/deploy. Không thay backend/API/auth/socket; không VPS/DB production. F4/F6 chưa làm.

- Reviewer mới vòng1: PASS có điều kiện Community; main yêu cầu sửa cử chỉ video, feedback khi chọn quá trần, focus, search scan-members, gửi album một phần và mất mạng giữa chuỗi. Dev sửa, main thêm lifecycle cancellation khi confirm còn mở sau unmount và test không gọi API.
- Reviewer độc lập delta MỚI: SOURCE DELTA PASS Community, không finding chặn (typecheck0, test liên quan131). Main áp thêm LOW: lời báo413 không dùng giới hạn attachment sai,409 nói đúng nick archived, toast nếu nhận confirm sau khi rời kho. `qa/F2-F3/REVIEW-1.md`, `REVIEW-DELTA.md`, `LOCK-APPLIED.md` lưu evidence review.
- QA độc lập đang chạy typecheck/full Vitest/build/Chromium+WebKit; baseline desktop/tablet dùng50db984, mọi API fixture giả. Chưa kết luận số pixel hay iPhone thật. F3 EE chưa chứng nhận (repo `_ee` không có), care-sessions403 mất status bởi composable gốc được ghi PARITY.

- QA độc lập chạm giới hạn lượt sau khi bàn giao spec/fixture; main tiếp quản. Main sửa tương phản vùng chọn Tối, focus mở viewer trên Safari, và ghi LOCK REQUEST cho gutter scrollbar MobileLayout (lỗi10px tái hiện ở cả F1). Không thay API/payload/MediaTabPanel. Reviewer bổ sung không chạy được do quota, không ghi PASS giả cho delta QA.
- Lượt kiểm cuối sau các sửa: vue-tsc0, Vitest73 file/852 PASS, buildPASS; chức năng Chromium+WebKit111 PASS/1 CDP-only skip; ma trận28 trạng thái ×6 kích thước ×2 theme ×2 engine =672/672 PASS, toàn bộ số đo overflow/touch/input/Tối/contrast không lỗi. Source app được băm cố định trong manifest ngoài repo, không đổi trong lượt test.
- Gate ảnh desktop1440/tablet exact0 vẫn đang tổng hợp; không lấy source desktop giữ nguyên làm chứng cứ thay cho số pixel. Báo cáo cuối: `qa/QA-F2-F3.md`. F2/F3 chưa commit, mobile/base không đổi, không push/deploy; F4 chưa bắt đầu.
- Suite ảnh chính kết thúc54 PASS/8 FAIL, nên gate0 CHƯA ĐẠT: Chromium1440 media24/detail3/docs56/list-detail8/chat-media28; Chromium768 media13/friends10; WebKit1440 chat-media3984 (focus composer). Các ca còn lại0; tablet1024 cảhai9/9. Đối chứng F1 cũng có nhiễu raster nhưng không dùng làm lý do nới gate. Bàn giao trạng thái chưa đủ gate, không ghi đã hoàn thành QA độc lập hay đủ điều kiện tích hợp. Suite main bổ sung ghi riêng ở báo cáo cuối.
- Suite ảnh bổ sung kết thúc49 PASS/5 FAIL, WebKit27/27 exact0, Chromium22/27; kiểm scrollbar/clock cuối2/2 PASS. Không còn tiến trình kiểm cuối đang chạy. `QA-F2-F3.md` ghi đầy đủ gate chưa đạt và giới hạn. Giữ HEAD50db984, F2/F3 chưa commit; mobile/base bcd220d, không merge/push/deploy, dừng trước F4.

## Ch?t hai ?i?u ki?n F2/F3 ? 10/11/2026

- Reviewer ??c l?p M?I ?? ch?y ???c, PASS Community source cho delta h?u QA;180 test li?n quan PASS, kh?ng finding ch?n. LOW/INFO v? gi?i h?n ghi nguy?n v?n `qa/F2-F3/REVIEW-POST-QA.md`.
- Ch?y114 c?p: m?i8 c?nh c?3 C F1?F1 +3 R F1?F2/F3; th?m18 c?p cho3 c?nh v?48 c?p ki?m so?t chuy?n origin b?ng hai server c?ng dist F1. Kh?ng ??i CSS/source app, kh?ng mask/n?i ng??ng; blur composer v? ch? focus BODY tr??c ?nh chat.
- B?ng s? pixel/maxDelta/t?a ?? trong `qa/QA-F2-F3.md`:7 c?nh Chromium c? ??i ch?ng c?ng m?c/v?ng raster, kh?ng c? t?p sai kh?c ch? c?p th?t l?p xuy?n l??t; WebKit chat-media t?t c?0 sau blur. Kh?ng bi?n assertion kh?c0 th?nh PASS exact0.
- ?? hai ?i?u ki?n ch? d? ?n giao ?? commit F2/F3 tr?n mobile/ext theo message ?? duy?t. B? output/profile/.env v? file InternalContactSetupPage ch? ??i cu?i d?ng. Kh?ng merge mobile/base, kh?ng push/deploy; d?ng tr??c F4.


## F4 + F6 — lượt sau68edf81, 10/11/2026

- Làm trên `F:/ZaloCRM-wt/ext`, `mobile/ext`; HEAD xuất phát `68edf81c241ece787ed5c4722167c15a077443ed`; merge-base/mobile-base giữ `bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`. Không đụng nhánh test/release/VPS/DB production.
- Skill corepviet-mobile-contract → vue-best-practices. Dev F4 phiên riêng, main tích hợp key/prop trên MessageThread theo `qa/F4-F6/LOCK-APPLIED.md`, làm F6 và xử lý review. Không đổi API/backend/auth/socket/dependency/CSS/payload gửi tin.
- Reviewer độc lập vòng1 phát hiện race404 cũ và watcher modelValue/context session; main sửa + test. Reviewer2 PASS source. Reviewer3 MỚI kiểm delta lỗi message-only + các sửa main, PASS không Critical/High/Medium,80 test liên quan đạt. Reviewer4 MỚI soát harness production clipboard/contextmenu/markup và pixel, PASS-WITH-NOTES, chỉ LOW; main tăng kiểm B markup độc lập.
- Main QA: vue-tsc0, toàn bộ Vitest77 file/877 PASS, buildPASS. Chromium+WebKit26/26 đạt: RAM A/B/gửi/reload, raw format/mention, reply/edit tách hội thoại, mobile D-7 smoke, profile403/404/500 và conflict code/message Sáng/Tối trên mobile/desktop. Chưa ghi iPhone thật.
- Backend read-only: POST appointments có409 cụ thể; PUT `appointment-routes.ts:316`→`:337` thiếu guard trùng, ghi làm hotfix riêng. Contact scope cố ý404 tại `contact-routes.ts:484`/`:2649`, không suy đoán403.
- Đối chứng ảnh desktop1440 đang chốt, tất cả output/ảnh/profile/.env ở ngoài commit. Log và kết quả từng lượt tại `qa/QA-F4-F6.md`; chưa commit trước khi QA chốt. Chưa merge mobile/base; không push/deploy.

- QA độc lập MỚI đã PASS với ngoại lệ nhiễu được kiểm bằng PNG/JSON và đối chứng baseline. `qa/F4-F6/QA-AUDIT.md` giữ báo cáo gốc; QA-F4-F6 đính chính các lỗi đếm nhỏ, không sửa verdict gốc. Chat-empty vẫn có FAIL exact0; mọi tọa độ ngoài row đã tái hiện trong controls, không nới ngưỡng/mask/CSS. Profile/appointments toàn ảnh0; WebKit đổi nháp ngoài row0; Chromium13px/max1 trùng đúng control. Bộ source giữ nguyên hash từ bản build.
- Đủ điều kiện reviewer + QA theo đối chứng nhiễu; commit candidate theo message chủ dự án giao. Giữ test pixel có assertion0 và ghi rõ ngoại lệ, không trình bày suite pixel toàn xanh. Không đưa output/profile/.env hay InternalContactSetupPage đổi cuối dòng vào commit; không merge/push/deploy, dừng sau báo cáo.

## Release mobile — đối chiếu IMAGE thật 11/11/2026

- Nhánh `release/mobile-20261111`, sau merge `805116f`; chỉ sửa worktree release. Không đổi mobile/base, mobile/ext hay dev/iphone-test; không push/deploy. VPS chỉ đọc file build qua SSH transport của runner đã kiểm, không chạy phase cũ có ghi dữ liệu, không DB/API production.
- Xác nhận container `zalo-crm-app` chạy đúng image `85c6a6ba` trước/sau đọc; lấy527file build và checksum local.211file static khớp byte baseline production. Backend fullAuto/policy, tenant SDK/scoring, Prisma Decimal/JSON-null đều có thật trong image, giữ nguyên. App nền khớp image, chỉ thêm header PWA đã duyệt.
- Phát hiện follow-up timeout image60giây/source30giây: phục hồi60. Loại nút “Xem báo cáo AI” snapshot ngoài mobile; giữ dropdown kênh production, không rail. Tách patch tham khảo ngoài Git; snapshot đúng là `4cd20b7`, không phải `4cd220b7`.
- Kiểm toàn bộ316module runtime sau căn chỉnh:314khớp,2khác chỉ unassigned/PWA; thêm helper PWA. Migration0, grep rào iPhone trong frontend/src+backend/src0. Cập nhật từng14quyết định trong RELEASE-MOBILE.md, phân biệt code mobile đã duyệt/chưa có trong image, code ngoài phạm vi đã loại, docs/test không đóng gói.
- QA cuối: vue-tsc0, Vitest877/877, buildPASS; backend tsc0,1199PASS/9FAIL/24skip so baseline1149PASS/9FAIL/24skip, cùng39fileFAIL và0case/fileFAIL mới;97test liên quan và12GET/HEADdist thật đạt. E2E253PASS/1skip, ma trận704/704, F5chức năng8/8; hồi quy shell/realtime/CRM254/254 sau sửa selector F1/harness SW, không sửa app. PWAChromium15/15+WebKit15/15.
- Ảnh hai kiểu chạy local bằng static image/mobile3e029c5+fixture giả, test dropdown/rail/dropdown3/3. Desktop pixel vẫn **CHƯA ĐẠT**: expanded78PASS/42FAIL, collapsed25PASS/11FAIL; F5 thật11032pixelChromium/10827WebKit. Media raster bổ sung có đối chứng;3pixel chat-media cũ chưa được controls bao phủ hết, không tuyên bố exact0 sạch. Giữ ngưỡng0, không mask/CSS. Chi tiết và ảnh tại RELEASE-MOBILE.md, raw output/profile/patch ngoài Git.


## Chốt F5 trước phát hành — 11/11/2026

- Chủ dự án chọn (a): sale thường chỉ Khách của tôi trên desktop/mobile. Main sửa guard đồng bộ ID chính mình trước query đầu, làm sạch localStorage cũ và chặn preset/reset/URL làm lệch scope; admin/quản lý giữ lựa chọn. Không đổi backend/auth/API/payload.
- Sửa layout đúng F5: danh sách nhân viên vào popover, giữ Sale cao127,5px; các mục dưới không dịch. Sale thường một lựa chọn giữ ba hàng qua grid. Test F5 Chromium+WebKit32/32; unit frontend891/891, vue-tsc0, buildPASS.
- Pixel cuối120/120, che đúng Sale không padding/union: phần sidebar còn lại0, trang còn lại0 ngoài composerF4 đã duyệt; PNG decoder độc lập khớp120/120. Ba tọa độ raster cũ mỗi điểm3C+3R đều0, cả6cặp toàn trang0. Không nới ngưỡng, không sửa CSS để chụp; harness ghim hồ sơ thật tránh timer5giây và dùng renderer cố định.
- PWA cuối30/30 khi chờ redirect ổn định; hai lượt cũ WebKit503 recovery29/30 được giữ và ghi giới hạn race phục hồi sớm trong RELEASE-MOBILE.md, không coi đã sửa ứng dụng. Không đổi auth/router/PWA. Test cũ độc lập trên build trướcF5 đạt1/1, chưa đủ kết luận tần suất.
- Toàn bộ số liệu cuối, giới hạn và bảng pixel tại RELEASE-MOBILE.md §14–15; raw outputs/profile/.env ngoài Git. Không push/deploy/VPS, không đưa lại rail/nút báo cáoAI/timeout30giây; các nhánh base/ext/iphone-test giữ nguyên.
