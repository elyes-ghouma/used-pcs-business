import { cookies } from "next/headers";
import { createGatewayClient } from "@/lib/gateway";

export const CHAT_COOKIE = "chat_token";

export type ChatMessage = {
  id: number;
  sender: "visitor" | "bot" | "admin";
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ChatState = { status: "open" | "resolved"; escalated: boolean; product_id: string | null; messages: ChatMessage[] };

/** The conversation token lives in an httpOnly cookie: page scripts (and any injected script) can never read it. */
export async function readToken(): Promise<string | null> {
  const value = (await cookies()).get(CHAT_COOKIE)?.value;
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export async function startConversation(productId: string | null): Promise<string> {
  const db = await createGatewayClient();
  const { data, error } = await db.rpc("chat_start", { p_product_id: productId });
  if (error || !data?.token) throw new Error(error?.message ?? "chat_start_failed");
  (await cookies()).set(CHAT_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return data.token as string;
}

export async function fetchState(token: string, after: number): Promise<ChatState | null> {
  const db = await createGatewayClient();
  const { data, error } = await db.rpc("chat_get_messages", { p_token: token, p_after: after });
  if (error) {
    if (/conversation_not_found/.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data as ChatState;
}
