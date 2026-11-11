# Tính năng: Hiển thị giai đoạn khách hàng và nước đi kế tiếp (Giai đoạn 2)

Mục tiêu: hiển thị cho nhân viên bán hàng thấy mỗi khách đang ở giai đoạn nào và việc nên làm tiếp,
dựa trên dữ liệu đã được lưu sẵn ở `Contact.metadata.customerSummary` (các trường `stage` và `nextStep`).
Đây là tính năng hiển thị dữ liệu có sẵn — KHÔNG gọi thêm model AI, KHÔNG đổi cấu trúc DB.

Bối cảnh mã nguồn (đã kiểm tra):
- Dữ liệu tab CRM trong màn Chat lấy từ endpoint cockpit: `backend/src/modules/contacts/cockpit-routes.ts`,
  hiển thị qua composable `frontend/src/composables/use-contact-cockpit.ts` và component
  `frontend/src/components/chat/ChatContactPanel.vue` (biến `cockpit`).
- Bản tóm tắt khách đã lưu tại `Contact.metadata.customerSummary` gồm: summary, needs, stage, concerns,
  nextStep, updatedAt. `stage` nhận một trong: moi_hoi | dang_tim_hieu | phan_van | sap_chot | da_chot |
  nguoi_lanh | chua_ro.

---

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Thêm hiển thị giai đoạn khách + nước đi kế tiếp. Không tự đưa lên máy chủ. Không đổi cấu trúc DB.

### 1. Backend — bổ sung dữ liệu vào endpoint cockpit
Trong `backend/src/modules/contacts/cockpit-routes.ts`: khi trả dữ liệu cockpit của một contact, đọc
`contact.metadata.customerSummary` và thêm vào phần trả về một nhánh gọn:
```
customerSummary: {
  stage: string | null,       // moi_hoi | dang_tim_hieu | phan_van | sap_chot | da_chot | nguoi_lanh | chua_ro
  nextStep: string | null,
  summary: string | null,
  concerns: string[],
  updatedAt: string | null
} | null
```
- Nếu contact chưa có customerSummary → trả `customerSummary: null`.
- Giữ nguyên toàn bộ phần cockpit hiện có (chỉ thêm, không đổi field cũ). Vẫn theo org-scope như hiện tại.

### 2. Frontend — kiểu dữ liệu
Trong `frontend/src/composables/use-contact-cockpit.ts`: thêm trường `customerSummary` (đúng shape trên,
có thể null) vào kiểu dữ liệu cockpit.

### 3. Frontend — hiển thị trong ChatContactPanel.vue (tab CRM)
**(a) Nhãn giai đoạn:** thêm một chip nhỏ có màu, đặt ở đầu tab CRM (gần widget "Nhiệt KH"). Map giai đoạn:
- moi_hoi → "Mới hỏi" (xám)
- dang_tim_hieu → "Đang tìm hiểu" (xanh dương)
- phan_van → "Phân vân" (cam/vàng)
- sap_chot → "Sắp chốt" (xanh lá, nổi bật)
- da_chot → "Đã chốt" (xanh đậm)
- nguoi_lanh → "Nguội" (xám xanh)
- chua_ro → "Chưa rõ" (xám nhạt)
Chỉ hiện chip khi có `customerSummary.stage`. Dùng một computed map stage → { label, cssClass }.

**(b) Nước đi kế tiếp:** thêm một dòng/khối "🎯 Nước đi kế tiếp" hiển thị `customerSummary.nextStep`,
đặt Ở ĐẦU widget "Hành động đề xuất" (Widget 2), phía trên phần gợi ý trả lời hiện có. Nếu
`stage === 'sap_chot'` thì thêm class nổi bật (viền/nền xanh lá) và tiền tố "🔥 " để nhân viên ưu tiên.
Nếu không có nextStep → không hiện khối này (widget vẫn chạy như cũ).

**(c) CSS:** thêm style cho chip giai đoạn (mỗi giai đoạn một màu nền/nhạt như bảng trên) và cho khối
nước đi kế tiếp. Giữ phong cách hiện có của panel.

### Ràng buộc
- Không đổi cấu trúc DB, không migration. Chỉ đọc `Contact.metadata.customerSummary` đã có.
- Không gọi thêm model AI — đây chỉ là hiển thị dữ liệu đã lưu.
- Khi contact chưa có customerSummary: tab CRM và widget "Hành động đề xuất" hoạt động y như trước
  (không hiện chip giai đoạn, không hiện khối nước đi).
- Giữ nguyên mọi widget và chức năng khác của ChatContactPanel.

### Kiểm tra (bắt buộc)
- `cd backend && npx tsc --noEmit` không lỗi; `cd frontend && vue-tsc -b` (hoặc build) không lỗi.
- Chạy `node dist/app.js` vài giây: không trùng route, không lỗi chưa bắt.
- Nêu phần thay đổi từng tệp và xác nhận: (a) cockpit trả thêm customerSummary đúng shape, org-scope giữ nguyên;
  (b) khách có stage thì hiện chip giai đoạn đúng màu; (c) có nextStep thì hiện khối "Nước đi kế tiếp",
  giai đoạn sap_chot được tô nổi bật; (d) khách chưa có tóm tắt thì giao diện như cũ.
- Không tự đưa lên máy chủ. Xong thì báo phần thay đổi để tôi tự đưa lên.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — không có bước migration
1. Windows: `git add -A && git commit -m "feat(crm): hien thi giai doan khach + nuoc di ke tiep" && git push origin main`
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 30`
3. Kiểm thử: mở khách đã có tóm tắt (ví dụ khách ở giai đoạn "sap_chot") → tab CRM phải hiện chip giai đoạn
   + khối "Nước đi kế tiếp".
