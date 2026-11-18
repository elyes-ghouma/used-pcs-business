import { STATUS_LABEL, type ProductStatus } from "@/lib/types";

const tone: Record<ProductStatus, string> = {
  available: "text-ok border-ok/40 bg-ok/10",
  reserved: "text-warn border-warn/40 bg-warn/10",
  sold: "text-bad border-bad/40 bg-bad/10",
};

export function StatusBadge({ status, className = "" }: { status: ProductStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone[status]} ${className}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}
