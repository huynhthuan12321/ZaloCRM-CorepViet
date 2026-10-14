# TT11: QR check failure and identity verification

## Scope and live evidence

One authorized account: `@bepbanhcorep`, account ID `485757de-7b67-486f-bf49-40a53a488ee8`. No schema changes, outbound, comments, media, or additional accounts.

- The owner reported a successful confirmation of a new QR in the mobile app. That report is not proof of a usable session on the VPS.
- The running worker was inspected without restarting Chromium, reading cookies, input values, OTPs, tokens, or response bodies into logs. The temporary Node debugger bound only to container loopback and was closed afterward.
- In epoch 54 the live page remained `/login/qrcode`, without own-profile identity, inbox, visible CAPTCHA, or identity verification form.
- The QR displayed in CRM matched the worker screenshot: FNV fingerprint `45c95d9e`, data-image string length 10458 at the comparison instant. This fingerprint is an observational match, not a credential or an authentication result.
- Live `/passport/web/check_qrconnect/` responses from `web-sg.tiktok.com`, `login-us.www.tiktok.com`, and `login-eu.www.tiktok.com` were HTTP 200 but carried `data.error_code: 7` and `message: error`. CAPTCHA data was empty. The previous diagnostic excluded these regional hosts. A later live check confirmed the failure envelope; the description alone did not match the initial failure-word filter.
- The code 7 is not assigned an undocumented meaning. This evidence does not prove a wrong password, account ban, rate limit, or CAPTCHA requirement.
- The current compiled app preserved a queued action when a stale epoch tried to claim it; the regression fixture passed. Public CRM and the worker address the same app/database. A QR action for epoch 54 was received and opened. Missing earlier action logs remain inconclusive.
- The owner's new screenshot shows an identity-method picker, “Xác minh đó là bạn”. Its location (phone, separate website, or CRM) needs clarification. The live worker inspection did not show that screen.

## Changes

- Recognize the Vietnamese and English identity verification picker as `CHALLENGE / IDENTITY_VERIFICATION_REQUIRED`, rather than generic pending/timeout.
- Log only sanitized passport path, HTTP status, and permitted numeric/status fields from the observed regional hosts. No query strings, descriptions, generic `code` fields, or credential material in logs.
- After three recent QR checks with an explicit `message: error` envelope or failure description plus a nonzero numeric error code, publish `ERROR / TIKTOK_QR_CHECK_FAILED`, without a QR image. A numeric code alone is insufficient. A successful/waiting response clears the counter.
- Reset the QR-check observation generation on a new QR request or a new owner login action. Responses from an older generation cannot contaminate the new login attempt.
- Do not bypass security checks, automatically choose a verification method, submit credentials again, or retry login.

## Validation and limits

- Local worker tests: 27 passed using `node --test --test-isolation=none workers/tiktok-personal/tests/*.test.mjs`. The regular isolated runner was blocked by sandbox child-process permissions, not by test assertions.
- Tests cover localized identity prompts, sanitized regional diagnostics, rejecting lookalike hosts, explicit QR failure evidence, normal pending states, recovery, stale response isolation, and existing credential/OTP handling.
- These are regression tests, not proof that TikTok login works. Live acceptance requires exact own-account identity plus visible inbox and a verified session in the database.
- Preserve remote frontend work and its backup files. This deployment changes the worker only; the existing frontend can display the new error code through its generic error label.

## Rollback

Keep the deployed previous worker image `zalocrm-corepviet-tiktok-personal-worker:bf3bdb4` and the same profile volume. Override only the worker image and recreate only that service. Do not restore old DB epochs, delete profiles, change account binding, or restart unrelated services.

## Deployment verification

- Final worker image: `zalocrm-corepviet-tiktok-personal-worker:084c294`; code commits `1a68bb1`, `e04f562`, `084c294` on the VPS. No GitHub push was performed in this change.
- The image passed all 27 tests with the repository test directory mounted read-only against the actual image source, without network or credentials. The image itself contains the two updated test files; the full test mount supplies the remaining existing tests.
- Live final log: `login_observation {"state":"qr_check_failed","path":"/login/qrcode"}`.
- DB: `bepbanhcorep | ERROR | inbound=false | outbound=false | epoch=54 | verified_at=NULL`.
- CRM was reloaded and its TikTok channel selected through the normal UI. It displayed `@bepbanhcorep · lỗi`, epoch 54, and `Mã lỗi TikTok: TIKTOK_QR_CHECK_FAILED`; the stale QR was no longer displayed.
- Public readiness returned OK, DB and Redis connected. App remained healthy, restart count 0, and image `sha256:82d7204d28c5fd85edfc609cef470b0345956f755a9090db795d6cce098c75d6` unchanged. Worker restart count 0. Global TikTok outbound stayed disabled.
- The pending remote frontend backup changes were preserved. No migration or profile deletion.
- **Login acceptance: NOT PASSED.** The fix makes the actual QR failure visible; it does not make TikTok accept the session. The specific meaning of error 7 remains undocumented here. The owner's identity verification screenshot alone is not proof that the VPS browser reached that stage.
- Next required evidence: identify which device/browser displayed the identity picker, then complete any owner verification within the same login flow. A login in a separate local browser cannot be treated as a verified VPS-worker session. Do not request cookies, passwords, or OTPs in chat, and do not repeatedly retry QR/password without a new diagnostic reason.
