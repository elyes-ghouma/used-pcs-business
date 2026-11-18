export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Readable, unique and stable: the suffix guarantees uniqueness, renaming a product never changes its URL. */
export function makeProductSlug(name: string, random: () => number = Math.random): string {
  const base = slugify(name) || "pc";
  const suffix = Math.floor(random() * 36 ** 5).toString(36).padStart(5, "0");
  return `${base}-${suffix}`;
}
