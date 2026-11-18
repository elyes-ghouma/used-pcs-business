# Used Gaming PCs: storefront and admin dashboard

A complete website for a business that sells used gaming PCs and components.

- **Public website**: homepage, searchable catalog, shareable product pages, contact form, floating chat (database-powered chatbot + contact the seller).
- **Admin dashboard** (`/admin`): products and photos, stock status, manual sales records, inquiries, chat inbox with replies, and every business setting (name, logo, contacts, currency, policies, FAQ).
- **No online payments.** Customers contact the seller; the owner records finished sales in the dashboard.

Stack: Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase (PostgreSQL, Auth, Storage, Realtime), Zod, Vitest (with PGlite for SQL tests), Playwright.

## What works immediately vs. what needs configuration

| Works as soon as Supabase is connected | Needs an extra step from the owner |
|---|---|
| Everything in the dashboard, catalog, product pages, inquiries, sales, inbox, chatbot | Create the admin account (below) |
| Photo uploads (bucket and policies are created by the migrations) | Disable public sign-ups in Supabase Auth (below) |
| Contact buttons | Fill in phone / WhatsApp / Messenger in **Settings**; a button only appears when its field is filled |
| | Set `NEXT_PUBLIC_SITE_URL` in production (share previews, sitemap) |
| | Optional: custom domain |

No AI service is used. The chatbot answers from your database only. It never invents specs, prices, availability, warranty or delivery terms; when something is missing it says so and offers the seller.

## Quick start (local)

Requirements: Node.js 20.19+ (24 recommended), a free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env.local     # then fill in the Supabase URL and publishable key
npm run dev                    # http://localhost:3000
```

### 1. Supabase project

1. Create a project at supabase.com (the free plan is enough). Pick a region close to your customers.
2. **Project Settings → API**: copy the *Project URL* and the *publishable (anon)* key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   The `service_role` / secret key is **not used** by this app. Never put it in the project.

### 2. Database migrations

The schema lives in [`supabase/migrations`](supabase/migrations). Apply the seven files **in order**:

| File | Contents |
|---|---|
| `20261118100001_core_schema.sql` | Tables, enums, indexes, triggers (status guard + history) |
| `20261118100002_rls_and_grants.sql` | Row Level Security and explicit grants |
| `20261118100003_functions.sql` | Sales, dashboard, inquiry, chat and click-tracking functions |
| `20261118100004_storage_realtime.sql` | `site-media` bucket (5 MB, JPG/PNG/WebP) and Realtime for the inbox |
| `20261118110000_fk_indexes.sql` | Foreign-key indexes (performance advisor) |
| `20261118120000_private_schema.sql` | Private schema: gateway key hash, rate-limit ledger, helpers (not exposed through the API) |
| `20261118120100_gateway_limits_audit.sql` | Gateway key required for public writes, database-side rate limits and retention, seller-joins-stops-bot, audit log, security events |

Option A, no tools needed: open **SQL Editor** in the Supabase dashboard, paste each file in order and run it.
Option B, Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.

### 3. Security configuration (required, once)

Chat, the contact form and login logging only work for requests that present a server-only **gateway key**. Without it they fail closed (a warning banner appears). Generate the key and store only its hash in the database:

```bash
node -e "const c=require('crypto');const k=c.randomBytes(32).toString('hex');console.log('GATEWAY_KEY='+k);console.log('hash='+c.createHash('sha256').update(k).digest('hex'))"
```

1. Put `GATEWAY_KEY=<the key>` in `.env.local` (and in Vercel, as a normal server-side variable, **never** `NEXT_PUBLIC_`).
2. In the SQL Editor run, with the hash printed above:

   ```sql
   insert into private.gateway_key (id, key_hash) values (1, decode('<hash>', 'hex'))
   on conflict (id) do update set key_hash = excluded.key_hash;
   ```

Rotate by repeating both steps. Full checklist: [`SECURITY.md`](SECURITY.md) section 15.

### 4. Create your admin account

1. **Authentication → Users → Add user → Create new user**: enter your email and a strong password (tick *Auto Confirm User*).
2. In **SQL Editor** run (with your email):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

3. Sign in at `/admin/login`. Use a strong, unique password (at least 12 characters); you can change it under **Admin → Account**, and reset it by email from the login page (needs email delivery set up in Supabase, see `SECURITY.md` L7).

There is intentionally **no sign-up page**. Being logged in is not enough: only users listed in `public.admins` can read or change anything private.

### 5. Disable public sign-ups (important)

**Authentication → Sign In / Providers → Email → turn off "Allow new users to sign up".**
The API accepts anyone with the public key to attempt sign-ups; turning this off removes that door. (Even if left on, a stranger's account has no access: every admin policy checks `is_admin()`.)

### 6. First-time setup in the dashboard

1. **Settings**: business name, contacts (phone, WhatsApp number in international format, Messenger link), location, working hours, currency (default `TND`), delivery / payment / warranty text, FAQ.
2. **Products → Add a PC**, save, then add photos.

The catalog starts empty, with no demo data. Sections such as *Why buy from us* and *Testimonials* stay hidden until you add real content.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit tests + SQL tests (all migrations run in an in-process Postgres) |
| `npm run test:e2e` | Playwright browser tests (needs a Supabase test project, see below) |
| `npm run test:live` | Live API security tests against a **test** Supabase project (see Testing) |
| `npm run security:scan` | Fails if secrets are in the source, git history or the browser bundle (run after `npm run build`) |
| `npm run security:audit` | Dependency vulnerability audit (high and above) |
| `npm run check` | typecheck + lint + tests + build |

## Testing

- **Unit / logic** (`tests/unit`): chatbot (budget, availability, comparison, "never invents data"), validation, price formatting, contact links, image signature checks, rate limiting, **password policy, image re-encoding (script payloads, EXIF, decompression bombs), UUID guards, IP and same-origin helpers**.
- **Database** (`tests/db`): applies the real migration files to PGlite and verifies RLS (anon and non-admin users are blocked), admin-only functions, **the gateway key (calls without it are refused and write nothing; fail-closed)**, **database rate limits, retention and purge**, **seller-joins-stops-bot**, **audit log and security events**, one active sale per product, status guard + history, voiding sales, revenue maths, chat tokens and escalation, bucket limits, search-path pinning and the exact list of anon-executable functions. Runs in CI with no secrets.
- **Live API tests** (`tests/integration/live.test.ts`, `npm run test:live`): the same security rules checked through the real Supabase API with the public key and real sign-ins as an admin **and as a signed-in non-admin** (RLS, admin-only functions, gateway key, token isolation, audit trail, sale lifecycle, storage limits, injection-style input). They skip themselves unless the test-project variables are set, so CI is unaffected.
- **End-to-end** (`e2e`): Playwright drives a real browser through the public site, admin login/logout, product creation with a photo, reserving, inquiry → admin, chat → admin reply → visitor, recording a sale, and the duplicate-sale guard. Security specs also cover headers/CSP, signed-out access to every admin page, the reset-link redirect, cross-site and oversized requests, XSS payloads, malicious uploads, the chat bot going quiet after the seller joins, spam limits and login throttling. It needs a **throwaway test** Supabase project (never the live shop): apply all migrations, store a gateway key hash there, create an admin and a non-admin user, and put the project URL, publishable key, `GATEWAY_KEY` and `E2E_ADMIN_*` / `E2E_NONADMIN_*` in **`.env.test.local`** (gitignored; the test runners use it in preference to `.env.local`). The login-throttle spec runs last and leaves a 10-minute lockout: wait 10 minutes (or `delete from private.rate_events;` on the test project) before running the suite again.

  ```bash
  npx playwright install chromium
  npm run test:e2e
  ```

  To create the test admin on a **test** project (SQL Editor; pick your own password, and delete this user when you are done):

  ```sql
  do $$
  declare uid uuid := gen_random_uuid();
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'e2e-admin@example.test',
      extensions.crypt('CHOOSE-A-PASSWORD', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'e2e-admin@example.test', 'email_verified', true), 'email', now(), now(), now());
    insert into public.admins (user_id) values (uid);
  end $$;
  ```

  Without any Supabase variables, the database-free part still runs (layout on desktop and phone, no horizontal scroll, form validation, sitemap/robots): `npx playwright test e2e/public.spec.ts --grep-invert "chat widget"`. Admin tests are skipped unless the `E2E_*` variables are set; the admin tests sign in once and reuse the session.

  **Cleanup.** The e2e run voids its sale and *archives* its PC (a PC that ever had a sale can't be deleted, by design). It also leaves a few `E2E ...`/`SEC ...` inquiries, chat conversations and click events behind. On the test project you can remove everything in the SQL Editor:

  ```sql
  delete from private.rate_events;
  delete from public.inquiries; delete from public.conversations; delete from public.contact_events;
  delete from public.sales; delete from public.products; delete from public.security_events;
  ```

## GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci` (cached), type check, lint, tests (unit, security and SQL), a production build, the **secret scan** (source, full git history, browser bundle) and a **dependency audit** (production dependencies must have no high-severity findings). It needs **no secrets**: the build works without Supabase variables because database pages render on request. Dependabot proposes weekly dependency updates.

## Deployment (Vercel)

1. Push this repository to GitHub and **Import** it in Vercel (framework: Next.js; defaults are fine).
2. Add environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `GATEWAY_KEY` = the server-only key from step 3 (without it chat and the contact form are switched off)
   - `NEXT_PUBLIC_SITE_URL` = your public URL, e.g. `https://yourshop.com` (no trailing slash)
3. Deploy. Then in Supabase **Authentication → URL Configuration**, set *Site URL* to the same address.
4. **Domain**: Vercel project → Settings → Domains → add your domain and follow the DNS instructions.

Redeploy after changing any `NEXT_PUBLIC_*` variable (they are baked in at build time).

## Security

The application treats the browser and the public Supabase key as untrusted: every rule is enforced in the database (RLS, grants, constraints, triggers), public write endpoints need a server-only gateway key and are rate limited in the database, uploads are re-encoded, all admin actions are re-authorised on the server and audited. **Read [`SECURITY.md`](SECURITY.md)** for the architecture, what was tested, the open risks and the production checklist, and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) for the threat model. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the schema and decisions.

## Known limitations

- **WhatsApp / Messenger conversations are invisible to the site.** The dashboard records *button clicks* (labelled as such), not messages. Messenger links cannot prefill text, so the site copies the message to the clipboard instead.
- **Spam protection is strong but not absolute**: there is no CAPTCHA, and a large flood from many addresses can make the database refuse real visitors for a while (see `SECURITY.md` L2).
- The chatbot understands English and a few French keywords; it is rule-based, not an AI. `FallbackResponder` in `src/lib/chatbot/types.ts` is the plug-in point if you later add an AI provider (server-side key, optional, with this engine as the fallback).
- The chat shows seller replies by polling every 6 seconds while open (the admin inbox uses Realtime).
- The in-memory per-IP rate limiter protects a single server instance only; the database limits are the real guarantee.
- Bot-only chats are deleted after 3 days. Conversations the seller took part in are kept until you delete them.
- The website does not say whether the seller is online. It shows your working hours only if you enter them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Banner "Supabase is not configured" | `.env.local` missing or not reloaded: restart `npm run dev`. |
| Admin login says "does not have admin access" | Run the `insert into public.admins ...` SQL from step 3 for that user. |
| Login says "Incorrect email or password" for a user created in the dashboard | Make sure *Auto Confirm User* was ticked, or confirm the email. |
| Photo upload fails | Migration 4 not applied (no `site-media` bucket), or the user is not in `public.admins`. |
| Product images do not render | `NEXT_PUBLIC_SUPABASE_URL` must be set at **build** time (used by `next/image` host config). Redeploy. |
| "status_change_requires_function" error in SQL | By design: use `set_product_status()` / `record_sale()` / `void_sale()`. |
| Cannot delete a PC | It has recorded sales. Archive it instead. |
| Chat inbox shows "Connecting to live updates" | Realtime is blocked or migration 4 not applied; the inbox still refreshes every 20 s. |
| Banner "GATEWAY_KEY is missing" / chat or contact form says it is unavailable | Add `GATEWAY_KEY` to `.env.local` / Vercel **and** store its hash in the database (section 3), then restart. |
| Chat says "Too many requests" | A visitor limit was hit (by design). Limits reset after 10 minutes to 1 hour. |
| Admin login says "Too many sign-in attempts" | Throttle after repeated failures; wait 10 minutes. |
| Build error about fonts | The build downloads Google Fonts: it needs internet access. |

## Project layout

```
src/app/(site)        public pages (home, catalog, /pcs/[slug], contact) and the inquiry action
src/app/admin         login, dashboard pages (panel), server actions
src/app/api           chat, chat/escalate, track
src/components        UI (chat widget, forms, product card, admin screens)
src/lib               data access, validation, chatbot engine, helpers
supabase/migrations   database schema, RLS, functions, storage
tests/                unit tests and SQL tests;  e2e/ Playwright
```
