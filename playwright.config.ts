import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const defaultBaseURL = `http://127.0.0.1:${PORT}`;
// Docker 验收时指向已启动的静态 web 容器。
const baseURL = process.env.E2E_BASE_URL ?? defaultBaseURL;
// 本地默认对生产构建起 Vite 静态预览服务器。
const serverCommand =
  process.env.E2E_SERVER_COMMAND ??
  `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : {
        command: serverCommand,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
