import { defineConfig, devices } from '@playwright/test';

// Apart from the smoke tests, whose browser renders in software: frame rates need a real GPU. Vsync
// is off because a browser or display cap (some run at 30 Hz, even on a blank page) hides the
// headroom this is here to measure.
export default defineConfig({
  testDir: 'tests/perf',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    launchOptions: {
      args: [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--use-angle=default',
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
      ],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
