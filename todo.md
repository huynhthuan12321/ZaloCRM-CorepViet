# TODO / Nhat ky phien lam viec ZaloCRM-CorepViet

Cap nhat: 2026-07-11

## Muc tieu chung

Ghi lai cac loi da kiem tra, huong sua, file da tac dong va viec can test tiep cho phan mem ZaloCRM CorepViet.

## 1. UI tep khach hang / bang data

### Van de da bao

- Trang chi tiet tep khach hang khong cuon duoc toi cuoi dong.
- Khong thay ro thanh cuon/phan hien thi du lieu 50 hay 100 dong.
- Bang nhieu cot bi kho xem o man hinh nho.

### Trang lien quan

- `https://zalocrm.corepviet.com/marketing/lists`
- Man hinh chi tiet tep khach hang.

### Trang thai

- Da kiem tra theo anh chup man hinh.
- Can tiep tuc QA tren desktop va mobile sau moi lan deploy.

## 2. Loi ket ban Zalo

### Van de da bao

- Log ket ban hien loi:
  - `API_ERROR: sendFriendRequest failed...`

### Huong xu ly / ghi chu

- Can phan biet loi do:
  - so dien thoai khong co Zalo,
  - tai khoan Zalo mat ket noi,
  - bi rate limit,
  - nick khong du quyen/gui loi moi.

### Trang thai

- Da ghi nhan can theo doi tiep qua log campaign/target.

## 3. Luong tao phieu giao hang tu Lark va gui Zalo

### Van de ban dau

- Workflow n8n da lay dung don hang, ten va so dien thoai khach.
- Node `Resolve Nick` loi:
  - `404 - Contact not found`
- Node `Send Image Zalo` loi:
  - `400 - zaloAccountId is required`
- Tin nhan gui sang Zalo bi thanh text/link thay vi anh preview.
- Caption bi loi `[object Object]`.

### Nguyen nhan

- Du lieu khach hang/Lark co field dang object nen khi noi chuoi thanh caption bi ra `[object Object]`.
- API gui anh Zalo can local file path/attachment dung chuan, khong phai URL Googleusercontent raw.
- `zca-js` can duong dan file local khi gui attachment.
- URL anh Google Slides can download ve file tam truoc khi goi `sendImage`.

### File da sua

- `backend/src/modules/chat/chat-media-helpers.ts`
- `backend/src/modules/api/public-api-routes.ts`

### Noi dung fix chinh

- Them helper download media URL ve temp file.
- Dat ten file co duoi `.jpg` de Zalo hien thi thanh anh preview.
- Goi `zaloOps.sendImage(...)` voi local path.
- Cleanup file tam sau khi gui.
- Sua build loi TypeScript trong `public-api-routes.ts`.

### Ket qua

- Da gui thanh cong phieu xac nhan don hang sang Zalo.
- Anh hien dung preview trong khung chat.
- Caption hien dung ten khach va ma don.

### Lenh deploy da dung tren VPS

```bash
cd /opt/ZaloCRM-CorepViet
git fetch origin
git reset --hard origin/main
docker compose up -d --build app
```

## 4. Cau hinh AI / Gemini embedding

### Van de da bao

- Bam ap dung API key va tai model khong lay duoc danh sach model.
- Loi chat AI:
  - `models/text is not found for API version v1beta`

### Nguyen nhan

- Gemini embedding model dang bi normalize sai thanh `text`.
- Can dung model embedding hop le, vi du:
  - `gemini-embedding-001`

### File lien quan

- `backend/src/modules/ai/knowledge/embedding-service.ts`
- `frontend/src/views/settings/AiAssistantPage.vue`

### Trang thai

- Da sua normalize model Gemini embedding.
- Can test lai:
  - luu provider Gemini,
  - them tai lieu knowledge base,
  - hoi AI trong tab chat.

## 5. Them tai lieu Knowledge Base AI

### Van de da bao

- Nut `+ Them tai lieu` khong hoat dong/khong them duoc tai lieu.

### Trang lien quan

- `Cai dat -> Tro ly AI`
- Khu vuc Knowledge base.

### Ghi chu QA

- Can nhap:
  - ten tai lieu,
  - noi dung tai lieu,
  - provider embedding dung,
  - API key hop le.
- Sau khi them can kiem tra bang danh sach tai lieu co tang so luong.

## 6. Rebrand AI tu bat dong san sang Co Rep Viet

### Van de da bao

- Trong UI con hien:
  - `Tro ly AI Bat dong san`
  - `Knowledge base Bat dong san`
  - cac cau chu thich ve du an/gia/chinh sach bat dong san.

### Huong sua

- Doi noi dung thanh Co Rep Viet.
- Tat ca thong tin lien quan bat dong san chuyen sang ngu canh Co Rep Viet.

### Trang thai

- Da cap nhat mot phan giao dien/noi dung.
- Can QA lai toan app bang tu khoa:
  - `Bat dong san`
  - `BĐS`
  - `du an`
  - `gia`
  - `chinh sach`

## 7. Follow-up tab / Gan luong bam duoi

### Van de da bao

- Tab `FOLLOW-UP` hien:
  - `Chua co luong bam duoi nao`
- Bam `Gan luong bam duoi` thi modal bao:
  - `Chua co luong nao dang bat trong to chuc`
- Link `Tao luong moi` tro den:
  - `https://zalocrm.corepviet.com/marketing/sequences`
- Trang `/marketing/sequences` chua co trong ban Community.

### Nguyen nhan

- Ban Community chua khai bao route `/marketing/sequences`.
- Backend Community chua co API CRUD luong kich ban day du.
- Modal Follow-up goi:
  - `GET /api/v1/automation/sequences?enabled=true`
  nhung khong co luong dang bat de tra ve.

### File da sua / them

- `backend/src/modules/automation/community-automation-routes.ts`
- `frontend/src/views/marketing/SequencesView.vue`
- `frontend/src/views/marketing/CommunityMarketingShell.vue`
- `frontend/src/router/index.ts`

### Noi dung fix chinh

- Them API:
  - `GET /api/v1/automation/sequences`
  - `POST /api/v1/automation/sequences`
  - `PATCH /api/v1/automation/sequences/:id`
  - `DELETE /api/v1/automation/sequences/:id`
  - `POST /api/v1/automation/sequences/:id/preview`
- Tao trang moi:
  - `/marketing/sequences`
- Them menu Marketing:
  - `Luong kich ban`
- Luu buoc tin nhan vao cot JSON `steps` cua `AutomationSequence`.
- Khong can migration database.

### Ket qua mong doi

1. Vao `/marketing/sequences`.
2. Bam `Tao luong`.
3. Nhap ten luong va it nhat 1 buoc tin nhan.
4. Bat luong.
5. Quay lai tab Follow-up cua khach.
6. Bam `Gan luong bam duoi`.
7. Modal phai thay luong vua tao.

### Build da kiem tra

```bash
cd D:\ZaloCRM-CorepViet\backend
npm run build

cd D:\ZaloCRM-CorepViet\frontend
npm run build
```

Ket qua: backend va frontend build OK.

### Lenh commit de day GitHub

```bash
cd D:\ZaloCRM-CorepViet
git add backend/src/modules/automation/community-automation-routes.ts frontend/src/router/index.ts frontend/src/views/marketing/CommunityMarketingShell.vue frontend/src/views/marketing/SequencesView.vue todo.md
git commit -m "fix(followup): add community sequence management"
git push origin main
```

## 8. Luu y Git / Deploy

### Khong nen dung

```bash
git add .
```

Neu tren VPS co file `.env.save` hoac file moi nhay vao thu muc, lenh nay co the day nham len GitHub.

### Nen dung

Chi add dung file can commit:

```bash
git add <file-1> <file-2> <file-3>
git commit -m "noi dung commit"
git push origin main
```

### Kiem tra truoc khi commit

```bash
git status --short
git diff --stat
```

## 9. Checklist QA sau deploy

- [ ] Dang nhap duoc `https://zalocrm.corepviet.com/login`.
- [ ] Trang `/marketing/sequences` mo duoc.
- [ ] Tao duoc luong moi.
- [ ] Luong moi hien trong danh sach.
- [ ] Bat/tat luong hoat dong.
- [ ] Modal `Gan luong bam duoi` trong tab Follow-up doc duoc luong dang bat.
- [ ] Gan luong cho khach thanh cong.
- [ ] Card Follow-up hien dung luong da gan.
- [ ] Gui anh phieu don hang qua Zalo van hien preview anh.
- [ ] AI knowledge base them tai lieu va hoi dap duoc.

## 10. Viec can lam tiep

- [ ] Test truc tiep tren web production sau khi deploy fix Follow-up.
- [ ] Kiem tra log backend neu gan luong loi.
- [ ] Neu can gui tu dong theo buoc, tiep tuc noi worker thuc thi `AutomationSequence.steps`.
- [ ] Them nut xem truoc luong trong trang `/marketing/sequences` neu can.
- [ ] Quet lai text UI con sot "bat dong san" de doi sang Co Rep Viet.

## 11. Fix Friends bulk actions

### Van de

- Trang Ban be co thanh bulk khi chon nhieu khach.
- Cac nut `Nhan hang loat`, `Gan tag`, `Doi trang thai`, `Xuat` chi emit event nhung handler trong `FriendsView.vue` dang la stub `console.log`.
- Ket qua: bam nut khong co hanh dong that.

### Da sua

- File: `frontend/src/views/FriendsView.vue`
- Them modal cho 3 hanh dong:
  - Nhan hang loat: nhap noi dung, gui tuan tu qua `ensure-conversation` va `POST /conversations/:id/messages`.
  - Gan tag: cap nhat `crmTagsPerNick` qua `PATCH /friends/:id`.
  - Doi trang thai: tai danh sach status tu `/settings/statuses`, cap nhat `statusId` qua `PATCH /friends/:id`.
- Them xuat CSV:
  - Nut `Xuat CSV` tren header xuat danh sach hien tai.
  - Nut `Xuat` tren bulk bar xuat cac dong dang chon.
- Co toast bao thanh cong/loi va refresh lai danh sach sau khi cap nhat.
- Neu gui tin cho hon 50 khach thi co confirm de tranh bam nham.

### Build da kiem tra

```bash
cd D:\ZaloCRM-CorepViet\frontend
npm run build
```

Ket qua: frontend build OK.

### Lenh commit de day GitHub

```bash
cd D:\ZaloCRM-CorepViet
git add frontend/src/views/FriendsView.vue todo.md
git commit -m "fix(friends): enable bulk actions"
git push origin main
```
