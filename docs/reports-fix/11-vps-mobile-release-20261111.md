# Phát hành mobile production — 11/11/2026

Trạng thái: **DEPLOYED_OBSERVATION_PASSED**. Website đang mở trên image mobile mới; không rollback. Chủ dự án duyệt nguồn `release/mobile-20261111 @ 3b94ca6b96bd1a93c170f3f465e2a64034afd85d`. Build đầy đủ frontend/backend bằng docker/Dockerfile, không overlay frontend. Không migration/restore DB, không push, không đăng nhập tài khoản thật, không gửi tin thử, không đụng n8n/Lark.

## Identity

| Mục | Giá trị |
|---|---|
| Image mới / manifest-list digest | `sha256:6b89fc4775571187916139fdabd62db53a6cbb43efac1e66f2fab798b8ee0bce` |
| Platform manifest linux/amd64 | `sha256:23d9ec93e4cc3e7096fe2e11bc4ddd583dcf8d34181f2daa3add47502b793665` |
| Config digest | `sha256:166c3013380b98b3568ab3d33b9a589c765e2cdce6d92cad9ba031b61b83c0f8` |
| Image cũ / rollback | `sha256:85c6a6bafd06eb85a7eed25c5daaa047c19494a46ba5df7e0030c86ec064b573` |
| Container mới | `48049471debde300f6ece7066a6b7508ad0a9300bec53757c2721e0d14f7b269` |
| Container cũ đã dừng, giữ nguyên | `zalo-crm-app-pre-mobile-20261111`, ID `ae0d0b625466ad3823aba974089bca924e136eee9dcc07a2bfc52bff66289c42` |
| Archive gzip | 1.161.870.198 bytes; SHA256 `d73d12a03b0786f6753eef4544c0c5cbda013b4864979971eb66815df5f5200d` |
| Evidence private VPS | `/root/zalocrm-release-evidence/mobile-release-20261111` |

Build local Linux/amd64, Node22-alpine từ git archive chọn đúng build inputs của commit; Dockerignore loại env/test/profile/output. Đối chiếu1.201file với Git:0khác nội dung sau chuẩn hóa CRLF/LF. Không đưa archive source lên VPS. Backend giữ npm install theo Dockerfile production; không sửa dependency/lock. Flags Enterprise/Broadcast/Sequence=false, dry-run=true, giữ mặc định production; không thêm opt-out Marketing. Log/source/image receipts ngoài Git. Lockfile SHA256: backend `315ffbd3f18e4292e3f87a3ede47b8e7f9a362e4e4199d48fa1b5adfa874141c`, frontend `37bbfb65e6c85e00775c71e8b6cf22d79285aa5f9a56611c93ebae464b8ee335`.

Lần kiểm import đầu báo lỗi inspect: receipt nhầm config digest thành Docker image ID. Docker load thực tế đã thành công; sửa receipt theo digest manifest-list trên cả local/VPS, kiểm lại archive SHA/image trước khi đi tiếp. Lỗi xảy ra trước maintenance; production chưa đổi nên không rollback. Không đổi source/image để vượt gate.

## Backend so với image đang chạy85c6a6ba

| File runtime | Thay đổi được duyệt |
|---|---|
| `/app/dist/modules/chat/chat-routes.js` | Sentinel assignedUserId=unassigned thành NULL, giữ RBAC/scope nick. |
| `/app/dist/shared/http/frontend-static.js` (mới) | Header PWA no-cache/no-store; HTML no-cache. |
| `/app/dist/app.js` | Hook header và tránh SPA fallback nuốt đường dẫn PWA thiếu. |

314/316module cũ khớp executable; chỉ2module cũ khác và1module mới nêu trên. Dùng TypeScript printer bỏ comment/chuẩn CRLF; checksum gốc vẫn lưu. 317module image đã import khớp byte image local. Test capture lịch sử không đóng gói (Dockerignore loại tests). Schema/migration delta0. FullAuto, SDK tenant, Prisma Decimal/JSON-null, scoring và timeout60s đã có trong production đều giữ. Thanh kênh dọc/nút báo cáo AI/timeout30s tiếp tục tách riêng.

## Quy trình, preflight và backup

Đã đọc RELEASE-MOBILE.md, báo cáo ngày09/11, OPERATIONS.md. Runner messaging local/VPS khớp SHA256 `6a9321bab629894bf34cc5e071106f9a51228ea99f13affeda0f2d57feea332c`; helper reviewed nền `e0d123717f3fa4ad2456514cde418185ec43fd60343a0bce45e9c8c0deeeac84`.

Runner mobile riêng SHA256 `0b67b3323f4e10a20b62d3ff17b93786010a6c52484c325364448b82786bd1ed`: giữ body deploy/smoke/open/rollback/observe, đổi identity/container/parent; build thay bằng import full image kiểm SHA. Bổ sung kiểm dump TOC trước maintenance, pattern fatal và pha kill-switch. Không dùng deploy.sh/Compose rollout, không chạy migration phase của helper nền. Mỗi lần gọi đều kiểm SHA trước exec. Observer22check giữ nguyên, chỉ đổi thư mục state và chọn container được giữ/dừng đúng trường hợp rollback (lúc đó container cũ đã hoạt động).

Preflight chỉ đọc: exact85c6, healthy, restart0, DB/Redis connected,2nick connected; guard=enforce, RLS_SET_CONFIG=true, role super=false/bypass=false;130migration/0unfinished/103FORCE+ENABLE RLS. Đĩa80,39%, free18.389.049.344bytes; yêu cầu bảo thủ fullimage+archive+2×DB+2GiB =8.619.050.150bytes. Sau import còn12.861.710.336bytes. Không prune/xóa image/backup/volume.

Backup `pre-deploy.dump`: **21.583.987bytes**, SHA256 **`976b9a57d7010413174b9793aece02dc5546678cfd8482d2b835fb6225e20f3f`**. pg_dump -Fc thành công; pg_restore --list đọc TOC/TABLE DATA thành công, chỉ list, **không restore**. Dump/config/env/raw logs giữ private VPS. Env/User/ports/mount/network/resources giữ nguyên; DB/Redis container không recreate.

Mốc giờ Việt Nam:

- Backup xong14:12:13; maintenance14:12:14; launch14:12:14.
- Smoke15/15 lúc14:12:55, healthy; warmup≥70giây trước mở.
- State OPENED_MONITORING **14:14:16**; elapsed tính từ mốc này.

Observer sau mở đạt **377,944495giây**, kết thúc14:20:33,944 ngày11/11/2026 (+07). **12probe**, mỗi probe public22/22PASS, smoke15/15, restart0, tenant-guard0/RLS0/fatal0, DB/Redis connected và2nick connected. Catalog cuối vẫn130/0unfinished/103FORCE+ENABLE RLS, role non-super/non-bypass. Đĩa cuối còn12.838.199.296bytes. Checksum dump kiểm lại khớp; container85c6 cũ vẫn dừng/giữ nguyên. Không dùng thời gian build/request thay elapsed sau OPENED.

## Kiểm sau mở

- Public HTTPS GET/HEAD/bundle **14/14PASS**: sw.js/kill-sw.js no-cache+JavaScript, control.json no-store+JSON; manifest200/JSON; index/login no-cache+HTML. GET file khớp byte image.
- `ChatView-BS-wK1Ba.js` chứa SaleAssigneePicker, SHA256 `fb329fed42a54bb8c0ef602f92cb917509ced85cbc89673e09722179dc3e9662`.
- `index-Da4prRMt.js` chứa CRM_PWA_DISABLED/serviceWorker/PwaRuntime, SHA256 `ce10db4ad66fcc1da637751c1fb3659816d0414b4ef57d3de2c9ca30a3915985`.
- Login browser **4/4PASS**: Chromium/WebKit ×1440desktop/390mobile; ô mật khẩu hiện,0pageerror,không tràn ngang; ảnh ngoài Git, đã xem ảnh WebKit mobile. Không nhập tài khoản thật.
- Header image cô lập12/12; Caddy kill-switch rehearsal8/8 (exact worker/control trước app và maintenance). Hai attempt rehearsal đầu thiếu capability NET_BIND_SERVICE ở container thử; đã dọn đúng container thử, cấp capability cho container thử rồi đạt. Không đổi security config production.
- Không chứng nhận đã thử tài khoản/khách/media thật hoặc iPhone thật của release production. Giới hạn iOS/PWA/race WebKit503 trong RELEASE-MOBILE.md còn nguyên; không sửa auth/PWA ứng dụng trong lượt ops.

## Rollback khẩn và tắt PWA

Chạy trên VPS với quyền ops. **Không restore DB, migrate, tắt guard/RLS hoặc đổi role.**

```sh
cd /root/zalocrm-release-evidence/mobile-release-20261111
printf '%s  %s\n' 0b67b3323f4e10a20b62d3ff17b93786010a6c52484c325364448b82786bd1ed remote.py | sha256sum -c -
printf '%s  %s\n' 290f4ce8d1ffc4f5adca3ce384a0548c43d6e180b1402cdb821d704a50a8796b emergency-rollback.py | sha256sum -c -
# kill PWA -> maintenance -> container85c6 -> healthy/warmup>=70s -> smoke15 -> open -> observe
python3 emergency-rollback.py
# Kiểm monitor trước khi quan sát thêm>=6phút từ OPENED mới
printf '%s  %s\n' b4f471ec9c8e5308a453c53783540cfb435d94b8685060d6d0126c3b008fcef4 monitor.py | sha256sum -c -
python3 monitor.py
```

Nếu chỉ tắt PWA, giữ image mobile:

```sh
cd /root/zalocrm-release-evidence/mobile-release-20261111
printf '%s  %s\n' 0b67b3323f4e10a20b62d3ff17b93786010a6c52484c325364448b82786bd1ed remote.py | sha256sum -c -
python3 remote.py kill-switch
```

Kill-switch dùng Caddy đúng origin: control.json enabled=false/no-store/JSON; URL gốc /sw.js và /pwa/kill-sw.js trả worker khẩn/no-cache/JavaScript/root scope. Chỉ bọc handler CRM, giữ host matcher, lưu cả open/maintenance route đã bọc để rollback không che endpoint. Worker xóa cache CRM sở hữu/unregister, không xóa token/reload nháp. Override độc lập image nên vẫn hoạt động khi rollback85c6. Chưa bật trên production, chỉ rehearsal cô lập. Caddy API config runtime: nếu ops reload config từ file phải duy trì override. Thiết bị offline chỉ nhận khi nối mạng.

Nếu smoke/open lỗi, giữ maintenance và báo ops, không mở cưỡng bức. Container mới lỗi được giữ tên zalo-crm-app-failed-mobile-20261111. Không dùng runner rollback ngày09/11 vì target0600cdff sai đợt.

## Việc chủ dự án cần làm

Kiểm đăng nhập bằng tài khoản được phép và iPhone thật; Safari → Chia sẻ → Thêm vào Màn hình chính. Kiểm quyền/chọn sale, chưa giao, gửi media đúng khách+nick, nháp/update PWA. Báo sale thường desktop chỉ còn Khách của tôi; admin/quản lý vẫn lọc từng nhân viên. Chủ dự án quyết việc push commit nhật ký. Chưa dọn container/image/backup rollback.