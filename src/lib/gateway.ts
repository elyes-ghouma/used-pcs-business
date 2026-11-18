import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { clientIdFor, clientIp } from "@/lib/client-id";

/**
 * Public write endpoints (chat, inquiries, click tracking, login logging) are only callable through this client.
 * It sends two request headers that the database functions check:
 *   x-gateway-key  server-only secret (GATEWAY_KEY); the database stores only its SHA-256 hash
 *   x-client-id    salted hash of the visitor's IP, used for per-visitor rate limits
 * Someone calling the Supabase API directly with the public key has neither, so those functions refuse them
 * before writing anything. Never import this from a client component (the `server-only` import enforces it).
 */
export function gatewayKey(): string {
  return process.env.GATEWAY_KEY || "";
}

export function isGatewayConfigured(): boolean {
  return gatewayKey().length >= 32;
}

export async function createGatewayClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = gatewayKey();
  if (!url || !anon) throw new Error("Supabase is not configured.");
  if (key.length < 32) throw new Error("GATEWAY_KEY is not configured.");
  const clientId = clientIdFor(clientIp(await headers()), key);
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-gateway-key": key, "x-client-id": clientId } },
  });
}
