"use client";

import Image from "next/image";
import { useState } from "react";
import { useT } from "@/i18n/client";

export function ProductGallery({ images, name, soldOut }: { images: { id: string; url: string }[]; name: string; soldOut: boolean }) {
  const [index, setIndex] = useState(0);
  const t = useT();
  if (images.length === 0) {
    return (
      <div className="photo-empty flex aspect-[4/3] items-end rounded-md border border-line p-5" role="img" aria-label={t("gallery.noneAria")}>
        <p className="text-sm text-muted">{t("gallery.none")}</p>
      </div>
    );
  }
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div>
      <div className="panel relative aspect-[4/3] overflow-hidden">
        <Image
          key={current.id}
          src={current.url}
          alt={t("gallery.alt", { name, i: index + 1, n: images.length })}
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className={`object-cover ${soldOut ? "opacity-70 grayscale" : ""}`}
        />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label={t("gallery.photos")}>
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t("gallery.show", { i: i + 1 })}
                aria-current={i === index}
                className={`relative block aspect-square w-full overflow-hidden rounded-md border ${i === index ? "border-accent" : "border-line hover:border-muted"}`}
              >
                <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
