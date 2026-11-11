# Cờ Rếp Việt CRM — design contract

Updated 29/10/2026. This is the project's preview/design memory, not a production implementation directive. User authorized installing the six design skills and rendering previews; app/backend/auth/API/send logic/deployment remain outside this preview change.

Canonical design rationale: `docs/mobile-upgrade/04_MOBILE_DESIGN_SYSTEM.md`. Latest application evidence and images: `docs/mobile-upgrade/preview-v2/README.md`. If this memory conflicts with the canonical document, resolve the discrepancy rather than silently introducing another theme.

## Intent and domain

Audience: sales staff switching between customer conversations, customer context and scheduled follow-ups on iPhone. Primary task: choose the next customer needing attention and continue the right conversation on the right Zalo account.

Domain vocabulary: nick, người phụ trách, hội thoại chưa trả lời, hồ sơ khách, lịch hẹn, nguồn kiến thức, bản nháp AI. Palette world: brand blue, deep blue actions, white work surfaces, cool paper background, green connection/completion and amber preparation status.

Signature: an explicit account/owner context accompanies conversation rows and the thread. Preserve this chain on inbox, thread header, customer record, timeline and desktop reference. Do not turn a multi-account CRM into a generic personal messenger.

Avoid: decorative marketing hero in the app; identical KPI card grids that obscure work; green/cream visual replacement of the existing blue identity. In overview, work waiting for a response leads and metrics support it.

## Visual contract

- Quiet, focused, readable. One focal task per screen; restrained borders with soft surface layering.
- Brand #1786be; primary action #0b5880; background #f7f9fc; surface white; text #152838; secondary #526576. Success #157347 and warning #8a4b08 are semantic, paired with text.
- 4px spacing base: 8/12/16/20/24/32; mobile gutter20 in the preview, compact gutter adapts to width. Review production gutters against canonical04.
- System font deliberately retained for iPhone familiarity and no external font dependency. Main text16, message15–16, screen title28/700, section17/650, supporting12–14. Small time/channel metadata10–11 in the preview is not suitable for critical instructions.
- Button hit region >=44×44 CSS px in web previews; icon22px; primary control height44; header/back44; bottom nav five labeled destinations. CSS px are not claimed to equal native points on all devices.
- Radius: control10–12, content15–17, modal24. Phone device border40 is presentation chrome only.
- Namespace `.crm-mobile`, tokens `--m-*`. Keep production Vue/Vuetify, don't introduce React/Tailwind or a second UI library from examples in a skill.

## Reused preview patterns

- ConversationRows: avatar + title/time + preview + owner/account + unread. Row content has min-width0; unread uses high-contrast strong blue.
- ChatBubbles: distinct direction, file preview, timestamp and textual/accessible status; user text uses escaped Vue interpolation.
- PhoneScreen: owns local filter and feedback lifecycle; root owns selected screen and draft. Props down, events up, derived state computed, timer cleanup on unmount.
- ProfileInfo: same information hierarchy in mobile and desktop references.
- AI: explicit source section and Apply-to-draft; no automatic send side effect in the preview.

## Boundaries

Preview pages under docs use existing local Vue browser runtime without application code/API/socket/auth imports. They are illustrative JS component templates, not SFCs intended for production copy/paste. Source app implementation should use typed SFC contracts and existing composables after separate approval. No claim of installed PWA/real keyboard/offline behavior from these renderings.

## Cập nhật 07/11/2026 (chủ dự án duyệt)

- Bottom nav: Tổng quan · Khách hàng · **Hội thoại (nút tròn nổi ở giữa + badge)** · Lịch hẹn · **Tài khoản** (thay "Thêm").
- Thêm **giao diện Tối** song song Sáng; lựa chọn Sáng/Tối/Theo máy nằm trong Tài khoản. Token tối: `docs/mobile-upgrade/preview-v3/tokens.css`.
- Composer: nút + mở bảng Ảnh · Chụp ảnh · Video · Tài liệu · Kho media.
