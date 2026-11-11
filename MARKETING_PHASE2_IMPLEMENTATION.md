# Phase 2 Implementation - Tep khach hang

Cap nhat: 2026-07-12

## Muc tieu

Phase 2 khoa lai Tep khach hang thanh nguon du lieu goc cho Muc tieu va Broadcast. Khi nguoi dung dung mot tep cu the, cac nut hanh dong phai dua sang dung workflow va chon san tep de tranh thao tac sai.

## Da trien khai

- [x] Chi tiet tep co nut "Tao Muc tieu tu tep nay" dieu huong sang `/marketing/targets`.
- [x] TargetsView nhan query `createFromList` va `listId`, tu mo modal tao moi, nap danh sach tep/nick va chon san tep.
- [x] Chi tiet tep co nut "Tao Broadcast tu tep nay" dieu huong sang `/marketing/broadcasts`.
- [x] BroadcastsView nhan va watch query `createFromList`, tu mo wizard va chon san tep.
- [x] Bo khoa Phase 0 con sot lai tren nut tao Muc tieu tu chi tiet tep.

## Da trien khai them (12/07/2026 — dot Export CSV)

- [x] **Export CSV** — nut "Export CSV" o ListDetailView TRUOC day la nut CHET (khong handler) → nay noi that.
  - Backend: `GET /api/v1/customer-lists/:id/export.csv` (`list-entry-routes.ts`), export theo DUNG filter tab+search hien tai, BOM UTF-8 cho Excel doc tieng Viet, owner-scope + org-scope nhu GET entries.
  - Tach `buildEntryWhere` + `csvCell` sang `list-entry-filters.ts` DUNG CHUNG voi GET entries → export khop y het bang dang xem.
  - Frontend: `exportEntriesCsv()` trong `use-customer-lists` (tai blob qua api Bearer roi tu tao link download); nut co trang thai "Dang xuat…".
  - Test: `backend/tests/list-entry-filters.test.ts` (17/17 pass) — filter tab/search + CSV escaping RFC 4180.

## Da xac minh san co (khong can lam them)

- [x] CreateListModal: Paste/Excel/CSV/Lead Ads cung di qua 1 dry-run preview chung (`dryRun` + `createList`); file parse client-side qua ExcelJS (thay `xlsx` co CVE).
- [x] Chi tiet tep co filter (tab all/valid/invalid/dup*/has_zalo/no_zalo), search da cot, sort whitelist, pagination — backend `GET entries` + UI hero-stats/subtabs.
- [x] Counter Tong/Valid/Duplicate/Co Zalo/Cho quet doc THANG tu `currentList.*` (cot counter backend = source of truth).
- [x] Quet lai Zalo: `POST /customer-lists/:id/rescan-zalo` + nut "Quet lai Zalo".

## Con lai (chua lam trong dot nay)

- [ ] Test frontend cho deep-link (`?createFromList=...`) — can harness component test.
- [ ] API integration test create target/broadcast tu list (data rong/dang quet/done) — can DB/integration harness.

## QA can chay

- `npm run build` frontend + backend (da pass 12/07).
- Vao chi tiet tep -> Export CSV -> tai ve dung so dong theo tab/search dang chon, mo Excel khong loi font tieng Viet.
- Doi tab (vd "Co Zalo") roi Export -> CSV chi gom dong cua tab do.
- Vao chi tiet tep -> Tao Muc tieu / Tao Broadcast tu tep nay -> modal/wizard mo va tep duoc chon san.
