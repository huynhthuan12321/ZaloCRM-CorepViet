# QA Checklist — Phase 3 Content Blocks + Sequences (sau deploy VPS)

> Ngày: 2026-07-13 · Commit deploy: `eb5fc85` (main) · Migration: `20260713120000_content_blocks_phase3`
> **An toàn tuyệt đối:** production giữ `MARKETING_DRY_RUN=true` + `VITE_MARKETING_DRY_RUN=true`.
> KHÔNG tắt dry-run, KHÔNG gửi Zalo thật, KHÔNG resume/kích hoạt job active.
> Quy ước: ☐ chưa test · ✅ pass · ❌ fail (ghi log lỗi vào cột "Ghi chú").

---

## A. Hạ tầng / deploy (CLI trên VPS trước khi QA web)

| # | Việc | Kỳ vọng | KQ | Ghi chú |
|---|---|---|---|---|
| A1 | `git log --oneline -1` | `eb5fc85 feat(marketing): implement content blocks and sequences crud` | ☐ | |
| A2 | `prisma migrate deploy` (image mới) | "Applying migration `20260713120000_content_blocks_phase3`" + "successfully applied" | ☐ | |
| A3 | `\d content_blocks` | có cột `block_type`, `variants`, `tags`, `folder`, `enabled` | ☐ | |
| A4 | `docker compose logs app` | KHÔNG có `P2022` / `column ... does not exist` / `ERROR` liên quan ContentBlock/Sequence | ☐ | |
| A5 | `.env` | `MARKETING_DRY_RUN=true` **và** `VITE_MARKETING_DRY_RUN=true` | ☐ | |

---

## B. Menu Marketing đầy đủ

| # | Việc | Kỳ vọng | KQ | Ghi chú |
|---|---|---|---|---|
| B1 | Mở app → tab Marketing | Sidebar hiện đủ **9 mục**: Quét nhóm · Tệp khách hàng · Mục tiêu · Phiên chăm sóc · Luồng kịch bản · Bám đuổi thủ công · Gửi tin hàng loạt · Khối nội dung · Mẫu tin nhắn | ☐ | |
| B2 | Click từng mục | Không 404 / không trắng / không crash | ☐ | |
| B3 | Khối nội dung + Luồng kịch bản | Mở ra trang thật (không phải placeholder) | ☐ | |

---

## C. Khối nội dung — CRUD thật

| # | Việc | Kỳ vọng | KQ | Ghi chú |
|---|---|---|---|---|
| C1 | Tạo khối loại **Gửi tin nhắn**, 2 biến thể (mỗi biến thể có text), tag `uu-dai` | Lưu OK, hiện trong list, badge "2 biến thể" | ☐ | |
| C2 | Sửa khối C1: đổi tên + thêm biến thể thứ 3 | Lưu OK, cập nhật ngay | ☐ | |
| C3 | Nhập biến lạ `{{gender}}` vào 1 biến thể → Lưu | Bị chặn, toast báo biến không hợp lệ, KHÔNG lưu | ☐ | |
| C4 | Bấm nút bật/tắt trên card khối | Khối chuyển mờ + badge "Đã tắt"; chỉ đổi trạng thái, KHÔNG gửi gì | ☐ | |
| C5 | Tìm kiếm theo tên (ô search) | Lọc đúng (debounce ~300ms) | ☐ | |
| C6 | Lọc theo loại = "Gửi tin nhắn" / trạng thái = "Đang tắt" | Danh sách lọc đúng | ☐ | |
| C7 | Tạo khối loại **Lời mời kết bạn** + 1 khối **Đổi trạng thái** | Lưu OK, hiện đúng badge loại | ☐ | |
| C8 | Xoá 1 khối (xác nhận dialog) | Biến mất khỏi list | ☐ | |
| C9 | Khối có ảnh (chọn từ Kho media cho 1 biến thể) | Ảnh hiện trong card + form | ☐ | |

---

## D. Broadcast wizard Step 2 — chỉ khối send_message enabled

| # | Việc | Kỳ vọng | KQ | Ghi chú |
|---|---|---|---|---|
| D1 | Vào Gửi tin hàng loạt → Tạo → Bước 2 → chọn "Khối nội dung (xoay vòng)" | Danh sách CHỈ gồm khối loại **Gửi tin nhắn** đang **bật** | ☐ | |
| D2 | Đối chiếu với khối `request_friend` / `status_change` / khối đã tắt ở mục C | KHÔNG xuất hiện trong picker | ☐ | |
| D3 | Chọn 2 khối → sang bước cuối → Tạo | Job tạo ra ở trạng thái **nháp (paused)** (do dry-run) | ☐ | |
| D4 | Nút "Chạy ngay" trên job | Bị **khóa** (icon send-lock) khi dry-run | ☐ | |

---

## E. Luồng kịch bản — chọn ContentBlock thật

| # | Việc | Kỳ vọng | KQ | Ghi chú |
|---|---|---|---|---|
| E1 | Vào Luồng kịch bản → Tạo luồng → 1 bước → dropdown chọn Khối | Dropdown liệt kê khối **send_message đang bật** thật | ☐ | |
| E2 | Chọn 1 khối cho bước (bước đang trống) | Ô nội dung tự điền text từ khối + badge "từ khối" | ☐ | |
| E3 | Sửa tay text sau khi đã chọn khối | Cho phép sửa, vẫn giữ liên kết khối | ☐ | |
| E4 | Thêm bước 2, sắp xếp lên/xuống, xoá | Thứ tự cập nhật đúng | ☐ | |
| E5 | Lưu luồng → mở lại (Sửa) | blockId + text giữ nguyên (round-trip) | ☐ | |
| E6 | Bật/tắt luồng | Đổi trạng thái, KHÔNG gửi gì | ☐ | |

---

## F. Dry-run vẫn khóa gửi thật (an toàn production)

| # | Việc | Kỳ vọng | KQ | Ghi chú |
|---|---|---|---|---|
| F1 | Trang Khối nội dung | Có nhãn "Dry-run · không gửi thật" | ☐ | |
| F2 | Tạo/bật khối, tạo/bật luồng, tạo broadcast nháp | KHÔNG có tin Zalo nào gửi ra | ☐ | |
| F3 | `docker compose logs app` sau các thao tác + chờ tick cron | Nếu job tới giờ chạy → chỉ thấy `[dry-run]`, KHÔNG có gửi thật | ☐ | |
| F4 | Không có job nào bị resume/active gửi thật do QA | Xác nhận mọi job test đều `paused`/nháp | ☐ | |

---

## Nếu có lỗi
Ghi lại: bước #, thao tác, message lỗi (UI toast + `docker compose logs app` dòng liên quan), rồi báo để fix trực tiếp. Không tự tắt dry-run để "thử cho chạy".
