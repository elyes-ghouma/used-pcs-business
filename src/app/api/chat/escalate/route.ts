import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchState, readToken, startConversation } from "@/lib/chat-server";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { clientIp, isSameOrigin, rateLimit, readJsonLimited } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "err.name").max(100, "err.tooLong"),
  contact: z.string().trim().min(6, "chat.err.contact").max(200, "chat.err.contact"),
  message: z.string().trim().min(3, "err.message").max(2000, "err.tooLong"),
  after: z.number().int().min(0).default(0),
  productId: z.string().uuid().nullable().default(null),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isSupabaseConfigured() || !isGatewayConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!rateLimit(`chat-escalate:${clientIp(request.headers)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "chat.err.rate" }, { status: 429 });
  }
  const parsed = schema.safeParse(await readJsonLimited(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "chat.err.escalate" }, { status: 400 });
  }
  const { name, contact, message, after, productId } = parsed.data;

  try {
    let token = await readToken();
    if (!token) token = await startConversation(productId);
    const db = await createGatewayClient();
    let res = await db.rpc("chat_escalate", { p_token: token, p_name: name, p_contact: contact, p_message: message });
    if (res.error && /conversation_not_found/.test(res.error.message)) {
      token = await startConversation(productId);
      res = await db.rpc("chat_escalate", { p_token: token, p_name: name, p_contact: contact, p_message: message });
    }
    if (res.error) {
      const msg = res.error.message;
      if (/contact_required/.test(msg)) return NextResponse.json({ error: "invalid", message: "chat.err.contact" }, { status: 400 });
      if (/rate_limited/.test(msg)) return NextResponse.json({ error: "rate_limited", message: "chat.err.rate" }, { status: 429 });
      return NextResponse.json({ error: "invalid", message: "chat.err.escalate" }, { status: 400 });
    }
    const state = await fetchState(token, after);
    return NextResponse.json({ started: true, ...(state ?? { status: "open", escalated: true, messages: [] }) });
  } catch {
    return NextResponse.json({ error: "chat_unavailable", message: "chat.err.unavailable" }, { status: 502 });
  }
}
