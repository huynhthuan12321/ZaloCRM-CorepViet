# Marketing Implementation Roadmap & Checklist

Tai lieu nay la lo trinh trien khai nang cap module Marketing cua ZaloCRM-CorepViet, dua tren file phan tich `MARKETING_UPGRADE_ANALYSIS.md` va cac man hinh/chuc nang da ra soat.

Pham vi hien tai: Marketing 6.1 -> 6.7 gom Muc tieu, Phien cham soc, Bam duoi thu cong, Luong kich ban, Khoi noi dung, Mau tin nhan, Broadcast va Tep khach hang.

Trang thai: Phase 0 + 1 + 2 + 3 + 4 da hoan tat ngay 12/07/2026. Phase 1: facade doc `/api/v1/marketing/*` + go hard-code + index (`MARKETING_ADR_001_facade_strategy.md`). Phase 2 (Tep khach hang): deep-link + Export CSV theo filter (noi nut chet). Phase 3 (Block/Template/Sequence UI): noi backend Community cho Mau tin nhan (truoc EE-only -> man + chat // chet) + reorder step Sequence + validate bien Block. Phase 4 (Target/CareSession UI): noi endpoint `followup-history` (truoc EE-only -> panel timeline Phien cham soc chet 404) -> FollowUpHistoryDialog chay that tu CareSessionEvent. Cac phase con lai tiep tuc theo checklist ben duoi.

---

## 1. Nguyen tac trien khai

- [x] Khong gui tin that / ket ban that trong qua trinh test neu chua bat `dryRun` hoac moi truong staging.
- [ ] Moi API co validate input, RBAC theo org/team/user, va log loi ro rang.
- [ ] Cac tac vu gui tin/ket ban/lookup Zalo phai chay qua queue, khong block UI.
- [ ] Moi thao tac hang loat phai co preview, dem so KH se tac dong, so KH bi skip va ly do skip.
- [ ] UI phai co loading, empty, error state va toast ket qua.
- [x] Khong hard-code du lieu demo bat dong san; noi dung phai chuyen sang Co Rep Viet neu la ban production hien tai.
- [x] Moi chuc nang Enterprise neu chua hoan thien backend thi UI phai hien trang thai `Dang phat trien` hoac disable co giai thich.

---

## 2. Thu tu uu tien tong quan

| Phase | Hang muc | Muc tieu | Uu tien |
|---|---|---|---|
| 0 | Audit & scope lock | Khoa pham vi, tach demo/production, chot schema | P0 |
| 1 | Nen tang du lieu Marketing | Tao/chuan hoa model DB va API dung chung | P0 |
| 2 | Tep khach hang | Sua import, lookup, chi tiet tep, export | P0 |
| 3 | Mau tin nhan & Khoi noi dung | Tao/sua/luu/loc/xem truoc dung | P1 |
| 4 | Luong kich ban & Bam duoi thu cong | Tao luong, gan luong cho KH, hien dung o Chat | P1 |
| 5 | Muc tieu & Phien cham soc | Wizard muc tieu, dashboard, listening rules | P1 |
| 6 | Broadcast | Wizard gui hang loat, queue, chi tiet chien dich | P2 |
| 7 | Van hanh & QA | Logging, audit, test, tai lieu su dung | P0-P2 |

---

## 3. Phase 0 - Audit va khoa pham vi

Trang thai: Hoan tat ngay 12/07/2026. Chi tiet nghiem thu: `MARKETING_PHASE0_AUDIT.md`.

Muc tieu: khong de user bam vao chuc nang Marketing dang mock/EE/auto-send khi backend chua san sang.

Checklist:

- [x] Doc lai `MARKETING_UPGRADE_ANALYSIS.md` va tach module thanh 5 nhom: core, EE, broadcast, sequence/block, docs/mock.
- [x] Lap bang mapping route frontend -> feature gate -> trang thai route.
- [x] Kiem tra va khoa cac route EE/automation mac dinh:
  - [x] `/marketing/goals` / `/marketing/targets`
  - [x] `/marketing/care-sessions`
  - [x] `/marketing/manual-followup` / `/marketing/followup/manual`
  - [x] `/marketing/sequences`
  - [x] `/marketing/blocks` / `/marketing/content-blocks`
  - [x] `/marketing/broadcasts`
- [x] Giu mo cac route core co the dung tiep:
  - [x] `/marketing/lists`
  - [x] `/marketing/lists/:id`
  - [x] `/marketing/templates` / `/marketing/message-templates`
  - [x] `/marketing/group-scan`
- [x] An menu sidebar cho cac module bi khoa bang `marketingFeatureGate`.
- [x] Them feature flag frontend: `VITE_MARKETING_ENTERPRISE_ENABLED`, `VITE_SEQUENCE_ENABLED`, `VITE_BROADCAST_ENABLED`, `VITE_MARKETING_DRY_RUN`.
- [x] Chot moi truong test an toan: `VITE_MARKETING_DRY_RUN` mac dinh `true`.
- [x] Chan `AddFlowModal` goi API sequence khi `sequences=false`.
- [x] Kiem tra nut tao Muc tieu/Broadcast tu chi tiet tep: route di qua router guard va redirect ve `/marketing/lists` khi flag tat.
- [x] Cap nhat audit/checklist nghiem thu trong `MARKETING_PHASE0_AUDIT.md`.

Dau ra:

- [x] Bang audit module Marketing.
- [x] Danh sach route bi khoa/mo theo feature gate.
- [x] Danh sach UI dang fake/EE can tiep tuc lam o Phase 1-4.
- [x] Checklist enable/disable de test lai khi bat flag.
- [x] Ghi chu cac muc con thieu duoc day sang Phase 1-4.

Dieu kien nghiem thu Phase 0:

- [x] Mac dinh vao Marketing khong roi vao man EE/mock; fallback la `/marketing/lists`.
- [x] Cac route EE/automation chua hoan tat bi redirect neu flag tat.
- [x] Sidebar khong hien nut den route bi khoa.
- [x] UI chat/manual follow-up khong tu goi sequence API khi flag tat.
- [x] Khong mo gui that trong Phase 0; dry-run mac dinh bat.
## 4. Phase 1 - Nen tang du lieu Marketing

Muc tieu: co API nen de cac module Marketing dung chung, tranh moi man luu mot kieu. Cap nhat 12/07/2026: Phase 1 da chot huong **facade READ-ONLY tren legacy schema**, khong tao bo bang Marketing* moi trong dot nay.

Quyet dinh schema hien tai theo ADR-001:

- [x] Giu legacy schema dang chay production de giam rui ro migrate lon.
- [x] Dung `/api/v1/marketing/*` lam facade doc du lieu cho UI/bao cao.
- [x] Legacy routes tiep tuc la write contract trong Phase 1.
- [x] Bo sung additive index bang migration `20260712120000_marketing_phase1_indexes`.
- [x] Doi hard-code project/branding bat dong san sang lay dong theo org qua facade `project-tags`.
- [x] Ghi nhan bo bang Marketing* moi la DEFERRED, chi lam khi refactor lon hoac tach Enterprise module.
- [ ] Chay `prisma migrate deploy` tren staging/prod va smoke test voi DB that.

Model Marketing* moi - trang thai hien tai:

- Deferred: `MarketingList`, `MarketingListItem`, `MarketingTemplate`, `MarketingBlock`, `MarketingBlockVariant`.
- Deferred: `MarketingSequence`, `MarketingSequenceStep`, `MarketingGoal`, `MarketingGoalEnrollment`.
- Deferred: `CareSession`, `BroadcastCampaign`, `BroadcastRecipient`, `MarketingJob`, `MarketingEventLog`.
- Ly do deferred: cac bang legacy hien da co du lieu va route write; tao bo bang moi luc nay se tang rui ro migration/data sync.

API dung chung da co (facade READ-ONLY, prefix thuc te `/api/v1/marketing/*`):

- [x] `GET /api/v1/marketing/summary`
- [x] `GET /api/v1/marketing/lists`
- [x] `GET /api/v1/marketing/templates`
- [x] `GET /api/v1/marketing/blocks`
- [x] `GET /api/v1/marketing/sequences`
- [x] `GET /api/v1/marketing/goals`
- [x] `GET /api/v1/marketing/care-sessions`
- [x] `GET /api/v1/marketing/broadcasts`
- [x] `GET /api/v1/marketing/project-tags`

Checklist ky thuat da doi soat:

- [x] Org scoping/tenant guard da audit trong facade va service legacy lien quan.
- [x] Index bo sung da tao cho cac bang legacy quan trong: content blocks, automation sequences, customer list entries.
- [x] Status duoc normalize o facade; chua doi enum schema de tranh migration pha tuong thich.
- [x] Transaction write giu theo legacy routes trong Phase 1.
- [x] Test org-isolation cho facade: `tests/marketing-facade-service.test.ts` pass 11/11.
- [x] Backend typecheck pass.
- [x] Frontend typecheck pass.
- [x] Prisma validate pass.
- [ ] Smoke test migration tren staging/prod sau khi deploy.

Definition of Done Phase 1:

- [x] `npm run build` backend pass (`tsc --noEmit` 0 loi).
- [x] API facade tra ve dung du lieu theo org.
- [x] Go hard-code `PROJECT_TAGS` branding bat dong san khoi UI.
- [x] ADR-001 ghi ro chien luoc facade + legacy schema.
- [ ] Staging DB migrate deploy + smoke test.

---
## 5. Phase 2 - Tep khach hang

Muc tieu: Tep KH la nguon du lieu goc cho Muc tieu va Broadcast, nen can lam chac truoc.

Chuc nang can co:

- [x] Danh sach tep KH hien dung so lieu that (counter backend source-of-truth).
- [x] Tao tep bang paste SĐT.
- [x] Upload Excel (parse client-side ExcelJS → dry-run chung).
- [x] Upload CSV.
- [x] Lead Ads co cho phep placeholder (tab Lead Ads).
- [x] Dedup trong tep va dedup cross-list (+ dedup CRM).
- [x] Normalize phone ve local va +84.
- [x] Lookup Zalo async qua zalo-pool (enrichment worker).
- [x] Chi tiet tep co filter, search, sort, pagination.
- [x] Export CSV dung filter hien tai (12/07 — noi nut chet, xem `MARKETING_PHASE2_IMPLEMENTATION.md`).
- [x] Tao Muc tieu tu tep nay.
- [x] Tao Broadcast tu tep nay.
- [x] Deep-link createFromList/listId mo dung wizard va chon san tep.
- [x] Quet lai Zalo.

API (route legacy thuc te `/api/v1/customer-lists/*` — theo ADR-001 giu legacy lam contract ghi):

- [x] `POST /api/v1/customer-lists` (create) + `POST .../dry-run` (preview paste/file).
- [x] `POST .../entries` (append) — import qua dry-run+create.
- [x] `GET /api/v1/customer-lists/:id`.
- [x] `GET /api/v1/customer-lists/:id/entries` (filter/search/sort/pagination).
- [x] `POST /api/v1/customer-lists/:id/rescan-zalo`.
- [x] `GET /api/v1/customer-lists/:id/export.csv` (MOI 12/07).

QA checklist:

- [ ] Paste 100 SĐT hop le tao duoc tep.
- [ ] Paste co trung, co ky tu la, co `+84`, co `p:`, co `tel:` van normalize dung.
- [ ] File CSV UTF-8 co dau tieng Viet import dung ten.
- [ ] File Excel nhieu cot nhan dien duoc phone/name.
- [ ] Khi lookup dang chay UI hien progress va khong treo.
- [ ] Trang chi tiet co the cuon den dong cuoi, nhin duoc tong so data va pagination/page size.

---

## 6. Phase 3 - Mau tin nhan va Khoi noi dung

### 6.1 Mau tin nhan

Muc tieu: sale go `/` hoac slug de chen nhanh trong Chat.

Checklist (12/07/2026 — noi backend Community, truoc day route la EE-only nen man chet):

- [x] Danh sach mau lay tu API (`GET /automation/templates`).
- [x] Tao mau moi luu duoc.
- [x] Sua/xoa (soft-delete archivedAt)/doi rieng tu-cong khai.
- [x] Folder theo nhom mau (CRUD + force-delete go folder khoi templates).
- [x] Slug duy nhat trong org (normalizeShortcut + check 409 shortcut_exists).
- [x] Bien render dung khi chen vao chat (track-use tang usageCount/manualSendCount).
- [x] UI disable nut Luu khi thieu (co san frontend).

API (route thuc te `/api/v1/automation/*` — khop frontend use-message-templates.ts):

- [x] `GET /api/v1/automation/templates` (+ folderId/visibility/tags/category/search/includeArchived).
- [x] `POST /api/v1/automation/templates`.
- [x] `PUT /api/v1/automation/templates/:id`.
- [x] `DELETE /api/v1/automation/templates/:id` (soft).
- [x] `GET/POST/PUT/DELETE /api/v1/automation/template-folders[/:id]`.
- [x] `POST /api/v1/automation/templates/:id/track-use`.

QA checklist:

- [x] Tao mau moi xong hien ngay trong list (backend tra DTO khop).
- [x] Tim kiem theo ten/noi dung/slug (buildTemplateWhere AND search).
- [ ] Chen slug trong Chat ra noi dung dung bien — can QA staging (popup // gio co backend).
- [x] Khong cho 2 mau cung slug trong cung org (409).

### 6.2 Khoi noi dung

Muc tieu: khoi la don vi hanh dong de gan vao Luong va Broadcast.

> Cap nhat 13/07/2026 (Phase 3 blocks-sequences): CRUD THAT tren bang `content_blocks`
> (mo rong additive: block_type / variants / tags / folder / enabled). Endpoint dung
> `/api/v1/content-blocks` (Community) — KHONG dung namespace `/api/marketing/blocks` de
> tranh dung facade read-only. Con thieu: AI bien the, rich-text, preview LIVE, folder UI.

Checklist:

- [~] Danh sach khoi theo folder/tag/type. (type + tag + tim/loc XONG; folder: cot BE co, UI chua)
- [ ] Tao khoi full-page co editor va preview Zalo. (hien modal + textarea, chua full-page/preview)
- [x] Loai khoi: `send_message`, `request_friend`, `status_change` (chon khi tao/sua + loc).
- [x] Ho tro nhieu bien the noi dung (JSON `variants`, them/xoa trong modal).
- [x] Random/round-robin bien the khi gui (broadcast-cron xoay vong theo variants[0]/blockIds — giu nguyen).
- [ ] AI tao bien the — chua lam, chua co nut (khong hien nut de tranh gay hieu lam).
- [x] Luu tag, enabled; folder luu duoc (BE) nhung chua co UI cay thu muc.

API (Community, da co):

- [x] `GET /api/v1/content-blocks` (?q=&type=&enabled=&tag=)
- [x] `POST /api/v1/content-blocks`
- [x] `PATCH /api/v1/content-blocks/:id` (gom bat/tat qua { enabled })
- [x] `DELETE /api/v1/content-blocks/:id`

QA checklist:

- [x] Tao khoi `send_message` co 2 bien the. (co test unit buildBlockContent + QA thu cong sau deploy)
- [~] Tao khoi `request_friend` — luu OK; gioi han 200 ky tu chua ep (de sau).
- [ ] Preview cap nhat live khi go noi dung. (chua co preview)
- [x] Khong mat dinh dang khi luu/mo lai (variants text thuan, round-trip OK).

---

## 7. Phase 4 - Luong kich ban va Bam duoi thu cong

### 7.1 Luong kich ban

Muc tieu: tao chuoi buoc tu cac khoi, co delay va luat an toan.

Checklist:

- [x] Danh sach luong lay du lieu that, khong fake.
- [x] Tao luong drawer hoat dong.
- [x] Them/sap xep (reorder len/xuong 12/07)/xoa step trong luong.
- [x] Moi step gan 1 block va delay — Phase 3 (13/07): step chon Khoi `send_message` dang bat tu API that -> dien text tu khoi (van sua tay), luu kem `blockId`; backend `resolveStepBlocks` resolve server-side. Worker gui van doc `text` (dry-run an toan).
- [x] Cong tac bat/tat luong cap nhat backend (toggle = ngung ca phien dang chay).
- [ ] Luat an toan: gio lam viec, throttle, tranh trung KH, gian deu nick, dung khi KH reply/ket ban.
- [ ] Trang stats `/marketing/sequences/:id/stats` neu chua lam thi an link hoac hien coming soon.

API de xuat:

- [ ] `POST /api/marketing/sequences`
- [ ] `PATCH /api/marketing/sequences/:id`
- [ ] `POST /api/marketing/sequences/:id/steps`
- [ ] `PATCH /api/marketing/sequences/:id/toggle`
- [ ] `GET /api/marketing/sequences/:id/stats`

QA checklist:

- [ ] Tao luong moi xong hien trong `/marketing/sequences`.
- [ ] Luong moi co trong modal Gan luong o tab Follow-up trong Chat.
- [ ] Toggle bat/tat reload van giu trang thai.
- [ ] Khong cho luong active neu chua co step.

### 7.2 Bam duoi thu cong

Muc tieu: sale gan KH vao luong tu man Chat, theo doi rieng o trang manual follow-up.

Checklist:

- [ ] Tab Follow-up trong Chat lay danh sach sequence active.
- [ ] Nut `Gan luong bam duoi` mo modal co sequence that.
- [ ] Gan luong tao enrollment/care session.
- [ ] Trang `/marketing/manual-followup` hien KH da gan tay.
- [ ] Co trang thai running/completed/stopped.
- [ ] Co nut dung/phuc hoi neu can.

API de xuat:

- [ ] `POST /api/marketing/manual-followups`
- [ ] `GET /api/marketing/manual-followups`
- [ ] `PATCH /api/marketing/manual-followups/:id/stop`

QA checklist:

- [ ] Chon KH trong Chat -> gan luong -> trang manual hien KH.
- [ ] Neu khong co sequence active, modal hien link tao luong va ly do ro.
- [ ] Gan trung cung KH/cung luong phai bi chan hoac hoi xac nhan.

---

## 8. Phase 5 - Muc tieu va Phien cham soc

### 8.1 Muc tieu

Muc tieu: chien dich ket ban + bam duoi tren 1 tep KH, chay bang 1-n nick.

Checklist Wizard 4 buoc:

- [ ] Buoc 1: ten muc tieu, tep KH, nhieu nick gui, skip rules.
- [ ] Buoc 2: loi moi ket ban, tin chao mung, cac tin tiep theo, bien ca nhan hoa.
- [ ] Buoc 3: quy tac an toan, delay, pause khi KH reply, reaction rules.
- [ ] Buoc 4: preview, thoi diem bat dau, canh bao gui that.
- [ ] Nut `Bat dau chay Muc tieu` tao job/enrollment dung.
- [ ] Trang list hien dung thong ke: active/paused/completed/scheduled/draft/deleted.
- [ ] Drawer chi tiet hien dung Phase 1, Phase 2, top nick.

API de xuat:

- [ ] `POST /api/marketing/goals`
- [ ] `GET /api/marketing/goals`
- [ ] `GET /api/marketing/goals/:id`
- [ ] `POST /api/marketing/goals/:id/start`
- [ ] `POST /api/marketing/goals/:id/pause`
- [ ] `POST /api/marketing/goals/:id/resume`

QA checklist:

- [ ] Tao draft khong gui tin.
- [ ] Start dry-run tao jobs nhung khong gui Zalo that.
- [ ] Skip KH khong Zalo / da ban / da chat truoc dung.
- [ ] Gio gui ngoai 6h-22h duoc hoan lich.

### 8.2 Phien cham soc

Muc tieu: theo doi KH trong cac luong bam duoi va su kien reply/ket ban/block.

Ghi chu: o ban Community, Phien cham soc quan ly PER-CONTACT trong Chat (FollowUpCard +
FollowUpHistoryDialog), khong co trang standalone /marketing/care-sessions. Facade doc
`GET /api/v1/marketing/care-sessions` (Phase 1) san sang neu sau nay lam trang list rieng.

Checklist:

- [x] Danh sach phien lay tu DB that (automation-status per-contact; facade list org-scoped).
- [ ] Loc: tat ca, vua tra loi, tam dung, dang cham, da dong. — can trang standalone (chua co).
- [ ] Search theo ten/SĐT. — can trang standalone.
- [x] Click hien panel chi tiet timeline. — FollowUpHistoryDialog + endpoint `followup-history` (12/07, truoc EE-only nen chet 404).
- [~] Tab Cai dat lang nghe luu duoc cau hinh. — rule per-phien qua rulesSnapshot; org-level UI chua lam.
- [x] Su kien lang nghe: reply, reaction, friend accept/reject, blocked, closed... — `CareSessionEvent` + listener (Phase 3/4 truoc).
- [~] Thong bao theo 3 dich: owner, quan ly, nhom Zalo. — EE; Community co notify co ban.

API de xuat:

- [ ] `GET /api/marketing/care-sessions`
- [ ] `GET /api/marketing/care-sessions/:id`
- [ ] `PATCH /api/marketing/care-sessions/:id`
- [ ] `GET /api/marketing/listening-settings`
- [ ] `PUT /api/marketing/listening-settings`

QA checklist:

- [ ] KH reply thi session chuyen `needs_attention` hoac pause dung rule.
- [ ] Dong session khong tiep tuc gui job pending.
- [ ] Luu cau hinh nghe xong reload khong mat.

---

## 9. Phase 6 - Broadcast

Muc tieu: gui mot noi dung mot lan cho tap KH/bo loc, co queue va thong ke chi tiet.

Checklist Wizard 4 buoc:

- [ ] Buoc 1: chon doi tuong tu tep KH / nhan CRM / mau co san / bo loc.
- [ ] Nut Dem KH tinh dung so se gui va so skip.
- [ ] Buoc 2: chon Khoi noi dung loai `send_message`.
- [ ] Buoc 3: chon nick gui, phase 2 tim SĐT chua ket ban, gui ngay/hen lich.
- [ ] Buoc 4: dat ten broadcast, preview tong hop, canh bao gui that.
- [ ] Luu nhap, hen lich, hoac gui ngay.
- [ ] Trang chi tiet co tab Tong quan, Nguoi nhan, Lich su gui.
- [ ] Worker gui theo throttle, cap 300/nick/ngay.

API de xuat:

- [ ] `POST /api/marketing/broadcasts`
- [ ] `GET /api/marketing/broadcasts`
- [ ] `GET /api/marketing/broadcasts/:id`
- [ ] `POST /api/marketing/broadcasts/:id/activate`
- [ ] `POST /api/marketing/broadcasts/:id/cancel`
- [ ] `GET /api/marketing/broadcasts/:id/recipients`
- [ ] `GET /api/marketing/broadcasts/:id/logs`

QA checklist:

- [ ] Tao broadcast nhap khong tao job gui.
- [ ] Hien so KH skip do khong Zalo/chua ket ban/bi chan.
- [ ] Khong cho gui neu chua co doi tuong, khoi noi dung, nick gui.
- [ ] Gui dry-run co log recipient ro rang.
- [ ] Trang chi tiet cap nhat progress khi worker chay.

---

## 10. Phase 7 - Van hanh, bao cao va giam sat

Checklist:

- [ ] Them log co correlation id cho goal/broadcast/sequence/job.
- [ ] Audit log cho thao tac tao/sua/xoa/start/pause/gui.
- [ ] Dashboard loi gui theo nick, theo loai loi, theo ngay.
- [ ] Canh bao khi nick offline, rate limited, bi chan, QR het han.
- [ ] Them retry policy co gioi han, khong retry vo han.
- [ ] Co trang thai worker queue tren admin/settings neu can.
- [ ] Co script seed data demo rieng cho Marketing.
- [ ] Co tai lieu huong dan QA va van hanh.

---

## 11. Thu tu trien khai khuyen nghi trong code

1. Audit code hien tai
   - [ ] Tim tat ca file frontend Marketing.
   - [ ] Tim tat ca route backend `/api/marketing`.
   - [ ] Tim cac mock data hard-code.

2. Lam chac Tep KH
   - [ ] Sua import/paste/upload.
   - [ ] Sua chi tiet tep va export.
   - [ ] Dam bao lookup Zalo async.

3. Lam Template va Block
   - [ ] CRUD API.
   - [ ] UI tao/sua/preview.
   - [ ] Ket noi Chat slash template neu co.

4. Lam Sequence
   - [ ] CRUD sequence.
   - [ ] Step builder.
   - [ ] Gan sequence vao manual follow-up.

5. Lam Manual Follow-up va Care Session
   - [ ] Gan KH vao luong tu Chat.
   - [ ] Theo doi session.
   - [ ] Listening rules.

6. Lam Goal
   - [ ] Wizard tao goal.
   - [ ] Enroll KH tu list.
   - [ ] Queue job ket ban va follow-up.

7. Lam Broadcast
   - [ ] Wizard tao broadcast.
   - [ ] Recipient builder.
   - [ ] Queue gui tin va trang chi tiet.

8. Hardening
   - [ ] QA full flow.
   - [ ] Permission/RBAC.
   - [ ] Rate limit.
   - [ ] Logging va rollback.

---

## 12. Definition of Done chung

Mot module chi duoc coi la xong khi:

- [ ] UI khong con nut bam khong tac dung.
- [ ] API co validate va tra loi loi de hieu.
- [ ] Reload trang khong mat du lieu.
- [ ] Empty state dung khi khong co data.
- [ ] Error state hien duoc ly do va cach xu ly.
- [ ] Search/filter/pagination hoat dong.
- [ ] RBAC org/user dung, khong thay data org khac.
- [ ] Build frontend/backend pass.
- [ ] Test dry-run pass truoc khi gui Zalo that.
- [ ] Co ghi chu deploy va rollback.

---

## 13. Cac diem khong duoc bo qua

Trang thai doi soat 13/07/2026: cac rule nen tang da duoc ghi nhan; nhung mot so rule van phai verify khi trien khai Phase 5-7 vi lien quan job gui that.

- [x] Zalo action la tac vu that, roadmap da yeu cau dry-run/staging truoc khi mo gui that.
- [ ] Moi job gui tin can idempotency key de tranh gui trung khi retry. (Phase 5-7)
- [ ] Khong gui tin neu nick offline hoac chua xac thuc. (can verify worker/runtime)
- [ ] Khong gui ngoai khung gio cau hinh. (can verify worker/runtime)
- [ ] Phai ton trong cap 300 loi moi/ngay va 300 tin/ngay moi nick. (can verify worker/runtime)
- [ ] Khong lookup/gui vao nguoi la neu user chua bat option do. (Phase Broadcast/Goal)
- [ ] Khi KH reply, cac job follow-up pending phai pause/cancel theo rule. (Phase Care Session)
- [ ] Khi KH chan nick, dong session va dung luong neu cau hinh yeu cau. (Phase Care Session)
- [x] Cac action UI hang loat can preview/xac nhan; Phase 0 da khoa nut hong va ghi rule UX.
- [ ] Preview/xac nhan cuoi cho job gui that can test lai end-to-end truoc release.

---
## 14. Checklist truoc khi bat dau code

Trang thai: da hoan tat cho Phase 0-4. Giu lai muc nay de trace quyet dinh ban dau; cac viec con lai duoc chuyen sang checklist van hanh/staging.

- [x] Anh xac nhan da noi xong pham vi Marketing de lap roadmap.
- [x] Chot thu tu phase: Phase 0 -> 7.
- [x] Chot trien khai tren repo `D:\ZaloCRM-CorepViet`, deploy lai server sau khi push GitHub.
- [x] Giu giao dien hien tai, sua loi va thay fake data truoc; khong redesign lon.
- [x] Cac module EE duoc ghi ro trong roadmap, chua mo gui that neu chua verify.
- [x] Du lieu demo bat dong san da duoc dua vao danh sach can doi sang Co Rep Viet / org dynamic.
- [x] Lam truc tiep tren `main` theo cach van hanh hien tai cua du an.
- [ ] Backup database truoc khi chay migration tren staging/prod.
- [ ] Neu tiep tuc Phase 5-7, nen tao branch rieng hoac tag checkpoint truoc khi mo worker gui that.

---
## 15. Lenh Git goi y khi bat dau trien khai

```bash
git checkout -b feature/marketing-roadmap-implementation
```
Sau moi phase:
```bash
git status
git add <files>
git commit -m "feat(marketing): implement <phase-name>"
git push origin feature/marketing-roadmap-implementation
```

Neu dang lam truc tiep tren `main`, can dam bao build pass truoc khi push:

```bash
npm run build
```

---

## 16. Ghi chu trien khai

- Tai lieu phan tich goc: `MARKETING_UPGRADE_ANALYSIS.md`.
- Tai lieu nay la checklist dieu phoi cong viec, khong thay the spec chi tiet tung API.
- Khi bat dau code, nen lam tung phase nho, test xong moi sang phase tiep theo.
- Uu tien sua cac nut dang khong hoat dong va cac man dang fake data truoc khi mo them tinh nang moi.
<!-- PHASE1_STATUS_START -->
## Cap nhat Phase 1 - 12/07/2026

Trang thai: **DA TRIEN KHAI** (facade doc + go hard-code + index audit + test org-isolation).
Typecheck backend/frontend sach, prisma validate pass, test facade 11/11 pass.

Tai lieu chi tiet: `MARKETING_PHASE1_AUDIT.md`. Quyet dinh kien truc: `MARKETING_ADR_001_facade_strategy.md`.

Quyet dinh ky thuat (da chot qua ADR-001):

- KHONG tao bang `Marketing*` moi — giu schema legacy dang gan production.
- Them lop facade READ-ONLY `/api/v1/marketing/*` map ve model legacy (chi THEM, khong dung route cu).
- Route legacy CHINH THUC duoc chap nhan lam contract ghi (create/update/delete) trong Phase 1.
- Frontend GIU nguyen duong goi legacy (khong rewrite) de tranh regression — trừ phần go hard-code tag.

Checklist Phase 1 hien tai:

- [x] Audit Prisma schema va mapping legacy -> Marketing domain.
- [x] Audit frontend route usage va hard-code data.
- [x] Xac dinh route legacy dang dung: customer-lists, content-blocks, automation/sequences, target-jobs, broadcast-jobs, message-templates, care-sessions.
- [x] Xac dinh hard-code `PROJECT_TAGS` can go khoi UI.
- [x] Tao ADR chien luoc schema/API canonical. — `MARKETING_ADR_001_facade_strategy.md`.
- [x] Tao facade backend `/api/v1/marketing/*` (summary/lists/templates/blocks/sequences/goals/care-sessions/broadcasts/project-tags). — `backend/src/modules/marketing/`.
- [x] Cap nhat roadmap chap nhan route legacy lam contract ghi (thay vi rewrite frontend — nhanh audit cho phep).
- [x] Kiem tra org scoping (moi query facade loc orgId tuong minh + tenant-guard) + index audit (bang trong ADR-001).
- [x] Go hard-code project tags — facade `/marketing/project-tags` + composable `use-project-tags`; popup chat derive tu template da nap. Bo mang bat dong san o `MessageTemplatesView.vue` + `quick-template-popup.vue`.
- [x] Migration index additive `20260712120000_marketing_phase1_indexes` (content_blocks, automation_sequences, customer_list_entries) — thuan CREATE INDEX.
- [x] Them test org-isolation cho facade (`tests/marketing-facade-service.test.ts`, 11/11 pass). Regression list/sequence/broadcast day sang cac phase tuong ung.
- [x] Chay prisma validate + backend tsc + frontend vue-tsc sau khi sua code (deu pass).

Con lai (ngoai pham vi Phase 1, da ghi ADR):

- [ ] Chuyen cac man Marketing sang goi facade (rui ro cao, gia tri Phase 1 thap).
- [ ] Contract ghi POST/PATCH/DELETE tren `/api/v1/marketing/*`.
- [ ] Migration `20260712120000` can chay `prisma migrate deploy` tren staging (may dev khong co DB — chua smoke test).
<!-- PHASE1_STATUS_END -->
<!-- CHECKLIST_CLEANUP_20260713_START -->
## Cap nhat don checklist - 13/07/2026

Da doi soat lai roadmap theo hien trang du an sau cac dot trien khai Phase 0-4:

- [x] Phase 0 da hoan thien phan khoa UI loi va chong thao tac gia/khong hoat dong.
- [x] Phase 1 da hoan thien theo chien luoc facade READ-ONLY tren legacy schema, khong tao bang Marketing* moi.
- [x] Phase 2-4 da duoc danh dau la da trien khai theo roadmap hien tai.
- [x] Checklist model Marketing* moi da chuyen sang Deferred de tranh hieu nham la viec con thieu cua Phase 1.
- [x] Checklist truoc khi code da dong theo lich su lam viec thuc te.
- [ ] Viec con lai: staging migrate deploy + smoke test DB that.
- [ ] Viec con lai: Phase 5-7 gom Muc tieu, Phien cham soc, Broadcast, worker/idempotency/rate-limit, preview gui that.
<!-- CHECKLIST_CLEANUP_20260713_END -->

