-- Covering indexes for foreign keys flagged by the Supabase performance advisor
-- (speeds up ON DELETE SET NULL when a product or conversation is removed).
create index conversations_product_idx on public.conversations (product_id);
create index inquiries_conversation_idx on public.inquiries (conversation_id);
create index messages_product_idx on public.messages (product_id);
create index sales_inquiry_idx on public.sales (inquiry_id);
