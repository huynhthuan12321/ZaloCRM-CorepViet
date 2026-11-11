# Rà soát phương án triển khai Messenger Native trong ZaloCRM

> **Đã được thay thế về mặt triển khai** bởi [TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md](TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md) (audit repo + VPS ngày 2026-09-16). Mục §10 (gỡ Chatwoot) không còn hiệu lực — Chatwoot đã gỡ xong.
>
> **Cách đọc cùng TRIEN-KHAI:** tài liệu này giữ **lý do kiến trúc** (§1–§7) và **hướng dẫn Meta Spike** (§3.3–§3.6). Thứ tự làm việc và tên PR theo **TRIEN-KHAI §19** (PR-00…PR-09, PR-02 tách 02a/02b). Bảng đối chiếu Phase ở đây → PR: 0A Backup → Gate §11 + track OPS · 0B Zalo regression → PR-01 · 0C Meta Spike → track Meta Spike · 0D Advanced Access → điều kiện D12 · Phase 1 trở đi → PR-02a…PR-09. Khi hai tài liệu lệch nhau, **TRIEN-KHAI thắng**.

| | |
|---|---|
| **Phiên bản** | 3 — điều chỉnh theo đánh giá độc lập lần 2 |
| **Ngày cập nhật** | 16-09-2026 |
| **Tài liệu được rà soát** | `PHUONG-AN-TRIEN-KHAI-MESSENGER-NATIVE-ZALOCRM.md` (01-09-2026) |
| **Tài liệu tham chiếu** | [`KIEM-TOAN-VONG-2-MESSENGER.md`](KIEM-TOAN-VONG-2-MESSENGER.md) |
| **Số liệu production đo ngày** | 01-09-2026 (chỉ lệnh đọc, không in secret) |
| **Trạng thái** | **GO cho Phase 0** · **CHƯA GO cho pilot với khách thật** — chờ xác nhận Meta access |

---

## 0. Lịch sử thay đổi

### 0.1. Phiên bản 3 (so với phiên bản 2)

| # | Nội dung phiên bản 2 | Điều chỉnh ở phiên bản 3 |
|---|---|---|
| 1 | Advanced Access là ẩn số chưa xác minh | **Working assumption:** production với khách Facebook bình thường **sẽ cần Advanced Access cho `pages_messaging`**. Spike vẫn bắt buộc để xác nhận trên App/Business/Page của CorepViet và xác định yêu cầu Dashboard trước khi nộp review |
| 2 | Endpoint tạm dựng bằng n8n — chưa có yêu cầu kỹ thuật | Bắt buộc **Raw Body** khi tính HMAC; không lưu execution payload; xoá workflow/credential/log sau Gate 0D (mục 3.4) |
| 3 | Ma trận Spike 4 dòng | Thêm dòng **Non-role + Live + Advanced** (acceptance test) và bảng **evidence** bắt buộc cho mỗi lần chạy (mục 3.5) |
| 4 | Dòng 3 chạy được ⇒ Meta access rời critical path | Kết quả đó là **ngoài dự kiến** ⇒ phải xác minh lại tài khoản test thực sự không có Role/task trên App, Page, Business trước khi kết luận (mục 3.6) |
| 5 | Mã lỗi 10/200 gắn trực tiếp với Gate 0D | Gate dựa trên **kết quả thực tế**; mã lỗi chỉ là bằng chứng chẩn đoán. Ghi đủ `code`, `error_subcode`, `type`, `message`, `fbtrace_id` (mục 6.6) |
| 6 | Checklist production | Thêm 5 mục: access level có evidence, `debug_token`, Page task của System User, kiểm thử riêng `HUMAN_AGENT`, dọn Spike |

### 0.2. Phiên bản 2 (so với phiên bản 1)

| # | Nội dung phiên bản 1 | Điều chỉnh ở phiên bản 2 |
|---|---|---|
| 1 | "Nội bộ + Page công ty ⇒ Standard Access ⇒ không cần App Review" | **Sai mức độ chắc chắn.** Standard Access giới hạn ở người có Role trên App, trong khi khách nhắn vào fanpage **không có Role**. Nhu cầu Advanced Access / App Review / Business Verification là **ẩn số chưa xác minh** → trở thành **blocker số 1**, xử lý bằng Meta Spike (mục 3) |
| 2 | "Không còn hạng mục nào phụ thuộc xét duyệt Meta" | **Bỏ câu này.** Ước lượng tách thành hai dòng: engineering (dev-day) và Meta access (dependency riêng, không cộng vào dev-day) |
| 3 | System User token không hết hạn ⇒ bỏ quản lý vòng đời | Token vẫn có thể bị thu hồi hoặc mất quyền. **Giữ** `status`, `lastValidatedAt`, `invalidatedAt`, `version`, health check định kỳ và runbook khi token mất hiệu lực. Chỉ bỏ scheduler refresh 60 ngày |
| 4 | Chính sách 24 giờ nằm trong sender | Tách thành **`MessagingPolicyEngine`** độc lập |
| 5 | `ChannelAccount` thay thế hay tham chiếu `FacebookPageConnection` — để ngỏ | **Đã chốt:** một Page — một identity — một nguồn token. Lead Ads và Messenger là capability của Page |
| 6 | Hồ sơ hợp nhất: (a) hoãn hoặc (b) gộp thủ công | **Đã chốt:** gộp thủ công có audit và undo. **Không** tự động gộp |
| 7 | Lộ trình 6 giai đoạn (0–5) | Lộ trình 11 bước (0A–0D, 1–7), mỗi bước có gate. **Meta Spike chạy trước migration schema** |

---

## 1. Tóm tắt

### 1.1. Phạm vi đã chốt

- Mục đích: quản lý tin nhắn của **các Facebook Page (fanpage) công ty đang quản lý** trong ZaloCRM.
- **Không** kết nối tài khoản Facebook cá nhân.
- Dùng nội bộ, **không thương mại hoá** tính năng này cho bên thứ ba.
- Chatwoot hiện không hoạt động ⇒ **gỡ bỏ**.

### 1.2. Đánh giá

- **Kiến trúc phần mềm: khoảng 9/10** (8,5/10 ở phiên bản 1). Tài liệu đã bao phủ những thứ quyết định hệ thống có chạy ổn định ngoài production hay không: outbox, dedup, lưu webhook thô, dispatcher PostgreSQL → BullMQ, rollback, đối soát số tin, chính sách 24 giờ, chống SSRF media, mã hoá token và pilot.
- **Quyền truy cập Meta là rủi ro lịch trình lớn nhất.** Bằng chứng hiện có nghiêng mạnh về việc cần Advanced Access; Meta Spike phải chạy trước mọi thay đổi schema.
- Tài liệu **đủ chất lượng làm tài liệu điều hành triển khai**; không cần thiết kế lại kiến trúc.

### 1.3. Tác động của phạm vi

| | Đa tenant, mở cho khách hàng | Phạm vi hiện tại |
|---|---|---|
| Mô hình Meta App | Chưa chốt | **Một App của CorepViet** |
| Token | OAuth người dùng, refresh 60 ngày | **System User token** — không refresh, **vẫn quản lý vòng đời** |
| Cách ly tenant / RLS | Rủi ro Critical | Hoãn được — production chỉ có **1 organization** |
| `ChannelAccountAccess`, OAuth cho khách | Cần | **Bỏ** |
| App Review / Advanced Access | Chắc chắn cần | **Working assumption: cần** — Spike xác nhận, gate 0D |
| Engineering | 24–41 dev-day | **23–39 dev-day** (đã gồm Meta Spike) |
| Meta access | — | **Dependency riêng**, không cộng vào dev-day |

---

## 2. Điểm mạnh của phương án

| Hạng mục | Đánh giá | Ghi chú |
|---|---|---|
| Không chuyển Zalo sang `ChannelAccount` ngay (§3.1) | Rất tốt | Không sửa subsystem đang tạo doanh thu chỉ để kiến trúc gọn hơn |
| XOR `CHECK (num_nonnulls(zalo_account_id, channel_account_id) = 1)` (§3.2) | Rất tốt | Báo cáo kiểm toán dùng OR, cho phép cả hai cột cùng có giá trị |
| Xác định App qua `publicAppKey` trong URL (§3.7) | Rất tốt | Không chọn secret dựa trên body chưa xác minh |
| `WebhookDelivery` → `ChannelEvent` → `OutboundCommand` | Rất tốt | Nền tảng cho retry, audit và dedup |
| Dispatcher bền vững PostgreSQL → BullMQ (§3.6) | Rất quan trọng | Xử lý đúng khe hở "DB commit xong nhưng Redis chết" |
| Một endpoint webhook cho Meta App | Đúng hướng | Lead Ads và Messenger vào cùng cổng rồi phân luồng |
| `Message.orgId` ngay trong migration | Nên làm | ~46.000 dòng — backfill còn rẻ |
| Characterization test Zalo | Bắt buộc | Lớp bảo hiểm tốt nhất trước migration |
| Đối soát số tin với Graph API | Rất tốt | Biến "0 mất tin" thành chỉ số kiểm chứng được |
| `OutboundCommand` → `abandoned` khi rollback | Đúng | Không để queue cũ gửi tin sau rollback |
| Gỡ Chatwoot | Hợp lý | Không có dữ liệu nghiệp vụ, đang chiếm ~1 GB RAM |
| Backup DB + media + off-site + restore test | Bắt buộc | Làm trước migration Messenger |

---

## 3. Blocker số 1 — Quyền truy cập Meta

### 3.1. Vấn đề

Phiên bản 1 lập luận: chỉ dùng cho Page của công ty ⇒ Standard Access là đủ ⇒ không cần App Review. Lập luận này **không đứng vững**:

- Standard Access là mức mặc định, **giới hạn dữ liệu ở những người có Role trên App** (Admin / Developer / Tester).
- Bộ Postman chính thức của Meta cho Messenger Platform ghi: **cần Advanced Access để truy cập hội thoại giữa doanh nghiệp và những người không có Role** trên App / Page / Business *(nguồn do người đánh giá độc lập kiểm tra ngày 16-09-2026)*.
- App Review là bước cần thiết để được cấp Advanced Access; Business Verification có thể được Dashboard yêu cầu kèm theo.
- Khách hàng bình thường nhắn vào fanpage **không có Role** ⇒ rơi đúng vào trường hợp cần Advanced Access.
- Messenger Platform hỗ trợ cả user token và **System User token** ⇒ hướng dùng System User có cơ sở, nhưng không thay đổi yêu cầu về mức truy cập.

### 3.2. Working assumption

> **Production với khách Facebook bình thường sẽ cần Advanced Access cho `pages_messaging`.** Meta Spike vẫn bắt buộc để xác nhận hành vi trên chính App / Business / Page của CorepViet và xác định chính xác các yêu cầu trên Dashboard **trước khi nộp App Review**.

Hệ quả cho kế hoạch:

- **Lập kế hoạch như thể App Review sẽ cần**: chuẩn bị hồ sơ review (mô tả use case, screencast luồng nhân viên trả lời khách, chính sách quyền riêng tư) song song với Phase 1–5.
- Phase 1–5 phát triển và kiểm thử được bằng Standard Access với tài khoản có Role.
- Pilot với khách thật chờ Advanced Access.

### 3.3. Meta Spike (Phase 0C)

**Mục tiêu:** chứng minh chuỗi `quyền → webhook → PSID → inbound → outbound → echo` chạy đúng trên App thật và thu thập evidence cho App Review. **Không** xây CRM.

**Các bước:**

1. Tạo Meta App loại Business, gắn vào Business Manager của CorepViet; thêm sản phẩm Messenger và Webhooks.
2. Tạo System User; gán App và Page thử nghiệm cho System User **kèm Page task phù hợp** (quản lý tin nhắn). Token có scope nhưng System User không được giao đúng task thì `/subscribed_apps` vẫn có thể bị từ chối.
3. Phát hành token với `pages_messaging`, `pages_manage_metadata` (và các quyền đọc Page cần thiết).
4. Kiểm tra token bằng **Access Token Debugger / `GET /debug_token`**: đúng App ID, đúng scopes, đúng Page asset. Chỉ ghi kết quả, **không ghi token**.
5. Dựng endpoint webhook bằng n8n (mục 3.4).
6. `POST /{page-id}/subscribed_apps` với `messages`, `message_echoes`, `message_deliveries`, `message_reads`, `messaging_postbacks`.
7. Chạy ma trận kiểm thử và ghi evidence (mục 3.5).

### 3.4. Endpoint Spike bằng n8n

Dùng workflow n8n trên VPS — không sửa mã ZaloCRM.

**Luồng đúng:**

```
GET /meta-spike
   → so khớp hub.verify_token (timing-safe)
   → trả hub.challenge

POST /meta-spike
   → lấy RAW BODY
   → tính HMAC-SHA256 bằng App Secret
   → so với X-Hub-Signature-256 bằng timingSafeEqual
   → sai chữ ký ⇒ 401, dừng
   → parse JSON
   → ghi metadata kiểm thử (mục 3.5)
   → 200
```

**Không làm:**

```
Webhook → parse JSON → JSON.stringify() → HMAC     ✗
```

JSON được serialize lại có thể khác byte so với payload gốc (thứ tự khoá, khoảng trắng, escape Unicode) ⇒ chữ ký sai.

**Yêu cầu cấu hình bắt buộc:**

| Hạng mục | Yêu cầu |
|---|---|
| Webhook node | Bật tuỳ chọn **Raw Body** — payload gốc nằm trong binary data; Code node đọc buffer từ binary để tính HMAC |
| Module `crypto` trong Code node | n8n tự host cần cho phép built-in module (`NODE_FUNCTION_ALLOW_BUILTIN=crypto`). **Kiểm tra trước**; nếu phải thêm biến thì đó là thay đổi cấu hình n8n production — cần xác nhận riêng. Phương án thay thế: node **Crypto** có sẵn của n8n (HMAC SHA256) chạy trên raw body |
| App Secret, verify token | Lưu trong credential n8n, không hard-code trong workflow |
| Lưu execution | Workflow settings: **không lưu** execution thành công và thất bại (hoặc thời hạn rất ngắn). Raw body chứa PSID và nội dung tin nhắn |
| Dữ liệu dùng | Chỉ Page thử nghiệm và tài khoản thử nghiệm |
| Sau Gate 0D | **Xoá** workflow, credential và execution log liên quan; ghi lại việc đã xoá |

### 3.5. Ma trận kiểm thử và evidence

**Ma trận:**

| # | Người nhắn | Chế độ App | `pages_messaging` access | Mục đích | Nhận webhook? | Gửi trả lời? | Echo đúng? |
|---|---|---|---|---|---|---|---|
| 1 | Tài khoản có Role (Tester) | Development | Standard | Baseline phát triển | | | |
| 2 | Tài khoản **không có Role** | Development | Standard | Xác nhận giới hạn | | | |
| 3 | Tài khoản **không có Role** | Live | Standard | **Dòng quyết định Gate 0D** | | | |
| 4 | Nhân viên trả lời từ Meta Business Suite | Live | Standard | Phân biệt echo App với echo nhân viên | — | — | |
| 5 | Tài khoản **không có Role** | Live | **Advanced** | **Acceptance test production** — chạy sau khi được duyệt | | | |

**Evidence bắt buộc cho mỗi lần chạy:**

| Trường | Ghi chú |
|---|---|
| `timestamp` | |
| App mode | Development / Live |
| `pages_messaging` access level | Kèm ảnh chụp App Dashboard |
| Token type | User / System User |
| Token scopes | Theo kết quả `debug_token` |
| Page ID | |
| PSID | Chỉ của tài khoản thử nghiệm |
| Graph API version | |
| Webhook nhận được | Có / không; loại event |
| Kết quả Send API | `message_id` nếu thành công |
| `error.code`, `error.error_subcode`, `error.type`, `error.message` | Nếu lỗi |
| `fbtrace_id` | Nếu lỗi |

**Không lưu:** token, App Secret, nội dung tin nhắn của người không phải tài khoản thử nghiệm.

Kiểm tra thêm: PSID ổn định giữa các lần nhắn; `is_echo` + `app_id` phân biệt được tin App gửi với tin nhân viên gửi từ Business Suite.

### 3.6. Gate 0D — Meta Access

Gate dựa trên **kết quả thực tế** của luồng:

```
Người không có Role → nhắn Page → webhook nhận được? → Send API trả lời thành công?
```

Mã lỗi Graph API chỉ là **bằng chứng chẩn đoán**, không phải tiêu chí quyết định.

| Kết quả dòng 3 | Quyết định |
|---|---|
| **Không** nhận webhook hoặc **không** gửi được *(đúng dự kiến)* | Đánh dấu `META_ACCESS_BLOCKED`, ghi evidence. Nộp **App Review cho `pages_messaging`** (kèm Business Verification nếu Dashboard yêu cầu). Phase 1–5 tiếp tục song song; **pilot chờ duyệt**; sau khi duyệt chạy dòng 5 |
| Nhận **và** gửi được *(ngoài dự kiến)* | **Chưa kết luận.** Xác minh lại tài khoản thử nghiệm **thực sự không có** Role trên App, không phải người dùng tài sản của Business, không có Page task nào. Kiểm tra lại access level trên Dashboard. Chỉ khi xác nhận xong mới kết luận Standard Access đủ, lưu ảnh chụp Dashboard + `message_id` + log |

**Không** cộng cứng số ngày App Review vào dev-day.

## 4. Lỗ hổng chặn khác

### 4.1. Thiếu pha viết characterization test Zalo

Tiêu chí Go của Giai đoạn 1 yêu cầu *"Characterization test Zalo vẫn xanh"*, nhưng không pha nào tạo ra bộ test này.

**Sửa:** Phase 0B — viết test cho nhận tin, gửi tin, gán nhãn, broadcast Zalo.

### 4.2. Xung đột với subsystem Facebook Lead Ads đã có

| Model | Vị trí | Đặc điểm |
|---|---|---|
| `FacebookPageConnection` | `backend/prisma/schema.prisma:3739` | `@@unique([orgId, pageId])`, `accessTokenEnc`, liên kết `FacebookFormMapping` |
| `FacebookAppConfig` | `backend/prisma/schema.prisma:3861` | `orgId @unique`, `appSecretEnc`, `webhookVerifyToken` (**plaintext**), `tokenEncKeyEnc` |
| `WebhookLog` | `backend/prisma/schema.prisma:3608` | `source = 'fb-leadads'`, `externalLeadId @unique` |

Mã xử lý webhook Lead Ads nằm trong `backend/src/_ee` — không có trong worktree.

Meta chỉ cho **một callback URL mỗi App** trên object `page` ⇒ `leadgen` và `messages` về cùng một endpoint.

**Sửa:** `/api/v1/webhooks/meta/{publicAppKey}` là endpoint duy nhất, phân nhánh theo payload:

- `entry[].changes[]` với `field = 'leadgen'` → luồng Lead Ads
- `entry[].messaging[]` → luồng Messenger

Quan hệ dữ liệu: xem mục 5.1.

### 4.3. Mâu thuẫn §3.8 với Giai đoạn 0 — đã giải quyết

Hành vi echo được kiểm nghiệm trong Meta Spike trên Page thử nghiệm. Không cần giữ Chatwoot làm tham chiếu.

---

## 5. Quyết định kiến trúc đã chốt

### 5.1. Một Page — một identity — một nguồn token

**Không** để cùng một Page có hai nguồn token:

```
FacebookPageConnection → token A      ✗
ChannelAccount         → token B      ✗
```

**Thiết kế:**

```
ChannelAccount
  provider   = FACEBOOK_PAGE
  externalId = PAGE_ID
  capabilities: { messenger, leadAds }
      │
      ├── Messenger (Conversation, Message)
      ├── Lead Ads  (FacebookFormMapping)
      └── TokenCredential (duy nhất)
```

- **Page là tài sản.** Lead Ads và Messenger là **capability** của Page, không phải hai integration độc lập.
- `FacebookPageConnection` được migrate sang, hoặc tham chiếu tới, `ChannelAccount`, rồi thay thế dần.
- Vì mã Lead Ads nằm trong `_ee` (vắng), việc chuyển `FacebookFormMapping` sang `ChannelAccount` cần kiểm tra khi có mã; trong lúc chờ, `FacebookPageConnection` giữ khoá ngoại `channelAccountId` và **không được lưu token riêng**.
- Giữ `@@unique([provider, externalId])` toàn cục.

### 5.2. Vòng đời token

System User token phù hợp cho hệ thống nội bộ quản lý tài sản của công ty. Nhưng **"không hết hạn" ≠ "không bị thu hồi"**: token vẫn có thể mất hiệu lực khi quyền trên tài sản thay đổi, App thay đổi, token bị thu hồi hoặc có sự kiện quản trị khác.

**`TokenCredential` giữ các trường:**

| Trường | Mục đích |
|---|---|
| `status` | `active` · `invalid` · `revoked` |
| `version` | Xoay khoá / thay token |
| `lastValidatedAt` | Lần health check thành công gần nhất |
| `invalidatedAt` | Thời điểm phát hiện token hỏng |
| `lastError` | Mã lỗi Graph API gần nhất (không lưu token) |

**Bỏ:** scheduler refresh 60 ngày.
**Giữ:**

- Health check định kỳ (ví dụ mỗi giờ gọi `GET /debug_token` hoặc `GET /{page-id}?fields=id`).
- Lỗi 190 từ bất kỳ lệnh gọi nào ⇒ `status = invalid`, dừng outbound của Page, cảnh báo admin.
- **Runbook "token mất hiệu lực"**: kiểm tra quyền System User trên Page và App → phát hành token mới → cập nhật qua màn hình cài đặt → xác nhận health check → xử lý lại `OutboundCommand` bị giữ.

### 5.3. `MessagingPolicyEngine` độc lập

Không rải điều kiện `if (24h) …` trong sender. Luồng gửi:

```
AI / Nhân viên
      ↓
SendRequest
      ↓
MessagingPolicyEngine   → allow | allowWithTag(HUMAN_AGENT) | humanOnly | deny
      ↓
OutboundCommand
      ↓
MetaSender
```

**Quy tắc ban đầu:**

| Điều kiện | Kết quả |
|---|---|
| Tin cuối của khách trong 24 giờ | `allow` — AI và nhân viên đều gửi được (AI tự gửi chỉ bật ở Phase 7) |
| 24 giờ – 7 ngày | `humanOnly` + tag `HUMAN_AGENT` — **chỉ nhân viên gửi thủ công** |
| Quá 7 ngày | `deny` |
| Tag đã bị Meta khai tử (`CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE`) | `deny` |

Policy Engine có interface riêng và bộ test riêng, để thêm Instagram, WhatsApp hoặc quy tắc mới mà không sửa sender.

### 5.4. Hồ sơ khách hàng: gộp thủ công, không tự động

```
Contact
├── ContactIdentity (Zalo)
└── ContactIdentity (Facebook PSID)
```

- Nhân viên **xác nhận** hai identity là cùng một người ⇒ gộp.
- **Không** tự động gộp dựa trên tên hoặc số điện thoại chưa xác thực.

**`ContactMergeAudit`:**

| Trường | Ghi chú |
|---|---|
| `sourceContactId` | Contact bị gộp |
| `targetContactId` | Contact giữ lại |
| `mergedBy` | Người thực hiện |
| `mergedAt` | Thời điểm |
| `snapshot` | JSON trạng thái trước khi gộp — dùng để **undo** |
| `undoneAt`, `undoneBy` | Khi hoàn tác |

---

## 6. Thiếu sót thiết kế cần sửa

### 6.1. Verify token và endpoint GET

`FacebookAppConfig.webhookVerifyToken` lưu **plaintext**. **Sửa:** mã hoá như `appSecretEnc`, so sánh timing-safe, GET và POST cùng path `{publicAppKey}`.

### 6.2. Hai tên biến mã hoá token

| File | Biến | Production |
|---|---|---|
| `backend/src/shared/crypto/aes-gcm.ts:16` | `FB_TOKEN_ENC_KEY` | **VẮNG** |
| `backend/src/modules/integrations/_shared/token-encryption.util.ts:22` | `TOKEN_ENCRYPTION_KEY` | Có |

**Sửa (Phase 0A):** thống nhất một tên; ứng dụng không khởi động nếu thiếu.

### 6.3. `Message.orgId`

Thêm và backfill ~46.000 dòng trong migration Phase 1, cùng lúc với `platformMessageId`.

### 6.4. Đặt tên XOR constraint

```sql
ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_xor
  CHECK (num_nonnulls(zalo_account_id, channel_account_id) = 1);
```

Constraint này sẽ phải drop khi Zalo chuyển sang `ChannelAccount` về sau.

### 6.5. Đo "0 mất tin"

Job đối soát hằng ngày trong pilot:

1. `GET /{page-id}/conversations?fields=message_count,updated_time`
2. So số tin theo từng thread với DB.
3. Lệch khác 0 ⇒ cảnh báo.

### 6.6. Bảng mã lỗi Graph API

Mỗi lỗi Graph API được lưu đủ cấu trúc, **không chỉ mã lỗi**:

```
GraphApiError
├── code
├── error_subcode
├── type
├── message
└── fbtrace_id
```

Meta có thể đổi wording hoặc subcode; phân loại phải dựa trên **tổ hợp** các trường, và trường hợp không khớp quy tắc nào được đưa vào nhóm "chưa phân loại" để người xem xét, **không** tự động gán ý nghĩa.

| Tình huống | Ý nghĩa | Hành động |
|---|---|---|
| 190 | Token hết hạn / bị thu hồi | `TokenCredential.status = invalid`, dừng outbound Page, cảnh báo, chạy runbook |
| 10 / 200 **và** `message` liên quan permission / access | Thiếu quyền truy cập | Không retry. Trong Spike: đánh dấu `META_ACCESS_BLOCKED`, ghi evidence vào Gate 0D. Trong production: `ACCESS_BLOCKED` — token giữ ACTIVE nếu `debug_token` hợp lệ, tắt outbound Page, cảnh báo admin (TRIEN-KHAI §7.8) |
| Read timeout / mất kết nối **sau khi** đã gửi request | Không biết tin đã tới chưa (Send API không có idempotency key) | `UNKNOWN_DELIVERY`, không retry tự động; reconcile trước (TRIEN-KHAI §7.3.1) |
| 10 / 200 nhưng `message` khác | Chưa rõ | Phân loại riêng, không retry mù. **Không** tự kết luận cần App Review |
| 613 | Rate limit | Backoff rồi thử lại |
| 551 | Người dùng không nhận được tin | Không retry, đánh dấu hội thoại |
| 100 + subcode 2018001 | Tag đã bị khai tử | Lỗi cấu hình, không retry |
| Thành công với người không có Role (Spike) | — | Lưu ảnh chụp Dashboard + `message_id` + log; áp dụng kiểm tra "ngoài dự kiến" ở mục 3.6 |

### 6.7. Rollback

- Tắt outbound ⇒ `OutboundCommand` đang `pending` chuyển `abandoned`.
- Media job đang chạy: huỷ hoặc để hoàn tất có kiểm soát.

### 6.8. Điểm không quay lại của schema

Sau tin Messenger đầu tiên được ghi, `zaloAccountId` không thể quay lại NOT NULL:

> Rollback = rollback ứng dụng + tắt cờ. **Không rollback schema.**

---

## 7. Những gì không được cắt

- Cửa sổ 24 giờ và quy tắc `HUMAN_AGENT` (nhân viên trả lời thủ công, tối đa 7 ngày).
- AI không tự gửi khi policy = `humanOnly`.
- Xác minh HMAC-SHA256 fail-closed trên **raw body** — kể cả trong Spike n8n; không bao giờ tính trên JSON đã serialize lại.
- Tách 4 khái niệm dedup; `message` và `echo` khác namespace.
- Dispatcher bền vững PostgreSQL → BullMQ.
- Chống SSRF cho bộ tải media.
- Quản lý vòng đời token (mục 5.2).
- Backup tự động.

---

## 8. Lộ trình

| Phase | Việc thực hiện | Gate | Dev-day |
|---|---|---|---:|
| **0A — Safety** | Backup tự động DB + media + off-site + khôi phục thử · thống nhất biến mã hoá token · gỡ Chatwoot | Khôi phục thử thành công | 1–2 |
| **0B — Regression** | Characterization test Zalo | Test xanh | 3–5 |
| **0C — Meta Spike** | Meta App + System User (có Page task) + `debug_token` + endpoint n8n raw-body HMAC + inbound/outbound (mục 3.3–3.5) | Ma trận dòng 1–4 đã điền đủ evidence | 2–3 |
| **0D — Meta Access** | Kết luận theo mục 3.6 · nộp App Review cho `pages_messaging` (working assumption: cần) · dọn workflow/credential/log Spike | Đã nộp review, hoặc đã xác minh "ngoài dự kiến" rằng Standard đủ | *dependency* |
| **1 — Schema** | `ChannelAccount`, `TokenCredential`, `ContactIdentity`, `ContactMergeAudit`, `WebhookDelivery`, `ChannelEvent`, `OutboundCommand` · XOR có tên · `Message.orgId` + `platformMessageId` · liên kết `FacebookPageConnection` | Migration + rollback test trên bản sao DB | 2–4 |
| **2 — Inbound** | Webhook duy nhất → HMAC → dedup → Conversation/Message · phân nhánh leadgen/messaging | Không mất, không trùng | 3–5 |
| **3 — Outbound** | Outbox + dispatcher + `MessagingPolicyEngine` + `MetaSender` · bảng mã lỗi · health check token | Delivery/read/echo đúng | 5–8 |
| **4 — Media / Hardening** | Media + chống SSRF + MinIO · TTL webhook thô · redact log · observability | Security test đạt | 4–6 |
| **5 — Unified inbox** | Lọc Zalo/Messenger, phân công, nhãn, gộp contact thủ công | Zalo regression xanh | 2–4 |
| **6 — Pilot** | Chạy ma trận dòng 5 (acceptance) · 1 Page, 14 ngày, AI chỉ gợi ý, job đối soát hằng ngày | Dòng 5 đạt · 14 ngày đối soát sạch | 1–2 |
| **7 — AI** | AI tự gửi trong phạm vi policy cho phép | Sau pilot | *ước lượng riêng* |
| | **Engineering (0A–6)** | | **23–39** |

**Ghi chú:**

- **Meta Spike chạy trước migration schema.** Nếu thất bại vì quyền Meta, chưa tốn 20–30 dev-day sửa CRM.
- Phase 1–5 **làm được song song** khi đang chờ Meta duyệt, trên Page thử nghiệm với tài khoản có Role. Hồ sơ App Review (use case, screencast, chính sách quyền riêng tư) chuẩn bị song song.
- **Phase 6 với khách thật chỉ bắt đầu khi Meta access đã được xác nhận.**
- Lịch thực tế với một dev vừa phát triển vừa vận hành (~60 % công suất): **1,5–3 tháng engineering**. Meta approval là **dependency riêng** — theo working assumption, dự kiến nằm trên critical path của pilot.
- Thứ tự tiếp theo: **0A → 0B → 0C**, ghi kết quả thực tế vào ma trận mục 3.5 **trước khi mở PR schema Messenger**.

---

## 9. Backup tự động — mẫu có sẵn trên VPS

Stack `voi-crm` đã chạy backup bằng `voi-crm-backup`:

| Tham số | Giá trị |
|---|---|
| Image | `prodrigestivill/postgres-backup-local` |
| `SCHEDULE` | `@daily` |
| `BACKUP_KEEP_DAYS` / `WEEKS` / `MONTHS` | 7 / 4 / 3 |
| `TZ` | `Asia/Ho_Chi_Minh` |
| `VALIDATE_ON_START` | `TRUE` |
| `POSTGRES_EXTRA_OPTS` | `-Z1` |

ZaloCRM (`zalo-crm-db`) **chưa có** — bản backup duy nhất có ngày 22-07-2026.

**Đề xuất:** sao chép khối service sang compose của ZaloCRM, đổi host/DB/user/thư mục ghi. Bổ sung:

- Backup volume media `zalocrm-corepviet_file_storage`.
- Đẩy một bản ra ngoài VPS.
- Khôi phục thử và ghi lại RTO.

---

## 10. Gỡ bỏ Chatwoot

### 10.1. Hiện trạng (01-09-2026)

| Hạng mục | Giá trị |
|---|---|
| Container | `chatwoot-rails`, `chatwoot-sidekiq`, `chatwoot-postgres`, `chatwoot-redis` |
| RAM | ≈ **1,08 GB** |
| Volume | `chatwoot_postgres` 74 MB · `chatwoot_redis` 212 KB · `chatwoot_storage` 8 KB |
| Image riêng | `chatwoot/chatwoot:v4.16.2` 2,85 GB · `pgvector/pgvector:pg16` |
| Caddy | `/opt/n8n/Caddyfile` dòng 9–11: `chat.corepviet.com` |

**Dữ liệu:** `inboxes`, `conversations`, `messages`, `contacts`, `channel_facebook_pages` đều **0**. Không có dữ liệu nghiệp vụ.

### 10.2. Backup đã thực hiện

`/opt/backups/chatwoot-truoc-khi-go-20260901-075816.tgz` — 56 KB, quyền `600`, gồm `chatwoot.dump`, `docker-compose.yaml`, `env.bak`, `storage.tgz`. Đã kiểm tra đọc được.

### 10.3. Các bước gỡ — **CHƯA THỰC HIỆN, chờ chủ dự án xác nhận**

1. `docker compose -f /opt/chatwoot/docker-compose.yaml down -v`
2. Xoá image `chatwoot/chatwoot:v4.16.2` và `pgvector/pgvector:pg16`. **Giữ `redis:7-alpine`** (đang dùng chung).
3. Gỡ khối `chat.corepviet.com` khỏi `/opt/n8n/Caddyfile`, reload Caddy.
4. Xoá `/opt/chatwoot/`.
5. *(Chủ dự án tự làm)* Xoá bản ghi DNS `chat.corepviet.com`.

**Thu hồi:** ~1,08 GB RAM · ~2,9 GB đĩa.

---

## 11. Checklist bổ sung trước production

- [ ] Backup tự động DB + media đang chạy; có bản off-site; đã khôi phục thử.
- [ ] Characterization test Zalo xanh trước Phase 1.
- [ ] **Ma trận Meta Spike đã điền đủ, có bằng chứng.**
- [ ] **Gate 0D đã kết luận; nếu cần App Review thì đã được duyệt và dòng 5 ma trận đạt.**
- [ ] Access level của `pages_messaging` trên App Dashboard đã lưu bằng ảnh chụp / evidence.
- [ ] Token đã kiểm tra bằng Access Token Debugger / `debug_token`: đúng App ID, scopes và Page asset.
- [ ] System User được gán đúng **Page task** trên asset, không chỉ có permission trên token.
- [ ] `HUMAN_AGENT` được kiểm thử riêng trên Meta thật nếu Phase 3 thực sự gửi ngoài cửa sổ 24 giờ.
- [ ] Workflow n8n Meta Spike, credential và execution data đã xoá / vô hiệu hoá sau Gate 0D.
- [ ] Chỉ còn một biến mã hoá token; thiếu biến thì ứng dụng không khởi động.
- [ ] Một endpoint webhook duy nhất, phân nhánh đúng `leadgen` / `messaging`.
- [ ] Mỗi Page chỉ có một `ChannelAccount` và một `TokenCredential`.
- [ ] GET verification hoạt động; verify token được mã hoá, so sánh timing-safe.
- [ ] Health check token định kỳ; runbook "token mất hiệu lực" đã viết và diễn tập.
- [ ] `MessagingPolicyEngine` có bộ test riêng cho 24 giờ / `HUMAN_AGENT` / quá 7 ngày / tag khai tử.
- [ ] `Message.orgId` đã backfill; XOR constraint tên `conversations_channel_xor`.
- [ ] Bảng mã lỗi Graph API đã cài đặt.
- [ ] Job đối soát số tin chạy hằng ngày trong pilot.
- [ ] Tắt outbound ⇒ `OutboundCommand` pending chuyển `abandoned`.
- [ ] Runbook ghi rõ điểm không quay lại của schema.
- [ ] Gộp contact thủ công có `ContactMergeAudit` và undo đã kiểm thử; không có gộp tự động.
- [ ] Chatwoot đã gỡ; Caddy không còn `chat.corepviet.com`.

---

## 12. Kết luận

Dự án **nên triển khai**. Bỏ Chatwoot và tích hợp Messenger native vào ZaloCRM phù hợp hơn với mục tiêu CRM đa kênh có AI. Kiến trúc đủ tốt làm nền cho Zalo → Messenger → Instagram / WhatsApp nhờ `ChannelAccount`, `ContactIdentity`, event/outbox và policy layer.

| Hạng mục | Trạng thái |
|---|---|
| Kiến trúc tổng thể | Tốt, có thể triển khai — không cần thiết kế lại |
| Phase 0A — Backup | **GO ngay** |
| Phase 0B — Zalo regression | **GO** |
| Phase 0C — Meta Spike bằng n8n | **GO** |
| Phase 0D | Working assumption: **cần Advanced Access**; Spike xác nhận |
| Phase 1–5 | GO sau gate kỹ thuật Phase 0 |
| Pilot với khách thật | **CHƯA GO** — đến khi Meta access được xác nhận |
| AI tự gửi | Sau pilot |
| Engineering 23–39 dev-day | Hợp lý |
| Meta approval | Dependency riêng |

Tài liệu này đủ để dùng làm tài liệu điều hành triển khai. Khi Meta access được xác nhận, chuyển sang từng PR theo phase.

---

## 13. Quyết định cần chủ dự án xác nhận

| # | Quyết định | Khuyến nghị |
|---|---|---|
| 1 | Chạy các bước gỡ Chatwoot (mục 10.3) | Gỡ — backup đã có, không có dữ liệu thật |
| 2 | Thêm backup tự động cho ZaloCRM theo mẫu `voi-crm-backup` | Làm ngay, trước mọi việc khác |
| 3 | Page và tài khoản dùng cho Meta Spike | Một Page thử nghiệm riêng + ít nhất một tài khoản Facebook **không có Role** trên App |
| 4 | Cách tính HMAC trong n8n nếu module `crypto` chưa được phép trong Code node | Dùng node Crypto có sẵn trước; chỉ thêm `NODE_FUNCTION_ALLOW_BUILTIN` (restart n8n) khi thật cần và được xác nhận |
| 5 | Page cho pilot 14 ngày | Một Page nội bộ có lưu lượng tin vừa phải |
