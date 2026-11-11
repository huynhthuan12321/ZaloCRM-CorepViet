# TT04 — Nghiệm thu local trên PostgreSQL 16

Ngày 13/10/2026. **Kết quả: PASS 11/11 nhóm kiểm tra local.** Nghiệm thu này chạy trên PostgreSQL native, Prisma/HTTP/JWT/Socket.IO thật và UI browser; không dùng mock Prisma để thay database.

**Phạm vi:** database cô lập tạo mới từ toàn bộ datamodel `bf31cdf` (116 bảng), dữ liệu tổng hợp, một account `MOCK_BROWSER`. Không lấy backup production, không đọc DB/.env làm địa chỉ đích, không kết nối TikTok/Zalo thật hoặc deploy VPS. Cần phân biệt PostgreSQL thật với dữ liệu production thật: chỉ điều thứ nhất được dùng ở lần này.

## Bằng chứng

- JSON nghiệm thu đã lưu: `docs/TIKTOK-TT04-ACCEPTANCE-EVIDENCE.json` (chỉ counts, trạng thái, hash, thời gian; không JWT/token/DB URL).
- Run cuối: `poc/tiktok-personal-qr/runtime/tt04-acceptance/941f6c08-fd9b-4f54-b2df-7c2193c0744c/`.
- Ảnh trước/sau revoke: `inbox-before-revoke.png`, `inbox-after-revoke.png` trong run cuối; đã xem lại bằng mắt, sau revoke tin biến mất và số đếm giảm từ 3 xuống 2.
- PostgreSQL **16.15 native Windows**, chỉ nghe `127.0.0.1`, cluster mới có UUID riêng; kiểm data_directory thuộc cluster vừa tạo trước DDL. CLI không cài Windows service. PostgreSQL, HTTP/Socket.IO, Vite và browser thử đã dừng khi kết thúc; kiểm không còn process postgres/pg_ctl.
- PostgreSQL portable lấy từ [EDB](https://www.enterprisedb.com/download-postgresql-binaries), ZIP từ máy chủ `get.enterprisedb.com`. SHA256 bản tải: `25e6fcdfb8caec38691bf461125e7564508760666f7b8e5dc6a5f0818f58f81e`. Đây là hash đã tính trên bản tải, không tuyên bố đã đối chiếu checksum/signature độc lập của nhà cung cấp.
- Datadir, binaries, dump và screenshot nằm trong runtime bị Git ignore. Không đưa chúng vào commit.

## Kết quả theo nhóm

| Nhóm | Bằng chứng / kết quả |
|---|---|
| 1. Schema legacy đầy đủ | Sinh DDL từ schema ở `bf31cdf`, 116 bảng, seed user/org/permission/Zalo public/private/virtual và 1.202 tin tổng hợp |
| 2. Backup/restore | `pg_dump -Fc` rồi `pg_restore --exit-on-error` vào DB mới; count và digest ID+nội dung bằng bản trước; copy fixture media một file và so hash |
| 3. Migration B/D1 | Áp SQL repo lên DB restore, giữ nguyên 1.202 tin và digest; không tự sửa SQL để làm test qua |
| 4. Lock timeout | Hai PostgreSQL connections thật: giữ ACCESS EXCLUSIVE lock, ALTER ở connection khác timeout sau giới hạn 250ms với SQLSTATE 55P03; không tạo cột thử; giải phóng lock |
| 5. Backfill/D2 | Dry-run không ghi; batch đầu 200 tin, còn 1.002; resume về remaining=0/invalid=0; chạy lại changed=0; D2 VALIDATE FK/XOR và Message.org_id NOT NULL |
| 6. Schema drift | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: exit 0, **No difference detected** sau D2 |
| 7. Prisma thật | Tạo contact/account/channel conversation/message; writer bỏ orgId nhận org do trigger điền; tenant spoof và duplicate external ID bị DB từ chối; writer virtual Zalo cũ vẫn tạo được tin |
| 8. JWT HTTP thật | Thiếu/sai JWT → 401; reader list/count/history đúng; không grant, org khác hoặc inactive không đọc body (404); không có channel send endpoint; private Zalo search không lộ kết quả |
| 9. Socket.IO thật | Reader join read, bị từ chối control; owner nhận QR **giả** trong control; reader không nhận QR; outsider không join; reader có JWT role owner cũ nhưng DB role member, không được nâng quyền |
| 10. Browser/UI thật | Vue SFC + useChat/composable và read-only component lấy tin qua HTTP/DB thật; không có textarea/contenteditable; DELETE grant qua HTTP owner làm socket revoke, tin bị xóa khỏi UI, count cập nhật và history trả 404 |
| 11. Flags/giữ Zalo | Tắt CHANNELS_ENABLED: metadata unavailable, inbox 503; 1.200 tin public Zalo còn nguyên và virtual conversation còn isVirtual=true |

Hai lỗi Prisma FK/unique in ra log là các phép thử âm có `assert.rejects`, không phải nhóm FAIL.

Database fixture sau backfill khoảng **17,2 MB** (17.194.007 bytes). Các số thời gian cụ thể nằm trong JSON; không lấy thời gian trên fixture/Windows làm ETA hoặc khả năng chịu tải của VPS.

## Kiểm tra bổ sung

- Backend targeted: **188/188 PASS**, 16 files; gồm regression Zalo, quyền, HTTP, realtime và migration.
- Frontend: **61/61 PASS**, 5 files.
- Backend TypeScript: PASS; frontend typecheck + build: PASS (warning bundle lớn có sẵn).
- `git diff --check`: PASS.
- Không chạy lại toàn bộ backend suite không liên quan ở lần này; kết quả full-suite và đối chiếu baseline ở `TIKTOK-TT04-CDE-RESULTS.md` vẫn có 38 file thất bại do môi trường/module thiếu và 6 test cũ. Không tuyên bố full suite xanh.

## File của bước nghiệm thu

- `backend/scripts/channels/acceptance-local.ts`: tạo cluster mới, sinh baseline DDL, seed/backup/restore/migrate/backfill/validate, chạy actual HTTP/socket/browser, kiểm schema drift, lưu report và shutdown.
- `frontend/tt04-acceptance.html`, `frontend/src/acceptance/tt04-inbox.ts`, `tt04-inbox.vue`: entry UI test riêng; không import từ main.ts/router và không đưa vào production entry.
- `backend/package.json`, lockfile: dev dependency `socket.io-client` 4.8.3. PGlite Socket đã được thử tìm phiên bản rồi bỏ khai báo vì native PostgreSQL phù hợp hơn; không dùng nó cho nghiệm thu.
- `frontend/src/composables/use-chat.ts`: không gọi quota AI khi chọn channel conversation, tránh request không cần thiết trong read-only scope.
- JSON/báo cáo này, roadmap và dòng cập nhật báo cáo CDE.

Lần khởi động đầu bị pipe Windows giữ mở ở pg_ctl; đã dừng đúng cluster của harness và sửa khởi động bằng stdio ignore. Lần UI đầu cần đổi object template sang SFC do Vue dùng runtime-only build. **Bằng chứng được chốt từ run cuối sạch**, không từ lần lỗi hoặc kết quả hot reload.

## Chạy lại

Trên máy Windows này (PostgreSQL portable và browser runtime đã có trong thư mục bị ignore):

```powershell
Set-Location D:\ZaloCRM-CorepViet\backend
npx.cmd tsx scripts/channels/acceptance-local.ts --browser
```

Mỗi lần tạo datadir riêng, không tái sử dụng DB/.env của ứng dụng làm target. Script đặt DATABASE_URL của process vào cluster do chính nó tạo; JWT thử sinh trong RAM. Bỏ `--browser` chỉ bỏ UI, các nhóm backend vẫn chạy. Hãy đọc results.json và exit code; không chỉ dựa vào dòng PASS riêng lẻ.

Máy khác cần provisioning portable binary/browser trước; script hiện chưa hỗ trợ Linux/Docker. Binaries và native DB version được kiểm ở đầu, không âm thầm thay bằng PGlite.

## Quyết định qua cổng

| Phạm vi tiếp theo | Kết luận |
|---|---|
| TT04 local nền đa kênh trên schema tổng hợp | **PASS** |
| TT05 phát triển/mock bridge local, một account thử | **GO có phạm vi**; cần người dùng chỉ định bước tiếp theo, chưa tự chạy |
| TikTok Personal thật vào CRM/staging | **Chưa nghiệm thu**: worker/ingress/persistent session chưa được nối; capability live vẫn false |
| Migrate/deploy production | **Chưa mở cổng** |

Trước production còn cần bản restore đã khử dữ liệu nhạy cảm của DB/media thực tế, preflight trạng thái/schema/migration history, lock/index/tải ở quy mô thực, credentials/role không BYPASSRLS nếu bật RLS, regression `_ee` nếu có, và smoke toàn bộ ứng dụng. Harness chỉ host các route đọc kênh + socket handlers; UI dùng component/composable thật trong layout fixture, **chưa** là toàn bộ app.ts/ChatView/mobile hoặc SDK Zalo thật. Không chứng minh RLS, multi-node adapter, exactly-once hoặc TikTok hoạt động từ fixture này.

## Rollback và kết thúc

Không có database hoặc config production cần rollback. Script đã dừng các tiến trình test; datadir/dump/runtime giữ lại làm bằng chứng. Nếu rollback code nghiệm thu, chỉ gỡ harness/dev dependency/dòng sửa quota AI và docs tương ứng bằng patch review; giữ C/D/E và công việc khác. Không xóa volume hoặc dữ liệu tài khoản thật. Không tự chuyển TT05 hoặc mở live flags.
