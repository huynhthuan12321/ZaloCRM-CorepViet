# Baseline bước0A

Ngày29/10/2026, bắt đầu chạy16:43:13 +07. HEAD tham chiếu `1b910e3971841afeec83d53bc0539f3d50167f5d`; các file chạy theo working tree. Trạng thái chạy baseline: PASS (chỉ các test nêu dưới), checkpoint0A vẫn chờ0B.

## Lệnh và kết quả

Working directory `F:\ZaloCRM-CorepViet\backend`:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/reports-review-evidence.test.ts tests/custom-report-sqli.test.ts
```

Kết quả Vitest4.1.4: **2 file passed,10 tests passed**, duration629ms (transform262ms, setup0ms, import495ms, tests16ms). Exit0. Không cài package hoặc sửa test để chạy.

Chạy ngoài sandbox để Vitest dùng cache tạm Windows theo lỗi EPERM đã xác minh ở phiên trước. Hai file được đọc trước chạy: Prisma được mock trước import; report handler còn mock auth/logger/contact scope. Không chạy app.ts, kết nối DB, migration, cron, queue hoặc send/model. Không đọc .env hay hiển thị env/config nhạy cảm. Config test có DATABASE_URL fallback nhưng không coi URL đó là một DB được phép dùng; Prisma bị mock nên không khởi tạo adapter.

## Ý nghĩa10 test

`backend/tests/unit/reports-review-evidence.test.ts` —5 characterization cases:

1. Leader có subtree A vẫn nhận saleB do query user org-wide — tái hiện lỗi.
2. Member visible scope chỉ self bị403 — hành vi gate hiện tại.
3. Có12 khách nhưng message KPI/14-day series vẫn0 — tái hiện placeholder, fixture không có Message dataset thật.
4. Lịch10/11 được tính trong “hôm nay29/10” do thiếu end bound — tái hiện lỗi bằng count mock có xét predicate thời gian.
5. UTC boundary loại01:00 VN của ngày from — tái hiện lệch kỳ bằng kiểm tra query thật.

`backend/tests/custom-report-sqli.test.ts` —5 cases:

1. Source độc hại vào bound parameter, không nối SQL.
2. Source bình thường cũng dùng bound parameter.
3. Bỏ source filter khi không có giá trị.
4. groupBy không hợp lệ bị reject ở đường kiểm tra.
5. Appointments theo user có response shape đúng fixture.

Pass characterization **không có nghĩa các lỗi đã sửa**. Khi bước1/2/3 sửa, giữ tài liệu này như bằng chứng cũ; chuyển assertion tương ứng sang mong đợi hành vi đúng với fixture đối chứng. Không coi10 test là coverage toàn bộ report, SQL semantics, auth/RLS, custom multi-metric alignment hoặc database.

## Lỗi có trước và thiếu coverage

- Lần baseline hiện tại không có test fail. Không chạy toàn suite/build để tránh đưa phạm vi không liên quan vào bước chỉ lập contract.
- Những lỗi scope/ngày/placeholder còn tái hiện chính là lỗi runtime có trước, không phải lỗi mới do0A.
- Chưa có test hiện hành chứng minh saved-run scope, leader singleton, privacy/archived scope, bucket engagement VN, trạng thái won/lost hoặc dry-run AI; đã đưa vào fixture kế hoạch trong contract.
- Chưa kết nối DB, JWT thật, RLS, browser hoặc thiết bị. Phần đó NOT_RUN, không PASS và không tuyên bố nghiệm thu end-to-end.

## Dấu vết source và phạm vi patch

`00-source-snapshot.json` lưu thời điểm/hash source/test thực tế được dùng cho contract.0B phải đối chiếu lại nếu file thay đổi. Không chứa secret hoặc nội dung dữ liệu khách.

Git status đầu lượt đã có README, AI/TikTok, docker-compose, tài liệu và file untracked từ trước; không sửa chúng.0A chỉ thêm4 file trong docs/reports-fix: README, contract, baseline, source snapshot. Không tạo file0B hoặc checkpoint bước1–7 để tránh ngụ ý đã thực hiện.
