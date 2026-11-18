"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "@/app/admin/actions/business";
import type { Settings } from "@/lib/types";
import type { ActionState } from "@/lib/validation";
import { Area, Field, FormBanner } from "./fields";

const initial: ActionState = { ok: false };
const toLines = (items: { title: string; description: string }[]) => items.map((i) => (i.description ? `${i.title} | ${i.description}` : i.title)).join("\n");

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateSettingsAction, initial);
  const e = state.fieldErrors;
  return (
    <form action={action} className="space-y-8">
      <FormBanner state={state} />

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Business</legend>
        <Field name="business_name" label="Business name" required defaultValue={settings.business_name} errors={e} maxLength={80} />
        <Field name="tagline" label="Tagline" defaultValue={settings.tagline} errors={e} maxLength={160} hint="Shown in the browser title. Optional." />
        <Area name="description" label="Description" defaultValue={settings.description} errors={e} rows={3} maxLength={1000} hint="Shown in the footer and used by search engines." />
        <Field name="hero_headline" label="Homepage headline" required defaultValue={settings.hero_headline} errors={e} maxLength={120} />
        <Area name="hero_subheadline" label="Homepage intro" defaultValue={settings.hero_subheadline} errors={e} rows={2} maxLength={300} />
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Contact</legend>
        <p className="hint -mt-2">Contact buttons only appear on the website for the fields you fill in.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="Phone number" defaultValue={settings.phone} errors={e} maxLength={30} inputMode="tel" placeholder="+216 20 123 456" />
          <Field name="whatsapp_number" label="WhatsApp number" defaultValue={settings.whatsapp_number} errors={e} maxLength={30} inputMode="tel" hint="International format, e.g. +216 20 123 456" />
        </div>
        <Field name="messenger_url" label="Messenger link" defaultValue={settings.messenger_url} errors={e} maxLength={300} placeholder="https://m.me/yourpage" hint="Messenger can't prefill a message, so the site copies it for the visitor to paste." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="facebook_url" label="Facebook page" defaultValue={settings.facebook_url} errors={e} maxLength={300} placeholder="https://facebook.com/yourpage" />
          <Field name="instagram_url" label="Instagram" defaultValue={settings.instagram_url} errors={e} maxLength={300} placeholder="https://instagram.com/yourpage" />
        </div>
        <Field name="location" label="Location" defaultValue={settings.location} errors={e} maxLength={300} />
        <Area name="working_hours" label="Working hours" defaultValue={settings.working_hours} errors={e} rows={2} maxLength={500} />
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Sales policies</legend>
        <p className="hint -mt-2">Only what you write here is shown (and quoted by the chatbot). Leave a field empty if you have no such policy.</p>
        <Field name="currency" label="Currency code" required defaultValue={settings.currency} errors={e} maxLength={3} hint="Three letters, e.g. TND, EUR, USD." />
        <Area name="delivery_info" label="Delivery information" defaultValue={settings.delivery_info} errors={e} rows={3} maxLength={2000} />
        <Area name="payment_methods" label="Accepted payment methods" defaultValue={settings.payment_methods} errors={e} rows={2} maxLength={1000} />
        <Area name="warranty_policy" label="Warranty policy" defaultValue={settings.warranty_policy} errors={e} rows={3} maxLength={2000} />
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Homepage sections</legend>
        <Area name="highlights" label="Why buy from us" defaultValue={toLines(settings.highlights)} errors={e} rows={5} hint="One point per line as Title | description (up to 8). Only write what is true. The section is hidden when empty." />
        <Area name="how_to_buy" label="How to buy" defaultValue={toLines(settings.how_to_buy)} errors={e} rows={4} hint="One step per line as Title | description (up to 8)." />
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" name="show_sold_products" defaultChecked={settings.show_sold_products} className="size-5 accent-[var(--copper)]" />
          <span>Keep sold PCs visible in the public catalog</span>
        </label>
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Chatbot</legend>
        <Area name="chatbot_welcome" label="Welcome message" required defaultValue={settings.chatbot_welcome} errors={e} rows={2} maxLength={500} />
      </fieldset>

      <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
