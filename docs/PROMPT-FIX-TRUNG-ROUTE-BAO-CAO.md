# Prompt cho Claude Code: fix TRÙNG route báo cáo automation (gây 502)

> Dán khối "PROMPT" cho Claude Code. Repo ZaloCRM (`D:\ZaloCRM-CorepViet`), đang ở commit `3e166d3`
> (đã có file báo cáo, nhưng crash vì trùng route). Fix nhỏ, không đổi schema.

---

## ===== PROMPT (copy từ đây) =====

App crash `FST_ERR_DUPLICATED_ROUTE: Method 'GET' already declared for route '/api/v1/reports/automation'`
→ 502. Nguyên nhân: route này bị khai báo **2 lần**:
1. `backend/src/modules/dashboard/report-analytics-routes.ts:590` — **CÓ SẴN từ trước** (trả thống kê theo
   sequence: enrolled/replied/failedRate...). **ĐỪNG đụng vào cái này.**
2. `backend/src/modules/automation/automation-report-routes.ts:54` — **MỚI thêm** (bảng theo Sale/Nick).

### Fix (an toàn, zero-risk): đổi PATH của route MỚI cho khỏi đụng
1. Trong `backend/src/modules/automation/automation-report-routes.ts`: đổi path
   `'/api/v1/reports/automation'` → **`'/api/v1/reports/automation-summary'`** (đổi ở cả comment + `app.get`).
   KHÔNG đổi gì trong `report-analytics-routes.ts`.
2. Trong `frontend/src/views/reports/AutomationReport.vue`: đổi URL fetch từ `/reports/automation`
   → **`/reports/automation-summary`** (chỉ đổi endpoint API; route trình duyệt `/reports/automation` +
   tên component GIỮ NGUYÊN).
3. Giữ nguyên route frontend `/reports/automation` trong `router/index.ts` (đó là URL trang, không phải API).

### Verify (bắt buộc)
- `grep -rn "app.get('/api/v1/reports/automation'" backend/src` → phải còn **đúng 1** dòng (cái cũ ở
  report-analytics-routes.ts). Route mới giờ là `automation-summary`.
- `grep -rn "reports/automation-summary" backend/src frontend/src` → thấy khớp cặp BE + FE.
- `cd backend && npx tsc --noEmit` = 0 lỗi; `cd frontend && npm run build` = 0 lỗi.
- **Quan trọng — test BOOT không crash:** sau khi build image, `docker compose up -d app` rồi
  `docker logs zalo-crm-app --tail 30` KHÔNG được có `FST_ERR_DUPLICATED_ROUTE`. (Nếu chạy local được thì
  chạy `node dist/app.js` thử vài giây xem có Unhandled Rejection route trùng không.)

### Ràng buộc
- Chỉ đổi path (BE) + URL fetch (FE). Không đổi logic/schema/migration.
- KHÔNG tự deploy. Xong: nêu diff + xác nhận grep chỉ còn 1 khai báo mỗi path + tsc/build 0 lỗi.

## ===== HẾT PROMPT =====

---

## Quy trình deploy sau khi sửa (bạn tự làm)
1. Commit từ Windows:
   ```
   cd D:\ZaloCRM-CorepViet
   git add backend/src/modules/automation/automation-report-routes.ts frontend/src/views/reports/AutomationReport.vue
   git commit -m "fix(reports): doi path automation report -> automation-summary (het trung route/502)"
   git push origin main
   ```
2. VPS (đang tạm ở 558d235 sau rollback) → lấy bản đã sửa:
   ```
   cd /opt/ZaloCRM-CorepViet
   git fetch origin && git reset --hard origin/main
   docker compose up -d --build app
   docker logs zalo-crm-app --tail 30    # KHÔNG được thấy FST_ERR_DUPLICATED_ROUTE
   ```
3. Mở `zalocrm.corepviet.com` → sống + vào Báo cáo → Automation ra bảng.
