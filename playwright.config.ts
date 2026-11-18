import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import fs from "node:fs";

// Tests run against a THROWAWAY Supabase project described in .env.test.local (never the live shop).
// If that file is absent, .env.local is used, so only point it at a project you are happy to fill with test data.
const testEnvFile = ".env.test.local";
const testEnv = fs.existsSync(testEnvFile) ? dotenv.parse(fs.readFileSync(testEnvFile)) : null;
if (testEnv) Object.assign(process.env, testEnv);
dotenv.config({ path: ".env.local" });

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Existing specs assert English text; the French spec opts in explicitly.
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], testIgnore: /security-last\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
    // Runs after everything else: it deliberately exhausts the login limits.
    { name: "throttle", use: { ...devices["Desktop Chrome"] }, testMatch: /security-last\.spec\.ts/, dependencies: ["desktop", "mobile"] },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ...(testEnv ?? {}), NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}` } as Record<string, string>,
  },
});
