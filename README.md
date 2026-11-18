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

The schema lives in [`supabase/migrations`](supabase/migrations). Apply the four files **in order**:

| File | Contents |
|---|---|
| `20261118100001_core_schema.sql` | Tables, enums, indexes, triggers (status guard + history) |
| `20261118100002_rls_and_grants.sql` | Row Level Security and explicit grants |
| `20261118100003_functions.sql` | Sales, dashboard, inquiry, chat and click-tracking functions |
| `20261118100004_storage_realtime.sql` | `site-media` bucket (5 MB, JPG/PNG/WebP) and Realtime for the inbox |

Option A, no tools needed: open **SQL Editor** in the Supabase dashboard, paste each file in order and run it.
Option B, Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.

### 3. Create your admin account

1. **Authentication → Users → Add user → Create new user**: enter your email and a strong password (tick *Auto Confirm User*).
2. In **SQL Editor** run (with your email):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

3. Sign in at `/admin/login`.

There is intentionally **no sign-up page**. Being logged in is not enough: only users listed in `public.admins` can read or change anything private.

### 4. Disable public sign-ups (important)

**Authentication → Sign In / Providers → Email → turn off "Allow new users to sign up".**
The API accepts anyone with the public key to attempt sign-ups; turning this off removes that door. (Even if left on, a stranger's account has no access: every admin policy checks `is_admin()`.)

### 5. First-time setup in the dashboard

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
| `npm run check` | typecheck + lint + tests + build |

## Testing

- **Unit / logic** (`tests/unit`): chatbot (budget, availability, comparison, "never invents data"), validation, price formatting, contact links, image signature checks, rate limiting.
- **Database** (`tests/db`): applies the real migration files to PGlite and verifies RLS (anon and non-admin users are blocked), admin-only functions, one active sale per product, status guard + history, voiding sales, revenue maths, inquiry validation and rate limits, chat tokens and escalation, bucket limits. Runs in CI with no secrets.
- **End-to-end** (`e2e`): Playwright drives a real browser through the public site, admin login/logout, product creation with a photo, reserving, inquiry → admin, chat → admin reply → visitor, recording a sale, and the duplicate-sale guard. It needs a **test** Supabase project: apply the migrations, create an admin there, and set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` in `.env.local`. Do not point it at your live shop (it creates records prefixed `E2E`).

  ```bash
  npx playwright install chromium
  npm run test:e2e
  ```

  Without any Supabase variables, the database-free part still runs (layout on desktop and phone, no horizontal scroll, form validation, sitemap/robots): `npx playwright test e2e/public.spec.ts --grep-invert "chat widget"`. Admin tests are skipped unless the `E2E_*` variables are set; the admin tests sign in once and reuse the session.

  **Cleanup.** The e2e run voids its sale and *archives* its PC (a PC that ever had a sale can't be deleted, by design). It also leaves a few `E2E ...` inquiries, a chat conversation and click events behind. On the test project you can remove them in the SQL Editor:

  ```sql
  delete from public.inquiries where name like 'E2E %';
  delete from public.conversations where visitor_name like 'E2E %';
  delete from public.sales where product_name like 'E2E %';
  delete from public.products where name like 'E2E %';
  ```

## GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci` (cached), type check, lint, tests (including the SQL tests) and a production build. It needs **no secrets**: the build works without Supabase variables because database pages render on request.

## Deployment (Vercel)

1. Push this repository to GitHub and **Import** it in Vercel (framework: Next.js; defaults are fine).
2. Add environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = your public URL, e.g. `https://yourshop.com` (no trailing slash)
3. Deploy. Then in Supabase **Authentication → URL Configuration**, set *Site URL* to the same address.
4. **Domain**: Vercel project → Settings → Domains → add your domain and follow the DNS instructions.

Redeploy after changing any `NEXT_PUBLIC_*` variable (they are baked in at build time).

## Security model (short)

- Row Level Security on every table. Public visitors can read only published data (visible products, settings, published FAQ); everything else is admin-only through `is_admin()`.
- All admin operations check the admin on the server (`requireAdmin()`); hiding a button is never the protection.
- Admin functions (`record_sale`, `void_sale`, `set_product_status`, dashboard stats) have `EXECUTE` revoked from `anon` and re-check `is_admin()`.
- Public forms and chat go through `SECURITY DEFINER` functions that validate input and rate-limit **inside the database**, so calling the API directly cannot bypass the limits.
- Chat conversations are protected by a random token held in an `httpOnly` cookie; only its SHA-256 hash is stored.
- A product can only become *sold* through `record_sale()`; direct status edits are rejected. A partial unique index makes a second active sale of the same product impossible. Products with sales cannot be deleted (archive instead).
- Uploads: 5 MB / JPG-PNG-WebP limits are set on the storage bucket itself, only admins can write, and the server re-checks the file's real signature.
- No service-role key anywhere in the app.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the schema and decisions.

## Known limitations

- **WhatsApp / Messenger conversations are invisible to the site.** The dashboard records *button clicks* (labelled as such), not messages. Messenger links cannot prefill text, so the site copies the message to the clipboard instead.
- **Chatbot replies are stored through the public API** so they appear in the inbox history; a technically skilled visitor could write fake "automated" messages into *their own* conversation. The inbox labels them "Automated reply", and only admins can post as the seller.
- The chatbot understands English and a few French keywords; it is rule-based, not an AI. `FallbackResponder` in `src/lib/chatbot/types.ts` is the plug-in point if you later add an AI provider (server-side key, optional, with this engine as the fallback).
- The chat shows seller replies by polling every 6 seconds while open (the admin inbox uses Realtime).
- The in-memory per-IP rate limiter protects a single server instance only; the database limits are the real guarantee.
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
