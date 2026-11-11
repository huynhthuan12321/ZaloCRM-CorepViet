---
description: Điều phối đội subagent nâng cấp giao diện iPhone cho ZaloCRM theo đợt (A–F). Dùng: /mobile-sprint <đợt> [ghi chú]
argument-hint: A|B|C|D|E|F [ghi chú]
---

Bạn là **orchestrator** (session chính) của đợt nâng cấp mobile: **$ARGUMENTS**.
Subagent không gọi được subagent khác — chỉ bạn giao việc, tích hợp shared files và tổng hợp bằng chứng.

## 0. Kiểm tra an toàn (bắt buộc, mỗi lần chạy)
1. `git status --short | wc -l` và `git branch --show-current`. Nếu working tree còn thay đổi chưa commit của chủ dự án và chưa có branch `mobile/base`: **DỪNG**, hỏi chủ dự án commit/tách nhánh trước. Không reset/stash/checkout hộ.
2. Đọc skill `corepviet-mobile-contract` và `docs/mobile-upgrade/13_SUBAGENT_TEAM.md`.

## 1. Đợt và đội
| Đợt | Mục tiêu | Agent (song song tối đa 3 dev) | Gate |
|---|---|---|---|
| A | Baseline + contract freeze | mobile-architect → mobile-qa (baseline test/ảnh) | Contract + PARITY + OWNERSHIP có trong `docs/mobile-upgrade/contracts/` |
| B | Shell, safe-area, viewport, nav | mobile-shell-dev | G1 trong 07 §5 |
| C | Chat pilot | mobile-chat-dev (sau B merge) | G2 |
| D | CRM: khách, lịch hẹn, tổng quan | mobile-crm-dev (song song C được nếu OWNERSHIP không chồng) | G3 |
| E | PWA | mobile-pwa-dev | G4 + checklist thiết bị |
| F | Mở rộng (cài đặt, báo cáo, marketing) | crm-dev + shell-dev theo module | Theo module |

Sau mỗi dev agent: **mobile-ui-reviewer** (độc lập) → **mobile-qa**. Chỉ merge khi reviewer = MERGE ĐƯỢC và QA đạt gate.

## 2. Cách giao việc
- **KHÔNG dùng `isolation: worktree` tự động** (nó tách từ origin/main, thiếu docs/mobile-upgrade). Tạo worktree thủ công từ commit đã chốt của `mobile/base`:
  `git worktree add F:\ZaloCRM-wt\<lane> -b mobile/<lane> mobile/base` rồi `cd F:\ZaloCRM-wt\<lane>\frontend && npm ci`.
  Kiểm tra trước khi giao: `git merge-base HEAD mobile/base` phải bằng HEAD của mobile/base. Agent chỉ được ghi trong thư mục worktree đó.
- Prompt giao việc phải có: đợt, đường dẫn contract, danh sách file được sửa (từ OWNERSHIP.md), tiêu chí xong, base commit.
- Agent trả về LOCK REQUEST → bạn tự áp diff vào shared file (sau khi đọc kỹ), chạy lại test.

## 3. Tích hợp
Thứ tự merge: contract/tokens → shell → chat → CRM → PWA. Sau mỗi merge chạy `cd frontend && npx vue-tsc -b && npx vitest run && npm run build`.
Không commit/push/deploy khi chủ dự án chưa đồng ý trong cuộc trò chuyện này. Không bao giờ deploy production.

## 4. Báo cáo cuối đợt (tiếng Việt)
Đã làm gì (file), kết quả reviewer + QA, mức bằng chứng (Chromium/WebKit/iPhone thật), việc còn mở, quyết định cần chủ dự án. Cập nhật `docs/mobile-upgrade/13_SUBAGENT_TEAM.md` mục "Nhật ký đợt".
