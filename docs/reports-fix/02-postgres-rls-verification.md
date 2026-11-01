# Nghiệm thu PostgreSQL/RLS cho Báo cáo

**Kết quả: FAIL — đã tái chạy PostgreSQL local lúc 21:06 ngày 01/11/2026 (+07).** Không phải kiểm tra production. Không có thay đổi schema/runtime nào được áp dụng trong lượt nghiệm thu này.

## Môi trường và giới hạn

Docker đã khởi động lại container disposable `reports-1b-verify-20261101`, loopback port `55471`. Container được init lại, DB `reports_1b_verify` ban đầu rỗng; đã xác nhận database và role `postgres`, kiểm tra không có user tables, rồi chạy `prisma db push` bằng `backend/scripts/reports-verification/prisma.config.ts`. Đây không phải migration replay. Sau đó chạy setup fixtures/RLS và HTTP harness hiện có.

Artifact setup: `artifacts/reports-real-verification-2026-11-01/db-setup.json`. Artifact lần chạy mới: `artifacts/reports-real-verification-2026-11-01/results.json`. Harness HTTP chỉ lắng nghe loopback; đã dừng sau khi lưu kết quả. PostgreSQL container test vẫn chạy.

## Kết quả lần chạy mới

**6/15 PASS, 9/15 FAIL.**

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| Fail-closed cho bảng users khi không có tenant | PASS | Query role app không có `app.current_org` trả 0 users. |
| Cô lập conversations theo org | PASS | Đặt tenant `verify-org-a`, query chỉ trả conversation của org A. |
| Chặn update conversation sang org khác | PASS | PostgreSQL từ chối, SQLSTATE `42501`. |
| JWT thiếu/giả/hết hạn | PASS | Các request tương ứng trả 401. |
| RLS trực tiếp cho bảng messages | FAIL | DB snapshot ghi `messages.relrowsecurity=false`, `relforcerowsecurity=false`. Query role app với tenant A đọc được **2** row org B; query không tenant đọc được **10** row. |
| Login và report route dưới tenant guard enforce | FAIL | Login admin và leader trả 500. Request JWT tới route trả `[tenant-guard] User.findFirst chạy NGOÀI tenant context`; báo cáo không chạy được đến phần kiểm tra dữ liệu. |
| Direct custom, saved custom, response-time qua HTTP/RLS | FAIL / chưa được xác minh | Các request trả 500 do prerequisite auth/tenant guard; không phải bằng chứng rằng truy vấn report đã sai kết quả, cũng không phải PASS. |
| JWT claim lệch org | FAIL / chưa được xác minh | Request trả 500 do cùng lỗi tenant context thay vì kỳ vọng 403. |

## Đối chiếu source

- `backend/prisma/rls/tenant-rls.sql` có 62 policy tenant theo header của script, nhưng không có `ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY` hoặc policy cho messages. Snapshot DB khớp với thiếu sót này.
- `backend/prisma/schema.prisma` khai báo `Message` có `orgId` và map vào bảng `messages`; vì vậy bảng có thể áp policy org tương ứng.
- `backend/src/shared/database/prisma-client.ts` cài tenant guard và RLS `set_config`; các request auth/report của harness đã vướng `User.findFirst` ngoài tenant context trước khi kiểm tra được response báo cáo.
- Truy vấn trực tiếp mới bằng đúng role `reports_verify_app` xác nhận `NOSUPERUSER`, `NOBYPASSRLS`; không tenant thấy 0 `users`; với tenant A thấy đúng users org A; nhưng vẫn đọc được 2 messages org B do bảng chưa bật RLS.

## Kết luận

Không nghiệm thu PostgreSQL/RLS đạt. Hai điều kiện chặn chính:

1. Hoàn thiện và kiểm tra policy RLS fail-closed cho `messages`, bao gồm read và write, trên disposable PostgreSQL dưới role không bypass.
2. Sửa hoặc cấu hình harness/auth tenant-context đúng luồng, sau đó chạy lại HTTP login/report với PostgreSQL adapter và RLS bật. Kiểm tra direct custom, saved report, response-time, cross-org access và filter ngày không được tính là đạt khi request trước đó đã trả 500.

Lần chạy hiện tại dùng `db push`, không phải migration replay. Nếu mục tiêu nghiệm thu là migration, cần bổ sung lần chạy riêng từ DB mới. Không sửa/chạy trên production trong bước này.
