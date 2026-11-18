# Security

This document describes how the application is protected, what was actually tested, and what is **not** protected or **not** tested. It does not claim the application is "completely secure": no real application is. The threat analysis is in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

Report a vulnerability privately to the shop owner or the maintainer; do not open a public issue with exploit details.

## 1. Architecture in one picture

- **The perimeter is the database, not the website.** Anyone can read the public Supabase key from the browser and call the API directly, so every rule is enforced in PostgreSQL: Row Level Security, `EXECUTE` grants, constraints and triggers. The Next.js server adds validation messages and rate limits but is never the only protection.
- **No service-role key exists anywhere in this app.** Privileged work uses two narrower mechanisms:
  1. *Admins* act with their own signed-in session; RLS and the admin functions check `is_admin()` on every call.
  2. *Public writes* (chat, contact form, click tracking, login logging) are only callable by our server, which presents a **gateway key** (`GATEWAY_KEY`, sent as the `x-gateway-key` header; the database stores only its SHA-256 hash). Calls made straight to the Supabase API with only the public key are refused with `forbidden` before anything is written.
- The `private` schema (gateway key hash, rate-limit ledger, helper functions) is not exposed through the API and `anon`/`authenticated` have no privileges on it.

## 2. Protected assets

Admin accounts and sessions; customer contact details and messages; sales/revenue records and their history; prices and stock status; business settings; the gateway key; availability of the site and the database quota; uploaded images. See the threat model for details.

## 3. Authentication and sessions

| Control | Implementation |
|---|---|
| Password storage | Supabase Auth (bcrypt). The app never stores or logs passwords. |
| Who is an admin | A user must be listed in `public.admins` (managed with SQL only). Signed-in is **not** enough. |
| No public registration | There is no sign-up page. (See limitation L1: Supabase sign-ups should also be switched off.) |
| Password policy | At least 12 characters; common passwords, "common word + digits", simple sequences and the email name are rejected (`src/lib/password.ts`, unit tested). The real, enforced minimum is Supabase's own setting. |
| Login throttling | In-memory per-IP limit (8 per 10 min) **and** database throttle per visitor (12 per 10 min) and per account (20 per 10 min, hashed email), shared by all server instances. Generic error message. |
| Session lifetime | An admin session is valid for at most **12 hours** after the password was entered, read from the JWT `amr` claim (refreshing a token does not extend it). |
| Logout | Ends the current session. |
| Password change | Requires the current password; signs out all other sessions. |
| Password reset | Emailed one-time link (PKCE code exchange) to `/auth/callback`, destination allow-listed; always answers with the same message (no account discovery); throttled like login. |
| MFA | **Not implemented** (see L5). |

## 4. Authorization

- Deny by default: all tables have RLS enabled; privileges are revoked from `anon`/`authenticated` and re-granted explicitly, table by table and column by column (for example, admins can edit only `status` and `internal_notes` of an inquiry).
- Every admin page calls `requireAdmin()`; every admin server action calls the same check and returns an error instead of trusting hidden buttons. Ids and enums received by server actions are validated before use.
- Admin database functions (`record_sale`, `void_sale`, `set_product_status`, dashboard stats) have `EXECUTE` revoked from `anon` and re-check `is_admin()` inside.
- **Business rules in the database:** a product can only become *sold* through `record_sale()` (trigger blocks direct updates); a partial unique index makes a second active sale of a product impossible; products with sales cannot be deleted (`ON DELETE RESTRICT`); voiding keeps the sale row; revenue is computed from trusted rows.
- **IDOR:** visitors have no table access at all. A conversation is reachable only with its random 256-bit token (httpOnly cookie, hash stored). Tested with guessed and mangled tokens.

## 5. Database security

- RLS on every `public` table (verified on the live project; one advisor note, `admins` has RLS and no policy, is intentional: no API access).
- Every `SECURITY DEFINER` function pins `search_path = ''` and schema-qualifies names (checked by a test and on the live project).
- `anon` can execute exactly these functions (asserted by a test and checked live): `catalog_filter_options`, `chat_escalate`, `chat_get_messages`, `chat_post_bot_message`, `chat_post_visitor_message`, `chat_start`, `check_login_allowed`, `is_admin`, `log_security_event`, `submit_inquiry`, `track_contact_event`. All except `catalog_filter_options` and `is_admin` require the gateway key.
- Internal helpers (token lookup, triggers, rate limiter) are not executable by API roles.

## 6. Abuse and rate limiting (public endpoints)

Two layers; the database layer cannot be bypassed by skipping the website.

| Control | Limit |
|---|---|
| Direct API calls without the gateway key | Refused immediately, nothing written |
| New conversations | 6 per visitor per hour; 250 per hour overall |
| Chat messages | 12 per conversation per minute; 40 per visitor per 10 min; 1500 per hour overall; 300 per conversation; 2000 characters each |
| Contact form / escalation | 4 per visitor per 10 min; 3 per phone/email per 10 min; 60 per 10 min overall |
| Click tracking | 60 per visitor per minute; silently dropped beyond |
| Storage ceiling | New chats refused if the messages table passes ~60,000 rows |
| Retention | Bot-only chats are deleted after 3 days; the rate ledger after 1 day |
| Website layer | Per-IP in-memory limits, same-origin check on JSON endpoints, 8 KB body cap, honeypot field on the contact form |

"Visitor" = a salted hash of the IP supplied by the platform (`x-vercel-forwarded-for` / `x-real-ip`); the raw IP is never stored.

## 7. Input handling, XSS, headers

- All server inputs are validated (Zod in the app, constraints and checks in SQL). Queries are parameterised; search text is stripped of filter syntax.
- User text is only ever rendered as text by React. The single `dangerouslySetInnerHTML` is JSON-LD with `<` escaped.
- Headers on every page: `Content-Security-Policy` (scripts, styles and fonts from this site only; images and API/Realtime only to this site and your Supabase project; no framing, no objects, forms only to this site), `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Admin and API responses are `no-store`. `X-Powered-By` is removed.
- Redirects after login/reset use fixed or allow-listed paths only.

## 8. File uploads

Allowed: JPG, PNG, WebP, 5 MB (enforced by the storage bucket itself). Admin-only write access. The browser checks the real file signature; the server then **decodes and re-encodes every image to a fresh WebP under a server-generated name**, which removes EXIF/GPS data and any payload hidden in the file, rejects undecodable files and caps pixels (decompression bombs). The original is deleted on every path. SVG, HTML, JS and PHP are rejected by the bucket.

## 9. Secrets

Never committed: `.env*` is gitignored. `npm run security:scan` fails if an env file was ever committed, if a Supabase secret/service-role key or the gateway key appears in tracked files, git history or the browser bundle (the scanner was self-tested with planted leaks). The gateway module imports `server-only`, so importing it from client code breaks the build. All traffic is HTTPS in production (HSTS).

## 10. Chatbot

The chatbot is a deterministic function over public catalog data and owner-written text. It has no database handle and no write capability, cannot read sales, customers or admin data, and never invents specs, prices, availability or policies (unit tested). If an AI provider is added later it must go through `FallbackResponder` on the server with a restricted, read-only set of public tools and treat all customer text as untrusted; authorization must stay in the database.

## 11. Logging and monitoring

- **`audit_log`** (append-only through the API, admin-readable): product created/deleted/archived/restored, **price changes (old and new)**, sales recorded/voided, which settings fields changed (names only), admin accounts added/removed, with the acting admin.
- **`security_events`**: successful and failed admin logins, blocked attempts, non-admin sign-ins. Accounts appear as a short hash; no passwords, tokens or emails are logged.
- **Admin → Activity** shows both; the dashboard and Activity page warn after 5 failed/blocked sign-ins in 24 hours. Supabase's own logs (Auth, API, Postgres) remain available in its dashboard.

## 12. Dependencies

`npm ci` with a lockfile; few runtime dependencies (`next`, `react`, `@supabase/*`, `zod`, `sharp`, `server-only`). CI runs `npm audit` on production dependencies (blocking at high) and on everything (informational), and Dependabot proposes weekly updates. Current state: **0 known vulnerabilities in production dependencies.** 16 findings exist in development tooling (ESLint/Vitest toolchain) caused by a `picomatch` ReDoS (GHSA-fc5q-39xc-vjpf) for which **no patched version exists yet**; it only matters if an attacker controls glob patterns passed to the build tools, which cannot happen here, and none of it ships to production.

## 13. What was tested

| Layer | Tests | What it proves |
|---|---|---|
| SQL (PGlite, every migration applied) | 78 | RLS, grants, admin-only functions, gateway key (including fail-closed and "rejected calls write nothing"), rate limits, purge, seller-joins-stops-bot, audit log, security events, sales rules, search-path pinning, exact list of anon-executable functions, every private table closed to anon/non-admins |
| Unit | 62 | Chatbot never invents data, validation, password policy, image re-encoding (polyglot, EXIF, bombs), UUID guards, IP handling, same-origin and body-size helpers |
| Live API (real Supabase project, public key and real sign-ins) | 31 | Direct API refused without the gateway key; a **signed-in non-admin** cannot read, write, call admin functions or make itself admin; token isolation (IDOR); audit trail; bucket rejects scripts/SVG/oversized files; injection-style input |
| Browser end to end (Playwright, production build, real Supabase) | 37 | Admin flows; security headers and **zero CSP violations**; every admin URL redirects when signed out; reset-link open-redirect refused; cross-site/malformed/oversized requests refused; XSS payloads shown as text with no script run; polyglot upload served as clean WebP; **seller reply stops the bot**; chat and form spam stopped; brute-force throttled |
| Secrets | scanner + planted-leak self-test | No secrets in source, git history or browser bundle |

The live and browser suites ran against a **separate throwaway Supabase project**, not the shop's database. The SQL suite uses an in-process Postgres with stand-ins for Supabase's `auth`/storage schemas, so the live suites are what prove the real platform behaves the same.

## 14. Known limitations and residual risks (read this)

- **L1: Supabase sign-ups are open until you switch them off** (Authentication -> Sign In / Providers -> Email -> "Allow new users to sign up"). A stranger can create an `auth.users` row and trigger Auth emails; this cannot give them any access (every policy checks `is_admin()`, tested), but it can consume your free quota. This setting cannot be changed from code.
- **L2: A large distributed flood can still cause denial of service.** The global ceilings protect your database from filling up, but while an attack lasts they can also refuse real visitors. There is no CAPTCHA. Per-visitor limits rely on a trustworthy client IP, which is only guaranteed on Vercel; on other hosts only the global caps are reliable.
- **L3: Content-Security-Policy allows `'unsafe-inline'` scripts** (required by Next.js's inline bootstrap). It still blocks loading scripts from other hosts. A nonce-based policy is a possible hardening.
- **L4: Passwords:** the leaked-password check (HaveIBeenPwned) is a Supabase setting (Pro plan) and is off. The app enforces its own policy, but a weak password chosen elsewhere remains the most likely way in.
- **L5: No multi-factor authentication.** Supabase supports TOTP; it is not wired into the admin UI.
- **L6: Session expiry (12 h) is verified by reasoning and code review, not by an automated 12-hour test.**
- **L7: Password-reset email delivery is untested end to end** (Supabase's built-in SMTP only emails organisation members and is heavily limited; add a custom SMTP provider for production, and add your site URL to Authentication -> URL Configuration). The page, throttling, one-time code handling and redirect allow-list are tested.
- **L8: No push alerts.** Suspicious activity is shown in the dashboard and Activity page, not emailed.
- **L9: Visitor messages are personal data.** Bot-only chats are deleted after 3 days, but contact details in inquiries and seller chats are kept until you delete them. Add a privacy notice appropriate to your country's rules.
- **L10: Admin accounts are created with SQL**, and anyone with database owner access (SQL editor) can alter or delete audit rows; the audit log is append-only only through the API.
- **L11: Not independently penetration-tested.** This work used automated tests and review by its author. A third-party test is advisable before storing sensitive data at scale.
- **L12: The edge firewall in front of Supabase (Cloudflare) blocks some obvious attack strings. That is an extra layer we do not control and did not rely on.**
- **L13: Dev-tooling advisories (section 12)** are open because no fix is available upstream.

## 15. Required production configuration (checklist)

1. **Apply all migrations in order**, then store the gateway key hash (once per environment):
   ```bash
   node -e "const c=require('crypto');const k=c.randomBytes(32).toString('hex');console.log('GATEWAY_KEY='+k);console.log('hash='+c.createHash('sha256').update(k).digest('hex'))"
   ```
   ```sql
   insert into private.gateway_key (id, key_hash) values (1, decode('<hash from above>', 'hex'))
   on conflict (id) do update set key_hash = excluded.key_hash;
   ```
   Put `GATEWAY_KEY=<the key>` in Vercel (server-side only). Rotate by repeating both steps (chat/forms fail closed in between).
2. Vercel variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GATEWAY_KEY`, `NEXT_PUBLIC_SITE_URL`.
3. Supabase Auth: **disable sign-ups**; set the minimum password length to at least 12; enable leaked-password protection if your plan allows; set Site URL and redirect URLs to your domain; add a custom SMTP provider.
4. Create your admin account and add it to `public.admins`; use a strong, unique password (change it under Admin -> Account).
5. Deploy only over HTTPS on your own domain.
6. Run `npm run build && npm run security:scan` and `npm run security:audit` before releasing.

## 16. Final security report

**Issues found and fixed in this review**

1. *Chat spam could hurt the database*: limits were per conversation and one global cap, skippable by calling the API directly. Fixed with the gateway key, database-side per-visitor and global limits, size caps, retention and a storage ceiling.
2. *The chatbot kept answering after the seller joined a bot-only chat* (the bot was silenced only for "escalated" chats). Fixed in the database: a seller message marks the conversation human-handled; regression-tested in SQL, live and in the browser.
3. *Visitors could forge "automated" bot messages in their own chat.* Fixed: bot messages need the gateway key.
4. *Uploads were validated but stored as sent.* Fixed: server-side decode and re-encode to WebP, metadata stripped, pixel cap, server-chosen names.
5. *No security headers or CSP.* Added (production), with a test proving the site works under it.
6. *No audit trail or login monitoring.* Added audit log, security events, an Activity page and a dashboard alert.
7. *Login throttling was per server instance only; sessions never expired.* Added database-backed throttling (per visitor and per account) and a 12-hour session cap; logout and password change behaviour defined.
8. *No password reset or change flow, weak-password check missing.* Added both, with a policy that already caught a hole in its own first version (`password1234`).
9. *Server actions trusted ids/enums sent by the browser.* Added UUID and enum guards to every action.
10. *Open-redirect and cross-site risks on new endpoints.* Allow-listed redirects; same-origin check and body-size caps on JSON endpoints.
11. *A path-matching regex had an unescaped dot* (found by a test, fixed earlier in the project).

**Tests performed:** section 13. All pass at the time of writing (171 Vitest + 37 Playwright, plus the secret scan).

**Remaining risks:** section 14 (open sign-ups, distributed flooding, CSP `unsafe-inline`, no MFA, no email alerts, reset email untested, no independent pen test).

**Recommended next steps:** disable sign-ups; add MFA (Supabase TOTP); custom SMTP and email alerts for repeated failed logins; a CAPTCHA (for example Cloudflare Turnstile) on the contact form and chat if spam appears; a nonce-based CSP; a privacy policy page; a periodic dependency review; an external penetration test before handling sensitive data at scale.
