# ZaloCRM AI Safety + Observability — Implementation Plan

> **Trạng thái**: REVIEWED & APPROVED  
> **Verdict**: PR-01 **GO** · PR-02 **READY AFTER PR-01**  
> **Repository**: `D:\ZaloCRM-CorepViet`  
> **Ngày duyệt**: 2026-09-15  

---

## 1. Baseline

| Thuộc tính | Giá trị đã xác minh | Evidence |
|---|---|---|
| Repository | `D:\ZaloCRM-CorepViet` | Filesystem |
| Branch | main | `git branch --show-current` |
| HEAD | `4f897a142af20f2e4ea8d6861395192811cd2c17` | `git rev-parse HEAD` |
| Commit gần nhất | fix(appointments): gui lai nhac lich an toan | `git log -1` |
| Commit time | 2026-09-08T12:34:05+07:00 | Git |
| Git status | main...origin/main; chỉ có Claude outputs/ untracked từ trước | `git status --short --branch` |
| Tracked diff | Không có | `git diff --stat` |
| Local Node | v24.16.0 | `node --version` |
| Production Node | Node 20 Alpine | `docker/Dockerfile` |
| Package manager | npm; lockfile v3 | `backend/package-lock.json` |
| Backend module format | ESM, `"type": "module"` | `backend/package.json` |
| Backend build/typecheck | `npm run build` → tsc | Backend package |
| Test framework | Vitest 4.1.4 | Backend package |
| Lint command | Không có lint script | NOT VERIFIED ngoài repo |
| Database | PostgreSQL 16 + Prisma 7.5 | Docker/package |
| Redis | Redis 7, hard dependency | `docker-compose.yml` |
| BullMQ | Có, dùng cho automation/marketing/group workloads | Backend dependencies/source |
| AI reply queue | Không; auto-reply chạy in-process, fire-and-forget | `ai-auto-reply-service.ts` line 70 |
| Follow-up scheduling | node-cron, mỗi 15 phút | `ai-followup-cron.ts` line 47 |
| CI | `.github` không tồn tại | Filesystem |
| Opik dependency | Chưa có | Backend package/lockfile |

> Không chạy `npm run build` vì build tạo dist; không chạy Vitest vì master task giới hạn thao tác read-only và một số test có thể khởi tạo database/module side effects.

---

## 2. Verification of Audit Findings

| Finding | Verified? | File | Function | Evidence | Severity |
|---|---|---|---|---|---|
| P1-01 Auto AI privacy bypass | YES — phạm vi rộng hơn audit cũ | ai-routes.ts, ai-auto-reply-service.ts, ai-followup-service.ts, ai-virtual-chat-service.ts, customer-summary-service.ts | assertPrivacyAllowsAi, triggerAutoReply, generateFollowupMessage, triggerVirtualChatAiReply, updateCustomerSummary | Guard nằm ở HTTP route; các background/direct generateText call không có shared service guard | P1 |
| P1-02 Full-auto bypass policy | YES | ai-auto-reply-service.ts | runAutoReply | Cả hai lần gọi evaluateNeedsReview đều nằm trong `if (!aiAutoReplyFullAuto)` | P1 |
| P1-03 Confidence cố định 0.8 | YES | ai-service.ts | generateAiOutput | Reply/summary persist và trả `confidence: 0.8`; auto policy đọc giá trị này | P1 |
| P1-04 Base URL SSRF/key exfiltration | YES | provider-registry.ts, provider wrappers, embedding/model-list services | setProviderBaseUrl, getProviderBaseUrl, generateWith*, fetchJson, embedding functions | URL chỉ được trim; key được gửi tới URL; fetch mặc định follow redirect; không DNS/private-host validation | P1 |

### P1-01 — chi tiết

Privacy guard hiện nằm tại route layer:

- `assertPrivacyAllowsAi()` truy vấn conversation và dùng `buildPrivacyContext()`/`canSeeConversationContent()`: `ai-routes.ts` line 46.
- Quy tắc hiện hành: conversation của `privacyMode="main"` chỉ được đọc bởi owner đã OTP-unlock: `redact.ts` line 31.

Các đường được bảo vệ: Manual reply suggestion, Manual conversation summary, Manual sentiment.

Các đường bypass: Auto-reply, AI follow-up, Virtual assistant (caller còn ghi rõ "Skip ... privacy check": `chat-routes.ts` line 1618), Customer summary service (đường gọi từ auto-reply không có guard), Appointment parser (gửi CRM note ra LLM), Format-rich (gửi operator text ra LLM, chỉ có auth), RAG answer (gửi question + Knowledge chunks ra embedding/LLM, chỉ có auth/org scoping).

Virtual assistant không gửi Zalo thật, nhưng vẫn gửi conversation/contact PII tới external LLM và persist reply local → vẫn là privacy bypass.

### P1-02 — check nào bị bypass

```
generateAiOutput
  ↓
draft + sources + confidence
  ↓
aiAutoReplyFullAuto?
  ├─ false → sensitive/money/confidence/source checks
  └─ true  → bỏ toàn bộ checks
                 ↓
           stale/config recheck
                 ↓
      aiAutoReplyFullAuto mới nhất?
          ├─ false → chạy lại checks
          └─ true  → bỏ checks lần hai
                 ↓
              send Zalo
```

Checks chạy ở cả hai mode: Global AI/auto-reply enabled, Conversation eligibility, Chỉ conversation 1–1, Text/noise validation, Working hours, Consecutive message limit, Provider failure → không gửi, Empty draft → không gửi, Stale-context recheck, Config/eligibility recheck sau delay, Zalo send failure → không persist sent message.

Checks chỉ chạy khi `fullAuto=false`: Sensitive intent trong customer input, Sensitive content trong draft, Money/pricing regex, Confidence threshold, Missing Knowledge source.

Bằng chứng: `ai-auto-reply-service.ts` line 154 và lần recheck tại line 212. Git history xác nhận đây là hành vi chủ đích của commit 354ad80.

### P1-03 — phân loại confidence

| Vị trí | Loại | Tác động |
|---|---|---|
| Reply draft 0.8 | HARDCODED | Được `evaluateNeedsReview()` dùng để cho phép auto-send |
| Summary 0.8 | HARDCODED | Persist, không thấy safety consumer |
| Sentiment JSON | Model self-reported, chưa calibrated | Persist và hiển thị sentiment |
| Appointment AI confidence | Model self-reported | Dùng trong appointment proposal |
| Appointment fallback confidence | Derived heuristic | Có logic cộng điểm deterministic |
| Virtual entity confidenceScore | Model self-reported | Persist; entity suggestion UI hiển thị |
| Format-rich 0.85 | HARDCODED / NON-AUTHORITATIVE | Chỉ persist vào AiSuggestion, không được auto-send policy đọc, không nằm trong format-rich response. Chỉ cần test/documentation, không cần code fix hay scoring mới. |
| Follow-up 1 | HARDCODED | Quota/tracking only |
| Sales handoff 1.0 | Template certainty | Không phải LLM confidence |
| Needs-review 0 | Status marker | Không phải confidence thật |
| Duplicate-contact confidence | Unrelated heuristic | Ngoài AI reply scope |

Nguồn 0.8: `generateAiOutput()` line 262. Nơi persist: `saveSuggestion()` → `AiSuggestion.confidence`. Nơi đọc cho safety: `evaluateNeedsReview()` line 347.

### P1-04 — data flow

```
Authenticated settings editor
  ↓ PUT /api/v1/ai/providers/:id
body.baseUrl
  ↓
setProviderBaseUrl()
  ↓ trim only
AppSetting.valuePlain
  ↓
getProviderBaseUrl()
  ↓
generateText / listProviderModels / embeddings
  ↓
fetch()
  ├─ Bearer token
  ├─ x-api-key
  └─ Gemini key trong query string
  ↓
destination do tenant config chỉ định
```

| Kiểm soát | Hiện có? |
|---|---|
| Parse URL | Không ở provider registry |
| HTTPS required | Không |
| Userinfo blocked | Không |
| Localhost/literal private IP | Không ở AI provider path |
| DNS resolution/private target | Không |
| Link-local/metadata | Không |
| Redirect validation | Không; fetch mặc định follow |
| Arbitrary port | Không kiểm soát |
| Credential forwarding | Có |
| Revalidation before use | Không |
| Host allowlist | Không |

Repository đã có `ssrf-guard.ts` line 52, nhưng AI provider path không gọi nó. Guard này cũng tự ghi nhận limitation: không resolve DNS.

> **⚠️ LƯU Ý QUAN TRỌNG**: KHÔNG sửa `ssrf-guard.ts` — file này có sync API (`assertSafeOutboundUrl()`), webhook và test code phụ thuộc vào nó. DNS resolution với timeout 3s phải đặt trong file MỚI `ai-provider-url-policy.ts`. Lý do: `Promise.race` chỉ giới hạn thời gian chờ, không cancel được OS DNS lookup — nên cần module async riêng.

---

## 3. External LLM Entry Point Inventory

| Entry Point | Caller | Privacy Gate hiện tại | Policy Gate | External LLM | Auto-send possible | Risk |
|---|---|---|---|---|---|---|
| Reply suggestion | POST /api/v1/ai/suggest | Có, route-level | Không cần auto policy | Có | Chỉ khi human gửi sau | Medium |
| Conversation summary | POST /api/v1/ai/summarize/:id | Có, route-level | Không | Có | Không | Medium |
| Sentiment | POST /api/v1/ai/sentiment/:id | Có, route-level | JSON normalization | Có | Không | Medium |
| Auto-reply | Zalo listener → triggerAutoReply | Không | Chỉ khi fullAuto=false | Có | Có | Critical path/P1 |
| Follow-up | Cron → generateFollowupMessage | Không | FORBIDDEN_FOLLOWUP_RE only | Có | Có | P1 |
| Customer summary | Manual suggest hoặc auto-reply | Không có guard riêng | JSON normalization | Có | Không | P1 khi caller auto |
| Virtual assistant | Manual virtual message → trigger | Không; caller skip privacy | Entity parser only | Có | Không gửi Zalo; persist local | P1 privacy |
| RAG answer | POST /api/v1/knowledge/ask | Auth/org only | Không | Có | Không | Medium |
| Appointment parse | POST /notes/:id/ai-parse | Auth + org-scoped note only | Rule fallback/JSON parse | Có | Không | Medium |
| Format-rich | POST /api/v1/ai/format-rich | Auth only | Output parser/fallback | Có | Human may later send | Medium |
| Model listing | Provider settings route | Auth/settings context | N/A | External provider API | Không | P1 SSRF/key |
| Knowledge embedding | Ingest/retrieve/RAG | Org scoping | N/A | External embedding API | Không | P1 SSRF/data |
| Sales handoff | HTTP route | Auth/org queries | Template | Không | Human may send | Low; không phải LLM |

---

## 4. Current Call Graphs

### Manual reply/summary/sentiment

```
Fastify route
  ├─ authMiddleware
  ├─ conversation/org/Zalo access
  ├─ assertPrivacyAllowsAi(request, conversationId)
  │    ├─ buildPrivacyContext(request)
  │    ├─ resolve OTP privacy session
  │    └─ canSeeConversationContent()
  └─ generateAiOutput()
       ├─ getAiConfig()
       ├─ loadConversation()
       ├─ retrieveRelevantChunks() [reply only]
       │    └─ generateEmbeddings()
       ├─ build prompt
       ├─ getProviderBaseUrl()
       └─ generateText()
            └─ external provider fetch
```

### Auto-reply

```
Zalo listener.on("message")
  ↓
handleIncomingMessage()
  ↓ persist Message
  ↓ emit realtime/push
  ↓ fire-and-forget triggerAutoReply()
  ↓ withTenant()
  ↓ runAutoReply()
  ├─ config/eligibility/input/hour/loop checks
  ├─ NO PRIVACY AUTHORIZATION
  ├─ generateAiOutput()
  │    └─ external embedding + external LLM
  ├─ if !fullAuto: evaluateNeedsReview()
  ├─ delay/stale/config recheck
  ├─ if !latestFullAuto: evaluateNeedsReview()
  └─ zaloOps.sendMessage()
```

Caller evidence: `zalo-listener-factory.ts` line 766.

### Follow-up

```
startAiFollowupCron()
  ↓ every 15 minutes
runAiFollowupTick()
  ↓ processOrg()
  ↓ findEligibleAnchor()
  ↓ processCandidate()
  ├─ generateFollowupMessage()
  │    ├─ load conversation/contact/history
  │    ├─ NO PRIVACY AUTHORIZATION
  │    ├─ generateText()
  │    └─ FORBIDDEN_FOLLOWUP_RE
  ├─ delay + stale/config recheck
  └─ zaloOps.sendMessage()
```

### Virtual assistant

```
POST /conversations/:id/messages
  ↓ load org-scoped conversation
  ↓ if isVirtual
  ↓ persist user message
  ↓ explicit skip privacy check
  ↓ triggerVirtualChatAiReply()
  ↓ buildContext(contact PII + history)
  ↓ generateText()
  ↓ persist AI local message/entities
```

### Customer summary

```
Manual suggestion or auto-reply
  ↓ scheduleCustomerSummaryUpdate/updateCustomerSummary
  ↓ load contact/conversation/messages
  ↓ NO OWN PRIVACY GUARD
  ↓ generateText()
  ↓ update Contact.metadata.customerSummary
```

### Other external calls

```
Knowledge ask → embedding → retrieve chunks → generateText
CRM note parse → parseAppointmentFromText → generateText
Format-rich → aiFormatRichText → generateText
Provider models → listProviderModels → credential-bearing fetch
Knowledge ingest/retrieve → embedding-service → credential-bearing fetch
```

---

## 5. PR-01 Architecture Decision

### Privacy boundary options

| Option | Blast radius | Bypass risk | Testability | Complexity | Decision |
|---|---|---|---|---|---|
| A. Guard từng route/caller | Medium | Cao; background/new caller dễ sót | Medium | Low ban đầu, tăng dần | Reject |
| B. Guard trong generateAiOutput() | Low | Cao; không phủ follow-up, virtual, summary service, RAG, note, format | High cho một path | Low | Reject |
| C. Shared AI generation executor + privacy grant | Medium | Thấp nhất; mọi completion dùng một boundary | High | Medium | **Chọn** |

### Quyết định

Thêm một boundary hẹp, không phải redesign orchestrator:

```typescript
authorizeAiData(...)
  ↓ returns branded AiDataGrant

executeAiGeneration({ grant, provider, model, system, prompt, ... })
  ↓ validates grant/org/scope
  ↓ resolves validated provider URL
  ↓ dispatches provider
```

Các invariant:

1. Low-level provider dispatch không còn được export cho business modules.
2. Mọi external text generation phải gọi `executeAiGeneration()`.
3. Executor không chấp nhận raw boolean `privacyAllowed`; nó yêu cầu grant do `authorizeAiData()` tạo.
4. Conversation grant chứa orgId, conversationId, source/purpose và actor mode.
5. Background operation không có user/OTP session: `privacyMode=sub` → allow; `privacyMode=main` → deny.
6. User-initiated operation trên main: chỉ owner + OTP-unlocked mới được grant.
7. Query/authorization error: fail closed cho AI; human chat vẫn hoạt động.
8. Non-conversation input phải khai báo explicit scope: `crm_note`, `operator_text`, `knowledge`.
9. Không có scope mặc định.

### Caller handling

- **Manual reply/summary/sentiment**: route xây PrivacyContext, lấy grant, giữ HTTP 403 hiện tại và truyền grant xuống service.
- **Auto-reply/follow-up**: xin background conversation grant trước khi load prompt/call provider. Main nick bị block.
- **Virtual assistant**: route không được "skip privacy check" nữa; user privacy context được kiểm tra trước khi schedule trigger.
- **Customer summary**: nhận lại grant của parent operation. Không tự chạy nếu không có grant hợp lệ.
- **RAG/format/note**: explicit non-conversation grant; vẫn giữ auth/org lookup hiện tại.

### Mandatory policy gate

Thêm `ai-send-policy.ts` với kết quả:

```typescript
type AiSendPolicyDecision =
  | { action: "allow" }
  | { action: "needs_review"; reason: NeedsReviewReason }
  | { action: "block"; reason: string };
```

**Auto-reply:**
- Chạy policy ngay sau generation.
- Chạy lại policy sau human-like delay bằng config mới nhất.
- Không truyền `fullAuto` vào policy.
- `aiAutoReplyFullAuto` được giữ trong schema/API để backward compatibility nhưng không còn quyền bypass safety.
- Sensitive input, sensitive/money output và missing source tiếp tục dùng logic hiện tại.
- `needs_review` luôn gọi `saveNeedsReview()` và return trước `zaloOps.sendMessage()`.

**Follow-up:**
- Chuyển `FORBIDDEN_FOLLOWUP_RE` thành policy mode followup.
- Decision `block` → không gửi.
- Không áp missing-source rule của reply lên follow-up vì pipeline follow-up hiện không retrieve Knowledge.
- Không phát minh thêm risk/scoring.

### Confidence decision

Chọn phương án C: giữ compatibility nhưng policy không tin confidence.

- Giữ `AiSuggestion.confidence`, API response và Prisma schema.
- Không migration.
- Không thay sentiment/appointment/entity confidence.
- Loại `confidence` và `minConfidence` khỏi input của mandatory auto-send policy.
- `aiAutoReplyMinConfidence` vẫn tồn tại nhưng không được dùng cho safety cho tới khi có calibrated scoring framework.
- Không gửi reply confidence này sang Opik trong PR-02.
- Thêm test chứng minh 0.8 không thể authorize auto-send.

> **GHI CHÚ REVIEW**: Giá trị `confidence: 0.85` trong `aiFormatRichText()` là HARDCODED/NON-AUTHORITATIVE — không được auto-send policy đọc, không nằm trong format-rich response, chỉ persist vào `AiSuggestion`. Chỉ cần test + documentation, KHÔNG cần code fix hay new scoring.

### Provider URL policy tối thiểu

> **⚠️ QUAN TRỌNG**: DNS resolution + timeout 3s phải đặt trong file MỚI `ai-provider-url-policy.ts`. KHÔNG sửa `ssrf-guard.ts` — file đó có sync API (`assertSafeOutboundUrl()`), webhook và test code phụ thuộc. `Promise.race` chỉ giới hạn thời gian chờ, không cancel được OS DNS lookup — cần module async riêng.

Strict default:
- Chỉ `https:`.
- URL phải parse được.
- Cấm username/password.
- Cấm fragment/query trong base URL.
- Normalize trailing slash.
- Default port: 443.
- Non-standard port chỉ được dùng khi exact origin nằm trong server-controlled allowlist.
- Cấm literal localhost, loopback, RFC1918, link-local, 0/8, IPv6 loopback/ULA/link-local và metadata addresses.
- Resolve toàn bộ A/AAAA trước khi sử dụng; nếu bất kỳ address nào thuộc blocked range thì reject.
- Revalidate khi save và ngay trước credential-bearing request.
- Mọi provider fetch dùng `redirect: "manual"`; 3xx bị reject, không forward credential sang Location.
- Không log URL chứa credential.
- Không log API key.
- Error response body phải được truncate/sanitize.

Custom/self-host compatibility:

```
strict default
+
AI_PROVIDER_BASE_URL_ALLOWLIST=<exact origins controlled by deployment operator>
```

- Allowlist thuộc environment/deployment, không cho tenant settings tự thêm.
- Private self-host origin chỉ được dùng khi exact-match allowlist.
- Production vẫn yêu cầu TLS.
- HTTP chỉ được cân nhắc cho non-production exact allowlist.
- DNS rebinding TOCTOU chưa thể loại bỏ hoàn toàn chỉ bằng pre-resolution; egress proxy/pinned DNS dispatcher là future hardening.

---

## 6. PR-01 Diff Plan

| File | Function | Current | Proposed | Why | Risk |
|---|---|---|---|---|---|
| `modules/ai/ai-privacy-guard.ts` | New | Không có shared boundary | authorizeAiData, branded AiDataGrant, background/user/non-conversation scopes | Ngăn bypass | Medium |
| `modules/ai/ai-generation-executor.ts` | New | generateText export từ ai-service | Central provider dispatch, bắt buộc grant | Một external-generation choke point | Medium |
| `modules/ai/ai-send-policy.ts` | New | Policy nằm trong auto service/follow-up | Pure mandatory policy decisions | Testable, không full-auto bypass | Low |
| `modules/ai/ai-provider-url-policy.ts` | New | Không có AI URL validation | HTTPS/DNS/range/userinfo/port/origin validation | Chặn SSRF/key exfiltration | Medium |
| `modules/ai/ai-service.ts` | generateAiOutput, appointment, format-rich | Direct generateText; confidence safety consumer gián tiếp | Dùng executor/grant; bỏ exported dispatch | Bao phủ all calls | Medium |
| `modules/ai/ai-routes.ts` | Manual AI routes | Local route guard | Dùng shared authorization, truyền grant | Giữ 403 UX, tránh duplicate policy | Low |
| `modules/ai/ai-auto-reply-service.ts` | runAutoReply, evaluateNeedsReview | Không privacy; !fullAuto gate | Background grant; mandatory policy hai lần; bỏ confidence safety | Fix P1-01/02/03 | Medium |
| `modules/ai/ai-followup-service.ts` | generateFollowupMessage | Direct LLM; local regex | Background grant + executor | Privacy boundary | Medium |
| `modules/ai/ai-followup-cron.ts` | processCandidate | Direct send after service output | Mandatory follow-up policy before send | Auto-send invariant | Low |
| `modules/ai/ai-virtual-chat-service.ts` | trigger/runVirtualChatAiReply | Direct LLM, no privacy | Nhận grant + executor | Fix virtual bypass | Medium |
| `modules/ai/customer-summary-service.ts` | updateCustomerSummary | Direct LLM, no guard | Require/inherit grant + executor | Fix secondary background leak | Medium |
| `modules/ai/knowledge/knowledge-service.ts` | ragAnswer | Direct generateText | Explicit Knowledge grant + executor | Inventory closure | Low |
| `modules/chat/chat-routes.ts` | Virtual branch | Explicit skip privacy | Authorize before trigger | Không gửi PII trái quyền | Medium |
| `provider-registry.ts` | set/getProviderBaseUrl | Trim/store/read | Validate/normalize at write and read | SSRF control | Medium |
| Provider wrappers | fetch | Default redirect | `redirect:"manual"`, reject 3xx | Chặn credential redirect | Low |
| `knowledge/embedding-service.ts` | embedding fetch | Unvalidated URL/default redirect | Validated base URL/manual redirect | Cùng credential risk | Medium |
| `providers/list-models.ts` | fetchJson | Unvalidated URL/default redirect | Validated URL/manual redirect | Cùng credential risk | Medium |
| `config/index.ts` | Config object | Không có provider origin allowlist | Parse exact-origin allowlist | Controlled compatibility | Low |
| `.env.example` | Documentation | Không có allowlist | Document strict policy/allowlist | Deploy clarity | Low |

### Files to add

- `backend/src/modules/ai/ai-privacy-guard.ts`
- `backend/src/modules/ai/ai-generation-executor.ts`
- `backend/src/modules/ai/ai-send-policy.ts`
- `backend/src/modules/ai/ai-provider-url-policy.ts`
- Các test files ở mục 7.

### Files not to touch

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- `backend/src/shared/utils/ssrf-guard.ts` ← **KHÔNG SỬA**, DNS resolution vào `ai-provider-url-policy.ts` mới
- Frontend
- Prompt files
- Knowledge content/chunking
- Zalo listener core
- Zalo SDK/pool/operations implementation
- `docker-compose.yml`
- Provider/model selection
- Redis/BullMQ topology
- Auto-reply enablement defaults

---

## 7. PR-01 Test Matrix

Mọi test dưới đây phải mock Prisma/provider/Zalo/DNS khi phù hợp và không gọi external service.

| ID | Scenario | Expected | Test Type | External Call? |
|---|---|---|---|---|
| P01 | Manual AI, sub nick | Grant issued, provider mock called once | Unit/integration-mock | No |
| P02 | Manual main nick, non-owner/locked | 403/denied, provider call 0 | Unit/integration-mock | No |
| P03 | Auto-reply, sub nick | Generation allowed | Unit | No |
| P04 | Auto-reply, main nick | Fail closed, generation/provider 0 | Unit | No |
| P05 | Follow-up, sub nick | Generation allowed | Unit | No |
| P06 | Follow-up, main nick | No generation/send | Unit | No |
| P07 | Privacy lookup throws | Provider call 0; human chat unaffected | Unit | No |
| P08 | Normal reply, source present | allow | Pure unit | No |
| P09 | Sensitive customer/draft | needs_review | Pure unit | No |
| P10 | Money/pricing output | needs_review | Pure unit | No |
| P11 | Missing source | needs_review | Pure unit | No |
| P12 | fullAuto=true | Same mandatory policy result | Service unit | No |
| P13 | needs_review | saveNeedsReview called; Zalo send 0 | Service unit | No |
| P14 | Reply confidence 0.8 | Confidence cannot change allow/review result | Pure unit | No |
| P15 | Valid HTTPS provider | Accepted | Unit | No |
| P16 | HTTP default | Rejected | Unit | No |
| P17 | localhost | Rejected | Unit | No |
| P18 | 127.0.0.1 | Rejected | Unit | No |
| P19 | ::1 | Rejected | Unit | No |
| P20 | RFC1918 IPv4 | Rejected | Unit | No |
| P21 | Link-local | Rejected | Unit | No |
| P22 | 169.254.169.254 metadata | Rejected | Unit | No |
| P23 | URL userinfo | Rejected | Unit | No |
| P24 | Public URL redirects private | Redirect not followed; key not forwarded | Provider unit | No |
| P25 | Manual suggestion regression | Same response shape/content from provider mock | Integration-mock | No |
| P26 | AI disabled | Existing disabled/fallback behavior | Unit | No |
| P27 | Provider error | Existing error/fallback semantics | Unit | No |
| P28 | Normal human Zalo send | Unchanged path, Zalo mock called | Integration-mock | No |

Bổ sung cần thiết:

- Virtual main locked → provider 0.
- Customer summary inherited denied grant → provider 0.
- RAG/format/note must declare explicit scope; missing scope fails before provider.
- DNS hostname resolving private A/AAAA → reject.
- Exact private origin allowlist → chỉ allow theo deployment policy.
- Invalid allowlist entry → ignored/rejected, không fail-open.
- All completion business modules no longer import low-level providers; static dependency test/rg assertion.

Test files đề xuất:

- `backend/tests/security/ai-privacy-guard.test.ts`
- `backend/tests/security/ai-provider-url-policy.test.ts`
- `backend/tests/unit/ai-send-policy.test.ts`
- `backend/tests/unit/ai-generation-executor.test.ts`
- `backend/tests/unit/ai-auto-reply-policy-regression.test.ts`
- `backend/tests/unit/ai-followup-policy-regression.test.ts`

---

## 8. PR-01 Rollback

Primary rollback:

```bash
git revert <PR-01 merge commit>
```

Không có migration hoặc data backfill nên không cần DB rollback.

| Failure | Behavior |
|---|---|
| Privacy lookup error | Fail closed cho AI; không gọi provider |
| Main background conversation | Không generate/không auto-send |
| Policy evaluator error | Fail closed; không auto-send |
| Provider URL validation error | Không gửi credential/request |
| Zalo human chat | Không bị ảnh hưởng |
| AI manual blocked | Trả safe 403/validation error |
| Custom private provider bị strict policy chặn | Chỉ phục hồi bằng exact deployment allowlist hoặc revert; không có tenant fail-open toggle |

Không nên thêm feature flag để tắt privacy/policy guard. Đây là security invariant, không phải experimental behavior.

---

## 9. PR-01 Acceptance Criteria

PR-01 chỉ PASS khi:

- Inventory mọi external generation path được giữ trong test/docs.
- Business modules không gọi low-level provider trực tiếp.
- Auto-reply main/private không gọi provider.
- Follow-up main/private không gọi provider.
- Virtual assistant tôn trọng privacy.
- Customer summary cần grant hợp lệ.
- Summary/sentiment manual vẫn trả 403 đúng behavior.
- Full-auto không bypass policy ở cả pre-delay và post-delay.
- Needs-review không thể chạm `zaloOps.sendMessage`.
- Reply confidence 0.8 không tham gia safety decision.
- Provider base URL được validate trước storage và trước fetch.
- Provider redirects không được follow.
- Zero credential forwarding tới blocked destination.
- Prompt/Knowledge/provider/model không đổi.
- Không Prisma migration.
- Human chat hoạt động khi AI fail closed.
- Backend build/typecheck và targeted tests pass trong implementation environment.
- `git diff` chỉ chứa files đã duyệt.
- Rollback bằng revert, không cần DB action.

---

## 10. PR-01 Blast Radius

| Thành phần | Mức | Giải thích |
|---|---|---|
| Files | Medium | Khoảng 15–20 source/test/config files |
| Functions | Medium | Tất cả completion callers phải chuyển sang executor |
| Callers | Medium | Manual, auto, follow-up, virtual, summary, RAG, note, format |
| Database | Low | Chỉ reads/behavior; không schema/migration |
| Network | High-positive security impact | Tất cả AI provider/model/embedding requests được chặn URL unsafe |
| Zalo | Medium | Auto-reply/follow-up có thể bị block nhiều hơn; human send không đổi |
| AI providers | Medium | URL/redirect behavior thay đổi; payload/model không đổi |
| Frontend | None | Không sửa |
| Background jobs | Medium | Auto-reply, follow-up, customer summary bị fail closed trên main |
| Overall | **MEDIUM** | Cross-cutting nhưng boundary rõ, không migration |

---

## 11. PR-02 Architecture Decision

Mục tiêu: **OBSERVE, NOT CONTROL.**

| Option | Ưu điểm | Nhược điểm | Decision |
|---|---|---|---|
| A. In-process best-effort adapter | PR nhỏ, không thêm Redis workflow, latency thấp | Trace có thể mất khi crash | **Chọn cho PR-02** |
| B. Reuse bridge-bus | Pattern quen thuộc | Bus dành cho message.persisted; mixing domain; EventEmitter sync semantics | Không chọn |
| C. Dedicated BullMQ | Durable/retry/backpressure tốt | Thêm queue/worker/Redis lifecycle và vận hành | Future |

### Thiết kế

```
AI lifecycle
  ↓
internal trace scope/event
  ↓
strict allowlist builder
  ↓
HMAC pseudonymizer
  ↓
secret scanner
  ↓
schema validator
  ↓
bounded in-process exporter
  ↓
Opik SDK batch queue
```

Các nguyên tắc:

- Không await network Opik trước AI response/Zalo send.
- Internal tracing API không expose Opik classes ra business code.
- Khi disabled: không dynamic-import SDK, không init client, không timer/worker/network.
- Khi enabled nhưng config/hash secret không hợp lệ: exporter disabled, local warning, CRM tiếp tục.
- Bounded pending counter; vượt ngưỡng thì drop trace và increment local metric/log.
- Không retry trong CRM. SDK batching/retry là implementation detail.
- Shutdown flush có `Promise.race` và hard timeout; timeout không giữ CRM quá shutdown budget.
- Không gửi input/output cho Opik.

---

## 12. Opik Compatibility Check

| Thuộc tính | Kết quả |
|---|---|
| Package | `opik` |
| npm version thấy tại thời điểm audit | 2.2.59 |
| GitHub main package version | 2.2.55 |
| Node engine | `>=18` |
| CRM production Node | 20 |
| Node compatibility | Compatible theo declared engine |
| Module format | ESM + CJS exports |
| CRM module format | ESM |
| Peer dependency | `zod ^3.25.55` |
| CRM có zod dependency? | Không |
| Network client | Fetch |
| Batching | TypeScript SDK default 300 ms |
| Batch size | Tài liệu architecture: 100 items |
| Retries | Tài liệu architecture: 2 retries |
| Flush | `client.flush()` và `flushAll()` |
| TS request timeout option | NOT VERIFIED; official config không document request-level timeout |
| Track disable | `OPIK_TRACK_DISABLE` |
| Hold until flush | `OPIK_HOLD_UNTIL_FLUSH` |
| Default URL nếu thiếu | Tài liệu TS nêu localhost default; PR phải không dùng default khi enabled |

Quyết định dependency:

- Dùng official `opik` SDK sau adapter.
- Pin exact SDK version trong PR implementation.
- Thêm explicit compatible `zod` dependency thay vì dựa vào implicit peer install.
- Không nâng Node.
- Không dùng `opik-ts configure`, vì công cụ này có thể tự sửa env/code/package.
- Implementation PR phải chạy install/build/test trong branch riêng rồi review lockfile.
- Do request-level timeout chưa được tài liệu TS xác nhận, business isolation phải dựa trên no-await, bounded adapter và bounded shutdown flush — not on an assumed SDK timeout.

---

## 13. Trace Contract

Chỉ dùng dữ liệu code hiện có:

```typescript
type AiOperation =
  | "reply"
  | "summary"
  | "sentiment"
  | "auto_reply"
  | "followup"
  | "virtual_chat"
  | "customer_summary"
  | "rag_answer"
  | "appointment_parse"
  | "format_rich";

type AiTraceStatus =
  | "generated"
  | "provider_failed"
  | "privacy_denied"
  | "needs_review"
  | "policy_blocked"
  | "auto_sent"
  | "send_failed"
  | "fallback"
  | "disabled";

type SafeAiTraceEvent = {
  schema_version: 1;
  trace_id: string;
  operation: AiOperation;

  organization_hash: string;
  conversation_hash?: string;
  contact_hash?: string;

  channel: "zalo" | "virtual" | "crm_note" | "knowledge" | "editor";

  provider?: string;
  model?: string;
  source_count?: number;
  latency_ms: number;

  status: AiTraceStatus;
  auto_sent?: boolean;
  error_type?: SafeAiErrorType;
};
```

Không có trong PR-02 (phải OMIT, không ghi "unknown"):

| Field | Lý do |
|---|---|
| `prompt_version` | chưa tồn tại |
| `knowledge_version` | chưa tồn tại |
| `intent` | chưa tồn tại |
| `risk_level` | chưa tồn tại |
| `confidence` | reply confidence không authoritative |
| `input_tokens` | wrappers không trả usage |
| `output_tokens` | wrappers không trả usage |
| `estimated_cost` | không đủ token/pricing data |
| `human_reviewed` | không có durable lifecycle |
| `human_edited` | không có draft-final correlation |

### Trace hierarchy thực tế của PR-02

```
crm.ai.<operation>
├─ authorize_privacy
├─ load_context             [khi code thực sự load]
├─ retrieve_knowledge       [reply/rag only]
├─ build_prompt             [khi thực sự chạy]
├─ llm_generation
├─ policy_evaluation        [auto-reply/follow-up only]
└─ send_zalo               [auto-reply/follow-up only]
```

Không tạo spans giả: `classify_intent`, `retrieve_business_facts`, `human_review`, `customer_outcome`. Future target chỉ thêm các span này khi lifecycle tương ứng tồn tại thật.

---

## 14. Data Allowlist / PII Policy

### Allowed after validation

| Field | Rule |
|---|---|
| `schema_version` | Constant |
| `trace_id` | Random UUID generated for trace; không derive từ customer |
| `operation` | Enum |
| `channel` | Enum |
| `provider`, `model` | Length-limited, no URL/key |
| `source_count` | Non-negative integer |
| `latency_ms` | Non-negative finite integer |
| `status` | Enum |
| `auto_sent` | Boolean |
| `error_type` | Enum, không raw message |

### HMAC only

| Raw value | Exported |
|---|---|
| organization ID | `HMAC-SHA256(OPIK_HASH_SECRET, "org:"+id)` |
| conversation ID | `HMAC-SHA256(..., "conversation:"+id)` |
| contact ID | `HMAC-SHA256(..., "contact:"+id)` |

Domain prefixes ngăn cùng một raw ID tạo cùng pseudonym giữa entity types.

### Must not send

`prompt`, `response`, raw conversation/message text, Knowledge title/chunk/content, customer name, phone/email/address, notes/customer metadata, Zalo UID/Facebook UID, sender name/UID, token/cookie/session, API/provider key, webhook secret, provider URL, raw error body/message/stack.

### Pipeline

```
Raw internal event
  ↓ construct new allowlisted object; never spread
HMAC pseudonymizer
  ↓
secret/high-entropy pattern scanner
  ↓
runtime schema validator
  ↓
Opik adapter
```

Unknown fields are dropped by construction. Nếu validation/scanner fail, toàn bộ event bị drop; không gửi partial payload mơ hồ.

---

## 15. PR-02 Diff Plan

| File | Function | Change | Why | Runtime Impact | Risk |
|---|---|---|---|---|---|
| `backend/package.json` | Dependencies | Pin opik + compatible zod | Official SDK | Package size/startup only if loaded | Medium |
| `backend/package-lock.json` | Lock | npm-generated lock update | Reproducibility | Build only | Medium |
| `config/index.ts` | Config | Parse Opik settings | Existing convention | Negligible | Low |
| `.env.example` | Docs | Document flags/settings | Safe deployment | None | Low |
| `observability/ai-trace-contract.ts` | New | Enums/types/schema | No fake metadata | None | Low |
| `observability/ai-trace-sanitizer.ts` | New | Allowlist/HMAC/scanner | PII invariant | CPU micro-cost only when sampled | Low |
| `observability/opik-exporter.ts` | New | Lazy SDK adapter, bounded publish/flush | Error isolation | Background network only when enabled | Medium |
| `observability/ai-tracer.ts` | New | Neutral trace/span facade | Không leak Opik into business modules | Small sync overhead | Low |
| `ai-generation-executor.ts` | PR-01 boundary | Add llm_generation span/status | Một choke point cho all generations | Timing calls only | Low |
| `ai-service.ts` | Generation/context | Root/load/retrieve/build spans | Realistic hierarchy | Small timing overhead | Medium |
| `ai-auto-reply-service.ts` | Auto lifecycle | Policy/send/status spans | Needs-review/auto-send visibility | No network await | Medium |
| `ai-followup-service.ts` | Generation | Follow-up generation spans | Coverage | Low | Low |
| `ai-followup-cron.ts` | Send lifecycle | Policy/send/final status | Coverage | Low | Low |
| `app.ts` | Graceful shutdown | Bounded exporter flush | Reduce trace loss | ≤ configured shutdown bound | Low |

### Feature/config

```env
OPIK_ENABLED=false
OPIK_URL_OVERRIDE=
OPIK_API_KEY=
OPIK_WORKSPACE=
OPIK_PROJECT_NAME=zalocrm
OPIK_ENVIRONMENT=
OPIK_SAMPLE_RATE=0
OPIK_HASH_SECRET=
OPIK_BATCH_DELAY_MS=300
OPIK_FLUSH_TIMEOUT_MS=500
OPIK_MAX_PENDING=1000
OPIK_LOG_LEVEL=WARN
```

Rules:

- `OPIK_ENABLED=false` → no SDK import/initialization/network.
- `OPIK_ENABLED=true` nhưng URL/hash secret thiếu → exporter stays disabled.
- `OPIK_SAMPLE_RATE=0` → zero selected events.
- URL phải qua outbound URL policy.
- Không dùng undocumented `OPIK_TIMEOUT_MS` như request timeout; dùng `OPIK_FLUSH_TIMEOUT_MS` cho shutdown only.

### Do not touch

Prisma/schema/migrations, Frontend, Prompts, Knowledge content, Zalo listener, Provider payload/model/output, Auto-reply policy/behavior, Redis/BullMQ topology, n8n/Lark, Promptfoo.

---

## 16. PR-02 Test Matrix

| ID | Scenario | Expected | Type | External Call? |
|---|---|---|---|---|
| O01 | OPIK_ENABLED=false | Zero SDK init/network/timer | Unit | No |
| O02 | Raw phone in internal input | Sanitizer rejects/drops | Unit | No |
| O03 | Raw Zalo UID | Reject/drop | Unit | No |
| O04 | Raw conversation/content field | Unknown/content field absent | Unit | No |
| O05 | Bearer/API token pattern | Reject/drop | Unit | No |
| O06 | Unknown field | Dropped | Unit | No |
| O07 | Same entity/secret | Stable pseudonym | Unit | No |
| O08 | Different IDs | Different pseudonyms | Unit | No |
| O09 | Different secrets | Different pseudonyms | Unit | No |
| O10 | SDK/background timeout | CRM result unchanged | Unit fake adapter | No |
| O11 | DNS/network failure | CRM result unchanged | Unit fake adapter | No |
| O12 | Opik 500 | CRM result unchanged | Unit fake adapter | No |
| O13 | Malformed SDK/backend response | CRM result unchanged | Unit fake adapter | No |
| O14 | Exporter throws synchronously | Business callback still runs | Unit | No |
| O15 | Successful generation | One root + real spans/status | Unit snapshot | No |
| O16 | Provider failure | provider_failed, no raw error | Unit | No |
| O17 | Needs review | needs_review, auto_sent=false | Unit | No |
| O18 | Auto-send | Policy span precedes send span/status | Unit | No |
| O19 | Manual AI | Output unchanged with tracing on/off | Regression | No |
| O20 | Auto-reply | Zalo mock behavior identical on/off | Regression | No |
| O21 | Follow-up | Zalo mock behavior identical on/off | Regression | No |
| O22 | AI disabled | No generation; optional safe status only | Regression | No |

Bổ sung:

- Sample rate 0/1 deterministic with injected RNG.
- Invalid/short hash secret produces zero export.
- Opik URL unsafe produces zero init/network.
- Queue/pending limit drops safely.
- Flush completes.
- Flush timeout returns within bound.
- Provider/model over length or containing control characters rejected.
- No input/output property appears in serialized SDK calls.
- Disabled path must not execute `import("opik")`.
- Test all trace payloads with canary phone, UID, bearer token and raw customer sentence.

---

## 17. PR-02 Rollback

**Primary kill switch:** `OPIK_ENABLED=false`

Khi false: Không import SDK, Không init client, Không tạo exporter background state, Không gửi network, Không flush, Tracer là no-op.

**Secondary rollback:** `git revert <PR-02 merge commit>`

Không DB rollback, không data migration, không cleanup application records.

Nếu Opik lỗi khi enabled: `drop/log local sanitized error → continue AI/Zalo`. Không tự động chuyển Opik failure thành request failure.

---

## 18. PR-02 Acceptance Criteria

- Opik mặc định disabled.
- Disabled path tạo zero network call và zero SDK initialization.
- Trace metadata-only.
- Không raw prompt/response/conversation/Knowledge.
- Không customer PII hoặc external UID.
- IDs dùng HMAC-SHA256 với secret riêng.
- Unknown field bị drop.
- Invalid payload không export.
- Không raw provider/Opik error.
- Exporter best-effort và bounded.
- Opik unavailable không đổi AI/Zalo behavior.
- Không await Opik network trong critical path.
- Không fake prompt/Knowledge version, intent, risk, confidence, tokens hoặc cost.
- Không thay AI output/provider/prompt.
- Không thay policy hoặc auto-send.
- Không Prisma migration.
- Tests ON/OFF/failure pass.
- Backend build với production Node 20 pass.
- Rollback bằng flag đã được test.

---

## 19. PR-02 Blast Radius

| Thành phần | Mức | Giải thích |
|---|---|---|
| Files | Medium | Package/config + observability modules + AI lifecycle call sites |
| Functions | Medium | Shared executor và auto/follow-up lifecycle |
| Callers | Low/Medium | API signatures nội bộ; output business không đổi |
| Database | None | Không schema/write mới |
| Network | Medium | Một outbound service mới, chỉ khi enabled/sampled |
| Zalo | Low | Không nằm trước send, không quyết định send |
| AI providers | Low | Không thay provider request/payload |
| Frontend | None | Không sửa |
| Background jobs | Low | Chỉ publish safe events |
| Dependency footprint | Medium | Opik SDK kéo nhiều dependencies và peer zod |
| Overall | **LOW–MEDIUM khi disabled; MEDIUM khi enabled** | |

---

## 20. PR-01 → PR-02 Dependency

PR-01 là prerequisite kiến trúc của PR-02 ở ba điểm:

1. **Shared execution boundary**: PR-02 có một chỗ đáng tin để instrument mọi external generation.
2. **Explicit privacy decision**: trace có thể ghi `privacy_denied`/`generated` mà không vô tình quan sát một pipeline đang bypass privacy.
3. **Mandatory send policy**: `policy_evaluation`, `needs_review` và `auto_sent` trở thành lifecycle thật, không bị full-auto bypass.

PR-02 vẫn phải có data allowlist riêng. Privacy guard của PR-01 không thay thế trace redaction vì provider data và observability data có trust boundary khác nhau.

**Không merge PR-02 trước PR-01.** Có thể chuẩn bị branch nhưng phải rebase lên PR-01 và test lại.

---

## 21. Recommended Commit Sequence

### PR-01 — AI Privacy & Policy Guard

1. **Tests reproducing current bypass**
   - Auto/follow-up/virtual/customer-summary privacy denial.
   - Full-auto bypass.
   - Confidence 0.8 authorization.
   - Provider unsafe URL/redirect.

2. **Shared AI privacy grant**
   - Add `ai-privacy-guard.ts`.
   - Preserve manual 403 behavior.

3. **Shared generation executor**
   - Move low-level dispatch.
   - Update all completion callers.
   - Static test preventing direct provider imports.

4. **Mandatory send policy**
   - Add pure policy module.
   - Apply twice in auto-reply and once before follow-up send.
   - Remove fullAuto bypass.

5. **Remove fake confidence from safety**
   - Preserve field/API/schema.
   - Remove from policy decision only.

6. **Provider URL hardening**
   - Registry validation.
   - DNS/private/special address policy (trong `ai-provider-url-policy.ts` MỚI, KHÔNG sửa `ssrf-guard.ts`).
   - Manual redirects.
   - Deployment exact-origin allowlist.

7. **Regression/security completion**
   - Full targeted matrix.
   - Node 20 build.
   - Verify no schema/frontend/prompt diff.

### PR-02 — Opik Trace-only

1. **Dependency/config**
   - Pin SDK/zod.
   - Add disabled-by-default config.
   - Verify Node 20 build.

2. **Trace contract and privacy layer**
   - Types/enums.
   - HMAC.
   - Allowlist/scanner/schema tests.

3. **Best-effort exporter**
   - Lazy SDK import.
   - Pending bound, sampling, local error isolation.
   - Bounded flush.

4. **Shared executor instrumentation**
   - Generation traces and real spans.
   - No raw inputs/outputs.

5. **Auto/follow-up lifecycle**
   - Policy/send/status spans.
   - Preserve behavior.

6. **Failure/privacy/regression tests**
   - ON/OFF/network failure.
   - Final payload canary tests.
   - Rollback flag test.

---

## 22. Risks / Open Questions

| Item | Status |
|---|---|
| Production custom provider URLs/private origins | NOT VERIFIED; inventory required before enforcing strict policy |
| Production use of `aiAutoReplyFullAuto` | NOT VERIFIED |
| Whether background AI should ever access main nick without active owner session | Current privacy model says no; PR plan fails closed |
| Existing DPA/retention/data region for Opik | NOT VERIFIED; blocks enablement, not code merge with flag off |
| Exact Opik version to pin on implementation day | Must re-check npm/GitHub before install |
| SDK request-level timeout | NOT VERIFIED; official TS config does not document it |
| Opik dependency size/security review | Required during PR lockfile review |
| DNS rebinding after pre-resolution | Residual risk; egress proxy/pinned resolver is future |
| Full-auto settings UI becomes semantically misleading | Future cleanup; frontend out of scope |
| Existing raw PII sent to approved external LLMs | PR-01 fixes authorization, not full data minimization |
| Durable human feedback/correlation | Future; out of scope |
| Tokens/cost/version metadata | Unavailable; must not be fabricated |
| Tests in this planning task | Not executed due plan-only/read-only constraints |

---

## 23. GO / NO-GO

### PR-01: **GO — READY TO IMPLEMENT**

Điều kiện triển khai:

- Branch riêng từ `4f897a1` hoặc current reviewed HEAD.
- Tests bắt đầu bằng reproduction.
- Không migration/frontend/prompt changes.
- Xác minh danh sách custom provider origins trước rollout strict validation.

### PR-02: **READY AFTER PR-01** (Conditional GO)

Điều kiện:

- Rebase trên shared execution/privacy/policy boundary của PR-01.
- Pin và kiểm thử Opik SDK bằng Node 20.
- Flag off mặc định.
- Không enable production cho tới khi có Opik URL, workspace, retention, access policy và `OPIK_HASH_SECRET` được duyệt.

---

## 24. IMPLEMENTATION COMMAND

> Hai prompt dưới đây dùng để giao cho Codex/engineer thực thi. Mỗi prompt là một PR riêng.

---

### PROMPT A — Implement PR-01

```
Implement PR-01: AI Privacy & Policy Guard in D:\ZaloCRM-CorepViet.

Start from the reviewed HEAD and first verify git status. Preserve all pre-existing
untracked/user files. Do not change Prisma schema/migrations, frontend, prompts,
Knowledge content, Zalo listener core, docker-compose, provider/model selection,
or auto-reply enablement defaults.

Required implementation:

1. Add backend/src/modules/ai/ai-privacy-guard.ts.
   - Implement authorizeAiData() and a branded AiDataGrant.
   - Supported scopes must be explicit: conversation, crm_note, operator_text,
     and knowledge.
   - For conversation scope, verify orgId + conversationId.
   - sub nick: allow.
   - main nick, user-initiated: allow only owner + privacyUnlocked.
   - main nick, background: deny.
   - Missing context/query error: fail closed for AI.
   - Never accept a raw privacyAllowed boolean as authorization.

2. Add backend/src/modules/ai/ai-generation-executor.ts.
   - Move or encapsulate the low-level provider dispatch currently exposed as
     generateText() in ai-service.ts.
   - executeAiGeneration() must require a valid AiDataGrant.
   - Business modules must no longer import provider wrappers directly.
   - Preserve provider, model, prompt, max-token and output behavior.

3. Update all verified external generation paths:
   - ai-service.ts: reply, summary, sentiment, appointment parse, format-rich.
   - ai-routes.ts: manual reply/summary/sentiment privacy context and existing
     safe HTTP status behavior.
   - ai-auto-reply-service.ts.
   - ai-followup-service.ts and ai-followup-cron.ts.
   - ai-virtual-chat-service.ts and the virtual branch in chat-routes.ts.
   - customer-summary-service.ts.
   - knowledge/knowledge-service.ts.
   Explicitly inventory every executeAiGeneration caller in tests/review notes.

4. Add backend/src/modules/ai/ai-send-policy.ts.
   - Use a discriminated result: allow, needs_review, or block.
   - Auto-reply policy must preserve current sensitive input, sensitive/money
     output, and missing-source checks.
   - Run the policy unconditionally after generation and again after the delay.
   - aiAutoReplyFullAuto must not bypass the policy.
   - needs_review must save/emit the draft and return before zaloOps.sendMessage.
   - Follow-up must route its existing FORBIDDEN_FOLLOWUP_RE rule through the
     mandatory policy before Zalo send.
   - Do not add new intent/risk/scoring logic.

5. Confidence:
   - Keep Prisma/API compatibility and existing stored fields.
   - Remove hardcoded reply confidence 0.8 from every safety decision.
   - Do not add a new confidence algorithm or LLM judge.
   - Do not modify sentiment/appointment/entity confidence behavior.

6. Provider URL safety:
   - Add backend/src/modules/ai/ai-provider-url-policy.ts.
   - DO NOT modify backend/src/shared/utils/ssrf-guard.ts (it has a sync API
     that webhook and test code depends on; DNS resolution with 3s timeout
     goes in the NEW ai-provider-url-policy.ts instead. Promise.race only
     limits wait time, does not cancel OS DNS lookup).
   - Require HTTPS by default.
   - Reject malformed URL, URL userinfo, query/fragment in base URL, localhost,
     loopback, RFC1918, link-local, metadata endpoints, IPv6 loopback/ULA/link-local.
   - Resolve all A/AAAA results and reject if any is private/special.
   - Validate on setProviderBaseUrl and before credential-bearing use.
   - Set redirect:"manual" for Anthropic, Gemini, OpenAI-compatible,
     provider-model-list and embedding fetches; reject 3xx.
   - Support custom/self-host providers only by exact server-controlled origin
     allowlist documented in config/.env.example. Production must retain TLS.
   - Never log credentials or full sensitive response bodies.

7. Tests:
   - Add the full P01–P28 matrix from the implementation plan.
   - Use Vitest mocks only; no real DB, Zalo, LLM, webhook or external network.
   - Include virtual/customer-summary and DNS-private-host coverage.
   - Include a regression test proving confidence 0.8 cannot authorize a send.
   - Include a test proving needs_review produces zero Zalo send.
   - Include static coverage preventing direct low-level provider calls.

Verification:
- Run targeted unit/security tests.
- Run backend build/typecheck under Node 20.
- Inspect git diff and confirm no schema/migration/frontend/prompt/docker-compose changes.
- Report files changed, test results, residual risks and revert procedure.
- Do not commit, push, deploy, enable auto-reply or change production config unless
  separately authorized.
```

---

### PROMPT B — Implement PR-02

```
Implement PR-02: Opik Trace-only in D:\ZaloCRM-CorepViet.

Prerequisite:
- PR-01 AI Privacy & Policy Guard must already be merged/rebased.
- Verify the shared AiDataGrant, executeAiGeneration and mandatory send-policy
  boundaries before editing.
- Do not implement if PR-01 boundaries are absent.

Scope invariants:
OBSERVE, NOT CONTROL.
Opik must not be a policy engine, queue, orchestrator, source of truth or Zalo dependency.
Do not change Prisma/migrations, frontend, prompts, Knowledge, provider/model behavior,
auto-reply behavior, Zalo listener, Redis/BullMQ topology or docker-compose.

1. Dependency check:
   - Re-check the current official npm/GitHub metadata for the opik package.
   - Pin an exact Opik SDK version compatible with production Node 20.
   - Add an explicit compatible zod dependency required by the SDK peer contract.
   - Do not upgrade Node.
   - Review package-lock changes and transitive dependency/security impact.
   - Do not run opik-ts configure.

2. Config:
   Add centralized config and .env.example documentation for:
   OPIK_ENABLED=false
   OPIK_URL_OVERRIDE=
   OPIK_API_KEY=
   OPIK_WORKSPACE=
   OPIK_PROJECT_NAME=zalocrm
   OPIK_ENVIRONMENT=
   OPIK_SAMPLE_RATE=0
   OPIK_HASH_SECRET=
   OPIK_BATCH_DELAY_MS=300
   OPIK_FLUSH_TIMEOUT_MS=500
   OPIK_MAX_PENDING=1000
   OPIK_LOG_LEVEL=WARN

   OPIK_ENABLED=false must mean:
   - no dynamic import of opik;
   - no client initialization;
   - no timer/background exporter;
   - no network;
   - no flush.

   When enabled, missing/invalid URL or hash secret must disable exporting without
   failing CRM.

3. Add:
   backend/src/modules/ai/observability/ai-trace-contract.ts
   backend/src/modules/ai/observability/ai-trace-sanitizer.ts
   backend/src/modules/ai/observability/opik-exporter.ts
   backend/src/modules/ai/observability/ai-tracer.ts

4. Safe trace contract:
   Only allow schema_version, random trace_id, operation enum,
   organization_hash, optional conversation_hash/contact_hash, channel enum,
   provider, model, source_count, latency_ms, status enum, auto_sent and
   safe error_type enum.

   Omit—not fake—prompt_version, knowledge_version, intent, risk_level,
   confidence, input/output tokens, cost, human_reviewed and human_edited.

5. Privacy:
   - Construct a new allowlisted object; never spread a raw event.
   - HMAC-SHA256 organization/conversation/contact IDs using OPIK_HASH_SECRET
     and domain prefixes.
   - Never use plain SHA256 for customer identifiers.
   - Reject/drop prompt, response, conversation text, Knowledge content/title,
     customer name/phone/email/address/notes/metadata, Zalo/Facebook UID,
     sender identity, tokens, cookies, sessions, API keys, webhook secrets,
     provider URL, raw errors and stack traces.
   - Add a secret/high-entropy scanner and runtime schema validation.
   - Unknown fields must be dropped.
   - Validation failure must drop the entire event.

6. Non-blocking exporter:
   - Use an internal neutral tracing facade; business code must not import Opik types.
   - Lazy-load/initialize the SDK only after feature/config/sample gates pass.
   - Never await Opik network before AI response or Zalo send.
   - Bound pending work and drop safely when full.
   - Catch all synchronous and asynchronous exporter errors.
   - Do not add CRM-side retry.
   - Add bounded shutdown flush to app.ts with Promise.race using
     OPIK_FLUSH_TIMEOUT_MS.
   - Do not assume an undocumented TypeScript SDK request-timeout option.

7. Instrument real lifecycle only:
   Root names: crm.ai.<operation>.
   Real spans where the code exists:
   authorize_privacy, load_context, retrieve_knowledge, build_prompt,
   llm_generation, policy_evaluation, send_zalo.
   Do not create classify_intent, retrieve_business_facts, human_review or
   customer_outcome spans.

   Instrument executeAiGeneration for all generation calls.
   Add auto-reply/follow-up lifecycle statuses:
   privacy_denied, generated, provider_failed, needs_review, policy_blocked,
   auto_sent and send_failed.
   Do not send input/output fields to Opik.

8. Tests:
   Implement O01–O22 from the implementation plan plus:
   - sample-rate tests with injected RNG;
   - invalid hash/config tests;
   - unsafe Opik URL test;
   - max-pending/drop test;
   - bounded flush/flush-timeout tests;
   - provider/model validation;
   - serialized-payload canaries for phone, UID, bearer token and customer text;
   - proof that disabled mode never executes import("opik");
   - proof that tracing ON/OFF/failure leaves manual AI, auto-reply,
     follow-up and AI-disabled behavior identical.

Verification:
- Run targeted tests and backend build under Node 20.
- Confirm zero Prisma/migration/frontend/prompt/Knowledge/Zalo behavior diff.
- Confirm OPIK_ENABLED=false produces zero network.
- Report exact dependency versions, files changed, tests, runtime overhead,
  residual risks, kill switch and revert procedure.
- Do not enable Opik, modify production config, commit, push or deploy unless
  separately authorized.
```

---

## Review Notes (Post-Review Corrections)

Ba điểm đã được chỉnh sau review:

1. **`knowledge/knowledge-service.ts`** — ĐÃ CÓ trong diff plan (mục 6, dòng `knowledge-service.ts → ragAnswer`). Không cần bổ sung thêm.

2. **DNS resolution placement** — DNS resolution với timeout 3s phải đặt trong file MỚI `ai-provider-url-policy.ts`, KHÔNG sửa `ssrf-guard.ts`. Lý do kỹ thuật: `ssrf-guard.ts` có sync API (`assertSafeOutboundUrl()`), webhook và test code phụ thuộc vào nó. `Promise.race` chỉ giới hạn thời gian chờ, không cancel được OS DNS lookup — cần module async riêng.

3. **Confidence 0.85 trong `aiFormatRichText()`** — Giá trị này là HARDCODED/NON-AUTHORITATIVE: không được auto-send policy đọc, không nằm trong format-rich response, chỉ persist vào `AiSuggestion`. Chỉ cần test + documentation, KHÔNG cần code fix hay new scoring. Không nên nhóm chung với P1-03 severity.
