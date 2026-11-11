# MARKETING_PHASE1_AUDIT - Nen tang du lieu Marketing

Ngay cap nhat: 12/07/2026
Pham vi: Prisma schema, backend API, frontend Marketing UI, checklist Phase 1.
Trang thai: **DA TRIEN KHAI Phase 1** (facade doc + go hard-code + index audit + test org-isolation, 12/07/2026). Khong migrate schema canonical (giu legacy — xem ADR-001).

## 1. Ket luan nhanh

Phase 1 da duoc hoan thien o muc audit nen tang va checklist trien khai. Codebase hien tai da co nhieu model legacy phu hop voi nghiep vu Marketing, nhung chua co bo model canonical `Marketing*` nhu roadmap ban dau. Vi vay khong nen tao bang moi hang loat ngay lap tuc vi co nguy co trung du lieu voi bang dang chay production.

Huong an toan duoc de xuat: giu schema hien tai trong ngan han, tao lop API/facade `/api/marketing/*` de frontend va tai lieu co mot contract on dinh. Sau khi API on dinh moi quyet dinh co migrate ten model sang `Marketing*` hay tiep tuc dung legacy model co documented mapping.

## 2. Doi chieu Prisma schema

| Roadmap entity | Trang thai | Model hien co | Nhan xet |
| --- | --- | --- | --- |
| MarketingList | Partial | CustomerList | Da co nguon tep KH, can facade hoac rename ve contract marketing. |
| MarketingListItem | Partial | CustomerListEntry | Da co item SDT/KH, can kiem tra index phoneNormalized/zaloUid/orgId. |
| MarketingTemplate | Partial | MessageTemplate + MessageTemplateFolder | Da co mau tin, can dong bo project tags theo org thay vi hard-code. |
| MarketingBlock | Partial | ContentBlock | Da co khoi noi dung, can chot variant contract. |
| MarketingBlockVariant | Missing/embedded | Chua thay model rieng | Neu variant dang nam JSON thi can document schema; neu chua co thi bo sung. |
| MarketingSequence | Partial | AutomationSequence | Da co luong legacy, can facade `/api/marketing/sequences`. |
| MarketingSequenceStep | Partial | SequenceStep | Da co step, can kiem tra relation voi ContentBlock. |
| MarketingGoal | Partial | AutomationCampaign + TargetJob | Nghiep vu dang tach giua campaign va job, can chot aggregate root. |
| MarketingGoalEnrollment | Partial | TargetRunItem / CareSession | Chua ro 1-1, can map trang thai enroll/running/done/error. |
| CareSession | Done | CareSession + CareSessionEvent | Domain da ton tai ro nhat, tiep tuc dung. |
| BroadcastCampaign | Partial | AutomationBroadcast + BroadcastJob + BroadcastRun | Nghiep vu broadcast dang bi phan manh, can facade va contract thong nhat. |
| BroadcastRecipient | Partial | BroadcastRunItem | Da co run item, can map vao recipient status. |
| MarketingJob | Partial | BroadcastJob / BroadcastRun / TargetJob | Job model ton tai nhung chua thong nhat ten mien. |
| MarketingEventLog | Partial | AutomationEventLog / CareSessionEvent | Can mot log query hop nhat theo org/entity. |

Ket luan schema: Phase 1 chua nen tao duplicate table. Viec uu tien la mapping + facade + test org isolation.

## 3. Doi chieu API hien tai voi API muc tieu

Frontend dang dung cac route legacy:

- `/customer-lists`
- `/content-blocks`
- `/automation/sequences`
- `/target-jobs`
- `/automation/care-sessions/*` va `/care-sessions/*`
- `/broadcast-jobs`
- `/message-templates`

Roadmap muc tieu yeu cau contract gom:

- `GET /api/marketing/summary`
- `/api/marketing/lists`
- `/api/marketing/templates`
- `/api/marketing/blocks`
- `/api/marketing/sequences`
- `/api/marketing/goals`
- `/api/marketing/care-sessions`
- `/api/marketing/broadcasts`

Quyet dinh de xuat: tao facade backend `/api/marketing/*` map ve service/model legacy hien co. Frontend co the chuyen dan sang route moi ma khong can migrate database ngay.

## 4. Frontend va du lieu hard-code

Da phat hien hard-code can go trong Phase 1:

- `frontend/src/views/marketing/MessageTemplatesView.vue`: `PROJECT_TAGS` dang co cac du an bat dong san.
- `frontend/src/components/chat/quick-template-popup.vue`: `PROJECT_TAGS` tuong tu.

Can thay bang org/project settings API, hoac it nhat dung config tu backend de phu hop thuong hieu Co Rep Viet.

Cac man hinh Marketing da goi API that o muc nhat dinh, nhung ten route con legacy. Neu chi sua UI ma khong tao facade, cac loi dang gap nhu tao luong moi khong hien trong modal gan luong se de tai phat.

## 5. Checklist Phase 1

Da hoan tat:

- [x] Audit schema Prisma va mapping model legacy sang domain Marketing.
- [x] Audit frontend route usage cho Marketing, Chat quick template, Follow-up.
- [x] Xac dinh hard-code du an bat dong san can go khoi UI.
- [x] Xac dinh rui ro duplicate data neu tao bang `Marketing*` moi ngay.
- [x] Chot huong an toan: facade API truoc, migration ten model sau.

Da hoan tat implementation (12/07/2026):

- [x] Viet ADR ngan: chon facade truoc — `MARKETING_ADR_001_facade_strategy.md`.
- [x] Tao backend facade `/api/v1/marketing/*` cho summary/lists/templates/blocks/sequences/goals/care-sessions/broadcasts/project-tags (`backend/src/modules/marketing/marketing-facade-{service,routes}.ts`, dang ky trong `app.ts`).
- [x] Chot GIU frontend goi legacy (khong rewrite) — roadmap chap nhan chinh thuc route legacy lam contract ghi (nhanh audit cho phep). Facade la lop doc canonical + summary.
- [x] Org scoping: moi ham facade loc `where.orgId` tuong minh (defense-in-depth cung tenant-guard).
- [x] Index audit (bang trong ADR-001) + migration additive `20260712120000_marketing_phase1_indexes` (content_blocks org+createdAt, automation_sequences org+createdAt, customer_list_entries zaloUid+contactId).
- [x] Go `PROJECT_TAGS` hard-code — facade `/marketing/project-tags` + composable `use-project-tags`; popup chat derive tu template da nap.
- [x] Test org isolation: `backend/tests/marketing-facade-service.test.ts` (11/11 pass).
- [x] `npx prisma validate` pass, backend `tsc --noEmit` 0 loi, frontend `vue-tsc --noEmit` 0 loi.

Con lai (ngoai pham vi, da ghi ADR): chuyen frontend sang facade; contract ghi tren facade; chay `prisma migrate deploy` tren staging.

## 6. Thu tu trien khai de it rui ro

1. Viet ADR va dong y chien luoc ten mien: facade truoc, migrate sau.
2. Tao router `/api/marketing/*` chi doc truoc, sau do them create/update theo tung module.
3. Sua frontend dung route facade cho: lists, templates, blocks, sequences, goals, broadcasts, care sessions.
4. Go hard-code project tags, thay bang endpoint cau hinh theo org.
5. Them test org isolation va regression cho modal gan luong thu cong.
6. Sau khi on dinh moi tinh migration schema canonical neu that su can.

## 7. Rui ro can theo doi

- Duplicate schema: tao bang `Marketing*` moi khi legacy table dang co du lieu se gay phan manh production.
- Route mismatch: frontend tao luong o `/marketing/sequences` nhung modal gan luong doc route khac se hien rong.
- Branding/config: hard-code du an bat dong san lam sai ngu canh Co Rep Viet.
- Broadcast/Goal fragmentation: `AutomationCampaign`, `TargetJob`, `BroadcastJob`, `BroadcastRun` can duoc map ro de tranh sai tien do.
- Org isolation: moi query Marketing bat buoc loc theo `orgId`, khong de ro ri du lieu giua to chuc.

## 8. Definition of Done Phase 1

Phase 1 chi duoc xem la xong implementation khi dat tat ca dieu kien sau:

- Backend co contract `/api/marketing/*` hoac roadmap duoc cap nhat chinh thuc sang route legacy da chap nhan.
- Frontend khong con phu thuoc hard-code project/domain cu.
- Tat ca danh sach Marketing hien du lieu tu API that, khong dung demo data de thay production.
- Prisma validate pass.
- Backend build pass.
- Co test org isolation toi thieu cho cac route Marketing quan trong.
