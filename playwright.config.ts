import {defineConfig} from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? "http://127.0.0.1:3000";

const widths = [
  {height: 812, name: "width-375", width: 375},
  {height: 932, name: "width-430", width: 430},
  {height: 1024, name: "width-768", width: 768},
  {height: 900, name: "width-1024", width: 1024},
  {height: 1000, name: "width-1440", width: 1440},
] as const;

export default defineConfig({
  expect: {timeout: 10_000},
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "artifacts/plan-1/playwright",
  projects: widths.map(({height, name, width}) => ({
    name,
    use: {browserName: "chromium", viewport: {height, width}},
  })),
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: "npm run start --workspace @mke/web",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL,
      },
});
