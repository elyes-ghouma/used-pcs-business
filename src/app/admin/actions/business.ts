"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAdminForAction } from "@/lib/auth";
import { isUuid } from "@/lib/guards";
import { reencodeToWebp } from "@/lib/image-process";
import { detectImageKind, isValidMediaPath, MAX_IMAGE_BYTES, MEDIA_BUCKET } from "@/lib/images";
import type { InquiryStatus } from "@/lib/types";
import {
  buildTranslations, FAQ_FR_TEXT, faqSchema, flattenErrors, saleSchema, SETTINGS_FR_LISTS, SETTINGS_FR_TEXT,
  settingsSchema, TESTIMONIAL_FR_TEXT, testimonialSchema, type ActionState,
} from "@/lib/validation";

async function guard() {
  try {
    return await requireAdminForAction();
  } catch {
    return null;
  }
}
const EXPIRED: ActionState = { ok: false, message: "Your session expired. Sign in again." };
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

// ------------------------------------------------------------------ sales
const SALE_ERRORS: Record<string, string> = {
  product_already_sold: "This PC is already marked as sold. Void the existing sale first if it was a mistake.",
  product_is_archived: "This PC is archived. Restore it before recording a sale.",
  product_not_found: "This PC no longer exists.",
  invalid_price: "Enter a valid sale price.",
};
function explain(message: string, table: Record<string, string>, fallback: string) {
  const key = Object.keys(table).find((k) => message.includes(k));
  return key ? table[key] : fallback;
}

export async function recordSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await guard();
  if (!admin) return EXPIRED;
  const parsed = saleSchema.safeParse({
    productId: str(formData, "productId"),
    salePrice: str(formData, "salePrice"),
    soldAt: str(formData, "soldAt"),
    customerName: str(formData, "customerName"),
    customerPhone: str(formData, "customerPhone"),
    customerEmail: str(formData, "customerEmail"),
    notes: str(formData, "notes"),
    inquiryId: str(formData, "inquiryId") || null,
  });
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: flattenErrors(parsed.error) };
  const d = parsed.data;
  const soldAt = new Date(`${d.soldAt}T12:00:00`);
  if (Number.isNaN(soldAt.getTime())) return { ok: false, message: "Enter a valid sale date.", fieldErrors: { soldAt: ["Enter a valid date."] } };

  const { error } = await admin.supabase.rpc("record_sale", {
    p_product_id: d.productId,
    p_sale_price: d.salePrice,
    p_sold_at: soldAt.toISOString(),
    p_customer_name: d.customerName,
    p_customer_phone: d.customerPhone,
    p_customer_email: d.customerEmail,
    p_notes: d.notes,
    p_inquiry_id: d.inquiryId,
  });
  if (error) return { ok: false, message: explain(error.message, SALE_ERRORS, "Could not record the sale. Please try again.") };
  revalidatePath("/admin", "layout");
  revalidatePath("/catalog");
  revalidatePath("/");
  redirect("/admin/sales?recorded=1");
}

export async function voidSaleAction(saleId: string, formData: FormData): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (!isUuid(saleId)) return;
  await admin.supabase.rpc("void_sale", { p_sale_id: saleId, p_reason: str(formData, "reason").slice(0, 500) });
  revalidatePath("/admin", "layout");
  revalidatePath("/catalog");
}

// ------------------------------------------------------------------ inquiries
const INQUIRY_STATUSES: InquiryStatus[] = ["new", "contacted", "negotiating", "converted", "closed"];

export async function updateInquiryAction(inquiryId: string, formData: FormData): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (!isUuid(inquiryId)) return;
  const status = str(formData, "status") as InquiryStatus;
  if (!INQUIRY_STATUSES.includes(status)) return;
  await admin.supabase
    .from("inquiries")
    .update({ status, internal_notes: str(formData, "internal_notes").slice(0, 2000) })
    .eq("id", inquiryId);
  revalidatePath("/admin", "layout");
}

// ------------------------------------------------------------------ settings
export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await guard();
  if (!admin) return EXPIRED;
  const pairText = (key: string) => str(formData, key);
  const parsed = settingsSchema.safeParse({
    default_locale: str(formData, "default_locale") || "en",
    business_name: str(formData, "business_name"),
    tagline: str(formData, "tagline"),
    description: str(formData, "description"),
    hero_headline: str(formData, "hero_headline"),
    hero_subheadline: str(formData, "hero_subheadline"),
    phone: str(formData, "phone"),
    whatsapp_number: str(formData, "whatsapp_number"),
    facebook_url: str(formData, "facebook_url"),
    messenger_url: str(formData, "messenger_url"),
    instagram_url: str(formData, "instagram_url"),
    location: str(formData, "location"),
    working_hours: str(formData, "working_hours"),
    currency: str(formData, "currency"),
    delivery_info: str(formData, "delivery_info"),
    payment_methods: str(formData, "payment_methods"),
    warranty_policy: str(formData, "warranty_policy"),
    chatbot_welcome: str(formData, "chatbot_welcome"),
    show_sold_products: formData.get("show_sold_products") === "on",
    highlights: pairText("highlights"),
    how_to_buy: pairText("how_to_buy"),
  });
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: flattenErrors(parsed.error) };
  const { error } = await admin.supabase.from("business_settings").update({ ...parsed.data, translations: buildTranslations((k) => str(formData, k), SETTINGS_FR_TEXT, SETTINGS_FR_LISTS) })
    .eq("id", 1);
  if (error) return { ok: false, message: "Could not save the settings. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function registerLogoAction(path: string): Promise<{ ok: boolean; message?: string }> {
  const admin = await guard();
  if (!admin) return { ok: false, message: EXPIRED.message };
  if (!isValidMediaPath(path, "branding")) return { ok: false, message: "Invalid upload path." };
  const { data: blob } = await admin.supabase.storage.from(MEDIA_BUCKET).download(path);
  const bytes = blob ? new Uint8Array(await blob.slice(0, 16).arrayBuffer()) : null;
  if (!blob || blob.size > MAX_IMAGE_BYTES || !bytes || !detectImageKind(bytes)) {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, message: "That file is not a valid JPG, PNG or WebP image under 5 MB." };
  }
  // Same rule as product photos: serve only a freshly re-encoded WebP under a server-generated name.
  let clean: Buffer;
  try {
    clean = await reencodeToWebp(Buffer.from(await blob.arrayBuffer()));
  } catch {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, message: "That file could not be read as an image." };
  }
  const cleanPath = `branding/${randomUUID()}.webp`;
  const { error: uploadError } = await admin.supabase.storage.from(MEDIA_BUCKET).upload(cleanPath, clean, { contentType: "image/webp", upsert: false });
  await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (uploadError) return { ok: false, message: "Could not store the logo." };

  const { data: old } = await admin.supabase.from("business_settings").select("logo_path").eq("id", 1).single();
  const { error } = await admin.supabase.from("business_settings").update({ logo_path: cleanPath }).eq("id", 1);
  if (error) {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([cleanPath]);
    return { ok: false, message: "Could not save the logo." };
  }
  if (old?.logo_path) await admin.supabase.storage.from(MEDIA_BUCKET).remove([old.logo_path]);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeLogoAction(): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  const { data: old } = await admin.supabase.from("business_settings").select("logo_path").eq("id", 1).single();
  await admin.supabase.from("business_settings").update({ logo_path: null }).eq("id", 1);
  if (old?.logo_path) await admin.supabase.storage.from(MEDIA_BUCKET).remove([old.logo_path]);
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ FAQs & testimonials
export async function saveFaqAction(id: string | null, formData: FormData): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (id !== null && !isUuid(id)) return;
  const parsed = faqSchema.safeParse({ question: str(formData, "question"), answer: str(formData, "answer"), keywords: str(formData, "keywords") });
  if (!parsed.success) return;
  const row = {
    ...parsed.data,
    translations: buildTranslations((k) => str(formData, k), FAQ_FR_TEXT),
    is_published: formData.get("is_published") === "on",
    sort_order: Number(str(formData, "sort_order")) || 0,
  };
  if (id) await admin.supabase.from("faqs").update(row).eq("id", id);
  else await admin.supabase.from("faqs").insert(row);
  revalidatePath("/admin/settings");
  revalidatePath("/");
}

export async function deleteFaqAction(id: string): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (!isUuid(id)) return;
  await admin.supabase.from("faqs").delete().eq("id", id);
  revalidatePath("/admin/settings");
  revalidatePath("/");
}

export async function saveTestimonialAction(id: string | null, formData: FormData): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (id !== null && !isUuid(id)) return;
  const parsed = testimonialSchema.safeParse({ author_name: str(formData, "author_name"), body: str(formData, "body") });
  if (!parsed.success) return;
  const row = {
    ...parsed.data,
    translations: buildTranslations((k) => str(formData, k), TESTIMONIAL_FR_TEXT),
    is_published: formData.get("is_published") === "on",
    sort_order: Number(str(formData, "sort_order")) || 0,
  };
  if (id) await admin.supabase.from("testimonials").update(row).eq("id", id);
  else await admin.supabase.from("testimonials").insert(row);
  revalidatePath("/admin/settings");
  revalidatePath("/");
}

export async function deleteTestimonialAction(id: string): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (!isUuid(id)) return;
  await admin.supabase.from("testimonials").delete().eq("id", id);
  revalidatePath("/admin/settings");
  revalidatePath("/");
}

// ------------------------------------------------------------------ chat inbox
export async function sendReplyAction(conversationId: string, body: string): Promise<{ ok: boolean; message?: string }> {
  const admin = await guard();
  if (!admin) return { ok: false, message: EXPIRED.message };
  if (!isUuid(conversationId) || typeof body !== "string") return { ok: false, message: "Invalid conversation." };
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) return { ok: false, message: "Write a reply between 1 and 2000 characters." };
  const { error } = await admin.supabase.from("messages").insert({ conversation_id: conversationId, sender: "admin", body: text });
  return error ? { ok: false, message: "Could not send the reply." } : { ok: true };
}

export async function setConversationStatusAction(conversationId: string, status: "open" | "resolved"): Promise<{ ok: boolean }> {
  const admin = await guard();
  if (!admin) return { ok: false };
  if (!isUuid(conversationId) || (status !== "open" && status !== "resolved")) return { ok: false };
  const { error } = await admin.supabase
    .from("conversations")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null, ...(status === "resolved" ? { needs_attention: false } : {}) })
    .eq("id", conversationId);
  revalidatePath("/admin", "layout");
  return { ok: !error };
}
