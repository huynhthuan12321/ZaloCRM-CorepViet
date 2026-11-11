# PROMPT Meta Spike — Xác nhận webhook + Graph API trước khi viết schema

> Copy toàn bộ prompt này vào session AI mới để thực hiện Meta Spike.
> Meta Spike là track riêng, chạy SONG SONG với D1, KHÔNG ĐỤNG REPO.

---

## BỐI CẢNH DỰ ÁN

- **Hệ thống:** ZaloCRM Cờ Rếp Việt (KHÔNG phải VoiCRM)
- **VPS:** 157.66.219.190 (Ubuntu 22.04)
- **n8n:** đang chạy trên VPS, port 5678 (loopback only, qua Caddy reverse proxy)
- **SSH:** `ssh -i ~/.ssh/zalocrm_ops -o BatchMode=yes root@157.66.219.190 '<lệnh>'`
- **Tài liệu kiến trúc:** `docs/RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md` (§3.3–§3.6)
- **Tài liệu triển khai:** `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md` (§17)

## RÀNG BUỘC BẮT BUỘC

1. Không deploy/migration/restart/recreate ZaloCRM nếu chưa được duyệt
2. Không đọc/in `.env`, token, password, secret
3. Meta Spike **KHÔNG ĐỤNG REPO** — chỉ dùng n8n workflow tạm
4. Nếu n8n cần `NODE_FUNCTION_ALLOW_BUILTIN=crypto` → **DỪNG**, ghi COMMAND REQUIRES APPROVAL (restart n8n)
5. **Không lưu execution** trong n8n (tắt "Save Execution" trên workflow)
6. Kết quả bảng lỗi **KHÔNG kèm token/PSID/secret** — chỉ code/subcode/type/message (redacted)
7. **Spike thất bại = DỪNG dự án ở D1.** Không viết schema, không deploy migration

## MỤC ĐÍCH

Xác nhận 5 điều **TRƯỚC KHI** viết bất kỳ schema migration nào (PR-02a):

1. Webhook GET verify hoạt động
2. Webhook POST + HMAC verify hoạt động
3. Inbound message nhận được (có/không Role)
4. Outbound message gửi được qua Graph API
5. Graph API version v21.0 còn hạn

## THÔNG TIN CẦN TỪ CHỦ DỰ ÁN (HỎI TRƯỚC KHI BẮT ĐẦU)

```
Hỏi chủ dự án cung cấp (AI KHÔNG TỰ TÌM):
- FB App ID
- Page ID
- PSID tài khoản test 1 (có Role trên App)
- PSID tài khoản test 2 (KHÔNG có Role — để verify Standard vs Advanced)
- Graph API version đang dùng (hiện tại: v21.0)

Chủ dự án TỰ NHẬP vào n8n credential (AI KHÔNG đọc):
- FB App Secret
- Page Access Token (System User token, không hết hạn)
- Webhook Verify Token (≥16 ký tự, chủ dự án tự chọn)
```

## QUY TRÌNH THỰC HIỆN

### Bước 1: Đọc tài liệu thiết kế spike

```
Đọc docs/RA-SOAT-PHUONG-AN-MESSENGER-NATIVE.md §3.3–§3.6:
- §3.3: Thiết kế n8n endpoint tạm
- §3.4: Test cases cần chạy
- §3.5: Bảng kết quả mẫu
- §3.6: Điều kiện PASS/FAIL

Đọc docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md §17:
- Bảng phụ thuộc Meta
- Ràng buộc production cho spike
```

### Bước 2: Tạo n8n workflow tạm

```
Workflow gồm:
A. Webhook node (GET + POST):
   - Path: chọn random, không dùng path production
   - Raw Body: ON (bắt buộc cho HMAC)
   - Response Mode: "When Last Node Finishes"

B. Router/IF node:
   - GET (hub.mode=subscribe) → Verify flow
   - POST → HMAC verify flow

C. GET Verify flow:
   - Code node: so sánh hub.verify_token (timing-safe nếu crypto available)
   - Đúng → respond hub.challenge (text/plain)
   - Sai → respond 403

D. POST HMAC Verify flow:
   - Crypto node hoặc Code node: HMAC-SHA256(app_secret, rawBody)
   - So sánh với header X-Hub-Signature-256 (sha256=...)
   - Đúng → parse JSON → log kind (messaging/leadgen/unknown)
   - Sai → respond 401

E. Outbound test node:
   - HTTP Request node: POST https://graph.facebook.com/v21.0/{page-id}/messages
   - Header: Authorization: Bearer {page_access_token}
   - Body: {"recipient":{"id":"PSID"},"message":{"text":"test"}}
   - Chạy thủ công (không trigger tự động)

⚠️ Tắt "Save Successful Execution" và "Save Failed Execution" trên workflow.
```

### Bước 3: Đăng ký webhook tạm trên Meta Developer Dashboard

```
Chủ dự án tự làm (AI hướng dẫn):
- Meta Developer Dashboard → App → Webhooks
- Callback URL: https://<n8n-domain>/<webhook-path>
- Verify Token: giá trị đã nhập ở Bước 0
- Subscribe: messages, messaging_postbacks (tối thiểu)

AI verify: GET verify thành công (Meta gửi challenge, n8n trả đúng)
```

### Bước 4: Chạy test cases

```
TEST 1 — Webhook GET Verify:
- Expected: Meta gửi GET → n8n trả hub.challenge → subscription thành công
- PASS/FAIL: ___

TEST 2 — Webhook POST + HMAC:
- Gửi tin từ tài khoản test 1 (có Role) tới Page
- Expected: n8n nhận POST, HMAC verify OK, parse payload messaging
- Ghi lại: có field nào, structure messaging[].sender.id / message.mid / message.text
- PASS/FAIL: ___

TEST 3 — HMAC sai:
- Thay đổi 1 byte trong logic verify (hoặc test với secret sai)
- Expected: verify fail → 401
- PASS/FAIL: ___

TEST 4 — Inbound từ tài khoản KHÔNG có Role:
- Gửi tin từ tài khoản test 2 (không Role) tới Page
- Nếu NHẬN ĐƯỢC tin: QUAN TRỌNG — xác minh bằng tài khoản thứ 3 không Role
  (Nếu Standard Access chỉ cho phép Role users, đây là kết quả "bất ngờ")
- PASS/FAIL: ___
- Ghi nhận: Standard Access cho phép / không cho phép non-Role users

TEST 5 — Outbound trong 24h:
- Chạy HTTP Request node thủ công: gửi text tới PSID test 1
- Expected: 200, tin đến tài khoản test
- PASS/FAIL: ___

TEST 6 — Outbound token thu hồi (staging/giả lập):
- Dùng token sai hoặc hết hạn
- Expected: lỗi Graph API
- GHI LẠI: {"code":___, "subcode":___, "type":"___", "message":"___"} (redacted)
- Dự kiến: code=190 → TOKEN_INVALID

TEST 7 — Outbound thiếu quyền:
- Dùng token không có pages_messaging permission
- GHI LẠI: {"code":___, "subcode":___, "type":"___", "message":"___"}
- Dự kiến: code=10 hoặc 200 → ACCESS_BLOCKED

TEST 8 — Outbound ngoài 24h:
- Gửi tới PSID chưa nhắn tin trong 24h (nếu có thể test)
- GHI LẠI: {"code":___, "subcode":___, "type":"___", "message":"___"}

TEST 9 — Graph API version:
- GET https://graph.facebook.com/v21.0/debug_token?input_token={token}&access_token={app_token}
- Hoặc kiểm tra Meta changelog: v21.0 hết hạn ngày nào
- GHI LẠI: expires_at, ngày hết hạn version
```

### Bước 5: Tổng hợp kết quả

```
BẢNG KẾT QUẢ META SPIKE
========================
| # | Test Case                        | PASS/FAIL | Chi tiết |
|---|----------------------------------|-----------|----------|
| 1 | GET Verify                       |           |          |
| 2 | POST HMAC OK                     |           |          |
| 3 | POST HMAC sai → 401              |           |          |
| 4 | Inbound có Role                  |           |          |
| 5 | Inbound KHÔNG Role               |           | Standard/Advanced? |
| 6 | Outbound text 24h                |           |          |
| 7 | Token thu hồi                    |           | code/subcode |
| 8 | Thiếu quyền                      |           | code/subcode |
| 9 | Ngoài 24h                        |           | code/subcode |
| 10| Graph v21.0 hạn                  |           | ngày hết hạn |

BẢNG LỖI GRAPH API THỰC TẾ (đầu vào bắt buộc cho PR-04)
=========================================================
| Case              | code | subcode | type           | message (redacted) |
|--------------------|------|---------|----------------|--------------------|
| Token thu hồi      |      |         |                |                    |
| Thiếu quyền        |      |         |                |                    |
| Non-Role user      |      |         |                |                    |
| Ngoài 24h          |      |         |                |                    |

KẾT LUẬN
=========
- [ ] Spike PASS → mở PR-02a (kết hợp: PR-01 merge + Gate §11 đầy đủ)
- [ ] Spike FAIL (META_ACCESS_BLOCKED) → DỪNG dự án ở D1
- [ ] Standard Access đủ / cần Advanced Access
```

### Bước 6: Dọn dẹp

```
Sau khi gate xong:
- Xoá workflow tạm trên n8n
- Xoá webhook subscription tạm trên Meta Developer Dashboard (hoặc để nó, sẽ thay bằng endpoint production)
- Xoá credential tạm trên n8n
- Kết quả bảng lỗi lưu vào docs/ (commit vào repo)
```

## ĐIỀU KIỆN TIẾN LÊN PR-02a

Cần đồng thời TẤT CẢ:
1. ✅ PR-01 đã merge vào main
2. ✅ Meta Spike PASS (prompt này)
3. ✅ D1 PASS (deploy PR-00+PR-01 lên production — xem PROMPT-D1)
4. ✅ Gate §11 đầy đủ: backup DB + media + off-site + restore test OK + RPO/RTO ghi nhận
