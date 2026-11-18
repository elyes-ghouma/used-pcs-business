# Threat model

Method: identify what is worth protecting, who might attack it, where they can reach it, and what stops them. Each mitigation says how it was **verified** (see `SECURITY.md` for the test inventory). "Untested" means reasoned about but not demonstrated.

## 1. Assets

| Asset | Why it matters | Where it lives |
|---|---|---|
| Admin account(s) and sessions | Full control of the shop | Supabase Auth (`auth.users`, bcrypt hash), session cookies |
| Customer contact details and messages | Private personal data | `inquiries`, `conversations`, `messages` |
| Sales and revenue records | Private business data, historical integrity | `sales`, `product_status_history`, `audit_log` |
| Prices and stock status | Direct business impact if tampered with | `products` |
| Business settings (phones, links, policies) | Customers act on them (phishing target) | `business_settings` |
| The gateway key | Unlocks the public write endpoints | `GATEWAY_KEY` env var (hash in `private.gateway_key`) |
| Availability of the site and chat | The shop's storefront; also the free database quota | Vercel + Supabase |
| Uploaded images | Served to every visitor | Supabase Storage `site-media` |

## 2. Attackers

1. **Anonymous visitor / script kiddie**: has the public site and the public Supabase key (visible in the browser by design).
2. **Spammer / abuser**: wants to fill the inbox, exhaust quota, or degrade the site.
3. **Signed-up non-admin**: anyone can create a Supabase account with the public key while sign-ups are on.
4. **Credential guesser**: targets the admin login (brute force, credential stuffing, phishing, password reuse).
5. **Malicious or compromised admin browser/session**: stolen cookie, XSS.
6. **Supply-chain attacker**: a malicious dependency or compromised CI.
7. **Curious insider / future developer**: mistakes that leak secrets.

## 3. Entry points

| Entry point | Reachable by | Notes |
|---|---|---|
| Public pages and catalog | Anyone | Read-only, RLS-filtered |
| `POST /api/chat`, `/api/chat/escalate`, `/api/track`, inquiry server action | Anyone | Go through the gateway; rate limited in two layers |
| Supabase REST/RPC API with the public key | Anyone | The real perimeter: protected by RLS, grants, and the gateway key |
| Supabase Auth endpoints | Anyone | Sign-up, sign-in, reset; Supabase's own limits |
| `/admin/*`, server actions | Signed-in admins | Re-checked on the server every time |
| Storage `site-media` | Public read; admin write | Bucket-level type/size limits |
| Admin browser to Storage (direct upload) | Admins | RLS-gated, then re-encoded server-side |
| `/auth/callback` (reset email link) | Anyone with a valid one-time code | Allow-listed destinations only |
| GitHub repo / CI / Vercel | Maintainers | Secrets scan, least-privilege workflow |

## 4. Trust boundaries

```
 Browser (untrusted) ──► Next.js server (trusted code, holds GATEWAY_KEY) ──► Supabase Postgres (RLS + functions)
        │                                                                          ▲
        └──────────── direct API calls with the public key ────────────────────────┘
                      (untrusted: must be safe on their own)
```

The key design rule: **the browser and anyone with the public key are untrusted, and the database enforces the rules itself.** The Next.js server adds convenience (validation messages, per-IP limits) but is never the only protection.

## 5. Sensitive operations

Record / void a sale; change a price or stock status; delete/archive a product; edit settings; read customers' messages; reply as the seller; create admin accounts; upload files; change a password; start a conversation / post a message (abuse target).

## 6. Attack scenarios and mitigations

| # | Scenario | Mitigation | Verified by |
|---|---|---|---|
| 1 | Visitor calls `rpc/record_sale`, `void_sale`, dashboard stats directly | `EXECUTE` revoked from `anon`; function re-checks `is_admin()` | SQL test; live test (anon and non-admin) |
| 2 | Visitor writes `products.price` / marks a PC sold with the public key | RLS: only `is_admin()`; status changes only via functions (trigger) | SQL + live tests |
| 3 | Signed-up non-admin tries everything an admin can do | Policies check `is_admin()`, never just "authenticated" | Live test as a real non-admin user; e2e login rejection |
| 4 | Anyone reads other customers' conversations (IDOR) | No table access for visitors; random 256-bit token per conversation, only its hash stored | Live test (token isolation, guessed/mangled tokens) |
| 5 | Script floods chat/inquiries to fill the database or hide real leads | Gateway key (direct calls refused before any write); per-visitor and global DB caps; per-conversation caps; purge of stale bot-only chats; storage ceiling | SQL tests; live test; e2e (35 spam messages -> 12 stored) |
| 6 | Attacker forges "automated" or "seller" messages | Bot messages need the gateway key; `sender='admin'` only via admin RLS | SQL + live + e2e |
| 7 | Brute-force / credential stuffing at `/admin/login` | In-memory per-IP limit + DB throttle per visitor and per account (shared across instances); generic error; session lifetime | e2e throttle test |
| 8 | Stored XSS through inquiries, chat, product text, notes | React escapes all text; no `dangerouslySetInnerHTML` except JSON-LD (escaped); CSP | e2e (payloads rendered as text, no script runs, no dialogs) |
| 9 | SQL injection via catalog filters/search | Parameterised PostgREST/RPC calls; search terms sanitised; DB constraints | Unit + live + e2e |
| 10 | Malicious upload (script, SVG, polyglot, EXIF, decompression bomb) | Bucket MIME/size limits, magic-byte check, server decode and re-encode to WebP under a server-generated name, pixel cap | Live (bucket), unit (sharp), e2e (polyglot -> clean WebP) |
| 11 | CSRF / cross-site posting | Server actions use Next's Origin check; JSON endpoints check `Origin`; cookies `SameSite=Lax` | e2e (cross-site 403) |
| 12 | Open redirect via the reset link | Destination allow-list | e2e |
| 13 | Secrets leak to the browser or git | `server-only` gateway module; no service-role key used anywhere; secret scanner (source, history, bundle) | Scanner self-tested; CI step |
| 14 | Clickjacking, MIME sniffing, downgrade | `X-Frame-Options`, `frame-ancestors 'none'`, `nosniff`, HSTS | e2e header checks |
| 15 | Double sale / silent history rewrite | Row lock + partial unique index; `ON DELETE RESTRICT`; voiding keeps the row; audit log append-only | SQL + live tests |
| 16 | Compromised admin session | 12-hour lifetime; logout ends the session; password change signs out other devices | e2e sign-out; session expiry **untested** (needs a 12 h wait) |
| 17 | Chatbot abused to reveal data or change state | The bot is a pure function over public catalog data; it has no database handle; it cannot write | Unit tests (never invents data); code review |
| 18 | Malicious dependency | `npm audit` in CI (production blocking), Dependabot, lockfile, few dependencies | CI |
| 19 | Distributed flood from many IPs exhausts the global caps | Global ceilings protect storage; real visitors may be refused while an attack lasts | **Residual risk** (see SECURITY.md) |
| 20 | Admin password phished or reused | MFA **not implemented**; strong-password policy; leaked-password check is an owner-side Auth setting | **Residual risk** |
