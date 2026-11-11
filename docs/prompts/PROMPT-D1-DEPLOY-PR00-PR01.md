# PROMPT D1 — Deploy PR-00 + PR-01 lên production ZaloCRM Cờ Rếp Việt

> Copy toàn bộ prompt này vào session AI mới để thực hiện bước D1.

---

## BỐI CẢNH DỰ ÁN

- **Repo local:** `D:\ZaloCRM-CorepViet`
- **VPS:** 157.66.219.190 (Ubuntu 22.04)
- **SSH:** `ssh -i ~/.ssh/zalocrm_ops -o BatchMode=yes root@157.66.219.190 '<lệnh>'`
- **Remote scripts:** LF-only, verified, chạy qua Git Bash không PowerShell
- **Hệ thống:** ZaloCRM Cờ Rếp Việt (KHÔNG phải VoiCRM — VoiCRM là hệ thống riêng cùng VPS, không thuộc scope)
- **Tài liệu gốc:** `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md` (runbook v1.2 đóng băng) — khi hai tài liệu conflict, runbook này wins

## RÀNG BUỘC BẮT BUỘC (KHÔNG ĐƯỢC VI PHẠM)

1. Không deploy/migration/restart/recreate nếu chưa được duyệt rõ ràng
2. Không đọc/in `.env`, container Env, token, password, secret, rclone.conf
3. Không in toàn bộ `docker compose config`
4. Không in dữ liệu khách hàng; chỉ dùng count/size/status
5. Không dùng `docker system prune`, không xoá volume/container/image nếu chưa duyệt
6. Không push/merge nếu chưa được duyệt
7. Mọi lệnh thay đổi VPS phải ghi **COMMAND REQUIRES APPROVAL** và chờ duyệt

## TIỀN ĐỀ (PHẢI ĐÃ PASS — KIỂM TRA TRƯỚC KHI BẮT ĐẦU)

| Gate | Trạng thái yêu cầu |
|---|---|
| D0A | PASS — disk < 70%, image tag rollback `850dea1` tồn tại |
| D0B-1 | PASS — backup DB + media + off-site + restore test OK |
| D0C-AUTO | PASS — automated daily/weekly backup + off-site hoạt động |
| D0D | PASS — port 3080 bind `172.17.0.1` (commit 99e16ca) |
| D0E | PASS — MinIO 9000 + n8n 5678 bind loopback |
| .env chmod 600 | PASS |
| PR-00 | ✅ commit `067e388` — feature flags, key unification, health block |
| PR-01 | ✅ commit `f4b13e7` — 6 file characterization test, 87 test |
| OPS | ✅ scripts committed — deploy.sh, backup-offsite.sh, backup-media.sh, verify-restore.sh |

## NHIỆM VỤ D1

Deploy PR-00 + PR-01 + OPS lên production. **KHÔNG CÓ MIGRATION.** Chỉ code change. Messenger flag OFF (mặc định false, chưa thêm `MESSENGER_*` vào `.env` production).

### Bước 1: Pre-deploy inspection (không thay đổi VPS)

```
1.1 Kiểm tra git status trên VPS:
    - Branch hiện tại (phải là main)
    - HEAD commit (ghi lại SHA — expected: 850dea1)
    - ⚠️ docker-compose.yml ĐÃ ĐƯỢC SỬA TAY (D0D+D0E) nên working tree CÓ thay đổi
    - Xác nhận chỉ docker-compose.yml modified, không có file khác

1.2 So sánh HEAD VPS vs HEAD local:
    - Xác nhận local đã có PR-00 (067e388) + PR-01 (f4b13e7) + OPS
    - Xác nhận commit sẽ deploy (ghi SHA)

1.3 Kiểm tra disk space:
    - `df -h /` — phải < 80% sau khi build (~1-2G overhead)
    - Nếu > 75%: đề xuất `docker builder prune -f` (COMMAND REQUIRES APPROVAL)

1.4 Kiểm tra health hiện tại:
    - curl https://zalocrm.corepviet.com/health/ready (phải 200)
    - Ghi baseline: container restart count, uptime, số error log 15 phút gần nhất

1.5 Chạy test suite trên local:
    - `cd backend && npx vitest run` — ghi số pass/fail
    - Đặc biệt: characterization tests PR-01 phải pass
    - File fail ≤ 38 (baseline nợ cũ, không do Messenger)

1.6 Kiểm tra deploy.sh tồn tại và chạy được:
    - `cat scripts/ops/deploy.sh | head -5` (chỉ xem header)
    - `bash -n scripts/ops/deploy.sh` (syntax check)
```

### Bước 2: Backup trước deploy

```
2.1 Dump DB thủ công trên VPS (COMMAND REQUIRES APPROVAL):
    docker exec zalo-crm-db pg_dump -U <user> -Fc <dbname> > /root/backups/pre-d1-$(date +%Y%m%d-%H%M%S).dump

2.2 Verify backup:
    - File tồn tại, size hợp lý (~16-20 MB)
    - pg_restore --list trên dump OK (không cần restore thật)

2.3 Ghi tag rollback cho image hiện tại (COMMAND REQUIRES APPROVAL):
    OLD=$(ssh ... 'cd /root/ZaloCRM-CorepViet && git rev-parse --short HEAD')
    ssh ... "docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:$OLD"

2.4 Verify image tag:
    ssh ... 'docker image ls zalocrm-corepviet-app' — phải thấy tag $OLD
```

### Bước 3: Deploy (COMMAND REQUIRES APPROVAL — DỪNG VÀ CHỜ DUYỆT)

```
Lệnh deploy chuẩn (từ runbook §13 + biên bản bàn giao §4.2):

cd /root/ZaloCRM-CorepViet
OLD=$(git rev-parse --short HEAD)
docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:$OLD

# ⚠️ QUAN TRỌNG: docker-compose.yml đã sửa tay (D0D+D0E).
# Phải discard manual edits trước khi pull — git đã có commits 99e16ca + 29e4e94 cho D0D+D0E.
git checkout -- docker-compose.yml
git pull --ff-only

# Verify HEAD mới = da12ca1 (PR-00 + PR-01 + OPS)
git log --oneline -5

docker compose -f docker-compose.yml build app
docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:$(git rev-parse --short HEAD)
docker compose -f docker-compose.yml up -d --no-deps app

Hoặc nếu deploy.sh đã sẵn sàng (kiểm tra deploy.sh có handle git checkout -- trước):
./scripts/ops/deploy.sh da12ca1

⚠️ CẢNH BÁO ROLLBACK: Nếu rollback về SHA cũ hơn 99e16ca → port 3080/9000 sẽ MỞ LẠI ra ngoài.
   Rollback chỉ nên về 850dea1 (image tag đã tạo ở Bước 2.3), và phải sửa docker-compose.yml lại.

Ghi rõ:
- SHA cũ: 850dea1
- SHA mới: da12ca1
- Thời điểm deploy: ___
- Giờ thấp điểm: xác nhận log inbound 15 phút gần nhất ít
```

**⚠️ DỪNG ĐÂY — TRÌNH BÀY TOÀN BỘ LỆNH VÀ CHỜ TÔI DUYỆT TRƯỚC KHI CHẠY.**

### Bước 4: Post-deploy verification (§14.1 Zalo — bắt buộc sau MỌI bước deploy)

```
4.1 Health:
    - /health/live → 200
    - /health/ready → 200 (db: connected, redis: connected)
    - /health/ready phải có khối messenger: {enabled: false, status: "disabled"}
    - HTTPS: curl https://zalocrm.corepviet.com/health/ready → 200

4.2 Container:
    - zalo-crm-app healthy, restart=0
    - Log khởi động không có FATAL
    - Mỗi nick Zalo có dòng listener connected

4.3 Zalo flow (thủ công hoặc kiểm tra log):
    - Gửi 1 tin từ Zalo test → xuất hiện trong UI realtime
    - Trả lời từ CRM → đến Zalo test
    - Mở conversation cũ: lịch sử hiển thị
    - AI suggestion trả lời được 1 conversation test
    - bull:group-scan không có failed mới

4.4 Crypto verification:
    - Token AI (app_settings) vẫn decrypt được — gọi AI suggestion 1 lần xác nhận
    - Đây là test TOKEN_ENCRYPTION_KEY keyring (PR-00 thay đổi)

4.5 Error log:
    - So baseline trước deploy
    - Không tăng bất thường (baseline ~390 dòng/giờ, chủ yếu getFriendOnlines)
    - Không có lỗi mới liên quan messenger-config hoặc token-encryption

4.6 Hạ tầng:
    - Disk < 80%
    - Port 3080/9000/5678 vẫn không vào được từ ngoài
    - Caddy validate OK
    - TLS OK

4.7 Image tag mới:
    docker image ls zalocrm-corepviet-app — phải có tag <SHA-MỚI>
```

### Bước 5: Rollback (nếu bất kỳ verify fail)

```
Trigger rollback khi:
- /health/ready ≠ 200 sau 3 phút
- Lỗi Zalo inbound/outbound
- Log TOKEN_ENCRYPTION_KEY fatal
- Error log tăng > 3× baseline

Lệnh rollback (COMMAND REQUIRES APPROVAL):
docker tag zalocrm-corepviet-app:$OLD zalocrm-corepviet-app:latest
git checkout $OLD
docker compose -f docker-compose.yml up -d --no-deps --no-build app

Thời gian dự kiến: < 1 phút (không build lại)
```

### Bước 6: Báo cáo

```
Output cần ghi:
- D1: PASS / FAIL
- SHA cũ → SHA mới
- Thời gian deploy (bắt đầu → verify xong)
- Downtime (nếu có, tính bằng giây)
- Image tag rollback đã lưu
- Kết quả từng mục §14.1
- Bất kỳ observation bất thường
```

## SAU D1

Bước tiếp theo: **Meta Spike** (track riêng, xem PROMPT-META-SPIKE.md). D1 PASS + Meta Spike PASS + Gate §11 đầy đủ → mở PR-02a.
