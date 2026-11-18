"use client";

import { useActionState } from "react";
import { submitInquiryAction } from "@/app/(site)/actions";
import type { ActionState } from "@/lib/validation";

const initial: ActionState = { ok: false };

export function InquiryForm({ productId, productName }: { productId?: string; productName?: string }) {
  const [state, action, pending] = useActionState(submitInquiryAction, initial);

  if (state.ok) {
    return (
      <div role="status" className="panel border-ok/40 p-6">
        <p className="font-display text-2xl font-bold text-ok">Message sent</p>
        <p className="mt-1 text-muted">{state.message}</p>
      </div>
    );
  }

  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={action} className="space-y-4" noValidate>
      {productId && <input type="hidden" name="productId" value={productId} />}
      {/* honeypot */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Company<input type="text" name="company" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state.message && !state.ok && (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{state.message}</p>
      )}
      <div>
        <label htmlFor="inq-name" className="label">Your name</label>
        <input id="inq-name" name="name" className="field" autoComplete="name" required maxLength={100} aria-invalid={Boolean(err("name"))} aria-describedby={err("name") ? "inq-name-err" : undefined} />
        {err("name") && <p id="inq-name-err" className="error-text">{err("name")}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="inq-phone" className="label">Phone</label>
          <input id="inq-phone" name="phone" type="tel" className="field" autoComplete="tel" maxLength={25} aria-invalid={Boolean(err("phone"))} aria-describedby={err("phone") ? "inq-phone-err" : undefined} />
          {err("phone") && <p id="inq-phone-err" className="error-text">{err("phone")}</p>}
        </div>
        <div>
          <label htmlFor="inq-email" className="label">Email</label>
          <input id="inq-email" name="email" type="email" className="field" autoComplete="email" maxLength={200} aria-invalid={Boolean(err("email"))} aria-describedby={err("email") ? "inq-email-err" : undefined} />
          {err("email") && <p id="inq-email-err" className="error-text">{err("email")}</p>}
        </div>
      </div>
      <p className="hint -mt-2">Give a phone number or an email so the seller can reply.</p>
      <div>
        <label htmlFor="inq-message" className="label">Message</label>
        <textarea
          id="inq-message"
          name="message"
          rows={4}
          className="field"
          required
          maxLength={2000}
          defaultValue={productName ? `Hello, I'm interested in ${productName}. Is it still available?` : ""}
          aria-invalid={Boolean(err("message"))}
          aria-describedby={err("message") ? "inq-message-err" : undefined}
        />
        {err("message") && <p id="inq-message-err" className="error-text">{err("message")}</p>}
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
