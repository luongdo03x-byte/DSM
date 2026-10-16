import {existsSync} from 'node:fs';
import {defineConfig} from '@playwright/test';
import {E2E_OWNER} from './tests/e2e-owner.ts';

// Web và API bắt buộc cùng host 127.0.0.1: dùng localhost thì login bị CORS chặn hoặc reload trả 401.
const API_URL = 'http://127.0.0.1:4000';
const WEB_URL = 'http://127.0.0.1:3000';
// Hai server chạy bằng đúng Node đang chạy Playwright (Node >=24.7 vì API cần crypto.argon2Sync).
const NODE = `"${process.execPath}"`;

if (!existsSync(new URL('./.next/BUILD_ID', import.meta.url))) {
  throw new Error('E2E cần bản build: chạy "pnpm build" trước');
}

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 0,
  failOnFlakyTests: true,
  workers: 1,
  reporter: [['list'], ['json', {outputFile: '../../test-results/e2e.json'}]],
  use: {baseURL: WEB_URL, trace: 'retain-on-failure'},
  webServer: [
    {
      name: 'api',
      command: `${NODE} --experimental-strip-types src/entry.ts`,
      cwd: '../api',
      url: `${API_URL}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      // Không nạp .env. Server vẫn kế thừa biến môi trường của shell, nên mọi biến làm đổi hành vi
      // đều được ghi đè tường minh ở đây (chuỗi rỗng = tắt).
      env: {
        DEV_IN_MEMORY: '1',
        APP_ENV: 'test',
        API_PORT: '4000',
        DEV_STORE_FILE: '',
        S3_ENDPOINT: '',
        BROWSER_NODE_KEY: '',
        BROWSER_GATEWAY_HOST: '',
        DEV_OWNER_EMAIL: E2E_OWNER.email,
        DEV_OWNER_PASSWORD: E2E_OWNER.password,
        JWT_ACCESS_SECRET: 'dsm-e2e-only-jwt-access-secret',
        // base64 của 32 byte ASCII 'dsm-e2e-credential-key-32-bytes!'
        CREDENTIAL_ENCRYPTION_KEY: 'ZHNtLWUyZS1jcmVkZW50aWFsLWtleS0zMi1ieXRlcyE=',
        WEB_ORIGINS: WEB_URL,
        COOKIE_SECURE: 'false',
      },
    },
    {
      name: 'web',
      command: `${NODE} node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000`,
      url: `${WEB_URL}/login`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
