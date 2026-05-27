import { devices } from '@playwright/test';

export default {
  timeout: 120000,
  testDir: 'tools/playwright/tests',
  outputDir: 'tools/playwright/results',
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'tools/playwright/report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { args: ['--disable-dev-shm-usage'] },
  },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-mobile', use: { browserName: 'chromium', ...devices['iPhone 12'] } },
  ],
};
