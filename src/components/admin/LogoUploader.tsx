"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerLogoAction, removeLogoAction } from "@/app/admin/actions/business";
import { detectImageKind, extensionFor, MEDIA_BUCKET, validateImageFile } from "@/lib/images";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function LogoUploader({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    const problem = validateImageFile(file);
    if (problem) return setMessage({ ok: false, text: problem });
    const kind = detectImageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!kind) return setMessage({ ok: false, text: "That is not a real JPG, PNG or WebP image." });
    setBusy(true);
    const path = `branding/${crypto.randomUUID()}.${extensionFor(kind)}`;
    const { error } = await createBrowserSupabase().storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
    const res = error ? { ok: false, message: "Upload failed." } : await registerLogoAction(path);
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: "Logo updated." } : { ok: false, text: res.message ?? "Could not save the logo." });
    router.refresh();
  }

  return (
    <section aria-labelledby="logo-heading" className="panel space-y-3 p-5">
      <h2 id="logo-heading" className="text-2xl">Logo</h2>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative size-20 overflow-hidden rounded-md border border-line bg-bg">
          {logoUrl ? <Image src={logoUrl} alt="Current logo" fill sizes="80px" className="object-contain" /> : <span className="absolute inset-0 grid place-items-center px-1 text-center text-xs text-muted">No logo</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="logo-upload" className="btn-secondary cursor-pointer">{busy ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}</label>
          <input id="logo-upload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          {logoUrl && <button type="button" className="btn-danger" disabled={busy} onClick={async () => { await removeLogoAction(); router.refresh(); }}>Remove</button>}
        </div>
      </div>
      <p className="hint">Square images work best. JPG, PNG or WebP, up to 5 MB.</p>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-ok" : "text-bad"}>{message.text}</p>}
    </section>
  );
}
