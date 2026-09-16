# Phương án triển khai production — Messenger Native cho ZaloCRM CorepViet

| | |
|---|---|
| Phiên bản | 1.0 (thay thế `docs/RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md` V3 về mặt triển khai; phần kiến trúc V3 vẫn giữ) |
| Ngày audit | 2026-09-16, ~19:45–20:10 (giờ VN) |
| Phạm vi | Repo `D:\ZaloCRM-CorepViet` (HEAD `850dea1`) + VPS `vpssieutoc` 157.66.219.190, `/root/ZaloCRM-CorepViet` |
| Cách audit | Chỉ đọc. Không restart, không migration, không sửa `.env`/Caddy, không đọc giá trị secret, không đưa dữ liệu khách vào báo cáo |
| **Trạng thái** | **NO-GO** cho migration/deploy Messenger lên production — xem §18, §20 |

> Mọi lệnh có thể thay đổi VPS đều nằm dưới tiêu đề **COMMAND REQUIRES APPROVAL** và **chưa được chạy**.

---

## 1. Executive Summary

**Kết luận một dòng:** kiến trúc Messenger (ChannelAccount / TokenCredential / Outbox / PolicyEngine) đứng vững sau khi đối chiếu repo thật. Nhưng production **chưa có bản backup nào** và chưa có cổng kiểm soát deploy an toàn, nên **STOP — KHÔNG DEPLOY MIGRATION PRODUCTION**.

Sáu phát hiện quan trọng nhất:

| # | Phát hiện | Mức |
|---|---|---|
| F-01 | Thư mục `backups/` **rỗng**. Container backup mới chạy 7h, cron `@daily`, `BACKUP_ON_START=FALSE`, nên bản dump đầu tiên sớm nhất là 00:00 đêm nay. Không có off-site, không backup media (3.7 GB), chưa từng restore test | **P0** |
| F-02 | UFW `inactive`, iptables `INPUT ACCEPT`. Port **3080** (app, đi vòng qua Caddy/TLS), **9000** (MinIO, bucket anonymous download), **5678** (n8n) truy cập được từ Internet qua IP. Đã xác nhận: `http://157.66.219.190:3080/health/live` → 200 | **P1** (security; không chặn riêng Messenger nhưng webhook Meta sẽ nhận cả traffic HTTP thường qua 3080) |
| F-03 | Lead Ads **không tồn tại** trong code đang chạy. Production là *Community edition*, log ghi `Community edition — _ee bundle absent`; thư mục `src/_ee/` không có trong repo lẫn image. Schema có tới **4 chỗ lưu token Facebook**, tất cả 0 dòng | P1 (quyết định thiết kế) — **tin tốt**: không phải migrate dữ liệu token |
| F-04 | Không có quy trình deploy có version. Image chỉ có tag `latest`, rollback = build lại 5–10 phút. Project compose đang chạy **không** có overlay caddy, trong khi `VPS-FIRST-DEPLOY.md` hướng dẫn chạy **có** overlay. Làm theo tài liệu sẽ tắt port 3080 và bật `zalo-crm-caddy` tranh port 80/443 với caddy chung, gây sập toàn bộ site | **P1** |
| F-05 | `Conversation.zaloAccountId` là NOT NULL và được deref trực tiếp ở ~104 chỗ, cộng 12 file raw SQL đụng `conversations`. Đổi sang nullable (XOR) là thay đổi có bán kính lớn nhất | P1 |
| F-06 | Chưa có characterization test cho luồng Zalo inbound/listener, websocket emit, AI auto-reply. Có 125 file test nhưng tập trung vào route/broadcast/care-session | P1 |

**DB nhỏ, migration rẻ:** PostgreSQL 16.15, DB 153 MB, `messages` 55.690 dòng (59 MB), `conversations` 493, `contacts` 1.480, 1 organization. 127/127 migration đã apply, không có migration lỗi, không drift giữa repo và DB. Không có transaction dài, không lock chờ.

---

## 2. Current Production State

Snapshot lúc 2026-09-16 19:47–20:05.

| Thành phần | Trạng thái |
|---|---|
| Host | Ubuntu 22.04, 4 vCPU, RAM 7.8 Gi (khả dụng 4.3 Gi), swap 1.3/4 Gi, load 0.5 |
| Disk `/` | 79 G, dùng 57 G (**76%**), trống 19 G. Docker build cache 8.88 G thu hồi được; images 16.6 G (5.6 G thu hồi được) |
| Docker | Engine 29.8.0, Compose 5.5.1 |
| Git trên VPS | `main` @ `850dea183ae0`, trùng với local, working tree sạch |
| `zalo-crm-app` | healthy, restart=0, start 15:35 VN. Tiến trình: `tini → node dist/app.js` (**một process** gồm API + socket.io + BullMQ workers + Zalo listeners) |
| Health | `/health/live` 200, `/health/ready` 200 (`db: connected`, `redis: connected`), `/api/v1/status` 200 |
| HTTPS | `https://zalocrm.corepviet.com/health/ready` → 200. Let's Encrypt, hết hạn 2026-12-02 |
| Caddy | Container dùng chung `caddy` thuộc `/opt/n8n`; `zalocrm.corepviet.com → 172.17.0.1:3080`; `caddy validate` → *Valid configuration* |
| PostgreSQL | `postgres:16-alpine` 16.15, 127.0.0.1:5433, `max_connections=50`, 6 kết nối, 0 long tx. Volume `pg_data` tạo 2026-07-06 (dữ liệu liên tục từ tháng 7) |
| Redis | 7.4.10, AOF on (`aof_last_write_status: ok`), `noeviction`, 1.87 M / 256 M. BullMQ: `group-scan` wait=0 active=0 delayed=0 failed=0 |
| Feature/mode | `NODE_ENV=production`, `TENANT_GUARD_MODE=off`, `RLS_SET_CONFIG=false`, `CSP_MODE=report-only`, `FRIEND_INVITE_TEST_MODE=true`, `MARKETING_DRY_RUN=false`, `FB_GRAPH_API_VERSION=v21.0` |
| Biến FB | `FB_APP_ID`, `FB_APP_SECRET`, `FB_TOKEN_ENC_KEY`, `FB_WEBHOOK_VERIFY_TOKEN` đều **rỗng**; `TOKEN_ENCRYPTION_KEY` **có**, đang mã hoá 3 dòng `app_settings` (API key AI) |
| Backup | Xem F-01 |
| Log app (4h) | ~1.558 dòng khớp error. Phần lớn là `getFriendOnlines failed: ZcaApiError` lặp mỗi phút. 16 `P2002` trên `contact.update` đã được `safe-contact-write` bắt; 3 lỗi `message.create` |
| Stack khác cùng VPS | `voi-crm-*` (6 container), `n8n` 2.28.6, caddy dùng chung |

### Chatwoot — chỉ kiểm tra phần tồn dư (đã gỡ, không lên kế hoạch gỡ lại)

| Nơi kiểm tra | Kết quả |
|---|---|
| Container / image / volume | 0 / 0 / 0 |
| Caddyfile, compose `/opt/n8n`, `.env` ZaloCRM | Không còn tham chiếu |
| DNS `chat.corepviet.com` | Không còn bản ghi |
| Source repo | Chỉ còn trong `docs/KIEM-TOAN-VONG-2-MESSENGER.md` (tài liệu lịch sử — giữ) |
| Docker network | **`chatwoot_default` vẫn còn, container `caddy` vẫn gắn vào** — cleanup task CW-1 |
| File | `/opt/backups/chatwoot-truoc-khi-go-20260901-075816.tgz` — cleanup task CW-2 (chủ hệ thống quyết định giữ hay xoá) |
| Monitoring | Không có hệ thống monitoring nên không có gì tồn dư |

---

## 3. Repository Audit

### 3.1 Đã có

| Hạng mục | Vị trí | Ghi chú |
|---|---|---|
| Prisma 7.5 + `prisma.config.ts` | `backend/prisma/` | 116 model, 127 migration, có thư mục `rls/` (chưa áp dụng vào DB) |
| Dockerfile multi-stage | `docker/Dockerfile` | `CMD node dist/app.js`; **không** auto-migrate (tốt, đã bỏ `db push` từ 2026-06-02); runtime image có prisma CLI và `prisma/` nên chạy được `migrate deploy` |
| Fail-fast config | `backend/src/config/index.ts` → `validateProductionConfig()` | Chỉ kiểm tra JWT/ENCRYPTION key, chưa có gì cho FB |
| Health | `backend/src/app.ts:384` `/health/live`, `:388` `/health/ready` | Ready gồm DB + Redis |
| BullMQ | `modules/zalo/group-scan-queue.ts`, `modules/tags/zalo-label-queue.ts` | Worker chạy **trong process app** |
| Realtime | socket.io, `modules/zalo/zalo-socket.ts`, `shared/realtime/socket-auth.ts` | Cùng process |
| Tenant guard | `shared/tenant/tenant-guard.ts`, `org-scoped-models.ts` | Production đang `off` |
| Crypto (3 khoá) | `shared/crypto/session-crypto.ts` (`ENCRYPTION_KEY`, session Zalo); `integrations/_shared/token-encryption.util.ts` (`TOKEN_ENCRYPTION_KEY`, định dạng `base64(IV‖TAG‖CT)`, dùng bởi `ai/provider-registry.ts`); `shared/crypto/aes-gcm.ts` (`FB_TOKEN_ENC_KEY`) | `aes-gcm.ts` **không có nơi import** → dead code |
| Webhook log (Lead Ads) | `integrations/_shared/webhook-log.service.ts` | Không có route gọi tới; `list-entry-routes.ts:719` chỉ đọc |
| Test | `backend/tests/` 125 file `*.test.ts`, vitest 4 | Xem 3.3 |
| Open-core loader | `app.ts:117–140` `loadExtension('./_ee/index.js')` | Lead Ads / Lead Pool / automation extension nằm trong `_ee` — **không có** |

### 3.2 Chưa có

- Bất kỳ route `/api/v1/webhooks/meta/*`, cơ chế giữ raw body (`addContentTypeParser`) hay HMAC verify cho Meta.
- Các model ChannelAccount, TokenCredential, ContactIdentity, ContactMergeAudit, WebhookDelivery, ChannelEvent, OutboundCommand.
- Feature flag `MESSENGER_*`.
- CI/CD (không có `.github/`). Test chỉ chạy tay.
- Redaction trong logger (`shared/utils/logger.ts` là console, không có `redact`/`mask`).
- Metrics endpoint (không có Prometheus/OpenTelemetry).
- Image tag theo commit, script deploy, script backup media, off-site.

### 3.3 Độ phủ test so với yêu cầu characterization

| Luồng Zalo | Test hiện có | Đánh giá |
|---|---|---|
| Inbound (listener → `chat/message-handler.ts`) | `regression-m57-reaction`, `media-dedup` (một phần) | **Thiếu**: chưa có test tạo conversation/message từ event listener |
| Outbound | `chat-routes`, `public-send-image`, `send-via-deleted-nick-blocked` | Có một phần |
| Conversation | `contact-conversation-resolver`, `chat-resolve-route`, `deleted-nick-revive-*` | Khá |
| Contact | `dedup-merge`, `duplicate-detector-merge-policy`, `contact-ghost-filter` | Khá |
| Label | Không thấy test cho `zalo-label-queue` | **Thiếu** |
| Assignment | Không thấy | **Thiếu** |
| Broadcast | `broadcast-*` (4 file) | Tốt |
| Realtime / websocket | `aggregate-emit` | **Thiếu** emit `chat:message` |
| Worker / queue | `group-scan-worker`, `sequence-step-worker-block` | Có |
| AI flow | `engine-gates`, `regression-m52-reply-pause`, `eval/` | Một phần; thiếu auto-reply inbound stranger |

### 3.4 Lệch giữa tài liệu và thực tế

| Tài liệu nói | Thực tế |
|---|---|
| `VPS-FIRST-DEPLOY.md` bước 8: `docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d` | VPS chạy **không** overlay (label `config_files=/root/ZaloCRM-CorepViet/docker-compose.yml`), dùng caddy chung ở `/opt/n8n` |
| `VPS-FIRST-DEPLOY.md` §Firewall: chỉ mở 22/80/443 | UFW tắt; 3080, 9000, 5678, 3081, 9010 công khai |
| `DEPLOY.md` §Backup: "Automatic backups run daily" | Chưa có bản nào; không media; không off-site |
| Phương án V3: Lead Ads đang chạy, dùng `FacebookPageConnection` | Lead Ads không có trong bản đang chạy; 4 bảng/cột token FB đều 0 dòng |
| `docker-compose.yml` backup: không đặt `VALIDATE_ON_START` | Container có `VALIDATE_ON_START=TRUE` (mặc định của image, chỉ kiểm tra cấu hình, **không** phải restore test) |
| `.env.example` gợi ý `FB_OAUTH_REDIRECT_URI` (OAuth) | Kiến trúc chốt dùng System User token → OAuth callback không cần cho Messenger |

### 3.5 Nợ kỹ thuật ảnh hưởng deploy

| ID | Nợ | Mức |
|---|---|---|
| TD-1 | Một process gánh API + listener + worker, nên restart app = mất kết nối Zalo vài chục giây và dispatcher dừng | P2 (chấp nhận được cho pilot nhờ outbox bền) |
| TD-2 | Build image trên chính VPS (disk 76%), không tag version | P1 |
| TD-3 | `env_file: .env` bơm **toàn bộ** `.env` (gồm `DB_PASSWORD`, `MINIO_ROOT_PASSWORD`) vào container app, lộ qua `docker inspect` | P3 |
| TD-4 | Log noise `getFriendOnlines` mỗi phút che lỗi thật | P3 |
| TD-5 | `aes-gcm.ts` + `FB_TOKEN_ENC_KEY` là code/env chết | P3 |
| TD-6 | 4 schema lưu token FB song song (`organizations.encrypted_fb_system_user_token`, `facebook_page_accounts.encrypted_access_token`, `facebook_page_connections.access_token_enc`, `facebook_app_configs.app_secret_enc/token_enc_key_enc`) | P1 về thiết kế (xem 7.4) |

---

## 4. Infrastructure Audit

### F-02 — Port công khai đi vòng qua reverse proxy · **P1**
- **Evidence:** `ss` cho thấy `0.0.0.0:3080`, `0.0.0.0:9000`, `0.0.0.0:5678`. `ufw status` → *inactive*. `curl http://157.66.219.190:3080/health/live` → 200; `:9000/minio/health/live` → 200.
- **Risk:** truy cập API không TLS; giả mạo `X-Forwarded-For` (app bật `trustProxy`) để lách rate-limit; MinIO bucket đặt `anonymous download`; n8n lộ trực tiếp.
- **Impact:** webhook Meta, nếu mở, cũng gọi được qua HTTP thường. Mọi quyết định dựa trên IP đều không tin được.
- **Recommendation:** **không** dùng UFW để chặn (Docker publish port bỏ qua UFW). Đổi bind port. **Lưu ý:** Caddy đang proxy tới `172.17.0.1:3080`, nên bind `127.0.0.1:3080` sẽ **làm sập site**. Có hai cách đúng:
  - (a) bind `172.17.0.1:3080:3000`;
  - (b) gắn `caddy` vào network `zalocrm-corepviet_default` và proxy `zalo-crm-app:3000`, bỏ publish.

  Ưu tiên (a) cho pilot vì chỉ đổi một dòng. MinIO 9000: kiểm tra `S3_PUBLIC_URL` đang có client dùng không (`minio_data` chỉ 328 K, media thật nằm ở `file_storage`) rồi mới đóng.
- **Phase:** trước khi đăng ký webhook Meta (Phase 3). Không chặn PR code.

### F-04 — Quy trình deploy không có version và dễ gây sập · **P1**
- **Evidence:** `docker image ls zalocrm-corepviet-app` → chỉ `latest 8f73f94e0e55`. `DEPLOY.md` rollback = `git checkout` + build lại. Overlay caddy trong tài liệu khác thực tế.
- **Risk:** rollback mất 5–10 phút build (VPS 76% disk, build có thể fail vì thiếu chỗ). Chạy nhầm lệnh overlay làm sập mọi site trên caddy chung.
- **Recommendation:**
  - Trước mỗi deploy: `docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:<sha-cũ>`.
  - Build image mới rồi tag `<sha-mới>`.
  - Chỉ dùng **đúng một** lệnh `docker compose -f docker-compose.yml up -d --no-deps app`.
  - Sửa `VPS-FIRST-DEPLOY.md` bước 8.
- **Phase:** PR-00.

### F-07 — Disk 76% · **P2**
- **Evidence:** `/` 57/79 G; build cache 8.88 G; images thu hồi được 5.6 G.
- **Risk:** build image mới (~1–2 G) + dump + tar media 3.7 G → ~86%. Postgres hỏng khi đầy disk.
- **Recommendation:** `docker builder prune` (cần duyệt); đặt ngưỡng dừng: không deploy nếu disk > 80% sau khi backup.
- **Phase:** pre-deploy.

### F-08 — `.env` quyền 644 · **P2**
- **Evidence:** `stat` → `644 root`.
- **Risk:** mọi user local đều đọc được secret. VPS hiện chỉ có root dùng nên rủi ro thấp.
- **Recommendation:** `chmod 600` (cần duyệt).
- **Phase:** pre-deploy.

### F-09 — Network `chatwoot_default` còn gắn caddy · **P3**
- **Evidence:** `docker inspect caddy` → networks `chatwoot_default n8n_default`.
- **Risk:** không có. Là rác cấu hình.
- **Recommendation:** CW-1 (cần duyệt): `disconnect` rồi `network rm`.
- **Phase:** bất kỳ, tách khỏi deploy Messenger.

---

## 5. Database / Migration Audit

### 5.1 Hiện trạng

| Kiểm tra | Kết quả |
|---|---|
| PostgreSQL | 16.15 (alpine) |
| Prisma | `prisma` / `@prisma/client` ^7.5.0 |
| `_prisma_migrations` | 127 dòng, `finished_at IS NULL` = 0, `rolled_back_at` = 0. Mới nhất: `20260902110000_ai_auto_reply_inbound_stranger` |
| Drift repo ↔ DB | Tên migration khớp 127/127 (so bằng `comm`). **Chưa** chạy `prisma migrate diff` (cần DB tạm — làm cùng restore test) |
| Kích thước DB | 153 MB |
| RLS | 0 bảng bật RLS, 0 policy |
| Kết nối | 6/50; không có lock chưa cấp; 0 transaction > 5 phút |

| Bảng | Dòng | Tổng size | Ghi chú schema |
|---|---|---|---|
| messages | 55.690 (T7 28.884, T8 18.532, T9 đến nay 8.274) | 59 MB | **Không có `org_id`**; unique `(conversation_id, zalo_msg_id)`, `(conversation_id, client_echo_id)`; 8 index |
| conversations | 493 | 8.3 MB | `zalo_account_id` **NOT NULL**, FK `ON DELETE CASCADE`; unique `(zalo_account_id, external_thread_id)`; 6 index composite đều bắt đầu bằng `org_id` |
| contacts | 1.480 | 5.0 MB | Có `merged_into` (self-FK) — cơ chế merge cũ |
| facebook_page_connections | 0 | 24 kB | `access_token_enc` |
| facebook_app_configs | 0 | 24 kB | `app_secret_enc`, `token_enc_key_enc`, `webhook_verify_token` plaintext |
| facebook_form_mappings | 0 | 24 kB | FK `page_connection_id → facebook_page_connections` CASCADE, FK `customer_list_id` |
| facebook_page_accounts | 0 | — | `encrypted_access_token` NOT NULL, `webhook_verify_token` NOT NULL |
| webhook_logs | 0 | 40 kB | |
| organizations | 1 | — | `encrypted_fb_system_user_token` = NULL |
| system_notifications | 22.920 | 29 MB | Lớn thứ 2 |

### 5.2 Đánh giá thao tác migration Messenger trên dữ liệu thật

| Thao tác | Lock | Thời gian ước tính ở cỡ này | Cách làm |
|---|---|---|---|
| `CREATE TABLE` 7 bảng mới | Không ảnh hưởng bảng cũ | ms | Migration thường |
| `ALTER TABLE conversations ADD COLUMN channel_account_id text NULL` | ACCESS EXCLUSIVE, rất ngắn (không rewrite) | ms | Kèm `SET lock_timeout = '3s'` |
| `ALTER TABLE conversations ALTER COLUMN zalo_account_id DROP NOT NULL` | ACCESS EXCLUSIVE ngắn, không scan | ms | Migration riêng, **chỉ sau khi** code đã xử lý null (xem 9.2) |
| `ADD CONSTRAINT conversations_channel_xor CHECK (num_nonnulls(zalo_account_id, channel_account_id) = 1) NOT VALID` + `VALIDATE CONSTRAINT` | NOT VALID: ngắn; VALIDATE: SHARE UPDATE EXCLUSIVE (không chặn ghi) | 493 dòng: ms | Hai migration liên tiếp |
| `ALTER TABLE messages ADD COLUMN org_id text NULL`, `platform_message_id text NULL` | ACCESS EXCLUSIVE ngắn | ms | |
| Backfill `messages.org_id` từ `conversations.org_id` | ROW EXCLUSIVE | 55.690 dòng: vài giây | Batch 5.000 dòng theo `id` trong script, **không** đặt trong migration file |
| `messages.org_id SET NOT NULL` | Scan toàn bảng dưới ACCESS EXCLUSIVE | ~<1s ở 59 MB | Dùng `CHECK (org_id IS NOT NULL) NOT VALID` → `VALIDATE` → `SET NOT NULL` (PG16 bỏ qua scan khi đã có CHECK hợp lệ) |
| Unique index `messages(org_id, platform_message_id) WHERE platform_message_id IS NOT NULL` | Index thường: SHARE (chặn ghi) ~1s; CONCURRENTLY: không chặn | ~1s | Ở cỡ này index thường **chấp nhận được** trong giờ thấp điểm. Nếu dùng CONCURRENTLY thì mỗi file migration chỉ chứa **đúng một** câu lệnh (Prisma không cho chạy trong transaction nhiều lệnh) |
| FK `conversations.channel_account_id → channel_accounts` | `NOT VALID` rồi `VALIDATE` | ms | **`ON DELETE RESTRICT`**, không CASCADE như Zalo — xoá Page không được xoá lịch sử chat |

**Không giả định con số 46.000:** số thật là 55.690 và tăng ~20–30k/tháng. Mọi thời gian trên phải được **đo lại trên DB restore** (Gate §11), đó cũng là lần diễn tập migration.

### F-05 — Bán kính thay đổi của `zaloAccountId` nullable · **P1**
- **Evidence:** `zaloAccountId` xuất hiện 687 lần / 112 file backend; ~104 chỗ deref trực tiếp `conversation.zaloAccountId` / `conv.zaloAccount.`; 10 file `$queryRaw` + 2 file `$executeRaw` có `conversations`; frontend 27 file.
- **Risk:** TypeScript bắt được deref trong Prisma client, **không** bắt được raw SQL (`JOIN zalo_accounts` bằng `INNER JOIN` sẽ âm thầm loại conversation Messenger, hoặc ngược lại làm lộ chúng vào báo cáo Zalo).
- **Impact:** màn hình Zalo hiện sai hoặc 500 khi có conversation đầu tiên của Messenger.
- **Recommendation:**
  - Không redesign — XOR vẫn đúng.
  - Tách thành PR-03a: đổi kiểu và sửa toàn bộ compile error, thêm `where: { zaloAccountId: { not: null } }` vào mọi query thuộc module Zalo.
  - Audit 12 file raw SQL bằng checklist.
  - DB constraint chỉ bật khi PR-03a đã chạy production ≥ 3 ngày mà chưa có dòng Messenger nào.
- **Phase:** PR-03.

### F-10 — Chưa kiểm tra drift bằng công cụ · **P2**
- **Recommendation:** trên DB restore chạy `npx prisma migrate diff --from-url <restore> --to-schema-datamodel prisma/schema.prisma --script`. Kết quả phải rỗng.
- **Phase:** Gate §11.

---

## 6. Security Audit

| ID | Phát hiện | Evidence | Risk / Impact | Recommendation | Mức | Phase |
|---|---|---|---|---|---|---|
| S-01 | Port 3080/9000/5678 công khai | §4 F-02 | Bypass TLS / rate-limit; MinIO anonymous | Đổi bind (cần duyệt) | P1 | Trước Phase 3 |
| S-02 | 3 khoá mã hoá, 1 khoá chết | `session-crypto` (`ENCRYPTION_KEY`), `token-encryption.util` (`TOKEN_ENCRYPTION_KEY`, **3 dòng `app_settings` đang dùng**), `aes-gcm` (`FB_TOKEN_ENC_KEY` rỗng, không import) | Nhầm khoá → mất khả năng giải mã | Xem 7.5. **Không** đổi/rotate `TOKEN_ENCRYPTION_KEY` hay `ENCRYPTION_KEY` | P2 | PR-01 |
| S-03 | Logger không redaction | `shared/utils/logger.ts` không có `redact` | Payload Messenger (PSID, nội dung, token trong URL Graph) lọt log json-file 20m×5 | Thêm redactor cho `access_token`, `appsecret_proof`, `x-hub-signature-256`, `Authorization`, `hub.verify_token`; cấm log raw body | P1 cho Messenger | PR-01 |
| S-04 | `webhook_verify_token` plaintext trong `facebook_app_configs` / `facebook_page_accounts` | schema | Bảng 0 dòng, chưa bị khai thác | Không dùng hai bảng này; verify token để ở env, so sánh timing-safe | P3 | PR-02 |
| S-05 | Tenant isolation chỉ dựa vào code | `TENANT_GUARD_MODE=off`, `RLS_SET_CONFIG=false`, 0 policy | Hiện có 1 org nên rủi ro thấp | Model Messenger mới đều có `orgId` và nằm trong `org-scoped-models.ts`; bật `warn` ở staging | P3 | PR-02 |
| S-06 | `.env` 644 | stat | Đọc được bởi user local | `chmod 600` (cần duyệt) | P2 | Pre-deploy |
| S-07 | Secret trong git | `git ls-files` chỉ có `.env.example`, `backend/.env.example`, `mcp-server/.env.example`; `.gitignore` chặn `.env`, `backups/`; `.dockerignore` chặn `.env*` | Không | Giữ nguyên | — | — |
| S-08 | Toàn bộ `.env` vào container app | `env_file: .env` | Lộ qua `docker inspect` cho ai có quyền docker (≈ root) | Chấp nhận; ghi nhận | P3 | — |
| S-09 | `FRIEND_INVITE_TEST_MODE=true` trên production | env | Không liên quan Messenger; có thể là cố ý | Chủ sản phẩm xác nhận | P3 | — |
| S-10 | CSP `report-only` | env | XSS không bị chặn cứng | Không thuộc phạm vi này | P3 | — |

**Yêu cầu bảo mật bắt buộc cho webhook Meta (đưa vào test của PR-02):**
1. HMAC-SHA256 tính trên **raw body bytes** (không phải `JSON.stringify(request.body)`), so sánh bằng `crypto.timingSafeEqual` sau khi kiểm tra độ dài.
2. **Fail closed:**
   - Thiếu `FB_APP_SECRET` hoặc header `X-Hub-Signature-256` → 401, không ghi `ChannelEvent`.
   - Chữ ký sai → 401, tăng `meta_webhook_invalid_signature_total`, chỉ ghi `WebhookDelivery` dạng metadata (không body).
3. `publicAppKey` trong URL để **chọn** App, không phải cơ chế xác thực. Key lạ → 404, không tiết lộ lý do.
4. GET verify: `hub.mode=subscribe` và `hub.verify_token` khớp (timing-safe) → trả `hub.challenge` dạng text; mọi trường hợp khác → 403.
5. Giới hạn body (Meta gửi batch nhỏ): 1 MB cho route này, tách khỏi `max_size 500MB` chung.
6. Không log token, secret, chữ ký, raw body. Raw body chỉ lưu trong `WebhookDelivery.payload` có TTL **7 ngày**, sau đó job xoá.

---

## 7. Messenger Architecture — Final

Kiến trúc đã chốt được giữ nguyên. Chỉ có ba điều chỉnh do repo thật khác giả định (7.4, 7.5, 7.7).

### 7.1 Danh tính và token
- `ChannelAccount(provider=FACEBOOK_PAGE, externalId=PAGE_ID, orgId)` sở hữu Messenger, Lead Ads (tương lai) và `TokenCredential`.
- Unique `(provider, externalId)` **toàn hệ thống**: một Page chỉ thuộc một org.
- **Một Page = một identity = một token source.** `TokenCredential` 1–1 với `ChannelAccount` (unique `channelAccountId` + `status=ACTIVE`).
- Cờ per-Page trên `ChannelAccount`: `inboundEnabled`, `outboundEnabled`, `aiAutoSendEnabled` (mặc định `false`).

### 7.2 Luồng inbound
```
POST /api/v1/webhooks/meta/:publicAppKey
  └─ rawBody → HMAC verify (fail closed)
     └─ INSERT WebhookDelivery (dedup: sha256(rawBody))       → 200 ngay (< 2s)
        └─ classify từng entry:
             entry[].messaging[] → messaging    entry[].changes[field=leadgen] → leadgen
           └─ INSERT ChannelEvent (dedupKey theo namespace, xem 7.6)
              └─ processor (in-process, poll ChannelEvent PENDING, SKIP LOCKED)
                   messaging.message       → Contact/ContactIdentity → Conversation → Message → socket emit
                   messaging.message.is_echo → cập nhật Message outbound / tạo Message "self"
                   delivery / read         → cập nhật deliveredAt / seenAt
                   leadgen                 → status=IGNORED_UNSUPPORTED (không có code Lead Ads, xem 7.4)
```
Khi `MESSENGER_INBOUND_ENABLED=false` hoặc Page `inboundEnabled=false`: vẫn verify HMAC, trả 200, **không** tạo `ChannelEvent`. `WebhookDelivery` chỉ ghi metadata để Meta không tắt subscription vì lỗi liên tục.

### 7.3 Luồng outbound (Outbox)
```
SendRequest (UI người / AI)
  └─ MessagingPolicyEngine.evaluate(conversation, actor, now)
       ≤ 24h kể từ tin khách cuối          → ALLOW (RESPONSE)
       24h–7d                              → chỉ actor=HUMAN, tag=HUMAN_AGENT; AI → DENY
       > 7d                                → DENY
       tag ∈ {CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE, POST_PURCHASE_UPDATE} → DENY luôn
       token.status ≠ ACTIVE / flag OFF    → DENY (OUTBOUND_DISABLED)
  └─ BEGIN
       INSERT Message(status=PENDING, is_local=true, client_echo_id)
       INSERT OutboundCommand(status=PENDING, idempotencyKey, policySnapshot)
     COMMIT
  └─ Dispatcher (poll 1s, FOR UPDATE SKIP LOCKED, batch 20)
       PENDING → DISPATCHING → BullMQ add(jobId = OutboundCommand.id)
  └─ MetaSender worker → Graph API /me/messages
       OK       → SENT, Message.platformMessageId = message_id
       lỗi tạm  → retry theo backoff (613, 5xx, timeout)
       lỗi token (190 / 10 / 200) → FAILED + TokenCredential.status=INVALID + tắt outbound Page + alert
       2018001 / tag bị chặn → FAILED, không retry
```
- **Redis chết sau COMMIT:** lệnh vẫn `PENDING` trong Postgres; dispatcher giữ nguyên và thử lại. `jobId` = id của command nên enqueue lại không nhân đôi. Một command kẹt ở `DISPATCHING` > 60s được trả về `PENDING` bởi reaper.
- **Rollback / tắt flag:** `UPDATE outbound_commands SET status='ABANDONED' WHERE status IN ('PENDING','DISPATCHING')` và Message tương ứng → `FAILED` hiển thị cho người dùng. **Không bao giờ** gửi lại hàng loạt tự động khi bật lại.

### 7.4 Lead Ads — trả lời 6 câu hỏi (dựa trên repo thật)

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Lead Ads dùng endpoint nào? | **Không có endpoint nào đang chạy.** `app.ts:112` ghi Lead Ads nằm trong `src/_ee/facebook`; thư mục này không có trong repo, image hay VPS (log: *Community edition — _ee bundle absent*). `FB_OAUTH_REDIRECT_URI` trong `.env.example` trỏ tới `/api/v1/integrations/facebook/oauth/callback` — route **không được đăng ký** |
| 2 | `FacebookPageConnection` được dùng ở đâu? | Chỉ trong schema và là đích FK của `FacebookFormMapping`. Code core chỉ đọc `facebookFormMapping` (khoá list: `lists/list-routes.ts:130,549,675`) và `webhookLog` (`lists/list-entry-routes.ts:719`). 0 dòng dữ liệu |
| 3 | `accessTokenEnc` được đọc ở đâu? | **Không ở đâu** trong `backend/src` (grep = 0). Tương tự `encryptedFbSystemUserToken` và `FacebookPageAccount.encryptedAccessToken` (chỉ có tên model trong `org-scoped-models.ts:29`) |
| 4 | Có rủi ro hai nguồn token? | **Hiện tại không** (0 dòng, 0 code đọc). **Tiềm ẩn cao:** 4 chỗ lưu token FB trong schema; nếu bundle `_ee` được thêm lại sẽ ghi vào `facebook_page_connections` song song với `TokenCredential` |
| 5 | Chuyển `FacebookFormMapping` sang `ChannelAccount` ngay được không? | **Được và rẻ** vì bảng rỗng: thêm cột nullable `channel_account_id`. Nhưng **không cần làm trong đợt Messenger** vì không có code Lead Ads dùng nó. Không xoá `page_connection_id` |
| 6 | Migration trung gian tốt nhất? | **Freeze + Expand, không Contract:** (a) PR-02 thêm `facebook_form_mappings.channel_account_id NULL` + FK `RESTRICT`; (b) đánh dấu `@deprecated` trong schema cho 4 chỗ lưu token cũ; (c) thêm test kiến trúc cấm `prisma.facebookPageConnection.create/update` và đọc `accessTokenEnc`; (d) webhook classifier xếp `leadgen` vào `IGNORED_UNSUPPORTED`; (e) chỉ drop các bảng cũ khi có quyết định viết Lead Ads mới trên `ChannelAccount` — tối thiểu sau pilot, trong PR riêng, có backup |

### 7.5 Khoá mã hoá — hợp nhất
- `TokenCredential.encryptedToken` dùng **`TOKEN_ENCRYPTION_KEY`** qua `token-encryption.util.ts`. Khoá này đã có trên VPS và đang mã hoá API key AI, nên **không thay giá trị**.
- Thêm cột `keyVersion SMALLINT NOT NULL DEFAULT 1`. Util nhận `TOKEN_ENCRYPTION_KEY_V<n>` khi rotate trong tương lai (thử theo `keyVersion`, fallback về V1). Nhờ đó dữ liệu cũ luôn giải mã được.
- `FB_TOKEN_ENC_KEY`: rỗng trên VPS, không có dữ liệu nào mã hoá bằng nó (mọi cột FB đều 0 dòng), `aes-gcm.ts` không được import → **deprecated**. Xoá code và dòng env trong PR-01 sau khi re-check DB ngay trước merge (`SELECT count(*)` 4 chỗ lưu token = 0).
- `ENCRYPTION_KEY` (session Zalo) giữ riêng, không gộp.

### 7.6 Dedup — 4 namespace độc lập

| Loại | Khoá dedup | Nơi enforce |
|---|---|---|
| Webhook delivery | `sha256(rawBody)` | `webhook_deliveries.body_sha256` UNIQUE (TTL 7 ngày) |
| Inbound message | `msg:{pageId}:{mid}` | `channel_events.dedup_key` UNIQUE + `messages(org_id, platform_message_id)` UNIQUE partial |
| Echo | `echo:{pageId}:{mid}` | `channel_events.dedup_key` — **khác namespace** với `msg:`, vì echo của tin gửi từ CRM có cùng `mid` với response Graph API |
| Delivery / read | `dlv:{pageId}:{psid}:{watermark}` / `read:{pageId}:{psid}:{watermark}` | `channel_events.dedup_key`; xử lý idempotent (chỉ tăng watermark) |

### 7.7 Contact
- `ContactIdentity(orgId, provider, externalId=PSID, channelAccountId, contactId)`, unique `(channelAccountId, externalId)` vì PSID thuộc về từng Page.
- **Không auto-merge.** Mỗi PSID mới tạo Contact mới. Merge chỉ làm tay qua UI, ghi `ContactMergeAudit` (snapshot trước, id các bản ghi đã chuyển) và có **undo**.
- Cột `contacts.merged_into` hiện có (merge cũ) giữ nguyên; merge Messenger không dùng lại cột này làm cơ chế undo.

### 7.8 Token lifecycle (System User token)
- `TokenCredential`: `status (ACTIVE|INVALID|REVOKED)`, `version`, `keyVersion`, `encryptedToken`, `scopes`, `lastValidatedAt`, `invalidatedAt`, `lastError (GraphApiError JSON)`.
- **Không có** job refresh 60 ngày.
- Health check mỗi 6h gọi `GET /debug_token` hoặc `GET /{page-id}?fields=id`.
- Graph lỗi 190 / 10 / 200 → `INVALID`, sau đó:
  - tắt outbound của Page;
  - `OutboundCommand` PENDING → `BLOCKED_TOKEN`;
  - tạo `system_notification` cho admin;
  - tăng `token_invalid_total`.
- Thay token = tạo `TokenCredential` version mới rồi deactivate bản cũ, trong một transaction.

---

## 8. Required Code Changes

| Module / file | Thay đổi | PR |
|---|---|---|
| `docker/`, `DEPLOY.md`, `VPS-FIRST-DEPLOY.md`, `scripts/ops/` (mới) | Deploy có tag image, lệnh compose chuẩn, script backup media + verify restore | PR-00 |
| `backend/tests/characterization/` (mới) | 10 nhóm test Zalo (§3.3) chạy trên DB test; snapshot số lượng message/conversation/socket emit | PR-00 |
| `shared/utils/logger.ts` | Redactor | PR-01 |
| `config/index.ts` | Parse `MESSENGER_*`, `FB_WEBHOOK_PUBLIC_KEY`. **Không** làm crash app khi thiếu FB secret: module Messenger tự tắt, `/health/ready` báo `messenger: "misconfigured"` và log CRITICAL. Chỉ fail-fast khi `MESSENGER_ENABLED=true` **và** `TOKEN_ENCRYPTION_KEY` sai độ dài | PR-01 |
| `integrations/_shared/token-encryption.util.ts` | Keyring theo `keyVersion` | PR-01 |
| `shared/crypto/aes-gcm.ts` | Xoá | PR-01 |
| `modules/channels/` (mới): `channel-account.service.ts`, `token-credential.service.ts` | CRUD ChannelAccount + token (admin-only, RBAC `settings:edit`) | PR-02 |
| `modules/channels/meta/webhook-routes.ts`, `meta-signature.ts`, `webhook-classifier.ts` | GET verify, POST raw body + HMAC + WebhookDelivery + ChannelEvent | PR-02 |
| `shared/tenant/org-scoped-models.ts` | Thêm 7 model mới | PR-02 |
| `modules/chat/*`, `modules/zalo/*`, raw SQL 12 file, frontend 27 file | Xử lý `zaloAccountId` nullable; lọc `zaloAccountId != null` trong ngữ cảnh Zalo | PR-03 |
| `modules/channels/meta/event-processor.ts`, `contact-identity.service.ts` | Xử lý message / echo / delivery / read | PR-04 |
| `modules/channels/messaging-policy-engine.ts`, `outbound-command.service.ts`, `outbound-dispatcher.ts`, `meta-sender.worker.ts`, `graph-api-error.ts` | Outbox + policy + sender | PR-05 |
| `modules/chat/chat-routes.ts` + frontend chat | Nút gửi đi qua PolicyEngine, hiển thị cửa sổ 24h/7d | PR-05 |
| `modules/ai/*` | AI auto-reply bỏ qua conversation có `channelAccountId` trừ khi `MESSENGER_AI_AUTO_SEND_ENABLED` + Page `aiAutoSendEnabled` + trong 24h | PR-06 |
| `modules/contacts/*` + UI | Merge tay + audit + undo | PR-06 |
| `modules/channels/metrics.ts`, route `/internal/metrics` (chỉ loopback) | Counter/gauge | PR-07 |

---

## 9. Required Schema Changes

### 9.1 Expand — thêm mới, không phá vỡ (PR-02)

```prisma
model ChannelAccount {
  id                String   @id @default(uuid())
  orgId             String   @map("org_id")
  provider          String   // FACEBOOK_PAGE
  externalId        String   @map("external_id")        // PAGE_ID
  displayName       String?  @map("display_name")
  metaAppKey        String   @map("meta_app_key")        // = FB_WEBHOOK_PUBLIC_KEY lúc tạo
  inboundEnabled    Boolean  @default(false) @map("inbound_enabled")
  outboundEnabled   Boolean  @default(false) @map("outbound_enabled")
  aiAutoSendEnabled Boolean  @default(false) @map("ai_auto_send_enabled")
  status            String   @default("ACTIVE")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  @@unique([provider, externalId])
  @@index([orgId])
  @@map("channel_accounts")
}

model TokenCredential {
  id               String    @id @default(uuid())
  orgId            String    @map("org_id")
  channelAccountId String    @map("channel_account_id")
  kind             String    // SYSTEM_USER_PAGE_TOKEN
  encryptedToken   String    @map("encrypted_token") @db.Text
  keyVersion       Int       @default(1) @map("key_version") @db.SmallInt
  version          Int       @default(1)
  status           String    @default("ACTIVE") // ACTIVE | INVALID | REVOKED | SUPERSEDED
  scopes           String[]  @default([])
  lastValidatedAt  DateTime? @map("last_validated_at")
  invalidatedAt    DateTime? @map("invalidated_at")
  lastError        Json?     @map("last_error")
  createdAt        DateTime  @default(now()) @map("created_at")
  @@unique([channelAccountId, version])
  @@index([status, lastValidatedAt])
  @@map("token_credentials")
}
// + partial unique (raw SQL trong migration):
// CREATE UNIQUE INDEX token_credentials_one_active ON token_credentials(channel_account_id) WHERE status = 'ACTIVE';
```

Các model còn lại (cùng migration, tất cả đều có `orgId`):
- `ContactIdentity`: unique `(channel_account_id, external_id)`, index `(contact_id)`.
- `ContactMergeAudit`: `survivorId`, `mergedId`, `snapshot Json`, `movedRefs Json`, `undoneAt`, `actorUserId`.
- `WebhookDelivery`: `bodySha256` UNIQUE, `appKey`, `signatureValid`, `receivedAt`, `payload Json?` (TTL 7 ngày), `payloadPurgedAt`.
- `ChannelEvent`: `dedupKey` UNIQUE, `kind`, `status`, `attempts`, `nextAttemptAt`, `lastError`, `webhookDeliveryId`; index `(status, next_attempt_at)`.
- `OutboundCommand`: `idempotencyKey` UNIQUE, `conversationId`, `messageId`, `status`, `actorType`, `messagingType`, `tag`, `policySnapshot Json`, `attempts`, `lockedAt`, `sentAt`, `lastError Json`; index `(status, created_at)`.

Ràng buộc chung:
- FK tới `channel_accounts` và `conversations` dùng `ON DELETE RESTRICT`.
- `facebook_form_mappings.channel_account_id text NULL` + FK `RESTRICT`.

Thêm cột nullable:
- `conversations.channel_account_id`
- `messages.org_id`
- `messages.platform_message_id`

**Rollback của PR-02:** code cũ bỏ qua các bảng/cột mới nên **không cần** down migration. Chỉ drop khi chắc chắn chưa có dữ liệu Messenger (xem §15.4).

### 9.2 Chuyển đổi (PR-03) — thứ tự bắt buộc
1. **03a (code):** Prisma schema đổi `zaloAccountId String?` nhưng **migration DB chưa đổi**. DB vẫn NOT NULL nên an toàn; code đã chịu được null. Deploy, chạy ≥ 3 ngày.
2. **03b (data):** script `scripts/ops/backfill-message-org-id.ts` chạy batch 5.000 dòng, idempotent, `lock_timeout 3s`, log tiến độ. Chạy tay, có duyệt.
3. **03c (migration):**
   ```sql
   SET lock_timeout = '3s';
   ALTER TABLE conversations ALTER COLUMN zalo_account_id DROP NOT NULL;
   ALTER TABLE conversations ADD CONSTRAINT conversations_channel_xor
     CHECK (num_nonnulls(zalo_account_id, channel_account_id) = 1) NOT VALID;
   ALTER TABLE conversations ADD CONSTRAINT conversations_channel_account_id_fkey
     FOREIGN KEY (channel_account_id) REFERENCES channel_accounts(id) ON DELETE RESTRICT NOT VALID;
   ```
4. **03d (migration riêng):**
   ```sql
   ALTER TABLE conversations VALIDATE CONSTRAINT conversations_channel_xor;
   ALTER TABLE conversations VALIDATE CONSTRAINT conversations_channel_account_id_fkey;
   CREATE UNIQUE INDEX conversations_channel_account_id_external_thread_id_key
     ON conversations(channel_account_id, external_thread_id) WHERE channel_account_id IS NOT NULL;
   ```
5. **03e (migration riêng, sau khi backfill = 0 dòng thiếu):**
   ```sql
   ALTER TABLE messages ADD CONSTRAINT messages_org_id_not_null CHECK (org_id IS NOT NULL) NOT VALID;
   ALTER TABLE messages VALIDATE CONSTRAINT messages_org_id_not_null;
   ALTER TABLE messages ALTER COLUMN org_id SET NOT NULL;
   ALTER TABLE messages DROP CONSTRAINT messages_org_id_not_null;
   CREATE UNIQUE INDEX messages_org_id_platform_message_id_key
     ON messages(org_id, platform_message_id) WHERE platform_message_id IS NOT NULL;
   ```
   Code ghi `messages.org_id` cho mọi message mới phải được deploy **trước** 03b.

### 9.3 Không làm trong đợt này
- Không drop `facebook_page_connections`, `facebook_page_accounts`, `facebook_app_configs`, `organizations.encrypted_fb_system_user_token`.
- Không bật RLS.

---

## 10. Environment Variables

Theo quy ước repo: tiền tố **`FB_*`** cho Meta (không dùng `META_*`), cờ tính năng dạng `XXX_ENABLED`.

| Biến | Loại | Secret? | Mặc định | Trạng thái VPS | Ghi chú |
|---|---|---|---|---|---|
| `MESSENGER_ENABLED` | required (flag tổng) | non-secret | `false` | chưa có | Tắt thì route webhook trả 404, dispatcher không chạy |
| `MESSENGER_INBOUND_ENABLED` | required | non-secret | `false` | chưa có | AND với `ChannelAccount.inboundEnabled` |
| `MESSENGER_OUTBOUND_ENABLED` | required | non-secret | `false` | chưa có | AND với `outboundEnabled` + token ACTIVE |
| `MESSENGER_AI_AUTO_SEND_ENABLED` | required | non-secret | `false` | chưa có | AND với `aiAutoSendEnabled` |
| `FB_APP_ID` | required khi bật | non-secret | — | rỗng | |
| `FB_APP_SECRET` | required khi bật | **secret** | — | rỗng | Dùng cho HMAC + `appsecret_proof` |
| `FB_WEBHOOK_VERIFY_TOKEN` | required khi bật | **secret** | — | rỗng | Sinh bằng `openssl rand -hex 32` |
| `FB_WEBHOOK_PUBLIC_KEY` | required khi bật | non-secret (nằm trong URL) | — | chưa có | Chuỗi ngẫu nhiên 16–24 ký tự; chọn App trong URL |
| `FB_GRAPH_API_VERSION` | optional | non-secret | `v21.0` | `v21.0` | **Kiểm tra lịch hết hạn v21.0 trên Meta changelog trong Spike**; cập nhật nếu sắp hết |
| `TOKEN_ENCRYPTION_KEY` | required | **secret** | — | có | **Không thay** — đang mã hoá dữ liệu AI |
| `TOKEN_ENCRYPTION_KEY_V2` | optional | **secret** | — | — | Chỉ dùng khi rotate |
| `MESSENGER_DISPATCHER_INTERVAL_MS` | optional | non-secret | `1000` | — | |
| `MESSENGER_WEBHOOK_PAYLOAD_TTL_DAYS` | optional | non-secret | `7` | — | |
| `FB_TOKEN_ENC_KEY` | **deprecated → remove** | secret | — | rỗng | Xoá khỏi `.env.example` (PR-01); xoá dòng rỗng trong `.env` VPS (cần duyệt) |
| `FB_OAUTH_REDIRECT_URI` | **deprecated** cho Messenger | non-secret | — | có | Không cần với System User token; giữ tới khi quyết định Lead Ads |

**Kiểm tra lộ secret:**
- Git: sạch (S-07).
- Compose: `env_file` đẩy vào container (S-08).
- Log: chưa có redaction (S-03), bắt buộc xong trước khi bật flag.
- Fail-fast: xem PR-01 — Messenger tự tắt, **không** kéo Zalo sập.

---

## 11. Backup & Restore Gate

### 11.1 Kết quả hiện tại

| Hạng mục | Trạng thái | Đạt? |
|---|---|---|
| PostgreSQL auto backup | Service `zalo-crm-backup` (`prodrigestivill/postgres-backup-local` v0.0.11), `SCHEDULE=@daily`, `-Z1`, giữ 7/4/3. **0 file** trong `/root/ZaloCRM-CorepViet/backups` | ❌ |
| Media volume `zalocrm-corepviet_file_storage` | 3.7 G, 5.781 file, **không có backup** | ❌ |
| MinIO `minio_data` | 328 K | ❌ (nhỏ, gộp chung) |
| Redis | AOF bật; chỉ chứa dữ liệu queue tạm thời | Chấp nhận (không phải nguồn sự thật) |
| Off-site | Không có rclone/restic/borg/aws/s3cmd; backup chỉ nằm trên cùng disk | ❌ |
| Restore test | Chưa từng | ❌ |
| RPO / RTO | Chưa đo; RPO hiện tại = **không giới hạn** (không có bản nào) | ❌ |

## ⛔ STOP — KHÔNG DEPLOY MIGRATION PRODUCTION
Gate chỉ mở khi đủ **tất cả** điều kiện sau và có bằng chứng dán vào §11.4.

### 11.2 Điều kiện mở gate
1. Có ≥ 1 bản dump Postgres hoàn chỉnh (`.sql.gz`, kiểm tra `gzip -t`) tạo **trong 24h** trước migration, và một bản dump thủ công ngay trước migration.
2. Media `file_storage` được sao lưu; số file khớp với volume.
3. Bản dump + media có bản sao off-site (ngoài VPS), kiểm tra checksum.
4. Restore test vào container tạm thành công, bao gồm:
   - `_prisma_migrations` = 127, không dòng `finished_at IS NULL`;
   - số dòng `messages` / `conversations` / `contacts` / `organizations` khớp production (sai lệch chỉ do tin mới sau lúc dump);
   - `prisma migrate diff` rỗng;
   - **chạy thử toàn bộ migration PR-02 và PR-03 trên bản restore**, ghi lại thời gian từng bước.
5. Ghi nhận **RPO**, **RTO**, dung lượng backup, thời gian restore.

### 11.3 COMMAND REQUIRES APPROVAL — backup & restore

> Chưa chạy. Người vận hành chạy từng khối sau khi duyệt.

```bash
# B-1: dump thủ công ngay (không restart gì)
docker exec zalo-crm-backup /backup.sh
ls -la /root/ZaloCRM-CorepViet/backups/last/ && gzip -t /root/ZaloCRM-CorepViet/backups/last/*-latest.sql.gz && echo GZIP_OK
```

```bash
# B-2: sao lưu media (không nén vì phần lớn là ảnh/video) — cần ~3.8G trống
mkdir -p /opt/backups/zalocrm-media
tar -C /var/lib/docker/volumes/zalocrm-corepviet_file_storage/_data -cf /opt/backups/zalocrm-media/file_storage-$(date +%Y%m%d-%H%M).tar .
tar -tf /opt/backups/zalocrm-media/file_storage-*.tar | grep -vc '/$'   # phải = số file trong volume
```

```bash
# B-3: restore test vào container tạm, KHÔNG gắn network production, KHÔNG publish port
docker run -d --name zalocrm-restore-test --network none \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore-temp -e POSTGRES_DB=zalocrm \
  --memory 1g postgres:16-alpine
sleep 8
time (gunzip -c /root/ZaloCRM-CorepViet/backups/last/*-latest.sql.gz | docker exec -i zalocrm-restore-test psql -U restore -d zalocrm -q -v ON_ERROR_STOP=1)
docker exec -i zalocrm-restore-test psql -U restore -d zalocrm -At -c "
  select 'migrations', count(*), count(*) filter (where finished_at is null) from _prisma_migrations;
  select 'messages', count(*) from messages; select 'conversations', count(*) from conversations;
  select 'contacts', count(*) from contacts; select 'organizations', count(*) from organizations;
  select 'db_size', pg_size_pretty(pg_database_size('zalocrm'));"
```
Nếu dump có lệnh gán owner/role khác (`crmuser`), tạo role trước: `docker exec zalocrm-restore-test psql -U restore -c "create role crmuser"`.

```bash
# B-4: diễn tập migration trên bản restore (sau khi PR-02/PR-03 có image)
docker run --rm --network container:zalocrm-restore-test \
  -e DATABASE_URL='postgresql://restore:restore-temp@127.0.0.1:5432/zalocrm' \
  zalocrm-corepviet-app:<sha-PR02> sh -c 'time npx prisma migrate deploy && npx prisma migrate status'
```

```bash
# B-5: dọn container tạm sau khi ghi kết quả
docker rm -f zalocrm-restore-test
```

```bash
# B-6: off-site — cần chủ hệ thống chọn đích (Google Drive / S3 / máy khác) rồi mới cài công cụ
# ví dụ rclone (cài đặt = thay đổi VPS):
#   apt-get install -y rclone && rclone config
#   rclone copy /root/ZaloCRM-CorepViet/backups remote:zalocrm/db --checksum
#   rclone copy /opt/backups/zalocrm-media remote:zalocrm/media --checksum
# + cron hằng ngày 01:30 sau khi dump 00:00
```

### 11.4 Bảng ghi bằng chứng (điền sau khi chạy)

| Chỉ số | Giá trị | Người / thời điểm |
|---|---|---|
| File dump + dung lượng | | |
| `gzip -t` | | |
| Tar media: số file / dung lượng | | |
| Off-site đích + checksum khớp | | |
| Thời gian restore DB (RTO-DB) | | |
| Thời gian restore media (RTO-media) | | |
| RTO tổng (dự kiến: dựng lại từ đầu + restore) | | |
| RPO | Mục tiêu: 24h định kỳ; **0** cho cửa sổ migration (dump thủ công ngay trước) | |
| Số dòng restore vs production | | |
| `migrate diff` rỗng | | |
| Thời gian diễn tập PR-02 / PR-03 migration | | |

---

## 12. Pre-Deploy Checklist

Chỉ đọc, không restart. Chạy ngay trước **mỗi** bước deploy trong §13.

| # | Kiểm tra | Lệnh (read-only) | Đạt khi |
|---|---|---|---|
| 1 | Git sạch, đúng commit | `cd /root/ZaloCRM-CorepViet && git status --porcelain && git rev-parse HEAD` | Rỗng; SHA = SHA đã review |
| 2 | Compose project đúng file | `docker inspect zalo-crm-app --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'` | Chỉ `docker-compose.yml` |
| 3 | Container | `docker ps --format '{{.Names}} {{.Status}}' \| grep zalo-crm` | app healthy, db/redis/minio/backup Up |
| 4 | Disk | `df -h / \| tail -1` | < 80% |
| 5 | RAM | `free -m` | available > 1.5 G |
| 6 | Postgres | `docker exec zalo-crm-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from _prisma_migrations where finished_at is null; select count(*) from pg_stat_activity where xact_start < now()-interval \x275 min\x27;"'` | 0 và 0 |
| 7 | Redis | `docker exec zalo-crm-redis redis-cli info persistence \| grep aof_last_write_status` | `ok` |
| 8 | Queue | `docker exec zalo-crm-redis redis-cli llen bull:group-scan:active` | Không có job active dài |
| 9 | App health | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/health/ready` | 200 |
| 10 | Websocket | Mở UI chat, thấy tin mới realtime (thủ công) | OK |
| 11 | TLS / Caddy | `docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` + `curl -sI https://zalocrm.corepviet.com/health/ready` | Valid + 200 |
| 12 | DNS | `getent hosts zalocrm.corepviet.com` | 157.66.219.190 |
| 13 | Backup gate | §11.4 đã điền, dump < 24h | Có |
| 14 | Image rollback có sẵn | `docker image ls zalocrm-corepviet-app` | Có tag `<sha-trước>` |
| 15 | Giờ thấp điểm | Hỏi vận hành; log inbound 15 phút gần nhất ít | Đồng ý |

---

## 13. Deployment Runbook

Nguyên tắc: **schema, backend và bật tính năng không bao giờ nằm chung một bước.** Mỗi bước là một lần duyệt riêng. Mọi lệnh bên dưới đều thuộc **COMMAND REQUIRES APPROVAL**.

Lệnh deploy chuẩn (dùng lại ở nhiều bước):
```bash
cd /root/ZaloCRM-CorepViet
OLD=$(git rev-parse --short HEAD)
docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:$OLD
git fetch && git checkout <SHA-MỚI>
docker compose -f docker-compose.yml build app
docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:$(git rev-parse --short HEAD)
docker compose -f docker-compose.yml up -d --no-deps app
```
Lệnh rollback ứng dụng chuẩn:
```bash
docker tag zalocrm-corepviet-app:$OLD zalocrm-corepviet-app:latest
git checkout $OLD
docker compose -f docker-compose.yml up -d --no-deps --no-build app
```

| Bước | Action | Expected result | Verification | Rollback trigger | Rollback action |
|---|---|---|---|---|---|
| **D0** Hạ tầng tiên quyết | Thực hiện B-1…B-6 (§11.3); `chmod 600 .env`; `docker builder prune -f`; đổi bind 3080 → `172.17.0.1:3080` (sửa compose, recreate app) | Gate §11 mở; disk < 70%; 3080 không truy cập được từ Internet | `curl -m5 http://157.66.219.190:3080/health/live` timeout; `curl https://zalocrm.corepviet.com/health/ready` 200 | Site HTTPS ≠ 200 sau đổi bind | Trả bind `${APP_PORT:-3080}:3000`, recreate app |
| **D1** PR-00 + PR-01 (không migration) | Deploy chuẩn | App healthy; log có redaction; không có route Messenger | §14.1 Zalo; `grep -c 'access_token=' logs` = 0 | `/health/ready` ≠ 200 sau 3 phút; lỗi Zalo inbound/outbound | Rollback ứng dụng chuẩn |
| **D2** Schema expand (PR-02 migration) | B-1 dump thủ công → `docker compose -f docker-compose.yml run --rm --no-deps app npx prisma migrate deploy` (image **cũ** vẫn đang chạy) | 7 bảng mới + cột nullable; 0 dòng | `_prisma_migrations` +N, `finished_at` đủ; app cũ vẫn healthy | Migration fail / lock timeout | Xem §15.4 (bảng rỗng → drop an toàn theo script đã diễn tập) |
| **D3** Backend PR-02 (flag OFF) | Deploy chuẩn; `.env` **chưa** có `MESSENGER_*` (mặc định false) | Route webhook trả 404; Zalo bình thường | `curl -s -o /dev/null -w '%{http_code}' https://zalocrm.corepviet.com/api/v1/webhooks/meta/x` → 404 | Như D1 | Rollback ứng dụng (schema giữ nguyên) |
| **D4** PR-03a (code nullable) | Deploy chuẩn | Không thay đổi hành vi | §14.1 đầy đủ + characterization test đã pass ở CI local | Bất kỳ lỗi Zalo | Rollback ứng dụng |
| **D5** Quan sát | Chờ ≥ 3 ngày | Không lỗi mới liên quan conversation | So số lượng error log trước/sau | — | — |
| **D6** PR-03b backfill | `docker compose -f docker-compose.yml run --rm --no-deps app npx tsx scripts/ops/backfill-message-org-id.ts --batch 5000` | 0 message thiếu `org_id` | `select count(*) from messages where org_id is null` = 0 | Lock timeout lặp lại | Dừng script (idempotent, chạy lại sau) |
| **D7** PR-03c/d/e migration | Dump thủ công → `migrate deploy` | XOR + FK + unique index hợp lệ | `select conname, convalidated from pg_constraint where conname like 'conversations_channel%'` → true | Validate fail | Không drop cột; `DROP CONSTRAINT` vừa thêm (chưa có dữ liệu Messenger) |
| **D8** PR-04…PR-07 backend (flag OFF) | Deploy chuẩn cho từng PR, mỗi PR một lần | Không đổi hành vi | §14.1 + §14.3 | Như D1 | Rollback ứng dụng |
| **D9** Meta config | Điền `FB_APP_ID`, `FB_APP_SECRET`, `FB_WEBHOOK_VERIFY_TOKEN`, `FB_WEBHOOK_PUBLIC_KEY`, `MESSENGER_ENABLED=true`, `MESSENGER_INBOUND_ENABLED=false`; recreate app | `/health/ready` báo `messenger: "ready"` | GET verify từ Meta dashboard thành công | Health `misconfigured` | Đặt `MESSENGER_ENABLED=false`, recreate |
| **D10** Inbound test Page | Tạo ChannelAccount test Page (`inboundEnabled=true`), `MESSENGER_INBOUND_ENABLED=true`; subscribe webhook | Tin từ tài khoản test xuất hiện trong CRM | §14.2 | Sai chữ ký > 0 từ Meta; Zalo lỗi; duplicate message | Page `inboundEnabled=false` → nếu chưa đủ thì `MESSENGER_INBOUND_ENABLED=false` |
| **D11** Outbound test Page | `MESSENGER_OUTBOUND_ENABLED=true`, Page `outboundEnabled=true` | Trả lời trong 24h đến được tài khoản test; ngoài 7d bị chặn | §14.2 | `messenger_outbound_failed_total` tăng; gửi trùng | §15.2 + §15.3 |
| **D12** Pilot khách thật | Chỉ sau khi Gate 0D (Meta Advanced Access) PASS; bật 1 Page thật | | §14.2 + theo dõi 72h | Như D10/D11 | Như D10/D11 |
| **D13** AI auto-send | Bước riêng, sau ≥ 2 tuần pilot ổn định | | | Bất kỳ tin AI ngoài 24h | `MESSENGER_AI_AUTO_SEND_ENABLED=false` |

---

## 14. Post-Deploy Validation

### 14.1 Zalo (sau **mọi** bước)
- [ ] `/health/live`, `/health/ready` 200 (nội bộ + HTTPS)
- [ ] Log khởi động không có `FATAL`; mỗi nick Zalo có dòng listener connected
- [ ] Gửi 1 tin từ Zalo test → xuất hiện trong UI realtime (websocket)
- [ ] Trả lời từ CRM → đến Zalo test; `messages.sent_via` đúng
- [ ] Mở một conversation cũ: lịch sử hiển thị, label / assignment không đổi
- [ ] Broadcast: tạo bản nháp, preview audience (không gửi)
- [ ] AI suggestion trả lời được với 1 conversation test
- [ ] `bull:group-scan` không có failed mới
- [ ] Số `messages` tăng bình thường trong 30 phút; error log không tăng bất thường so với baseline (~390 dòng/giờ, chủ yếu `getFriendOnlines`)

### 14.2 Messenger
**Flag OFF (D3, D8):**
- [ ] `POST /api/v1/webhooks/meta/<key>` → 404
- [ ] Không có bản ghi mới trong `webhook_deliveries`, `channel_events`, `outbound_commands`
- [ ] Không tiến trình dispatcher (log không có `[messenger-dispatcher] started`)

**Test Page (D10–D11):**
- [ ] GET verify đúng token → challenge; sai token → 403
- [ ] POST chữ ký sai → 401, `meta_webhook_invalid_signature_total` +1, không có `ChannelEvent`
- [ ] Meta gửi lại cùng payload → `meta_webhook_duplicate_total` +1, không có message trùng
- [ ] Tin inbound tạo Contact + ContactIdentity + Conversation (`channel_account_id` có, `zalo_account_id` null) + Message có `platform_message_id`
- [ ] Echo của tin gửi từ CRM không tạo message thứ hai
- [ ] Delivery / read cập nhật `delivered_at` / `seen_at`
- [ ] Gửi trong 24h → SENT
- [ ] Giả lập >24h, actor AI → DENY; actor người → gửi kèm tag `HUMAN_AGENT` (chỉ khi Meta đã cấp)
- [ ] >7d → DENY
- [ ] Tag cấm → DENY trước khi gọi Graph
- [ ] Tắt Redis trong môi trường **staging** (không làm trên production): command vẫn PENDING, dispatch khi Redis quay lại, không trùng
- [ ] Token sai (staging) → INVALID, outbound Page tắt, có notification admin
- [ ] Conversation Messenger **không** xuất hiện trong danh sách/báo cáo chỉ dành cho Zalo

### 14.3 Hạ tầng
- [ ] Disk < 80%, RAM available > 1.5 G, container app không restart
- [ ] Postgres: kết nối < 30, không lock chờ, không long tx
- [ ] Redis `aof_last_write_status:ok`, used_memory < 128 M
- [ ] Caddy validate + TLS OK; 3080 không vào được từ ngoài (sau D0)
- [ ] Backup đêm đó tạo file mới + đồng bộ off-site

---

## 15. Rollback Runbook

### 15.1 Application rollback
- **Khi nào:** health ≠ 200 sau 3 phút; lỗi Zalo inbound/outbound; error log tăng > 3× baseline.
- **Làm gì:** lệnh rollback ứng dụng chuẩn ở §13. Thời gian dự kiến < 1 phút vì không build lại.
- **Điều kiện:** schema phải tương thích ngược (expand-only). Mọi PR đều tuân thủ điều này.

### 15.2 Feature rollback (ưu tiên đầu tiên cho sự cố Messenger)
1. Tắt theo **Page**: `update channel_accounts set outbound_enabled=false, inbound_enabled=false where id='<page>'`. Có hiệu lực ngay, không restart.
2. Tắt toàn cục: `.env` đặt `MESSENGER_OUTBOUND_ENABLED=false` / `MESSENGER_INBOUND_ENABLED=false` / `MESSENGER_ENABLED=false`, rồi `docker compose -f docker-compose.yml up -d --no-deps app`. Restart ~30s, Zalo reconnect.
3. Webhook khi tắt inbound vẫn trả 200 cho Meta, tránh việc Meta tự vô hiệu subscription.

### 15.3 Queue rollback
```sql
-- COMMAND REQUIRES APPROVAL
BEGIN;
UPDATE outbound_commands SET status='ABANDONED', last_error='{"reason":"rollback"}'
 WHERE status IN ('PENDING','DISPATCHING');
UPDATE messages SET metadata = coalesce(metadata,'{}'::jsonb) || '{"deliveryStatus":"FAILED_ROLLBACK"}'
 WHERE id IN (SELECT message_id FROM outbound_commands WHERE status='ABANDONED' AND updated_at > now()-interval '5 min');
COMMIT;
```
```bash
# Xoá job BullMQ Messenger còn chờ (không đụng queue Zalo)
docker exec zalo-crm-redis redis-cli --scan --pattern 'bull:messenger-send:*' | head   # xem trước
# sau khi duyệt: dùng script ops/obliterate-messenger-queue.ts (BullMQ obliterate, chỉ queue messenger-send)
```
Không tự động gửi lại các command ABANDONED.

### 15.4 Database rollback
| Thời điểm | Được phép |
|---|---|
| Sau D2, **trước** khi có bất kỳ dòng nào trong `channel_accounts` | Down script đã diễn tập trên bản restore: drop 7 bảng mới + drop cột nullable. Có thể không cần: app cũ bỏ qua chúng |
| Sau D7, trước tin Messenger đầu tiên | Drop constraint / index vừa thêm; giữ cột |
| **Sau tin Messenger đầu tiên (D10)** | **Không rollback schema phá huỷ.** Chỉ dùng feature + application + queue rollback. Không restore dump đè production (mất cả tin Zalo phát sinh sau đó) |
| Hỏng dữ liệu nghiêm trọng | Restore dump vào DB **riêng**, trích dữ liệu cần thiết, rồi sửa bằng script có duyệt. Restore đè chỉ dùng cho thảm hoạ, do chủ hệ thống quyết định, chấp nhận mất dữ liệu từ lúc dump |

---

## 16. Monitoring & Alerts

Repo hiện chưa có metrics. PR-07 thêm registry `prom-client` tại `/internal/metrics`, chỉ cho phép `127.0.0.1` / mạng docker. Trước khi có Prometheus, dùng một job trong app đẩy cảnh báo qua `system_notifications` (đã có) + Telegram bridge (đã có).

| Metric | Loại | Label | Cảnh báo |
|---|---|---|---|
| `meta_webhook_received_total` | counter | `app_key`, `kind` | Không nhận gì trong 24h khi Page đang bật (subscription có thể đã mất) |
| `meta_webhook_invalid_signature_total` | counter | `app_key` | > 5 / 10 phút |
| `meta_webhook_duplicate_total` | counter | `namespace` | Tỉ lệ > 30% trong 1h (Meta đang retry do mình phản hồi chậm) |
| `messenger_inbound_total` | counter | `page`, `type` | — |
| `messenger_outbound_pending` | gauge | `page` | > 20 trong 5 phút |
| `messenger_outbound_sent_total` | counter | `page`, `actor` | — |
| `messenger_outbound_failed_total` | counter | `page`, `code` | ≥ 3 / 15 phút |
| `messenger_graph_api_errors_total` | counter | `code`, `subcode` | Code 190/10/200 → cảnh báo ngay; 613 → theo dõi rate limit |
| `token_invalid_total` | counter | `page` | Bất kỳ lần tăng nào → cảnh báo ngay |
| `dispatcher_lag_seconds` | gauge | — | `now - oldest PENDING.created_at` > 60s |
| `queue_depth` | gauge | `queue`, `state` | `messenger-send` wait > 50; failed tăng |

**Logging:**
- Mỗi webhook delivery sinh `correlationId = webhookDelivery.id`, truyền xuống `ChannelEvent`, `Message.metadata.correlationId`, `OutboundCommand`, log MetaSender.
- Log chỉ ghi `pageId`, id nội bộ, `kind`, `code`. **Không** ghi nội dung tin, PSID đầy đủ (chỉ 4 ký tự cuối), token, chữ ký hay raw body.
- Payload webhook lưu trong DB có TTL 7 ngày, job xoá mỗi đêm.

**Health:** `/health/ready` thêm khối `messenger: {enabled, config: "ready"|"misconfigured", dispatcherLagSeconds}`. **Không** làm ready fail vì Messenger, nếu không Caddy/Docker sẽ đánh dấu cả app unhealthy và làm hỏng Zalo.

---

## 17. Meta Spike / Meta Access Dependencies

Giữ nguyên §3 của V3 (`docs/RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md`) và thêm các ràng buộc production.

| Phụ thuộc | Giả định làm việc | Chặn bước |
|---|---|---|
| `pages_messaging` **Advanced Access** (App Review) | **Cần** — Standard Access chỉ nhận/gửi với người có Role trên App | D12 (khách thật) |
| `pages_manage_metadata` (subscribe webhook), `pages_read_engagement` | Cần | D10 |
| Business Verification | Thường là điều kiện của Advanced Access | D12 |
| System User + gán Page task (MESSAGING) + token không hết hạn | Cần; kiểm tra bằng `debug_token` (`expires_at = 0`) | D9 |
| `HUMAN_AGENT` tag (feature riêng) | **Không giả định có**; Policy Engine phải DENY 24h–7d nếu chưa được cấp (cấu hình `humanAgentApproved=false` mặc định) | Chức năng 24h–7d |
| Graph API version | Kiểm tra ngày hết hạn `v21.0` | D9 |
| Webhook callback HTTPS công khai | `https://zalocrm.corepviet.com/api/v1/webhooks/meta/<key>`; Caddy hiện tại đủ | D9 |

**Thứ tự:** Spike (n8n endpoint tạm, Raw Body, không lưu execution, xoá sau gate) **chạy song song** với PR-00/PR-01, và **phải PASS trước D2** (schema production).
- Spike thất bại (`META_ACCESS_BLOCKED`): dừng ở D1. Không đưa schema Messenger lên production.
- Kết quả thành công "bất ngờ" với tài khoản không có Role phải được xác minh lại bằng một tài khoản thứ hai không có Role.

---

## 18. GO / NO-GO Matrix

### P0
| CHECK | STATUS | BLOCKER? | ACTION |
|---|---|---|---|
| Có bản dump Postgres < 24h | ❌ 0 file | **Có** | B-1 |
| Media `file_storage` được backup | ❌ | **Có** | B-2 |
| Off-site copy | ❌ không có công cụ | **Có** | Chọn đích + B-6 |
| Restore test thành công + số dòng khớp | ❌ chưa làm | **Có** | B-3 |
| RPO/RTO đo và ghi nhận | ❌ | **Có** | §11.4 |
| Migration diễn tập trên bản restore | ❌ (chưa có migration) | **Có** (trước D2/D7) | B-4 |
| Migration history sạch (0 failed, 0 drift tên) | ✅ 127/127 | Không | Chạy thêm `migrate diff` (F-10) |
| Không long tx / lock chờ | ✅ | Không | Kiểm tra lại lúc deploy |

### P1
| CHECK | STATUS | BLOCKER? | ACTION |
|---|---|---|---|
| Image rollback có tag | ❌ chỉ `latest` | Có (trước D1) | PR-00 + tag trước deploy |
| Lệnh compose chuẩn, sửa tài liệu overlay | ❌ lệch | Có (trước D1) | PR-00 |
| Port 3080/9000/5678 đóng với Internet | ❌ | Có (trước D9) | D0 đổi bind |
| Characterization test Zalo 10 nhóm | ❌ thiếu inbound / label / assignment / websocket / AI inbound | Có (trước D4) | PR-00 |
| Logger redaction | ❌ | Có (trước D9) | PR-01 |
| Meta Spike / Advanced Access | ⏳ chưa làm | Có (trước D2 cho spike; trước D12 cho Advanced Access) | §17 |
| Quyết định Lead Ads: Freeze + Expand | ✅ đề xuất (7.4) | Không | Chủ sản phẩm xác nhận |
| Khoá mã hoá hợp nhất về `TOKEN_ENCRYPTION_KEY` | ✅ đề xuất | Không | PR-01 |
| Health / app / Redis / TLS hiện tại | ✅ | Không | — |

### P2
| CHECK | STATUS | BLOCKER? | ACTION |
|---|---|---|---|
| Disk < 80% với biên an toàn | ⚠️ 76% | Không (theo dõi) | `docker builder prune` |
| `.env` 600 | ❌ 644 | Không | chmod |
| Metrics / alert | ❌ | Có trước D12 | PR-07 |
| `FB_GRAPH_API_VERSION` còn hạn | ⏳ | Không | Spike |
| CI tự động chạy test | ❌ | Không | Chạy tay + ghi log trong PR |

### P3
| CHECK | STATUS | ACTION |
|---|---|---|
| `chatwoot_default` network | Còn | CW-1 |
| Backup tgz Chatwoot | Còn | CW-2 (quyết định) |
| Log noise `getFriendOnlines` | Có | Ticket riêng |
| `TENANT_GUARD_MODE=off`, không RLS | Có | Sau pilot |
| `FRIEND_INVITE_TEST_MODE=true` | Có | Chủ sản phẩm xác nhận |

---

## 19. PR Breakdown

| PR | Scope | Files / modules | Migration? | Đổi hành vi? | Tests | Rollback | Phụ thuộc |
|---|---|---|---|---|---|---|---|
| **PR-00** Safety net | Characterization test Zalo (10 nhóm); `scripts/ops/deploy.sh` (tag image, lệnh compose chuẩn, rollback); `scripts/ops/backup-media.sh`, `verify-restore.sh`; sửa `DEPLOY.md`, `VPS-FIRST-DEPLOY.md` (bỏ overlay, sửa firewall theo bind) | `backend/tests/characterization/*`, `scripts/ops/*`, docs | Không | Không | Toàn bộ test hiện có + mới pass; chạy `deploy.sh --dry-run` | Revert commit | Không |
| **PR-01** Foundations | Logger redaction; parse `MESSENGER_*`, `FB_WEBHOOK_PUBLIC_KEY`; keyring `token-encryption.util` theo `keyVersion`; xoá `aes-gcm.ts` + `FB_TOKEN_ENC_KEY`; `GraphApiError` type | `shared/utils/logger.ts`, `config/index.ts`, `integrations/_shared/token-encryption.util.ts`, `shared/crypto/aes-gcm.ts`, `.env.example` ×2 | Không | Không (log bớt thông tin nhạy cảm) | Redaction unit test; decrypt 3 dòng `app_settings` (dump restore) vẫn OK; config không crash khi thiếu FB | Rollback ứng dụng | PR-00 |
| **PR-02** Schema expand + webhook skeleton | 7 model + cột nullable + FK form mapping; `@deprecated` 4 chỗ token cũ; test kiến trúc cấm ghi token cũ; route GET/POST webhook (flag OFF = 404); HMAC raw body; WebhookDelivery; classifier; ChannelEvent (chưa xử lý) | `prisma/schema.prisma`, `prisma/migrations/2026xxxx_messenger_expand`, `modules/channels/**`, `org-scoped-models.ts`, `app.ts` (register) | **Có** (expand-only) | Không khi flag OFF | HMAC (đúng / sai / thiếu header / body đổi 1 byte), timing-safe, verify GET, dedup delivery, `publicAppKey` lạ → 404, leadgen → IGNORED; migrate trên DB restore | Rollback ứng dụng; schema giữ | PR-01, **Gate §11**, Spike PASS |
| **PR-03** Conversation XOR | 03a code nullable + 12 raw SQL; 03b backfill `messages.org_id`; 03c/d/e migration XOR, FK, unique index | `modules/chat/**`, `modules/zalo/**`, analytics raw SQL, frontend 27 file, `scripts/ops/backfill-message-org-id.ts`, 3 migration | **Có** (3 file, tách bước) | Không với Zalo | Characterization PR-00 pass; test raw SQL loại trừ conversation Messenger; backfill idempotent; test XOR reject cả hai null / cả hai có | 03a: rollback app; 03c–e: drop constraint (trước tin Messenger đầu tiên) | PR-02 |
| **PR-04** Inbound processing | Processor ChannelEvent (SKIP LOCKED); ContactIdentity; tạo Conversation / Message; echo / delivery / read; socket emit; cờ per-Page; TTL payload | `modules/channels/meta/event-processor.ts`, `contact-identity.service.ts`, `payload-purge.job.ts` | Không | Có, **sau flag** | 4 namespace dedup; echo không trùng; replay cùng payload; Page tắt inbound; org isolation | Flag / Page OFF | PR-03 |
| **PR-05** Outbound | PolicyEngine; OutboundCommand; dispatcher + reaper; BullMQ `messenger-send`; MetaSender; token lifecycle + health check 6h; UI gửi | `modules/channels/messaging-policy-engine.ts`, `outbound-*.ts`, `meta-sender.worker.ts`, `token-health.job.ts`, `chat-routes.ts`, frontend chat | Không (bảng đã có) | Có, sau flag | Bảng policy (≤24h / 24h–7d người-AI / >7d / tag cấm / token INVALID); Redis down sau commit; `jobId` chống trùng; 190 → INVALID + alert; 613 retry | Flag OFF + §15.3 | PR-04 |
| **PR-06** AI + Contact merge | AI chỉ gửi trong 24h với cờ kép; merge tay + ContactMergeAudit + undo | `modules/ai/**`, `modules/contacts/**`, frontend contacts | Không | Có, sau flag / quyền | AI không bao giờ gửi >24h; merge → undo khôi phục đủ quan hệ | Flag OFF; undo merge | PR-05 |
| **PR-07** Observability | `prom-client`, `/internal/metrics` (loopback), alert job → system_notifications + Telegram, khối health messenger, correlationId | `modules/channels/metrics.ts`, `app.ts`, alert job | Không | Không | Metric tăng đúng trong test tích hợp; endpoint từ chối IP ngoài | Rollback app | PR-02 (có thể làm song song PR-04/05; **bắt buộc trước D12**) |

---

## 20. Final Recommendation

### Trả lời 5 câu hỏi

**1. Code đã sẵn sàng để bắt đầu implement Messenger chưa?**
**Có, bắt đầu từ PR-00 và PR-01.** Hai PR này không đụng schema hay production. Repo sạch, Prisma 7.5 / BullMQ 5 / socket.io 4 đều phù hợp, không có code Lead Ads cũ phải gỡ. PR-02 trở đi chỉ nên **merge** khi characterization test (PR-00) đã có.

**2. DB đã sẵn sàng cho migration chưa?**
**Về kỹ thuật: có.**
- Lịch sử migration sạch (127/127), không lock, không long transaction.
- Kích thước nhỏ (153 MB; `messages` 55.690 dòng), nên mọi thao tác ở §5.2 chỉ mất vài ms tới vài giây.

**Về vận hành: chưa.** Chưa chạy `migrate diff` và chưa diễn tập trên bản restore.

**3. Backup đã đủ an toàn cho migration production chưa?**
**Chưa.** 0 bản dump, không backup media 3.7 G, không off-site, chưa restore test. **STOP — KHÔNG DEPLOY MIGRATION PRODUCTION.**

**4. Có deploy code với Messenger OFF được không?**
- **PR-00 / PR-01 (không migration): được**, với điều kiện có image tag để rollback và chạy lệnh compose chuẩn (không overlay).
- **PR-02 trở đi (có migration): chưa**, cho tới khi Gate §11 mở.

**5. Còn điều kiện gì trước khi bật Messenger cho khách thật?**
1. Gate §11 mở (dump + media + off-site + restore test + RPO/RTO).
2. Meta Spike PASS và có **Advanced Access `pages_messaging`** (+ Business Verification nếu Meta yêu cầu).
3. Port 3080/9000/5678 không còn truy cập trực tiếp từ Internet.
4. PR-00 → PR-07 đã deploy với flag OFF và qua §14.1 ở từng bước.
5. Test Page qua toàn bộ §14.2 (inbound, echo, dedup, policy 24h/7d, token INVALID, Redis down trên staging).
6. Logger redaction + metrics + alert hoạt động.
7. Runbook §15 đã diễn tập ít nhất một lần trên test Page (tắt Page → tắt global → abandon queue).
8. Chủ sản phẩm xác nhận: Lead Ads theo phương án Freeze + Expand; `HUMAN_AGENT` mặc định DENY cho tới khi Meta cấp.

### Trạng thái

# NO-GO

Chưa được deploy migration hay tính năng Messenger lên VPS production.

**Được phép ngay (không cần gate):** viết PR-00, PR-01; chạy Meta Spike; thực hiện các lệnh B-1…B-6 sau khi duyệt.

**Chuyển sang GO WITH CONDITIONS cho PR-02 (schema expand, flag OFF) khi đủ đồng thời:**
1. §11.4 đã điền đủ, có bằng chứng restore thành công và số dòng khớp.
2. Có off-site copy của dump + media, checksum khớp.
3. Image rollback có tag, lệnh deploy chuẩn đã chạy thành công một lần với PR-00/PR-01.
4. Characterization test Zalo 10 nhóm pass.
5. Meta Spike PASS (hoặc ghi nhận `META_ACCESS_BLOCKED` và dừng dự án ở D1).
6. Migration PR-02 đã diễn tập trên bản restore và có số đo thời gian.

---

## Phụ lục A — COMMAND REQUIRES APPROVAL (tổng hợp)

Chưa lệnh nào được chạy.

| ID | Lệnh | Mục đích | Rủi ro |
|---|---|---|---|
| B-1 | `docker exec zalo-crm-backup /backup.sh` | Dump thủ công | Tải DB ngắn (153 MB) |
| B-2 | `tar -C .../zalocrm-corepviet_file_storage/_data -cf /opt/backups/zalocrm-media/...tar .` | Backup media | Dùng ~3.8 G disk |
| B-3 | `docker run -d --name zalocrm-restore-test --network none ... postgres:16-alpine` + restore | Restore test | RAM 1 G tạm thời |
| B-4 | `docker run --rm --network container:zalocrm-restore-test ... prisma migrate deploy` | Diễn tập migration | Chỉ đụng DB tạm |
| B-5 | `docker rm -f zalocrm-restore-test` | Dọn | — |
| B-6 | Cài rclone + cấu hình off-site + cron | Off-site | Cần credential đích do chủ hệ thống nhập |
| H-1 | `chmod 600 /root/ZaloCRM-CorepViet/.env` | Quyền secret | Không |
| H-2 | `docker builder prune -f` | Giải phóng ~8.9 G | Build lần sau chậm hơn |
| H-3 | Sửa `docker-compose.yml` ports app → `"172.17.0.1:${APP_PORT:-3080}:3000"` + `docker compose -f docker-compose.yml up -d --no-deps app` | Đóng 3080 với Internet | App restart ~30s; **không** dùng `127.0.0.1` (Caddy proxy qua 172.17.0.1) |
| H-4 | Đóng 9000 (MinIO) / 5678 (n8n) tương tự | Giảm bề mặt tấn công | Kiểm tra `S3_PUBLIC_URL` và webhook n8n trước |
| H-5 | `docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:850dea1` | Có image rollback | Không |
| CW-1 | `docker network disconnect chatwoot_default caddy && docker network rm chatwoot_default` | Dọn tồn dư Chatwoot | Không ảnh hưởng site (caddy còn `n8n_default`); làm ngoài giờ cao điểm |
| CW-2 | Quyết định giữ / chuyển off-site / xoá `/opt/backups/chatwoot-truoc-khi-go-20260901-075816.tgz` | Dọn | Xoá là không hoàn tác |
| E-1 | Xoá dòng `FB_TOKEN_ENC_KEY=` rỗng trong `.env` | Dọn env deprecated | Chỉ sau khi PR-01 lên production |
| D0–D13 | Toàn bộ §13 | Deploy | Theo từng bước |
| Q-1 | SQL abandon command §15.3 | Queue rollback | Chỉ khi sự cố |

## Phụ lục B — Lệnh read-only đã dùng trong audit
- `docker ps`, `docker inspect` (labels, env **tên**, mounts, networks), `docker image ls`, `docker volume inspect`, `docker system df`, `docker version`
- `ss -tlnp`, `ufw status`, `iptables -S INPUT`, `df -h`, `free`, `stat`, `du -sh` volume, `getent hosts`, `openssl s_client`
- `curl` health nội bộ / HTTPS / IP công khai
- `psql` qua `sh -c` với biến môi trường container: `version()`, `_prisma_migrations`, `pg_stat_user_tables`, `count(*)`, `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_stat_activity`, `pg_locks`, `pg_policies`
- `redis-cli info`, `--scan bull:*:meta`, `llen` / `zcard`
- `docker exec caddy caddy validate`
- `docker logs` (đếm và gom nhóm lỗi, thay số / uuid bằng placeholder)
- Repo: `git`, `grep`, đọc `docker-compose*.yml`, `docker/Dockerfile`, `docker/Caddyfile`, `DEPLOY.md`, `VPS-FIRST-DEPLOY.md`, `backend/package.json`, `prisma.config.ts`, `schema.prisma` (Conversation / Message), `app.ts`, các module crypto
