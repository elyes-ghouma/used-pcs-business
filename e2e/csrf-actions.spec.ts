import { expect, test } from "./fixtures";

/**
 * Server Actions (the contact form, every admin form) are POST requests that Next.js only accepts when the Origin
 * header matches the Host. This proves it with a real request: capture what the browser sends when the contact form
 * is submitted with INVALID input (validation fails before any database call, so nothing is written and no
 * Supabase project is needed), then replay the identical request with a forged Origin.
 */
test("a Server Action request from another origin is refused; the same request from our origin is accepted", async ({ page, request, baseURL }) => {
  await page.goto("/contact");
  await page.getByLabel("Your name").fill("A");
  await page.getByLabel("Message").fill("hi");

  const [captured] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && "next-action" in r.headers()),
    page.getByRole("button", { name: "Send message" }).click(),
  ]);
  const url = captured.url();
  const body = captured.postDataBuffer();
  expect(body, "the action request must carry a body to replay").not.toBeNull();

  const replay = (origin: string) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(captured.headers())) {
      if (!["host", "content-length", "origin", "referer", "cookie"].includes(k.toLowerCase())) headers[k] = v;
    }
    return request.post(url, { headers: { ...headers, origin, referer: `${origin}/contact` }, data: body!, failOnStatusCode: false });
  };

  // Control: our own origin gets the action's real answer (validation failed, "form.fix").
  const own = await replay(new URL(baseURL!).origin);
  expect(own.status()).toBe(200);
  expect(await own.text()).toContain("form.fix");

  // Attack: the same request claiming to come from another site never reaches the action.
  for (const origin of ["https://evil.example", "http://localhost:6666", "null"]) {
    const res = await replay(origin);
    const text = await res.text();
    expect(res.status(), `origin ${origin}`).toBeGreaterThanOrEqual(400);
    expect(text, `origin ${origin} must not get the action's answer`).not.toContain("form.fix");
  }
});
