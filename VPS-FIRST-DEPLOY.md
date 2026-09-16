# ZaloCRM First Deploy — VPS vpssieutoc

> **VPS**: Ubuntu 22.04, 8GB RAM, IP 157.66.219.190
> **Domain**: zalocrm.corepviet.com
> **Stack**: Docker Compose + Caddy HTTPS
> **Repo**: https://github.com/huynhthuan12321/ZaloCRM-CorepViet.git

---

## BƯỚC 1 — Clone repo

```bash
cd /root
git clone https://github.com/huynhthuan12321/ZaloCRM-CorepViet.git
cd ZaloCRM-CorepViet
```

---

## BƯỚC 2 — Tạo file .env

```bash
cp backend/.env.example .env
```

---

## BƯỚC 3 — Sinh secrets (copy kết quả ra notepad)

```bash
echo "=== COPY CÁC GIÁ TRỊ NÀY ==="
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "MINIO_USER=minio$(openssl rand -hex 4)"
echo "MINIO_PASS=$(openssl rand -hex 24)"
echo "=== HẾT ==="
```

→ **Copy 5 giá trị output** ra notepad trước khi qua bước 4.

---

## BƯỚC 4 — Sửa .env

```bash
nano .env
```

**Sửa từng dòng** (dùng `Ctrl+W` trong nano để tìm nhanh):

### 4.1 — APP_URL (tìm `APP_URL`)
```
APP_URL=https://zalocrm.corepviet.com
```

### 4.2 — JWT_SECRET (tìm `JWT_SECRET=`)
```
JWT_SECRET=<paste-giá-trị-từ-bước-3>
```

### 4.3 — ENCRYPTION_KEY (tìm `ENCRYPTION_KEY=`)
```
ENCRYPTION_KEY=<paste-giá-trị-từ-bước-3>
```

### 4.4 — Database (tìm `DB_PASSWORD=`)
```
DB_PASSWORD=<paste-DB_PASSWORD-từ-bước-3>
```

Tìm `DATABASE_URL=` và sửa thành (thay `XXXX` bằng DB_PASSWORD vừa paste):
```
DATABASE_URL=postgresql://crmuser:XXXX@db:5432/zalocrm
```

### 4.5 — MinIO (tìm `S3_ACCESS_KEY`)
```
S3_ACCESS_KEY=<paste-MINIO_USER-từ-bước-3>
S3_SECRET_KEY=<paste-MINIO_PASS-từ-bước-3>
S3_PUBLIC_URL=https://zalocrm.corepviet.com:9000
```

### 4.6 — Thêm vào CUỐI file (sau dòng cuối cùng)

```
# === MinIO Docker credentials ===
MINIO_ROOT_USER=<paste-MINIO_USER-từ-bước-3-TRÙNG-S3_ACCESS_KEY>
MINIO_ROOT_PASSWORD=<paste-MINIO_PASS-từ-bước-3-TRÙNG-S3_SECRET_KEY>

# === PR-04 Production Hardening (8GB VPS) ===
AI_CIRCUIT_FAILURE_THRESHOLD=5
AI_CIRCUIT_COOLDOWN_MS=30000
AI_CIRCUIT_HALF_OPEN_MAX=1
AI_RATE_LIMIT_PER_ORG=60
AI_RATE_LIMIT_WINDOW_MS=60000
APP_MEMORY_LIMIT=4G
APP_CPU_LIMIT=2
APP_MEMORY_RESERVATION=512M
DB_MEMORY_LIMIT=2G
APP_DOMAIN=zalocrm.corepviet.com
```

### 4.7 — AI Provider keys (nếu dùng AI auto-reply)

Tìm `ANTHROPIC_API_KEY=` và điền key:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Hoặc Gemini:
```
GEMINI_API_KEY=AIza...
```

### 4.8 — Lưu file

`Ctrl+O` → `Enter` → `Ctrl+X`

### 4.9 — Kiểm tra .env

```bash
# Phải KHÔNG còn placeholder
grep -i 'changeme\|your-domain\|minioadmin' .env
# → Nếu output trống = OK
# → Nếu còn dòng nào = quay lại sửa

# Kiểm tra biến quan trọng có giá trị
grep -E '^(JWT_SECRET|ENCRYPTION_KEY|DB_PASSWORD|DATABASE_URL|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD)=' .env
# → Mỗi dòng PHẢI có giá trị sau dấu =
```

---

## BƯỚC 5 — Build images

```bash
cd /root/ZaloCRM-CorepViet
docker compose build
```

⏱ Lần đầu mất **5-10 phút**. Nếu lỗi npm/memory:
```bash
# Thử build lại không cache
docker compose build --no-cache
```

**Kết quả mong đợi**: dòng cuối có `Successfully built` hoặc `=> exporting to image`

---

## BƯỚC 6 — Khởi động DB + Redis + MinIO trước

```bash
docker compose up -d db redis minio
```

Đợi tất cả healthy (~1-2 phút):
```bash
watch -n 2 'docker compose ps'
```
(`Ctrl+C` khi thấy tất cả `healthy`)

**Kết quả mong đợi**:
```
zalo-crm-db      healthy
zalo-crm-redis   healthy
zalo-crm-minio   healthy
```

---

## BƯỚC 7 — Chạy Prisma migrations

```bash
docker compose run --rm app npx prisma migrate deploy
```

**Kết quả mong đợi**: `All migrations have been successfully applied` hoặc danh sách migrations applied.

---

## BƯỚC 8 — Khởi động toàn bộ stack + Caddy HTTPS

> ⚠️ **VPS 157.66.219.190 hiện tại (đính chính 2026-09-16): KHÔNG chạy overlay `docker-compose.caddy.yml`.**
> HTTPS do Caddy DÙNG CHUNG trong `/opt/n8n` đảm nhận (reverse proxy tới `172.17.0.1:3080`).
> Chạy overlay sẽ tạo Caddy thứ hai tranh cổng 80/443 → sập HTTPS của cả n8n và ZaloCRM.
> Trên VPS này chỉ dùng: `docker compose -f docker-compose.yml up -d` (lần đầu) hoặc
> `docker compose -f docker-compose.yml up -d --no-deps app` (cập nhật app) — xem `DEPLOY.md`.
> Overlay bên dưới chỉ áp dụng cho VPS MỚI không có reverse proxy nào khác.

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Kiểm tra tất cả đang chạy:
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml ps
```

**Kết quả mong đợi**: app, db, redis, minio, caddy đều `running` hoặc `healthy`.

---

## BƯỚC 9 — Kiểm tra

### 9.1 — App log không lỗi
```bash
docker compose logs app --tail 50
```
→ Tìm dòng `Server listening` hoặc `started on 0.0.0.0:3000`
→ **KHÔNG** có `FATAL: Production config validation failed`

### 9.2 — Health check nội bộ
```bash
curl -s http://localhost:3000/health/live
```
→ Mong đợi: `{"status":"ok","uptime":...}`

```bash
curl -s http://localhost:3000/health/ready
```
→ Mong đợi: `{"status":"ok","db":"connected","redis":"connected","messenger":{"status":"disabled",...},...}`
→ Từ host (ngoài container) cổng là `APP_PORT` (mặc định 3080): `curl -s http://127.0.0.1:3080/health/ready`.
→ Khối `messenger` chỉ để tham khảo, KHÔNG ảnh hưởng mã 200/503.

### 9.3 — HTTPS qua domain
```bash
curl -s https://zalocrm.corepviet.com/health/ready
```
→ Mong đợi: `{"status":"ok","db":"connected","redis":"connected",...}`

Nếu HTTPS chưa chạy, kiểm tra Caddy log:
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs caddy --tail 30
```

### 9.4 — Mở trình duyệt
Truy cập `https://zalocrm.corepviet.com` → phải thấy trang login.

### 9.5 — Resource limits đúng
```bash
docker stats --no-stream
```
→ MEM LIMIT của `zalo-crm-app` = `4GiB`, `zalo-crm-db` = `2GiB`

---

## BƯỚC 10 — Tạo tài khoản admin đầu tiên (nếu DB mới)

```bash
docker compose exec app npx tsx scripts/seed.ts
```

Hoặc đăng ký qua UI nếu có trang register.

---

## NẾU LỖI — Rollback / Debug

### App crash loop (restart liên tục)
```bash
docker compose logs app --tail 100
```
Lỗi phổ biến:
- `FATAL: Production config validation failed` → thiếu JWT_SECRET/ENCRYPTION_KEY → sửa .env
- `ECONNREFUSED db:5432` → DB chưa healthy → `docker compose ps` kiểm tra
- `MINIO_ROOT_USER must be set` → thiếu trong .env → thêm vào

### Caddy không cấp SSL
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs caddy --tail 50
```
Lỗi phổ biến:
- DNS chưa trỏ đúng → `dig zalocrm.corepviet.com` phải trả 157.66.219.190
- Port 80/443 bị firewall chặn → `ufw allow 80 && ufw allow 443`

### Xóa sạch làm lại
> ⛔ **KHÔNG BAO GIỜ chạy trên production đang có dữ liệu.** `down -v` xoá volume DB/media vĩnh viễn.
> Chỉ dùng cho VPS mới chưa có dữ liệu thật, sau khi đã có backup + restore test (`docs/runbooks/BACKUP-RESTORE.md`).
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml down
docker compose down -v  # CẢNH BÁO: xóa volumes = mất data
docker compose build --no-cache
```

---

## SAU KHI DEPLOY THÀNH CÔNG

### Kiểm tra firewall
> ⚠️ **Docker bỏ qua ufw**: cổng publish dạng `"3080:3000"` (bind 0.0.0.0) vẫn mở ra Internet dù ufw chặn.
> Kiểm tra thực tế bằng `docker ps --format '{{.Names}} {{.Ports}}'` và `ss -ltnp`, không chỉ `ufw status`.
> Cổng chỉ dùng nội bộ phải bind `127.0.0.1:` (db, redis đã làm) hoặc chặn ở chain `DOCKER-USER`.
> Đổi bind của app trên VPS này phải giữ cho Caddy dùng chung vẫn tới được `172.17.0.1:3080` — cần duyệt riêng.
```bash
ufw status
# Chỉ mở: 22 (SSH), 80 (HTTP), 443 (HTTPS)
# Nếu chưa:
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

### Kiểm tra backup tự động
```bash
docker compose ps backup
ls -la ./backups/
```
> Service `backup` chạy `@daily` và **không** backup lúc khởi động: thư mục `backups/` rỗng cho tới 00:00.
> Container "healthy" KHÔNG có nghĩa đã có bản dump. Media volume và off-site không được service này backup.
> Quy trình đầy đủ + restore test: `docs/runbooks/BACKUP-RESTORE.md`.

### Monitoring đơn giản
```bash
# Xem log app real-time
docker compose logs -f app

# Disk usage
df -h /
docker system df
```
