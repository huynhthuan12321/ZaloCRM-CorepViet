# Marketing — Broadcast Wizard 4 bước + Trang chi tiết (Community)

**Ngày:** 2026-07-13
**Branch:** `feature/marketing-broadcast-wizard` (tạo từ `origin/main` @ `f37166d`)
**Phạm vi:** Hoàn thiện UI Broadcast Wizard 4 bước + trang chi tiết. KHÔNG đổi schema, KHÔNG gửi Zalo thật, giữ dry-run mặc định bật. KHÔNG làm Target multi-nick / ContentBlock versioning.

---

## 1. Đã làm

### Backend (thay đổi tối thiểu, KHÔNG đụng schema)
- `POST /broadcast-jobs` nhận `status: 'paused'` → tạo **NHÁP** (dry-run an toàn). Mặc định `active` (schema default) khi FE không truyền. Cron chỉ quét job `active` ⇒ nháp KHÔNG bao giờ gửi thật. *(broadcast-routes.ts)*
- `GET /broadcast-jobs/:id` bổ sung join tay **tên tệp + nick** (org-scoped) cho trang chi tiết.

### Frontend — Wizard 4 bước (`BroadcastsView.vue`)
- **Bước 1 — Đối tượng:** chọn nick + nguồn (Bạn bè / Tệp KH) + chọn tệp; deep-link `createFromList`/`listId` mở wizard chọn sẵn tệp; nút **Đếm người nhận** gọi `audience-count` hiển thị tổng / có Zalo / UID sẵn / cần tra UID / skip không-Zalo / skip chưa-quét; **chặn qua bước** nếu chưa đếm hoặc `willSend = 0`; loading/empty/error state.
- **Bước 2 — Nội dung:** gõ tay (chèn biến `{{ten}}/{{sdt}}/{{ten_khach}}/{{phone}}`) hoặc chọn **Khối nội dung** (xoay vòng); **chèn từ Mẫu tin nhắn**; **preview theo KH mẫu**; **cảnh báo + CHẶN** biến `{{...}}` ngoài whitelist (không gửi token chưa render). Media: ngoài phạm vi wizard (dùng Khối nội dung có ảnh).
- **Bước 3 — Nick & lịch:** hiển thị **online/offline** của nick; lịch 1-lần/hàng-ngày/hàng-tuần + khung giờ; tốc độ (maxPerRun) + giãn cách (delay min/max); retry giới hạn (mô tả); chặn nếu thiếu nick/lịch.
- **Bước 4 — Kiểm tra:** gọi lại `audience-count`, hiển thị tổng / sẽ gửi / skip + breakdown; preview nội dung; nick; lịch; tốc độ/quota; **cảnh báo rủi ro** (nick offline, quota thiếu, chưa quét Zalo, người lạ); **checkbox xác nhận** bắt buộc; **dry-run** → chỉ tạo nháp, ghi rõ không gửi thật.
- **Dry-run gating:** khi `VITE_MARKETING_DRY_RUN=true` (mặc định) → tạo nháp (`status=paused`), banner cảnh báo, nút **“Chạy ngay”** trên card + **“Tiếp tục”** trong chi tiết bị **khoá**; `run-now` bị chặn ở FE.
- **Chống tạo trùng:** guard `creatingGuard` + `:disabled` khi đang tạo (chống double-click).

### Frontend — Trang chi tiết (`BroadcastDetailDrawer.vue`, 4 tab)
- **Tổng quan:** trạng thái + progress bar + KPI tổng/sent/failed/skipped/queued + nick + tệp nguồn + lịch + thời gian tạo/tới.
- **Người nhận:** chọn run + **filter trạng thái** + **search** (tên/SĐT) + **pagination** (50/trang) + lý do lỗi + lúc gửi.
- **Lịch sử chạy:** mỗi `BroadcastRun` (bắt đầu/kết thúc + tổng kết) + nút **gửi lại tin lỗi** (retry) + xem người nhận.
- **Cài đặt:** pause/resume + retry failed (run gần nhất) + ghi chú audience snapshot của run đang chạy KHÔNG sửa được.

### Logic thuần tách riêng (`broadcast-wizard-logic.ts`)
`findUnknownVars` · `renderBroadcastPreview` · `validateWizardStep` · `buildBroadcastPayload` (dry-run → status paused). View import dùng chung ⇒ test khớp logic thật.

---

## 2. Chưa làm (ngoài phạm vi task này)
- **Gửi Zalo thật / kích hoạt production** — cố ý khoá (dry-run). Cần runtime-QA staging trước.
- **Media/ảnh trong wizard** — ngoài phạm vi (backend hỗ trợ `imageUrl` nhưng wizard chỉ text + Khối nội dung; ảnh dùng qua Khối nội dung).
- **Skip breakdown "chưa kết bạn" / "thiếu UID riêng" / "trùng"** — backend `audience-count` hiện trả `skipNoZalo/skipUnknown/uidReady/needLookup`; các nhãn "chưa kết bạn/trùng" chưa có cột riêng ở backend → hiển thị theo dữ liệu hiện có, không bịa.
- **Attempt count per-item** — model `BroadcastRunItem` không có cột attempt; retry tạo run mới (lineage ở tab Lịch sử chạy), không đếm attempt/item.
- **Target multi-nick, ContentBlock versioning** — loại trừ theo yêu cầu.

---

## 3. Test đã chạy

### Backend — `tests/broadcast-wizard.test.ts` (7/7 PASS)
- audience-count breakdown (customer_list): willSend=min(hasZalo,maxPerRun), skipNoZalo/skipUnknown/uidReady/needLookup, quota, nickOnline.
- audience-count nick không tồn tại → 400.
- create `status=paused` → nháp; không truyền status → mặc định active (không set trong data).
- create non-admin → 403.
- retry-failed: findMany lọc `status='failed'`; rỗng → 400 `no_failed_items`.
- org-isolation: GET :id org khác → 404 (findFirst lọc `orgId`).

### Frontend — `src/utils/broadcast-wizard-logic.spec.ts` (14/14 PASS)
- findUnknownVars (whitelist vs biến lạ); renderBroadcastPreview.
- validateWizardStep bước 1–4 (tên/nick/tệp/audience willSend>0; friends cần friendCount; biến lạ chặn bước 2; lịch/delay bước 3).
- buildBroadcastPayload: **dry-run → status paused**; not dry-run → undefined; customer_list vs friends; blocks vs text; once vs daily.

### Suite tổng
- Backend `tsc`+`build`: **PASS**. Frontend `vue-tsc`+`vite build`: **PASS**.
- Backend full suite: **49 failed files / 46 failed tests = baseline KHÔNG tăng** (+1 file/+7 test mới pass; 464 passed).
- Frontend suite: **3 files / 40 tests PASS** (+14 test wizard).

---

## 4. Runtime QA
- ⚠️ **CHƯA runtime-QA trên PostgreSQL/staging thật** trong task này (chỉ unit test + build/typecheck).
- Cần QA staging (dry-run): mở wizard 4 bước từ Tệp KH → audience-count đúng → tạo **nháp** → mở chi tiết xem run-item log → pause/resume/retry ở chế độ test → **xác nhận KHÔNG có tin Zalo đi ra**.

---

## 5. Rủi ro còn lại
- **Gửi thật chưa QA** — khi tắt dry-run + “Chạy ngay” sẽ gửi thật; luồng gửi (cron) chưa runtime-QA staging → rủi ro spam/khóa nick. Giữ dry-run BẬT cho tới khi QA.
- **audience-count là ước tính tại thời điểm đếm** — người nhận thật chốt bằng **snapshot lúc run** (đã có ở cron Phase 2); giữa lúc đếm và lúc chạy có thể lệch nhẹ.
- **Nick offline** — worker chờ; wizard cảnh báo nhưng vẫn cho tạo nháp (đúng ý — nháp không gửi).

---

## 6. File đã sửa / thêm
| File | Loại | Nội dung |
|---|---|---|
| `backend/src/modules/broadcast/broadcast-routes.ts` | sửa | create nhận `status=paused` (nháp) + GET :id join tệp/nick |
| `frontend/src/views/marketing/BroadcastsView.vue` | sửa (rewrite) | Wizard 4 bước + dry-run gating + mở detail drawer |
| `frontend/src/components/marketing/BroadcastDetailDrawer.vue` | mới | Trang chi tiết 4 tab |
| `frontend/src/utils/broadcast-wizard-logic.ts` | mới | Logic thuần (validate/preview/payload) |
| `frontend/src/utils/broadcast-wizard-logic.spec.ts` | mới | 14 test logic |
| `backend/tests/broadcast-wizard.test.ts` | mới | 7 test route (audience/draft/retry/org-isolation) |
| `PROJECT_IMPLEMENTATION_STATUS.md` | cập nhật | trạng thái module Broadcast |

*(KHÔNG commit: `.env`, log, dump, dữ liệu smoke-test. `MARKETING_IMPLEMENTATION_ROADMAP.md` bị sửa ngoài task — loại khỏi commit broadcast.)*

## 7. Commit dự kiến (chờ xác nhận — CHƯA commit)
```
feat(marketing-broadcast): 4-step broadcast wizard + detail page (dry-run safe)
```
Stage: 2 file sửa (broadcast-routes.ts, BroadcastsView.vue) + 4 file mới (BroadcastDetailDrawer.vue, broadcast-wizard-logic.ts, .spec.ts, broadcast-wizard.test.ts) + doc này + PROJECT_IMPLEMENTATION_STATUS.md.
