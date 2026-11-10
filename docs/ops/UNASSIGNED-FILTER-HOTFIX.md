# Hotfix bộ lọc Chưa giao sale — 10/11/2026

Nhánh `hotfix/unassigned-filter`, worktree `F:\ZaloCRM-wt\hotfix-unassigned`, từ `release/hotfix-20261108 @ 679f4bf`. Merge-base xác nhận đúng `679f4bfaf902285fe62f0f58528b45df0e518dbd`. Image production `85c6a6ba` là thông tin chủ dự án cung cấp; không truy cập VPS/DB production để xác minh hoặc thay đổi.

## Thay đổi

`backend/src/modules/chat/chat-routes.ts:526`: tại GET `/api/v1/conversations`, ánh xạ `assignedUserId=unassigned` sang `contact.assignedUserId = null` trong Prisma (SQL IS NULL). User ID thật và trường hợp không truyền giữ nguyên. Scope org/nick, permission, privacy, count, pagination và các filter khác không đổi. Không migration.

`/api/v1/channel-inbox` không hỗ trợ assignedUserId: schema strict hiện trả 400 khi nhận tham số này, không có lỗi so sánh literal tương tự. Giữ nguyên contract, thêm kiểm hồi quy cho phản hồi 400 trong `backend/tests/unit/channel-inbox-http.test.ts`.

## Kiểm tra

- Test mới `backend/tests/conversation-assignee-filter.test.ts` gọi route bằng Fastify inject: unassigned; ID trong quyền; ID chỉ có trên nick ngoài quyền (rỗng); không tham số; admin thấy unassigned toàn tổ chức và không thấy org khác. Mock DB kiểm list/count nhận cùng predicate và scope nick vẫn được áp dụng. Trước sửa: 2 FAIL/3 PASS; sau sửa: 5/5 PASS.
- 5 file test liên quan: 32/32 PASS (chat list/filter, gửi tin, resolve, nick scope, channel-inbox contract).
- TypeScript `tsc --noEmit -p backend/tsconfig.json`: 0 lỗi, cả baseline và candidate.
- Full-suite chạy tại cùng worktree, cùng dependency và DATABASE_URL giả localhost: baseline 1142 PASS/10 assertion FAIL/24 pending; candidate 1148 PASS/10 assertion FAIL/24 pending. 39 file FAIL ở cả hai lượt, gồm lỗi assertion và lỗi load suite/module EE hoặc DB localhost không có. So sánh tập tên assertion FAIL và file FAIL: giống nhau hoàn toàn, không FAIL mới. Con số tại checkout này khác 11 FAIL lịch sử được cung cấp; không coi full-suite PASS.
- TEST DB thật: khóa host chính xác `ep-noisy-wave-ao1zugqo.c-2.ap-southeast-1.aws.neon.tech` và env fixture development trước khi ghi. Fastify inject dùng route candidate + Prisma, JWT auth, RBAC và getZaloScope thật, không khởi động app nền hay gọi Zalo. Tạo hai nick ngắt kết nối, không session/UID, bốn khách giả; sale chỉ được cấp chat một nick. 7/7 ca PASS: sale unassigned=1, ID trong quyền=1, ID ngoài nick=0, không filter=2; admin unassigned=2, ID sale B=1, không filter=4. Dọn trong finally; còn 0 nick/khách fixture. Report và script fixture nằm ngoài repo, không chứa credential trong commit.

Chủ dự án cho phép fast-forward release khi phù hợp, cherry-pick về mobile/base và rebase nhánh test. CHƯA deploy, KHÔNG push. Không đưa env, dependency, test output hoặc runtime vào commit.
