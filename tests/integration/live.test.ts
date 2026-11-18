import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs against a REAL Supabase project, through the public API exactly as a browser or an attacker would.
 * It is meant for a TEST project: values come from .env.test.local when present (never the live shop's .env.local
 * unless you deliberately remove that file). Skipped unless the URL, publishable key, GATEWAY_KEY and test users are set.
 * Everything it creates is prefixed "LIVE-" or "SEC-".
 */
if (fs.existsSync(".env.test.local")) dotenv.config({ path: ".env.test.local", override: true, quiet: true });
dotenv.config({ path: ".env.local", quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GATEWAY = process.env.GATEWAY_KEY;
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const USER = { email: process.env.E2E_NONADMIN_EMAIL, password: process.env.E2E_NONADMIN_PASSWORD };
const enabled = Boolean(URL && KEY && GATEWAY && ADMIN.email && ADMIN.password && USER.email && USER.password);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const tag = "LIVE-" + Date.now().toString(36);
const newClientId = () => randomBytes(16).toString("hex");

/** A client that behaves like our Next.js server: it sends the gateway key and a visitor id. */
const gateway = (clientId = newClientId()) =>
  createClient(URL!, KEY!, { auth: { persistSession: false }, global: { headers: { "x-gateway-key": GATEWAY!, "x-client-id": clientId } } });

describe.skipIf(!enabled)("live Supabase project (security)", () => {
  let anon: SupabaseClient;
  let admin: SupabaseClient;
  let user: SupabaseClient; // signed up with the public key, but NOT an admin
  const mk = (n: string) => ({ slug: `${n}-${randomUUID().slice(0, 6)}`.toLowerCase(), name: `${tag} ${n}`, price: 1500 });

  beforeAll(async () => {
    anon = createClient(URL!, KEY!, { auth: { persistSession: false } });
    admin = createClient(URL!, KEY!, { auth: { persistSession: false } });
    user = createClient(URL!, KEY!, { auth: { persistSession: false } });
    expect((await admin.auth.signInWithPassword({ email: ADMIN.email!, password: ADMIN.password! })).error).toBeNull();
    expect((await user.auth.signInWithPassword({ email: USER.email!, password: USER.password! })).error).toBeNull();
  });

  describe("direct API access with only the public key", () => {
    const attempts: [string, Record<string, unknown>][] = [
      ["chat_start", {}],
      ["submit_inquiry", { p_name: "Eve Attacker", p_phone: "20123456", p_email: "", p_message: "spam spam" }],
      ["track_contact_event", { p_product_id: null, p_channel: "whatsapp" }],
      ["chat_post_visitor_message", { p_token: "a".repeat(64), p_body: "hi" }],
      ["chat_post_bot_message", { p_token: "a".repeat(64), p_body: "I am the official bot" }],
      ["chat_escalate", { p_token: "a".repeat(64), p_name: "Eve", p_contact: "20123456", p_message: "hello" }],
      ["chat_get_messages", { p_token: "a".repeat(64), p_after: 0 }],
      ["log_security_event", { p_type: "login_ok", p_detail: "forged" }],
      ["check_login_allowed", { p_email_hash: "abcdef0123456789" }],
    ];
    it.each(attempts)("%s is refused with 'forbidden'", async (fn, args) => {
      const res = await anon.rpc(fn, args);
      expect(res.error?.message).toBe("forbidden");
      const wrong = await createClient(URL!, KEY!, { global: { headers: { "x-gateway-key": "x".repeat(64) } } }).rpc(fn, args);
      expect(wrong.error?.message).toBe("forbidden");
    });

    it("cannot write products or read/write any private table", async () => {
      expect((await anon.from("products").insert(mk("anon"))).error).not.toBeNull();
      for (const table of ["sales", "inquiries", "conversations", "messages", "admins", "contact_events", "product_status_history", "audit_log", "security_events"]) {
        const res = await anon.from(table).select("*").limit(1);
        expect(res.data?.length ?? 0).toBe(0);
        expect((await anon.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000")).data ?? null).toBeNull();
      }
    });

    it("cannot call admin functions or the private schema", async () => {
      expect((await anon.rpc("record_sale", { p_product_id: randomUUID(), p_sale_price: 1 })).error).not.toBeNull();
      expect((await anon.rpc("admin_dashboard_stats")).error).not.toBeNull();
      expect((await anon.rpc("void_sale", { p_sale_id: randomUUID() })).error).not.toBeNull();
      expect((await anon.rpc("set_product_status", { p_product_id: randomUUID(), p_status: "reserved" })).error).not.toBeNull();
      expect((await anon.rpc("_conversation_for_token", { p_token: "x".repeat(40) })).error).not.toBeNull();
      expect((await anon.schema("private" as never).from("gateway_key" as never).select("*")).error).not.toBeNull();
      const upd = await anon.from("business_settings").update({ business_name: "pwned" }).eq("id", 1).select();
      expect(upd.data ?? []).toHaveLength(0);
    });

    it("can read public settings and filter options only", async () => {
      const s = await anon.from("business_settings").select("business_name,currency").single();
      expect(s.error).toBeNull();
      expect((await anon.rpc("catalog_filter_options")).error).toBeNull();
    });

    it("SQL-injection style input through filters is just treated as text", async () => {
      // (Supabase's edge firewall blocks the most obvious payloads before they arrive; these get through to PostgREST.)
      for (const evil of ["O'Brien", "' or '1'='1", "a);b", "%'; drop--", "50%_off", "name.eq.x,status.eq.sold"]) {
        const byName = await anon.from("products").select("id").ilike("name", `%${evil}%`);
        expect(byName.error, evil).toBeNull();
        expect(byName.data, evil).toEqual([]); // parameterised: matches nothing, injects nothing
      }
      const probe = await anon.from("products").select("id").limit(1);
      expect(probe.error).toBeNull(); // the table is still there
    });
  });

  describe("through the gateway (our server): validation, limits and token isolation", () => {
    it("inquiries are validated by the database", async () => {
      const g = gateway();
      expect((await g.rpc("submit_inquiry", { p_name: "A", p_phone: "20123456", p_email: "", p_message: "hello there" })).error?.message).toMatch(/invalid_name/);
      expect((await g.rpc("submit_inquiry", { p_name: "Valid Name", p_phone: "", p_email: "", p_message: "hello there" })).error?.message).toMatch(/contact_required/);
      const ok = await g.rpc("submit_inquiry", { p_name: `${tag} Visitor`, p_phone: "20123456", p_email: "", p_message: "<script>alert(1)</script> is it available?" });
      expect(ok.error).toBeNull();
    });

    it("one visitor can only open a few conversations per hour; another visitor is unaffected", async () => {
      const spammer = newClientId();
      for (let i = 0; i < 6; i++) expect((await gateway(spammer).rpc("chat_start")).error).toBeNull();
      expect((await gateway(spammer).rpc("chat_start")).error?.message).toMatch(/rate_limited/);
      expect((await gateway().rpc("chat_start")).error).toBeNull();
    });

    it("a conversation token only opens its own conversation (no IDOR)", async () => {
      const g = gateway();
      const a = (await g.rpc("chat_start")).data as { token: string; conversation_id: string };
      const b = (await g.rpc("chat_start")).data as { token: string; conversation_id: string };
      await g.rpc("chat_post_visitor_message", { p_token: a.token, p_body: `${tag} secret A` });
      await g.rpc("chat_post_visitor_message", { p_token: b.token, p_body: `${tag} secret B` });
      const readA = (await g.rpc("chat_get_messages", { p_token: a.token, p_after: 0 })).data;
      expect(JSON.stringify(readA)).toContain("secret A");
      expect(JSON.stringify(readA)).not.toContain("secret B");
      // guessing / mangling a token reveals nothing
      for (const t of [a.token.slice(0, -1) + "0", a.token.toUpperCase(), a.conversation_id, "' or 1=1 --" + "x".repeat(40)]) {
        expect((await g.rpc("chat_get_messages", { p_token: t, p_after: 0 })).error?.message).toMatch(/conversation_not_found/);
      }
    });

    it("messages from visitors are stored as plain text and cannot claim to be the seller or the bot", async () => {
      const g = gateway();
      const c = (await g.rpc("chat_start")).data as { token: string; conversation_id: string };
      await g.rpc("chat_post_visitor_message", { p_token: c.token, p_body: `${tag} <img src=x onerror=alert(1)>` });
      const rows = await admin.from("messages").select("sender, body").eq("conversation_id", c.conversation_id);
      expect(rows.data).toEqual([{ sender: "visitor", body: `${tag} <img src=x onerror=alert(1)>` }]);
      // the table itself refuses a direct visitor insert claiming to be the admin
      expect((await anon.from("messages").insert({ conversation_id: c.conversation_id, sender: "admin", body: "fake seller" })).error).not.toBeNull();
    });
  });

  describe("a signed-in non-admin user (anyone can sign up with the public key)", () => {
    it("is not an admin and gets no extra power from being signed in", async () => {
      expect((await user.rpc("is_admin")).data).toBe(false);
      for (const table of ["sales", "inquiries", "conversations", "messages", "admins", "contact_events", "product_status_history", "audit_log", "security_events"]) {
        expect((await user.from(table).select("*").limit(1)).data ?? []).toHaveLength(0);
      }
    });

    it("cannot write products, settings, FAQs or inquiries", async () => {
      expect((await user.from("products").insert(mk("user"))).error).not.toBeNull();
      expect((await user.from("faqs").insert({ question: "Hacked?", answer: "yes" })).error).not.toBeNull();
      expect(((await user.from("business_settings").update({ business_name: "pwned" }).eq("id", 1).select()).data ?? [])).toHaveLength(0);
      expect(((await user.from("inquiries").update({ status: "closed" }).neq("status", "x").select()).data ?? [])).toHaveLength(0);
    });

    it("cannot call admin functions or make itself an admin", async () => {
      expect((await user.rpc("record_sale", { p_product_id: randomUUID(), p_sale_price: 1 })).error?.message).toMatch(/not_authorized/);
      expect((await user.rpc("admin_dashboard_stats")).error?.message).toMatch(/not_authorized/);
      expect((await user.rpc("void_sale", { p_sale_id: randomUUID() })).error?.message).toMatch(/not_authorized/);
      const me = (await user.auth.getUser()).data.user!;
      expect((await user.from("admins").insert({ user_id: me.id })).error).not.toBeNull();
      expect((await user.rpc("is_admin")).data).toBe(false);
    });

    it("cannot use the gateway functions without the server key, cannot upload files", async () => {
      expect((await user.rpc("chat_start")).error?.message).toBe("forbidden");
      expect((await user.storage.from("site-media").upload(`products/${randomUUID()}/${randomUUID()}.png`, PNG, { contentType: "image/png" })).error).not.toBeNull();
    });

    it("cannot post as the seller in a conversation", async () => {
      const c = (await gateway().rpc("chat_start")).data as { conversation_id: string };
      expect((await user.from("messages").insert({ conversation_id: c.conversation_id, sender: "admin", body: "I am the seller" })).error).not.toBeNull();
    });
  });

  describe("signed-in admin and the audit trail", () => {
    it("is recognised as admin", async () => {
      expect((await admin.rpc("is_admin")).data).toBe(true);
    });

    it("sale lifecycle: reserve, sell, no double sale, revenue, void, archive, and every step is audited", async () => {
      const ins = await admin.from("products").insert(mk("sale")).select("id, slug").single();
      expect(ins.error).toBeNull();
      const id = ins.data!.id as string;

      expect((await admin.from("products").update({ status: "sold" }).eq("id", id)).error?.message).toMatch(/status_change_requires_function/);
      expect((await admin.rpc("set_product_status", { p_product_id: id, p_status: "reserved", p_note: tag })).error).toBeNull();
      expect((await anon.from("products").select("status").eq("id", id).single()).data?.status).toBe("reserved");

      expect((await admin.from("products").update({ price: 1400 }).eq("id", id)).error).toBeNull(); // price change
      const before = (await admin.rpc("admin_dashboard_stats")).data;
      const sale = await admin.rpc("record_sale", { p_product_id: id, p_sale_price: 1234.5, p_customer_name: `${tag} Buyer` });
      expect(sale.error).toBeNull();
      expect((await admin.rpc("record_sale", { p_product_id: id, p_sale_price: 1 })).error?.message).toMatch(/product_already_sold/);
      const after = (await admin.rpc("admin_dashboard_stats")).data;
      expect(Number(after.revenue) - Number(before.revenue)).toBeCloseTo(1234.5, 3);
      expect((await anon.from("products").select("id").eq("id", id)).data).toHaveLength(0);
      expect((await admin.from("products").delete().eq("id", id)).error?.code).toBe("23503");
      expect((await admin.rpc("void_sale", { p_sale_id: sale.data, p_reason: tag })).error).toBeNull();
      expect((await admin.from("products").update({ is_archived: true }).eq("id", id)).error).toBeNull();

      const audit = await admin.from("audit_log").select("action, actor, detail").eq("entity_id", id).order("id");
      const actions = audit.data?.map((a) => a.action) ?? [];
      expect(actions).toEqual(expect.arrayContaining(["product_created", "price_changed", "product_archived"]));
      const price = audit.data!.find((a) => a.action === "price_changed")!;
      expect(price.detail).toMatchObject({ from: 1500, to: 1400 });
      expect(price.actor).toBe((await admin.auth.getUser()).data.user!.id);
      const saleAudit = await admin.from("audit_log").select("action").in("action", ["sale_recorded", "sale_voided"]).eq("entity_id", sale.data as string);
      expect(saleAudit.data?.map((a) => a.action).sort()).toEqual(["sale_recorded", "sale_voided"]);
    });

    it("the audit log and security events cannot be altered through the API", async () => {
      expect((await admin.from("audit_log").delete().gte("id", 0).select()).error ?? (await admin.from("audit_log").delete().gte("id", 0).select()).data).toBeTruthy();
      expect((await admin.from("audit_log").update({ action: "nothing happened" }).gte("id", 0)).error).not.toBeNull();
      expect((await admin.from("audit_log").insert({ action: "forged", entity: "x" })).error).not.toBeNull();
      expect((await admin.from("security_events").delete().gte("id", 0)).error).not.toBeNull();
      expect((await admin.from("audit_log").select("id").limit(1)).data?.length).toBeGreaterThan(0); // still there
    });

    it("a product without sales can be deleted (and that is audited)", async () => {
      const ins = await admin.from("products").insert(mk("delete")).select("id").single();
      expect((await admin.from("products").delete().eq("id", ins.data!.id)).error).toBeNull();
      const a = await admin.from("audit_log").select("action").eq("entity_id", ins.data!.id);
      expect(a.data?.map((x) => x.action)).toContain("product_deleted");
    });

    it("can read the inquiries and chats it received", async () => {
      expect((await admin.from("inquiries").select("name").like("name", `${tag}%`)).data?.length).toBeGreaterThan(0);
      expect((await admin.from("messages").select("body").like("body", `${tag}%`)).data?.length).toBeGreaterThan(0);
    });

    it("a seller reply in a bot-only chat flags it as human-handled", async () => {
      const g = gateway();
      const c = (await g.rpc("chat_start")).data as { token: string; conversation_id: string };
      await g.rpc("chat_post_visitor_message", { p_token: c.token, p_body: `${tag} hello` });
      expect(((await g.rpc("chat_get_messages", { p_token: c.token, p_after: 0 })).data as { escalated: boolean }).escalated).toBe(false);
      expect((await admin.from("messages").insert({ conversation_id: c.conversation_id, sender: "admin", body: "Hi, seller here" })).error).toBeNull();
      expect(((await g.rpc("chat_get_messages", { p_token: c.token, p_after: 0 })).data as { escalated: boolean }).escalated).toBe(true);
    });
  });

  describe("storage bucket", () => {
    const path = (ext = "png") => `products/${randomUUID()}/${randomUUID()}.${ext}`;

    it("anonymous uploads and listing are refused", async () => {
      expect((await anon.storage.from("site-media").upload(path(), PNG, { contentType: "image/png" })).error).not.toBeNull();
      expect((await anon.storage.from("site-media").list("products")).data ?? []).toHaveLength(0);
    });

    it("admin can upload an image, which is then publicly readable with a safe content type", async () => {
      const p = path();
      expect((await admin.storage.from("site-media").upload(p, PNG, { contentType: "image/png" })).error).toBeNull();
      const res = await fetch(`${URL}/storage/v1/object/public/site-media/${p}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      expect((await admin.storage.from("site-media").remove([p])).error).toBeNull();
    });

    it("the bucket rejects scripts, SVG and oversized files even for admins", async () => {
      for (const [ext, type, body] of [
        ["html", "text/html", "<script>alert(1)</script>"],
        ["svg", "image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
        ["js", "application/javascript", "alert(1)"],
        ["php", "application/x-php", "<?php system($_GET['c']); ?>"],
      ] as const) {
        expect((await admin.storage.from("site-media").upload(path(ext), Buffer.from(body), { contentType: type })).error, `${ext} must be rejected`).not.toBeNull();
      }
      expect((await admin.storage.from("site-media").upload(path(), Buffer.alloc(5 * 1024 * 1024 + 1024), { contentType: "image/png" })).error).not.toBeNull();
    });
  });
});
