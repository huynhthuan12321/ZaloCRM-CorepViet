# Biên bản triển khai nền TikTok TT00–TT10 lên production

Ngày triển khai: 13/10/2026  
VPS: `157.66.219.190`  
Commit triển khai: `717a50fbdb013cb775d56a4ea1b2d74621d2a9eb`

## Kết luận

**ROLLOUT PASS WITH OBSERVATIONS.**

Image mới đang chạy healthy trên production. Database và Redis connected. Toàn bộ cờ TikTok Personal, media, AI tự gửi và mock connector vẫn tắt. Không kết nối tài khoản TikTok thật và không mở capability live.

Phần migration TT04 đã hoàn tất: 66.962 tin nhắn được backfill tenant, không còn `org_id` NULL hoặc lệch với hội thoại, composite foreign key đã validate và `messages.org_id` đã `NOT NULL`.

Prisma diff toàn database còn 7 khác biệt cũ ngoài phạm vi TikTok. Không tự áp SQL đồng bộ vì script gồm thao tác xóa index và foreign key trên các bảng CRM hiện hữu. Các khác biệt này cần một phiên review/migration riêng.

## Backup trước triển khai

Backup database tương thích PostgreSQL 16:

```text
/root/ZaloCRM-CorepViet/backups/manual/pre-tt10-20261013-204029-pg16.sql.gz
```

- Gzip test: PASS
- SHA256: PASS
- Restore độc lập bằng PostgreSQL 16: PASS
- Restore RTO: 15 giây
- Dữ liệu tại thời điểm backup: 127 migrations, 1 organization, 1.696 contacts, 656 conversations, 66.947 messages

Backup media:

```text
/opt/backups/zalocrm-media/file_storage-20261013-204058.tar
```

- 7.267 file
- Có checksum
- Kiểm tra: PASS

Backup service hiện có dùng `pg_dump 18` trong khi production chạy PostgreSQL `16.15`. Dump đó chứa `SET transaction_timeout` và không restore được bằng PG16. Bản backup thủ công nêu trên được tạo bằng `pg_dump 16` trong DB container và đã restore thử thành công. Cần sửa image/cấu hình backup service trong công việc vận hành riêng.

## Dung lượng và image

Trước dọn build cache:

```text
/dev/vda1  79G  69G  6.3G  92%
Build Cache: 16.78GB
```

Sau `docker builder prune -af`:

```text
/dev/vda1  79G  56G  20G  75%
Build Cache: 0B
```

Image đang chạy:

```text
zalocrm-corepviet-app:717a50f
sha256:0fac8ac2c79502dc0ec9b61d54d2693f15bee2af19a4b5adf79d12e597408885
```

Image rollback được giữ:

```text
zalocrm-corepviet-app:bf31cdf
sha256:b51fd0bfb9112ab2f0398c74b8d2c513666f22af2f048a50d64e33be166a82c2
```

## Cờ production

Các giá trị sau đã được xác nhận trong `/root/ZaloCRM-CorepViet/.env`; file có mode `600`:

```env
CHANNELS_ENABLED=false
TIKTOK_PERSONAL_ENABLED=false
TIKTOK_PERSONAL_INBOUND_ENABLED=false
TIKTOK_PERSONAL_OUTBOUND_ENABLED=false
TIKTOK_MEDIA_ENABLED=false
TIKTOK_AI_AUTO_SEND_ENABLED=false
MOCK_CHANNEL_ENABLED=false
```

## Migration và backfill

`prisma migrate deploy` áp dụng thành công:

```text
20261013170000_multichannel_expand
20261013180000_multichannel_nullable
```

Trạng thái sau migration:

```text
129 migrations found
Database schema is up to date
```

Backfill:

```json
{"mode":"dry-run","changed":0,"remaining":66962,"invalid":0}
{"mode":"apply","changed":66962,"remaining":0,"invalid":0}
{"mode":"dry-run","changed":0,"remaining":0,"invalid":0}
```

D2:

```text
NULL messages.org_id: 0
Tenant mismatch: 0
messages_org_id_conversation_id_fkey: validated
messages.org_id: NOT NULL
```

## Schema drift ngoài phạm vi TikTok

`prisma migrate diff --exit-code` báo các khác biệt sau:

- `automation_triggers.welcome_delay_seconds`: default DB là `60`, schema là `1`.
- `contacts`: index DB có thêm `created_at`; schema không có cột này trong index.
- `knowledge_docs`: DB còn foreign key `org_id`; schema không khai báo.
- `lead_notify_acks.updated_at`: DB có default `now()`, schema không khai báo.
- `lead_pool_distributions`: tên index khác schema.
- `media_assets.source_zalo_account_id`: schema khai báo foreign key chưa có trong DB.
- `zalo_accounts`: DB còn index `(org_id, archived_at)`; schema không khai báo.

Không áp tự động diff này trong phiên TikTok vì có `DROP INDEX` và `DROP FOREIGN KEY`. Cần xác định chủ đích từng thay đổi, đo query plan/lock và viết migration riêng.

## Kết quả rollout

Container:

```text
name: zalo-crm-app
image: sha256:0fac8ac2c79502dc0ec9b61d54d2693f15bee2af19a4b5adf79d12e597408885
status: running
health: healthy
port: 172.17.0.1:3080->3000/tcp
```

Health nội bộ và public:

```json
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "messenger": {
    "status": "disabled",
    "inbound": false,
    "outbound": false
  },
  "tiktok": {
    "status": "disabled",
    "inbound": false,
    "outbound": false
  }
}
```

Smoke test không ghi dữ liệu:

- Frontend public: HTTP `200`.
- `/api/v1/channel-accounts` không có đăng nhập: HTTP `401`.
- Worker pilot khi mock tắt: HTTP `404`.
- Organizations: 1.
- Contacts: 1.696.
- Conversations: 656.
- Messages sau rollout: 66.962.
- Messages thiếu tenant: 0.
- Channel accounts: 0.
- Hai Zalo listener kết nối lại thành công.
- Container app dùng khoảng 383 MiB RAM khi kiểm tra.

Chưa thực hiện smoke test gửi tin Zalo vì chưa có hội thoại/người nhận thử được chỉ định trong phiên deploy. Công cụ UI không cung cấp trình duyệt để kiểm tra giao diện bằng phiên đăng nhập.

## Quan sát log

Ứng dụng khởi động đầy đủ, DB/Redis và hai Zalo listener kết nối. Có các log cần theo dõi:

- `getFriendOnlines` của hai tài khoản Zalo trả HTTP 404 theo chu kỳ. Luồng listener và đồng bộ bạn bè vẫn chạy.
- Một lỗi unique `(org_id, phone_normalized)` xuất hiện trong friend sync; `safe-contact-write` đã bỏ hai field trùng và giữ phần cập nhật còn lại. Job kết thúc với `errors=0`.

Không thấy `fatal`, `panic`, `unhandled` hoặc `uncaught` trong log sau rollout.

## Rollback ứng dụng

Schema mới là additive và đã backfill; không down-migrate trong rollback ứng dụng.

```bash
cd /root/ZaloCRM-CorepViet
docker tag zalocrm-corepviet-app:bf31cdf zalocrm-corepviet-app:latest
docker compose up -d --no-deps --no-build app
docker inspect zalo-crm-app --format \
  'image={{.Image}} status={{.State.Status}} health={{.State.Health.Status}}'
curl -fsS http://172.17.0.1:3080/health/ready
```

Sau khi rollback, giữ nguyên hai migration mới và `messages.org_id NOT NULL`; trigger tương thích trong migration bảo vệ writer cũ.

## Việc vận hành còn lại

1. Kiểm tra bằng giao diện với tài khoản CRM thật: danh sách hội thoại, mở hội thoại cũ, AI Suggestion nếu đang dùng.
2. Chỉ gửi/nhận một tin Zalo sau khi có hội thoại thử và người nhận đồng ý.
3. Sửa backup service để dùng `pg_dump` cùng major version PostgreSQL production.
4. Review và xử lý 7 schema drift trong migration riêng.
5. Điều tra `getFriendOnlines` HTTP 404 nếu tính năng online status đang được sử dụng.
6. MinIO vẫn public qua `0.0.0.0:9000`; xử lý trong gói hardening riêng.
