"use client";

import { useActionState } from "react";
import { changePasswordAction, requestPasswordResetAction, resetPasswordAction } from "@/app/admin/actions/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import type { ActionState } from "@/lib/validation";
import { FormBanner } from "./fields";

const initial: ActionState = { ok: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={action} className="space-y-4">
      <FormBanner state={state} />
      <div>
        <label htmlFor="fp-email" className="label">Admin email</label>
        <input id="fp-email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Sending..." : "Email me a reset link"}</button>
    </form>
  );
}

function NewPasswordFields({ id }: { id: string }) {
  return (
    <>
      <div>
        <label htmlFor={`${id}-pw`} className="label">New password</label>
        <input id={`${id}-pw`} name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className="field" />
        <p className="hint">At least {MIN_PASSWORD_LENGTH} characters. A few random words works well. Avoid common passwords.</p>
      </div>
      <div>
        <label htmlFor={`${id}-confirm`} className="label">Repeat the new password</label>
        <input id={`${id}-confirm`} name="confirm" type="password" autoComplete="new-password" required className="field" />
      </div>
    </>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <FormBanner state={state} />
      <NewPasswordFields id="rp" />
      <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Saving..." : "Set new password"}</button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormBanner state={state} />
      <div>
        <label htmlFor="cp-current" className="label">Current password</label>
        <input id="cp-current" name="current" type="password" autoComplete="current-password" required className="field" />
      </div>
      <NewPasswordFields id="cp" />
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving..." : "Change password"}</button>
    </form>
  );
}
