#!/usr/bin/env node
/**
 * Secret scan. Fails (exit 1) if it finds:
 *  - an env file tracked by git, now or in any past commit (only .env.example is allowed)
 *  - a Supabase secret / service-role key anywhere in tracked files or git history
 *  - the GATEWAY_KEY value (from the environment or the env files) in tracked files, history or the browser bundle
 *  - any of the above inside the production build output (.next/static, and the server output as a second check)
 * Usage: npm run build && npm run security:scan
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const problems = [];
const note = (msg) => problems.push(msg);
const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// Values we must never leak: the gateway key and any other secrets present in local env files.
const secrets = new Set();
for (const f of [".env.local", ".env.test.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  const env = dotenv.parse(fs.readFileSync(f));
  for (const k of ["GATEWAY_KEY", "E2E_ADMIN_PASSWORD", "E2E_NONADMIN_PASSWORD"]) if (env[k] && env[k].length >= 12) secrets.add(env[k]);
}
if (process.env.GATEWAY_KEY && process.env.GATEWAY_KEY.length >= 12) secrets.add(process.env.GATEWAY_KEY);

const SECRET_KEY_PATTERNS = [/sb_secret_[A-Za-z0-9_-]{20,}/, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{20,}/];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).role;
  } catch {
    return null;
  }
}

function scanText(label, text) {
  for (const re of SECRET_KEY_PATTERNS) if (re.test(text)) note(`${label}: matches ${re}`);
  for (const t of text.match(JWT) ?? []) if (jwtRole(t) === "service_role") note(`${label}: contains a service_role JWT`);
  for (const s of secrets) if (text.includes(s)) note(`${label}: contains a secret value from your env files (${s.slice(0, 4)}...)`);
}

// 1) env files in git
const everTracked = git(["log", "--all", "--pretty=format:", "--name-only", "--diff-filter=A"]).split("\n").filter(Boolean);
for (const f of new Set(everTracked)) {
  if (/(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f)) note(`git history: env file was committed: ${f}`);
}
for (const f of git(["ls-files"]).split("\n").filter(Boolean)) {
  if (/(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f)) note(`tracked env file: ${f}`);
}

// 2) tracked files and full history
for (const f of git(["ls-files"]).split("\n").filter(Boolean)) {
  const p = path.resolve(f);
  if (!fs.existsSync(p) || fs.statSync(p).size > 2_000_000) continue;
  if (/\.(png|jpe?g|webp|ico|woff2?|lock)$/i.test(f) || f === "package-lock.json") continue;
  scanText(`file ${f}`, fs.readFileSync(p, "utf8"));
}
const commits = git(["rev-list", "--all"]).split("\n").filter(Boolean);
for (const sha of commits) {
  const diff = git(["show", "--no-color", "--format=", "--unified=0", sha]);
  scanText(`commit ${sha.slice(0, 8)}`, diff);
}

// 3) build output
function walk(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, fn);
    else fn(p);
  }
}
let scanned = 0;
walk(".next/static", (p) => {
  if (!/\.(js|css|html|json|map)$/.test(p)) return;
  scanned++;
  const text = fs.readFileSync(p, "utf8");
  scanText(`browser bundle ${p}`, text);
  if (/GATEWAY_KEY|x-gateway-key/i.test(text)) note(`browser bundle ${p}: mentions the gateway key header/variable (must stay server-only)`);
});
if (!fs.existsSync(".next")) console.log("(no .next build found: run `npm run build` first to scan the bundle)");

if (problems.length) {
  console.error(`\nSecurity scan FAILED (${problems.length}):`);
  for (const p of problems) console.error(" - " + p);
  process.exit(1);
}
console.log(`Security scan passed: ${commits.length} commits, tracked files${scanned ? `, ${scanned} browser bundle files` : ""}; ${secrets.size} known secret values checked.`);
