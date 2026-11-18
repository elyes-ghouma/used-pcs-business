import { test as base, type Browser, type BrowserContextOptions } from "@playwright/test";

/** A unique documentation-range IP, so each simulated visitor has their own per-visitor rate-limit bucket. */
let counter = Math.floor(Math.random() * 40_000);
export function randomIp(): string {
  counter += 1;
  return `100.${64 + ((counter >> 16) & 31)}.${(counter >> 8) & 255}.${counter & 255}`;
}

/** A browser context for one simulated visitor (own cookies, own IP as far as the app can tell). */
export function newVisitor(browser: Browser, options: BrowserContextOptions = {}) {
  return browser.newContext({ ...options, extraHTTPHeaders: { "X-Forwarded-For": randomIp(), ...(options.extraHTTPHeaders ?? {}) } });
}

/** `test` whose default page also gets its own visitor address. */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": randomIp() });
    await provide(context);
  },
});
export { expect } from "@playwright/test";
