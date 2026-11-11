# TT09 — Giới hạn worker và giám sát fleet mock/local

Ngày nghiệm thu: 13/10/2026.

## Kết luận

TT09 **PASS trong phạm vi mock/local**. Backend có admission gate theo ngân sách RAM và trần
worker; heartbeat có CPU, RSS, event-loop p95, dung lượng profile/ledger; owner/admin xem được
headroom và cảnh báo tổng hợp theo fleet.

Giới hạn mặc định vẫn là **2 worker**. Việc hỗ trợ cấu hình lớn hơn không tự mở rộng runtime,
không deploy và không chứng minh TikTok thật hoặc VPS production đủ tài nguyên.

## Cấu hình

| Biến | Mặc định | Ý nghĩa |
|---|---:|---|
| `MOCK_CHANNEL_MAX_WORKERS` | 2 | Trần worker do vận hành đặt |
| `MOCK_CHANNEL_MEMORY_BUDGET_MB` | 2048 | Ngân sách RAM dành cho fleet |
| `MOCK_CHANNEL_MEMORY_RESERVE_MB` | 512 | RAM không được cấp cho worker |
| `MOCK_CHANNEL_PER_WORKER_MB` | 512 | RAM dự phòng cho một worker |
| `MOCK_CHANNEL_MAX_CPU_PERCENT` | 80 | Ngưỡng cảnh báo CPU của một worker |

Giới hạn hiệu lực:

```text
min(MAX_WORKERS, floor((MEMORY_BUDGET_MB - MEMORY_RESERVE_MB) / PER_WORKER_MB))
```

Tạo account và bắt đầu phiên QR đều bị từ chối bằng
`TT09_WORKER_CAPACITY_REACHED` khi vượt giới hạn. Các transaction admission dùng isolation
`Serializable` và retry một lần khi PostgreSQL báo xung đột serialization.

## Benchmark local

Benchmark chạy hai Chromium profile mock đồng thời, 20 vòng inject + đọc song song:

| Số đo | Kết quả |
|---|---:|
| Latency p50 | 100,19 ms |
| Latency p95 | 116,41 ms |
| Latency max | 116,41 ms |
| Chromium process | 8 |
| Tổng Chromium working set | 584.343.552 byte |
| Trung bình Chromium/worker | 292.171.776 byte |
| CPU trong workload | 16,18% |
| Node benchmark RSS | 167.829.504 byte |

Mức dự phòng 512 MB/worker cao hơn số đo Chromium trung bình và phần Node phân bổ trong lần
benchmark này. Đây là số đo một lần trên máy phát triển, không bao gồm TikTok Web thật, mạng
thật, thời gian chạy dài, backend/Zalo/PostgreSQL production hoặc biến động profile sau nhiều
ngày.

## Giám sát

Fleet endpoint trả:

- số worker active, giới hạn hiệu lực và slot còn lại;
- ngân sách, phần giữ lại, phần dự phòng worker và headroom;
- tổng RSS Node worker quan sát được;
- trạng thái từng account, heartbeat age, CPU/RSS/event-loop/profile/ledger;
- cảnh báo capacity, memory reservation, CPU và thiếu metric.

`readyForRealPilot` tiếp tục là `false`. Heartbeat runtime vẫn nằm trong bộ nhớ backend và mất
sau restart.

## Nghiệm thu

- Acceptance evidence SHA-256:
  `CA6C0FB4394E1937EFA412C530F3087034EDD6513CA51D205B40446BB2714F9E`.
- Benchmark evidence SHA-256:
  `56752CD1FAA7204BFBEED8BE6CDDE61FE664730BAE35A3273058B2835CC58694`.
- PostgreSQL 16.15 acceptance: **17/17 nhóm PASS**.
- Account thứ ba bị từ chối khi giới hạn mặc định là 2.
- Account fixture thứ ba tạo trực tiếp trong DB vẫn không được bắt đầu QR khi hai worker đang
  active.
- Fleet endpoint chỉ owner/admin truy cập được.
- Hai account cũ tiếp tục giữ ACL, claim, heartbeat và rollback độc lập.
- Backend channel unit: **60/60 PASS**.
- Backend TypeScript: **PASS**.
- Frontend: **67/67 PASS**, production build PASS.
- PoC Node: **19/19 PASS**.
- PoC browser: **3/3 PASS**.

## Rollback

- Đặt `MOCK_CHANNEL_MAX_WORKERS=2` hoặc thấp hơn rồi restart môi trường local.
- Tắt outbound/inbound và rollback từng account vượt giới hạn; không xóa command hoặc database.
- Có thể bỏ fleet UI/endpoint và các trường heartbeat TT09 mà không đổi schema database.
- Không tự ngắt worker đang chạy chỉ vì hạ cấu hình; người vận hành chọn account cần rollback để
  tránh mất trạng thái gửi chưa rõ.

## Điểm dừng

TT09 hoàn thành phần capacity mock/local. Chưa có căn cứ mở TikTok thật, staging hoặc
production. Trước triển khai thật cần benchmark trên đúng VPS, quan sát dài ngày và tính cả tài
nguyên ZaloCRM hiện hữu.
