import { type Page } from "@playwright/test";
import { expect, newVisitor, test } from "./fixtures";
import { ADMIN_STATE } from "./state";

/**
 * Browser-level security checks against a real (test) Supabase project. Needs the E2E_* admin and GATEWAY_KEY
 * (see README -> Testing). Every record created is prefixed "SEC".
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const NONADMIN_EMAIL = process.env.E2E_NONADMIN_EMAIL;
const NONADMIN_PASSWORD = process.env.E2E_NONADMIN_PASSWORD;
test.skip(!EMAIL || !PASSWORD, "Set the E2E_* variables (see README -> Testing)");

const run = Date.now().toString(36);
const XSS = `SEC${run} <b>bold</b> <script>window.__pwned=1</script> <a href="javascript:window.__pwned=1">x</a>`;

async function noScriptRan(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
}

test.describe("response headers", () => {
  test("pages send the security headers and a strict CSP", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
    const csp = h["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    const ownHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co").hostname.replaceAll(".", "\\.");
    expect(csp).not.toMatch(new RegExp(`script-src[^;]*https?://(?!${ownHost})`)); // no third-party script hosts
  });

  test("admin and API responses are never cached", async ({ request }) => {
    expect((await request.get("/admin/login")).headers()["cache-control"]).toContain("no-store");
    expect((await request.get("/api/chat")).headers()["cache-control"]).toContain("no-store");
  });

  test("the CSP does not break the site: no violations on home, catalog and a signed-out admin page", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));
    for (const path of ["/", "/catalog", "/contact", "/admin/login"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });
});

test.describe("authorization from the outside", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every admin page redirects a signed-out visitor to the login page", async ({ page }) => {
    for (const path of ["/admin", "/admin/products", "/admin/products/new", "/admin/sales", "/admin/sales/new", "/admin/inquiries", "/admin/inbox", "/admin/settings", "/admin/activity", "/admin/account"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/login/);
    }
  });

  test("a made-up or tampered record id on an admin URL shows nothing to a signed-out visitor", async ({ page }) => {
    await page.goto("/admin/products/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("the reset link landing page refuses a bad code and ignores an off-site 'next'", async ({ page }) => {
    await page.goto("/auth/callback?code=forged&next=https://evil.example/steal");
    await expect(page).toHaveURL(/\/admin\/login\?link=invalid/);
    expect(page.url()).not.toContain("evil.example");
    await expect(page.getByText("That link is invalid or has expired")).toBeVisible();
  });

  test("a signed-in non-admin account is turned away at the admin login", async ({ page }) => {
    test.skip(!NONADMIN_EMAIL || !NONADMIN_PASSWORD, "needs E2E_NONADMIN_*");
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(NONADMIN_EMAIL!);
    await page.getByLabel("Password").fill(NONADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("This account does not have admin access.")).toBeVisible();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/); // and no session was kept
  });

  test("cross-site and malformed requests to the chat API are refused", async ({ request, baseURL }) => {
    const json = { "Content-Type": "application/json" };
    expect((await request.post("/api/chat", { headers: { ...json, Origin: "https://evil.example" }, data: { message: "hi", after: 0, productId: null } })).status()).toBe(403);
    expect((await request.post("/api/chat", { headers: { ...json, Origin: baseURL! }, data: "{not json" })).status()).toBe(400);
    expect((await request.post("/api/chat", { headers: { ...json, Origin: baseURL! }, data: JSON.stringify({ message: "a".repeat(20_000) }) })).status()).toBe(400);
    expect((await request.post("/api/chat", { headers: { ...json, Origin: baseURL! }, data: { message: "hi", after: -5, productId: "not-a-uuid" } })).status()).toBe(400);
  });

  test("SQL-looking search text is treated as plain text by the catalog", async ({ page }) => {
    const res = await page.goto("/catalog?q=" + encodeURIComponent("' or '1'='1") + "&cpu=" + encodeURIComponent("a);b") + "&sort=price%3Bdrop");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Gaming PCs" })).toBeVisible();
  });
});

test.describe("untrusted text is never executed", () => {
  test("script and HTML in an inquiry and in chat appear as plain text for the admin", async ({ browser }) => {
    const visitor = await (await newVisitor(browser)).newPage();
    await visitor.goto("/contact");
    await visitor.getByLabel("Your name").fill(`SEC${run} Visitor`);
    await visitor.getByLabel("Phone").fill("20123456");
    await visitor.getByLabel("Message").fill(XSS);
    await visitor.getByRole("button", { name: "Send message" }).click();
    await expect(visitor.getByText("Message sent")).toBeVisible();

    await visitor.goto("/");
    await visitor.getByRole("button", { name: "Open chat" }).click();
    await visitor.getByLabel("Your message").fill(XSS);
    await visitor.getByRole("button", { name: "Send" }).click();
    await expect(visitor.getByText(/<script>window.__pwned=1<\/script>/).first()).toBeVisible(); // shown as text
    await noScriptRan(visitor);

    const adminCtx = await newVisitor(browser, { storageState: ADMIN_STATE });
    const admin = await adminCtx.newPage();
    const dialogs: string[] = [];
    admin.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await admin.goto("/admin/inquiries?q=" + encodeURIComponent(`SEC${run} Visitor`));
    await expect(admin.getByText("<script>window.__pwned=1</script>").first()).toBeVisible();
    await noScriptRan(admin);
    await admin.goto("/admin/inbox");
    await admin.getByRole("tab", { name: "Open", exact: true }).click();
    await admin.getByRole("button", { name: /Anonymous visitor|SEC/ }).first().click();
    await expect(admin.getByText("<b>bold</b>").first()).toBeVisible();
    await noScriptRan(admin);
    expect(dialogs).toEqual([]);
  });
});

test.describe("uploads are re-encoded, not trusted", () => {
  test.use({ storageState: ADMIN_STATE });

  test("a PNG with a script appended is accepted as an image but served as a clean WebP", async ({ page, request }) => {
    await page.goto("/admin/products/new");
    await page.getByLabel(/Product name/).fill(`SEC${run} Upload PC`);
    await page.getByLabel(/^Price/).fill("1000");
    await page.getByRole("button", { name: "Save and add photos" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
    const productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const polyglot = Buffer.concat([png, Buffer.from("<script>alert(document.cookie)</script><?php echo 'pwned'; ?>")]);
    await page.locator("#img-upload").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: polyglot });
    const img = page.getByAltText("Photo 1 (primary)");
    await expect(img).toBeVisible({ timeout: 25_000 });

    // The stored file is a freshly generated WebP: no script bytes, server-chosen name, safe content type.
    const src = await img.getAttribute("src");
    const direct = decodeURIComponent(new URL(src!, "http://x").searchParams.get("url") ?? src!);
    expect(direct).toMatch(new RegExp(`/products/${productId}/[0-9a-f-]{36}\\.webp$`));
    const res = await request.get(direct);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/webp");
    const body = await res.body();
    expect(body.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(body.includes(Buffer.from("<script"))).toBe(false);
    expect(body.includes(Buffer.from("<?php"))).toBe(false);

    await page.goto(`/admin/products/${productId}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/admin\/products\?deleted=1/);
  });

  test("a file that is not an image is refused before it is stored", async ({ page }) => {
    await page.goto("/admin/products/new");
    await page.getByLabel(/Product name/).fill(`SEC${run} Refused PC`);
    await page.getByLabel(/^Price/).fill("1000");
    await page.getByRole("button", { name: "Save and add photos" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
    const productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];
    for (const [name, type, body] of [
      ["evil.png", "image/png", "<svg onload=alert(1)></svg>"],
      ["shell.php.png", "image/png", "<?php system($_GET['c']); ?>"],
    ] as const) {
      await page.locator("#img-upload").setInputFiles({ name, mimeType: type, buffer: Buffer.from(body) });
      await expect(page.getByRole("alert").filter({ hasText: /not a real JPG, PNG or WebP/ })).toBeVisible();
    }
    await expect(page.getByText("No photos yet.")).toBeVisible();
    await page.goto(`/admin/products/${productId}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete permanently" }).click();
  });
});

test.describe("the chatbot stays quiet once the seller has joined", () => {
  test("a seller reply in a bot-only conversation stops the automated replies", async ({ browser }) => {
    const visitor = await (await newVisitor(browser)).newPage();
    await visitor.goto("/");
    await visitor.getByRole("button", { name: "Open chat" }).click();
    const dialog = visitor.getByRole("dialog", { name: "Chat" });
    await dialog.getByLabel("Your message").fill(`SEC${run} how do I buy?`);
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(dialog.getByText("Assistant (automated)").first()).toBeVisible(); // the bot answers while no seller is involved
    const botBefore = await dialog.getByText("Assistant (automated)").count();

    const adminCtx = await newVisitor(browser, { storageState: ADMIN_STATE });
    const admin = await adminCtx.newPage();
    await admin.goto("/admin/inbox");
    await admin.getByRole("tab", { name: "Open", exact: true }).click();
    await admin.getByRole("button", { name: /Anonymous visitor/ }).first().click();
    await admin.getByLabel("Reply").fill("Hi, this is the seller. How can I help?");
    await admin.getByRole("button", { name: "Send reply" }).click();
    await expect(dialog.getByText("Hi, this is the seller. How can I help?")).toBeVisible({ timeout: 20_000 });

    // The visitor keeps writing: the seller is alerted, the bot says nothing more.
    await dialog.getByLabel("Your message").fill(`SEC${run} is the GPU new?`);
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(dialog.getByText(`SEC${run} is the GPU new?`)).toBeVisible();
    await visitor.waitForTimeout(2500);
    expect(await dialog.getByText("Assistant (automated)").count()).toBe(botBefore);
    await expect(dialog.getByText("Automated assistant using the live catalog. Not a person.")).toHaveCount(0); // header no longer claims "automated"
    await expect(dialog.getByText(/Your request is with the seller/)).toBeVisible();

    await admin.getByRole("tab", { name: /Needs reply/ }).click();
    await expect(admin.getByRole("button", { name: /Anonymous visitor/ }).first()).toBeVisible(); // flagged for the seller again
  });
});

test.describe("abuse controls", () => {
  test("a visitor spamming the chat API is stopped and the database keeps only a handful of messages", async ({ browser }) => {
    const ctx = await newVisitor(browser);
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const res = await ctx.request.post("/api/chat", {
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3100" },
        data: { message: `SEC${run} spam ${i}`, after: 0, productId: null },
      });
      statuses.push(res.status());
    }
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(12);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(20);
    await ctx.close();
  });

  test("the contact form is rate limited per visitor", async ({ browser }) => {
    const ctx = await newVisitor(browser);
    const page = await ctx.newPage();
    let blocked = false;
    for (let i = 0; i < 7 && !blocked; i++) {
      await page.goto("/contact");
      await page.getByLabel("Your name").fill(`SEC${run} Flood ${i}`);
      await page.getByLabel("Phone").fill(`2300000${i}`);
      await page.getByLabel("Message").fill("flooding the inbox");
      await page.getByRole("button", { name: "Send message" }).click();
      blocked = await page.getByText(/several messages in a short time|Too many messages/).waitFor({ timeout: 6000 }).then(() => true, () => false);
      if (!blocked) await expect(page.getByText("Message sent")).toBeVisible();
    }
    expect(blocked).toBe(true);
    await ctx.close();
  });
});
