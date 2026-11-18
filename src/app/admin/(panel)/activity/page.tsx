import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { formatDate, formatPrice } from "@/lib/format";
import { hoursAgoIso } from "@/lib/time";

export const metadata: Metadata = { title: "Activity" };

type Audit = { id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null; detail: Record<string, unknown> };
type SecEvent = { id: number; at: string; type: string; client: string; detail: string };

const AUDIT_LABEL: Record<string, string> = {
  product_created: "Product added",
  product_deleted: "Product deleted",
  product_archived: "Product archived",
  product_restored: "Product restored",
  price_changed: "Price changed",
  sale_recorded: "Sale recorded",
  sale_voided: "Sale voided",
  sale_restored: "Sale restored",
  settings_changed: "Settings changed",
  admin_added: "Admin account added",
  admin_removed: "Admin account removed",
};

const SEC_LABEL: Record<string, string> = {
  login_ok: "Admin sign-in",
  login_failed: "Failed sign-in",
  login_throttled: "Sign-in blocked (too many attempts)",
  admin_denied: "Signed in but not an admin",
};

export default async function ActivityPage() {
  const { supabase, user } = await requireAdmin();
  const settings = await getSettings();
  const since = hoursAgoIso(24);
  const [audit, events, failed24] = await Promise.all([
    supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(100),
    supabase.from("security_events").select("*").order("id", { ascending: false }).limit(100),
    supabase.from("security_events").select("id", { count: "exact", head: true }).in("type", ["login_failed", "login_throttled"]).gte("at", since),
  ]);
  const cur = settings.currency;

  const describe = (a: Audit) => {
    const d = a.detail ?? {};
    if (a.action === "price_changed") return `${d.name}: ${formatPrice(Number(d.from), cur)} to ${formatPrice(Number(d.to), cur)}`;
    if (a.action === "sale_recorded" || a.action === "sale_voided" || a.action === "sale_restored") return `${d.product} for ${formatPrice(Number(d.sale_price), cur)}`;
    if (a.action === "settings_changed") return `Fields: ${(d.fields as string[] | undefined)?.join(", ") ?? ""}`;
    if (a.action.startsWith("product_")) return String(d.name ?? "");
    return a.entity_id ? `id ${a.entity_id.slice(0, 8)}` : "";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-5xl">Activity</h1>
        <p className="mt-1 max-w-2xl text-muted">A record of important changes and sign-in attempts. Entries can&apos;t be edited or deleted from the website.</p>
      </div>

      {(failed24.count ?? 0) >= 5 && (
        <p role="alert" className="rounded-md border border-warn/50 bg-warn/10 px-4 py-3 text-warn">
          {failed24.count} failed or blocked sign-in attempts in the last 24 hours. If this wasn&apos;t you, change your password in Account.
        </p>
      )}

      <section aria-labelledby="audit-heading" className="panel p-5">
        <h2 id="audit-heading" className="text-2xl">Changes</h2>
        {((audit.data ?? []) as Audit[]).length === 0 ? (
          <p className="mt-3 text-muted">Nothing recorded yet. Price changes, sales, deleted products and settings changes will appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line-soft text-sm">
            {((audit.data ?? []) as Audit[]).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span><span className="font-medium">{AUDIT_LABEL[a.action] ?? a.action}</span>{describe(a) ? <span className="text-muted"> &middot; {describe(a)}</span> : null}</span>
                <span className="text-muted">{a.actor === user.id ? "You" : a.actor ? `Admin ${a.actor.slice(0, 6)}` : "Database (SQL)"} &middot; {formatDate(a.at, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sec-heading" className="panel p-5">
        <h2 id="sec-heading" className="text-2xl">Sign-ins</h2>
        <p className="hint">Accounts are shown as a short code, not an email address.</p>
        {((events.data ?? []) as SecEvent[]).length === 0 ? (
          <p className="mt-3 text-muted">No sign-in activity recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line-soft text-sm">
            {((events.data ?? []) as SecEvent[]).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span className={e.type === "login_ok" ? "" : "text-warn"}>{SEC_LABEL[e.type] ?? e.type}{e.detail ? <span className="text-muted"> &middot; {e.detail}</span> : null}</span>
                <span className="text-muted">visitor {e.client} &middot; {formatDate(e.at, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
