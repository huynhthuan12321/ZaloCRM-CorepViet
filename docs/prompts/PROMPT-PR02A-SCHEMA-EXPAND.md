# PROMPT PR-02a — Schema expand (7 model mới + cột nullable)

> Copy toàn bộ prompt này vào session AI mới để thực hiện PR-02a.
> **CHỈ BẮT ĐẦU KHI ĐỦ 4 ĐIỀU KIỆN** (xem cuối prompt).

---

## BỐI CẢNH DỰ ÁN

- **Repo local:** `D:\ZaloCRM-CorepViet`
- **VPS:** 157.66.219.190 (Ubuntu 22.04)
- **SSH:** `ssh -i ~/.ssh/zalocrm_ops -o BatchMode=yes root@157.66.219.190 '<lệnh>'`
- **Hệ thống:** ZaloCRM Cờ Rếp Việt (KHÔNG phải VoiCRM)
- **Tài liệu gốc:** `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md` — runbook v1.2 đóng băng
- **Prisma:** 7.5, hiện có 116 model, 128 migration (post-D1), không drift
- **DB production:** PostgreSQL 16.15, 153 MB, 55.690 messages, 493 conversations, 1.480 contacts, 1 org

## RÀNG BUỘC BẮT BUỘC

1. Không deploy/migration trên production trong prompt này — chỉ VIẾT CODE
2. Không đọc/in `.env`, token, password, secret
3. Không in dữ liệu khách hàng
4. Không push/merge nếu chưa được duyệt
5. Schema change phải **expand-only** — app cũ phải chạy được với schema mới (§15.1)
6. Không đổi `zaloAccountId` nullable ở PR-02a (đó là PR-02b)
7. Branch: `feat/messenger-pr-02a-schema-expand`

## NGUỒN THIẾT KẾ

Đọc các section sau TRƯỚC KHI viết code:

```
1. docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md §9.1 — Schema chính xác cho 7 model mới
2. docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md §7.1–§7.8 — Kiến trúc Messenger
3. docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md §19 PR-02a row — Scope + files + tests
4. docs/RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md §2 — Kiến trúc ChannelAccount/TokenCredential
5. backend/prisma/schema.prisma — Schema hiện tại (116 model)
6. backend/src/shared/tenant/org-scoped-models.ts — Danh sách model org-scoped (thêm model mới vào đây)
7. backend/src/modules/integrations/_shared/token-encryption.util.ts — Keyring hiện tại (PR-00)
```

## 7 MODEL MỚI (từ runbook §9.1)

```
1. ChannelAccount
   - provider: enum (FACEBOOK_PAGE)
   - externalId: PAGE_ID
   - orgId: FK Organization
   - pageName, status, capabilities (JSON)
   - inboundEnabled, outboundEnabled, aiAutoSendEnabled (default false)
   - Unique: (provider, externalId) toàn hệ thống

2. TokenCredential
   - channelAccountId: FK ChannelAccount
   - encryptedToken (format base64(IV‖TAG‖CT) từ token-encryption.util)
   - keyVersion: int (khớp keyring PR-00)
   - grantedScopes: text[]
   - health: enum (ACTIVE, INVALID, REVOKED, EXPIRED)
   - expiresAt: nullable (System User token = không hết hạn)
   - lastCheckedAt, lastErrorCode, lastErrorMessage
   - Partial unique: (channelAccountId) WHERE status=ACTIVE — chỉ 1 token active per account

3. ContactIdentity
   - contactId: FK Contact
   - channelAccountId: FK ChannelAccount
   - provider: enum
   - externalUserId: PSID
   - Unique: (channelAccountId, externalUserId)
   - KHÔNG auto-merge

4. ContactMergeAudit
   - sourceContactId, targetContactId
   - mergedBy: FK User
   - mergedAt
   - undoneAt, undoneBy: nullable (hỗ trợ undo thật)
   - snapshot: JSON (trạng thái trước merge)
   - orgId

5. WebhookDelivery
   - deliveryId: sha256(rawBody) — dedup
   - appKey: publicAppKey từ URL
   - payload: JSON (TTL 7 ngày, job xoá)
   - receivedAt
   - orgId: nullable (chưa biết org lúc nhận, resolve sau)

6. ChannelEvent
   - webhookDeliveryId: FK WebhookDelivery
   - dedupKey: theo namespace §7.6 (webhook:sha256, message:mid, echo:mid, delivery:watermark, read:watermark)
   - kind: enum (MESSAGE, ECHO, DELIVERY, READ, LEADGEN, UNKNOWN)
   - status: enum (PENDING, PROCESSED, IGNORED, FAILED)
   - rawData: JSON
   - channelAccountId: FK ChannelAccount (nullable, resolve khi process)
   - Unique: dedupKey (ON CONFLICT DO NOTHING)

7. OutboundCommand
   - conversationId: FK Conversation
   - channelAccountId: FK ChannelAccount
   - recipientExternalId: PSID
   - payload: JSON
   - status: enum (PENDING, DISPATCHING, PROCESSING, SENT, FAILED, UNKNOWN_DELIVERY, BLOCKED_TOKEN, BLOCKED_ACCESS, NEEDS_REVIEW, ABANDONED)
   - jobId: text (BullMQ, chống trùng dispatch)
   - actor: enum (HUMAN, AI, SYSTEM)
   - platformMessageId: nullable (response từ Graph API)
   - lastError: JSON nullable
   - retryCount: int default 0
   - orgId
```

## CỘT NULLABLE MỚI (expand-only, KHÔNG breaking)

```
1. conversations.channel_account_id: text NULL, FK → channel_accounts ON DELETE RESTRICT
   (RESTRICT, không CASCADE — xoá Page không xoá lịch sử chat)

2. messages.org_id: text NULL (backfill ở PR-02b, NOT NULL ở PR-02b)

3. messages.platform_message_id: text NULL
   Partial unique: (org_id, platform_message_id) WHERE platform_message_id IS NOT NULL
```

## THÊM VÀO org-scoped-models.ts

```
Thêm vào Set ORG_SCOPED_MODELS:
- 'ChannelAccount'
- 'TokenCredential'
- 'ContactIdentity'
- 'ContactMergeAudit'
- 'WebhookDelivery' (mặc dù orgId nullable, vẫn thêm)
- 'ChannelEvent'
- 'OutboundCommand'
```

## @deprecated 4 CHỖ TOKEN CŨ

```
Thêm @deprecated comment (KHÔNG XOÁ) vào schema.prisma:
1. organizations.encrypted_fb_system_user_token
2. facebook_page_accounts.encrypted_access_token
3. facebook_page_connections.access_token_enc
4. facebook_app_configs.app_secret_enc / token_enc_key_enc

Lý do: 4 bảng token cũ (Lead Ads) đều 0 data, không dùng. TokenCredential thay thế.
```

## FK FORM MAPPING

```
facebook_form_mappings.channel_account_id: text NULL, FK → channel_accounts
(Chuẩn bị cho tương lai nếu Lead Ads dùng ChannelAccount thay vì FacebookPageConnection)
```

## QUY TRÌNH THỰC HIỆN

### Bước 1: Tạo branch + đọc thiết kế

```
git checkout main && git pull
git checkout -b feat/messenger-pr-02a-schema-expand

Đọc toàn bộ §9.1 trong runbook để lấy schema chính xác.
Đọc §7.1–§7.8 để hiểu context kiến trúc.
```

### Bước 2: Viết schema Prisma

```
Thêm 7 model + 3 cột + enum vào backend/prisma/schema.prisma
- Enum: ChannelProvider, TokenHealth, ChannelEventKind, ChannelEventStatus, OutboundCommandStatus, OutboundActor
- Tuân thủ convention hiện tại: @map snake_case, @relation, orgId pattern

Chạy: npx prisma validate — phải pass
```

### Bước 3: Tạo migration

```
npx prisma migrate dev --name messenger_expand --create-only

Kiểm tra file migration SQL:
- Chỉ có CREATE TABLE + ALTER TABLE ADD COLUMN
- KHÔNG có DROP, ALTER COLUMN ... SET NOT NULL, hoặc thay đổi bảng cũ ngoài nullable column
- Có SET lock_timeout = '3s' trước ALTER TABLE conversations/messages
- FK ON DELETE RESTRICT cho channel_account_id
- Partial unique index cho token_credentials
- Partial unique index cho messages(org_id, platform_message_id)
```

### Bước 4: Cập nhật org-scoped-models.ts

```
Thêm 7 model mới vào ORG_SCOPED_MODELS Set
Cập nhật comment đếm model (62 → 69)
```

### Bước 5: @deprecated annotations

```
Thêm /// @deprecated comment vào 4 chỗ token cũ trong schema.prisma
```

### Bước 6: Test

```
6.1 npx prisma validate — pass
6.2 npx prisma migrate dev trên DB local trống — tạo đủ bảng
6.3 Chạy toàn bộ test suite: npx vitest run
    - Characterization tests (PR-01) phải pass (không đổi runtime)
    - File fail ≤ 38 (baseline)
6.4 Test partial unique token_credentials_one_active:
    - INSERT 2 TokenCredential cùng channelAccountId, cả 2 status=ACTIVE → phải fail
    - INSERT 1 ACTIVE + 1 REVOKED → phải pass
6.5 Kiểm tra app cũ chạy được với schema mới:
    - Build app trên branch main
    - Chạy với DB đã migrate PR-02a
    - Health check pass, Zalo flow OK (expand-only confirm)
```

### Bước 7: Review + commit

```
git add -A
git commit -m "feat(schema): PR-02a — 7 Messenger models + nullable columns (expand-only)"

KHÔNG PUSH — chờ duyệt:
- Review diff
- Review bảo mật
- Báo cáo
```

## ĐIỀU KIỆN TIỀN ĐỀ (TẤT CẢ PHẢI ĐÃ PASS)

| # | Điều kiện | Trạng thái |
|---|---|---|
| 1 | PR-01 đã merge vào main | ☐ |
| 2 | Meta Spike PASS | ☐ |
| 3 | D1 PASS (deploy PR-00+PR-01 lên production) | ☐ |
| 4 | Gate §11: backup DB + media + off-site + restore test OK + RPO/RTO | ☐ |

**Nếu bất kỳ điều kiện nào chưa PASS → KHÔNG BẮT ĐẦU PR-02a.**

## SAU PR-02a

Tiếp theo:
1. D0B-2: Diễn tập migration PR-02a trên DB restore (bấm giờ)
2. D2: Deploy migration lên production (schema expand, app cũ vẫn chạy)
3. D3: Deploy backend PR-02a (flag OFF)
4. PR-02b: Nullable zaloAccountId + XOR + backfill
