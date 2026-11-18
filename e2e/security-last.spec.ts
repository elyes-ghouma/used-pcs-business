import { expect, randomIp, test } from "./fixtures";

/** Runs last (see playwright.config.ts): it exhausts the login limits on purpose. Wait 10 minutes before running again. */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
test.skip(!EMAIL, "Set the E2E_* variables (see README -> Testing)");

test("repeated wrong passwords are throttled (brute force / credential stuffing)", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": randomIp() } });
  const page = await ctx.newPage();
  let throttled = false;
  for (let i = 0; i < 14 && !throttled; i++) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(EMAIL!);
    await page.getByLabel("Password").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    throttled = await page.getByText("Too many sign-in attempts").waitFor({ timeout: 6000 }).then(() => true, () => false);
  }
  expect(throttled).toBe(true);
  // and the correct password is refused too while the limit is active: the throttle protects the account itself
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many sign-in attempts")).toBeVisible();
  await ctx.close();
});
