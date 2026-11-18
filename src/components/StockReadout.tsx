import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

function Row({ i, label, children }: { i: number; label: string; children: React.ReactNode }) {
  return (
    <div className="leader post-line" style={{ ["--i" as string]: i }}>
      <dt className="leader-label">{label}</dt>
      <span className="leader-fill" aria-hidden />
      <dd className="leader-value">{children}</dd>
    </div>
  );
}

/**
 * The hero's one memorable element: the shop's actual stock, printed like a BIOS screen.
 * Every number is read from the database at request time; nothing here is a claim the owner didn't make.
 */
export function StockReadout({
  available, reserved, newest, currency,
}: {
  available: number;
  reserved: number;
  newest: Product | null;
  currency: string;
}) {
  return (
    <div role="group" aria-label="Current stock" className="rounded border border-white/25 bg-bg-deep p-5 shadow-2xl shadow-black/40 sm:p-6">
      <p className="mb-5 flex items-center gap-2 text-sm text-muted">
        <span className="size-2 bg-accent" aria-hidden />
        Current stock
      </p>
      <dl className="space-y-3.5 text-[0.95rem]">
        <Row i={0} label="Units available">{available}</Row>
        <Row i={1} label="Units reserved">{reserved}</Row>
        {newest ? (
          <>
            <Row i={2} label="Newest listing">
              <Link href={`/pcs/${newest.slug}`} className="underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-strong">
                {newest.name}
              </Link>
            </Row>
            <Row i={3} label="Asking price">
              <span className="text-accent-strong">{formatPrice(newest.price, currency)}</span>
              <span className="post-cursor" aria-hidden />
            </Row>
          </>
        ) : (
          <Row i={2} label="Next arrivals">
            ask the seller
            <span className="post-cursor" aria-hidden />
          </Row>
        )}
      </dl>
    </div>
  );
}
