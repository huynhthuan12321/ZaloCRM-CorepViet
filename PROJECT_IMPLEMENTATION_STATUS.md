# ZaloCRM-CorepViet — Project Implementation Status

**Ngày kiểm tra:** 2026-07-13
**Branch:** `main`
**Commit:** `f37166d` (Merge PR #1 `feature/marketing-phase-1-4` → main; = `origin/main`)
**Reviewer:** Senior Architect / Tech Lead / QA Lead audit (evidence-based, không chỉ checkbox)

> Nguồn sự thật: **code + runtime**. Nơi tài liệu/checkbox mâu thuẫn code → lấy code. Mục chưa chạy được → `UNVERIFIED` / `BLOCKED`.

---

## 1. Executive Summary

- **Tiến độ code chức năng (functional): ~67%** (weighted — xem mục *Cách tính*).
- **Production readiness: ~40%** (core merged + migration validated trên Postgres thật + security tốt, NHƯNG chưa staging thật / chưa CI xanh / chưa runtime-QA luồng gửi / chưa backup-monitoring production).
- **Trạng thái PR:** PR #1 (`feature/marketing-phase-1-4`) **ĐÃ MERGE** vào `main` (`f37166d`). Checks/CI remote: `UNVERIFIED` (không có `gh` CLI trên máy audit).
- **Rủi ro lớn nhất:** các luồng **GỬI THẬT** (Broadcast/Target/Sequence) chưa runtime-QA với Zalo thật; CI chưa xanh (49 file test fail nợ kỹ thuật); chưa có staging/monitoring/backup production.
- **Việc ưu tiên tiếp theo:** (P0) reset password Neon đã lộ → dựng staging thật (PG+Redis+MinIO) → runtime-QA luồng gửi ở chế độ dry-run trước khi bật production.

---

## 2. Evidence Collected

| Hạng mục | Lệnh / File | Kết quả |
|---|---|---|
| Git state | `git status` / `git log` | `main`=`f37166d`, tree sạch (chỉ `scratchpad/` untracked) |
| PR merged | `git log --decorate` | `f37166d Merge pull request #1 from …/feature/marketing-phase-1-4` |
| Tracked secrets | `git ls-files \| grep .env/dist/dump` | **none** (không có secret/build/dump bị track) |
| Backend typecheck | `npx tsc --noEmit` (backend) | **exit 0** |
| Backend build | `npm run build` (backend) | **exit 0** |
| Frontend typecheck | `npx vue-tsc --noEmit` | **exit 0** |
| Frontend build | `npm run build` (frontend) | **exit 0** |
| Backend full suite | `npx vitest run` (backend) | 49 failed files / 48 passed · 46 failed tests / 457 passed / 23 skipped (526) |
| PR-specific tests | 7 file Marketing | **7 files / 67 tests PASS** |
| Frontend suite | `npx vitest run` (frontend) | **2 files / 26 tests PASS** |
| Prisma validate | `npx prisma validate` | **valid 🚀** |
| Migrate status | `npx prisma migrate status` (Neon test DB) | **"Database schema is up to date!"** (120 migrations) |
| Migration Marketing | `20260712{090000,110000,120000}` | **additive** (chỉ ADD COLUMN default + CREATE INDEX), 0 destructive |
| Runtime smoke-test | Neon test DB (session này) | facade + export CSV + template + org-isolation 2-org = **21/21** |
| Route đăng ký | `backend/src/app.ts` | customerList(+Entry), broadcast(+report), target, contentBlock, marketingFacade, messageTemplate, communityAutomation, groupScan |
| Worker/cron | `app.ts` | broadcastCron, targetCron, careSessionCron, careSessionListener, groupScanWorker — đều start |
| Feature flags | `frontend/src/utils/marketingFeatureFlags.ts` | enterprise/broadcast/sequence default **false**; dryRun default **true** |
| RBAC/tenant | `modules/rbac/owner-scope.ts`, `shared/tenant/{tenant-guard,tenant-context,org-scoped-models}.ts` | có đầy đủ hạ tầng org-isolation |

---

## 3. Git & Pull Request Status

- Branch hiện tại: `main` @ `f37166d`. `git diff origin/main...HEAD` = **rỗng** (đồng bộ remote — PR đã merge).
- Branch tồn tại: `main`, `feature/marketing-phase-1-4` (đã merge — có thể xóa), `fix/audit-2026-07-07` (stale, **UNVERIFIED** nội dung), `origin/main`.
- Working tree: **sạch** — chỉ `scratchpad/` untracked (chứa `ISSUE_TEST_HARDENING.md`, `PR_BODY.md`, log đối chứng — KHÔNG track).
- **PR #1 Marketing Phase 1–4: ĐÃ MERGE** (merge commit `f37166d`).
- **GitHub Issue #2** "clean up Community baseline test failures" đã tạo (tech-debt tracking).
- Không có secret/`.env`/dist/dump/log bị track.
- `UNVERIFIED`: trạng thái checks/CI/branch-protection trên GitHub (không có `gh` CLI — không truy vấn remote được).

---

## 4. Build / Typecheck / Test Status

### Backend
- `tsc --noEmit`: **PASS (0 lỗi)** · `npm run build` (tsc): **PASS**.

### Frontend
- `vue-tsc --noEmit`: **PASS (0 lỗi)** · `vite build`: **PASS** (cảnh báo chunk >500KB — cosmetic).
- Frontend test: **2 file / 26 test PASS**.

### Full suite baseline comparison
- Hiện tại (main đã merge): **49 failed files / 46 failed tests / 457 passed / 23 skipped**.
- Baseline `origin/main@1ed8097` (trước merge, đã kiểm bằng **git worktree** phiên này): **49 failed files / 46 failed tests / 390 passed / 23 skipped**.
- **Chênh lệch: 0 file fail mới, 0 test fail tăng; +7 file / +67 test PASS** (code Marketing) → **KHÔNG regression**.
- 49 fail = nợ kỹ thuật có sẵn (Issue #2): ~29 file thiếu module `_ee`/automation-engine, ~5 file cần DB thật (security/), ~15 file mock/assert cũ (tag/friend/chat/zalo/branding).

### PR-specific tests
- **7 file / 67 test PASS**: `marketing-facade-service`, `list-entry-filters`, `message-template-helpers`, `care-session-timeline`, `care-session-cron` (8), `care-session-listener` (7), `broadcast-audience-snapshot` (5).

---

## 5. Database & Migration Status

- `prisma/schema.prisma`: **valid**. `prisma.config.ts`: `import 'dotenv/config'` + `env('DATABASE_URL')`.
- **120 migrations**. `migrate status` = **up to date** trên DB test.
- 3 migration Marketing (`20260712090000_care_session_worker_target_followup`, `..110000_broadcast_audience_snapshot`, `..120000_marketing_phase1_indexes`): **thuần additive** (ADD COLUMN nullable/default + CREATE INDEX) → **không mất dữ liệu**.
- ⚠️ Migration **lịch sử cũ** (đã apply) có DROP/DELETE (vd `20260606090000_drop_queue_columns_from_entry`, `marketing_bullmq_rebuild`) — không phải rủi ro mới.
- **Môi trường DB đã test:** **Neon (DB TEST TẠM, rỗng)** dựng trong phiên này để chứng thực migration + endpoint. **KHÔNG phải production/staging thật.** → production vẫn cần backup + migrate deploy riêng.
- ⚠️ `CREATE INDEX` (không CONCURRENTLY) khóa ghi khi build trên `customer_list_entries` lớn.
- 🔴 **Chuỗi kết nối Neon đã lộ trong hội thoại → phải reset password.**

---

## 6. Module Progress Matrix

| Module | Status | % | Frontend | Backend | DB | Worker | Test | Runtime QA | Prod-ready |
|---|---|---:|---|---|---|---|---|---|---|
| 1. Audit/Feature Gate | DONE | 100 | ✓ guard+sidebar | ✓ flags | — | — | ✓ | ✓ | ✓ |
| 2. Marketing Facade (read) | DONE | 95 | (giữ legacy) | ✓ 9 GET org-scoped | ✓ legacy models | — | ✓ 11 | ✓ smoke | ✓ |
| 3. Tệp khách hàng | MOSTLY | 90 | ✓ đầy đủ | ✓ CRUD+export+rescan | ✓ CustomerList(+Entry) | ✓ enrichment | ✓ filter | ✓ export CSV thật | ~ (lookup Zalo chưa QA thật) |
| 4. Mẫu tin nhắn | MOSTLY | 85 | ✓ | ✓ CRUD Community (mới) | ✓ MessageTemplate(+Folder) | — | ✓ 12 | ✓ create/409 | ~ (chèn // chat chưa QA) |
| 5. Khối nội dung | PARTIAL | 35 | ✓ CRUD+ảnh+validate biến | ✓ CRUD cơ bản | ✓ ContentBlock | — | — | ✗ | ✗ (thiếu variants/version) |
| 6. Luồng kịch bản | MOSTLY | 70 | ✓ builder+reorder | ✓ CRUD+preview | ✓ AutomationSequence | ✓ care-session-cron | ✓ 8 | ✗ (chưa gửi thật) | ~ |
| 7. Bám đuổi thủ công | MOSTLY | 70 | ✓ trong Chat | ✓ manual-enroll | ✓ CareSession | ✓ cron | ✓ | ✗ | ~ (không có trang standalone) |
| 8. Mục tiêu/Target | PARTIAL | 45 | ~ modal đơn 1-nick | ✓ target-cron+invite+welcome+enroll | ✓ TargetJob(+RunItem) | ✓ target-cron | 🔧 | ✗ (rủi ro kết bạn thật) | ✗ (thiếu wizard multi-nick) |
| 9. Phiên chăm sóc | MOSTLY | 65 | ✓ FollowUpCard+HistoryDialog | ✓ followup-history+listener | ✓ CareSession(+Event) | ✓ listener | ✓ 7 | ~ (empty→404 OK; timeline có data chưa QA) | ~ (không có listening org-level) |
| 10. Broadcast | MOSTLY | 78 | ✓ **wizard 4 bước + detail 4 tab** (2026-07-13) | ✓ snapshot+count+retry+log+**draft/paused** | ✓ BroadcastJob(+Run/RunItem) | ✓ broadcast-cron | ✓ 5+**7** | ✗ (chưa QA gửi thật) | ~ (dry-run an toàn; chưa QA gửi staging) |
| 11. Vận hành/Logging/Audit | PARTIAL | 20 | — | ~ activity-logger | ~ AutomationEventLog | — | — | ✗ | ✗ (thiếu correlation-id/dashboard lỗi) |
| 12. Dashboard/KPI | NOT STARTED | 10 | ✗ | ~ facade summary + broadcast-report | — | — | — | ✗ | ✗ |
| 13. Integration (Telegram/FB/Zalo Ads) | PARTIAL | — | ~ | ✓ telegram-bridge, FB lead-ads (một phần EE) | ✓ | ~ | 🔧 (test FB fail baseline) | UNVERIFIED | UNVERIFIED (Lark/n8n: không thấy) |

Ký hiệu: ✓ có/đạt · ~ một phần · ✗ chưa · 🔧 có nhưng chưa QA.

---

## 7. End-to-End Flow Status

| Flow | Current state | Missing steps | Risk |
|---|---|---|---|
| **1. Tệp KH** (paste/CSV/Excel→normalize→dedupe→lookup Zalo→filter→export) | Code đầy đủ; **export CSV + filter đã runtime-test trên Postgres thật**; parse/dedup có unit; lookup Zalo qua pool chưa runtime-QA thật | Lookup Zalo end-to-end với nick thật | Low (export an toàn) |
| **2. Template** (tạo→unique shortcut→chèn //→track) | **Runtime-test: create + dup 409 + list OK**; chèn `//` trong Chat: code có, **chưa runtime-QA** | QA popup // trong Chat | Low |
| **3. Sequence** (tạo→reorder step→gắn contact→worker→pause reply) | Builder + worker code + **unit 8+7**; **chưa runtime end-to-end** (enroll→gửi thật) | Runtime QA enroll→send trên staging | **High (gửi thật)** |
| **4. CareSession** (session→timeline→followup-history→pause/resume/stop) | followup-history **runtime-test (empty→404 OK)**; timeline **có data chưa QA**; listener unit-test | QA timeline với event thật | Medium |
| **5. Target** (list→nick→invite→accepted→enroll) | target-cron code + unit; **chưa runtime** (cần Zalo thật) | Runtime QA + multi-nick | **High (kết bạn thật)** |
| **6. Broadcast** (audience→count→dry-run→snapshot→gửi→log→retry) | **Wizard UI 4 bước + detail 4 tab XONG** (2026-07-13); backend snapshot/count/retry/draft + **unit 5+7**; **chưa runtime gửi thật** | Runtime QA gửi trên staging (dry-run) | **Critical (gửi hàng loạt)** |

---

## 8. Completed Work (DONE / MOSTLY DONE có bằng chứng)
- **Feature-gate/scope-lock** (Phase 0): router guard + sidebar gate + dry-run default true.
- **Facade đọc** `/api/v1/marketing/*` (9 endpoint org-scoped) — test 11 + runtime smoke.
- **Tệp khách hàng**: import paste/CSV/Excel, dedupe, normalize, rescan, **Export CSV theo filter (runtime-tested trên PG thật, BOM UTF-8)**, deep-link tạo Target/Broadcast.
- **Mẫu tin nhắn Community backend** (trước EE-only): CRUD + folder + track-use + shortcut-unique (409) — runtime-tested.
- **CareSession engine**: care-session-cron (gửi bước) + listener (reply/reaction/friend/block) + **followup-history timeline** (trước EE-only) — unit 15 + runtime endpoint.
- **Broadcast backend**: audience snapshot + audience-count + retry + run-item log — unit 5.
- **Org-isolation 2-org: runtime-verified** trên Postgres thật (token org A không thấy data org B).
- **Migration 3 file additive** áp sạch trên Postgres thật (Neon).

## 9. Partially Completed Work
- **Khối nội dung** (~35%): CRUD + validate biến; thiếu variants/versioning/type/folder/preview-contact.
- **Luồng kịch bản** (~70%): builder OK; thiếu stats-per-step, step→blockId, UI luật an toàn; chưa runtime gửi.
- **Mục tiêu/Target** (~45%): backend 1-nick; thiếu wizard 4 bước + multi-nick + quota + dry-run UI.
- **Phiên chăm sóc** (~65%): timeline OK; thiếu trang standalone + cài đặt lắng nghe org-level.
- **Broadcast** (~60%): backend mạnh; thiếu wizard UI 4 bước + trang chi tiết tabs; gate off.

## 10. Not Started / Blocked
- **Dashboard/KPI Marketing** (UI conversion list→invite→accepted→replied) — NOT STARTED.
- **Vận hành/Observability**: correlation-id cho job, dashboard lỗi gửi, queue monitoring UI — NOT STARTED.
- **Standalone pages**: `/marketing/manual-followup`, `/marketing/care-sessions` (Community quản lý per-contact trong Chat).
- **Integration Lark/n8n**: không thấy trong code — `UNVERIFIED`/NOT STARTED.
- **Runtime QA luồng gửi (Sequence/Target/Broadcast)** — `BLOCKED` (chưa có staging + Zalo test).
- **Production migrate/backup/rollback thật** — `BLOCKED` (chưa có staging/production DB thật; chỉ Neon test tạm).

## 11. Technical Debt
- **49 file test fail baseline** (Issue #2): ~29 EE/missing-module, ~5 DB-integration, ~15 mock/assert cũ (`tenantTransaction` mock thiếu, branding assertion cũ). CI chưa xanh.
- **Frontend chưa dùng facade** — vẫn gọi route legacy phân tán (chủ đích theo ADR-001; nợ hợp nhất sau).
- **ContentBlock chưa versioning** — automation snapshot mới ở mức CareSession.
- **Target 1-nick** — chưa multi-nick/quota (cần schema).
- **npm scripts test chưa tách** unit/integration/ee (Issue #2 Part 4).
- **Không có CI workflow xanh** cho Community.
- **Redis/MinIO**: dev fallback in-memory; production cần Redis (rate-limit đa-instance) + MinIO (upload).

## 12. Security & Multi-Tenant Review
- **Org-isolation:** tenant-guard (`prisma-client`) + owner-scope RBAC + mọi query facade lọc `orgId` tường minh. **Runtime-verified 2-org** (không rò rỉ). ✅
- **RBAC:** `owner-scope.ts` + `rbac-middleware` + permission-groups. Export CSV dùng owner-scope. ✅
- **Dry-run** default **true**; EE gate default **false** → không gửi thật ngoài ý muốn. ✅
- **Secret:** `.env` gitignored; không có secret bị track. ⚠️ **Nhưng** DATABASE_URL Neon đã lộ trong chat → phải reset.
- `TENANT_GUARD_MODE=off` (default), `RLS_SET_CONFIG=false` — RLS Postgres chưa bật (chỉ guard tầng app). Cân nhắc bật RLS trên staging trước production.

## 13. Production Risks

**Critical**
- Luồng **Broadcast gửi hàng loạt** chưa runtime-QA — rủi ro spam/khóa nick nếu bật production mà chưa kiểm.

**High**
- **Sequence/Target gửi/kết bạn thật** chưa runtime-QA (chỉ unit + mock).
- **CI chưa xanh** (49 file fail) — không có cổng chặn regression tự động.
- **Chưa backup/migrate/rollback trên môi trường thật**; DB test là Neon tạm. Password Neon lộ.
- **Không có monitoring/observability** cho job marketing (không debug được production).

**Medium**
- Redis chưa bắt buộc (dev in-memory) → rate-limit sai nếu chạy >1 instance production không có Redis.
- ContentBlock live (chưa versioning) → sửa block có thể ảnh hưởng automation nếu nối trực tiếp sau này.
- `CREATE INDEX` non-concurrent khóa ghi khi deploy trên bảng lớn.

**Low**
- Frontend chunk >500KB (perf, không chặn).
- Branch `fix/audit-2026-07-07` stale.

## 14. Recommended Roadmap

### Priority 0 — Đóng rủi ro deploy
- Reset password Neon (đã lộ).
- Dựng **staging thật** (Postgres + Redis + MinIO), backup, `prisma migrate deploy`, chạy suite integration.
- **Runtime-QA luồng gửi** (Sequence/Target/Broadcast/CareSession-timeline) trên staging ở **dry-run** — xác nhận không gửi Zalo thật.

### Priority 1 — Tính năng giá trị cao (backend đã sẵn)
- **Broadcast wizard UI 4 bước** + trang chi tiết tabs.
- **Observability marketing**: correlation-id + dashboard lỗi gửi + queue monitoring.
- Đóng **Issue #2** → CI Community xanh.

### Priority 2 — Schema/architecture
- **ContentBlock variants/versioning** (`ContentBlockVariant` + version).
- **Target multi-nick wizard + quota** (mở schema TargetJob).
- Trang standalone Phiên chăm sóc/Bám đuổi + cài đặt lắng nghe org-level.

### Priority 3 — Hardening/observability
- Marketing KPI dashboard (facade summary → UI).
- Audit log đầy đủ + retry policy tập trung + bật RLS Postgres trên staging.

## 15. Next 10 Actions

| STT | Việc | Ưu tiên | Phụ thuộc | Kết quả mong đợi |
|---|---|---|---|---|
| 1 | Reset password DB Neon | P0 | — | Đóng lỗ hổng credential lộ |
| 2 | Dựng staging thật (PG+Redis+MinIO) + backup + migrate deploy | P0 | Hạ tầng | Môi trường QA đúng production-parity |
| 3 | Runtime-QA Sequence enroll→send (dry-run) trên staging | P0 | #2 | Xác nhận worker gửi đúng, không spam |
| 4 | Runtime-QA Broadcast audience→send (dry-run) | P0 | #2 | Chứng thực luồng gửi hàng loạt an toàn |
| 5 | Runtime-QA Target invite→accept→enroll (dry-run) | P0 | #2 | Chứng thực kết bạn + bám đuổi |
| 6 | Đóng Issue #2 (tách EE/integration/mock) → CI xanh | P1 | branch từ origin/main | Community suite 0 failed files, CI xanh |
| 7 | Broadcast wizard UI 4 bước + trang chi tiết | P1 | backend sẵn | Vận hành broadcast qua UI hoàn chỉnh |
| 8 | Observability: correlation-id + dashboard lỗi + queue monitor | P1 | — | Debug được production |
| 9 | ContentBlock variants/versioning (schema) | P2 | migration | Snapshot nội dung an toàn cho automation |
| 10 | Target multi-nick wizard + quota (schema) | P2 | migration | Chiến dịch nhiều nick + kiểm soát tốc độ |

## 16. Definition of Done for Next Milestone (Production-ready Community Marketing)
- [ ] Staging thật (PG+Redis+MinIO) + backup + `migrate deploy` thành công (không dùng Neon tạm).
- [ ] Runtime-QA 6 luồng E2E trên staging (dry-run) — không gửi Zalo thật ngoài ý muốn.
- [ ] CI Community **xanh** (Issue #2 xong) + integration suite trên DB test.
- [ ] Observability tối thiểu: log correlation-id + cảnh báo lỗi gửi.
- [ ] Rollback plan đã diễn tập trên staging.
- [ ] Bật feature gate production có kiểm soát (từng module, sau QA).

## 17. Unverified Claims / Missing Evidence
- `UNVERIFIED`: trạng thái checks/CI/branch-protection trên GitHub (không có `gh` CLI).
- `UNVERIFIED`: nội dung branch `fix/audit-2026-07-07`.
- `UNVERIFIED`: integration Lark/n8n (không thấy trong code marketing).
- `BLOCKED`: runtime-QA luồng gửi thật + migrate/backup production — chưa có staging/Zalo test.
- `UNVERIFIED`: hành vi 5 file test `security/*` khi có DB seed (hiện fail do thiếu seed/DB).
- Neon là DB **test tạm** — mọi "runtime-tested trên Postgres thật" nghĩa là **trên Neon test**, KHÔNG phải production/staging chính thức.

## 18. Final Conclusion
Module Marketing bản Community đã đạt **~67% code chức năng**: lõi đọc/facade + Tệp KH + Mẫu tin + CareSession engine + Broadcast backend **đã merge và chứng thực trên Postgres thật (Neon test)**; org-isolation & security tốt; **0 regression** so với baseline. Tuy nhiên **production readiness chỉ ~40%**: các **luồng GỬI THẬT chưa runtime-QA**, **CI chưa xanh**, **chưa có staging/monitoring/backup production**. Khuyến nghị: **KHÔNG bật gửi production** cho tới khi hoàn tất P0 (staging thật + runtime-QA dry-run các luồng gửi + reset credential). Giữ `VITE_MARKETING_DRY_RUN=true` và các EE gate = false cho tới khi QA đầy đủ.
