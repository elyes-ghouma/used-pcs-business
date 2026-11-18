-- Core schema: enums, tables, indexes, triggers.
-- Security (RLS, grants) lives in the next migration; RPCs in the one after.

-- Lock down default privileges BEFORE creating anything: nothing is exposed
-- to anon/authenticated unless a migration grants it explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create type public.product_status as enum ('available', 'reserved', 'sold');
create type public.inquiry_status as enum ('new', 'contacted', 'negotiating', 'converted', 'closed');
create type public.conversation_status as enum ('open', 'resolved');
create type public.message_sender as enum ('visitor', 'bot', 'admin');

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Used by every RLS policy. SECURITY DEFINER so it can read `admins` even
-- though that table is not readable by regular users.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- settings (single row)
create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Used Gaming PCs' check (char_length(business_name) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 160),
  description text not null default '' check (char_length(description) <= 1000),
  hero_headline text not null default 'Tested used gaming PCs' check (char_length(hero_headline) <= 120),
  hero_subheadline text not null default '' check (char_length(hero_subheadline) <= 300),
  logo_path text,
  phone text not null default '' check (char_length(phone) <= 30),
  whatsapp_number text not null default '' check (char_length(whatsapp_number) <= 30),
  facebook_url text not null default '' check (char_length(facebook_url) <= 300),
  messenger_url text not null default '' check (char_length(messenger_url) <= 300),
  instagram_url text not null default '' check (char_length(instagram_url) <= 300),
  location text not null default '' check (char_length(location) <= 300),
  working_hours text not null default '' check (char_length(working_hours) <= 500),
  currency text not null default 'TND' check (currency ~ '^[A-Z]{3}$'),
  delivery_info text not null default '' check (char_length(delivery_info) <= 2000),
  payment_methods text not null default '' check (char_length(payment_methods) <= 1000),
  warranty_policy text not null default '' check (char_length(warranty_policy) <= 2000),
  chatbot_welcome text not null default 'Hi! I can help you find a PC from the current stock. Tell me your budget or what you want to play.' check (char_length(chatbot_welcome) <= 500),
  show_sold_products boolean not null default false,
  -- [{ "title": "...", "description": "..." }] — owner-written selling points, empty until configured
  highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 8),
  -- [{ "title": "...", "description": "..." }] — how a purchase works (direct contact, no online payment)
  how_to_buy jsonb not null default '[
    {"title":"Pick a PC","description":"Browse the catalog and open the one you like."},
    {"title":"Contact the seller","description":"Message or call the seller to check availability and ask questions."},
    {"title":"Arrange payment and delivery","description":"Payment and delivery are agreed directly with the seller. There is no online checkout."}
  ]'::jsonb check (jsonb_typeof(how_to_buy) = 'array' and jsonb_array_length(how_to_buy) <= 8),
  updated_at timestamptz not null default now()
);
insert into public.business_settings (id) values (1);
create trigger business_settings_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 3 and 200),
  answer text not null check (char_length(answer) between 1 and 2000),
  keywords text not null default '' check (char_length(keywords) <= 300),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 3 and 600),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  name text not null check (char_length(name) between 2 and 160),
  price numeric(12, 3) not null check (price >= 0),
  description text not null default '' check (char_length(description) <= 5000),
  cpu text not null default '',
  gpu text not null default '',
  motherboard text not null default '',
  ram text not null default '',
  storage text not null default '',
  psu text not null default '',
  case_name text not null default '',
  cooling text not null default '',
  os text not null default '',
  -- [{ "label": "...", "value": "..." }] for anything else (monitor, keyboard, ...)
  extra_specs jsonb not null default '[]'::jsonb check (jsonb_typeof(extra_specs) = 'array' and jsonb_array_length(extra_specs) <= 20),
  accessories text not null default '',
  condition text not null default '',
  testing_info text not null default '',
  warranty_info text not null default '',
  status public.product_status not null default 'available',
  is_featured boolean not null default false,
  is_archived boolean not null default false,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_text_len check (
    char_length(cpu) <= 120 and char_length(gpu) <= 120 and char_length(motherboard) <= 120
    and char_length(ram) <= 120 and char_length(storage) <= 120 and char_length(psu) <= 120
    and char_length(case_name) <= 120 and char_length(cooling) <= 120 and char_length(os) <= 120
    and char_length(accessories) <= 1000 and char_length(condition) <= 500
    and char_length(testing_info) <= 2000 and char_length(warranty_info) <= 1000
  )
);
create index products_listing_idx on public.products (is_archived, status, created_at desc);
create index products_featured_idx on public.products (created_at desc) where is_featured and not is_archived;
create index products_price_idx on public.products (price);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null unique,
  position integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, position);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

create table public.product_status_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  from_status public.product_status,
  to_status public.product_status not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index product_status_history_product_idx on public.product_status_history (product_id, created_at desc);

-- Status can only change through set_product_status / record_sale / void_sale,
-- which set the `app.status_via_fn` flag. Direct UPDATEs (even by an admin) are refused,
-- so a product can never become "sold" without a sale row.
create function public.guard_product_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  via_fn boolean := coalesce(current_setting('app.status_via_fn', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status = 'sold' and not via_fn then
      raise exception 'status_change_requires_function' using errcode = 'P0001';
    end if;
  elsif new.status is distinct from old.status then
    if not via_fn then
      raise exception 'status_change_requires_function' using errcode = 'P0001';
    end if;
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;
create trigger products_guard_status before insert or update of status on public.products
  for each row execute function public.guard_product_status();

create function public.log_product_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.product_status_history (product_id, from_status, to_status, note, changed_by)
    values (new.id, null, new.status, 'Product created', (select auth.uid()));
  elsif new.status is distinct from old.status then
    insert into public.product_status_history (product_id, from_status, to_status, note, changed_by)
    values (new.id, old.status, new.status, nullif(current_setting('app.status_note', true), ''), (select auth.uid()));
  end if;
  return null;
end;
$$;
create trigger products_log_status after insert or update of status on public.products
  for each row execute function public.log_product_status();

-- ---------------------------------------------------------------- sales
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: a product with sales can never be hard-deleted (archive it instead).
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  listed_price numeric(12, 3) not null,
  sale_price numeric(12, 3) not null check (sale_price >= 0),
  sold_at timestamptz not null default now(),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  customer_phone text not null default '' check (char_length(customer_phone) <= 40),
  customer_email text not null default '' check (char_length(customer_email) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  inquiry_id uuid,
  is_voided boolean not null default false,
  voided_at timestamptz,
  void_reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
-- The same product cannot have two active sales.
create unique index sales_one_active_per_product on public.sales (product_id) where not is_voided;
create index sales_sold_at_idx on public.sales (sold_at desc);

-- ---------------------------------------------------------------- conversations (declared before inquiries FK)
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  visitor_name text not null default '' check (char_length(visitor_name) <= 100),
  visitor_contact text not null default '' check (char_length(visitor_contact) <= 200),
  product_id uuid references public.products (id) on delete set null,
  status public.conversation_status not null default 'open',
  escalated boolean not null default false,
  needs_attention boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index conversations_inbox_idx on public.conversations (status, needs_attention, last_message_at desc);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender public.message_sender not null,
  body text not null check (char_length(body) between 1 and 2000),
  product_id uuid references public.products (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, id);

-- Keeps the conversation summary in sync with its messages.
create function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      needs_attention = case
        when new.sender = 'admin' then false
        when new.sender = 'visitor' and c.escalated then true
        else c.needs_attention
      end,
      status = case when new.sender = 'visitor' then 'open'::public.conversation_status else c.status end,
      resolved_at = case when new.sender = 'visitor' then null else c.resolved_at end
  where c.id = new.conversation_id;
  return null;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------- inquiries & contact events
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null default '',
  conversation_id uuid references public.conversations (id) on delete set null,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '' check (char_length(email) <= 200),
  message text not null check (char_length(message) between 3 and 2000),
  source text not null default 'form' check (source in ('form', 'chat')),
  status public.inquiry_status not null default 'new',
  internal_notes text not null default '' check (char_length(internal_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_has_contact check (phone <> '' or email <> '')
);
create index inquiries_status_idx on public.inquiries (status, created_at desc);
create index inquiries_product_idx on public.inquiries (product_id);
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();

alter table public.sales
  add constraint sales_inquiry_fk foreign key (inquiry_id) references public.inquiries (id) on delete set null;

-- A click on a WhatsApp/Messenger/phone button. This is NOT a message received:
-- the site cannot see what happens in those external apps.
create table public.contact_events (
  id bigint generated always as identity primary key,
  product_id uuid references public.products (id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'messenger', 'phone', 'chat')),
  created_at timestamptz not null default now()
);
create index contact_events_product_idx on public.contact_events (product_id, created_at desc);
