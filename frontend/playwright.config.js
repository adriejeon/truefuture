// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * 수동 로그인 1회로 저장할 storageState 파일 경로
 * - `npm run pw:auth` 실행 → 브라우저가 열리면 로그인 완료 → 세션을 이 파일로 저장
 * - 이후 모든 테스트는 이 파일을 읽어 "이미 로그인된 상태"로 시작
 */
const AUTH_FILE = 'playwright/.auth/user.json';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    /**
     * 1) Setup 프로젝트: 수동 로그인 후 storageState(AUTH_FILE) 저장만 수행
     * - 이 프로젝트는 단독으로 실행할 때만(= pw:auth) 사용
     * - 일반 테스트 실행 시에는 다른 프로젝트들의 dependency로 1회 수행됨
     */
    {
      name: 'setup',
      testMatch: /.*\.setup\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },

    {
      name: 'firefox',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: AUTH_FILE },
    },

    {
      name: 'webkit',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: AUTH_FILE },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});

