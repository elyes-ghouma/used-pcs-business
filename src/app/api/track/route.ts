import { NextResponse } from "next/server";
import { z } from "zod";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { clientIp, isSameOrigin, rateLimit, readJsonLimited } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const schema = z.object({
  channel: z.enum(["whatsapp", "messenger", "phone", "chat"]),
  productId: z.string().uuid().nullable().default(null),
});

/** Records that a contact button was clicked. This is NOT a received message: we cannot see WhatsApp/Messenger. */
export async function POST(request: Request) {
  const quiet = new NextResponse(null, { status: 204 });
  if (!isSameOrigin(request) || !isSupabaseConfigured() || !isGatewayConfigured()) return quiet;
  if (!rateLimit(`track:${clientIp(request.headers)}`, 30, 60_000)) return quiet;
  const parsed = schema.safeParse(await readJsonLimited(request, 1_024));
  if (parsed.success) {
    try {
      await (await createGatewayClient()).rpc("track_contact_event", { p_product_id: parsed.data.productId, p_channel: parsed.data.channel });
    } catch {
      // tracking must never break the page
    }
  }
  return quiet;
}
