"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/admin/actions/auth";
import type { ActionState } from "@/lib/validation";

const initial: ActionState = { ok: false };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message && <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{state.message}</p>}
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
      <p className="text-sm"><Link href="/admin/forgot-password" className="text-accent hover:text-accent-strong">Forgot your password?</Link></p>
    </form>
  );
}
