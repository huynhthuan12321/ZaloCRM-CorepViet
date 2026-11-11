# Remediation sau 6A — RLS 5 bảng và phân loại biên ngày

**Trạng thái: COMPLETED_PENDING_VERIFICATION.** Lượt A, 02/11/2026 14:46–14:57 (+07). 6A **không** tự chuyển thành PASS; bước tiếp là chạy lại 6A. 6B/7A/7B NOT_STARTED. Không commit/deploy.

## Phạm vi

- HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, nhánh `fix/reports-kpi-3b`, working tree dirty có sẵn (751 dòng `git status -uall` lúc bắt đầu), giữ nguyên. Không reset/stash/worktree/agent, không cài dependency. Git gọi với `-c safe.directory=...` từng lệnh.
- Trước khi làm, đã kiểm tra lượt chạy khác: không có process node/chrome của harness, không có listener ở dải port kiểm tra; container `reports-1b-verify-20261101` đã exited từ trước nên không đụng vào. Artifact riêng: [artifacts/reports-6a-remediation-20261102-1446](../../artifacts/reports-6a-remediation-20261102-1446/).
- Đã đọc: quy tắc chung trong prompt A/B, `06-acceptance.md`, `03-tenant-rls-remediation.md`, `02-postgres-rls-verification.md`, README roadmap, `tenant-rls.sql`, `schema.prisma`, các helper `6a-*`, cùng các file tenant/Prisma/worker liên quan.

## Thay đổi

| File | Dòng | Nội dung |
|---|---|---|
| `backend/prisma/rls/tenant-rls.sql` | 3–4 | Header đổi từ 70 thành 75 policy |
| `backend/prisma/rls/tenant-rls.sql` | 592–638 | ENABLE + FORCE RLS và `tenant_isolation` (USING + WITH CHECK, cùng nhánh `app.bypass_rls`) cho `care_sessions` (:602), `lead_pool_distributions`, `broadcast_jobs`, `broadcast_runs` (:635). `care_session_events` (:611) không có `org_id`, nên policy dùng `EXISTS` sang `care_sessions` theo `session_id` (join qua PK `care_sessions.id`; đã có index `care_session_events(session_id, …)`). Không đổi schema |

Giữ CRLF như file gốc. Preimage, postimage, SHA256 và `tenant-rls.diff` lưu trong artifact. Không đổi file nào trong `backend/src`, `backend/tests`, `frontend/src`: **837/837 giữ nguyên hash** (`source-integrity.json`).

Helper chỉ dùng để kiểm chứng, không được app import:
- `backend/scripts/reports-verification/6a-remediation-rls-check.ts`: seed, ma trận RLS, kiểm tra runtime qua Prisma.
- `6a2-{fixture,oracle,api-acceptance,server}.ts`, `6a2-app-role.sql`, `6a2-disposable-prisma.config.ts`: bản sao 6A chỉ đổi tên DB/port/role. Fixture và oracle thêm `pg.defaults.parseInputDatesAsUTC = true`, bắt buộc chạy với TZ=UTC, và baseline RLS 75. Helper `6a-*` cũ giữ nguyên (`6a-fixture.ts` vẫn kỳ vọng baseline 70 nên sẽ từ chối seed trên file RLS mới; đây là chủ ý, để giữ lịch sử).

## Inventory bảng tenant (122 model, trước sửa 70 có policy)

`tenant-inventory-before.json` liệt kê toàn bộ.

- **Đã thêm (5):** `care_sessions`, `care_session_events`, `lead_pool_distributions`, `broadcast_jobs`, `broadcast_runs`.
- **Có `org_id` nhưng vẫn chưa có policy (28, cố ý chưa thêm trong lượt này vì chưa rà luồng ghi):**
  - Channel / outbound: `channel_accounts`, `channel_account_access`, `browser_session_refs`, `contact_identities`, `channel_events`, `outbound_commands`.
  - Telegram / thiết bị: `telegram_bridge_config`, `telegram_user_link`, `devices`.
  - Lịch hẹn / template / knowledge: `appointment_action_links`, `message_template_folders`, `knowledge_docs`, `knowledge_chunks`.
  - Nhóm: `group_members`, `group_scans`.
  - Facebook / TikTok: `facebook_page_connections`, `facebook_form_mappings`, `facebook_lead_events`, `facebook_app_configs`, `tiktok_app_configs`, `tiktok_advertiser_connections`.
  - Phân bổ / thông báo: `sale_assignment_states`, `lead_notify_acks`.
  - Nội dung: `media_usage_events`, `content_blocks`.
  - Broadcast / target: `broadcast_run_items`, `target_jobs`, `target_run_items`.
- **Không có `org_id`, chưa có policy (20):**
  - `organizations` và `privacy_otp_tokens`, `friend_request_outbox`: không có quan hệ cha tenant.
  - 16 bảng con có cha đã bật RLS: `refresh_tokens`, `zalo_account_access`, `telegram_topic_map`, `friend_tags`, `contact_tags`, `user_preferences`, `note_reactions`, `sync_logs`, `message_reactions`, `account_folder_members`, `sequence_steps`, `customer_list_entries`, `department_members`, `user_privacy_sessions`, `customer_list_sale_assignments`, `media_album_items`.
  - `care_session_events` nằm trong nhóm này trước khi sửa.

Khuyến nghị: rà và bổ sung tiếp ở remediation riêng, ưu tiên `broadcast_run_items`, `target_jobs`/`target_run_items` (cùng luồng broadcast/automation) và nhóm channel. Bảng con không có `org_id` cần policy theo cha như `care_session_events`.

## Rủi ro rollout RLS (đã đọc code ghi/đọc)

- 5 model **không** nằm trong `ORG_SCOPED_MODELS` (`backend/src/shared/tenant/org-scoped-models.ts`), nên tenant-guard không ép có context. Khi `RLS_SET_CONFIG=true`, query ngoài mọi context sẽ trả 0 dòng / bị chặn ghi (fail-safe) thay vì lỗi.
- Các đường dùng đã rà:
  - `care-session-cron.ts:69/88`, `broadcast-cron.ts:56/67/96/104`, `stage-followup-cron.ts`, `ai-followup-cron.ts`: lấy việc đến hạn bằng `runSystemQuery` (bypass), xử lý trong `withTenant(orgId)`.
  - `care-session-listener.ts:55/138`: bọc `withTenant`.
  - `process-care-session-step.ts`: được gọi từ cron/listener trong `withTenant`.
  - `contact-routes.ts` / `merge-service.ts`: `tenantTransaction`.
  - Các route báo cáo: chạy trong context request.
- Batch `prisma.$transaction([...])` trong `broadcast-cron.ts:415` (cập nhật run item + counter run) và `care-session-listener.ts:235`: đã chạy thử đúng dạng này bằng app role, kết quả đạt (xem runtime bên dưới).
- **Chưa rà hết:** `community-automation-routes.ts`, `broadcast-routes.ts`, `dashboard-action-hub-routes.ts`, `list-entry-routes.ts`, `marketing-facade-service.ts` giả định chạy trong context request, nhưng chưa chạy thử từng route. Nên thêm 5 model vào `ORG_SCOPED_MODELS` ở lượt riêng để tenant-guard warn/enforce bắt các đường thiếu context trước khi apply RLS production.
- **Apply production:** file vẫn "CHƯA APPLY tự động". Thứ tự an toàn giữ như header: staging với `TENANT_GUARD_MODE=warn` và `RLS_SET_CONFIG=true` tới khi 0 cảnh báo → apply file → kiểm IDOR → production. App phải kết nối bằng role không owner, NOBYPASSRLS. Lượt này không chạm production.

## Kiểm tra RLS trên DB disposable

Container `reports-6a-remediation-20261102` (`055417…`, postgres:15-alpine, tmpfs, bind 127.0.0.1:55495, không mount). Đã xác minh `reports_6a_remediation|postgres|0 bảng|0 role` trước khi ghi. Chạy Prisma db push (không phải migration replay). App role `reports_6a_rem_app`: NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE, sở hữu 0 bảng. Seed giả: 2 org, mỗi org 1 user và 1 row cho mỗi bảng (thêm `broadcast_run_items`).

| Lần chạy | File RLS | Kết quả |
|---|---|---|
| **RED** `rls-matrix-red-old-rls.json` | preimage (70 policy) | **15/35**. Toàn bộ 20 ca cô lập fail: org A thấy row org B (1/1/1/1/1), không set tenant thấy 2/2/2/2/2, org A UPDATE được row org B, INSERT row org B được chấp nhận ở cả 5 bảng |
| **GREEN** `rls-matrix-green-new-rls.json` | bản mới (75 policy; catalog 75/122 bảng ENABLE+FORCE) | **35/35**. Mỗi bảng: org A thấy 1 row của mình, row org B 0, không tenant 0, bypass thấy 2, UPDATE org B ảnh hưởng 0, INSERT org B bị 42501, INSERT row của mình thành công |
| **Runtime qua Prisma** `rls-runtime-prisma.json` | bản mới | **13/13**. App role + `RLS_SET_CONFIG=true` + `TENANT_GUARD_MODE=enforce`: `withTenant(A)` đếm 1 ở cả 5 model; `findUnique` id org B → null; `runSystemQuery` (dạng cron) thấy 2; ngoài context → 0; tạo `careSessionEvent` trên phiên của mình OK, trên phiên org B bị RLS chặn; batch `$transaction` kiểu `broadcast-cron` cập nhật được (sentCount=1); `updateMany` org B → 0 |

## F6A-2 — phân loại: **lỗi harness, không phải lỗi runtime**

Container thứ hai `reports-6a2-utc-20261102` (`24d938…`, tmpfs, 127.0.0.1:55496, DB `reports_6a2_verify`, xác minh rỗng trước khi ghi). Áp `tenant-rls.sql` mới, app role `reports_6a2_app` (NOSUPERUSER/NOBYPASSRLS, sở hữu 0 bảng). Fixture và oracle chạy `TZ=UTC` với `parseInputDatesAsUTC`.

- **Tự kiểm timestamp** (`6a2/utc-self-check.txt`): `6a-contact-before-boundary` = `2026-10-31 16:59:59.999` (tức 23:59:59.999 VN ngày 31/10); `6a-contact-shared` = `2026-11-01 16:59:59.999`; hai nháp AI = `2026-11-01 11:00:00` (tức 18:00 VN). Đúng quy ước UTC của Prisma.
- **API/JWT thật** (`6a2-server.ts` ở 127.0.0.1:55497, app role, RLS_SET_CONFIG, guard enforce): **121/121 PASS** (6A cũ: 115/121). Cả 6 assertion từng FAIL đều PASS với expected giữ nguyên: leader new contacts 2; AI main/shared của leader và của deputy, mỗi phần nháp 1; custom report leader `[1,1]`. **0 expected value thay đổi** so với 6A, tức oracle 6A đúng; sai ở dữ liệu fixture lưu lệch +7h.
- Số liệu không được assert cũng khớp hướng lệch: `reviewDraftsCreated` của admin 0 → 2, `msgToday` 2 → 1, `newContactsDelta` 3 → 2.
- **Rà `src/`:** không có import `pg` thô / `new Pool` / `new Client`. Raw SQL (8 chỗ `$queryRawUnsafe`/`$executeRawUnsafe`) đều qua Prisma; Prisma gửi tham số Date theo UTC. Ghi nhận phụ: giá trị mặc định `now()`/`CURRENT_TIMESTAMP` ở DB phụ thuộc TimeZone của session; nên xác nhận DB production đặt `TimeZone=UTC`. Lượt này không kiểm tra production.

Không sửa runtime cho F6A-2.

## Test và build

| Lệnh (tại `backend/`) | Kết quả |
|---|---|
| `vitest run` 13 file: `tests/security/tenant-context`, `tenant-guard`, `tests/unit/auth-tenant-continuation`, `report-period`, `report-period-query-boundary`, `report-scope-policy`, `report-scope-postgres`, `report-http-scope`, `ai-report`, `automation-broadcast-report-availability`, `saved-report-scope`, `custom-report-response-time`, `tests/custom-report-sqli`; `DATABASE_URL` = app role trên DB disposable 55495 | **13 file, 76/76 PASS** |
| `tsc --noEmit -p tsconfig.json` | **PASS** (không emit `dist`) |

Không chạy frontend vì không đổi frontend. Integration refresh-token (cần owner role) không chạy trong lượt này.

## Cleanup

14:56: dừng harness PID15392 (55497); xóa container `reports-6a-remediation-20261102` và `reports-6a2-utc-20261102`; listener 55495/55496/55497 = 0. Không đụng `reports-1b-verify-20261101` (đã exited) hay `sketchup-api-1`. Git status trước/sau chỉ thêm artifact và helper của lượt này (`tenant-rls.sql` vốn đã ở trạng thái modified).

## Giới hạn và bước tiếp

- Schema dựng bằng db push, chưa replay migration; chưa apply hay đo RLS trên staging/production; chưa chạy thử từng route ghi còn lại; 28 bảng có `org_id` vẫn chưa có policy.
- **Bước tiếp:** chạy lại 6A (prompt 2) trên patch này, dùng helper fixture UTC (`6a2-*` hoặc bản mới có tự kiểm timestamp) và bổ sung phần browser còn thiếu. Sau đó mới 6B.
