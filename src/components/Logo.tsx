import Image from "next/image";
import Link from "next/link";
import { mediaUrl } from "@/lib/supabase/public";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="18" height="18" rx="2" />
      <path d="M12 7V3M20 7V3M12 29v-4M20 29v-4M7 12H3M7 20H3M29 12h-4M29 20h-4" />
      <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Logo({ name, logoPath, href = "/" }: { name: string; logoPath: string | null; href?: string }) {
  const src = mediaUrl(logoPath);
  return (
    <Link href={href} className="flex items-center gap-3 text-text" aria-label={`${name}, home`}>
      {src ? (
        <Image src={src} alt="" width={40} height={40} className="size-10 rounded object-contain" />
      ) : (
        <LogoMark className="size-8 text-accent" />
      )}
      <span className="font-display text-[1.7rem] font-extrabold leading-none tracking-wide">{name}</span>
    </Link>
  );
}
