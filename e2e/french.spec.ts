import { newVisitor, expect, test } from "./fixtures";

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
