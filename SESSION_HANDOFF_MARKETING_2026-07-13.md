# SESSION HANDOFF — Marketing EE (2026-07-13)

> **Loại:** Bàn giao cuối phiên · **docs-only** (không đụng logic sản phẩm)
> **Repo:** D:\ZaloCRM-CorepViet · **Branch:** `main` = `origin/main` = `1bd9e5b`
> **An toàn production (BẤT BIẾN):** `MARKETING_DRY_RUN=true` + `VITE_MARKETING_DRY_RUN=true` — KHÔNG gửi Zalo thật, KHÔNG resume/run-now job.

---

## 1. Tổng quan mục tiêu Marketing EE

Nâng module Marketing của ZaloCRM-CorepViet lên hướng **EE đầy đủ** (opt-out: mọi module bật mặc định), an toàn production bằng **dry-run 2 tầng**:
- **Frontend** `VITE_MARKETING_DRY_RUN` → khóa nút gửi, tạo job dạng nháp/paused.
- **Backend** `MARKETING_DRY_RUN` → cron/worker KHÔNG gọi Zalo API, chỉ ghi mock `[dry-run]`.

Menu Marketing 9 mục: Quét nhóm · Tệp khách hàng · Mục tiêu · Phiên chăm sóc · Luồng kịch bản · Bám đuổi thủ công · Gửi tin hàng loạt · Khối nội dung · Mẫu tin nhắn.

---

## 2. Các phase đã hoàn thành trong phiên

| Phase | Nội dung | Trạng thái |
|---|---|---|
| **Broadcast wizard** | Wizard 4 bước (Đối tượng→Nội dung→Nick&lịch→Kiểm tra), dry-run tạo nháp | ✅ deploy |
| **Feature flags** | Opt-out gate + truyền `VITE_*` qua Docker build-args | ✅ deploy |
| **Dry-run backend** | `config.marketingDryRun` gate 5 call-site gửi thật (broadcast/target/care-session cron) | ✅ deploy |
| **Navigation** | Đủ route/menu, alias `/templates`→`/message-templates`, `/blocks`→`/content-blocks`, placeholder an toàn | ✅ deploy |
| **Phase 3** | Content Blocks CRUD thật (block_type/variants/tags/enabled/filter) + Sequences ghép ContentBlock + Broadcast Step 2 chọn khối thật | ✅ deploy |
| **Fix UI** | Mojibake `AddFlowModal.vue` (double-encoded UTF-8→CP1252) + xác nhận route Mẫu tin nhắn đúng | ✅ deploy |
| **Phase 4.1** | Care Sessions + Manual Followup: endpoint LIST tổng + 2 trang dữ liệu THẬT + pause/stop an toàn | ✅ deploy |

---

## 3. Commit / branch liên quan

Base phiên: `f37166d` (PR #1 Marketing Phase 1–4 đã merge trước đó).

```
1bd9e5b feat(marketing): real care-session & manual-followup views from chat enrollment   [Phase 4.1]
55b92e5 fix(marketing): restore message templates route and vietnamese text                [Fix UI]
45d3169 docs(marketing): Phase 3 merge status + VPS deploy order + QA checklist
eb5fc85 feat(marketing): implement content blocks and sequences crud                       [Phase 3]
d2c8219 feat(marketing): hoàn thiện nav + placeholder an toàn                              [Nav]
5844b52 fix(marketing): backend MARKETING_DRY_RUN kill-switch + opt-out feature flags      [Dry-run BE]
5a56349 fix(marketing): pass VITE feature flags to frontend build
56a273f feat(marketing-broadcast): 4-step broadcast wizard dry-run safe                    [Broadcast]
```

Branch phụ đã merge (còn tồn tại, có thể xoá): `feature/marketing-phase3-blocks-sequences`, `feature/fix-marketing-template-route-and-font`, `feature/marketing-phase4-followup-views`, `feature/marketing-nav-placeholders`, `feature/marketing-dry-run-backend-guard`, `feature/marketing-broadcast-wizard`.

---

## 4. File/code chính đã thay đổi (từ `f37166d` → `1bd9e5b`)

**Backend:**
- `config/index.ts` — `marketingDryRun` (env `MARKETING_DRY_RUN`, default false).
- `modules/broadcast/broadcast-cron.ts`, `modules/target/target-cron.ts`, `modules/automation/care-session-cron.ts` — gate dry-run 5 call-site gửi thật.
- `modules/content-blocks/content-block-routes.ts` + `content-block-helpers.ts` (mới) — CRUD block_type/variants/tags/enabled + filter.
- `modules/automation/community-automation-routes.ts` — `GET /api/v1/automation/care-sessions` (LIST tổng) + resolveStepBlocks.
- `modules/automation/care-session-list-helpers.ts` (mới) — deriveSessionState/careSessionToListItem/summarizeSessions/stateFilterToWhere.
- `modules/automation/sequence-snapshot.ts` — `blockId` trong step.
- Migration `20260713120000_content_blocks_phase3` (additive: ADD COLUMN + INDEX).
- Tests: `content-block-phase3.test.ts`, `care-session-list.test.ts`, `broadcast-wizard.test.ts`.

**Frontend:**
- `utils/marketingFeatureFlags.ts` — opt-out gate.
- `views/marketing/ContentBlocksView.vue`, `SequencesView.vue`, `BroadcastsView.vue` — CRUD/picker thật.
- `views/marketing/CareSessionListPanel.vue` + `CareSessionsView.vue` + `ManualFollowupView.vue` (mới) — trang Phase 4.1.
- `composables/use-care-sessions.ts` + `care-session-view-logic.ts` (mới).
- `components/chat/AddFlowModal.vue` — sửa mojibake.
- `router/index.ts` — route thật + alias redirect.

**Docker:** `docker-compose.yml` + `docker/Dockerfile` — `MARKETING_DRY_RUN` runtime env + `VITE_*` build-args.

---

## 5. Lệnh deploy VPS đã dùng (an toàn)

```bash
cd /opt/ZaloCRM-CorepViet
git fetch origin && git reset --hard origin/main
grep -E 'MARKETING_DRY_RUN|VITE_MARKETING_DRY_RUN' .env   # xác nhận CẢ HAI = true (KHÔNG đổi)

# Phase 3 (có migration additive) — migrate TỪ IMAGE MỚI, không dùng container cũ:
docker compose build app
docker compose run --rm --entrypoint "npx prisma migrate deploy" app   # áp 20260713120000_content_blocks_phase3
docker compose up -d app

# Phase 4.1 / Fix UI (KHÔNG migration mới) — chỉ rebuild app:
# docker compose build app && docker compose up -d app

docker compose logs --tail=200 app | grep -E "P2022|does not exist|ERROR|\[dry-run\]" || echo "OK"
```

> **Không** `prisma migrate deploy` cho Phase 4.1 (không thêm migration). **Không** resume/run-now job nào.

---

## 6. Checklist QA đã pass (build/test)

- Backend `tsc --noEmit`: **PASS** (0 lỗi).
- Backend vitest: `content-block-phase3` **16/16**, `care-session-list` **17/17**, `care-session-timeline` PASS, `broadcast-content-block-org-scope` PASS.
- Frontend `npm run build` (vue-tsc + vite): **PASS**.
- Frontend vitest: `care-session-view-logic` **15/15**, `broadcast-wizard-logic` **14/14**.
- QA web: Phase 2 + Phase 4.1 checklist đã tick (xem `MARKETING_IMPLEMENTATION_ROADMAP.md` §5/§7 + `MARKETING_PHASE3_QA_CHECKLIST.md` §G).

---

## 7. Rủi ro còn lại

- **Chưa runtime-QA gửi Zalo THẬT** — mọi luồng gửi mới chỉ chạy dry-run. Trước khi bật production thật phải QA trên staging riêng.
- **CI chưa xanh hoàn toàn** — ~49 file test nền fail (nợ kỹ thuật, xem `scratchpad/ISSUE_TEST_HARDENING.md`), không phải regression của Marketing.
- **Search Phase 4.1** lọc client-side sau `limit=200` — org rất nhiều phiên có thể sót KH cũ. Nâng lên DB-search khi cần.
- **Chưa realtime** ở trang Care Sessions (refresh tay).
- **Neon test DB** chuỗi kết nối từng lộ trong hội thoại cũ → cần reset password (nếu chưa).
- **Dead-config:** 3 ARG `VITE_*_ENABLED` trong Docker không còn được đọc (opt-out) — vô hại, dọn khi tiện.

---

## 8. Việc nên làm tiếp (ưu tiên)

1. **P0 — Staging thật + runtime-QA luồng gửi** (PG+Redis+MinIO), bật gửi Zalo có kiểm soát trên staging trước production.
2. **P1 — Phase 4.2:** panel timeline chi tiết từng phiên (API `followup-history` đã có), tab "Cài đặt lắng nghe" (3 đích báo Owner/Quản lý/Nhóm Zalo), tỉ lệ phản hồi.
3. **P1 — B1 Broadcast hoàn thiện:** KPI KH đã nhận (tick xám) / đã xem (tick xanh) — cần cột `receivedAt`/`seenAt` + migration; nguồn Nhãn CRM / Bộ lọc động.
4. **P2 — B3 Mục tiêu wizard 4 bước:** multi-nick, chuỗi 5 tin toggle+delay, quy tắc an toàn, trang chi tiết.
5. **P2 — Khối nội dung EE còn thiếu:** AI sinh biến thể, rich-text editor, preview Zalo LIVE, UI cây folder.
6. **P3 — Dọn nợ:** CI xanh (`ISSUE_TEST_HARDENING.md`), gỡ dead-config `VITE_*_ENABLED`, xoá branch đã merge.

---

## 9. Audit file Markdown (giữ / xoá)

**File chính GIỮ + đang cập nhật:**
- `MARKETING_EE_GAP_TODO.md` — gap & checklist chính (đang cập nhật realtime).
- `MARKETING_IMPLEMENTATION_ROADMAP.md` — roadmap + QA checklist (user tick sau deploy).
- `MARKETING_PHASE3_QA_CHECKLIST.md` — QA từng bước (đã thêm §G Phase 4.1).
- `PROJECT_IMPLEMENTATION_STATUS.md` — trạng thái tổng (evidence-based).
- `todo.md` — nhật ký phiên tổng.
- `SESSION_HANDOFF_MARKETING_2026-07-13.md` — file này (bàn giao).

**File lịch sử GIỮ (tham chiếu, không sửa):** `MARKETING_ADR_001_facade_strategy.md`, `MARKETING_UPGRADE_ANALYSIS.md`, `MARKETING_REVIEW_INPUT.md`, `MARKETING_PHASE0_AUDIT.md`, `MARKETING_PHASE1_AUDIT.md`, `MARKETING_PHASE2_IMPLEMENTATION.md`, `MARKETING_BROADCAST_WIZARD_IMPLEMENTATION.md`, `AUDIT-ZALOCRM-2026-07-07.md`.

**Không có file .md tracked nào là nháp/trùng → KHÔNG xoá file nào trong git.**

**Đề xuất dọn (KHÔNG tự xoá — untracked, không ảnh hưởng repo):**
- `scratchpad/` — thư mục temp của phiên (QA fixtures `qa-phase2/*`, `ISSUE_TEST_HARDENING.md`). Không được track. Có thể xoá thủ công sau khi bàn giao xong; `ISSUE_TEST_HARDENING.md` nên chuyển thành GitHub Issue nếu muốn giữ lại nội dung tech-debt.
