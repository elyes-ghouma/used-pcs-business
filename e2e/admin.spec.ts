import { expect, test } from "@playwright/test";
import { ADMIN_STATE } from "./state";

/**
 * Full business workflow against a real (test) Supabase project.
 * Needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (an admin of the TEST project). Everything created is prefixed "E2E".
 * At the end the sale is voided and the product archived (a PC that ever had a sale can't be deleted by design).
 * Inquiries, chats and click events stay behind: see README -> Testing for the cleanup SQL.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
test.skip(!EMAIL || !PASSWORD, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see README -> Testing)");

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const run = Date.now().toString(36);
const NAME = `E2E Falcon ${run}`;

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitors cannot reach the dashboard", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("wrong password is rejected with a generic message", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(EMAIL!);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
  });
});

test.describe("owner workflow", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: ADMIN_STATE });

  let productId = "";
  let slug = "";

  test("creates a product with a photo and it appears on the website", async ({ page }) => {
    await page.goto("/admin/products/new");
    await page.getByLabel(/Product name/).fill(NAME);
    await page.getByLabel(/^Price/).fill("1850");
    await page.getByLabel("CPU").fill("Ryzen 5 5600");
    await page.getByLabel("GPU").fill("RTX 3060");
    await page.getByLabel("RAM").fill("16GB DDR4");
    await page.getByLabel("Featured on the homepage").check();
    await page.getByRole("button", { name: "Save and add photos" }).click();

    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
    productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];
    await expect(page.getByText("Saved. You can now add photos below.")).toBeVisible();

    await page.locator("#img-upload").setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByAltText("Photo 1 (primary)")).toBeVisible({ timeout: 20_000 });

    slug = (await page.getByRole("link", { name: "View on the website" }).getAttribute("href"))!.replace("/pcs/", "");

    await page.goto(`/catalog?q=${encodeURIComponent(NAME)}`);
    const card = page.getByRole("article").filter({ hasText: NAME });
    await expect(card).toBeVisible();
    await expect(card).toContainText("TND 1,850");
    await expect(card).toContainText("Available");
  });

  test("a fake file renamed to .png is refused", async ({ page }) => {
    await page.goto(`/admin/products/${productId}`);
    await page.locator("#img-upload").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)></svg>") });
    await expect(page.getByRole("alert").filter({ hasText: /not a real JPG, PNG or WebP/ })).toBeVisible();
  });

  test("reserving a product shows it as reserved on the website", async ({ page }) => {
    await page.goto(`/admin/products/${productId}`);
    await page.getByRole("button", { name: "Mark as reserved" }).click();
    await expect(page.getByRole("button", { name: "Make available again" })).toBeVisible();
    await page.goto(`/pcs/${slug}`);
    await expect(page.getByText("Reserved").first()).toBeVisible();
  });

  test("a visitor inquiry reaches the admin, who updates its status", async ({ page, browser }) => {
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/pcs/${slug}`);
    await visitor.getByLabel("Your name").fill(`E2E Visitor ${run}`);
    await visitor.getByLabel("Phone").fill("20123456");
    await visitor.getByRole("button", { name: "Send message" }).click();
    await expect(visitor.getByText("Message sent")).toBeVisible();

    await page.goto("/admin/inquiries?q=" + encodeURIComponent(`E2E Visitor ${run}`));
    const item = page.getByRole("listitem").filter({ hasText: `E2E Visitor ${run}` });
    await expect(item).toContainText(NAME);
    await item.getByLabel("Status").selectOption("contacted");
    await item.getByLabel("Internal notes").fill("Called, coming Friday");
    await item.getByRole("button", { name: "Save" }).click();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: `E2E Visitor ${run}` }).getByLabel("Status")).toHaveValue("contacted");
  });

  test("chat: visitor asks for the seller, admin replies in the inbox, visitor sees the reply", async ({ page, browser }) => {
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/pcs/${slug}`);
    await visitor.getByRole("button", { name: "Open chat" }).click();
    const dialog = visitor.getByRole("dialog", { name: "Chat" });
    await dialog.getByRole("button", { name: "Contact the seller instead" }).click();
    await dialog.getByLabel("Your name").fill(`E2E Chatter ${run}`);
    await dialog.getByLabel("Phone or email").fill("22333444");
    await dialog.getByRole("button", { name: "Send to the seller" }).click();
    await expect(dialog.getByText(/The seller has your message/).first()).toBeVisible();

    await page.goto("/admin/inbox");
    await page.getByRole("button", { name: new RegExp(`E2E Chatter ${run}`) }).click();
    await expect(page.getByText(NAME).first()).toBeVisible();
    await page.getByLabel("Reply").fill("Hello! Yes, it is still here.");
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(dialog.getByText("Hello! Yes, it is still here.")).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("Seller", { exact: true })).toBeVisible();
  });

  test("recording a sale marks the product sold, hides it, and cannot be repeated", async ({ page }) => {
    await page.goto(`/admin/sales/new?product=${productId}`);
    await page.getByLabel(/Actual selling price/).fill("1700");
    await page.getByLabel("Name").fill(`E2E Buyer ${run}`);
    await page.getByRole("button", { name: "Record sale" }).click();
    await expect(page).toHaveURL(/\/admin\/sales\?recorded=1/);
    await expect(page.getByText(`E2E Buyer ${run}`)).toBeVisible();

    // Sold products are hidden from the public site by default.
    const res = await page.goto(`/pcs/${slug}`);
    expect(res?.status()).toBe(404);

    // ...and are no longer offered when recording a sale (no double sale from the UI).
    await page.goto("/admin/sales/new");
    await expect(page.getByLabel(/Product/).locator("option", { hasText: NAME })).toHaveCount(0);

    await page.goto("/admin");
    await expect(page.getByText("Recorded sales")).toBeVisible();
  });

  test("cleanup: void the sale and archive the product; signing out ends the session", async ({ page }) => {
    await page.goto("/admin/sales?q=" + encodeURIComponent(NAME));
    const sale = page.getByRole("listitem").filter({ hasText: NAME });
    await sale.getByText("Undo this sale").click();
    await sale.getByRole("button", { name: /Void sale/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: NAME })).toHaveCount(0);

    await page.goto(`/admin/products/${productId}`);
    await expect(page.getByText("Available").first()).toBeVisible(); // restored by the void
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
