# Zalo Upgrade Implementation Roadmap

Ngay cap nhat: 2026-07-14
Repo: D:\ZaloCRM-CorepViet
Trang thai an toan bat buoc: MARKETING_DRY_RUN=true, VITE_MARKETING_DRY_RUN=true.

## Nguyen Tac Trien Khai

- Khong code gui Zalo that tren production khi chua co staging.
- Khong resume/run-now job active.
- Moi migration phai co backup va rollback plan.
- Moi worker moi phai di qua ZaloGateway va check dry-run runtime.
- Moi route moi phai co RBAC/org-scope test.
- Frontend flag VITE la build-time, thay flag phai rebuild image.

## Phase 0 - Audit + Safety Guard + Staging Readiness

Muc tieu: xac nhan nen hien tai an toan truoc khi them tinh nang gui.

### File du kien xem/sua

- `docker/Dockerfile`
- `docker-compose.yml`
- `backend/src/config/index.ts`
- `backend/src/modules/**/**cron*.ts`
- `frontend/src/utils/marketingFeatureFlags.ts`
- `frontend/src/router/index.ts`
- `MARKETING_EE_GAP_TODO.md`
- `PROJECT_IMPLEMENTATION_STATUS.md`

### Viec can lam

- Kiem tra ca 2 flag dry-run tren server.
- Them diagnostics neu chua co: build flags + runtime flags.
- Scan code call `zaloOps.` truc tiep trong cron/worker.
- Scan mojibake va UTF-8 no BOM.
- Thiet lap staging voi DB/Redis/MinIO rieng.

### Test bat buoc

- Backend `npm run build`.
- Frontend `npm run build`.
- Grep khong co route chet marketing.
- Grep khong co call gui Zalo moi ngoai gateway/guard.

### Lenh verify

```bash
grep -E 'MARKETING_DRY_RUN|VITE_MARKETING_DRY_RUN' .env docker-compose.yml
docker compose logs --tail=200 app | grep -E "ERROR|P2022|dry-run|zaloOps|send" || true
```

### Dieu kien pass

- 2 flag dry-run deu true.
- Build pass.
- Khong co P2022.
- Khong co endpoint moi co the gui that.

### Rollback

- Revert commit diagnostics/safety neu gay loi UI.
- `git reset --hard <last-good-commit>` tren staging/prod.
- `docker compose up -d app` voi image cu neu can.

## Phase 1 - Backend Foundation

Muc tieu: tao nen gui Zalo tap trung va ledger truoc khi mo UI gui that.

### File du kien sua/them

- `backend/src/modules/zalo/zalo-gateway.ts`
- `backend/src/modules/zalo/zalo-send-ledger.ts`
- `backend/src/modules/zalo/zalo-rate-limit.ts`
- `backend/src/modules/zalo/zalo-media-adapter.ts`
- `backend/src/modules/broadcast/broadcast-cron.ts`
- `backend/src/modules/automation/care-session-cron.ts`
- `backend/src/modules/targets/target-cron.ts` hoac file tuong ung
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<timestamp>_zalo_send_ledger/`
- `backend/tests/zalo-gateway*.test.ts`

### Viec can lam

- Additive migration cho send ledger/attempt.
- Tao idempotencyKey theo org/action/job/recipient/step.
- Chuyen worker sang goi ZaloGateway.
- Dry-run mock result va ghi ledger status `skipped:dry_run`.
- Rate-limit/circuit breaker theo account.

### Test bat buoc

- Unit: dry-run khong goi zca-js.
- Unit: idempotency khong gui trung.
- Unit: rate-limit tra ve paused/retry.
- Integration: org-scope ledger.
- Build backend.

### Lenh verify

```bash
cd backend
npm run build
npx vitest run tests/zalo-gateway*.test.ts
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

### Dieu kien pass

- Dry-run path khong co network call den Zalo.
- Ledger ghi du actionType/status/error.
- Worker cu khong bi duplicate send.

### Rollback

- Neu migration additive: co the giu table moi khong dung.
- Neu can rollback code: revert commit, khong drop table tren prod ngay.
- Disable worker bang env kill switch neu co loi.

## Phase 2 - Frontend UI/UX

Muc tieu: hoan thien UI quan sat va tao draft an toan.

### File du kien sua/them

- `frontend/src/views/marketing/BroadcastsView.vue`
- `frontend/src/components/marketing/BroadcastDetailDrawer.vue`
- `frontend/src/views/marketing/CareSessionsView.vue`
- `frontend/src/views/marketing/ManualFollowupView.vue`
- `frontend/src/components/marketing/CareSessionDetailDrawer.vue`
- `frontend/src/views/marketing/TargetsView.vue`
- `frontend/src/views/marketing/ContentBlocksView.vue`
- `frontend/src/views/marketing/SequencesView.vue`
- `frontend/src/utils/*view-logic.ts`

### Viec can lam

- Broadcast detail: recipient/KPI/loi/queue.
- Care session timeline detail.
- Listening settings tab.
- Target wizard tao draft/paused.
- Content block editor rich-text nhe + preview.
- Safety banner dry-run ro rang.

### Test bat buoc

- Frontend build.
- Unit logic cho filter/progress/status.
- Manual QA route/menu.
- Khong nut gui that khi dry-run.

### Lenh verify

```bash
cd frontend
npm run build
npx vitest run src/utils/*logic*.spec.ts
```

### Dieu kien pass

- Menu khong route chet.
- Dry-run lock hien ro.
- Tao moi chi tao draft/paused.
- Khong co mojibake.

### Rollback

- Revert UI commit.
- Feature gate route neu UI loi.
- Khong can rollback DB neu Phase 2 khong migration.

## Phase 3 - Worker/Cron/Automation

Muc tieu: worker dung ledger/gateway va co kha nang chay an toan tren staging.

### File du kien sua

- `backend/src/modules/broadcast/broadcast-cron.ts`
- `backend/src/modules/automation/care-session-cron.ts`
- `backend/src/modules/targets/*cron*.ts`
- `backend/src/modules/zalo/zalo-gateway.ts`
- `backend/src/modules/zalo/zalo-rate-limit.ts`
- `backend/tests/*cron*.test.ts`

### Viec can lam

- Worker check global kill switch + dry-run moi tick.
- Job old quarantine khi deploy schema moi.
- Retry/backoff theo error code.
- Circuit breaker khi account disconnect.
- Metrics/log structured.

### Test bat buoc

- Cron dry-run khong goi Zalo.
- Cron active job cu khong gui neu quarantine.
- Rate-limit khong lam crash cron.

### Lenh verify

```bash
cd backend
npm run build
npx vitest run tests/*cron*.test.ts
```

### Dieu kien pass

- Log co `[dry-run]` khi dry-run.
- Khong co send thật tren prod.
- Khong co unhandled promise rejection.

### Rollback

- Bat kill switch worker.
- Revert worker commit.
- Giu ledger table neu additive.

## Phase 4 - QA Staging

Muc tieu: chay end-to-end tren staging rieng truoc production.

### Moi truong

- Domain staging rieng.
- PostgreSQL/Redis/MinIO rieng.
- Org test + nick Zalo test + KH test.
- MARKETING_DRY_RUN=true ban dau.

### Viec can lam

- Deploy staging tu main.
- Chay migration tren staging.
- QA menu, wizard, content block, sequence, broadcast, care session.
- Khi duoc phep moi test gui that voi nick/tap KH test nho.

### Test bat buoc

- Backup/restore rehearsal.
- RBAC 2 org.
- Rate-limit/disconnect simulation.
- Encoding Vietnamese.

### Lenh verify

```bash
docker compose ps
docker compose logs --tail=300 app | grep -E "ERROR|P2022|dry-run|send|rate|disconnect" || true
```

### Dieu kien pass

- Khong loi DB/schema.
- Khong gui that khi dry-run.
- Neu bat real-send tren staging, chi gui toi KH test va co ledger/audit.

### Rollback

- Reset staging ve snapshot DB.
- Rebuild image last-good.
- Tat worker/kill switch neu send loi.

## Phase 5 - Production Rollout Co Kiem Soat

Muc tieu: dua len production theo canary, van giu an toan.

### Dieu kien truoc rollout

- Staging pass day du.
- Backup production DB.
- Co commit/tag release.
- Co rollback command.
- Dry-run tren production van true trong dot dau.

### Cac buoc

1. Deploy code + migration additive.
2. Giu MARKETING_DRY_RUN=true va VITE_MARKETING_DRY_RUN=true.
3. QA UI production chi doc/draft.
4. Neu can test gui that: can phe duyet rieng, canary 1 org, 1 nick, 1 tap KH test.
5. Theo doi log/ledger/rate-limit.

### Lenh verify

```bash
grep -E 'MARKETING_DRY_RUN|VITE_MARKETING_DRY_RUN' .env docker-compose.yml
docker compose logs --tail=300 app | grep -E "ERROR|P2022|dry-run|send|rate|disconnect" || true
```

### Dieu kien pass

- Production UI on dinh.
- Khong active job ngoai y muon.
- Ledger/audit day du neu co bat canary.

### Rollback

- `git reset --hard <last-good-commit>`.
- `docker compose build app && docker compose up -d app`.
- Giu migration additive, khong drop ngay.
- Neu worker loi: bat kill switch/scale app worker mode theo cau truc hien tai.
