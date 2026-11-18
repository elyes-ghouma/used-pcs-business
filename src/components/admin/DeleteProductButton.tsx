"use client";

import { useActionState } from "react";
import { deleteProductAction } from "@/app/admin/actions/products";
import type { ActionState } from "@/lib/validation";
import { FormBanner } from "./fields";

export function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [state, action, pending] = useActionState(deleteProductAction.bind(null, productId), { ok: false } as ActionState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Permanently delete "${productName}" and its photos? This cannot be undone.`)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <FormBanner state={state} />
      <button type="submit" className="btn-danger" disabled={pending}>{pending ? "Deleting..." : "Delete permanently"}</button>
    </form>
  );
}
