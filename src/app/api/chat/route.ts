import { NextResponse } from "next/server";
import { z } from "zod";
import { respond } from "@/lib/chatbot/engine";
import type { BotContext } from "@/lib/chatbot/types";
import { fetchState, readToken, startConversation } from "@/lib/chat-server";
import { localizeFaq, localizeProduct, localizeSettings } from "@/i18n/content";
import { getLocale } from "@/i18n/server";
import { getAllVisibleProducts, getFaqs, getSettings } from "@/lib/data";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { clientIp, isSameOrigin, rateLimit, readJsonLimited } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  after: z.number().int().min(0).default(0),
  productId: z.string().uuid().nullable().default(null),
});

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Poll for new messages (e.g. a reply from the seller). */
export async function GET(request: Request) {
  if (!isSupabaseConfigured() || !isGatewayConfigured()) return fail(503, "not_configured");
  if (!rateLimit(`chat-get:${clientIp(request.headers)}`, 60, 60_000)) return fail(429, "rate_limited");
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after")) || 0);
  const token = await readToken();
  if (!token) return NextResponse.json({ started: false, escalated: false, status: "open", messages: [] });
  try {
    const state = await fetchState(token, after);
    if (!state) return NextResponse.json({ started: false, escalated: false, status: "open", messages: [] });
    return NextResponse.json({ started: true, ...state });
  } catch {
    return fail(502, "chat_unavailable");
  }
}

/** A visitor message: stored, then answered by the deterministic bot unless the seller has been called in. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "forbidden");
  if (!isSupabaseConfigured() || !isGatewayConfigured()) return fail(503, "not_configured");
  if (!rateLimit(`chat-post:${clientIp(request.headers)}`, 20, 60_000)) return fail(429, "rate_limited");

  const parsed = bodySchema.safeParse(await readJsonLimited(request));
  if (!parsed.success) return fail(400, "invalid_message");
  const { message, after, productId } = parsed.data;
  const db = await createGatewayClient();

  try {
    let token = await readToken();
    if (!token) token = await startConversation(productId);

    let posted = await db.rpc("chat_post_visitor_message", { p_token: token, p_body: message, p_product_id: productId });
    if (posted.error && /conversation_not_found/.test(posted.error.message)) {
      token = await startConversation(productId);
      posted = await db.rpc("chat_post_visitor_message", { p_token: token, p_body: message, p_product_id: productId });
    }
    if (posted.error) {
      if (/rate_limited/.test(posted.error.message)) return fail(429, "rate_limited");
      return fail(400, "invalid_message");
    }
    const visitorMessageId = Number(posted.data);

    // Is the seller already in this conversation? Then the bot stays quiet.
    const probe = await fetchState(token, visitorMessageId);
    if (probe && !probe.escalated) {
      const [settings, faqs, products] = await Promise.all([getSettings(), getFaqs(), getAllVisibleProducts()]);
      const locale = await getLocale();
      const ctx: BotContext = {
        settings: localizeSettings(settings, locale),
        faqs: faqs.map((f) => localizeFaq(f, locale)),
        products: products.map((p) => localizeProduct(p, locale)),
        currentProductId: productId,
        locale,
      };
      const reply = respond(message, ctx);
      await db.rpc("chat_post_bot_message", {
        p_token: token,
        p_body: reply.text.slice(0, 2000),
        p_meta: { products: reply.products ?? [], action: reply.action ?? null, suggestions: reply.suggestions ?? [] },
      });
    }

    const state = await fetchState(token, after);
    return NextResponse.json({ started: true, ...(state ?? { status: "open", escalated: false, messages: [] }) });
  } catch {
    return fail(502, "chat_unavailable");
  }
}
