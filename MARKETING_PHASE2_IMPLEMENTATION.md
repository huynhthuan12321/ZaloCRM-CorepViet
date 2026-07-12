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

## Checklist tiep theo

- [ ] Kiem tra lai CreateListModal: Paste, Excel, CSV cung di qua 1 parser va co loading/error ro rang.
- [ ] Chuan hoa trang chi tiet tep: filter, search, chon cot, pagination, scrollbar doc/ngang.
- [ ] Dong bo counter Tong/Valid/Duplicate/Co Zalo/Dang cho quet theo backend source of truth.
- [ ] Them test frontend cho deep-link `/marketing/targets?createFromList=...` va `/marketing/broadcasts?createFromList=...`.
- [ ] Them API integration test cho create target/broadcast tu list co data rong, data dang quet, data done.

## QA can chay

- `npm run build` trong `frontend`
- Vao chi tiet tep -> Tao Muc tieu tu tep nay -> modal mo va tep duoc chon san.
- Vao chi tiet tep -> Tao Broadcast tu tep nay -> wizard mo va tep duoc chon san.
