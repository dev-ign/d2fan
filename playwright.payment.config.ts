import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "payment-test.spec.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5193",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: "npm run dev -- --port 5193 --host 127.0.0.1 --strictPort",
    url: "http://localhost:5193",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable",
      VITE_PAYMENT_TEST_API: "http://127.0.0.1:54324/functions/v1",
    },
  },
});
