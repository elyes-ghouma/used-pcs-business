-- RPC functions.
-- * Admin functions: EXECUTE only for `authenticated`, and each one re-checks is_admin().
-- * Public functions (inquiry, chat, click tracking): EXECUTE for anon+authenticated; all
--   validation and rate limiting happens HERE, because callers can bypass the Next.js app
--   and hit the API with the public key directly.
-- * Every function: SECURITY DEFINER + empty search_path + schema-qualified names.

-- =============================================================== admin: product status
create function public.set_product_status(p_product_id uuid, p_status public.product_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status = 'sold' then
    raise exception 'use_record_sale' using errcode = 'P0001';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_product.status = 'sold' then
    raise exception 'product_is_sold' using errcode = 'P0001';
  end if;
  if v_product.status = p_status then
    return;
  end if;

  perform set_config('app.status_via_fn', 'on', true);
  perform set_config('app.status_note', coalesce(left(p_note, 300), ''), true);
  update public.products set status = p_status where id = p_product_id;
  perform set_config('app.status_via_fn', 'off', true);
  perform set_config('app.status_note', '', true);
end;
$$;

-- =============================================================== admin: record a sale
create function public.record_sale(
  p_product_id uuid,
  p_sale_price numeric,
  p_sold_at timestamptz default now(),
  p_customer_name text default '',
  p_customer_phone text default '',
  p_customer_email text default '',
  p_notes text default '',
  p_inquiry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_sale_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_sale_price is null or p_sale_price < 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;

  -- Row lock: two concurrent sales of the same product serialize here.
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_product.is_archived then
    raise exception 'product_is_archived' using errcode = 'P0001';
  end if;
  if v_product.status = 'sold' then
    raise exception 'product_already_sold' using errcode = 'P0001';
  end if;

  perform set_config('app.status_via_fn', 'on', true);
  perform set_config('app.status_note', 'Sale recorded', true);
  update public.products set status = 'sold' where id = p_product_id;
  perform set_config('app.status_via_fn', 'off', true);
  perform set_config('app.status_note', '', true);

  insert into public.sales (
    product_id, product_name, listed_price, sale_price, sold_at,
    customer_name, customer_phone, customer_email, notes, inquiry_id, created_by
  ) values (
    v_product.id, v_product.name, v_product.price, p_sale_price, coalesce(p_sold_at, now()),
    coalesce(p_customer_name, ''), coalesce(p_customer_phone, ''), coalesce(p_customer_email, ''),
    coalesce(p_notes, ''), p_inquiry_id, (select auth.uid())
  ) returning id into v_sale_id;

  if p_inquiry_id is not null then
    update public.inquiries set status = 'converted' where id = p_inquiry_id;
  end if;

  return v_sale_id;
end;
$$;

-- =============================================================== admin: void a sale (mistake recovery; row is kept)
create function public.void_sale(p_sale_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;
  if v_sale.is_voided then
    raise exception 'sale_already_voided' using errcode = 'P0001';
  end if;

  perform 1 from public.products where id = v_sale.product_id for update;

  update public.sales
  set is_voided = true, voided_at = now(), void_reason = left(coalesce(p_reason, ''), 500)
  where id = p_sale_id;

  perform set_config('app.status_via_fn', 'on', true);
  perform set_config('app.status_note', 'Sale voided', true);
  update public.products set status = 'available' where id = v_sale.product_id and status = 'sold';
  perform set_config('app.status_via_fn', 'off', true);
  perform set_config('app.status_note', '', true);
end;
$$;

-- =============================================================== admin: dashboard numbers
create function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'products_total',     (select count(*) from public.products where not is_archived),
    'products_available', (select count(*) from public.products where not is_archived and status = 'available'),
    'products_reserved',  (select count(*) from public.products where not is_archived and status = 'reserved'),
    'products_sold',      (select count(*) from public.products where not is_archived and status = 'sold'),
    'sales_count',        (select count(*) from public.sales where not is_voided),
    'revenue',            (select coalesce(sum(sale_price), 0) from public.sales where not is_voided),
    'open_inquiries',     (select count(*) from public.inquiries where status in ('new', 'contacted', 'negotiating')),
    'new_inquiries',      (select count(*) from public.inquiries where status = 'new'),
    'chats_needing_attention', (select count(*) from public.conversations where needs_attention and status = 'open'),
    'monthly_revenue', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'revenue', m.revenue, 'count', m.cnt) order by m.month)
      from (
        select to_char(date_trunc('month', sold_at), 'YYYY-MM') as month,
               sum(sale_price) as revenue, count(*) as cnt
        from public.sales
        where not is_voided and sold_at >= date_trunc('month', now()) - interval '5 months'
        group by 1
      ) m
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Which products generate the most interest (inquiries, button clicks, chats).
create function public.admin_product_interest()
returns table (product_id uuid, product_name text, inquiries bigint, contact_clicks bigint, chats bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
  select t.pid, t.pname, t.inq, t.clicks, t.chats
  from (
    select p.id as pid, p.name as pname,
           (select count(*) from public.inquiries i where i.product_id = p.id) as inq,
           (select count(*) from public.contact_events e where e.product_id = p.id) as clicks,
           (select count(*) from public.conversations c where c.product_id = p.id) as chats
    from public.products p
  ) t
  order by (t.inq + t.clicks + t.chats) desc, t.pname
  limit 10;
end;
$$;

-- =============================================================== public: catalog filter options
-- SECURITY INVOKER: RLS applies, so only publicly visible products contribute values.
create function public.catalog_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'cpu',     coalesce((select jsonb_agg(v order by v) from (select distinct cpu as v from public.products where cpu <> '') x), '[]'::jsonb),
    'gpu',     coalesce((select jsonb_agg(v order by v) from (select distinct gpu as v from public.products where gpu <> '') x), '[]'::jsonb),
    'ram',     coalesce((select jsonb_agg(v order by v) from (select distinct ram as v from public.products where ram <> '') x), '[]'::jsonb),
    'storage', coalesce((select jsonb_agg(v order by v) from (select distinct storage as v from public.products where storage <> '') x), '[]'::jsonb),
    'min_price', (select min(price) from public.products),
    'max_price', (select max(price) from public.products)
  );
$$;

-- =============================================================== public: inquiry form
create function public.submit_inquiry(
  p_name text,
  p_phone text,
  p_email text,
  p_message text,
  p_product_id uuid default null,
  p_source text default 'form',
  p_conversation_id uuid default null
)
returns uuid
language plpgsql
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

  -- Rate limits: per contact and global.
  if (select count(*) from public.inquiries i
      where i.created_at > now() - interval '10 minutes'
        and ((v_phone <> '' and i.phone = v_phone) or (v_email <> '' and i.email = v_email))) >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.inquiries i where i.created_at > now() - interval '10 minutes') >= 60 then
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

-- =============================================================== public: click tracking (NOT messages)
create function public.track_contact_event(p_product_id uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_channel not in ('whatsapp', 'messenger', 'phone', 'chat') then
    raise exception 'invalid_channel' using errcode = 'P0001';
  end if;
  if (select count(*) from public.contact_events e where e.created_at > now() - interval '1 minute') >= 120 then
    return; -- silently drop: tracking must never break the page
  end if;
  if p_product_id is not null and not exists (select 1 from public.products p where p.id = p_product_id) then
    p_product_id := null;
  end if;
  insert into public.contact_events (product_id, channel) values (p_product_id, p_channel);
end;
$$;

-- =============================================================== public: chat (token = capability)
-- The visitor holds a random secret token; only its SHA-256 hash is stored.
-- Possessing the token is the only way to read/write that conversation.
create function public._conversation_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.conversations c
  where p_token is not null
    and char_length(p_token) between 32 and 128
    and c.token_hash = sha256(convert_to(p_token, 'UTF8'));
$$;

create function public.chat_start(p_product_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  if (select count(*) from public.conversations c where c.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'rate_limited' using errcode = 'P0001';
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

create function public.chat_post_visitor_message(p_token text, p_body text, p_product_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid := public._conversation_for_token(p_token);
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m
      where m.conversation_id = v_conv and m.sender = 'visitor' and m.created_at > now() - interval '1 minute') >= 12 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m where m.conversation_id = v_conv) >= 500 then
    raise exception 'conversation_full' using errcode = 'P0001';
  end if;
  if p_product_id is not null and not exists (select 1 from public.products p where p.id = p_product_id and not p.is_archived) then
    p_product_id := null;
  end if;
  insert into public.messages (conversation_id, sender, body, product_id)
  values (v_conv, 'visitor', v_body, p_product_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Bot replies are produced by the Next.js server and stored here. Because the anon key can call this,
-- bot rows are labelled "automated" in the inbox and are never trusted as the seller's word.
create function public.chat_post_bot_message(p_token text, p_body text, p_meta jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid := public._conversation_for_token(p_token);
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
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

-- Visitor asks for the seller: stores their contact details, flags the conversation
-- and creates a lead (inquiry) so it shows up in both the inbox and the inquiries list.
create function public.chat_escalate(p_token text, p_name text, p_contact text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid := public._conversation_for_token(p_token);
  v_name text := btrim(coalesce(p_name, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_product uuid;
  v_phone text := '';
  v_email text := '';
  v_inquiry uuid;
begin
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

  select c.product_id into v_product from public.conversations c where c.id = v_conv;

  update public.conversations
  set visitor_name = v_name, visitor_contact = v_contact, escalated = true, needs_attention = true
  where id = v_conv;

  insert into public.messages (conversation_id, sender, body, product_id)
  values (v_conv, 'visitor', v_message, v_product);

  v_inquiry := public.submit_inquiry(v_name, v_phone, v_email, v_message, v_product, 'chat', v_conv);
  return v_inquiry;
end;
$$;

create function public.chat_get_messages(p_token text, p_after bigint default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conv uuid := public._conversation_for_token(p_token);
  v_row public.conversations;
begin
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

-- =============================================================== grants
-- Admin RPCs
revoke all on function public.set_product_status(uuid, public.product_status, text) from public, anon;
revoke all on function public.record_sale(uuid, numeric, timestamptz, text, text, text, text, uuid) from public, anon;
revoke all on function public.void_sale(uuid, text) from public, anon;
revoke all on function public.admin_dashboard_stats() from public, anon;
revoke all on function public.admin_product_interest() from public, anon;
grant execute on function public.set_product_status(uuid, public.product_status, text) to authenticated;
grant execute on function public.record_sale(uuid, numeric, timestamptz, text, text, text, text, uuid) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_product_interest() to authenticated;

-- Public RPCs
revoke all on function public.catalog_filter_options() from public;
revoke all on function public.submit_inquiry(text, text, text, text, uuid, text, uuid) from public;
revoke all on function public.track_contact_event(uuid, text) from public;
revoke all on function public.chat_start(uuid) from public;
revoke all on function public.chat_post_visitor_message(text, text, uuid) from public;
revoke all on function public.chat_post_bot_message(text, text, jsonb) from public;
revoke all on function public.chat_escalate(text, text, text, text) from public;
revoke all on function public.chat_get_messages(text, bigint) from public;
grant execute on function public.catalog_filter_options() to anon, authenticated;
grant execute on function public.submit_inquiry(text, text, text, text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.track_contact_event(uuid, text) to anon, authenticated;
grant execute on function public.chat_start(uuid) to anon, authenticated;
grant execute on function public.chat_post_visitor_message(text, text, uuid) to anon, authenticated;
grant execute on function public.chat_post_bot_message(text, text, jsonb) to anon, authenticated;
grant execute on function public.chat_escalate(text, text, text, text) to anon, authenticated;
grant execute on function public.chat_get_messages(text, bigint) to anon, authenticated;

-- Internal helpers: not callable through the API at all.
revoke all on function public._conversation_for_token(text) from public, anon, authenticated;
revoke all on function public.guard_product_status() from public, anon, authenticated;
revoke all on function public.log_product_status() from public, anon, authenticated;
revoke all on function public.on_message_insert() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
