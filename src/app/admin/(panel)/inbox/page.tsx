import type { Metadata } from "next";
import { Inbox, type Conversation } from "@/components/admin/Inbox";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Chat inbox" };

export default async function InboxPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("conversations")
    .select("id, visitor_name, visitor_contact, product_id, status, escalated, needs_attention, last_message_at, created_at, products(name)")
    .order("last_message_at", { ascending: false })
    .limit(100);
  return <Inbox initial={(data ?? []) as unknown as Conversation[]} />;
}
