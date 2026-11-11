# LOCK F2/F3 — main apply 10/11/2026
Main đã đọc dev-locks.md trước khi áp: L1 router mobileToolRoute cho Media/Groups/Friends/CommunityMarketingShell; L2 Friends→Account + Marketing title, Groups title; L3 MediaLibrarySheet explicit customerName/ownerName. Meta guard/API unchanged. Desktop original component no DOM wrapper; must verify pixel vs50db984.
Main yêu cầu dev sửa F3 để data readable (không chấp nhận intro-only) và các races/partial sends/focus/touch/tab Khối. Reviewer sau final dev sửa mới chạy.

## LOCK REQUEST F2F3-L5 (main đề xuất + áp)
File frontend/src/layouts/MobileLayout.vue: sự kiện Back route Friends/Groups/Marketing → router.replace('/account') để đáp ứng yêu cầu explicit back Account ngay cả nested links; mọi route khác giữ useMobileBack. Chỉ mobile shell; không backend/desktop. Diff: thêm useRouter, handleBack; đổi @back handler.

L3 placement corrected before review: remove accidental duplicate props on AttachmentSheet; add customer-name/owner-name to MediaLibrarySheet only.

Post reviewer M5/M8 main: F3 back uses router.back when immediate previous Account else replace Account; router SPDX stays first. M6 desktop lazy chunks unchanged contract deferred perf; E1 EE repo absent, report Community only.

Main lifecycle fix before delta review: MobileMediaLibrary active=false onBeforeUnmount, guard before/after confirm. Regression unmount pending confirmation then resolve true calls no API.

Delta reviewer SOURCE PASS Community. Main applied suggested LOW D1-D3: toast when orphan confirmation accepted after unmount (still no send); correct409 nick archived only,413 generic smaller file (no wrong attachment caps). No payload/API changes.

## LOCK REQUEST F2F3-QA-SCROLL (main đề xuất và áp)
`frontend/src/layouts/MobileLayout.vue`, chỉ `.m-main__scroll`: WebKit desktop có thanh cuộn dọc 10px; đo đối chứng `/account` cả F1 và candidate đều client380/scroll390, docX0, có thể programmatic scrollLeft10. Ẩn gutter thanh cuộn gốc của shell cảm ứng (vẫn cuộn dọc bình thường) để vùng nội dung dùng đủ bề rộng, không che/cắt nội dung. Không tác động DefaultLayout desktop/tablet. Kiểm lại WebKit toàn ma trận + đối chứng kích thước; không nới assertion overflow.

QA sửa thêm MediaGrid mobile: chữ số vùng chọn dùng `--m-on-action` cho Tối; focus nút mở viewer tường minh vì Safari không tự focus khi chạm. Test jsdom bắt đầu từ BODY, E2E WebKit kiểm focus thật. Không đổi MediaTabPanel/send API/payload.
