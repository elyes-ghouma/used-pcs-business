"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/validation";
import type { Product } from "@/lib/types";
import { Area, Field, FormBanner } from "./fields";

type Suggestions = { cpu: string[]; gpu: string[]; ram: string[]; storage: string[] };
const initial: ActionState = { ok: false };

export function ProductForm({
  action, product, suggestions, submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  product?: Product;
  suggestions: Suggestions;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const e = state.fieldErrors;
  const extra = (product?.extra_specs ?? []).map((s) => `${s.label}: ${s.value}`).join("\n");

  return (
    <form action={formAction} className="space-y-8">
      <FormBanner state={state} />

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Basics</legend>
        <Field name="name" label="Product name" required errors={e} defaultValue={product?.name} maxLength={160} placeholder="e.g. Ryzen 5 5600 / RTX 3060 gaming PC" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="price" label="Price" required errors={e} defaultValue={product ? String(Number(product.price)) : ""} inputMode="decimal" hint="Up to 3 decimals, e.g. 1850 or 1850.500" />
          <div className="flex items-end pb-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" name="is_featured" defaultChecked={product?.is_featured} className="size-5 accent-[var(--copper)]" />
              <span>Featured on the homepage</span>
            </label>
          </div>
        </div>
        <Area name="description" label="Description" errors={e} defaultValue={product?.description} rows={5} maxLength={5000} />
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Specifications</legend>
        <p className="hint -mt-2">Fill only what applies. Empty fields are hidden on the website.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="cpu" label="CPU" errors={e} defaultValue={product?.cpu} list="dl-cpu" maxLength={120} />
          <Field name="gpu" label="GPU" errors={e} defaultValue={product?.gpu} list="dl-gpu" maxLength={120} />
          <Field name="motherboard" label="Motherboard" errors={e} defaultValue={product?.motherboard} maxLength={120} />
          <Field name="ram" label="RAM" errors={e} defaultValue={product?.ram} list="dl-ram" maxLength={120} placeholder="e.g. 16GB DDR4" />
          <Field name="storage" label="Storage" errors={e} defaultValue={product?.storage} list="dl-storage" maxLength={120} placeholder="e.g. 512GB NVMe SSD" />
          <Field name="psu" label="Power supply" errors={e} defaultValue={product?.psu} maxLength={120} />
          <Field name="case_name" label="Case" errors={e} defaultValue={product?.case_name} maxLength={120} />
          <Field name="cooling" label="Cooling" errors={e} defaultValue={product?.cooling} maxLength={120} />
          <Field name="os" label="Operating system" errors={e} defaultValue={product?.os} maxLength={120} />
        </div>
        <Area name="extra_specs" label="Other details" errors={e} defaultValue={extra} rows={3} hint="One per line, as Label: value (for example Monitor: 24 inch 144Hz)." />
        {(["cpu", "gpu", "ram", "storage"] as const).map((k) => (
          <datalist key={k} id={`dl-${k}`}>{suggestions[k].map((v) => <option key={v} value={v} />)}</datalist>
        ))}
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Condition and guarantees</legend>
        <Field name="condition" label="Condition" errors={e} defaultValue={product?.condition} maxLength={500} placeholder="e.g. Very good, no scratches" />
        <Area name="testing_info" label="Testing information" errors={e} defaultValue={product?.testing_info} hint="Only write tests you actually performed." />
        <Area name="accessories" label="Included accessories" errors={e} defaultValue={product?.accessories} />
        <Field name="warranty_info" label="Warranty information" errors={e} defaultValue={product?.warranty_info} maxLength={1000} hint="Leave empty if there is no warranty on this PC." />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving..." : submitLabel}</button>
      </div>
    </form>
  );
}
