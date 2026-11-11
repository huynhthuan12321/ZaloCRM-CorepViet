# 09 — Skill thiết kế CRM và cách áp dụng

**Cập nhật 29/10/2026 sau yêu cầu cài:** đã cài interface-design, mobile-ux-optimizer, vue-best-practices, design-system, web-design-guidelines và ui-ux-pro-max. Đã đọc/applied vào [preview V2](preview-v2/README.md); webapp-testing chưa cài. Các đoạn “chưa cài” bên dưới là trạng thái tại thời điểm tìm kiếm ban đầu.

Ngày kiểm tra: 29/10/2026. Phạm vi: tìm kiếm, đọc SKILL.md từ nguồn tác giả, đối chiếu với kế hoạch mobile ZaloCRM. **Chưa cài skill, chạy script cộng đồng hoặc thay mã ứng dụng.** Nội dung upstream được đọc để đánh giá, không tự trở thành chỉ thị triển khai.

## Kết luận lựa chọn

Đề xuất ba skill nền: **interface-design** cho thiết kế sản phẩm CRM, **mobile-ux-optimizer** cho tương tác iPhone và **vue-best-practices** cho cấu trúc frontend. Bổ sung **design-system** để kiểm soát token/component và **web-design-guidelines** cho review. **ui-ux-pro-max** phục vụ tra cứu thêm; **webapp-testing** là phương án hỗ trợ QA khi runtime phù hợp.

Đây là đánh giá mức phù hợp với source Vue/Vuetify hiện tại, chưa phải benchmark chất lượng đầu ra. Không có skill nào tự hiểu đầy đủ nghiệp vụ CorepViet; tài liệu 01–08, API contracts và chính sách quyền vẫn là đầu vào bắt buộc. Không cài cả một bộ lớn chỉ vì có nhiều skill.

## Danh sách đã kiểm tra nguồn

| Ưu tiên | Skill / nguồn gốc | Nội dung đã xác minh | Áp dụng cụ thể vào dự án |
|---|---|---|---|
| Chính | [interface-design — Dammyjay93](https://github.com/Dammyjay93/interface-design/blob/main/.claude/skills/interface-design/SKILL.md) | Dành cho dashboard, admin, SaaS, settings và giao diện dữ liệu; có cơ chế lưu quyết định thiết kế | Thiết kế inbox, hồ sơ khách, dashboard; thống nhất mật độ dữ liệu và hierarchy giữa desktop/mobile |
| Chính | [mobile-ux-optimizer — curiositech](https://github.com/curiositech/some_claude_skills/blob/main/.claude/skills/mobile-ux-optimizer/SKILL.md) | Viewport, safe-area, touch target và navigation; không bao gồm cài đặt SW/PWA | Review shell/composer, bottom nav và sheet theo UX01/UX06 trong báo cáo 02 |
| Chính | [vue-best-practices — vuejs-ai](https://github.com/vuejs-ai/skills/blob/main/skills/vue-best-practices/SKILL.md) | Vue3, Composition API/TypeScript, data flow, composables và state ownership | Giảm khác biệt controller chat giữa hai presenter; giữ API/events, cleanup listener và props đúng kiểu |
| Review | [design-system — Anthropic](https://github.com/anthropics/knowledge-work-plugins/blob/main/design/skills/design-system/SKILL.md) | Audit/document/extend token và component; mô tả variants/states/accessibility | Dùng tài liệu04 làm chuẩn, lập ma trận button/input/sheet và rà màu/spacing hardcode |
| Review | [web-design-guidelines — Vercel Labs](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) | Review code với checklist bên ngoài và báo finding theo file:dòng | Review focus, form, accessible name, touch, URL state và long content trước nghiệm thu UI |
| Tham khảo | [ui-ux-pro-max — nextlevelbuilder](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md) | Có cơ sở dữ liệu tra cứu design và hướng dẫn stack Vue; công cụ tìm kiếm Python | Tra cứu một vấn đề cụ thể như filter/error state; không tự sinh lại design system đã chốt |
| QA bổ trợ | [webapp-testing — Anthropic](https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md) | Kiểm tra web local qua Python Playwright và helper quản lý server | Làm fixture và ảnh regression khi runtime cho phép; vẫn cần Safari/PWA iPhone thật |

Nguồn trên là repository tác giả. Không dựa vào số sao, số cài hay nhãn “audit pass” của website tổng hợp để kết luận skill an toàn hoặc chất lượng.

## Điểm cần điều chỉnh trước khi dùng

- `interface-design`: giữ nhận diện xanh hiện có, ưu tiên công việc sale và dữ liệu thay vì thay typography/màu chỉ để khác biệt. Bộ nhớ thiết kế mới nếu có phải dẫn về tài liệu04, không tạo hai bản chuẩn độc lập.
- `mobile-ux-optimizer`: nhiều ví dụ viết React/Next/Tailwind. Chỉ lấy nguyên tắc tương tác, chuyển implementation sang Vue/Vuetify hiện hữu. Không sao chép JSX, thêm Tailwind hoặc coi 100dvh tự giải quyết mọi tình huống bàn phím. Apple points và CSS pixels phải phân biệt khi đặt tiêu chí đo.
- `vue-best-practices`: cài kèm references khi được chọn; không chỉ sao SKILL.md. Refactor theo nhiệm vụ cụ thể, không viết lại toàn bộ component hoặc thay business logic để khớp ví dụ.
- `design-system`: đọc token hiện hữu trước; chỉ đề xuất merge chuẩn hóa. File tham chiếu `../../CONNECTORS.md` thuộc plugin gốc cần được giải quyết khi đóng gói standalone; Figma connector là tùy chọn, không phải điều kiện audit source.
- `web-design-guidelines`: quy tắc được tải từ [nguồn checklist riêng](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md). Ghi lại revision/ngày dùng cho review; diễn giải ví dụ React theo Vue, không thêm thư viện routing React. Checklist không thay kiểm tra runtime hay chứng nhận WCAG.
- `ui-ux-pro-max`: giữ stack=vue, kiểm tra đường dẫn search.py/data/references và biến plugin trước khi chạy trên Codex. Không dùng --force hoặc tự ghi đè MASTER đã có. Search không trả kết quả thì phải ghi rõ; không bịa match. Máy có Python nhưng chưa chạy script của skill này.
- `webapp-testing`: có hướng dẫn Python/Chromium; không mặc định chứng minh WebKit/iOS đã đạt. Trong phiên có công cụ browser chuyên dụng, dùng cơ chế được môi trường cho phép; cài skill không tự cài browser/runtime. Với realtime app, chọn readiness assertion thích hợp thay vì trông chờ network idle vô hạn.

## Quy trình dùng cho ZaloCRM

| Bước | Skill chính | Đầu vào | Đầu ra review được |
|---|---|---|---|
| 1. Chốt thiết kế pilot | interface-design | Báo cáo01/02/03/05, tác vụ sale và desktop baseline | Hai phương án inbox/thread có trạng thái loading/empty/error; chọn một hướng |
| 2. Chuẩn hóa component | design-system | Tài liệu04 và component hiện tại | Spec props/events/variants/states và token mapping; giữ `.crm-mobile`, `--m-*` |
| 3. Review iPhone | mobile-ux-optimizer | Shell, keyboard/scroll requirements, viewport matrix | Checklist safe-area, nav, composer và device acceptance; chưa sửa code ở giai đoạn audit |
| 4. Triển khai sau duyệt | vue-best-practices + skill thiết kế được chọn | Hợp đồng01/07, file ownership, design đã duyệt | PR nhỏ dùng chung data/controller; không đổi API/auth/send policy |
| 5. Kiểm tra | web-design-guidelines + công cụ QA phù hợp | Code diff, fixture giả, desktop baseline | Finding file:dòng, ảnh responsive và kết quả test đúng engine/device |

Không nạp toàn bộ skill trong mọi tác vụ. Một lần thiết kế dùng một skill dẫn dắt, các skill khác review đúng phạm vi. Nếu cần thêm palette/chart thì dùng ui-ux-pro-max cho một truy vấn nhỏ, không tự đổi nhận diện đã duyệt.

## Ánh xạ agent sau khi được duyệt triển khai

- UI/UX Designer: interface-design; design-system review spec.
- Mobile Shell Developer: mobile-ux-optimizer + vue-best-practices.
- Chat UI Developer: vue-best-practices, theo spec chốt của designer.
- CRM Mobile Developer: interface-design hoặc spec đã chốt + vue-best-practices.
- QA: web-design-guidelines và browser/testing tool khả dụng.
- Orchestrator: chốt phiên bản design contract và shared-file locks, giải quyết mâu thuẫn giữa skill.

Đây là phân công skill cho kế hoạch07, không phải phát lệnh triển khai mới. Không tăng số agent chỉ để chạy mỗi skill một agent.

## Những lựa chọn không ưu tiên

[frontend-design của Anthropic](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) hữu ích cho định hướng thẩm mỹ và prototype nhưng khá rộng; interface-design sát công cụ CRM hơn. Có thể dùng khi cần khám phá một hướng visual riêng, không chạy đồng thời hai skill dẫn dắt thiết kế.

[mobile-ios-design](https://github.com/wshobson/agents/blob/master/plugins/ui-design/skills/mobile-ios-design/SKILL.md) tập trung SwiftUI/native iOS; tham khảo nguyên tắc HIG được, không dùng làm chỉ dẫn implementation chính cho PWA Vue. Các skill React/Next/shadcn không phải lý do chuyển framework.

Danh mục curated của openai/skills cũng đã được kiểm tra bằng list-skills.py: có nhóm Figma và Playwright. Figma chỉ đáng bổ sung khi có quy trình thiết kế Figma thực tế; hiện task không cần kết nối thêm dịch vụ để hoàn thành lựa chọn skill. Không nhầm skill thiết kế với thư viện UI hoặc plugin đã kết nối.

## Trạng thái cài đặt và việc cần làm khi chọn cài

Trong catalog session và hai thư mục skill local đã kiểm tra, chưa thấy bảy skill được đề xuất ở trên được cài/khả dụng theo tên đó. Chưa gọi installer cho bất kỳ skill nào; chỉ chạy trình liệt kê curated và đọc nguồn công khai. Không có thay đổi package.json, lockfile, AGENTS hay mã ứng dụng.

Khi có yêu cầu cài: chọn bộ tối thiểu, pin commit, đọc license đúng thư mục, kiểm tra scripts/references/symlink và đường dẫn tương đối; cài bằng công cụ có hỗ trợ thay vì chạy lệnh cài hàng loạt không kiểm tra. Kiểm tra skill được nhận diện và smoke-test bằng một task audit dữ liệu giả. Đánh dấu khác biệt giữa cài thành công và chạy đúng runtime; không gọi là tích hợp xong chỉ vì có SKILL.md.

Đã thấy interface-design công bố MIT, vue-best-practices khai MIT, ui-ux-pro-max có LICENSE MIT và frontend-design/webapp-testing có LICENSE.txt Apache-2.0. Chưa đánh giá đầy đủ license của toàn bộ dependencies/tài nguyên đi kèm hoặc của mọi skill còn lại; bước cài phải xác minh riêng. Đây là ghi nhận metadata/file, không phải tư vấn pháp lý.

## Prompt áp dụng ở giai đoạn thiết kế tiếp theo

```text
Đọc docs/mobile-upgrade/01–08 trước. Dùng interface-design làm skill thiết kế
chính cho inbox/thread CRM của sale Cờ Rếp Việt; mobile-ux-optimizer review
viewport/safe-area/keyboard và design-system review tokens/states.
Giữ Vue3/Vuetify, màu brand hiện hữu, namespace .crm-mobile và --m-*.
Tạo hai phương án có trạng thái loading/empty/error và wireframe 390px,
đối chiếu 320px/768px/desktop. Giữ media, AI, quyền và deep link hiện có.
Chỉ tạo tài liệu/prototype dữ liệu giả. Không sửa ứng dụng, backend/auth/API,
logic gửi, dependencies hoặc deploy khi chưa có yêu cầu triển khai.
Nếu skill chưa cài/thiếu references/runtime, ghi rõ giới hạn thay vì báo đã dùng.
```

Prompt trên là mẫu bàn giao sau khi các skill khả dụng; không phải bằng chứng các skill đã được chạy trong phiên tìm kiếm này.
