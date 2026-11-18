import type { Metadata } from "next";
import Link from "next/link";
import { createProductAction } from "@/app/admin/actions/products";
import { ProductForm } from "@/components/admin/ProductForm";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Add a PC" };

export default async function NewProductPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("catalog_filter_options");
  const suggestions = { cpu: data?.cpu ?? [], gpu: data?.gpu ?? [], ram: data?.ram ?? [], storage: data?.storage ?? [] };
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-muted hover:text-text">&larr; Products</Link>
        <h1 className="mt-1 text-5xl">Add a PC</h1>
        <p className="mt-1 text-muted">Save the PC first, then you can add photos.</p>
      </div>
      <ProductForm action={createProductAction} suggestions={suggestions} submitLabel="Save and add photos" />
    </div>
  );
}
