import { expect, test } from "@playwright/test";

test.describe("public website", () => {
  test("home page renders and has no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse PCs" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("catalog page shows filters and either products or an honest empty state", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Gaming PCs" })).toBeVisible();
    // On phones the filters are behind a button.
    const toggle = page.getByRole("button", { name: /^Filters/ });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.getByLabel("Search")).toBeVisible();
    const hasCards = (await page.getByRole("article").count()) > 0;
    if (!hasCards) await expect(page.getByText(/No PCs/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("contact form validates input", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel("Your name").fill("A");
    await page.getByLabel("Message").fill("hi");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
  });

  test("sitemap and robots are served", async ({ request }) => {
    expect((await request.get("/sitemap.xml")).ok()).toBeTruthy();
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /admin");
  });

  test("chat widget opens, answers from stored settings and falls back honestly", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open chat" }).click();
    const dialog = page.getByRole("dialog", { name: "Chat" });
    await expect(dialog.getByText("Automated assistant using the live catalog. Not a person.")).toBeVisible();

    await dialog.getByLabel("Your message").fill("how do I buy?");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(dialog.getByText(/Contact the seller/).first()).toBeVisible();

    await dialog.getByLabel("Your message").fill("what is the meaning of life");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(dialog.getByText(/don't have a reliable answer/)).toBeVisible();
    await expect(dialog.getByText("Assistant (automated)").first()).toBeVisible();
  });
});
