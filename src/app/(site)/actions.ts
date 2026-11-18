"use server";

import { headers } from "next/headers";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase/public";
import { flattenErrors, inquirySchema, type ActionState } from "@/lib/validation";

/**
 * Messages returned here are message KEYS (see src/i18n/messages): the form translates them into the visitor's language.
 */
export async function submitInquiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Honeypot: real visitors never see or fill this field.
  if (String(formData.get("company") ?? "") !== "") return { ok: true, message: "form.sentHoneypot" };

  if (!isSupabaseConfigured() || !isGatewayConfigured()) return { ok: false, message: "form.unavailable" };
  const ip = clientIp(await headers());
  if (!rateLimit(`inquiry:${ip}`, 5, 10 * 60_000)) return { ok: false, message: "form.tooFast" };

  const parsed = inquirySchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    message: formData.get("message") ?? "",
    productId: formData.get("productId") ? String(formData.get("productId")) : null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: flattenErrors(parsed.error), message: "form.fix" };

  const { name, phone, email, message, productId } = parsed.data;
  const { error } = await (await createGatewayClient()).rpc("submit_inquiry", {
    p_name: name,
    p_phone: phone,
    p_email: email,
    p_message: message,
    p_product_id: productId,
  });
  if (error) return { ok: false, message: /rate_limited/.test(error.message) ? "form.tooMany" : "form.failed" };
  return { ok: true, message: "form.sentText" };
}
