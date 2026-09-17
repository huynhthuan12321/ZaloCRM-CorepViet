# Runbook — Backup & Restore ZaloCRM (PostgreSQL + media)

> Nguồn gốc: PR-00 Messenger Native (2026-09-16). Chi tiết bối cảnh: `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md` §11.
>
> **Mọi lệnh ghi trên VPS production trong file này đều là COMMAND REQUIRES APPROVAL.**
> Người chạy phải có duyệt của chủ hệ thống cho từng lần. Không in nội dung dump, không in `.env`.

## 0. Trạng thái đã kiểm chứng (read-only)

| Ngày | Số file `*.sql.gz` trong `/root/ZaloCRM-CorepViet/backups` | Media backup | Off-site | Restore test |
|---|---|---|---|---|
| 2026-09-16 | **0** | Không | Không | Chưa từng |
| 2026-09-17 | Có dump tự động theo audit v1.2 | Chưa | Chưa | Chưa |

⇒ **Backup gate: FAIL.** Không chạy `prisma migrate deploy` trên production cho tới khi mục 5 PASS.

## 1. Thành phần

| Dữ liệu | Nơi lưu | Cơ chế hiện có |
|---|---|---|
| PostgreSQL `zalocrm` | volume của `zalo-crm-db` | service `backup` (`prodrigestivill/postgres-backup-local`), `@daily` 00:00 giờ VN, giữ 7/4/3, thư mục `./backups/{daily,weekly,monthly,last}` |
| Media upload | volume `zalocrm-corepviet_file_storage` | **Không có** |
| `.env` production | `/root/ZaloCRM-CorepViet/.env` | **Không có** — phải lưu bản sao mã hoá ngoài VPS (chứa ENCRYPTION_KEY / TOKEN_ENCRYPTION_KEY; mất khoá = mất dữ liệu đã mã hoá) |
| Redis | volume redis (AOF) | Không cần backup lâu dài: hàng đợi tái tạo được; outbox Messenger nằm trong PostgreSQL |

## 2. Kiểm tra (read-only — được phép)

```bash
cd /root/ZaloCRM-CorepViet
find backups -type f -name '*.sql.gz' | wc -l
ls -la backups/last/
gzip -t backups/last/*-latest.sql.gz && echo GZIP_OK
docker ps --format '{{.Names}} {{.Status}}' | grep zalo-crm-backup
df -h /
```

## 3. Backup thủ công — COMMAND REQUIRES APPROVAL

| ID | Lệnh | Lý do | Ảnh hưởng |
|---|---|---|---|
| B-1 | `docker exec zalo-crm-backup /backup.sh` | Tạo dump ngay, không chờ 00:00 | Tải đọc DB ngắn; thêm ~vài chục MB (nén) |
| B-2 | `scripts/ops/backup-media.sh` | Backup media, đếm file trong tar, ghi checksum với tên file tương đối | Dùng ~dung lượng volume; script dừng nếu disk dự kiến > 80% |

Xác minh sau B-1/B-2:

```bash
gzip -t /root/ZaloCRM-CorepViet/backups/last/*.sql.gz && echo GZIP_OK
cat /opt/backups/zalocrm-media/file_storage-<stamp>.tar.sha256
tar -tf /opt/backups/zalocrm-media/file_storage-<stamp>.tar | awk '!/\/$/ {count++} END {print count + 0}'
find /var/lib/docker/volumes/zalocrm-corepviet_file_storage/_data -type f | wc -l
```

## 4. Restore test (không đụng DB production) — COMMAND REQUIRES APPROVAL

Chạy bằng script để luôn dùng container tạm tên `zalocrm-restore-*`, `--network none`, `--memory 1g`, kiểm tra `gzip -t`, `ON_ERROR_STOP=1`,
đo riêng restore RTO và tổng thời gian, rồi dọn container bằng `trap`:

```bash
scripts/ops/verify-restore.sh --dry-run
EXPECTED_MIGRATIONS=127 scripts/ops/verify-restore.sh
```

Script tự kiểm tra (chỉ đếm, không in dữ liệu khách hàng):

```bash
select count(*) from _prisma_migrations;
select count(*) from _prisma_migrations where finished_at is null;
select count(*) from organizations;
select count(*) from contacts;
select count(*) from conversations;
select count(*) from messages;
```

Nếu đặt `EXPECTED_MIGRATIONS=127`, script sẽ fail khi tổng số dòng `_prisma_migrations` khác 127.

So sánh với production (read-only, cùng câu lệnh trên `zalo-crm-db`). Chênh lệch chỉ được phép bằng dữ liệu phát sinh sau thời điểm dump.

Dọn dẹp: `verify-restore.sh` luôn chạy `docker rm -f zalocrm-restore-test` khi kết thúc. Nếu phải dọn tay:

```bash
docker rm -f zalocrm-restore-test
```

Lưu ý dump được tạo bởi user `crmuser`; nếu restore báo lỗi role/owner, thêm `--no-owner` khi tạo dump thử hoặc tạo role
`crmuser` trong container tạm. Không sửa cấu hình service backup production để né lỗi này khi chưa duyệt.

## 5. Backup gate (trước MỌI migration production)

| # | Điều kiện | Kết quả | Người xác nhận |
|---|---|---|---|
| 1 | Dump PostgreSQL < 24h, `gzip -t` OK | ☐ | |
| 2 | Restore test mục 4 PASS; số migration + số dòng khớp | ☐ | |
| 3 | Ghi nhận RPO (tuổi dump) và RTO (thời gian restore đo được) | ☐ | |
| 4 | Media backup (B-2) tồn tại, số file khớp | ☐ | |
| 5 | Bản sao `.env` mã hoá lưu ngoài VPS | ☐ | |
| 6 | Dung lượng disk sau backup < 80% | ☐ | |
| 7 | (Khuyến nghị) Bản sao off-site của dump + media | ☐ | |

Mục 1–6 bắt buộc. Thiếu một mục ⇒ **STOP — không migrate**.

## 6. Khôi phục thật (sự cố) — chỉ khi chủ hệ thống quyết định

Không có lệnh copy-paste ở đây một cách cố ý: khôi phục production là thao tác phá huỷ dữ liệu hiện tại
và phải được lập kế hoạch riêng (dừng app, dump trạng thái hiện tại trước, restore, kiểm tra, mở lại).
Với Messenger đã chạy thật: ưu tiên rollback ứng dụng / tắt cờ, KHÔNG restore DB để "quay lại".
