import Image from "next/image";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { sortImages } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { mediaUrl } from "@/lib/supabase/public";
import type { Product } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

/** Shown when a PC has no photo yet: quiet graph paper, not a clip-art icon. */
export function ProductImagePlaceholder() {
  return <div className="photo-empty size-full" aria-hidden />;
}

/**
 * A spec tag: photo, name, the four specs buyers ask about as a dotted-leader readout, and the price on its own strip.
 * The whole card is one link (the title carries it), so there is no second "View details" button.
 */
export async function ProductCard({ product, currency, priority = false }: { product: Product; currency: string; priority?: boolean }) {
  const { t, locale } = await getT();
  const image = sortImages(product)[0];
  const src = mediaUrl(image?.storage_path);
  const specs = (
    [["cpu", product.cpu], ["gpu", product.gpu], ["ram", product.ram], ["storage", product.storage]] as const
  ).filter(([, v]) => v);
  const sold = product.status === "sold";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface transition-colors hover:border-accent">
      <div className="relative aspect-[4/3] overflow-hidden bg-raised">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            priority={priority}
            className={`object-cover transition-transform duration-500 group-hover:scale-[1.03] ${sold ? "opacity-60 grayscale" : ""}`}
          />
        ) : (
          <ProductImagePlaceholder />
        )}
        <StatusBadge status={product.status} label={t(`status.${product.status}`)} className="absolute left-3 top-3 bg-bg-deep/90" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <h3 className="text-[1.65rem] leading-[1.1]">
          <Link href={`/pcs/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2">
            {product.name}
          </Link>
        </h3>
        {specs.length > 0 ? (
          <dl className="space-y-2 text-sm">
            {specs.map(([k, v]) => (
              <div key={k} className="leader">
                <dt className="leader-label">{t(`spec.${k}`)}</dt>
                <span className="leader-fill" aria-hidden />
                <dd className="leader-value max-w-[62%] truncate" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">{t("card.noSpecs")}</p>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-line bg-raised px-4 py-3">
        <p className="whitespace-nowrap font-display text-[1.85rem] font-extrabold leading-none text-accent-strong">{formatPrice(product.price, currency, locale)}</p>
        <span className="whitespace-nowrap text-sm text-muted group-hover:text-text">{sold ? t("card.sold") : t("card.seeSpecs")}</span>
      </div>
    </article>
  );
}
