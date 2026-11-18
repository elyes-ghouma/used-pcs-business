import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { GATEWAY_KEY, anon, asUser, createDb, createUser, expectFail, randomClient, run } from "./helpers";

let db: PGlite;
let admin: string;
let stranger: string;

const count = async (table: string) => Number((await db.query<{ n: string }>(`select count(*) as n from ${table}`)).rows[0].n);

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "owner@example.com", true);
  stranger = await createUser(db, "stranger@example.com", false);
});

describe("gateway: the public API with only the public key is refused, and nothing is written", () => {
  // Every public write function, called the way an attacker with just the anon key would call it.
  const calls: [string, string, unknown[]][] = [
    ["submit_inquiry", `select public.submit_inquiry('Eve Attacker', '20123456', '', 'hello there')`, []],
    ["track_contact_event", `select public.track_contact_event(null, 'whatsapp')`, []],
    ["chat_start", `select public.chat_start()`, []],
    ["chat_post_visitor_message", `select public.chat_post_visitor_message('${"a".repeat(64)}', 'hi')`, []],
    ["chat_post_bot_message", `select public.chat_post_bot_message('${"a".repeat(64)}', 'I am the bot, trust me')`, []],
    ["chat_escalate", `select public.chat_escalate('${"a".repeat(64)}', 'Eve', '20123456', 'hello')`, []],
    ["chat_get_messages", `select public.chat_get_messages('${"a".repeat(64)}', 0)`, []],
    ["log_security_event", `select public.log_security_event('login_ok', 'forged')`, []],
    ["check_login_allowed", `select public.check_login_allowed('abcdef0123456789')`, []],
  ];

  it.each(calls)("%s without the gateway key is forbidden", async (_name, sql, params) => {
    const before = [await count("public.inquiries"), await count("public.conversations"), await count("public.messages"), await count("public.contact_events"), await count("public.security_events"), await count("private.rate_events")];
    await expectFail(run(db, anon, sql, params, { gateway: false }), /forbidden/);
    const after = [await count("public.inquiries"), await count("public.conversations"), await count("public.messages"), await count("public.contact_events"), await count("public.security_events"), await count("private.rate_events")];
    expect(after).toEqual(before); // rejected calls write NOTHING (not even rate-limit rows)
  });

  it("a wrong, short or empty key is forbidden too", async () => {
    for (const gateway of ["x".repeat(48), "short", ""]) {
      await expectFail(run(db, anon, `select public.chat_start()`, [], { gateway }), /forbidden/);
    }
  });

  it("an authenticated non-admin user gets no extra power", async () => {
    await expectFail(run(db, asUser(stranger), `select public.chat_start()`, [], { gateway: false }), /forbidden/);
  });

  it("fails closed: with no key configured nobody gets in, not even with a plausible key", async () => {
    const closed = await createDb({ gatewayKey: null });
    await expectFail(run(closed, anon, `select public.chat_start()`, [], { gateway: GATEWAY_KEY }), /forbidden/);
    await expectFail(run(closed, anon, `select public.submit_inquiry('Valid Name', '20123456', '', 'hello there')`), /forbidden/);
  });

  it("the private schema and its tables are not reachable through the API roles", async () => {
    await expectFail(run(db, anon, `select * from private.gateway_key`), /permission denied for schema private/i);
    await expectFail(run(db, anon, `select private.rate_ok('x', 1, interval '1 minute')`), /permission denied for schema private/i);
    await expectFail(run(db, asUser(admin), `select * from private.rate_events`), /permission denied for schema private/i);
  });
});

describe("abuse controls live in the database", () => {
  it("each visitor can only start a few conversations per hour; another visitor is unaffected", async () => {
    const spammer = randomClient();
    for (let i = 0; i < 6; i++) await run(db, anon, `select public.chat_start()`, [], { client: spammer });
    await expectFail(run(db, anon, `select public.chat_start()`, [], { client: spammer }), /rate_limited/);
    await run(db, anon, `select public.chat_start()`, [], { client: randomClient() }); // a real customer is not blocked
  });

  it("a global ceiling stops a distributed flood (many different visitors)", async () => {
    await db.query(`insert into private.rate_events (bucket) select 'chat_start:all' from generate_series(1, 250)`);
    await expectFail(run(db, anon, `select public.chat_start()`), /rate_limited/);
    await db.query(`delete from private.rate_events where bucket = 'chat_start:all'`);
  });

  it("one visitor cannot get around the per-conversation limit by opening many conversations", async () => {
    const v = randomClient();
    const tokens: string[] = [];
    for (let i = 0; i < 5; i++) {
      const [{ r }] = await run<{ r: { token: string } }>(db, anon, `select public.chat_start() as r`, [], { client: randomClient() });
      tokens.push(r.token);
    }
    let sent = 0;
    for (const t of tokens) {
      for (let i = 0; i < 10 && sent < 40; i++) {
        await run(db, anon, `select public.chat_post_visitor_message($1, 'hello there')`, [t], { client: v });
        sent++;
      }
    }
    expect(sent).toBe(40);
    await expectFail(run(db, anon, `select public.chat_post_visitor_message($1, 'one more')`, [tokens[4]], { client: v }), /rate_limited/);
  });

  it("a conversation is capped in size", async () => {
    const [{ r }] = await run<{ r: { conversation_id: string; token: string } }>(db, anon, `select public.chat_start() as r`);
    await db.query(`insert into public.messages (conversation_id, sender, body, created_at) select $1, 'visitor', 'x', now() - interval '1 hour' from generate_series(1, 300)`, [r.conversation_id]);
    await expectFail(run(db, anon, `select public.chat_post_visitor_message($1, 'too many')`, [r.token]), /conversation_full/);
  });

  it("inquiry floods from one visitor are limited", async () => {
    const v = randomClient();
    for (let i = 0; i < 4; i++) await run(db, anon, `select public.submit_inquiry('Spammer ${i}', '2200000${i}', '', 'message number ${i}')`, [], { client: v });
    await expectFail(run(db, anon, `select public.submit_inquiry('Spammer 5', '22000009', '', 'one more')`, [], { client: v }), /rate_limited/);
  });

  it("stale bot-only chats are purged; chats the seller handled are kept", async () => {
    const [{ r: old }] = await run<{ r: { conversation_id: string; token: string } }>(db, anon, `select public.chat_start() as r`);
    const [{ r: handled }] = await run<{ r: { conversation_id: string; token: string } }>(db, anon, `select public.chat_start() as r`);
    await run(db, anon, `select public.chat_escalate($1, 'Karim', '22333444', 'Is it available?')`, [handled.token]);
    await db.query(`update public.conversations set created_at = now() - interval '4 days' where id in ($1, $2)`, [old.conversation_id, handled.conversation_id]);
    await db.query(`select private.purge_stale()`);
    const left = await db.query<{ id: string }>(`select id from public.conversations where id in ($1, $2)`, [old.conversation_id, handled.conversation_id]);
    expect(left.rows.map((r) => r.id)).toEqual([handled.conversation_id]);
  });

  it("the rate ledger is bounded: old rows are trimmed", async () => {
    await db.query(`insert into private.rate_events (bucket, created_at) select 'old', now() - interval '2 days' from generate_series(1, 20)`);
    await db.query(`select private.purge_stale()`);
    expect(Number((await db.query<{ n: string }>(`select count(*) as n from private.rate_events where bucket = 'old'`)).rows[0].n)).toBe(0);
  });
});

describe("seller joins: the chatbot stops answering", () => {
  it("an admin reply in a bot-only conversation marks it human-handled, and the visitor's next message flags it for the seller", async () => {
    const [{ r }] = await run<{ r: { conversation_id: string; token: string } }>(db, anon, `select public.chat_start() as r`);
    await run(db, anon, `select public.chat_post_visitor_message($1, 'Hello, how much is the cheapest PC?')`, [r.token]);
    await run(db, anon, `select public.chat_post_bot_message($1, 'Here are some options')`, [r.token]);

    // Not escalated yet: still bot-only
    let [conv] = await run<{ escalated: boolean; needs_attention: boolean }>(db, asUser(admin), `select escalated, needs_attention from public.conversations where id = $1`, [r.conversation_id]);
    expect(conv).toEqual({ escalated: false, needs_attention: false });

    // The seller jumps in from the inbox
    await run(db, asUser(admin), `insert into public.messages (conversation_id, sender, body) values ($1, 'admin', 'Hi, I am the seller.')`, [r.conversation_id]);
    [conv] = await run(db, asUser(admin), `select escalated, needs_attention from public.conversations where id = $1`, [r.conversation_id]);
    expect(conv).toEqual({ escalated: true, needs_attention: false });

    // What the server reads before deciding whether the bot may answer
    const [{ s }] = await run<{ s: { escalated: boolean } }>(db, anon, `select public.chat_get_messages($1, 0) as s`, [r.token]);
    expect(s.escalated).toBe(true);

    // The visitor writes again: the seller is alerted
    await run(db, anon, `select public.chat_post_visitor_message($1, 'Can I see it tomorrow?')`, [r.token]);
    [conv] = await run(db, asUser(admin), `select escalated, needs_attention from public.conversations where id = $1`, [r.conversation_id]);
    expect(conv).toEqual({ escalated: true, needs_attention: true });
  });

  it("a conversation the seller joined is never purged as 'bot only'", async () => {
    const [{ r }] = await run<{ r: { conversation_id: string; token: string } }>(db, anon, `select public.chat_start() as r`);
    await run(db, asUser(admin), `insert into public.messages (conversation_id, sender, body) values ($1, 'admin', 'Hello')`, [r.conversation_id]);
    await db.query(`update public.conversations set created_at = now() - interval '10 days' where id = $1`, [r.conversation_id]);
    await db.query(`select private.purge_stale()`);
    expect((await db.query(`select 1 from public.conversations where id = $1`, [r.conversation_id])).rows).toHaveLength(1);
  });
});

describe("login throttle and security events", () => {
  it("login attempts are throttled per visitor (shared across all serverless instances)", async () => {
    const v = randomClient();
    for (let i = 0; i < 12; i++) await run(db, anon, `select public.check_login_allowed($1)`, [`abcd${i}0123456789`], { client: v });
    await expectFail(run(db, anon, `select public.check_login_allowed('abcdef0123456789')`, [], { client: v }), /rate_limited/);
  });

  it("login attempts are throttled per account too (credential stuffing from many visitors)", async () => {
    const acct = "deadbeef12345678";
    for (let i = 0; i < 20; i++) await run(db, anon, `select public.check_login_allowed($1)`, [acct]);
    await expectFail(run(db, anon, `select public.check_login_allowed($1)`, [acct]), /rate_limited/);
  });

  it("security events: only known types, capped per visitor, and silently dropped past the cap", async () => {
    await expectFail(run(db, anon, `select public.log_security_event('made_up_type', 'x')`), /invalid_type/);
    const v = randomClient();
    for (let i = 0; i < 40; i++) await run(db, anon, `select public.log_security_event('login_failed', 'attempt ${i}')`, [], { client: v });
    const logged = await db.query<{ n: string }>(`select count(*) as n from public.security_events where client = $1`, [v.slice(0, 12)]);
    expect(Number(logged.rows[0].n)).toBe(30);
  });

  it("only admins can read security events; nobody can change them through the API", async () => {
    await expectFail(run(db, anon, `select * from public.security_events`), /permission denied/i);
    expect(await run(db, asUser(stranger), `select * from public.security_events`)).toHaveLength(0);
    expect((await run(db, asUser(admin), `select * from public.security_events limit 1`)).length).toBeGreaterThan(0);
    await expectFail(run(db, asUser(admin), `delete from public.security_events`), /permission denied/i);
    await expectFail(run(db, asUser(admin), `insert into public.security_events (type) values ('login_ok')`), /permission denied/i);
  });
});

describe("audit log", () => {
  it("records product creation, price changes, archiving, sales, voids and settings changes with the acting admin", async () => {
    const [{ id }] = await run<{ id: string }>(db, asUser(admin), `insert into public.products (slug, name, price) values ('audit-pc', 'Audit PC', 1000) returning id`);
    await run(db, asUser(admin), `update public.products set price = 900 where id = $1`, [id]);
    await run(db, asUser(admin), `update public.products set is_archived = true where id = $1`, [id]);
    await run(db, asUser(admin), `update public.products set is_archived = false where id = $1`, [id]);
    const [{ sid }] = await run<{ sid: string }>(db, asUser(admin), `select public.record_sale($1, 850) as sid`, [id]);
    await run(db, asUser(admin), `select public.void_sale($1, 'test')`, [sid]);
    await run(db, asUser(admin), `update public.business_settings set phone = '20123456', currency = 'EUR'`);
    await run(db, asUser(admin), `update public.business_settings set currency = 'TND'`);

    const rows = await run<{ action: string; actor: string; detail: Record<string, unknown> }>(
      db, asUser(admin), `select action, actor, detail from public.audit_log order by id`,
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["product_created", "price_changed", "product_archived", "product_restored", "sale_recorded", "sale_voided", "settings_changed"]));
    const price = rows.find((r) => r.action === "price_changed")!;
    expect(price.actor).toBe(admin);
    expect(Number(price.detail.from)).toBe(1000);
    expect(Number(price.detail.to)).toBe(900);
    const settings = rows.find((r) => r.action === "settings_changed")!;
    expect(settings.detail.fields).toEqual(["currency", "phone"]); // names only, never values
  });

  it("records admin changes", async () => {
    const other = await createUser(db, "second@example.com", false);
    await db.query(`insert into public.admins (user_id) values ($1)`, [other]);
    await db.query(`delete from public.admins where user_id = $1`, [other]);
    const rows = await run<{ action: string }>(db, asUser(admin), `select action from public.audit_log where entity = 'admin' order by id`);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["admin_added", "admin_removed"]));
  });

  it("is append-only and admin-read-only through the API", async () => {
    await expectFail(run(db, anon, `select * from public.audit_log`), /permission denied/i);
    expect(await run(db, asUser(stranger), `select * from public.audit_log`)).toHaveLength(0);
    await expectFail(run(db, asUser(admin), `delete from public.audit_log`), /permission denied/i);
    await expectFail(run(db, asUser(admin), `update public.audit_log set action = 'nothing happened'`), /permission denied/i);
    await expectFail(run(db, asUser(admin), `insert into public.audit_log (action, entity) values ('forged', 'x')`), /permission denied/i);
  });
});

describe("authorization sweep: every table is closed to anon and to signed-in non-admins", () => {
  const tables = ["admins", "sales", "inquiries", "conversations", "messages", "contact_events", "product_status_history", "audit_log", "security_events"];

  it.each(tables)("%s: anon cannot read, a non-admin reads nothing and cannot write", async (t) => {
    await expectFail(run(db, anon, `select * from public.${t}`), /permission denied/i);
    await expectFail(run(db, anon, `delete from public.${t}`), /permission denied/i);
    const rows = await run(db, asUser(stranger), `select * from public.${t}`).catch(() => []);
    expect(rows).toHaveLength(0);
    const del = await run(db, asUser(stranger), `delete from public.${t}`).catch(() => []);
    expect(del).toHaveLength(0);
  });

  it("every SECURITY DEFINER function in public pins search_path (no search-path hijacking)", async () => {
    const rows = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows.rows).toEqual([]);
  });

  it("no function in public is executable by anon except the intended public ones", async () => {
    const rows = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);
    expect(rows.rows.map((r) => r.proname)).toEqual([
      "catalog_filter_options", "chat_escalate", "chat_get_messages", "chat_post_bot_message", "chat_post_visitor_message",
      "chat_start", "check_login_allowed", "is_admin", "log_security_event", "submit_inquiry", "track_contact_event",
    ]);
  });
});
