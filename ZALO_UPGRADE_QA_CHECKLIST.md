# Zalo Upgrade QA Checklist

Ngay cap nhat: 2026-07-14
Pham vi: Zalo/Marketing/Zalo SDK upgrade tren nen ZaloCRM-CorepViet.

## 0. Safety Gate Bat Buoc

| Hang muc | Lenh/Thao tac | Pass | Ket qua |
|---|---|---|---|
| Runtime dry-run | `grep MARKETING_DRY_RUN .env` | `MARKETING_DRY_RUN=true` |  |
| Frontend dry-run | `grep VITE_MARKETING_DRY_RUN .env docker-compose.yml` | `VITE_MARKETING_DRY_RUN=true` |  |
| Khong commit .env | `git status --short` | Khong co `.env` staged |  |
| Khong run-now/resume | Review thao tac deploy | Khong goi endpoint resume/run-now |  |
| Khong gui Zalo that | Review log | Chi co dry-run/mock |  |
| Khong xoa data | Review migration/SQL | Khong drop/delete production |  |

## 1. Repo/Build Checklist

| Hang muc | Lenh | Pass | Ket qua |
|---|---|---|---|
| Backend build | `cd backend && npm run build` | 0 loi TypeScript |  |
| Frontend build | `cd frontend && npm run build` | Build pass |  |
| Prisma generate | `cd backend && npx prisma generate` | Generate pass |  |
| Migration status | `npx prisma migrate status` | No pending ngoai phase duoc phep |  |
| Log schema | `docker compose logs --tail=200 app | grep -E "P2022|does not exist"` | Khong co P2022 |  |

## 2. Database/Migration Checklist

| Hang muc | Pass/Fail |
|---|---|
| Migration chi additive: add table/add nullable column/add default safe |  |
| Co backup DB truoc deploy |  |
| Co rollback plan bang code revert/disable feature |  |
| Khong drop/rename column trong production rollout dau |  |
| Staging migrate pass truoc production |  |

## 3. Zalo SDK/Gateway Checklist

| Hang muc | Pass/Fail |
|---|---|
| Moi send text/image/friend di qua ZaloGateway |  |
| Dry-run khong goi zca-js/zaloOps send thật |  |
| Moi attempt co idempotencyKey |  |
| Moi attempt co ledger/audit status |  |
| Rate-limit theo account/action |  |
| Disconnect co circuit breaker |  |
| Media remote URL duoc tai ve temp local file truoc khi gui |  |

## 4. Broadcast Checklist

| Hang muc | Pass/Fail |
|---|---|
| Wizard 4 buoc hien dung |  |
| Step 2 chi hien ContentBlock type send_message va enabled=true |  |
| Dry-run khoa nut gui/chay that |  |
| Tao broadcast o draft/paused khi dry-run |  |
| Detail co tong KH/da gui/nhan/xem/loi/cho gui neu da lam KPI |  |
| Recipient log khong cross-org |  |
| Error reason ro rang |  |

## 5. Target/Muc Tieu Checklist

| Hang muc | Pass/Fail |
|---|---|
| Wizard 4 buoc: Tep+Nick, Loi chao+Chuoi, Quy tac an toan, Xem truoc |  |
| Dry-run tao draft/paused |  |
| Khong gui loi moi ket ban that tren prod |  |
| Skip rule khong spam: da chat, da ban, khong Zalo |  |
| Detail target co phase 1/phase 2/top nick |  |
| RBAC/org-scope dung |  |

## 6. Care Session / Manual Followup Checklist

| Hang muc | Pass/Fail |
|---|---|
| `/marketing/care-sessions` load data that |  |
| `/marketing/manual-followup` load data that |  |
| Search/filter/status dung |  |
| Pause/stop chi doi DB, khong gui |  |
| Timeline chi tiet hien events neu da lam Phase 4.2 |  |
| Listening settings co owner/manager/group Zalo neu da lam Phase 4.2 |  |
| Response rate tinh dung |  |
| RBAC/org-scope dung |  |

## 7. Content Block / Sequence Checklist

| Hang muc | Pass/Fail |
|---|---|
| CRUD ContentBlock pass |  |
| Variants/tags/folder/enabled luu dung |  |
| Disable block khong hien trong Broadcast Step 2 |  |
| Sequence step co the chon block that |  |
| Sequence worker resolve text tu block server-side |  |
| Rich-text/preview/AI variant neu da lam thi co test |  |
| Khong route chet `/marketing/blocks` va `/marketing/templates` |  |

## 8. AI/Automation Checklist

| Hang muc | Pass/Fail |
|---|---|
| Provider/model config dung |  |
| Embedding model dung provider |  |
| API key khong log plaintext |  |
| AI tao bien the khong tu dong gui |  |
| Co quota/cost guard |  |
| Co fallback khi provider fail |  |

## 9. UI/UX/Encoding Checklist

| Hang muc | Pass/Fail |
|---|---|
| Menu Marketing hien dung tat ca muc duoc bat |  |
| Feature flags build-time duoc bake dung sau rebuild |  |
| Khong mojibake tieng Viet |  |
| File UTF-8 no BOM voi component tieng Viet |  |
| Loading/empty/error/retry co du |  |
| Mobile khong overlap/clipping voi modal/wizard |  |

## 10. RBAC/Org-Scope Checklist

| Hang muc | Pass/Fail |
|---|---|
| User org A khong thay data org B |  |
| Sale chi thay nick/session trong scope |  |
| Admin/owner thay dung toan org |  |
| Endpoint moi co test org-scope |  |
| Audit log cho pause/stop/create |  |

## 11. Staging QA Checklist

| Hang muc | Pass/Fail |
|---|---|
| Staging dung DB/Redis/MinIO rieng |  |
| Staging co nick Zalo test |  |
| Dry-run staging pass truoc |  |
| Neu gui that, chi gui tap KH test nho |  |
| Log/ledger ghi dung moi attempt |  |
| Backup/restore staging da tap |  |

## 12. Production Rollout Checklist

| Hang muc | Pass/Fail |
|---|---|
| Backup production DB |  |
| Release commit/tag da xac nhan |  |
| Deploy voi dry-run true |  |
| QA UI production khong gui that |  |
| Logs khong P2022/ERROR bat thuong |  |
| Chi bat real-send neu co phe duyet rieng |  |
| Co rollback command san |  |

## 13. Lenh Theo Doi Sau Deploy

```bash
docker compose ps
docker compose logs --tail=300 app | grep -E "ERROR|P2022|dry-run|zaloOps|send|rate|disconnect" || true
grep -E 'MARKETING_DRY_RUN|VITE_MARKETING_DRY_RUN' .env docker-compose.yml
```

## 14. Dieu Kien Dung Lai Ngay

Dung rollout neu gap bat ky dieu kien nao:

- MARKETING_DRY_RUN hoac VITE_MARKETING_DRY_RUN khong phai true tren production.
- Log co send thật ngoai ke hoach.
- Cron crash lap lai.
- P2022/schema error.
- UI hien sai route gay thao tac nham.
- RBAC leak du lieu org/user.
- Zalo account bi disconnect/rate-limit hang loat.
