# PR-04 — PRODUCTION HARDENING FOR VPS DEPLOYMENT

ZaloCRM-CorepViet

Bạn đang làm việc trên repository: `ZaloCRM-CorepViet`

Đây là PR tiếp theo sau:

```text
PR-01  AI Privacy & Policy Guard
PR-02  Opik Trace-only Observability
PR-03  Promptfoo AI Sale Evaluation Framework
        ↓
PR-04  Production Hardening for VPS Deployment
```

---

## 0. MỤC TIÊU

PR-04 chuẩn bị hệ thống cho deploy production trên VPS thật.

Mục tiêu:

```text
Codebase hiện tại
        ↓
AI Circuit Breaker — provider down không cascade
AI Per-Org Rate Limit — không 1 org spam hết quota
Request Correlation ID — trace request qua log
Error Classification — phân loại lỗi rõ ràng
Health Check nâng cấp — liveness vs readiness
Docker Hardening — resource limits, security
Caddy Reverse Proxy — HTTPS tự động, edge protection
Deploy Checklist — quy trình deploy an toàn
        ↓
Production-ready VPS
```

PR-04 KHÔNG phải:

```text
Kubernetes migration
Microservice decomposition
Cloud-native refactor
UI dashboard mới
AI model thay đổi
Zalo API thay đổi
Database schema migration
```

---

## 1. KHẢO SÁT TRƯỚC KHI CODE — BẮT BUỘC

Trước implementation, xác minh lại trạng thái hiện tại:

```bash
cat backend/src/app.ts          # rate limit, health, shutdown, error handler
cat docker/Dockerfile            # Node version, stages, entrypoint
cat docker-compose.yml           # services, volumes, resource limits
cat backend/src/shared/utils/logger.ts
cat backend/src/config/index.ts  # env vars
cat backend/.env.example
```

Xác minh PR-01/02/03 đã tồn tại:

```text
authorizeAiData()         — PR-01
ai-trace-sanitizer.ts     — PR-02
promptfoo/                — PR-03
```

Nếu PR-01 chưa hoàn tất:

```text
STOP
PR-04 BLOCKED
```

---

## 2. NHỮNG GÌ ĐÃ CÓ — KHÔNG ĐƯỢC PHÁ

Đã xác minh trong codebase hiện tại:

```text
✅ Rate limit per-user 1200/min (JWT key, Redis store, IP fallback)
✅ Health check /health (DB connectivity)
✅ Graceful shutdown (SIGTERM/SIGINT, 10s timeout, flushOpik)
✅ Security headers (CSP report-only, HSTS, X-Frame, nosniff)
✅ Error handler (basic — logs message, returns statusCode)
✅ Docker multi-stage (Node 20 Alpine, tini entrypoint)
✅ Docker Compose (app, postgres:16, redis:7, minio, backup, clamav)
✅ AI provider URL policy (DNS resolve, private IP check, allowlist)
✅ AI privacy guard (PR-01 — branded AiDataGrant)
✅ Opik trace-only (PR-02 — HMAC pseudonymize, fire-and-forget)
✅ Promptfoo eval (PR-03 — devDependency only, eval authorization)
✅ Zalo rate limiter (per-account, per-operation)
✅ Auto-reply throttle (5s/conversation)
✅ BullMQ job processing (Redis AOF, noeviction)
✅ PostgreSQL backup (daily, 7d/4w/3m retention)
✅ Logger VN timezone (console-based, custom prefix)
✅ ClamAV antivirus (optional, fail-open default)
```

TUYỆT ĐỐI KHÔNG phá bất kỳ behavior nào ở trên.

---

## 3. AI CIRCUIT BREAKER

### Vấn đề hiện tại

Khi AI provider (Anthropic/Gemini/OpenAI/Qwen/Kimi/DeepSeek) down hoặc trả 5xx liên tục, hệ thống vẫn gửi request → tích lũy timeout → tăng latency toàn hệ thống → ảnh hưởng auto-reply, followup cron, virtual chat.

### Thiết kế

Tạo: `backend/src/modules/ai/ai-circuit-breaker.ts`

```text
STATE MACHINE:

CLOSED  (bình thường — cho request qua)
  ↓ failure count >= threshold
OPEN    (chặn — trả lỗi ngay, không gọi provider)
  ↓ sau cooldown period
HALF_OPEN (thử 1 request)
  ↓ success → CLOSED
  ↓ failure → OPEN
```

Cấu hình:

```text
AI_CIRCUIT_FAILURE_THRESHOLD=5     # 5 lỗi liên tiếp → OPEN
AI_CIRCUIT_COOLDOWN_MS=30000       # 30s chờ trước khi thử lại
AI_CIRCUIT_HALF_OPEN_MAX=1         # 1 request thử trong HALF_OPEN
```

Mặc định: `AI_CIRCUIT_FAILURE_THRESHOLD=5`, `AI_CIRCUIT_COOLDOWN_MS=30000`

### Phạm vi

Circuit breaker áp dụng PER PROVIDER (không global). Anthropic down không ảnh hưởng Gemini.

Key = provider name từ `executeAiGeneration()`:

```text
anthropic | gemini | openai | qwen | kimi | deepseek
```

### Lỗi nào được đếm (QUAN TRỌNG)

Circuit breaker CHỈ đếm **provider/transient failures** — lỗi thể hiện provider không khả dụng:

```text
CÓ đếm (recordFailure):
  - HTTP 5xx từ provider (500, 502, 503, 504)
  - Connection timeout / ETIMEDOUT / ECONNRESET
  - DNS resolution failure (ENOTFOUND)
  - Network error (ECONNREFUSED, EHOSTUNREACH)
  - Provider rate limit (429) — provider tạm từ chối

KHÔNG đếm (KHÔNG recordFailure):
  - AiPrivacyDeniedError        — policy error, không phải provider down
  - AiProviderUrlPolicyError    — validation error
  - AiDataGrantError            — authorization error
  - HTTP 400/401/403 từ provider — client error, không phải transient
  - Validation error (bad input)
  - Bất kỳ lỗi nào TRƯỚC khi gọi provider
```

Lý do: 5 request bị privacy deny KHÔNG được làm circuit → OPEN. Đó là sai semantics — privacy deny nghĩa là policy hoạt động đúng, không phải provider down.

### Phân loại lỗi cho circuit breaker

Tạo helper function `isProviderTransientError(error: unknown): boolean`:

```text
Return true CHỈ khi:
  - error có status/statusCode 429 hoặc >= 500
  - error.code là 'ETIMEDOUT' | 'ECONNRESET' | 'ECONNREFUSED' |
    'ENOTFOUND' | 'EHOSTUNREACH' | 'UND_ERR_CONNECT_TIMEOUT'
  - error.name chứa 'TimeoutError' hoặc 'AbortError'

Return false cho MỌI THỨ khác (bao gồm AiPrivacyDeniedError,
AiProviderUrlPolicyError, AiDataGrantError, HTTP 4xx trừ 429)
```

Export function này để test trực tiếp.

### Tích hợp

Tích hợp VÀO `executeAiGeneration()` — KHÔNG tạo wrapper riêng, KHÔNG thay đổi signature.

```text
executeAiGeneration()
  ↓ assertAiDataGrant()       ← giữ nguyên
  ↓ checkCircuitBreaker()     ← THÊM — nếu OPEN, throw ngay
  ↓ provider call
  ↓ catch error:
      if isProviderTransientError(error):
        recordFailure()       ← CHỈ đếm transient
      throw error             ← luôn re-throw (kể cả non-transient)
  ↓ success → recordSuccess()
```

Khi circuit OPEN → throw lỗi ngay với error type mới: `provider_circuit_open`

### Trace integration

Nếu PR-02 Opik active: circuit breaker event ghi vào trace status `provider_failed` với errorType `provider_circuit_open`.

### Không persistence

Circuit state giữ trong memory (Map). Restart server → reset tất cả về CLOSED. Không cần Redis/DB. Lý do: mỗi VPS chỉ có 1 instance app.

### Tests

```text
PH-CB01  5 failures → circuit OPEN → request bị chặn ngay
PH-CB02  circuit OPEN → sau cooldown → HALF_OPEN → 1 request qua
PH-CB03  HALF_OPEN success → CLOSED
PH-CB04  HALF_OPEN failure → OPEN (reset cooldown)
PH-CB05  per-provider isolation — provider A down, provider B vẫn qua
PH-CB06  server restart → tất cả CLOSED (no persistence)
PH-CB07  circuit open → trace status = provider_failed, errorType = provider_circuit_open
PH-CB08  privacy/policy error (AiPrivacyDeniedError, AiProviderUrlPolicyError) KHÔNG làm circuit tiến tới OPEN
```

---

## 4. AI PER-ORG RATE LIMIT

### Vấn đề hiện tại

Rate limit hiện tại đếm HTTP request per user (1200/min). Nhưng không giới hạn AI call per org. Một org có thể spam AI call → hết API quota → ảnh hưởng các org khác (nếu share API key).

### Thiết kế

Tạo: `backend/src/modules/ai/ai-rate-limiter.ts`

```text
AI_RATE_LIMIT_PER_ORG=60          # 60 AI calls / phút / org
AI_RATE_LIMIT_WINDOW_MS=60000     # 1 phút
```

Mặc định: `AI_RATE_LIMIT_PER_ORG=60`

### Implementation

Fixed window counter in-memory: `Map<orgId, { count: number, windowStart: number }>`.

Khi `Date.now() - windowStart >= AI_RATE_LIMIT_WINDOW_MS` → reset `count = 0, windowStart = now`.

Kiểm tra BÊN TRONG `executeAiGeneration()` — ở **executor level (choke point)**, KHÔNG ở caller level.

Lý do: `executeAiGeneration()` là single choke point (PR-01 invariant). Đặt rate limit ở caller level tạo bypass risk — caller mới quên gọi check = không có limit.

```text
executeAiGeneration()
  ↓ assertAiDataGrant()       ← giữ nguyên
  ↓ checkAiRateLimit(grant)   ← THÊM — lấy orgId từ grant
  ↓ checkCircuitBreaker()     ← circuit breaker
  ↓ provider call
```

Trước khi implement, VERIFY rằng `AiDataGrant` hiện tại có `orgId` field. Kiểm tra type definition trong `ai-privacy-guard.ts`. Nếu grant đã có orgId → dùng `grant.orgId`. Nếu chưa → KHÔNG ép thêm, mà truyền orgId riêng.

Khi vượt limit → throw `AiRateLimitedError` → error handler trả 429 cho HTTP request, caller background (cron/followup) catch và skip/defer.

### Không block Promptfoo eval

`purpose === 'eval'` KHÔNG đếm vào rate limit production. Check `grant.purpose === 'eval'` → skip rate limit.

### Tests

```text
PH-RL01  61st call in 1 minute → AI_RATE_LIMITED
PH-RL02  window reset sau 60s → calls được phép lại
PH-RL03  org A rate limited, org B vẫn ok
PH-RL04  eval purpose không bị rate limit
```

---

## 5. REQUEST CORRELATION ID

### Vấn đề hiện tại

Không có request ID → không trace được 1 request qua nhiều log line.

### Thiết kế

Kiểm tra Fastify đã có `request.id` / `requestId` built-in chưa. Nếu có, dùng Fastify `genReqId` option thay vì custom hook. Fastify có built-in `genReqId`.

### Validate client-provided request ID (QUAN TRỌNG)

KHÔNG giữ nguyên bất kỳ `x-request-id` nào client gửi mà không validate. Attacker có thể gửi:
- Request ID dài hàng MB → memory/log bloat
- Newline/control characters → log injection
- HTML/script content → nếu log hiển thị trên web

Validation rules:

```text
const SAFE_REQUEST_ID = /^[a-zA-Z0-9\-_.]{1,128}$/;

function sanitizeRequestId(raw: string | undefined): string {
  if (raw && SAFE_REQUEST_ID.test(raw)) return raw;
  return crypto.randomUUID();
}
```

Cụ thể:
- Length: tối đa 128 ký tự
- Charset: `[a-zA-Z0-9\-_.]` — alphanumeric + dash + underscore + dot
- Không match → bỏ qua, tự generate UUID
- KHÔNG log giá trị bị reject (tránh log injection từ chính giá trị reject)

### Logger integration

Logger thêm request ID khi available. Không thay đổi logger signature cho background tasks (cron, BullMQ worker) — chúng không có request context.

### Tests

```text
PH-RID01  response có x-request-id header
PH-RID02  client gửi valid x-request-id → server giữ nguyên
PH-RID03  không có x-request-id → server tự tạo UUID
PH-RID04  client gửi x-request-id dài >128 chars / chứa newline / control chars → server reject và tự tạo UUID
```

---

## 6. ERROR CLASSIFICATION

### Vấn đề hiện tại

Error handler hiện tại (app.ts line 395):

```typescript
app.setErrorHandler((error, _request, reply) => {
  logger.error('Request error:', error.message);
  reply.status(error.statusCode ?? 500).send({
    error: error.message || 'Internal Server Error',
  });
});
```

Vấn đề:

- Không phân loại lỗi (validation vs auth vs server vs external)
- Log chỉ `error.message` — thiếu stack trace cho 5xx
- Trả `error.message` cho client → có thể leak thông tin nội bộ ở 5xx

### Thiết kế

Cải thiện error handler:

```text
4xx → log WARN level, trả message gốc cho client
5xx → log ERROR level + stack trace, trả generic message cho client
Known error classes → map sang status code + safe message
Unknown error → 500 + "Internal Server Error" (KHÔNG trả error.message)
```

Known error classes cần handle:

```text
AiPrivacyDeniedError     → 403
AiProviderUrlPolicyError → 403
ZaloOpError              → map code (RATE_LIMITED→429, NOT_CONNECTED→503, etc.)
Prisma errors            → 500 generic (không leak DB detail)
Validation errors        → 400
JWT errors               → 401
```

### Request ID trong error log

```text
[ERROR] [req:abc-123] Request error: ... (stack trace)
```

### Tests

```text
PH-ERR01  5xx không trả error.message cho client
PH-ERR02  AiPrivacyDeniedError → 403
PH-ERR03  validation error → 400
PH-ERR04  5xx log có stack trace
PH-ERR05  4xx log không có stack trace
```

---

## 7. PRODUCTION CONFIG FAIL-FAST

### Vấn đề

Hiện tại app khởi động bình thường ngay cả khi thiếu secrets quan trọng (JWT_SECRET, ENCRYPTION_KEY). Production với secrets mặc định/trống = security incident waiting to happen.

### Thiết kế

Tạo: `backend/src/config/validate-production-config.ts`

```text
function validateProductionConfig(): void
```

Gọi ở đầu boot sequence trong `app.ts`, TRƯỚC khi start Fastify/cron/worker.

### Khi `NODE_ENV === 'production'`, FAIL STARTUP nếu:

```text
- JWT_SECRET trống hoặc không set
- ENCRYPTION_KEY trống hoặc không set
- DATABASE_URL trống hoặc không set
- JWT_SECRET === 'changeme' hoặc giá trị placeholder rõ ràng
- ENCRYPTION_KEY ngắn hơn 32 hex chars (16 bytes)
```

### Khi `NODE_ENV !== 'production'`:

```text
- CHỈ log WARNING, KHÔNG fail startup
- Dev/test cần chạy được với .env.example defaults
```

### Fail behavior

```text
logger.error('FATAL: Production config validation failed:');
logger.error('  - JWT_SECRET is not set');
logger.error('  - ENCRYPTION_KEY is too short (minimum 32 hex chars)');
process.exit(1);
```

KHÔNG throw exception (có thể bị catch). Dùng `process.exit(1)` để chắc chắn không start.

### Mở rộng

Hàm `validateProductionConfig()` export để test. Tương lai có thể thêm check cho `APP_URL`, `S3_*`, nhưng PR-04 chỉ check secrets quan trọng nhất.

### Tests

```text
PH-CFG01  production + missing JWT_SECRET → process.exit(1) (mock process.exit)
PH-CFG02  production + short ENCRYPTION_KEY → process.exit(1)
PH-CFG03  production + valid secrets → no error
PH-CFG04  development + missing secrets → warning log only, no exit
```

---

## 8. HEALTH CHECK NÂNG CẤP

### Hiện tại

```text
GET /health → { status: 'ok', db: 'connected' }
```

Chỉ check DB. Không check Redis, không phân biệt liveness vs readiness.

### Thiết kế

```text
GET /health/live   → liveness — process alive, event loop responsive
GET /health/ready  → readiness — DB + Redis connected, ready to serve
GET /health        → backward compatible (giữ nguyên behavior cũ)
```

### Liveness

```json
{ "status": "ok", "uptime": 12345 }
```

Không check external. Chỉ xác nhận process alive. Nhanh.

### Readiness

```json
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "uptime": 12345,
  "timestamp": "2026-09-15T10:00:00+07:00"
}
```

Redis check: dùng `isBullMQRedisHealthy()` đã có trong `redis-connection.ts` line 66.

### Readiness KHÔNG kiểm tra

```text
❌ Opik/observability — PR-02 invariant: Opik down ≠ ZaloCRM down
❌ AI providers (Anthropic/Gemini/etc.) — provider down được circuit breaker xử lý
❌ MinIO/S3 — file storage down không block core CRM
❌ ClamAV — optional, fail-open
```

Readiness CHỈ kiểm tra DB + Redis — hai dependency mà nếu mất thì app KHÔNG THỂ phục vụ request.

### Docker Compose healthcheck

Cập nhật docker-compose.yml app service:

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health/ready"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```

Kiểm tra: app container có `wget` hay `curl` không (Alpine). Nếu không có, dùng alternative hoặc cài.

### Tests

```text
PH-HC01  /health/live trả 200 khi process alive
PH-HC02  /health/ready trả 200 khi DB + Redis ok
PH-HC03  /health/ready trả 503 khi DB down
PH-HC04  /health backward compatible
```

---

## 9. DOCKER HARDENING

### Resource Limits — Deployment Parameter (không hard-code)

Resource limit phụ thuộc VPS sizing. KHÔNG THỂ kết luận giá trị hợp lý trước khi biết RAM VPS.

Tất cả resource limit dùng env variable với default hợp lý cho VPS nhỏ (2GB RAM):

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: ${APP_MEMORY_LIMIT:-1G}
          cpus: '${APP_CPU_LIMIT:-2}'
        reservations:
          memory: ${APP_MEMORY_RESERVATION:-512M}
```

Kiểm tra: `docker compose` version trên VPS có hỗ trợ `deploy.resources` không (cần Compose V2). Nếu không, dùng `mem_limit` / `cpus` trực tiếp.

DEPLOY.md phải ghi rõ:

```text
Resource limits cần điều chỉnh theo VPS thực tế:
  VPS 2GB RAM:  APP=1G,   DB=512M, Redis giữ 256mb
  VPS 4GB RAM:  APP=2G,   DB=1G,   Redis 512mb
  VPS 8GB RAM:  APP=4G,   DB=2G,   Redis 1G
```

### PostgreSQL tuning

Giữ nguyên config hiện tại (shared_buffers=128MB, max_connections=50). Đã hợp lý cho VPS nhỏ.

Thêm resource limit cho db service:

```yaml
  db:
    deploy:
      resources:
        limits:
          memory: ${DB_MEMORY_LIMIT:-512M}
```

### Redis

Đã có `maxmemory 256mb` + `noeviction`. Giữ nguyên.

### Read-only filesystem

Cân nhắc thêm cho app container:

```yaml
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - file_storage:/var/lib/zalo-crm/files
```

Kiểm tra: app có ghi file nào ngoài `/tmp` và `/var/lib/zalo-crm/files` không. Nếu có (ví dụ Prisma query engine) thì KHÔNG bật `read_only` hoặc thêm volume cho thư mục đó.

### Tests

Không cần unit test. Verify bằng:

```text
PH-DK01  docker compose up — tất cả service start ok
PH-DK02  docker compose up — app không bị OOM kill
PH-DK03  docker compose ps — healthcheck PASS
```

---

## 10. CADDY REVERSE PROXY

### Vấn đề

Hiện tại app expose port 3080 trực tiếp. Không HTTPS, không edge protection.

### Thiết kế

Tạo file: `docker/Caddyfile`

```text
{domain} {
    reverse_proxy app:3000

    # HTTPS tự động qua Let's Encrypt
    # Caddy tự quản lý cert renewal

    # Security headers (bổ sung cho app-level headers)
    header {
        X-Robots-Tag "noindex, nofollow"
        -Server
    }

    # KHÔNG dùng third-party Caddy plugin (rate-limit, WAF, etc.)
    # PR này dùng STOCK Caddy only — edge rate limiting/WAF để PR khác

    # WebSocket support cho Socket.IO
    # Caddy tự detect upgrade

    # File upload size
    request_body {
        max_size 500MB
    }

    # Access log
    log {
        output file /var/log/caddy/access.log {
            roll_size 50MiB
            roll_keep 5
        }
    }
}
```

### Docker Compose integration

Thêm service `caddy` vào docker-compose.yml:

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: zalo-crm-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_healthy
    environment:
      - DOMAIN=${APP_DOMAIN:-localhost}
```

Thêm volumes:

```yaml
volumes:
  caddy_data:
  caddy_config:
```

### App port khi Caddy active

Khi Caddy active (dùng overlay): app KHÔNG bind port ra host. Dùng `expose` thay vì `ports` — chỉ mở port trong Docker internal network:

```yaml
# docker-compose.caddy.yml (overlay) override app service:
  app:
    ports: !reset []          # xóa ports mapping từ docker-compose.yml
    expose:
      - "3000"                # chỉ visible trong Docker network, không bind host
```

Lý do: Caddy reverse proxy qua Docker internal network (`app:3000`). App không cần expose port ra host khi đã có Caddy phía trước. Dùng `ports: "127.0.0.1:3080:3000"` vẫn để port 3080 trên host — `expose` tốt hơn vì hoàn toàn internal.

Nếu Docker Compose version không hỗ trợ `!reset` → dùng `ports: []` hoặc override trong overlay.

### Caddyfile template

Domain phải đọc từ env. Caddy hỗ trợ `{env.DOMAIN}` hoặc dùng adapter.

Kiểm tra: Caddy Docker image version mới nhất hỗ trợ env substitution trong Caddyfile hay cần wrapper script.

### Không bắt buộc Caddy

Caddy là OPT-IN. Nếu user đã có Nginx / Cloudflare tunnel / custom proxy → không cần Caddy.

Tách thành: `docker-compose.yml` (core) + `docker-compose.caddy.yml` (overlay):

```bash
# Không Caddy (user có proxy riêng)
docker compose up -d

# Với Caddy
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

### Tests

```text
PH-CDY01  Caddy container start + cert provisioning (dev: localhost self-signed)
PH-CDY02  HTTPS redirect
PH-CDY03  WebSocket qua Caddy
PH-CDY04  App port không expose ra public khi Caddy active
```

---

## 11. DEPLOY CHECKLIST

Tạo file: `DEPLOY.md` trong root directory.

Nội dung:

### Pre-deploy

```text
1. VPS requirements: Ubuntu 22+ / Debian 12+, Docker Engine 24+, Docker Compose V2
2. Domain DNS A record trỏ về VPS IP
3. Firewall: chỉ mở 80, 443, 22 (SSH)
4. .env đã cấu hình đầy đủ (không để default)
5. Secrets đã generate (JWT_SECRET, ENCRYPTION_KEY, DB_PASSWORD, MINIO credentials)
```

### First deploy

```text
1. Clone repo
2. cp .env.example .env
3. Edit .env — cấu hình tất cả secrets, domain, API keys
4. docker compose build
5. docker compose up -d db redis minio
6. Wait for healthcheck: docker compose ps
7. npx prisma migrate deploy (hoặc docker exec)
8. docker compose up -d
9. Verify: curl https://{domain}/health/ready
10. Verify: curl https://{domain}/api/v1/status
```

### Update deploy

```text
1. git pull
2. docker compose build app
3. docker compose up -d app    # controlled restart with graceful shutdown (NOT zero-downtime — single container restart có khoảng downtime ngắn)
4. Verify health
5. Check logs: docker compose logs -f app --tail 50
```

### Rollback

```text
1. git checkout <previous-commit>
2. docker compose build app
3. docker compose up -d app
```

### Backup

```text
Automatic: backup service chạy daily (đã có trong docker-compose)
Manual: docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup.sql
```

### Monitoring

```text
Health: GET /health/ready (mỗi 30s)
Logs: docker compose logs -f app
Disk: df -h (đặc biệt volumes)
Redis: docker exec zalo-crm-redis redis-cli info memory
PostgreSQL: docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT count(*) FROM pg_stat_activity"
```

---

## 12. .ENV.EXAMPLE UPDATE

Thêm các biến mới vào `.env.example`:

```text
# --- PR-04 Production Hardening ---
# AI Circuit Breaker
AI_CIRCUIT_FAILURE_THRESHOLD=5
AI_CIRCUIT_COOLDOWN_MS=30000

# AI Per-Org Rate Limit (calls/minute/org)
AI_RATE_LIMIT_PER_ORG=60

# Docker resource limits (docker-compose)
APP_MEMORY_LIMIT=1G
DB_MEMORY_LIMIT=512M

# Domain for Caddy HTTPS (chỉ dùng khi deploy với docker-compose.caddy.yml)
APP_DOMAIN=your-domain.com
```

---

## 13. ACCEPTANCE CRITERIA

PR-04 PASS khi:

**Circuit Breaker**: Per-provider, 3-state (closed/open/half_open), configurable threshold/cooldown, tích hợp trong executeAiGeneration, CHỈ đếm provider/transient failures (không đếm privacy/policy errors), trace integration, không persistence.

**AI Rate Limit**: Per-org, fixed window, configurable, eval exempt, executor-level enforcement (choke point).

**Production Config**: Startup fail-fast khi missing/weak secrets trong production, warning-only trong dev.

**Request ID**: x-request-id header, UUID fallback, input validation (length ≤128, safe charset), response echo, log integration.

**Error Classification**: 5xx không leak message, known errors mapped, stack trace chỉ trong server log, request ID trong log.

**Health Check**: /health/live, /health/ready (DB + Redis), /health backward compatible, Docker healthcheck updated.

**Docker**: Resource limits (configurable), security_opt giữ nguyên, compose V2 compatible.

**Caddy**: Opt-in overlay, HTTPS auto, WebSocket proxy, app port internal-only khi active.

**Deploy**: DEPLOY.md với pre-deploy, first deploy, update, rollback, backup, monitoring.

**Regression**: PR-01 tests pass, PR-02 tests pass, PR-03 tests pass (no-key), existing rate limit unchanged, existing health check compatible, existing shutdown unchanged, build pass.

---

## 14. TEST MATRIX

### Circuit Breaker

```text
PH-CB01  threshold failures → OPEN
PH-CB02  OPEN + cooldown → HALF_OPEN
PH-CB03  HALF_OPEN success → CLOSED
PH-CB04  HALF_OPEN failure → OPEN
PH-CB05  per-provider isolation
PH-CB06  restart → all CLOSED
PH-CB07  trace integration
PH-CB08  privacy/policy error KHÔNG trigger circuit failure
```

### Rate Limit

```text
PH-RL01  over limit → AI_RATE_LIMITED
PH-RL02  window reset → allowed
PH-RL03  per-org isolation
PH-RL04  eval exempt
```

### Request ID

```text
PH-RID01  response header
PH-RID02  valid client-provided preserved
PH-RID03  auto-generated UUID
PH-RID04  malicious/oversized x-request-id rejected → auto UUID
```

### Production Config

```text
PH-CFG01  production + missing JWT_SECRET → exit(1)
PH-CFG02  production + short ENCRYPTION_KEY → exit(1)
PH-CFG03  production + valid secrets → ok
PH-CFG04  development + missing secrets → warning only
```

### Error Handler

```text
PH-ERR01  5xx safe message
PH-ERR02  known error → correct status
PH-ERR03  validation → 400
PH-ERR04  5xx stack trace in log
PH-ERR05  4xx no stack trace
```

### Health Check

```text
PH-HC01  /health/live 200
PH-HC02  /health/ready 200
PH-HC03  /health/ready 503 on DB failure
PH-HC04  /health backward compatible
```

### Regression

```text
PH-REG01  PR-01 tests pass
PH-REG02  PR-02 tests pass
PH-REG03  PR-03 tests pass
PH-REG04  existing rate limit unchanged
PH-REG05  build pass
```

---

## 15. RESIDUAL RISKS

Ghi nhận các risk đã biết mà PR-04 KHÔNG giải quyết:

```text
1. In-memory AI rate limiter chỉ chính xác với app replicas = 1.
   Nếu scale lên 2 app containers → mỗi container có counter riêng
   → effective quota có thể gấp đôi (120/min thay vì 60/min).
   Mitigation: Chuyển sang Redis-based counter khi cần multi-instance.
   Status: Accepted — hiện tại deploy single instance trên VPS.

2. In-memory circuit breaker state mất khi restart.
   Container restart → tất cả circuit reset về CLOSED → có thể gửi
   request vào provider đang down cho đến khi đủ threshold lại.
   Mitigation: Acceptable — threshold thấp (5), nhanh chóng re-open.

3. Single container restart có khoảng downtime ngắn.
   Graceful shutdown xử lý in-flight requests nhưng không có
   zero-downtime deployment (cần blue-green hoặc rolling update).
   Mitigation: Chấp nhận cho VPS single instance. Document rõ.

4. Console-based logging (không structured JSON).
   Log grep/parse khó hơn structured logging (Pino/Winston).
   Mitigation: PR riêng nếu cần — touch quá nhiều file cho PR-04.
```

---

## 16. ROLLBACK

PR-04 không tạo database migration.
PR-04 không thay đổi Prisma schema.
PR-04 không thay đổi production Zalo behavior.

Rollback: `git revert <PR-04 merge commit>`

Caddy: `docker compose down caddy` (nếu đã dùng overlay)

Docker resource limits: remove `deploy.resources` block.

---

## 17. OUT OF SCOPE

PR-04 KHÔNG triển khai:

```text
Kubernetes, Prometheus, Grafana, ELK stack,
structured JSON logging (Pino/Winston migration),
multi-instance clustering, blue-green deployment,
database read replicas, CDN configuration,
WAF (Web Application Firewall), DDoS protection beyond Caddy,
secrets management (Vault/SOPS), infrastructure as code (Terraform),
CI/CD pipeline creation, automated testing in CI,
APM (Application Performance Monitoring),
AI cost tracking / budget enforcement,
custom monitoring dashboard
```

Structured JSON logging (thay console bằng Pino) là improvement lớn nhưng touch quá nhiều file → PR riêng nếu cần.

---

## 18. IMPLEMENTATION ORDER

```text
 1. VERIFY PR-01/02/03
 2. VERIFY EXISTING INFRA (rate limit, health, shutdown, docker)
 3. IMPLEMENT PRODUCTION CONFIG FAIL-FAST (validateProductionConfig)
 4. IMPLEMENT AI CIRCUIT BREAKER (incl. isProviderTransientError)
 5. IMPLEMENT AI PER-ORG RATE LIMIT (executor level, fixed window)
 6. IMPLEMENT REQUEST CORRELATION ID (incl. input validation)
 7. IMPLEMENT ERROR CLASSIFICATION
 8. IMPLEMENT HEALTH CHECK UPGRADE
 9. UPDATE DOCKER COMPOSE (resource limits as env params, healthcheck)
10. CREATE CADDY OVERLAY (docker-compose.caddy.yml + Caddyfile, stock Caddy)
11. CREATE DEPLOY.md (incl. VPS sizing guide)
12. UPDATE .env.example
13. RUN PR-04 TESTS
14. RUN PR-01 REGRESSION
15. RUN PR-02 REGRESSION
16. RUN PR-03 REGRESSION (no-key)
17. BUILD
18. FINAL REPORT
```

---

## 19. IMPLEMENTATION MODE

Nếu verification PASS: được phép create/modify files, add env vars, update docker-compose, create Caddyfile, create DEPLOY.md, run tests, run build.

Không được: commit, push, merge, deploy, change production data, change production secrets, tạo database migration.

---

## 20. FINAL IMPLEMENTATION REPORT

Sau implementation trả:

```text
1.  Files Changed
2.  Dependency Changes (nếu có)
3.  Production Config Fail-Fast Status
4.  Circuit Breaker Status
5.  AI Rate Limit Status
6.  Request ID Status
7.  Error Classification Status
8.  Health Check Status
9.  Docker Changes
10. Caddy Status
11. Deploy.md Created
12. .env.example Updated
13. PR-04 Tests
14. PR-01 Regression
15. PR-02 Regression
16. PR-03 Regression
17. Build Result
18. Residual Risks (đã document 4 known risks)
19. Rollback Plan
20. GO / NO-GO
```

Kết luận: `PR-04 READY TO REVIEW` hoặc `PR-04 BLOCKED`

---

## 21. QUALITY RULE

Không bắt test PASS bằng cách: nới assertion, giảm threshold, skip error case, hard-code response.

Circuit breaker phải thực sự chặn khi provider down. Rate limit phải thực sự từ chối khi vượt ngưỡng. Error handler phải thực sự che message ở 5xx.

---

## 22. MỤC TIÊU CUỐI CÙNG

PR-04 phải giúp ZaloCRM:

- Deploy an toàn lên VPS với HTTPS tự động
- AI provider down không cascade ảnh hưởng toàn hệ thống
- Một org không chiếm hết AI quota
- Debug production issue nhanh hơn (request ID, error classification)
- Biết server có sẵn sàng phục vụ không (readiness check)
- Container không chiếm hết tài nguyên VPS
- Có quy trình deploy/rollback rõ ràng

Nếu PR-04 chưa đạt được những điều trên thì chưa đạt mục tiêu.

---

## CODEBASE CONTEXT (pre-verified)

### app.ts

- Rate limit: lines 159-185, per-user JWT key, 1200/min, `@fastify/rate-limit` + Redis
- Health: line 368-376, `/health` chỉ check DB
- Error handler: lines 395-400, basic — log message, trả statusCode
- Graceful shutdown: lines 520-544, SIGTERM/SIGINT, 10s timeout, flushOpik
- Cron tasks: ~15 cron/scheduled tasks started at boot

### docker/Dockerfile

- 3-stage: frontend-builder (node:20-alpine) → backend-builder (node:20-alpine) → production (node:20-alpine)
- Entrypoint: tini
- CMD: `node dist/app.js`
- Packages: ffmpeg, tzdata, vips (sharp)

### docker-compose.yml

- 6 services: app, db (postgres:16), redis:7, minio, minio-init, backup, clamav
- App: port 3080:3000, env_file .env, no resource limits
- DB: healthcheck pg_isready, shared_buffers=128MB, max_connections=50
- Redis: AOF everysec, maxmemory 256mb, noeviction
- Backup: daily, 7d/4w/3m
- Security: `no-new-privileges:true` on app, minio credentials required

### logger.ts

- Console-based (console.log/error/warn)
- VN timezone prefix `[YYYY-MM-DDTHH:MM:SS.mmm+07:00] [LEVEL]`
- Debug suppressed in production

### ai-provider-url-policy.ts

- DNS resolution + 3s timeout
- Private IP check (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Configurable allowlist

### executeAiGeneration callers (9 operations)

```text
ai-service.ts:242       reply/summary/sentiment
ai-service.ts:374       appointment_parse
ai-service.ts:698       format_rich
ai-followup-service.ts  followup
ai-virtual-chat-service virtual_chat
customer-summary-service customer_summary
knowledge-service       rag_answer
```
