# Bước 4A — Báo cáo AI từ nguồn hiện có

Cập nhật 01/11/2026 23:48 (+07), Asia/Ho_Chi_Minh.

**COMPLETED_PENDING_VERIFICATION**: triển khai và kiểm tra local PASS; **4B độc lập chưa thực hiện**, bước5 NOT_STARTED. Working tree chưa commit trên HEAD `eb1be0bce8f60858436b98370f3c517edcb041b7`, không có commit mới.

Đã đọc prompt chung, audit11/12, contract, checkpoint3B PASS local23:18 và kiểm tra git status trước sửa. Checkout có thay đổi AI/tenant/RLS/báo cáo và xóa TikTok từ trước; không reset/stash/ghi đè chúng, không tạo worktree/agent, commit/push/deploy. Áp dụng `vue-best-practices`; giữ framework/dependency/schema hiện có.

## Kết quả và phạm vi patch

Trước patch chưa có report AI. Sau patch có API `GET /api/v1/reports/ai`, route `/reports/ai`, tab AI, menu Báo cáo AI và link Xem báo cáo AI tại `/settings/crm/ai-assistant` theo capability báo cáo.

- Backend mới: `backend/src/modules/dashboard/ai-report-service.ts`, `ai-report-routes.ts`; thêm đăng ký route tại `backend/src/app.ts:339`.
- Frontend mới: `frontend/src/types/ai-report.ts`, `frontend/src/utils/report-access.ts`, `frontend/src/views/reports/AiReport.vue`, `AiReportSection.vue`.
- Tích hợp: `frontend/src/router/index.ts:102`, `frontend/src/views/reports/ReportsShell.vue:34`, `frontend/src/layouts/DefaultLayout.vue:49`, `frontend/src/views/settings/AiAssistantPage.vue:15`.
- Tests mới: `backend/tests/unit/ai-report.test.ts`, `frontend/src/views/reports/AiReport.dom.spec.ts`.
- Verification harness: mới `backend/scripts/reports-verification/ai-fixtures.ts`; thêm route AI và đường lỗi browser AI vào `backend/scripts/reports-verification/server.ts`. Các hook/harness khác có từ3B, không phải runtime production.
- Tài liệu: checkpoint này, README roadmap và tiến độ README gốc.

## Writer lineage đã kiểm tra trong source hiện tại

Đây là đường gọi đang có trong mã, không khẳng định provider production đang chạy hoặc dữ liệu production đầy đủ.

| Nguồn | Bằng chứng + dòng code |
|---|---|
| Auto reply | `backend/src/modules/zalo/zalo-listener-factory.ts:765` import service sau tin khách → `backend/src/modules/ai/ai-auto-reply-service.ts:73` triggerAutoReply/withTenant/runAutoReply. SDK send ở dòng283, Message.create ở dòng297: sentVia ai_auto, metadata.aiAuto=true, isLocal/dryRun theo config. Audit bot ai_auto_reply_sent ở dòng348 là fire-and-forget và catch lỗi. |
| Followup | `backend/src/app.ts:501` gọi startAiFollowupCron → `backend/src/modules/ai/ai-followup-cron.ts:50` lên lịch, dòng65 đọc config, dòng140 gọi processCandidate. Message dòng297 có ai_auto + metadata.aiAuto/aiFollowup=true, local/dryRun; audit ai_followup_sent dòng346 best-effort. |
| Nháp cần duyệt | `backend/src/modules/ai/ai-auto-reply-service.ts:201` và dòng264 gọi saveNeedsReview; dòng443 tạo AiSuggestion type auto_reply_needs_review gắn conversation/tin khách. Không có lifecycle giải quyết đủ để suy pending. |
| Áp dụng trường CRM | `backend/src/modules/ai/ai-routes.ts:680` cập nhật contact; dòng685 tạo AiSuggestionApplied/acceptedFields. Đây không phải duyệt hoặc gửi tin nhắn. |
| Usage/quota | `backend/src/modules/ai/ai-service.ts:90` đếm AiSuggestion theo ngày server và trả usedToday/maxDaily/remaining/enabled. Giữ nguyên `/ai/usage`; không dùng nó làm số model call/token/tin gửi. Timezone usage cũ không âm thầm đổi trong4A. |

Không sửa writer/cron/send policy/global switch ở lượt này. Những thay đổi writer AI hiện trong git diff là từ trước4A. Harness không import app bootstrap/provider/queue/cron hoặc đường gửi trên; không gọi AI/SDK thật hay bật exporter để test.

## Contract API, scope và thời gian

- `ai-report-routes.ts:8`: chỉ from/to theo YYYY-MM-DD, Zod strict. Filter orgId/userId/accountId hoặc ngày lỗi/đảo kỳ/quá366 ngày →400. Không có filter nhân viên/nick giả trên UI.
- Auth và `gateReportAccess` tại `ai-report-routes.ts:11`/`:13` đọc membership/grants hiện tại qua `report-scope.ts:19`. Owner/admin xem org; leader/deputy có engagement_score.access và nhóm chưa archive xem phòng/phòng con; member chưa được mở trong rollout. Quyền sửa AI không suy quyền xem org.
- `ai-report-service.ts:36`/`:41`: main manager chỉ accountIds của scope; shared chỉ nick ngoài main được cấp đọc tường minh trong readableAccountIds. Contact cộng tác không mở quyền nick. Shared không cộng vào KPI chính, không gán AI cho tác giả con người. Admin có main toàn org và shared=null.
- SQL tham số hóa, áp org predicate và JOIN Message/Conversation/ZaloAccount cùng org. UI helper `frontend/src/utils/report-access.ts:2` chỉ điều hướng; backend enforce quyền.
- Reuse resolveReportPeriod/listReportDates: đầu ngày VN inclusive, đầu ngày sau to exclusive; ngày SQL = timestamp UTC lưu DB +7 giờ. API trả from/to/asOf/timeZone. UI có Hôm nay/7/30 ngày; khoảng tùy chọn hiện hỗ trợ ở API.
- asOf là thời điểm chụp request, giới hạn sentAt/createdAt không vượt thời điểm đó; không phải historical replay hoặc transaction snapshot bất biến. Quyền/ownership hiện tại, deletion, audit đến muộn có thể làm kết quả đọc lại thay đổi.

## Metric lineage và công thức

Các count là **event trong kỳ**, tính trên bản ghi hiện còn hợp lệ, không phải snapshot tồn khách. Loại conversation hiện bị xóa/virtual/nhóm và Message đã xóa/local/dry-run/test. Không join contact để suy số tin hoặc conversion; gộp/xóa contact không tự trở thành gửi tin/chuyển đổi.

Tập Message tại `ai-report-service.ts:51`: sender self, is_local=false, is_deleted=false, deleted_at null; hội thoại 1:1 thật/chưa xóa và nick cùng org; sent_via ai_auto **hoặc boolean** metadata.aiAuto=true. Loại metadata dryRun/test/isTest bằng true hoặc chuỗi 'true'. Chuỗi aiAuto='true' không đủ nếu thiếu sentVia phù hợp. Kỳ theo Message.sentAt.

| Trường | Đơn vị và công thức | 0 / thiếu nguồn |
|---|---|---|
| sentMessages | COUNT Message hợp lệ, mỗi ID một lần. Hệ thống ghi nhận đã gửi, không bảo đảm delivery/khách nhận. | Tập rỗng=0; query lỗi=500. Audit riêng không thêm tin. |
| conversations | COUNT DISTINCT conversation_id **toàn kỳ** của tập tin hợp lệ. |0 nếu rỗng; không cộng distinct từng ngày. |
| autoReplies | Tin **đã xác định** bằng audit bot ai_auto_reply_sent cùng org/entity conversation/details.messageId; không audit followup mâu thuẫn. |0 chỉ là chưa xác định được tin nào; không chứng minh tổng auto reply thực bằng0 khi còn unclassified. |
| followups | Tin **đã xác định**: ưu tiên boolean metadata.aiFollowup; nếu thiếu dùng audit followup khớp, không audit reply mâu thuẫn. | Không suy từ suggestion hoặc từ việc thiếu audit reply. |
| unclassified | Tin hợp lệ thiếu dấu hoặc audit legacy mâu thuẫn; vẫn nằm trong tổng. | Tổng subtype đầy đủ unavailable khi >0; UI cảnh báo rõ tại `AiReportSection.vue:22`. |
| reviewDraftsCreated | COUNT AiSuggestion type auto_reply_needs_review theo createdAt, gắn conversation thật/1:1/chưa xóa/nick hợp lệ cùng scope (`ai-report-service.ts:91`). | Cả accepted=true/false đều là bản ghi đã tạo. Loại null conversation, virtual, type khác; không lấy AiSuggestionApplied. Không gọi là đang chờ/đã duyệt/đã gửi. |
| unavailable.pendingReviews | null + review_lifecycle_unavailable. | Chưa có lifecycle giải quyết đầy đủ. |
| tokens/cost | null + reason token_usage/recorded_cost_unavailable. | Không lấy quota/trace chưa đối soát/bảng giá suy đoán làm token hoặc chi phí thực tế. |
| handoffRate/conversionRate | null + reason thiếu sự kiện. | Không bịa0% hoặc lấy CRM apply làm conversion. |

Audit tại `ai-report-service.ts:65` chỉ enrichment, bool_or/group theo Message ID: trùng log không đếm kép; log orphan/khác org/conversation/future/dry-run/test không tạo thêm tin. Phân loại tại dòng77; thiếu audit không mất tổng Message. Mỗi section/ngày có `sentMessages = autoReplies + followups + unclassified`. Zero-fill ngày; UI chỉ liệt kê ngày có tin/nháp. Không có mẫu số/rate mới. Không coi số suggestion là model call hoặc số khách duy nhất.

## Fixture và đích DB đã xác minh

Đã inspect container reports-1b-verify-20261101, ID `f24db02778ffb48d1307cc3d05484fce7da84c7421b7cbd024a6ae3b409d4400`, label codex.task=reports-1b-local-verification, running, bind **127.0.0.1:55471**, data tmpfs. Query identity là reports_1b_verify/postgres; app role reports_verify_app NOSUPERUSER/NOBYPASSRLS/không owner. Không dùng DATABASE_URL mặc định làm bằng chứng.

`ai-fixtures.ts:11` khóa đích host/port/database local; seed owner chỉ tạo/upsert namespace verify-ai-* với hai org riêng, không sửa fixture3B. HTTP dùng đăng nhập/JWT thật, Prisma app role, RLS_SET_CONFIG=true và TENANT_GUARD_MODE=enforce. Không ghi token/key vào artifact; chỉ mật khẩu fixture giả trong script. Không đọc .env/secrets.

Ngày fixture **31/10/2026 VN**: start `2026-10-30T17:00:00Z`, end exclusive `2026-10-31T17:00:00Z`. Main leader5 tin/1 hội thoại (reply1, followup2, unknown2), nháp2; shared1 tin followup/1 hội thoại, nháp1. Nick ngoài scope1 và org khác1 đối chứng. Có duplicate/orphan/foreign audit, CRM apply, draft accepted/null/virtual, metadata cũ, local/dry/test/deleted/human/inbound/group/virtual và tin đúng biên.

Hai tin ngay ngoài biên là dữ liệu hợp lệ của ngày liền kề; UI30 ngày có **main7/shared1**, adminorgA9. Không mâu thuẫn oracle của riêng31/10.

## Kiểm tra thực tế

Chạy tại backend/frontend tương ứng; các test mock/PGlite không thay bằng chứng PostgreSQL/JWT/RLS.

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| SQL/route, scope, kỳ | `node node_modules/vitest/vitest.mjs run tests/unit/ai-report.test.ts tests/unit/report-scope-policy.test.ts tests/unit/report-period.test.ts tests/unit/report-period-query-boundary.test.ts` | **4 spec,37/37 PASS**,23:38:35. AI riêng15/15; PGlite in-memory, auth/membership mock. |
| DOM regression | `node node_modules/vitest/vitest.mjs run src/views/reports/AiReport.dom.spec.ts src/views/reports/AutomationReport.dom.spec.ts src/views/reports/BroadcastReport.dom.spec.ts src/views/reports/EngagementReport.dom.spec.ts src/views/reports/NickFleetReport.dom.spec.ts src/views/reports/PipelineReport.dom.spec.ts src/views/reports/SalesReport.dom.spec.ts` | **7 spec,33/33 PASS**,23:41:00 sau ghi chú phân loại cuối. AI riêng14/14; API mock/jsdom. |
| Backend type | `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS,exit0; sau đó backend chỉ thêm comment. |
| Frontend type/build | `npm.cmd run build` | PASS,vue-tsc/Vite,exit0. Còn warning bundle >500kB của app. [Log](../../artifacts/reports-ai-4a-2026-11-01/frontend-build.log). |
| Seed | `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/ai-fixtures.ts seed` | PASS,identity disposable đúng. |
| HTTP harness | `REPORT_VERIFY_BROWSER_SCENARIOS=1` rồi `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/server.ts` | Loopback30571; **15/15 checks nền PASS** mỗi lần khởi động, không gọi là15 AI tests. Có warning pg query concurrency của harness/auth hiện tại. |
| DB/JWT/HTTP AI | `node node_modules/tsx/dist/cli.mjs scripts/reports-verification/ai-fixtures.ts check` | **14/14 PASS**, chạy lại sau restart. Gồm oracle, counters, scope, JWT, filter/ngày,0/null/PII, raw SELECT app role không WHERE org vẫn chỉ thấy orgA ở Message/ActivityLog/AiSuggestion. |
| Whitespace runtime/integration | `git diff --check -- <file runtime/integration 4A>` | PASS; warning LF/CRLF. Tổng diff có thêm README gốc vẫn cảnh báo blank line EOF ở phần đuôi đã có trước; lượt này chỉ chèn tiến độ ở đầu README, giữ nguyên đuôi. |

Bằng chứng: [fixture](../../artifacts/reports-ai-4a-2026-11-01/fixture.json), [14 checks](../../artifacts/reports-ai-4a-2026-11-01/db-jwt-http-results.json), [browser observations](../../artifacts/reports-ai-4a-2026-11-01/ai-4a-browser-observations.json). Check script tại `ai-fixtures.ts:90`, raw RLS dòng120. Không sửa characterization test để che lỗi; thêm test khẳng định hành vi đúng riêng cho4A.

## Browser local — smoke triển khai, không phải4B độc lập

Browser IAB thật với frontend build/API/DB local. Lưu9 quan sát, không gọi là9 automated tests:

1. Leader mở menu/tab AI, main7/shared1 riêng, nháp2/1 và unavailable.
2. Refresh delay6s: loading và xóa toàn bộ KPI cũ.
3. 503 điều khiển: lỗi tải/Thử lại, không giả0.
4. Retry phục hồi dữ liệu thật.
5. Hôm nay đúng ngày VN: main1/shared0, thiếu nguồn vẫn unavailable.
6. Member có report/AI grant không có menu AI.
7. Member URL trực tiếp /reports/ai bị chuyển /; API trực tiếp403 có JWT thật kiểm tra riêng.
8. Admin thấy Xem báo cáo AI trong thiết lập.
9. Click link mở report AI bản cuối, org9/3 hội thoại và ghi chú partial classification.

Ảnh [leader](../../artifacts/reports-ai-4a-2026-11-01/ai-4a-leader.png), [loading](../../artifacts/reports-ai-4a-2026-11-01/ai-4a-loading.png), [error](../../artifacts/reports-ai-4a-2026-11-01/ai-4a-error.png) trước thay đổi text ghi chú; [admin cuối](../../artifacts/reports-ai-4a-2026-11-01/ai-4a-final-admin.png) sau build cuối. Không dùng ảnh AI làm bằng chứng. Chưa nghiệm thu320/390/430px.

Một lần điều hướng member khi dist vừa rebuild gặp manifest asset cũ của static harness: **loại khỏi kết quả sản phẩm**, restart đúng process sau build, đăng nhập JWT mới và chạy lại thành công. Settings config API cố ý không đăng ký trong harness; chỉ kiểm tra header link/navigation, không coi là kiểm tra cấu hình AI. Đã vô hiệu hóa lỗi503 sau test. Harness dừng sau lưu bằng chứng; container disposable giữ như lúc vào.

## Tiêu chí, rủi ro và bước kế tiếp

- Đạt local: API scope/validation/VN period/typed aggregate không PII; main/shared; không đếm kép; partial classification không đoán; nhãn nháp đúng; thiếu nguồn null; route/tab/link; loading/error/retry/stale guard và tests/build.
- Chưa đo được: pending lifecycle, cost/token thực tế, handoff/conversion và tổng subtype đầy đủ khi còn unknown. Công khai unavailable, không thay bằng0.
- Chưa nghiệm thu: **4B độc lập**, staging/production, replay migration, tải/query-plan dữ liệu đại diện, mobile và đường provider. DB local được tạo từ Prisma db push của lượt trước; không chứng minh migration history hay mọi dạng metadata lịch sử/delivery.
- Không commit/deploy hoặc thay send policy. Chỉ ghi file local và fixture DB disposable.
- Tiếp theo **4B**: đối chiếu source/fixture/oracle và browser mới; patch liên quan thay đổi thì chạy lại B. Chỉ bắt đầu5A sau4B PASS. Chưa tạo `04-ai-report-verification.md` để tránh nhận kiểm tra triển khai là độc lập.
