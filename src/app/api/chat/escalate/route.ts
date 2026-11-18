import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchState, readToken, startConversation } from "@/lib/chat-server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  contact: z.string().trim().min(6, "Enter a phone number or an email.").max(200),
  message: z.string().trim().min(3, "Write a short message.").max(2000),
  after: z.number().int().min(0).default(0),
  productId: z.string().uuid().nullable().default(null),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!rateLimit(`chat-escalate:${clientIp(request.headers)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many requests. Please wait a few minutes." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  }
  const { name, contact, message, after, productId } = parsed.data;

  try {
    let token = await readToken();
    if (!token) token = await startConversation(productId);
    const db = createPublicClient();
    let res = await db.rpc("chat_escalate", { p_token: token, p_name: name, p_contact: contact, p_message: message });
    if (res.error && /conversation_not_found/.test(res.error.message)) {
      token = await startConversation(productId);
      res = await db.rpc("chat_escalate", { p_token: token, p_name: name, p_contact: contact, p_message: message });
    }
    if (res.error) {
      const msg = res.error.message;
      if (/contact_required/.test(msg)) return NextResponse.json({ error: "invalid", message: "Enter a valid phone number or email." }, { status: 400 });
      if (/rate_limited/.test(msg)) return NextResponse.json({ error: "rate_limited", message: "Too many requests. Please wait a few minutes." }, { status: 429 });
      return NextResponse.json({ error: "invalid", message: "We couldn't send your request. Check your details and try again." }, { status: 400 });
    }
    const state = await fetchState(token, after);
    return NextResponse.json({ started: true, ...(state ?? { status: "open", escalated: true, messages: [] }) });
  } catch {
    return NextResponse.json({ error: "chat_unavailable", message: "The chat is unavailable right now. Please use WhatsApp or the phone." }, { status: 502 });
  }
}
