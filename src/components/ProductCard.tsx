import Image from "next/image";
import Link from "next/link";
import { sortImages } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { mediaUrl } from "@/lib/supabase/public";
import type { Product } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function ProductImagePlaceholder() {
  return (
    <div className="flex size-full items-center justify-center bg-raised text-line" aria-hidden>
      <svg viewBox="0 0 64 64" className="size-16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="18" y="6" width="28" height="52" rx="3" />
        <circle cx="32" cy="20" r="6" />
        <circle cx="32" cy="38" r="4" />
        <path d="M24 50h16" />
      </svg>
    </div>
  );
}

export function ProductCard({ product, currency, priority = false }: { product: Product; currency: string; priority?: boolean }) {
  const image = sortImages(product)[0];
  const src = mediaUrl(image?.storage_path);
  const specs = (
    [["CPU", product.cpu], ["GPU", product.gpu], ["RAM", product.ram], ["Storage", product.storage]] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <article className="group panel flex flex-col overflow-hidden transition-colors hover:border-copper/60">
      <Link href={`/pcs/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-raised" tabIndex={-1} aria-hidden>
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            priority={priority}
            className={`object-cover transition-transform duration-500 group-hover:scale-[1.03] ${product.status === "sold" ? "opacity-60 grayscale" : ""}`}
          />
        ) : (
          <ProductImagePlaceholder />
        )}
        <StatusBadge status={product.status} className="absolute left-3 top-3 bg-bg/85 backdrop-blur" />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-2xl">
          <Link href={`/pcs/${product.slug}`} className="hover:text-copper-strong">
            {product.name}
          </Link>
        </h3>
        {specs.length > 0 && (
          <dl className="divide-y divide-line-soft text-sm">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5">
                <dt className="text-muted">{k}</dt>
                <dd className="spec-value truncate text-right" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <p className="font-display text-3xl font-bold text-copper-strong">{formatPrice(product.price, currency)}</p>
          <Link href={`/pcs/${product.slug}`} className="btn-secondary btn-sm" aria-label={`View details of ${product.name}`}>
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}
