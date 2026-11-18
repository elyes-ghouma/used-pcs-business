"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAdminForAction } from "@/lib/auth";
import { isUuid } from "@/lib/guards";
import { reencodeToWebp } from "@/lib/image-process";
import { detectImageKind, isValidMediaPath, MAX_IMAGES_PER_PRODUCT, MAX_IMAGE_BYTES, MEDIA_BUCKET } from "@/lib/images";
import { makeProductSlug } from "@/lib/slug";
import type { ProductStatus } from "@/lib/types";
import { buildTranslations, flattenErrors, PRODUCT_FR_TEXT, productSchema, type ActionState } from "@/lib/validation";

async function guard() {
  try {
    return await requireAdminForAction();
  } catch {
    return null;
  }
}
const EXPIRED: ActionState = { ok: false, message: "Your session expired. Sign in again." };

function parseProductForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  return productSchema.safeParse({
    name: get("name"), price: get("price"), description: get("description"),
    cpu: get("cpu"), gpu: get("gpu"), motherboard: get("motherboard"), ram: get("ram"), storage: get("storage"),
    psu: get("psu"), case_name: get("case_name"), cooling: get("cooling"), os: get("os"),
    extra_specs: get("extra_specs"), accessories: get("accessories"), condition: get("condition"),
    testing_info: get("testing_info"), warranty_info: get("warranty_info"),
    is_featured: formData.get("is_featured") === "on",
  });
}

const frenchOf = (formData: FormData) => buildTranslations((k) => String(formData.get(k) ?? ""), PRODUCT_FR_TEXT);

function refresh(slug?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/catalog");
  if (slug) revalidatePath(`/pcs/${slug}`);
}

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await guard();
  if (!admin) return EXPIRED;
  const parsed = parseProductForm(formData);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: flattenErrors(parsed.error) };

  const slug = makeProductSlug(parsed.data.name);
  const { data, error } = await admin.supabase.from("products").insert({ ...parsed.data, translations: frenchOf(formData), slug }).select("id").single();
  if (error || !data) return { ok: false, message: "Could not save the product. Please try again." };
  refresh(slug);
  redirect(`/admin/products/${data.id}?created=1`);
}

export async function updateProductAction(productId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await guard();
  if (!admin) return EXPIRED;
  if (!isUuid(productId)) return { ok: false, message: "Invalid product." };
  const parsed = parseProductForm(formData);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: flattenErrors(parsed.error) };

  const { data, error } = await admin.supabase.from("products").update({ ...parsed.data, translations: frenchOf(formData) }).eq("id", productId).select("slug").single();
  if (error || !data) return { ok: false, message: "Could not save the changes. Please try again." };
  refresh(data.slug);
  return { ok: true, message: "Changes saved." };
}

export async function setStatusAction(productId: string, status: ProductStatus, formData?: FormData): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  // ("sold" is only reachable through record_sale; the database refuses it here too.)
  if (!isUuid(productId) || (status !== "available" && status !== "reserved")) return;
  const note = formData ? String(formData.get("note") ?? "").slice(0, 300) : "";
  await admin.supabase.rpc("set_product_status", { p_product_id: productId, p_status: status, p_note: note || null });
  refresh();
}

export async function archiveProductAction(productId: string, archived: boolean): Promise<void> {
  const admin = await guard();
  if (!admin) return;
  if (!isUuid(productId) || typeof archived !== "boolean") return;
  const { data } = await admin.supabase.from("products").update({ is_archived: archived }).eq("id", productId).select("slug").single();
  refresh(data?.slug);
}

export async function deleteProductAction(productId: string): Promise<ActionState> {
  const admin = await guard();
  if (!admin) return EXPIRED;
  if (!isUuid(productId)) return { ok: false, message: "Invalid product." };
  const { data: images } = await admin.supabase.from("product_images").select("storage_path").eq("product_id", productId);
  const { error } = await admin.supabase.from("products").delete().eq("id", productId);
  if (error) {
    if (error.code === "23503") {
      return { ok: false, message: "This PC has recorded sales, so it can't be deleted. Archive it instead to hide it from the website." };
    }
    return { ok: false, message: "Could not delete the product." };
  }
  const paths = (images ?? []).map((i) => i.storage_path as string);
  if (paths.length) await admin.supabase.storage.from(MEDIA_BUCKET).remove(paths);
  refresh();
  redirect("/admin/products?deleted=1");
}

/** The browser uploads straight to Storage (RLS: admins only); here the server verifies what actually arrived. */
export async function registerImageAction(productId: string, path: string): Promise<{ ok: boolean; message?: string }> {
  const admin = await guard();
  if (!admin) return { ok: false, message: EXPIRED.message };
  if (!isUuid(productId) || !isValidMediaPath(path, `products/${productId}`)) return { ok: false, message: "Invalid upload path." };

  const { count } = await admin.supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((count ?? 0) >= MAX_IMAGES_PER_PRODUCT) {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, message: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} photos.` };
  }

  const { data: blob, error } = await admin.supabase.storage.from(MEDIA_BUCKET).download(path);
  if (error || !blob) return { ok: false, message: "The uploaded file could not be read." };
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (blob.size > MAX_IMAGE_BYTES || !detectImageKind(bytes)) {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, message: "That file is not a valid JPG, PNG or WebP image under 5 MB." };
  }

  // Never serve what the browser uploaded: decode it and write a fresh WebP under a server-generated name.
  // This drops EXIF/GPS data and any payload hidden in the file; undecodable files are rejected.
  let clean: Buffer;
  try {
    clean = await reencodeToWebp(Buffer.from(await blob.arrayBuffer()));
  } catch {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, message: "That file could not be read as an image." };
  }
  const cleanPath = `products/${productId}/${randomUUID()}.webp`;
  const { error: uploadError } = await admin.supabase.storage.from(MEDIA_BUCKET).upload(cleanPath, clean, { contentType: "image/webp", upsert: false });
  await admin.supabase.storage.from(MEDIA_BUCKET).remove([path]); // the original never stays
  if (uploadError) return { ok: false, message: "Could not store the image." };

  const { data: last } = await admin.supabase.from("product_images").select("position").eq("product_id", productId).order("position", { ascending: false }).limit(1);
  const { error: insertError } = await admin.supabase.from("product_images").insert({
    product_id: productId,
    storage_path: cleanPath,
    position: (last?.[0]?.position ?? -1) + 1,
    is_primary: (count ?? 0) === 0,
  });
  if (insertError) {
    await admin.supabase.storage.from(MEDIA_BUCKET).remove([cleanPath]);
    return { ok: false, message: "Could not attach the image." };
  }
  refresh();
  return { ok: true };
}

export async function deleteImageAction(imageId: string): Promise<{ ok: boolean }> {
  const admin = await guard();
  if (!admin) return { ok: false };
  if (!isUuid(imageId)) return { ok: false };
  const { data: image } = await admin.supabase.from("product_images").select("id, product_id, storage_path, is_primary").eq("id", imageId).single();
  if (!image) return { ok: false };
  await admin.supabase.from("product_images").delete().eq("id", imageId);
  await admin.supabase.storage.from(MEDIA_BUCKET).remove([image.storage_path]);
  if (image.is_primary) {
    const { data: next } = await admin.supabase.from("product_images").select("id").eq("product_id", image.product_id).order("position").limit(1);
    if (next?.[0]) await admin.supabase.from("product_images").update({ is_primary: true }).eq("id", next[0].id);
  }
  refresh();
  return { ok: true };
}

export async function setPrimaryImageAction(productId: string, imageId: string): Promise<{ ok: boolean }> {
  const admin = await guard();
  if (!admin) return { ok: false };
  if (!isUuid(productId) || !isUuid(imageId)) return { ok: false };
  // Two steps because only one primary per product is allowed (unique partial index).
  await admin.supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId).eq("is_primary", true);
  const { error } = await admin.supabase.from("product_images").update({ is_primary: true }).eq("id", imageId).eq("product_id", productId);
  refresh();
  return { ok: !error };
}

export async function reorderImagesAction(productId: string, orderedIds: string[]): Promise<{ ok: boolean }> {
  const admin = await guard();
  if (!admin) return { ok: false };
  if (!isUuid(productId) || !Array.isArray(orderedIds) || orderedIds.length > MAX_IMAGES_PER_PRODUCT || !orderedIds.every(isUuid)) return { ok: false };
  await Promise.all(
    orderedIds.map((id, position) => admin.supabase.from("product_images").update({ position }).eq("id", id).eq("product_id", productId)),
  );
  refresh();
  return { ok: true };
}
