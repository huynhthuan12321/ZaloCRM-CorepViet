# B bổ sung — Docker timestamp/Python compatibility

07/11/2026 (+07). **PASS_OPS_COMPATIBILITY_ONLY** cho runner d0d1f81c93e8124e3fa6d12f400a07de113d19f6951aea2508aa0351b6ac97ca. Không mở traffic/deploy bởi B. Gate/báo cáo4module cũ giữ nguyên bytes; finding interaction-cron phát sinh19:00VN còn cần bản sửa/kiểm riêng, bổ sung này không miễn gate đó.

B đối chiếu raw old runner6c6d… tại `inputs/hotfix-runner-v1-reviewed.py` với new runner: chỉ thêm `normalized=re.sub(r'(\.\d{6})\d+Z$',r'\1Z',started)` và đổi biến đầu vào fromisoformat từstarted→normalized. Kiểm exact string replacement bằng Python; mọi byte còn lại giống nhau. Threshold70giây, raw StartedAt dùng Docker logs, broad scanner, IfMatch, role/RLS/env/imagepins và fallback không đổi. V2smoke/open/fallback wrappers đúng phaseprefix+newbody. [Diff B](../../artifacts/reports-vps-background-tenant-b-20261107-1510/parser-supplement/runner.diff).

Read-only B probe trên **Python VPS3.10.12:12/12 PASS**: fraction0/3/6/7/9digits UTCZ, microsecond floor đúng, malformed/calendar invalid vẫnValueError, age69khôngqua/70–71qua. Raw9digits trước normalize thực sự bịValueError. Chỉ fixed synthetic timestamps; không Docker/DB/file production hoặc secret access. [Probe/result](../../artifacts/reports-vps-background-tenant-b-20261107-1510/parser-supplement/vps-parser.stdout.log).

Không product retest vì image/source không đổi bởi parser patch. Đây là compatibility fix cho Docker UTCZ timestamp, không generic RFC3339 parser hay production-observer approval. Truncation sai khác dưới1microsecond, không thay warm-up interval. B gate/report cũ SHA610506…/4ceaf655… vẫn nguyên.

[Supplement gate](../../artifacts/reports-vps-background-tenant-b-20261107-1510/parser-supplement/independent-b-gate-v2.json) chỉ xác minh ops parser; **không cho mở traffic khi interaction finding còn mở**. Root phải bind bản sửa interaction mới, smoke/logscan và observer trước kết luận ổn định.
