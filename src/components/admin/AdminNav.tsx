"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/admin/actions/auth";

const items = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/sales", label: "Sales" },
  { href: "/admin/inquiries", label: "Inquiries", badge: "inquiries" as const },
  { href: "/admin/inbox", label: "Chat inbox", badge: "inbox" as const },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ badges }: { badges: { inquiries: number; inbox: number } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const list = (
    <ul className="grid gap-1">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        const count = it.badge ? badges[it.badge] : 0;
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between rounded-md px-3 py-2.5 text-[0.95rem] ${active ? "bg-raised text-accent-strong" : "text-muted hover:bg-raised hover:text-text"}`}
            >
              {it.label}
              {count > 0 && <span className="rounded-full bg-accent px-2 text-xs font-semibold text-accent-ink">{count}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <nav aria-label="Admin" className="hidden w-full lg:block">{list}</nav>
      <div className="lg:hidden">
        <button type="button" className="btn-secondary btn-sm" aria-expanded={open} aria-controls="admin-mobile-nav" onClick={() => setOpen((v) => !v)}>
          Menu
        </button>
        {open && (
          <nav id="admin-mobile-nav" aria-label="Admin" className="panel absolute inset-x-3 top-14 z-30 p-2 shadow-xl shadow-black/50">
            {list}
            <div className="mt-2 flex gap-2 border-t border-line p-2">
              <Link href="/" target="_blank" className="btn-secondary btn-sm flex-1">View site</Link>
              <form action={logoutAction}><button className="btn-secondary btn-sm">Sign out</button></form>
            </div>
          </nav>
        )}
      </div>
    </>
  );
}
