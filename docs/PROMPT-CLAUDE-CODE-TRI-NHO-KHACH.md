# Tính năng: Lưu bản tóm tắt nhu cầu khách hàng cho trợ lý bán hàng

Mục tiêu: trợ lý bán hàng của CRM tư vấn nhất quán giữa các lần trò chuyện. Sau khi trợ lý soạn nội dung
tư vấn, hệ thống lưu một bản tóm tắt ngắn về nhu cầu và tình trạng của khách vào hồ sơ; lần sau khi soạn
tư vấn thì đọc lại bản tóm tắt đó để đưa vào ngữ cảnh. Không đổi cấu trúc cơ sở dữ liệu (dùng trường
Contact.metadata sẵn có). Bản tóm tắt được ghi đè mỗi lần nên dung lượng luôn nhỏ.

Bối cảnh mã nguồn (đã kiểm tra):
- Hàm `generateAiOutput({type:'reply_draft'})` trong `backend/src/modules/ai/ai-service.ts` đã ghép các
  khối `<company_guidance>`, `<customer_profile>`, `<company_docs>`, `<conversation_context>` vào lời nhắc.
  Cần bổ sung khối `<customer_memory>`.
- Model `Contact` có trường `metadata Json @default("{}")`, hiện dùng `metadata.productNeed`.
  Thêm nhánh `metadata.customerSummary`.
- Hàm gọi model: `generateText(provider, apiKey, model, system, prompt, maxTokens, baseUrl)` trong ai-service.

---

## ===== YÊU CẦU TRIỂN KHAI (copy từ đây) =====

Làm tính năng "Bản tóm tắt nhu cầu khách hàng". Không tự triển khai lên máy chủ. Không đổi cấu trúc DB.

### 1. Định dạng dữ liệu (lưu tại Contact.metadata.customerSummary)
Đối tượng JSON, ghi đè mỗi lần cập nhật, giữ nguyên các nhánh metadata khác (ví dụ productNeed):
```
customerSummary: {
  summary: string,            // mô tả ngắn ≤ 600 ký tự về khách và tiến trình tư vấn
  needs: {                    // trường nào chưa rõ để "chưa xác định", không suy đoán
    goiQuanTam?: string, nganSach?: string, khuVuc?: string, diemBan?: string,
    coXeQuay?: string, kinhNghiem?: string, thoiGianKhaiTruong?: string
  },
  stage: 'moi_hoi'|'dang_tim_hieu'|'phan_van'|'sap_chot'|'da_chot'|'nguoi_lanh'|'chua_ro',
  concerns: string[],         // tối đa 5 điều khách băn khoăn
  nextStep: string,           // một câu về việc nên làm tiếp
  updatedAt: string,          // ISO
  msgCountAtUpdate: number     // tổng số tin nhắn của hội thoại tại thời điểm cập nhật
}
```

### 2. Tệp dịch vụ mới `backend/src/modules/ai/customer-summary-service.ts`
Xuất hàm `updateCustomerSummary(input: { orgId; contactId; conversationId }): Promise<void>`:
- Bọc trong `withTenant(orgId, ...)`. Hàm này không được ném lỗi ra ngoài (mọi lỗi thì ghi log rồi kết thúc).
- Giới hạn tần suất (tránh gọi model quá nhiều): đọc `Contact.metadata.customerSummary`. Bỏ qua nếu
  (updatedAt trong vòng 30 phút) VÀ (tổng số tin nhắn hiện tại − msgCountAtUpdate < 5). Tức chỉ cập nhật
  khi có từ 5 tin mới trở lên HOẶC đã quá 30 phút.
- Đọc khoảng 30 tin nhắn gần nhất của hội thoại (sắp theo sentAt giảm dần rồi đảo lại) và bản tóm tắt cũ.
- Gọi `generateText` một lần:
  - system: "Bạn viết bản tóm tắt hồ sơ khách cho đội bán hàng. Trả về JSON đúng định dạng, không văn xuôi.
    Giữ thông tin cũ nếu tin mới không mâu thuẫn; trường chưa rõ để 'chưa xác định'; không suy đoán."
  - user: bản tóm tắt cũ (JSON) + đoạn hội thoại + định dạng mong muốn.
  - maxTokens khoảng 400. Dùng provider/model từ getAiConfig.
- Phân tích JSON (loại bỏ code fence nếu có), kiểm tra trường, giới hạn: summary ≤ 600 ký tự,
  concerns ≤ 5 phần tử, stage thuộc danh sách (sai thì 'chua_ro'). Gộp: trường mới rỗng/"chưa xác định"
  thì giữ giá trị cũ.
- Ghi `Contact.metadata = { ...metadataCũ, customerSummary: {...} }` (giữ nguyên productNeed và các nhánh khác).

### 3. Đưa bản tóm tắt vào lời nhắc (ai-service.ts, chỉ nhánh reply_draft)
Trong `generateAiOutput` nhánh reply_draft: đọc `contact.metadata.customerSummary`. Nếu có thì thêm khối
`<customer_memory>` (JSON gọn hoặc văn bản định dạng) vào lời nhắc người dùng, ngay sau `<customer_profile>`.
Bổ sung 'customer_memory' vào hàm escapeXmlBoundary như các khối khác.

### 4. Điểm gọi cập nhật (chạy nền, không chặn phản hồi)
- Sau khi endpoint `/ai/suggest` (trong ai-routes.ts) trả kết quả: gọi cập nhật bằng dynamic import,
  không dùng await, có .catch rỗng để nuốt lỗi. Lấy contactId từ hội thoại (truy vấn nhẹ nếu route chưa có).
- Sau khi dịch vụ trả lời tự động (`ai-auto-reply-service.ts`) xử lý xong một lượt (cả nhánh gửi lẫn nhánh
  chờ duyệt): gọi cập nhật tương tự, chạy nền.
- Dùng dynamic import để tránh phụ thuộc vòng. Không await (không làm chậm phản hồi cho người dùng).

### 5. Ưu tiên model nhẹ cho việc cập nhật tóm tắt
Cập nhật tóm tắt là việc phụ, không cần model mạnh. Nếu AiConfig có sẵn model phụ/model rẻ thì dùng; nếu
không thì dùng model chính nhưng maxTokens nhỏ (≤400) kèm giới hạn tần suất như trên. Nêu rõ trong phần
tóm tắt thay đổi bạn chọn cách nào. Không thêm cột mới cho việc này ở phiên bản đầu.

### 6. (Tùy chọn) Hiển thị giao diện
Nếu thuận tiện: ở tab CRM (ChatContactPanel) thêm một dòng "Tóm tắt AI" hiện `customerSummary.summary` và
stage. Nếu không chắc vị trí render thì bỏ qua, chỉ làm phần máy chủ (đưa vào lời nhắc là đủ giá trị chính).

### Ràng buộc
- Không đổi cấu trúc DB. Chỉ dùng Contact.metadata (giữ nguyên các nhánh khác).
- Nếu cập nhật tóm tắt gặp lỗi hoặc hết hạn mức thì giữ bản tóm tắt cũ, không làm hỏng nút ✨ hay trả lời tự động.
- Giới hạn tần suất bắt buộc (≥5 tin mới hoặc >30 phút) để tiết kiệm chi phí gọi model.
- Giới hạn kích thước: summary ≤ 600 ký tự, concerns ≤ 5, ghi đè không tích lũy → mỗi khách vài KB.
- Không đụng tới chức năng tóm tắt hội thoại (summary), phân tích cảm xúc (sentiment) hay virtual-chat.

### Kiểm tra (bắt buộc)
- `cd backend && npx tsc --noEmit` không lỗi; `cd frontend && vue-tsc -b` (nếu sửa giao diện) không lỗi.
- Chạy `node dist/app.js` vài giây: không trùng route, không lỗi chưa bắt.
- Nêu phần thay đổi từng tệp và xác nhận: (a) khi chưa có customerSummary thì nút ✨ vẫn chạy như cũ;
  (b) bản tóm tắt được lưu vào Contact.metadata.customerSummary và giữ nguyên productNeed; (c) lần soạn sau
  có khối `<customer_memory>` trong lời nhắc; (d) giới hạn tần suất hoạt động (không cập nhật ở mỗi tin).
- Không tự triển khai lên máy chủ. Xong thì báo phần thay đổi để tôi tự đưa lên.

## ===== HẾT YÊU CẦU =====

---

## Đưa lên máy chủ sau khi xong (tôi tự làm) — không có bước migration
1. Windows: `git add -A && git commit -m "feat(ai): luu tom tat nhu cau khach hang" && git push origin main`
2. Máy chủ: `cd /opt/ZaloCRM-CorepViet && git fetch origin && git reset --hard origin/main && docker compose up -d --build app && docker logs zalo-crm-app --tail 30`
3. Kiểm thử: trò chuyện với một khách vài lượt rồi mở lại sau, xem trợ lý có nhắc đúng nhu cầu/tình trạng đã nói trước không.
