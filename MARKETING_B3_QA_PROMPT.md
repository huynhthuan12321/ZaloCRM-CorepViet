# PROMPT QA B3 — Runtime QA wizard Mục tiêu + drawer (local, trước merge)

> Copy toàn bộ phần dưới đây vào session Claude Code mới trên repo `D:\ZaloCRM-CorepViet`.

---

QA runtime hạng mục **B3 — Mục tiêu wizard 4 bước + drawer chi tiết** trên branch `feature/marketing-b3-target-wizard` (2 commit `975ba93` + `ef92b64`, CHƯA merge main). Mục tiêu: xác nhận chạy thật trên browser đúng spec trước khi merge/deploy. Đây là phiên QA — **ưu tiên phát hiện và ghi nhận lỗi, KHÔNG tự ý sửa lớn** (lỗi nhỏ hiển nhiên < 5 dòng được sửa, ghi rõ; lỗi logic/thiết kế thì báo cáo chờ xác nhận).

## 0. An toàn tuyệt đối

- KHÔNG gửi Zalo thật. KHÔNG đổi `MARKETING_DRY_RUN` / `VITE_MARKETING_DRY_RUN` (cả hai phải `true` khi chạy dev QA).
- KHÔNG resume/kích hoạt job `active`; mọi job tạo trong QA phải là **nháp (paused)** hoặc `scheduled`.
- KHÔNG chạy migration/ghi vào DB production/VPS — chỉ DB local hoặc DB test riêng.
- KHÔNG commit `.env`, dump, screenshot.

## 1. Đọc trước

1. `MARKETING_B3_IMPLEMENTATION.md` — cái gì đã làm / chưa làm (engine Tin 1/3/4 CHƯA có — đừng ghi bug cho phần này).
2. `MARKETING_REVIEW_INPUT.md` Lượt 6 — spec chuẩn (theo ẢNH khi lệch): wizard 4 bước, nhãn thẻ "ĐÃ XỬ LÝ", Top 3 nick, tham số mặc định (60s/30 ngày/60 phút/24h/6–22h).
3. `MARKETING_PHASE3_QA_CHECKLIST.md` — format ghi kết quả (bảng ☐/✅/❌ + cột Ghi chú).

## 2. Chuẩn bị môi trường (tự khám phá, không đoán bừa)

1. `git status` sạch (stash file lạ nếu có) và đang ở branch `feature/marketing-b3-target-wizard`.
2. Kiểm tra `backend/.env` có `DATABASE_URL` chưa. Máy dev thường KHÔNG có DB:
   - Dựng Postgres local: `docker run -d --name b3-qa-pg -e POSTGRES_PASSWORD=qa -p 5433:5432 postgres:16` → set `DATABASE_URL` trỏ vào (DB tên riêng, vd `b3qa`).
   - `npx prisma migrate deploy` từ `backend/` — PHẢI áp được `20260714120000_target_wizard_b3` không lỗi. Đây chính là smoke-test migration (ghi kết quả mục A).
3. Seed dữ liệu tối thiểu để login + test: tìm script seed có sẵn (`backend/package.json` scripts, `prisma/seed*`, hoặc cách các test tạo org/user). Cần: 1 org, 1 user admin đăng nhập được, ≥2 `ZaloAccount` (1 online + 1 offline — mock, không cần Zalo thật), 1 `CustomerList` có ~5 entries (vài entry có `zaloUid`, vài entry không), 1 `TargetJob` KIỂU CŨ (1 nick `zaloAccountId`, có `welcomeMsg`, không có field mới) để test backward-compat. Nếu không có seed script, viết script seed tạm trong `scratchpad/` (không commit).
4. Set `MARKETING_DRY_RUN=true` + `VITE_MARKETING_DRY_RUN=true` cho môi trường dev. Chạy backend + frontend dev server (xem script trong 2 `package.json`; dùng browser tool mở app, đăng nhập bằng user seed).
5. Nếu kẹt ở bước nào >30 phút (thiếu credentials, seed không được) → DỪNG, báo rõ kẹt gì, không đoán mò phá DB.

## 3. Test matrix (ghi kết quả vào file mới `MARKETING_B3_QA_CHECKLIST.md`, format bảng như Phase 3)

### A. Build / migration / API
| # | Việc | Kỳ vọng |
|---|---|---|
| A1 | `backend: npx tsc --noEmit` + `npm test` (file target) | PASS, baseline fail không tăng |
| A2 | `frontend: vue-tsc + vite build` + spec target-wizard | PASS |
| A3 | `prisma migrate deploy` trên DB local mới | Áp `20260714120000_target_wizard_b3` OK, không P2022 |
| A4 | `GET /api/v1/target-jobs/defaults` + `/nick-quotas` (đăng nhập) | Trả defaults đúng config (6–22h, 60s, 30 ngày, 24h, 300/300) + quota nick |
| A5 | `GET /api/v1/target-jobs/:id/stats` với id org khác (tạo org 2 tối thiểu, hoặc xác nhận qua test có sẵn) | 404, không lộ data |

### B. Wizard — validation từng bước (browser)
| # | Việc | Kỳ vọng |
|---|---|---|
| B1 | Mở `/marketing/targets` → nút tạo mới | Wizard 4 bước đúng tên: `1 Tệp + Nick + Skip → 2 Lời chào + Chuỗi → 3 Quy tắc gửi an toàn → 4 Xem trước + Bắt đầu` |
| B2 | Bước 1: bỏ trống tên / không chọn tệp / không tick nick → Tiếp | Bị chặn + báo lỗi rõ |
| B3 | Bước 1: card nick hiện `KB n/300 · Tin n/300`; nick offline | Offline bị disable, không tick được |
| B4 | Bước 1: tick 2 nick online | Cho qua (multi-nick) |
| B5 | Bước 1: 3 checkbox quy tắc bỏ qua mặc định BẬT | Đúng, có dropdown phạm vi "Bạn với nick trong danh sách" |
| B6 | Bước 2: lời mời 201+ ký tự | Counter đỏ `n/200`, chặn Tiếp |
| B7 | Bước 2: nhập biến lạ `{tuoi}` vào 1 tin | Bị chặn (whitelist {gender}{name}{sale}) |
| B8 | Bước 2: 4 tin có toggle BẬT/TẮT + delay; Tin 1 badge "Hộp người lạ"; báo nội bộ: chỉ "Sale phụ trách nick" bật được, 2 đích kia disable + "Đang phát triển" | Đúng spec |
| B9 | Bước 3: threshold `0 = không filter`; reaction rules read-only (không sửa được) | Đúng |
| B10 | Bước 4: bảng tóm tắt hiện đúng giá trị đã cấu hình + preview render biến bằng KH mẫu | Đúng, không hiện `{name}` thô |
| B11 | Bước 4: Hẹn lịch 23:00 | Bị từ chối (khung 6–22h VN) — cả FE lẫn thử gọi API trực tiếp |
| B12 | Hoàn tất "Bắt đầu chạy Mục tiêu" khi dry-run | Tạo job **nháp (paused)**, có banner dry-run, KHÔNG có gì gửi ra |
| B13 | Hẹn lịch hợp lệ (vd mai 9:00) | Job `scheduled`, hiện đúng ở filter Hẹn lịch |

### C. List + Drawer chi tiết
| # | Việc | Kỳ vọng |
|---|---|---|
| C1 | List: thẻ tổng + lọc Tất cả/Đang chạy/Tạm dừng/Hoàn tất/Hẹn lịch/Nháp/Đã xóa | Đếm đúng với data seed |
| C2 | Click job mới tạo → drawer | 4 thẻ **TRONG TỆP / ĐÃ XỬ LÝ / CÓ ZALO / KHÔNG ZALO** (đúng nhãn), Phase 1 + Phase 2 breakdown = 0 (job chưa chạy) không vỡ layout |
| C3 | Drawer job CŨ (seed kiểu 1-nick) | Mở được, không crash, số liệu hợp lý — backward compat |
| C4 | Top 3 nick | Bảng Nick/Gửi/Accept/% hiện được (0% với job mới) |
| C5 | Soft-delete 1 job nháp | Biến khỏi list mặc định, hiện trong filter Đã xóa |

### D. Backward compat + an toàn
| # | Việc | Kỳ vọng |
|---|---|---|
| D1 | Job cũ seed vẫn PATCH pause/resume được qua UI cũ | Không lỗi 500 |
| D2 | Soi log backend trong toàn bộ QA | Không có call Zalo thật; nếu cron tick job active thấy `[dry-run]`; không P2022/undefined column |
| D3 | Network tab browser | Không request nào ra ngoài localhost (trừ asset) |

## 4. Báo cáo

- Ghi toàn bộ kết quả vào `MARKETING_B3_QA_CHECKLIST.md` (✅/❌ + ghi chú lỗi: bước, thao tác, message UI, dòng log).
- Kết luận cuối: **PASS → đủ điều kiện merge** hay **FAIL → danh sách lỗi xếp theo mức chặn-merge / nhỏ**.
- Dọn dẹp: dừng + xoá container `b3-qa-pg`, khôi phục `.env` như cũ, không commit file QA tạm trong `scratchpad/`. Commit duy nhất cho phép: `MARKETING_B3_QA_CHECKLIST.md` (chờ xác nhận trước khi commit).
