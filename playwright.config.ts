import { defineConfig, devices } from "@playwright/test";
const previewURL = `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 4321}`;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  use: { baseURL: previewURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run build:preview && npm run serve:preview",
    url: previewURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
