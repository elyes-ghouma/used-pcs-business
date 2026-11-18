import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";

/**
 * Runs against a REAL Supabase project (the test project), through the public API exactly as a browser would.
 * Skipped unless NEXT_PUBLIC_SUPABASE_URL, the publishable key and E2E_ADMIN_* are set (see README -> Testing).
 * Everything it creates is prefixed "LIVE-" ; run the cleanup SQL from the README afterwards.
 */
dotenv.config({ path: ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const enabled = Boolean(URL && KEY && EMAIL && PASSWORD);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const tag = "LIVE-" + Date.now().toString(36);

describe.skipIf(!enabled)("live Supabase project", () => {
  let anon: SupabaseClient;
  let admin: SupabaseClient;
  const mk = (n: string) => ({ slug: `${n}-${randomUUID().slice(0, 6)}`.toLowerCase(), name: `${tag} ${n}`, price: 1500 });

  beforeAll(async () => {
    anon = createClient(URL!, KEY!, { auth: { persistSession: false } });
    admin = createClient(URL!, KEY!, { auth: { persistSession: false } });
    const { error } = await admin.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! });
    expect(error).toBeNull();
  });

  describe("anonymous visitors", () => {
    it("cannot write products or read private tables", async () => {
      expect((await anon.from("products").insert(mk("anon"))).error).not.toBeNull();
      for (const table of ["sales", "inquiries", "conversations", "messages", "admins", "contact_events", "product_status_history"]) {
        const res = await anon.from(table).select("*").limit(1);
        expect(res.error ?? { data: res.data }).toBeTruthy();
        expect(res.data?.length ?? 0).toBe(0);
      }
    });

    it("cannot call admin functions", async () => {
      expect((await anon.rpc("record_sale", { p_product_id: randomUUID(), p_sale_price: 1 })).error).not.toBeNull();
      expect((await anon.rpc("admin_dashboard_stats")).error).not.toBeNull();
      expect((await anon.rpc("void_sale", { p_sale_id: randomUUID() })).error).not.toBeNull();
      expect((await anon.rpc("set_product_status", { p_product_id: randomUUID(), p_status: "reserved" })).error).not.toBeNull();
    });

    it("cannot call internal helpers or tamper with settings", async () => {
      expect((await anon.rpc("_conversation_for_token", { p_token: "x".repeat(40) })).error).not.toBeNull();
      const upd = await anon.from("business_settings").update({ business_name: "pwned" }).eq("id", 1).select();
      expect(upd.data ?? []).toHaveLength(0);
    });

    it("can read public settings and filter options", async () => {
      const s = await anon.from("business_settings").select("business_name,currency").single();
      expect(s.error).toBeNull();
      expect(s.data?.currency).toMatch(/^[A-Z]{3}$/);
      expect((await anon.rpc("catalog_filter_options")).error).toBeNull();
    });

    it("inquiries are validated by the database", async () => {
      const bad = await anon.rpc("submit_inquiry", { p_name: "A", p_phone: "20123456", p_email: "", p_message: "hello there" });
      expect(bad.error?.message).toMatch(/invalid_name/);
      const ok = await anon.rpc("submit_inquiry", { p_name: `${tag} Visitor`, p_phone: "20123456", p_email: "", p_message: "Is it available?" });
      expect(ok.error).toBeNull();
    });

    it("chat: token flow works and a wrong token is rejected", async () => {
      const start = await anon.rpc("chat_start");
      expect(start.error).toBeNull();
      const { token } = start.data as { token: string };
      expect((await anon.rpc("chat_post_visitor_message", { p_token: token, p_body: `${tag} hello` })).error).toBeNull();
      const got = await anon.rpc("chat_get_messages", { p_token: token, p_after: 0 });
      expect(got.data.messages).toHaveLength(1);
      expect((await anon.rpc("chat_get_messages", { p_token: "a".repeat(64), p_after: 0 })).error?.message).toMatch(/conversation_not_found/);
    });
  });

  describe("signed-in admin", () => {
    it("is recognised as admin", async () => {
      expect((await admin.rpc("is_admin")).data).toBe(true);
      expect((await anon.rpc("is_admin")).data).toBe(false);
    });

    it("sale lifecycle: reserve, sell, no double sale, revenue, void, archive", async () => {
      const ins = await admin.from("products").insert(mk("sale")).select("id, slug").single();
      expect(ins.error).toBeNull();
      const id = ins.data!.id as string;

      // direct status edits are refused, even for admins
      expect((await admin.from("products").update({ status: "sold" }).eq("id", id)).error?.message).toMatch(/status_change_requires_function/);
      expect((await admin.rpc("set_product_status", { p_product_id: id, p_status: "reserved", p_note: tag })).error).toBeNull();

      // anon sees it (reserved is public) with its real status
      const seen = await anon.from("products").select("status").eq("id", id).single();
      expect(seen.data?.status).toBe("reserved");

      const before = (await admin.rpc("admin_dashboard_stats")).data;
      const sale = await admin.rpc("record_sale", { p_product_id: id, p_sale_price: 1234.5, p_customer_name: `${tag} Buyer` });
      expect(sale.error).toBeNull();
      expect((await admin.rpc("record_sale", { p_product_id: id, p_sale_price: 1 })).error?.message).toMatch(/product_already_sold/);

      const after = (await admin.rpc("admin_dashboard_stats")).data;
      expect(Number(after.revenue) - Number(before.revenue)).toBeCloseTo(1234.5, 3);
      expect(after.sales_count - before.sales_count).toBe(1);

      // sold products are hidden from the public by default
      expect((await anon.from("products").select("id").eq("id", id)).data).toHaveLength(0);

      // history is recorded
      const hist = await admin.from("product_status_history").select("to_status").eq("product_id", id).order("id");
      expect(hist.data?.map((h) => h.to_status)).toEqual(["available", "reserved", "sold"]);

      // a PC with a sale can't be deleted
      expect((await admin.from("products").delete().eq("id", id)).error?.code).toBe("23503");

      expect((await admin.rpc("void_sale", { p_sale_id: sale.data, p_reason: tag })).error).toBeNull();
      const restored = await admin.from("products").select("status").eq("id", id).single();
      expect(restored.data?.status).toBe("available");
      const final = (await admin.rpc("admin_dashboard_stats")).data;
      expect(Number(final.revenue)).toBeCloseTo(Number(before.revenue), 3);

      expect((await admin.from("products").update({ is_archived: true }).eq("id", id)).error).toBeNull();
    });

    it("a product without sales can be deleted", async () => {
      const ins = await admin.from("products").insert(mk("delete")).select("id").single();
      expect((await admin.from("products").delete().eq("id", ins.data!.id)).error).toBeNull();
    });

    it("can read inquiries and the chat it received", async () => {
      const inq = await admin.from("inquiries").select("name").like("name", `${tag}%`);
      expect(inq.data?.length).toBeGreaterThan(0);
      const conv = await admin.from("messages").select("body").like("body", `${tag}%`);
      expect(conv.data?.length).toBeGreaterThan(0);
    });
  });

  describe("storage bucket", () => {
    const path = () => `products/${randomUUID()}/${randomUUID()}.png`;

    it("anonymous uploads are refused", async () => {
      const res = await anon.storage.from("site-media").upload(path(), PNG, { contentType: "image/png" });
      expect(res.error).not.toBeNull();
    });

    it("admin can upload an image, which is then publicly readable", async () => {
      const p = path();
      const up = await admin.storage.from("site-media").upload(p, PNG, { contentType: "image/png" });
      expect(up.error).toBeNull();
      const res = await fetch(`${URL}/storage/v1/object/public/site-media/${p}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      expect((await admin.storage.from("site-media").remove([p])).error).toBeNull();
    });

    it("the bucket rejects non-image types and oversized files even for admins", async () => {
      const html = await admin.storage.from("site-media").upload(`products/${randomUUID()}/${randomUUID()}.html`, Buffer.from("<script>alert(1)</script>"), { contentType: "text/html" });
      expect(html.error).not.toBeNull();
      const big = await admin.storage.from("site-media").upload(path(), Buffer.alloc(5 * 1024 * 1024 + 1024), { contentType: "image/png" });
      expect(big.error).not.toBeNull();
    });

    it("the bucket cannot be listed anonymously", async () => {
      const res = await anon.storage.from("site-media").list("products");
      expect(res.data ?? []).toHaveLength(0);
    });
  });
});
