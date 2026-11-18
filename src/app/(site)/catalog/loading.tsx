import { getT } from "@/i18n/server";

export default async function Loading() {
  const { t } = await getT();
  return (
    <div className="container-page py-10" aria-busy="true" aria-live="polite">
      <div className="h-12 w-56 animate-pulse rounded bg-surface" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_1fr]">
        <div className="panel h-96 animate-pulse" />
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="panel h-80 animate-pulse" />
          ))}
        </ul>
      </div>
      <span className="sr-only">{t("catalog.loading")}</span>
    </div>
  );
}
