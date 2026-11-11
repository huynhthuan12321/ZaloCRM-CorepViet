# AI tự tư vấn: đối chiếu production và sửa cờ chế độ trọn

Ngày kiểm tra: 17/10/2026, giờ Việt Nam.

## Kết quả

Đã sửa và kiểm thử tại repo local. **Chưa triển khai VPS, chưa nghiệm thu tự gửi tin thật.** SSH của máy chủ đang từ chối khóa vận hành ZaloCRM và chỉ quảng bá phương thức `password`.

## Bằng chứng

Qua tab Chrome CRM đang đăng nhập, đọc giao diện production mà không thay đổi cấu hình:

- Hội thoại đang mở có công tắc `AI tự tư vấn` bật. Thanh gợi ý AI hiển thị nội dung và nguồn tài liệu, nhưng các tin tự gửi trong đoạn hội thoại được kiểm tra không có bằng chứng để nghiệm thu chức năng này.
- Cấu hình tổ chức: bật trợ lý AI, bật công tắc tổng, scope `manual`, bật tiếp nhận khách chưa kết bạn, bật `Chế độ trọn`. Giờ hoạt động 8–22h, tối đa 10 tin AI liên tiếp. Quota còn 493/500 lượt tại thời điểm kiểm tra; có 21 tài liệu KB.
- Repo local: `ai-auto-reply-service.ts` gọi `decideAutoReplySendPolicy` hai lần nhưng không truyền `aiAutoReplyFullAuto`. Policy luôn đưa câu nhạy cảm/giá sang `needs_review`. Đây là lỗi xác định được trong repo, phù hợp với hiện tượng dù UI bật chế độ trọn. **Chưa đọc được code thực chạy hoặc log VPS để xác nhận đây là nguyên nhân duy nhất trên production.**
- SSH đã thử đúng khóa `C:\Users\Huynh Thuan\.ssh\zalocrm_ops`, `IdentitiesOnly=yes`, `PubkeyAuthentication=yes`, `PreferredAuthentications=publickey`. Máy chủ `157.66.219.190:22` trả `Permission denied (password)`. Khóa public có fingerprint `SHA256:iwR8I0bCJA+uXiJAM7h/v/X19uHuIIoe6xvmSJJ51Yw`, comment `zalocrm-ops-2026-10-13`. Không yêu cầu hoặc đọc mật khẩu VPS.

## Thay đổi

1. `backend/src/modules/ai/ai-send-policy.ts`: thêm `fullAuto?: boolean`. Mặc định hoặc false vẫn yêu cầu duyệt nội dung giá/chốt đơn. Chỉ true rõ ràng mới cho phép nội dung này tự gửi; thiếu nguồn KB vẫn yêu cầu duyệt.
2. `backend/src/modules/ai/ai-auto-reply-service.ts`: truyền giá trị đã lưu của tổ chức vào cả kiểm tra ban đầu và kiểm tra lại sau khoảng chờ. Không đọc quyền tự gửi từ output của LLM.
3. `backend/tests/unit/ai-send-policy.test.ts`: test chế độ trọn bật/tắt và thiếu nguồn tài liệu.
4. `backend/tests/unit/ai-auto-reply-full-auto.test.ts`: chạy entry point của service với policy thật; giả lập DB, AI provider và SDK Zalo để không gọi AI hoặc gửi tin cho khách. Kiểm tra gửi đúng một tin có nguồn, chờ duyệt khi tắt chế độ trọn, tắt cờ trong lúc chờ, thiếu nguồn, kill switch, nhân viên trả lời trước và privacy denied.

Không sửa công tắc/giờ hoạt động/scope trên production, không gửi lại tin cũ, không mở rộng TikTok hoặc nhóm, không thay prompt hoặc cơ chế quyền riêng tư. Không có migration.

## Kiểm tra

Lệnh tại `backend/`:

```powershell
npx --no-install vitest run tests/unit/ai-send-policy.test.ts tests/unit/ai-auto-reply-full-auto.test.ts tests/unit/ai-auto-reply-eligibility.test.ts tests/security/ai-privacy-guard.test.ts
npm run build
```

- 4 test files đạt, **29 test đạt**.
- TypeScript backend build đạt.
- `git diff --check` cho các file sửa đạt.
- Lượt chạy đầu trong sandbox bị lỗi quyền rename cache Vitest; đã chạy lại ngoài sandbox thành công.
- Bộ `tests/security/ai-capabilities.test.ts` đã thử nhưng setup/teardown cần database test đang không truy cập được; 4 test của bộ này không chạy. Không tính bộ này là PASS và không chạy nó lên DB production.

## Bước tiếp theo trên VPS

1. Khôi phục đăng nhập bằng khóa ZaloCRM. Đã đề nghị chủ VPS chạy lệnh chỉ đọc trong console root:

   ```bash
   sshd -T | grep -E '^(pubkeyauthentication|authenticationmethods|permitrootlogin|authorizedkeysfile) '
   ```

2. Kiểm checkout, các thay đổi đang có, app image thực chạy và hai module compiled tương ứng. Không sao chép đè bản local lên source production mới hơn.
3. Đọc cấu hình/log AI và các bản nháp cần duyệt liên quan để xác nhận lỗi; kiểm tra privacy mode, dry-run và nhánh gửi nếu còn dấu hiệu khác. Không tắt các bảo vệ để làm test qua.
4. Áp dụng phần sửa tương ứng với code production, chạy test/build, giữ image rollback, triển khai riêng app. Không restart DB hoặc migrate schema.
5. Kiểm health, nhận/gửi Zalo bình thường và log AI. Nghiệm thu một tin mới trên hội thoại thử được xác định; không replay tin cũ hoặc gửi thử cho khách thật một cách suy đoán.

## Rollback

Local: hoàn tác đúng các hunk bổ sung `fullAuto` trong hai module, và các test đi kèm; không reset checkout đang có công việc khác. Production chưa thay đổi bởi tác vụ này. Khi triển khai, lưu image app đang chạy ngay trước thay đổi để có thể rollback riêng app, giữ DB và phiên Zalo.
