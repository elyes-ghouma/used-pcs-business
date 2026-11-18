"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteImageAction, registerImageAction, reorderImagesAction, setPrimaryImageAction } from "@/app/admin/actions/products";
import { extensionFor, detectImageKind, MAX_IMAGES_PER_PRODUCT, MEDIA_BUCKET, validateImageFile } from "@/lib/images";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Img = { id: string; url: string; is_primary: boolean };

export function ImageManager({ productId, images }: { productId: string; images: Img[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setMessage(null);
    if (images.length + files.length > MAX_IMAGES_PER_PRODUCT) {
      setMessage({ ok: false, text: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} photos.` });
      return;
    }
    setUploading(true);
    const supabase = createBrowserSupabase();
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      const problem = validateImageFile(file);
      if (problem) { errors.push(`${file.name}: ${problem}`); continue; }
      const kind = detectImageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
      if (!kind) { errors.push(`${file.name}: not a real JPG, PNG or WebP image.`); continue; }
      const path = `products/${productId}/${crypto.randomUUID()}.${extensionFor(kind)}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) { errors.push(`${file.name}: upload failed.`); continue; }
      const res = await registerImageAction(productId, path);
      if (!res.ok) errors.push(`${file.name}: ${res.message ?? "could not be saved."}`);
    }
    setUploading(false);
    setMessage(errors.length ? { ok: false, text: errors.join(" ") } : { ok: true, text: "Photos uploaded." });
    refresh();
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...images];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await reorderImagesAction(productId, next.map((i) => i.id));
    refresh();
  }

  return (
    <section aria-labelledby="img-heading" className="panel space-y-4 p-5">
      <div>
        <h2 id="img-heading" className="text-2xl">Photos</h2>
        <p className="hint">JPG, PNG or WebP, up to 5 MB each, up to {MAX_IMAGES_PER_PRODUCT} photos. The primary photo is shown first.</p>
      </div>

      {images.length === 0 ? (
        <p className="text-muted">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-md border border-line bg-bg">
              <div className="relative aspect-[4/3]">
                <Image src={img.url} alt={`Photo ${i + 1}${img.is_primary ? " (primary)" : ""}`} fill sizes="200px" className="object-cover" />
                {img.is_primary && <span className="absolute left-2 top-2 rounded bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">Primary</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 p-2">
                <button type="button" className="btn-secondary btn-sm" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>Earlier</button>
                <button type="button" className="btn-secondary btn-sm" disabled={i === images.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`Move photo ${i + 1} later`}>Later</button>
                {!img.is_primary && (
                  <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={async () => { await setPrimaryImageAction(productId, img.id); refresh(); }}>Set primary</button>
                )}
                <button
                  type="button" className="btn-danger btn-sm" disabled={pending}
                  onClick={async () => {
                    if (!window.confirm("Remove this photo?")) return;
                    await deleteImageAction(img.id);
                    refresh();
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="img-upload" className="btn-secondary cursor-pointer">{uploading ? "Uploading..." : "Add photos"}</label>
        <input
          id="img-upload" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }}
        />
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-ok" : "text-bad"}>{message.text}</p>}
    </section>
  );
}
