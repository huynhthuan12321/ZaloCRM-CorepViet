# Marketing Implementation Roadmap & Checklist

Tai lieu nay la lo trinh trien khai nang cap module Marketing cua ZaloCRM-CorepViet, dua tren file phan tich `MARKETING_UPGRADE_ANALYSIS.md` va cac man hinh/chuc nang da ra soat.

Pham vi hien tai: Marketing 6.1 -> 6.7 gom Muc tieu, Phien cham soc, Bam duoi thu cong, Luong kich ban, Khoi noi dung, Mau tin nhan, Broadcast va Tep khach hang.

Trang thai: Phase 0 + Phase 1 da hoan tat ngay 12/07/2026 (Phase 1: facade doc `/api/v1/marketing/*` + go hard-code + index audit + test org-isolation — xem `MARKETING_ADR_001_facade_strategy.md`). Phase 2 da co mot phan deep-link tu tep khach hang; cac phase con lai tiep tuc theo checklist ben duoi.

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

Muc tieu: co schema va API nen de cac module Marketing dung chung, tranh moi man luu mot kieu.

Model can ra soat/them:

- [ ] `MarketingList`
- [ ] `MarketingListItem`
- [ ] `MarketingTemplate`
- [ ] `MarketingBlock`
- [ ] `MarketingBlockVariant`
- [ ] `MarketingSequence`
- [ ] `MarketingSequenceStep`
- [ ] `MarketingGoal`
- [ ] `MarketingGoalEnrollment`
- [ ] `CareSession`
- [ ] `BroadcastCampaign`
- [ ] `BroadcastRecipient`
- [ ] `MarketingJob` hoac queue job tuong duong
- [ ] `MarketingEventLog` / audit log

API dung chung (facade READ-ONLY, prefix thuc te `/api/v1/marketing/*` — xem ADR-001):

- [x] `GET /api/v1/marketing/summary`
- [x] `GET /api/v1/marketing/lists`
- [x] `GET /api/v1/marketing/templates`
- [x] `GET /api/v1/marketing/blocks`
- [x] `GET /api/v1/marketing/sequences`
- [x] `GET /api/v1/marketing/goals`
- [x] `GET /api/v1/marketing/care-sessions`
- [x] `GET /api/v1/marketing/broadcasts`
- [x] `GET /api/v1/marketing/project-tags` (bo sung — go hard-code branding)

Checklist ky thuat:

- [ ] Tat ca bang co `orgId`, `createdById`, `createdAt`, `updatedAt`.
- [ ] Co index cho `orgId`, `status`, `phoneNormalized`, `zaloUid`, `createdAt`.
- [ ] Co enum status thong nhat: `draft`, `scheduled`, `running`, `paused`, `completed`, `failed`, `archived`, `deleted`.
- [ ] Co transaction khi tao chien dich/sequence/broadcast kem step/recipient.
- [ ] Co migration va seed test data rieng, khong phu thuoc du lieu demo production.

Definition of Done:

- [x] `npm run build` backend pass (tsc --noEmit 0 loi).
- [ ] Prisma migrate pass tren local/staging (migration additive da viet; may dev khong co DB — chay khi deploy).
- [x] API facade tra ve dung du lieu theo org (query loc orgId tuong minh + test org-isolation 11/11).
- [x] Go hard-code `PROJECT_TAGS` branding bat dong san khoi UI (lay dong theo org).

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

Checklist:

- [ ] Danh sach mau lay tu API.
- [ ] Tao mau moi luu duoc.
- [ ] Sua/xoa/doi rieng tu-cong khai.
- [ ] Folder theo du an hoac nhom mau.
- [ ] Slug duy nhat trong org, vi du `//baogia`, `//camon`.
- [ ] Bien `{gender}`, `{name}`, `{sale}` render dung khi chen vao chat.
- [ ] UI disable nut Luu khi thieu ten/slug/noi dung.

API de xuat:

- [ ] `GET /api/marketing/templates`
- [ ] `POST /api/marketing/templates`
- [ ] `PATCH /api/marketing/templates/:id`
- [ ] `DELETE /api/marketing/templates/:id`

QA checklist:

- [ ] Tao mau moi xong hien ngay trong list.
- [ ] Tim kiem theo ten/noi dung/slug dung.
- [ ] Chen slug trong Chat ra noi dung dung bien.
- [ ] Khong cho 2 mau cung slug trong cung org.

### 6.2 Khoi noi dung

Muc tieu: khoi la don vi hanh dong de gan vao Luong va Broadcast.

Checklist:

- [ ] Danh sach khoi theo folder/tag/type.
- [ ] Tao khoi full-page co editor va preview Zalo.
- [ ] Loai khoi: `send_message`, `request_friend`, `change_status`, `assign_tag`.
- [ ] Ho tro nhieu bien the noi dung.
- [ ] Random/round-robin bien the khi gui.
- [ ] AI tao bien the de sau, neu chua lam thi disable ro.
- [ ] Luu folder, tag, visibility, status.

API de xuat:

- [ ] `GET /api/marketing/blocks`
- [ ] `POST /api/marketing/blocks`
- [ ] `GET /api/marketing/blocks/:id`
- [ ] `PATCH /api/marketing/blocks/:id`
- [ ] `DELETE /api/marketing/blocks/:id`

QA checklist:

- [ ] Tao khoi `send_message` co 2 bien the.
- [ ] Tao khoi `request_friend` gioi han 200 ky tu.
- [ ] Preview cap nhat live khi go noi dung.
- [ ] Khong mat dinh dang khi luu/mo lai.

---

## 7. Phase 4 - Luong kich ban va Bam duoi thu cong

### 7.1 Luong kich ban

Muc tieu: tao chuoi buoc tu cac khoi, co delay va luat an toan.

Checklist:

- [ ] Danh sach luong lay du lieu that, khong fake.
- [ ] Tao luong drawer hoat dong.
- [ ] Them/sap xep/xoa step trong luong.
- [ ] Moi step gan 1 block va delay.
- [ ] Cong tac bat/tat luong cap nhat backend.
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

Checklist:

- [ ] Danh sach phien lay tu DB that.
- [ ] Loc: tat ca, vua tra loi, tam dung, dang cham, da dong.
- [ ] Search theo ten/SĐT.
- [ ] Click dong hien panel chi tiet ben phai.
- [ ] Tab Cai dat lang nghe luu duoc cau hinh.
- [ ] Su kien lang nghe: dong y ket ban, tu choi, reply, reaction tich cuc/tieu cuc, chan nick, tro thanh lead.
- [ ] Thong bao theo 3 dich: owner, quan ly, nhom Zalo.

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

- [ ] Zalo action la tac vu that, phai co dry-run/staging.
- [ ] Moi job gui tin can idempotency key de tranh gui trung khi retry.
- [ ] Khong gui tin neu nick offline hoac chua xac thuc.
- [ ] Khong gui ngoai khung gio cau hinh.
- [ ] Phai ton trong cap 300 loi moi/ngay va 300 tin/ngay moi nick.
- [ ] Khong lookup/gui vao nguoi la neu user chua bat option do.
- [ ] Khi KH reply, cac job follow-up pending phai pause/cancel theo rule.
- [ ] Khi KH chan nick, dong session va dung luong neu cau hinh yeu cau.
- [ ] Tat ca action hang loat phai co preview va xac nhan cuoi.

---

## 14. Checklist truoc khi bat dau code

- [ ] Anh xac nhan da noi xong pham vi Marketing.
- [ ] Chot thu tu phase se lam truoc.
- [ ] Chot chay tren local hay server.
- [ ] Chot co can giu giao dien hien tai hay duoc thiet ke lai mot phan.
- [ ] Chot cac module Enterprise nao bat that trong ban nay.
- [ ] Chot du lieu demo bat dong san se doi het sang Co Rep Viet.
- [ ] Backup database truoc khi migrate.
- [ ] Tao branch rieng, vi du `feature/marketing-roadmap-implementation`.

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

