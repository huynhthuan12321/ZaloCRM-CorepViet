# Chuẩn bị release mobile — 11/11/2026

**CHỈ CHUẨN BỊ. Chưa deploy, chưa push. Đã đọc file build trong container production theo yêu cầu ngày 11/11/2026; không sửa VPS, không truy cập DB production.**

Nhánh `release/mobile-20261111`, worktree `F:\ZaloCRM-wt\release-mobile`.
Tạo từ production `release/hotfix-20261108 @ c4a3e4e`, merge đúng
`3e029c51d459831980940970522b3632949a0294` vào nhánh release.
Không merge release ngược vào mobile/base. `mobile/base` hiện có thêm nhật ký
`e3dbce9`; không tự mở rộng commit ứng dụng được yêu cầu.

Trạng thái kiểm thử cuối và các điều kiện còn mở nằm ở phần kết quả bên dưới.
Việc chuẩn bị này không phải giấy phép deploy.

## 1. Identity và chênh lệch lịch sử

- Production branch đầu vào: `c4a3e4e` (đã có hotfix lọc “Chưa giao sale”).
- Image production theo chủ dự án và nhật ký vận hành:
  `sha256:85c6a6bafd06eb85a7eed25c5daaa047c19494a46ba5df7e0030c86ec064b573`.
  Hotfix `c4a3e4e` chưa có trong image này.
- Mobile application đầu vào: `3e029c5` (đợt E, F5, F1/F2/F3/F4/F6).
- Merge-base hai đầu vào:
  `eb1be0bce8f60858436b98370f3c517edcb041b7`.
- Kiểm lịch sử thực tế có **17 commit production chưa là ancestor của mobile**
  (gồm cả nhật ký), thay vì giả định 11. Giữ nguyên ancestry của toàn bộ 17 commit.
- Snapshot `4cd20b7` có nhiều nội dung trùng các bản vá production và hàng nghìn
  artifact lịch sử. Không lấy snapshot thay cho production và không đưa thư mục
  artifact vào Docker context. `.dockerignore` allowlist production giữ nguyên.
- Không dùng `dev/iphone-test` làm nguồn, không rebase hoặc merge nhánh test trong lượt này.

## 2. Kiểm lại 14 quyết định theo image đang chạy

Nguồn quyết định runtime là **file build đọc trực tiếp trong container**, không suy
ra từ commit/nhật ký. `ours` của merge ban đầu là `c4a3e4e`, `theirs` là `3e029c5`.
Chưa có image mới được triển khai. “Code chưa từng chạy production” trong bảng
dưới nghĩa là **không có trong image đang chạy được kiểm lần này**; không suy ra
lịch sử mọi image trước đó khi không có bằng chứng.

| # / Mục | Production có? | Quyết định | Lý do / phân loại |
|---|---|---|---|
| 1. `docs/reports-fix/09-vps-background-tenant-remediation-20261107-1511.md` | Tài liệu không nằm trong image | Giữ bản production | Khớp hồ sơ git production; không gắn nhãn “khớp image” cho tài liệu không được đóng gói. Runtime tenant được kiểm riêng ở §3. |
| 2. `docs/reports-fix/09-vps-cutover-20261107-093609.md` | Tài liệu không nằm trong image | Giữ bản production | Khớp hồ sơ git production; giữ rollout/smoke/observer đã ghi. Không dùng tài liệu làm bằng chứng thay checksum. |
| 3. `docs/reports-fix/README.md` | Tài liệu không nằm trong image | Giữ bản production | Khớp hồ sơ git production; không có tác động ứng dụng. |
| 4. `frontend/src/assets/airtable.css` | Có desktop/fractional-width; chưa có breakpoint điện thoại ngang mới | Giữ desktop + phần mobile đã duyệt | Khớp image production ở desktop; phần ngang là code chưa từng chạy production, thuộc mobile B–D đã duyệt. |
| 5. `frontend/src/assets/report-kit.css` | Có desktop/fractional-width; chưa có breakpoint ngang mới | Giữ desktop + phần mobile đã duyệt | Khớp image production ở desktop; breakpoint mobile là code chưa từng chạy production trong phạm vi đã duyệt. |
| 6. `frontend/src/components/BottomNav.vue` | Chưa có 5 tab mới | Giữ mobile đã duyệt | Code chưa từng chạy production, thuộc đợt B; desktop không mount component này. |
| 7. `frontend/src/composables/use-mobile.dom.spec.ts` | Test không đóng gói | Giữ test mới | Code kiểm thử chưa từng chạy production, chỉ chạy local/CI; kiểm dọc/ngang/fractional-width. |
| 8. `frontend/src/composables/use-mobile.ts` | Có truy vấn dọc cũ; chưa có điện thoại ngang mới | Giữ mobile đã duyệt | Phần mới là code chưa từng chạy production của đợt B; giữ phần bù `not all and (min-width: 768px)` của production. |
| 9. `frontend/src/composables/use-report-compact-navigation.ts` | Có cùng hành vi/query compact | Giữ dùng hằng số chung | Khớp image production về điều kiện `(min-width: 768px) and (max-width: 1099px)` và vòng đời menu; chỉ thay literal bằng hằng số. |
| 10. `frontend/src/layouts/DefaultLayout.vue` | Có | Giữ desktop | Khớp image production; delta với source production chỉ là chú thích CSS. |
| 11. `frontend/src/layouts/MobileLayout.vue` | Chưa có shell mới | Giữ shell mobile đã duyệt | Code chưa từng chạy production thuộc B–F: safe area, theme, nav/back. |
| 12. `frontend/src/router/index.ts` | Có guard/quyền cũ; chưa có route adapter mobile mới | Giữ guard production + route mobile đã duyệt | Phần mobile là code chưa từng chạy production thuộc B/F1/F2/F3; desktop vẫn render component cũ. |
| 13. `frontend/src/views/ChatView.vue` | Có chat desktop cũ; chưa có wrapper mới | Giữ wrapper mobile/desktop | Wrapper là code chưa từng chạy production thuộc C. Desktop giữ **dropdown của image**, F4/F5 đã duyệt; rail snapshot đã loại. |
| 14. `frontend/src/views/reports/ReportMobile.dom.spec.ts` | Test không đóng gói | Giữ test menu 5 tab | Code kiểm thử chưa từng chạy production; xác nhận Báo cáo nằm trong Tài khoản, giữ RBAC. |

Danh sách phần mới trong 14 quyết định: **4, 5, 6, 7, 8, 11, 12, 13, 14**.
Trong đó mục7 và mục14 là test; các phần runtime mới còn lại thuộc mobile A–F đã được chủ
dự án duyệt. Không coi chúng là backend production có sẵn. Mục 9 là đổi biểu diễn
cùng truy vấn; mục 10 chỉ comment; 1–3 chỉ tài liệu. Không cần chủ dự án duyệt lại
mobile đã duyệt; các nội dung snapshot ngoài phạm vi được tách riêng ở §3.4.

### Desktop: ảnh từ hai build, không dùng dữ liệu khách thật

Đã chạy chính frontend `/app/static` lấy từ container bằng preview cục bộ,
mock toàn bộ API/socket bằng dữ liệu giả. 211/211 file public static khớp từng byte
với baseline dựng từ `c4a3e4e`, nên baseline git trước đó có căn cứ image trực tiếp.
Đây là ảnh **build production với fixture giả**, không phải ảnh dữ liệu đang vận hành.

- Production: dropdown `<select aria-label="Chọn hộp thư">`; cả JS và CSS
  `ChatView-*` **0** chuỗi `.smax-channel-rail`.
- Mobile `3e029c5`: rail dọc, chỉ render khi `/channel-accounts` trả `available:true`.
- Release: giữ dropdown/grid của production; không đem rail snapshot vào release.
- Fixture chụp bật `available:true` giống nhau cả ba build, viewport1440×900,
  Chromium, cùng thời gian cố định; không sửa CSS/DOM để tạo kiểu giao diện.

Ảnh local ngoài Git (đã xem trực tiếp):

1. `F:/ZaloCRM-wt/release-mobile-qa/image-audit-20261111/screenshots/production-image-dropdown.png`
2. `F:/ZaloCRM-wt/release-mobile-qa/image-audit-20261111/screenshots/approved-mobile-rail.png`
3. `F:/ZaloCRM-wt/release-mobile-qa/image-audit-20261111/screenshots/release-dropdown.png`

Spec `frontend/e2e/image-desktop-proof.spec.ts`: 3/3 PASS, xác nhận rail count0/1/0.

## 3. Backend đối chiếu file build của IMAGE ĐANG CHẠY

### 3.1 Bằng chứng đọc trực tiếp (A)

Lúc **11/11/2026 11:01:57 giờ Việt Nam** (`04:01:57Z`), container
`zalo-crm-app`, ID `ae0d0b625466ad3823aba974089bca924e136eee9dcc07a2bfc52bff66289c42`,
đang chạy image
`sha256:85c6a6bafd06eb85a7eed25c5daaa047c19494a46ba5df7e0030c86ec064b573`.
Image/container/running/startedAt **không đổi trước và sau khi đọc**.

Dùng đúng SSH identity/host-key/BatchMode của runner đã kiểm trong
`artifacts/messaging-fix-20261108/tools/remote.mjs`; xác minh SHA256 `remote.py`
`6a9321bab629894bf34cc5e071106f9a51228ea99f13affeda0f2d57feea332c`
và helper production
`e0d123717f3fa4ad2456514cde418185ec43fd60343a0bce45e9c8c0deeeac84`.
**Không chạy phase cũ** vì có bước ghi evidence/deploy/smoke. Adapter riêng chỉ
`docker inspect` và `docker exec node` đọc filesystem bằng `fs.readFileSync`,
không import app, không chạy job/API/DB, không ghi file VPS.

Đọc **527 file / 12.912.801 byte**: 316 module JavaScript backend và211 file
static public. Không lấy `.env`, cấu hình runtime bí mật, uploads hay dữ liệu khách.
Receipt/hash gọn được lưu tại
`docs/mobile-upgrade/qa/RELEASE-IMAGE-AUDIT-20261111.json`; receipt toàn bộ/hash
từng file và bytes gốc ở thư mục evidence local, ngoài Git.

| Mục | Production có? | Quyết định | Lý do trực tiếp từ build |
|---|---|---|---|
| A1. `ai-send-policy` / `fullAuto` | **CÓ** | Giữ — **khớp image** | File image có nhánh `if (fullAuto !== true)`; true bỏ kiểm giá/chốt đơn nhưng vẫn bắt buộc sources. JS release chỉ thêm2comment, không đổi executable. |
| A2. `ai-auto-reply-service` đi kèm | **CÓ** | Giữ — **khớp image** | Truyền `aiCfg.aiAutoReplyFullAuto` / `latestAiCfg.aiAutoReplyFullAuto` vào2chỗ gọi policy; checksum JS bằng release. |
| A3. `sdk-limit-service` | **CÓ** | Giữ — **khớp image** | Image có `getTenantContext` và kiểm nick/org trong tenant trước xử lý; checksum JS bằng release. |
| A4. `prisma-client` | **CÓ** | Giữ — **khớp image** | Image có `Object.getPrototypeOf` trả nguyên giá trị không plain, bảo toàn Decimal/JSON-null; checksum JS bằng release. |
| A5a. scoring `auto-tag` | **CÓ** | Giữ — **khớp image** | Toàn bộ JS bằng release, gồm scope discovery/hydrate trong tenant. |
| A5b. scoring `backfill-cron` | **CÓ** | Giữ — **khớp image** | Toàn bộ JS bằng release, không chỉ đối chiếu tên hàm. |
| A5c. scoring `stuck-detection` | **CÓ** | Giữ — **khớp image** | Toàn bộ JS bằng release. |
| A6. `app.js` nền production | **CÓ**, đúng bản git `c4a3e4e` | Giữ nền image; thêm PWA đã duyệt | Image app.js bằng byte bản production compile; release chỉ thêm import/hook header và tránh SPA fallback cho file PWA. Không có thay đổi app ngầm khác. |
| Ngoài A: timeout AI follow-up | **60 giây**, không phải30giây | Đã đổi release30→60 — **khớp image** | `FOLLOWUP_TIMEOUT_MS = 60_000` đọc từ image; không đưa giá trị30chưa chứng minh production vào release mobile. |
| Hotfix `assignedUserId=unassigned` | **CHƯA CÓ** | Giữ thay đổi được duyệt | Image còn gán chuỗi thẳng; release chuyển sentinel sang NULL, giữ scope/RBAC. |
| Header PWA | **CHƯA CÓ** | Giữ thay đổi được duyệt | Hook/header là thay đổi chủ dự án giao trong chuẩn bị phát hành; xem §4. |

“Có fullAuto” ở đây chứng minh **code/công tắc đã được đóng gói**, không khẳng định
setting của tổ chức cụ thể đang bật: không đọc DB/settings khách trong lượt này.
Không có mục backend A1–A5 nào phải tách do vắng trong image.

### 3.2 Đóng chênh lệch toàn bộ backend (D)

Compile source release và so **tất cả316module** với image, chuẩn hóa CRLF/LF,
bỏ comment bằng TypeScript printer (vẫn giữ SHA256 bytes gốc để kiểm):

- **314/316 module runtime khớp image** sau khi phục hồi timeout60giây.
- Chỉ2module cũ khác executable: `app.js` (PWA) và
  `modules/chat/chat-routes.js` (hotfix unassigned).
- Module runtime mới duy nhất: `shared/http/frontend-static.js` (PWA).
- `ai-send-policy.js` khác bytes do2comment, executable khớp.
- 4file có CRLF trong comment: channel-event-processor, ai-report-service,
  report-scope, probe-host; chuẩn hóa xuống dòng thì bằng byte, không đổi logic.
- Tsc còn emit test `modules/contacts/zalo-profile-capture.test.js` từ source
  đã có trước mobile (`8664567`), không import bởi app. Đây là chênh lệch đóng gói
  test lịch sử, không phải backend mới hay tác vụ startup; không tự xóa test để xanh.

So với git `c4a3e4e`, source vẫn có7file A1–A5 và follow-up60giây khác;
**không được xóa chúng** vì đã chứng minh image đang có. Không dùng git cũ thay
runtime image khi build đầy đủ.

### 3.3 Migration và rào test

`git diff c4a3e4e -- backend/prisma/` **0 file**; không migration/schema/SQL mới.
Không migrate/db push, không kết nối DB production.
Grep `iphoneTest|iphone-test|IPHONE_TEST` ở `frontend/src` và `backend/src`: **0**.
Không lấy nhánh test làm nguồn; không sửa mobile/base, mobile/ext hay dev/iphone-test.
Hotfix ngày khách `35abe1a` giữ nguyên ContactDetailDialog/helper; giữ RC4/RLS,
Redis/reconnect/readiness và `.dockerignore`/Dockerfile production.

### 3.4 Phần ngoài mobile không có trong image — tách để chủ dự án quyết riêng

| Mục | Production có? | Quyết định release này | Lý do |
|---|---|---|---|
| Rail dọc `.smax-channel-rail` | Không | **LOẠI**, giữ dropdown production | Snapshot `4cd20b7`, không thuộc mobile A–F; ảnh hai kiểu ở §2. |
| Nút “Xem báo cáo AI” trong `views/settings/AiAssistantPage.vue` | Không | **LOẠI**, file trở về đúng source production | Delta frontend snapshot ngoài mobile; không cần để chạy mobile. |
| Timeout follow-up30giây | Không; image là60giây | **LOẠI** giá trị30, giữ60của image | Cần quyết riêng nếu muốn giảm timeout, không đổi ngầm trong release mobile. |
| F5 desktop Sale mở rộng | Chưa có trong image | Giữ F5 đã duyệt; **gate pixel còn mở** | Nội dung mới thuộc F5, không phải nhiễu; khác ngoài composer khi sidebar mở. Không tự sửa thiết kế hoặc tuyên bố pixel0. |

Hai delta frontend snapshot đầu đã lưu thành patch tham khảo ngoài Git tại
`image-audit-20261111/excluded-snapshot-changes.patch`; giá trị timeout30được ghi
riêng trong patch đó. Không mang patch vào image, không áp lên nhánh khác.
Commit snapshot thực là **`4cd20b719213cab38998efb12ee59f3437a6b7d4`**
ngày07/11/2026 15:30:36+07, không có object `4cd220b7` trong repo này.
Các mục bị loại không bị xóa khỏi lịch sử mobile; chỉ không nằm trong cây source release.

## 4. Phục vụ PWA trên production

`docker/Caddyfile` chỉ reverse_proxy tới app, không tự serve static hoặc ghi đè
header cache của app. Vì vậy đặt chính sách tại Fastify là thay đổi nhỏ nhất.

| URL | Cache-Control | Content-Type |
|---|---|---|
| `/sw.js` | `no-cache` | `application/javascript; charset=utf-8` |
| `/pwa/kill-sw.js` | `no-cache` | `application/javascript; charset=utf-8` |
| `/pwa/control.json` (kể cả query) | `no-store` | `application/json; charset=utf-8` |
| `/`, `/index.html`, SPA deep link | `no-cache` | `text/html` |

Đường dẫn điều khiển PWA không tồn tại trả JSON 404, không trả index.html 200.
File upload `/files` vẫn dùng chính sách riêng hiện có; không thay cache media.
Kiểm thêm **dist build thật** qua Fastify/static và production header hook: **12/12 PASS**
(GET/HEAD cho worker/control/kill/index/root/deep-link), receipt `actual-dist-static.json`.
Test dùng Fastify/static thật, GET và HEAD, có cả missing-file/API-404 và SPA fallback.
Header qua Caddy/TLS thực tế phải kiểm lại sau deploy trong lượt được duyệt riêng; lượt này chỉ đọc file build container, không sửa VPS.

## 5. Lịch sử kiểm sau đối chiếu IMAGE (đã thay bằng §15)

Số liệu lịch sử lượt đối chiếu image; kết quả hiện hành ở §15. Log cũ giữ nguyên ngoài Git,
không xóa FAIL. Bản cuối đã bỏ nút báo cáo AI snapshot, giữ timeout60giây của
production. Toàn bộ source ứng dụng frontend/backend khớp manifest trong suốt
lượt QA cuối; không sửa CSS/logic gửi để chụp.

| Kiểm | Kết quả | Giới hạn / bằng chứng |
|---|---|---|
| Frontend vue-tsc | **0 lỗi** | Chạy lại sau loại nút AI. |
| Frontend Vitest | **77 file / 877 PASS / 0 FAIL** | Full suite. |
| Frontend build | **PASS**,256precache file | Dist cuối tại `image-audit-20261111/final-dist`. |
| Backend tsc | **0 lỗi**, cả release và baseline | Compile thật để so module image; không boot app/DB. |
| Backend full suite | **1199 PASS / 9 FAIL / 24 skip**,1232case | Baseline **1149 PASS / 9 FAIL / 24 skip**,1182case. Cùng39fileFAIL; **0file/caseFAIL mới**, đối chiếu tên từng lỗi. Không thay con số đo bằng “10FAIL lịch sử”. |
| Backend liên quan | **10 file / 97 PASS / 0 FAIL** | Unassigned, channel scope, fullAuto, tenant, sentinel, readiness,14static tests. |
| Header trên dist thật | **12/12 PASS** | GET/HEAD worker/control/kill/index/root/deep-link qua Fastify/static thật. |
| E2E F1/F2/F3/F4/F6 | **253 PASS / 0 FAIL / 1 skip** | Chromium+WebKit; skip CDP chỉ Chromium. API/socket giả. |
| E2E ma trận F1/F2/F3 | **704 PASS / 0 FAIL / 0 skip** | Chromium+WebKit320/375/390/430;844×390,932×430;Sáng/Tối. F1 thêm393/402. |
| E2E F5 chức năng | **8 PASS / 0 FAIL / 0 skip** | Query/back/reload, admin/sale/quản lý và scope; pixel kiểm riêng bên dưới, không bỏ kiểm pixel. |
| E2E shell/realtime/CRM | **254 PASS / 0 FAIL / 0 skip** | Các luồng B–D được chạy lại trên build cuối, mock hoàn toàn. |
| PWA thật trên build cuối | **30 PASS / 0 FAIL / 0 skip** | Chromium15/15,WebKit15/15; profile ngắn mới `C:/p/rm14`, không instrumentation SW. |
| Hai kiểu desktop + release | **3 PASS / 0 FAIL / 0 skip** | Static image thật, mobile3e029c5,release; fixture `available:true`; dropdown/rail/dropdown. |
| Desktop pixel expanded | **78 PASS / 42 FAIL / 0 skip** | 3C+3R/cảnh/engine,10cảnh,ngưỡng0. **F5 khác thật, gate CHƯA ĐẠT**. |
| Desktop pixel collapsed | **25 PASS / 11 FAIL / 0 skip** | 3C+3R×3cảnh×2engine; chỉ lưu lựa chọn thu sidebar thật, không CSS/mask. |
| Media đối chứng bổ sung | **1 PASS / 5 FAIL / 0 skip** | Giữ assertion0; nhiễu raster đã có cùng pixel/mức trong controls, xem §12. |
| Chat-media collapsed bổ sung | **3 PASS / 3 FAIL / 0 skip** | Ba C+ba R mới; không dùng để xóa FAIL cũ, xem giới hạn3pixel ở §12. |

Không có migration mới; grep môi trường test ở src **0**. Không push/deploy/
sửa VPS. Không dùng mock như chứng nhận Zalo thật, DB thật hay iPhone thật của
**nhánh release đã hợp nhất**.

Receipt tổng hợp có thể đọc bằng máy, giữ ngoài Git:
`F:/ZaloCRM-wt/release-mobile-qa/image-audit-20261111/final-qa-summary.json`.
Các lần gọi harness sai đường dẫn (`No tests found`) được lưu riêng, không tính
thành PASS; đã chạy lại đúng config trên build cuối. Hồi quy B–D cũ được cập nhật
4selector `.account-page` → `.crm-ap` theo F1, giữ nguyên kiểm back/deep-link.
Lượt cũ có WebKit502 vì service worker lấy request ra ngoài page.route; đã dừng,
giữ log và chạy lại đầy đủ254ca với `serviceWorkers:'block'`. Đây là sửa harness
mock, không sửa ứng dụng; PWA thật vẫn được kiểm riêng30/30. Không chạy lại test khi
không có thay đổi hoặc bất định cần giải quyết.

## 6. Build image đầy đủ — chỉ thực hiện trong lượt được duyệt riêng

Không dùng lại cách overlay `/app/static` của hotfix ngày khách: lần này có đổi
backend (hotfix chưa giao + header PWA) và phải bảo toàn các source overlay đã nêu.

1. Chốt commit release, worktree sạch và danh sách build input. Không build từ
   checkout mobile/base đang có thay đổi khác. Không đưa `.env`, profile, test output,
   seed iPhone hoặc artifact lịch sử vào context.
2. Đối chiếu build-time Marketing flags với cấu hình production đã duyệt;
   Dockerfile mặc định Enterprise/Broadcast/Sequence=false và dry-run=true.
   Không tự bật tính năng bằng cờ thử nghiệm.
3. Build từ root bằng Dockerfile đầy đủ; ví dụ chuẩn bị:

   ```sh
   docker build -f docker/Dockerfile \
     --label org.opencontainers.image.revision="<EXACT_RELEASE_COMMIT>" \
     --build-arg VITE_MARKETING_ENTERPRISE_ENABLED=false \
     --build-arg VITE_BROADCAST_ENABLED=false \
     --build-arg VITE_SEQUENCE_ENABLED=false \
     --build-arg VITE_MARKETING_DRY_RUN=true \
     -t zalo-crm-rc:mobile-20261111 .
   docker image inspect zalo-crm-rc:mobile-20261111
   docker save -o mobile-20261111-image.tar zalo-crm-rc:mobile-20261111
   sha256sum mobile-20261111-image.tar
   ```

   Giá trị flag ở ví dụ là mặc định an toàn; chỉ dùng sau khi so với bộ flags
   production đã được phép. Ghi image Docker ID/digest, platform, source commit,
   lockfile hashes, build flags và archive checksum vào receipt.
4. Node production là 22-alpine theo Dockerfile. Kiểm image cô lập trước khi đưa
   lên VPS: không có môi trường test, đúng static/PWA, đúng schema130/RLS103 source,
   đúng runtime entrypoint và inventory script. Dockerfile không chạy migration khi start.
5. Backend stage hiện dùng `npm install` theo Dockerfile production; đây là giới hạn
   reproducibility có sẵn. Không âm thầm đổi lock/dependency trong release này.
   Giữ build log + inventory/image checksum và kiểm actual image trước rollout.

Không có image mới được build/import/push lên VPS trong lượt chuẩn bị này. Đã đọc image đang chạy theo §3, không thực hiện mutation.

## 7. Quy trình deploy dự kiến theo runner đã kiểm

Nguồn quy trình đã đọc cục bộ:

- `artifacts/reports-vps-cutover-prep-20261107-093609/inputs/production-runner-reviewed.py`,
  helper SHA256 `e0d123717f3fa4ad2456514cde418185ec43fd60343a0bce45e9c8c0deeeac84`.
- Runner messaging được ghi tại
  `artifacts/messaging-fix-20261108/OPERATIONS.md`, SHA256
  `6a9321bab629894bf34cc5e071106f9a51228ea99f13affeda0f2d57feea332c`.
- Runner ngày khách được ghi tại
  `docs/reports-fix/10-vps-contact-date-hotfix-20261109.md`, SHA256
  `8a121d017461f6f47840c0ef81784b06c2221444cf093879747f71da77e2b691`.

**Không chạy lại nguyên runner cũ**: chúng pin parent/image/state/container lịch sử.
Runner đợt mobile phải là bản riêng, đổi identity và bước build/import sang full image,
giữ nguyên body deploy/smoke/open/rollback/observe đã kiểm; review và pin SHA mới
trước khi chạy. Không coi review runner cũ là review xong bản thích nghi mới.
Không dùng generic `scripts/ops/deploy.sh` thay thế: script đó có fetch/checkout và
Compose rollout khác chuỗi container-preserving đã nghiệm thu.

Trình tự cho lượt triển khai riêng:

1. Duyệt commit/image digest và runner SHA. Preflight chỉ đọc xác nhận image cũ
   chính xác 85c6a6ba, healthy, restart ổn, DB/Redis và nick connected, guard=enforce,
   RLS_SET_CONFIG=true, app role không superuser/bypass/owner. Kiểm migration
   ledger hiện hữu (hồ sơ trước là 130/0 unfinished/103 FORCE+ENABLE RLS);
   khác dự kiến thì dừng, không tự migrate/sửa role.
2. Kiểm đủ dung lượng cho full image, old image, backup và logs. Không prune image
   rollback/volume/evidence để “vượt gate”. Snapshot Env/User/ports/mount/network/
   resources và route Caddy vào thư mục private, quyền0700; không in secret ra Git/log công khai.
3. Import archive đã checksum, xác minh image ID/platform/entrypoint. Build xong
   trước maintenance; không thay đổi DB/Redis/guard/runtime key.
4. Backup DB mới bằng `pg_dump -Fc` của đúng DB hiện hữu, ghi vào file private,
   kiểm exit code, size và SHA256; kiểm khả năng đọc TOC (`pg_restore --list`).
   Backup config/env/media theo quy trình ops riêng; không đưa dump vào repo.
   Chưa thực hiện backup production trong lượt này.
5. Maintenance riêng route CRM; clean-stop app cũ, giữ container cũ với tên
   riêng cho đợt mobile và image85c6a6ba. Tạo app mới giữ nguyên runtime settings,
   network/mount/role/keys; chỉ thay image. Không restart hoặc recreate DB/Redis.
6. Chờ healthy/readiness rồi chạy **đúng smoke15/15** bên dưới. Giữ maintenance
   nếu lỗi; xem log private. Chờ tuổi startup ít nhất70giây, kiểm lỗi nền rồi mới mở route.
7. Sau mở route, quan sát public TLS/health/ảnh đúng bundle, DB/Redis/nick và logs
   **ít nhất360giây tính từ thời điểm OPENED**, mỗi30giây. Chốt cuối khi smoke15/15,
   observer không thêm tenant/RLS/fatal errors, restart không tăng và runtime/mount
   không đổi. Không dùng thời gian bắt đầu request hoặc thời gian build thay elapsed sau mở.
8. Ghi receipt/source/image/runner/backup/old-container/OPENED timestamp và số đo cuối.
   Chỉ khi được duyệt mới dọn tài nguyên owned của chính đợt; giữ rollback image/container.

Smoke15/15 của reviewed helper:

| # | Kiểm |
|---|---|
| 1 | DB credential runtime đúng app role, không superuser/bypassRLS. |
| 2 | Truy vấn contacts không tenant context trả 0. |
| 3 | TENANT_GUARD_MODE=enforce và RLS_SET_CONFIG=true. |
| 4–9 | `/health/live`, `/health/ready`, `/`, `/login`, `/reports-co-ban`, `/reports/tong-quan`: 200. |
| 10–11 | Hai route báo cáo `/reports-co-ban`, `/reports/tong-quan` có Content-Type HTML. |
| 12–13 | `/api/v1/reports/contacts`, `/api/v1/analytics/team-performance`: 401 khi không đăng nhập. |
| 14 | POST `/api/v1/channel-accounts/tiktok`: 404. |
| 15 | `/api/v1/__release_unknown__`: 404. |

Kiểm bổ sung mobile/PWA ngoài15check: GET/HEAD headers ở mục4, manifest/icons,
đăng nhập, quyền sale/admin, chưa giao đúng nick, nháp A/B, 403/404 profile,
offline khóa gửi media, update khi còn nháp, kill-switch. Gửi tin thật cần lựa chọn
hội thoại và sự đồng ý cụ thể của chủ dự án; không tự gửi để “smoke”.

## 8. Rollback về 85c6a6ba và tắt PWA khẩn cấp

Rollback là đổi app/image, **không restore DB** vì release không migration.
Không tắt guard/RLS, đổi role, đổi key hoặc chạy db push để phục hồi.

- Giữ maintenance, dừng/giữ app mới, khôi phục đúng container cũ đã giữ ở bước7,
  xác minh image ID đầy đủ `85c6a6bafd06eb85a7eed25c5daaa047c19494a46ba5df7e0030c86ec064b573`.
- Chờ healthy + startup≥70giây; smoke15/15 rồi mới mở; quan sát≥6phút như deploy.
- Không chạy lệnh rollback trong runner ngày09/11 nguyên trạng: nó rollback về
  0600cdff, **không phải target85c6a6ba của đợt mobile**.
- PWA có thể giữ shell cũ sau khi rollback server. Chuẩn bị **route khẩn riêng
  tại cùng origin**, phục vụ `{"enabled":false,"version":1}` ở
  `/pwa/control.json` với `Cache-Control:no-store` và JSON MIME.
- Đồng thời phục vụ **nội dung** `frontend/public/pwa/kill-sw.js` tại
  **URL gốc `/sw.js`**, `Cache-Control:no-cache`, JavaScript MIME, scope `/`.
  Không chỉ phục vụ `/pwa/kill-sw.js` rồi đăng ký worker ở scope `/pwa/`.
  Worker khẩn skipWaiting, xóa cache CRM sở hữu, unregister; không xóa token,
  cache ứng dụng khác hoặc chủ động reload nháp.
- Image85c6a6ba chưa có các file PWA mới: override điều khiển/worker phải được
  giữ độc lập với image app khi rollback, kể cả trong maintenance CRM. Khi viết
  runner/route khẩn ở lượt sau, đặt route exact PWA trước route maintenance/proxy;
  kiểm không bị trang maintenance HTML503 hoặc SPA HTML200 che.
- Thiết bị offline không thể nhận lệnh tắt từ server ngay. Khi kết nối lại,
  visibility/online/poll/update sẽ nhận policy hoặc worker khẩn. Hướng dẫn sale
  giữ nháp cần thiết trước khi tự đóng/mở lại; không hứa xóa cache tức thời offline.

Hai đường tắt (control và worker thay thế) đã có bài browser cục bộ; route Caddy
khẩn/runner mới và rollback actual image phải rehearsal trong lượt ops riêng.

## 9. Khung giờ và hướng dẫn sale

Chọn cửa sổ ít khách sau21:30 hoặc trước07:30 giờ Việt Nam, có chủ dự án/ops trực
và đủ ít nhất30–45phút cho smoke/quan sát/rollback. Tránh lịch broadcast, automation,
backup và cron nghiệp vụ; kiểm lịch thật trước khi chốt giờ. Không tự coi 11/11 là
lịch deploy đã duyệt.

Hướng dẫn sale sau khi chủ dự án cho phát hành:

1. Mở đúng địa chỉ CRM HTTPS bằng **Safari** trên iPhone, đăng nhập.
2. Chạm Chia sẻ → **Thêm vào Màn hình chính** → Thêm.
3. Mở biểu tượng CRM vừa thêm; kiểm đúng tài khoản/tổ chức và bật giao diện mong muốn.
4. Khi có bản mới, gửi/lưu nháp cần thiết rồi chạm Cập nhật khi nút cho phép.
   Không xóa PWA để ép cập nhật trong lúc đang soạn.
5. Offline không gửi media; nối mạng rồi kiểm lại đúng tên khách + nick trước khi gửi.
   PWA không thay thế cam kết nhận thông báo nền/push iOS.

## 10. Những việc chưa được chứng nhận trên iPhone thật của release này

Chủ dự án đã duyệt đợtF ngày11/11/2026 sau thử iPhone thật và nháp desktop.
Không ghi lại thành một lần thử thật của bản merge release mới.

- Bản build hợp nhất production+mobile, full image Node22 và header qua Caddy/TLS thật.
- Nâng PWA đã cài từ bản cũ sang đúng release này, đa tab/đa cửa sổ và mạng yếu
  khi có nháp/gửi pending; rollback image85c6a6ba + route kill-switch thực tế.
- Gửi media vào nick Zalo thật, giới hạn tài khoản/provider và những lỗi server
  thực sự (403/409/413/415/429) ngoài mock. Test env iPhone trước dùng MOCK_BROWSER.
- Phiên refresh hết hạn sau thời gian dài, Safari bị iOS kill/restart, storage eviction,
  nhiều tài khoản trên cùng máy và mất mạng kéo dài trên mạng di động thật.
- VoiceOver, Dynamic Type/phóng chữ cực lớn, bàn phím/dictation thực tế ở các mẫu
  iPhone/iOS chưa có receipt. Chromium/WebKit desktop mô phỏng không thay thế thiết bị thật.
- Enterprise/private extension không nằm trong repo này; không chứng nhận nhánh EE.
- F6 backend PUT lịch hẹn thiếu kiểm trùng (đã ghi hotfix riêng); không tự bổ sung ở release.
  Backend cố ý che quyền bằng404 thì frontend không đoán thành403.

## 11. Điều kiện trước khi chủ dự án quyết deploy riêng

Chốt kết quả mới bên dưới; giữ rõ những FAIL lịch sử/nhiễu pixel.
Sau đó cần duyệt exact commit + image mới, review runner/route khẩn thích nghi,
rehearsal actual image/rollback và chọn khung giờ. Không có thao tác production
nào được thực hiện hoặc tự đặt lịch bởi hồ sơ này.


## 12. Lịch sử pixel desktop1440 trước chốt F5 — đã thay bằng §15

C=static production image so chính nó; R=static production image so dist release cuối.
Mỗi cảnh3C+3R cùng thứ tự, cùng renderer; không mask/CSS/tolerance. Chat dùng
blur rồi focus editor thật và chờ500ms/đảm bảo focused giống nhau để WebKit ổn định.
F4 chỉ cho phép khác composer khi đổi nháp; bảng là **số pixel ngoài composer**.

### Sidebar mở rộng

| Engine | Cảnh | C1/C2/C3 | R1/R2/R3 | Pixel chỉ-R ổn định3lượt |
|---|---|---|---|---|
| chromium | media-grid | 115/100/48 | 60/118/141 | 14 |
| chromium | media-detail | 3/3/3 | 0/3/3 | 0 |
| chromium | friends | 67/5/5 | 6/67/5 | 0 |
| chromium | marketing-lists | 0/0/0 | 0/0/0 | 0 |
| chromium | settings-profile | 0/0/0 | 0/0/0 | 0 |
| chromium | chat-empty | 14/0/0 | 11046/11032/11046 | 11032 |
| chromium | chat-media | 29/14/42 | 11046/11046/11032 | 11032 |
| chromium | chat-draft | 0/13/0 | 11032/11035/11045 | 11032 |
| chromium | profile | 0/0/0 | 0/0/0 | 0 |
| chromium | appointments | 0/0/0 | 0/0/0 | 0 |
| webkit | media-grid | 0/0/0 | 0/0/0 | 0 |
| webkit | media-detail | 0/0/0 | 0/0/0 | 0 |
| webkit | friends | 0/0/0 | 0/0/0 | 0 |
| webkit | marketing-lists | 0/0/0 | 0/0/0 | 0 |
| webkit | settings-profile | 0/0/0 | 0/0/0 | 0 |
| webkit | chat-empty | 35/0/35 | 10827/10862/10827 | 10827 |
| webkit | chat-media | 0/0/0 | 10827/10827/10827 | 10827 |
| webkit | chat-draft | 0/0/0 | 10827/10910/10910 | 10827 |
| webkit | profile | 0/0/0 | 0/0/0 | 0 |
| webkit | appointments | 0/0/0 | 0/0/0 | 0 |

Chromium media-grid ban đầu có14pixel chỉ-R; chạy thêm3C+3R để phân loại,
**toàn bộ14tọa độ cũng xuất hiện trong controls bổ sung**. Sáu C:
`115/100/48/144/102/128`, sáu R:`60/118/141/0/53/40`, maxDelta42 ở cả hai;
không còn pixel chỉ-R ổn định qua6lượt. Đây là nhiễu renderer có đối chứng,
không biến FAIL exact0 thành PASS. Media-detail/friends cũng có nhiễu cùng
mức trong controls; mọi cảnh WebKit ngoài chat đều0.

**F5 là khác biệt thật**: Chromium11032/WebKit10827pixel chỉ-R ổn định ở
sectionSale và các hàng bên dưới bị dịch. Đã xem ảnh diff; không phải rail
(rail đã loại) hay nhiễu. Mở rộng SaleAssigneePicker thuộc F5 đã duyệt nhưng
gate “chỉ khác trong popover Sale” chưa đạt với sidebar expanded. Giữ nội dung
đã duyệt và báo để chủ dự án quyết sửa riêng/duyệt phạm vi, không tự thiết kế lại.

### Sidebar thu gọn

| Engine | Cảnh | C1/C2/C3 | R1/R2/R3 | Pixel chỉ-R ổn định3lượt |
|---|---|---|---|---|
| chromium | chat-empty | 19/0/0 | 0/0/0 | 0 |
| chromium | chat-media | 0/42/8 | 34/42/11 | 3 |
| chromium | chat-draft | 0/0/33 | 0/0/0 | 0 |
| webkit | chat-empty | 0/0/0 | 0/0/0 | 0 |
| webkit | chat-media | 0/0/0 | 0/0/0 | 0 |
| webkit | chat-draft | 30/0/0 | 30/30/83 | 0 |

Chat-empty R0 cảhai engine; WebKit chat-media C/R đều0. Các ca còn lại có
raster nhỏ và đã giữ FAIL exact0. Chromium chat-media ban đầu còn3pixel chỉ-R
ở(768,438),(769,438),(768,439);3C+3R bổ sung cho R0/0/45 vàC8/0/8,
không còn tập chỉ-R ổn định qua6lượt nhưng3tọa độ cũ chưa xuất hiện trong
controls. Vì vậy không khẳng định đã chứng minh hết nhiễu ở3điểm này;
giữ gate exact0 chưa đạt. F4 khác nội dung đúng composer; functional kiểm nháp/
reply/định dạng/payload/gửiBkhôngảnhhưởngA đã đạt. Đây không phải chứng nhận
toàn màn exact0 cho mọi lượt.

Mọi PNG before/after/diff và tọa độ gốc ở `image-audit-20261111/final-pixel`,
`final-pixel-closed`, `final-pixel-media` ngoài Git.

## 13. Evidence và lệnh kiểm cục bộ

Tất cả raw log/JSON kết quả test/PNG/profile mới ở ngoài commit:
`F:/ZaloCRM-wt/release-mobile-qa/`. Các profile WebKit ngắn ở `C:/p/rm11`,
`C:/p/rm12`; lượt image-audit dùng `C:/p/rm13` và `C:/p/rm14`. Không có secret production, không vào Git hoặc image.
Chỉ receipt audit image gọn (identity/checksum/phạm vi đọc, không dữ liệu khách)
được lưu trong docs để truy xuất căn cứ của các quyết định.

```text
frontend: npm ci --legacy-peer-deps; npx vue-tsc -b
frontend: npm test -- --maxWorkers=2 --reporter=default --reporter=json
frontend: npm run build
backend: npm ci --no-audit --no-fund; npx prisma generate; npx tsc --noEmit
backend: npx vitest run --maxWorkers=2 --reporter=default --reporter=json
```

Backend dùng URL giả `postgresql://test:test@127.0.0.1:1/test` cho cả hai bản,
không .env production/test cloud. Baseline archive bổ sung docs/scripts đúng c4a3e4e
để các test đọc fixture SQL ngoài backend có cùng input (lượt đầu thiếu docs đã giữ
riêng, không dùng để kết luận). Lock backend và schema baseline/release giống nhau,
node_modules junction chỉ dùng dependency cục bộ đã npmci, không sửa baseline source.
Node máy cục bộ26.13.0; Dockerfile production22-alpine chưa chạy build actual image.

E2E lượt cuối chạy dist release cuối ở localhost4250/4252/4256 và static image ở4251/4253/4257; backend/API/socket
được mock, không DB/Zalo thật. Harness mới `e2e/release-mobile-parity.spec.ts`
giữ assertion0 nên suite vẫn FAIL khi nhiễu hoặc khác biệt F5 thật. Có thể tái chạy
với `D_APP_PORT`, `D_BASE_PORT`, `BASE_DIST`, `RELEASE_PIXEL_OUT`;
`RELEASE_CHAT_CLOSED=1` chỉ đặt lựa chọn localStorage thu gọn sidebar như người dùng.
`F1_OUT`, `F2F3_OUT`, `E_QA_ROOT`, `E_QA_OUTPUT`, `E_QA_PROFILE_ROOT` đặt output
ngoài Git. PWA profile phải ngắn trên Windows; không dùng kết quả lỗi file system
làm bằng chứng lỗi runtime trên Safari thật.

**Trạng thái lượt cũ:** còn blocker pixel F5 tại thời điểm đo. Blocker này được kiểm và chốt lại ở §15; các số FAIL cũ giữ nguyên để truy vết. Deploy vẫn cần quyết định riêng, kiểm actual image/runner/kill-route/rollback và các mục iPhone thật ở §10.


## 14. Thay đổi hành vi cần báo trước cho sale

Chủ dự án chọn phương án (a) ngày 11/11/2026: sale thường trên máy tính chỉ có
**Khách của tôi**. Sale thường không còn xem được khách của sale khác trong cùng
nick và không còn lọc khách chưa giao sale. **Admin/quản lý vẫn xem được tất cả,
khách chưa giao và lọc theo từng nhân viên trong phạm vi quyền hiện có.** Backend
vẫn kiểm quyền nick/tổ chức; lần này không thay API hoặc RBAC server.

Desktop và mobile cùng ép `assignedUserId` về ID người đăng nhập khi
`canChooseSale=false`, trước request đầu tiên và khi preset/clear/URL/quyền đổi.
Giá trị cũ `saleAssigneeId=all`, `unassigned` hoặc ID người khác trong localStorage
được dọn; bộ lọc mới chỉ lưu ID theo tổ chức + tài khoản. Admin/quản lý giữ lựa
chọn đã lưu, URL có ưu tiên khi điều hướng/back. Mobile hiển thị Khách của tôi
đang bật, không cho bỏ phạm vi bắt buộc này.

F5 mở danh sách nhân viên có tìm kiếm bằng nút trong đầu mục Sale (popover),
không chèn danh sách dài vào luồng sidebar. Ba lựa chọn của admin/quản lý và chiều
cao mục Sale giữ tương ứng production để các mục phía dưới không bị đẩy xuống.
Không đổi thanh kênh, không đưa lại nút Xem báo cáo AI, timeout vẫn 60 giây như image.


## 15. Chốt trước deploy — F5, bộ lọc lưu cũ và pixel (11/11/2026)

Đây là kết quả hiện hành, thay các gate pixel chưa đạt ở §5/§12. Làm trong
`release/mobile-20261111`, base `227edda7`; không đổi nhánh khác, không push/deploy
hoặc truy cập VPS trong lượt này. Ba việc thanh kênh, nút Xem báo cáo AI và timeout
30 giây vẫn tách riêng; giữ dropdown production và timeout 60 giây.

### Sửa đúng phạm vi F5

- `ConversationFilterSidebar.vue`: picker nhân viên dài từng làm tăng chiều cao Sale
  và đẩy Tương tác/Hồ sơ KH xuống. Chuyển tìm/chọn nhân viên vào popover mở bằng nút
  đầu mục Sale, giữ ba dòng preset của admin/quản lý. Dòng chỉ xem của sale thường
  giữ cùng ba hàng bằng grid, không thêm lựa chọn bị cấm. Sale trước/sau cao
  **127,5 px**; không che các mục bị dịch bằng mask rộng hơn.
- `use-sale-filter-url.ts` đồng bộ ID cho cả hai view: khi không được chọn sale thì
  chuẩn hóa đồng bộ về chính user, trước request đầu và khi preset/reset/URL/quyền
  đổi. Dọn key cũ `saleAssigneeId`, lưu ID tại
  `crm.inbox.saleAssigneeId:<orgId>:<userId>`. Không lưu tên/dữ liệu khách.
- Desktop gửi ID thật qua `assignedUserId`; mobile áp cùng guard, Khách của tôi
  luôn bật với sale thường. Admin/quản lý giữ lựa chọn lưu và ưu tiên URL khi back.
  E2E kiểm `all`, `unassigned`, ID khác: request đầu và sau reload/clear đều là ID
  chính mình. Admin và trưởng phòng phục hồi đúng ID nhân viên A.
- Không đổi backend, auth, payload gửi, API, dependency hay migration. Hành vi cần
  báo sale đã ghi riêng ở §14 theo quyết định (a) của chủ dự án.

### 42 FAIL cũ: đo lại phần ngoài Sale, không miễn ngưỡng

Chạy đầy đủ **120 cặp = 10 cảnh × 2 engine × (3 đối chứng + 3 thật)**.
C=static lấy từ image `85c6a6ba` so chính nó; R=cùng static đó so build release
cuối. Cùng thứ tự baseline→đích, renderer/fixture/viewport 1440×900, ngưỡng **0**.

Mask duy nhất của F5 là **đúng bounding box Sale của production**, không padding
hay union; assert bounding box release bằng hệt production. Đếm riêng phần còn
lại của sidebar và phần còn lại của cả trang. F4 chỉ được khác nội dung composer
khi đổi nháp A→B; cột cuối ghi riêng số đó, không che lẫn vào Sale. Mọi PNG gốc,
PNG che Sale và diff giữ ngoài Git. Kiểm lại bằng PNG decoder của Playwright,
đối chiếu với bộ đếm RGBA browser, **khớp 120/120**.

Không ghi lệch ngoài Sale là nhiễu để miễn gate. Nguyên nhân layout F5 đã sửa.
Harness được ổn định theo nguyên nhân đo được: Chromium chờ đủ compositor stages,
tắt threaded animation/raster không đồng nhất; WebKit flush paint; cả hai dùng
nút **Ghim mở** thật trước ảnh hồ sơ để không chụp ngang auto-collapse 5 giây
(`ChatContactPanel.vue`, không sửa file này). Chat vẫn blur rồi focus editor thật,
chờ 500ms và kiểm focused. Không chèn CSS/class, không thay ảnh fixture hay nới
ngưỡng. Cấu hình renderer cố định lưu trong spec. Lượt trước có cặp production/
production lệch 37.599 pixel do timer hồ sơ; log/ảnh giữ nguyên, không gán nhãn
nhiễu hoặc dùng làm ngoại lệ cho kết quả cuối.

| Engine | Cảnh | C: cả trang còn lại | R: cả trang ngoài Sale/F4 | R: sidebar ngoài Sale | R: trong Sale | R: riêng composer F4 |
|---|---|---|---|---|---|---|
| chromium | media-grid | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| chromium | media-detail | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| chromium | friends | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| chromium | marketing-lists | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| chromium | settings-profile | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| chromium | chat-empty | 0/0/0 | 0/0/0 | 0/0/0 | 107/107/107 | 0/0/0 |
| chromium | chat-media | 0/0/0 | 0/0/0 | 0/0/0 | 107/107/107 | 0/0/0 |
| chromium | chat-draft | 0/0/0 | 0/0/0 | 0/0/0 | 107/107/107 | 3021/3021/3021 |
| chromium | profile | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| chromium | appointments | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | media-grid | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | media-detail | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | friends | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | marketing-lists | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | settings-profile | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | chat-empty | 0/0/0 | 0/0/0 | 0/0/0 | 107/107/107 | 0/0/0 |
| webkit | chat-media | 0/0/0 | 0/0/0 | 0/0/0 | 107/107/107 | 0/0/0 |
| webkit | chat-draft | 0/0/0 | 0/0/0 | 0/0/0 | 107/107/107 | 2713/2713/2713 |
| webkit | profile | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |
| webkit | appointments | 0/0/0 | 0/0/0 | — | 0/0/0 | 0/0/0 |

**Kết quả: 120/120 PASS; ngoài Sale (và riêng composer F4 đã duyệt) = 0 pixel,
phần sidebar còn lại = 0 pixel.** Toàn bộ cảnh và controls giữ assertion 0.

### Ba điểm raster cũ — mỗi điểm ba đối chứng production/production

Chạy riêng Chromium chat-media thu gọn, đúng tọa độ cũ, thêm 3 cặp thật cùng
renderer. Không mask Sale/composer hoặc vùng media trong sáu cặp này.

| Tọa độ | C1/C2/C3: khác tại điểm | R1/R2/R3: khác tại điểm | RGBA production | Kết luận từng điểm |
|---|---|---|---|---|
| (768,438) | 0/0/0 | 0/0/0 | 254,254,255,255 | Không còn lệch ở cả 6 cặp, không miễn ngưỡng. |
| (769,438) | 0/0/0 | 0/0/0 | 223,232,215,255 | Không còn lệch ở cả 6 cặp, không miễn ngưỡng. |
| (768,439) | 0/0/0 | 0/0/0 | 240,242,246,255 | Không còn lệch ở cả 6 cặp, không miễn ngưỡng. |

Sáu cặp toàn trang đều **0 pixel**. Kết luận hiện tại là không còn lệch sau ổn
định renderer; không suy diễn rằng đối chứng mới đã tái hiện/giải thích mọi FAIL
lịch sử. Không còn chấp nhận ngoại lệ ở ba tọa độ này.

### Kiểm toàn bộ trên source/build cuối

| Kiểm | Kết quả | Bằng chứng/phạm vi |
|---|---|---|
| Vue-tsc | **0 lỗi** | Bản cuối sau guard + chiều cao Sale cả hai role. |
| Frontend Vitest | **78 file / 891 PASS / 0 FAIL** | Toàn bộ, gồm 14 regression scope/restore/preset/quyền. |
| Frontend build | **PASS**, 256 precache file | `final3-dist`, chưa build/deploy Docker image. |
| Backend tsc | **0 lỗi** | Backend source không đổi trong lượt này. |
| Backend liên quan | **10 file / 97 PASS** | Unassigned, channel scope, runtime production/PWA. |
| Backend toàn bộ | **1199 PASS / 9 FAIL / 24 skip** | Baseline 1149/9/24; cùng 39 file FAIL, **0 case/file FAIL mới**. |
| Header dist cuối GET/HEAD | **12/12 PASS** | Fastify/static thật: SW/control/kill/index/root/deep-link. |
| F5 Chromium+WebKit | **32/32 PASS** | Scope, danh bạ, all/unassigned/ID cũ, query đầu, reload/back/clear, admin/trưởng phòng, chiều cao. |
| F1/F2/F3/F4/F6 | **253 PASS / 1 skip / 0 FAIL** | Skip CDP-only trên WebKit; mock API/socket. |
| Ma trận mobile F1/F2/F3 | **704/704 PASS** | Hai engine, 320/375/390/430, 844×390/932×430, Sáng/Tối; F1 thêm 393/402. |
| Shell/realtime/CRM B–D | **254/254 PASS** | Hai engine, build cuối. |
| PWA worker thật | **30/30 PASS** | Mỗi engine 15; profile mới `C:/p/rm20`, cập nhật/offline/auth/kill. |
| Pixel expanded, exact0 | **120/120 PASS** | Bảng trên; ảnh gốc + che Sale + đếm PNG độc lập. |
| Ba điểm raster, exact0 toàn trang | **6/6 PASS** | 3C+3R, bảng từng điểm trên. |

PWA harness chờ màn đích/auth router sẵn sàng ngoài SW precache; ca 503 chờ guard
redirect đăng nhập hoàn tất trước sự kiện phục hồi riêng, rồi chạy cả30ca trên
profile mới. Hai lượt trước vẫn giữ29 PASS/1 FAIL: nếu sự kiện phục hồi tới trước
khi guard redirect kết thúc, WebKit có thể ở lại login dù `/profile` đã phục hồi.
Đây là race quan sát được, **không kết luận chỉ là nhiễu hay đã sửa lỗi ứng dụng**.
Code `router/index.ts:327` kiểm sau auth.init, `PwaRuntime.vue:27` chỉ điều hướng
khi auth.user đổi lúc route đã là login; sự kiện đến sớm có thể bỏ lỡ điều kiện
đó. Các file auth/router/PWA không đổi so với227edda7. Chạy nguyên test cũ độc lập
trên build trước F5 đạt1/1, chưa đủ xác định tần suất race; giới hạn này cần xem
riêng trước khi coi PWA hoàn toàn sẵn sàng. Kết quả30/30 phía trên xác nhận luồng
phục hồi **sau redirect đã ổn định**, không chứng minh hết race phục hồi sớm.
Không tự sửa auth/PWA ngoài phạm vi F5. Các lượt mất preview vì
trùng cổng/harness gọi sidebar không có cũng giữ riêng, không tính PASS. Mỗi bộ
kiểm cuối dùng cổng/output riêng.

Không migration; grep `iphoneTest`/`iphone-test`/`IPHONE_TEST` trong frontend/src +
backend/src **0**. Source app cuối khớp manifest suốt QA; raw log/JSON/PNG/profile
không vào commit. Evidence mới:
`F:/ZaloCRM-wt/release-mobile-qa/sale-final-20261111/` (`sale-mask-proof3.json`,
`pixel-final3`, `raster-three-final3`, `backend-comparison.json`, `final-qa-summary.json`).

Gate F5 và pixel đạt trong môi trường tự động trên build release. Chưa deploy,
không coi mock/desktop WebKit là Safari iPhone thật. Các bước actual image/runner,
backup/smoke15/15 + quan sát≥6phút, rollback/kill-route và phần iPhone thật ở các
mục trước vẫn cần được chủ dự án quyết trong lượt deploy riêng.
