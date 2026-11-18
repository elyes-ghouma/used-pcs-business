-- Security hardening, part 2.
--  * Public write functions require the server-only gateway key (x-gateway-key header). Calls made straight to the
--    Supabase API with just the public key are refused BEFORE anything is written.
--  * Per-visitor and global rate limits live in the database (they cannot be skipped by bypassing Next.js).
--  * A seller reply marks the conversation as human-handled, so the chatbot stops answering.
--  * Audit log of sensitive changes and a security-event log (logins), both admin-read-only.

-- ----------------------------------------------------------------------------- helpers
create function private.storage_busy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Hard stop for chat storage: refuses new chat writes if the messages table is huge (cheap planner estimate).
  select coalesce((select c.reltuples from pg_class c where c.oid = 'public.messages'::regclass), 0) > 60000;
$$;

-- Shared by submit_inquiry (website form) and chat_escalate (chat "contact the seller"). No gateway/rate checks here.
create function private.create_inquiry(
  p_name text, p_phone text, p_email text, p_message text,
  p_product_id uuid, p_source text, p_conversation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_product_name text := '';
  v_id uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if char_length(v_message) < 3 or char_length(v_message) > 2000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if v_phone = '' and v_email = '' then
    raise exception 'contact_required' using errcode = 'P0001';
  end if;
  if v_phone <> '' and v_phone !~ '^[0-9+()\-\s.]{6,25}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if v_email <> '' and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if p_source not in ('form', 'chat') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;

  -- Per-contact limit: the same phone/email cannot flood the inbox.
  if (select count(*) from public.inquiries i
      where i.created_at > now() - interval '10 minutes'
        and ((v_phone <> '' and i.phone = v_phone) or (v_email <> '' and i.email = v_email))) >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if p_product_id is not null then
    select p.name into v_product_name from public.products p where p.id = p_product_id and not p.is_archived;
    if not found then
      p_product_id := null;
      v_product_name := '';
    end if;
  end if;

  insert into public.inquiries (product_id, product_name, conversation_id, name, phone, email, message, source)
  values (p_product_id, v_product_name, p_conversation_id, v_name, v_phone, v_email, v_message, p_source)
  returning id into v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------- seller joins => bot stops
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      -- Once the seller has written, the conversation is human-handled for good: the chatbot stays silent.
      escalated = case when new.sender = 'admin' then true else c.escalated end,
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

-- ----------------------------------------------------------------------------- public write functions (same signatures)
create or replace function public.submit_inquiry(
  p_name text, p_phone text, p_email text, p_message text,
  p_product_id uuid default null, p_source text default 'form', p_conversation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
begin
  perform private.require_gateway();
  cid := private.client_id();
  perform private.rate_hit('inquiry:' || cid, 4, interval '10 minutes');
  perform private.rate_hit('inquiry:all', 60, interval '10 minutes');
  return private.create_inquiry(p_name, p_phone, p_email, p_message, p_product_id, p_source, p_conversation_id);
end;
$$;

create or replace function public.track_contact_event(p_product_id uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
begin
  perform private.require_gateway();
  if p_channel not in ('whatsapp', 'messenger', 'phone', 'chat') then
    raise exception 'invalid_channel' using errcode = 'P0001';
  end if;
  cid := private.client_id();
  -- Tracking must never break the page: past the limits it silently does nothing.
  if not private.rate_ok('track:' || cid, 60, interval '1 minute') or not private.rate_ok('track:all', 120, interval '1 minute') then
    return;
  end if;
  if p_product_id is not null and not exists (select 1 from public.products p where p.id = p_product_id) then
    p_product_id := null;
  end if;
  insert into public.contact_events (product_id, channel) values (p_product_id, p_channel);
end;
$$;

create or replace function public.chat_start(p_product_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  perform private.require_gateway();
  cid := private.client_id();
  if private.storage_busy() then
    raise exception 'busy' using errcode = 'P0001';
  end if;
  perform private.rate_hit('chat_start:' || cid, 6, interval '1 hour');
  perform private.rate_hit('chat_start:all', 250, interval '1 hour');
  if random() < 0.02 then
    perform private.purge_stale();
  end if;
  if p_product_id is not null and not exists (select 1 from public.products p where p.id = p_product_id and not p.is_archived) then
    p_product_id := null;
  end if;
  insert into public.conversations (token_hash, product_id)
  values (sha256(convert_to(v_token, 'UTF8')), p_product_id)
  returning id into v_id;
  return jsonb_build_object('conversation_id', v_id, 'token', v_token);
end;
$$;

create or replace function public.chat_post_visitor_message(p_token text, p_body text, p_product_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
  v_conv uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  perform private.require_gateway();
  cid := private.client_id();
  v_conv := public._conversation_for_token(p_token);
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if private.storage_busy() then
    raise exception 'busy' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m
      where m.conversation_id = v_conv and m.sender = 'visitor' and m.created_at > now() - interval '1 minute') >= 12 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m where m.conversation_id = v_conv) >= 300 then
    raise exception 'conversation_full' using errcode = 'P0001';
  end if;
  perform private.rate_hit('chat_msg:' || cid, 40, interval '10 minutes');
  perform private.rate_hit('chat_msg:all', 1500, interval '1 hour');
  if p_product_id is not null and not exists (select 1 from public.products p where p.id = p_product_id and not p.is_archived) then
    p_product_id := null;
  end if;
  insert into public.messages (conversation_id, sender, body, product_id)
  values (v_conv, 'visitor', v_body, p_product_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Only our server holds the gateway key, so only our server can write "automated" messages: visitors can no
-- longer forge bot replies.
create or replace function public.chat_post_bot_message(p_token text, p_body text, p_meta jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  perform private.require_gateway();
  v_conv := public._conversation_for_token(p_token);
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_meta, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_meta, '{}'::jsonb)::text) > 8000 then
    p_meta := '{}'::jsonb;
  end if;
  if (select count(*) from public.messages m
      where m.conversation_id = v_conv and m.sender = 'bot' and m.created_at > now() - interval '1 minute') >= 12 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.messages (conversation_id, sender, body, meta)
  values (v_conv, 'bot', v_body, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.chat_escalate(p_token text, p_name text, p_contact text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
  v_conv uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_product uuid;
  v_phone text := '';
  v_email text := '';
  v_inquiry uuid;
begin
  perform private.require_gateway();
  cid := private.client_id();
  v_conv := public._conversation_for_token(p_token);
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if char_length(v_message) < 3 or char_length(v_message) > 2000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if v_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := lower(v_contact);
  elsif v_contact ~ '^[0-9+()\-\s.]{6,25}$' then
    v_phone := v_contact;
  else
    raise exception 'contact_required' using errcode = 'P0001';
  end if;
  if private.storage_busy() then
    raise exception 'busy' using errcode = 'P0001';
  end if;
  perform private.rate_hit('escalate:' || cid, 4, interval '10 minutes');
  perform private.rate_hit('inquiry:all', 60, interval '10 minutes');

  select c.product_id into v_product from public.conversations c where c.id = v_conv;

  update public.conversations
  set visitor_name = v_name, visitor_contact = v_contact, escalated = true, needs_attention = true
  where id = v_conv;

  insert into public.messages (conversation_id, sender, body, product_id)
  values (v_conv, 'visitor', v_message, v_product);

  v_inquiry := private.create_inquiry(v_name, v_phone, v_email, v_message, v_product, 'chat', v_conv);
  return v_inquiry;
end;
$$;

create or replace function public.chat_get_messages(p_token text, p_after bigint default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
  v_row public.conversations;
begin
  perform private.require_gateway();
  v_conv := public._conversation_for_token(p_token);
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  select * into v_row from public.conversations where id = v_conv;
  return jsonb_build_object(
    'status', v_row.status,
    'escalated', v_row.escalated,
    'product_id', v_row.product_id,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body, 'meta', m.meta, 'created_at', m.created_at
      ) order by m.id)
      from public.messages m
      where m.conversation_id = v_conv and m.id > coalesce(p_after, 0)
    ), '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------- security events (logins)
create table public.security_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  type text not null check (type in ('login_ok', 'login_failed', 'login_throttled', 'admin_denied')),
  client text not null default 'unknown',
  detail text not null default '' check (char_length(detail) <= 200)
);
create index security_events_at_idx on public.security_events (at desc);
alter table public.security_events enable row level security;
grant select on public.security_events to authenticated;
create policy security_events_admin_read on public.security_events for select to authenticated using ((select public.is_admin()));

-- Called by OUR server only (gateway key). Capped, and silently dropped past the caps, so it cannot be used to
-- flood the table. Best effort: a failure here must never block a login.
create function public.log_security_event(p_type text, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
begin
  perform private.require_gateway();
  if p_type not in ('login_ok', 'login_failed', 'login_throttled', 'admin_denied') then
    raise exception 'invalid_type' using errcode = 'P0001';
  end if;
  cid := private.client_id();
  if not private.rate_ok('secevt:' || cid, 30, interval '10 minutes') or not private.rate_ok('secevt:all', 300, interval '10 minutes') then
    return;
  end if;
  insert into public.security_events (type, client, detail) values (p_type, left(cid, 12), left(coalesce(p_detail, ''), 200));
end;
$$;

-- Login throttle shared by every serverless instance: per visitor and per account (hashed email).
create function public.check_login_allowed(p_email_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
  h text := case when p_email_hash ~ '^[0-9a-f]{8,64}$' then p_email_hash else 'unknown' end;
begin
  perform private.require_gateway();
  cid := private.client_id();
  perform private.rate_hit('login:' || cid, 12, interval '10 minutes');
  perform private.rate_hit('login_acct:' || h, 20, interval '10 minutes');
end;
$$;

-- ----------------------------------------------------------------------------- audit log (who changed what)
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;
create policy audit_log_admin_read on public.audit_log for select to authenticated using ((select public.is_admin()));
-- Nobody can edit or delete audit rows through the API: there are no INSERT/UPDATE/DELETE policies or grants.

create function public.audit_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values ((select auth.uid()), 'product_created', 'product', new.id::text, jsonb_build_object('name', new.name, 'price', new.price));
  elsif tg_op = 'UPDATE' then
    if new.price is distinct from old.price then
      insert into public.audit_log (actor, action, entity, entity_id, detail)
      values ((select auth.uid()), 'price_changed', 'product', new.id::text, jsonb_build_object('name', new.name, 'from', old.price, 'to', new.price));
    end if;
    if new.is_archived is distinct from old.is_archived then
      insert into public.audit_log (actor, action, entity, entity_id, detail)
      values ((select auth.uid()), case when new.is_archived then 'product_archived' else 'product_restored' end, 'product', new.id::text, jsonb_build_object('name', new.name));
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values ((select auth.uid()), 'product_deleted', 'product', old.id::text, jsonb_build_object('name', old.name, 'price', old.price));
  end if;
  return null;
end;
$$;
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_products();

create function public.audit_sales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values ((select auth.uid()), 'sale_recorded', 'sale', new.id::text, jsonb_build_object('product', new.product_name, 'sale_price', new.sale_price));
  elsif tg_op = 'UPDATE' and new.is_voided is distinct from old.is_voided then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values ((select auth.uid()), case when new.is_voided then 'sale_voided' else 'sale_restored' end, 'sale', new.id::text, jsonb_build_object('product', new.product_name, 'sale_price', new.sale_price));
  end if;
  return null;
end;
$$;
create trigger sales_audit after insert or update on public.sales
  for each row execute function public.audit_sales();

-- Settings: record WHICH fields changed (not their values, which may be long or contact details).
create function public.audit_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed jsonb;
begin
  select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb) into changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value and n.key <> 'updated_at';
  if jsonb_array_length(changed) > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values ((select auth.uid()), 'settings_changed', 'settings', '1', jsonb_build_object('fields', changed));
  end if;
  return null;
end;
$$;
create trigger settings_audit after update on public.business_settings
  for each row execute function public.audit_settings();

create function public.audit_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, entity, entity_id) values ((select auth.uid()), 'admin_added', 'admin', new.user_id::text);
  else
    insert into public.audit_log (actor, action, entity, entity_id) values ((select auth.uid()), 'admin_removed', 'admin', old.user_id::text);
  end if;
  return null;
end;
$$;
create trigger admins_audit after insert or delete on public.admins
  for each row execute function public.audit_admins();

-- ----------------------------------------------------------------------------- grants
revoke all on function public.log_security_event(text, text) from public;
revoke all on function public.check_login_allowed(text) from public;
grant execute on function public.log_security_event(text, text) to anon, authenticated;
grant execute on function public.check_login_allowed(text) to anon, authenticated;

revoke all on function public.audit_products() from public, anon, authenticated;
revoke all on function public.audit_sales() from public, anon, authenticated;
revoke all on function public.audit_settings() from public, anon, authenticated;
revoke all on function public.audit_admins() from public, anon, authenticated;
revoke all on function public.on_message_insert() from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
