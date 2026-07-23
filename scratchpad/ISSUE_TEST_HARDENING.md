# test: clean up Community baseline test failures and separate EE/integration suites

> **Loại:** Tech-debt / Test hardening
> **Ưu tiên:** P1 (không chặn PR marketing, nhưng chặn "CI xanh hoàn toàn")
> **Không chặn:** PR `feat(marketing): complete Phase 1–4 community runtime integration`

## Bối cảnh

Full test suite backend của bản **Community** hiện KHÔNG xanh do nợ kỹ thuật có sẵn — **không phải** do code sản phẩm mới.

| Chỉ số | origin/main (`1ed8097`) | PR Marketing Phase 1–4 (`e4f769f`) | Chênh lệch |
|---|---:|---:|---:|
| Failed test files | 49 | 49 | 0 |
| Passed test files | 41 | 48 | +7 |
| Failed tests | 46 | 46 | 0 |
| Passed tests | 390 | 457 | +67 |
| Skipped tests | 23 | 23 | 0 |

- **PR Marketing Phase 1–4: KHÔNG thêm regression** (0 file fail mới, 0 test fail tăng).
- PR chỉ **thêm 7 file test mới / 67 test mới — tất cả pass** (`marketing-facade-service`, `list-entry-filters`, `message-template-helpers`, `care-session-timeline`, `care-session-cron`, `care-session-listener`, `broadcast-audience-snapshot`).
- ⇒ **49 file fail / 46 test fail là baseline có sẵn từ `origin/main`**, cần dọn trong issue này.

Reproduce: `cd backend && npx vitest run`.
Ghi chú env test: `backend/vitest.config.ts` set `DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test'` (vitest KHÔNG nạp `.env`).

---

## Phân loại lỗi (49 file)

### Nhóm A — Test Enterprise / automation-engine / integrations bị strip khỏi Community (29 file)
Import từ `src/_ee/...` hoặc `src/modules/automation/{blocks,queues,engine,care-session,shared,lists,sequences,triggers}/...`, `src/modules/integrations/providers/facebook/...`, `src/modules/lead-pool/...` — các module KHÔNG tồn tại trong bundle Community → `Cannot find module`.

```
tests/alias-template.test.ts
tests/block-logger.test.ts
tests/block-reason-catalog.test.ts
tests/block-types.test.ts
tests/care-notify-privacy.test.ts
tests/care-session-service.test.ts
tests/engine-gates.test.ts
tests/lead-notify.test.ts
tests/lead-pool-submit-note.test.ts
tests/materialize-from-event.test.ts
tests/quota-kind-separation.test.ts
tests/reconcile-stuck-steps.test.ts
tests/regression-m51-4-dup-status.test.ts
tests/regression-m52-reply-pause.test.ts
tests/regression-m57-reaction.test.ts
tests/render-template-vars.test.ts
tests/sequence-jobid-multistream.test.ts
tests/sequence-schedule-calculator.test.ts
tests/sequence-step-worker-block.test.ts
tests/sequence-types.test.ts
tests/trigger-types.test.ts
tests/worker-token-passthrough.test.ts
tests/security/hmac.test.ts            (import integrations/facebook-leadads/fb-adapter)
tests/unit/facebook-form-discovery.test.ts
tests/unit/facebook-token-refresh-cron.test.ts
tests/unit/facebook-webhook.test.ts
tests/unit/lead-field-mapper.test.ts
tests/unit/round-robin-assigner.test.ts
tests/unit/zalo-field-mapper.test.ts
```

### Nhóm B — Integration test cần PostgreSQL thật + seed (5 file)
Gọi `prisma.X.deleteMany/create` trong `beforeAll/afterAll` → cần DB thật, không mock.

```
tests/security/ai-capabilities.test.ts
tests/security/auth-flow.test.ts
tests/security/refresh-token-service.test.ts
tests/security/require-active-user.test.ts
tests/security/security-audit.test.ts
```

### Nhóm C — Mock / assertion lỗi thời ở domain KHÁC marketing (15 file)
Mock Prisma/zaloOps thiếu method (nhiều test trả `500`), mock drift, assertion branding cũ, hoặc test phụ thuộc module đã đổi đường dẫn.

```
tests/aggregate-emit.test.ts
tests/chat-operations-routes.test.ts
tests/chat-routes.test.ts
tests/duplicate-detector-merge-policy.test.ts
tests/friend-routes-all-nicks.test.ts
tests/friend-routes.test.ts
tests/friend-sync-cron.test.ts
tests/friend-sync-service.test.ts
tests/group-routes.test.ts
tests/org-branding-routes.test.ts        (assert 'HS Holding' vs default hiện 'Cờ Rếp Việt')
tests/profile-media.test.ts
tests/profile-routes.test.ts
tests/zalo-ghost-fix.test.ts
tests/unit/tag-dual-write.test.ts        (mock thiếu export tenantTransaction)
tests/unit/tag-service-merge.test.ts     (mock thiếu export tenantTransaction)
```

---

## Kế hoạch triển khai (4 Part)

### Part 1 — Tách EE tests khỏi Community (Nhóm A)
- **Mục tiêu:** `npm test` Community KHÔNG chạy test của bundle `_ee`/automation-engine không tồn tại; các test này chỉ chạy ở pipeline/repo Enterprise.
- **Phạm vi:** 29 file Nhóm A.
- **Cách triển khai:**
  - Ưu tiên: dùng vitest **projects/workspaces** hoặc `exclude` glob để loại nhóm EE khỏi suite Community; thêm suite `test:ee` chạy khi có bundle `_ee`.
  - Đánh dấu edition rõ ràng: gom EE test vào thư mục riêng (vd `tests/ee/**`) hoặc gate bằng cờ (`process.env.EE_ENABLED`) + `describe.skipIf`. KHÔNG `skip` bừa từng test lẻ.
  - Nếu repo EE tồn tại: chuyển file sang đó; ở Community chỉ giữ contract test cho phần Community thật.
- **Rủi ro:** Over-skip làm mất coverage nếu sau này module chuyển về Community. → Giảm thiểu: gate theo cờ edition tường minh, không exclude vĩnh viễn theo tên file rời rạc.
- **Acceptance:** 0 lỗi `Cannot find module '.../_ee/...'` / automation-engine trong suite Community; `npm run test:ee` (nếu có bundle) chạy được 29 file.
- **Ước lượng:** M (~0.5–1 ngày).

### Part 2 — Tách integration DB tests (Nhóm B)
- **Mục tiêu:** Test cần DB chạy ổn định trên **DB test riêng**, tách khỏi unit suite.
- **Phạm vi:** 5 file `tests/security/*` (+ mọi test khác gọi prisma thật phát sinh sau).
- **Cách triển khai:**
  - Gom vào nhóm `test:integration` (thư mục `tests/integration/**` hoặc tag).
  - CI: chạy trong **service container Postgres** (GitHub Actions `services: postgres`) hoặc DB test chuyên dụng; set `DATABASE_URL` test qua secret CI (KHÔNG prod/staging).
  - `prisma migrate deploy` lên DB test trước khi chạy; seed + cleanup **idempotent** (truncate/rollback), không phụ thuộc thứ tự.
- **Rủi ro:** Flaky nếu seed/cleanup không idempotent; nguy cơ trỏ nhầm DB thật. → Giảm thiểu: guard chặn nếu `DATABASE_URL` chứa host prod/staging; mỗi test tự dọn trong transaction/afterEach.
- **Acceptance:** `npm run test:integration` xanh trên DB test sạch; chạy lại nhiều lần vẫn xanh (không phụ thuộc thứ tự); không đụng prod/staging.
- **Ước lượng:** L (~1–2 ngày, gồm CI infra).

### Part 3 — Sửa mock / assertion cũ (Nhóm C)
- **Mục tiêu:** Unit test domain friend/chat/zalo/tag/branding phản ánh đúng hành vi hiện tại.
- **Phạm vi:** 15 file Nhóm C.
- **Cách triển khai:**
  - Bổ sung `tenantTransaction` vào mock của `src/shared/database/prisma-client.js` (tag-service-merge, tag-dual-write).
  - Cập nhật mock `zaloOps`/prisma thiếu method khiến route trả 500 (chat/friend/profile/group/zalo-ghost).
  - Cập nhật assertion branding hiện tại (`org-branding-routes`: default `'Cờ Rếp Việt'`).
  - Sửa test phụ thuộc module đã đổi tên/đường dẫn.
- **Rủi ro:** "Sửa cho xanh" có thể che bug thật. → Giảm thiểu: mỗi fix phải phản ánh hành vi CHỦ ĐÍCH (đọc code nguồn xác nhận), không chỉ chỉnh assertion cho khớp output; nếu phát hiện bug thật → tách issue riêng, KHÔNG che bằng skip.
- **Acceptance:** 15 file pass với mock/assert đúng hành vi hiện tại; không skip để né.
- **Ước lượng:** L (~1–2 ngày, tedious per-file).

### Part 4 — Chuẩn hóa npm scripts & CI
- **Mục tiêu:** Phân tách suite rõ ràng theo edition/loại.
- **Phạm vi:** `backend/package.json` scripts + CI workflow.
- **Cách triển khai:**
  - `test:unit` — unit thuần (không DB, không EE) — nhanh, chạy mọi PR.
  - `test:integration` — nhóm cần DB test (Part 2).
  - `test:ee` — test Enterprise (Part 1), chạy ở pipeline/repo EE.
  - `test` — Community: chạy `test:unit` (tuỳ chọn kèm `test:integration` khi có DB test).
  - Dùng vitest projects/workspaces hoặc include/exclude + tag để phân nhóm.
  - CI: job Community chạy `test:unit` (+ `test:integration` với service Postgres); KHÔNG chạy `test:ee`.
- **Rủi ro:** Đổi script phá workflow dev/CI hiện tại. → Giảm thiểu: giữ `npm test` mặc định hợp lý; cập nhật README/CI đồng bộ.
- **Acceptance:** 4 script tách rõ; CI Community xanh; tài liệu cập nhật.
- **Ước lượng:** S–M (~0.5 ngày).

**Tổng ước lượng:** ~3–5 ngày.

---

## Ràng buộc
- Branch triển khai phải tạo **từ `origin/main` mới nhất** (fetch trước; hiện `1ed8097`), độc lập PR marketing.
- **KHÔNG** dùng production/staging DB trong test — chỉ DB test riêng.
- **KHÔNG** sửa code sản phẩm nếu không cần thiết (chỉ test/mock/config/scripts/CI). Nếu phát hiện bug thật → tách issue, không vá lén.
- **KHÔNG** che lỗi thật bằng `skip` bừa — chỉ skip-by-edition có chủ đích (EE), kèm lý do.
- Community test suite phải phản ánh **đúng edition** (chỉ test phần có trong bundle Community).

---

## Definition of Done
- [ ] Community unit suite: **0 failed test files**.
- [ ] Không còn `import` module `_ee` (hoặc automation-engine bị strip) trong Community test.
- [ ] Integration suite chạy trên **DB test riêng**, idempotent, không phụ thuộc thứ tự.
- [ ] EE tests KHÔNG còn chạy trong Community CI.
- [ ] `npm test` / `test:unit` / `test:integration` / `test:ee` tách rõ.
- [ ] Không có dữ liệu/credential thật trong test.
- [ ] CI Community **xanh hoàn toàn**.

---

## Phụ lục — Bằng chứng đối chứng baseline

Đã kiểm bằng **detached git worktree** từ `origin/main@1ed8097`, test cả baseline lẫn PR trong điều kiện giống hệt (cùng máy/Node v24.16.0, `package-lock.json` identical, cùng `vitest.config.ts` + DATABASE_URL fallback, cùng lệnh `npx vitest run`):

- File fail chỉ có ở main (biến mất ở PR): **0**
- File fail mới chỉ ở PR (regression): **0**
- File fail chung: **49** (giống hệt)
- Passed tests: 390 (main) → 457 (PR) = **+67** (đúng bằng test của PR)

⇒ 49/46 fail là **nợ có sẵn**, không do PR marketing. Issue này dọn phần nợ đó.
