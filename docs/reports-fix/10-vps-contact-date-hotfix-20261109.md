# Production hotfix ngày khách hàng desktop — 09/11/2026

Trạng thái: **DEPLOYED_OBSERVATION_PASSED**. Website đang mở trên image mới; không rollback. Nhật ký commit local trên release/hotfix-20261108, **không push**.

## Nguồn và phạm vi

- Source release/hotfix-20261108 @ `35abe1a117af62a6b7f4f4d5a8197c89c89580fe`, build trong checkout sạch F:\ZaloCRM-wt\hotfix-date; không .env frontend, không mobile/test fixture.
- So với candidate production gốc `297fe538`, runtime frontend chỉ đổi ContactDetailDialog.vue và thêm utils/contact-date-fields.ts. Hai spec và tài liệu của commit không vào image.
- Image mới là derivative từ image 0600cdff, thay đúng toàn bộ `/app/static` bằng frontend dist. Không build/thay backend, dependency, schema hoặc runtime config. Không migration, restore DB hoặc sửa dữ liệu khách; không thao tác n8n/Lark, không gửi tin thử.
- Đã hash từng file/symlink và mode trong `/app` ở parent và image mới, gồm backend và node_modules: mọi delta đều nằm dưới `/app/static/`; parent RootFS layers được giữ nguyên. Config image và runtime Env/User/ports/mounts/network/resources giữ nguyên.

## Identity

| Mục | Giá trị |
|---|---|
| Image mới / Docker ID đang chạy | `sha256:85c6a6bafd06eb85a7eed25c5daaa047c19494a46ba5df7e0030c86ec064b573` |
| Image trước / rollback target | `sha256:0600cdff4def1278d9fe812326713c691003a10a7e658f9b279619af3e22d606` |
| Fallback lịch sử, không dùng đợt này | `sha256:652376662d4c4046e364d70f775df5aab3089652d3cd51030fa22c89c1ea6dfd` |
| Platform manifest mới | `sha256:40bc5f330989e23516cc064e4a08a4fc492fdc8c4a95b208ed08d91df11b4476` |
| Container mới | `ae0d0b625466ad3823aba974089bca924e136eee9dcc07a2bfc52bff66289c42` |
| Container cũ, dừng và giữ nguyên | `zalo-crm-app-pre-contact-date-20261109` (`e8fdef789ac8e735e1b68ffb38323d119cff8e78ff8957393ac2989c98262743`) |

## Quy trình và runner

Đã đọc `09-vps-interaction-remediation-20261107-1955.md` từ nhánh release (file không có ở mobile/base) và artifacts/messaging-fix-20261108/OPERATIONS.md. Runner messaging gốc local và VPS khớp `runner-sha256.txt`: `6a9321bab629894bf34cc5e071106f9a51228ea99f13affeda0f2d57feea332c`; helper reviewed nền khớp `e0d123717f3fa4ad2456514cde418185ec43fd60343a0bce45e9c8c0deeeac84`.

Dùng lại nguyên body các pha deploy/smoke/open/rollback/observe (chỉ đổi identity đợt và tên container giữ lại). Phần build đổi sang payload frontend theo yêu cầu, dùng tag parent local, offline Docker build. Runner đợt này SHA256 `8a121d017461f6f47840c0ef81784b06c2221444cf093879747f71da77e2b691`; mỗi lần gọi đều kiểm SHA trước exec. Observer public 22 checks dùng nguyên script 07/11, chỉ đổi thư mục state.

Preflight CHỈ ĐỌC: exact old image, healthy, restart 0, DB/Redis connected, 2 nick connected, guard enforce và RLS_SET_CONFIG true. Disk 81,18%, free 17.385.955.328 bytes; ngưỡng dự phòng bảo thủ 6.379.780.244 bytes (image 4.851.089.510 + 2 lần DB 227.474.455 + 1GiB). Đủ, không prune/delete dữ liệu/evidence.

Có một build attempt dùng trực tiếp image SHA trong FROM bị Docker hiểu thành registry tag. Lỗi xảy ra trước maintenance/cutover, production vẫn trên 0600cdff; đã dùng tag parent local như runner cũ, build thành công. Không có app rollback vì app chưa bị thay ở thời điểm lỗi.

## Backup, smoke và observer

- Dump private: `/root/zalocrm-release-evidence/contact-date-hotfix-20261109/pre-deploy.dump`.
- SHA256: `0d7700a1588a7e56d4ddde19121586feb7f7806417bb9630d94a3735b67aa842`; 21.417.942 bytes, đã hash lại và khớp sau cutover.
- pg_dump -Fc hoàn tất trước maintenance và trước dừng/đổi tên container cũ. Dump/config/env/raw logs chỉ lưu private trên VPS, không xuất vào Git/workspace.
- Chuỗi: backup -> maintenance -> stop/rename app cũ -> launch image mới cùng runtime -> healthy -> smoke 15/15 -> warmup >=70s -> open.
- Smoke 15/15 lúc 22:37:57 +07, mở route lúc 22:38:12 +07 (theo state event trên VPS).
- Public observer ban đầu 22/22, TLS verified: health/live, health/ready, login, reports-co-ban, reports/tong-quan đều HTTP 200; old container còn dừng, runtime/mounts không đổi.
- Catalog hậu kiểm: 130 migrations / 0 unfinished / 103 ENABLE+FORCE RLS / role super=false, bypass=false. Đĩa 81,27%, free 17.270.280.192 bytes. Container cũ còn dừng đúng tên và image 0600cdff.
- Observer mỗi 30 giây từ sau mở đến 22:44:33 (+07), elapsed **381,622 giây** theo đồng hồ/state VPS: restart **0**, tenant-guard **0**, RLS **0**, fatal **0**, DB/Redis connected, **2 nick connected** ở mọi probe.
- Chốt lúc 22:45:12 (+07): runner observe PASS (kèm smoke 15/15, exact image/runtime/mount/route/DB container), public observer tiếp tục **22/22 PASS**. Không lấy mốc request start để giả thời gian đã quan sát.

## Xác nhận bundle và giới hạn

HTTPS production `/login` trả index SHA256 `5ecd464b3cb342269360c74e04df12bd0865f246cb7abaead5505c74f5ca94b9`. `/assets/ContactsView-Be7CJMoq.js` SHA256 `d3dc7ebe15f8693706e999a22a576e4e78487a95f400cb131c8c15eb0fa98fdd`: byte-for-byte khớp build source 35abe1a, có logic helper contact-date-fields (minified/inlined, gồm date-only midnight UTC). Không yêu cầu tên hàm TypeScript còn nguyên sau minify.

**Chưa kiểm giao diện thật**: chủ dự án chưa cho phép đăng nhập/lưu khách production; không tự mở-lưu dữ liệu khách. Chủ dự án cần hard reload desktop, mở khách có ngày hẹn/ngày tiếp xúc, ghi lại giá trị, lưu không sửa gì, mở lại đối chiếu. Không có sửa dữ liệu cũ tự động.

## Rollback khẩn cấp

Chạy trên VPS dưới quyền ops đã được phép, không sửa lệnh thành restore DB:

```sh
cd /root/zalocrm-release-evidence/contact-date-hotfix-20261109
sha256sum remote.py
# Phải đúng 8a121d017461f6f47840c0ef81784b06c2221444cf093879747f71da77e2b691
python3 remote.py rollback
# Giữ maintenance, chờ app cũ healthy và tuổi startup ít nhất 70 giây.
python3 remote.py smoke
# Chỉ khi smoke 15/15 và warmup đạt:
python3 remote.py open
python3 remote.py observe
```

Rollback runner bật/giữ maintenance, dừng/giữ container mới, đổi tên và start lại container cũ 0600cdff. Nếu bất kỳ bước smoke/open không đạt, giữ maintenance và báo người phụ trách. KHÔNG restore DB, tắt guard/RLS, đổi backend/role/schema hoặc dùng 652376 thay cho target đã duyệt.

Private evidence đầy đủ trên VPS: `/root/zalocrm-release-evidence/contact-date-hotfix-20261109/` (runner/checksum, build receipt, file delta, state, smoke checks, observer receipts và backup). Bằng chứng đã lọc tại `%TEMP%\contact-date-production-20261109` trên máy thao tác. Không export raw config/log/dump.

## Toàn bộ file đổi trong image

211 frontend files mới. 187 delta: 87 added, 86 removed, 14 modified (bao gồm tên bundle hash liên đới/index/mode); backend delta **0**. Danh sách dưới đây lấy từ phép so checksum/mode toàn bộ `/app`, không phải suy từ git diff.

```text
added /app/static/Giao Diện Tính Năng Zalo Tool CRM.xlsx
added /app/static/assets/ActivityItem-BU4Q5Da_.js
removed /app/static/assets/ActivityItem-foyTtOuy.js
removed /app/static/assets/AddCustomerQuickDialog-BlBrKa8M.js
added /app/static/assets/AddCustomerQuickDialog-DmLLc3vL.js
added /app/static/assets/AiAssistantPage-hUdSBqKo.js
removed /app/static/assets/AiAssistantPage-tkf3wf4Q.js
removed /app/static/assets/AiReport-BCp6djHM.css
removed /app/static/assets/AiReport-Bk7FF_uT.js
added /app/static/assets/AiReport-C4M2hG7K.css
added /app/static/assets/AiReport-Cj0I4icr.js
added /app/static/assets/AnalyticsView-4WIhC5oh.js
removed /app/static/assets/AnalyticsView-p9ruBi22.js
removed /app/static/assets/ApiSettingsView-Bdn4oRT6.js
added /app/static/assets/ApiSettingsView-kUbgihp7.js
removed /app/static/assets/AppointmentEditor-6xEQg_74.js
added /app/static/assets/AppointmentEditor-d-F2frKG.js
removed /app/static/assets/AppointmentSettingsPage-C6myuSA8.js
added /app/static/assets/AppointmentSettingsPage-CgwPgMHH.js
added /app/static/assets/AppointmentsView-7W8ZI2lb.js
removed /app/static/assets/AppointmentsView-BGyh3Ops.js
removed /app/static/assets/AuditLogView-Bv9JKvft.js
added /app/static/assets/AuditLogView-HFIbO-8A.js
added /app/static/assets/AuditReport-P624HTJQ.js
removed /app/static/assets/AuditReport-QATGRmnA.js
added /app/static/assets/AutomationReport-B-71kkJh.js
removed /app/static/assets/AutomationReport-D1kWTJpI.js
added /app/static/assets/BroadcastReport-39_4qMhk.js
removed /app/static/assets/BroadcastReport-CpGnHuYH.js
removed /app/static/assets/BroadcastsView-Bvsl6RSg.js
added /app/static/assets/BroadcastsView-CCt_WR46.js
removed /app/static/assets/CareSessionListPanel-BflFxXtE.js
added /app/static/assets/CareSessionListPanel-DWUvSLk0.js
added /app/static/assets/CareSessionsView-IMiZ4Ols.js
removed /app/static/assets/CareSessionsView-pd58QfOW.js
added /app/static/assets/ChatView-BnP52nB9.css
added /app/static/assets/ChatView-DD3ekTSo.js
removed /app/static/assets/ChatView-XlIw2L8i.css
removed /app/static/assets/ChatView-f3WwePCz.js
added /app/static/assets/CommunityMarketingShell-B2dU66lH.js
removed /app/static/assets/CommunityMarketingShell-CGFKcx29.js
removed /app/static/assets/ContactProfileView-C0WKjK-6.js
added /app/static/assets/ContactProfileView-Ce04XLIV.js
added /app/static/assets/ContactsView-Be7CJMoq.js
added /app/static/assets/ContactsView-C6ua1Cpo.css
removed /app/static/assets/ContactsView-DXBiXeDY.css
removed /app/static/assets/ContactsView-DwfZsGuY.js
removed /app/static/assets/ContentBlocksView-BZy3-doH.js
added /app/static/assets/ContentBlocksView-kBFHnRT6.js
removed /app/static/assets/CrmTagManagement-DBYppMAe.js
added /app/static/assets/CrmTagManagement-OI1mGoUY.js
added /app/static/assets/CustomerActivityLogView-BrHuoMoV.js
removed /app/static/assets/CustomerActivityLogView-BsmNjwcb.js
added /app/static/assets/CustomerProfileDialog-CQ9T80Ta.js
removed /app/static/assets/CustomerProfileDialog-DN83Z2tQ.js
added /app/static/assets/DashboardView-B0hEEwWn.js
removed /app/static/assets/DashboardView-CQTBW_wG.js
removed /app/static/assets/DepartmentsView-CC3La7Hu.js
added /app/static/assets/DepartmentsView-Ckyn69Ov.js
added /app/static/assets/EngagementReport-DKjQYjMg.js
removed /app/static/assets/EngagementReport-w_7nBzno.js
removed /app/static/assets/ForcePasswordChangeView-DhLGSlhQ.js
added /app/static/assets/ForcePasswordChangeView-DwaKtOKV.js
added /app/static/assets/FriendsView-D0v3ZTXV.js
removed /app/static/assets/FriendsView-DfmHQYi6.js
removed /app/static/assets/GroupScanView-Bgdk6aIf.js
added /app/static/assets/GroupScanView-BsfiTAOQ.js
removed /app/static/assets/GroupsView-Dzd7b5nc.js
added /app/static/assets/GroupsView-PYql91Dc.js
removed /app/static/assets/IntegrationsView-BCmRP4Vz.js
added /app/static/assets/IntegrationsView-oGPPEEqX.js
added /app/static/assets/ListDetailView-B1guEEj5.js
removed /app/static/assets/ListDetailView-BG8VFNvg.js
removed /app/static/assets/ListsView-BLb7uifu.js
added /app/static/assets/ListsView-rsZn5OzJ.js
removed /app/static/assets/LoginView-BAgLg19a.js
added /app/static/assets/LoginView-D-4wX5Ab.js
added /app/static/assets/ManualFollowupView-BjeNOkQu.js
removed /app/static/assets/ManualFollowupView-ChWFzixr.js
removed /app/static/assets/MediaView-BqJE7E1n.js
added /app/static/assets/MediaView-D0WyKjFs.js
added /app/static/assets/MessageTemplatesView-C3BCUe6C.js
removed /app/static/assets/MessageTemplatesView-DYdE_goJ.js
removed /app/static/assets/NickFleetReport-B0rdSziI.css
removed /app/static/assets/NickFleetReport-BpKFW04m.js
added /app/static/assets/NickFleetReport-Brk9dbBg.css
added /app/static/assets/NickFleetReport-DjgQ8NQj.js
removed /app/static/assets/NickPickerPopup-B5eMunR7.js
added /app/static/assets/NickPickerPopup-D5KfjBM9.js
removed /app/static/assets/OrgSettings-D3nVqeGr.js
added /app/static/assets/OrgSettings-mrnbJPXm.js
removed /app/static/assets/OverviewReport-BM8hUpmI.js
added /app/static/assets/OverviewReport-DbkNPaBj.js
removed /app/static/assets/PermissionGroupsView-dR1XxnVS.js
added /app/static/assets/PermissionGroupsView-iuTaz8mi.js
removed /app/static/assets/PersonalAccountPage-CbqcSyQu.js
added /app/static/assets/PersonalAccountPage-CjbKM91T.js
added /app/static/assets/PipelineReport-BXRddSpX.js
removed /app/static/assets/PipelineReport-C2ZMaqLd.js
added /app/static/assets/PipelineReport-Cp7sC8Po.css
removed /app/static/assets/PipelineReport-DQpuPb0M.css
added /app/static/assets/PrivacyUnlockOtpModal-Bf_4ns05.js
removed /app/static/assets/PrivacyUnlockOtpModal-BiiY_dzG.js
removed /app/static/assets/ProfileView-BBv9yfOr.js
added /app/static/assets/ProfileView-CHW-le-M.js
added /app/static/assets/ReportsShell-DQ-kq53W.js
removed /app/static/assets/ReportsShell-D_1bax_0.js
added /app/static/assets/ReportsView-BF_eftg5.js
removed /app/static/assets/ReportsView-C_aU9Orr.js
added /app/static/assets/SalesReport-CI8w18NP.css
added /app/static/assets/SalesReport-D5KSKiYW.js
removed /app/static/assets/SalesReport-D9FjUKMf.css
removed /app/static/assets/SalesReport-DhbiOwnr.js
added /app/static/assets/ScoringSettingsView-DTaq6EAm.js
removed /app/static/assets/ScoringSettingsView-DTjCXLPH.js
removed /app/static/assets/SdkLimitsSettingsPage-Cxl5gdpP.js
added /app/static/assets/SdkLimitsSettingsPage-PkYeo8pz.js
added /app/static/assets/SequencesView-BTM2IFNl.js
removed /app/static/assets/SequencesView-C57okVdM.js
added /app/static/assets/SettingsLayout-BzCTVxJm.js
removed /app/static/assets/SettingsLayout-CE02zirH.js
removed /app/static/assets/SetupView-BEyRTYDo.js
added /app/static/assets/SetupView-CsB78c_r.js
added /app/static/assets/StatusManagement-BZvwqUUd.js
removed /app/static/assets/StatusManagement-cIpGpcb-.js
removed /app/static/assets/StuckLeadsView-BquOZRqA.js
added /app/static/assets/StuckLeadsView-CzyLfWjH.js
added /app/static/assets/SystemNotificationsPage-BAVKYQTm.js
removed /app/static/assets/SystemNotificationsPage-Bxkb0wB_.js
added /app/static/assets/TagTaxonomyV2Page-BlFcpEi7.js
removed /app/static/assets/TagTaxonomyV2Page-DQgOmRo7.js
added /app/static/assets/TargetsView-BFvzcybO.js
removed /app/static/assets/TargetsView-D9xka550.js
added /app/static/assets/UsersRbacView-D42zZLC4.js
removed /app/static/assets/UsersRbacView-DoM3rntd.js
removed /app/static/assets/ZaloAccountsView-BOaIFlwF.js
added /app/static/assets/ZaloAccountsView-DUhknxQg.js
removed /app/static/assets/ZaloLabelsManagement-BvbBkzau.js
added /app/static/assets/ZaloLabelsManagement-CfXUCnW4.js
added /app/static/assets/ai-config-dialog-BcfRdDWp.js
removed /app/static/assets/ai-config-dialog-nOViA_Yn.js
removed /app/static/assets/auth-BZmST8iJ.js
added /app/static/assets/auth-DLVMLCul.js
removed /app/static/assets/index-B-9F8hBm.js
added /app/static/assets/index-CjbC1pZh.js
removed /app/static/assets/marketingFeatureFlags-C6ssByGg.js
added /app/static/assets/marketingFeatureFlags-D8q3TAqR.js
added /app/static/assets/media-CCXiVfVV.js
removed /app/static/assets/media-wgXuStag.js
removed /app/static/assets/rbac-C6Y0KUed.js
added /app/static/assets/rbac-oLLZZj8C.js
added /app/static/assets/rich-text-editor-8ARRaVS7.js
removed /app/static/assets/rich-text-editor-DvGO4U3T.js
removed /app/static/assets/socket-C83kdk09.js
added /app/static/assets/socket-xtx8vTuX.js
removed /app/static/assets/source-badge-BiIUDogV.js
added /app/static/assets/source-badge-cim2UIKU.js
added /app/static/assets/use-ai-knowledge-CQzuQ4a5.js
removed /app/static/assets/use-ai-knowledge-CZca08SA.js
removed /app/static/assets/use-contacts-BS8Ral57.js
added /app/static/assets/use-contacts-mom0ckWz.js
removed /app/static/assets/use-groups-BiEvF0Xz.js
added /app/static/assets/use-groups-Cc80Q8Ue.js
added /app/static/assets/use-open-contact-chat-BeF_KsGF.js
removed /app/static/assets/use-open-contact-chat-DU4p05v1.js
removed /app/static/assets/use-scoring-DlkknWvs.js
added /app/static/assets/use-scoring-zhwekCW7.js
added /app/static/assets/use-selected-account-D0v0hVuS.js
removed /app/static/assets/use-selected-account-DjtSKQPQ.js
added /app/static/assets/use-users-CVPMLmy0.js
removed /app/static/assets/use-users-DywiuBsy.js
added /app/static/assets/use-zalo-accounts-BwDrQ6pY.js
removed /app/static/assets/use-zalo-accounts-CcjvM50W.js
modified /app/static/brand/hs-monogram.png
modified /app/static/brand/zalo-icon.svg
modified /app/static/brand/zalocrm-lockup-vertical.png
modified /app/static/brand/zalocrm-logo-ngang-co-slogan.png
modified /app/static/brand/zalocrm-logo-ngang.png
modified /app/static/brand/zalocrm-logo.png
modified /app/static/brand/zalocrm.ico
modified /app/static/favicon.svg
modified /app/static/icons.svg
modified /app/static/index.html
modified /app/static/manifest.json
modified /app/static/pwa-192x192.svg
modified /app/static/pwa-512x512.svg
modified /app/static/zalo_verifierKjoq5BZ-8JGwovjZiViyFplCZptNkbrWE3Gp.html
```
