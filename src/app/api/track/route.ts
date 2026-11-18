import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const schema = z.object({
  channel: z.enum(["whatsapp", "messenger", "phone", "chat"]),
  productId: z.string().uuid().nullable().default(null),
});

/** Records that a contact button was clicked. This is NOT a received message: we cannot see WhatsApp/Messenger. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !rateLimit(`track:${clientIp(request.headers)}`, 30, 60_000)) return new NextResponse(null, { status: 204 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) {
    await createPublicClient().rpc("track_contact_event", { p_product_id: parsed.data.productId, p_channel: parsed.data.channel });
  }
  return new NextResponse(null, { status: 204 });
}
