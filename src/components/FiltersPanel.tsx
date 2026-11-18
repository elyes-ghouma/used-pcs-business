"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";

/** Filters are always visible on large screens and collapse behind a button on phones. */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="h-fit">
      <button
        type="button"
        className="btn-secondary w-full lg:hidden"
        aria-expanded={open}
        aria-controls="catalog-filters"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t("catalog.hideFilters") : activeCount > 0 ? t("catalog.filtersActive", { n: activeCount }) : t("catalog.filters")}
      </button>
      <div id="catalog-filters" className={`${open ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>
        {children}
      </div>
    </div>
  );
}
