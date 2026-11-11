# Đề xuất nâng cấp ZaloCRM trên iPhone

Ngày 29/10/2026 · Cờ Rếp Việt · **Chỉ audit, phân tích, thiết kế và kế hoạch.** Không thay code ứng dụng, backend/API, database, CI/CD; không cài dependency, commit, push hay deploy.

## Bộ tài liệu

1. [Kiến trúc mã nguồn](01_SOURCE_CODE_AUDIT.md) — công nghệ/phiên bản lock, cấu trúc, auth/realtime và coupling.
2. [Audit UX iPhone](02_IPHONE_UX_AUDIT.md) — màn hình, finding có vị trí code, ma trận viewport và giới hạn.
3. [Kiến trúc thông tin mobile](03_MOBILE_INFORMATION_ARCHITECTURE.md) — navigation, chat, hồ sơ và sheet.
4. [Design system](04_MOBILE_DESIGN_SYSTEM.md) — tokens, accessibility, Vuetify và phương án thay thế.
5. [Đề xuất giao diện](05_IPHONE_UI_PROPOSAL.md) — wireframe và trạng thái/hành vi từng màn.
6. [PWA readiness](06_PWA_READINESS_REPORT.md) — manifest/icons/SW/cache/auth/push và nghiệm thu thiết bị thật.
7. [Kế hoạch nhiều agent](07_MULTI_AGENT_PLAN.md) — ownership, shared-file locks, dependencies, PR và rollback.
8. [Lộ trình triển khai](08_IMPLEMENTATION_ROADMAP.md) — ưu tiên, risk register, khối lượng tương đối và quyết định cần duyệt.
9. [Skill thiết kế CRM đề xuất](09_DESIGN_SKILLS_RECOMMENDATIONS.md) — nguồn đã kiểm tra, bộ ưu tiên và quy trình áp dụng; trạng thái cài mới xem preview V2.
10. [Vị trí bật/tắt và thiết lập AI](10_AI_CONTROLS_LOCATION.md) — trang cài đặt, công tắc theo hội thoại và khác biệt với Gợi ý AI trong preview.

**Cập nhật sau khi được duyệt cài:** sáu skill đã cài thành công và được áp dụng vào [bộ render preview V2](preview-v2/README.md). Có tám ảnh màn hình riêng, hai bảng ảnh và desktop concept; provenance và kiểm tra nằm cùng thư mục. Tài liệu09 giữ lịch sử lựa chọn ban đầu, trạng thái mới xem preview V2.

Xem [prototype iPhone tương tác](iphone-prototype.html) bằng trình duyệt, dùng hoàn toàn dữ liệu giả. Ảnh [inbox](evidence/prototype-inbox.png) và [chat](evidence/prototype-thread.png). Đã smoke-test trong Chromium: mở inbox→thread, AI mẫu→draft, back và đổi tab Tổng quan/Khách hàng/Lịch hẹn. Không gọi CRM/AI thật. Màu chính đồng bộ brand xanh trong design system; prototype minh họa bố cục, chưa phải component production hay nghiệm thu accessibility/keyboard.

## Trả lời các câu hỏi chính

| Câu hỏi | Kết luận dựa trên khảo sát |
|---|---|
| 1. Công nghệ hiện tại? | Theo lockfile: Vue3.5.31, Vuetify4.0.4, Vite8.0.2, Pinia3.0.4, Vue Router4.6.4, Axios1.18.1; backend Fastify5.8.4/Prisma7.5.0; TypeScript, Socket.IO; chưa đối chiếu version VPS |
| 2. Vì sao iPhone chưa đạt? | Đã có presenter mobile nhưng chưa đủ parity AI/deep link; nhiều vùng tính chiều cao cứng, nav hạn chế, bảng/settings desktop; cần device QA để xác nhận lỗi keyboard |
| 3. File nào liên quan? | MobileLayout.vue, BottomNav.vue, MobileChatView.vue, MobileContactView.vue, MessageThread.vue, SettingsLayout.vue, hs-crm-theme.css, main.ts/vite.config.ts; xem 01/02 để biết số dòng |
| 4. Tái sử dụng bao nhiêu? | Giữ nền API/auth/RBAC/socket, composables, message/media renderers và phần lớn data contracts. Chưa có cơ sở gán phần trăm code; wrapper/layout/interaction cần sửa theo parity inventory |
| 5. Thư viện nào? | Giữ Vuetify + wrapper mobile scoped. Vant là phương án thay thế có spike sau phê duyệt; chưa thêm package |
| 6. Tổ chức giao diện? | Tổng quan, Hội thoại, Khách hàng, Lịch hẹn, Thêm; thread/hồ sơ/form full screen; chưa thêm Đơn hàng vì chưa tìm thấy module tương ứng |
| 7. Thứ tự thiết kế? | Shell/viewport → inbox/thread/composer → khách hàng/hồ sơ → lịch hẹn/dashboard → settings/báo cáo/marketing |
| 8. PWA đã có gì? | Manifest standalone, meta viewport/apple touch; SW registration bị tắt, web push chưa chứng minh, icon sizes cần sửa. Khả năng thêm Home Screen khác với offline/push readiness |
| 9. Bao nhiêu AI song song? | Tối đa ba implementation/QA agent + một orchestrator sau contract freeze; bảy vai trò được luân phiên, không cùng sửa shared files |
| 10. Rủi ro lớn nhất? | Chat send/socket regression, offline queue không phân vùng user/org, source/PWA cache nhạy cảm, mất parity/quyền và CSS ảnh hưởng desktop |
| 11. Kế hoạch phù hợp? | Baseline staging fake data → shell → chat pilot → CRM → PWA → mở rộng; mỗi gate có test và rollback riêng, không rewrite backend |
| 12. Cần quản lý quyết định? | Scope pilot, thiết bị/iOS tối thiểu, offline/draft policy, push có trong pilot không, năng lực/ngân sách, quyền triển khai sau này; xem cuối 08 |

## Bằng chứng hiện có

Frontend dev được chạy riêng ở loopback5179, không chạy backend/worker/cron. Đã đo **login** bằng Chromium desktop viewport320/375/390/393/402/430/768/1440; lưu [JSON](evidence/login-viewport-measurements.json) và ảnh320/390/768/1440 trong `evidence/`. Lỗi quan sát: ở768, #app rộng1100 và body khóa overflow khiến login lệch phải. Màn login ở phone không có overflow ngang theo số đo, nút chính cao44px; không khẳng định cả ứng dụng đạt.

Chưa kiểm tra authenticated screens với fixture, WebKit desktop, Safari/PWA trên iPhone thật, keyboard, push, offline cold start, token refresh hay E2E gửi. Findings static được ghi đúng mức bằng chứng, không gọi là runtime pass. Ảnh có widget tím của extension trình duyệt; không quy thành defect ứng dụng. Không chứa dữ liệu khách, secret hay credentials.

## Tiêu chí hoàn thành của audit

Đủ tám tài liệu, finding có source evidence, wireframe rõ ràng, phương án giữ desktop/API, backlog có gate/ownership/rollback và nêu phần chưa nghiệm thu. Hoàn thành bộ đề xuất không đồng nghĩa hoàn tất mọi runtime/device test hoặc đã triển khai tính năng.
