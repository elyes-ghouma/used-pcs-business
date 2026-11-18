import { getSettings } from "@/lib/data";
import { mediaUrl } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/** The site's chip mark on a dark tile: used until the owner uploads a logo in Settings. */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#14171d"/><g fill="none" stroke="#ffb224" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="16" height="16" rx="2"/><path d="M12.5 8V4.5M19.5 8V4.5M12.5 28v-3.5M19.5 28v-3.5M8 12.5H4.5M8 19.5H4.5M28 12.5h-3.5M28 19.5h-3.5"/></g><circle cx="16" cy="16" r="2.6" fill="#ffb224"/></svg>`;

const CACHE = "public, max-age=300";
const IMAGE_TYPES = ["image/webp", "image/png", "image/jpeg"];

/**
 * The browser-tab icon. When the owner has uploaded a logo (Settings) it is served from here, so the tab follows the
 * logo without a redeploy; otherwise the default mark. Only the project's own public storage URL is ever fetched,
 * and only image types are passed through.
 */
export async function GET() {
  const url = mediaUrl((await getSettings()).logo_path);
  if (url) {
    try {
      const res = await fetch(url);
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (res.ok && IMAGE_TYPES.includes(type)) {
        return new Response(await res.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": CACHE } });
      }
    } catch {
      // fall through to the default icon: a tab icon must never fail
    }
  }
  return new Response(FALLBACK_SVG, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": CACHE } });
}
