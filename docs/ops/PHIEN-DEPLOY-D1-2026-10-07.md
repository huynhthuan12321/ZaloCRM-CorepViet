# Biên bản phiên deploy D1 — 2026-10-07

> **Phiên:** Deploy PR-00 + PR-01 + OPS lên production ZaloCRM Cờ Rếp Việt  
> **VPS:** 157.66.219.190 (Ubuntu 22.04)  
> **Thời gian:** 07/10/2026, 11:20 – 11:55 +07  
> **Người thực hiện:** Huỳnh Ngọc Thuận + AI assistant

---

## 1. Trạng thái trước deploy

| Mục | Giá trị |
|-----|---------|
| VPS HEAD | `850dea1` |
| Local HEAD | `bf31cdf` (8 commits ahead: PR-00 + PR-01 + OPS + runbook + biên bản) |
| docker-compose.yml | Modified trên VPS (D0D+D0E sửa tay) |
| Disk | 84% (62G/79G, 13G trống) |
| zalo-crm-app | Up 12 days, healthy, 1 restart |
| Backup cron | Active (daily + weekly off-site) |

## 2. Các bước đã thực hiện

### 2.0 Dọn disk (trước deploy)

```
docker builder prune -f        → 0B reclaimed (cache đang dùng)
docker image prune -f           → ~3GB freed
Disk: 84% → 80% (60G/79G, 16G trống)
```

### 2.1 Backup trước deploy

```
DB dump: /root/backups/pre-d1-20261007-112646.dump (16MB, Fc format)
DB user: crmuser / DB name: zalocrm
Image tag rollback: zalocrm-corepviet-app:850dea1 (ID: 5cc82b320fec)
```

### 2.2 Deploy

```
git checkout -- docker-compose.yml    → discard manual D0D+D0E edits
git pull --ff-only                    → Fast-forward 850dea1..bf31cdf (43 files)
docker compose build app              → 30/30 stages, 936 seconds
docker tag latest → bf31cdf
docker compose up -d --no-deps app    → Container started 12.8s
```

**Kết quả:**
- SHA cũ: `850dea1`
- SHA mới: `bf31cdf`
- Thời điểm: Wed Oct 7 11:43:23 AM +07 2026

### 2.3 Post-deploy verification (CHƯA HOÀN TẤT)

| Kiểm tra | Kết quả |
|----------|---------|
| Container healthy | ✅ Up 12 minutes (healthy), restart=0 |
| Không FATAL trong log | ✅ |
| Log errors | Chỉ baseline: group sync 404 + getFriendOnlines 404 (nợ cũ) |
| Không lỗi messenger-config/token-encryption | ✅ |
| Port 3080 | ✅ bind `172.17.0.1` (D0D giữ nguyên) |
| Health endpoint `/health/live` | ⚠️ **CHƯA KIỂM TRA** |
| Health endpoint `/health/ready` | ⚠️ **CHƯA KIỂM TRA** |
| Messenger block trong health | ⚠️ **CHƯA KIỂM TRA** (`{enabled: false}`) |
| Zalo flow (gửi/nhận tin) | ⚠️ **CHƯA KIỂM TRA** |
| AI suggestion decrypt | ⚠️ **CHƯA KIỂM TRA** (test TOKEN_ENCRYPTION_KEY keyring PR-00) |
| Disk sau build | ❌ **98%** (73G/79G, chỉ 2.2G trống) |
| Port 9000 (MinIO) | ❌ **0.0.0.0** — cần recreate MinIO container |
| Port 5678 (n8n) | Không thấy trong ss output |

## 3. Vấn đề cần xử lý TRƯỚC KHI tiếp tục

### 3.1 ❌ CRITICAL: Disk 98%

Build docker image ăn hết disk. **Cần dọn ngay** trước khi làm gì khác:

```bash
# Dọn dangling images + build cache
docker image prune -f
docker builder prune -f --all
df -h /
```

Nếu vẫn > 80%: xem xét nâng cấp server (thêm disk) hoặc xoá old image tags không cần.

**⚠️ Nếu không dọn, hệ thống có thể gặp lỗi khi DB/log cần ghi thêm dữ liệu.**

### 3.2 ❌ Port 9000 MinIO trên 0.0.0.0

`docker compose up -d --no-deps app` chỉ recreate app, không đụng MinIO. Cần:

```bash
docker compose -f docker-compose.yml up -d --no-deps minio
ss -tlnp | grep 9000
# Expected: 127.0.0.1:9000 (loopback)
```

### 3.3 ⚠️ Verify chưa hoàn tất

Sau khi dọn disk + fix port, cần chạy tiếp:

```bash
# Health endpoints
curl -s http://localhost:3080/health/live && echo ""
curl -s http://localhost:3080/health/ready && echo ""

# Zalo flow: gửi 1 tin test từ Zalo → kiểm tra xuất hiện trong CRM
# AI suggestion: mở 1 conversation → bấm AI suggest → phải trả lời được

# Port check final
ss -tlnp | grep -E '3080|9000|5678'
```

### 3.4 Khuyến nghị: Nâng cấp server

Disk 79GB hiện tại không đủ cho hệ thống này (ZaloCRM + crv-workforce + n8n + backups + docker images). Khuyến nghị:

- **Tối thiểu:** Thêm 40-50GB disk (tổng ~120GB)
- **Lý tưởng:** 160-200GB nếu dự định chạy lâu dài với Messenger Native
- Sau khi nâng disk, chạy lại verify ở mục 3.3

## 4. Trạng thái D1

**D1 = CONDITIONAL PASS** — Deploy thành công, app healthy, nhưng cần hoàn tất verify + dọn disk.

Điều kiện để D1 chính thức PASS:
- [ ] Disk < 80%
- [ ] Health endpoints trả 200 với `messenger: {enabled: false}`
- [ ] Zalo flow OK (gửi/nhận tin)
- [ ] AI suggestion decrypt OK
- [ ] Port 9000 bind loopback

## 5. Lộ trình tiếp theo

```
Hiện tại                          Kết nối Facebook
   ↓                                    ↓
   D1 (conditional) ─────┐
                          ├──→ PR-02a ──→ D2 ──→ PR-02b..PR-09 ──→ Facebook ON
   Meta Spike ────────────┘
   (chưa bắt đầu)
```

| Bước | Trạng thái | Blocker |
|------|-----------|---------|
| D1 verify hoàn tất | ⏳ | Dọn disk, fix port, chạy verify |
| Meta Spike | ❌ | Cần FB App ID, Page ID, token (anh tự nhập) |
| PR-02a schema | ❌ | D1 PASS + Meta Spike PASS |
| PR-02b–PR-09 | ❌ | Tuần tự, ~6-8 PR nữa |
| **Facebook ON** | ❌ | **Sau PR-09** |

## 6. Files tham khảo

- Prompts deploy: `docs/prompts/PROMPT-D1-DEPLOY-PR00-PR01.md` (đã cập nhật SHA)
- Prompts Meta Spike: `docs/prompts/PROMPT-META-SPIKE.md`
- Prompts PR-02a: `docs/prompts/PROMPT-PR02A-SCHEMA-EXPAND.md`
- Biên bản hạ tầng trước: `docs/ops/BAN-GIAO-NANG-CAP-HA-TANG-2026-09-17.md`
- Runbook gốc: `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md`

## 7. Rollback (nếu cần)

```bash
cd /root/ZaloCRM-CorepViet
docker compose -f docker-compose.yml up -d --no-deps app \
  --pull never \
  -e IMAGE_TAG=850dea1
# Hoặc:
docker tag zalocrm-corepviet-app:850dea1 zalocrm-corepviet-app:latest
docker compose -f docker-compose.yml up -d --no-deps app

# ⚠️ Rollback về 850dea1 = trước D0D/D0E trong git
# docker-compose.yml sẽ cần sửa tay lại port binding nếu rollback
```

---

*Ghi chú: VoiCRM (`/opt/ZaloCRM-voicoffee`) là hệ thống riêng, KHÔNG thuộc scope triển khai này.*
