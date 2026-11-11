# Thử PWA iPhone bằng Cloudflare Quick Tunnel

Chủ dự án chọn ngày 10/11/2026: KHÔNG staging VPS, KHÔNG mkcert. Cloudflared được duyệt cài qua winget, đã cài version 2026.10.7. Không thêm npm dependency hoặc thay cấu hình production.

**Tunnel công khai trong lúc chạy. Chỉ dùng database TEST/dữ liệu giả, không nick Zalo thật; chỉ bật khi thử, xong chạy stop.** Ai có link đều truy cập được màn đăng nhập. Không đưa dữ liệu/secret thật vào thử nghiệm. Đây là Quick Tunnel tạm thời, không phải nơi phát hành.

## Một lệnh bật / tắt

PowerShell thường:

```powershell
powershell -NoProfile -File "F:\ZaloCRM-wt\iphone-test\scripts\dev\start-pwa-tunnel.ps1"
```

Chờ dòng **Mở trên iPhone: https://…trycloudflare.com**, mở đúng link đó. Admin demo `nv1.iphone@smoke.test`, sale demo `nv3.iphone@smoke.test`, mật khẩu demo `Demo@1234`.

```powershell
powershell -NoProfile -File "F:\ZaloCRM-wt\iphone-test\scripts\dev\stop-pwa-tunnel.ps1"
```

Stop dừng đúng cloudflared/preview/backend/supervisor do script tạo (PID + thời điểm tạo + tên executable; so ticks tương thích PowerShell 5/7), không tắt phiên HTTP 3000/5173, không tắt MinIO dùng chung hay tiến trình khác. TEMP/log/build được giữ để review, không vào Git. Stop xong link cũ không còn phục vụ.

## Các rào và cấu trúc test

- Script trên nhánh dev/iphone-test, KHÔNG BAO GIỜ merge vào mobile/base/production. Nhánh mobile/pwa giữ source PWA để review riêng.
- Script kiểm DATABASE_URL từ backend/.env.iphone-test ở checkout chính; sai exact host Neon TEST thì dừng trước khi ghi. Kiểm migrate status trước backend; không tự deploy migration.
- Không merge/cherry-pick PWA chưa duyệt. Script lắp source hiện tại mobile/pwa với danh sách adapter fixture iPhone có sẵn vào `%TEMP%\zalocrm-pwa-tunnel-*`, junction node_modules đã npm ci. Không sao chép env frontend.
- Build mode `iphone-pwa-test` có SW thật. Config test riêng cho phép DEV fixture UI trong bản build test; output TEMP này **không được phát hành**. Backend riêng port 3001 giữ IPHONE_TEST_MODE=true, NODE_ENV=development, mock/browser fixture, dry-run và chặn thao tác Zalo thật.
- Xác minh cả PID listener 3001/5174 trước khi công khai; supervisor kiểm mỗi hai giây và đóng đúng phiên tunnel nếu owned process/port đổi. Rebuild recheck PID ngay trước stop, ghi state atomic và có khoảng bảo vệ rebuild tối đa 60 giây; lỗi rebuild thì dừng phiên, không công khai ứng dụng khác.
- Vite preview loopback 5174; cloudflared nối vào đó. allowedHosts `.trycloudflare.com` và proxy `/api`, `/socket.io`, `/iphone-media` chỉ có ở vite.iphone-test.config.ts; vite.config.ts production không có tunnel host.
- Backend media URL `/iphone-media/...` tương đối, tải cùng origin HTTPS tunnel, proxy vào MinIO loopback. Không mở MinIO hay API thẳng ra Internet. Nếu Docker/MinIO chưa chạy, script báo gửi file sẽ lỗi.
- SW/manifest kiểm trên bản BUILD, không dùng Vite dev server giả làm nghiệm thu SW.

## Thử bản mới khi có nháp — giữ nguyên hostname

Không stop/start tunnel giữa hai bản: Quick Tunnel đổi hostname mỗi lần bật; origin mới không cập nhật bản PWA đã cài ở origin cũ. Khi đang chạy, để iPhone có nháp rồi chạy:

```powershell
powershell -NoProfile -File "F:\ZaloCRM-wt\iphone-test\scripts\dev\start-pwa-tunnel.ps1" -Rebuild
```

Lệnh build candidate mới, thay đúng preview của phiên test, giữ cloudflared/backend/link. Thêm marker TEST_ONLY vào worker để kiểm bản mới ngay cả khi source giống hệt; marker này không nằm trong source/release PWA. Đưa app ra nền rồi trở lại hoặc chờ poll: phải thấy “Có bản mới — Cập nhật”; không tự reload, không mất nháp/tin chờ. Đây là mô phỏng lifecycle update để kiểm rào an toàn, không chứng minh backend production.

## Checklist iPhone thật (iOS 16.4+)

Ghi model/iOS, link origin, giờ thử và kết quả mỗi ca; không đánh dấu PASS dựa trên desktop WebKit.

1. Mở link HTTPS trong Safari, không có cảnh báo chứng chỉ. Dùng tài khoản demo, thấy banner TEST LOCAL.
2. Safari → Chia sẻ → **Thêm vào Màn hình chính**, tên Cờ Rếp Việt CRM/icon rõ. Mở từ icon, không có thanh địa chỉ Safari.
3. Chưa đăng nhập: màn đăng nhập rõ, không trắng màn và không lộ dữ liệu phiên trước.
4. Đăng nhập, mở khách TEST iPhone 03, gõ nháp, xoay dọc/ngang, bật bàn phím; không che nút hoặc mất nháp.
5. Khóa màn hình rồi mở, đổi app rồi trở lại; trạng thái kết nối rõ và dữ liệu tải lại theo quyền.
6. Để nháp, chạy -Rebuild giữ link. Thanh cập nhật xuất hiện; bấm cập nhật khi còn nháp phải bị chặn/giải thích. Gửi hoặc bỏ nháp, hết tin chờ rồi mới cập nhật được.
7. Khi máy bay, thử một tin plain text giả để có “Đang chờ gửi”; bản mới không được tự reload khi queue còn mục. Chỉ thử khách giả và theo dõi queue để tránh hiểu nhầm đã gửi.
8. Đăng xuất: token xóa theo luồng cũ, cache người dùng/queue/nháp được dọn; đổi sale/admin không lộ dữ liệu phiên trước. Shell tĩnh có thể còn để mở màn login offline.
9. Đóng app, bật chế độ máy bay rồi mở icon: có màn thông báo ngoại tuyến, không trắng màn; token được giữ nếu chỉ mất mạng. Chưa xác minh profile thì không được cấp quyền xem khách offline.
10. Tắt máy bay/đưa app ra trước: tự thử lại xác minh phiên; token server từ chối mới về login. Hết access token có refresh hợp lệ thì refresh theo single-flight.
11. Thử kill-switch theo ROLLBACK.md ở origin test: worker/cache bị gỡ khi app nhận được chỉ thị từ server; không coi offline device đã nhận chỉ thị ngay.
12. Thử xong chạy stop; kiểm link ngừng phục vụ. Lần bật tiếp link/origin đổi, xóa icon test cũ và thêm icon mới nếu muốn thử lại.

## Hai phương án ban đầu (không triển khai theo quyết định mới)

| Phương án | Ưu | Nhược / bước chủ dự án phải làm nếu chọn lại |
|---|---|---|
| Staging VPS HTTPS riêng | Hostname ổn định, chứng chỉ tin sẵn; phù hợp thử update lâu dài | Phải duyệt riêng domain/DNS, container isolated, proxy TLS, test-only DB/secrets và rollback; không dùng app/DB production |
| HTTPS local với mkcert/chứng chỉ tự ký | Không đưa app test công khai, giữ trong LAN | Phải duyệt cài công cụ; tạo cert cho IP hiện tại, cài root CA công khai trên iPhone và bật full trust trong Settings; không chia sẻ private key, đổi IP có thể cần cấp lại |

Theo quyết định mới, cả hai chỉ là tài liệu so sánh, không cài CA/mkcert hoặc thay VPS.

Nguồn chính thức: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) nêu link tạm, ai có link đều truy cập, hostname đổi và không có SLA; giới hạn 200 request đồng thời, không hỗ trợ SSE. Socket.IO dùng WebSocket/polling, không tự thay giao thức trong đợt E. [Apple certificate trust](https://support.apple.com/en-us/102390), [mkcert mobile](https://github.com/FiloSottile/mkcert#mobile-devices) chỉ để tham khảo phương án không được chọn.

## Xác minh lượt tiếp tục 10/11/2026

- Đã chạy `start-pwa-tunnel.ps1 -PrepareOnly`: build TEST thành công, có `dist/sw.js`. PwaRuntime trong bản ghép trùng SHA256 với worktree pwa (`a9113f15d16f6061583bd9917757b7a585923559820f50a85c67ab87a52a33ce`). Ba script start/stop/watch parse PowerShell0 lỗi.
- Không cần rebase dev/iphone-test khi PWA chưa commit: mặc định `PwaRoot=F:\ZaloCRM-wt\pwa`, lấy tracked + untracked frontend hiện tại (gồm auth df9d9cf/PWA), chỉ ghép adapter TEST từ iphone-test. Bản build không lấy frontend cũ của nhánh test để thử PWA. Nhánh test vẫn ở888f9f2; không rewrite lịch sử khi không cần, không commit nháp PWA để rebase.
- Lượt này chỉ prepare/build, **chưa bật tunnel công khai, chưa thử iPhone**. Không dừng listener3000/5173 có sẵn. Lệnh bật/tắt/-Rebuild phía trên phục vụ chủ dự án thử; -Rebuild giữ origin để kiểm bản mới có nháp.
- Checklist E cần Safari và Home Screen riêng: model/iOS, thêm icon, mở icon, xoay hai chiều, bàn phím, khóa/mở màn hình, update có nháp/pending, xóa nháp bằng bàn phím rồi cập nhật, logout/đổi tài khoản, máy bay/cold start. Desktop32/32 không tự điền PASS cho các mục này.
