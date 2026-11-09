# B — interaction-cron và kế thừa maintenance, 07/11/2026

## Kết luận

**PASS_FOR_RELEASE_SCOPE** cho bản sửa một module và hai image cố định dưới đây, qua runner image-only đã kiểm tra. Đây là kiểm tra B mới trên dữ liệu giả/disposable; không phải kiểm tra production, full-suite xanh hay nghiệm thu toàn bộ ứng dụng. Website chỉ được mở sau smoke/log gate của operator trên image mới; tiếp tục quan sát ít nhất 6 phút sau mở.

- Primary: `sha256:652376662d4c4046e364d70f775df5aab3089652d3cd51030fa22c89c1ea6dfd`.
- Fallback: `sha256:9b75c0e7fa09a02d4d4ffd83e5e2aba1e4e75fb5b8c136c193235bc07ced4cf1`.
- Runner `artifacts/reports-vps-interaction-remediation-20261107-1955/tools/release-phase.py`: SHA256 `2383ffb00fc251882f5658c0fa936131f91da87dccccdf28b36ce5cb5b29aba2`.
- Source provenance-v2 SHA256 `5b34817429e31e40c5c1e6a865f152bc2766e0f8c36c286f1cf17ed2a85ecf5d`.
- HEAD hiện tại `32a8f049765c057015e53ca96de924f783278775`; đang kiểm tra working tree và frozen context, không giả có commit mới. Source root và source đã compile bằng nhau sau chuẩn hóa CRLF/LF; LF SHA256 `d995abbe455f8aafd1687c0e8e4cb25198edd424632038c5ade02f41e4ac79a4`.

Artifact B riêng: `artifacts/reports-vps-interaction-b-20261107-2000/`. B chỉ tạo tài liệu, fixture/spec/harness và container disposable riêng; không sửa source runtime, README chung, production hoặc artifact cũ.

## Finding và đối chiếu source hiện tại

Nguồn thật được kiểm tra lại ở `backend/src/modules/contacts/interaction-cron.ts` và bản LF tương ứng trong frozen context:

- Dòng 43–53: normal context chỉ inventory org của mình; `*`/rỗng bị từ chối trước truy vấn; background/system chỉ lấy `id, orgId` bằng `runSystemQuery`. Không lấy tên hay dữ liệu khách cho inventory toàn cục.
- Dòng 57–63: chặn candidate khác org của normal caller; hydrate lại theo `id + orgId + cửa sổ lastInboundAt` trong `withTenant`, nên contact mất/đổi org/có inbound mới không được dùng từ inventory cũ.
- Dòng 65–86: dedup và writer thực thi trong scope; bản v2 giữ `userId/role` của caller. Bản v1 thiếu bảo tồn actor đã bị B bắt bằng một assertion không đổi; v2 sửa đúng assertion đó.
- Dòng 21–28: `0 19 * * *` có `timezone: 'UTC'`, tương ứng 02:00 VN như mô tả dòng 9; không phụ thuộc TZ của image. Cửa sổ vẫn `gte(now-31d), lt(now-30d)` tại dòng 41–47.

Các finding trong phạm vi đã đóng: truy vấn Contact không tenant từ scheduled callback; quyền normal caller bị nâng thành inventory toàn tổ chức; metadata nhạy cảm trước scope; actor bị mất trong bản sửa trung gian; lịch thực chạy 19:00 VN do thiếu timezone.

## Kiểm tra mới và kết quả

| Lệnh / bằng chứng | Kết quả thực tế |
|---|---|
| `python artifacts/reports-vps-interaction-b-20261107-2000/run.py old` và cùng lệnh với `fixed` — spec độc lập trên source cũ và v1 | RED source cũ 0/12; v1 11/12, fail đúng bảo tồn actor. Giữ nguyên log/assertion. |
| `python artifacts/reports-vps-interaction-b-20261107-2000/run-v2.py fixed-v2` | GREEN 12/12; mock DB/timer, AsyncLocalStorage thật. Không gọi đây là DB/integration. |
| `python artifacts/reports-vps-interaction-b-20261107-2000/compile-check.py` | Compile độc lập exit 0; đúng 2 JS/map có hash bằng payload A và cả hai image. |
| `python artifacts/reports-vps-interaction-b-20261107-2000/db-run-v2.py` | PostgreSQL 16.15 mới, initial tables 0; migration canonical 130; RLS ENABLE/FORCE 103/103; 103/103 no-context SELECT controls. App role NOSUPERUSER/NOBYPASSRLS, không sở hữu public object. |
| Cùng lệnh, compiled primary / fallback thực | **18/18 + 18/18 PASS**. Không provider, không production. |
| Log mới của cả hai image | stderr rỗng; 0 tenant-guard/RLS/transaction-error matches. |
| Cleanup | 6 exact container IDs riêng đã xóa; remaining 0, không prune image/volume. |

12 unit controls gồm metadata tối thiểu, X không sang Y, actor, invalid context, stale/removed/reparented contact, injected foreign inventory, dedup và epoch mới, biên 30/31 ngày, đăng ký UTC. Không có spec interaction/activity cũ phù hợp theo kiểm tra tên file; không chạy lại suite không liên quan.

DB controls gọi **module JS thật, Prisma thật, ActivityLog writer thật**, với hai org giả. Fixture loại contact 29 ngày/32 ngày/null, kiểm tra cả hai org có log sau commit, rerun không trùng, foreign RLS không thấy, log trước inbound không chặn epoch mới. `logActivity` là async void nên poll commit có giới hạn, không sửa writer để làm test đạt. Kiểm tra TZ thật là Asia/Ho_Chi_Minh; đăng ký node-cron thật, `getNextRun()` ở 19:00 UTC và gọi `task.execute()` trên fixture để xác minh callback. **Không chờ tới lịch 02:00 thật; không chạy job thủ công production.** Không chứng minh dedup nguyên tử khi nhiều worker chạy đồng thời.

Hai payload độc lập:

- `interaction-cron.js`: `09c693dc0298ad1f9b425d7206a45ab2e6c1201c28fcac0a738ac905b632e07f`.
- `interaction-cron.js.map`: `64acdefcf3f61742bceaf3b79c78fa9f31a30c76d87c4fab45417feaf4dc4dd0`.

Lần DB đầu (`db-run.py`) dừng trước assertion sản phẩm do bare import node-cron của harness không resolve từ `/verify`; đã giữ stderr/cleanup. V2 chỉ dùng absolute ESM package entry để test cùng task registry với compiled module. Không xóa hay tính lần lỗi harness là PASS sản phẩm.

## Runner và parser

Đã đọc toàn bộ runner, xác minh hash hiện tại. Dòng 3–8 chỉ dùng definitions prefix của runner cũ hash-bound `e0d123...`; không chạy phase cũ. Dòng 38–40 và 49–51 xác nhận **kế thừa đúng maintenance đang ON**, không mở traffic giữa hai bản vá. Replace clean-stop rồi fresh dump và image-only start; không migration, không đổi role/RLS/guard/AI/keys. Env/User/resources/mount/network được giữ từ container hiện tại. Dòng 68–69 giữ parser Docker timestamp 9→6 chữ số đã kiểm độc lập trên Python VPS 3.10.12: 12/12 vectors; raw 9-digit từng tái hiện ValueError. Bằng chứng parser riêng được giữ ở `reports-vps-background-tenant-b-20261107-1510/parser-supplement/`.

Smoke buộc age >=70s và broad log scan trước open; open quét lại, restore đúng Caddy preimage với If-Match/ETag. Fallback chỉ dùng image mới đã sửa, cùng schema/role/RLS/env; không phục hồi unsafe old image hay down-migration. Không phát hiện blocker mới trong runner này. B không thực thi runner production.

## Giới hạn và bàn giao

- Đây là một module bổ sung trên hai parent db447/e216; bằng chứng bốn module trước vẫn là lịch sử hash-bound, không đếm lại thành test mới. 891 HTTP/48 health/5 SPA cũ không chạy lại và không được gán cho lượt này.
- Full-suite lịch sử vẫn chưa xanh: comparator trước đó có 11 assertion failures chung cùng setup errors; không có bằng chứng mới biến tất cả thành harmless. Không chạy full-suite để sửa một cron module; không đổi kết luận cũ.
- Lỗi production interaction-cron ở 19:00 VN là finding thật của image cha; kiểm tra disposable mới đóng nguyên nhân đã xác định, không giả đã quan sát lịch tương lai trên production. Không replay job đã bỏ lỡ trên dữ liệu thật.
- Giữ nguyên gate/report B trước: SHA gate `610506194c2d1d00d5d1b266646ab0314d34bd05afaa3452619a34a749b058d8`, report `4ceaf6553ad76d5d344d92d8e6903f83017d6b4cc91f9d2d475812d8c4f0217b` được kiểm lại cuối lượt.
- Operator chỉ được dùng đúng hai image và runner nêu trên; tự thực hiện smoke/log >=70s, mở đúng route sau đạt, và quan sát >=6 phút sau mở. B không xác nhận production ổn định trước các bước này.

Gate B mới: `artifacts/reports-vps-interaction-b-20261107-2000/independent-b-gate.json`. Nếu source, payload, runner hoặc image thay đổi thì gate này hết hiệu lực cho phần thay đổi.
