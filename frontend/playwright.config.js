const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './playwright',
  timeout: 60000,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1920, height: 800 },
    reducedMotion: 'reduce',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
});
