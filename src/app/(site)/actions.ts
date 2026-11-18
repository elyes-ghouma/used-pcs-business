"use server";

import { headers } from "next/headers";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase/public";
import { flattenErrors, inquirySchema, type ActionState } from "@/lib/validation";

export async function submitInquiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Honeypot: real visitors never see or fill this field.
  if (String(formData.get("company") ?? "") !== "") return { ok: true, message: "Thank you! The seller will contact you soon." };

  if (!isSupabaseConfigured() || !isGatewayConfigured()) {
    return { ok: false, message: "The contact form is temporarily unavailable. Please use WhatsApp or the phone." };
  }
  const ip = clientIp(await headers());
  if (!rateLimit(`inquiry:${ip}`, 5, 10 * 60_000)) {
    return { ok: false, message: "You have sent several messages in a short time. Please wait a few minutes and try again." };
  }

  const parsed = inquirySchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    message: formData.get("message") ?? "",
    productId: formData.get("productId") ? String(formData.get("productId")) : null,
  });
  if (!parsed.success) return { ok: false, fieldErrors: flattenErrors(parsed.error), message: "Please fix the highlighted fields." };

  const { name, phone, email, message, productId } = parsed.data;
  const { error } = await (await createGatewayClient()).rpc("submit_inquiry", {
    p_name: name,
    p_phone: phone,
    p_email: email,
    p_message: message,
    p_product_id: productId,
  });
  if (error) {
    if (/rate_limited/.test(error.message)) {
      return { ok: false, message: "Too many messages from this contact recently. Please wait a few minutes, or use WhatsApp or the phone." };
    }
    return { ok: false, message: "We couldn't send your message. Please try again, or contact the seller directly." };
  }
  return { ok: true, message: "Thank you! Your message was received. The seller will reply using the contact details you gave." };
}
