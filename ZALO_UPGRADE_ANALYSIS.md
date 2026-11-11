# Zalo Upgrade Analysis

Ngay cap nhat: 2026-07-14
Repo: D:\ZaloCRM-CorepViet
Production: https://zalocrm.corepviet.com/
Pham vi: Zalo SDK, Marketing EE, Broadcast, Target, Content Block, Sequence, Care Session, Manual Followup, AI/automation, cron/queue, database, UI/UX va feature flags.

## 1. Tom Tat Tai Lieu

Tai lieu nang cap duoc nhom theo cac huong chinh:

- Chuan hoa lop giao tiep Zalo SDK: gui tin, gui anh, ket ban, resolve nick/contact, xu ly disconnect/rate-limit.
- Nang cap Marketing automation: Broadcast, Target/Muc tieu, Sequence, Content Block, Care Session, Manual Followup.
- Tang an toan worker/cron/queue: dry-run, idempotency, retry, khong gui trung, khong resume job cu ngoai y muon.
- Bo sung quan sat: log, audit, delivery/seen KPI, error reason, dashboard QA.
- Nang cap UI/UX: wizard ro buoc, preview, filter, trang chi tiet, route/feature flag on dinh.
- Bo sung database schema theo huong additive-only, co backup va rollback.

Ket luan nhanh: nen khong lam lai Marketing EE tu dau. Nen xay dung tiep tren nen da co: dry-run guard, Broadcast wizard, Content Blocks, Sequences, Care Sessions, Manual Followup. Huong dung la chuan hoa ha tang ZaloGateway + ledger gui tin truoc, sau do moi mo rong UI va worker.

## 2. Nen He Thong Hien Tai

Da co:

- Marketing EE da hien menu day du va da deploy thanh cong.
- Broadcast wizard dry-run safe.
- Content Blocks CRUD, variants/tags/folder/enabled va filter send_message enabled.
- Sequences co CRUD va co the link ContentBlock vao step.
- Care Sessions va Manual Followup co trang danh sach that, pause/stop an toan.
- Dry-run 2 tang:
  - Runtime backend: MARKETING_DRY_RUN=true.
  - Build-time frontend: VITE_MARKETING_DRY_RUN=true.
- Backend cron da co guard dry-run cho broadcast, target, care-session.
- Zalo image order da sua dung: tai media URL ve temp local file roi gui qua zca-js.
- Cac docs/checklist hien co: MARKETING_EE_GAP_TODO.md, MARKETING_IMPLEMENTATION_ROADMAP.md, MARKETING_PHASE3_QA_CHECKLIST.md, PROJECT_IMPLEMENTATION_STATUS.md, SESSION_HANDOFF_MARKETING_2026-07-13.md.

## 3. Gap Analysis

| Module | Hien tai | Can nang cap | Phan loai | Ruk ro production | Huong de xuat |
|---|---|---|---|---|---|
| Zalo SDK send text/image/friend | Dang co nhieu call-site rieng le, da guard mot so cron | Tao lop ZaloGateway tap trung, idempotency, rate-limit, circuit breaker, audit log | Da co nhung can nang cap | Cao | Phase 1, staging truoc |
| Gui anh/media | Order image da fix qua temp local file | Chuan hoa helper cho moi duong gui anh/file | Da co nhung can nang cap | Trung binh | Dua vao ZaloGateway/media adapter |
| Ket ban/resolve contact | Co API va cron target cu | Can ledger, skip rule, idempotency, dry-run mock result | Da co nhung can nang cap | Cao | Khong goi that tren prod den khi co staging |
| Broadcast | Wizard 4 buoc va dry-run safe da co | KPI received/seen, recipient log, retry reason, detail timeline | Da co nhung thieu | Cao | Phase 1-2 sau ZaloGateway |
| Target/Muc tieu | Da co mot phan nen | Wizard 4 buoc day du, preview, create draft/paused, detail page | Can nang cap lon | Cao | Phase 2 sau backend foundation |
| Care Session | List page that da co | Timeline chi tiet, listening settings, response rate, realtime | Da co nhung thieu | Trung binh | Phase 2 uu tien |
| Manual Followup | List page that da co | Gan luong tu chat hoan chinh + detail timeline + stop/pause ro rang | Da co nhung thieu | Trung binh | Phase 2 |
| Content Block | CRUD/variants/tags/enabled da co | Rich-text editor, AI tao bien the, preview Zalo LIVE, folder tree | Da co nhung thieu | Thap-Trung binh | Phase 2 |
| Sequence | Link ContentBlock vao step da co | Stats page, timeline, validation block type, dry-run preview | Da co nhung thieu | Trung binh | Phase 2-3 |
| AI/automation | Da co AI config/embedding | Provider capability registry, eval log, guard cost/quota | Da co nhung thieu | Trung binh | Lam sau Zalo core |
| Cron/queue | Da co guard dry-run | Execution ledger, quarantine job cu, global kill switch, queue observability | Can nang cap | Cao | Phase 1/3 |
| Database/Prisma | Co nhieu migration, Phase 3 additive | Can migration additive-only cho send ledger/KPI | Can them | Cao | Backup bat buoc |
| Feature flags | Build-time VITE da tung gay loi, da fix plumbing | Can diagnostics page/health endpoint hien flag runtime + build-time | Da co nhung thieu | Trung binh | Phase 0 |
| Encoding tieng Viet | Da fix AddFlowModal mojibake | Can encoding lint/check UTF-8 no BOM | Da co nhung thieu | Trung binh | Phase 0 |
| RBAC/org-scope | Da co owner-scope o nhieu route | Can test org-scope cho endpoint moi | Da co nhung thieu | Cao | Bat buoc moi phase |

## 4. Ruk Ro Ky Thuat

### 4.1 Gui Zalo that ngoai y muon

Muc do: Critical.

Nguyen nhan co the xay ra:

- UI bi mo nut gui that do VITE_MARKETING_DRY_RUN sai luc build.
- Backend cron chay job active cu.
- Endpoint run-now/resume khong guard runtime.
- Developer test truc tiep zaloOps tren production.

Kiem soat bat buoc:

- MARKETING_DRY_RUN=true va VITE_MARKETING_DRY_RUN=true tren prod.
- Backend phai check config.marketingDryRun o moi call-site gui Zalo.
- Tao ZaloGateway va cam call zaloOps truc tiep tu worker moi.
- Queue/job cu phai co trang thai quarantine khi deploy tinh nang moi.
- Moi endpoint tao job phai tao draft/paused trong dry-run.

### 4.2 Cron/queue chay job cu

Muc do: Critical.

Kiem soat:

- Truoc deploy: query job active/pending.
- Sau deploy: log grep dry-run/send/resume.
- Khong resume/run-now tren prod.
- Them global kill switch cho marketing workers.

### 4.3 Migration pha du lieu

Muc do: High.

Kiem soat:

- Chi additive migration: add table/add nullable column/add default safe.
- Backup DB truoc migrate.
- Khong drop/rename column trong phase dau.
- Co rollback SQL/doc cho tung migration.

### 4.4 Feature flag build-time

Muc do: Medium-High.

Kiem soat:

- VITE flags phai truyen qua docker build.args.
- Moi deploy frontend phai rebuild, khong chi restart.
- Can trang diagnostics hien build flags va runtime flags.

### 4.5 Encoding mojibake

Muc do: Medium.

Kiem soat:

- Luu UTF-8 no BOM.
- Them script scan chuoi mojibake pho bien: `BÃ`, `Ä‘`, `Chá`, `Há`.
- Khong paste file qua terminal neu khong dam bao encoding.

### 4.6 RBAC/org-scope

Muc do: High.

Kiem soat:

- Endpoint moi phai join orgId/user scope.
- Test user A khong thay data org B.
- Audit log cho hanh dong pause/stop/create.

### 4.7 Rate-limit/Zalo API/SDK disconnect

Muc do: High.

Kiem soat:

- Central rate limiter theo accountId/actionType.
- Backoff khi Zalo API 429/404/disconnect.
- Circuit breaker khi nick disconnect.
- Log reason co cau truc, khong chi string stack.

## 5. Mau Thuan Hoac Huong Khong Nen Lam

- Khong nen them nut gui that tren production khi chua co staging rieng.
- Khong nen goi zaloOps truc tiep tu route/frontend-trigger moi.
- Khong nen dua VITE flag vao runtime .env ma khong rebuild frontend.
- Khong nen migration destructive de doi schema nhanh.
- Khong nen lam lai Block EE song song voi ContentBlock neu chua co ly do ro rang. Nen tiep tuc mo rong ContentBlock hien dang chay.
- Khong nen bo qua RBAC/org-scope vi data CRM va nick Zalo la du lieu nhay cam.

## 6. Kien Truc De Xuat

### 6.1 Backend

Them lop trung tam:

- `backend/src/modules/zalo/zalo-gateway.ts`
  - `sendText(...)`
  - `sendImage(...)`
  - `sendFriendRequest(...)`
  - `resolveContact(...)`
  - Tu check dry-run, rate-limit, idempotency, account state.
- `backend/src/modules/zalo/zalo-send-ledger.ts`
  - Ghi moi attempt: actionType, idempotencyKey, accountId, target, payloadHash, dryRun, status, errorCode, zaloMsgId.
- `backend/src/modules/zalo/zalo-rate-limit.ts`
  - Gioi han theo account/action/day/window.
- `backend/src/modules/zalo/zalo-media-adapter.ts`
  - Chuan hoa temp file cho anh/file.

API can them/sua:

- Broadcast recipient status/detail.
- Care session timeline detail.
- Listening settings read/update.
- Target wizard create draft/paused.
- Diagnostics endpoint cho flags + worker safety.

### 6.2 Prisma

Uu tien additive tables:

- `ZaloSendAttempt` hoac `OutboundMessageAttempt`.
- `BroadcastRecipientEvent` hoac bo sung recipient log neu da co model gan dung.
- `CareSessionSetting`/`AutomationListeningSetting` neu chua co.
- `SystemSafetyState` neu can global kill switch.

Khong drop/rename trong dot dau.

### 6.3 Frontend

Can them/sua:

- Diagnostics banner: dry-run runtime/build-time.
- Broadcast detail: recipient list, received/seen/error/pending.
- Care session detail drawer: timeline, step, event, pause/stop reason.
- Listening settings tab: event -> action -> notification target.
- Content Block editor: rich text nhe, preview, folder tree.
- Target wizard 4 buoc: tao draft/paused truoc.

### 6.4 Worker/Cron/Queue

Moi worker phai:

- Goi qua ZaloGateway, khong goi zaloOps truc tiep.
- Check MARKETING_DRY_RUN moi lan xu ly job.
- Co idempotencyKey de khong gui trung.
- Co circuit breaker theo account disconnect/rate-limit.
- Log structured: jobId, orgId, accountId, actionType, dryRun, result.

### 6.5 Test/Monitoring

Bat buoc:

- Unit test helper dry-run/idempotency/rate-limit.
- Integration test route RBAC/org-scope.
- Frontend test wizard guard dry-run.
- Migration test tren DB clone/staging.
- Log grep sau deploy: `ERROR|P2022|dry-run|zaloOps|send`.

## 7. Cau Hoi Can Xac Nhan Truoc Khi Code

1. Da co staging rieng voi PostgreSQL/Redis/MinIO rieng chua?
2. Co nick Zalo test va tap KH test duoc phep gui that chua?
3. Uu tien tiep theo la ZaloGateway foundation, Broadcast KPI, Care timeline, hay Target wizard?
4. Co chap nhan chinh sach migration additive-only trong 2-3 phase dau khong?
5. Tai lieu nang cap co endpoint SDK bat buoc nao can giu dung ten/contract khong?
6. Co can tach org test rieng de QA RBAC khong?
