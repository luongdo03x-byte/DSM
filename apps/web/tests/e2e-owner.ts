// Tài khoản owner chỉ dùng cho Playwright E2E. playwright.config.ts truyền nó cho API
// (DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD) và spec dùng nó để đăng nhập.
export const E2E_OWNER = {
  email: 'e2e-owner@dsm.test',
  password: 'dsm-e2e-owner-password',
} as const;
