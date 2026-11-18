-- Security hardening, part 1 (non-breaking): a PRIVATE schema that the API never exposes.
-- It holds the gateway key hash, the rate-limit ledger and internal helpers.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- SHA-256 of the server-only GATEWAY_KEY. The key itself is never stored in the database or in git.
create table private.gateway_key (
  id smallint primary key check (id = 1),
  key_hash bytea not null
);

-- Rate-limit ledger: one row per allowed request, keyed by bucket (e.g. 'chat_msg:<client hash>').
create table private.rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_events_bucket_idx on private.rate_events (bucket, created_at desc);
create index rate_events_created_idx on private.rate_events (created_at);

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

-- Refuses the call unless the request carries the right x-gateway-key header (PostgREST exposes request headers
-- as a JSON setting). Fails closed: no key configured means nobody is let in. Writes nothing.
create function private.require_gateway()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h json;
  k text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    h := null;
  end;
  k := h ->> 'x-gateway-key';
  if k is null or char_length(k) < 32 or char_length(k) > 200
     or not exists (select 1 from private.gateway_key g where g.id = 1 and g.key_hash = sha256(convert_to(k, 'UTF8'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Pseudonymous visitor id sent by our server (salted hash of the IP). 'unknown' when absent or malformed.
create function private.client_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h json;
  v text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    h := null;
  end;
  v := h ->> 'x-client-id';
  if v ~ '^[0-9a-f]{16,64}$' then
    return v;
  end if;
  return 'unknown';
end;
$$;

-- Records a hit and returns false (without recording) when the bucket is already at its limit.
-- Also trims old ledger rows now and then, so the ledger cannot grow without bound.
create function private.rate_ok(p_bucket text, p_max integer, p_window interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if random() < 0.01 then
    delete from private.rate_events where created_at < now() - interval '1 day';
  end if;
  select count(*) into n from private.rate_events where bucket = p_bucket and created_at > now() - p_window;
  if n >= p_max then
    return false;
  end if;
  insert into private.rate_events (bucket) values (p_bucket);
  return true;
end;
$$;

-- Same, but raises 'rate_limited' (the caller maps it to a friendly message).
create function private.rate_hit(p_bucket text, p_max integer, p_window interval)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.rate_ok(p_bucket, p_max, p_window) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- Keeps storage bounded: bot-only chats (no seller involved) are deleted after 3 days.
create function private.purge_stale()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.conversations c where not c.escalated and c.created_at < now() - interval '3 days';
  delete from private.rate_events where created_at < now() - interval '1 day';
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
