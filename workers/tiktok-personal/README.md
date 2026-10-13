# TikTok Personal worker

Dedicated Chromium worker for the one-account TikTok Personal pilot. It uses a
persistent browser profile, reports QR/session state to ZaloCRM, reads rendered
text messages from TikTok Messages and executes one claimed outbound command at
a time.

The worker does not read or export cookies, does not use stealth plugins, does
not solve CAPTCHA and stops normal processing while TikTok shows a verification
challenge. An outbound click with uncertain confirmation is reported as
`UNKNOWN` and is never retried automatically.

Required environment:

```env
CRM_BRIDGE_URL=http://app:3000
CRM_CHANNEL_ACCOUNT_ID=<ChannelAccount UUID>
CRM_CHANNEL_EPOCH=<bootstrap epoch; worker refreshes the current value from CRM>
TIKTOK_EXPECTED_USERNAME=<username without @>
TIKTOK_PERSONAL_WORKER_SECRET=<same 32+ character secret as backend>
TIKTOK_HEADLESS=true
TIKTOK_WORKER_DATA_DIR=/data
```

The profile directory must be a private persistent volume. One worker process
may use a profile/account at a time. The worker claims the active epoch and any
pending login action through an HMAC-authenticated internal endpoint. Password
login credentials stay only in application memory, expire after two minutes
and are deleted when the worker claims them.

## Staged production start

1. Enable `CHANNELS_ENABLED`, `TIKTOK_PERSONAL_ENABLED` and inbound in the CRM
   environment, leave outbound off, then restart only the app.
2. In **Tin nhắn → TikTok**, create the expected username. Copy the account ID
   into `TIKTOK_PERSONAL_ACCOUNT_ID`, set `TIKTOK_PERSONAL_USERNAME` to the
   same username, and keep any valid existing epoch as the worker bootstrap
   value. Later login attempts no longer require editing the environment.
3. Start only the opt-in worker:

   ```bash
   docker compose --profile tiktok-personal up -d --build tiktok-personal-worker
   ```

4. Choose **Sử dụng mã QR** or **Sử dụng số điện thoại, email hoặc username**.
   For password login, the CRM never stores the password in the database or
   logs. CAPTCHA and additional verification remain manual stop conditions.
5. Verify the observed identity and run an inbound-only acceptance check before
   enabling the outbound flag.

Opening a thread on TikTok can change its native read state. The worker reads
up to `TIKTOK_MAX_THREADS_PER_CYCLE` rendered threads and does not fetch media,
comments or historical messages outside that rendered window. Session QR state
is held in app memory; restarting the app may require waiting for a fresh worker
report. Disconnecting invalidates the epoch, while deleting the private browser
profile volume is a separate operator action.
