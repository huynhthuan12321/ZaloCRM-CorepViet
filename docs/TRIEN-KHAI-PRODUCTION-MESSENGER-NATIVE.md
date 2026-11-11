# Phương án triển khai production — Messenger Native cho ZaloCRM CorepViet

| | |
|---|---|
| Phiên bản | **1.2 — runbook đóng băng** (thay thế `docs/RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md` V3 về mặt triển khai; phần kiến trúc V3 vẫn giữ) |
| Ngày audit | 2026-09-16, ~19:45–20:10 (giờ VN) |
| Cập nhật 1.1 | 2026-09-17: đánh số PR theo Implementation Plan thực tế (PR-00…PR-09, PR-02 tách 02a/02b — §19); cập nhật tiến độ PR-00/PR-01; số liệu audit production giữ nguyên ngày 2026-09-16 |
| Cập nhật 1.2 | 2026-09-17: (1) phân loại lỗi Graph `190` / `10`·`200` thành TOKEN_INVALID / ACCESS_BLOCKED / UNCLASSIFIED (§7.8); (2) WebhookDelivery + ChannelEvent cùng một transaction, 200 chỉ sau COMMIT (§7.2); (3) trạng thái `UNKNOWN_DELIVERY` cho timeout sau khi đã gửi (§7.3.1); (4) tách D0 thành D0A…D0E (§13); (5) kiểm tra lại backup 17/09 06:16 — có dump DB tự động 00:00 (§11.1) |
| Tiến độ code | **PR-00 xong** (commit `067e388`, branch `feat/messenger-pr-00-safety-foundation`) · **PR-01 đã commit** (`f4b13e7`, branch `feat/messenger-pr-01-zalo-characterization`) · **OPS 🟡 có script, chờ review/commit, chưa chạy production** (branch `feat/ops-deploy-backup-scripts`) · PR-02a trở đi **chưa bắt đầu** |
| Phạm vi | Repo `D:\ZaloCRM-CorepViet` (HEAD `850dea1`) + VPS `vpssieutoc` 157.66.219.190, `/root/ZaloCRM-CorepViet` |
| Cách audit | Chỉ đọc. Không restart, không migration, không sửa `.env`/Caddy, không đọc giá trị secret, không đưa dữ liệu khách vào báo cáo |
| **Trạng thái** | **NO-GO** cho migration/deploy Messenger lên production — xem §18, §20 |

> Mọi lệnh có thể thay đổi VPS đều nằm dưới tiêu đề **COMMAND REQUIRES APPROVAL** và **chưa được chạy**.

---

## 1. Executive Summary

**Kết luận một dòng:** kiến trúc Messenger (ChannelAccount / TokenCredential / Outbox / PolicyEngine) đứng vững sau khi đối chiếu repo thật. Nhưng production **mới có một bản dump DB tự động (17/09 00:00) nằm cùng disk** — chưa backup media, chưa off-site, chưa restore test — và chưa có cổng kiểm soát deploy an toàn, nên **STOP — KHÔNG DEPLOY MIGRATION PRODUCTION**.

Sáu phát hiện quan trọng nhất:

| # | Phát hiện | Mức |
|---|---|---|
| F-01 | Lúc audit (16/09 tối) thư mục `backups/` **rỗng** (cron `@daily`, `BACKUP_ON_START=FALSE`). **Kiểm tra lại 17/09 06:16:** có `last/zalocrm-20260917-000000.sql.gz` 16 M, `gzip -t` OK; `daily/` `weekly/` `monthly/` `last/` là **hard link của cùng một file** (link count 4) trên cùng disk → thực chất 1 bản. Vẫn: không off-site, không backup media (3.7 GB), chưa từng restore test | **P0** |
| F-02 | UFW `inactive`, iptables `INPUT ACCEPT`. Port **3080** (app, đi vòng qua Caddy/TLS), **9000** (MinIO, bucket anonymous download), **5678** (n8n) truy cập được từ Internet qua IP. Đã xác nhận: `http://157.66.219.190:3080/health/live` → 200 | **P1** (security; không chặn riêng Messenger nhưng webhook Meta sẽ nhận cả traffic HTTP thường qua 3080) |
| F-03 | Lead Ads **không tồn tại** trong code đang chạy. Production là *Community edition*, log ghi `Community edition — _ee bundle absent`; thư mục `src/_ee/` không có trong repo lẫn image. Schema có tới **4 chỗ lưu token Facebook**, tất cả 0 dòng | P1 (quyết định thiết kế) — **tin tốt**: không phải migrate dữ liệu token |
| F-04 | Không có quy trình deploy có version. Image chỉ có tag `latest`, rollback = build lại 5–10 phút. Project compose đang chạy **không** có overlay caddy, trong khi `VPS-FIRST-DEPLOY.md` hướng dẫn chạy **có** overlay. Làm theo tài liệu sẽ tắt port 3080 và bật `zalo-crm-caddy` tranh port 80/443 với caddy chung, gây sập toàn bộ site | **P1** |
| F-05 | `Conversation.zaloAccountId` là NOT NULL và được deref trực tiếp ở ~104 chỗ, cộng 12 file raw SQL đụng `conversations`. Đổi sang nullable (XOR) là thay đổi có bán kính lớn nhất | P1 |
| F-06 | Chưa có characterization test cho luồng Zalo inbound/listener, websocket emit, AI auto-reply. Có 125 file test nhưng tập trung vào route/broadcast/care-session. **Cập nhật 1.1:** đã xử lý ở PR-01 — 87 test trong `backend/tests/characterization/` (6 file, 10 nhóm), chạy bằng mock, không cần DB thật | P1 → ✅ (chờ merge) |

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

> **Cập nhật 1.1 (PR-01):** các chỗ **Thiếu** ở trên đã được phủ bằng `backend/tests/characterization/`: `zalo-inbound` (19), `zalo-outbound` (18), `zalo-conversation-websocket` (13, gồm contact/conversation/emit `chat:message`), `zalo-ai-handoff` (14), `zalo-assignment` (9), `zalo-broadcast-labels-queue` (14). Baseline suite: file fail 49 → 38, test fail 46 → 6, không phát sinh failure mới; 38 file còn lại là nợ có sẵn (29 thiếu module `_ee`, 5 cần DB thật, 4 lỗi lẻ) — không chặn Messenger.

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
- **Phase:** tài liệu (`DEPLOY.md`, `VPS-FIRST-DEPLOY.md`) — ✅ đã sửa ở PR-00. Script `scripts/ops/deploy.sh` (tag image + rollback) — 🟡 có script, chờ review/commit, chưa chạy production ở track **OPS** (§19), bắt buộc trước D1.

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
  - Tách thành PR-02b bước 1 (code): đổi kiểu và sửa toàn bộ compile error, thêm `where: { zaloAccountId: { not: null } }` vào mọi query thuộc module Zalo.
  - Audit 12 file raw SQL bằng checklist.
  - DB constraint chỉ bật khi code PR-02b đã chạy production ≥ 3 ngày mà chưa có dòng Messenger nào.
- **Phase:** PR-02b (bắt buộc xong **trước** PR-03 — PR-03 là PR đầu tiên tạo conversation Messenger).

### F-10 — Chưa kiểm tra drift bằng công cụ · **P2**
- **Recommendation:** trên DB restore chạy `npx prisma migrate diff --from-url <restore> --to-schema-datamodel prisma/schema.prisma --script`. Kết quả phải rỗng.
- **Phase:** Gate §11.

---

## 6. Security Audit

| ID | Phát hiện | Evidence | Risk / Impact | Recommendation | Mức | Phase |
|---|---|---|---|---|---|---|
| S-01 | Port 3080/9000/5678 công khai | §4 F-02 | Bypass TLS / rate-limit; MinIO anonymous | Đổi bind (cần duyệt) | P1 | Trước Phase 3 |
| S-02 | 3 khoá mã hoá, 1 khoá chết | `session-crypto` (`ENCRYPTION_KEY`), `token-encryption.util` (`TOKEN_ENCRYPTION_KEY`, **3 dòng `app_settings` đang dùng**), `aes-gcm` (`FB_TOKEN_ENC_KEY` rỗng, không import) | Nhầm khoá → mất khả năng giải mã | Xem 7.5. **Không** đổi/rotate `TOKEN_ENCRYPTION_KEY` hay `ENCRYPTION_KEY` | P2 | ✅ PR-00 (keyring + `aes-gcm` @deprecated + guard test) |
| S-03 | Logger không redaction | `shared/utils/logger.ts` không có `redact` | Payload Messenger (PSID, nội dung, token trong URL Graph) lọt log json-file 20m×5 | Thêm redactor cho `access_token`, `appsecret_proof`, `x-hub-signature-256`, `Authorization`, `hub.verify_token`; cấm log raw body | P1 cho Messenger | PR-07 — **bắt buộc trước D9**. Code PR-03…PR-06 phải tự không log token/raw body/nội dung tin ngay từ đầu |
| S-04 | `webhook_verify_token` plaintext trong `facebook_app_configs` / `facebook_page_accounts` | schema | Bảng 0 dòng, chưa bị khai thác | Không dùng hai bảng này; verify token để ở env, so sánh timing-safe | P3 | PR-03 (guard ghi bảng cũ: ✅ PR-00) |
| S-05 | Tenant isolation chỉ dựa vào code | `TENANT_GUARD_MODE=off`, `RLS_SET_CONFIG=false`, 0 policy | Hiện có 1 org nên rủi ro thấp | Model Messenger mới đều có `orgId` và nằm trong `org-scoped-models.ts`; bật `warn` ở staging | P3 | PR-02a |
| S-06 | `.env` 644 | stat | Đọc được bởi user local | `chmod 600` (cần duyệt) | P2 | Pre-deploy |
| S-07 | Secret trong git | `git ls-files` chỉ có `.env.example`, `backend/.env.example`, `mcp-server/.env.example`; `.gitignore` chặn `.env`, `backups/`; `.dockerignore` chặn `.env*` | Không | Giữ nguyên | — | — |
| S-08 | Toàn bộ `.env` vào container app | `env_file: .env` | Lộ qua `docker inspect` cho ai có quyền docker (≈ root) | Chấp nhận; ghi nhận | P3 | — |
| S-09 | `FRIEND_INVITE_TEST_MODE=true` trên production | env | Không liên quan Messenger; có thể là cố ý | Chủ sản phẩm xác nhận | P3 | — |
| S-10 | CSP `report-only` | env | XSS không bị chặn cứng | Không thuộc phạm vi này | P3 | — |

**Yêu cầu bảo mật bắt buộc cho webhook Meta (đưa vào test của PR-03):**
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
  └─ rawBody → HMAC verify (fail closed → 401/403, không ghi DB)
     └─ parse JSON + classify trong bộ nhớ (thuần, không I/O):
          entry[].messaging[] → messaging    entry[].changes[field=leadgen] → leadgen
     └─ BEGIN
          INSERT WebhookDelivery (dedup: sha256(rawBody), ON CONFLICT DO NOTHING)
          INSERT tất cả ChannelEvent của delivery (dedupKey theo namespace 7.6, ON CONFLICT DO NOTHING)
        COMMIT
     └─ HTTP 200   ← CHỈ sau COMMIT (mục tiêu toàn request < 2s)
  processor (in-process, async, poll ChannelEvent PENDING, FOR UPDATE SKIP LOCKED)
       messaging.message         → Contact/ContactIdentity → Conversation → Message → socket emit
       messaging.message.is_echo → cập nhật Message outbound / tạo Message "self"
       delivery / read           → cập nhật deliveredAt / seenAt
       leadgen                   → status=IGNORED_UNSUPPORTED (không có code Lead Ads, xem 7.4)
```
**Durability (bắt buộc, PR-03):** `WebhookDelivery` và **toàn bộ** `ChannelEvent` sinh từ nó nằm trong **cùng một transaction**, và HTTP 200 chỉ trả **sau COMMIT**. Không có trạng thái "đã trả 200 nhưng chưa có ChannelEvent":
- Process chết trước COMMIT → không trả 200 → Meta retry → không mất sự kiện.
- Process chết sau COMMIT → sự kiện đã nằm trong `channel_events` PENDING → processor xử lý khi khởi động lại.
- Transaction lỗi (DB down, lock timeout) → trả **5xx** để Meta retry; không nuốt lỗi thành 200.
- Delivery trùng (Meta gửi lại) → cả hai INSERT `ON CONFLICT DO NOTHING` → vẫn trả 200, không tạo event thứ hai.
- Payload lớn (nhiều entry): vẫn một transaction; classifier phải thuần CPU, không gọi Graph API / không truy vấn Contact trong request path.

*Phương án thay thế — không chọn:* ghi `WebhookDelivery(status=RECEIVED)` rồi trả 200, sau đó `WebhookDeliveryProcessor` claim (`SKIP LOCKED`) → classify → tạo ChannelEvent → `CLASSIFIED`. Đúng về durability nhưng thêm một worker + một trạng thái trung gian; chỉ dùng nếu đo được classify trong transaction làm request vượt 2s.

Khi `MESSENGER_INBOUND_ENABLED=false` hoặc Page `inboundEnabled=false`: vẫn verify HMAC, `INSERT WebhookDelivery` (chỉ metadata, `status=IGNORED_DISABLED`) trong transaction, trả 200 sau COMMIT, **không** tạo `ChannelEvent` — để Meta không tắt subscription vì lỗi liên tục.

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
       OK                                   → SENT, Message.platformMessageId = message_id
       lỗi kết nối TRƯỚC khi gửi request     → retry theo backoff (DNS fail, connect refused/timeout, TLS handshake fail)
       613 (rate limit)                      → retry backoff (tôn trọng header usage), tối đa 5 lần
       HTTP 5xx rõ ràng (có response)        → retry có giới hạn: tối đa 3 lần, backoff 5s/30s/2m, rồi FAILED
       read timeout / mất kết nối SAU khi đã gửi request → UNKNOWN_DELIVERY (KHÔNG retry tự động, xem 7.3.1)
       190                                   → TOKEN_INVALID  (xem 7.8)
       10 / 200 + message/subcode quyền      → ACCESS_BLOCKED (xem 7.8)
       10 / 200 khác                         → UNCLASSIFIED   (xem 7.8)
       2018001 / tag bị chặn / 551 / 4xx khác → FAILED, không retry
```

#### 7.3.1 `UNKNOWN_DELIVERY` — timeout sau khi đã gửi
Send API của Meta **không có idempotency key phía client**. Nếu request đã rời máy mà không nhận được response, tin có thể đã tới khách; retry mù sẽ gửi **trùng tin**.
- Chỉ xếp `UNKNOWN_DELIVERY` khi lỗi xảy ra **sau** khi body đã ghi xong lên socket (read timeout, `ECONNRESET` / socket hang up sau write). Lỗi trước đó (DNS, connect, TLS) là "chưa gửi" → retry bình thường. HTTP client phải phân biệt được hai pha này (hook `socket connect` / `request finish`); **không chắc → coi là `UNKNOWN_DELIVERY`**.
- `OutboundCommand.status = UNKNOWN_DELIVERY`, Message hiển thị "Chưa xác nhận gửi" (không phải FAILED, không phải SENT). BullMQ job kết thúc, **không** retry.
- Reconcile (tự động, một lần, sau ~60s — đủ để echo webhook tới):
  1. Có echo webhook `is_echo` khớp **đủ chắc chắn** → `SENT`, gán `platformMessageId` từ echo. Khớp nghĩa là: cùng Page + conversation + recipient PSID, `app_id` của app, payload tương ứng (text chuẩn hoá / attachment), và thời điểm trong cửa sổ hẹp quanh `sendAttemptedAt`. **Có hơn một candidate → `NEEDS_REVIEW`, không tự đoán.** Echo không khớp command nào vẫn được lưu như tin outbound bình thường (PR-05).
  2. Không có echo → gọi `GET /{conversation-id}/messages?fields=id,message,from,created_time` (Conversations API, giới hạn 20 tin mới nhất) tìm tin từ Page khớp nội dung trong cửa sổ `[dispatchedAt − 5s, dispatchedAt + 120s]` → thấy thì `SENT`.
  3. Vẫn không thấy → giữ `UNKNOWN_DELIVERY`, alert, **người dùng bấm "Gửi lại"** mới tạo `OutboundCommand` mới (idempotencyKey mới). Không có auto-resend.
- Khi Conversations API chưa có Advanced Access (trước pilot): chỉ dùng bước 1; không có echo → dừng ở bước 3.
- Metric `messenger_outbound_unknown_delivery_total{page}`; alert ≥ 3 / 15 phút.
- **Redis chết sau COMMIT:** lệnh vẫn `PENDING` trong Postgres; dispatcher giữ nguyên và thử lại. `jobId` = id của command nên enqueue lại không nhân đôi. Một command kẹt ở `DISPATCHING` > 60s (chưa có worker nhận) được trả về `PENDING` bởi reaper.
- **Rollback / tắt flag:** chạy SQL §15.3 (`PENDING` / `DISPATCHING` → `ABANDONED`; `PROCESSING` → `UNKNOWN_DELIVERY`) và Message tương ứng → `FAILED` hiển thị cho người dùng. Command `UNKNOWN_DELIVERY` **không** bị chuyển ABANDONED (tin có thể đã tới khách) — giữ nguyên để reconcile/xem tay. **Không bao giờ** gửi lại hàng loạt tự động khi bật lại.
- **State machine `OutboundCommand`** (invariant, có unit test riêng ở PR-04):
  ```
  PENDING → DISPATCHING → PROCESSING ─┬─ SENT
                                      ├─ FAILED
                                      ├─ BLOCKED_TOKEN / BLOCKED_ACCESS
                                      ├─ NEEDS_REVIEW
                                      └─ UNKNOWN_DELIVERY
  ```
  - `PROCESSING`: worker đã claim job và ghi `sendAttemptedAt` **trong DB, trước khi** gọi Graph.
  - Reaper: `DISPATCHING` > 60s → `PENDING`. `PROCESSING` > 60s → `UNKNOWN_DELIVERY` (có thể đã gửi).
  - **Reaper tuyệt đối không đưa `PROCESSING` hay `UNKNOWN_DELIVERY` về `PENDING`.** Chỉ hành động "Gửi lại" của người dùng mới tạo command **mới**.
- **Trạng thái `OutboundCommand`:** `PENDING` · `DISPATCHING` · `PROCESSING` · `SENT` · `FAILED` · `UNKNOWN_DELIVERY` · `BLOCKED_TOKEN` · `BLOCKED_ACCESS` · `NEEDS_REVIEW` · `ABANDONED`.

### 7.4 Lead Ads — trả lời 6 câu hỏi (dựa trên repo thật)

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Lead Ads dùng endpoint nào? | **Không có endpoint nào đang chạy.** `app.ts:112` ghi Lead Ads nằm trong `src/_ee/facebook`; thư mục này không có trong repo, image hay VPS (log: *Community edition — _ee bundle absent*). `FB_OAUTH_REDIRECT_URI` trong `.env.example` trỏ tới `/api/v1/integrations/facebook/oauth/callback` — route **không được đăng ký** |
| 2 | `FacebookPageConnection` được dùng ở đâu? | Chỉ trong schema và là đích FK của `FacebookFormMapping`. Code core chỉ đọc `facebookFormMapping` (khoá list: `lists/list-routes.ts:130,549,675`) và `webhookLog` (`lists/list-entry-routes.ts:719`). 0 dòng dữ liệu |
| 3 | `accessTokenEnc` được đọc ở đâu? | **Không ở đâu** trong `backend/src` (grep = 0). Tương tự `encryptedFbSystemUserToken` và `FacebookPageAccount.encryptedAccessToken` (chỉ có tên model trong `org-scoped-models.ts:29`) |
| 4 | Có rủi ro hai nguồn token? | **Hiện tại không** (0 dòng, 0 code đọc). **Tiềm ẩn cao:** 4 chỗ lưu token FB trong schema; nếu bundle `_ee` được thêm lại sẽ ghi vào `facebook_page_connections` song song với `TokenCredential` |
| 5 | Chuyển `FacebookFormMapping` sang `ChannelAccount` ngay được không? | **Được và rẻ** vì bảng rỗng: thêm cột nullable `channel_account_id`. Nhưng **không cần làm trong đợt Messenger** vì không có code Lead Ads dùng nó. Không xoá `page_connection_id` |
| 6 | Migration trung gian tốt nhất? | **Freeze + Expand, không Contract:** (a) PR-02a thêm `facebook_form_mappings.channel_account_id NULL` + FK `RESTRICT`; (b) đánh dấu `@deprecated` trong schema cho 4 chỗ lưu token cũ; (c) thêm test kiến trúc cấm `prisma.facebookPageConnection.create/update` và đọc `accessTokenEnc`; (d) webhook classifier xếp `leadgen` vào `IGNORED_UNSUPPORTED`; (e) chỉ drop các bảng cũ khi có quyết định viết Lead Ads mới trên `ChannelAccount` — tối thiểu sau pilot, trong PR riêng, có backup |

### 7.5 Khoá mã hoá — hợp nhất
- `TokenCredential.encryptedToken` dùng **`TOKEN_ENCRYPTION_KEY`** qua `token-encryption.util.ts`. Khoá này đã có trên VPS và đang mã hoá API key AI, nên **không thay giá trị**.
- Thêm cột `keyVersion SMALLINT NOT NULL DEFAULT 1`. Util nhận `TOKEN_ENCRYPTION_KEY_V<n>` khi rotate trong tương lai (thử theo `keyVersion`, fallback về V1). Nhờ đó dữ liệu cũ luôn giải mã được.
- `FB_TOKEN_ENC_KEY`: rỗng trên VPS, không có dữ liệu nào mã hoá bằng nó (mọi cột FB đều 0 dòng), `aes-gcm.ts` không được import → **deprecated**. **Đã làm ở PR-00:** `aes-gcm.ts` gắn `@deprecated` (không xoá, phòng bundle `_ee` sau này), test kiến trúc cấm import `aes-gcm` và cấm ghi 4 chỗ lưu token cũ; `.env.example` đánh dấu `FB_TOKEN_ENC_KEY` deprecated. Việc xoá hẳn file + dòng env để PR riêng sau pilot, re-check DB trước (`SELECT count(*)` 4 chỗ lưu token = 0).
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
- **Phân loại lỗi Graph (bắt buộc trước PR-04, module `graph-api-error.ts`).** Không gộp 10/200 vào "token hỏng": hai mã này thường là thiếu quyền / Page bị giới hạn / người nhận chặn, token vẫn hợp lệ.

| Lớp | Điều kiện | Token | Page outbound | Command | Retry | Alert |
|---|---|---|---|---|---|---|
| `TOKEN_INVALID` | `code = 190` (mọi subcode: 458/460/463/467…) | `TokenCredential.status = INVALID`, `invalidatedAt` | Tắt | PENDING → `BLOCKED_TOKEN` | Không | Ngay; tăng `messenger_token_invalid_total` |
| `ACCESS_BLOCKED` | `code ∈ {10, 200}` **và** (`error_subcode` thuộc danh sách quyền đã chốt từ Spike, **hoặc** `message` chứa `permission` / `does not have access` / `not authorized` / `requires`) | **Giữ `ACTIVE`** nếu gọi lại `GET /debug_token` thấy `is_valid=true`; nếu `is_valid=false` → nâng lên `TOKEN_INVALID` | Tắt (`outboundEnabled=false`, lý do `ACCESS_BLOCKED`) | Command hiện tại `FAILED`; PENDING khác của Page → `BLOCKED_ACCESS` | Không | Ngay; tăng `messenger_access_blocked_total{page,code,subcode}` |
| `UNCLASSIFIED` | `code ∈ {10, 200}` không khớp điều kiện trên | Không đổi | Không đổi | Command hiện tại → `NEEDS_REVIEW` | **Không retry mù** | Có; lưu `lastError` đầy đủ (code, subcode, type, message, `fbtrace_id`) để xem tay |

  - Thứ tự đánh giá: `190` → lỗi chính sách gửi đã biết (ví dụ `code 10 / subcode 2018278` "ngoài cửa sổ cho phép" → `FAILED`, không retry, **không** tắt Page, **không** đụng token) → `ACCESS_BLOCKED` → `UNCLASSIFIED`. Lỗi chính sách là lỗi của một tin, không phải của Page.
  - Danh sách subcode/message quyền được **chốt bằng Meta Spike** (bảng lỗi thực tế thu được) và nằm trong một hằng số có test; message match không phân biệt hoa thường.
  - `ACCESS_BLOCKED` bật lại outbound **chỉ bằng tay** sau khi admin xử lý quyền; không tự bật.
  - Thao tác ghi (token status, tắt Page, chuyển command) trong một transaction; notification gửi sau COMMIT.
- Thay token = tạo `TokenCredential` version mới rồi deactivate bản cũ, trong một transaction.

---

## 8. Required Code Changes

| Module / file | Thay đổi | PR | Trạng thái |
|---|---|---|---|
| `config/messenger-config.ts` (mới), `config/validate-production-config.ts` | Parse `MESSENGER_*` (phân cấp: inbound/outbound cần enabled, AI auto-send cần outbound), `FB_WEBHOOK_PUBLIC_KEY`, `FB_GRAPH_API_VERSION`. **Không** crash app khi thiếu FB secret: Messenger tự tắt, status `misconfigured`. Chỉ fatal khi `TOKEN_ENCRYPTION_KEY` có đặt nhưng sai định dạng. Không siết `ENCRYPTION_KEY` | PR-00 | ✅ |
| `integrations/_shared/token-encryption.util.ts` | Keyring theo `keyVersion` (`TOKEN_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY_V<n>`), validate 64 hex, format blob giữ nguyên | PR-00 | ✅ |
| `shared/crypto/aes-gcm.ts` | `@deprecated` + test kiến trúc cấm import / cấm ghi token FB cũ (không xoá) | PR-00 | ✅ |
| `shared/http/health.ts`, `app.ts` | Khối `messenger: {enabled, status}` trong `/health/ready`, không ảnh hưởng status code, không lộ tên key | PR-00 | ✅ |
| `.env.example` ×2, `DEPLOY.md`, `VPS-FIRST-DEPLOY.md`, `docs/runbooks/BACKUP-RESTORE.md` | Mục Messenger; sửa overlay / firewall / lệnh compose chuẩn / rollback bằng image tag; runbook backup-restore (lệnh dưới COMMAND REQUIRES APPROVAL) | PR-00 | ✅ |
| `backend/tests/characterization/` (mới) | 10 nhóm test Zalo (§3.3), mock I/O | PR-01 | ✅ chờ commit |
| `scripts/ops/deploy.sh`, `backup-media.sh`, `verify-restore.sh` (mới) | Tag image theo SHA, lệnh compose chuẩn, rollback không build lại; backup media; verify restore | OPS | 🟡 có script, chờ review/commit, chưa chạy production |
| `prisma/schema.prisma`, migration `messenger_expand` | 7 model + cột nullable (§9.1) | PR-02a | ⏳ |
| `shared/tenant/org-scoped-models.ts` | Thêm 7 model mới | PR-02a | ⏳ |
| `modules/chat/*`, `modules/zalo/*`, raw SQL 12 file, frontend 27 file, `scripts/ops/backfill-message-org-id.ts` | Xử lý `zaloAccountId` nullable; lọc `zaloAccountId != null` trong ngữ cảnh Zalo; XOR; backfill `messages.org_id` (§9.2) | PR-02b | ⏳ |
| `modules/channels/` (mới): `channel-account.service.ts`, `token-credential.service.ts` | CRUD ChannelAccount + token (admin-only, RBAC `settings:edit`) | PR-03 | ⏳ |
| `modules/channels/meta/webhook-routes.ts`, `meta-signature.ts`, `webhook-classifier.ts`, `event-processor.ts`, `contact-identity.service.ts` | GET verify, POST raw body + HMAC + WebhookDelivery + classifier (leadgen/messaging) + ChannelEvent; inbound **text** → Contact / ContactIdentity / Conversation / Message | PR-03 | ⏳ |
| `modules/channels/messaging-policy-engine.ts`, `outbound-command.service.ts`, `outbound-dispatcher.ts`, `meta-sender.worker.ts`, `graph-api-error.ts`, `token-health.job.ts` | Outbox + policy + sender; phân loại lỗi Graph 190 → TOKEN_INVALID / 10·200 → ACCESS_BLOCKED hoặc UNCLASSIFIED (§7.8); `UNKNOWN_DELIVERY` (§7.3.1) | PR-04 | ⏳ |
| `modules/chat/chat-routes.ts` + frontend chat | Nút gửi đi qua PolicyEngine, hiển thị cửa sổ 24h/7d | PR-04 | ⏳ |
| `modules/channels/meta/event-processor.ts` (mở rộng) | Echo / delivery / read; dedup `message:` / `echo:` / `delivery:` / `read:`; emit socket.io hiện có | PR-05 | ⏳ |
| `modules/chat/*` + frontend inbox, `modules/contacts/*` + UI | Bộ lọc inbox All / Zalo / Messenger; merge tay + ContactMergeAudit + undo | PR-06 | ⏳ |
| `modules/channels/meta/media-*.ts`, `shared/utils/logger.ts`, `payload-purge.job.ts` | Media + chống SSRF (IPv4/IPv6 private, link-local, metadata, redirect, DNS rebinding), giới hạn dung lượng, TTL payload webhook, **log redaction** | PR-07 | ⏳ |
| `modules/channels/metrics.ts`, route `/internal/metrics` (chỉ loopback), `reconciliation.job.ts` | Counter/gauge, alert; đối soát `GET /{page-id}/conversations` chỉ cảnh báo; AI chỉ gợi ý | PR-08 | ⏳ |
| `modules/ai/*` | AI auto-send cho Messenger chỉ khi `MESSENGER_AI_AUTO_SEND_ENABLED` + Page `aiAutoSendEnabled` + trong 24h | PR-09 | ⛔ chờ điều kiện (§19) |

---

## 9. Required Schema Changes

### 9.1 Expand — thêm mới, không phá vỡ (PR-02a)

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

**Rollback của PR-02a:** code cũ bỏ qua các bảng/cột mới nên **không cần** down migration. Chỉ drop khi chắc chắn chưa có dữ liệu Messenger (xem §15.4).

### 9.2 Chuyển đổi (PR-02b) — thứ tự bắt buộc, xong trước PR-03
Tên bước con: 02b-1 (code) → 02b-2 (backfill) → 02b-3 / 02b-4 / 02b-5 (ba migration riêng).

1. **02b-1 (code):** Prisma schema đổi `zaloAccountId String?` nhưng **migration DB chưa đổi**. DB vẫn NOT NULL nên an toàn; code đã chịu được null. Deploy, chạy ≥ 3 ngày.
2. **02b-2 (data):** script `scripts/ops/backfill-message-org-id.ts` chạy batch 5.000 dòng, idempotent, `lock_timeout 3s`, log tiến độ. Chạy tay, có duyệt.
3. **02b-3 (migration):**
   ```sql
   SET lock_timeout = '3s';
   ALTER TABLE conversations ALTER COLUMN zalo_account_id DROP NOT NULL;
   ALTER TABLE conversations ADD CONSTRAINT conversations_channel_xor
     CHECK (num_nonnulls(zalo_account_id, channel_account_id) = 1) NOT VALID;
   ALTER TABLE conversations ADD CONSTRAINT conversations_channel_account_id_fkey
     FOREIGN KEY (channel_account_id) REFERENCES channel_accounts(id) ON DELETE RESTRICT NOT VALID;
   ```
4. **02b-4 (migration riêng):**
   ```sql
   ALTER TABLE conversations VALIDATE CONSTRAINT conversations_channel_xor;
   ALTER TABLE conversations VALIDATE CONSTRAINT conversations_channel_account_id_fkey;
   CREATE UNIQUE INDEX conversations_channel_account_id_external_thread_id_key
     ON conversations(channel_account_id, external_thread_id) WHERE channel_account_id IS NOT NULL;
   ```
5. **02b-5 (migration riêng, sau khi backfill = 0 dòng thiếu):**
   ```sql
   ALTER TABLE messages ADD CONSTRAINT messages_org_id_not_null CHECK (org_id IS NOT NULL) NOT VALID;
   ALTER TABLE messages VALIDATE CONSTRAINT messages_org_id_not_null;
   ALTER TABLE messages ALTER COLUMN org_id SET NOT NULL;
   ALTER TABLE messages DROP CONSTRAINT messages_org_id_not_null;
   CREATE UNIQUE INDEX messages_org_id_platform_message_id_key
     ON messages(org_id, platform_message_id) WHERE platform_message_id IS NOT NULL;
   ```
   Code ghi `messages.org_id` cho mọi message mới phải được deploy **trước** 02b-2 (nằm trong 02b-1).

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
| `FB_TOKEN_ENC_KEY` | **deprecated → remove** | secret | — | rỗng | `.env.example` đã đánh dấu deprecated (PR-00 ✅); xoá dòng rỗng trong `.env` VPS (cần duyệt, E-1) |
| `FB_OAUTH_REDIRECT_URI` | **deprecated** cho Messenger | non-secret | — | có | Không cần với System User token; giữ tới khi quyết định Lead Ads |

**Kiểm tra lộ secret:**
- Git: sạch (S-07).
- Compose: `env_file` đẩy vào container (S-08).
- Log: chưa có redaction (S-03) → PR-07, bắt buộc xong trước khi bật flag (D9).
- Fail-fast: đã làm ở PR-00 (`messenger-config.ts`) — Messenger tự tắt, **không** kéo Zalo sập.

---

## 11. Backup & Restore Gate

### 11.1 Kết quả hiện tại

| Hạng mục | Trạng thái | Đạt? |
|---|---|---|
| PostgreSQL auto backup | Service `zalo-crm-backup` (`prodrigestivill/postgres-backup-local` v0.0.11), `SCHEDULE=@daily`, `-Z1`, giữ 7/4/3. Audit 16/09: 0 file. **17/09 06:16: 1 dump** `zalocrm-20260917-000000.sql.gz` (16 M, `gzip -t` OK, tạo 00:00); các thư mục daily/weekly/monthly/last là hard link cùng file, cùng disk | ⚠️ có DB dump, chưa đủ gate |
| Media volume `zalocrm-corepviet_file_storage` | 3.7 G, 5.781 file, **không có backup** | ❌ |
| MinIO `minio_data` | 328 K | ❌ (nhỏ, gộp chung) |
| Redis | AOF bật; chỉ chứa dữ liệu queue tạm thời | Chấp nhận (không phải nguồn sự thật) |
| Off-site | Không có rclone/restic/borg/aws/s3cmd; backup chỉ nằm trên cùng disk | ❌ |
| Restore test | Chưa từng | ❌ |
| RPO / RTO | Chưa đo; RPO DB hiện tại ≈ 24h **nếu disk còn** (dump nằm cùng disk → mất disk = mất hết); media = không giới hạn | ❌ |

> **Gate §11 vẫn ĐÓNG.** Có dump DB tự động chỉ đáp ứng một phần tiêu chí 1 (§11.2). Chưa có media backup, off-site, restore test, RPO/RTO. Trước migration vẫn bắt buộc B-1 dump thủ công.

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
   - **chạy thử toàn bộ migration PR-02a và PR-02b trên bản restore** (kể cả backfill 02b-2), ghi lại thời gian từng bước — đây là **D0B-2**, chỉ làm được khi migration đã tồn tại; bắt buộc trước D2/D7, **không** là điều kiện mở PR-02a.
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
scripts/ops/backup-media.sh --dry-run
scripts/ops/backup-media.sh
cat /opt/backups/zalocrm-media/file_storage-<stamp>.tar.sha256
tar -tf /opt/backups/zalocrm-media/file_storage-<stamp>.tar | awk '!/\/$/ {count++} END {print count + 0}'   # phải = số file trong volume
find /var/lib/docker/volumes/zalocrm-corepviet_file_storage/_data -type f | wc -l
```

```bash
# B-3: restore test vào container tạm, KHÔNG gắn network production, KHÔNG publish port
scripts/ops/verify-restore.sh --dry-run
EXPECTED_MIGRATIONS=127 scripts/ops/verify-restore.sh
```
Script restore dùng `POSTGRES_USER=crmuser` mặc định để khớp owner trong dump, chỉ cho phép container tên `zalocrm-restore-*`, chạy với `--network none --memory 1g`, chạy `gzip -t`, in số dòng `messages` / `conversations` / `contacts` / `organizations`, kiểm tra `_prisma_migrations` đủ 127 khi đặt `EXPECTED_MIGRATIONS=127`, đo restore RTO + tổng thời gian và tự xoá container tạm; không kết nối DB production để ghi.

```bash
# B-4: diễn tập migration trên bản restore (sau khi PR-02a/PR-02b có image)
docker run --rm --network container:zalocrm-restore-test \
  -e DATABASE_URL='postgresql://restore:restore-temp@127.0.0.1:5432/zalocrm' \
  zalocrm-corepviet-app:<sha-PR02a> sh -c 'time npx prisma migrate deploy && npx prisma migrate status'
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
| Thời gian diễn tập PR-02a / PR-02b migration + backfill | | |

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

**D0 tách thành 5 gate, làm tuần tự D0A → D0B → D0C → D0D → D0E.** Mỗi gate là một lần duyệt riêng; verify xong mới sang gate sau; fail thì rollback gate đó và dừng. Phụ thuộc: **D1** cần D0A + D0C · **mở PR-02a** cần D0B-1 · **D2** cần D0B-2 (rehearsal PR-02a) · **D7** cần D0B-2 (rehearsal PR-02b) · **D9** cần D0D + D0E.

| Bước | Action | Expected result | Verification | Rollback trigger | Rollback action |
|---|---|---|---|---|---|
| **D0A** Disk + image rollback (H-2, H-5) | `docker builder prune -f`; `docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:850dea1` | Disk < 70% (17/09: 76%); có image tag rollback | `df -h /`; `docker image ls zalocrm-corepviet-app` thấy tag `850dea1`; app vẫn healthy (không restart) | Prune lỗi hoặc disk vẫn > 75% | Không có gì để hoàn tác (chỉ xoá build cache). **Dừng**, không sang D0B: tar media cần ~3.8 G |
| **D0B-1** Backup / restore foundation (B-1, B-2, B-3, B-5, B-6) | Theo §11.3: dump thủ công, tar media, off-site + checksum, restore DB vào container tạm, đếm dòng, điền §11.4 (không gồm diễn tập migration) | Tiêu chí §11.2 mục 1–3, 4 (trừ gạch đầu dòng diễn tập), 5 đạt. **Đủ điều kiện backup để mở PR-02a** (cùng PR-01 + Spike) | Tiêu chí §11.2 từng mục; `df -h /` < 80% sau khi tạo tar | `gzip -t` fail; số file tar ≠ số file volume; restore lỗi / đếm dòng lệch; disk > 80% | `docker rm -f zalocrm-restore-test`; xoá tar tạm nếu disk > 80%. Production không bị chạm. Gate giữ đóng |
| **D0B-2** Migration rehearsal (B-4) | Chỉ làm khi migration PR-02a (và sau đó PR-02b) đã có: restore bản mới → `prisma migrate deploy` + backfill 02b-2 trên container tạm, bấm giờ | Migration chạy hết, không lỗi; có số đo thời gian từng bước; `migrate diff` sau migration khớp schema | `_prisma_migrations` +N đủ `finished_at`; đếm dòng trước/sau; thời gian ghi vào §11.4 | Migration lỗi / lock / thời gian vượt ngưỡng cửa sổ bảo trì | Xoá container tạm; sửa migration trong PR, diễn tập lại. **Bắt buộc trước D2 (PR-02a) và D7 (PR-02b)** |
| **D0C** Quyền `.env` (H-1) | `chmod 600 /root/ZaloCRM-CorepViet/.env` | `stat -c '%a %U' .env` = `600 root` | `docker compose -f docker-compose.yml config --quiet` exit 0 (**không** in config); app không restart | Compose không đọc được `.env` | `chmod 644 .env` |
| **D0D** Đóng 3080 với Internet (H-3) | Sửa ports app → `"172.17.0.1:${APP_PORT:-3080}:3000"`; `docker compose -f docker-compose.yml up -d --no-deps app` (app restart ~30s, giờ thấp điểm) | 3080 chỉ nghe trên `172.17.0.1`; site HTTPS bình thường | Từ máy ngoài: `curl -m5 http://157.66.219.190:3080/health/live` timeout; `curl https://zalocrm.corepviet.com/health/ready` 200; `ss -ltn` thấy `172.17.0.1:3080`; §14.1 Zalo | HTTPS ≠ 200 sau 3 phút; Zalo inbound dừng | Trả bind `${APP_PORT:-3080}:3000`, recreate app |
| **D0E** Đóng 9000 (MinIO) / 5678 (n8n) (H-4) | **Hai lần duyệt riêng**, 9000 trước. Trước khi đổi: xác nhận `S3_PUBLIC_URL` và URL webhook n8n dùng domain qua Caddy, không dùng `IP:port`. Đổi bind → `127.0.0.1`/`172.17.0.1`, recreate đúng service | 9000 và 5678 không vào được từ Internet; media và n8n vẫn chạy qua domain | Máy ngoài: `curl -m5 http://157.66.219.190:9000/minio/health/live` và `:5678` timeout; mở 1 ảnh media trong CRM; chạy thử 1 workflow n8n có webhook | Ảnh media lỗi; webhook n8n / workflow đăng bài lỗi | Trả bind cũ của service đó, recreate service đó |
| **D1** PR-00 (+ PR-01 chỉ là test, không đổi runtime), không migration | Deploy chuẩn bằng `scripts/ops/deploy.sh` (track OPS — phải có trước D1) | App healthy; `/health/ready` có khối `messenger: {enabled:false, status:"disabled"}`; không có route Messenger | §14.1 Zalo; decrypt API key AI (`app_settings`) vẫn chạy (gọi AI suggestion 1 lần) | `/health/ready` ≠ 200 sau 3 phút; lỗi Zalo inbound/outbound; log `TOKEN_ENCRYPTION_KEY` fatal | Rollback ứng dụng chuẩn |
| **D2** Schema expand (PR-02a migration) | B-1 dump thủ công → `docker compose -f docker-compose.yml run --rm --no-deps app npx prisma migrate deploy` (image **cũ** vẫn đang chạy) | 7 bảng mới + cột nullable; 0 dòng | `_prisma_migrations` +N, `finished_at` đủ; app cũ vẫn healthy | Migration fail / lock timeout | Xem §15.4 (bảng rỗng → drop an toàn theo script đã diễn tập) |
| **D3** Backend PR-02a (flag OFF) | Deploy chuẩn; `.env` **chưa** có `MESSENGER_*` (mặc định false) | Prisma client mới, không route Messenger; Zalo bình thường | §14.1 Zalo | Như D1 | Rollback ứng dụng (schema giữ nguyên) |
| **D4** PR-02b-1 (code nullable) | Deploy chuẩn | Không thay đổi hành vi | §14.1 đầy đủ + characterization test PR-01 pass local | Bất kỳ lỗi Zalo | Rollback ứng dụng |
| **D5** Quan sát | Chờ ≥ 3 ngày | Không lỗi mới liên quan conversation | So số lượng error log trước/sau | — | — |
| **D6** PR-02b-2 backfill | `docker compose -f docker-compose.yml run --rm --no-deps app npx tsx scripts/ops/backfill-message-org-id.ts --batch 5000` | 0 message thiếu `org_id` | `select count(*) from messages where org_id is null` = 0 | Lock timeout lặp lại | Dừng script (idempotent, chạy lại sau) |
| **D7** PR-02b-3/4/5 migration | Dump thủ công → `migrate deploy` | XOR + FK + unique index hợp lệ; `messages.org_id` NOT NULL | `select conname, convalidated from pg_constraint where conname like 'conversations_channel%'` → true | Validate fail | Không drop cột; `DROP CONSTRAINT` vừa thêm (chưa có dữ liệu Messenger) |
| **D8** PR-03…PR-08 backend (flag OFF) | Deploy chuẩn cho từng PR, mỗi PR một lần, theo thứ tự | Không đổi hành vi; từ PR-03: route webhook trả 404 khi flag OFF | §14.1 + §14.2 (Flag OFF) + §14.3; `curl -s -o /dev/null -w '%{http_code}' https://zalocrm.corepviet.com/api/v1/webhooks/meta/x` → 404 | Như D1 | Rollback ứng dụng |
| **D9** Meta config — **chỉ khi PR-07 (log redaction) và PR-08 (metrics/alert) đã chạy production** | Điền `FB_APP_ID`, `FB_APP_SECRET`, `FB_WEBHOOK_VERIFY_TOKEN`, `FB_WEBHOOK_PUBLIC_KEY`, `MESSENGER_ENABLED=true`, `MESSENGER_INBOUND_ENABLED=false`; recreate app | `/health/ready` báo `messenger: "ready"` | GET verify từ Meta dashboard thành công | Health `misconfigured` | Đặt `MESSENGER_ENABLED=false`, recreate |
| **D10** Inbound test Page | Tạo ChannelAccount test Page (`inboundEnabled=true`), `MESSENGER_INBOUND_ENABLED=true`; subscribe webhook | Tin từ tài khoản test xuất hiện trong CRM | §14.2 | Sai chữ ký > 0 từ Meta; Zalo lỗi; duplicate message | Page `inboundEnabled=false` → nếu chưa đủ thì `MESSENGER_INBOUND_ENABLED=false` |
| **D11** Outbound test Page | `MESSENGER_OUTBOUND_ENABLED=true`, Page `outboundEnabled=true` | Trả lời trong 24h đến được tài khoản test; ngoài 7d bị chặn | §14.2 | `messenger_outbound_failed_total` tăng; gửi trùng | §15.2 + §15.3 |
| **D12** Pilot khách thật | Chỉ sau khi Gate 0D (Meta Advanced Access) PASS; bật 1 Page thật | | §14.2 + theo dõi 72h | Như D10/D11 | Như D10/D11 |
| **D13** AI auto-send (PR-09) | Bước riêng. PR-09 chỉ được **viết** khi đủ: Advanced Access `pages_messaging`, pilot ≥ 14 ngày, reconciliation (PR-08) sạch, PolicyEngine ổn định | AI gửi chỉ trong 24h, cờ kép | Đối soát tin AI vs cửa sổ 24h mỗi ngày | Bất kỳ tin AI ngoài 24h | `MESSENGER_AI_AUTO_SEND_ENABLED=false` |

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
**Flag OFF (D8, từ PR-03 trở đi):**
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
- [ ] Caddy validate + TLS OK; 3080 / 9000 / 5678 không vào được từ ngoài (sau D0D / D0E)
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
-- Command đã vào PROCESSING (worker có thể đã gọi Graph) → UNKNOWN_DELIVERY, không ABANDONED
UPDATE outbound_commands SET status='UNKNOWN_DELIVERY'
 WHERE status='PROCESSING';
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
Không tự động gửi lại các command `ABANDONED` hoặc `UNKNOWN_DELIVERY`; `UNKNOWN_DELIVERY` được xem tay theo §7.3.1.

### 15.4 Database rollback
| Thời điểm | Được phép |
|---|---|
| Sau D2, **trước** khi có bất kỳ dòng nào trong `channel_accounts` | Down script đã diễn tập trên bản restore: drop 7 bảng mới + drop cột nullable. Có thể không cần: app cũ bỏ qua chúng |
| Sau D7, trước tin Messenger đầu tiên | Drop constraint / index vừa thêm; giữ cột |
| **Sau tin Messenger đầu tiên (D10)** | **Không rollback schema phá huỷ.** Chỉ dùng feature + application + queue rollback. Không restore dump đè production (mất cả tin Zalo phát sinh sau đó) |
| Hỏng dữ liệu nghiêm trọng | Restore dump vào DB **riêng**, trích dữ liệu cần thiết, rồi sửa bằng script có duyệt. Restore đè chỉ dùng cho thảm hoạ, do chủ hệ thống quyết định, chấp nhận mất dữ liệu từ lúc dump |

---

## 16. Monitoring & Alerts

Repo hiện chưa có metrics. PR-08 thêm registry `prom-client` tại `/internal/metrics`, chỉ cho phép `127.0.0.1` / mạng docker. Trước khi có Prometheus, dùng một job trong app đẩy cảnh báo qua `system_notifications` (đã có) + Telegram bridge (đã có).

| Metric | Loại | Label | Cảnh báo |
|---|---|---|---|
| `meta_webhook_received_total` | counter | `app_key`, `kind` | Không nhận gì trong 24h khi Page đang bật (subscription có thể đã mất) |
| `meta_webhook_invalid_signature_total` | counter | `app_key` | > 5 / 10 phút |
| `meta_webhook_duplicate_total` | counter | `namespace` | Tỉ lệ > 30% trong 1h (Meta đang retry do mình phản hồi chậm) |
| `messenger_inbound_total` | counter | `page`, `type` | — |
| `messenger_outbound_pending` | gauge | `page` | > 20 trong 5 phút |
| `messenger_outbound_sent_total` | counter | `page`, `actor` | — |
| `messenger_outbound_failed_total` | counter | `page`, `code` | ≥ 3 / 15 phút |
| `messenger_graph_api_errors_total` | counter | `code`, `subcode`, `class` | `class=TOKEN_INVALID` / `ACCESS_BLOCKED` → cảnh báo ngay; `UNCLASSIFIED` ≥ 1 → cảnh báo (xem tay); 613 → theo dõi rate limit |
| `messenger_access_blocked_total` | counter | `page`, `code`, `subcode` | Bất kỳ lần tăng nào → cảnh báo ngay (Page đã bị tắt outbound) |
| `messenger_outbound_unknown_delivery_total` | counter | `page` | ≥ 3 / 15 phút; có command `UNKNOWN_DELIVERY` > 30 phút chưa xử lý |
| `meta_webhook_persist_failed_total` | counter | `app_key` | ≥ 1 → cảnh báo (transaction ghi delivery/event lỗi, đã trả 5xx cho Meta) |
| `messenger_token_invalid_total` | counter | `page` | Bất kỳ lần tăng nào → cảnh báo ngay |
| `dispatcher_lag_seconds` | gauge | — | `now - oldest PENDING.created_at` > 60s |
| `queue_depth` | gauge | `queue`, `state` | `messenger-send` wait > 50; failed tăng |

**Reconciliation (PR-08):** job định kỳ so `GET /{page-id}/conversations` với DB; lệch → chỉ **cảnh báo**, không tự sửa. Trong pilot AI chỉ gợi ý (suggestion-only).

**Logging:**
- Mỗi webhook delivery sinh `correlationId = webhookDelivery.id`, truyền xuống `ChannelEvent`, `Message.metadata.correlationId`, `OutboundCommand`, log MetaSender.
- Log chỉ ghi `pageId`, id nội bộ, `kind`, `code`. **Không** ghi nội dung tin, PSID đầy đủ (chỉ 4 ký tự cuối), token, chữ ký hay raw body.
- Payload webhook lưu trong DB có TTL 7 ngày, job xoá mỗi đêm.

**Health:** `/health/ready` có khối `messenger: {enabled, status: "disabled"|"ready"|"misconfigured"}` (✅ PR-00, không lộ tên key); PR-08 bổ sung `dispatcherLagSeconds`. **Không** làm ready fail vì Messenger, nếu không Caddy/Docker sẽ đánh dấu cả app unhealthy và làm hỏng Zalo.

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

**Thứ tự:** Spike là track riêng (n8n endpoint tạm, Raw Body, Crypto node, không lưu execution, xoá sau gate). **Trạng thái: ⏳ chưa làm.** Spike phải PASS **trước khi bắt đầu viết PR-02a** (quyết định của chủ dự án) và dĩ nhiên trước D2.
- Nếu n8n cần `NODE_FUNCTION_ALLOW_BUILTIN=crypto` → dừng, ghi **COMMAND REQUIRES APPROVAL** (phải restart n8n).
- Spike thất bại (`META_ACCESS_BLOCKED`): dừng ở D1. Không viết / không đưa schema Messenger lên production.
- Spike phải thu **bảng lỗi Graph thực tế** (code, subcode, type, message — không kèm token/PSID) cho các ca: token thu hồi, thiếu quyền, người không có Role, ngoài 24h. Bảng này là đầu vào bắt buộc cho danh sách `ACCESS_BLOCKED` ở §7.8 trước PR-04.
- Kết quả thành công "bất ngờ" với tài khoản không có Role phải được xác minh lại bằng một tài khoản thứ hai không có Role.

---

## 18. GO / NO-GO Matrix

### P0
| CHECK | STATUS | BLOCKER? | ACTION |
|---|---|---|---|
| Có bản dump Postgres < 24h | ⚠️ có dump tự động 17/09 00:00 (16 M, gzip OK, cùng disk); lúc migration vẫn cần dump thủ công | **Có** | B-1 (D0B) |
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
| Image rollback có tag | 🟡 có script, chờ review/commit, chưa chạy production | Có (trước D1) | OPS `scripts/ops/deploy.sh` + H-5 tag tay nếu cần |
| Lệnh compose chuẩn, sửa tài liệu overlay | 🟡 tài liệu PR-00; script OPS chờ review/commit | Có (trước D1) | OPS `deploy.sh` |
| Script backup media + verify restore | 🟡 có script, chờ review/commit, chưa chạy production | Có (trước D2) | OPS `backup-media.sh`, `verify-restore.sh` |
| Port 3080/9000/5678 đóng với Internet | ❌ | Có (trước D9) | D0D (3080), D0E (9000/5678) |
| Phân loại lỗi Graph 190 / 10·200 + `UNKNOWN_DELIVERY` | ✅ tài liệu v1.2 (§7.3.1, §7.8); code ❌ | Có (trước PR-04 merge) | PR-04 |
| Webhook: delivery + event cùng transaction, 200 sau COMMIT | ✅ tài liệu v1.2 (§7.2); code ❌ | Có (trước PR-03 merge) | PR-03 |
| Characterization test Zalo 10 nhóm | ✅ 87 test, chờ commit/merge | Có (trước PR-02a) | PR-01 |
| Logger redaction | ❌ | Có (trước D9) | PR-07 |
| Media / SSRF hardening | ❌ | Có (trước D10 nếu nhận media) | PR-07 |
| Meta Spike / Advanced Access | ⏳ chưa làm | Có (trước PR-02a cho spike; trước D12 cho Advanced Access) | §17 |
| Quyết định Lead Ads: Freeze + Expand | ✅ đề xuất (7.4) | Không | Chủ sản phẩm xác nhận |
| Khoá mã hoá hợp nhất về `TOKEN_ENCRYPTION_KEY` | ✅ PR-00 (keyring `keyVersion`) | Không | — |
| Fail-safe config Messenger + health block | ✅ PR-00 | Không | — |
| Health / app / Redis / TLS hiện tại | ✅ | Không | — |

### P2
| CHECK | STATUS | BLOCKER? | ACTION |
|---|---|---|---|
| Disk < 80% với biên an toàn | ⚠️ 76% | Không (theo dõi) | `docker builder prune` |
| `.env` 600 | ❌ 644 | Không | chmod |
| Metrics / alert / reconciliation | ❌ | Có trước D9 | PR-08 |
| Test fail có sẵn (38 file baseline) | ⚠️ nợ cũ, không do Messenger | Không | Ticket riêng; mỗi PR không được tăng số fail |
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

> **Đây là thứ tự chuẩn** (v1.1, khớp Implementation Plan). Mọi tham chiếu PR trong tài liệu này và trong `RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md` đều theo bảng dưới. Mỗi PR: Inspect → Plan → Implement → Test → review diff → review bảo mật → báo cáo → **STOP chờ duyệt**.

| PR | Trạng thái | Scope | Files / modules | Migration? | Đổi hành vi? | Tests | Rollback | Phụ thuộc |
|---|---|---|---|---|---|---|---|---|
| **PR-00** Production Safety Foundation | ✅ commit `067e388` | Keyring `token-encryption.util` theo `keyVersion` + validate 64 hex; `messenger-config.ts` (cờ phân cấp, status `disabled/ready/misconfigured`, không crash); `validate-production-config` tách error/warning; khối `messenger` trong `/health/ready`; `aes-gcm.ts` @deprecated + guard test; `.env.example` ×2; sửa `DEPLOY.md`, `VPS-FIRST-DEPLOY.md`; runbook `BACKUP-RESTORE.md` | `config/*`, `integrations/_shared/token-encryption.util.ts`, `shared/crypto/aes-gcm.ts`, `shared/http/health.ts`, `app.ts`, docs, 5 file unit test | Không | Không | Golden vector / round-trip / tamper / key version; parse config; health; guard kiến trúc | Rollback ứng dụng | Không |
| **PR-01** Zalo characterization | ✅ commit `f4b13e7` | 10 nhóm: inbound, outbound, conversation, contact, assignment, labels, broadcast, websocket, worker/queue, AI handoff; sửa mock ở 10 test cũ cản baseline | `backend/tests/characterization/*` (6 file, 87 test), `tests/test-helpers.ts` + 9 test | Không | Không (chỉ test) | Suite: không failure mới; file fail 49 → 38 | Revert commit | PR-00 |
| **OPS** Deploy / backup scripts | 🟡 có script, chờ review/commit, chưa chạy production | `scripts/ops/deploy.sh` (tag image theo SHA, chặn same-SHA trừ `ALLOW_SAME_SHA=1`, `docker compose -f docker-compose.yml up -d --no-deps app`, rollback `--no-build` không qua disk/dirty gate), `backup-media.sh`, `verify-restore.sh` (dùng container tạm `zalocrm-restore-*`, `--network none --memory 1g`, `EXPECTED_MIGRATIONS=127`) | `scripts/ops/*` | Không | Không | `deploy.sh --dry-run`; shellcheck; `bash -n`; chạy verify-restore trên dump giả lập local nếu có Docker; chạy production sau duyệt | Revert commit | PR-00. **Bắt buộc trước D1** |
| **Meta Spike** (track riêng) | ⏳ chưa làm | n8n endpoint tạm (Raw Body + Crypto node, không lưu execution); verify GET, HMAC, nhận tin từ tài khoản có Role / không Role; kiểm tra hạn `v21.0` | Không đụng repo | Không | Không | Kết quả ghi vào §17 | Xoá workflow tạm | Không. **Phải PASS trước PR-02a** |
| **PR-02a** Additive schema | ⏳ chưa bắt đầu | 7 model (ChannelAccount, TokenCredential, ContactIdentity, ContactMergeAudit, WebhookDelivery, ChannelEvent, OutboundCommand) + cột nullable `conversations.channel_account_id`, `messages.org_id`, `messages.platform_message_id` + FK form mapping; `@deprecated` 4 chỗ token cũ; thêm model vào `org-scoped-models.ts`. **Không** có route, không đổi `zaloAccountId` (§9.1) | `prisma/schema.prisma`, `prisma/migrations/2026xxxx_messenger_expand`, `shared/tenant/org-scoped-models.ts` | **Có** (expand-only) | Không | Migrate trên DB trống + bản restore (B-4); `prisma validate`; test partial unique `token_credentials_one_active`; suite + characterization pass | Rollback ứng dụng; schema giữ (§15.4) | PR-01 merge, **Meta Spike PASS**, **backup DB + media**, **restore test OK** (Gate §11) |
| **PR-02b** Nullable + XOR + backfill | ⏳ | 02b-1 code chịu `zaloAccountId` null (~104 deref + 12 raw SQL + frontend 27 file) và ghi `messages.org_id` cho tin mới; 02b-2 backfill batch; 02b-3/4/5 migration DROP NOT NULL + XOR `conversations_channel_xor` + FK + unique index + `messages.org_id` NOT NULL (§9.2) | `modules/chat/**`, `modules/zalo/**`, analytics raw SQL, frontend, `scripts/ops/backfill-message-org-id.ts`, 3 migration | **Có** (3 file, tách bước) | Không với Zalo | Characterization PR-01 pass; raw SQL loại trừ conversation Messenger; backfill idempotent; XOR reject cả hai null / cả hai có; đếm dòng trước/sau | 02b-1: rollback app; 02b-3…5: drop constraint (trước tin Messenger đầu tiên) | PR-02a (đã lên production). **Xong trước PR-03** |
| **PR-03** Meta webhook + inbound text | ⏳ | GET verify (timing-safe); POST raw body + HMAC fail-closed; WebhookDelivery; classifier (`messaging` / `leadgen` → IGNORED / unknown); ChannelEvent; processor tạo Contact + ContactIdentity + Conversation + Message cho **tin text** (PSID, page id, mid, timestamp, text); ChannelAccount / TokenCredential service; flag OFF = 404 | `modules/channels/**`, `modules/channels/meta/webhook-routes.ts`, `meta-signature.ts`, `webhook-classifier.ts`, `event-processor.ts`, `contact-identity.service.ts`, `app.ts` (register) | Không | Có, **sau flag** | Chữ ký đúng / sai / thiếu header / body đổi 1 byte; `publicAppKey` sai → 404; duplicate delivery; duplicate `mid`; **transaction ghi delivery+event lỗi → 5xx, không 200**; process chết sau COMMIT → event PENDING vẫn được xử lý; 200 chỉ trả sau COMMIT (§7.2); leadgen vs messaging; payload unknown / malformed; org isolation | Flag / Page OFF | PR-02b |
| **PR-04** Outbox + dispatcher + PolicyEngine | ⏳ | MessagingPolicyEngine (<24h cho phép; 24h–7d chỉ người + `HUMAN_AGENT` khi được cấp; >7d chặn); OutboundCommand; dispatcher + reaper; BullMQ `messenger-send`; MetaSender; phân loại lỗi Graph theo §7.8 (190 → TOKEN_INVALID; 10/200 quyền → ACCESS_BLOCKED, token giữ ACTIVE nếu `debug_token` hợp lệ; 10/200 khác → UNCLASSIFIED/NEEDS_REVIEW); retry theo §7.3 (connect-trước-gửi, 613, 5xx giới hạn); **`UNKNOWN_DELIVERY`** cho timeout sau khi gửi, không auto-retry, nút "Gửi lại" tay (§7.3.1 — khớp echo làm ở PR-05, tra Conversations API ở PR-08); token health 6h; UI gửi | `modules/channels/messaging-policy-engine.ts`, `outbound-*.ts`, `meta-sender.worker.ts`, `graph-api-error.ts`, `token-health.job.ts`, `chat-routes.ts`, frontend chat | Không (bảng đã có) | Có, sau flag | Bảng policy (≤24h / 24h–7d người-AI / >7d / tag cấm / token INVALID); Redis down sau commit; `jobId` chống trùng; 190 → INVALID + notification; 10/200 quyền → Page tắt outbound, token vẫn ACTIVE; 10/200 lạ → NEEDS_REVIEW, không retry; connect refused → retry; read timeout sau write → UNKNOWN_DELIVERY, 0 retry; 5xx → tối đa 3 lần; reaper không trả command đã gọi Graph về PENDING; **unit test invariant state machine: reaper không bao giờ đưa `PROCESSING` / `UNKNOWN_DELIVERY` về `PENDING`** | Flag OFF + §15.3 | PR-03 |
| **PR-05** Delivery / read / echo / realtime | ⏳ | Echo (phân biệt nguồn App / Business Suite **chỉ từ field thật**), delivery, read; dedup `message:` / `echo:` / `delivery:` / `read:`; emit qua socket.io hiện có | `modules/channels/meta/event-processor.ts`, emit chat | Không | Có, sau flag | Echo không tạo tin thứ hai; replay payload; watermark idempotent; emit đúng room org; **echo tới sau timeout liên kết đúng command `UNKNOWN_DELIVERY` → SENT chỉ khi khớp Page + conversation + recipient + payload + cửa sổ thời gian hẹp; 2 candidate → NEEDS_REVIEW; không khớp → không đổi command** (§7.3.1) | Flag OFF | PR-04 |
| **PR-06** Unified inbox + merge tay | ⏳ | Bộ lọc inbox All / Zalo / Messenger; merge Contact bằng tay + ContactMergeAudit + **undo thật**; không auto-merge | `modules/chat/**`, `modules/contacts/**`, frontend inbox / contacts | Không | Có (UI), sau quyền | Filter đúng kênh; merge → undo khôi phục đủ quan hệ; org isolation | Undo merge; rollback app | PR-05 |
| **PR-07** Media + SSRF + retention + log redaction | ⏳ | Tải media với chống SSRF (IPv4/IPv6 private, link-local, metadata, redirect, DNS rebinding); giới hạn dung lượng; TTL payload webhook 7 ngày; **logger redaction** (`access_token`, `appsecret_proof`, `x-hub-signature-256`, `Authorization`, `hub.verify_token`, raw body) | `modules/channels/meta/media-*.ts`, `shared/utils/logger.ts`, `payload-purge.job.ts` | Không | Có (log ít thông tin nhạy cảm hơn) | Bộ URL SSRF; file vượt giới hạn; purge TTL; unit test redaction | Rollback app | PR-05. **Bắt buộc trước D9** |
| **PR-08** Pilot instrumentation | ⏳ | Metrics §16 tại `/internal/metrics` (loopback), alert → system_notifications + Telegram; correlationId; reconciliation `GET /{page-id}/conversations` **chỉ cảnh báo**; AI chỉ gợi ý | `modules/channels/metrics.ts`, `reconciliation.job.ts`, `app.ts`, alert job | Không | Không | Metric tăng đúng; endpoint từ chối IP ngoài; reconciliation không ghi DB | Rollback app | PR-04 (có thể song song PR-05…07). **Bắt buộc trước D9** |
| **PR-09** AI auto-send | ⛔ **không viết** tới khi đủ điều kiện | AI gửi Messenger chỉ trong 24h, cờ kép (`MESSENGER_AI_AUTO_SEND_ENABLED` + Page `aiAutoSendEnabled`) | `modules/ai/**` | Không | Có, sau flag | AI không bao giờ gửi >24h; bypass cờ → chặn | Flag OFF | Advanced Access `pages_messaging` + pilot ≥ 14 ngày + reconciliation sạch + PolicyEngine ổn định |

**Còn mở ngoài chuỗi PR:** D0A…D0E (§13 — mỗi gate duyệt riêng, chưa chạy); trong đó D0B-1 = nền tảng backup/restore của Gate §11, D0B-2 = diễn tập migration (sau khi có migration) (B-1…B-6; đã có dump DB tự động 17/09, còn thiếu media + off-site + restore test); off-site backup chưa chọn đích.

---

## 20. Final Recommendation

### Trả lời 5 câu hỏi

**1. Code đã sẵn sàng để bắt đầu implement Messenger chưa?**
**Có — và đã bắt đầu.** PR-00 đã commit (`067e388`), PR-01 đã commit (`f4b13e7`). Repo sạch, Prisma 7.5 / BullMQ 5 / socket.io 4 đều phù hợp, không có code Lead Ads cũ phải gỡ. **PR-02a chưa được mở** cho tới khi đủ 4 điều kiện: (1) PR-01 qua gate, (2) Meta Spike PASS, (3) có backup DB + media, (4) restore test thành công.

**2. DB đã sẵn sàng cho migration chưa?**
**Về kỹ thuật: có.**
- Lịch sử migration sạch (127/127), không lock, không long transaction.
- Kích thước nhỏ (153 MB; `messages` 55.690 dòng), nên mọi thao tác ở §5.2 chỉ mất vài ms tới vài giây.

**Về vận hành: chưa.** Chưa chạy `migrate diff` và chưa diễn tập trên bản restore.

**3. Backup đã đủ an toàn cho migration production chưa?**
**Chưa.** Mới có 1 dump DB tự động (17/09 00:00, cùng disk), không backup media 3.7 G, không off-site, chưa restore test. **STOP — KHÔNG DEPLOY MIGRATION PRODUCTION.**

**4. Có deploy code với Messenger OFF được không?**
- **PR-00 / PR-01 (không migration): được**, với điều kiện có image tag để rollback (track OPS `deploy.sh` hoặc H-5 tag tay) và chạy lệnh compose chuẩn (không overlay).
- **PR-02a trở đi (có migration): chưa**, cho tới khi Gate §11 mở.

**5. Còn điều kiện gì trước khi bật Messenger cho khách thật?**
1. Gate §11 mở (dump + media + off-site + restore test + RPO/RTO).
2. Meta Spike PASS và có **Advanced Access `pages_messaging`** (+ Business Verification nếu Meta yêu cầu).
3. Port 3080/9000/5678 không còn truy cập trực tiếp từ Internet.
4. PR-00 → PR-08 đã deploy với flag OFF và qua §14.1 ở từng bước (PR-09 không thuộc điều kiện này).
5. Test Page qua toàn bộ §14.2 (inbound, echo, dedup, policy 24h/7d, token INVALID, Redis down trên staging).
6. Logger redaction + SSRF (PR-07) + metrics + alert + reconciliation (PR-08) hoạt động.
7. Runbook §15 đã diễn tập ít nhất một lần trên test Page (tắt Page → tắt global → abandon queue).
8. Chủ sản phẩm xác nhận: Lead Ads theo phương án Freeze + Expand; `HUMAN_AGENT` mặc định DENY cho tới khi Meta cấp.

### Trạng thái

# NO-GO

Chưa được deploy migration hay tính năng Messenger lên VPS production.

**Được phép ngay (không cần gate):** review track OPS (`deploy.sh`, `backup-media.sh`, `verify-restore.sh`); chạy Meta Spike; thực hiện các lệnh B-1…B-6 sau khi duyệt.

**Được mở PR-02a (viết code) khi:** PR-01 qua gate · Meta Spike PASS · có backup DB + media · restore test thành công.

**Chuyển sang GO WITH CONDITIONS cho deploy PR-02a (schema expand, flag OFF — D2/D3) khi đủ đồng thời:**
1. §11.4 đã điền đủ, có bằng chứng restore thành công và số dòng khớp.
2. Có off-site copy của dump + media, checksum khớp.
3. Image rollback có tag, lệnh deploy chuẩn đã chạy thành công một lần với PR-00 (D1).
4. Characterization test Zalo 10 nhóm (PR-01) pass trên commit sẽ deploy.
5. Meta Spike PASS (hoặc ghi nhận `META_ACCESS_BLOCKED` và dừng dự án ở D1).
6. Migration PR-02a (và PR-02b) đã diễn tập trên bản restore và có số đo thời gian.

---

## Phụ lục A — COMMAND REQUIRES APPROVAL (tổng hợp)

Chưa lệnh nào được chạy.

| ID | Lệnh | Mục đích | Rủi ro |
|---|---|---|---|
| B-1 | `docker exec zalo-crm-backup /backup.sh` | Dump thủ công | Tải DB ngắn (153 MB) |
| B-2 | `scripts/ops/backup-media.sh` | Backup media + đếm file + checksum | Dùng ~3.8 G disk; dừng nếu disk dự kiến > 80% |
| B-3 | `scripts/ops/verify-restore.sh` | Restore test vào `zalocrm-restore-test --network none` | RAM 1 G tạm thời; tự dọn container bằng trap |
| B-4 | `docker run --rm --network container:zalocrm-restore-test ... prisma migrate deploy` | Diễn tập migration | Chỉ đụng DB tạm |
| B-5 | `docker rm -f zalocrm-restore-test` | Dọn | — |
| B-6 | Cài rclone + cấu hình off-site + cron | Off-site | Cần credential đích do chủ hệ thống nhập |
| H-1 (D0C) | `chmod 600 /root/ZaloCRM-CorepViet/.env` | Quyền secret | Không |
| H-2 (D0A) | `docker builder prune -f` | Giải phóng ~8.9 G | Build lần sau chậm hơn |
| H-3 (D0D) | Sửa `docker-compose.yml` ports app → `"172.17.0.1:${APP_PORT:-3080}:3000"` + `docker compose -f docker-compose.yml up -d --no-deps app` | Đóng 3080 với Internet | App restart ~30s; **không** dùng `127.0.0.1` (Caddy proxy qua 172.17.0.1) |
| H-4 (D0E) | Đóng 9000 (MinIO) / 5678 (n8n) tương tự | Giảm bề mặt tấn công | Kiểm tra `S3_PUBLIC_URL` và webhook n8n trước |
| H-5 (D0A) | `docker tag zalocrm-corepviet-app:latest zalocrm-corepviet-app:850dea1` | Có image rollback | Không |
| CW-1 | `docker network disconnect chatwoot_default caddy && docker network rm chatwoot_default` | Dọn tồn dư Chatwoot | Không ảnh hưởng site (caddy còn `n8n_default`); làm ngoài giờ cao điểm |
| CW-2 | Quyết định giữ / chuyển off-site / xoá `/opt/backups/chatwoot-truoc-khi-go-20260901-075816.tgz` | Dọn | Xoá là không hoàn tác |
| E-1 | Xoá dòng `FB_TOKEN_ENC_KEY=` rỗng trong `.env` | Dọn env deprecated | Chỉ sau khi PR-00 lên production (D1) |
| D0A–D0E, D1–D13 | Toàn bộ §13 | Hạ tầng + deploy | Theo từng bước, mỗi bước duyệt riêng |
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
