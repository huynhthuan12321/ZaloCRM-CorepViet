# F1 — kết quả QA ngày 10/11/2026

**Gate kỹ thuật PASS; còn thiếu reviewer độc lập chốt delta sau QA.** Chưa commit/merge/push/deploy. F2/F3/F4/F6 chưa bắt đầu.

Candidate `mobile/ext` tại `F:/ZaloCRM-wt/ext`, base và merge-base `bcd220d06b4a2706ee2ec44a0b59f76be379c7d5`. `mobile/base` giữ nguyên. `npm ci` thành công. Baseline được trích từ git archive của đúng commit, build ngoài repo, dùng cùng node_modules; không dùng checkout base đang dirty.

| Kiểm tra | Baseline | Candidate cuối |
|---|---|---|
| vue-tsc -b | 0 lỗi | 0 lỗi |
| Toàn bộ Vitest | 64 file, 708 PASS | 68 file, 758 PASS |
| npm run build | PASS | PASS |
| E2E Chromium + WebKit | Dùng baseline cho ảnh so sánh | 212/212 PASS, không skip/retry |
| Luồng chức năng | — | 116/116 PASS |
| Ma trận mobile | — | 32/32 PASS, 0 issue/pageerror |
| Desktop1440 | — | 32/32 exactDiffPixels=0 |
| Tablet768/1024 | — | 32/32 exactDiffPixels=0 |

Lệnh cuối: `npx playwright test e2e/f1-settings.spec.ts e2e/f1-settings-desktop.spec.ts e2e/f1-settings-matrix.spec.ts --workers=3 --reporter=list`; exit0, 212 passed (7.4m). TypeScript/Vitest/build exit0. Log gốc ngoài repo tại `C:/Users/Public/f1-agent/gate2-*`. Bộ kiểm do QA độc lập chuẩn bị; main chạy lại sau sửa vì agent hết quota429. Đây không phải kết luận độc lập mới của QA/reviewer.

## Ma trận và bằng chứng

- Engine đúng Chromium và WebKit desktop Playwright; mô phỏng cảm ứng/DPR2, service worker bị chặn. Không backend/nick Zalo/DB thật; mọi API được mock theo contract từ source bằng dữ liệu giả.
- Dọc320x568,375x812,390x844,393x852,402x874,430x932; ngang844x390,932x430; mỗi cỡ Sáng/Tối, hai engine. Kiểm mọi route F1 và account/status/tag sheet, employee panel/create modal.
- Đo tràn ngang, vùng chạm44, input16, tương phản tối thiểu3 theo contract dự án, khối sáng trong Tối, footer trong viewport và đáy không bị tabbar che. Mô phỏng safe-bottom34px. Nút disabled miễn đo tương phản; avatar gradient và preview đăng nhập tổ chức kiểm bằng mắt, không dùng phép đo nền phẳng sai.
- 16 trạng thái desktop1440x900 x2engine: profile, feed, URL thông báo cũ, org owner/admin, users, edit/create/step2, quyền, phòng ban, trạng thái, nhãn, scoring, tích hợp, audit. Thêm8 trạng thái cho mỗi cỡ tablet768x1024/1024x768. Dùng giờ/font/dữ liệu cố định; scale CSS, ngưỡng0.
- Ảnh `shots/`, dữ liệu đo `results/*.json`; bảng `results/SUMMARY.md`. Main đã mở và xem ảnh Tối wizard320, ngang844, thông báo390 và nhân viên WebKit390. Chưa iPhone thật, bàn phím iOS thật, VoiceOver, mạng/API thật.

## Lỗi phát hiện và xử lý

1. Cold-load Cài đặt: confirm bị sheet che (z1100), trước đó mở Chat làm CSS lazy nâng z nên che lỗi. Chuyển CSS confirm vào mobile-tokens, chỉ body.m-toast-host; z13000 trên cả panel nhân viên. Bỏ khởi động ấm khỏi mọi bài cuối; cold confirm PASS cả hai engine.
2. Hủy form account/status/tag đóng thẳng bỏ dữ liệu. Footer nhận requestClose từ MobileSheet, dùng chung dirty/persistent guard; test dirty Cancel/Close và đang lưu PASS.
3. Overlay Tối: label/step/relation/error, panel empty/danger có màu cứng; link/close/Tạo nhỏ; footer wizard khuất320/ngang. Sửa có namespace mobile, footer cố định/body cuộn; ma trận cuối0 issue.
4. WebKit chạm thẻ không tự focus, đóng panel trả về BODY. Focus thẻ trước emit; test focus trap/return PASS.
5. Kết quả lọc nhân viên rỗng thiếu reset các filter server. Hiện đúng empty và xóa đủ query/phòng/nhóm/status; test PASS.
6. Main đối chiếu base phát hiện wizard thông báo thủ công đã bị khóa từ CEO-review do gửi nhầm UID. F1 bỏ phục hồi wizard; chỉ GET cấu hình hiện có, giữ hướng dẫn quản trị dùng máy tính/Thông báo hệ thống. Test không có request ghi và giữ khóa PASS. File wizard shared trả nguyên HEAD.

Lượt trước sửa182/212,30 FAIL (gồm fixture đợi wizard desktop đã bị khóa, lỗi overlay và vài pixel nhiễu1–8 kênh); không dùng lượt đó làm kết quả cuối. Candidate cuối64/64 ảnh exact0 không tăng ngưỡng. Đối chứng base-vs-base ba trạng thái từng nhiễu (users-edit-panel, tags-v2, users-create-step2) x2engine: 6/6 exact0; log `control-e2e.log`, exit0. Lệnh đầu sai quoting regex nên không tìm test; đã sửa cách gọi, không bỏ qua test hay tăng ngưỡng.

## Review và phần còn mở

Reviewer độc lập vòng3 MERGE ĐƯỢC có điều kiện QA; Medium/Low được xử lý và có regression. Nhưng delta sau QA và sửa policy thông báo chưa được reviewer độc lập vòng4 chốt vì quota429. Xem `NEXT-REVIEW.md`, `REVIEW-F1-round3.md`, `REVIEW-RESOLUTIONS.md`, `LOCK-REQUESTS.md`. **Không coi F1 đã hoàn thành quy trình dev → reviewer → QA cuối cùng hoặc đủ điều kiện merge.**

Gộp/đếm lại nhãn và sửa quản trị nặng dùng máy tính; trang cài đặt ngoài F1 giữ policy cũ. Backend/auth/RBAC/API contract/payload gửi tin không đổi. Source manifest `SOURCE-SHA256.txt` ghi trạng thái bàn giao. Đợt tiếp theo chưa bắt đầu.
