import {expect, test, type Page, type Response} from '@playwright/test';
import {E2E_OWNER} from './e2e-owner.ts';

const BRAND_API = '/brands/local-brand';
const BRAND_PAGE = '/app/brands/local-brand';

function isOk(apiPath: string) {
  return (response: Response) => new URL(response.url()).pathname === apiPath && response.status() === 200;
}

// Chờ một trang tải xong thật: response 200 từ endpoint chính, đúng tiêu đề, hết loading, không ô lỗi.
// Promise chờ response phải tạo TRƯỚC action, vì trang có thể gọi API ngay khi action còn chưa trả về.
// Mẫu 401 -> /auth/refresh -> 200 là bình thường, nên chỉ chờ lần trả 200.
async function expectLoaded(page: Page, {heading, apiPath}: {heading: string; apiPath: string}, action: () => Promise<unknown>) {
  const loaded = page.waitForResponse(isOk(apiPath));
  await action();
  await loaded;
  await expect(page.getByRole('heading', {name: heading, exact: true})).toBeVisible();
  await expect(page.locator('.page-state[role="status"]')).toHaveCount(0);
  await expect(page.locator('.page-state--error')).toHaveCount(0);
}

test('v1 critical UI journey', async ({page, context}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const nav = page.locator('nav.app-nav');

  // 1. Đăng nhập -> Tổng quan
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Mật khẩu').fill(E2E_OWNER.password);
  await expectLoaded(page, {heading: 'Tổng quan', apiPath: `${BRAND_API}/analytics/overview`}, async () => {
    const login = page.waitForResponse(isOk('/auth/login'));
    await page.getByRole('button', {name: 'Đăng nhập'}).click();
    await login;
  });
  await expect(page).toHaveURL(new RegExp(`${BRAND_PAGE}/overview$`));

  // 2. Tải lại trang: phiên được khôi phục qua cookie refresh + CSRF
  await expectLoaded(page, {heading: 'Tổng quan', apiPath: `${BRAND_API}/analytics/overview`}, () => page.reload());
  await expect(page).toHaveURL(new RegExp(`${BRAND_PAGE}/overview$`));

  // 3-6. Điều hướng bằng menu chính
  const journey = [
    {link: 'Sản phẩm', section: 'products', apiPath: `${BRAND_API}/products`},
    {link: 'Nội dung', section: 'content', apiPath: `${BRAND_API}/content`},
    {link: 'Lịch đăng', section: 'calendar', apiPath: `${BRAND_API}/calendar`},
    {link: 'Phân tích', section: 'analytics', apiPath: `${BRAND_API}/analytics/platforms`},
  ];
  for (const step of journey) {
    await expectLoaded(page, {heading: step.link, apiPath: step.apiPath}, () =>
      nav.getByRole('link', {name: step.link, exact: true}).click(),
    );
    await expect(page).toHaveURL(new RegExp(`${BRAND_PAGE}/${step.section}$`));
  }

  // 7. Đăng xuất: API trả 204, về /login, cookie bị xóa
  const logout = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/auth/logout' && response.request().method() === 'POST',
  );
  await page.getByRole('button', {name: 'Đăng xuất khỏi DSM'}).click();
  expect((await logout).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
  expect(await context.cookies()).toEqual([]);

  expect(pageErrors).toEqual([]);
});
