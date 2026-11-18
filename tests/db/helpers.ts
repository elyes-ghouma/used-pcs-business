import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

// Minimal stand-ins for the parts of Supabase our migrations depend on.
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return db;
}

export type Actor = { role: "anon" } | { role: "authenticated"; userId: string };
export const anon: Actor = { role: "anon" };
export const asUser = (userId: string): Actor => ({ role: "authenticated", userId });

/** Runs one statement as the given API role inside its own transaction (rolled back on error). */
export async function run<T = Record<string, unknown>>(
  db: PGlite,
  actor: Actor | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    if (actor) {
      await tx.query(`set local role ${actor.role}`);
      const claims = actor.role === "authenticated" ? { sub: actor.userId, role: "authenticated" } : { role: "anon" };
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    }
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

export async function createUser(db: PGlite, email: string, admin: boolean): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  if (admin) await db.query(`insert into public.admins (user_id) values ($1)`, [rows[0].id]);
  return rows[0].id;
}

export async function expectFail(p: Promise<unknown>, pattern: RegExp) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`Expected failure matching ${pattern}, but the call succeeded`);
  const msg = (err as Error).message;
  if (!pattern.test(msg)) throw new Error(`Expected ${pattern}, got: ${msg}`);
}
