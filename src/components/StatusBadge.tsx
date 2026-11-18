import { STATUS_LABEL, type ProductStatus } from "@/lib/types";

const tone: Record<ProductStatus, string> = {
  available: "text-ok border-ok/50 bg-ok/10",
  reserved: "text-warn border-warn/50 bg-warn/10",
  sold: "text-bad border-bad/50 bg-bad/10",
};

/** `label` lets the public site pass the translated text; the admin area uses the English default. */
export function StatusBadge({ status, label, className = "" }: { status: ProductStatus; label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold ${tone[status]} ${className}`}>
      <span aria-hidden className="size-1.5 bg-current" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
