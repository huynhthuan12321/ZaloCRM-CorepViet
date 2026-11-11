# 08 — Lộ trình, rủi ro và quyết định

Ngày 29/10/2026 · Audit/đề xuất · Chưa cho phép triển khai code, deploy, dependency, commit hay push.

## Kết luận cho quản lý

Ứng dụng đã có Vue mobile shell và wrapper chat/contact; nên nâng cấp có kiểm soát thay vì làm CRM hoặc backend mới. Giữ API, authentication, authorization và logic gửi hiện hữu. Tách lớp trình bày mobile; sửa thiếu parity và hành vi deep link/scroll/keyboard. PWA hiện có manifest/meta nhưng không có đăng ký service worker đang bật; chưa đạt nghiệm thu iPhone PWA.

## Bằng chứng và giới hạn

- Mã nguồn local được khảo sát tại HEAD `1b910e3` và working tree có thay đổi chưa commit. Chưa đối chiếu image/commit đang chạy trên VPS.
- Đã chạy frontend dev riêng loopback5179, không khởi chạy backend/worker/cron. Browser Chromium desktop kiểm tra **login** tại 320,375,390,393,402,430,768,1440px. Ảnh và số đo ở `evidence/`.
- Login ở768: DOM đo #app rộng1100 trong viewport768, body overflow hidden; đã thấy bố cục lệch phải. Ở320–430 không thấy horizontal scroll theo số đo; không suy rộng thành mọi màn đều đạt.
- Chưa login vào hệ thống thật; các màn có dữ liệu chỉ audit static. Không dùng dữ liệu khách thật, token hay password. Không có kết quả WebKit, iPhone Safari, installed PWA, keyboard thực hoặc push thật.
- Cần staging dữ liệu giả và tài khoản role phù hợp trước nghiệm thu các màn đăng nhập. Prototype chỉ mô tả thiết kế, không chứng minh tích hợp.

## Xếp hạng triển khai

Tần suất và giá trị bên dưới là giả định từ mục đích CRM/chat, cần đối chiếu người dùng/telemetry trước chốt sprint. Không gán phần trăm hoàn thành hay tái sử dụng chưa đo.

| Ưu tiên | Module | Tần suất/ảnh hưởng | Phức tạp/rủi ro | Giá trị |
|---|---|---|---|---|
| P0 | Theme/shell/safe-area/breakpoint | Tất cả màn | M; CSS global có thể ảnh hưởng desktop | Nền cho mọi pilot |
| P0 | Inbox/thread/composer/keyboard | Rất cao | XL; scroll, attachments, socket lifecycle | Trực tiếp năng suất sale |
| P0 | Route deep link, resume và session lỗi mạng | Cao | L; không đổi auth contract | Tránh mở sai hội thoại/mất phiên |
| P1 | Contact list/profile/form | Cao | L; field parity/quyền/privacy | Giảm chuyển sang desktop |
| P1 | Agenda + dashboard | Hằng ngày | M/L; data vẫn dùng API cũ | Theo dõi và xử lý công việc |
| P1 | PWA shell/update/offline states | Mọi lần mở | L; cache nhạy cảm/update | Cài nội bộ ổn định |
| P2 | Search/filter/notification/settings/RBAC UI | Tùy vai trò | L; nhiều dialog/table | Hoàn thiện thao tác mobile |
| P2 | Báo cáo/marketing/media/admin chuyên sâu | Tùy vai trò | XL nếu đủ parity | Sau luồng sale cốt lõi |
| Tách dự án | Web Push nếu thiếu backend chuẩn | Theo nhu cầu | L/XL, cần subscription backend | Không chặn pilot install/chat |

Kích cỡ S/M/L/XL là tương đối, không là ngày công: S một component có contract rõ; M một màn; L nhiều tương tác và regression; XL gồm lifecycle liên màn/tích hợp/thiết bị. Chưa đủ dữ liệu báo giá hoặc cam kết thời gian. Chi phí gồm thiết kế, dev, QA role/viewport/device, staging và vận hành; thêm thư viện/push làm tăng phạm vi.

## Các đợt và gate

| Đợt | Công việc | Điều kiện qua gate | Rollback |
|---|---|---|---|
| A — baseline | Chốt scope, snapshot desktop, staging fake data, xác minh phiên bản deploy, parity inventory | Mỗi màn có fixture/role và baseline; không có secret trong artifact | Chỉ tài liệu/fixture, chưa cutover |
| B — mobile shell | Token/wrapper, theme hợp lệ, nav theo quyền, safe-area, compact768–1099 | 320–430 không cắt;768 không min-width1100; desktop baseline không đổi ngoài bugfix được chốt | Feature flag mobile V2 trở về shell cũ; không reset auth |
| C — chat pilot | Deep link/back, dùng đủ event/AI, scroll anchor, composer/keyboard/media | Test gửi mock không đổi payload, một socket owner, không nhân handler; iPhone thật portrait/landscape đạt | Flag container cũ, giữ draft theo chính sách được chốt |
| D — CRM | Contact, agenda, dashboard, filter/sheets | Role/privacy parity, pagination/error/empty; navigation không mất state | Rollback UI module, không rollback DB vì không đổi schema |
| E — PWA | Manifest/icon, SW scope/cache/update, resume/reconnect/offline/error | Cài Home Screen, restart/login, update có draft, logout và mất mạng đạt trên iPhone | Có kế hoạch vô hiệu SW/cleanup cache đúng scope; chỉ rollback JS là chưa đủ |
| F — mở rộng | Admin/reports/marketing và push nếu được duyệt | Chấp nhận từng module + performance/desktop regression | Flag riêng/PR riêng; không bundle tất cả vào một cutover |

Các flag trên là **đề xuất mới**, chưa tồn tại/chưa được bật. Không để flag presentation thay quyền server. Không thay send payload hay retry policy trong PR UI; nếu audit phát hiện vấn đề logic phải tách issue/approval.

## Risk register

| Mức | Rủi ro | Bằng chứng/điều kiện | Giảm thiểu |
|---|---|---|---|
| Critical nếu xảy ra | Gửi nhầm/trùng tin hoặc vượt quyền sau tách UI | Chat lifecycle/send/privacy được chia sẻ; chưa có runtime parity đủ | Contract tests mock side effects, xác minh convId, giữ backend gate; không tự auto-replay offline |
| High | Cache hoặc offline queue lộ hội thoại khi logout/đổi user | Có localStorage auth/queue, thiếu chứng minh SW strategy | Không cache authenticated API/media mặc định; phân vùng/xóa state, test hai tài khoản; bất kỳ thay đổi auth cần duyệt riêng |
| High | Mobile mất AI/deep link so với desktop | MobileChatView force AI null; desktop hydration khác đường mobile | Bảng parity và controller route chung trước thay UI |
| High | Composer bị che, nhảy scroll/mất nháp | 100vh, fixed heights, unconditional scroll watcher | Một scroll owner, viewport adapter, giữ anchor, QA bàn phím thật |
| High | CSS/theming phá desktop hoặc tablet | Global HS CSS, min-width1100 tại768; mobile dùng theme light/dark không được định nghĩa | Namespace, PR tách, baseline screenshots, theme hợp lệ |
| High | SW giữ code cũ/API contract lệch | SW hiện tắt; bật lại sẽ tạo vòng đời mới | Versioned precache shell, update có xác nhận khi có draft, rollback SW test |
| Medium | Safari suspend socket/mất mạng bị coi logout | auth fetchProfile catch logout; resume chưa nghiệm thu | UI stale/reconnect state và issue auth riêng; không tự đổi cơ chế auth trong đợt UI |
| Medium | Menu admin/EE không đúng quyền hoặc không tiếp cận được | BottomNav không grant-filter; More thiếu | Menu từ RBAC/feature flags, kiểm tra role matrix |
| Medium | Phụ thuộc UI thứ hai tăng bundle/CSS xung đột | Nếu chọn Vant/Ionic thay wrapper | Giữ Vuetify; spike hẹp và đo trước quyết định |
| Low | Copy/TTL/visual inconsistency | Theme và label legacy | Semantic tokens, review tiếng Việt, checklist accessible name |

Đây là risk analysis phục vụ thiết kế, không phải kết luận đã khai thác lỗ hổng hay báo cáo security scan đầy đủ.

## Kế hoạch QA bắt buộc sau phê duyệt

1. Component contracts: mobile/desktop gửi cùng params, filter và attachments; role denied không render action; API server vẫn deny.
2. Browser fixture E2E: 320/375/390/393/402/430/768 và desktop1440; thêm767/769/1024/1100 để kiểm breakpoint. Font scale200%, tên dài, empty/error/loading, media chậm, history prepend.
3. iPhone thật: Safari và Home Screen, keyboard bật/tắt, orientation, safe-area, back/deep link, background/foreground, mất mạng/reconnect, photo/file picker.
4. PWA lifecycle: install/update/logout/multi-user/offline cold start, cache inspection, không lưu private response trái chính sách. Push chỉ test khi được duyệt và có subscription backend.
5. Desktop regression cùng fixture ở chiều rộng đang dùng thực tế; giữ nguyên nghiệp vụ và permissions. Full build/typecheck/tests cần chạy ở PR thực thi, kết quả kiểm tra của các phiên trước không được gán cho đợt này.

## Tổ chức agent và dự toán

Chi tiết ownership ở 07. Sau contract freeze, tối đa ba agent implementation/QA cùng một orchestrator: ưu tiên Shell, Chat, CRM; QA chuẩn bị trước và thay một lane khi lane đó xong. PWA là đợt riêng có người sở hữu, không tranh main.ts với shell. Không để bảy agent cùng sửa App.vue/router/useChat. Audit phiên này dùng ba subagent và một điều phối; không có code triển khai.

Ước lượng chính xác chỉ sau đợt A: kiểm số component/case parity, baseline thời gian test, device matrix và yêu cầu hỗ trợ iOS tối thiểu. Parallelism giảm thời gian lịch nhưng không loại bỏ review/QA và không bảo đảm chi phí thấp hơn.

## Quyết định cần phê duyệt trước triển khai

- Chấp nhận giữ Vue/Vuetify, hai presentation shells chung logic; chưa thêm dependency.
- Chọn pilot role/team, ưu tiên chat → contact/agenda/dashboard; xác nhận không có module Orders ngoài repo cần đưa vào.
- Phiên bản iOS tối thiểu và danh sách thiết bị thật; người nghiệm thu và tài khoản staging giả.
- Chính sách offline: mặc định không tự gửi lại tin; cho phép lưu bản nháp ở đâu, bao lâu, xóa khi nào.
- Có cần Web Push ở pilot hay tách đợt; có chấp nhận backend subscription mới nếu cần.
- Ngân sách/dev capacity và phạm vi thay đổi shared/auth khi phát hiện bug; từng thay đổi backend/auth cần quyết định riêng.
- Quyền tạo branch/worktree/PR, merge/deploy sau này. Phiên audit không tự commit/push hay bật production.

## Bàn giao

Đọc lần lượt 01–08. `05` có wireframe/prototype minh họa với dữ liệu giả; `02` ghi rõ thực đo và chưa kiểm tra; `06` là checklist PWA. README gốc dẫn vào bộ tài liệu này. Các artifact là đề xuất có thể review, không phải tính năng đã triển khai.
