"use client";

import { useActionState, useState } from "react";
import { recordSaleAction } from "@/app/admin/actions/business";
import type { ActionState } from "@/lib/validation";
import { Area, Field, FormBanner } from "./fields";

type Option = { id: string; name: string; price: number; status: string };
const initial: ActionState = { ok: false };

export function SaleForm({
  products, defaultProductId, inquiry, today, currency,
}: {
  products: Option[];
  defaultProductId?: string;
  inquiry?: { id: string; name: string; phone: string; email: string } | null;
  today: string;
  currency: string;
}) {
  const [state, action, pending] = useActionState(recordSaleAction, initial);
  const [productId, setProductId] = useState(defaultProductId ?? "");
  const selected = products.find((p) => p.id === productId);
  const [price, setPrice] = useState(selected ? String(selected.price) : "");
  const e = state.fieldErrors;

  return (
    <form action={action} className="space-y-6">
      <FormBanner state={state} />
      {inquiry && <input type="hidden" name="inquiryId" value={inquiry.id} />}
      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Sale</legend>
        <div>
          <label htmlFor="productId" className="label">Product <span className="text-accent">*</span></label>
          <select
            id="productId" name="productId" required value={productId} className="field"
            onChange={(ev) => {
              setProductId(ev.target.value);
              const p = products.find((x) => x.id === ev.target.value);
              if (p) setPrice(String(p.price));
            }}
          >
            <option value="">Choose a PC...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
            ))}
          </select>
          {e?.productId && <p className="error-text">{e.productId[0]}</p>}
          {products.length === 0 && <p className="hint">There are no available or reserved PCs to sell.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="salePrice" className="label">Actual selling price ({currency}) <span className="text-accent">*</span></label>
            <input id="salePrice" name="salePrice" required inputMode="decimal" value={price} onChange={(ev) => setPrice(ev.target.value)} className="field" aria-invalid={Boolean(e?.salePrice)} />
            {selected && <p className="hint">Listed price: {selected.price}</p>}
            {e?.salePrice && <p className="error-text">{e.salePrice[0]}</p>}
          </div>
          <Field name="soldAt" label="Sale date" type="date" required defaultValue={today} errors={e} />
        </div>
      </fieldset>

      <fieldset className="panel space-y-4 p-5">
        <legend className="px-1 font-display text-2xl font-bold">Customer (optional)</legend>
        <Field name="customerName" label="Name" defaultValue={inquiry?.name} errors={e} maxLength={120} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="customerPhone" label="Phone" defaultValue={inquiry?.phone} errors={e} maxLength={40} />
          <Field name="customerEmail" label="Email" type="text" defaultValue={inquiry?.email} errors={e} maxLength={200} />
        </div>
        <Area name="notes" label="Internal notes" errors={e} hint="Only you can see these (payment method, delivery, etc.)." />
      </fieldset>

      <p className="text-sm text-muted">Recording the sale marks the PC as sold, removes it from the available stock and adds the amount to your revenue. No payment is processed by the website.</p>
      <button type="submit" className="btn-primary" disabled={pending || products.length === 0}>{pending ? "Recording..." : "Record sale"}</button>
    </form>
  );
}
