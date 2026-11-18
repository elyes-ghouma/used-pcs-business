import type { Metadata } from "next";
import { deleteFaqAction, deleteTestimonialAction, saveFaqAction, saveTestimonialAction } from "@/app/admin/actions/business";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/data";
import { mediaUrl } from "@/lib/supabase/public";
import type { Faq, Settings, Testimonial } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: s }, { data: faqs }, { data: testimonials }] = await Promise.all([
    supabase.from("business_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("faqs").select("*").order("sort_order").order("created_at"),
    supabase.from("testimonials").select("*").order("sort_order").order("created_at"),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(s as Settings | null) };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-5xl">Settings</h1>
        <p className="mt-1 text-muted">Everything customers see on the website comes from here.</p>
      </div>

      <LogoUploader logoUrl={mediaUrl(settings.logo_path)} />
      <SettingsForm settings={settings} />

      <section aria-labelledby="faq-heading" className="panel space-y-4 p-5">
        <div>
          <h2 id="faq-heading" className="text-2xl">FAQ</h2>
          <p className="hint">The chatbot answers from these. Add keywords (comma separated) that customers might use.</p>
        </div>
        <ul className="space-y-4">
          {((faqs ?? []) as Faq[]).map((f) => (
            <li key={f.id} className="rounded-md border border-line-soft p-3">
              <form action={saveFaqAction.bind(null, f.id)} className="grid gap-3">
                <div><label htmlFor={`fq-${f.id}`} className="label">Question</label><input id={`fq-${f.id}`} name="question" defaultValue={f.question} className="field" required maxLength={200} /></div>
                <div><label htmlFor={`fa-${f.id}`} className="label">Answer</label><textarea id={`fa-${f.id}`} name="answer" defaultValue={f.answer} rows={3} className="field" required maxLength={2000} /></div>
                <div><label htmlFor={`fk-${f.id}`} className="label">Keywords</label><input id={`fk-${f.id}`} name="keywords" defaultValue={f.keywords} className="field" maxLength={300} placeholder="test before, try, inspect" /></div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={f.is_published} className="size-4 accent-[var(--accent)]" />Published</label>
                  <label className="flex items-center gap-2 text-sm">Order <input name="sort_order" type="number" defaultValue={f.sort_order} className="field w-20" /></label>
                  <button className="btn-secondary btn-sm">Save</button>
                </div>
              </form>
              <form action={deleteFaqAction.bind(null, f.id)} className="mt-2"><button className="btn-danger btn-sm">Delete</button></form>
            </li>
          ))}
        </ul>
        <form action={saveFaqAction.bind(null, null)} className="grid gap-3 rounded-md border border-dashed border-line p-3">
          <p className="font-medium">Add a question</p>
          <div><label htmlFor="nfq" className="label">Question</label><input id="nfq" name="question" className="field" required maxLength={200} /></div>
          <div><label htmlFor="nfa" className="label">Answer</label><textarea id="nfa" name="answer" rows={3} className="field" required maxLength={2000} /></div>
          <div><label htmlFor="nfk" className="label">Keywords</label><input id="nfk" name="keywords" className="field" maxLength={300} /></div>
          <input type="hidden" name="is_published" value="on" />
          <div><button className="btn-primary">Add question</button></div>
        </form>
      </section>

      <section aria-labelledby="t-heading" className="panel space-y-4 p-5">
        <div>
          <h2 id="t-heading" className="text-2xl">Customer testimonials</h2>
          <p className="hint">Only add real feedback from real customers. The section stays hidden on the website while this list is empty.</p>
        </div>
        <ul className="space-y-4">
          {((testimonials ?? []) as Testimonial[]).map((t) => (
            <li key={t.id} className="rounded-md border border-line-soft p-3">
              <form action={saveTestimonialAction.bind(null, t.id)} className="grid gap-3">
                <div><label htmlFor={`ta-${t.id}`} className="label">Customer name</label><input id={`ta-${t.id}`} name="author_name" defaultValue={t.author_name} className="field" required maxLength={80} /></div>
                <div><label htmlFor={`tb-${t.id}`} className="label">What they said</label><textarea id={`tb-${t.id}`} name="body" defaultValue={t.body} rows={3} className="field" required maxLength={600} /></div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={t.is_published} className="size-4 accent-[var(--accent)]" />Published</label>
                  <label className="flex items-center gap-2 text-sm">Order <input name="sort_order" type="number" defaultValue={t.sort_order} className="field w-20" /></label>
                  <button className="btn-secondary btn-sm">Save</button>
                </div>
              </form>
              <form action={deleteTestimonialAction.bind(null, t.id)} className="mt-2"><button className="btn-danger btn-sm">Delete</button></form>
            </li>
          ))}
        </ul>
        <form action={saveTestimonialAction.bind(null, null)} className="grid gap-3 rounded-md border border-dashed border-line p-3">
          <p className="font-medium">Add a testimonial</p>
          <div><label htmlFor="nta" className="label">Customer name</label><input id="nta" name="author_name" className="field" required maxLength={80} /></div>
          <div><label htmlFor="ntb" className="label">What they said</label><textarea id="ntb" name="body" rows={3} className="field" required maxLength={600} /></div>
          <input type="hidden" name="is_published" value="on" />
          <div><button className="btn-primary">Add testimonial</button></div>
        </form>
      </section>
    </div>
  );
}
