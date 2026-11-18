-- Row Level Security + explicit grants.
-- Rule: "authenticated" is NOT "admin". Anyone can sign up with the public key,
-- so every admin policy checks public.is_admin().

-- Start from zero: nothing is readable or writable by API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.admins enable row level security;
alter table public.business_settings enable row level security;
alter table public.faqs enable row level security;
alter table public.testimonials enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_status_history enable row level security;
alter table public.sales enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.inquiries enable row level security;
alter table public.contact_events enable row level security;

-- ---- admins: no API access at all (is_admin() is SECURITY DEFINER). Managed with SQL only.

-- ---- business_settings: public read, admin update
grant select on public.business_settings to anon, authenticated;
grant update on public.business_settings to authenticated;
create policy settings_public_read on public.business_settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.business_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- faqs / testimonials: public read of published rows, admin full access
grant select on public.faqs, public.testimonials to anon, authenticated;
grant insert, update, delete on public.faqs, public.testimonials to authenticated;
create policy faqs_public_read on public.faqs for select to anon, authenticated using (is_published);
create policy faqs_admin_all on public.faqs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy testimonials_public_read on public.testimonials for select to anon, authenticated using (is_published);
create policy testimonials_admin_all on public.testimonials for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- products: public sees non-archived (sold only if the owner allows it); admin sees everything
grant select on public.products, public.product_images to anon, authenticated;
grant insert, update, delete on public.products, public.product_images to authenticated;
create policy products_public_read on public.products for select to anon, authenticated
  using (
    not is_archived
    and (status <> 'sold' or (select s.show_sold_products from public.business_settings s where s.id = 1))
  );
create policy products_admin_all on public.products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Images are visible exactly when their product is visible (the sub-select is itself filtered by RLS).
create policy product_images_public_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_images_admin_all on public.product_images for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- status history, contact events: admin read only (written by triggers / RPCs)
grant select on public.product_status_history, public.contact_events to authenticated;
create policy history_admin_read on public.product_status_history for select to authenticated
  using ((select public.is_admin()));
create policy contact_events_admin_read on public.contact_events for select to authenticated
  using ((select public.is_admin()));

-- ---- sales: admin read; inserts/voids only through record_sale()/void_sale(); notes editable
grant select on public.sales to authenticated;
grant update (customer_name, customer_phone, customer_email, notes) on public.sales to authenticated;
create policy sales_admin_read on public.sales for select to authenticated using ((select public.is_admin()));
create policy sales_admin_update on public.sales for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- inquiries: admin read/update/delete; creation only through submit_inquiry()
grant select, delete on public.inquiries to authenticated;
grant update (status, internal_notes) on public.inquiries to authenticated;
create policy inquiries_admin_read on public.inquiries for select to authenticated using ((select public.is_admin()));
create policy inquiries_admin_update on public.inquiries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy inquiries_admin_delete on public.inquiries for delete to authenticated using ((select public.is_admin()));

-- ---- conversations / messages: visitors never read tables directly (token RPCs only)
grant select, delete on public.conversations to authenticated;
grant update (status, resolved_at, needs_attention) on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
create policy conversations_admin_read on public.conversations for select to authenticated using ((select public.is_admin()));
create policy conversations_admin_update on public.conversations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy conversations_admin_delete on public.conversations for delete to authenticated using ((select public.is_admin()));
create policy messages_admin_read on public.messages for select to authenticated using ((select public.is_admin()));
create policy messages_admin_insert on public.messages for insert to authenticated
  with check ((select public.is_admin()) and sender = 'admin');

-- Helper roles need to see the identity sequences when inserting through RLS.
grant usage, select on all sequences in schema public to authenticated;

-- is_admin() is called from policies evaluated as anon/authenticated.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
