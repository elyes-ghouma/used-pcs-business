import { expect, newVisitor, test } from "./fixtures";
import { ADMIN_STATE } from "./state";

// Words that must not appear on a French page (they would mean an English label leaked through).
const ENGLISH_LEAKS = [
  "Browse PCs", "Contact the seller", "Featured PCs", "How to buy", "Send message", "Your name", "Filters", "Apply filters",
  "Newest first", "Open chat", "Assistant (automated)", "Skip to content", "Available", "Reserved",
];

async function bodyText(page: import("@playwright/test").Page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

test.describe("French interface", () => {
  test("browser language French gives a French site with no English labels", async ({ browser }) => {
    const ctx = await newVisitor(browser, { locale: "fr-FR" });
    const page = await ctx.newPage();
    for (const path of ["/", "/catalog", "/contact"]) {
      await page.goto(path);
      await expect(page.locator("[lang='fr']").first()).toBeVisible();
      const text = await bodyText(page);
      for (const word of ENGLISH_LEAKS) expect(text, `${path} leaked "${word}"`).not.toContain(word);
    }
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Voir les PC" }).first()).toBeVisible();
    await ctx.close();
  });

  test("switcher persists the choice across reloads and back to English", async ({ browser }) => {
    const ctx = await newVisitor(browser, { locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact the seller");
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contacter le vendeur");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contacter le vendeur");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact the seller");
    await ctx.close();
  });

  test("the contact form validates in French", async ({ browser }) => {
    const ctx = await newVisitor(browser, { locale: "fr-FR" });
    const page = await ctx.newPage();
    await page.goto("/contact");
    await page.getByLabel("Votre nom").fill("A");
    await page.getByLabel("Message").fill("hi");
    await page.getByRole("button", { name: "Envoyer le message" }).click();
    await expect(page.getByText("Veuillez corriger les champs signalés.")).toBeVisible();
    await expect(page.getByText("Indiquez votre nom (2 lettres minimum).")).toBeVisible();
    await ctx.close();
  });

  test("the chat assistant answers in French", async ({ browser }) => {
    const ctx = await newVisitor(browser, { locale: "fr-FR" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Ouvrir le chat" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Assistant automatique")).toBeVisible();
    await dialog.getByLabel("Votre message").fill("comment acheter ?");
    await dialog.getByRole("button", { name: "Envoyer" }).click();
    await expect(dialog.getByText("Assistant (automatique)").first()).toBeVisible();
    const text = (await dialog.innerText()).replace(/\s+/g, " ");
    expect(text).not.toContain("Contact the seller");
    expect(text).not.toContain("How do I buy");
    await ctx.close();
  });

  test("French pages have no horizontal scroll on a phone", async ({ browser }) => {
    const ctx = await newVisitor(browser, { locale: "fr-FR", viewport: { width: 360, height: 780 } });
    const page = await ctx.newPage();
    for (const path of ["/", "/catalog", "/contact"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
});

// The owner adds French text in the admin; French visitors see it, English visitors keep the main text.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe("owner-written French content", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see README -> Testing)");
  test.use({ storageState: ADMIN_STATE });

  const name = `E2E Faucon ${Date.now().toString(36)}`;
  const FR_HEADLINE = "Titre français E2E";
  const FR_DESC = "Description française E2E : très bon état.";
  let slug = "";
  let productId = "";

  test("saving French text in the admin shows it to French visitors only", async ({ page, browser }) => {
    await page.goto("/admin/settings");
    await page.getByLabel("Homepage headline (French)").fill(FR_HEADLINE);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.goto("/admin/products/new");
    await page.getByLabel(/Product name/).fill(name);
    await page.getByLabel(/^Price/).fill("1850");
    await page.getByLabel("Description", { exact: true }).fill("English description E2E.");
    await page.getByLabel("Description (French)").fill(FR_DESC);
    await page.getByRole("button", { name: "Save and add photos" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);
    productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];
    slug = (await page.getByRole("link", { name: "View on the website" }).getAttribute("href"))!.replace("/pcs/", "");

    const fr = await newVisitor(browser, { locale: "fr-FR" });
    const frPage = await fr.newPage();
    await frPage.goto("/");
    await expect(frPage.getByRole("heading", { level: 1 })).toHaveText(FR_HEADLINE);
    await frPage.goto(`/pcs/${slug}`);
    await expect(frPage.getByText(FR_DESC)).toBeVisible();
    await expect(frPage.getByText("English description E2E.")).toHaveCount(0);
    await fr.close();

    const en = await newVisitor(browser, { locale: "en-US" });
    const enPage = await en.newPage();
    await enPage.goto(`/pcs/${slug}`);
    await expect(enPage.getByText("English description E2E.")).toBeVisible();
    await expect(enPage.getByText(FR_DESC)).toHaveCount(0);
    await en.close();
  });

  test("cleanup: remove the French headline and the test product", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByLabel("Homepage headline (French)").fill("");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.goto(`/admin/products/${productId}`);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/admin\/products\?deleted=1/);
  });
});
