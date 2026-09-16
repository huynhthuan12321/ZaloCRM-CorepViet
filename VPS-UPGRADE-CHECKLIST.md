# ZaloCRM VPS Upgrade Checklist — PR-01 → PR-04

> **Kịch bản**: VPS 8GB RAM, Docker Compose đang chạy, Caddy reverse proxy đang chạy, domain + DNS đã có.
> **Mục tiêu**: Upgrade ZaloCRM để bật PR-01 (AI Privacy Guard), PR-02 (Opik Trace), PR-03 (Promptfoo Eval), PR-04 (Production Hardening).
> **Lưu ý**: Đây là controlled single-container restart — có downtime ngắn (~10-30 giây).

---

## PHASE 1 — Chuẩn bị (trước khi đụng gì trên VPS)

### 1.1 Backup trước upgrade

```bash
# SSH vào VPS
ssh user@your-vps-ip

# Kiểm tra trạng thái hiện tại
cd /path/to/ZaloCRM-CorepViet
docker compose ps
docker compose logs app --tail 5

# Backup DB thủ công (QUAN TRỌNG — làm TRƯỚC mọi thay đổi)
docker exec zalo-crm-db pg_dump -U crmuser zalocrm | gzip > ~/backup-pre-pr04-$(date +%Y%m%d-%H%M%S).sql.gz

# Ghi lại commit hiện tại để rollback nếu cần
git log --oneline -1
# → Ghi ra giấy: ___________________________
```

**[ ] Đã backup DB thành công (file .sql.gz tồn tại, > 0 bytes)**
**[ ] Đã ghi commit hash hiện tại**

### 1.2 Kiểm tra disk space

```bash
df -h /
docker system df
```

Cần ít nhất 3GB trống cho build image mới. Nếu thiếu:
```bash
docker image prune -f
docker builder prune -f
```

**[ ] Disk trống >= 3GB**

### 1.3 Kiểm tra health hiện tại

```bash
# Health endpoint (nếu đang chạy version cũ có thể chưa có /health/ready)
curl -s http://localhost:3000/api/v1/status || echo "Endpoint cũ khác — OK"
curl -s https://your-domain.com/api/v1/status || echo "Kiểm tra qua domain"
```

**[ ] ZaloCRM đang chạy bình thường**

---

## PHASE 2 — Pull code mới

```bash
cd /path/to/ZaloCRM-CorepViet

# Lưu thay đổi local nếu có
git stash

# Pull code mới (chứa PR-01 → PR-04)
git pull origin main
# Hoặc checkout branch cụ thể nếu dùng branch:
# git checkout pr-04-production-hardening && git pull

# Kiểm tra file mới có mặt
ls -la backend/src/modules/ai/ai-circuit-breaker.ts
ls -la backend/src/modules/ai/ai-rate-limiter.ts
ls -la backend/src/config/validate-production-config.ts
ls -la backend/src/shared/http/request-id.ts
ls -la backend/src/shared/http/error-classifier.ts
ls -la backend/src/shared/http/health.ts
ls -la docker/Caddyfile
ls -la docker-compose.caddy.yml
```

**[ ] Git pull thành công**
**[ ] Các file PR-04 tồn tại**

---

## PHASE 3 — Cấu hình .env cho PR-04

### 3.1 Thêm biến PR-04 mới vào .env

```bash
# Mở .env để edit
nano .env
# hoặc: vim .env
```

**Thêm các biến sau vào cuối file `.env`** (nếu chưa có):

```env
# === PR-04 Production Hardening (thêm mới) ===

# AI Circuit Breaker — tự ngắt provider khi lỗi liên tục
AI_CIRCUIT_FAILURE_THRESHOLD=5
AI_CIRCUIT_COOLDOWN_MS=30000
AI_CIRCUIT_HALF_OPEN_MAX=1

# AI Per-Org Rate Limit — giới hạn gọi AI mỗi org
AI_RATE_LIMIT_PER_ORG=60
AI_RATE_LIMIT_WINDOW_MS=60000

# Docker resource limits — VPS 8GB RAM
APP_MEMORY_LIMIT=4G
APP_CPU_LIMIT=2
APP_MEMORY_RESERVATION=512M
DB_MEMORY_LIMIT=2G
```

### 3.1b (Tùy chọn) Nâng Redis maxmemory cho 8GB RAM

Redis hiện đang cấu hình `--maxmemory 256mb` trong `docker-compose.yml`. Với VPS 8GB, có thể nâng lên 1GB. Sửa trực tiếp trong `docker-compose.yml`:

```yaml
# Trong service redis → command:
command: >
  redis-server
  --appendonly yes
  --appendfsync everysec
  --maxmemory 1gb
  --maxmemory-policy noeviction
```

Hoặc giữ 256mb nếu usage hiện tại chưa cần — kiểm tra bằng:
```bash
docker exec zalo-crm-redis redis-cli info memory | grep used_memory_human
```

### 3.2 Kiểm tra các biến BẮT BUỘC đã có

Các biến sau **PHẢI có giá trị thật** (không phải placeholder) — nếu thiếu, app sẽ `process.exit(1)` ngay khi khởi động:

```bash
# Kiểm tra nhanh
grep -E '^JWT_SECRET=' .env        # PHẢI có, >= 32 ký tự, KHÔNG phải 'changeme'
grep -E '^ENCRYPTION_KEY=' .env    # PHẢI có, >= 32 ký tự, KHÔNG phải 'dev-secret-change-me'
grep -E '^DATABASE_URL=' .env      # PHẢI có
grep -E '^DB_PASSWORD=' .env       # PHẢI có
```

Nếu JWT_SECRET hoặc ENCRYPTION_KEY **chưa có hoặc ngắn**, sinh mới:
```bash
# Sinh secret mới (CHẠY TRÊN VPS)
openssl rand -hex 32
# → Copy kết quả vào JWT_SECRET=
openssl rand -hex 32
# → Copy kết quả vào ENCRYPTION_KEY=
```

> **CẢNH BÁO**: Nếu đổi JWT_SECRET, tất cả user đang login sẽ bị logout.
> Nếu đổi ENCRYPTION_KEY, các token đã mã hóa (Facebook, Zalo) sẽ không giải mã được — cần relink.

### 3.3 Kiểm tra biến Caddy domain

```bash
grep -E '^APP_DOMAIN=' .env
# Phải trùng domain thật, ví dụ: APP_DOMAIN=crm.example.com
```

Nếu chưa có:
```env
APP_DOMAIN=crm.your-domain.com
```

### 3.4 Verify .env hoàn chỉnh

```bash
# Đếm các biến quan trọng
grep -c '=' .env
# Kiểm tra KHÔNG có placeholder
grep -i 'changeme\|your-domain\|minioadmin' .env
# → Nếu còn placeholder nào → sửa trước khi tiếp
```

**[ ] JWT_SECRET đủ dài (>= 32 chars), không phải placeholder**
**[ ] ENCRYPTION_KEY đủ dài (>= 32 chars), không phải placeholder**
**[ ] DATABASE_URL đúng**
**[ ] APP_DOMAIN đúng domain thật**
**[ ] Các biến AI_CIRCUIT_*, AI_RATE_LIMIT_* đã thêm**
**[ ] APP_MEMORY_LIMIT=4G, DB_MEMORY_LIMIT=2G (cho VPS 8GB)**

---

## PHASE 4 — Build & Deploy

### 4.1 Build image mới

```bash
cd /path/to/ZaloCRM-CorepViet

# Build app image (có thể mất 3-5 phút)
docker compose build app
```

Nếu build lỗi do node_modules, thử:
```bash
docker compose build --no-cache app
```

**[ ] Build thành công (không lỗi)**

### 4.2 Chạy Prisma migrations (nếu có schema mới)

```bash
# Kiểm tra migration mới
docker compose run --rm app npx prisma migrate deploy
```

**[ ] Migrations thành công (hoặc "No pending migrations")**

### 4.3 Restart app với Caddy overlay

Vì đang dùng Caddy, chạy với overlay:

```bash
# Restart CHỈ app container (DB, Redis, MinIO giữ nguyên)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d app

# Caddy container cũng cần restart để pick up Caddyfile mới (nếu có thay đổi)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d caddy
```

> **Downtime**: ~10-30 giây trong lúc app container restart.

### 4.4 Theo dõi startup

```bash
# Xem log real-time (Ctrl+C để thoát)
docker compose logs -f app --tail 50
```

**Kiểm tra trong log:**
- **KHÔNG có** `FATAL: Production config validation failed` → nghĩa là .env OK
- **KHÔNG có** `process.exit(1)` messages
- Có dòng `Server listening on 0.0.0.0:3000` hoặc tương tự

Nếu app crash loop (restart liên tục):
```bash
# Xem lý do
docker compose logs app --tail 100
# Lỗi phổ biến: thiếu JWT_SECRET/ENCRYPTION_KEY → xem lại Phase 3.2
```

**[ ] App khởi động thành công, không crash**

---

## PHASE 5 — Xác nhận sau deploy

### 5.1 Health checks

```bash
# Liveness (process alive)
curl -s http://localhost:3000/health/live | python3 -m json.tool
# Expect: { "status": "ok", "uptime": <seconds> }

# Readiness (DB + Redis connected)
curl -s http://localhost:3000/health/ready | python3 -m json.tool
# Expect: { "status": "ok", "db": "connected", "redis": "connected", ... }

# Qua domain (qua Caddy HTTPS)
curl -s https://your-domain.com/health/ready | python3 -m json.tool
```

**[ ] /health/live trả { status: "ok" }**
**[ ] /health/ready trả { status: "ok", db: "connected", redis: "connected" }**

### 5.2 Kiểm tra qua domain HTTPS

```bash
# API status
curl -s https://your-domain.com/api/v1/status | python3 -m json.tool

# Kiểm tra HTTPS certificate hợp lệ
curl -vI https://your-domain.com 2>&1 | grep -E 'SSL|subject|expire'
```

**[ ] API trả response bình thường qua HTTPS**
**[ ] SSL certificate hợp lệ**

### 5.3 Kiểm tra error classification (PR-04)

```bash
# Request với invalid JSON → phải trả 400, KHÔNG lộ stack trace
curl -s -X POST https://your-domain.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d 'not-json' | python3 -m json.tool
# Expect: 400 Bad Request, message rõ ràng, KHÔNG có stack trace
```

### 5.4 Kiểm tra request ID (PR-04)

```bash
# Gửi request với custom request ID
curl -sI https://your-domain.com/health/live -H 'x-request-id: test-123'
# Response header nên có x-request-id: test-123

# Gửi request với malicious request ID → phải bị reject, sinh UUID mới
curl -sI https://your-domain.com/health/live -H 'x-request-id: ../../../etc/passwd'
# Response header nên có x-request-id: <random-uuid>, KHÔNG phải input gốc
```

**[ ] Request ID hợp lệ được giữ nguyên**
**[ ] Request ID độc hại bị thay bằng UUID**

### 5.5 Kiểm tra resource limits

```bash
docker stats --no-stream
# Kiểm tra MEM LIMIT của zalo-crm-app = 4GiB
# Kiểm tra MEM LIMIT của zalo-crm-db = 2GiB
```

**[ ] Resource limits đúng với cấu hình**

### 5.6 Kiểm tra UI hoạt động

Mở trình duyệt, truy cập `https://your-domain.com`:
- [ ] Trang login hiển thị
- [ ] Login thành công
- [ ] Danh sách khách hàng load được
- [ ] Chat/tin nhắn Zalo hoạt động
- [ ] Gửi tin nhắn AI auto-reply hoạt động (nếu bật)

---

## PHASE 6 — Rollback (nếu có vấn đề)

Nếu gặp lỗi nghiêm trọng sau deploy:

```bash
# Quay về commit cũ
git checkout <commit-hash-đã-ghi-ở-bước-1.1>

# Rebuild và restart
docker compose build app
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d app

# Nếu migration lỗi, restore DB từ backup
gunzip < ~/backup-pre-pr04-*.sql.gz | docker exec -i zalo-crm-db psql -U crmuser zalocrm
```

---

## PHASE 7 — Post-deploy monitoring (ngày đầu tiên)

### 7.1 Theo dõi log 30 phút đầu

```bash
# Xem log có lỗi không
docker compose logs app --since 30m | grep -i 'error\|fatal\|ECONNREFUSED'
```

### 7.2 Kiểm tra circuit breaker hoạt động

```bash
# Nếu có AI provider nào bị lỗi, xem log
docker compose logs app --since 1h | grep -i 'circuit'
# Circuit breaker chỉ count lỗi transient (5xx, timeout, connection reset)
# KHÔNG count lỗi 4xx (trừ 429), privacy denied, URL policy
```

### 7.3 Kiểm tra backup tự động

```bash
# Backup service đang chạy
docker compose ps backup

# Có file backup mới nhất
ls -la ./backups/
```

### 7.4 Monitoring dài hạn

```bash
# Crontab kiểm tra health mỗi 5 phút (tùy chọn)
echo "*/5 * * * * curl -sf https://your-domain.com/health/ready > /dev/null || echo 'ZaloCRM DOWN' | mail -s 'ALERT' admin@example.com" | crontab -
```

---

## Tóm tắt biến mới cần thêm vào .env

| Biến | Giá trị khuyến nghị (8GB) | Mô tả |
|------|---------------------------|-------|
| `AI_CIRCUIT_FAILURE_THRESHOLD` | `5` | Số lỗi transient trước khi ngắt provider |
| `AI_CIRCUIT_COOLDOWN_MS` | `30000` | Thời gian chờ trước khi thử lại (30s) |
| `AI_CIRCUIT_HALF_OPEN_MAX` | `1` | Số request thử khi half-open |
| `AI_RATE_LIMIT_PER_ORG` | `60` | Giới hạn gọi AI mỗi org/phút |
| `AI_RATE_LIMIT_WINDOW_MS` | `60000` | Window 1 phút (fixed, không sliding) |
| `APP_MEMORY_LIMIT` | `4G` | RAM tối đa cho app container |
| `APP_CPU_LIMIT` | `2` | CPU cores tối đa cho app |
| `APP_MEMORY_RESERVATION` | `512M` | RAM dự trữ tối thiểu cho app |
| `DB_MEMORY_LIMIT` | `2G` | RAM tối đa cho PostgreSQL |
| `APP_DOMAIN` | `crm.your-domain.com` | Domain cho Caddy HTTPS |

---

## Residual Risks (đã biết, chấp nhận)

1. **Rate limiter in-memory**: Chỉ đúng khi chạy 1 instance app. Scale > 1 replica → chuyển sang Redis.
2. **Circuit breaker reset on restart**: Restart app → providers reset về closed. Chấp nhận — threshold sẽ tự kick in lại nếu provider vẫn lỗi.
3. **Short downtime khi update**: ~10-30s. Không zero-downtime. Nên update ngoài giờ cao điểm.
4. **Console logging**: Chưa structured JSON. Log driver json-file với rotation đã cấu hình.
