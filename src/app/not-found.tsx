import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="container-page flex min-h-dvh flex-col items-start justify-center gap-4 py-20">
      <h1 className="text-6xl">Page not found</h1>
      <p className="max-w-md text-muted">The page you are looking for doesn&apos;t exist or the PC has been removed.</p>
      <div className="flex gap-3">
        <Link href="/catalog" className="btn-primary">Browse PCs</Link>
        <Link href="/" className="btn-secondary">Go home</Link>
      </div>
    </main>
  );
}
