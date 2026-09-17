# Bàn giao phiên nâng cấp hạ tầng ZaloCRM — 17/09/2026

> Phạm vi: chuẩn bị production cho **Messenger Native** theo runbook `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md` v1.2 (đã đóng băng, commit `091b22d`).
> Mô hình làm việc: AI thực thi chạy lệnh → Claude (reviewer) viết script/prompt, kiểm chứng báo cáo → user duyệt từng thao tác ghi production.
> Tài liệu này **không** chứa secret, password, token hay dữ liệu khách hàng.

---

## 1. Tóm tắt trạng thái

| Hạng mục | Trạng thái |
|---|---|
| PR-00 Safety foundation | ✅ Đã vào `main` 18/09 (`915bbe1` sau rebase) |
| PR-01 Zalo characterization tests + runbook v1.2 | ✅ Đã vào `main` 18/09 (`740a50c` + `0965086`) |
| OPS scripts (deploy/rollback/backup/restore) | ✅ Đã vào `main` 18/09 (`55a876e`…`da12ca1`), đã cài sẵn lên VPS |
| D0A / D0B-1 Backup + restore nền tảng | ✅ PASS |
| D0C-AUTO / D0C Backup tự động off-site | ✅ PASS, cron đã cài |
| D0D Đóng cổng app 3080 | ✅ DONE, đã push `origin/main` |
| D0E-9000 Đóng cổng MinIO 9000 | ✅ DONE, đã push `origin/main` (`29e4e94`) |
| D0E-5678 Đóng cổng n8n 5678 | ✅ DONE 22:30 (n8n không thuộc git ZaloCRM) |
| D0F Đóng cổng voi-crm-app 3081 | ⏸ Ngoài phạm vi ZaloCRM (app riêng của Vối Coffee) — tuỳ chọn, cần chủ app VOI duyệt |
| D1 trở đi, Meta Spike, PR-02a → PR-08 | ⏳ Chưa bắt đầu |

**Git hiện tại:** `main` = `da12ca1` (18/09, gồm 7 commit PR-00 + PR-01 + OPS rebase lên `29e4e94`).
Tag khôi phục vị trí branch trước rebase: `backup/pr00-preRebase`, `backup/pr01-preRebase`, `backup/ops-preRebase`.
Test sau merge: 38 file fail / 6 test fail / 804 pass (trước merge: 53 / 54 / 632). 6 test fail còn lại và 34 suite lỗi import đều **có sẵn từ trước** `29e4e94`.
**VPS:** repo `/root/ZaloCRM-CorepViet` HEAD `850dea1`, `docker-compose.yml` sửa tay 2 dòng (D0D + D0E), khớp nội dung commit `99e16ca` + `29e4e94`.

---

## 2. Hạ tầng tham chiếu

- VPS `157.66.219.190`, Ubuntu 22.04, 4 vCPU / 8 GB, TZ `Asia/Ho_Chi_Minh`.
- `/root/ZaloCRM-CorepViet` — app ZaloCRM + Postgres + Redis + MinIO (container `zalo-crm-*`).
- `/opt/n8n` — n8n **và Caddy** (reverse proxy chung, `/opt/n8n/Caddyfile`, network `n8n_default`).
- `/opt/chatwoot` — Chatwoot (`chat.corepviet.com`, rails bind `127.0.0.1:3001`).
- `/root/zalocrm-ops` — script vận hành, backup, `config-backups/`.
- Domain: `zalocrm.corepviet.com` → Caddy → `172.17.0.1:3080`; `n8n.corepviet.com` → n8n.
- Storage app: `STORAGE_DRIVER=local`, volume `file_storage` (~3.7 GB) phục vụ `/files/`. **MinIO không được dùng** (bucket rỗng, DB 0 tham chiếu).
- Giờ cao điểm 7–12h. Mốc backup: hằng ngày 02:30, Chủ nhật 04:30 — tránh thao tác production trong các khung này.

---

## 3. Việc đã hoàn thành

### 3.1 Code (đã merge vào main 18/09)

Chuỗi branch nối tiếp nhau (SHA dưới đây là trước rebase; sau rebase lên `29e4e94` lần lượt thành `915bbe1`, `740a50c`, `0965086`, `55a876e`, `229621a`, `ed67bc1`, `da12ca1`). Xung đột duy nhất khi rebase: cuối `DEPLOY.md`, giải bằng cách giữ cả ghi chú D0D của main lẫn mục risk #5 của PR-00.

| Commit | Branch | Nội dung |
|---|---|---|
| `067e388` | `feat/messenger-pr-00-safety-foundation` | PR-00 production safety foundation |
| `f4b13e7` | `feat/messenger-pr-01-zalo-characterization` | PR-01 test characterization Zalo |
| `091b22d` | (cùng branch trên) | Runbook production v1.2 (đóng băng) |
| `d95be9d` | `feat/ops-deploy-backup-scripts` | Script deploy/rollback, backup media, verify restore |
| `a331157` | (cùng branch) | Backup off-site tự động hằng ngày + verify hằng tuần |
| `d703d28` | (cùng branch) | Fix race cryptcheck media, thứ tự load env, lock tuần |
| `7f43b06` | (cùng branch) | Fix newline cuối file cron/logrotate |

### 3.2 D0B-1 — Nền tảng backup/restore ✅

- Script ops cài vào `/root/zalocrm-ops/` (quyền 700).
- Off-site: rclone trên VPS, remote `gdrive:` (OAuth client riêng, scope `drive.file`) và `gdrive-crypt:` (mã hoá). Đường dẫn `gdrive-crypt:db/YYYYMMDD/`, `media/YYYYMMDD/`. Mật khẩu crypt **chỉ** lưu trong password manager của user.
- Restore test: DB 154 MB, 127 migration, **RTO 11 giây**.

### 3.3 D0C-AUTO / D0C — Backup tự động ✅

- `/etc/cron.d`: daily 02:30 (dump DB + copy off-site + mirror media), weekly Chủ nhật 04:30 (verify restore + cryptcheck media).
- `/etc/logrotate.d` đã cài.
- Lần chạy thật đầu tiên PASS (mirror media lần đầu 3360 s do giới hạn tạo file của Drive với ~5800 file nhỏ).
- Weekly chạy tay: restore 11 s, cryptcheck media 0 khác biệt.

### 3.4 D0D — Đóng cổng app 3080 ✅

- `docker-compose.yml`: `"${APP_PORT:-3080}:3000"` → `"172.17.0.1:${APP_PORT:-3080}:3000"`.
- Caddy upstream `172.17.0.1:3080`.
- Kết quả: ngoài vào `:3080` = 000, domain = 200, Zalo 2/2 connected, user test gửi/nhận OK.
- Backup compose VPS: `/root/zalocrm-ops/config-backups/docker-compose.yml.20260917-191230`.
- Commit `99e16ca` + tài liệu `c709f29` (ghi chú rollback trong `DEPLOY.md`) → đã merge + push.
- Log sau recreate: toàn bộ ERROR là `getFriendOnlines failed` (cron presence 60 s × 2 tài khoản) — **không chặn**, đưa vào backlog.

### 3.5 D0E-9000 — Đóng cổng MinIO 9000 ✅

- Audit P1: MinIO `:9000` đang public (curl ngoài = 200), bucket rỗng, app dùng storage local → đóng an toàn.
- `docker-compose.yml`: `"${MINIO_PORT:-9000}:9000"` → `"127.0.0.1:${MINIO_PORT:-9000}:9000"`.
- VPS: backup compose `.20260917-212722`, `docker compose up -d --no-deps --pull never minio`; app **không** bị recreate (container ID giữ nguyên).
- Kết quả: ngoài vào `:9000` = 000, app ready 200, MinIO local 200, user test gửi/nhận ảnh OK (21:27).
- Commit `29e4e94` → ff-merge + push `origin/main` lúc 21:34.

### 3.6 D0E-5678 — Đóng cổng n8n 5678 ✅

- Mapping nằm ở `/opt/n8n/docker-compose.poppler.yml` dòng 8: `"5678:5678"` → `"127.0.0.1:5678:5678"`.
- n8n chạy từ **3 file compose**; lệnh compose mặc định thiếu file poppler (hash lệch). **Luôn dùng:**
  `docker compose -p n8n -f /opt/n8n/docker-compose.yml -f /opt/n8n/docker-compose.override.yml -f /opt/n8n/docker-compose.poppler.yml ...`
- `/opt/n8n` không phải git repo. Backup: `/root/zalocrm-ops/config-backups/n8n-docker-compose.poppler.yml.20260917-223026`.
- Recreate `--no-deps --pull never n8n`: 22:30:27 → healthz 200 lúc 22:30:48 (downtime ~21 s). Caddy không bị recreate, image n8n `2.28.6-poppler` giữ nguyên.
- Kết quả: ngoài vào `:5678` = 000 (kiểm lại 22:32), domain = 200, Caddy → `n8n:5678` OK.
- Webhook thật `TAO_DON_HANG_LARK` lúc 22:32:42 chạy thành công toàn luồng (36 s).
- 2 lần ABORT trước đó (22:17, 22:23) do gate dò DB Chatwoot — VPS không bị sửa. Chatwoot đã được user xoá khỏi VPS.
- Kiểm tra trước đó, user kiểm tay 3 mục **đều sạch**:
  1. 4 workflow active không đọc được qua MCP — không dùng `5678`/IP/`localhost`/`9000`/`minio`.
  2. Data table `misa_subscriptions_v3.hook_url` — không có `:5678` hoặc IP trần.
  3. Webhook bên ngoài (SePay, Telegram, GHN, MISA, Lark) — đều gọi qua `n8n.corepviet.com`.
- Repo ZaloCRM không có tham chiếu `:5678`; ZaloCRM `integrations` = 0 URL dùng IP/5678; `WEBHOOK_URL`/`N8N_HOST` của n8n dùng domain.

---

## 4. Việc cần triển khai tiếp (theo thứ tự)

### 4.1 D0F — Đóng cổng voi-crm-app 3081 (tuỳ chọn, ngoài phạm vi Messenger)

- `voi-crm-app` là hệ thống riêng của Vối Coffee, độc lập với ZaloCRM → **không chặn** D1/Meta Spike/PR-02a…PR-08.
- Chỉ làm nếu chủ app VOI đồng ý; trước đó phải xác nhận không có thiết bị/POS/n8n/đối tác nào gọi thẳng `IP:3081`.
- `voi-crm-app` publish `0.0.0.0:3081` (public, bỏ qua Caddy); Caddy upstream `172.17.0.1:3081`, domain `crm.voicoffee.vn`.
- **P1 chạy 18/09 05:39:** voi-crm là bản fork ZaloCRM ở `/opt/ZaloCRM-voicoffee` (**không phải git repo**), compose 2 file; dòng cần sửa duy nhất là `docker-compose.voi.yml:5` (`"${APP_PORT:-3081}:3000"`); `HASH_ALL_FILES_MATCH`, `IMAGE_SAME`, `CONFIG_OK`, `.env` mode 600. Mẫu 60s lúc 05:39 = 0 kết nối (không kết luận được vì ngoài giờ làm việc).
- **Phát hiện kèm theo:** `voi-crm-minio` publish `0.0.0.0:9010` public (giống lỗi D0E-9000); `voi-crm-app` có 1 env chứa IP hoặc `:3081` — phải biết tên biến trước khi đóng cổng.
- P1b (`d0f-p1b-3081-9010.sh`, sha `423b74ea…`) chờ chạy trong khung 09:00–11:00: tên biến env, phân loại `S3_PUBLIC_URL`/`APP_URL`, quét DB tìm URL gắn cứng IP, DNS, lấy mẫu kết nối 120s cho cả 3081 và 9010.
- Phase 2 (ghi) chỉ soạn sau khi P1b sạch; vẫn cấm chạy trong khung 7–12h.

### 4.1b Dọn tàn dư Chatwoot (gói riêng)

- Caddy vẫn nối network `chatwoot_default`; Caddyfile có thể còn block `chat.corepviet.com` (domain hiện trả 000); DNS record; volume/image cũ.
- Sửa Caddyfile phải backup + `caddy validate` trước `caddy reload` (cần duyệt).

### 4.2 Đồng bộ VPS với git (bước C trong gói duyệt D1)

- Xác nhận diff VPS đúng 2 dòng trùng `99e16ca` + `29e4e94`.
- Chạy **liền nhau**, không `compose up` xen giữa: `git checkout -- docker-compose.yml` rồi `git pull --ff-only`.
- ⚠️ Rollback về SHA cũ hơn `99e16ca`/`29e4e94` (vd `850dea1`) sẽ **mở lại** cổng 3080/9000.

### 4.3 Đưa code local lên main ✅ XONG 18/09

- Rebase cả 3 branch lên `29e4e94`, ff-merge vào `main` = `da12ca1`, đã push `origin/main`.
- Điều kiện "OPS scripts phải có trước D1" đã đạt.

### 4.4 D1 và các PR Messenger

1. D1 theo runbook v1.2 (gồm bước C ở 4.2).
2. **Meta Spike** — phải PASS trước PR-02a.
3. PR-02a / PR-02b → PR-03 … PR-08.
4. D0B-2 rehearsal (diễn tập restore/rollback đầy đủ).

---

## 5. Theo dõi / kiểm tra định kỳ

- [x] Cron daily sáng **18/09/2026** ✅ PASS: dump `zalocrm-20260918-023001.sql.gz` 16.6 MB xong 02:30:44, `gzip -t` OK, Drive `db/20260918/` có dump + sha256, media-mirror 5.820 file / 3.69 GiB, đĩa 72%. Cảnh báo duy nhất: chưa cấu hình URL healthcheck (backlog).
- [ ] Kiểm tra cron weekly sau **Chủ nhật 20/09/2026** 04:30 (restore + cryptcheck).
- [ ] Theo dõi log app sau D0D/D0E: ngoài `getFriendOnlines` không có lỗi mới.

---

## 6. Backlog

**Bảo mật (ưu tiên cao)**
- Đổi mật khẩu root VPS; hardening sshd (tắt password login sau khi xác nhận key).
- Xác nhận đã thu hồi Google OAuth token/secret từng bị lộ.
- n8n: nhiều workflow hardcode secret trong node → chuyển sang **Credentials** trước, **rồi** rotate.
- Quyền file `.env` đang 644 → cân nhắc 600.

**Backup**
- C7 tar local, Healthchecks.io cho cron, retention trên Drive.
- Nit A.3: vòng retention tmp log tên rỗng; rclone stats cần `--stats-log-level NOTICE`.

**Ứng dụng / compose**
- Gỡ `minio` + `minio-init` (PR riêng, sau khi bỏ `depends_on` minio của app).
- Sửa comment `docker-compose.yml` dòng ~156–158 ("Zalo CDN cần 9000") — sai, media được tải về file tạm.
- `getFriendOnlines failed` (`presence-service.ts`, code unknown) — chỉ ảnh hưởng chấm online, ưu tiên thấp.

**n8n**
- Workflow `cHTNu1XlM1bWVwUH` có tool ghi — rà soát quyền.
- Gắn `errorWorkflow` cho 5 workflow chưa có.

**Dọn dẹp local**
- Thư mục `.ops-run/` (wrapper D0B) nằm trong repo, chưa track → chuyển ra ngoài hoặc thêm `.git/info/exclude`; không commit.
- Các branch `chore/d0d-bind-app-port`, `chore/d0e-bind-minio-port` đã vào main → có thể xoá local khi user đồng ý.

---

## 7. Quy tắc vận hành đã thống nhất (áp dụng cho phiên sau)

- **Không** tự deploy, migrate, restart, sửa `.env`, rotate token, hay bật Messenger cho khách thật trên production. Mỗi thao tác ghi production = 1 gói duyệt → chạy → **STOP** → báo cáo.
- Không in `.env`, Env container, `rclone.conf`, token/secret; `docker compose config` chỉ dùng `--quiet`/`--hash`.
- Không `--force` push; commit/push chỉ khi được yêu cầu.
- Script viết sẵn dạng `.sh` LF **ngoài repo** (scratchpad), gọi qua wrapper trong Git Bash; AI thực thi không tự tạo file bằng PowerShell here-string/perl/python khi nội dung có `$`.
- Kiểm script trước khi chạy: `sha256sum` khớp + `od -An -tx1 FILE | grep -c ' 0d'` = 0 + `bash -n`.
- SSH: `ssh -i ~/.ssh/zalocrm_ops -o BatchMode=yes -o ConnectTimeout=20 root@157.66.219.190 'bash -s' < script.sh`; `docker exec` luôn kèm `< /dev/null`; `pgrep -f` loại trừ `$$`.
- Không kill tiến trình backup, không xoá dữ liệu Drive.
- Báo cáo n8n chỉ nêu tên workflow/node, không nêu giá trị secret hay dữ liệu khách.
