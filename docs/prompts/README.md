# Prompts triển khai Messenger Native — ZaloCRM Cờ Rếp Việt

Thứ tự thực hiện (KHÔNG BỎ BƯỚC):

```
D1 ──────────────────┐
(deploy PR-00+PR-01) │
                     ├──→ Đủ 4 điều kiện ──→ PR-02a ──→ D0B-2 ──→ D2 ──→ D3 ──→ PR-02b ──→ ...
Meta Spike ──────────┘
(track riêng)
```

| # | File | Mô tả | Chạy song song? |
|---|------|-------|-----------------|
| 1 | `PROMPT-D1-DEPLOY-PR00-PR01.md` | Deploy lần đầu với image tag, không migration | Song song với Meta Spike |
| 2 | `PROMPT-META-SPIKE.md` | Xác nhận webhook + Graph API bằng n8n tạm | Song song với D1 |
| 3 | `PROMPT-PR02A-SCHEMA-EXPAND.md` | Viết 7 model mới + cột nullable | Sau khi D1 + Spike + Gate §11 đều PASS |

## Lưu ý quan trọng

- **Scope:** Chỉ ZaloCRM Cờ Rếp Việt. VoiCRM là hệ thống riêng, không thuộc scope triển khai này.
- **Tài liệu gốc:** `docs/TRIEN-KHAI-PRODUCTION-MESSENGER-NATIVE.md` (runbook v1.2) — khi conflict, runbook wins.
- **Mỗi bước phải có duyệt riêng.** Không gộp bước, không tự ý chạy.
- **Ràng buộc bảo mật:** xem từng prompt — áp dụng cho MỌI session.
# Fix Báo cáo — triển khai và kiểm tra

[Bộ prompt đầy đủ theo 8 giai đoạn](REPORTS-FIX-IMPLEMENTATION-AND-VERIFICATION.md): mỗi bước có prompt triển khai và kiểm tra độc lập, kèm prompt sửa sau kiểm tra và tiếp tục sau gián đoạn. Chưa thực thi sửa lỗi hoặc phát hành.

