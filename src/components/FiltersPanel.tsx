"use client";

import { useState } from "react";

/** Filters are always visible on large screens and collapse behind a button on phones. */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="h-fit">
      <button
        type="button"
        className="btn-secondary w-full lg:hidden"
        aria-expanded={open}
        aria-controls="catalog-filters"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide filters" : `Filters${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
      </button>
      <div id="catalog-filters" className={`${open ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>
        {children}
      </div>
    </div>
  );
}
