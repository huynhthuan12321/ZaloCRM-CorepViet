# QA đợt D — G3 chốt nghiêm ngặt, 09/11/2026

Worktree `F:\ZaloCRM-wt\crm`, nhánh `mobile/crm`, HEAD và mobile/base `e290e2d533c4608704a1d9c3438ed884949cb7bb`. Chưa commit/merge.

## Kết luận

**Các yêu cầu bắt buộc G3 ĐẠT trong mô phỏng Chromium/WebKit desktop. Chưa kiểm iPhone thật.**
Không dùng ngoại lệ KNOWN_OPEN và không nới ngưỡng pixel. Báo cáo `QA-D.md` là snapshot lịch sử của lượt khác; không dùng kết luận ngưỡng24 của nó làm bằng chứng chốt.

| Kiểm tra | Kết quả thực tế |
|---|---|
| `vue-tsc -b` (trong `npm run build`) | 0 lỗi, exit0 |
| `vitest run` | 53 file, **605/605 pass, 0 unhandled errors**, exit0; có ExperimentalWarning localStorage của Node, không phải test errors |
| `npm run build` | PASS, 3233 modules, Vite2.52s; cảnh báo chunk>500kB có sẵn |
| Ma trận `crm-d.spec.ts` | **28/28 pass**: 24 tổ hợp mobile +4 case768 desktop |
| Luồng `crm-d-flows.spec.ts` | **112/112 pass**, gồm CTA lọc, tạo/sửa/hủy lịch, back/deep link settings ở cả hai theme và hai engine |
| Tổng e2e chức năng | **140/140 pass**, 70 mỗi engine; 0 skip, 0 flaky trong JSON |
| Pixel bắt buộc1440x900 và1024x768 | **24/24 pass, exactDiffPixels=0**, cả Chromium/WebKit,6 trang mỗi kích thước/engine |
| Pixel phụ768x1024 | Lượt đầy đủ11/12 pass; WebKit Tổng quan lệch2pixel (delta15). Chạy lại riêng1/1 pass exact0. Đối chứng base-vs-base1/1 pass exact0 |

**Không báo “176/176 xanh một lượt”.** Lượt pixel đầy đủ là35/36; case phụ768 có một sai khác thoáng qua đã giữ bằng chứng. Hai pixel gốc tại(40,301),(754,301), delta15. Chưa đủ bằng chứng kết luận nguyên nhân; không sửa pixel, không mask ảnh, không nâng threshold. Cả hai kích thước pixel chủ dự án yêu cầu đều exact0 ngay trong lượt đầy đủ.

## Artifact và provenance

- Lượt chốt: `D-shots/G3-final-20261109-2056/`.
- `provenance.json`: HEAD/base, baseDist nguồn gitarchivee290e2d, cổng4186/4187, SHA256dist/index.html. Hash dist được đối chiếu lại lúc ghi báo cáo.
- `e2e-functional.json`, `e2e-pixel.json`: JSON runner đầy đủ, giữ nguyên kết quả pass/fail.
- `results/matrix-*.json`:24 JSON, **0issues,0runtimeerrors**; mỗi tổ hợp đi qua19 màn, tổng456 lượt màn mobile.
-228 ảnh mobile JPG của320/390/844 ở Sáng/Tối và hai engine;375/430/932 vẫn đo tự động đầy đủ.
- `desktop-regression/`:36 cặp ảnh `*-base-<engine>.png` / `*-dotD-<engine>.png`, JSONexact, ảnhdiff nếu có. Đây là ảnh TRƯỚC/SAU so đúng mobile/base.
- Chạy lại phụ: `D-shots/G3-recheck-20261109-2110/`; đối chứng: `D-shots/G3-control-20261109-2111/`.
- Log lệnh trong `%TEMP%`: `crm-D-build-final.log`, `crm-D-vitest-final.log`, `crm-D-e2e-functional-final.log`, `crm-D-e2e-pixel-final.log`, `crm-D-pixel-recheck.log`, `crm-D-pixel-control.log`.

Dữ liệu hoàn toàn giả, API/socket mock, không chạy backend hoặc gửi tin thật. Không dùng ảnh/JSON root D-shots hay run smoke làm bằng chứng cuối. Các lượt song song cũ từng dùng server4174/4175; lượt này dùng cổng riêng4186/4187 và runID riêng.

## Phạm vi ma trận và các luồng quan trọng

- Viewport320x568,375x812,390x844,430x932,844x390,932x430: Sáng/Tối, Chromium/WebKit, mô phỏng cảm ứng.768x1024 phải giữ desktop/compact.
-19 màn: Tổng quan/me/team/scope; Khách hàng/list/filter/create; Hồ sơ/view/edit/pickernick; Lịch hẹn/agenda/detail/filter/create/edit; editor nhắc hẹn từ chat; đổi mật khẩu; Settingscấp1 và hai trang cấp2 personal/org.
- CTA Tổng quan → `/chat?filter=unreplied`: request đầu có `unreplied=true`, chip có, mởthread/back/reload giữ, clear xóa query. Querylegacyconv không tự mở lại thread khi back. Giữ các bộ lọc RAM khác theo hành vi C đã có, không reset work-scope.
- Lịch: POSTtạo thành công → PUTsửa → hủy từ sheet qua confirm, UI phản ánh dữ liệu mockstateful. Payload sửa không mất nguồn/IDhội thoại. Giờ theo tổ chức, có case máy NewYork.
- Settings: cấp1→2→back→/account; colddeeplink `/settings/personal/profile`; không chớp menu, không lặp lịch sử, header được trả khi rời settings. Nútback TRONGAPP coldstart có fallback/account; không hijack popstate/vuốtSafari để ép nativeBacklần2 ở coldstart không rời website.
- Không pageoverflow, safe-area mô phỏng, dòng cuối còn trên tabbar/FAB, target>=44, inputfont>=16. Tương phản tự động theo bộ kiểm hiện có>=3; chưa chứng nhận WCAGAA đầy đủ.

## Các sửa QA/harness, không hạ gate

- Mock `clearAuthAndRedirect` đã có sẵn lúc tiếp tục: baseline599/599,0errors; không sửa auth ứng dụng.
- Mockpicker/users vàpicker/depts trả đúng{users,canViewAll}/{depts}; không sửa app để nuốt mocksai.
- Với VTextField, đo vùng chạm ủy quyền khi có và kiểm clickpadding thực sự focusinput; nativefield hiện44. Không giảm44px.
- Decoration rỗng/pointer-none bị clip bởi overflowhidden không phải nội dung tràn; helper không bỏ qua text/control thật.
- Bỏ KNOWN_OPEN ở tổ chức và sửa cả nút36px +previewfield40px bằng CSSmobile. Pixel threshold0, assert exact0.

## Hoãn F và chưa kiểm

Ba mục hoãnF đã ghi PARITY: darksettingscấp2; phân biệt403/404hồ sơ; thông báo trùnggiờ cụ thể. Không triển khai ba mục đó.
Chưa có Safari iPhone/iPad thật, bàn phím/camera/nativepicker thật, AddtoHomeScreen/PWA, backend/API thật hay dữ liệu khách thật. Chưa kiểm layout tất cả trangsettingscấp2 khác, dữ liệu hàng nghìn khách, toàn bộ role/phòngban và múi giờ tổ chức khác+07.
Nhận xét cũ D-L2 (line-height hinttổ chức chặt) còn để reviewer đánh giá; D-L3 (profileJSON sai contract thiếucontact) chưa kiểm phòng thủ. Không dùng chúng để che bất kỳ assertionG3 nào.
