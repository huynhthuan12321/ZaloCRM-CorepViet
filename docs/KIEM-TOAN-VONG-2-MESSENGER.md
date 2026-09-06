# Kiểm toán Vòng 2 — Tích hợp Facebook Messenger vào ZaloCRM

> Báo cáo Vòng 1 được đối xử như một **giả thuyết cần phản biện**. Mọi kết luận dưới đây được kiểm chứng lại từ mã nguồn, schema thật, cấu hình production và tài liệu chính thức hiện hành của Meta.

| | |
|---|---|
| **Nhánh / commit** | `main` · `b1cb76e79b4801c9886c06e082f73547f2469fd0` |
| **Worktree** | DIRTY (21 mục) |
| **Migration local ↔ production** | 126 ↔ 126 · **không drift** |
| **Chatwoot image** | `chatwoot/chatwoot:v4.16.2` @ `sha256:f9b071ff…8211b2` |
| **Thư mục `backend/src/_ee`** | KHÔNG tồn tại |
| **Ngày kiểm toán** | 31-08-2026 |
| **Phán quyết** | **CONDITIONAL GO — Phương án D** |

---

## Mục lục

- [0. Baseline, phạm vi và giới hạn](#0-baseline-phạm-vi-và-giới-hạn-của-cuộc-kiểm-toán)
- [Output 1 — Phán quyết điều hành](#output-1--phán-quyết-điều-hành)
- [Output 2 — Số phận từng kết luận Vòng 1](#output-2--số-phận-từng-kết-luận-của-báo-cáo-vòng-1)
- [Output 3 — Danh sách Critical và High](#output-3--danh-sách-critical-và-high-đã-xác-minh)
- [Output 4 — Lỗi thiết kế trong đề xuất Vòng 1](#output-4--lỗi-thiết-kế-trong-đề-xuất-vòng-1)
- [Output 5 — Schema mục tiêu đã sửa](#output-5--schema-mục-tiêu-đã-sửa)
- [Output 6 — Ma trận tương thích migration & khoá dedup](#output-6--ma-trận-tương-thích-migration-và-khoá-khử-trùng-lặp)
- [Output 7 — Kiến trúc mục tiêu và luồng dữ liệu](#output-7--kiến-trúc-mục-tiêu-và-luồng-dữ-liệu)
- [Output 8 — Mô hình mối đe doạ](#output-8--mô-hình-mối-đe-doạ)
- [Output 9 — Ma trận kiểm thử](#output-9--ma-trận-kiểm-thử-bắt-buộc)
- [Output 10 — Lộ trình P0–P12](#output-10--lộ-trình-có-pha-chạy-được)
- [Output 11 — Ước lượng công sức](#output-11--ước-lượng-công-sức)
- [Mục 8 — Đánh giá năng lực VPS](#mục-8--đánh-giá-năng-lực-vps-từ-số-liệu-thật)
- [Mục 3.9 — Chấm điểm lại bốn phương án](#mục-39--chấm-điểm-lại-bốn-phương-án)
- [Output 12 — Quyết định cần chủ dự án](#output-12--quyết-định-cần-chủ-dự-án-xác-nhận)
- [Output 13 — Checklist sẵn sàng production](#output-13--checklist-sẵn-sàng-production)
- [Output 14 — ADR cuối cùng](#output-14--adr--quyết-định-kiến-trúc-cuối-cùng)
- [Output 15 — File thay đổi theo pha](#output-15--file-và-module-dự-kiến-thay-đổi-theo-từng-pha)

---

## 0. Baseline, phạm vi và giới hạn của cuộc kiểm toán

| Hạng mục | Giá trị quan sát được | Cách thu thập |
|---|---|---|
| Nhánh / HEAD | `main` · `b1cb76e79b4801c9886c06e082f73547f2469fd0` | `git rev-parse HEAD` |
| Worktree | **DIRTY** — 21 mục (1 modified, 20 untracked: tài liệu & hợp đồng, không phải mã) | `git status --porcelain` |
| Migration local | 126 migration + `migration_lock.toml` | `ls backend/prisma/migrations` |
| Migration production | 126 rows, 0 failed, mới nhất `20260804090000_broadcast_friend_labels` | `select from _prisma_migrations` |
| **Kết luận drift** | **KHÔNG DRIFT** — schema production khớp migration local | đối chiếu 2 hàng trên |
| Bản EE | **BLK-1** — `backend/src/_ee` không tồn tại | `test -d backend/src/_ee` |
| Chatwoot production | `chatwoot/chatwoot:v4.16.2` @ `sha256:f9b071ff…8211b2` | `docker inspect` |
| Chatwoot PostgreSQL | 16.14 (Debian 16.14-1.pgdg12+1) · DB `chatwoot` 19 MB | `select version()` |
| Mã nguồn Chatwoot đối chiếu | giải nén từ chính image đang chạy — **source = production** | `docker cp` từ container |

### Ràng buộc đã tuân thủ tuyệt đối

Toàn bộ tương tác với VPS chỉ gồm **lệnh đọc**. Không restart container, không sửa biến môi trường, không chạy migration, không kết nối fanpage thật. Không một giá trị token, password hay app secret nào được đọc hay in ra: các secret chỉ được kiểm tra ở trạng thái *có / không có*. Trong một trường hợp bắt buộc phải phân biệt "có giá trị thật" với "giá trị rỗng mặc định", tôi so sánh `md5` giữa các bản ghi thay vì đọc nội dung. Không dữ liệu khách hàng nào xuất hiện trong báo cáo — mọi số liệu về tin nhắn đều ở dạng đếm tổng hợp.

### Hạng mục bị chặn (BLOCKED — không suy đoán)

| Mã | Hạng mục | Lý do bị chặn | Cách gỡ |
|---|---|---|---|
| BLK-1 | Mã nguồn EE của ZaloCRM | Thư mục `backend/src/_ee` không có trong worktree | Chủ dự án cung cấp repo EE nếu tồn tại |
| BLK-2 | Reproduction fan-out đa tài khoản của Chatwoot (§3.5) | Cần tạo 2 Account + 2 Inbox trên production = thao tác **ghi**, vi phạm ràng buộc chỉ-đọc | Dựng Chatwoot staging riêng rồi chạy kịch bản ở test D |
| BLK-3 | Trang tài liệu Meta về callback xoá dữ liệu người dùng | Không phân giải được URL tại thời điểm kiểm toán | Xác nhận lại trước khi nộp App Review; **không suy đoán** |
| BLK-4 | Hành vi thực tế của Meta khi gửi lại webhook trùng | Chưa có fanpage test; tài liệu Meta chỉ nói "server của bạn phải tự khử trùng lặp" | Đo tại P5 với fanpage thử nghiệm |

### Quy ước phân loại

| Nhãn | Nghĩa |
|---|---|
| `OBSERVED` | Đọc trực tiếp từ mã / schema / cấu hình |
| `VERIFIED` | Có test hoặc reproduction đã chạy |
| `INFERRED` | Suy luận từ mã, **chưa** chạy reproduction |
| `PROPOSED` | Đề xuất của báo cáo này |
| `BLOCKED` | Không truy cập được |
| `REJECTED` | Kết luận cũ bị bác bỏ bởi mã hoặc test |

---

## Output 1 — Phán quyết điều hành

> ### CONDITIONAL GO — Phương án D
> **Native là đích đến, đi bằng lộ trình có pha, giữ Chatwoot chỉ như một sandbox tham chiếu dùng một lần và khai tử ở P12.**

Đây là **tinh chỉnh** chứ không phải đảo ngược kết luận "Native" của Vòng 1. Vòng 1 **đúng về đích đến nhưng sai về đường đi**: nó xếp thứ tự migration không chạy được, đề xuất một ràng buộc unique có lỗ NULL, dùng một khoá khử trùng lặp không đủ cho các loại sự kiện của Meta, và kết tội kiến trúc Chatwoot bằng bằng chứng thực chất chỉ là lỗi cấu hình.

### Bảy điều kiện bắt buộc để chuyển từ Conditional Go sang Go

1. **Có backup tự động và đã khôi phục thử thành công.** Hiện VPS *không có* cron backup nào; artefact backup duy nhất có ngày 22-07-2026 ⇒ RPO đo được là **40 ngày**. Đây là điều kiện **chặn cứng**, phải xong trước mọi migration của dự án.
2. **Sửa thứ tự migration**: `Conversation.zaloAccountId` phải nullable **ngay trong pha additive đầu tiên**, kèm CHECK constraint và partial unique index bảo vệ đường ghi Zalo.
3. **Chốt mô hình định danh**: `scopeId` NOT NULL với sentinel `'__global__'`; `ChannelAccount.externalId` unique **toàn cục**.
4. **Khoá khử trùng lặp tách 4 khái niệm** (webhook delivery / platform event / message / outbound idempotency).
5. **Xác minh chữ ký fail-closed**: thiếu app secret ⇒ từ chối request, *và* thiếu secret ⇒ kênh không kích hoạt được, báo lỗi ồn ào.
6. **Thống nhất tên biến mã hoá token** — hiện tồn tại song song `FB_TOKEN_ENC_KEY` (vắng mặt trên production) và `TOKEN_ENCRYPTION_KEY` (có mặt); bật kênh FB hôm nay sẽ throw ngay.
7. **Một fanpage thử nghiệm chạy end-to-end** không trùng lặp, không mất tin, trước khi mở cho khách thật.

### Những gì *không* phải điều kiện

Nâng cấp VPS **không** nằm trong điều kiện. Số liệu thật (RAM còn trống 4181 MB, disk 67 %, ~8,08 GB có thể thu hồi bằng `docker system prune`, Redis dùng 2,37/256 MB, không có backlog BullMQ) **không đủ căn cứ** để yêu cầu nâng cấp.

---

## Output 2 — Số phận từng kết luận của báo cáo Vòng 1

| Kết luận Vòng 1 | Trạng thái | Căn cứ Vòng 2 |
|---|---|---|
| CRIT-1: Chatwoot bỏ qua xác minh chữ ký khi thiếu `FB_APP_SECRET` | **GIỮ — nâng lên VERIFIED** | Vòng 1 khẳng định mà chưa đọc gem. Nay đã truy vết trọn chuỗi: `global_config_service.rb:10` trả `nil` khi rỗng → `facebook_messenger.rb:9` `app_secret_for` trả nil → gem `server.rb:78` `return unless app_secret_for(...)` ⇒ bỏ qua hoàn toàn. Production: cả ENV lẫn `installation_configs` đều rỗng. |
| CRIT-1 hàm ý "kiến trúc Chatwoot không an toàn" | **BÁC BỎ** | Đây là *lỗi cấu hình*, sửa được bằng biến môi trường hoặc app secret theo từng Page qua `provider_config` (`facebook_messenger.rb:33`). Không được dùng nó làm căn cứ duy nhất để loại Chatwoot. |
| HIGH: token Page lưu plaintext | **GIỮ — nhưng hạ nguyên nhân** | `channel/facebook_page.rb:25` bọc `encrypts` trong `if Chatwoot.encryption_configured?`. Ba biến `ACTIVE_RECORD_ENCRYPTION_*` đều vắng ⇒ plaintext. *Sửa được bằng cấu hình*; hiện có 0 bản ghi nên không cần `support_unencrypted_data`. |
| HIGH-4: "Chatwoot tải media không có bảo vệ SSRF" | **HẠ MỨC + SỬA PHÁT BIỂU** | Vòng 1 nói quá. Chatwoot *có* `lib/safe_fetch.rb` dựa trên `ssrf_filter`, chín muồi, 8 nơi gọi. Vấn đề hẹp hơn nhiều: riêng `messages/messenger/message_builder.rb:32` gọi thẳng `Down.download`. Patch nhỏ ở nguồn, không phải thiếu năng lực kiến trúc. |
| Fan-out chéo tài khoản qua `.last` | **GIỮ — nhưng là INFERRED, không phải VERIFIED** | `facebook_messenger.rb:14` và `:20` đều dùng `Channel::FacebookPage.where(page_id:).last` không giới hạn account; index unique là `(page_id, account_id)`. Reproduction **chưa chạy** (BLK-2) vì cần thao tác ghi. |
| Chatwoot: `valid_verify_token?` đáng ngờ | **NÂNG MỨC** | Nặng hơn Vòng 1 nghĩ: `def valid_verify_token?(_verify_token)` — tham số bị **bỏ qua hoàn toàn**, chỉ trả về giá trị config. Đây là **bypass xác minh webhook ở mã nguồn**, không sửa được bằng cấu hình. Trớ trêu: chính việc thiếu `FB_VERIFY_TOKEN` hiện tại lại vô hiệu hoá lỗ này (trả nil ⇒ falsy). |
| Thứ tự pha P2 inbound → P3 outbound → P4 UI → P7 nullable | **BÁC BỎ — không chạy được** | `Conversation.zaloAccountId` là NOT NULL (`schema.prisma:764-816`). P2 không thể tạo nổi một Conversation Messenger. |
| `@@unique([orgId, provider, scopeId, externalUserId])` | **BÁC BỎ — có lỗ NULL** | PostgreSQL mặc định NULLS DISTINCT: nhiều NULL cùng tồn tại ⇒ danh tính toàn cục (Zalo, scopeId NULL) bị nhân bản vô hạn. Lỗi này *đã có sẵn* trong production qua `Contact.@@unique([orgId, zaloGlobalId])` trên cột nullable. |
| Khoá idempotency `(provider, externalId)` | **BÁC BỎ — không đủ** | Không phủ được echo (trùng `mid` với tin gốc), delivery/read (không có mid), postback/referral/optin (không có id ổn định), và payload nhiều `entry[]`/`messaging[]`. |
| ZaloCRM "sạch" so với Chatwoot về unique page_id | **BÁC BỎ — chính ZaloCRM cũng dính** | `FacebookPageConnection.@@unique([orgId, pageId])` đúng *cùng một lớp lỗi* mà Vòng 1 quy cho Chatwoot. Phải sửa thành unique toàn cục (tiền lệ: `ZaloAccount.zaloUid @unique`). |
| Vòng 1 không ghi nhận năng lực sẵn có của ZaloCRM | **THIẾU SÓT — bổ sung** | ZaloCRM *đã có*: tách `zaloMsgId` khỏi `clientEchoId`, envelope encryption qua `FacebookAppConfig.tokenEncKeyEnc`, schema `FacebookPageConnection`/`FacebookAppConfig`, tenant guard + RLS `set_config` an toàn với pooling (`is_local=true`). |
| Kết luận cuối "Native" | **GIỮ — làm rõ thành phương án D** | Chấm điểm lại có trọng số: hiện tại A 48,8 · B 49,8 · C 40,6 · **D 55,8**; đã harden A 73,8 · B 64,6 · C 55,8 · **D 83,6**. |
| Chatwoot phủ đủ sự kiện Messenger cho CRM | **BÁC BỎ — phát hiện mới** | `facebook_page.rb` chỉ subscribe `messages, message_deliveries, message_echoes, message_reads, standby, messaging_handovers` — **không có postback, referral, opt-in, reaction**. Phương án B/C sẽ mất tham số `ref` của m.me và dữ liệu referral từ quảng cáo click-to-Messenger. |
| Đánh giá năng lực VPS của Vòng 1 | **CHƯA ĐỦ BẰNG CHỨNG (nay đã đo)** | Vòng 1 không có số. Nay có: 4 vCPU, load 0,19; RAM còn 4181 MB; disk 67 %; PG max_connections 50 (dùng 7); media 3,2 GB / 4788 file, ~1,33 GB/tháng. Kết luận: **đủ cho phát triển và pilot**. |

---

## Output 3 — Danh sách Critical và High đã xác minh

> Mỗi phát hiện có đủ 12 trường bắt buộc. Không phát hiện nào được gọi là "đã khai thác được" nếu chưa có reproduction thực sự chạy.

### R2-C1 · CRITICAL · VERIFIED — Không có backup tự động, RPO đo được 40 ngày

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | Critical |
| **2. Thành phần** | Hạ tầng VPS · PostgreSQL `zalocrm` · volume media |
| **3. File / vị trí** | Không tồn tại `crontab -l` cho root, `/etc/cron.d` trống hạng mục backup. Artefact duy nhất: `/opt/ZaloCRM-CorepViet/backups/zalocrm-before-285bd86-20260722-232720.sql.gz` (3,4 MB, 22-07-2026) |
| **4. Điều kiện xảy ra** | Bất kỳ sự cố mất dữ liệu nào: migration hỏng, xoá nhầm, hỏng volume, mất VPS |
| **5. Kịch bản hỏng** | Không phải lỗ hổng bị khai thác mà là mất mát chắc chắn: khôi phục về được điểm gần nhất là 22-07-2026 ⇒ mất toàn bộ 47.394 tin nhắn phát sinh sau đó, trong đó 17.608 tin trong 30 ngày gần nhất |
| **6. Ảnh hưởng** | Mất lịch sử hội thoại khách hàng — tài sản chính của CRM. Không thể rollback bất kỳ migration nào một cách an toàn |
| **7. Reproduction** | `crontab -l; ls -la /etc/cron.d; ls -la /opt/ZaloCRM-CorepViet/backups` — chỉ đọc, **đã chạy** |
| **8. Sửa ngắn hạn** | Cron hằng đêm: `pg_dump -Fc` DB `zalocrm` + `tar` volume `zalocrm-corepviet_file_storage`, giữ 7 bản ngày + 4 bản tuần, đẩy off-site |
| **9. Sửa dài hạn** | Bật WAL archiving / PITR; diễn tập khôi phục hằng quý lên máy khác; giám sát tuổi bản backup và cảnh báo khi > 26 giờ |
| **10. Test tự động** | Job CI hằng tuần: tải dump mới nhất, `pg_restore` vào container tạm, assert `_prisma_migrations ≥ 126`; fail nếu dump cũ hơn 26 giờ |
| **11. Rollback** | Không áp dụng — chỉ thêm cron |
| **12. Độ tin cậy** | **Cao** — quan sát trực tiếp |

### R2-C2 · CRITICAL · VERIFIED — Mâu thuẫn thứ tự migration: P2 không thể tạo Conversation Messenger

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | Critical |
| **2. Thành phần** | Schema Prisma · lộ trình migration của báo cáo Vòng 1 |
| **3. File / vị trí** | `backend/prisma/schema.prisma:764-816` — `Conversation.zaloAccountId String` (NOT NULL) và `@@unique([zaloAccountId, externalThreadId])` |
| **4. Điều kiện xảy ra** | Ngay khi webhook Messenger đầu tiên đến ở P2 theo thứ tự cũ (nullable chỉ tới P7) |
| **5. Kịch bản hỏng** | `INSERT` vi phạm NOT NULL ⇒ toàn bộ đường inbound Messenger fail 100 %. Nếu "chữa" bằng ZaloAccount sentinel thì unique `(zaloAccountId, externalThreadId)` ép mọi hội thoại Messenger dùng chung một không gian khoá ⇒ thống kê và truy vấn theo nick Zalo đều sai |
| **6. Ảnh hưởng** | Pha P2 không thể nghiệm thu; nếu dùng sentinel thì dữ liệu Zalo bị ô nhiễm và rất khó gỡ |
| **7. Reproduction** | Trên bản clone schema production: `INSERT INTO conversations (id, org_id, external_thread_id) VALUES (...)` không có `zalo_account_id` ⇒ `null value in column "zalo_account_id" violates not-null constraint` |
| **8. Sửa ngắn hạn** | Dời việc nới nullable lên pha additive đầu tiên, kèm `CHECK (channel_account_id IS NOT NULL OR zalo_account_id IS NOT NULL)` |
| **9. Sửa dài hạn** | Thay unique cũ bằng partial unique index tạo `CONCURRENTLY`, chỉ áp cho hàng Zalo; assertion ở tầng ứng dụng; truy vấn đối soát phải trả 0 |
| **10. Test tự động** | Chạy migration trên bản sao schema production, ghi 1 hội thoại Zalo + 1 hội thoại Messenger, assert cả hai thành công; assert hội thoại không có cả hai cột thì thất bại |
| **11. Rollback** | Được, **chỉ khi chưa có hàng Messenger**. Sau đó việc đưa cột về NOT NULL sẽ fail ⇒ "điểm không quay lại của schema" (P5) |
| **12. Độ tin cậy** | **Cao** — ràng buộc đọc trực tiếp từ schema đang chạy production |

### R2-C3 · CRITICAL · VERIFIED — Lỗ NULL trong ràng buộc unique định danh, đã tồn tại trong production

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | Critical |
| **2. Thành phần** | `Contact` hiện tại; và `ContactIdentity` theo đề xuất Vòng 1 |
| **3. File / vị trí** | `backend/prisma/schema.prisma` — `Contact.zaloGlobalId String?` với `@@unique([orgId, zaloGlobalId])` |
| **4. Điều kiện xảy ra** | Bất kỳ khi nào cột tham gia unique nhận NULL. PostgreSQL mặc định *NULLS DISTINCT*: hai hàng cùng `orgId` và cùng NULL vẫn hợp lệ |
| **5. Kịch bản hỏng** | Với đề xuất cũ `(orgId, provider, scopeId, externalUserId)`: danh tính toàn cục (Zalo, `scopeId` NULL) bị nhân bản không giới hạn ⇒ một khách hàng thành N contact, gán sale sai, thống kê sai, logic merge chạy trên dữ liệu đã hỏng |
| **6. Ảnh hưởng** | Phân mảnh hồ sơ khách hàng — phá đúng mục tiêu "hồ sơ khách hàng hợp nhất" |
| **7. Reproduction** | DB throwaway: `CREATE TABLE t(org text, gid text, UNIQUE(org,gid)); INSERT INTO t VALUES ('o1',NULL),('o1',NULL);` ⇒ cả hai insert thành công |
| **8. Sửa ngắn hạn** | Bảng mới: `scopeId` NOT NULL, sentinel `'__global__'` cho provider không có scope |
| **9. Sửa dài hạn** | Bảng `Contact` hiện tại: chuyển sang `UNIQUE NULLS NOT DISTINCT` (PG 16) hoặc partial unique index; dọn trùng lặp hiện có trước |
| **10. Test tự động** | Chèn hai danh tính global cùng org ⇒ từ chối; hai PSID giống nhau khác Page ⇒ chấp nhận; cùng PSID cùng Page ⇒ từ chối |
| **11. Rollback** | Bảng mới: drop bảng. `Contact`: đổi index đảo ngược được, nhưng phải dọn trùng trước |
| **12. Độ tin cậy** | **Cao** — hành vi NULL của PostgreSQL là xác định, và mẫu lỗi đã có trong schema production |

### R2-C4 · CRITICAL · VERIFIED — Chatwoot bỏ qua xác minh chữ ký webhook khi thiếu app secret (fail-open)

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | Critical |
| **2. Thành phần** | Chatwoot v4.16.2 · gem `facebook-messenger 2.0.1` |
| **3. File / vị trí** | `/gems/ruby/3.4.0/gems/facebook-messenger-2.0.1/lib/facebook/messenger/server.rb:78` — `return unless app_secret_for(parsed_body['entry'][0]['id'])`; nguồn nil: `config/initializers/facebook_messenger.rb:9` → `lib/global_config_service.rb:10` `return if config_value.blank?` |
| **4. Điều kiện xảy ra** | Khi không có app secret ở cả `provider_config` của channel lẫn `GlobalConfigService('FB_APP_SECRET')`. Production hiện đúng như vậy: ENV vắng, ba bản ghi FB trong `installation_configs` cùng chia sẻ một md5 với 55/105 config khác ⇒ giá trị rỗng mặc định |
| **5. Kịch bản hỏng** | Bất kỳ ai biết URL webhook đều có thể POST payload giả không cần chữ ký, tạo hội thoại và tin nhắn giả trong CRM, hoặc bơm nội dung vào ngữ cảnh AI |
| **6. Ảnh hưởng** | Toàn vẹn dữ liệu hội thoại; nếu AI đọc hội thoại thì trở thành kênh prompt injection |
| **7. Reproduction** | Trên Chatwoot **staging**: POST payload Messenger hợp lệ tới `/bot` bỏ hẳn header `X-Hub-Signature`, quan sát tin nhắn được tạo. Chưa chạy trên production vì vi phạm ràng buộc chỉ-đọc |
| **8. Sửa ngắn hạn** | Đặt `FB_APP_SECRET`, hoặc app secret theo từng Page qua `provider_config` (`facebook_messenger.rb:33` chấp nhận `app_secret`, `app_secret_key`, `client_secret`, `api_secret`). **Lỗi cấu hình, sửa được không cần đụng mã** |
| **9. Sửa dài hạn** | ZaloCRM native: fail-closed tuyệt đối — thiếu secret ⇒ từ chối request *và* kênh không kích hoạt được |
| **10. Test tự động** | Request không chữ ký / chữ ký sai / thiếu secret ⇒ đều trả 401, assert không bản ghi nào được tạo |
| **11. Rollback** | Không áp dụng (chỉ thêm cấu hình) |
| **12. Độ tin cậy** | **Cao** cho phần mã (đã đọc trọn chuỗi gọi). **Trung bình-cao** cho phần production (suy ra từ md5 trùng, không đọc giá trị theo đúng ràng buộc) |

### R2-C5 · CRITICAL · OBSERVED — ZaloCRM cũng mắc lỗi page_id chỉ unique theo org

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | Critical |
| **2. Thành phần** | `FacebookPageConnection` trong ZaloCRM |
| **3. File / vị trí** | `backend/prisma/schema.prisma` — `@@unique([orgId, pageId])`. Đối chiếu Chatwoot: `app/models/channel/facebook_page.rb:32` `validates :page_id, uniqueness: { scope: :account_id }` |
| **4. Điều kiện xảy ra** | Hai org khác nhau cùng kết nối một Page ID — cố ý (đại lý và nhà phân phối) hoặc do kẻ tấn công tự khai Page ID của người khác |
| **5. Kịch bản hỏng** | Webhook đến chỉ mang `entry[].id` = Page ID. Nếu Page ID không unique toàn cục thì bộ định tuyến không xác định được org đích ⇒ hoặc fan-out sang cả hai org (rò rỉ chéo tenant), hoặc chọn nhầm và dùng sai token khi gửi ra |
| **6. Ảnh hưởng** | **Rò rỉ hội thoại giữa các tenant** — nghiêm trọng nhất trong toàn bộ mô hình mối đe doạ |
| **7. Reproduction** | Trên staging: tạo 2 org, cùng khai một Page ID, gửi 1 webhook ký hợp lệ, đếm Conversation được tạo và ghi nhận token nào được dùng |
| **8. Sửa ngắn hạn** | `ChannelAccount.@@unique([provider, externalId])` **toàn cục** — tiền lệ đã có: `ZaloAccount.zaloUid String? @unique` |
| **9. Sửa dài hạn** | Nhu cầu "nhiều org dùng chung một Page" giải bằng `ChannelAccountAccess` (nhiều-nhiều có phân quyền), không bao giờ bằng nhân bản bản ghi Page |
| **10. Test tự động** | Org B kết nối Page ID mà org A đã sở hữu ⇒ từ chối với lỗi rõ nghĩa, không tạo bản ghi |
| **11. Rollback** | Đảo ngược được ở P4 (chưa có dữ liệu Page thật). Sau P12 phải dọn trùng trước khi hạ cấp index |
| **12. Độ tin cậy** | **Cao** cho schema. Kịch bản hỏng là **INFERRED** cho tới khi chạy reproduction |

### R2-H1 · HIGH · VERIFIED — Cách ly tenant chưa được thực thi

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | High |
| **2. Thành phần** | Tầng tenant của ZaloCRM |
| **3. File / vị trí** | `backend/src/shared/database/prisma-client.ts:95-200` (3 lớp `$extends`, tenant-guard :121); `backend/src/modules/auth/auth-middleware.ts:53` `enterTenantContext(request.authCtx)` — **nơi gọi duy nhất trong toàn backend** |
| **4. Điều kiện xảy ra** | Production đặt `TENANT_GUARD_MODE=off` và `RLS_SET_CONFIG=false`; RLS bật trên **0/117** bảng. 116 model, 95 có `orgId`, 66 đăng ký trong `ORG_SCOPED_MODELS`, **29 thiếu**, 21 model không có `orgId` — trong đó có `Message`, bảng lớn nhất |
| **5. Kịch bản hỏng** | Một truy vấn bỏ sót `orgId` — do lỗi lập trình hoặc qua 71 lời gọi raw SQL (8 trong đó là `$queryRawUnsafe`/`$executeRawUnsafe`) — sẽ trả dữ liệu của org khác mà không lưới an toàn nào chặn |
| **6. Ảnh hưởng** | Rò rỉ dữ liệu xuyên tenant. Rủi ro tăng mạnh khi thêm Messenger vì bề mặt ghi mở rộng sang webhook và worker |
| **7. Reproduction** | Trên staging: đăng nhập org A, gọi endpoint với id thuộc org B; chạy worker BullMQ không có ngữ cảnh tenant, quan sát nó vẫn ghi được |
| **8. Sửa ngắn hạn** | Bổ sung 29 model thiếu vào `ORG_SCOPED_MODELS`; đặt `TENANT_GUARD_MODE=warn`, thu log, sửa hết cảnh báo, rồi mới `enforce` |
| **9. Sửa dài hạn** | Bọc ngữ cảnh tenant cho worker/cron/webhook (`group-scan-queue.ts`, `zalo-label-queue.ts`, `telegram-bridge/receiver.ts` hiện có **0** lời gọi `withTenant`). Bật RLS **theo từng nhóm bảng**. `set_config(..., true)` đã đúng (phạm vi transaction ⇒ an toàn với pooling) |
| **10. Test tự động** | Bộ test hợp đồng tenant: org A không đọc/sửa/xoá được dữ liệu org B; worker thiếu ngữ cảnh phải *fail*; raw SQL không vượt RLS; connection tái sử dụng không giữ org cũ; truy vấn bypass hệ thống phải ghi audit log |
| **11. Rollback** | Theo nhóm bảng: `ALTER TABLE … DISABLE ROW LEVEL SECURITY`; guard hạ từ enforce về warn bằng biến môi trường |
| **12. Độ tin cậy** | **Cao** cho số liệu. **Trung bình** cho mức độ khai thác thực tế — chưa chạy reproduction |

### R2-H2 · HIGH · OBSERVED + PROPOSED — Khoá khử trùng lặp một trường không đủ

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | High |
| **2. Thành phần** | `WebhookEvent` đề xuất ở Vòng 1; và `WebhookLog` hiện có |
| **3. File / vị trí** | `backend/prisma/schema.prisma` — `WebhookLog.externalLeadId String @unique` (unique toàn cục, không phân theo nguồn hay org) |
| **4. Điều kiện xảy ra** | Meta gửi payload nhiều `entry[]` và nhiều `messaging[]`; hoặc gửi lại sau timeout; hoặc gửi delivery/read/postback/referral/opt-in vốn không có `mid`; hoặc gửi echo mang đúng `mid` của tin vừa gửi |
| **5. Kịch bản hỏng** | Hai chiều đều hỏng: khoá quá hẹp ⇒ N−1 sự kiện trong một payload bị nuốt (**mất tin nhắn**); khoá đặt trên `mid` chung cho cả inbound lẫn echo ⇒ echo bị coi là trùng và tin gửi đi không bao giờ được đối chiếu |
| **6. Ảnh hưởng** | Mất tin hoặc nhân đôi tin — cả hai đều phá vỡ điều kiện nghiệm thu cuối cùng |
| **7. Reproduction** | Unit test bằng payload mẫu từ tài liệu Meta: body chứa 2 entry × 2 messaging ⇒ assert tạo đúng 4 sự kiện; gửi lại cùng body 3 lần ⇒ assert vẫn 4 |
| **8. Sửa ngắn hạn** | Tách 4 khái niệm và dùng khoá theo từng loại sự kiện (bảng ở Output 6) |
| **9. Sửa dài hạn** | Sự kiện không có id ổn định: fingerprint chuẩn hoá `sha256(canonical_json(event))` kèm `channelAccountId` và `eventType` |
| **10. Test tự động** | Bảng test tham số hoá phủ đủ 9 loại: message, echo, delivery, read, reaction, postback, referral, opt-in, attachment |
| **11. Rollback** | Khoá dedup nằm trên bảng mới ở P2 ⇒ drop bảng là đủ |
| **12. Độ tin cậy** | **Cao** — tài liệu Meta nói rõ có gửi lại và "server của bạn phải tự khử trùng lặp"; cấu trúc lồng `entry[]`/`messaging[]` được tài liệu xác nhận |

### R2-H3 · HIGH · OBSERVED — Bộ tải media Messenger của Chatwoot không dùng SafeFetch sẵn có

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | High |
| **2. Thành phần** | Chatwoot · `Messages::Messenger::MessageBuilder` |
| **3. File / vị trí** | `app/builders/messages/messenger/message_builder.rb:31-38` — `Down.download(file_url)` trần. Đối chiếu: `lib/safe_fetch.rb` (dựa trên `ssrf_filter 1.5.0`, kiểm scheme, allowlist content-type, cắt header nhạy cảm, timeout 2 s mở / 20 s đọc, giới hạn 40 MB dạng stream) đang được 8 nơi khác dùng |
| **4. Điều kiện xảy ra** | `file_url` đến từ `attachments[].payload.url` trong payload webhook. Ở production hiện tại payload này **không được bảo vệ bằng chữ ký** (R2-C4) ⇒ kẻ tấn công kiểm soát hoàn toàn URL |
| **5. Kịch bản hỏng** | SSRF: ép server tải từ `169.254.169.254` hoặc dịch vụ nội bộ; redirect từ host hợp lệ sang IP riêng; DNS rebinding; file khổng lồ gây cạn disk. Khi *đã* sửa R2-C4 thì bề mặt tấn công thu hẹp mạnh |
| **6. Ảnh hưởng** | Truy cập metadata/nội bộ VPS; cạn dung lượng đĩa (hiện còn 26 GB) |
| **7. Reproduction** | Trên staging: gửi webhook có `attachments[].payload.url` trỏ tới HTTP server cục bộ ghi log, xác nhận có request đến |
| **8. Sửa ngắn hạn** | Patch nguồn: thay `Down.download` bằng `SafeFetch` — vài dòng |
| **9. Sửa dài hạn (ZaloCRM native)** | Bộ tải dùng chung: chỉ HTTPS; allowlist hostname kiểm hậu tố đúng cách; resolve DNS rồi chặn private/link-local/loopback; kiểm lại sau **mỗi** redirect; chống DNS rebinding bằng pin IP đã resolve; giới hạn theo `Content-Length` và cắt cứng theo byte khi không có header; timeout connect và read riêng; sniff MIME; không chuyển tiếp credential sang host redirect; đẩy sang MinIO bằng worker riêng |
| **10. Test tự động** | URL tới `127.0.0.1`, `169.254.169.254`, host công khai redirect sang IP riêng, file vượt hạn mức, scheme `file://` — tất cả phải bị chặn |
| **11. Rollback** | Không áp dụng cho ZaloCRM; với Chatwoot là revert patch |
| **12. Độ tin cậy** | **Cao** cho phần mã. Mức nghiêm trọng *phụ thuộc* R2-C4 — nêu rõ để không thổi phồng |

### R2-H4 · HIGH · OBSERVED — Chatwoot lưu Page access token plaintext

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | High |
| **2. Thành phần** | Chatwoot · `Channel::FacebookPage` |
| **3. File / vị trí** | `app/models/channel/facebook_page.rb:25-27` — `if Chatwoot.encryption_configured?` bọc quanh `encrypts :page_access_token` và `encrypts :user_access_token` |
| **4. Điều kiện xảy ra** | Ba biến `ACTIVE_RECORD_ENCRYPTION_*` đều vắng mặt trên production ⇒ nhánh `encrypts` không chạy |
| **5. Kịch bản hỏng** | Bất kỳ ai đọc được DB (dump backup, truy cập psql, SQL injection) lấy được token Page và gửi tin danh nghĩa fanpage khách hàng |
| **6. Ảnh hưởng** | Chiếm quyền gửi tin trên fanpage. Hiện thiệt hại bằng 0 vì `channel_facebook_pages` có **0 bản ghi** |
| **7. Reproduction** | Kiểm tra sự hiện diện biến môi trường (đã làm, không đọc giá trị) + đếm bản ghi bảng (đã làm, = 0) |
| **8. Sửa ngắn hạn** | Đặt ba khoá `ACTIVE_RECORD_ENCRYPTION_*` trước khi kết nối Page đầu tiên. Vì đang 0 bản ghi nên **không** cần `support_unencrypted_data` |
| **9. Sửa dài hạn (native)** | Envelope encryption đã có tiền lệ trong repo (`FacebookAppConfig.tokenEncKeyEnc`): khoá dữ liệu theo org bọc bởi master key; xoay khoá qua `TokenCredential.version` |
| **10. Test tự động** | Đọc thẳng cột token bằng SQL thô, assert **không** khớp giá trị gốc; assert token không xuất hiện trong log và thông báo lỗi |
| **11. Rollback** | Không áp dụng (0 bản ghi) |
| **12. Độ tin cậy** | **Cao** |

### R2-H5 · HIGH · OBSERVED — WebhookLog: khoá unique quá rộng và raw body lưu vô thời hạn

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | High |
| **2. Thành phần** | ZaloCRM · `WebhookLog` |
| **3. File / vị trí** | `backend/prisma/schema.prisma` — `externalLeadId String @unique` và `rawBody Json` không có trường TTL |
| **4. Điều kiện xảy ra** | Hai nguồn khác nhau (hoặc hai org) sinh id trùng chuỗi ⇒ sự kiện thứ hai bị nuốt. Đồng thời mọi payload thô được giữ mãi |
| **5. Kịch bản hỏng** | Mất lead âm thầm; tích tụ dữ liệu cá nhân không có hạn xoá, trái nguyên tắc tối thiểu hoá PII và gây khó cho yêu cầu xoá dữ liệu người dùng của Meta |
| **6. Ảnh hưởng** | Mất dữ liệu kinh doanh + rủi ro tuân thủ |
| **7. Reproduction** | Trên staging: ghi hai `WebhookLog` khác nguồn cùng `externalLeadId` ⇒ cái thứ hai bị từ chối |
| **8. Sửa ngắn hạn** | Đổi thành `@@unique([orgId, source, externalLeadId])` |
| **9. Sửa dài hạn** | Bảng raw webhook mới: mã hoá, redact token, TTL 30 ngày, hạn chế quyền đọc, ghi audit mỗi lần đọc. **Không lưu webhook thô vô thời hạn** |
| **10. Test tự động** | Hai nguồn cùng id ⇒ cả hai được ghi; job dọn TTL xoá đúng bản ghi quá hạn; assert không có chuỗi giống token trong `rawBody` sau redact |
| **11. Rollback** | Nới lỏng index an toàn; siết lại cần dọn trùng trước |
| **12. Độ tin cậy** | **Cao** |

### R2-H6 · HIGH · OBSERVED — Gem chỉ đọc header chữ ký SHA-1 cũ, Meta ký SHA-256

| Trường | Nội dung |
|---|---|
| **1. Mức độ** | High |
| **2. Thành phần** | gem `facebook-messenger 2.0.1` (dùng bởi Chatwoot) |
| **3. File / vị trí** | `server.rb:80` `unless signature.start_with?('sha1=')`; `:91` chỉ đọc `HTTP_X_HUB_SIGNATURE`; `:115` `OpenSSL::HMAC.hexdigest('sha1', …)`. Tài liệu Meta hiện hành: payload được ký **SHA256** trong `X-Hub-Signature-256` |
| **4. Điều kiện xảy ra** | Luôn luôn, khi đã cấu hình app secret |
| **5. Kịch bản hỏng** | Phụ thuộc việc Meta còn gửi kèm header sha1 cũ hay không — điều Meta có thể ngừng bất cứ lúc nào. Khi đó: hoặc mọi webhook bị từ chối (mất tin toàn bộ), hoặc hệ thống rơi về thuật toán yếu hơn |
| **6. Ảnh hưởng** | Rủi ro gián đoạn kênh + xác thực yếu. Đây là **lý do kỹ thuật chính** khiến phương án B/C kém bền vững, độc lập với mọi lỗi cấu hình |
| **7. Reproduction** | Trên staging: gửi request chỉ có `X-Hub-Signature-256` hợp lệ, không có header sha1 ⇒ gem raise `BadRequestError` |
| **8. Sửa ngắn hạn** | **Không có cách sửa bằng cấu hình.** Phải vá gem hoặc chèn middleware xác minh trước |
| **9. Sửa dài hạn (native)** | Xác minh `X-Hub-Signature-256` trên **raw body** nguyên bản (không parse lại), so sánh bằng `timingSafeEqual`, xử lý đúng quy tắc escape unicode của Meta — đặc biệt quan trọng với tiếng Việt có dấu |
| **10. Test tự động** | Chữ ký đúng / sai / thiếu / sai độ dài; raw body khác nhau về khoảng trắng và thứ tự khoá phải cho cùng kết quả; body chứa tiếng Việt có dấu |
| **11. Rollback** | Không áp dụng |
| **12. Độ tin cậy** | **Cao** cho phần mã và tài liệu Meta. Mức nghiêm trọng thực tế là **INFERRED** vì phụ thuộc hành vi gửi header của Meta (BLK-4) |

### Medium — tóm tắt

| Mã | Phát hiện | Vị trí | Sửa ngắn hạn |
|---|---|---|---|
| R2-M1 | Verify token của webhook lưu plaintext | `schema.prisma` · `FacebookAppConfig.webhookVerifyToken` | Mã hoá như `appSecretEnc`; so sánh bằng hàm timing-safe |
| R2-M2 | Hai tên biến mã hoá token song song ⇒ bật kênh FB hôm nay sẽ throw | `shared/crypto/aes-gcm.ts:16` (`FB_TOKEN_ENC_KEY`, **vắng**) ↔ `integrations/_shared/token-encryption.util.ts:22` (`TOKEN_ENCRYPTION_KEY`, **có**) | Thống nhất một tên; fail-closed ở startup nếu thiếu |
| R2-M3 | Caddy không giới hạn body và không đặt timeout; log rotation chỉ 2/15 container; healthcheck thiếu 6/15 | `/opt/n8n/Caddyfile` · `docker inspect` | `request_body { max_size 25MB }`, timeout tường minh, bật `json-file` log rotation cho mọi container |
| R2-M4 | `Message` không có `orgId` ⇒ RLS phải đi vòng qua `conversation` | `schema.prisma` · model `Message` | Hoặc thêm `orgId` denormalized (backfill 47k hàng), hoặc policy RLS dạng `EXISTS`; quyết định ở P10 |
| R2-M5 | Chatwoot không subscribe postback / referral / opt-in / reaction | `app/models/channel/facebook_page.rb` · `subscribed_fields` | Không sửa được nếu dùng Chatwoot làm gateway ⇒ lý do loại phương án B cho nhu cầu marketing |

---

## Output 4 — Lỗi thiết kế trong đề xuất Vòng 1

1. **Thứ tự pha không chạy được.** Nới nullable đặt ở P7 nhưng đường ghi cần nó ở P2. Nguyên tắc sửa: **DB mở rộng trước ứng dụng; ứng dụng thu hẹp trước DB.** Mọi thay đổi cho phép ghi phải nằm ở pha additive đầu tiên.
2. **Unique có lỗ NULL.** Đề xuất cũ dựa vào `scopeId` nullable. PostgreSQL cho phép nhiều NULL cùng tồn tại. Sửa: `scopeId` NOT NULL + sentinel.
3. **Một trường gánh bốn khái niệm.** Webhook delivery ID, platform event ID, message ID và outbound idempotency key bị gộp vào `externalId`. Chính repo đã có tiền lệ tách đúng: `zaloMsgId` vs `clientEchoId`.
4. **`canSend(): boolean` quá nghèo.** Không diễn đạt được "được gửi nhưng chỉ do người thật bấm". Mà HUMAN_AGENT của Meta *bắt buộc* là phản hồi thủ công. Sửa: trả về `PolicyDecision` có cờ `humanOnly`.
5. **Kết tội kiến trúc bằng lỗi cấu hình.** Ba trong bốn cáo buộc nặng nhất với Chatwoot là lỗi cấu hình sửa được. Phải chấm điểm lại Chatwoot ở *trạng thái đã harden* — và nó vẫn thua, nhưng vì lý do khác: sha1-only, bypass verify token, thiếu postback/referral.
6. **Đếm kết quả grep coi như bằng chứng.** Vòng 1 suy ra độ phức tạp từ số dòng khớp. Vòng 2 thay bằng số liệu có ngữ nghĩa: 116 model / 95 có orgId / 66 đăng ký / 29 thiếu / 21 không có orgId — và nêu rõ lệnh đã dùng.
7. **Chính sách Meta dựa vào trí nhớ.** Vòng 2 tra cứu tài liệu chính thức hiện hành và phát hiện điều Vòng 1 bỏ sót: từ **27-04-2026** ba message tag `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` trả lỗi 100 — chúng đã chết từ trước ngày kiểm toán.
8. **Không có kế hoạch rollback khi đã có dữ liệu.** Vòng 1 giả định rollback luôn khả thi. Thực tế tồn tại một *điểm không quay lại của schema*: khi đã có hàng Messenger, không thể đưa `zaloAccountId` về NOT NULL.

---

## Output 5 — Schema mục tiêu đã sửa

### Quyết định 1 — mô hình định danh: ba phương án được so sánh

| Phương án | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **A — CHỌN** (Sentinel) | `scopeId` NOT NULL; provider không có scope dùng `'__global__'`; CHECK cấm scopeId do người dùng nhập bắt đầu bằng `__` | Biểu diễn trọn vẹn trong Prisma ⇒ **không sinh drift**; ràng buộc hiển thị ngay trong file schema; một dev cũng đọc hiểu được | Sentinel là quy ước, phải có CHECK bảo vệ; hơi "bẩn" về lý thuyết |
| B (Partial index) | Hai partial unique index viết tay: một cho `scopeId IS NULL`, một cho `IS NOT NULL`. Biến thể PG16: `UNIQUE NULLS NOT DISTINCT` | Đúng chuẩn quan hệ; biến thể NULLS NOT DISTINCT rất gọn | Prisma **không** diễn đạt được partial unique index ⇒ SQL viết tay + **drift vĩnh viễn** phải quản lý bằng whitelist; với repo 126 migration và một dev duy nhất, đây là rủi ro vận hành thật |
| C (Tách bảng) | Bảng riêng cho danh tính toàn cục và danh tính có scope | Ràng buộc sạch nhất, không cần sentinel | Nhân đôi toàn bộ logic merge, unmerge và audit; mọi truy vấn hồ sơ khách hàng phải UNION hai bảng |

> **Chọn A.** Nếu về sau đội phát triển tăng lên và có người chuyên trách DB, biến thể `UNIQUE NULLS NOT DISTINCT` của B là đường nâng cấp tự nhiên.

### Định nghĩa các thực thể

```prisma
// ---------- Kênh và quyền truy cập ----------
model ChannelAccount {
  id             String   @id @default(cuid())
  provider       String   // registry dạng chuỗi, KHÔNG dùng enum DB (Quyết định 2)
  externalId     String   // Page ID với Meta; zaloUid với Zalo
  ownerOrgId     String   // một ChannelAccount thuộc đúng MỘT org sở hữu
  displayName    String
  status         String   // active | disconnected | revoked | suspended
  connectedAt    DateTime
  disconnectedAt DateTime?  // soft-delete: giữ lịch sử khi Page bị ngắt rồi nối lại
  lastError      String?
  @@unique([provider, externalId])   // TOÀN CỤC — sửa lỗi R2-C5
  @@index([ownerOrgId, provider])
}

model ChannelAccountAccess {   // nhiều org dùng chung 1 Page: qua đây, không nhân bản Page
  channelAccountId String
  orgId            String
  role             String   // owner | responder | viewer
  grantedBy        String
  grantedAt        DateTime
  @@id([channelAccountId, orgId])
}

// ---------- Định danh khách hàng ----------
model ContactIdentity {
  id             String @id @default(cuid())
  orgId          String
  contactId      String
  provider       String
  scopeId        String   // NOT NULL. Page ID với Meta; '__global__' với Zalo
  externalUserId String   // PSID với Meta; zaloGlobalId với Zalo
  verified       Boolean @default(false)
  @@unique([provider, scopeId, externalUserId])  // PSID duy nhất trong 1 Page, toàn cục
  @@index([orgId, contactId])
}
// CHECK (scope_id !~ '^__' OR scope_id = '__global__')  — chặn giả mạo sentinel
// Hai tenant KHÔNG thấy danh tính của nhau: đọc luôn đi qua tenant guard theo org_id;
// unique toàn cục chỉ để chống nhân bản, không phải để chia sẻ dữ liệu.

model ContactMergeAudit {
  id           String   @id @default(cuid())
  orgId        String
  survivingId  String
  mergedId     String
  reason       String   // verified_phone | verified_email | manual
  actorId      String?  // null nếu do hệ thống
  snapshot     Json     // ảnh chụp đủ để hoàn tác
  createdAt    DateTime @default(now())
  revertedAt   DateTime?
  revertedBy   String?
}
// Quy tắc gộp: CHỈ gộp theo E.164 đã xác minh, email đã xác minh, hoặc hành động
// tường minh của con người. TUYỆT ĐỐI không tự động gộp PSID giữa các Page —
// PSID khác Page của cùng một người là khác nhau và không thể suy ra quan hệ.

// ---------- Hội thoại và tin nhắn ----------
model Conversation {
  // … các trường hiện có …
  zaloAccountId    String?   // NỚI NULLABLE Ở PHA ADDITIVE ĐẦU TIÊN (sửa R2-C2)
  channelAccountId String?
  externalThreadId String
  // CHECK (channel_account_id IS NOT NULL OR zalo_account_id IS NOT NULL)
  // Partial unique (viết tay, tạo CONCURRENTLY):
  //   ON conversations (zalo_account_id, external_thread_id) WHERE zalo_account_id IS NOT NULL
  //   ON conversations (channel_account_id, external_thread_id) WHERE channel_account_id IS NOT NULL
}

model Message {
  // … các trường hiện có: zaloMsgId, clientEchoId …
  platformMessageId String?  // mid của Meta — KHÁC clientEchoId
  // @@unique([conversationId, platformMessageId])
  // @@unique([conversationId, clientEchoId])   — đã có sẵn
}

// ---------- Webhook: BỐN khái niệm, BỐN chỗ lưu ----------
model WebhookDelivery {        // 1 request HTTP từ Meta
  id            String @id @default(cuid())
  provider      String
  bodyHash      String   // sha256(raw_body) — Meta KHÔNG cấp delivery id
  signatureOk   Boolean
  receivedAt    DateTime @default(now())
  rawBodyEnc    Bytes?   // đã mã hoá + redact token
  purgeAfter    DateTime // TTL bắt buộc — mặc định +30 ngày (sửa R2-H5)
  @@unique([provider, bodyHash])
}

model ChannelEvent {           // 1 phần tử messaging[] đã tách
  id               String @id @default(cuid())
  deliveryId       String
  channelAccountId String
  eventType        String   // message | echo | delivery | read | reaction | postback | referral | optin
  dedupKey         String   // theo bảng khoá ở Output 6
  occurredAt       DateTime // từ timestamp của Meta — thứ tự KHÔNG được đảm bảo
  processedAt      DateTime?
  @@unique([channelAccountId, eventType, dedupKey])
}

model OutboundCommand {        // outbox: sinh TRƯỚC khi gọi Meta
  id               String @id @default(cuid())
  orgId            String
  channelAccountId String
  conversationId   String
  idempotencyKey   String   // = Message.clientEchoId, sinh trước lời gọi API
  status           String   // pending | sent | failed | abandoned
  attempts         Int      @default(0)
  policyDecision   Json     // lưu lại quyết định chính sách tại thời điểm gửi
  @@unique([channelAccountId, idempotencyKey])
}

// ---------- Thông tin xác thực ----------
model TokenCredential {
  id               String @id @default(cuid())
  channelAccountId String
  kind             String   // page_access_token | user_access_token
  version          Int      // xoay khoá: giữ bản cũ tới khi bản mới xác thực xong
  cipherText       Bytes    // envelope: data key theo org, bọc bởi master key
  keyId            String
  expiresAt        DateTime?
  validatedAt      DateTime?
  revokedAt        DateTime?
  @@unique([channelAccountId, kind, version])
}
// Không cột nào chứa plaintext. Mọi log/lỗi đi qua bộ redact. Kiểu dữ liệu độ dài
// không giới hạn theo đúng khuyến nghị của Meta về lưu access token.
```

### Quyết định 2 — provider là chuỗi trong registry, không phải enum của DB

Enum PostgreSQL cần một migration cho mỗi provider mới và không rollback êm. Chuỗi + registry ở tầng ứng dụng cho phép thêm Zalo OA hay Instagram mà không đụng schema, đổi lại phải có test kiểm mọi giá trị `provider` trong DB đều nằm trong registry. Với đội nhỏ, đánh đổi này nghiêng hẳn về chuỗi.

### Quyết định 3 — feature flag hai tầng

Cờ tính năng đặt ở **cả** mức org và mức ChannelAccount. Lý do thực dụng: khi pilot một fanpage, cần tắt được đúng fanpage đó mà không tắt kênh của cả tổ chức; và cần một kill switch cấp org khi có sự cố. Mỗi cờ có bản ghi audit ai bật, khi nào.

---

## Output 6 — Ma trận tương thích migration và khoá khử trùng lặp

### Phiên bản ứng dụng × phiên bản CSDL

| Ứng dụng | DB N (hiện tại: `zaloAccountId` NOT NULL) | DB N+1 (nullable + CHECK + partial index + bảng kênh) | DB N+2 (đã contract: bỏ cột Zalo-specific) |
|---|---|---|---|
| **App N** (chỉ Zalo) | ✅ **CHẠY** — trạng thái hiện tại | ✅ **CHẠY** — cột thừa bị bỏ qua; app luôn ghi zaloAccountId nên CHECK luôn thoả | ❌ **HỎNG** — app tham chiếu cột đã bị xoá |
| **App N+1** (dual-write, Messenger sau cờ) | ❌ **HỎNG** — ghi Messenger vi phạm NOT NULL | ✅ **CHẠY** — cấu hình mục tiêu của giai đoạn dual-write | ⚠️ **CHẠY MỘT PHẦN** — chỉ khi đã gỡ hết đường đọc cột cũ |
| **App N+2** (chỉ dùng cột mới) | ❌ **HỎNG** | ✅ **CHẠY** — cột cũ còn đó nhưng không được đọc | ✅ **CHẠY** — trạng thái đích |

> **Quy tắc rút ra:** DB mở rộng *trước* khi deploy ứng dụng; ứng dụng thu hẹp *trước* khi DB thu hẹp. Mỗi phiên bản ứng dụng phải chạy được trên ít nhất hai phiên bản DB liền kề — nhờ vậy rollback ứng dụng luôn khả thi mà không cần rollback schema.

### Điểm không quay lại của schema

Sau khi hàng Conversation Messenger đầu tiên tồn tại (P5), lệnh đưa `zaloAccountId` về NOT NULL sẽ thất bại. Từ thời điểm đó, **rollback = rollback ứng dụng + tắt cờ**, tuyệt đối không rollback schema. Điều này phải được ghi trong runbook và diễn tập một lần ở P1 trên bản sao production.

### Bốn khái niệm không được gộp

| Khái niệm | Nguồn | Lưu ở đâu | Dùng để |
|---|---|---|---|
| Webhook delivery ID | Meta **không cấp** ⇒ tự sinh `sha256(raw_body)` | `WebhookDelivery.bodyHash` | Chống xử lý lại nguyên một request khi Meta gửi lại |
| Platform event ID | `mid`, hoặc watermark, hoặc fingerprint | `ChannelEvent.dedupKey` | Chống xử lý lại một sự kiện đơn lẻ |
| Message ID | `mid` của Meta | `Message.platformMessageId` | Định danh tin nhắn nghiệp vụ; đối chiếu echo |
| Outbound idempotency key | ZaloCRM tự sinh *trước* khi gọi Meta | `Message.clientEchoId` / `OutboundCommand.idempotencyKey` | Chống gửi trùng khi timeout; nối echo về đúng tin đã gửi |

### Khoá khử trùng lặp theo từng loại sự kiện của Meta

| Loại sự kiện | Có ID ổn định? | Khoá dedup đề xuất | Bẫy |
|---|---|---|---|
| `message` (inbound) | Có — `mid` | `(acct, 'message', mid)` | — |
| `message_echo` | Có — `mid` *trùng với tin gốc* | `(acct, 'echo', mid)` | **Bắt buộc khác namespace với `'message'`**, nếu không echo bị coi là trùng và không bao giờ được xử lý |
| `delivery` | Không — chỉ có watermark | `(acct, 'delivery', psid, watermark)` | Watermark tăng đơn điệu; sự kiện cũ hơn watermark đã lưu thì bỏ qua |
| `read` | Không | `(acct, 'read', psid, watermark)` | Như trên |
| `reaction` | Một phần | `(acct, 'reaction', psid, mid, action, emoji)` | Thả rồi gỡ rồi thả lại cùng emoji là *hai* sự kiện hợp lệ ⇒ kèm timestamp nếu cần phân biệt |
| `postback` | Không | `(acct, 'postback', psid, timestamp, sha256(payload))` | Người dùng bấm cùng nút hai lần là hai sự kiện thật |
| `referral` | Không | `(acct, 'referral', psid, timestamp, sha256(payload))` | Chatwoot không subscribe loại này (R2-M5) |
| `optin` | Không | `(acct, 'optin', psid, timestamp, sha256(payload))` | — |
| attachment trong message | Kế thừa | dùng chung khoá của message cha | Không được sinh khoá riêng, nếu không một tin nhiều ảnh sẽ nhân bản |
| Sự kiện không xác định | Không | `(acct, type, sha256(canonical_json(event)))` | Fingerprint chuẩn hoá: sắp xếp khoá, bỏ trường thời gian nhận |

`acct` = `channelAccountId`. Việc luôn đưa `acct` vào khoá là lý do hai fanpage sinh ID hình dạng giống nhau vẫn không va chạm.

---

## Output 7 — Kiến trúc mục tiêu và luồng dữ liệu

### Luồng inbound

```
Meta  ──POST──▶  Fastify route (raw body giữ nguyên byte)
                      │
                      ├─ 1. resolveWebhookTarget(rawBody, headers)
                      │     chỉ parse entry[].id dưới hạn mức kích thước & độ sâu
                      │     → xác định APP (một app secret phủ mọi Page của nó)
                      │
                      ├─ 2. verifyWebhook  HMAC-SHA256 trên raw body,
                      │     timingSafeEqual, FAIL-CLOSED nếu thiếu secret
                      │     ✗ → 401, ghi audit, KHÔNG tạo bản ghi nào
                      │
                      ├─ 3. ghi WebhookDelivery (bodyHash unique) → trả 200 trong < 5 s
                      │     (yêu cầu của Meta; lỗi liên tục 1 giờ ⇒ Meta tắt webhook)
                      ▼
                 BullMQ queue
                      │
                      ├─ 4. splitWebhookEvents: entry[] × messaging[] → N ChannelEvent
                      ├─ 5. mỗi event: getDeduplicationKey → upsert, trùng thì bỏ
                      ├─ 6. normalizeInboundEvent → định tuyến tới đúng ChannelAccount
                      │     → withTenant(ownerOrgId)  ← ngữ cảnh tenant BẮT BUỘC ở worker
                      ├─ 7. resolve ContactIdentity (provider, scopeId=pageId, PSID)
                      ├─ 8. upsert Conversation (channelAccountId, externalThreadId)
                      ├─ 9. insert Message; media → job tải riêng qua bộ tải an toàn → MinIO
                      └─10. Socket.IO emit vào room org:${orgId} (đã redact)
```

### Luồng outbound

```
Agent / AI  ──▶  evaluateMessagingPolicy() → PolicyDecision
                      │   { allowed, reason, requiredTag?, windowExpiresAt, humanOnly }
                      │   humanOnly = true khi chỉ còn HUMAN_AGENT là đường hợp lệ
                      │   ⇒ AI KHÔNG được tự gửi
                      ▼
              ghi OutboundCommand (idempotencyKey sinh TRƯỚC lời gọi API)  ← outbox
                      ▼
              gọi Graph API  ──timeout?──▶ KHÔNG gửi lại mù quáng;
                      │                     đối chiếu bằng echo hoặc truy vấn lại
                      ▼
              nhận mid  →  cập nhật Message.platformMessageId
                      ▼
              echo quay về (có thể đến TRƯỚC cả response)
                      →  nối theo clientEchoId, KHÔNG tạo tin mới
```

> Chi tiết cuối cùng không phải lý thuyết: Chatwoot phải chèn `wait: 2.seconds` **cứng** trong `config/initializers/facebook_messenger.rb:67` kèm bình luận nói rõ đang tránh race echo-đến-trước-response. Đó là bằng chứng production rằng cuộc đua này có thật, và rằng cách chữa bằng "ngủ 2 giây" là dấu hiệu thiếu khoá đối chiếu. Thiết kế native dùng `clientEchoId` nên không cần ngủ.

### Hợp đồng `ChannelProvider` đã sửa

Giao diện Vòng 1 (`verifyWebhook`, `parseWebhook`, `send`, `canSend`, `refreshCredentials`) có **ba lỗi**: `verifyWebhook` cần biết ChannelAccount *trước khi* xác minh — bài toán con gà quả trứng; `parseWebhook` ngầm giả định một payload là một sự kiện; và `canSend` trả boolean nên không diễn đạt nổi ràng buộc "chỉ người thật được gửi".

```ts
interface ChannelProvider {
  // giải quyết con gà - quả trứng: định tuyến bằng dữ liệu tối thiểu, chưa tin cậy
  resolveWebhookTarget(rawBody: Buffer, headers): { appId, candidateExternalIds[] }
  verifyWebhook(rawBody: Buffer, headers, secret): boolean      // raw byte, fail-closed
  splitWebhookEvents(rawBody: Buffer): RawEvent[]               // entry[] × messaging[]
  normalizeInboundEvent(raw: RawEvent): NormalizedEvent
  getDeduplicationKey(e: NormalizedEvent): string
  send(cmd: OutboundCommand): SendResult                        // nhận idempotencyKey
  classifyError(err): { retryable, backoffMs, disableChannel }
  evaluateMessagingPolicy(ctx): PolicyDecision
  refreshOrValidateCredential(acct): CredentialState
  disconnect(acct): void
  healthCheck(acct): HealthReport

  capabilities: {                  // tránh "god interface"
    webhookSignature: boolean,     // Meta true · Zalo false (WebSocket, không có webhook)
    messageEcho: boolean,          // Meta true · Zalo false
    deliveryReceipts: boolean,
    messagingWindow: boolean,      // Meta true (24 h) · Zalo false
    perAccountCredentials: boolean
  }
}
```

> **Zalo và Meta có thật sự cùng một hợp đồng không?** Không hoàn toàn — và giả vờ rằng có là sai lầm thiết kế. Zalo chạy qua WebSocket với `zca-js`, không có chữ ký webhook, không có echo, không có cửa sổ 24 giờ. Giải pháp là `capabilities`: bộ test hợp đồng chung chỉ chạy những nhóm mà provider khai báo hỗ trợ. **Không bao giờ bắt ZaloProvider cài đặt giả một hành vi không tồn tại chỉ để thoả mãn interface.**

### Chính sách Meta hiện hành — trích từ tài liệu chính thức, không từ trí nhớ

| Hạng mục | Nội dung hiện hành | Hệ quả thiết kế |
|---|---|---|
| Cửa sổ nhắn tin chuẩn | 24 giờ kể từ tương tác cuối của người dùng | Lưu `windowExpiresAt` trên Conversation, tính lại mỗi inbound |
| HUMAN_AGENT | Cho phép phản hồi **thủ công** trong 7 ngày; bot phải trả lời trong 30 giây | **AI tự động gửi dưới HUMAN_AGENT là không tuân thủ** ⇒ cờ `humanOnly` trong PolicyDecision |
| Message tag đã bị khai tử | Từ **27-04-2026**, `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` trả lỗi 100 | Đã chết trước ngày kiểm toán ⇒ không đưa vào thiết kế |
| Quyền cần xin | `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `business_management` | Xin đủ ngay ở P4 |
| App Review | "Không bắt buộc nếu bạn chỉ gửi và nhận tin cho Page của chính mình" | **Pilot một fanpage của chính công ty không cần App Review** — rút ngắn đáng kể thời gian tới MVP |
| Data Use Checkup | Hằng năm; "không bắt buộc với ứng dụng chỉ có Standard Access" | Chỉ phát sinh khi lên Advanced Access phục vụ Page của khách |
| Chữ ký webhook | **SHA256** trong `X-Hub-Signature-256`; lưu ý quy tắc escape unicode khi băm | Bắt buộc test với tiếng Việt có dấu (R2-H6) |
| Gửi lại & thứ tự | Có gửi lại; thất bại kéo dài 1 giờ ⇒ Meta tắt webhook. "Server của bạn phải tự khử trùng lặp". Thứ tự *không* đảm bảo | Dùng `timestamp` để sắp xếp; ACK trong 5 giây rồi xử lý bất đồng bộ |
| Vòng đời token | Ngắn hạn ~1–2 giờ; dài hạn ~60 ngày. Khuyến nghị lưu bằng kiểu độ dài không giới hạn | `TokenCredential.version` + job xác thực định kỳ |
| Ứng dụng không hoạt động | 90 ngày không đăng nhập / không gọi API / không nhận webhook ⇒ token bị vô hiệu | Health check định kỳ ngay cả khi pilot tạm dừng |
| Graph API | Mới nhất **v26.0**; v25.0 hỗ trợ 18-02-2026 → 29-07-2028; v20.0 hết hạn 24-09-2026 | Ghim **v25.0** (còn ~2 năm), đặt trong module chính sách có phiên bản |
| Xoá dữ liệu người dùng | **BLK-3** — không phân giải được trang tài liệu tại thời điểm kiểm toán | Phải xác nhận lại trước App Review; **không suy đoán** |

> **Bắt buộc:** mọi quy tắc trên nằm trong một module chính sách *có phiên bản và cấu hình được* (ví dụ `meta-policy.v2026-09.ts`), **không hard-code rải rác**. Khi Meta đổi chính sách, chỉ thêm một phiên bản module mới và chuyển cờ.

---

## Output 8 — Mô hình mối đe doạ

| Mối đe doạ | Bề mặt | Mức | Biện pháp | Test chứng minh |
|---|---|---|---|---|
| Webhook giả mạo | Endpoint công khai | **Critical** | HMAC-SHA256 trên raw body, fail-closed, timingSafeEqual | D-1, D-2 |
| Replay payload hợp lệ | Endpoint công khai | High | `WebhookDelivery.bodyHash` unique + dedup theo sự kiện | D-3 |
| Rò rỉ chéo tenant qua Page ID trùng | Định tuyến webhook | **Critical** | `@@unique([provider, externalId])` toàn cục + `ChannelAccountAccess` | D-6, D-7 |
| Rò rỉ chéo tenant qua truy vấn thiếu orgId | Toàn bộ API và worker | **Critical** | Tenant guard enforce + RLS theo nhóm bảng + ngữ cảnh tenant trong worker | D-6, D-8 |
| SSRF qua URL đính kèm | Bộ tải media | High | Bộ tải an toàn dùng chung: allowlist, chặn IP riêng, kiểm lại mỗi redirect, pin IP, giới hạn byte | D-4, D-5 |
| Trộm token | DB, log, thông báo lỗi, backup | High | Envelope encryption, bộ redact log, không log payload xác thực | D-9 |
| Prompt injection qua nội dung tin nhắn | Đường AI | High | Nội dung khách là *dữ liệu*, không phải chỉ thị; AI mặc định chỉ gợi ý, tự gửi phải bật cờ riêng | F-5, F-6 |
| Đầu độc hàng đợi / JSON dị dạng | BullMQ | Medium | Hạn mức kích thước và độ sâu khi parse; dead-letter queue; số lần thử tối đa | D-11, D-12 |
| Cạn đĩa do đính kèm | Volume media | Medium | Giới hạn kích thước tải, cảnh báo 70/80/90 %, `request_body max_size` ở Caddy | D-10 |
| Meta tắt webhook do lỗi kéo dài | Sẵn sàng dịch vụ | High | ACK trong 5 giây rồi xử lý bất đồng bộ; cảnh báo khi tỉ lệ non-200 vượt ngưỡng | C-1 |
| Nhân bản hồ sơ khách hàng | Logic định danh | High | Unique không có lỗ NULL; chỉ gộp theo dữ liệu đã xác minh; có audit và hoàn tác | A-4, F-9 |

---

## Output 9 — Ma trận kiểm thử bắt buộc

### A · Unit

| Mã | Nội dung | Tiêu chí đạt |
|---|---|---|
| A-1 | HMAC: chữ ký đúng / sai / thiếu / sai độ dài | Chỉ trường hợp đúng được chấp nhận; so sánh dùng hàm timing-safe |
| A-2 | Raw body khác nhau về khoảng trắng và thứ tự khoá; body chứa tiếng Việt có dấu | Băm trên byte gốc, không parse lại; kết quả ổn định |
| A-3 | Khoá dedup cho đủ 9 loại sự kiện | Đúng bảng ở Output 6; echo và message không va namespace |
| A-4 | Ràng buộc unique của ContactIdentity | Cùng PSID cùng Page ⇒ từ chối; cùng PSID khác Page ⇒ chấp nhận; hai global cùng org ⇒ từ chối |
| A-5 | Chính sách gửi tại các mốc thời gian biên | 23 h 59 ⇒ cho phép; 24 h 01 ⇒ chặn; trong 7 ngày ⇒ `humanOnly=true` |
| A-6 | Phân loại lỗi và khả năng thử lại | Lỗi tạm ⇒ retry có backoff; token bị thu hồi ⇒ vô hiệu kênh, không retry vô hạn |

### B · Contract

| Mã | Nội dung | Tiêu chí đạt |
|---|---|---|
| B-1 | Một bộ test hợp đồng chạy cho cả ZaloProvider và MetaProvider | Cả hai qua các nhóm chung: normalize, dedup key, send, classifyError |
| B-2 | Nhóm test chỉ dành cho Meta được gate bằng `capabilities` | ZaloProvider **bỏ qua** nhóm echo/chữ ký/cửa sổ 24 h — không được cài đặt giả |
| B-3 | Provider mới đăng ký phải khai báo capabilities đầy đủ | Thiếu khai báo ⇒ test fail ở khâu đăng ký registry |

### C · Integration

| Mã | Nội dung | Tiêu chí đạt |
|---|---|---|
| C-1 | webhook → queue → DB → Socket.IO | 200 trả trong < 5 giây; tin hiện đúng room `org:` |
| C-2 | Một payload chứa 2 entry × 2 messaging | Tạo đúng 4 ChannelEvent |
| C-3 | Gửi lại cùng payload 3 lần | Đúng 1 bộ tin nhắn được tạo |
| C-4 | Echo về *trước* khi response của lời gọi send kịp trả | Nối theo `clientEchoId`, không tạo tin trùng, **không cần sleep** |
| C-5 | Lời gọi send timeout nhưng Meta đã nhận | Không gửi lại mù; đối chiếu qua echo; đúng 1 tin |
| C-6 | Token bị thu hồi giữa chừng | Kênh chuyển `revoked`, cảnh báo, không retry vô hạn |
| C-7 | Ngắt rồi nối lại Page | Soft-delete giữ lịch sử; nối lại không nhân bản Conversation |
| C-8 | Sự kiện đến sai thứ tự | Sắp xếp theo `timestamp`; watermark cũ hơn bị bỏ qua |
| C-9 | Worker chết giữa transaction và ACK | Job được xử lý lại; dedup đảm bảo không nhân đôi |

### D · Security

| Mã | Nội dung | Tiêu chí đạt |
|---|---|---|
| D-1 | Webhook giả không chữ ký | 401, không tạo bản ghi |
| D-2 | Thiếu app secret trong cấu hình | **Fail-closed**: từ chối request *và* kênh không kích hoạt được |
| D-3 | Replay payload hợp lệ | Bị khử trùng lặp |
| D-4 | SSRF: URL tới 127.0.0.1, 169.254.169.254, `file://` | Chặn hết |
| D-5 | SSRF qua redirect từ host công khai sang IP riêng; DNS rebinding | Kiểm lại sau mỗi redirect; IP đã resolve được pin |
| D-6 | Đọc / ghi / xoá xuyên tenant | Từ chối ở cả tầng guard lẫn tầng RLS |
| D-7 | Org B khai Page ID mà org A đã sở hữu | Từ chối, thông báo rõ nghĩa |
| D-8 | Worker chạy không có ngữ cảnh tenant; raw SQL; connection tái sử dụng | Worker *fail*; raw SQL không vượt RLS; connection không giữ org cũ |
| D-9 | Token trong DB / log / thông báo lỗi | Không tồn tại dạng plaintext ở bất kỳ đâu |
| D-10 | Đính kèm vượt hạn mức | Bị chặn theo `Content-Length`, và cắt cứng theo byte khi không có header |
| D-11 | Rate limit burst | Có kiểm soát, không sập tiến trình |
| D-12 | JSON dị dạng, lồng sâu, cực lớn | Từ chối sớm theo hạn mức, vào dead-letter queue |

### E · Migration

| Mã | Nội dung | Tiêu chí đạt |
|---|---|---|
| E-1 | Clone schema production, chạy migration tiến | Không lỗi; thời gian đo được và ghi lại |
| E-2 | Deploy phiên bản ứng dụng tương thích | Đúng ma trận ở Output 6 |
| E-3 | Backfill + truy vấn đối soát | Đối soát trả **0** bản ghi lệch |
| E-4 | Rollback ứng dụng (giữ nguyên schema) | Hệ thống chạy bình thường ở phiên bản cũ |
| E-5 | Rollback schema khi *chưa* có dữ liệu Messenger | Thành công |
| E-6 | Roll forward khi *đã* có dữ liệu Messenger | Thành công, và test khẳng định rollback schema bị chặn có chủ đích |

### F · End-to-end

| Mã | Nội dung | Tiêu chí đạt |
|---|---|---|
| F-1 | Khách gửi tin qua Messenger | CRM nhận đúng hội thoại, đúng org |
| F-2 | Agent trả lời | Khách nhận được; echo không nhân đôi |
| F-3 | Gửi ảnh hai chiều | Media lưu ở MinIO; không rò rỉ URL gốc của Meta |
| F-4 | AI gợi ý nhưng không tự gửi (cờ tắt) | Chỉ hiện gợi ý |
| F-5 | AI tự gửi khi cờ bật *và* còn trong cửa sổ 24 h | Gửi được; ghi audit đầy đủ |
| F-6 | AI cố gửi khi chỉ còn HUMAN_AGENT | **Bị chặn** vì `humanOnly=true`; nêu đúng lý do |
| F-7 | Bàn giao AI → người | Chuyển trạng thái đúng, không mất ngữ cảnh |
| F-8 | Gửi ngoài cửa sổ chính sách | Bị chặn với lý do chính xác hiển thị cho agent |
| F-9 | Gộp rồi tách contact | Hoàn tác về đúng trạng thái trước; audit ghi đủ hai chiều |

---

## Output 10 — Lộ trình có pha, chạy được

> Expand/contract. Mỗi pha nêu rõ: schema, ứng dụng, cờ, backfill, đối soát, test, metric, tiêu chí Go, tiêu chí No-Go, rollback, và *xử lý dữ liệu sinh ra trong pha khi rollback*. **Không có Big Bang.**

### P0 — Baseline và test đặc tả · 5 person-day

- **Schema:** Không thay đổi.
- **Ứng dụng:** Viết characterization test cho đường Zalo hiện tại: nhận tin, gửi tin, gán nhãn, broadcast.
- **Cờ:** Không.
- **Đối soát:** Chốt số liệu nền: 47.394 tin, 397 hội thoại, 1.355 contact.
- **Metric:** Độ phủ test đường Zalo; thời gian chạy bộ test.
- **Go:** Bộ test xanh và tái lập được trên máy sạch.
- **No-Go:** Không dựng nổi môi trường test giống production.
- **Rollback:** Không áp dụng — chỉ thêm test.

### P1 — Backup, khôi phục thử, siết secret, kiểm kê tenant · 6 pd · **CHẶN CỨNG**

- **Schema:** Không thay đổi.
- **Ứng dụng:** Cron backup DB + volume media; thống nhất tên biến mã hoá token (R2-M2); fail-closed khi thiếu secret; kiểm kê 29 model thiếu trong `ORG_SCOPED_MODELS`.
- **Cờ:** `TENANT_GUARD_MODE=warn`.
- **Đối soát:** Khôi phục bản dump lên container tạm, so số hàng từng bảng với production ⇒ lệch 0.
- **Metric:** Tuổi bản backup mới nhất; số cảnh báo tenant guard mỗi ngày.
- **Go:** Khôi phục thành công **ít nhất một lần**; RPO ≤ 24 h; RTO đo được ≤ 2 h.
- **No-Go:** Khôi phục thất bại hoặc không đo được RTO ⇒ **dừng toàn bộ dự án** cho tới khi xong.
- **Rollback:** Gỡ cron; đặt guard về `off`.

### P2 — Schema kênh dạng additive, bao gồm nới nullable · 4 pd

- **Schema:** Thêm `ChannelAccount`, `ChannelAccountAccess`, `ContactIdentity`, `WebhookDelivery`, `ChannelEvent`, `OutboundCommand`, `TokenCredential`, `ContactMergeAudit`. Thêm `Conversation.channelAccountId`. **Nới `zaloAccountId` thành nullable** + CHECK + hai partial unique index tạo `CONCURRENTLY`. Đây là điểm sửa lỗi R2-C2.
- **Ứng dụng:** Chưa dùng bảng mới. Thêm assertion ở đường ghi Zalo: `zaloAccountId` phải khác null.
- **Cờ:** Không có cờ nào bật.
- **Backfill:** Không.
- **Đối soát:** `SELECT count(*) FROM conversations WHERE zalo_account_id IS NULL AND channel_account_id IS NULL` ⇒ phải là **0**, chạy hằng ngày.
- **Test:** E-1, E-5, A-4.
- **Metric:** Thời gian chạy migration; số hàng vi phạm CHECK (kỳ vọng 0).
- **Go:** Migration chạy trên bản sao production dưới ngưỡng thời gian chấp nhận được; đường Zalo không đổi hành vi.
- **No-Go:** Tạo index khoá bảng lâu, hoặc đối soát khác 0.
- **Rollback:** Drop bảng mới; đưa `zaloAccountId` về NOT NULL — *vẫn khả thi vì chưa có hàng Messenger nào*.
- **Dữ liệu sinh trong pha:** Không có.

### P3 — Zalo dual-write và giai đoạn tương thích · 8 pd

- **Schema:** Không thay đổi.
- **Ứng dụng:** Zalo ghi song song sang `ChannelAccount` + `ContactIdentity` (`scopeId='__global__'`) trong khi vẫn ghi cột cũ. Đường *đọc* chưa đổi.
- **Cờ:** `channel.dualWrite.zalo` theo org.
- **Backfill:** Chuyển 1.355 contact và 397 hội thoại hiện có sang mô hình mới, chạy theo lô.
- **Đối soát:** Số ContactIdentity global = số Contact có `zaloGlobalId`; số ChannelAccount = số ZaloAccount. Chạy hằng ngày, **phải bằng 0 lệch trong ít nhất 14 ngày**.
- **Test:** E-3, A-4, bộ characterization của P0 vẫn xanh.
- **Metric:** Số bản ghi lệch mỗi ngày; độ trễ thêm vào đường ghi Zalo.
- **Go:** Lệch 0 liên tục 14 ngày.
- **No-Go:** Đường Zalo chậm đi rõ rệt hoặc phát sinh lỗi mới.
- **Rollback:** Tắt cờ dual-write; dữ liệu bảng mới trở thành mồ côi.
- **Dữ liệu sinh trong pha:** Bản ghi mồ côi ở bảng mới — giữ lại vô hại (không đường đọc nào chạm tới) và sẽ được backfill lại khi bật cờ lần sau. Có script dọn nếu muốn xoá hẳn.

### P4 — Meta App, OAuth, lưu trữ token · 6 pd · *song song được với P3*

- **Schema:** Sửa `FacebookPageConnection.@@unique` thành unique toàn cục (R2-C5) — an toàn vì chưa có dữ liệu Page thật.
- **Ứng dụng:** Luồng OAuth; xin đủ 5 quyền; lưu token bằng envelope encryption có version; job xác thực token định kỳ (chống quy tắc 90 ngày không hoạt động).
- **Cờ:** `channel.meta.connect` — mặc định tắt.
- **Đối soát:** Không có cột token nào ở dạng plaintext (kiểm bằng SQL thô).
- **Test:** D-7, D-9, C-6.
- **Metric:** Số token sắp hết hạn trong 7 ngày; kết quả health check.
- **Go:** Kết nối được fanpage nội bộ; token mã hoá; xoay khoá diễn tập thành công.
- **No-Go:** Meta từ chối quyền; hoặc token lưu plaintext ở bất kỳ đường nào.
- **Rollback:** Tắt cờ; thu hồi token phía Meta; xoá bản ghi `TokenCredential`.
- **Dữ liệu sinh trong pha:** Chỉ có thông tin xác thực — xoá được hoàn toàn.

### P5 — Inbound native, chỉ văn bản · 8 pd · **ĐIỂM KHÔNG QUAY LẠI**

- **Schema:** Không thay đổi (P2 đã chuẩn bị đủ).
- **Ứng dụng:** Route webhook + xác minh chữ ký SHA256 fail-closed + `splitWebhookEvents` + dedup + worker có `withTenant` + tạo Conversation/Message + emit Socket.IO.
- **Cờ:** `channel.meta.inbound` theo *từng ChannelAccount*.
- **Đối soát:** Số ChannelEvent đã xử lý = số Message tạo ra + số sự kiện không sinh tin (delivery/read). Lệch ⇒ cảnh báo.
- **Test:** A-1…A-3, C-1…C-3, C-8, C-9, D-1…D-3, D-12, F-1.
- **Metric:** p95 thời gian ACK (< 5 s); tỉ lệ non-200; độ sâu hàng đợi; tỉ lệ trùng lặp.
- **Go:** Một fanpage thử nghiệm nhận tin trong 24 h không mất, không trùng.
- **No-Go:** Có bất kỳ tin trùng hoặc mất nào; hoặc p95 ACK vượt 3 s.
- **Rollback:** **Chỉ rollback ứng dụng + tắt cờ.** Không rollback schema.
- **Dữ liệu sinh trong pha:** Hàng Conversation/Message Messenger đầu tiên xuất hiện. Từ đây `zaloAccountId` không thể quay về NOT NULL. Nếu buộc phải huỷ bỏ dự án: xoá mềm hội thoại Messenger, giữ schema nullable vĩnh viễn (vô hại với Zalo nhờ CHECK và partial index).

### P6 — Outbound native + echo + chính sách · 9 pd

- **Schema:** Thêm `Message.platformMessageId` + unique tương ứng.
- **Ứng dụng:** Outbox `OutboundCommand`; `evaluateMessagingPolicy` trong module chính sách có phiên bản; đối chiếu echo theo `clientEchoId` (không dùng sleep).
- **Cờ:** `channel.meta.outbound` theo ChannelAccount.
- **Đối soát:** Mọi `OutboundCommand` ở trạng thái `sent` phải có `platformMessageId` tương ứng trong vòng 5 phút.
- **Test:** A-5, A-6, C-4, C-5, F-2, F-8.
- **Metric:** Tỉ lệ gửi thành công; số lần chặn theo chính sách kèm lý do; số tin trùng (mục tiêu 0).
- **Go:** 100 tin gửi thử: 0 trùng, 0 mất, echo nối đúng 100 %.
- **No-Go:** Có tin trùng, hoặc chính sách chặn/cho qua sai ở mốc biên.
- **Rollback:** Tắt cờ outbound; inbound vẫn chạy.
- **Dữ liệu sinh trong pha:** `OutboundCommand` đang `pending` phải được đánh dấu `abandoned` khi tắt cờ, tránh gửi muộn sau khi rollback.

### P7 — Media · 6 pd · *song song được*

- **Ứng dụng:** Bộ tải an toàn dùng chung (chống SSRF đầy đủ theo R2-H3); worker riêng đẩy lên MinIO.
- **Cờ:** `channel.meta.media`.
- **Đối soát:** Số đính kèm nhận được = số object trong MinIO + số thất bại đã ghi nhận.
- **Test:** D-4, D-5, D-10, F-3.
- **Metric:** GB/ngày; tỉ lệ tải thất bại; disk còn trống.
- **Go:** Mọi test SSRF chặn đúng; tăng trưởng đĩa nằm trong dự báo.
- **No-Go:** Bất kỳ test SSRF nào lọt; hoặc disk vượt 80 %.
- **Rollback:** Tắt cờ; tin nhắn vẫn nhận, đính kèm ghi nhận dạng "chưa tải".
- **Dữ liệu sinh trong pha:** Object trong MinIO — giữ lại có tham chiếu; hoặc dọn bằng job nếu huỷ bỏ.

### P8 — UI, realtime, RBAC, quyền riêng tư · 10 pd · *song song được*

- **Ứng dụng:** Hộp thư hợp nhất trong giao diện hiện có; phân quyền theo `ChannelAccountAccess`; redact PII khi emit Socket.IO; TTL cho `WebhookDelivery`.
- **Cờ:** `ui.meta.inbox`.
- **Test:** D-6, D-8, F-7.
- **Go:** Agent chỉ thấy kênh được cấp quyền; job TTL xoá đúng.
- **No-Go:** Rò rỉ kênh không được cấp quyền.
- **Rollback:** Tắt cờ UI; dữ liệu vẫn được thu thập bình thường.

### P9 — AI và tự động hoá sau cờ · 6 pd · *song song được*

- **Ứng dụng:** AI mặc định *chỉ gợi ý*. Tự gửi là cờ riêng và **bị chặn cứng khi `humanOnly=true`**.
- **Cờ:** `ai.meta.suggest`, `ai.meta.autosend` — hai cờ tách biệt.
- **Test:** F-4, F-5, F-6.
- **Go:** F-6 chặn đúng 100 % trong test.
- **No-Go:** AI gửi được dưới HUMAN_AGENT ⇒ rủi ro vi phạm chính sách Meta.
- **Rollback:** Tắt `autosend`, giữ `suggest`.

### P10 — Thực thi tenant đầy đủ và RLS theo nhóm bảng · 12 pd · **rủi ro cao nhất**

- **Schema:** Bật RLS theo *từng nhóm* bảng. Quyết định về `Message`: thêm `orgId` denormalized (backfill ~47k hàng) hay dùng policy `EXISTS` qua `conversation` — đo hiệu năng cả hai trước khi chốt (R2-M4).
- **Ứng dụng:** Bọc ngữ cảnh tenant cho mọi worker/cron/webhook; `TENANT_GUARD_MODE=enforce`; audit log cho truy vấn bypass hệ thống.
- **Cờ:** `RLS_SET_CONFIG=true`, bật dần theo nhóm bảng.
- **Đối soát:** Shadow query hoặc diễn tập trên staging trước mỗi nhóm; đếm false positive của guard.
- **Test:** D-6, D-8 chạy lại sau **mỗi** nhóm.
- **Metric:** Số cảnh báo guard; độ trễ truy vấn trước/sau; số lần bypass hệ thống.
- **Go:** Nhóm bảng chạy 72 h không có false positive và không hồi quy hiệu năng.
- **No-Go:** Bất kỳ đường nghiệp vụ nào gãy, hoặc truy vấn chậm đi đáng kể.
- **Rollback:** `DISABLE ROW LEVEL SECURITY` cho đúng nhóm vừa bật; hạ guard về `warn`. Đây là lý do **không được** gộp tất cả vào một migration.

### P11 — Contract: gỡ các trường Zalo-specific · 4 pd

- **Schema:** Chỉ xoá cột cũ khi **đủ bốn điều kiện**: (1) không đường đọc nào còn dùng; (2) đối soát dual-write bằng 0 liên tục ≥ 14 ngày; (3) rollback đã diễn tập trên bản sao production; (4) khôi phục backup đã diễn tập.
- **Ứng dụng:** Đã gỡ hết tham chiếu ở phiên bản trước đó (ứng dụng thu hẹp trước DB).
- **Test:** E-2, E-4; toàn bộ characterization của P0.
- **Go:** Bốn điều kiện trên có bằng chứng ghi lại.
- **No-Go:** Thiếu bất kỳ điều kiện nào ⇒ hoãn, **không thương lượng**.
- **Rollback:** Khôi phục cột từ backup — tốn kém, nên đây là pha cần kỷ luật nhất.

### P12 — Pilot production và quyết định khai tử Chatwoot · 5 pd

- **Ứng dụng:** Một fanpage thật chạy 14 ngày với người dùng thật.
- **Metric:** Tin mất = 0; tin trùng = 0; p95 độ trễ inbound; số lần vi phạm chính sách = 0.
- **Go:** Đạt hết ⇒ dừng và gỡ stack Chatwoot, thu hồi ~1,1 GB RAM và dung lượng image.
- **No-Go:** Bất kỳ chỉ số nào lệch ⇒ giữ Chatwoot thêm một chu kỳ, phân tích nguyên nhân.
- **Rollback:** Tắt cờ theo fanpage; Chatwoot vẫn còn đó cho tới khi có quyết định gỡ.

---

## Output 11 — Ước lượng công sức

| Pha | Person-day | Tính chất |
|---|---:|---|
| P0 baseline & characterization test | 5 | tuần tự |
| P1 backup, secret, kiểm kê tenant | 6 | tuần tự · **chặn cứng** |
| P2 schema additive | 4 | tuần tự |
| P3 dual-write Zalo | 8 | tuần tự · có 14 ngày chờ đối soát |
| P4 Meta App & token | 6 | song song được với P3 |
| P5 inbound native | 8 | tuần tự |
| P6 outbound + echo + chính sách | 9 | tuần tự |
| P7 media | 6 | song song được |
| P8 UI / realtime / RBAC | 10 | song song được |
| P9 AI sau cờ | 6 | song song được |
| P10 tenant enforce + RLS | 12 | tuần tự · rủi ro cao nhất |
| P11 contract cột cũ | 4 | tuần tự |
| P12 pilot production | 5 | tuần tự · 14 ngày lịch |
| **Tổng** | **89** | |

- **Một người:** 89 pd ở công suất 60 % (vì còn vận hành hệ thống đang chạy) ≈ 148 ngày làm việc ≈ **7 tháng lịch**.
- **Hai người:** ≈ **3,5 tháng lịch**, bị chặn dưới bởi đường tuần tự P0→P1→P2→P3→P5→P6→P10→P11→P12 ≈ 61 pd.
- **Độ tin cậy:** **Trung bình (±35 %)**. Ẩn số lớn nhất là P10: bật RLS trên 117 bảng khi `Message` không có `orgId`.

**Song song được:** P4 chạy song song P3; P7 media, P8 UI, P9 AI đều độc lập sau P6.
**Bắt buộc tuần tự:** P1 trước mọi thứ (không backup thì không migration); P2 trước P5 (schema trước đường ghi); P5 trước P6 (không có inbound thì không đối chiếu được echo); P10 trước P11 (không siết tenant xong thì không dám xoá cột).

---

## Mục 8 — Đánh giá năng lực VPS từ số liệu thật

> Không đề xuất nâng cấp nếu không có dữ liệu chứng minh.

| Hạng mục | Số đo | Đánh giá |
|---|---|---|
| CPU | 4 vCPU · load 0,19 / 0,43 / 0,39 · uptime 56 ngày | ✅ Dư |
| RAM | 7937 MB tổng · 3251 dùng · **4181 khả dụng** | ✅ Dư |
| Swap | 4 GB · dùng 231,7 MB · swappiness 10 | ✅ Lành mạnh |
| Đĩa | `/dev/vda1` 79 GB · dùng 50 GB · trống 26 GB · **67 %** | ⚠️ Theo dõi |
| Có thể thu hồi ngay | image 3,137 GB + build cache 4,947 GB ≈ **8,08 GB** | ✅ Chưa cần nâng cấp |
| Container | 15 container / 4 stack — gồm CRM thứ hai `voi-crm-*` | ⚠️ Chia sẻ tài nguyên |
| PostgreSQL | max_connections 50 · đang dùng 7 · shared_buffers 128 MB · work_mem 4 MB | ✅ Đủ |
| DB `zalocrm` | 131 MB — messages 50 MB/46.073 hàng · system_notifications 26 MB · activity_logs 12 MB | ✅ Nhỏ |
| Redis | dùng 2,37 MB / maxmemory 256 MB · noeviction · dbsize 15 · **không có backlog `bull:*:wait`** | ✅ Dư |
| MinIO | `/data` = 184 KB — **gần như chưa dùng** | ⚠️ Media đang nằm ở volume, chưa ở MinIO |
| Media thực tế | volume `zalocrm-corepviet_file_storage` = 3,2 GB · 4.788 file · 1.948 file trong 30 ngày | ≈ 65 file/ngày · ~700 KB/file · **≈ 1,33 GB/tháng** cho 1 org / 2 nick |
| Backup | không crontab, không `/etc/cron.d` — artefact duy nhất ngày 22-07-2026 | 🔴 **RPO đo được = 40 ngày** |
| Log rotation | chỉ 2/15 container có cấu hình | ⚠️ Rủi ro phình đĩa |
| Health check | thiếu ở 6/15 container | ⚠️ Khó phát hiện sự cố |
| Caddy | `/opt/n8n/Caddyfile` · 4 site · **không timeout, không `request_body max_size`** | ⚠️ Cần bổ sung trước P7 |

> **Kết luận: cấu hình hiện tại đủ cho phát triển và pilot. Không có dữ liệu nào biện minh cho việc nâng cấp VPS lúc này.** Với ~8 GB thu hồi được và mức tăng media dự kiến +0,7 GB/tháng cho một fanpage pilot (≈ +2 GB/tháng nếu ba fanpage), dung lượng còn dư khoảng **10 tháng**.

### Ngưỡng buộc phải nâng cấp

- Đĩa vượt **80 %** kéo dài sau khi đã `docker system prune`
- RAM khả dụng dưới **1,5 GB** kéo dài
- Kết nối PostgreSQL vượt **40/50** kéo dài
- Redis dùng quá **180/256 MB** (chính sách `noeviction` nghĩa là đầy sẽ **lỗi ghi**, không phải tự dọn)
- p95 thời gian xử lý webhook vượt **2 giây**

### Cảnh báo và mục tiêu khôi phục

- **Cảnh báo đĩa:** 70 % thông báo · 80 % cảnh báo và dọn dẹp · 90 % khẩn cấp, chặn nhận media mới.
- **RPO mục tiêu:** ≤ 24 giờ bằng `pg_dump` hằng đêm + tar volume media. *Hiện tại: 40 ngày.*
- **RTO mục tiêu:** ≤ 2 giờ. *Hiện tại: chưa xác định, chưa từng diễn tập.*

**Quy trình khôi phục (phải diễn tập ở P1):**

1. Dựng container PostgreSQL 16 sạch từ image đang dùng.
2. `pg_restore` bản dump mới nhất; xác nhận `_prisma_migrations` có ≥ 126 hàng, 0 failed.
3. Giải nén volume media, đối chiếu số file với số bản ghi tham chiếu.
4. Trỏ ứng dụng sang DB khôi phục, chạy bộ characterization test của P0.
5. Ghi lại thời gian thực tế ⇒ đó chính là **RTO đã đo**, không phải RTO ước đoán.

---

## Mục 3.9 — Chấm điểm lại bốn phương án

> Trọng số suy ra từ mục tiêu kinh doanh **trước**, rồi mới chấm — *không* mặc định trọng số bằng nhau.

### Trọng số (tổng 100)

| Tiêu chí | Trọng số | Lý do rút ra từ bối cảnh dự án |
|---|---:|---|
| An toàn dữ liệu & cách ly tenant | 18 | Đang có 0/117 bảng bật RLS và guard tắt — rủi ro lớn nhất hiện hữu |
| Rủi ro hồi quy kênh Zalo | 15 | Zalo là nguồn doanh thu đang chạy; hỏng Zalo là thiệt hại tức thì |
| Hồ sơ khách hàng hợp nhất + AI | 14 | Mục tiêu cốt lõi của việc thêm kênh |
| Khả năng vận hành với một dev | 12 | Thực tế đội ngũ hiện tại |
| Thời gian tới MVP | 11 | Quan trọng nhưng không đánh đổi được với an toàn dữ liệu |
| Giao diện làm việc duy nhất | 10 | Agent không nên phải mở hai hệ thống |
| Tuân thủ Meta | 8 | Bắt buộc nhưng khả thi với mọi phương án |
| Khả năng rollback | 6 | Quan trọng, đã được xử lý bằng thiết kế pha |
| Chi phí 12 tháng | 6 | Chênh lệch giữa các phương án nhỏ so với chi phí nhân sự |

### Điểm

| Phương án | Hiện tại | Đã harden |
|---|---:|---:|
| A — Native thuần (không dùng Chatwoot) | 48,8 | 73,8 |
| B — Chatwoot Gateway đã harden đúng cách | 49,8 | 64,6 |
| C — Hybrid chạy song song lâu dài | 40,6 | 55,8 |
| **D — Native là đích, Chatwoot làm pilot dùng một lần** | **55,8** | **83,6** |

> Điểm "hiện tại" chấm hệ thống *đúng như đang chạy*; điểm "đã harden" chấm trạng thái mục tiêu sau khi sửa hết lỗi cấu hình của **cả hai bên**. Việc chấm hai lần là để tránh đúng cái bẫy mà Vòng 1 mắc phải: so hệ thống tương lai đã harden với hệ thống hiện tại đang cấu hình sai.

### Phân tích độ nhạy

| Nếu ưu tiên số một đổi thành… | Kết quả |
|---|---|
| **Tốc độ ra MVP** | D ≥ B. Chatwoot dựng nhanh nhưng vẫn phải làm toàn bộ tầng đồng bộ về CRM; D tận dụng Chatwoot làm bản tham chiếu mà không nợ kỹ thuật dài hạn. *Ghi chú quan trọng:* vì pilot trên fanpage của chính công ty **không cần App Review**, rào cản thời gian của phương án native thấp hơn Vòng 1 tưởng. |
| **AI + hồ sơ khách hàng hợp nhất** | A và D áp đảo. B sụp: dữ liệu nằm ở hệ thống khác, phải đồng bộ hai chiều, và Chatwoot *không* subscribe postback/referral nên mất dữ liệu nguồn khách. |
| **Chỉ có một lập trình viên** | D. Vận hành thêm một stack Rails + Sidekiq + Postgres riêng là gánh nặng thật; D đặt **hạn sử dụng** cho gánh nặng đó ngay từ đầu. |
| **Nhiều fanpage / nhiều đại lý** | Lỗi `page_id` chỉ unique theo account của Chatwoot trở thành **Critical**, và không sửa được bằng cấu hình ⇒ **B bị loại**. |
| **Kênh tiếp theo là Zalo OA hoặc Instagram** | A/D thắng nhờ hợp đồng `ChannelProvider`. B cho Instagram nhưng **không bao giờ** cho Zalo OA — mà Zalo mới là kênh chính của doanh nghiệp này. |

---

## Output 12 — Quyết định cần chủ dự án xác nhận

1. **Chấp nhận điểm không quay lại của schema ở P5?** Sau khi có hội thoại Messenger đầu tiên, không thể rollback schema — chỉ rollback ứng dụng và tắt cờ.
2. **Một Page có được phép dùng chung giữa nhiều org không?** Nếu có, dùng `ChannelAccountAccess`; nếu không, đơn giản hoá được đáng kể. Câu trả lời phụ thuộc mô hình đại lý/nhà phân phối.
3. **`Message` có thêm cột `orgId` denormalized không?** Đánh đổi giữa backfill ~47k hàng và độ phức tạp của policy RLS dạng `EXISTS`. Cần đo trước khi chốt ở P10.
4. **Thời gian lưu webhook thô là bao lâu?** Đề xuất 30 ngày, mã hoá và redact. Số ngày dài hơn tăng khả năng gỡ lỗi nhưng tăng nghĩa vụ về dữ liệu cá nhân.
5. **AI có được phép tự gửi không, và trong phạm vi nào?** Khuyến nghị: chỉ trong cửa sổ 24 giờ, và tuyệt đối không dưới HUMAN_AGENT.
6. **Sau khi hoàn tất, có gỡ hẳn Chatwoot không?** Gỡ thì thu hồi ~1,1 GB RAM và dung lượng image; giữ thì tốn tài nguyên cho một hệ thống không ai dùng.
7. **Có ngân sách cho lưu trữ backup off-site không?** Backup nằm cùng VPS không bảo vệ được trước sự cố mất máy.
8. **Chấp nhận 7 tháng với một dev, hay bổ sung người thứ hai để rút còn 3,5 tháng?**

---

## Output 13 — Checklist sẵn sàng production

> Không được kết luận "sẵn sàng triển khai" nếu còn thiếu bất kỳ mục nào.

- [ ] Thứ tự migration hợp lệ — nới nullable nằm ở pha additive đầu tiên
- [ ] Không còn mâu thuẫn nào giữa schema và lộ trình
- [ ] Ràng buộc unique của ContactIdentity đúng về NULL và scope
- [ ] Khoá khử trùng lặp phủ đủ 9 loại sự kiện, echo tách namespace khỏi message
- [ ] Xác minh chữ ký trên raw body, SHA-256, timing-safe, **fail-closed**
- [ ] Thiếu secret khiến startup hoặc việc kích hoạt kênh **thất bại ồn ào**, không im lặng bỏ qua
- [ ] Không có token plaintext trong DB, log, thông báo lỗi hay backup
- [ ] Bộ test tenant xanh: đọc/ghi/xoá xuyên org đều bị chặn; worker thiếu ngữ cảnh thì fail
- [ ] Backup đã được khôi phục thành công ít nhất một lần, có ghi lại RTO đo được
- [ ] Test trên staging giống production đã chạy qua
- [ ] Có feature flag hai tầng và kill switch cấp org
- [ ] Có metric, cảnh báo (70/80/90 % đĩa) và runbook
- [ ] Rollback đã được diễn tập trên bản sao production
- [ ] Mọi quy tắc chính sách Meta trích từ tài liệu chính thức hiện hành, đặt trong module có phiên bản
- [ ] Một fanpage thử nghiệm đã chạy end-to-end: **0 tin trùng, 0 tin mất**
- [ ] **BLK-3** đã xác nhận lại yêu cầu callback xoá dữ liệu người dùng của Meta

---

## Output 14 — ADR — Quyết định kiến trúc cuối cùng

### Quyết định

**Native là kiến trúc đích, triển khai qua lộ trình P0–P12; Chatwoot được giữ lại chỉ như một sandbox pilot/tham chiếu dùng một lần và khai tử ở P12. (Phương án D)**

### Bối cảnh

ZaloCRM đã có sẵn phần lớn hạ tầng cần thiết: outbox, tách `zaloMsgId`/`clientEchoId`, envelope encryption, tenant guard với `set_config` an toàn với pooling, và cả schema `FacebookPageConnection`/`FacebookAppConfig`. Chatwoot đang chạy trên VPS với **0 fanpage, 0 inbox, 0 hội thoại** — nghĩa là chưa có chi phí chuyển đổi nào phải trả.

### Vì sao không phải B (Chatwoot Gateway)

Ba trong bốn vấn đề nặng nhất của Chatwoot là lỗi cấu hình sửa được, và báo cáo này đã chấm lại điểm cho nó ở trạng thái đã harden. Nó vẫn thua, nhưng vì những lý do **không sửa được bằng cấu hình**: `valid_verify_token?` bỏ qua tham số; gem chỉ đọc header chữ ký sha1 trong khi Meta ký sha256; `page_id` chỉ unique theo account; và không subscribe postback/referral/opt-in/reaction nên mất dữ liệu nguồn khách hàng. Cộng thêm: Chatwoot không bao giờ hỗ trợ Zalo — kênh chính của doanh nghiệp này.

### Vì sao không phải A thuần

Native thuần bỏ phí một công cụ đã dựng sẵn, hoạt động được, dùng để đối chiếu hành vi thật của webhook Meta trước khi tự viết. Chi phí giữ Chatwoot vài tháng là ~1,1 GB RAM — trong khi RAM khả dụng là 4181 MB.

### Vì sao không phải C (Hybrid dài hạn)

Chạy song song lâu dài buộc phải đồng bộ hai chiều vĩnh viễn, nhân đôi mô hình mối đe doạ và nhân đôi gánh nặng vận hành cho một đội một người. C chỉ khác D ở chỗ nó **không đặt hạn sử dụng** — và chính cái hạn đó là giá trị lớn nhất của D.

### Hệ quả

- **Tích cực:** một giao diện, một hồ sơ khách hàng, AI truy cập trực tiếp dữ liệu, mở đường cho Zalo OA và Instagram qua cùng hợp đồng provider, và toàn bộ công sức đổ vào tài sản của chính công ty.
- **Tiêu cực:** 89 person-day; tự chịu trách nhiệm bảo mật; tồn tại một điểm không quay lại của schema ở P5.
- **Giảm thiểu:** mọi pha đều có cờ, đối soát và rollback; P1 chặn cứng cho tới khi backup được chứng minh hoạt động.

### Trạng thái

**Được chấp thuận có điều kiện** — bảy điều kiện ở Output 1 phải hoàn tất, trong đó điều kiện backup là chặn cứng.

---

## Output 15 — File và module dự kiến thay đổi theo từng pha

> Chỉ liệt kê đường dẫn đã xác minh là tồn tại trong worktree tại commit `b1cb76e`; tên file mới được đánh dấu **(mới)**.

| Pha | File / module |
|---|---|
| **P0** | `backend/src/modules/zalo/**` (chỉ đọc, viết test) · `backend/src/shared/zalo-operations.ts` · thư mục test **(mới)** |
| **P1** | script backup **(mới)** · `backend/src/shared/crypto/aes-gcm.ts` · `backend/src/modules/integrations/_shared/token-encryption.util.ts` · `backend/src/shared/database/prisma-client.ts` (danh sách `ORG_SCOPED_MODELS`) · `/opt/n8n/Caddyfile` |
| **P2** | `backend/prisma/schema.prisma` · `backend/prisma/migrations/<mới>/` (gồm SQL viết tay cho partial index và CHECK) |
| **P3** | `backend/src/modules/zalo/**` · `backend/src/modules/contacts/**` · `backend/src/modules/chat/**` · script backfill **(mới)** |
| **P4** | `backend/src/modules/integrations/providers/**` · `backend/src/modules/integrations/_shared/` · `backend/src/modules/config/**` · `frontend/src/views/**` (màn hình kết nối) |
| **P5** | `backend/src/modules/integrations/providers/meta/**` **(mới)** · `backend/src/shared/queue/` · `backend/src/shared/tenant/` · `backend/src/shared/realtime/emit-chat.ts` |
| **P6** | `backend/src/modules/chat/**` · `backend/src/modules/integrations/providers/meta/**` · module chính sách `meta-policy.v2026-09.ts` **(mới)** |
| **P7** | `backend/src/shared/storage/` · `backend/src/modules/media/**` · bộ tải an toàn dùng chung **(mới)** · `backend/src/shared/video-processor.ts` |
| **P8** | `frontend/src/views/**` · `frontend/src/stores/**` · `frontend/src/components/**` · `backend/src/modules/rbac/**` · `backend/src/modules/privacy/**` · `backend/src/shared/realtime/socket-auth.ts` |
| **P9** | `backend/src/modules/ai/**` · `backend/src/modules/automation/**` |
| **P10** | `backend/src/shared/database/prisma-client.ts` · `backend/src/shared/tenant/` · `backend/src/modules/auth/auth-middleware.ts` · toàn bộ worker BullMQ (`group-scan-queue.ts`, `zalo-label-queue.ts`, `telegram-bridge/receiver.ts`) · migration RLS theo nhóm bảng |
| **P11** | `backend/prisma/schema.prisma` · migration contract · mọi module còn tham chiếu cột Zalo-specific |
| **P12** | `/opt/chatwoot/**` (gỡ stack) · `/opt/n8n/Caddyfile` (bỏ site `chat.corepviet.com`) · tài liệu vận hành |

---

## Ghi chú về phương pháp

Kiểm toán Vòng 2 · ZaloCRM-CorepViet `main @ b1cb76e` · Chatwoot `v4.16.2 @ f9b071ff` · 31-08-2026.

Toàn bộ cuộc kiểm toán chỉ dùng **lệnh đọc**. Không container nào được khởi động lại, không biến môi trường nào bị sửa, không migration nào được chạy, không fanpage thật nào được kết nối. Không giá trị token, mật khẩu hay app secret nào được đọc hoặc in ra — secret chỉ được kiểm tra ở trạng thái có/không có. Không dữ liệu khách hàng nào xuất hiện trong báo cáo này. Bốn hạng mục không truy cập được đã được đánh dấu **BLOCKED** thay vì suy đoán.

Bản HTML tương tác: https://claude.ai/code/artifact/e5c94863-7719-4bb1-9061-fab2b0fac2c2
