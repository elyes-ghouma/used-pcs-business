import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { anon, asUser, createDb, createUser, expectFail, run } from "./helpers";

let db: PGlite;
let admin: string;
let stranger: string; // signed up with the public key but is NOT an admin

const newProduct = async (name: string, price = 1500, extra = "") => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).slice(2, 7);
  const rows = await run<{ id: string }>(
    db,
    asUser(admin),
    `insert into public.products (slug, name, price ${extra ? ", " + extra.split("=")[0] : ""})
     values ($1, $2, $3 ${extra ? ", " + extra.split("=")[1] : ""}) returning id`,
    [slug, name, price],
  );
  return rows[0].id;
};

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "owner@example.com", true);
  stranger = await createUser(db, "stranger@example.com", false);
});

describe("access control", () => {
  it("anon cannot write products", async () => {
    await expectFail(
      run(db, anon, `insert into public.products (slug, name, price) values ('x-1', 'Hack', 1)`),
      /permission denied/i,
    );
  });

  it("a signed-up non-admin cannot write products (RLS), even though they are 'authenticated'", async () => {
    await expectFail(
      run(db, asUser(stranger), `insert into public.products (slug, name, price) values ('x-2', 'Hack', 1)`),
      /row-level security/i,
    );
  });

  it("non-admins cannot call admin RPCs", async () => {
    const id = await newProduct("Guarded PC");
    await expectFail(run(db, asUser(stranger), `select public.record_sale($1, 10)`, [id]), /not_authorized/);
    await expectFail(run(db, asUser(stranger), `select public.admin_dashboard_stats()`), /not_authorized/);
    await expectFail(run(db, asUser(stranger), `select public.set_product_status($1, 'reserved')`, [id]), /not_authorized/);
  });

  it("anon cannot even execute admin RPCs", async () => {
    const id = await newProduct("Anon Guard PC");
    await expectFail(run(db, anon, `select public.record_sale($1, 10)`, [id]), /permission denied for function/i);
    await expectFail(run(db, anon, `select public.admin_dashboard_stats()`), /permission denied for function/i);
    await expectFail(run(db, anon, `select public.void_sale(gen_random_uuid())`), /permission denied for function/i);
  });

  it("anon and non-admins cannot read private tables", async () => {
    await expectFail(run(db, anon, `select * from public.sales`), /permission denied/i);
    await expectFail(run(db, anon, `select * from public.inquiries`), /permission denied/i);
    await expectFail(run(db, anon, `select * from public.conversations`), /permission denied/i);
    await expectFail(run(db, anon, `select * from public.admins`), /permission denied/i);
    expect(await run(db, asUser(stranger), `select * from public.inquiries`)).toHaveLength(0);
    await expectFail(run(db, asUser(stranger), `select * from public.admins`), /permission denied/i);
  });

  it("nobody can make themselves an admin through the API", async () => {
    await expectFail(
      run(db, asUser(stranger), `insert into public.admins (user_id) values ($1)`, [stranger]),
      /permission denied/i,
    );
  });

  it("settings: public can read, only admin can update", async () => {
    expect(await run(db, anon, `select business_name, currency from public.business_settings`)).toEqual([
      { business_name: "Used Gaming PCs", currency: "TND" },
    ]);
    expect(
      await run(db, asUser(stranger), `update public.business_settings set business_name = 'Pwned' returning id`),
    ).toHaveLength(0);
    expect(
      await run(db, asUser(admin), `update public.business_settings set business_name = 'My Shop' returning id`),
    ).toHaveLength(1);
    await run(db, asUser(admin), `update public.business_settings set business_name = 'Used Gaming PCs'`);
  });
});

describe("public visibility", () => {
  it("hides archived and (by default) sold products, shows them when the owner allows sold", async () => {
    const visible = await newProduct("Visible PC");
    const archived = await newProduct("Archived PC");
    const sold = await newProduct("Sold PC");
    await run(db, asUser(admin), `update public.products set is_archived = true where id = $1`, [archived]);
    await run(db, asUser(admin), `select public.record_sale($1, 1000)`, [sold]);

    const ids = async () => (await run<{ id: string }>(db, anon, `select id from public.products`)).map((r) => r.id);
    expect(await ids()).toContain(visible);
    expect(await ids()).not.toContain(archived);
    expect(await ids()).not.toContain(sold);

    await run(db, asUser(admin), `update public.business_settings set show_sold_products = true`);
    expect(await ids()).toContain(sold);
    expect(await ids()).not.toContain(archived);
    await run(db, asUser(admin), `update public.business_settings set show_sold_products = false`);
  });

  it("product images follow product visibility", async () => {
    const id = await newProduct("Image PC");
    await run(db, asUser(admin), `insert into public.product_images (product_id, storage_path, is_primary) values ($1, 'p/a.jpg', true)`, [id]);
    expect(await run(db, anon, `select * from public.product_images where product_id = $1`, [id])).toHaveLength(1);
    await run(db, asUser(admin), `update public.products set is_archived = true where id = $1`, [id]);
    expect(await run(db, anon, `select * from public.product_images where product_id = $1`, [id])).toHaveLength(0);
  });

  it("only one primary image per product", async () => {
    const id = await newProduct("Two Image PC");
    await run(db, asUser(admin), `insert into public.product_images (product_id, storage_path, is_primary) values ($1, 'p/1.jpg', true)`, [id]);
    await expectFail(
      run(db, asUser(admin), `insert into public.product_images (product_id, storage_path, is_primary) values ($1, 'p/2.jpg', true)`, [id]),
      /duplicate key/i,
    );
  });

  it("filter options only contain publicly visible values", async () => {
    await newProduct("Ryzen PC", 1800, "cpu='Ryzen 5 5600'");
    const hidden = await newProduct("Hidden CPU PC", 1800, "cpu='SECRET-CPU'");
    await run(db, asUser(admin), `update public.products set is_archived = true where id = $1`, [hidden]);
    const [{ opts }] = await run<{ opts: { cpu: string[] } }>(db, anon, `select public.catalog_filter_options() as opts`);
    expect(opts.cpu).toContain("Ryzen 5 5600");
    expect(opts.cpu).not.toContain("SECRET-CPU");
  });
});

describe("product status and sales", () => {
  it("logs status history and refuses direct status updates", async () => {
    const id = await newProduct("History PC");
    await expectFail(
      run(db, asUser(admin), `update public.products set status = 'sold' where id = $1`, [id]),
      /status_change_requires_function/,
    );
    await expectFail(
      run(db, asUser(admin), `update public.products set status = 'reserved' where id = $1`, [id]),
      /status_change_requires_function/,
    );
    await run(db, asUser(admin), `select public.set_product_status($1, 'reserved', 'Customer said Friday')`, [id]);
    await run(db, asUser(admin), `select public.set_product_status($1, 'available')`, [id]);
    const history = await run<{ from_status: string | null; to_status: string; note: string | null }>(
      db, asUser(admin),
      `select from_status, to_status, note from public.product_status_history where product_id = $1 order by id`, [id],
    );
    expect(history).toEqual([
      { from_status: null, to_status: "available", note: "Product created" },
      { from_status: "available", to_status: "reserved", note: "Customer said Friday" },
      { from_status: "reserved", to_status: "available", note: null },
    ]);
  });

  it("cannot create a product that is already 'sold'", async () => {
    await expectFail(
      run(db, asUser(admin), `insert into public.products (slug, name, price, status) values ('born-sold', 'Born Sold', 1, 'sold')`),
      /status_change_requires_function/,
    );
  });

  it("set_product_status refuses 'sold' (must go through record_sale)", async () => {
    const id = await newProduct("Not Via Status PC");
    await expectFail(run(db, asUser(admin), `select public.set_product_status($1, 'sold')`, [id]), /use_record_sale/);
  });

  it("recording a sale marks the product sold, snapshots name and price, and can only happen once", async () => {
    const id = await newProduct("Sale PC", 2000);
    await run(db, asUser(admin), `select public.set_product_status($1, 'reserved')`, [id]);
    const [{ sid }] = await run<{ sid: string }>(
      db, asUser(admin),
      `select public.record_sale($1, 1850.5, now(), 'Ali', '20123456', '', 'paid cash') as sid`, [id],
    );
    const [sale] = await run<{ product_name: string; listed_price: string; sale_price: string; customer_name: string }>(
      db, asUser(admin), `select product_name, listed_price, sale_price, customer_name from public.sales where id = $1`, [sid],
    );
    expect(sale).toEqual({ product_name: "Sale PC", listed_price: "2000.000", sale_price: "1850.500", customer_name: "Ali" });
    const [{ status }] = await run<{ status: string }>(db, asUser(admin), `select status from public.products where id = $1`, [id]);
    expect(status).toBe("sold");

    await expectFail(run(db, asUser(admin), `select public.record_sale($1, 1700)`, [id]), /product_already_sold/);
    expect(await run(db, asUser(admin), `select 1 from public.sales where product_id = $1`, [id])).toHaveLength(1);
  });

  it("the database itself rejects a second active sale for the same product", async () => {
    const id = await newProduct("Unique Sale PC");
    await run(db, asUser(admin), `select public.record_sale($1, 100)`, [id]);
    // Even bypassing the function (as the table owner), the partial unique index holds.
    await expectFail(
      db.query(`insert into public.sales (product_id, product_name, listed_price, sale_price) values ($1, 'x', 1, 1)`, [id]),
      /sales_one_active_per_product/,
    );
  });

  it("concurrent attempts to sell the same product: exactly one wins", async () => {
    const id = await newProduct("Race PC");
    const results = await Promise.allSettled([
      run(db, asUser(admin), `select public.record_sale($1, 500)`, [id]),
      run(db, asUser(admin), `select public.record_sale($1, 600)`, [id]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await run(db, asUser(admin), `select 1 from public.sales where product_id = $1`, [id])).toHaveLength(1);
  });

  it("rejects negative prices and archived products", async () => {
    const id = await newProduct("Edge PC");
    await expectFail(run(db, asUser(admin), `select public.record_sale($1, -1)`, [id]), /invalid_price/);
    await run(db, asUser(admin), `update public.products set is_archived = true where id = $1`, [id]);
    await expectFail(run(db, asUser(admin), `select public.record_sale($1, 10)`, [id]), /product_is_archived/);
  });

  it("a sold product's status cannot be changed back without voiding the sale", async () => {
    const id = await newProduct("Locked PC");
    await run(db, asUser(admin), `select public.record_sale($1, 10)`, [id]);
    await expectFail(run(db, asUser(admin), `select public.set_product_status($1, 'available')`, [id]), /product_is_sold/);
  });

  it("voiding a sale keeps the row, restores the product and excludes it from revenue", async () => {
    const id = await newProduct("Void PC");
    const [{ sid }] = await run<{ sid: string }>(db, asUser(admin), `select public.record_sale($1, 777) as sid`, [id]);
    await run(db, asUser(admin), `select public.void_sale($1, 'Buyer backed out')`, [sid]);
    const [sale] = await run<{ is_voided: boolean; void_reason: string }>(db, asUser(admin), `select is_voided, void_reason from public.sales where id = $1`, [sid]);
    expect(sale).toEqual({ is_voided: true, void_reason: "Buyer backed out" });
    const [{ status }] = await run<{ status: string }>(db, asUser(admin), `select status from public.products where id = $1`, [id]);
    expect(status).toBe("available");
    await expectFail(run(db, asUser(admin), `select public.void_sale($1)`, [sid]), /sale_already_voided/);
    // and the product can be sold again
    await run(db, asUser(admin), `select public.record_sale($1, 800)`, [id]);
  });

  it("deleting a product with sales is refused; the sale history survives", async () => {
    const id = await newProduct("History Keeper PC");
    await run(db, asUser(admin), `select public.record_sale($1, 123)`, [id]);
    await expectFail(run(db, asUser(admin), `delete from public.products where id = $1`, [id]), /foreign key|violates/i);
    expect(await run(db, asUser(admin), `select 1 from public.sales where product_id = $1`, [id])).toHaveLength(1);
  });

  it("a product with no sales can be deleted", async () => {
    const id = await newProduct("Deletable PC");
    expect(await run(db, asUser(admin), `delete from public.products where id = $1 returning id`, [id])).toHaveLength(1);
  });

  it("dashboard revenue counts only non-voided sales", async () => {
    const fresh = await createDb();
    const a = await createUser(fresh, "a@example.com", true);
    const mk = async (n: string) =>
      (await run<{ id: string }>(fresh, asUser(a), `insert into public.products (slug, name, price) values ($1, $1, 100) returning id`, [n]))[0].id;
    const p1 = await mk("p-one");
    const p2 = await mk("p-two");
    const p3 = await mk("p-three");
    await mk("p-four");
    await run(fresh, asUser(a), `select public.record_sale($1, 1000.250)`, [p1]);
    const [{ sid }] = await run<{ sid: string }>(fresh, asUser(a), `select public.record_sale($1, 999) as sid`, [p2]);
    await run(fresh, asUser(a), `select public.void_sale($1)`, [sid]);
    await run(fresh, asUser(a), `select public.record_sale($1, 500)`, [p3]);
    await run(fresh, asUser(a), `select public.set_product_status($1, 'reserved')`, [p2]);
    const [{ stats }] = await run<{ stats: Record<string, number | string> }>(fresh, asUser(a), `select public.admin_dashboard_stats() as stats`);
    expect(stats).toMatchObject({
      products_total: 4, products_available: 1, products_reserved: 1, products_sold: 2, sales_count: 2,
    });
    expect(Number(stats.revenue)).toBeCloseTo(1500.25, 3);
  });
});

describe("inquiries", () => {
  it("anon can submit through the function, validated, and cannot insert directly", async () => {
    const pid = await newProduct("Inquiry PC");
    await expectFail(
      run(db, anon, `insert into public.inquiries (name, phone, message) values ('Eve', '123456', 'hi there')`),
      /permission denied/i,
    );
    const [{ id }] = await run<{ id: string }>(
      db, anon, `select public.submit_inquiry('Sami Ben', '+216 20 123 456', '', 'Is it still available?', $1) as id`, [pid],
    );
    const [row] = await run<{ status: string; product_name: string; source: string }>(
      db, asUser(admin), `select status, product_name, source from public.inquiries where id = $1`, [id],
    );
    expect(row).toEqual({ status: "new", product_name: "Inquiry PC", source: "form" });
  });

  it("validates input", async () => {
    await expectFail(run(db, anon, `select public.submit_inquiry('A', '12345678', '', 'hello there')`), /invalid_name/);
    await expectFail(run(db, anon, `select public.submit_inquiry('Valid Name', '', '', 'hello there')`), /contact_required/);
    await expectFail(run(db, anon, `select public.submit_inquiry('Valid Name', 'abc', '', 'hello there')`), /invalid_phone/);
    await expectFail(run(db, anon, `select public.submit_inquiry('Valid Name', '', 'nope', 'hello there')`), /invalid_email/);
    await expectFail(run(db, anon, `select public.submit_inquiry('Valid Name', '12345678', '', 'hi')`), /invalid_message/);
  });

  it("rate limits repeated submissions from the same contact", async () => {
    for (let i = 0; i < 3; i++) {
      await run(db, anon, `select public.submit_inquiry('Spammer', '99887766', '', 'message number ${i}')`);
    }
    await expectFail(run(db, anon, `select public.submit_inquiry('Spammer', '99887766', '', 'one more')`), /rate_limited/);
  });

  it("admin can update status and notes but not other columns", async () => {
    const [{ id }] = await run<{ id: string }>(db, anon, `select public.submit_inquiry('Nour', '', 'nour@example.com', 'Interested!') as id`);
    await run(db, asUser(admin), `update public.inquiries set status = 'negotiating', internal_notes = 'called, wants 10% off' where id = $1`, [id]);
    const [row] = await run<{ status: string; internal_notes: string }>(db, asUser(admin), `select status, internal_notes from public.inquiries where id = $1`, [id]);
    expect(row).toEqual({ status: "negotiating", internal_notes: "called, wants 10% off" });
    await expectFail(run(db, asUser(admin), `update public.inquiries set message = 'edited' where id = $1`, [id]), /permission denied/i);
  });

  it("a sale linked to an inquiry marks it converted", async () => {
    const pid = await newProduct("Converted PC");
    const [{ id }] = await run<{ id: string }>(db, anon, `select public.submit_inquiry('Lina', '', 'lina@example.com', 'I want it', $1) as id`, [pid]);
    await run(db, asUser(admin), `select public.record_sale($1, 100, now(), 'Lina', '', 'lina@example.com', '', $2)`, [pid, id]);
    const [row] = await run<{ status: string }>(db, asUser(admin), `select status from public.inquiries where id = $1`, [id]);
    expect(row.status).toBe("converted");
  });

  it("contact click tracking is recorded separately from inquiries", async () => {
    const pid = await newProduct("Click PC");
    await run(db, anon, `select public.track_contact_event($1, 'whatsapp')`, [pid]);
    await expectFail(run(db, anon, `select public.track_contact_event($1, 'carrier-pigeon')`, [pid]), /invalid_channel/);
    const events = await run(db, asUser(admin), `select channel from public.contact_events where product_id = $1`, [pid]);
    expect(events).toEqual([{ channel: "whatsapp" }]);
    expect(await run(db, asUser(admin), `select 1 from public.inquiries where product_id = $1`, [pid])).toHaveLength(0);
  });
});

describe("chat", () => {
  const start = async (productId: string | null = null) => {
    const [{ r }] = await run<{ r: { conversation_id: string; token: string } }>(db, anon, `select public.chat_start($1) as r`, [productId]);
    return r;
  };

  it("start → post → read back with the token; wrong token is rejected", async () => {
    const { token } = await start();
    expect(token).toHaveLength(64);
    await run(db, anon, `select public.chat_post_visitor_message($1, 'Hello, do you have a PC under 2000?')`, [token]);
    await run(db, anon, `select public.chat_post_bot_message($1, 'Here are some options', '{"products":[]}'::jsonb)`, [token]);
    const [{ r }] = await run<{ r: { messages: { sender: string; body: string }[]; escalated: boolean } }>(
      db, anon, `select public.chat_get_messages($1, 0) as r`, [token],
    );
    expect(r.messages.map((m) => m.sender)).toEqual(["visitor", "bot"]);
    expect(r.escalated).toBe(false);
    await expectFail(run(db, anon, `select public.chat_get_messages('${"a".repeat(64)}', 0)`), /conversation_not_found/);
    await expectFail(run(db, anon, `select public.chat_post_visitor_message('short', 'hi')`), /conversation_not_found/);
  });

  it("only the polling cursor's newer messages are returned", async () => {
    const { token } = await start();
    const [{ id }] = await run<{ id: string }>(db, anon, `select public.chat_post_visitor_message($1, 'one') as id`, [token]);
    await run(db, anon, `select public.chat_post_visitor_message($1, 'two')`, [token]);
    const [{ r }] = await run<{ r: { messages: { body: string }[] } }>(db, anon, `select public.chat_get_messages($1, $2) as r`, [token, id]);
    expect(r.messages.map((m) => m.body)).toEqual(["two"]);
  });

  it("visitors cannot read conversations or messages directly", async () => {
    await expectFail(run(db, anon, `select * from public.messages`), /permission denied/i);
    await expectFail(run(db, anon, `insert into public.messages (conversation_id, sender, body) values (gen_random_uuid(), 'admin', 'fake')`), /permission denied/i);
  });

  it("escalation stores contact details, flags the chat, and creates an inquiry lead", async () => {
    const pid = await newProduct("Chat Product PC");
    const { token, conversation_id } = await start(pid);
    await run(db, anon, `select public.chat_escalate($1, 'Mehdi', '22 333 444', 'Can I see it tomorrow?')`, [token]);
    const [conv] = await run<{ escalated: boolean; needs_attention: boolean; visitor_name: string }>(
      db, asUser(admin), `select escalated, needs_attention, visitor_name from public.conversations where id = $1`, [conversation_id],
    );
    expect(conv).toEqual({ escalated: true, needs_attention: true, visitor_name: "Mehdi" });
    const leads = await run<{ source: string; product_name: string }>(db, asUser(admin), `select source, product_name from public.inquiries where conversation_id = $1`, [conversation_id]);
    expect(leads).toEqual([{ source: "chat", product_name: "Chat Product PC" }]);
    await expectFail(run(db, anon, `select public.chat_escalate($1, 'M', 'x', 'y')`, [token]), /invalid_name/);
  });

  it("admin reply is delivered to the visitor and clears 'needs attention'; resolve then visitor reopens", async () => {
    const { token, conversation_id } = await start();
    await run(db, anon, `select public.chat_escalate($1, 'Karim', 'karim@example.com', 'Is the GPU new?')`, [token]);
    await run(db, asUser(admin), `insert into public.messages (conversation_id, sender, body) values ($1, 'admin', 'Hi Karim, it is 2 years old.')`, [conversation_id]);
    let [conv] = await run<{ needs_attention: boolean }>(db, asUser(admin), `select needs_attention from public.conversations where id = $1`, [conversation_id]);
    expect(conv.needs_attention).toBe(false);
    const [{ r }] = await run<{ r: { messages: { sender: string }[] } }>(db, anon, `select public.chat_get_messages($1, 0) as r`, [token]);
    expect(r.messages.map((m) => m.sender)).toEqual(["visitor", "admin"]);

    await run(db, asUser(admin), `update public.conversations set status = 'resolved', resolved_at = now() where id = $1`, [conversation_id]);
    await run(db, anon, `select public.chat_post_visitor_message($1, 'One more question')`, [token]);
    [conv] = await run<{ needs_attention: boolean; status?: string }>(db, asUser(admin), `select needs_attention, status from public.conversations where id = $1`, [conversation_id]);
    expect(conv).toMatchObject({ needs_attention: true, status: "open" });
  });

  it("non-admins cannot post as admin", async () => {
    const { conversation_id } = await start();
    await expectFail(
      run(db, asUser(stranger), `insert into public.messages (conversation_id, sender, body) values ($1, 'admin', 'x')`, [conversation_id]),
      /row-level security/i,
    );
  });

  it("rate limits message floods", async () => {
    const { token } = await start();
    for (let i = 0; i < 12; i++) await run(db, anon, `select public.chat_post_visitor_message($1, 'spam ${i}')`, [token]);
    await expectFail(run(db, anon, `select public.chat_post_visitor_message($1, 'one too many')`, [token]), /rate_limited/);
  });

  it("only stores the SHA-256 hash of the token", async () => {
    const { token, conversation_id } = await start();
    const [row] = await run<{ token_hash: Uint8Array; matches: boolean }>(
      db, asUser(admin),
      `select token_hash, token_hash = sha256(convert_to($2, 'UTF8')) as matches from public.conversations where id = $1`,
      [conversation_id, token],
    );
    expect(row.matches).toBe(true);
    expect(Buffer.from(row.token_hash).toString("utf8")).not.toContain(token);
  });
});

describe("storage & realtime configuration", () => {
  it("the media bucket enforces size and mime limits and is realtime-enabled for chat", async () => {
    const [bucket] = await run<{ file_size_limit: string; allowed_mime_types: string[]; public: boolean }>(
      db, null, `select file_size_limit, allowed_mime_types, public from storage.buckets where id = 'site-media'`,
    );
    expect(Number(bucket.file_size_limit)).toBe(5 * 1024 * 1024);
    expect(bucket.allowed_mime_types).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(bucket.public).toBe(true);
    const tables = await run<{ tablename: string }>(db, null, `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
    expect(tables.map((t) => t.tablename).sort()).toEqual(["conversations", "messages"]);
  });
});

describe("translations columns", () => {
  it("accept a small French object and default to an empty one", async () => {
    const id = await newProduct("Translated PC");
    const [before] = await run<{ translations: unknown }>(db, asUser(admin), `select translations from public.products where id = $1`, [id]);
    expect(before.translations).toEqual({});
    await run(db, asUser(admin), `update public.products set translations = $2::jsonb where id = $1`, [id, JSON.stringify({ fr: { description: "Très bon état" } })]);
    const [after] = await run<{ translations: { fr: { description: string } } }>(db, asUser(admin), `select translations from public.products where id = $1`, [id]);
    expect(after.translations.fr.description).toBe("Très bon état");
  });

  it("refuse non-objects and oversized payloads", async () => {
    const id = await newProduct("Bad Translation PC");
    await expectFail(run(db, asUser(admin), `update public.products set translations = '[1]'::jsonb where id = $1`, [id]), /check constraint/i);
    const huge = JSON.stringify({ fr: { description: "x".repeat(25000) } });
    await expectFail(run(db, asUser(admin), `update public.products set translations = $2::jsonb where id = $1`, [id, huge]), /check constraint/i);
  });

  it("only allow English or French as the default language, and only admins may change it", async () => {
    await expectFail(run(db, asUser(admin), `update public.business_settings set default_locale = 'de' where id = 1`), /check constraint/i);
    await run(db, asUser(admin), `update public.business_settings set default_locale = 'fr' where id = 1`);
    const rows = await run<{ default_locale: string }>(db, anon, `select default_locale from public.business_settings where id = 1`);
    expect(rows[0].default_locale).toBe("fr");
    await expectFail(run(db, anon, `update public.business_settings set default_locale = 'en' where id = 1`), /permission denied/i);
    await run(db, asUser(admin), `update public.business_settings set default_locale = 'en' where id = 1`);
  });
});
