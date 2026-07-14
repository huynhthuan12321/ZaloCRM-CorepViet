# PROMPT TRIỂN KHAI — Merge + deploy fix chat-deeplink, QA, rồi mới tới B3

> Copy toàn bộ phần dưới đây vào session Claude Code mới trên repo `D:\ZaloCRM-CorepViet`.

---

Triển khai lên production theo 4 giai đoạn CÓ CỔNG CHẶN giữa chừng. Nguyên tắc: deploy **fix chat trước, B3 sau, tách 2 đợt** (fix chat không có migration — nhẹ; B3 có migration — nặng). KHÔNG gộp trừ khi user đổi ý.

## 0. Hiện trạng & an toàn

- ⚠️ **QUAN TRỌNG (đã xác minh 2026-07-14):** branch `fix/chat-contact-deeplink` bị tạo CHỒNG LÊN branch B3 — nó chứa 3 commit chưa có trong main: `975ba93` + `ef92b64` (B3) và `77a6c25` (fix chat, HEAD). **KHÔNG được merge thẳng branch này vào main** vì sẽ kéo B3 theo → GĐ1 phải CHERRY-PICK riêng commit `77a6c25` (xem GĐ1).
- Commit `77a6c25`: fix "mở chat từ hồ sơ KH ra trống" (POST `/conversations/resolve` + composable `openContactChat` + watcher ChatView). KHÔNG có migration. Test 13 mới pass, 0 regression. CHƯA merge.
- Branch `feature/marketing-b3-target-wizard` — 2 commit `975ba93` + `ef92b64`: Mục tiêu wizard 4 bước + drawer. CÓ migration `20260714120000_target_wizard_b3` (additive). CHƯA merge, CHƯA runtime-QA.
- Working tree main có docs unstaged (`MARKETING_REVIEW_INPUT.md`, `MARKETING_B3_PROMPT.md`, `CHAT_CONTACT_DEEPLINK_*.md`, `MARKETING_B3_QA_PROMPT.md`, `DEPLOY_FIXCHAT_B3_PROMPT.md`) — gom commit docs, KHÔNG commit `.env`/`scratchpad/`/`ZALO_UPGRADE_*.md` (3 file ZALO_UPGRADE thuộc mạch việc khác — để nguyên).
- Production: `https://zalocrm.corepviet.com`, VPS thư mục `/opt/ZaloCRM-CorepViet`, docker compose service `app`. `.env` production PHẢI giữ `MARKETING_DRY_RUN=true` + `VITE_MARKETING_DRY_RUN=true` — TUYỆT ĐỐI không đổi, không gửi Zalo thật, không resume job active.
- Nếu session KHÔNG có SSH tới VPS: in block lệnh cho user tự chạy rồi CHỜ user dán output lại mới đi tiếp — không đoán kết quả.

## GIAI ĐOẠN 1 — Git local: CHERRY-PICK fix chat lên main + commit docs

1. `git status` xác nhận không có file code nào đang sửa dở (docs untracked/modified được phép — chúng đi theo checkout).
2. `git checkout main` → commit docs: `docs(marketing/chat): review input lượt 6 + kết quả đối chiếu + các prompt B3/fix-chat/deploy` (chỉ các file MARKETING_*/CHAT_*/DEPLOY_* liệt kê ở mục 0; KHÔNG gồm ZALO_UPGRADE_*/scratchpad/.env).
3. **Cherry-pick riêng commit fix** (KHÔNG merge branch): `git cherry-pick 77a6c25`.
   - Nếu conflict hoặc sau đó build fail vì thiếu code B3 (fix có đụng `ListDetailView.vue` thuộc marketing — khả năng thấp nhưng phải kiểm) → nghĩa là fix PHỤ THUỘC B3: DỪNG, báo user chọn phương án gộp (deploy cả 2 một đợt, theo trình tự migration của GĐ4).
4. **Build gate ngay trên main sau cherry-pick** (bắt buộc vì commit được test trong bối cảnh có B3): `backend npx tsc --noEmit` + chạy test resolver/route mới + `frontend vue-tsc && vite build`. Fail → dừng, báo user.
5. Push `origin/main`. KHÔNG merge B3 ở giai đoạn này. (Branch `fix/chat-contact-deeplink` giữ nguyên — GĐ4 sẽ merge `feature/marketing-b3-target-wizard`; commit fix đã lên main qua cherry-pick nên khi merge B3 xong thì branch fix bỏ được.)

## GIAI ĐOẠN 2 — Deploy VPS bản fix chat (không migration)

```bash
cd /opt/ZaloCRM-CorepViet
git fetch origin && git log --oneline -3 origin/main   # xác nhận có commit fix chat
git reset --hard origin/main
docker compose build app
docker compose up -d app
docker compose logs --tail=100 app | grep -iE "error|P2022|listen|started" || true
```
- Không cần `prisma migrate deploy` đợt này (không có migration mới) — nhưng vẫn chạy cũng vô hại nếu quy trình quen tay.
- Kiểm tra app lên lại bình thường (login được, trang Chat load).

## GIAI ĐOẠN 3 — QA runtime production (fix chat) — CỔNG CHẶN

Test bằng browser trên `zalocrm.corepviet.com` (thao tác điều hướng — an toàn, không gửi tin; KHÔNG bấm gửi tin nhắn thật trong lúc test):

| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | **Ca gốc**: `/chat?contactId=e3568945-c51c-4db0-b4be-d2e978f9b05a` (KH Hà Phạm, đã KB chưa nhắn) | Mở khung chat rỗng với nick "Huỳnh Thuận Cờ Rếp Việt" — KHÔNG còn màn trống "Chọn cuộc trò chuyện" |
| 2 | Khách hàng → hồ sơ 1 KH ĐÃ có hội thoại gần đây → "Mở chat Zalo" | Mở đúng hội thoại (regression) |
| 3 | KH có hội thoại nhưng nằm NGOÀI 50 dòng đầu (chọn KH cũ ít nhắn) | Vẫn mở đúng (ca H1) |
| 4 | KH không có Zalo → nút "Mở chat nội bộ" | Hoạt động như cũ |
| 5 | Tệp KH → icon mở chat 1 entry chỉ có SĐT (chưa gắn KH) + Lead panel | Vẫn ra luồng `?compose=`/Tin nhắn mới như cũ, không vỡ |
| 6 | Gọi lại ca 1 lần nữa (refresh) | KHÔNG tạo hội thoại trùng thứ 2 (idempotent) |

- Ghi kết quả vào `CHAT_CONTACT_DEEPLINK_QA.md` (bảng ✅/❌ + ghi chú).
- **FAIL bất kỳ ca nào → DỪNG, báo user, không sang giai đoạn 4.** PASS hết → hỏi user xác nhận cho triển khai B3.

## GIAI ĐOẠN 4 — B3 (CHỈ chạy sau khi user xác nhận ở cổng giai đoạn 3)

1. Local: merge `feature/marketing-b3-target-wizard` vào `main` (nếu conflict với fix chat → xử lý cẩn thận, ưu tiên giữ cả hai; build lại xác nhận `tsc` + `vue-tsc` pass trước khi push). Push `origin/main`.
2. VPS — đợt này CÓ migration, đúng trình tự bắt buộc:
```bash
cd /opt/ZaloCRM-CorepViet
# 1) BACKUP DB TRƯỚC (bắt buộc):
docker compose exec -T db pg_dump -U <user> <dbname> > /opt/backup/pre-b3-$(date +%Y%m%d-%H%M).sql
# (điều chỉnh theo service/user/db thật trong docker-compose.yml — kiểm tra trước, đừng đoán)
git fetch origin && git reset --hard origin/main
docker compose build app
# 2) migrate TỪ IMAGE MỚI, trước khi up:
docker compose run --rm --entrypoint "npx prisma migrate deploy" app
docker compose up -d app
docker compose logs --tail=200 app | grep -iE "P2022|does not exist|error|dry-run" || true
```
- Kỳ vọng migrate: "Applying migration `20260714120000_target_wizard_b3`" + success. Lỗi migrate → DỪNG, báo user (đã có backup).
3. QA B3 production (dry-run) theo test matrix trong `MARKETING_B3_QA_PROMPT.md` mục 3 (nhóm B/C/D — bỏ nhóm A2/A3 vì đã migrate thật ở trên), ghi vào `MARKETING_B3_QA_CHECKLIST.md`. Điểm chốt: wizard tạo job ra **nháp (paused)**, hẹn lịch 23h bị chặn, drawer "ĐÃ XỬ LÝ"/Top 3 nick, job CŨ 1-nick mở không crash, log chỉ có `[dry-run]`, KHÔNG tin Zalo nào đi ra.
4. Báo cáo tổng: 2 đợt deploy, kết quả QA từng ca, việc còn nợ (engine chuỗi tin Tin1/3/4, thẻ "Vừa trả lời", trang chi tiết Mục tiêu đầy đủ).

## Quy tắc chung

- Mỗi giai đoạn xong phải báo ngắn kết quả rồi mới sang giai đoạn kế; giai đoạn 3→4 bắt buộc chờ user xác nhận.
- Mọi lệnh phá hoại tiềm tàng (`reset --hard`, migrate) chỉ chạy trên VPS sau khi xác nhận đúng thư mục/branch; backup DB trước migrate là bắt buộc, không bỏ qua kể cả khi "migration chỉ additive".
- Không đổi `.env`, không tắt dry-run, không resume job, không gửi tin thật.
