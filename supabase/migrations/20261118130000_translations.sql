-- French (and future languages) for owner-written content.
-- The main text stays in the existing columns; a translation is optional and lives in `translations`:
--   { "fr": { "description": "...", ... } }
-- Constrained to a JSON object of bounded size so it cannot be used to stuff the database.
-- Existing grants and RLS are table-level, so the new columns are covered by them already.

alter table public.business_settings
  add column translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object' and char_length(translations::text) <= 24000),
  add column default_locale text not null default 'en'
    check (default_locale in ('en', 'fr'));

alter table public.products
  add column translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object' and char_length(translations::text) <= 24000);

alter table public.faqs
  add column translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object' and char_length(translations::text) <= 8000);

alter table public.testimonials
  add column translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(translations) = 'object' and char_length(translations::text) <= 4000);
