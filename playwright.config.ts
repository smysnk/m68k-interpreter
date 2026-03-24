import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: '.test-results/playwright',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  webServer: {
    command: 'yarn preview:e2e',
    env: {
      ...process.env,
      NEXT_PUBLIC_IDE_AUTOPLAY: 'false',
    },
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
